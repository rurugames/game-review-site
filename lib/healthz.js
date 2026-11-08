/**
 * 死活確認（Render Free のスリープ対策の keep-alive が定期的に叩く）。
 *
 * - server.js の一番手前（セッション・Passport・アクセス集計より前）に置く。確認のたびに DB を引いたり、
 *   アクセス集計に混ざったりしないようにするため。
 * - いつも 200 を返す（DB が落ちていても 503 にしない）。Render のヘルスチェックの設定に使われていても、
 *   起動中の一瞬に再起動の判定をされないように。DB の状態は本文（ok db=connected）で分かる。
 * - キャッシュさせない（Cloudflare などの途中で ok が返って、本当はスリープのままにならないように）。
 */
const mongoose = require('mongoose');

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

function healthz(req, res) {
  const db = DB_STATES[mongoose.connection.readyState] || 'unknown';
  res.set('Cache-Control', 'no-store');
  res.status(200).type('text/plain').send(`ok db=${db}`);
}

module.exports = healthz;
