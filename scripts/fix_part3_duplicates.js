const fs = require('fs');
const path = require('path');

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
        started = true;
        if (ch === '"') { inQuotes = true; i++; continue; }
      }

      if (inQuotes) {
        if (ch === '"') {
          if (chNext === '"') { field += '"'; i += 2; continue; }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      } else {
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
        field += ch;
        i++;
        continue;
      }
    }

    if (i >= len && (started || field.length > 0 || row.length > 0)) {
      row.push(field);
    }

    if (row.length === 1 && row[0] === '' && i >= len) break;
    rows.push(row);
  }
  return rows;
}

function quoteField(s) {
  if (s === undefined || s === null) s = '';
  return '"' + String(s).replace(/"/g, '""') + '"';
}

const filePath = path.resolve(__dirname, '..', 'csvoutput', 'articles_2025-12_part3.csv');
const text = fs.readFileSync(filePath, 'utf8');
const rows = parseCSV(text);
if (!rows || rows.length === 0) {
  console.error('no rows'); process.exit(1);
}
const header = rows[0];
const bodyIdx = header.indexOf('本文');
const titleIdx = header.indexOf('ゲームタイトル');
if (bodyIdx === -1) { console.error('no 本文 col'); process.exit(1); }

// generic repeated block to detect
const repeated = '## 追加レビュー\n\n本作の細部を掘り下げると、設計上の工夫やシステムの互換性、ユーザー体験に繋がる要素が多く存在します。具体的な攻略手順や推奨ビルド、周回プレイのポイントについても触れておきます。';

// tailored replacements per game title (ゲームタイトル)
const replacements = {
  '影の王国 遺失の章': '## 追加レビュー\n\n本作は戦術性と探索が密接に絡む設計で、装備やスキルの組み合わせ次第で攻略の幅が大きく変わります。序盤は耐久寄りの盾役と安定回復を確保し、探索で得た素材を優先して武具強化に回すと周回が楽になります。中盤以降はボスの行動パターンに応じた編成切替が重要で、属性耐性の弱点を突くことで戦闘時間を短縮できます。推奨ビルドの一例としては、範囲攻撃を補助する補助役＋単体高火力のアタッカーを組み合わせる構成や、状態異常で敵の行動を制限するビルドが有効です。周回プレイでは、素材収集ルートと仲間のスキル解放の最短経路を確立しておくと効率的に強化が進みます。',
  '夜明けの街経営': '## 追加レビュー\n\n本作は生活基盤の整備と住民満足度の管理が核になる設計で、序盤は飲食・住宅・雇用を優先して安定した税収基盤を築くのが近道です。中長期的には住民のニーズに合わせた施設配置とイベント運営が街の魅力を継続的に高め、親密度の高い住民から得られる特典が運営効率に直結します。効率的な進め方としては、初期に得られる収益源を中心に必要設備を順次整備し、余剰資金で文化・娯楽要素を拡充して誘客を図る方法が安定します。難局面では専用施設を早めに整備すると安定化しやすいです。',
  '地下迷宮ランナー': '## 追加レビュー\n\n本作は瞬発力と正確なルート構築を要求するため、操作設定の最適化とギミック把握がスコア向上の鍵になります。練習時は特定ステージの最短経路をセグメント毎に分けて習得し、タイミング調整を繰り返すと安定したランが身につきます。隠し経路の探索はスコアや報酬に直結するため、リスクと報酬のバランスを見極めたルート選定が重要です。スコアアタックでは、速度優先区間と安全優先区間の切替を明確にする立ち回りが有効です。',
  '夢見る歯車塔': '## 追加レビュー\n\n本作は観察力と発想の転換が攻略を楽しくする設計で、環境に隠されたヒントを丁寧に拾っていくことが攻略の核心です。複数解法を許容するギミックが多く、局所動作を分解して組み合わせる思考法が有効です。チャレンジやスコアアタックでは最小手数の手順確立が記録更新に直結します。',
  '深海の手紙': '## 追加レビュー\n\n短編の情緒と選択肢の余韻を活かした作品で、会話や選択肢が物語の印象を大きく左右します。主要な分岐を意図的に外して別視点のイベントを回収すると新たな解釈が得られ、複数周で深みが増します。BGMや環境描写の細部に注目すると、伏線の回収構造がより明確に見えてきます。'
};

let changed = false;
for (let r = 1; r < rows.length; r++) {
  const rec = rows[r];
  const body = rec[bodyIdx] || '';
  const title = (titleIdx !== -1) ? (rec[titleIdx] || '') : '';
  const key = Object.keys(replacements).find(k => title.indexOf(k) !== -1);
  if (!key) continue;
  const rep = replacements[key];

  // create a regex to match two or more consecutive occurrences of the generic block
  const repEsc = repeated.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const multiRe = new RegExp('(?:' + repEsc + '\\s*){2,}', 'g');

  if (multiRe.test(body)) {
    const newBody = body.replace(multiRe, rep);
    rec[bodyIdx] = newBody;
    changed = true;
    console.log('Updated record', r, 'title=', title);
  }
}

if (changed) {
  // rebuild CSV
  const out = [];
  out.push(header.map(quoteField).join(','));
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r].map(f => quoteField(f));
    out.push(row.join(','));
  }
  fs.writeFileSync(filePath, out.join('\n'), 'utf8');
  console.log('File updated:', filePath);
} else {
  console.log('No changes needed');
}
