const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

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

function csvQuote(value) {
  if (value === null || value === undefined) return '""';
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function normalizeSpaces(s) {
  return String(s ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item).trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
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
  return unique(ids);
}

function inferGenre(game) {
  const known = new Set(['RPG', 'アドベンチャー', 'シミュレーション', 'アクション', 'パズル', 'その他']);
  const raw = normalizeSpaces(game.genre);
  if (known.has(raw)) return raw;

  const title = String(game.title || '');
  if (/RPG/i.test(title)) return 'RPG';
  if (/(アドベンチャー|ADV)/i.test(title)) return 'アドベンチャー';
  if (/(シミュレーション|SLG)/i.test(title)) return 'シミュレーション';
  if (/(アクション|ACT)/i.test(title)) return 'アクション';
  if (/(パズル)/i.test(title)) return 'パズル';

  return 'その他';
}

function buildTags(game, inferredGenre) {
  const base = Array.isArray(game.tags) ? game.tags : [];
  const rawGenre = String(game.genre || '');

  // `genre`がタグ列っぽい場合があるため、空白区切りでタグ化
  const genreTokens = rawGenre
    .replace(/\uFEFF/g, '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const tags = unique([
    ...base,
    ...(inferredGenre && inferredGenre !== 'その他' ? [inferredGenre] : []),
    ...genreTokens,
  ]);

  // CSV上はカンマ区切りで格納されるので、タグにカンマが入っているものは除外
  return tags.filter((t) => !t.includes(','));
}

function hashStringToInt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function formatPrice(price) {
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n)) return '-';
  return `${n}円`;
}

