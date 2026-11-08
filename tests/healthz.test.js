// 実行: node --test tests/healthz.test.js
// /healthz（keep-alive が叩く死活確認）。DB やセッションを使わず、いつも 200・キャッシュさせない・DB の状態を本文に出す
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const mongoose = require('mongoose');

const healthz = require('../lib/healthz');

function get(app, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const req = http.request({ host: '127.0.0.1', port: srv.address().port, path, method }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => { srv.close(); resolve({ status: res.statusCode, headers: res.headers, body }); });
      });
      req.on('error', (e) => { srv.close(); reject(e); });
      req.end();
    });
  });
}

test('200 で ok と DB の状態を返し、キャッシュさせない', async () => {
  const app = express();
  app.get('/healthz', healthz);
  const r = await get(app, '/healthz');
  assert.equal(r.status, 200);
  assert.match(r.body, /^ok db=(disconnected|connected|connecting|disconnecting)$/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.headers['content-type'], /^text\/plain/);
});

test('DB につながっていなくても 200（起動中・DB 停止中に Render のヘルスチェックを落とさない）', async () => {
  assert.notEqual(mongoose.connection.readyState, 1);          // このテストでは DB につなげていない
  const app = express();
  app.get('/healthz', healthz);
  const r = await get(app, '/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.body, 'ok db=disconnected');
});

test('HEAD でも 200（外部の監視は HEAD を使うことがある）', async () => {
  const app = express();
  app.get('/healthz', healthz);
  const r = await get(app, '/healthz', 'HEAD');
  assert.equal(r.status, 200);
});

test('server.js では、セッション・Passport・アクセス集計・成人確認より手前に置いてある', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  const at = (s) => src.indexOf(s);
  const health = at("app.get('/healthz', require('./lib/healthz'))");
  assert.ok(health > 0, "/healthz が server.js に無い");
  for (const later of ['app.use(expressLayouts)', 'trafficMonitor.createMiddleware()', 'app.use(session(', 'app.use(passport.session())', 'app.use(requireSiteAdultConfirmation(']) {
    assert.ok(at(later) > health, `${later} より手前に置く`);
  }
  assert.equal(src.split("'/healthz'").length - 1, 2, "/healthz の定義は1つだけ（もう1つは成人確認の通す一覧）");
});
