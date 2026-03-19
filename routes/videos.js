const express = require('express');
const router = express.Router();

const youtubeApi = require('../services/youtubeDataApiService');
const fc2Api = require('../services/fc2VideoApiService');
const { requireAdultConfirmed } = require('../middleware/adultGate');

let Fc2VideoCache = null;
try {
  // Optional: Mongo cache (if model exists / DB is connected)
  Fc2VideoCache = require('../models/Fc2VideoCache');
} catch (_) {
  Fc2VideoCache = null;
}

let fc2RefreshInflight = null;

function toJpDateTimeString(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch (_) {
    return dt.toISOString();
  }
}

function getFc2FetchLimit(pageLimit) {
  const envLimit = Number(process.env.FC2_FETCH_LIMIT || 25);
  const base = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 25;
  const min = Math.max(5, Number(pageLimit) || 5);
  return Math.max(min, Math.min(50, base));
}

function maybeStartFc2BackgroundRefresh() {
  if (!Fc2VideoCache) return;
  if (fc2RefreshInflight) return;

  fc2RefreshInflight = Promise.resolve()
    .then(async () => {
      const fetchLimit = getFc2FetchLimit(Number(process.env.FC2_PAGE_LIMIT || 5) || 5);
      const [latest, popular] = await Promise.all([
        fc2Api.fetchLatestAdultVideos({ limit: fetchLimit, ttlMs: 0 }),
        fc2Api.fetchPopularAdultVideos({ limit: fetchLimit, ttlMs: 0 }),
      ]);

      const ts = new Date();
      await Promise.all([
        Fc2VideoCache.findOneAndUpdate(
          { key: 'latest' },
          { $set: { items: Array.isArray(latest) ? latest : [], ts } },
          { upsert: true, new: false }
        ),
        Fc2VideoCache.findOneAndUpdate(
          { key: 'popular' },
          { $set: { items: Array.isArray(popular) ? popular : [], ts } },
          { upsert: true, new: false }
        ),
      ]);
    })
    .catch((e) => {
      try {
        if (e && e.code === 'FC2_API_CONFIG_MISSING') {
          console.warn('FC2 background refresh skipped: missing FC2_API_BASE_URL (scrape fallback may still work)');
        } else {
          console.warn('FC2 background refresh failed:', {
            message: e && e.message ? e.message : String(e),
            code: e && e.code ? e.code : null,
            httpStatus: e && e.httpStatus ? e.httpStatus : null,
          });
        }
      } catch (_) {}
    })
    .finally(() => {
      fc2RefreshInflight = null;
    });
}

router.get('/', async (req, res) => {
  const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID || '';
  const youtubeRecommendedPlaylistId = process.env.YOUTUBE_RECOMMENDED_PLAYLIST_ID || '';

  let latestVideos = [];
  let recommendedVideos = [];

  try {
    if (youtubeChannelId) {
      latestVideos = await youtubeApi.fetchLatestVideosByChannel(youtubeChannelId, { limit: 5 });
    }

    if (youtubeRecommendedPlaylistId) {
      // 重複除外があるので少し多めに取得
      recommendedVideos = await youtubeApi.fetchVideosByPlaylist(youtubeRecommendedPlaylistId, { limit: 25 });
    } else {
      // プレイリスト未指定時はチャンネル内の人気順をおすすめとして使う
      recommendedVideos = youtubeChannelId
        ? await youtubeApi.fetchPopularVideosByChannel(youtubeChannelId, { limit: 25 })
        : [];
    }

    // 新着とおすすめの重複を除外
    const latestIds = new Set((latestVideos || []).map((v) => v && v.id).filter(Boolean));
    recommendedVideos = (recommendedVideos || []).filter((v) => v && v.id && !latestIds.has(v.id)).slice(0, 5);
  } catch (e) {
    latestVideos = [];
    recommendedVideos = [];

    try {
      if (e && e.code === 'YOUTUBE_API_KEY_MISSING') {
        console.warn('YouTube disabled: missing YOUTUBE_API_KEY');
      } else {
        console.warn('YouTube API fetch failed:', {
          message: e && e.message ? e.message : String(e),
          code: e && e.code ? e.code : null,
          httpStatus: e && e.httpStatus ? e.httpStatus : null,
          youtubeStatus: e && e.youtubeStatus ? e.youtubeStatus : null,
          youtubeReason: e && e.youtubeReason ? e.youtubeReason : null,
        });
      }
    } catch (_) {}
  }

  res.render('videos/index', {
    title: '動画',
    metaDescription: 'YouTubeの新着動画・おすすめ動画を表示します。',
    latestVideos,
    recommendedVideos,
    youtubeChannelId,
  });
});

