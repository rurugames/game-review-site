---
description: uploads/gallery の未処理画像を R2 + MongoDB に反映し、gallery_archive に退避する
argument-hint: （引数不要）
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, LS, WebFetch
---

# upload-gallery

このコマンドは、現在のワークスペースフォルダを作業ディレクトリとして実行する。

## 目的

uploads/gallery の未処理画像を Cloudflare R2 にアップロードして MongoDB に登録し、処理済み画像を uploads/gallery_archive/YYYY-MM-DD/ に退避する。

## 前提条件

- .env に以下が設定済み
  - CLOUDFLARE_API_TOKEN
  - R2_ACCOUNT_ID
  - R2_BUCKET_NAME
  - R2_PUBLIC_DOMAIN
  - MONGODB_URI

## ディレクトリ規約

- uploads/gallery/最上位フォルダ名をシリーズ名として扱う
- 最上位フォルダ名はタグ先頭に使う
- サブフォルダは再帰走査
- ルート直下の画像は「その他」扱い

## 実行手順

1. 対象画像を確認

```powershell
Get-ChildItem -Path uploads/gallery -Recurse -File |
  Where-Object { $_.Extension -match '^(?i)\.(jpg|jpeg|png|webp|gif)$' } |
  Group-Object { $_.Directory.Name } |
  Select-Object Name, Count
```

- 画像が 0 件なら「アップロード対象がありません」と報告して終了

2. 必要時のみ R18 判定と metadata 作成

- 画像確認は少数ずつ段階的に行う
- R18 画像がある場合のみ uploads/gallery/.metadata.json を作成

```json
{
  "シリーズ名/image001.png": { "type": "normal" },
  "シリーズ名/image002.png": { "type": "r18" }
}
```

3. アップロード実行

```bash
node scripts/upload_gallery.js
```

- 追加件数 / スキップ件数 / エラー件数を実行結果から抽出
- .metadata.json はスクリプト完了後に自動削除される前提

4. サイト確認

```powershell
Invoke-WebRequest http://localhost:3000/gallery -UseBasicParsing
```

- 接続失敗でも、アップロード処理にエラーがなければ退避へ進んでよい

5. 処理済み画像を退避

- 実行日ディレクトリ uploads/gallery_archive/YYYY-MM-DD/シリーズ名 へ移動
- uploads/gallery 側のシリーズフォルダは削除しない

```powershell
$archiveDir = "uploads/gallery_archive/$(Get-Date -Format 'yyyy-MM-dd')/シリーズ名"
New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
Move-Item -Path "uploads/gallery/シリーズ名/*" -Destination $archiveDir
```

## タイトル・タグ付与ルール

- 通常画像: タイトル = シリーズ名 N, タグ = [シリーズ名]
- R18 画像: タイトル = シリーズ名 R18-N, タグ = [シリーズ名, R18]
- ルート直下: タイトル = その他 N, タグ = [その他]

## 完了時の報告フォーマット

- 対象シリーズと件数
- 追加 / スキップ / エラー件数
- gallery ページ確認結果
- 退避先パス
- uploads/gallery 側の残件数
