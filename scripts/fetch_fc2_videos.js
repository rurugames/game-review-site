require('dotenv').config();

const mongoose = require('mongoose');
const Fc2VideoCache = require('../models/Fc2VideoCache');
const fc2Api = require('../services/fc2VideoApiService');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function upsertCache(key, items) {
  const safeKey = String(key || '').trim();
  const safeItems = Array.isArray(items) ? items : [];
  await Fc2VideoCache.findOneAndUpdate(
    { key: safeKey },
    { $set: { items: safeItems, ts: new Date() } },
    { upsert: true, new: true }
  );
}

async function main() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim();
  if (!mongoUri) {
    console.error('MONGODB_URI is not configured');
    process.exit(1);
  }

  const limit = Math.max(1, Math.min(50, Number(process.env.FC2_FETCH_LIMIT || 25) || 25));

  console.log('MongoDB接続中...');
  await mongoose.connect(mongoUri);
  console.log('MongoDB接続成功');

  try {
    console.log('FC2 API 取得中... limit=', limit);

    const latest = await fc2Api.fetchLatestAdultVideos({ limit, ttlMs: 0 });
    await sleep(200);
    const popular = await fc2Api.fetchPopularAdultVideos({ limit, ttlMs: 0 });

    await upsertCache('latest', latest);
    await upsertCache('popular', popular);

    console.log('保存完了:', {
      latest: Array.isArray(latest) ? latest.length : 0,
      popular: Array.isArray(popular) ? popular.length : 0,
    });
  } finally {
    await mongoose.connection.close();
    console.log('DB接続終了');
  }
}

main().catch((e) => {
  console.error('fetch_fc2_videos failed:', e && e.stack ? e.stack : e);
  process.exit(1);
});
