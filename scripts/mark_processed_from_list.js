const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

function norm(value) {
  return String(value ?? '').trim();
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function main() {
  const args = parseArgs(process.argv);
  const inPath = args.in;
  const processedPath = args.processed || path.join('csvoutput', 'processed_games.json');
  const processedDate = args.date || todayIso();

  if (!inPath) {
    throw new Error('Usage: node scripts/mark_processed_from_list.js --in <json> [--processed csvoutput/processed_games.json] [--date YYYY-MM-DD]');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(processedDate)) {
    throw new Error(`Invalid --date: ${processedDate}`);
  }
  if (!fs.existsSync(inPath)) {
    throw new Error(`Missing input json: ${inPath}`);
  }

  const input = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  if (!Array.isArray(input)) {
    throw new Error('Input json must be an array');
  }

  let processed = [];
  if (fs.existsSync(processedPath)) {
    try {
      const raw = fs.readFileSync(processedPath, 'utf8').trim();
      processed = raw ? JSON.parse(raw) : [];
    } catch {
      processed = [];
    }
  }
  if (!Array.isArray(processed)) processed = [];

  const seen = new Set(processed.map((x) => x && x.id).filter(Boolean));
  const before = processed.length;

  let added = 0;
  for (const g of input) {
    const id = norm(g && g.id);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    processed.push({
      id,
      title: norm(g.title),
      processedDate,
    });
    added++;
  }

  // stable-ish order: keep existing order, new additions appended
  fs.mkdirSync(path.dirname(processedPath), { recursive: true });
  fs.writeFileSync(processedPath, JSON.stringify(processed, null, 2) + '\n', 'utf8');

  console.log('UPDATED', processedPath);
  console.log('SUMMARY', { before, after: processed.length, added, date: processedDate });
}

main();
