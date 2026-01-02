const dlsiteService = require('./services/dlsiteService');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

async function generateArticles(year, month, count) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎮 R18 PC同人ゲーム記事生成ツール`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📅 対象期間: ${year}年${month}月`);
  console.log(`📊 生成件数: ${count}件`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // ステップ1: DLsiteからゲーム情報を取得
    console.log('【ステップ1】DLsiteからゲーム情報を取得中...\n');
    const games = await dlsiteService.fetchGamesByMonth(year, month);
    
    if (!games || games.length === 0) {
      console.error('❌ ゲーム情報が取得できませんでした');
      return;
    }
    
    // 指定件数に制限
    const targetGames = games.slice(0, count);
    console.log(`\n✅ ${targetGames.length}件のゲーム情報を取得しました\n`);
    
    // ステップ2: 記事を生成
    console.log('【ステップ2】記事を生成中...\n');
    const articles = [];
    
    for (let i = 0; i < targetGames.length; i++) {
      const game = targetGames[i];
      console.log(`[${i + 1}/${targetGames.length}] ${game.title.substring(0, 40)}...`);
      
      const article = generateArticle(game);
      articles.push(article);
    }
    
    console.log(`\n✅ ${articles.length}件の記事を生成しました\n`);
    
    // ステップ3: CSVファイルに出力
    console.log('【ステップ3】CSVファイルに出力中...\n');
    const outputFile = `articles_${year}-${String(month).padStart(2, '0')}.csv`;
    
    const csvWriter = createCsvWriter({
      path: outputFile,
      header: [
        { id: 'title', title: 'タイトル' },
        { id: 'gameTitle', title: 'ゲームタイトル' },
        { id: 'description', title: '説明' },
        { id: 'content', title: '本文' },
        { id: 'genre', title: 'ジャンル' },
        { id: 'rating', title: '評価' },
        { id: 'imageUrl', title: '画像URL' },
        { id: 'status', title: 'ステータス' }
      ],
      encoding: 'utf8'
    });
    
    await csvWriter.writeRecords(articles);
    
    console.log(`✅ CSVファイルを出力しました: ${outputFile}\n`);
    console.log(`${'='.repeat(60)}`);
    console.log(`🎉 完了！`);
    console.log(`${'='.repeat(60)}\n`);
    console.log(`次のステップ:`);
    console.log(`1. ${outputFile} を確認`);
    console.log(`2. 必要に応じて内容を編集`);
    console.log(`3. http://localhost:3000/csv からインポート\n`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error.stack);
  }
}

function generateArticle(game) {
  const { id, title, circle, genre, price, imageUrl, description } = game;
  
  // 評価を生成（7-9の範囲、平均8程度）
  const rating = Math.floor(Math.random() * 3) + 7;
  
  // 記事タイトル
  const articleTitle = `【${genre}】${title} 攻略・レビュー`;
  
  // 説明文（50-100文字）
  const articleDescription = description || 
    `${circle}が贈る${genre}ジャンルのR18同人ゲーム。独特の世界観と充実したゲームシステムが魅力の作品です。`;
  
  // 本文を生成
  const content = generateArticleContent(game, rating);
  
  return {
    title: articleTitle,
    gameTitle: title,
    description: articleDescription,
    content: content,
    genre: genre,
    rating: rating,
    imageUrl: imageUrl || '',
    status: 'draft'
  };
}

function generateArticleContent(game, rating) {
  const { title, circle, genre, price } = game;
  const priceLabel = Number.isFinite(price) ? `${price}円` : '-';
  
  return `## ゲーム概要

${title}は、${circle}によって制作された${genre}ジャンルのR18同人ゲームです。

本作品は${genre}の要素を取り入れつつ、独自のゲームシステムと魅力的なキャラクターが特徴となっています。プレイヤーは様々なシチュエーションを楽しみながら、物語を進めていくことができます。

価格は${priceLabel}で、ボリュームと内容のバランスが取れた作品となっています。

## 攻略ポイント

### 序盤の進め方

ゲーム開始時は、まずチュートリアルをしっかりと確認することをおすすめします。基本的な操作方法やシステムの理解が、スムーズな攻略につながります。

序盤は以下の点に注意しましょう：
- 基本的な操作に慣れる
- リソースの管理方法を把握する
- セーブポイントを活用する

### 中盤以降の攻略

中盤に入ると、より複雑な選択肢や分岐が登場します。効率的に進めるためには：
- 各キャラクターのルートを確認
- 重要なアイテムを見逃さない
- 定期的にセーブデータを複数保持する

### エンディング到達のコツ

本作品には複数のエンディングが用意されています。全てのエンディングを見るためには：
- 選択肢による分岐を把握する
- 回収要素をコンプリートする
- 攻略情報を参考にする

## プレイレビュー

### 良かった点

**ゲームシステム**
${genre}ならではのシステムがよく練られており、飽きずにプレイできます。操作性も良好で、ストレスなく進められます。

**ストーリーとキャラクター**
魅力的なキャラクターと、引き込まれるストーリー展開が特徴です。各キャラクターの個性が活かされており、感情移入しやすい作りになっています。

**グラフィックと演出**
ビジュアル面でも高いクオリティを誇り、イベントCGやエフェクトが丁寧に作り込まれています。

### 気になった点

バランス調整については若干の改善余地があります。特定の場面で難易度が急上昇することがあるため、初心者の方は攻略情報を参照することをおすすめします。

また、一部のシステムについては説明が不足している箇所があり、試行錯誤が必要な場面もあります。

## 総合評価

総合評価: **${rating}/10点**

${circle}の${title}は、${genre}ジャンルが好きな方には特におすすめできる作品です。充実したゲームシステムと魅力的なキャラクター、そして丁寧に作り込まれたビジュアルが高く評価できます。

${rating >= 8 ? 
  'このジャンルのファンであれば、間違いなく楽しめる高品質な作品です。' : 
  'いくつか改善の余地はありますが、全体的には楽しめる内容となっています。'}

プレイ時間は個人差がありますが、すべてのエンディングを見るには15-20時間程度を見込んでおくとよいでしょう。

${genre}ジャンルに興味がある方、${circle}の作品が好きな方には特におすすめです。`;
}

// スクリプトとして実行された場合
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('使用方法: node generate-csv.js <年> <月> [件数]');
    console.log('例: node generate-csv.js 2025 12 10');
    process.exit(1);
  }
  
  const year = parseInt(args[0]);
  const month = parseInt(args[1]);
  const count = args[2] ? parseInt(args[2]) : 50;
  
  generateArticles(year, month, count);
}

module.exports = { generateArticles };
