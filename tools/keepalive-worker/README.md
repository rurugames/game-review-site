# Render Free のスリープ対策（Cloudflare Workers の Cron）

Render の無料プランは、**15分アクセスがないとスリープ**し、次のアクセスで起動し直す（実測で約30秒）。
この Worker が **5分おきにサイトの `/healthz` を叩いて**、スリープさせない。

## なぜ GitHub Actions ではなくこれか

`.github/workflows/render-keepalive.yml`（GitHub Actions の定期実行）は、設定は5分おきでも、
**実際は20〜35分おきにしか動かなかった**（2026-03-24 の実行履歴: 08:26 → 08:49 → 09:12 → 09:37 → 10:03 …）。
GitHub の定期実行は混雑すると大きく遅れるので、15分のスリープに間に合わない。
Cloudflare の Cron は1分単位で正確で、無料で使える。

## 使い方（初回だけ）

Cloudflare のアカウントは、R2 で使っているものと同じでよい。

```bash
cd tools/keepalive-worker
npm install
npx wrangler login      # ブラウザが開くので、Cloudflare にログインして許可する
npm run deploy          # = npx wrangler deploy
```

デプロイすると、5分おきの定期実行が始まる（`wrangler.toml` の `crons`）。
公開の URL（`*.workers.dev`）は作らない（`workers_dev = false`）。誰でも叩ける入口は無い。

## 動いているか確かめる

- 実行の記録を見る: `npm run tail`（5分以内に `{"ok":true,"status":200,"ms":…}` の行が出る）
- Cloudflare の画面: Workers & Pages → game-review-site-keepalive → Triggers に `*/5 * * * *`、Observability（Logs）に実行の記録
- Render の画面: Logs に5分おきの `GET /healthz`。サイトを10分以上開かなくても、次に開いたとき早ければ成功
- 手元で試す（デプロイしない）: `npm run dev` のあと、別の窓で
  `curl "http://127.0.0.1:8787/__scheduled?cron=*%2F5+*+*+*+*"`（本物のサイトの `/healthz` に1回当たる）

## 設定を変えるとき

- 叩く先・間隔: `wrangler.toml` の `KEEPALIVE_URL`・`crons`（直したら `npm run deploy`）
- 間隔は15分未満に。短くしすぎる意味はない（5分で十分。1日 288 回で、Cloudflare の無料枠の1日10万リクエストに対してごくわずか）
- 止める: `npx wrangler delete`（Worker ごと消える）。Cloudflare の画面の Triggers から Cron を消すだけでもよい

## 気を付けること

- **Render の無料枠は月 750 時間**（ワークスペースごと）。常に起こしておくと1つのサービスで 24 × 31 = 744 時間（31日の月）。
  ほかに無料の Web サービスがあると、月の終わりに枠を使い切って全部止まる。Render の Usage で確かめる
- Render は無料のサービスを、いつでも再起動することがある。スリープが「ゼロ」になるわけではない（ほぼなくなる）
- `/healthz` は `lib/healthz.js`。セッション・アクセス集計より手前にあり、DB が落ちていても 200（本文に `db=` の状態）
- 失敗したら（サイトが 5xx・2回とも返事なし）その実行は「失敗」として Cloudflare の画面に残る
- 古い `.github/workflows/render-keepalive.yml` は GitHub 側で Disable のまま。消してもよい（動かす理由はもうない）

## テスト

```bash
npm test      # ping の動き（失敗したら1回やり直す・結果は1行の JSON など）
```
サイト側の `/healthz` は、リポジトリの直下で `node --test tests/healthz.test.js`。
