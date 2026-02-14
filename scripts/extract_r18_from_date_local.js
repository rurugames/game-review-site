const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csvParse = require('csv-parser');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function norm(value) {
  return String(value ?? '').trim();
}

function isR18(game) {
  const ageRating = norm(game.ageRating);
  if (!ageRating) return false;
  if (/全年齢|一般向け/.test(ageRating)) return false;
  return /R\s*-?\s*18|18禁|成人向け/.test(ageRating);
}

function escCsv(value) {
  let s = String(value ?? '');
  const needs = /[",\n\r]/.test(s);
  s = s.replace(/"/g, '""');
  return needs ? `"${s}"` : s;
}

function nextPath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;
  const ext = path.extname(basePath);
  const stem = basePath.slice(0, -ext.length);
  for (let i = 2; i < 100; i++) {
    const candidate = `${stem}_v${i}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No free filename for ${basePath}`);
}

async function readAllCsvIds(allCsvPath) {
  const allIds = new Set();
  if (!fs.existsSync(allCsvPath)) return allIds;

  let buf = fs.readFileSync(allCsvPath);
  const idx = buf.indexOf(BOM);
  if (idx === 0) buf = buf.slice(3);
  else if (idx > 0 && idx <= 8) buf = buf.slice(idx + 3);

  await new Promise((resolve, reject) => {
    Readable.from(buf.toString('utf8'))
      .pipe(
        csvParse({
          skipEmptyLines: true,
          mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim(),
        })
      )
      .on('data', (row) => {
        const link = norm(row['アフィリエイトリンク']);
        const m = link.match(/RJ\d{8}/);
        if (m) allIds.add(m[0]);
      })
      .on('error', reject)
      .on('end', resolve);
  });

  return allIds;
}

function toSimpleCsv(games) {
  const headers = ['id', 'title', 'releaseDate', 'circle', 'price', 'dlsiteUrl', 'ageRating', 'genre'];
  const lines = [headers.join(',')];
  for (const g of games) {
    lines.push(headers.map((h) => escCsv(g[h] ?? '')).join(','));
  }
  return Buffer.concat([BOM, Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
}

async function main() {
  const ym = process.argv[2];
  const cutoff = process.argv[3];

  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error('Usage: node scripts/extract_r18_from_date_local.js YYYY-MM YYYY-MM-DD');
  }
  if (!cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    throw new Error('Usage: node scripts/extract_r18_from_date_local.js YYYY-MM YYYY-MM-DD');
  }

  const fetchedPath = path.join('csvoutput', `fetched_games_${ym}.json`);
  if (!fs.existsSync(fetchedPath)) throw new Error(`Missing ${fetchedPath}`);

  const games = JSON.parse(fs.readFileSync(fetchedPath, 'utf8'));
  const r18 = games.filter(isR18);
  const r18After = r18.filter((g) => norm(g.releaseDate) >= cutoff);

  const allCsvPath = path.join('csvoutput', `articles_${ym}_all.csv`);
  const allIds = await readAllCsvIds(allCsvPath);

  const missing = r18After.filter((g) => g.id && !allIds.has(g.id));

  const outJsonAll = nextPath(path.join('csvoutput', `fetched_games_${ym}_r18_from_${cutoff}.json`));
  fs.writeFileSync(outJsonAll, JSON.stringify(r18After, null, 2), 'utf8');

  const outJsonMissing = nextPath(path.join('csvoutput', `fetched_games_${ym}_r18_from_${cutoff}_missing.json`));
  fs.writeFileSync(outJsonMissing, JSON.stringify(missing, null, 2), 'utf8');

  const outCsvAll = nextPath(path.join('csvoutput', `extract_${ym}_r18_from_${cutoff}.csv`));
  fs.writeFileSync(outCsvAll, toSimpleCsv(r18After));

  const outCsvMissing = nextPath(path.join('csvoutput', `extract_${ym}_r18_from_${cutoff}_missing.csv`));
  fs.writeFileSync(outCsvMissing, toSimpleCsv(missing));

  console.log('WROTE', outJsonAll);
  console.log('WROTE', outJsonMissing);
  console.log('WROTE', outCsvAll);
  console.log('WROTE', outCsvMissing);
  console.log('SUMMARY', {
    fetched: games.length,
    r18: r18.length,
    r18FromCutoff: r18After.length,
    existingAllCsvIds: allIds.size,
    missingFromCutoff: missing.length,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
