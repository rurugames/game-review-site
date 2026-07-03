---
description: R2上のgallery画像とMongoDBの差分を同期する
argument-hint: （引数不要）
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, LS, WebFetch
---

# sync-r2-gallery

このコマンドは、現在のワークスペースフォルダを作業ディレクトリとして実行する。

## 目的

Cloudflare R2 上の gallery オブジェクトを走査し、MongoDB の gallery レコードとの差分を同期する。

## 前提条件

- .env に以下が設定済み
  - CLOUDFLARE_API_TOKEN
  - R2_ACCOUNT_ID
  - R2_BUCKET_NAME
  - R2_PUBLIC_DOMAIN
  - MONGODB_URI

## 実行手順

1. 同期スクリプトを実行

```bash
node scripts/sync_r2_gallery.js
```

2. 実行結果を整理

- 追加件数
- 更新件数
- スキップ件数
- エラー件数

3. 任意の目視確認

```powershell
Invoke-WebRequest http://localhost:3000/gallery -UseBasicParsing
```

- ローカルサーバー未起動で確認に失敗しても、同期ログにエラーがなければ成功扱い

## 完了時の報告フォーマット

- 同期対象の概況（R2 / DB）
- 追加 / 更新 / スキップ / エラー件数
- gallery ページ確認結果
