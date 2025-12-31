# 環境構築手順ガイド

このガイドでは、PCゲームレビューサイトをゼロから構築し、Render.comにデプロイするまでの完全な手順を説明します。

## 📋 目次

1. [概要](#概要)
2. [前提条件](#前提条件)
3. [環境構築フロー図](#環境構築フロー図)
4. [詳細手順](#詳細手順)
5. [トラブルシューティング](#トラブルシューティング)

---

## 概要

### 構築する環境

```mermaid
graph TB
    subgraph "開発環境"
        A[VS Code]
        B[Node.js]
        C[Git]
    end
    
    subgraph "クラウドサービス"
        D[GitHub]
        E[MongoDB Atlas]
        F[Google Cloud]
        G[Render.com]
    end
    
    subgraph "アプリケーション"
        H[PCゲームレビューサイト]
    end
    
    A --> H
    B --> H
    C --> D
    D --> G
    E --> H
    F --> H
    G --> H
```

### 使用技術

- **フロントエンド**: EJS, CSS
- **バックエンド**: Node.js, Express.js
- **データベース**: MongoDB (MongoDB Atlas)
- **認証**: Passport.js (Google OAuth 2.0)
- **デプロイ**: Render.com
- **バージョン管理**: Git, GitHub

---

## 前提条件

以下をインストールしておいてください：

- Windows 10/11
- インターネット接続
- Googleアカウント
- GitHubアカウント（無料）

---

## 環境構築フロー図

```mermaid
flowchart TD
    START[開始] --> A[開発ツールのインストール]
    A --> B[プロジェクト作成]
    B --> C[MongoDB Atlas設定]
    C --> D[Google OAuth設定]
    D --> E[ローカル動作確認]
    E --> F[GitHubリポジトリ作成]
    F --> G[Render.com設定]
    G --> H[本番デプロイ]
    H --> END[完了]
    
    style START fill:#90EE90
    style END fill:#90EE90
    style A fill:#FFE4B5
    style B fill:#FFE4B5
    style C fill:#87CEEB
    style D fill:#87CEEB
    style E fill:#DDA0DD
    style F fill:#F0E68C
    style G fill:#F0E68C
    style H fill:#FFB6C1
```

---

## 詳細手順

## Phase 1: 開発ツールのインストール

### ステップ1-1: Node.jsのインストール

1. **公式サイトにアクセス**
   ```
   https://nodejs.org/
   ```

2. **LTS版をダウンロード**
   - 「LTS (推奨版)」をクリック
   - インストーラーをダウンロード

3. **インストール**
   - ダウンロードしたファイルを実行
   - デフォルト設定のまま「Next」をクリック
   - インストール完了

4. **確認**
   ```powershell
   node --version
   npm --version
   ```

### ステップ1-2: Gitのインストール

1. **公式サイトにアクセス**
   ```
   https://git-scm.com/download/win
   ```

2. **ダウンロードとインストール**
   - 自動的にダウンロードが始まる
   - デフォルト設定のまま「Next」をクリック

3. **確認**
   ```powershell
   git --version
   ```

4. **Gitユーザー情報を設定**
   ```powershell
   git config --global user.name "あなたの名前"
   git config --global user.email "あなたのメールアドレス"
   ```

### ステップ1-3: VS Codeのインストール

1. **公式サイトにアクセス**
   ```
   https://code.visualstudio.com/
   ```

2. **ダウンロードとインストール**
   - 「Download for Windows」をクリック
   - インストーラーを実行
   - デフォルト設定のまま進める

3. **VS Codeを起動**

---

## Phase 2: プロジェクトの作成

### ステップ2-1: プロジェクトフォルダの作成

1. **フォルダを作成**
   ```powershell
   mkdir C:\Users\hider\mytool
   cd C:\Users\hider\mytool
   ```

2. **VS Codeで開く**
   - VS Code起動
   - File > Open Folder
   - `C:\Users\hider\mytool` を選択

### ステップ2-2: プロジェクトファイルの作成

VS Codeのターミナルで以下を実行：

```powershell
# package.jsonの作成
npm init -y

# 依存関係のインストール
npm install express express-session passport passport-google-oauth20 mongoose ejs dotenv method-override

# 開発用ツール
npm install --save-dev nodemon
```

### ステップ2-3: プロジェクト構造の作成

```powershell
# ディレクトリ作成
mkdir config, models, routes, views, views\articles, public, public\css

# 基本ファイル作成
New-Item -ItemType File -Path .gitignore, .env.example, server.js, README.md
```

### ステップ2-4: コードの実装

以下のファイルを作成・編集します：

#### `.gitignore`
```
node_modules/
.env
.DS_Store
*.log
```

#### `.env.example`
```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
CALLBACK_URL=http://localhost:3000/auth/google/callback
MONGODB_URI=mongodb://localhost:27017/game-review-site
SESSION_SECRET=your_session_secret_here
PORT=3000
NODE_ENV=development
```

#### `server.js`, `models/`, `routes/`, `views/` など
- GitHubリポジトリのコードを参照
- または、提供されたコードをコピー

---

## Phase 3: MongoDB Atlasの設定

### ステップ3-1: アカウント作成

```mermaid
flowchart LR
    A[MongoDB Atlas] --> B[アカウント登録]
    B --> C[クラスタ作成]
    C --> D[ユーザー作成]
    D --> E[ネットワーク設定]
    E --> F[接続文字列取得]
```

1. **サイトにアクセス**
   ```
   https://www.mongodb.com/cloud/atlas/register
   ```

2. **アカウント作成**
   - Googleアカウントでサインアップ（推奨）
   - または、メールアドレスで登録

### ステップ3-2: クラスタの作成

1. **「Create a deployment」をクリック**

2. **FREEプランを選択**
   - M0 Sandbox（無料）
   - Provider: AWS
   - Region: Tokyo または Singapore

3. **クラスタ名**
   - デフォルトのまま（または任意の名前）

4. **「Create」をクリック**

### ステップ3-3: データベースユーザーの作成

1. **ユーザー名とパスワードを設定**
   - Username: `hiderance9191_db_user`（任意）
   - Password: 自動生成または任意（**必ずメモする**）

2. **「Create User」をクリック**

### ステップ3-4: ネットワークアクセスの設定

1. **「Add My Current IP Address」をクリック**

2. **開発用に全てのIPを許可（推奨）**
   - 左メニュー > SECURITY > Network Access
   - 「Add IP Address」
   - 「Allow Access from Anywhere」を選択
   - IP Address: `0.0.0.0/0`
   - 「Confirm」をクリック

### ステップ3-5: 接続文字列の取得

1. **「Connect」をクリック**

2. **「Drivers」を選択**

3. **Node.js / バージョン4.1以降を選択**

4. **接続文字列をコピー**
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/
   ```

5. **接続文字列を編集**
   - `<username>` を実際のユーザー名に置き換え
   - `<password>` を実際のパスワードに置き換え
   - データベース名を追加: `/game-review-site?`
   
   **最終形：**
   ```
   mongodb+srv://hiderance9191_db_user:8NcsOmnC09Cv7fKC@hiderance9191.w50wci1.mongodb.net/game-review-site?retryWrites=true&w=majority
   ```

6. **`.env`ファイルに保存**
   ```powershell
   Copy-Item .env.example .env
   ```
   
   `.env`ファイルを開いて`MONGODB_URI`を更新

---

## Phase 4: Google OAuth設定

### ステップ4-1: Google Cloud Consoleでプロジェクト作成

```mermaid
sequenceDiagram
    participant User
    participant GCP as Google Cloud Console
    participant OAuth as OAuth同意画面
    participant Cred as 認証情報
    
    User->>GCP: プロジェクト作成
    GCP->>OAuth: OAuth同意画面設定
    OAuth->>Cred: 認証情報作成
    Cred->>User: Client ID & Secret
```

1. **Google Cloud Consoleにアクセス**
   ```
   https://console.cloud.google.com/
   ```

2. **新規プロジェクト作成**
   - 画面上部「プロジェクトを選択」をクリック
   - 「新しいプロジェクト」をクリック
   - プロジェクト名: `game-review-site`
   - 「作成」をクリック

### ステップ4-2: OAuth同意画面の設定

1. **左メニュー > APIとサービス > OAuth同意画面**

2. **ユーザータイプ: 外部を選択**

3. **アプリ情報を入力**
   - アプリ名: `PCゲームレビュー`
   - ユーザーサポートメール: あなたのGmailアドレス
   - デベロッパーの連絡先情報: あなたのGmailアドレス

4. **「保存して次へ」を3回クリック**

5. **「ダッシュボードに戻る」をクリック**

### ステップ4-3: OAuth認証情報の作成

1. **左メニュー > 認証情報**

2. **「認証情報を作成」> 「OAuth クライアント ID」**

3. **アプリケーションの種類: ウェブアプリケーション**

4. **名前を入力**
   - 名前: `Web Client`

5. **承認済みのリダイレクトURIを追加**
   ```
   http://localhost:3000/auth/google/callback
   ```
   ※後で本番URLも追加します

6. **「作成」をクリック**

7. **クライアントIDとシークレットをコピー**
   - ポップアップに表示されます
   - **必ずメモする**

8. **`.env`ファイルに保存**
   ```env
   GOOGLE_CLIENT_ID=あなたのクライアントID
   GOOGLE_CLIENT_SECRET=あなたのクライアントシークレット
   ```

---

## Phase 5: ローカル動作確認

### ステップ5-1: サーバー起動

```powershell
npm start
```

**期待される出力：**
```
サーバーが起動しました: http://localhost:3000
MongoDB接続成功
```

### ステップ5-2: ブラウザで確認

```
http://localhost:3000
```

### ステップ5-3: Googleログインをテスト

1. 「Googleでログイン」をクリック
2. Googleアカウントでログイン
3. ダッシュボードに遷移することを確認

### ステップ5-4: 記事作成をテスト

1. 「新規記事作成」をクリック
2. フォームに入力
3. 「記事を作成」をクリック
4. 記事が作成されることを確認

---

## Phase 6: GitHubリポジトリの作成

### ステップ6-1: Gitリポジトリの初期化

```powershell
git init
git add .
git commit -m "Initial commit: PCゲームレビューサイト"
```

### ステップ6-2: GitHubでリポジトリを作成

1. **GitHubにアクセス**
   ```
   https://github.com/new
   ```

2. **リポジトリ情報を入力**
   - Repository name: `game-review-site`
   - Description: `PCゲームレビューサイト - Googleログイン対応`
   - Public または Private を選択
   - **何もチェックしない**（Initialize this repository with）

3. **「Create repository」をクリック**

### ステップ6-3: リモートリポジトリに接続

GitHubに表示されるコマンドを実行：

```powershell
git remote add origin https://github.com/あなたのユーザー名/game-review-site.git
git branch -M main
git push -u origin main
```

**例：**
```powershell
git remote add origin https://github.com/rurugames/game-review-site.git
git branch -M main
git push -u origin main
```

---

## Phase 7: Render.comでのデプロイ

### ステップ7-1: Render.comアカウント作成

```mermaid
flowchart TD
    A[Render.com] --> B[GitHubで登録]
    B --> C[Web Service作成]
    C --> D[リポジトリ接続]
    D --> E[環境変数設定]
    E --> F[デプロイ開始]
```

1. **Render.comにアクセス**
   ```
   https://dashboard.render.com/
   ```

2. **「Sign Up」をクリック**

3. **「GitHub」でサインアップ**
   - GitHubアカウントでログイン
   - Render.comにリポジトリアクセスを許可

### ステップ7-2: Web Serviceの作成

1. **「New +」ボタンをクリック**

2. **「Web Service」を選択**

3. **「Build and deploy from a Git repository」> 「Next」**

4. **GitHubリポジトリを選択**
   - `rurugames/game-review-site` を探す
   - 「Connect」をクリック

### ステップ7-3: サービス設定

**Basic Settings:**

| 項目 | 設定値 |
|------|--------|
| Name | `game-review-site` |
| Region | `Singapore` |
| Branch | `main` |
| Root Directory | (空白) |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |

**Instance Type:**
- `Free` を選択

### ステップ7-4: 環境変数の設定

下にスクロールして「Environment Variables」セクションを見つけ、以下を追加：

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | あなたのGoogleクライアントID |
| `GOOGLE_CLIENT_SECRET` | あなたのGoogleクライアントシークレット |
| `CALLBACK_URL` | `https://game-review-site.onrender.com/auth/google/callback` |
| `MONGODB_URI` | MongoDB Atlasの接続文字列 |
| `SESSION_SECRET` | ランダムな長い文字列 |
| `NODE_ENV` | `production` |

**注意**: `CALLBACK_URL`の`game-review-site`は、Nameで設定した名前と同じにする

### ステップ7-5: デプロイ開始

1. **「Create Web Service」をクリック**

2. **デプロイ進行状況を確認**
   - Logsタブで確認
   - 5〜10分程度かかります

3. **デプロイ完了を確認**
   ```
   Deploy live
   サーバーが起動しました: http://localhost:10000
   MongoDB接続成功
   ```

4. **公開URLを確認**
   - 画面上部に表示される
   - 例: `https://game-review-site.onrender.com`

---

## Phase 8: 本番環境の最終設定

### ステップ8-1: Google OAuthのリダイレクトURI更新

1. **Google Cloud Consoleに戻る**
   ```
   https://console.cloud.google.com/apis/credentials
   ```

2. **作成したOAuth 2.0 クライアントIDをクリック**

3. **承認済みのリダイレクトURIに追加**
   ```
   https://game-review-site.onrender.com/auth/google/callback
   ```
   ※既存の`localhost`のURIは残しておく

4. **「保存」をクリック**

### ステップ8-2: 本番サイトで動作確認

1. **本番サイトにアクセス**
   ```
   https://game-review-site.onrender.com
   ```

2. **全機能をテスト**
   - [ ] トップページが表示される
   - [ ] Googleログインが動作する
   - [ ] ダッシュボードにアクセスできる
   - [ ] 記事を作成できる
   - [ ] 記事を編集できる
   - [ ] 記事を削除できる
   - [ ] 記事詳細ページが表示される

---

## 🎉 完了！

おめでとうございます！以下の環境が完成しました：

### 構築した環境

```
✅ 開発環境
   ├─ VS Code
   ├─ Node.js
   └─ Git

✅ クラウドサービス
   ├─ GitHub (コード管理)
   ├─ MongoDB Atlas (データベース)
   ├─ Google Cloud (OAuth認証)
   └─ Render.com (本番環境)

✅ アプリケーション
   ├─ ローカル: http://localhost:3000
   └─ 本番: https://game-review-site.onrender.com
```

---

## 📊 環境構成図

```mermaid
graph TB
    subgraph "ローカル開発環境"
        DEV[開発者PC]
        VSCODE[VS Code]
        NODE[Node.js]
        GIT[Git]
    end
    
    subgraph "GitHub"
        REPO[リポジトリ]
    end
    
    subgraph "Render.com"
        RENDER[Web Service]
        APP[アプリケーション]
    end
    
    subgraph "MongoDB Atlas"
        DB[(Database)]
    end
    
    subgraph "Google Cloud"
        OAUTH[OAuth 2.0]
    end
    
    DEV --> VSCODE
    VSCODE --> NODE
    VSCODE --> GIT
    GIT --> REPO
    REPO --> RENDER
    RENDER --> APP
    APP --> DB
    APP --> OAUTH
    
    style DEV fill:#FFE4B5
    style REPO fill:#F0E68C
    style RENDER fill:#90EE90
    style DB fill:#87CEEB
    style OAUTH fill:#DDA0DD
```

---

## トラブルシューティング

### よくある問題と解決方法

#### 問題1: Node.jsがインストールできない

**解決方法:**
- 管理者権限で実行
- ウイルス対策ソフトを一時的に無効化
- 古いバージョンをアンインストールしてから再インストール

#### 問題2: MongoDB Atlasに接続できない

**チェックリスト:**
- [ ] ネットワークアクセスで`0.0.0.0/0`を許可
- [ ] 接続文字列にユーザー名とパスワードが含まれている
- [ ] データベース名が含まれている
- [ ] パスワードに特殊文字が含まれている場合はURLエンコード

#### 問題3: Google OAuthが動作しない

**チェックリスト:**
- [ ] OAuth同意画面が設定されている
- [ ] リダイレクトURIが正確に一致している
- [ ] クライアントIDとシークレットが正しい
- [ ] `.env`ファイルに正しく設定されている

####問題4: Render.comでデプロイに失敗

**解決方法:**
1. Logsタブでエラーメッセージを確認
2. 環境変数が全て設定されているか確認
3. `package.json`に`engines`が設定されているか確認
4. Build Commandが`npm install`になっているか確認
5. Start Commandが`npm start`になっているか確認

---

## 🔧 環境情報

### 使用バージョン

- Node.js: v18.0.0以上
- npm: v9.0.0以上
- MongoDB: v6.0以上

### 依存パッケージ

```json
{
  "express": "^4.18.2",
  "express-session": "^1.17.3",
  "passport": "^0.7.0",
  "passport-google-oauth20": "^2.0.0",
  "mongoose": "^8.0.3",
  "ejs": "^3.1.9",
  "dotenv": "^16.3.1",
  "method-override": "^3.0.0"
}
```

---

## 📝 チェックリスト（環境構築）

全ての項目が完了しているか確認：

### Phase 1: 開発ツール
- [ ] Node.jsインストール完了
- [ ] Gitインストール完了
- [ ] VS Codeインストール完了
- [ ] Gitユーザー情報設定完了

### Phase 2: プロジェクト
- [ ] プロジェクトフォルダ作成
- [ ] package.json作成
- [ ] 依存関係インストール
- [ ] ディレクトリ構造作成
- [ ] コード実装完了

### Phase 3: MongoDB Atlas
- [ ] アカウント作成
- [ ] クラスタ作成
- [ ] データベースユーザー作成
- [ ] ネットワークアクセス設定
- [ ] 接続文字列取得

### Phase 4: Google OAuth
- [ ] Google Cloudプロジェクト作成
- [ ] OAuth同意画面設定
- [ ] 認証情報作成
- [ ] クライアントID・シークレット取得

### Phase 5: ローカル確認
- [ ] サーバー起動成功
- [ ] ブラウザで表示確認
- [ ] Googleログイン動作確認
- [ ] 記事作成動作確認

### Phase 6: GitHub
- [ ] Gitリポジトリ初期化
- [ ] GitHubリポジトリ作成
- [ ] リモートリポジトリ接続
- [ ] プッシュ成功

### Phase 7: Render.com
- [ ] アカウント作成
- [ ] Web Service作成
- [ ] リポジトリ接続
- [ ] サービス設定完了
- [ ] 環境変数設定完了
- [ ] デプロイ成功

### Phase 8: 本番環境
- [ ] Google OAuthリダイレクトURI更新
- [ ] 本番サイトアクセス確認
- [ ] 全機能動作確認

---

## 📞 サポートリソース

### 公式ドキュメント

- [Node.js](https://nodejs.org/docs/)
- [Express.js](https://expressjs.com/)
- [MongoDB Atlas](https://docs.atlas.mongodb.com/)
- [Passport.js](http://www.passportjs.org/docs/)
- [Render.com](https://render.com/docs)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

### コミュニティ

- [Stack Overflow](https://stackoverflow.com/)
- [GitHub Discussions](https://github.com/)

---

**最終更新日:** 2025年12月31日  
**バージョン:** 1.0.0  
**対象:** Windows環境
