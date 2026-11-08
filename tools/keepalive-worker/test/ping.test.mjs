// 実行: node --test test/ping.test.mjs （tools/keepalive-worker で）
import test from "node:test";
import assert from "node:assert/strict";
import { ping, RETRY_WAIT_MS } from "../src/ping.js";

const res = (status, body = "ok db=connected") => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const quiet = { log: () => {}, sleep: async () => {} };

test("200 ならそのまま成功（1回しか叩かない）", async () => {
  let calls = 0;
  const r = await ping("https://x.test/healthz", { ...quiet, fetchImpl: async () => { calls++; return res(200); } });
  assert.equal(calls, 1);
  assert.deepEqual([r.ok, r.status, r.attempt, r.body], [true, 200, 1, "ok db=connected"]);
});

test("1回目が失敗しても、待ってもう1回叩いて成功すれば成功", async () => {
  const waits = [];
  let calls = 0;
  const r = await ping("https://x.test/healthz", {
    log: () => {}, sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => { calls++; return calls === 1 ? res(502, "bad gateway") : res(200); },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [RETRY_WAIT_MS]);
  assert.equal(r.attempt, 2);
});

test("通信の失敗（タイムアウトなど）も1回やり直す。2回とも失敗なら例外", async () => {
  let calls = 0;
  await assert.rejects(
    ping("https://x.test/healthz", { ...quiet, fetchImpl: async () => { calls++; throw new Error("timeout"); } }),
    /timeout/,
  );
  assert.equal(calls, 2);
});

test("2回とも 503 なら、返ってきたステータスを入れた例外", async () => {
  await assert.rejects(ping("https://x.test/healthz", { ...quiet, fetchImpl: async () => res(503) }), /503/);
});

test("URL が無ければ、叩かずに分かりやすい例外", async () => {
  let calls = 0;
  await assert.rejects(ping("", { ...quiet, fetchImpl: async () => { calls++; return res(200); } }), /KEEPALIVE_URL/);
  assert.equal(calls, 0);
});

test("結果は1行の JSON で log に出る（ステータス・かかった時間・何回目か）", async () => {
  const lines = [];
  let t = 1000;
  await ping("https://x.test/healthz", { fetchImpl: async () => res(200), sleep: async () => {}, now: () => (t += 250), log: (l) => lines.push(l) });
  const o = JSON.parse(lines[0]);
  assert.deepEqual([o.ok, o.status, o.attempt], [true, 200, 1]);
  assert.equal(typeof o.ms, "number");
});

test("叩くときは、キャッシュさせない・待ち時間の上限をつけている", async () => {
  let seen;
  await ping("https://x.test/healthz", { ...quiet, fetchImpl: async (u, init) => { seen = { u, init }; return res(200); } });
  assert.equal(seen.u, "https://x.test/healthz");
  assert.equal(seen.init.headers["Cache-Control"], "no-cache");
  assert.ok(seen.init.signal instanceof AbortSignal);
  assert.equal(seen.init.cf.cacheTtl, 0);
});
