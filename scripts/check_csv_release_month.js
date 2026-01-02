const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

function parseArgs(argv) {
  const args = argv.slice(2);
  const monthArgIndex = args.findIndex((a) => a === '--month');
  if (monthArgIndex === -1 || !args[monthArgIndex + 1]) {
    throw new Error('Usage: node scripts/check_csv_release_month.js --month YYYY-MM <csv1> <csv2> ...');
  }
  const month = args[monthArgIndex + 1];
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid --month. Expected YYYY-MM');
  }
  const files = args.filter((a, i) => i !== monthArgIndex && i !== monthArgIndex + 1);
  if (files.length === 0) {
    throw new Error('No CSV files provided');
  }
  return { month, files };
}

function checkFile(filePath, month) {
  return new Promise((resolve, reject) => {
    const results = [];
    let recordIndex = 0;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        recordIndex += 1;
        const title = row['タイトル'] ?? row['title'] ?? '';
        const gameTitle = row['ゲームタイトル'] ?? row['gameTitle'] ?? '';
        const releaseDate = row['発売日'] ?? row['releaseDate'] ?? '';

        const ok = typeof releaseDate === 'string' && releaseDate.startsWith(month + '-');
        results.push({ recordIndex, ok, releaseDate, title, gameTitle });
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function main() {
  const { month, files } = parseArgs(process.argv);

  for (const f of files) {
    const resolved = path.resolve(process.cwd(), f);
    const records = await checkFile(resolved, month);

    console.log(`File: ${f}`);
    if (records.length === 0) {
      console.log('  (no records parsed)');
      continue;
    }

    let okCount = 0;
    for (const r of records) {
      if (r.ok) okCount += 1;
      const label = r.ok ? 'OK' : 'OUT';
      console.log(`Record ${r.recordIndex}: releaseDate=${r.releaseDate} => ${label}`);
      if (!r.ok) {
        console.log(`  タイトル: ${r.title}`);
        console.log(`  ゲームタイトル: ${r.gameTitle}`);
      }
    }
    console.log(`Summary: ${okCount}/${records.length} OK`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
