/*
  End-to-end yearly pipeline:
  - Fetch DLsite monthly games
  - Save csvoutput/fetched_games_YYYY-MM.json
  - Generate 5-per article CSV parts from fetched JSON (updates processed_games.json)
  - Merge parts into csvoutput/articles_YYYY-MM_all.csv
  - Move part CSVs into csvoutput/backup

  Usage (PowerShell):
    node scripts/process_year_pipeline.js 2024
    node scripts/process_year_pipeline.js 2024 1 12

  Notes:
    - By default, skip fetching if fetched JSON already exists.
*/

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dlsiteService = require('../services/dlsiteService');

function usageAndExit() {
  console.log('Usage: node scripts/process_year_pipeline.js <YYYY> [startMonth=1] [endMonth=12] [--refetch] [--forceRefreshDetails]');
  console.log('Example: node scripts/process_year_pipeline.js 2024');
  console.log('Example: node scripts/process_year_pipeline.js 2024 1 12');
  console.log('Example: node scripts/process_year_pipeline.js 2019 1 1 --refetch --forceRefreshDetails');
  process.exit(1);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseIntOr(v, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function spawnNode(scriptRelPath, args, cwd) {
  const scriptPath = path.join(cwd, scriptRelPath);
  const res = spawnSync(process.execPath, [scriptPath, ...args], { cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function listPartFiles(csvoutputDir, yearMonth) {
  const re = new RegExp(`^articles_${yearMonth}_part(\\d+)\\.csv$`);
  return fs
    .readdirSync(csvoutputDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => re.test(name))
    .map((name) => path.join(csvoutputDir, name));
}

function moveToBackupNoClobber(srcPath, backupDir) {
  const base = path.basename(srcPath);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);

  let dest = path.join(backupDir, base);
  if (!fs.existsSync(dest)) {
    fs.renameSync(srcPath, dest);
    return dest;
  }

  for (let v = 2; v <= 9999; v++) {
    const candidate = path.join(backupDir, `${stem}_v${v}${ext}`);
    if (fs.existsSync(candidate)) continue;
    fs.renameSync(srcPath, candidate);
    return candidate;
  }

  throw new Error(`Backup destination name exhausted for ${base}`);
}

async function main() {
  const args = process.argv.slice(2);
  const year = parseIntOr(args[0], NaN);
  const startMonth = parseIntOr(args[1], 1);
  const endMonth = parseIntOr(args[2], 12);

  const refetch = args.includes('--refetch');
  const forceRefreshDetails = args.includes('--forceRefreshDetails');

  if (!Number.isFinite(year) || year < 1900 || year > 2100) usageAndExit();
  if (!Number.isFinite(startMonth) || !Number.isFinite(endMonth) || startMonth < 1 || endMonth > 12 || endMonth < startMonth) {
    usageAndExit();
  }

  const workspaceRoot = path.join(__dirname, '..');
  const csvoutputDir = path.join(workspaceRoot, 'csvoutput');
  const backupDir = path.join(csvoutputDir, 'backup');

  if (!fs.existsSync(csvoutputDir)) fs.mkdirSync(csvoutputDir, { recursive: true });
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  for (let month = startMonth; month <= endMonth; month++) {
    const mm = pad2(month);
    const ym = `${year}-${mm}`;

    const fetchedPath = path.join(csvoutputDir, `fetched_games_${ym}.json`);

    if (refetch || !fs.existsSync(fetchedPath)) {
      console.log(`\n=== [${ym}] Fetching from DLsite... ===`);
      const games = await dlsiteService.fetchGamesByMonth(year, month, { forceRefreshDetails });
      fs.writeFileSync(fetchedPath, JSON.stringify(games, null, 2), 'utf8');
      console.log(`Saved: ${fetchedPath} (count=${Array.isArray(games) ? games.length : 0})`);
    } else {
      console.log(`\n=== [${ym}] fetched JSON exists (skip fetch) ===`);
    }

    console.log(`\n=== [${ym}] Generating part CSVs (5 per file)... ===`);
    spawnNode(path.join('scripts', 'generate_all_batches_csv.js'), [ym], workspaceRoot);

    const partFiles = listPartFiles(csvoutputDir, ym);
    if (!partFiles.length) {
      console.log(`No part CSVs found for ${ym} (skip merge/backup).`);
      continue;
    }

    console.log(`\n=== [${ym}] Merging into monthly all CSV... ===`);
    const outRel = path.join('csvoutput', `articles_${ym}_all.csv`);
    spawnNode(path.join('scripts', 'merge_csv_parts.js'), [ym, outRel], workspaceRoot);

    console.log(`\n=== [${ym}] Moving part CSVs to backup... ===`);
    let moved = 0;
    for (const filePath of partFiles) {
      moveToBackupNoClobber(filePath, backupDir);
      moved++;
    }
    console.log(`Moved ${moved} files to ${backupDir}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
