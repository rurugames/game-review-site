# 確定事項ログ（Decisions）

このファイルは、このワークスペース（mytool / game-review-site）に関する **確定した仕様・運用判断・実施した対策** を、日付付きで追記していくためのログです。

- 目的: 「何をどう決めたか」「なぜそうしたか」「どこに反映したか」を後から追えるようにする
- 運用: 何かを確定したら、このファイル末尾に追記（上書きより追記）
- 形式: 日付 / 背景 / 決定 / 反映箇所（ファイル）/ メモ

---

## 2026-03-23〜2026-03-25: Render 帯域・HTTPレスポンス増加の調査と対策

### 背景
- Render で帯域幅を大量消費（1週間で約100GB）し、課金が発生。
- FC2ページ追加後から HTTP レスポンスが増加している体感がある。

### 判断（原因の有力候補）
- FC2の動画ページ自体は埋め込み（ブラウザ→FC2が主体）で、アプリが動画本体を中継している構造ではないため、**帯域100GBの主因になりにくい**。
- 一方で、`/videos/fc2` は成人確認ゲートがあり、
  - `sitemap.xml` に含まれる
  - ナビ等からリンクがある
  という条件が揃うと、クローラが `/videos/fc2` を巡回 → 未確認なら `/adult/confirm` に 302 という **リダイレクト増殖** が発生し、HTTPレスポンス数が増えやすい。

### 決定（実施した対策）
1) クローラに `/videos/fc2` と `/adult/` を踏ませにくくする
- `robots.txt` に以下を追加
  - `Disallow: /adult/`
  - `Disallow: /videos/fc2`

2) `sitemap.xml` からゲート付きページ `/videos/fc2` を除外
- `sitemap.xml` の静的URL一覧から `/videos/fc2` を外す

3) `/videos/fc2` を `noindex,nofollow` 扱いにする
- 既存の noindex 対象に `/videos/fc2` を追加

4) UI上のリンクに `rel="nofollow"` を付与
- `/videos` と共通ナビの `/videos/fc2` リンクを nofollow にする（見た目は変えない）

### 反映箇所（変更したファイル）
- server 側（robots / sitemap / meta robots）
  - `server.js`
- view 側（nofollow）
  - `views/layout.ejs`
  - `views/videos/index.ejs`

### GitHub Actions（補足）
- keep-alive / FC2取得のスケジュール（`on.schedule`）は一時的に編集して停止・復帰の検討をしたが、最終的に **GitHub側で workflow を Disable** して止める運用を選択。
- YAMLは「元の内容（scheduleあり）」に戻した。

---

## 2026-03-02: R18同人ゲーム記事CSV生成フローの確立

### 背景
- DLsiteの新着/過去作のR18ゲームについて、AIを活用してレビュー記事を大量生成したい。
- 生成した記事はCSV形式で出力し、既存システムへインポート可能にする必要があった。

### 決定事項（仕様・運用）
1.  **対象範囲**
    - 指定年月の「同人ゲーム」かつ「R18（成人向け）」作品のみを対象とする。
    - 「全年齢」「一般向け」作品は除外する（メタデータ ageRating およびタグで判定）。

2.  **生成フロー（バッチ処理）**
    - **Step 1: データ取得**
        - `dlsiteService.fetchGamesByMonth(YYYY, MM)` を使用。
        - 結果は `csvoutput/fetched_games_YYYY-MM.json` に保存（マスターデータ）。
    - **Step 2: 未処理抽出**
        - `csvoutput/processed_games.json` （全期間共通の処理済みリスト）と照合し、未処理のIDのみ抽出。
    - **Step 3: 記事生成（AI）**
        - 5件〜数百件単位でバッチ処理を実行。
        - 記事内容はマークダウン形式（概要、攻略、レビュー）で生成。
        - `CSV生成プロンプト.md` の指示に従う。
    - **Step 4: CSV出力**
        - ファイル名: `csvoutput/articles_YYYY-MM_partX.csv` → 最終的に `_all.csv` に統合。
        - カラム構成: `タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク`
        - **重要**: `ステータス` カラムの値はシステム仕様に合わせ `published` とする（`公開` は不可）。
    - **Step 5: 処理済み更新**
        - 生成完了したIDを `processed_games.json` に追記して永続化。

3.  **データ管理**
    - `csvoutput/` ディレクトリを使用。
    - `backup/` ディレクトリに中間ファイル（partファイル）を退避。

4.  **例外処理・補正**
    - CSVインポート時の Enum エラー（`status: '公開'`）に対し、スクリプトで `published` に置換する補正処理を実施済み。
    - 今後の生成プロンプト/スクリプトでは最初から `published` を出力するよう統一。

### 反映箇所（変更したファイル）
- プロンプト: `CSV生成プロンプト.md`
- 出力先: `csvoutput/`
- 管理ファイル: `csvoutput/processed_games.json`

---

## 追記ルール（テンプレ）

### YYYY-MM-DD: タイトル
- 背景:
- 決定:
- 反映箇所:
- メモ:

## 2026-04-05
- 不要になった「人気ランキング(/ranking)」機能を完全に削除（ルーティング、EJSテンプレート、JSウィジェット、バックグラウンド取得ロジックなど全てクリーンアップ）。

## 2026-04-09: ギャラリー運用で専用エージェントを前提にしない

### 背景
- ギャラリー追加の短い命令で専用エージェントが起動し、画像をまとめて確認しようとして VS Code が不安定になる事象があった。

