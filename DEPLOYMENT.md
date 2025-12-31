# デプロイメントガイド

## 前提条件

1. GitHubアカウント
2. MongoDB Atlasアカウント（データベース）
3. デプロイ先のアカウント（Render.com等）

## Render.comへのデプロイ手順

### 1. GitHubにコードをプッシュ

```bash
# Gitリポジトリの初期化
git init
git add .
git commit -m "Initial commit"

# GitHubにプッシュ
git remote add origin https://github.com/あなたのユーザー名/game-review-site.git
git branch -M main
git push -u origin main
```

### 2. MongoDB Atlasの設定

1. MongoDB Atlasで接続文字列を取得
2. ネットワークアクセスで「0.0.0.0/0」を許可（全IPから接続可能）

### 3. Google OAuth設定の更新

Google Cloud Consoleで承認済みリダイレクトURIに以下を追加：
```
https://あなたのアプリ名.onrender.com/auth/google/callback
```

### 4. Render.comでのデプロイ

1. [Render.com](https://render.com/)にログイン
2. 「New +」→「Web Service」をクリック
3. GitHubリポジトリを接続
4. 以下の設定を入力：

**Basic Settings:**
- Name: `game-review-site`
- Region: `Singapore` または `Oregon`
- Branch: `main`
- Root Directory: (空白)
- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

**Environment Variables（環境変数）:**
```
GOOGLE_CLIENT_ID=あなたのクライアントID
GOOGLE_CLIENT_SECRET=あなたのクライアントシークレット
CALLBACK_URL=https://あなたのアプリ名.onrender.com/auth/google/callback
MONGODB_URI=mongodb+srv://ユーザー名:パスワード@cluster0.xxxxx.mongodb.net/game-review-site
SESSION_SECRET=ランダムな長い文字列
NODE_ENV=production
PORT=10000
```

5. 「Create Web Service」をクリック
6. デプロイが完了するまで数分待つ

### 5. 動作確認

1. `https://あなたのアプリ名.onrender.com`にアクセス
2. Googleログインを試す
3. 記事の作成・編集・削除を確認

## Railway.appへのデプロイ

1. [Railway.app](https://railway.app/)でアカウント作成
2. 「New Project」→「Deploy from GitHub repo」
3. リポジトリを選択
4. 環境変数を設定
5. 自動デプロイ

## Herokuへのデプロイ

```bash
# Heroku CLIのインストール後
heroku login
heroku create あなたのアプリ名
heroku config:set GOOGLE_CLIENT_ID=xxx
heroku config:set GOOGLE_CLIENT_SECRET=xxx
heroku config:set MONGODB_URI=xxx
heroku config:set SESSION_SECRET=xxx
heroku config:set CALLBACK_URL=https://あなたのアプリ名.herokuapp.com/auth/google/callback
git push heroku main
```

## 注意事項

### セキュリティ
- `.env`ファイルは絶対にGitにコミットしない（`.gitignore`で除外済み）
- `SESSION_SECRET`は本番環境用に強力なランダム文字列を使用
- MongoDB Atlasの接続を特定IPに制限したい場合は、デプロイ先のIPを確認

### 無料プランの制限
- **Render.com無料プラン**: 15分アクセスがないとスリープ、起動に時間がかかる
- **Railway.app**: 月5ドル分の無料クレジット後は課金
- **MongoDB Atlas**: 512MBまで無料

### カスタムドメイン
- 独自ドメインを使用したい場合、各サービスでドメイン設定が可能
- 例: `your-site.com`

## トラブルシューティング

### デプロイが失敗する
- ビルドログを確認
- `package.json`の`engines`セクションを追加：
```json
"engines": {
  "node": ">=18.0.0",
  "npm": ">=9.0.0"
}
```

### Google認証が失敗する
- Google Cloud ConsoleのリダイレクトURIが正しいか確認
- 環境変数の`CALLBACK_URL`が正しいか確認

### MongoDBに接続できない
- MongoDB Atlasのネットワークアクセス設定を確認
- 接続文字列にユーザー名とパスワードが含まれているか確認

## 継続的デプロイ（CI/CD）

GitHubにプッシュすると自動的にデプロイされるように設定されています：
```bash
git add .
git commit -m "Update feature"
git push origin main
# 自動的にデプロイが開始されます
```

## コスト見積もり

### 無料で運用する場合
- Render.com: 無料（制限あり）
- MongoDB Atlas: 無料（512MBまで）
- 合計: 無料

### 有料で運用する場合
- Render.com: $7/月（常時起動）
- MongoDB Atlas: $9/月〜（M2クラスタ）
- 独自ドメイン: $10〜15/年
- 合計: 約$16/月 + ドメイン代
