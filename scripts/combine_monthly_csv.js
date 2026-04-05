/**
 * 月次CSVの結合スクリプト
 * 使用: node scripts/combine_monthly_csv.js 2026 03
 */
const fs = require('fs');
const path = require('path');

const [,, year, month] = process.argv;
if (!year || !month) {
  console.error('Usage: node scripts/combine_monthly_csv.js YYYY MM');
  process.exit(1);
}

const ym = `${year}-${month}`;
const BOM = '\uFEFF';
const HEADER = 'タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク';
const outputDir = path.join(__dirname, '..', 'csvoutput');
const outFile = path.join(outputDir, `articles_${ym}_all.csv`);

if (fs.existsSync(outFile)) {
  const overwrite = process.argv.includes('--overwrite');
  if (!overwrite) {
    console.log(`Already exists: articles_${ym}_all.csv (use --overwrite to replace)`);
    process.exit(0);
  }
}

// Sort part files numerically
const partFiles = fs.readdirSync(outputDir)
  .filter(f => f.match(new RegExp(`^articles_${ym}_part\\d+\\.csv$`)))
  .sort((a, b) => {
    const na = parseInt(a.match(/part(\d+)/)[1]);
    const nb = parseInt(b.match(/part(\d+)/)[1]);
    return na - nb;
  });

if (partFiles.length === 0) {
  console.error(`No part files found for ${ym}`);
  process.exit(1);
}

console.log(`Combining ${partFiles.length} part files for ${ym}...`);

let allDataBlocks = [];
for (const f of partFiles) {
  let content = fs.readFileSync(path.join(outputDir, f), 'utf8');
  // Remove BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  // Normalize line endings to LF
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Remove trailing whitespace/newline
  content = content.trimEnd();
  // Split off header
  const firstNL = content.indexOf('\n');
  if (firstNL === -1) continue;
  const dataBlock = content.slice(firstNL + 1).trimEnd();
  if (dataBlock) allDataBlocks.push(dataBlock);
}

// Combine with CRLF between blocks, CRLF at end
const combined = BOM + HEADER + '\r\n' +
  allDataBlocks.join('\r\n') + '\r\n';

fs.writeFileSync(outFile, combined, 'utf8');
console.log(`Written: articles_${ym}_all.csv (${(combined.length/1024).toFixed(0)} KB)`);

// Quick row count using csv-parser
try {
  const csv = require('csv-parser');
  const rows = [];
  fs.createReadStream(outFile)
    .pipe(csv({ skipEmptyLines: true, mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
    .on('data', r => rows.push(r))
    .on('end', () => {
      const bad = rows.filter(r => !(r['タイトル'] || r['title']) || !(r['ゲームタイトル'] || r['gameTitle']) || !(r['本文'] || r['content']));
      console.log(`Validated rows=${rows.length} bad=${bad.length}`);
      if (bad.length > 0) console.log('First bad row:', JSON.stringify(bad[0]).substring(0, 200));
    });
} catch (e) {
  console.log('(csv-parser not available for validation)');
}
