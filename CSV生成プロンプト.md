# R18 PC同人ゲーム記事CSV生成プロンプト

このファイルを添付して、チャットで「年月（YYYY年MM月）」のみを指定することで、AIが記事を生成してCSV出力します。

**重要**: JavaScriptスクリプト（generate-csv.js）は使用せず、VS Code Copilot Agentが直接処理を実行します。

---

## プロンプト本文

{指定年月}に発売されたR18 PC同人ゲームのレビュー記事を、**当月発売タイトルをすべて対象**としてAIで生成し、CSVファイルとして出力してください。

**実行方法**: JavaScriptスクリプトは使わず、以下の手順を直接実行してください。

### 1. ゲーム情報の取得（当月発売タイトルを全件）
Node.jsのコマンドラインで以下を実行してゲーム情報を取得：

```javascript
const dlsite = require('./services/dlsiteService');
const games = await dlsite.fetchGamesByMonth({年}, {月});
console.log(JSON.stringify(games, null, 2));
```

または、ターミナルで以下のNode.jsコマンドを実行：
```bash
node -e "const dlsite = require('./services/dlsiteService'); dlsite.fetchGamesByMonth({年}, {月}).then(games => console.log(JSON.stringify(games, null, 2))).catch(err => { console.error(err); process.exit(1); });"
```

取得したゲーム情報のJSON配列を次のステップで使用します。

**重要（R18のみを対象に抽出）**
- `fetchGamesByMonth(年, 月)` の取得結果に **全年齢（一般向け）** が混在する場合があります。この記事生成・CSV出力の対象は **R18（成人向け）作品のみ** にしてください。
- 判定は、取得JSON内の `ageRating`（年齢指定）を優先して使用し、`ageRating` が `全年齢` / `一般向け` のものは **除外** してください。
- `ageRating` が欠けている/曖昧な場合は、**DLsite作品ページ**で年齢指定を確認し、R18でない作品は除外してください（不明のまま混ぜない）。

フィルタ例（Node.js / コンソール確認用）:
```javascript
const dlsite = require('./services/dlsiteService');
const games = await dlsite.fetchGamesByMonth({年}, {月});
const r18Games = games.filter(g => {
  const ar = String(g.ageRating ?? '').trim();
  if (!ar) return false; // 不明は除外（必要なら作品ページ確認後に通す）
  if (/全年齢|一般向け/.test(ar)) return false;
  return /R\s*-?\s*18|18禁|成人向け/.test(ar);
});
console.log('all=', games.length, 'r18=', r18Games.length);
console.log(JSON.stringify(r18Games, null, 2));
```

**重要（取得結果の別JSON保存）**
- 取得したゲーム情報（全件）を、以下のファイルとして保存してください（create_file ツールで作成）：
  - 出力先: `c:\Users\hider\mytool\csvoutput\fetched_games_{年}-{月}.json`
  - 内容: `fetchGamesByMonth(年, 月)` が返した配列をそのまま JSON で保存

**重要（取得元の固定）**
- ゲーム情報の取得は `services/dlsiteService.js` の `fetchGamesByMonth(年, 月)` を必ず使用してください
- `generateSampleGames` 等のサンプル生成（架空データ）を使って埋めないでください

### 2. AI記事の生成
取得した各ゲームについて、**GitHub Copilot（Claude Sonnet 4.5）を使用**して、以下の形式でレビュー・攻略記事を生成：

**重要**: OpenAI APIは使用せず、GitHub Copilot Chatの機能で記事を生成してください。

**タイトル形式:**
```
【{ジャンル}】{ゲームタイトル} 攻略・レビュー
```

**説明（50-100文字）:**
- ゲームの簡単な紹介
- ジャンルや特徴を明記
- プレイヤーの興味を引く内容

**本文（800-1200文字）:**
以下の構成でMarkdown形式で記述：

