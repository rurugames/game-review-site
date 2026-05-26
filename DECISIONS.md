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

## 2026-04-11: ギャラリーアップロードでサブフォルダを再帰走査する

### 背景
- `uploads/gallery/` 直下のシリーズフォルダのさらに下に画像を置くケースがあり、従来の1階層走査では拾えない画像が発生した。

### 決定
- `scripts/upload_gallery.js` は `uploads/gallery/` 配下を再帰走査する。
- R2 キーは `uploads/gallery/` からの相対パスをそのまま使い、サブフォルダ構造も保持する。
- タイトルとタグのシリーズ名は、最上位フォルダ名を使う。

### 反映箇所
- `scripts/upload_gallery.js`
- `GALLERY_UPLOAD_PROMPT.md`

### メモ
- ルート直下の画像は従来どおり「その他」扱いのまま維持する。

## 2026-04-20: サイト全体の年齢確認をトップページ起点に統一

### 背景
- 既存実装では FC2 動画リンクや `/out` 経由の一部導線だけで年齢確認しており、配下ページへの直リンク時に入口が統一されていなかった。

### 決定
- セッション未確認時は、トップページを含むサイト内の HTML ページアクセスを ` /adult/confirm ` に誘導する。
- 配下ページへ直リンクした場合も、確認後に元のURLへ戻す。
- 年齢確認で「いいえ」を選んだ場合は Google へ遷移する。
- ` /adult ` と ` /auth `、`robots.txt`、`sitemap.xml`、`healthz` など運用上必要なエンドポイントは共通ゲートの対象外とする。

### 反映箇所
- `middleware/adultGate.js`
- `routes/adult.js`
- `views/adult/confirm.ejs`
- `server.js`

### メモ
- 既存の FC2 個別ガードは残しつつ、サーバー全体の前段に共通ガードを追加した。

---

## 2026-05-24: 商品レビュー機能の大幅改修

### 背景
- 「商品紹介」という名称をより実態に合わせた「商品レビュー」にリネームしたい。
- ホーム画面に商品レビューのセクションを追加したい。
- ジャンル表示・アフィリエイトリンク・動画セクション・広告など、ギャラリーと同等の機能に揃えたい。

### 決定事項

1. **「商品紹介」→「商品レビュー」一括リネーム**
   - ナビ・h1・タイトルなど全テンプレートで統一。

2. **ホーム画面改修**
   - 「最短で探す」「みんなの評価」セクションを削除。
   - DLsiteランキングとギャラリーの間に「商品レビュー」セクションを追加。

3. **ジャンルバッジ動的表示**
   - `server.js` の `res.locals` に `getProductGenre(url)` ヘルパーを追加。
   - URL パターン（`/maniax/` `/pro/` `/books/` `fanza.com`）でジャンル判定。

4. **商品カード画像のアフィリエイトリンク化・詳細ページ購入ボタン追加**
   - 一覧・ホームの商品カード画像を `<a href="affiliateLink">` で包む。
   - 詳細ページ本文上部に「購入・詳細ページへ」ボタンを追加。

5. **DELETE ボタンのmethod-override修正**
   - `methodOverride('_method')` は文字列指定だとクエリ文字列のみ読む仕様のため、関数形式で `req.body._method` を先読みするように変更。
   - クエリ文字列フォールバック用に `methodOverride('_method')` も残す。

6. **post_product.js に `--rating` オプション追加**
   - DLsite アフィリエイトリンク経由ページは aggregateRating JSON-LD がなく自動取得不可。
   - `--rating 4.29` のように手動指定した値を自動取得より優先する。

7. **post-product.prompt.md 顔文字ルール更新**
   - 使用数を「1〜2個まで」→「**2〜4個程度**（自然な範囲で積極的に使ってよい）」に変更。

8. **商品レビュー詳細ページに関連/おすすめ動画セクション追加**
   - `routes/products.js` に `fetchProductVideos(title)` 追加（チャンネル検索→なければプレイリストからランダム1件）。
   - `views/products/show.ejs` に動画ウィジェット（`rec-video-widget`）追加。

9. **商品レビュー一覧・詳細ページに AdTag 広告追加**
   - `routes/products.js` に `fetchDefaultAdTag()` ヘルパー追加（`AdTag.keyword:'default'`）。
   - 一覧ページ: 4件目（index===4）の後に `gallery-ad-banner` と同パターンで広告挿入。
   - 詳細ページ: 本文（`product-show-body`）の直後に広告ブロック挿入。

10. **インコっちベータ版注意書き追加**
    - `views/inkocchi.ejs` の説明文直下に、ベータ版であることとデータリセット・消失リスクを黄色ボーダーで警告表示。

