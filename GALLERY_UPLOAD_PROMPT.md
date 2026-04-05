# Cloudflare R2 ギャラリー アップロード・同期プロンプト

このファイルを添付して「ギャラリーに追加して」などの指示を送信すると、ローカルフォルダの画像を R2 にアップロードし、MongoDB のギャラリーに登録します。

---

## R2バケットのフォルダ構造について

**ローカルの `uploads/gallery/` 配下のフォルダ名 = アニメ・ゲームタイトル名**として扱います。  
R2 にも同じフォルダ構造で保存されます。

```
uploads/gallery/
  女神のカフェテラス/        ← フォルダ名がシリーズ名・タグになる
    image001.png
    image002.png
  ブルーアーカイブ/
    char01.jpg
  （ルート直下の画像は「その他」に分類）
```

- フォルダ名は**必ずタグの先頭に追加**されます。
- ギャラリーのトップページはフォルダ単位でシリーズカードとして表示されます（`/gallery`）。
- 各シリーズの画像一覧は `/gallery/series/<フォルダ名>` で確認できます。

---

## タイトル・タグの自動付与について

フォルダ名が作品名のため、基本的にフォルダ名がタイトル・タグになります。  
`.metadata.json` を用意すればキャラ名まで登録できます（任意）。

| 状況 | タイトル | タグ |
|---|---|---|
| `.metadata.json` あり・キャラ名判明 | キャラ名 | `[フォルダ名, キャラ名, 作品名]` |
| `.metadata.json` あり・キャラ名不明 | フォルダ名 | `[フォルダ名]` |
| `.metadata.json` なし | フォルダ名 | `[フォルダ名]` |
| フォルダなし（ルート直下） | アニメN（連番） | `[アニメ]` |

---

## 実行要件

`.env` ファイルに以下が正しく設定されていることを確認してください：
- `CLOUDFLARE_API_TOKEN` — Account API Token（Workers R2 Storage: Edit 権限）
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`
- `MONGODB_URI`

---

## ワークフロー

### 【A】ローカル画像を R2 にアップロードしてギャラリーに反映する

新しい画像をギャラリーに追加するときの標準フローです。

#### 手順 1. 画像をローカルフォルダに配置する

```
uploads/gallery/
  アニメタイトル名/
    image001.png
    image002.png
```

#### 手順 2. （任意）メタデータを用意する

キャラ名まで登録したい場合は、`uploads/gallery/.metadata.json` を作成してください。  
キーはファイル名またはフルパス（`フォルダ名/ファイル名`）を使用します。

```json
{
  "女神のカフェテラス/image001.png": {
    "type": "anime",
    "characterName": "春日野穂乃佳",
    "seriesName": "女神のカフェテラス"
  },
  "image002.png": {
    "type": "anime",
    "characterName": null,
    "seriesName": null
  }
}
```

#### 手順 3. アップロードスクリプトを実行する

```bash
node scripts/upload_gallery.js
```

- ローカルの画像を Cloudflare REST API 経由で R2 にアップロード
- MongoDB に自動登録（フォルダ名タグ付き）
- アップロード済みのローカルファイルは自動削除

#### 手順 4. 実行結果をユーザーに報告する

- 追加された画像数・タイトル・タグ
- スキップ（既登録）件数
- エラーがあればその詳細
- サイト確認URL: `http://localhost:3000/gallery`

---

### 【B】R2 と MongoDB の差分を同期する

R2 に直接アップロード済みの画像を DB に登録するときに使います。

```bash
node scripts/sync_r2_gallery.js
```

- R2 の全画像を一覧取得（Cloudflare REST API 経由）
- DB 未登録の画像のみ MongoDB に追加
- フォルダ名をタイトル・タグに自動設定

---

### 【C】R2 の画像をローカルにダウンロードする

ローカルと R2 を同期したいときに使います。既存ファイルはスキップします。

```bash
node scripts/download_r2_gallery.js
```

- R2 の全画像を `uploads/gallery/` にフォルダ構造を維持してダウンロード

---

## スクリプト一覧

| スクリプト | 用途 |
|---|---|
| `scripts/upload_gallery.js` | ローカル→R2アップロード＋DB登録 |
| `scripts/sync_r2_gallery.js` | R2→DB差分同期 |
| `scripts/download_r2_gallery.js` | R2→ローカルダウンロード |

---

## 注意点
- R2 の S3 互換 API（`*.r2.cloudflarestorage.com`）は TLS 問題により使用不可。すべての操作は `api.cloudflare.com` 経由の Cloudflare REST API を使用しています。
- 画像の公開 URL は `R2_PUBLIC_DOMAIN` から生成されます（例: `https://pub-xxx.r2.dev/フォルダ名/image.png`）。
- 既に登録済みの画像（`r2Key` が一致）は自動的にスキップされます。
- すべての画像データは MongoDB の `GalleryImage` コレクションに保存されます。