```markdown
## ゲーム概要
- 作品の基本情報と世界観
- ゲームシステムの説明
- 特徴的な要素の紹介

## 攻略ポイント
### 序盤の進め方
- 最初にやるべきこと
- 注意すべき点
- 効率的な進行方法

### 中盤以降の攻略
- 効率的な進め方
- おすすめの攻略順
- 重要なポイント

### エンディング到達のコツ
- クリアまでの流れ
- 回収要素について
- 分岐条件の解説

## プレイレビュー
### 良かった点
- システム面での評価
- ストーリーやキャラクター
- グラフィック・演出
- プレイ感や没入感

### 気になった点
- 改善してほしい要素
- プレイ時の注意点
- バランス面の課題

## 総合評価
- 総合的なおすすめ度（7-9点/10点満点）
- どんな人におすすめか
- プレイ時間の目安
- 価格に対するコストパフォーマンス
```

**記事生成の指示:**
各ゲームタイトル、ジャンル、サークル名、価格情報を元に、GitHub Copilot Chat（Claude Sonnet 4.5）で創造的かつ具体的なレビュー・攻略記事を生成してください。テンプレートではなく、ゲームタイトルやジャンルの特性を反映した独自の内容にしてください。

**重要: 価格の取得と表示**
- 基本情報の「価格」は、**必ずDLsiteの作品ページ（基本情報のDLsite URL）**を確認して取得してください
  - DLsiteページ内の「**サークル設定価格**」または「**価格**」の項目に価格が設定されています
- 価格が取得できない/判定できない場合は、**0円で埋めずに `-`（ハイフン）で表示**してください

**重要: 架空タイトルの禁止**
- DLsiteから取得したゲーム情報（JSON配列）に含まれる作品のみを対象にしてください
- **架空のゲームタイトル、架空のRJ番号、架空のサークル名、架空の発売日、架空の画像URLを作成・追加しないでください**
- 取得に失敗して対象作品が確定できない場合は、無理に生成せず「取得に失敗したため中断」として止めてください（代替で架空データに置き換えない）

**重要: 同一段落の反復出力を厳禁**
- 生成する本文内で同一の段落・見出し・フレーズを繰り返して出力しないでください
- 特に「## 追加レビュー」のような汎用的な見出しとその内容を複数回配置することを禁じます
- 各セクション（## ゲーム概要、## 攻略ポイント、## プレイレビュー、## 総合評価など）は1回のみ記述してください
- 文字数を満たすための冗長なパディングや、コピー&ペーストによる同文の繰り返しは行わないでください
- Markdown（.md）ファイルとして保存・配布する場合も同様に、同一段落の反復を行わないよう指示してください
- 各記事は固有の内容で構成し、ゲーム固有の攻略情報や評価ポイントを具体的に記述してください

**ジャンル判定:**
タイトルから以下のいずれかを推測：
- RPG
- アドベンチャー
- シミュレーション
- アクション
- パズル
- その他

**評価:**
- 7〜9の範囲で設定（平均8程度）
- ゲームの内容やジャンルに応じて適切な値を設定

**タグ:**
- **DLsiteで使用されているジャンルタグ**を参考に、ゲームの特徴を表す3-5個のタグをAIで生成
- **必ずDLsite公式のジャンル表記に従うこと**
- タグ例（DLsite準拠）:
  - キャラクター系: 「学生」「メイド」「人妻/主婦」「OL」「巫女」「獣耳/しっぽ」「触手」「モンスター娘」
  - シチュエーション: 「恋愛」「純愛」「ハーレム」「逆ハーレム」「同棲」「寝取り/寝取られ/NTR」「おねショタ」「調教」「洗脳」「精神支配」
  - 場所: 「学園」「屋内」「野外/屋外」「青姦」
  - ジャンル: 「ファンタジー」「SF」「ホラー」「ミステリー」「時代物」
  - システム: 「RPG」「3D作品」「動画」「音声あり」「音楽あり」「体験版あり」
  - 要素: 「日常/生活」「バトル」「コメディ」「ギャグ」「シリアス」「ダンジョン」「管理/経営」「罠」「謎解き」「探索」「癒し」
  - その他: 「フルカラー」「音声あり」「動画あり」「追加コンテンツ」「短編」「続編」
- ゲームタイトル、説明、ジャンルから推測される最適なタグを選定
- タグは半角カンマ区切りで記述（例: 「学生,恋愛,学園,純愛」）