router.get('/fc2', requireAdultConfirmed(), async (req, res) => {
  const cacheMaxAgeMs = Math.max(60 * 1000, Number(process.env.FC2_CACHE_MAX_AGE_MS || 60 * 60 * 1000) || 60 * 60 * 1000);
  const limit = Math.max(1, Math.min(25, Number(process.env.FC2_PAGE_LIMIT || 5) || 5));

  /** @type {any[]} */
  let latestVideos = [];
  /** @type {any[]} */
  let popularVideos = [];

  let cacheTs = null;
  let cacheTsJp = '';
  let hasAnyCacheItems = false;
  let isAnyFresh = false;

  try {
    if (Fc2VideoCache) {
      const now = Date.now();
      const [latestDoc, popularDoc] = await Promise.all([
        Fc2VideoCache.findOne({ key: 'latest' }).lean(),
        Fc2VideoCache.findOne({ key: 'popular' }).lean(),
      ]);

      const isFresh = (doc) => {
        if (!doc || !doc.ts) return false;
        const ts = new Date(doc.ts).getTime();
        if (!Number.isFinite(ts)) return false;
        return now - ts <= cacheMaxAgeMs;
      };

      if (latestDoc && Array.isArray(latestDoc.items) && latestDoc.items.length > 0) {
        latestVideos = latestDoc.items.slice(0, limit);
        hasAnyCacheItems = true;
      }
      if (popularDoc && Array.isArray(popularDoc.items) && popularDoc.items.length > 0) {
        popularVideos = popularDoc.items.slice(0, limit);
        hasAnyCacheItems = true;
      }

      const tsA = latestDoc && latestDoc.ts ? new Date(latestDoc.ts).getTime() : 0;
      const tsB = popularDoc && popularDoc.ts ? new Date(popularDoc.ts).getTime() : 0;
      const maxTs = Math.max(tsA, tsB);
      if (maxTs) {
        cacheTs = new Date(maxTs);
        cacheTsJp = toJpDateTimeString(cacheTs);
      }

      isAnyFresh = Boolean(isFresh(latestDoc) || isFresh(popularDoc));
    }
  } catch (e) {
    // cache is best-effort
  }

  try {
    // Cache-first UX:
    // - If cache has items: render immediately; if stale, refresh in background.
    // - If no cache items: fetch synchronously for first view.
    if (hasAnyCacheItems) {
      if (!isAnyFresh) {
        maybeStartFc2BackgroundRefresh();
      }
    } else {
      const fetchLimit = getFc2FetchLimit(limit);
      const [latest, popular] = await Promise.all([
        fc2Api.fetchLatestAdultVideos({ limit: fetchLimit, ttlMs: 0 }),
        fc2Api.fetchPopularAdultVideos({ limit: fetchLimit, ttlMs: 0 }),
      ]);

      const latestArr = Array.isArray(latest) ? latest : [];
      const popularArr = Array.isArray(popular) ? popular : [];

      latestVideos = latestArr.slice(0, limit);
      popularVideos = popularArr.slice(0, limit);

      try {
        if (Fc2VideoCache) {
          const ts = new Date();
          cacheTs = ts;
          cacheTsJp = toJpDateTimeString(ts);

          await Promise.all([
            Fc2VideoCache.findOneAndUpdate(
              { key: 'latest' },
              { $set: { items: latestArr, ts } },
              { upsert: true, new: false }
            ),
            Fc2VideoCache.findOneAndUpdate(
              { key: 'popular' },
              { $set: { items: popularArr, ts } },
              { upsert: true, new: false }
            ),
          ]);
        }
      } catch (_) {}
    }
  } catch (e) {
    // If API failed but cache had something, keep it; otherwise empty
    try {
      if (e && e.code === 'FC2_API_CONFIG_MISSING') {
        console.warn('FC2 disabled: missing FC2_API_BASE_URL');
      } else {
        console.warn('FC2 API fetch failed:', {
          message: e && e.message ? e.message : String(e),
          code: e && e.code ? e.code : null,
          httpStatus: e && e.httpStatus ? e.httpStatus : null,
        });
      }
    } catch (_) {}
  }

  res.render('videos/fc2', {
    title: 'FC2動画',
    metaDescription: '成人向け（18+）FC2動画の新着・人気を一覧表示します。',
    latestVideos,
    popularVideos,
    cacheTs,
    cacheTsJp,
  });
});

module.exports = router;
