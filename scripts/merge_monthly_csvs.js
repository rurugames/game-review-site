const path = require('path');
const { spawnSync } = require('child_process');

function usageAndExit() {
  console.log('Usage: node scripts/merge_monthly_csvs.js <startYYYY-MM> <endYYYY-MM>');
  console.log('Example: node scripts/merge_monthly_csvs.js 2025-01 2025-11');
  process.exit(1);
}

function parseYm(s) {
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const [y, m] = s.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

function formatYm(y, m) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

function* iterateMonthsInclusive(start, end) {
  let y = start.y;
  let m = start.m;
  while (y < end.y || (y === end.y && m <= end.m)) {
    yield formatYm(y, m);
    m += 1;
    if (m === 13) {
      y += 1;
      m = 1;
    }
  }
}

function main() {
  const [startRaw, endRaw] = process.argv.slice(2);
  if (!startRaw || !endRaw) usageAndExit();
  const start = parseYm(startRaw);
  const end = parseYm(endRaw);
  if (!start || !end) usageAndExit();

  const scriptPath = path.join(__dirname, 'merge_csv_parts.js');
  const workspaceRoot = path.join(__dirname, '..');

  for (const ym of iterateMonthsInclusive(start, end)) {
    const outRel = path.join('csvoutput', `articles_${ym}_all.csv`);
    const res = spawnSync(process.execPath, [scriptPath, ym, outRel], {
      cwd: workspaceRoot,
      stdio: 'inherit',
    });
    if (res.status !== 0) process.exit(res.status ?? 1);
  }
}

main();