**アフィリエイトリンク:**
- **各ゲーム固有のURL**を設定してください（RJ番号まで含む作品URL）。
  - 例（DLsite作品URL）: `https://www.dlsite.com/maniax/work/=/product_id/RJ01484541.html`
  - 例（変換後のdlaf作品リンク）: `https://dlaf.jp/maniax/dlaf/=/t/s/link/work/aid/r18Hub/id/RJ01484541.html`
- CSVには **DLsite作品URL** を入れてOKです（サーバー側で表示時にdlaf形式へ自動変換します）。

**重要: 本文内の作品タイトルリンク**
- 記事本文の冒頭（ゲーム概要など）で、作品タイトルを **必ずリンク** にしてください。
  - Markdown例: `[{ゲームタイトル}](https://www.dlsite.com/maniax/work/=/product_id/RJxxxxxxxx.html)`
  - このDLsite作品URLも、表示時にdlaf形式へ自動変換されます。

---

## 本文品質を上げるための「情報収集」方針（重要）

「いろいろなサイトを回って本文を厚くする」ことは可能ですが、**他サイトの説明文・レビュー文をそのまま本文へ貼り付けるのは避けてください**（著作権/規約/重複コンテンツのリスク）。

推奨は以下です：

- **事実情報（メタデータ）を拾う**: 発売日、価格、作品形式、ファイル形式/容量、対応OS、年齢指定、スタッフ（シナリオ/イラスト/声優）、ジャンルタグなど。
- **本文は自分の言葉で再構成**: 事実情報を根拠に「どんな人向けか」「購入前に確認すべき点」「遊び方の着眼点」をオリジナル文章として組み立てる。
- **引用は最小限に**: 公式説明文を使う場合でも、丸ごと転載せず、リンクを置いて参照に留める。

特にDLsite作品ページの「基本情報テーブル」から拾える以下の項目は、本文の具体性が上がりやすいです：

- 作品形式 / ファイル形式 / 容量
- 対応OS（動作環境）
- 年齢指定
- シナリオ / イラスト / 声優（表示がある場合）

**攻略/感想の“複数サイト調査”を使って差分を増やす（転載なし）**
- 具体的な調査メモの作り方・禁止事項・出力フォーマットは、別紙の [攻略・感想サイト調査プロンプト.md](%E6%94%BB%E7%95%A5%E3%83%BB%E6%84%9F%E6%83%B3%E3%82%B5%E3%82%A4%E3%83%88%E8%AA%BF%E6%9F%BB%E3%83%97%E3%83%AD%E3%83%B3%E3%83%97%E3%83%88.md) を参照してください。

### レビューコメントの「短い引用」を本文に出したい場合（手動）

自動で他サイトのレビュー本文を収集・転載することはしません（著作権/規約リスク）。
どうしても記事内に「短い引用」を載せたい場合は、各RJの `調査メモ_RJxxxxxx_*.md` の `[統合メモ]` ブロックに、以下のセクションを追記してください。

```txt
- レビューコメントの引用（短い引用）:
  - 「短い引用……」（出典: https://example.com/ ）
  - 「短い引用……」（出典: https://example.com/ ）
```

- ここに書いた箇条書きが、記事本文の「調査メモ（要点）」内へそのまま出力されます
- なるべく短く（必要最小限）にし、出典URLを必ず併記してください

**ステータス:**
- `draft`（下書き状態）

### 3. CSV出力
生成した記事データを使用して、**create_file ツール**でCSVファイルを直接作成してください。

