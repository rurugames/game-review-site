# PCゲームレビューサイト

Googleログイン機能を搭載したゲームレビュー記事作成サイトです。PCゲームの情報をまとめ、レビュー記事を投稿・管理できるプラットフォームです。

## 主な機能

- 🔐 **Google OAuth認証**: Googleアカウントでログイン
- ✍️ **記事作成・編集**: ゲームレビュー記事の作成と管理
- 📝 **詳細な記事情報**: ゲームタイトル、ジャンル、評価、開発元、発売日など
- 🏷️ **タグ機能**: 記事の分類とフィルタリング
- 💰 **アフィリエイトリンク**: 商品購入リンクの設置
- 📊 **閲覧数カウント**: 記事の人気度を追跡
- 📱 **レスポンシブデザイン**: モバイル対応

## 技術スタック

- **バックエンド**: Node.js, Express.js
- **データベース**: MongoDB (Mongoose)
- **認証**: Passport.js (Google OAuth 2.0)
- **テンプレートエンジン**: EJS
- **スタイリング**: CSS3

## 必要要件

- Node.js (v14以上)
- MongoDB (v4.4以上)
- Googleアカウント（OAuth設定用）

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd mytool
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. MongoDBのセットアップ

MongoDBをローカルにインストールして起動します：

```powershell
# MongoDBサービスの起動（Windowsの場合）
net start MongoDB

# または、MongoDB Compassを使用
```

### 4. Google OAuth認証情報の取得

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成
3. 「APIとサービス」→「認証情報」に移動
4. 「認証情報を作成」→「OAuthクライアントID」を選択
5. アプリケーションの種類: 「ウェブアプリケーション」
6. 承認済みのリダイレクトURIに追加:
   - `http://localhost:3000/auth/google/callback`
7. クライアントIDとクライアントシークレットをコピー

### 5. 環境変数の設定

`.env.example`を`.env`にコピーして編集します：

```powershell
Copy-Item .env.example .env
```

`.env`ファイルを編集：

```env
# Google OAuth設定
GOOGLE_CLIENT_ID=あなたのクライアントID
GOOGLE_CLIENT_SECRET=あなたのクライアントシークレット
CALLBACK_URL=http://localhost:3000/auth/google/callback

# データベース設定
MONGODB_URI=mongodb://localhost:27017/game-review-site

# セッション設定
SESSION_SECRET=ランダムな長い文字列

# 計測（任意）: IPは生保存せず、設定時のみハッシュ化して保存
ANALYTICS_SALT=

# サーバー設定
PORT=3000
NODE_ENV=development

# 公開URL（SEO: canonical / sitemap 用。Render本番では設定推奨）
SITE_URL=

# お問い合わせフォーム（メール送信）
CONTACT_TO_EMAIL=管理用の送信先メール（公開しない）
CONTACT_FROM_EMAIL=

# SMTP設定（どちらか片方）
SMTP_URL=
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=
# SMTP_PASS=
```

### 6. アプリケーションの起動

```bash
# 通常起動
npm start

# 開発モード（自動再起動）
npm run dev
```

#### Windows: ターミナルから切り離して起動（停止しやすい環境向け）

起動後にすぐ終了する（`received SIGINT` が出る）場合、ターミナル/タスク側から中断されている可能性があります。Windowsでは以下で「切り離し起動」できます。

```bash
npm run start:detached

# 起動確認（pidファイル or /healthz）
npm run status:detached

# 停止
npm run stop:detached

# 再起動
npm run restart:detached
```

デバッグログ付き（`DEBUG_PROCESS_EXIT=1`）で切り離し起動する場合:

```bash
npm run start:detached:debug
```

アプリケーションは `http://localhost:3000` で起動します。

#### VS Code から起動（推奨）

`.vscode/launch.json` を同梱しています。VS Code の「実行とデバッグ」から `Run Server (server.js)` を選ぶと、`.env` を読み込んで起動できます。

もし起動後にすぐ終了する場合は、`DEBUG_PROCESS_EXIT=1` を付けて起動ログを確認してください。ログに `received SIGINT` が出ている場合は、コードの例外ではなく実行元（ターミナル/タスク等）から中断（Ctrl+C相当）されています。

## SEO（本番運用チェック）

### 必須：Render本番の環境変数

- `SITE_URL` は本番の公開URL（https付き・末尾スラッシュなし）を設定してください。
   - 例: `SITE_URL=https://game-review-site.onrender.com`
   - canonical / sitemap の絶対URLに使われます。

### 即時チェック（デプロイ直後に確認）

- robots.txt
   - `https://game-review-site.onrender.com/robots.txt`
   - `Sitemap: https://game-review-site.onrender.com/sitemap.xml` が出ていること
- sitemap.xml
   - `https://game-review-site.onrender.com/sitemap.xml`
   - `<urlset>` が返り、主要ページと記事URL（`/articles/<id>`）が含まれること

### headタグ出力チェック（PowerShell）

以下でページの`<head>`だけを抜き出して、canonical/robots/OG/JSON-LDが出ているか確認できます。

```powershell
$u="https://game-review-site.onrender.com/"
$html=(Invoke-WebRequest -UseBasicParsing $u).Content
$head=($html -split '</head>')[0]
$head | Select-String -Pattern '<title>|rel="canonical"|meta name="robots"|meta name="description"|property="og:|name="twitter:|application/ld\+json' -AllMatches
```

推奨チェック先:

- `/`（トップ）: `index,follow` + canonical + OG/Twitter + WebSite JSON-LD
- `/search?q=test`（検索）: `noindex,nofollow` になっていること
- `/articles/<id>`（記事詳細）: `og:type=article` + Article JSON-LD

