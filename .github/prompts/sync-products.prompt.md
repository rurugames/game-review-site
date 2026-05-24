---
mode: agent
tools:
  - run_in_terminal
  - read_file
  - create_file
---

# sync-products — ローカル商品レビューを本番へ反映

商品レビューを本番 Atlas DB へ反映するためのプロンプトです。

## 状況別の対応フロー

### ケース A: `.env` が既に Atlas URI を向いている場合（通常）

ローカルサーバーも Atlas を使っているため、**追加した時点で本番に反映済み**です。
確認のみ行います:

```powershell
node -e "
require('dotenv').config();
const {MongoClient}=require('mongodb');
(async()=>{
  const c=new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const n=await c.db('game-review-site').collection('products').countDocuments();
  console.log('本番 products 件数:', n);
  await c.close();
})();
"
```

### ケース B: ローカル MongoDB（localhost）から Atlas へ同期する場合

```powershell
node scripts/sync_products_local_to_prod.js
```

#### 環境変数でローカル URI を明示する場合:

```powershell
$env:LOCAL_MONGODB_URI = "mongodb://localhost:27017/game-review-site"
node scripts/sync_products_local_to_prod.js
```

### ケース C: チャットで生成したレビューを直接投稿する場合

1. 本文を一時ファイルに書き出す:

```powershell
@"
（ここに本文を貼り付け）
"@ | Out-File -FilePath "$env:TEMP\product_body_tmp.txt" -Encoding utf8 -NoNewline
```

2. スクリプトで投稿する:

```powershell
node scripts/post_product.js `
  --title  "<タイトル>" `
  --body-file "$env:TEMP\product_body_tmp.txt" `
  --link   "<アフィリエイトリンク>" `
  --rating "<評価値>"
```

実行後、出力された URL（`http://localhost:3000/products/...`）をユーザーに知らせる。

---

## 注意事項

- `MONGODB_URI` が Atlas URI なら、ローカルで追加したデータは**既に本番と共有されている**
- ローカル限定 DB を使った場合のみ `sync_products_local_to_prod.js` が必要
- 同期スクリプトは `affiliateLink` の重複チェックを行い、既存データは上書きしない

## 使い方

```
/sync-products
```

上記のみで Copilot が状況を判断し、適切なケースの手順を実行する。

---

## 自動実行フロー（Copilot エージェント用）

このプロンプトが呼ばれたら、以下を自動で行う:

1. `.env` の `MONGODB_URI` がローカルか Atlas かを確認する
2. **Atlas URI** → ケース A: 件数確認のみ実行
3. **ローカル URI** → ケース B: `sync_products_local_to_prod.js` を実行
4. 未投稿のレビュー（チャット上で生成済み）があればケース C を実行
5. 結果を報告する