**重要な制約事項:**
- **5件ずつCSV出力すること** - 10件以上を一度に出力するとAIの応答がタイムアウトします
- **出力先フォルダ**: `c:\Users\hider\mytool\csvoutput\`
- **ファイル名形式**: `articles_{年}-{月}_part{番号}.csv`（例: `articles_2025-12_part1.csv`, `articles_2025-12_part2.csv`）
- エンコーディング: UTF-8 BOM付き
- 形式: CSV（カンマ区切り）
- 列構成（日本語ヘッダー）:
  ```
  タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク
  ```

**CSV作成手順:**

- 既に同名の `articles_{年}-{月}_part{番号}.csv` が存在する場合は上書きせず、新しい連番ファイルを作成してください（例: 既に `part1` と `part2` がある場合は `part3` を作成）。シンプルな実装方法: 出力フォルダの該当ファイル名をチェックして、最大の `{番号}` を検出し +1 した番号で新規作成すること。
- CSV内の「説明」「本文」は、既存の `csvoutput/articles_2025-12_part1.csv` のスタイル・詳細度を参照して生成してください。具体的には説明は50〜100文字、本文は800〜1200文字のMarkdown（見出しとセクション構成）で、`articles_2025-12_part1.csv` と同等の文量・表現を目安にします。

- **本文長の明確化:** 本文はMarkdown形式で、見出し・セクション構成を含めて **800〜1,200文字程度** にまとめてください（品質優先）。

**最重要（必読）:** 時間をいくらかけても良いので品質を最優先してください。生成する記事は内容の正確性、文法、Markdown構成（見出し・セクション）、タグの適切性、エスケープ処理（CSV内のダブルクォート等）を厳密にチェック・修正してから出力してください。速度よりも品質（読みやすさ・正確さ・一貫性）を優先し、不安な場合は手動での微調整を行ってください。

1. csvoutputフォルダが存在しない場合は作成
2. 各ゲームのAI生成記事データを配列に格納
3. **5件ずつ**に分割してCSV出力
  - 1-5件目: `articles_{年}-{月}_part1.csv`
  - 6-10件目: `articles_{年}-{月}_part2.csv`
  - 11-15件目: `articles_{年}-{月}_part3.csv` (以降同様)
4. CSVヘッダー行を作成
5. 各記事をCSV行に変換（カンマ区切り、改行・カンマを含む場合はダブルクォートで囲む）
6. create_file ツールで `c:\\Users\\hider\\mytool\\csvoutput\\articles_{年}-{月}_part{番号}.csv` に書き込み

**重要（part CSVの退避）**
- **5件ずつ出力した `articles_{年}-{月}_part{番号}.csv` は、最後に `csvoutput` 直下の `backup` フォルダへ退避（移動）してください。**
  - 退避先: `c:\\Users\\hider\\mytool\\csvoutput\\backup\\`
  - 同名ファイルが既に存在する場合は、上書きせずに連番またはサフィックス（例: `_v2`）を付けて退避してください。

### 3.5. 月次（YYYY-MM）で結合したインポート用CSVも出力
**目的**: partに分割されたCSVを、インポート可能な「月1本」にまとめて追加で出力します。

- 出力先: `c:\\Users\\hider\\mytool\\csvoutput\\articles_{年}-{月}_all.csv`
- 仕様:
  - UTF-8 BOM付き
  - 改行はCRLF
  - ヘッダーは先頭に1回のみ
  - 末尾に空行を入れない（最後の行の後は改行1回のみ）

**結合手順（JSスクリプトは使わず、Agentが直接処理）**
1. `csvoutput` から当月の `articles_{年}-{月}_part*.csv` をすべて読み込む
2. 先頭ファイルのヘッダー行を取得（列は以下で固定）
   - `タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク`
3. 各part CSVから
   - BOM除去
   - 改行（CRLF/LF）を正規化
   - ヘッダー行を除いたデータ行のみ
   を順に連結
4. 上記を `articles_{年}-{月}_all.csv` として `create_file` で出力
5. `articles_{年}-{月}_all.csv` の出力が完了したら、当月の `articles_{年}-{月}_part*.csv` を `csvoutput/backup/` へ退避（移動）

### 3.6. 既存の月次 all CSV を最新テンプレで再生成（_v2 / all上書き）
**目的**: すでに作成済みの月次CSVを、最新の本文テンプレで再生成します。

**本文テンプレで扱うDLsite由来の客観情報（転載なし）**
- レビュー平均（★）/レビュー件数
- 体験版の有無（DLsiteに導線があるか）
- 更新情報（テーブルの「更新情報」）
- 更新履歴（DLsite上の履歴。本文には最新1件を反映）

**重要**
- これは「再生成」なので、`processed_games.json`（重複回避リスト）は更新しません。
- 原則として `csvoutput/fetched_games_{年}-{月}.json` を参照して再生成します（ネットワーク再取得を避ける）。

#### 3.6.1. fetched JSON の「詳細だけ」再取得（追加情報の反映用）
**目的**: 月次の一覧再クロールはせず、既存 `fetched_games_{年}-{月}.json` の各RJについて「作品詳細だけ」を強制再取得してJSONを更新します。

**実行（PowerShell）**
```powershell
node scripts/refresh_fetched_details.js {年}-{月} --concurrency 8
```

**オプション**
- `--concurrency N`: 同時取得数（例: 4〜10程度）。

#### 3.6.2. 再生成（出力先: _all_v2.csv）
**実行（PowerShell）**
```powershell
node scripts/regenerate_monthly_all_v2.js {年}-{月} --overwrite
```

#### 3.6.3. 再生成（出力先: 既存の _all.csv を上書き）
**目的**: 既存の `articles_{年}-{月}_all.csv` を直接上書き更新します（インポート用の月次CSVを差し替えたい場合）。

**実行（PowerShell）**
```powershell
node scripts/regenerate_monthly_all_v2.js {年}-{月} --overwrite --outAll
```

**オプション（共通）**
- `--allowFetch`: `fetched_games_{年}-{月}.json` に無いRJがあった場合に、DLsite詳細を個別取得して補完します。
- `--overwrite`: すでに出力先CSVがある場合に上書きします。
- `--outAll`: 出力先を `articles_{年}-{月}_all_v2.csv` ではなく `articles_{年}-{月}_all.csv` にします。

#### 3.6.4. 年単位で一括更新（存在する月だけ処理）
**目的**: ある年（例: 2025年）の 01〜12 を順に、
1) `fetched_games_YYYY-MM.json` を詳細だけ更新 → 2) `articles_YYYY-MM_all.csv` を上書き再生成
で一括処理します。

**実行（PowerShell）**
```powershell
$year = 2025
$concurrency = 8

