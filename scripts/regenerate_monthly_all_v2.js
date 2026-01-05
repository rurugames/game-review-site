/*
  Regenerate monthly "all" CSV using the latest article template.

  Input:  csvoutput/articles_YYYY-MM_all.csv
  Cache:  csvoutput/fetched_games_YYYY-MM.json (preferred)
  Output: csvoutput/articles_YYYY-MM_all_v2.csv

  Usage (PowerShell):
    node scripts/regenerate_monthly_all_v2.js 2019-12
    node scripts/regenerate_monthly_all_v2.js 2019-12 --allowFetch
    node scripts/regenerate_monthly_all_v2.js 2019-12 --overwrite
*/

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const tpl = require('./article_template');
const { loadResearchMemo } = require('./research_memo_loader');
const dlsiteService = require('../services/dlsiteService');

function usageAndExit() {
  console.log('Usage: node scripts/regenerate_monthly_all_v2.js <YYYY-MM> [--allowFetch] [--overwrite] [--outAll]');
  console.log('Example: node scripts/regenerate_monthly_all_v2.js 2019-12');
  console.log('Example: node scripts/regenerate_monthly_all_v2.js 2019-01 --overwrite --outAll');
  process.exit(1);
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

async function readCsvRows(csvPath) {
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
  return rows;
}

async function validateCsvLikeImporter(csvPath) {
  const rows = await readCsvRows(csvPath);

  let bad = 0;
  for (const row of rows) {
    const title = row['タイトル'] || row['title'];
    const gameTitle = row['ゲームタイトル'] || row['gameTitle'];
    const content = row['本文'] || row['content'];
    if (!title || !gameTitle || !content) bad++;
  }

  return { rows: rows.length, bad };
}

function ensureBodyLengthWithinRange(content, contextSeed) {
  // 基本は article_template 側で 820-1200 を目標にしているが、
  // 欠損データが多いケースの保険として追加。
  const targetMin = 820;
  const targetMax = 1200;
  let out = String(content || '');

  const additions = [
    '## 補足\n購入前後で気になる点があれば、DLsiteの説明文・タグ・同梱テキストを照合して、どの要素を重視して遊ぶか（物語/探索/回収など）を決めておくと迷いが減ります。',
    '## 補足\nまずは設定（ウィンドウ/フルスクリーン、音量、キー配置、既読スキップなど）を整えるだけで、読み進めやすさ・遊びやすさが大きく改善します。',
    '## 補足\n分岐や回収がありそうな作品は、イベント直前・選択肢直前でセーブ枠を固定化しておくと、後から差分確認がしやすくなります。',
  ];

  const h = tpl.hashStringToInt(String(contextSeed || 'seed'));
  const rotated = additions
    .map((p, i) => ({ p, k: (h + i * 101) >>> 0 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);

  for (const p of rotated) {
    if (out.length >= targetMin) break;
    if (out.includes(p)) continue;
    out += '\n\n' + p;
  }

  while (out.length > targetMax) {
    const idx = out.lastIndexOf('\n\n## ');
    if (idx <= 0) break;
    const candidate = out.slice(0, idx);
    if (candidate.length < targetMin) break;
    out = candidate;
  }

  return out;
}

function extractRJFromRow(row) {
  const candidates = [
    row['アフィリエイトリンク'],
    row['affiliateLink'],
    row['本文'],
    row['content'],
    row['タイトル'],
    row['title'],
  ];
  for (const c of candidates) {
    const rj = tpl.extractRJFromText(c);
    if (rj) return rj;
  }
  return null;
}

async function regenerateMonthlyAllV2(yearMonth, options) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) usageAndExit();

  const [yearStr, monthStr] = yearMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) usageAndExit();

  const workspaceRoot = path.join(__dirname, '..');
  const csvoutputDir = path.join(workspaceRoot, 'csvoutput');

  const inPath = path.join(csvoutputDir, `articles_${yearMonth}_all.csv`);
  const outPath = options.outAll
    ? path.join(csvoutputDir, `articles_${yearMonth}_all.csv`)
    : path.join(csvoutputDir, `articles_${yearMonth}_all_v2.csv`);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Missing input: ${inPath}`);
  }

  if (fs.existsSync(outPath) && !options.overwrite) {
    throw new Error(`Output already exists: ${outPath} (use --overwrite to replace)`);
  }

  const fetchedPath = path.join(csvoutputDir, `fetched_games_${year}-${pad2(month)}.json`);
  const fetched = readJsonIfExists(fetchedPath, null);
  const fetchedById = new Map(
    Array.isArray(fetched) ? fetched.filter((g) => g && g.id).map((g) => [String(g.id).toUpperCase(), g]) : []
  );

  const rows = await readCsvRows(inPath);
  if (!rows.length) {
    throw new Error(`No rows found in input: ${inPath}`);
  }

  const header = ['タイトル', 'ゲームタイトル', '説明', '本文', 'ジャンル', '評価', '画像URL', 'ステータス', '発売日', 'タグ', 'アフィリエイトリンク'];

  const outputRecords = [];
  const missingIds = [];

  const memoCache = new Map();

  for (const row of rows) {
    const rj = extractRJFromRow(row);
    if (!rj) {
      missingIds.push('(unknown)');
      continue;
    }

    let game = fetchedById.get(rj);

    if (!game && options.allowFetch) {
      // キャッシュが無い作品のみ、個別に詳細取得
      try {
        const details = await dlsiteService.fetchGameDetails(rj);
        game = { id: rj, ...details };
      } catch (e) {
        throw new Error(`Failed to fetch details for ${rj}: ${e && e.message ? e.message : e}`);
      }
    }

    if (!game) {
      missingIds.push(rj);
      continue;
    }

    let memo = memoCache.get(rj);
    if (memo === undefined) {
      memo = loadResearchMemo(workspaceRoot, rj);
      memoCache.set(rj, memo || null);
    }

    if (memo) {
      // templateへ渡す（互換を壊さないため、内部用キーに置く）
      game = {
        ...game,
        __templateOptions: {
          research: memo,
          variantKey: tpl.pickVariantKey(rj),
        },
      };
    }

    const rec = tpl.buildRecordFromGame(game);
    const fixed = {
      ...rec,
      content: ensureBodyLengthWithinRange(rec.content, game.id),
    };

    const bodyOk = tpl.validateBodyLength(fixed.content);
    if (!bodyOk.ok) {
      throw new Error(`Body length out of range for ${rj}: length=${bodyOk.length}`);
    }

    outputRecords.push(fixed);
  }

  if (missingIds.length) {
    const uniq = tpl.unique(missingIds);
    const hint = fs.existsSync(fetchedPath)
      ? `Some RJ codes were not found in fetched JSON: ${fetchedPath}`
      : `Fetched JSON not found: ${fetchedPath}`;

    throw new Error(
      `${hint}\nMissing: ${uniq.slice(0, 30).join(', ')}${uniq.length > 30 ? ` ...(+${uniq.length - 30})` : ''}\n` +
        `Try: node scripts/process_year_pipeline.js ${year} ${month} ${month}  (to create fetched JSON), or run with --allowFetch.`
    );
  }

  const lines = [];
  lines.push(header.join(','));
  for (const r of outputRecords) {
    lines.push(
      [
        r.title,
        r.gameTitle,
        r.description,
        r.content,
        r.genre,
        r.rating,
        r.imageUrl,
        r.status,
        r.releaseDate,
        r.tags,
        r.affiliateLink,
      ]
        .map(tpl.csvQuote)
        .join(',')
    );
  }

  // BOM + CRLF + 末尾空行なし
  const bom = '\uFEFF';
  const full = bom + lines.join('\n').replace(/\n/g, '\r\n');
  fs.writeFileSync(outPath, full, 'utf8');

  const validation = await validateCsvLikeImporter(outPath);

  return {
    inPath,
    outPath,
    count: outputRecords.length,
    validation,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const yearMonth = args[0];
  if (!yearMonth) usageAndExit();

  const allowFetch = args.includes('--allowFetch');
  const overwrite = args.includes('--overwrite');
  const outAll = args.includes('--outAll');

  const res = await regenerateMonthlyAllV2(yearMonth, { allowFetch, overwrite, outAll });
  console.log(`Input:  ${res.inPath}`);
  console.log(`Output: ${res.outPath}`);
  console.log(`Rows:   ${res.count}`);
  console.log(`CSV validation: rows=${res.validation.rows}, bad=${res.validation.bad}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
