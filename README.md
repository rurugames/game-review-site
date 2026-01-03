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

# サーバー設定
PORT=3000
NODE_ENV=development

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

アプリケーションは `http://localhost:3000` で起動します。

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