### 反映箇所
- `server.js`
- `routes/products.js`
- `views/layout.ejs`
- `views/index.ejs`
- `views/products/index.ejs`
- `views/products/show.ejs`
- `views/inkocchi.ejs`
- `scripts/post_product.js`
- `.github/prompts/post-product.prompt.md`

### メモ
- AdTag の `keyword: 'default'` に広告タグが登録済みであること（`scripts/register_ad.js` 実行済み）を前提とする。

---

## 2026-05-26: 商品レビュー編集・管理機能、FANZA対応、無料動画機能の追加

### 背景
- 商品レビューのジャンルタグ（FANZAブック表記）を手動で編集したい。
- FANZA専用の投稿フローを整備したい。
- FANZA無料動画ページを投稿・管理できる新セクションが必要になった。

### 決定事項

1. **商品レビュー 編集・管理機能**
   - `GET /products/:id/edit` → 編集フォーム（管理者のみ）
   - `PUT /products/:id` → 更新処理
   - `GET /admin/products` → 管理一覧ページ新設
   - 管理メニューに「商品レビュー管理」追加。「CSV管理」「記事自動生成」は削除。
   - Article 全件（18,016件）削除。

2. **Product.genre フィールド追加・ジャンルタグ手動設定**
   - `models/Product.js` に `genre: String`（任意）追加。
   - `views/products/edit.ejs` にジャンル選択 `<select>` 追加（空欄はURLから自動判定にフォールバック）。
   - `server.js` の `getProductGenre()` で `FANZAブック` → `FANZA同人` に変更。
   - 選択肢: FANZA同人 / 同人ゲーム / PCゲーム / 成年コミック / DLsite / その他 / 自動判定

3. **FANZA専用投稿スキル**
   - `.github/prompts/post-fanza.prompt.md` 追加（FANZAアフィリエイトHTMLと商品ページ全文から投稿）。
   - `scripts/post_product.js` に `--thumbnail` オプション追加（FANZAはOGP自動取得が失敗するため手動指定）。

4. **FANZAバナー・ウィジェット追加**
   - 左サイドバー（`views/layout.ejs`）に `banner_id=136_120_240` バナーウィジェット追加（`isAdultConfirmed` 時のみ表示）。
   - ギャラリーページトップ（`views/gallery.ejs`）に `dmm-widget-placement` ウィジェット追加（`isAdultConfirmed` 時のみ表示）。

5. **FANZA無料動画機能の新設**
   - モデル `FreeVideo`（フィールド: title, description, affiliateLink, imageUrl, actress[], maker, series, tags[], viewCount, status）。
   - ルート: `GET /free-videos`（一覧）、`GET /free-videos/:id`（詳細）、`PUT/DELETE /free-videos/:id`（管理者のみ）。
   - `GET /admin/free-videos` 管理一覧ページ追加。
   - 左サイドバーに「無料動画」リンク追加（「商品レビュー」の直下）。
   - 管理メニューに「無料動画管理」追加。
   - CLI投稿スクリプト `scripts/post_free_video.js`（--title / --desc / --link / --thumbnail / --actress / --maker / --series / --tags / --views）。
   - 投稿スキル `.github/prompts/post-free-video.prompt.md` 追加。

### 反映箇所
- `models/Product.js`（genre フィールド追加）
- `models/FreeVideo.js`（新規作成）
- `routes/products.js`（edit/PUT/DELETE 追加）
- `routes/free-videos.js`（新規作成）
- `routes/index.js`（admin/products・admin/free-videos 追加）
- `server.js`（getProductGenre FANZAブック→FANZA同人・/free-videos ルート登録）
- `views/products/edit.ejs`（新規作成）
- `views/admin/products.ejs`（新規作成）
- `views/free-videos/index.ejs`（新規作成）
- `views/free-videos/show.ejs`（新規作成）
- `views/free-videos/edit.ejs`（新規作成）
- `views/admin/free-videos.ejs`（新規作成）
- `views/layout.ejs`（無料動画リンク・バナーウィジェット・管理メニュー更新）
- `views/gallery.ejs`（FANZAウィジェット追加）
- `scripts/post_product.js`（--thumbnail オプション追加）
- `scripts/post_free_video.js`（新規作成）
- `.github/prompts/post-fanza.prompt.md`（新規作成）
- `.github/prompts/post-free-video.prompt.md`（新規作成）

### メモ
- FreeVideo は Product とは独立したコレクション（`freevideos`）。
- サムネイルは `--thumbnail` で手動指定。FANZAの CID が分かる場合は `https://pics.dmm.co.jp/digital/video/{cid}/{cid}pl.jpg` も試せる。