### 決定
- ギャラリー運用は専用エージェント前提にせず、通常の Copilot チャットから段階的に実行する。
- 大量画像に対して `view_image` を一括で走らせる運用は採らない。
- `uploads/gallery/` は未処理画像専用とし、反映確認後の画像は `uploads/gallery_archive/YYYY-MM-DD/` に退避する。
- 画像を退避した後も、`uploads/gallery/` 側のシリーズフォルダは残す。
- [GALLERY_UPLOAD_PROMPT.md](GALLERY_UPLOAD_PROMPT.md) を添付して「ギャラリーを追加して」と依頼された場合は、通常チャットでアップロードから退避までを既定動作として続けて行う。

### 反映箇所
- `GALLERY_UPLOAD_PROMPT.md`
- `.github/copilot-instructions.md`

### メモ
- 画像確認が不要なケースでは `.metadata.json` を省略し、`scripts/upload_gallery.js` のフォールバック処理を使ってよい。
- 処理済み画像を `uploads/gallery/` に残し続けないことで、次回の確認対象とチャット実行時の負荷を抑える。
- 空フォルダを残すことで、次回の投入先シリーズを迷わず維持できる。
- ローカルサイト確認が失敗しても、アップロード処理が成功していれば退避まで進める運用とする。

## 2026-04-11: CSS の毎回キャッシュ無効化をやめる

### 背景
- Render の HTTP Responses 帯域を調べると、共通 CSS が毎ページ再取得される構成になっていた。

### 決定
- `style.css` のクエリ文字列に `Date.now()` を使うのをやめ、固定の `assetVersion` を使う。
- `assetVersion` は `ASSET_VERSION` 環境変数、未設定なら `package.json` の version を使う。

### 反映箇所
- `server.js`
- `views/layout.ejs`

### メモ
- これにより同一バージョン配信中は CSS をブラウザ/CDN が再利用しやすくなる。

## 2026-04-11: 全ページ共通の Socket.IO 配信を停止

### 背景
- 共通レイアウトで全ページに `/socket.io/socket.io.js` を配信していたが、現行コードではクライアント側の利用実体がなく、固定帯域だけが増えていた。

### 決定
- 共通レイアウトから Socket.IO クライアント読込を外す。
- サーバー側の Socket.IO 初期化と接続時送信処理も削除する。

### 反映箇所
- `server.js`
- `views/layout.ejs`

### メモ
- 将来リアルタイム更新が必要になった場合は、対象ページ限定で読み込む。

## 2026-04-11: Render 帯域緊急対策で公開記事一覧導線を一時停止

### 背景
- 月間帯域上限が近く、公開記事一覧と sitemap 経由のクロール負荷を即時に落とす必要が出た。

### 決定
- `EMERGENCY_DISABLE_PUBLIC_ARTICLES` を導入し、未設定時は有効として扱う。
- 有効時は `/articles` 一覧を 410 で一時停止する。
- 有効時は `/articles/:id` の個別記事ページも 410 で一時停止する。
- ホームと共通ナビから公開記事一覧への導線を外す。
- `robots.txt` と `sitemap.xml` から公開記事一覧クロール導線を除外する。

### 反映箇所
- `server.js`
- `routes/articles.js`
- `routes/index.js`
- `views/layout.ejs`
- `views/index.ejs`

### メモ
- 緊急停止を解除する場合は `EMERGENCY_DISABLE_PUBLIC_ARTICLES=0` を設定する。

## 2026-04-11: 重い site icon の参照を軽量化し静的キャッシュを強化

### 背景
- Render 帯域を確認すると、`public/images/siteicon.png` が約 1.1MB と大きく、favicon、メニューのロゴ、各種プレースホルダ画像として広く参照されていた。
- 静的配信は `max-age=0` 相当で、同画像の再取得が帯域増加の主要因になっていた。

### 決定
- 実運用の参照先は軽量な `siteicon.svg` に切り替える。
- 旧 `siteicon.png` と `ruruGames.png` への直接アクセスは軽量 SVG へ 301 リダイレクトする。
- `express.static` に 7 日のキャッシュヘッダと `stale-while-revalidate` を付ける。

### 反映箇所
- `server.js`
- `views/layout.ejs`
- `views/gallery-series.ejs`
- `views/gallery-detail.ejs`
- `views/gallery.ejs`
- `views/gallery-tag.ejs`
- `views/videos/index.ejs`
- `views/videos/fc2.ejs`
- `views/search.ejs`
- `views/articles/index.ejs`
- `public/images/siteicon.svg`
- `public/images/ruruGames.svg`

### メモ
- 新しい `siteicon.svg` は 792 bytes、旧 `siteicon.png` は約 1.1MB。
- `ruruGames.png` は約 438KB あり、動画ページのロゴ参照から外した。
- 旧 PNG は一旦残すが、テンプレート参照は外し、旧 URL も SVG へ誘導する。

## 2026-04-11: 帯域調査のため受信・外向き通信の簡易ログを追加

### 背景
- 15分放置でも Render 帯域が大きく増える状況があり、ページ配信だけでなく外部取得通信も含めて切り分けが必要になった。

### 決定
- `ENABLE_TRAFFIC_MONITOR` を導入し、未設定時は有効として扱う。
- 1分ごとに上位の受信パスと外向き通信先を Render ログへ集計出力する。
- 受信については User-Agent と IP の上位も同時に出し、Bot 由来かを判別しやすくする。

### 反映箇所
- `server.js`
- `lib/trafficMonitor.js`

### メモ
- 受信は method/path/status ごと、外向き通信は method/host/path/status ごとに集計する。
- `inbound-ua` と `inbound-ip` を見ることで、特定 Bot や同一送信元の連続アクセスを把握しやすくする。
- 調査後に不要になれば `ENABLE_TRAFFIC_MONITOR=0` で停止できる。
