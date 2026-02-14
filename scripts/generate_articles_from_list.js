const fs = require('fs');
const path = require('path');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function norm(value) {
  return String(value ?? '').trim();
}

function hashStringToInt(s) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick(list, seed, offset = 0) {
  if (!list.length) return '';
  const idx = (seed + offset) % list.length;
  return list[idx];
}

function detectGenre(game) {
  const workFormat = norm(game.workFormat);
  const genreRaw = norm(game.genre);
  const title = norm(game.title);
  const tags = Array.isArray(game.tags) ? game.tags.map(norm) : [];

  const combined = `${workFormat} ${genreRaw} ${title} ${tags.join(' ')}`;

  if (/RPG/i.test(combined) || /ロールプレイング|ローグ|ダンジョン/.test(combined)) return 'RPG';
  if (/アドベンチャー|ADV|ノベル|探索|ホラー/.test(combined)) return 'アドベンチャー';
  if (/シミュレーション|SLG|育成|経営|管理/.test(combined)) return 'シミュレーション';
  if (/アクション|ACT|格闘|シューティング|TPS|FPS/.test(combined)) return 'アクション';
  if (/パズル|脱出|謎解き/.test(combined)) return 'パズル';
  return 'その他';
}

function pickTags(game, seed) {
  const tags = Array.isArray(game.tags) ? game.tags.map(norm).filter(Boolean) : [];
  const blacklist = new Set(['R18', 'PC', '同人ゲーム']);
  const cleaned = tags.filter((t) => !blacklist.has(t));

  // prefer DLsite-like short tags
  const uniq = [];
  const seen = new Set();
  for (const t of cleaned) {
    if (seen.has(t)) continue;
    seen.add(t);
    uniq.push(t);
  }

  const out = [];
  const want = 4;
  for (let i = 0; i < uniq.length && out.length < want; i++) {
    const idx = (seed + i * 7) % uniq.length;
    const t = uniq[idx];
    if (!t) continue;
    // avoid very long tags
    if (t.length > 30) continue;
    if (out.includes(t)) continue;
    out.push(t);
  }

  // fallback if tags are sparse
  if (out.length < 3) {
    const genre = detectGenre(game);
    const fallbacksByGenre = {
      RPG: ['ファンタジー', 'バトル', 'ダンジョン', '育成'],
      アドベンチャー: ['探索', 'ホラー', 'ミステリー', '恋愛'],
      シミュレーション: ['日常/生活', '管理/経営', '育成', '同棲'],
      アクション: ['バトル', 'アクション', '格闘', '探索'],
      パズル: ['謎解き', '探索', '屋内', 'ミステリー'],
      その他: ['日常/生活', '恋愛', 'コメディ', 'シリアス'],
    };
    const fb = fallbacksByGenre[genre] || fallbacksByGenre['その他'];
    for (let i = 0; i < fb.length && out.length < 4; i++) {
      const t = fb[(seed + i) % fb.length];
      if (!out.includes(t)) out.push(t);
    }
  }

  return out.slice(0, 5).join(',');
}

function makeDescription(game, seed) {
  const title = norm(game.title);
  const circle = norm(game.circle);
  const genre = detectGenre(game);

  const hooks = [
    '要点を押さえた攻略の入口をまとめます。',
    '遊びどころと注意点を短く整理します。',
    '初見で迷いやすい点を中心に解説します。',
    'テンポ良く読めるレビュー＋攻略メモです。',
  ];
  const hook = pick(hooks, seed, 1);

  let base = `${circle}の「${title}」を、${genre}視点でレビュー。${hook}`;
  // 50-100 chars target (JP chars) — adjust gently
  if (base.length < 50) base += '購入前のチェックにもどうぞ。';
  if (base.length > 100) base = base.slice(0, 98) + '…';
  return base;
}

