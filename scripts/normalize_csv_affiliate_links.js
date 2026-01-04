#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { toDlafWorkUrl } = require('../lib/dlsiteAffiliate');

const AID = 'r18Hub';

function parseArgs(argv) {
  const out = { dir: 'csvoutput', dryRun: false, includePattern: /\.csv$/i };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' && argv[i + 1]) {
      out.dir = argv[++i];
      continue;
    }
    if (a === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (a === '--pattern' && argv[i + 1]) {
      out.includePattern = new RegExp(argv[++i]);
      continue;
    }
  }
  return out;
}

function readHeaderOrder(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const chunk = buf.slice(0, n).toString('utf8');
    const idx = chunk.indexOf('\n');
    const line = (idx >= 0 ? chunk.slice(0, idx) : chunk).replace(/\r$/, '');
    const cleaned = line.replace(/^\uFEFF/, '');
    return cleaned.split(',').map((h) => h.replace(/^"|"$/g, ''));
  } finally {
    fs.closeSync(fd);
  }
}

function escapeCsvField(value) {
  const s = value == null ? '' : String(value);
  if (/[\r\n",]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rewriteDlsiteWorkLinksInText(text) {
  const input = String(text || '');
  if (!input) return { text: input, firstAffiliateLink: '' };

  let firstAffiliateLink = '';

  // Match DLsite work URLs and convert to dlaf work link.
  // Example: https://www.dlsite.com/maniax/work/=/product_id/RJ01484541.html
  const re = /https?:\/\/(?:www\.)?dlsite\.com\/([^\s\/]+)\/work\/=\/product_id\/(RJ[0-9A-Za-z]+)\.html(?=[)\s"'<>]|$)/gi;

  const out = input.replace(re, (_m, site, id) => {
    const converted = toDlafWorkUrl({ site, id, aid: AID });
    if (converted && !firstAffiliateLink) firstAffiliateLink = converted;
    return converted || _m;
  });

  return { text: out, firstAffiliateLink };
}

function normalizeAffiliateField(value, fallbackFromBody) {
  const v = String(value || '').trim();
  if (!v) return fallbackFromBody || '';

  // Fixed/old value -> replace with derived
  if (v === 'https://www.dlsite.com/maniax/' || v === 'https://www.dlsite.com/maniax') {
    return fallbackFromBody || v;
  }

  // If it's a DLsite work URL, convert.
  const { firstAffiliateLink } = rewriteDlsiteWorkLinksInText(v);
  if (firstAffiliateLink) return firstAffiliateLink;

  return v;
}

async function processFile(filePath, { dryRun }) {
  const headers = readHeaderOrder(filePath);
  const tmpPath = filePath + '.tmp';

  const headerMap = {
    title: 'タイトル',
    gameTitle: 'ゲームタイトル',
    description: '説明',
    body: '本文',
    affiliate: 'アフィリエイトリンク',
  };

  const bodyKey = headers.find((h) => h === headerMap.body) || headerMap.body;
  const descKey = headers.find((h) => h === headerMap.description) || headerMap.description;
  const affKey = headers.find((h) => h === headerMap.affiliate) || headerMap.affiliate;

  let changedRows = 0;
  let totalRows = 0;

  if (!dryRun) {
    fs.writeFileSync(tmpPath, '\uFEFF' + headers.join(',') + '\n', 'utf8');
  }

  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(
        csv({
          skipEmptyLines: true,
          mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim(),
        })
      )
      .on('data', (row) => {
        totalRows += 1;

        const beforeBody = row[bodyKey];
        const beforeDesc = row[descKey];
        const beforeAff = row[affKey];

        const bodyRes = rewriteDlsiteWorkLinksInText(beforeBody);
        const descRes = rewriteDlsiteWorkLinksInText(beforeDesc);
        const fallbackAffiliate = bodyRes.firstAffiliateLink || descRes.firstAffiliateLink || '';

        const newAff = normalizeAffiliateField(beforeAff, fallbackAffiliate);

        let changed = false;
        if (typeof beforeBody !== 'undefined' && bodyRes.text !== beforeBody) {
          row[bodyKey] = bodyRes.text;
          changed = true;
        }
        if (typeof beforeDesc !== 'undefined' && descRes.text !== beforeDesc) {
          row[descKey] = descRes.text;
          changed = true;
        }
        if (typeof beforeAff !== 'undefined' && newAff !== beforeAff) {
          row[affKey] = newAff;
          changed = true;
        }

        if (changed) changedRows += 1;

        if (!dryRun) {
          const line = headers.map((h) => escapeCsvField(row[h])).join(',') + '\n';
          fs.appendFileSync(tmpPath, line, 'utf8');
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (!dryRun) {
    fs.renameSync(tmpPath, filePath);
  } else {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
  }

  return { totalRows, changedRows };
}

async function main() {
  const args = parseArgs(process.argv);
  const dirPath = path.resolve(process.cwd(), args.dir);

  if (!fs.existsSync(dirPath)) {
    console.error('Directory not found:', dirPath);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dirPath)
    .filter((name) => args.includePattern.test(name))
    .map((name) => path.join(dirPath, name));

  if (files.length === 0) {
    console.log('No CSV files found in', dirPath);
    return;
  }

  let total = 0;
  let changed = 0;

  for (const f of files) {
    const r = await processFile(f, { dryRun: args.dryRun });
    total += r.totalRows;
    changed += r.changedRows;
    console.log(`${path.basename(f)}: rows=${r.totalRows} changed=${r.changedRows}${args.dryRun ? ' (dry-run)' : ''}`);
  }

  console.log(`DONE files=${files.length} rows=${total} changedRows=${changed}${args.dryRun ? ' (dry-run)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
