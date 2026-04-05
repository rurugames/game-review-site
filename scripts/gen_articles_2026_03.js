/**
 * 2026年3月 R18ゲーム記事一括生成スクリプト（index 20以降）
 * 実行: node scripts/gen_articles_2026_03.js
 */
const fs = require('fs');
const path = require('path');

const YEAR = '2026';
const MONTH = '03';
const OUTPUT_DIR = path.join(__dirname, '..', 'csvoutput');
const GAMES_FILE = path.join(OUTPUT_DIR, `new_games_${YEAR}-${MONTH}.json`);
const START_INDEX = 20;   // part1-4(index 0-19)は手動生成済み
const START_PART = 5;     // part5から開始

const BOM = '\uFEFF';
const HEADER = 'タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク\r\n';

function detectGenre(g) {
  const wf = (g.workFormat || '').toLowerCase();
  const tags = (g.tags || []).map(t => t.toLowerCase());
  if (wf.includes('rpg') || wf.includes('ロールプレイング') || tags.includes('rpg')) return 'RPG';
  if (wf.includes('アクション')) return 'アクション';
  if (wf.includes('シミュレーション')) return 'シミュレーション';
  if (wf.includes('アドベンチャー') || wf.includes('デジタルノベル')) return 'アドベンチャー';
  if (wf.includes('パズル')) return 'パズル';
  return 'その他';
}

function selectTags(g) {
  const exclude = new Set(['R18', 'PC', '同人ゲーム', 'アプリケーション', '日本語', '英語', '中国語(簡体字)', '中国語(繁体字)', '韓国語']);
  const filtered = (g.tags || []).filter(t => !exclude.has(t));
  return filtered.slice(0, 5).join(',');
}

function ratingFromReview(g) {
  if (g.reviewAverage >= 4.5) return 9;
  if (g.reviewAverage >= 4.0) return 8;
  if (g.reviewAverage >= 3.5) return 7;
  if (g.reviewAverage) return 7;
  return 7;
}

function fmtPrice(p) {
  if (!p && p !== 0) return '-';
  return p.toLocaleString('ja-JP') + '円';
}

function reviewStr(g) {
  if (g.reviewAverage && g.reviewCount) return `★${g.reviewAverage}（${g.reviewCount}件）`;
  return null;
}

function trialStr(g) {
  return g.hasTrial ? '体験版あり。' : '';
}

function voiceStr(g) {
  return g.voiceActors ? `声優：${g.voiceActors}。` : '';
}

function genreTitle(genre) {
  return `【${genre}】`;
}