function makeBody(game, seed) {
  const title = norm(game.title);
  const circle = norm(game.circle);
  const genre = detectGenre(game);
  const dlsiteUrl = norm(game.dlsiteUrl);

  const playFocusByGenre = {
    RPG: ['ビルド', '探索', '戦闘テンポ', 'リソース管理'],
    アドベンチャー: ['分岐', '探索導線', '手掛かり', '演出'],
    シミュレーション: ['効率化', '管理', '周回', '成長'],
    アクション: ['操作', '当たり判定', '難所', 'リトライ性'],
    パズル: ['ヒント', '手順化', '詰み回避', '観察'],
    その他: ['遊び方', '導線', 'テンポ', 'やり込み'],
  };
  const focus = playFocusByGenre[genre] || playFocusByGenre['その他'];
  const f1 = pick(focus, seed, 2);
  const f2 = pick(focus, seed, 3);

  const pros = [
    '導入が早く、最初の目的が掴みやすい',
    '演出とテンポのバランスが良い',
    'リトライ前提でもストレスが溜まりにくい',
    '周回や収集のモチベが作りやすい',
    'UI/操作が素直で迷いにくい',
  ];
  const cons = [
    '説明が省略気味で、初見は手探りになりやすい',
    '中盤以降に難所が固まり、詰まりやすい場面がある',
    '最適解に寄ると作業感が出やすい',
    '一部の要素は好みが分かれやすい',
  ];

  const p1 = pick(pros, seed, 4);
  const p2 = pick(pros, seed, 5);
  const c1 = pick(cons, seed, 6);

  const tipsA = [
    'まずは操作とUIを一通り確認し、最短で目的地（目標）へ向かう導線を把握する',
    '序盤は無理に背伸びせず、手持ち資源（回復/所持金/アイテム）を温存して安定を作る',
    '詰まりそうなら「何がトリガーか」を切り分ける（場所/アイテム/条件/会話）',
    '演出を見逃しやすいので、メモやスクショで手掛かりを残す',
  ];
  const tipsB = [
    '中盤からは選択肢の優先順位を固定し、手順化して事故を減らす',
    'リトライ前提の箇所は、失敗理由を1つだけ潰す意識で進める',
    '分岐がありそうなら、手前でセーブを分けて回収を楽にする',
    '成長/強化があるタイプは、短い周回で稼ぐより「伸びやすい箇所」へ集中する',
  ];

  const t1 = pick(tipsA, seed, 7);
  const t2 = pick(tipsA, seed, 8);
  const t3 = pick(tipsB, seed, 9);
  const t4 = pick(tipsB, seed, 10);

  const score = 7 + (seed % 3); // 7..9
  const playtime = [
    '1〜2時間（短編としてまとまりが良い）',
    '2〜4時間（要素回収で伸びる）',
    '4〜6時間（周回・収集込み）',
  ];
  const pt = pick(playtime, seed, 11);

  // 800-1200 chars target — keep it compact but rich.
  return [
    '## ゲーム概要',
    `本作は${circle}の「[${title}](${dlsiteUrl})」。${genre}要素を軸にしつつ、${f1}と${f2}が遊びの手触りを左右します。最初に「何を達成すると進行なのか」を掴めると、以降の迷いが減ってテンポ良く楽しめます。`,
    '',
    '## 攻略ポイント',
    '### 序盤の進め方',
    `- ${t1}`,
    `- ${t2}`,
    '### 中盤以降の攻略',
    `- ${t3}`,
    `- ${t4}`,
    '### エンディング到達のコツ',
    '- 重要な分岐や難所の直前でセーブを分け、検証を高速化する',
    '- 詰まったら「条件不足」か「手順ミス」かを切り分け、1つずつ潰す',
    '',
    '## プレイレビュー',
    '### 良かった点',
    `- ${p1}`,
    `- ${p2}`,
    '### 気になった点',
    `- ${c1}`,
    '- 一本道でない場合、回収要素の見落としに注意（取り返しの有無を早めに確認）',
    '',
    '## 総合評価',
    `おすすめ度は${score}/10。${genre}としての軸が分かりやすく、短い時間でも「やり切った感」が出やすいタイプです。プレイ時間の目安は${pt}。購入前は作品ページの動作環境・容量・年齢指定などの基本情報も合わせて確認すると安心です。`,
  ].join('\n');
}

function escCsv(value) {
  let s = String(value ?? '');
  const needs = /[",\n\r]/.test(s);
  s = s.replace(/"/g, '""');
  return needs ? `"${s}"` : s;
}

function writeCsv(filePath, rows) {
  const headers = [
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
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escCsv(r[h] ?? '')).join(','));
  }

  const payload = Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
  fs.writeFileSync(filePath, Buffer.concat([BOM, payload]));
}

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function moveWithVersion(src, destDir) {
  mkdirp(destDir);
  const base = path.basename(src);
  let dest = path.join(destDir, base);
  if (!fs.existsSync(dest)) {
    fs.renameSync(src, dest);
    return dest;
  }

  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  for (let i = 2; i < 100; i++) {
    const candidate = path.join(destDir, `${stem}_v${i}${ext}`);
    if (!fs.existsSync(candidate)) {
      fs.renameSync(src, candidate);
      return candidate;
    }
  }
  throw new Error(`No free dest filename for ${base}`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = val;
      i++;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  const inJson = args.in;
  const ym = args.ym;
  const cutoff = args.cutoff;
  const per = Number(args.per ?? 5);
  const outPrefix = args.outPrefix;
  const backupDir = args.backupDir;

  if (!inJson || !ym || !cutoff || !outPrefix || !backupDir) {
    throw new Error(
      'Usage: node scripts/generate_articles_from_list.js --in <json> --ym YYYY-MM --cutoff YYYY-MM-DD --per 5 --outPrefix <prefix> --backupDir <dir>'
    );
  }

  if (!fs.existsSync(inJson)) throw new Error(`Missing input json: ${inJson}`);

  const games = JSON.parse(fs.readFileSync(inJson, 'utf8'));
  if (!Array.isArray(games)) throw new Error('Input json must be an array');

  const rows = games.map((g) => {
    const id = norm(g.id);
    const seed = hashStringToInt(id || `${g.title || ''}`);
    const title = norm(g.title);
    const genre = detectGenre(g);

    return {
      タイトル: `【${genre}】${title} 攻略・レビュー`,
      ゲームタイトル: title,
      説明: makeDescription(g, seed),
      本文: makeBody(g, seed),
      ジャンル: genre,
      評価: 7 + (seed % 3),
      画像URL: norm(g.imageUrl),
      ステータス: 'draft',
      発売日: norm(g.releaseDate),
      タグ: pickTags(g, seed),
      アフィリエイトリンク: norm(g.dlsiteUrl),
    };
  });

  const parts = [];
  for (let i = 0; i < rows.length; i += per) {
    parts.push(rows.slice(i, i + per));
  }

  const written = [];
  for (let i = 0; i < parts.length; i++) {
    const partNo = i + 1;
    const out = `${outPrefix}_part${partNo}.csv`;
    writeCsv(out, parts[i]);
    written.push(out);
  }

  const moved = [];
  for (const f of written) {
    const dest = moveWithVersion(f, backupDir);
    moved.push(dest);
  }

  console.log('SUMMARY', {
    ym,
    cutoff,
    input: inJson,
    total: rows.length,
    per,
    parts: parts.length,
    backupDir,
  });
  console.log('MOVED', moved.length);
  for (const p of moved) console.log(p);
}

main();
