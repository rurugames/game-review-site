# CLAUDE.md — game-review-site（R18HubSite）

PC/同人ゲーム・成人向けコンテンツのレビュー・紹介サイト。Node.js + Express + MongoDB のセルフホスト型 Web アプリ。**Render.com に本番デプロイ済み**（唯一の外部公開サービス）。

> [!note] 名前の対応関係
> - GitHubリポジトリ名・package.json 名: `game-review-site`
> - 開発時のローカルフォルダ名（旧）: `mytool`（`C:\Users\hider\mytool` に残置、移行済み）
> - Obsidian vault 上の呼称: `R18HubSite`（`H:\...\raw\R18HubSite\`、`wiki/entities/R18HubSite.md` 参照）
>
> いずれも同一プロジェクトを指す。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Node.js + Express.js |
| DB | MongoDB (Mongoose) |
| 認証 | Passport.js（Google OAuth 2.0）+ express-session（MongoStore） |
| テンプレート | EJS（express-ejs-layouts） |
| デプロイ | Render.com（Free プラン、スリープ対策あり） |
| 画像ストレージ | Cloudflare R2（ギャラリー機能） |

## ディレクトリ構成

```
game-review-site\
├── server.js          ← エントリポイント（約420行）
├── config\passport.js ← Google OAuth 設定
├── middleware\
│   ├── auth.js
│   └── adultGate.js   ← 成人向けコンテンツの年齢確認ゲート（セッションに adultConfirmed 保持）
├── models\            ← Article / Product / Review / FreeVideo / GalleryImage / Comment 等
├── routes\            ← articles / products / reviews / videos / free-videos / gallery / koma / inkocchi / out 等
├── services\          ← aiService / fc2VideoApiService / youtubeDataApiService
├── scripts\           ← CLI投稿・同期スクリプト群（post_product.js 等）
├── views\             ← EJS テンプレート
├── koma\               ← Koma アプリの紹介ランディングページ（静的HTML）
└── lib\trafficMonitor.js
```

バックエンド規模: routes + models で約5,300行。

## 起動・運用

```powershell
npm run dev              # nodemon で開発起動
npm run start:detached    # PowerShellスクリプトでバックグラウンド起動
npm run stop:detached
npm run status:detached
```

## 設計判断（変更時に壊しやすいポイント）

- **成人確認ゲート**: `middleware/adultGate.js` がセッション (`req.session.adultConfirmed`) で状態を保持。FANZA/DMMウィジェット等の表示条件は必ずこのフラグを見て分岐させる。
- **Render Free のスリープ対策**: GitHub Actions で `/healthz` に5分おきの keep-alive を仕掛けている（README参照）。無効化・削除する場合はワークフローファイルごと確認すること。
- **商品投稿はCLIスクリプト経由**: `scripts/post_product.js` / `post_free_video.js` に `--thumbnail` 等のオプションを持たせ、`.github/prompts/post-*.prompt.md` から呼び出す運用（GUIの管理画面と併用）。FANZAはOGP自動取得が失敗するため `--thumbnail` 手動指定が前提。
- **FreeVideo と Product は独立コレクション**: `freevideos` コレクションは Product と分離管理。混同しないこと。
- **koma/ フォルダは別アプリ（Koma）の紹介ページ**: このリポジトリ自体のコードではなく、静的な販促ランディングページ。Koma アプリ本体は `F:\myApp\Koma` / `C:\Users\hider\Koma` にある別プロジェクト。
- **inkocchi（インコっちゲーム）統合**: `routes/inkocchi.js` + `views/inkocchi.ejs` で埋め込みゲームを提供。詳細は vault の `R18HubSite-インコっちゲーム統合.md` 参照。
- **決定事項ログ**: 仕様変更・機能追加は必ず [DECISIONS.md](DECISIONS.md) に日付付きで追記する運用（既存ルール、継続すること）。

## 関連ドキュメント

- [README.md](README.md) — セットアップ手順・Render本番環境変数・SEO設定
- [DECISIONS.md](DECISIONS.md) — 確定事項の時系列ログ（最重要、変更前に必ず確認）
- [DEPLOYMENT.md](DEPLOYMENT.md) / [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) — デプロイ手順
- [ARTICLE_GENERATOR.md](ARTICLE_GENERATOR.md) / [ARTICLE_GENERATOR_GUIDE.md](ARTICLE_GENERATOR_GUIDE.md) — 記事自動生成機能
- Obsidian vault: `H:\マイドライブ\Obsidian\MyBrain\MyBrain\wiki\concepts\R18HubSite-*.md`（技術スタック・機能一覧・SEO対策など）

## 既知の注意点

- `.env` に Google OAuth・MongoDB接続文字列・Cloudflare R2 認証情報等の秘匿情報あり。**絶対にコミットしないこと**（`.gitignore` で除外済みを確認済み）
- `Article` は過去に全件（18,016件）削除した経緯あり（DECISIONS.md 2026-05-26 参照）。現在の主軸は Product / FreeVideo
