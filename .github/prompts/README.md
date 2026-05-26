# Copilot スキル一覧（.github/prompts/）

チャットで `/スキル名` と入力して呼び出すプロンプトスキルの一覧です。

---

## 投稿系スキル

### `/post-product` — DLsite商品レビュー投稿

**ファイル:** `post-product.prompt.md`  
**用途:** DLsite の商品URL を渡すと、ページをフェッチして感想本文を生成し `scripts/post_product.js` で投稿する。

**呼び出し例:**
```
/post-product https://www.dlsite.com/maniax/work/=/product_id/RJ000000.html
```

**主なオプション（スクリプト直接実行時）:**
| オプション | 説明 |
|-----------|------|
| `--title` | タイトル（必須） |
| `--body` | 本文 Markdown（必須） |
| `--link` | アフィリエイトURL（必須） |
| `--rating` | 評価値（省略時は自動取得） |
| `--thumbnail` | サムネイルURL（省略時は OGP 自動取得） |

---

### `/post-fanza` — FANZA商品レビュー投稿

**ファイル:** `post-fanza.prompt.md`  
**用途:** FANZA（同人・電子書籍等）のアフィリエイトHTML（`<a href>` / `<img src>`）と商品ページ全文を渡すと、感想本文を生成して投稿する。  
FANZAはOGP自動取得が失敗するため `--thumbnail` オプションを使う。

**呼び出し例:**
```
/post-fanza
[アフィリエイトHTMLをここにペースト]
[商品ページの全文をここにペースト]
```

---

### `/post-free-video` — FANZA無料動画投稿

**ファイル:** `post-free-video.prompt.md`  
**用途:** FANZA無料動画ページの全文と `<a href>` アフィリエイトリンクから情報を抽出し `scripts/post_free_video.js` で `/free-videos` コレクションに投稿する。

**呼び出し例:**
```
/post-free-video
[アフィリエイトリンクの <a href> タグをここに貼る]
[ページ全文をここにペースト]
```

**主なオプション（スクリプト直接実行時）:**
| オプション | 説明 |
|-----------|------|
| `--title` | タイトル（必須） |
| `--desc` | 説明文（必須） |
| `--link` | アフィリエイトURL（必須） |
| `--thumbnail` | サムネイルURL（任意） |
| `--actress` | 出演者（カンマ区切り） |
| `--maker` | メーカー名 |
| `--series` | シリーズ名 |
| `--tags` | タグ（カンマ区切り） |
| `--views` | 再生回数（数値） |

---

## 運用・確認系スキル

### `/sync-products` — 商品レビュー本番DB反映確認

**ファイル:** `sync-products.prompt.md`  
**用途:** ローカル追加した商品レビューが本番 Atlas DB に反映済みかを確認する。  
`.env` が既に Atlas URI を指している場合は追加時点で本番反映済みのため、件数確認のみ実行する。

**呼び出し例:**
```
/sync-products
```

---

### `/twitter-post` — X（Twitter）投稿文生成

**ファイル:** `twitter-post.prompt.md`  
**用途:** 商品URL または ページ全文から、140文字以内のアフィリエイト用X投稿文を生成する。ハッシュタグ2つ・個人的な感想トーン。

**呼び出し例:**
```
/twitter-post https://www.dlsite.com/maniax/work/=/product_id/RJ000000.html
```
URLが読めない場合はページ全文をペーストして渡す。

---

## スクリプト一覧（直接実行用）

| スクリプト | 概要 |
|-----------|------|
| `scripts/post_product.js` | DLsite / FANZA 商品レビューをDBに追加（`/products`） |
| `scripts/post_free_video.js` | FANZA無料動画をDBに追加（`/free-videos`） |
| `scripts/upload_gallery.js` | `uploads/gallery/` の画像をR2へアップロード |
| `scripts/sync_r2_gallery.js` | R2のギャラリーをDBへ同期 |
| `scripts/download_r2_gallery.js` | R2からギャラリーをダウンロード |

---

## 管理ページ

| URL | 説明 |
|-----|------|
| `/admin/products` | 商品レビュー管理（一覧・編集・削除） |
| `/admin/free-videos` | 無料動画管理（一覧・編集・削除） |
| `/dashboard` | ダッシュボード |
| `/admin/settings` | サイト設定 |
