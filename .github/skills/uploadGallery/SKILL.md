---
name: uploadGallery
description: 'uploads/gallery/ 内の画像を Cloudflare R2 にアップロードし、MongoDB に登録して処理済み画像を gallery_archive/ に退避する。ギャラリー画像を追加するときに使う。'
argument-hint: '（引数不要）'
---

# ギャラリーアップロード (uploadGallery)

`uploads/gallery/` の未処理画像を R2 にアップロードしてサイトに反映し、退避まで行うワークフロー。

## 前提条件

`.env` に以下が設定されていること:
- `CLOUDFLARE_API_TOKEN`（Workers R2 Storage: Edit 権限）
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`
- `MONGODB_URI`

## フォルダ構造の規約

```
uploads/gallery/
  アニメ・ゲームタイトル名/   ← 最上位フォルダ名がシリーズ名・タグになる
    image001.png
    image002.png
```

- **最上位フォルダ名** = タグの先頭（例: `["女神のカフェテラス"]`）
- サブフォルダも再帰走査してアップロード
- ルート直下の画像は「その他」に分類

## 手順

### 1. 対象画像の確認

`uploads/gallery/` 内のフォルダ・画像ファイルを確認する。

```powershell
Get-ChildItem -Path uploads/gallery -Recurse -File | Group-Object { $_.Directory.Name } | Select-Object Name, Count
```

画像がない場合は「アップロード対象がありません」と報告して終了。

### 2. R18 判定と `.metadata.json` の作成（必要な場合のみ）

- 大量画像に対して一括で `view_image` を実行しない（少数ずつ段階的に確認）
- センシティブな内容が含まれる可能性がある場合のみ確認
- R18 でないと判断できる場合は `.metadata.json` を作らずそのまま手順 3 へ

R18 画像がある場合は `uploads/gallery/.metadata.json` を作成:

```json
{
  "シリーズ名/image001.png": { "type": "normal" },
  "シリーズ名/image002.png": { "type": "r18" }
}
```

### 3. アップロードスクリプトを実行する

```bash
node scripts/upload_gallery.js
```

- ローカル画像を Cloudflare REST API 経由で R2 にアップロード
- MongoDB に自動登録（タイトル＋タグ付き）
- `.metadata.json` はスクリプト完了後に自動削除
- アップロード済みローカルファイルはそのまま残る

### 4. 実行結果を報告する

- 追加件数 / スキップ（既登録）件数 / エラー件数
- サイト確認: `http://localhost:3000/gallery`（失敗してもエラーがなければ退避に進む）

### 5. 処理済み画像を退避する

今回アップロードした画像を `uploads/gallery_archive/YYYY-MM-DD/` に移動する:

```powershell
$archiveDir = "uploads/gallery_archive/$(Get-Date -Format 'yyyy-MM-dd')/シリーズ名"
New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
Move-Item -Path "uploads/gallery/シリーズ名/*" -Destination $archiveDir
```

- `uploads/gallery/` 内の作品フォルダは空でも**削除しない**
- `uploads/gallery_archive/` 配下の画像は次回アップロード対象にならない

## タイトル・タグの自動付与ルール

| 画像の種別 | タイトル | タグ |
|---|---|---|
| 通常画像 | シリーズ名 N | `[シリーズ名]` |
| R18 画像 | シリーズ名 R18-N | `[シリーズ名, R18]` |
| ルート直下 | その他 N | `[その他]` |

## 関連スクリプト

| スクリプト | 用途 |
|---|---|
| `scripts/upload_gallery.js` | ローカル → R2 アップロード + DB 登録 |
| `scripts/sync_r2_gallery.js` | R2 → DB 差分同期 |
| `scripts/download_r2_gallery.js` | R2 → ローカルダウンロード |
