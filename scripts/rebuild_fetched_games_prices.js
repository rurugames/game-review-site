const fs = require('fs');
const path = require('path');
const dlsiteService = require('../services/dlsiteService');

function usage() {
  console.log('Usage: node scripts/rebuild_fetched_games_prices.js <YYYY-MM>');
  console.log('Example: node scripts/rebuild_fetched_games_prices.js 2025-12');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  const yymm = process.argv[2];
  if (!yymm || !/^\d{4}-\d{2}$/.test(yymm)) {
    usage();
    process.exit(1);
  }

  const [yStr, mStr] = yymm.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const file = path.join(__dirname, '..', 'csvoutput', `fetched_games_${year}-${pad2(month)}.json`);

  if (!fs.existsSync(file)) {
    console.error('Not found:', file);
    process.exit(1);
  }

  const original = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = original.map((g) => g && g.id).filter(Boolean);
  console.log('Loaded', original.length, 'records from', file);

  const start = Date.now();
  let ok = 0;
  let failed = 0;

  const detailsList = await mapWithConcurrency(
    ids,
    dlsiteService.concurrentFetchLimit || 8,
    async (id, idx) => {
      try {
        const d = await dlsiteService.fetchGameDetails(id, { forceRefresh: true });
        ok++;
        if (ok % 25 === 0) console.log('refreshed', ok, '/', ids.length);
        return d;
      } catch (e) {
        failed++;
        console.warn('failed', id, e && e.message ? e.message : e);
        return null;
      }
    }
  );

  const byId = new Map();
  for (const d of detailsList) {
    if (d && d.id) byId.set(d.id, d);
  }

  const updated = original.map((g) => {
    const d = g && g.id ? byId.get(g.id) : null;
    if (!d) return g;
    return {
      ...g,
      title: d.title ?? g.title,
      circle: d.circle ?? g.circle,
      description: d.description ?? g.description,
      imageUrl: d.imageUrl ?? g.imageUrl,
      price: d.price ?? null,
      releaseDate: d.releaseDate ?? g.releaseDate,
      genre: d.genre ?? g.genre,
      dlsiteUrl: d.dlsiteUrl ?? g.dlsiteUrl,
      tags: d.tags ?? g.tags,
    };
  });

  let num = 0;
  let zero = 0;
  let nul = 0;
  for (const g of updated) {
    if (g.price === 0) zero++;
    else if (g.price === null || g.price === undefined) nul++;
    else if (typeof g.price === 'number') num++;
  }

  fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf8');

  const dur = Math.round((Date.now() - start) / 1000);
  console.log('Done. ok=', ok, 'failed=', failed, 'seconds=', dur);
  console.log('price distribution: num=', num, 'zero=', zero, 'null=', nul);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