function buildContent(game, inferredGenre, tags) {
  const title = normalizeSpaces(game.title);
  const circle = normalizeSpaces(game.circle);
  const releaseDate = normalizeSpaces(game.releaseDate);
  const priceLabel = formatPrice(game.price);
  const dlsiteUrl = normalizeSpaces(game.dlsiteUrl || `https://www.dlsite.com/maniax/work/=/product_id/${game.id}.html`);
  const desc = normalizeSpaces(game.description);

  const tagPreview = tags
    .filter((t) => t !== 'R18' && t !== 'PC' && t !== '同人ゲーム')
    .slice(0, 8)
    .join(' / ');

  const sections = [];

  sections.push('## ゲーム概要');
  sections.push(
    `『${title}』は${circle}によるR18向け同人作品です。発売日は${releaseDate}、価格は${priceLabel}。\n\nDLsite: ${dlsiteUrl}`
  );

  if (desc) {
    sections.push('## 公式説明（DLsite掲載文より）');
    sections.push('> ' + desc.replace(/\s+/g, ' '));
  }

  sections.push('## 事前に押さえるポイント');
  sections.push(
    [
      'まずはDLsiteページの紹介文・対応環境・同梱物（Readme/差分/セーブ互換）を確認し、想定されるプレイ体験の範囲を掴みましょう。',
      tagPreview ? `タグの傾向は「${tagPreview}」あたり。苦手な要素がある場合は、購入前にタグと説明文を照合するのが安全です。` : null,
    ]
      .filter(Boolean)
      .join('\n')
  );

  const genreTips = {
    RPG: [
      '## 攻略の考え方（RPG向け）',
      [
        'RPGは「装備・スキル・回復手段」の整備が最重要です。詰まりを感じたら、まずは手持ちの強化要素（装備更新、スキル取得、アイテム補充）を見直します。',
        'セーブ枠は分岐やボス前など“戻り点”を意識して複数用意。難所は短い区間に分けて試行回数を稼ぐと安定します。',
        '説明文にある通り、ノーミス進行を目指すなら安全行動（回復・退避・装備更新）を優先し、無理な突撃を避けるのがコツです。',
      ].join('\n'),
    ].join('\n\n'),
    'アドベンチャー': [
      '## 攻略の考え方（アドベンチャー向け）',
      [
        'アドベンチャーは「選択肢・既読管理・回収計画」が快適さを左右します。初回はテンポ優先で読み進め、2周目以降に分岐回収へ移るのがスムーズです。',
        '分岐がありそうな場面は“直前セーブ”を固定化。短編ほど、回収の順番を決めるだけで迷いが減ります。',
      ].join('\n'),
    ].join('\n\n'),
    'シミュレーション': [
      '## 攻略の考え方（シミュレーション向け）',
      [
        'シミュレーションは「初動の安定化→中盤の伸ばし方→終盤の詰め」の順に意識すると失速しづらいです。',
        'リソース（時間/資金/体力など）の使い道を記録し、同じ行動を繰り返すより“目的を決めて最短で回す”方が結果が安定します。',
      ].join('\n'),
    ].join('\n\n'),
    'アクション': [
      '## 攻略の考え方（アクション向け）',
      [
        'アクションは「被弾を減らす動き」を優先するのが近道です。まずは回避・距離取り・安全行動を固め、攻めは確実に当たるタイミングだけ狙います。',
        '難所は区間ごとに練習し、入力が安定するまで同じルートで再現性を作ると突破しやすくなります。',
      ].join('\n'),
    ].join('\n\n'),
    'パズル': [
      '## 攻略の考え方（パズル向け）',
      [
        'パズルは「条件整理→試行→検証」を短いサイクルで回すのがコツです。行き詰まったら、前提条件（制約・勝利条件）を紙に書き出すだけで視点が変わります。',
        '解法が複数ある場合、最短手数にこだわりすぎず“安定して再現できる解き方”を先に見つけると先へ進みやすいです。',
      ].join('\n'),
    ].join('\n\n'),
    'その他': [
      '## 進め方のヒント（汎用）',
      [
        'ジャンル情報が一意に取れない場合は、まずは同梱のReadmeや起動手順を確認し、推奨の遊び方（セーブ運用、回想/差分の入口など）を把握しましょう。',
        'テキスト主体の作品は、最初に設定（ウィンドウ/フルスクリーン、音量、既読スキップ）を整えるだけで体験が大きく改善します。',
      ].join('\n'),
    ].join('\n\n'),
  };

  sections.push(genreTips[inferredGenre] || genreTips['その他']);

  const optionalParagraphs = [
    '## メモ\n購入後はまず“戻れる地点”を作るためにセーブ枠を確保し、探索・選択・イベントの前後で区切って保存する運用がおすすめです。',
    '## 注意点\n作品によっては更新で仕様が変わることがあります。気になる場合は、購入ページの更新履歴や同梱テキストを確認してから進めると安心です。',
    '## まとめ\n紹介文とタグを踏まえ、気になる要素が合いそうならチェックしてみてください。詳細はDLsiteページで確認できます。',
  ];

  // 文字数が足りない場合のみ、重複しないよう追加
  let content = sections.join('\n\n');
  const targetMin = 820;
  const targetMax = 1200;

  const h = hashStringToInt(String(game.id));
  const rotated = optionalParagraphs
    .map((p, i) => ({ p, k: (h + i * 97) >>> 0 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);

  for (const p of rotated) {
    if (content.length >= targetMin) break;
    content += '\n\n' + p;
  }

  // 長すぎる場合は、最後のオプション段落から削る（本体は残す）
  while (content.length > targetMax) {
    const idx = content.lastIndexOf('\n\n## ');
    if (idx <= 0) break;
    const candidate = content.slice(0, idx);
    if (candidate.length < targetMin) break;
    content = candidate;
  }

  return content;
}

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

  const h = hashStringToInt(String(contextSeed || 'seed'));
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
    const inferredGenre = inferGenre(game);
    const tags = buildTags(game, inferredGenre);
    const rating = 7 + (hashStringToInt(String(game.id)) % 3); // 7-9
    const description = normalizeSpaces(game.description) || `${normalizeSpaces(game.circle)}の作品です。発売日: ${normalizeSpaces(game.releaseDate)}。`;

    const content = ensureBodyLengthWithinRange(buildContent(game, inferredGenre, tags), game.id);

    return {
      title: `【${inferredGenre}】${normalizeSpaces(game.title)} 攻略・レビュー`,
      gameTitle: normalizeSpaces(game.title),
      description,
      content,
      genre: inferredGenre,
      rating,
      imageUrl: normalizeSpaces(game.imageUrl),
      status: 'draft',
      releaseDate: normalizeSpaces(game.releaseDate),
      tags: tags.join(','),
      affiliateLink: 'https://www.dlsite.com/maniax/',
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
        .map(csvQuote)
        .join(',')
    );
  }

  // BOM付き・末尾空行なし
  const bom = '\uFEFF';
  fs.writeFileSync(outPath, bom + lines.join('\n'), 'utf8');

  // processed更新
  const nextProcessed = processedIds.slice();
  for (const g of batch) nextProcessed.push(g.id);
  fs.writeFileSync(processedPath, JSON.stringify(unique(nextProcessed), null, 2) + '\n', 'utf8');

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
