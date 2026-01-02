const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/fix_csv_prices.js <YYYY-MM> <partN>');
  console.log('Example: node scripts/fix_csv_prices.js 2025-12 1');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }

    if (c === '\r') {
      // ignore; will be handled by \n
      continue;
    }

    field += c;
  }

  // trailing
  row.push(field);
  rows.push(row);

  return rows;
}

function stringifyCSV(rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[\r\n,\"]/g.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

function formatPrice(price) {
  if (price === null || price === undefined) return '-';
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n)) return '-';
  return `${n}円`;
}

function extractRJIdFromText(s) {
  if (!s) return null;
  const m = String(s).match(/product_id\/(RJ\d+)\.html/i);
  return m ? m[1] : null;
}

async function main() {
  const yymm = process.argv[2];
  const part = Number(process.argv[3]);

  if (!yymm || !/^\d{4}-\d{2}$/.test(yymm) || !Number.isFinite(part) || part < 1) {
    usage();
    process.exit(1);
  }

  const [yStr, mStr] = yymm.split('-');
  const year = Number(yStr);
  const month = Number(mStr);

  const fetchedPath = path.join(__dirname, '..', 'csvoutput', `fetched_games_${year}-${pad2(month)}.json`);
  const csvPath = path.join(__dirname, '..', 'csvoutput', `articles_${year}-${pad2(month)}_part${part}.csv`);

  if (!fs.existsSync(fetchedPath)) {
    console.error('Not found:', fetchedPath);
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error('Not found:', csvPath);
    process.exit(1);
  }

  const fetched = JSON.parse(fs.readFileSync(fetchedPath, 'utf8'));
  const priceById = new Map(fetched.filter((g) => g && g.id).map((g) => [g.id, g.price]));

  const buf = fs.readFileSync(csvPath);
  const hasBOM = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');

  const rows = parseCSV(text);
  if (rows.length < 2) {
    console.error('CSV seems empty');
    process.exit(1);
  }

  const header = rows[0];
  const bodyIdx = header.indexOf('本文');
  const affIdx = header.indexOf('アフィリエイトリンク');

  if (bodyIdx < 0 || affIdx < 0) {
    console.error('Expected columns not found. header=', header);
    process.exit(1);
  }

  let changed = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const body = r[bodyIdx] || '';
    const aff = r[affIdx] || '';
    const id = extractRJIdFromText(body) || extractRJIdFromText(aff);
    if (!id) continue;

    const price = priceById.get(id);
    const priceLabel = formatPrice(price);

    let newBody = body;

    // Replace bullet price line if present
    newBody = newBody.replace(/(\- \*\*価格\*\*:\s*)(?:\d+円|0円|-)/g, `$1${priceLabel}`);

    // Replace prose "価格はX円で" if present
    newBody = newBody.replace(/(価格は)\s*(?:\d+円|0円|-)\s*(で)/g, `$1${priceLabel}$2`);

    if (newBody !== body) {
      r[bodyIdx] = newBody;
      changed++;
    }
  }

  const out = stringifyCSV(rows);
  const outBuf = Buffer.from((hasBOM ? '\uFEFF' : '') + out, 'utf8');
  fs.writeFileSync(csvPath, outBuf);

  console.log('Updated', csvPath);
  console.log('Rows changed:', changed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
