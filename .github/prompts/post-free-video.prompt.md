---
description: FANZA無料動画ページの情報をDBに投稿するスキル
---

# FANZA無料動画 投稿スキル

FANZAの無料動画ページの全文と `<a href>` アフィリエイトリンクから情報を抽出し、`scripts/post_free_video.js` を使って投稿する。

## 手順

### 1. ページ全文から情報を抽出

提供されたページ全文を解析して以下の情報を取得する:

| 項目 | 取得方法 |
|------|----------|
| `title` | ページ内の作品タイトル（例: `いつでも使えるオナホ後輩 花守夏歩`） |
| `desc` | 作品説明文（「」内のあらすじ）。複数行ある場合はまとめる |
| `link` | 提供された `<a href="...">` のリンクURL（al.fanza.co.jp 形式） |
| `thumbnail` | `<img src="...">` から動画サムネイル画像URL（任意） |
| `actress` | 出演者欄の女優名。複数いればカンマ区切り |
| `maker` | メーカー欄の名前 |
| `series` | シリーズ欄の名前 |
| `tags` | タグ一覧（フェラ、中出し、美少女 など）。カンマ区切り |
| `views` | 再生回数（数字のみ。「175,303回」→ `175303`） |

### 2. コマンドを生成して実行

抽出した情報を元に以下のコマンドを組み立て、ターミナルで実行する:

```powershell
cd c:\Users\hider\mytool
node scripts/post_free_video.js `
  --title    "作品タイトル" `
  --desc     "説明文テキスト" `
  --link     "https://al.fanza.co.jp/..." `
  --thumbnail "https://..." `
  --actress  "女優名1,女優名2" `
  --maker    "メーカー名" `
  --series   "シリーズ名" `
  --tags     "タグ1,タグ2,タグ3" `
  --views    175303
```

### 注意事項

- `--link` には `<a href="...">` のURL全体をそのまま使う（エンコードされたままでOK）
- `--thumbnail` はページのHTMLの `<img src>` から探す。見つからなければ省略
- `--desc` にダブルクォートが含まれる場合はエスケープする
- `--views` は数値のみ（カンマや「回」を除去する）
- 説明文が長い場合は省略せず全文を渡す

### 投稿例

提供されたリンクとページ全文（いつでも使えるオナホ後輩 花守夏歩）の場合:

```powershell
node scripts/post_free_video.js `
  --title    "いつでも使えるオナホ後輩 花守夏歩" `
  --desc     "「オナホなのに、ちんちん入れなくていいんですか？」マンコを丸出しにしてきた後輩に、前戯もなしでナマ挿入。オナホなのにイキまくる変態な夏歩ちゃん。可愛い顔して、ちんちんが早くほしい。ずっと入れてたいんです。「AVみたいなことも試していいです」ってマジで都合良すぎ。中出しOK！都合良すぎる欲しがり美少女！" `
  --link     "https://al.fanza.co.jp/?lurl=https%3A%2F%2Fwww.dmm.co.jp%2Flitevideo%2F-%2Fdetail%2F%3D%2Fcid%3Dsqte00683%2F&af_id=rurugamesJP-003&ch=toolbar&ch_id=text" `
  --actress  "花守夏歩" `
  --maker    "S-Cute" `
  --series   "いつでも使えるオナホ後輩" `
  --tags     "フェラ,中出し,美少女,オナニー" `
  --views    175303
```