foreach ($m in 1..12) {
  $ym = "{0}-{1:00}" -f $year, $m
  $fetched = "csvoutput\\fetched_games_${ym}.json"

  if (-not (Test-Path $fetched)) {
    Write-Host "SKIP $ym: fetched json not found ($fetched)"
    continue
  }

  Write-Host "REFRESH $ym"
  node scripts/refresh_fetched_details.js $ym --concurrency $concurrency

  Write-Host "REGEN $ym"
  node scripts/regenerate_monthly_all_v2.js $ym --overwrite --outAll
}
```

**補足**
- すでに全月の `fetched_games_YYYY-MM.json` がある前提です（無い月はSKIPします）。
- 実行時間が長くなるため、まずは `--concurrency 4` など低めで試すのを推奨します。

**重要: Markdown記号の処理**
- 本文フィールドはMarkdown形式で記述されています
- Web表示時にHTMLに変換する必要があります
- CSVインポート後、サーバー側（routes/csv.js または表示時）でMarkdownをHTMLに変換してください
- 推奨ライブラリ: `marked` または `markdown-it`
  ```javascript
  const marked = require('marked');
  article.content = marked.parse(article.content);
  ```

### 4. ゲーム情報の永続化（重複回避）
取得したゲーム情報を保存し、次回実行時に**同じゲームを再出力しない**ようにします。

**ゲーム情報管理ファイル:**
- ファイル名: `c:\Users\hider\mytool\csvoutput\processed_games.json`
- 形式: JSON配列
- 保存内容: `[{"id": "RJ01234567", "title": "ゲームタイトル", "processedDate": "2025-12-31"}, ...]`

**処理フロー:**
1. DLsiteからゲーム情報を取得
2. `processed_games.json` を読み込み（存在しない場合は空配列）
3. 既に処理済みのゲームID（RJ番号）をフィルタリングで除外（**再実行時は除外必須**）
4. 新規ゲームのみを対象に、**5件ずつ**記事生成→CSV出力
5. 各CSV出力が完了したら、そのCSVに含めたゲーム情報を `processed_games.json` に追記して保存

**CSV形式の例:**
```csv
タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク
"【RPG】魔王討伐クエスト 攻略・レビュー","魔王討伐クエスト","ダークファンタジーの世界を舞台にした本格RPG。戦略的なバトルと重厚なストーリーが魅力。","## ゲーム概要
本作は...","RPG",8,"https://example.com/image.jpg","draft","2025-12-15","ファンタジー,バトル,RPG,ダンジョン","https://www.dlsite.com/maniax/"
```

**重要な注意点:**
- 本文フィールドには改行が含まれるため、必ずダブルクォートで囲むこと
- ダブルクォート内のダブルクォートは `""` とエスケープすること
- UTF-8 BOM付きで保存すること（Excelで文字化けしないため）
- **末尾に空行を入れないこと（重要）**: CSVの末尾に余分な改行（空行）があると、インポート時に「空レコード」が1件発生し、`タイトル/ゲームタイトル/本文` 必須チェックで「行スキップ」エラーになります。
  - **末尾は改行1回だけ**にする（`CRLF` を1回）
  - 最後の行の後に空行（改行2回以上）を付けない

**任意: 生成CSVの事前検証（推奨）**
- 出力後に、同じパーサ設定で「空レコードが混ざっていないか」を確認できます（PowerShell/Nodeどちらでも可）。

```powershell
node -e "const fs=require('fs'); const csv=require('csv-parser'); const rows=[]; fs.createReadStream('csvoutput/articles_{年}-{月}_part{番号}.csv').pipe(csv({skipEmptyLines:true, mapHeaders:({header})=>header.trim()})).on('data', r=>rows.push(r)).on('end',()=>{ const bad=rows.filter(r=>!(r['タイトル']||r['title'])||!(r['ゲームタイトル']||r['gameTitle'])||!(r['本文']||r['content'])); console.log('rows=',rows.length,'bad=',bad.length); if(bad.length) console.log(bad[0]); });"
```

---

## 使用例

### チャットでの指定方法

このmdファイルを添付して、以下のように指定：

```
2025年12月
```

```
2025年11月
```

```
2024年12月
```

**年のみ指定（1月〜12月を順番に処理）:**

```
2025年
```

**実行の流れ:**
1. VS Code Copilot Chatがこのプロンプトを読み込み
2. DLsiteから当月発売のゲーム情報を**全件**取得（Node.jsコマンド実行）
3. 取得結果を `csvoutput/fetched_games_{年}-{月}.json` に保存
4. `processed_games.json` から既処理ゲームを読み込み、重複を除外
5. 新規ゲームについてAIが記事を生成
6. **5件ずつ**CSVファイルを `csvoutput/` フォルダに出力
7. 出力したゲームを `processed_games.json` に追記して保存
8. 当月の `articles_{年}-{月}_all.csv`（インポート用の月次まとめ）も出力
9. 当月の `articles_{年}-{月}_part*.csv` は `csvoutput/backup/` へ退避
10. 完了メッセージと次のステップを表示

**年のみ指定の場合（例: `2025年`）の実行の流れ:**
- 1月〜12月まで、上記の「実行の流れ（年月指定）」を**月ごとに順番に**繰り返してください。
  - 対象月: `2025-01` → `2025-02` → ... → `2025-12`
  - 各月で `fetched_games_{年}-{月}.json` / `articles_{年}-{月}_part*.csv` / `articles_{年}-{月}_all.csv` をそれぞれ作成
  - 各月の `_all.csv` 出力後、その月の `_part*.csv` を `csvoutput/backup/` へ退避
  - `processed_games.json` は通年で共通の重複回避リストとして扱い、月をまたいで再出力しない

---

## 注意事項

- **generate-csv.js は使用しません** - VS Code Copilot Agentが必要な処理（`node -e` や `scripts/*` の実行）を直接実行します
- **OpenAI APIは使用しません** - GitHub Copilot（Claude Sonnet 4.5）で記事生成
- DLsiteから実際のゲーム情報を取得します
- 記事内容はAIが生成するため、ゲームごとに独自の内容になります
- 生成されたCSVは `http://localhost:3000/csv` からインポート可能
- API料金は発生しません（GitHub Copilot契約の範囲内）
