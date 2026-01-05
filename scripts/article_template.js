const crypto = require('crypto');

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
    const key = String(item ?? '').trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function hashStringToInt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
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

function formatPrice(price) {
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n)) return '-';
  return `${n}円`;
}

function buildResearchSection(research, variantKey) {
  if (!research || typeof research !== 'object') return null;

  const features = Array.isArray(research.features) ? research.features : [];
  const tips = Array.isArray(research.tips) ? research.tips : [];
  const pitfalls = Array.isArray(research.pitfalls) ? research.pitfalls : [];
  const pros = Array.isArray(research.pros) ? research.pros : [];
  const cons = Array.isArray(research.cons) ? research.cons : [];
  const angles = research.angles && typeof research.angles === 'object' ? research.angles : null;

  const pick = (arr, max) => arr.filter((x) => x && typeof x === 'string').slice(0, max);

  const lines = [];
  lines.push('## 調査メモ（要点）');

  const featPick = pick(features, 3);
  if (featPick.length) {
    lines.push('**仕様/特徴（一般化）**');
    for (const x of featPick) lines.push(`- ${x}`);
  }

  const tipsPick = pick(tips, 3);
  if (tipsPick.length) {
    lines.push('**攻略の定石（一般化）**');
    for (const x of tipsPick) lines.push(`- ${x}`);
  }

  const pitPick = pick(pitfalls, 2);
  if (pitPick.length) {
    lines.push('**詰まりやすい点（仮説）**');
    for (const x of pitPick) lines.push(`- ${x}`);
  }

  const proPick = pick(pros, 2);
  const conPick = pick(cons, 2);
  if (proPick.length || conPick.length) {
    lines.push('**感想の傾向（要点）**');
    for (const x of proPick) lines.push(`- 良い点: ${x}`);
    for (const x of conPick) lines.push(`- 気になる点: ${x}`);
  }

  if (angles) {
    const key = String(variantKey || '').trim();
    const val = angles[key] || angles['初心者向け'] || angles['時短/回収向け'] || angles['雰囲気/没入向け'];
    if (val) {
      lines.push('**この記事の切り口**');
      lines.push(`- ${val}`);
    }
  }

  // If we only have the header, treat as empty.
  if (lines.length <= 1) return null;
  return lines.join('\n');
}

function pickVariantKey(gameId, override) {
  if (override) return override;
  const keys = ['初心者向け', '時短/回収向け', '雰囲気/没入向け'];
  const h = hashStringToInt(String(gameId || 'seed'));
  return keys[h % keys.length];
}

