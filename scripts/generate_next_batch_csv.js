const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const tpl = require('./article_template');

function usageAndExit() {
  console.log('Usage: node scripts/generate_next_batch_csv.js <YYYY-MM>');
  console.log('Example: node scripts/generate_next_batch_csv.js 2025-12');
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

function normalizeProcessedIds(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      ids.push(item);
      continue;
    }
    if (item && typeof item === 'object' && typeof item.id === 'string') {
      ids.push(item.id);
    }
  }
  return tpl.unique(ids);
}

// inferGenre/buildTags/hashStringToInt/buildContent などは scripts/article_template.js に集約

function computeNextPartNumber(csvoutputDir, yearMonth) {
  const files = fs.readdirSync(csvoutputDir);
  const re = new RegExp(`^articles_${yearMonth}_part(\\d+)\\.csv$`);
  let maxPart = 0;
  for (const f of files) {
    const m = f.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) maxPart = Math.max(maxPart, n);
  }
  return maxPart + 1;
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
    const normalizedRow = {
      title: row['タイトル'] || row['title'],
      gameTitle: row['ゲームタイトル'] || row['gameTitle'],
      content: row['本文'] || row['content'],
    };
    if (!normalizedRow.title || !normalizedRow.gameTitle || !normalizedRow.content) bad++;
  }
  return { rows: rows.length, bad };
}

function validateBodyLengths(records) {
  const out = [];
  for (const [i, rec] of records.entries()) {
    const len = String(rec.content || '').length;
    const ok = len >= 800 && len <= 1200;
    out.push({ index: i + 1, length: len, ok });
  }
  return out;
}

function ensureBodyLengthWithinRange(content, contextSeed) {
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

async function generateNextBatch(yearMonth, options = {}) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) usageAndExit();

  const [yearStr, monthStr] = yearMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) usageAndExit();

  const explicitIds = Array.isArray(options.ids) ? options.ids.filter(Boolean) : null;

  const csvoutputDir = path.join(__dirname, '..', 'csvoutput');
  const fetchedPath = path.join(csvoutputDir, `fetched_games_${year}-${pad2(month)}.json`);
  const processedPath = path.join(csvoutputDir, 'processed_games.json');

  const games = readJsonIfExists(fetchedPath, []);
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error(`No games found: ${fetchedPath}`);
  }

  const processed = readJsonIfExists(processedPath, []);
  const processedIds = normalizeProcessedIds(processed);
  const processedSet = new Set(processedIds);

  const byId = new Map(games.filter((g) => g && g.id).map((g) => [g.id, g]));

  const batch = explicitIds
    ? explicitIds.map((id) => {
        const game = byId.get(id);
        if (!game) throw new Error(`Requested id not found in fetched list: ${id}`);
        if (processedSet.has(id)) throw new Error(`Requested id already processed: ${id}`);
        return game;
      })
    : games.filter((g) => g && g.id && !processedSet.has(g.id)).slice(0, 5);

  if (batch.length === 0) {
    return null;
  }

  const part = computeNextPartNumber(csvoutputDir, yearMonth);
  const outPath = path.join(csvoutputDir, `articles_${yearMonth}_part${part}.csv`);

  const header = ['タイトル', 'ゲームタイトル', '説明', '本文', 'ジャンル', '評価', '画像URL', 'ステータス', '発売日', 'タグ', 'アフィリエイトリンク'];

  const records = batch.map((game) => {
    const inferredGenre = tpl.inferGenre(game);
    const tags = tpl.buildTags(game, inferredGenre);
    const rating = 7 + (tpl.hashStringToInt(String(game.id)) % 3); // 7-9
    const description = tpl.normalizeSpaces(game.description) || `${tpl.normalizeSpaces(game.circle)}の作品です。発売日: ${tpl.normalizeSpaces(game.releaseDate)}。`;

    const content = ensureBodyLengthWithinRange(tpl.buildContent(game, inferredGenre, tags), game.id);

    return {
      title: `【${inferredGenre}】${tpl.normalizeSpaces(game.title)} 攻略・レビュー`,
      gameTitle: tpl.normalizeSpaces(game.title),
      description,
      content,
      genre: inferredGenre,
      rating,
      imageUrl: tpl.normalizeSpaces(game.imageUrl),
      status: 'draft',
      releaseDate: tpl.normalizeSpaces(game.releaseDate),
      tags: tags.join(','),
      affiliateLink: tpl.normalizeSpaces(game.dlsiteUrl || `https://www.dlsite.com/maniax/work/=/product_id/${game.id}.html`),
    };
  });

  const bodyChecks = validateBodyLengths(records);
  const anyBadBody = bodyChecks.some((x) => !x.ok);
  if (anyBadBody) {
    const detail = bodyChecks
      .filter((x) => !x.ok)
      .map((x) => `Record ${x.index}: length=${x.length}`)
      .join(', ');
    throw new Error(`Body length out of range: ${detail}`);
  }

  const lines = [];
  // headerは既存CSVに合わせて未クォート
  lines.push(header.join(','));
  for (const r of records) {
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

  // BOM付き・末尾空行なし
  const bom = '\uFEFF';
  fs.writeFileSync(outPath, bom + lines.join('\n'), 'utf8');

  // processed更新
  const nextProcessed = processedIds.slice();
  for (const g of batch) nextProcessed.push(g.id);
  fs.writeFileSync(processedPath, JSON.stringify(tpl.unique(nextProcessed), null, 2) + '\n', 'utf8');

  // 検証
  const validation = await validateCsvLikeImporter(outPath);

  return {
    outPath,
    part,
    batchIds: batch.map((g) => g.id),
    validation,
  };
}

async function main() {
  const yearMonth = process.argv[2];
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) usageAndExit();

  const idsFlagIndex = process.argv.indexOf('--ids');
  const explicitIds = idsFlagIndex >= 0 ? process.argv.slice(idsFlagIndex + 1).filter(Boolean) : null;

  const result = await generateNextBatch(yearMonth, { ids: explicitIds });
  if (!result) {
    console.log('No remaining games to process.');
    return;
  }

  console.log(`Wrote: ${result.outPath}`);
  console.log(`Processed +${result.batchIds.length}: ${result.batchIds.join(', ')}`);
  console.log(`CSV validation: rows=${result.validation.rows}, bad=${result.validation.bad}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { generateNextBatch };
