const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

function usageAndExit() {
  console.log('Usage: node scripts/merge_csv_parts.js <YYYY-MM> <fromPart> <toPart> <outFile>');
  console.log('Example: node scripts/merge_csv_parts.js 2025-12 4 72 csvoutput\\articles_2025-12_part4-72_all.csv');
  process.exit(1);
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function stripBom(s) {
  return String(s || '').replace(/^\uFEFF/, '');
}

function sliceAfterHeader(csvText) {
  const s = stripBom(csvText);
  const idx = s.indexOf('\n');
  if (idx === -1) return '';
  return s.slice(idx + 1);
}

function getHeaderLine(csvText) {
  const s = stripBom(csvText);
  const idx = s.indexOf('\n');
  return idx === -1 ? s.trim() : s.slice(0, idx).replace(/\r$/, '');
}

function listPartFiles(csvoutputDir, yearMonth, fromPart, toPart) {
  const out = [];
  for (let p = fromPart; p <= toPart; p++) {
    out.push(path.join(csvoutputDir, `articles_${yearMonth}_part${p}.csv`));
  }
  return out;
}

async function validateCsvLikeImporter(csvPath) {
  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(
        csv({
          skipEmptyLines: true,
          mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim(),
        })
      )
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  let bad = 0;
  for (const row of rows) {
    const title = row['タイトル'] || row['title'];
    const gameTitle = row['ゲームタイトル'] || row['gameTitle'];
    const content = row['本文'] || row['content'];
    if (!title || !gameTitle || !content) bad++;
  }

  return { rows: rows.length, bad };
}

async function main() {
  const [yearMonth, fromPartRaw, toPartRaw, outFile] = process.argv.slice(2);
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) usageAndExit();
  const fromPart = Number(fromPartRaw);
  const toPart = Number(toPartRaw);
  if (!Number.isFinite(fromPart) || !Number.isFinite(toPart) || fromPart < 1 || toPart < fromPart) usageAndExit();
  if (!outFile) usageAndExit();

  const workspaceRoot = path.join(__dirname, '..');
  const csvoutputDir = path.join(workspaceRoot, 'csvoutput');

  const partFiles = listPartFiles(csvoutputDir, yearMonth, fromPart, toPart);
  for (const f of partFiles) {
    if (!fs.existsSync(f)) {
      throw new Error(`Missing file: ${f}`);
    }
  }

  const header = getHeaderLine(readFileUtf8(partFiles[0]));

  let combined = '';
  for (const f of partFiles) {
    const body = sliceAfterHeader(readFileUtf8(f));
    if (!body) continue;
    const trimmedBody = body.replace(/^\r?\n+/, '').replace(/\r?\n+$/g, '');
    if (!trimmedBody) continue;
    if (combined) combined += '\n';
    combined += trimmedBody;
  }

  const bom = '\uFEFF';
  const outPath = path.isAbsolute(outFile) ? outFile : path.join(workspaceRoot, outFile);

  // ヘッダー + 本文（末尾空行なし）
  const full = bom + header + '\n' + combined;
  fs.writeFileSync(outPath, full, 'utf8');

  const validation = await validateCsvLikeImporter(outPath);
  console.log(`Wrote: ${outPath}`);
  console.log(`Validation: rows=${validation.rows}, bad=${validation.bad}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