function buildContent(game, inferredGenre, tags, options = {}) {
  const title = normalizeSpaces(game.title);
  const circle = normalizeSpaces(game.circle);
  const releaseDate = normalizeSpaces(game.releaseDate);
  const priceLabel = formatPrice(game.price);
  const dlsiteUrl = normalizeSpaces(game.dlsiteUrl || `https://www.dlsite.com/maniax/work/=/product_id/${game.id}.html`);

  const workFormat = normalizeSpaces(game.workFormat);
  const fileFormat = normalizeSpaces(game.fileFormat);
  const fileSize = normalizeSpaces(game.fileSize);
  const ageRating = normalizeSpaces(game.ageRating);
  const os = normalizeSpaces(game.os);
  const scenario = normalizeSpaces(game.scenario);
  const illustrator = normalizeSpaces(game.illustrator);
  const voiceActors = normalizeSpaces(game.voiceActors);

  const reviewAverage = game.reviewAverage;
  const reviewCount = game.reviewCount;
  const hasTrial = Boolean(game.hasTrial || game.trialUrl);
  const updateInfoText = normalizeSpaces(game.updateInfoText);
  const updateHistory = Array.isArray(game.updateHistory) ? game.updateHistory : [];

  const tagPreview = tags
    .filter((t) => t !== 'R18' && t !== 'PC' && t !== '同人ゲーム')
    .slice(0, 8)
    .join(' / ');

  const sections = [];

  sections.push('## ゲーム概要');
  sections.push(`『[${title}](${dlsiteUrl})』は${circle}によるR18向け同人作品です。発売日は${releaseDate}、価格は${priceLabel}。`);

  sections.push('## 作品情報（DLsite掲載の事実）');
  const avgNum = typeof reviewAverage === 'number' ? reviewAverage : Number(reviewAverage);
  const cntNum = typeof reviewCount === 'number' ? reviewCount : Number(reviewCount);
  const reviewLabel = (Number.isFinite(avgNum) || Number.isFinite(cntNum))
    ? `- レビュー: ${Number.isFinite(avgNum) ? `★${avgNum.toFixed(2)}` : ''}${Number.isFinite(cntNum) ? `（${cntNum}件）` : ''}`
    : null;
  const trialLabel = hasTrial ? '- 体験版: あり（DLsiteに体験版導線あり）' : null;
  const updateInfoLabel = updateInfoText ? `- 更新情報: ${updateInfoText}` : null;
  const latestUpdate = updateHistory.length ? updateHistory[0] : null;
  const updateHistoryLabel = latestUpdate && (latestUpdate.dateText || latestUpdate.title)
    ? `- 更新履歴（DLsite）: ${[latestUpdate.dateText, latestUpdate.title].filter(Boolean).join(' / ')}`
    : null;
  const facts = [
    circle ? `- サークル: ${circle}` : null,
    releaseDate ? `- 発売日: ${releaseDate}` : null,
    priceLabel ? `- 価格: ${priceLabel}` : null,
    workFormat ? `- 作品形式: ${workFormat}` : null,
    fileFormat ? `- ファイル形式: ${fileFormat}` : null,
    fileSize ? `- 容量: ${fileSize}` : null,
    os ? `- 対応OS: ${os}` : null,
    ageRating ? `- 年齢指定: ${ageRating}` : null,
    reviewLabel,
    trialLabel,
    updateInfoLabel,
    updateHistoryLabel,
    scenario ? `- シナリオ: ${scenario}` : null,
    illustrator ? `- イラスト: ${illustrator}` : null,
    voiceActors ? `- 声優: ${voiceActors}` : null,
    dlsiteUrl ? `- 公式ページ: ${dlsiteUrl}` : null,
  ].filter(Boolean);
  sections.push(facts.length ? facts.join('\n') : '- 公式ページ（DLsite）を参照');

  sections.push('## 事前に押さえるポイント');
  sections.push(
    [
      'まずはDLsiteページの紹介文・対応環境・同梱物（Readme/差分/セーブ互換）を確認し、想定されるプレイ体験の範囲を掴みましょう。',
      tagPreview ? `タグの傾向は「${tagPreview}」あたり。苦手な要素がある場合は、購入前にタグと説明文を照合するのが安全です。` : null,
    ]
      .filter(Boolean)
      .join('\n')
  );

  const variantKey = pickVariantKey(game.id, options.variantKey);
  const researchSection = buildResearchSection(options.research, variantKey);
  if (researchSection) {
    sections.push(researchSection);
  }

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

  while (content.length > targetMax) {
    const idx = content.lastIndexOf('\n\n## ');
    if (idx <= 0) break;
    const candidate = content.slice(0, idx);
    if (candidate.length < targetMin) break;
    content = candidate;
  }

  return content;
}

function buildRecordFromGame(game) {
  const inferredGenre = inferGenre(game);
  const tags = buildTags(game, inferredGenre);
  const rating = 7 + (hashStringToInt(String(game.id)) % 3);
  const description =
    normalizeSpaces(game.description) || `${normalizeSpaces(game.circle)}の作品です。発売日: ${normalizeSpaces(game.releaseDate)}。`;
  const content = buildContent(game, inferredGenre, tags, game && game.__templateOptions ? game.__templateOptions : undefined);

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
    affiliateLink: normalizeSpaces(game.dlsiteUrl || `https://www.dlsite.com/maniax/work/=/product_id/${game.id}.html`),
  };
}

function validateBodyLength(content) {
  const len = String(content || '').length;
  return { length: len, ok: len >= 800 && len <= 1200 };
}

function extractRJFromText(s) {
  const m = String(s || '').match(/RJ\d{6,}/i);
  return m ? m[0].toUpperCase() : null;
}

module.exports = {
  csvQuote,
  normalizeSpaces,
  unique,
  hashStringToInt,
  inferGenre,
  buildTags,
  buildContent,
  buildRecordFromGame,
  validateBodyLength,
  extractRJFromText,
  // Optional helpers
  pickVariantKey,
};