function generateArticle(g) {
  const genre = detectGenre(g);
  const rv = reviewStr(g);
  const rvText = rv ? `DLsiteでの評価は${rv}。` : '';
  const trialText = trialStr(g);
  const voiceText = voiceStr(g);
  const price = fmtPrice(g.price);
  const dlUrl = g.dlsiteUrl || `https://www.dlsite.com/maniax/work/=/product_id/${g.id}.html`;
  const circle = g.circle || '-';
  const fileSize = g.fileSize ? `ファイルサイズは${g.fileSize}。` : '';
  const updateText = g.updateInfoDate ? `${g.updateInfoDate}に更新情報あり。` : '';

  // descriptionから重要な情報を抽出（最初の100文字）
  const rawDesc = (g.description || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const shortDesc = rawDesc.length > 120 ? rawDesc.substring(0, 120) + '…' : rawDesc;

  const content = `## ゲーム概要
[${g.title}](${dlUrl})は、${circle}制作のR18同人ゲームです。${shortDesc ? shortDesc + ' ' : ''}${fileSize}${trialText}${voiceText}${rvText}

## 攻略ポイント

### 序盤の進め方
ゲーム開始後まずは操作方法とゲームシステムの基本を理解しましょう。${g.hasTrial ? '体験版でゲームの感触を把握してから製品版に進むことを推奨します。' : ''}各コマンドやUI要素を確認しながら序盤を進めてください。${genre === 'RPG' ? '序盤はメインシナリオを追いながら、フィールドの基本的な探索を行いましょう。' : genre === 'アクション' ? '序盤は基本操作に慣れることを優先し、無理に難しいステージへ進まないことが大切です。' : genre === 'シミュレーション' ? 'まずは基本のゲームサイクルを理解して、最初の目標達成を目指しましょう。' : 'まずはストーリーの導入部分を楽しみながら、ゲームの世界観に慣れてください。'}

### 中盤以降の攻略
ゲームの核心となるシステムが解放される中盤以降は、${genre === 'RPG' ? '各エリアの探索とイベント回収を丁寧に行いながらメインシナリオを進めましょう。こまめなセーブが重要です。' : genre === 'アクション' ? '敵のパターンを覚えて効率的な攻略ルートを確立することが重要です。' : genre === 'シミュレーション' ? '効率的なリソース管理とアップグレードの優先順位を考えながら目標達成を目指しましょう。' : '選択肢やルート分岐を意識しながら、全シーンのコンプリートを目指して進めましょう。'}各コンテンツを丁寧に消化することで充実したプレイ体験が得られます。

### エンディング到達のコツ
${genre === 'RPG' || genre === 'アドベンチャー' ? 'セーブ機能を活用して複数のルートやエンディングを確認することをおすすめします。全CG・シーンのコンプリートを目標にプレイすると満足度が高まります。' : genre === 'シミュレーション' ? '最終目標の達成条件を把握した上で効率的なプレイを心がけましょう。繰り返しプレイで全コンテンツを解放できます。' : '最終ステージへの道筋を把握してから挑戦することで、スムーズにエンディングに到達できます。'}

## プレイレビュー

### 良かった点
${rv ? `${rv}という評価が示す通り、` : ''}${circle}による本作は${genre}ジャンルとして${g.price <= 330 ? '低価格帯でコスパの良い' : g.price >= 1500 ? '高品質な' : ''}作品です。${voiceText}${g.workFormat && g.workFormat.includes('音声') ? '音声付きのシーン演出が没入感を高めています。' : ''}${fileSize}${g.hasTrial ? '体験版で購入前に内容を確認できる点が親切です。' : ''}${updateText}

### 気になった点
${!rv ? '発売直後のためレビューが未蓄積で客観的な品質確認が難しい状態です。' : rv && g.reviewCount < 10 ? 'レビュー件数がまだ少なめのため、評価の信頼性は今後積み上がっていく段階です。' : ''}購入前に${g.hasTrial ? '体験版での動作確認と' : ''}ゲーム内容を把握した上で、嗜好に合うかどうかをご確認ください。

## 総合評価
${circle}制作の${genre}ゲームとして${price}で提供されています。${rv ? `${rv}の評価が示す通り、` : ''}${genre}ジャンルを楽しみたい方${g.hasTrial ? 'は体験版で確認後に' : 'は'}購入を検討してください。${g.price <= 330 ? '手頃な価格設定で気軽に試せる作品です。' : g.price >= 2000 ? '価格に見合うボリュームと品質が期待できます。' : 'コスパの良い選択肢です。'}評価：${ratingFromReview(g)}/10`;

  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function generateDescription(g) {
  const rv = reviewStr(g);
  const genre = detectGenre(g);
  const trialText = g.hasTrial ? '体験版あり。' : '';
  const rawDesc = (g.description || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const shortDesc = rawDesc.length > 60 ? rawDesc.substring(0, 60) + '…' : rawDesc;
  let desc = `${circle_desc(g)}制作の${genre}ゲーム。${shortDesc ? shortDesc + ' ' : ''}${g.price ? g.price.toLocaleString('ja-JP') + '円。' : ''}${trialText}${rv ? rv + '。' : ''}`;
  if (desc.length > 100) desc = desc.substring(0, 97) + '…';
  return desc;
}

function circle_desc(g) {
  return g.circle || 'サークル';
}

function csvField(value) {
  // Escape for CSV: wrap in quotes, double any internal quotes
  const str = String(value == null ? '' : value);
  return '"' + str.replace(/"/g, '""') + '"';
}

function buildRow(g) {
  const genre = detectGenre(g);
  const rating = ratingFromReview(g);
  const tags = selectTags(g);
  const dlUrl = g.dlsiteUrl || `https://www.dlsite.com/maniax/work/=/product_id/${g.id}.html`;
  const title = `${genreTitle(genre)}${g.title} 攻略・レビュー`;
  const description = generateDescription(g);
  const content = generateArticle(g);

  const fields = [
    csvField(title),
    csvField(g.title),
    csvField(description),
    csvField(content),
    csvField(genre),
    rating,
    csvField(g.imageUrl || ''),
    csvField('draft'),
    csvField(g.releaseDate || ''),
    csvField(tags),
    csvField(dlUrl)
  ];
  return fields.join(',');
}

function writePartCsv(games, partNum) {
  const filename = `articles_${YEAR}-${MONTH}_part${partNum}.csv`;
  const filepath = path.join(OUTPUT_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    console.log(`SKIP: ${filename} already exists`);
    return false;
  }

  let content = BOM + HEADER;
  for (const g of games) {
    content += buildRow(g) + '\r\n';
  }
  // Remove trailing newline (add only one CRLF at end)
  content = content.replace(/\r\n$/, '\r\n');
  
  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`Written: ${filename} (${games.length} games)`);
  return true;
}

// Main
const allGames = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
const games = allGames.slice(START_INDEX);  // index 20 onwards

console.log(`Processing ${games.length} games starting from index ${START_INDEX}`);

let partNum = START_PART;
let i = 0;
while (i < games.length) {
  const batch = games.slice(i, i + 5);
  writePartCsv(batch, partNum);
  partNum++;
  i += 5;
}

console.log(`Done. Total parts written: ${partNum - START_PART}`);
