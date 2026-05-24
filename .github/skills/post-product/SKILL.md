# 商品紹介投稿スキル

チャット欄からアフィリエイトリンクのURLと商品ページの全文をコピペして、`/products` に商品紹介を追加します。

## 使い方

このファイルを添付（またはスキル名「post-product」を指定）してから、以下の形式で投稿内容を伝えてください。

---

### 入力フォーマット

```
【アフィリエイトリンク】
https://www.dlsite.com/maniax/work/=/product_id/RJxxxxxxxx.html

【ページ全文（コピペ）】
（ここにDLsite等の商品ページの全文をそのまま貼り付ける）
```

---

## エージェントの動作手順

1. **入力を解析**
   - `【アフィリエイトリンク】` の直後の行からURLを抽出する
   - `【ページ全文】` の直後の内容からタイトル・説明・サムネイルURLを抽出する

2. **タイトルの決定**
   - ページ全文の `<title>` タグ、または最初の `<h1>` から作品名を抜き出す
   - 見つからない場合はURLのパスから推測する

3. **本文（body）の生成**
   - ページ全文から以下を抽出してMarkdown形式の本文を生成する:
     - 作品概要・あらすじ（100〜300字程度）
     - ジャンル・タグ（DLsiteなら「ジャンル」欄）
     - サークル名・開発元
     - 価格・発売日
   - 生成する本文の構成（テンプレ）:
     ```markdown
     ## 作品概要
     （ここに概要）

     ## 基本情報
     - **サークル**: 
     - **ジャンル**: 
     - **発売日**: 
     - **価格**: 

     ## 感想・レビュー
     （ページ内のユーザー評価やキャッチコピーを元に一言）
     ```

4. **サムネイルURLの抽出**
   - ページ全文内の `og:image` または作品メイン画像のURLを探す
   - DLsiteなら `img.dlsite.jp` のURLを優先する

5. **APIエンドポイントへPOST**
   - `POST /products` を `run_in_terminal` で curl 実行する
   - **管理者セッションが必要**なため、通常はローカルサーバーで以下のスクリプトを実行する:

   ```powershell
   # c:\Users\hider\mytool で実行
   node scripts/post_product.js `
     --title  "タイトル" `
     --body   "本文（Markdown）" `
     --link   "https://..." `
     --image  "https://..."
   ```

   スクリプトが存在しない場合は先に作成してから実行する。

6. **確認**
   - 実行後に `http://localhost:3000/products` へアクセスして投稿を確認するよう案内する

---

## スクリプト自動生成（初回のみ）

`scripts/post_product.js` が存在しない場合、エージェントが自動生成します。  
スクリプトは MongoDB に直接接続して `Product` ドキュメントを insert します。

```javascript
// scripts/post_product.js のひな形
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');

// CLI引数パース
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => {
    if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const admin = await User.findOne().sort({ createdAt: 1 }).lean();
  const product = new Product({
    title: args.title,
    body: args.body,
    affiliateLink: args.link,
    imageUrl: args.image || undefined,
    author: admin._id,
    status: 'published',
  });
  await product.save();
  console.log('投稿完了:', product._id.toString());
  await mongoose.disconnect();
})();
```
