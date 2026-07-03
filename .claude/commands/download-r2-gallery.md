---
description: R2上のgallery画像をローカルにダウンロードして復元する
argument-hint: （引数不要）
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, LS, WebFetch
---

# download-r2-gallery

このコマンドは、現在のワークスペースフォルダを作業ディレクトリとして実行する。

## 目的

Cloudflare R2 上の gallery 画像をローカルにダウンロードし、必要に応じてローカル資産を復元する。

## 前提条件

- .env に以下が設定済み
  - CLOUDFLARE_API_TOKEN
  - R2_ACCOUNT_ID
  - R2_BUCKET_NAME
  - R2_PUBLIC_DOMAIN
  - MONGODB_URI

## 実行手順

1. ダウンロードスクリプトを実行

```bash
node scripts/download_r2_gallery.js
```

2. 取得結果を確認

- ダウンロード成功件数
- 既存スキップ件数
- エラー件数

3. ローカル配置を確認

```powershell
Get-ChildItem -Path uploads/gallery -Recurse -File |
  Where-Object { $_.Extension -match '^(?i)\.(jpg|jpeg|png|webp|gif)$' } |
  Group-Object { $_.Directory.Name } |
  Select-Object Name, Count
```

## 完了時の報告フォーマット

- 取得元バケット情報（必要最小限）
- 成功 / スキップ / エラー件数
- ローカル復元先の件数サマリ
