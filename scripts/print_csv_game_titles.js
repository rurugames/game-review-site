const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

async function readTitles(csvPath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        rows.push({
          title: row['タイトル'] ?? row['title'] ?? '',
          gameTitle: row['ゲームタイトル'] ?? row['gameTitle'] ?? '',
          releaseDate: row['発売日'] ?? row['releaseDate'] ?? '',
        });
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/print_csv_game_titles.js <csv1> <csv2> ...');
    process.exit(1);
  }

  for (const f of args) {
    const resolved = path.resolve(process.cwd(), f);
    const rows = await readTitles(resolved);
    console.log(`File: ${f}`);
    if (rows.length === 0) {
      console.log('  (no records parsed)');
      continue;
    }
    rows.forEach((r, i) => {
      console.log(`${String(i + 1).padStart(2, '0')}. ${r.releaseDate} | ${r.gameTitle}`);
    });
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