### Search Console（中期チェック）

即時チェックは「出力されているか」の確認です。Googleの反映確認はSearch Consoleで行います。

- プロパティ登録（URLプレフィックス）: `https://game-review-site.onrender.com/`
- サイトマップ送信: `https://game-review-site.onrender.com/sitemap.xml`
- 「URL検査」: インデックス登録の可否、選択されたcanonicalなどを確認

所有権確認でHTMLファイル方式がうまくいかない場合は、HTMLタグ方式を使えます。

- Search Consoleの「HTML タグ」に表示される `content` 値を、Renderの環境変数 `GOOGLE_SITE_VERIFICATION` に設定
- デプロイ後、トップページの`<head>`に `<meta name="google-site-verification" ...>` が出ることを確認して「確認」

### 新規記事のインデックス促進（運用手順）

新規記事を公開したら、以下を「毎回」実施してください。

- 公開前チェック
   - 記事の `status` が `published`
   - `title` / `description` / `tags` / `genre` / `developer` が埋まっている（回遊ブロックの精度に直結）
   - 画像（`imageUrl`）がある場合は表示できるURL
- 公開後チェック（ブラウザ）
   - 記事URL `https://<SITE_URL>/articles/<id>` が 200 で開ける
   - `<link rel="canonical">` が記事URLを指している
   - `<meta name="robots" content="index,follow">`（noindexになっていない）
- サイトマップ反映
   - `https://<SITE_URL>/sitemap.xml` に新規記事URLが含まれている
- Search Consoleでの手動促進（最重要）
   - Search Console → URL検査 → 記事URLを入力
   - 公開URLをテスト → 問題がなければ インデックス登録をリクエスト
   - 「選択したcanonical / Googleが選択したcanonical」が意図通りか確認

補足:
- 新規記事の初速（最初の数十本）は手動リクエストが効きやすいです。
- 公開後に内容を大きく直した場合も、同じ手順で再リクエストしてください。

## 使い方

### 1. ログイン

1. トップページの「Googleでログイン」ボタンをクリック
2. Googleアカウントでログイン
3. 権限を承認

### 2. 記事の作成

1. ログイン後、「新規記事作成」ボタンをクリック
2. 以下の情報を入力：
   - 記事タイトル
   - ゲームタイトル
   - ジャンル（RPG、アクションなど）
   - 開発元
   - 発売日
   - 評価（1-5）
   - 画像URL
   - 記事の概要
   - 記事本文
   - タグ（カンマ区切り）
   - アフィリエイトリンク
   - ステータス（公開/下書き）
3. 「記事を作成」ボタンをクリック

### 3. 記事の管理

- **ダッシュボード**: 自分の記事一覧を確認
- **編集**: 記事の「編集」ボタンから内容を修正
- **削除**: 記事の「削除」ボタンで記事を削除

### 4. 記事の閲覧

- トップページに最新の公開記事が表示されます
- 記事カードをクリックして詳細を表示
- 閲覧数が自動的にカウントされます

## プロジェクト構造

```
mytool/
├── config/
│   └── passport.js          # Passport.js設定
├── models/
│   ├── User.js              # ユーザーモデル
│   └── Article.js           # 記事モデル
├── routes/
│   ├── index.js             # ホームとダッシュボード
│   ├── auth.js              # 認証ルート
│   └── articles.js          # 記事CRUD操作
├── views/
│   ├── layout.ejs           # 共通レイアウト
│   ├── index.ejs            # トップページ
│   ├── dashboard.ejs        # ダッシュボード
│   └── articles/
│       ├── new.ejs          # 記事作成フォーム
│       ├── edit.ejs         # 記事編集フォーム
│       └── show.ejs         # 記事詳細
├── public/
│   └── css/
│       └── style.css        # スタイルシート
├── server.js                # エントリーポイント
├── package.json             # 依存関係
├── .env                     # 環境変数（Git管理外）
└── .env.example             # 環境変数のテンプレート
```

## データモデル

### User（ユーザー）

- `googleId`: Google ID（ユニーク）
- `displayName`: 表示名
- `firstName`: 名
- `lastName`: 姓
- `email`: メールアドレス
- `image`: プロフィール画像URL
- `createdAt`: 作成日時

### Article（記事）

- `title`: 記事タイトル
- `gameTitle`: ゲームタイトル
- `genre`: ジャンル
- `releaseDate`: 発売日
- `developer`: 開発元
- `platform`: プラットフォーム（デフォルト: PC）
- `description`: 概要
- `content`: 本文
- `rating`: 評価（1-5）
- `imageUrl`: 画像URL
- `affiliateLink`: アフィリエイトリンク
- `tags`: タグ（配列）
- `author`: 著者（Userへの参照）
- `status`: ステータス（published/draft）
- `views`: 閲覧数
- `createdAt`: 作成日時
- `updatedAt`: 更新日時

## 開発

### 開発モードでの実行

```bash
npm run dev
```

`nodemon`が変更を監視し、自動的にサーバーを再起動します。

### データベースのリセット

```bash
# MongoDBシェルに接続
mongosh

# データベースを削除
use game-review-site
db.dropDatabase()
```

## トラブルシューティング

### MongoDBに接続できない

- MongoDBサービスが起動しているか確認
- `.env`の`MONGODB_URI`が正しいか確認

### Google認証が失敗する

- Google Cloud Consoleの設定を確認
- リダイレクトURIが正しく設定されているか確認
- `.env`のクライアントIDとシークレットが正しいか確認

### ポート3000が使用中

`.env`ファイルで別のポートを指定：

```env
PORT=3001
```

## ライセンス

MIT

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## サポート

問題が発生した場合は、GitHubのissueで報告してください。
