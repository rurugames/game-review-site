/*
  Refresh per-game details in csvoutput/fetched_games_YYYY-MM.json by re-fetching
  each RJ work page and overwriting the cached fields.

  This is much faster than re-crawling monthly search pages.

  Usage (PowerShell):
    node scripts/refresh_fetched_details.js 2019-01
    node scripts/refresh_fetched_details.js 2019-01 --concurrency 4

  Notes:
    - Always uses forceRefresh=true for per-game detail.
    - Keeps original order from the fetched JSON file.
*/

const fs = require('fs');
const path = require('path');

const dlsiteService = require('../services/dlsiteService');

function usageAndExit() {
  console.log('Usage: node scripts/refresh_fetched_details.js <YYYY-MM> [--concurrency N]');
  console.log('Example: node scripts/refresh_fetched_details.js 2019-02 --concurrency 4');
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const yearMonth = args[0];
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) usageAndExit();

  let concurrency = 4;
  const idx = args.indexOf('--concurrency');
  if (idx !== -1) {
    const v = Number.parseInt(String(args[idx + 1] ?? ''), 10);
    if (!Number.isFinite(v) || v < 1 || v > 16) {
      throw new Error('Invalid --concurrency (1-16)');
    }
    concurrency = v;
  }

  return { yearMonth, concurrency };
}

async function mapWithConcurrency(items, limit, mapper) {
  const out = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      out[idx] = await mapper(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return out;
}

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const { yearMonth, concurrency } = parseArgs(process.argv);

  const workspaceRoot = path.join(__dirname, '..');
  const csvoutputDir = path.join(workspaceRoot, 'csvoutput');
  const fetchedPath = path.join(csvoutputDir, `fetched_games_${yearMonth}.json`);

  if (!fs.existsSync(fetchedPath)) {
    throw new Error(`Missing: ${fetchedPath}`);
  }

  const fetched = safeReadJson(fetchedPath);
  if (!Array.isArray(fetched) || fetched.length === 0) {
    throw new Error(`Invalid or empty fetched JSON: ${fetchedPath}`);
  }

  const ids = fetched
    .map((g) => String(g && g.id ? g.id : '').toUpperCase())
    .filter(Boolean);

  if (!ids.length) {
    throw new Error(`No ids found in: ${fetchedPath}`);
  }

  console.log(`Refreshing details: ${yearMonth} (count=${ids.length}, concurrency=${concurrency})`);

  let done = 0;
  const refreshed = await mapWithConcurrency(ids, concurrency, async (id, idx) => {
    const details = await dlsiteService.fetchGameDetails(id, { forceRefresh: true });
    done++;
    if (done % 20 === 0 || done === ids.length) {
      console.log(`  progress: ${done}/${ids.length}`);
    }

    const prev = fetched[idx] && typeof fetched[idx] === 'object' ? fetched[idx] : { id };
    return { ...prev, ...details, id };
  });

  fs.writeFileSync(fetchedPath, JSON.stringify(refreshed, null, 2), 'utf8');
  console.log(`Updated: ${fetchedPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
