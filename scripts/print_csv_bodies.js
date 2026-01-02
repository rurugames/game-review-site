const fs = require('fs');

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    let field = '';
    let inQuotes = false;
    let started = false;

    while (i < len) {
      const ch = text[i];
      const chNext = text[i+1];

      if (!started) {
        // start of field
        started = true;
        if (ch === '"') { inQuotes = true; i++; continue; }
      }

      if (inQuotes) {
        if (ch === '"') {
          if (chNext === '"') { field += '"'; i += 2; continue; } // escaped quote
          // end quote
          inQuotes = false;
          i++;
          continue;
        }
        // regular char inside quotes
        field += ch;
        i++;
        continue;
      } else {
        // not in quotes
        if (ch === ',') {
          row.push(field);
          field = '';
          started = false;
          inQuotes = false;
          i++;
          continue;
        }
        if (ch === '\r') { i++; continue; }
        if (ch === '\n') {
          row.push(field);
          i++;
          break;
        }
        // normal char
        field += ch;
        i++;
        continue;
      }
    }

    // handle EOF without newline
    if (i >= len && (started || field.length > 0 || row.length > 0)) {
      row.push(field);
    }

    // if row is empty and at EOF, break
    if (row.length === 1 && row[0] === '' && i >= len) break;
    rows.push(row);
  }
  return rows;
}

function printBodies(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const rows = parseCSV(text);
    if (rows.length === 0) {
      console.error('No rows in', filePath);
      return;
    }
    const header = rows[0];
    const bodyIdx = header.indexOf('本文');
    if (bodyIdx === -1) {
      console.error('Cannot find "本文" column in', filePath);
      return;
    }
    console.log('===', filePath, '=> 本文一覧 (各項目区切り: -----) ===');
    for (let r = 1; r < rows.length; r++) {
      const rec = rows[r];
      const body = rec[bodyIdx] || '';
      console.log('--- Record', r, '---');
      console.log(body);
      console.log('-----\n');
    }
  } catch (e) {
    console.error('Error reading', filePath, e && e.message);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node print_csv_bodies.js <csvfile> [csvfile2 ...]');
  process.exit(1);
}
for (const p of args) printBodies(p);
