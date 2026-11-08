/**
 * サイトの /healthz を叩く。Render Free は15分アクセスがないとスリープするので、5分おきに起こしておく。
 *
 * - スリープから起こすときは返事まで30〜60秒かかるので、待つ時間は長めにとる（ネットワークを待つ間は Worker の CPU 時間に入らない）
 * - 失敗したら少し待ってもう1回。それでも失敗なら例外を投げる（Cloudflare の画面で「失敗した実行」として見える）
 * - 結果は1行の JSON で console.log する（`npx wrangler tail` や画面の Logs で見られる）
 */
export const TIMEOUT_MS = 90_000;
export const RETRY_WAIT_MS = 5_000;

export async function ping(url, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, log = console.log } = {}) {
  if (!url) throw new Error("KEEPALIVE_URL が設定されていません（wrangler.toml の [vars]）");
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = now();
    try {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": "game-review-site-keepalive", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cf: { cacheTtl: 0 },
      });
      const body = (await res.text()).slice(0, 80);
      const result = { ok: res.ok, status: res.status, ms: now() - t0, attempt, body };
      log(JSON.stringify(result));
      if (res.ok) return result;
      last = new Error(`${url} が ${res.status} を返しました`);
    } catch (e) {
      log(JSON.stringify({ ok: false, error: String(e && e.message || e), ms: now() - t0, attempt }));
      last = e;
    }
    if (attempt === 1) await sleep(RETRY_WAIT_MS);
  }
  throw last;
}
