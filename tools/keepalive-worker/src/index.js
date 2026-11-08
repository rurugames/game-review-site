import { ping } from "./ping.js";

// 定期実行（wrangler.toml の crons）だけ。公開の入口（fetch）は作らない: 誰でも叩けるとサイトへの確認が無制限に飛ぶため
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping(env.KEEPALIVE_URL));
  },
};
