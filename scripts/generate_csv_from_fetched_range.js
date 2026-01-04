/*
  Generate article CSVs (5 per file) from previously fetched game JSON files.
  - Input: csvoutput/fetched_games_YYYY-MM.json
  - Output: csvoutput/articles_YYYY-MM_partN.csv (UTF-8 BOM, CRLF, no trailing empty row)
  - Updates: csvoutput/processed_games.json (array of RJ strings)

  Usage (PowerShell):
    node scripts/generate_csv_from_fetched_range.js 2025 1 11
*/

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'csvoutput');
const HEADER = [
  'タイトル',
  'ゲームタイトル',
  '説明',
  '本文',
  'ジャンル',
  '評価',
  '画像URL',
  'ステータス',
  '発売日',
  'タグ',
  'アフィリエイトリンク',
].join(',');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function safeStr(v) {
  return (v == null) ? '' : String(v);
}

function csvEscape(value) {
  const s = safeStr(value);
  const needs = /[\r\n,"]/.test(s);
  if (!needs) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function stableHash(str) {
  // small deterministic hash for variations
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, seed) {
  if (!arr.length) return '';
  return arr[seed % arr.length];
}

function normalizeGenre(raw) {
  const s = safeStr(raw).trim();
  if (!s) return 'その他';
  const candidates = ['RPG', 'アドベンチャー', 'シミュレーション', 'アクション', 'パズル', 'その他'];
  // direct hit
  if (candidates.includes(s)) return s;
  // heuristics
  const lower = s.toLowerCase();
  if (lower.includes('rpg')) return 'RPG';
  if (lower.includes('adv') || s.includes('アド')) return 'アドベンチャー';
  if (s.includes('シミュ') || lower.includes('sim')) return 'シミュレーション';
  if (s.includes('アクション') || lower.includes('action')) return 'アクション';
  if (s.includes('パズル') || lower.includes('puzzle')) return 'パズル';
  return 'その他';
}

function buildTags(game, genre) {
  const title = safeStr(game.title);
  const tags = [];

  // genre-ish tags (DLsite-ish wording, avoid made-up proper nouns)
  const byGenre = {
    'RPG': ['RPG', 'ファンタジー', 'バトル', '探索'],
    'アドベンチャー': ['アドベンチャー', '恋愛', 'ミステリー', 'シリアス'],
    'シミュレーション': ['シミュレーション', '育成', '管理/経営', '日常/生活'],
    'アクション': ['アクション', 'バトル', '爽快', '反射神経'],
    'パズル': ['パズル', '謎解き', '頭脳戦', '短編'],
    'その他': ['短編', '日常/生活', 'コメディ', 'シリアス'],
  };

  const base = byGenre[genre] || byGenre['その他'];
  for (const t of base) {
    if (tags.length >= 4) break;
    if (!tags.includes(t)) tags.push(t);
  }

  // keyword hints
  const hints = [
    { re: /学園|学校/, tag: '学園' },
    { re: /ダンジョン|迷宮/, tag: 'ダンジョン' },
    { re: /探索/, tag: '探索' },
    { re: /謎|ミステリー/, tag: 'ミステリー' },
    { re: /ホラー|怪談|呪い/, tag: 'ホラー' },
    { re: /SF|宇宙|未来/, tag: 'SF' },
    { re: /コメディ|ギャグ/, tag: 'ギャグ' },
    { re: /シリアス/, tag: 'シリアス' },
  ];
  for (const h of hints) {
    if (tags.length >= 5) break;
    if (h.re.test(title) && !tags.includes(h.tag)) tags.push(h.tag);
  }

  return tags.slice(0, 5).join(',');
}

function buildDescription(game, genre, score) {
  const title = safeStr(game.title);
  const circle = safeStr(game.circle);
  const hooks = {
    'RPG': '成長と探索の手応えが味わえる',
    'アドベンチャー': '読み進めるほど世界観に引き込まれる',
    'シミュレーション': '育成とやりくりの達成感が強い',
    'アクション': 'テンポよく遊べる爽快さが魅力の',
    'パズル': 'ひらめきが気持ちいい',
    'その他': '個性が光る',
  };
  const hook = hooks[genre] || hooks['その他'];

  // 50-100 chars target (Japanese chars). Keep concise.
  const parts = [];
  parts.push(hook + genre + '作品。');
  if (circle) parts.push(circle + '制作。');
  parts.push('攻略の要点と遊びどころを' + score + '/10視点でまとめました。');
  return parts.join('');
}

function buildMarkdown(game, genre, score, seed) {
  const title = safeStr(game.title);
  const dlUrl = safeStr(game.dlsiteUrl) || '';
  const circle = safeStr(game.circle) || '—';
  const releaseDate = safeStr(game.releaseDate) || '—';
  const priceNum = (typeof game.price === 'number' && Number.isFinite(game.price) && game.price > 0) ? game.price : null;
  const priceStr = priceNum == null ? '-' : (priceNum.toLocaleString('ja-JP') + '円');

  const openers = [
    '序盤で差がつくのは「情報整理」と「安全なリソース運用」です。',
    '最初にやるべきことを押さえると、以降の展開がぐっと楽になります。',
    '本作はテンポ良く進められる一方、要所で判断が問われます。',
  ];
  const midTips = [
    '中盤以降は「優先順位の見直し」と「無駄な寄り道の削減」が効きます。',
    '詰まりやすい場面では、選択肢を増やす行動（探索・装備更新）を先に。',
    '強化の方向性を一本に絞ると、難所の突破率が上がります。',
  ];
  const endTips = [
    'エンディング到達は「条件の取りこぼし防止」が最重要です。',
    '終盤は消耗戦になりがちなので、回復・移動・セーブの習慣化が鍵です。',
    '分岐がある場合は直前セーブを徹底し、回収効率を上げましょう。',
  ];

  const goodPoints = {
    'RPG': ['育成と探索が噛み合う設計', '戦闘と成長のリズムが良い', '達成感のある攻略導線'],
    'アドベンチャー': ['文章と演出で惹きつける', '伏線の置き方が丁寧', 'キャラクターの魅力が出る'],
    'シミュレーション': ['試行錯誤の幅がある', '数字の伸びが気持ちいい', 'やり込みの導線が豊富'],
    'アクション': ['操作の手応えが良い', 'テンポが崩れにくい', '繰り返し遊びたくなる'],
    'パズル': ['ルールが分かりやすい', 'ひらめきの快感がある', '短時間でも満足感が出る'],
    'その他': ['尖ったコンセプト', '雰囲気づくりが上手い', '手軽に楽しめる'],
  };

  const cautionPoints = {
    'RPG': ['装備更新を怠ると一気に苦しくなる', '稼ぎ過多になりやすいので区切りを決める'],
    'アドベンチャー': ['選択肢の意味を読み違えると遠回りになる', 'メモを取ると回収が楽'],
    'シミュレーション': ['初期投資を急ぎすぎると資金繰りが破綻しやすい', '目標を小さく刻むと安定'],
    'アクション': ['連打よりも回避・間合いが重要', '無理に攻めず立て直す'],
    'パズル': ['手数が増えたら一度盤面をリセットして考える', '規則性を探す'],
    'その他': ['説明を飛ばすと理解に時間がかかる', '序盤はチュートリアルを丁寧に'],
  };

  const recommendFor = {
    'RPG': '育成や探索が好きで、コツコツ強くなる体験を求める人',
    'アドベンチャー': '物語や雰囲気重視で、読後感も大事にしたい人',
    'シミュレーション': '効率化や育成が好きで、最適解探しを楽しめる人',
    'アクション': '短時間でも手応えが欲しく、操作で上達したい人',
    'パズル': 'ひらめきで解く快感が好きで、サクッと遊びたい人',
    'その他': '定番に飽きて、ちょっと変わった体験を求める人',
  };

  const gPts = goodPoints[genre] || goodPoints['その他'];
  const cPts = cautionPoints[genre] || cautionPoints['その他'];

  const opener = pick(openers, seed);
  const mid = pick(midTips, seed >>> 3);
  const end = pick(endTips, seed >>> 6);

  const md = [
    `[` + title + `](` + dlUrl + `)`,
    '',
    '## ゲーム概要',
    `- ジャンル: ${genre}`,
    `- 制作: ${circle}`,
    `- 発売日: ${releaseDate}`,
    `- 価格: ${priceStr}`,
    `- 評価: ${score}/10`,
    '',
    '本作はタイトルから受ける印象どおり、プレイの軸がはっきりしたタイプです。' +
      'まずは「何を達成すると気持ちいいのか」を意識して触ると、迷いが減ります。',
    '',
    '## 攻略ポイント',
    '### 序盤の進め方',
    '- 目標を1つだけ決めて最短で到達する（寄り道は後回し）',
    '- 失敗しやすい行動をメモし、次の試行で潰す',
    '- 安全確保（回復/セーブ/資金）を優先して立ち回る',
    '',
    opener,
    '',
    '### 中盤以降の攻略',
    '- 難所は「準備→挑戦→振り返り」のループで突破する',
    '- 戦力/選択肢を増やせる要素（探索・強化・イベント）を優先する',
    '- 伸びない要素は切り捨て、得意な戦い方に寄せる',
    '',
    mid,
    '',
    '### エンディング到達のコツ',
    '- 重要フラグや条件を見落とさない（直前セーブが安定）',
    '- 終盤は消耗戦になりやすいので、回復手段の確保を最優先',
    '- 周回/回収があるなら「最短ルート」を先に作る',
    '',
    end,
    '',
    '## プレイレビュー',
    '### 良かった点',
    `- ${gPts[0]}`,
    `- ${gPts[1]}`,
    `- ${gPts[2]}`,
    '',
    '### 気になった点',
    `- ${cPts[0]}`,
    (cPts[1] ? `- ${cPts[1]}` : null),
    '',
    '## 総合評価',
    `- おすすめ度: ${score}/10`,
    `- おすすめ: ${recommendFor[genre] || recommendFor['その他']}`,
    '- プレイ時間目安: 2〜6時間（慣れると短縮）',
    '- コスパ: 価格とボリュームのバランスは「遊び方次第」。まずは序盤の手触りで合うか確認すると安心です。',
  ].filter((x) => x != null);

  return md.join('\n');
}

function inferScore(game) {
  const seed = stableHash(safeStr(game.id || game.rjCode || game.title || ''));
  return 7 + (seed % 3); // 7-9
}

function findNextPart(year, month) {
  const prefix = `articles_${year}-${pad2(month)}_part`;
  let max = 0;
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (!name.startsWith(prefix) || !name.endsWith('.csv')) continue;
    const m = name.match(/_part(\d+)\.csv$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sortByReleaseDesc(a, b) {
  const ad = safeStr(a.releaseDate);
  const bd = safeStr(b.releaseDate);
  if (ad && bd && ad !== bd) return bd.localeCompare(ad);
  // stable
  return safeStr(b.id || b.rjCode).localeCompare(safeStr(a.id || a.rjCode));
}

function main() {
  const args = process.argv.slice(2);
  const year = parseInt(args[0] || '2025', 10);
  const startMonth = parseInt(args[1] || '1', 10);
  const endMonth = parseInt(args[2] || '11', 10);
  if (!Number.isFinite(year) || !Number.isFinite(startMonth) || !Number.isFinite(endMonth)) {
    throw new Error('Usage: node scripts/generate_csv_from_fetched_range.js <year> <startMonth> <endMonth>');
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const processedPath = path.join(OUT_DIR, 'processed_games.json');
  const processed = new Set();
  if (fs.existsSync(processedPath)) {
    try {
      const v = loadJson(processedPath);
      if (Array.isArray(v)) {
        for (const x of v) processed.add(String(x));
      }
    } catch (e) {
      throw new Error('Failed to read processed_games.json: ' + (e && e.message ? e.message : e));
    }
  }

  const newlyProcessed = [];

  for (let month = startMonth; month <= endMonth; month++) {
    const mm = pad2(month);
    const fetchedPath = path.join(OUT_DIR, `fetched_games_${year}-${mm}.json`);
    if (!fs.existsSync(fetchedPath)) {
      throw new Error('Missing fetched file: ' + fetchedPath);
    }

    const gamesRaw = loadJson(fetchedPath);
    const games = (Array.isArray(gamesRaw) ? gamesRaw : []).slice().sort(sortByReleaseDesc);

    const targets = games.filter((g) => {
      const id = String(g && (g.id || g.rjCode) || '');
      return id && !processed.has(id);
    });

    console.log(`[${year}-${mm}] fetched=${games.length} unprocessed=${targets.length}`);
    if (targets.length === 0) continue;

    let part = findNextPart(year, month);
    for (let i = 0; i < targets.length; i += 5) {
      const chunk = targets.slice(i, i + 5);

      const lines = [HEADER];
      for (const game of chunk) {
        const id = safeStr(game.id || game.rjCode);
        const genre = normalizeGenre(game.genre);
        const score = inferScore(game);
        const seed = stableHash(id || safeStr(game.title));

        const title = `【${genre}】${safeStr(game.title)} 攻略・レビュー`;
        const desc = buildDescription(game, genre, score);
        const content = buildMarkdown(game, genre, score, seed);
        const tags = buildTags(game, genre);

        const row = [
          title,
          safeStr(game.title),
          desc,
          content,
          genre,
          score,
          safeStr(game.imageUrl),
          'draft',
          safeStr(game.releaseDate),
          tags,
          safeStr(game.dlsiteUrl),
        ].map(csvEscape).join(',');

        lines.push(row);

        if (id) {
          processed.add(id);
          newlyProcessed.push(id);
        }
      }

      const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
      const outName = `articles_${year}-${mm}_part${part}.csv`;
      const outPath = path.join(OUT_DIR, outName);
      fs.writeFileSync(outPath, csv, 'utf8');
      console.log(`WROTE ${outName} rows=${chunk.length}`);
      part += 1;
    }
  }

  // persist processed
  const processedArr = Array.from(processed);
  processedArr.sort();
  fs.writeFileSync(path.join(OUT_DIR, 'processed_games.json'), JSON.stringify(processedArr, null, 2), 'utf8');
  console.log(`UPDATED processed_games.json total=${processedArr.length} added=${newlyProcessed.length}`);
}

try {
  main();
} catch (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}
