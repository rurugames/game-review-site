const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

// In-memory cache TTL (Renderなどの短寿命プロセスでも過剰なAPI呼び出しを抑える)
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const UPLOADS_PLAYLIST_TTL_MS = 24 * 60 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** @type {Map<string, {ts:number, data:any}>} */
const cache = new Map();

/** @type {Map<string, Promise<any>>} */
const inflight = new Map();

let quotaExceededUntilTs = 0;

const feedXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
});

function getFromCache(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) return null;
  return hit.data;
}

function getAnyFromCache(key) {
  const hit = cache.get(key);
  return hit ? hit.data : null;
}

function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

function isQuotaExceededError(e) {
  return !!(e && e.httpStatus === 403 && e.youtubeReason === 'quotaExceeded');
}

function runWithInflight(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function mapFeedEntryToVideo(entry) {
  const videoId = normalizeSpaces(entry && (entry['yt:videoId'] || entry.videoId));
  const title = normalizeSpaces(entry && entry.title);
  const publishedAt = normalizeSpaces(entry && entry.published);

  const mediaGroup = entry && entry['media:group'];
  const mediaDescription = normalizeSpaces(mediaGroup && mediaGroup['media:description']);
  const mediaThumb = mediaGroup && mediaGroup['media:thumbnail'];
  const thumbUrl =
    (mediaThumb && mediaThumb['@_url']) ||
    (Array.isArray(mediaThumb) && mediaThumb[0] && mediaThumb[0]['@_url']) ||
    '';

  return {
    id: videoId,
    title,
    publishedAt,
    publishedAtJp: toJpDateString(publishedAt),
    thumbnailUrl: safeText(thumbUrl),
    description: mediaDescription,
    shortDescription: mediaDescription.length > 140 ? mediaDescription.slice(0, 140) + '…' : mediaDescription,
    url: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '',
  };
}

async function fetchVideosFromFeed(feedUrl, { limit = 12, ttlMs = DEFAULT_TTL_MS, timeoutMs = 8000 } = {}) {
  if (!feedUrl) return [];

  const safeKey = normalizeSpaces(feedUrl);
  const cacheKey = `feed:${safeKey}:limit:${limit}`;
  const cached = getFromCache(cacheKey, ttlMs);
  if (cached) return cached;

  const resp = await axios.get(feedUrl, {
    timeout: timeoutMs,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; game-review-site/1.0; +https://game-review-site.onrender.com)'
    },
    responseType: 'text',
  });

  const xml = resp && resp.data ? String(resp.data) : '';
  const parsed = feedXmlParser.parse(xml);
  const feed = parsed && (parsed.feed || parsed.rss || parsed['atom:feed']);
  const entriesRaw = feed && (feed.entry || (feed.channel && feed.channel.item));
  const entries = Array.isArray(entriesRaw) ? entriesRaw : entriesRaw ? [entriesRaw] : [];
  const videos = entries.map(mapFeedEntryToVideo).filter((v) => v && v.id).slice(0, Math.max(1, Number(limit) || 12));
  setCache(cacheKey, videos);
  return videos;
}

function feedUrlForChannel(channelId) {
  if (!channelId) return '';
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

function feedUrlForPlaylist(playlistId) {
  if (!playlistId) return '';
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
}

function safeText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

function normalizeSpaces(s) {
  return safeText(s)
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toJpDateString(iso) {
  try {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ja-JP');
  } catch {
    return '';
  }
}

function mapSearchItemToVideo(item) {
  const videoId = normalizeSpaces(item && item.id && item.id.videoId);
  const snippet = item && item.snippet;
  const title = normalizeSpaces(snippet && snippet.title);
  const publishedAt = normalizeSpaces(snippet && snippet.publishedAt);
  const description = normalizeSpaces(snippet && snippet.description);
  const thumbnails = (snippet && snippet.thumbnails) || {};
  const thumb = (thumbnails.high && thumbnails.high.url) || (thumbnails.medium && thumbnails.medium.url) || (thumbnails.default && thumbnails.default.url) || '';

  return {
    id: videoId,
    title,
    publishedAt,
    publishedAtJp: toJpDateString(publishedAt),
    thumbnailUrl: safeText(thumb),
    description,
    shortDescription: description.length > 140 ? description.slice(0, 140) + '…' : description,
    url: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '',
  };
}

function mapPlaylistItemToVideo(item) {
  const snippet = item && item.snippet;
  const resourceId = snippet && snippet.resourceId;
  const videoId = normalizeSpaces(resourceId && resourceId.videoId);
  const title = normalizeSpaces(snippet && snippet.title);
  const publishedAt = normalizeSpaces(snippet && snippet.publishedAt);
  const description = normalizeSpaces(snippet && snippet.description);
  const thumbnails = (snippet && snippet.thumbnails) || {};
  const thumb = (thumbnails.high && thumbnails.high.url) || (thumbnails.medium && thumbnails.medium.url) || (thumbnails.default && thumbnails.default.url) || '';

  return {
    id: videoId,
    title,
    publishedAt,
    publishedAtJp: toJpDateString(publishedAt),
    thumbnailUrl: safeText(thumb),
    description,
    shortDescription: description.length > 140 ? description.slice(0, 140) + '…' : description,
    url: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '',
  };
}

function assertApiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    const err = new Error('Missing env YOUTUBE_API_KEY');
    err.code = 'YOUTUBE_API_KEY_MISSING';
    throw err;
  }
  return key;
}

function extractYoutubeApiErrorDetails(error) {
  try {
    const data = error && error.response && error.response.data;
    const root = data && data.error;
    const first = root && Array.isArray(root.errors) ? root.errors[0] : null;
    const reason = first && first.reason ? safeText(first.reason) : '';
    const message = root && root.message ? safeText(root.message) : '';
    const status = root && root.status ? safeText(root.status) : '';
    return {
      httpStatus: error && error.response && error.response.status ? Number(error.response.status) : null,
      reason: reason || null,
      status: status || null,
      message: message || null,
    };
  } catch {
    return { httpStatus: null, reason: null, status: null, message: null };
  }
}

async function youtubeGet(path, params, { timeoutMs = 8000 } = {}) {
  const key = assertApiKey();
  const url = `https://www.googleapis.com/youtube/v3/${path}`;
  try {
    const resp = await axios.get(url, {
      timeout: timeoutMs,
      params: { ...params, key },
    });
    return resp.data;
  } catch (err) {
    const details = extractYoutubeApiErrorDetails(err);
    const parts = [];
    if (details.httpStatus) parts.push(`http=${details.httpStatus}`);
    if (details.status) parts.push(`status=${details.status}`);
    if (details.reason) parts.push(`reason=${details.reason}`);
    if (details.message) parts.push(`message=${details.message}`);
    const msg = parts.length ? `YouTube API request failed (${parts.join(', ')})` : 'YouTube API request failed';
    const e = new Error(msg);
    e.code = 'YOUTUBE_API_REQUEST_FAILED';
    e.httpStatus = details.httpStatus;
    e.youtubeStatus = details.status;
    e.youtubeReason = details.reason;
    e.youtubeMessage = details.message;
    throw e;
  }
}

async function fetchUploadsPlaylistIdByChannel(channelId, { ttlMs = UPLOADS_PLAYLIST_TTL_MS } = {}) {
  if (!channelId) return '';

  const cacheKey = `uploadsPlaylist:channel:${channelId}`;
  const cached = getFromCache(cacheKey, ttlMs);
  if (cached) return cached;

  const data = await youtubeGet('channels', {
    part: 'contentDetails',
    id: channelId,
    maxResults: 1,
  });

  const items = Array.isArray(data && data.items) ? data.items : [];
  const uploads =
    items[0] &&
    items[0].contentDetails &&
    items[0].contentDetails.relatedPlaylists &&
    items[0].contentDetails.relatedPlaylists.uploads
      ? normalizeSpaces(items[0].contentDetails.relatedPlaylists.uploads)
      : '';

  if (uploads) setCache(cacheKey, uploads);
  return uploads;
}

async function fetchLatestVideosByChannel(channelId, { limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!channelId) return [];

  const cacheKey = `latest:channel:${channelId}:limit:${limit}`;
  return runWithInflight(cacheKey, async () => {
    const cached = getFromCache(cacheKey, ttlMs);
    if (cached) return cached;

    if (Date.now() < quotaExceededUntilTs) {
      const feedVideos = await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
      return feedVideos;
    }

    try {
      // search.list はクォータ消費が大きいので uploads プレイリスト経由で取得する
      const uploadsPlaylistId = await fetchUploadsPlaylistIdByChannel(channelId);
      if (!uploadsPlaylistId) {
        return await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
      }

      const data = await youtubeGet('playlistItems', {
        part: 'snippet',
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(50, Math.max(1, Number(limit) || 12)),
      });

      const items = Array.isArray(data && data.items) ? data.items : [];
      const videos = items.map(mapPlaylistItemToVideo).filter((v) => v && v.id);
      setCache(cacheKey, videos);
      return videos;
    } catch (e) {
      if (isQuotaExceededError(e)) {
        quotaExceededUntilTs = Date.now() + QUOTA_COOLDOWN_MS;
        return await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
      }
      if (e && e.code === 'YOUTUBE_API_KEY_MISSING') {
        return await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
      }
      throw e;
    }
  });
}

async function fetchPopularVideosByChannel(channelId, { limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!channelId) return [];

  const cacheKey = `popular:channel:${channelId}:limit:${limit}`;
  return runWithInflight(cacheKey, async () => {
    const cached = getFromCache(cacheKey, ttlMs);
    if (cached) return cached;

    if (Date.now() < quotaExceededUntilTs) {
      // RSSでは人気順を取得できないため、最新動画を代用
      return await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
    }

    try {
      // search.list(viewCount) はクォータ消費が大きいため使用しない。
      // uploads プレイリストから多めに取得し、ルート側で重複除外しておすすめとして使う。
      const uploadsPlaylistId = await fetchUploadsPlaylistIdByChannel(channelId);
      if (!uploadsPlaylistId) {
        const feedVideos = await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
        setCache(cacheKey, feedVideos);
        return feedVideos;
      }

      const data = await youtubeGet('playlistItems', {
        part: 'snippet',
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(50, Math.max(1, Number(limit) || 12)),
      });

      const items = Array.isArray(data && data.items) ? data.items : [];
      const videos = items.map(mapPlaylistItemToVideo).filter((v) => v && v.id);
      setCache(cacheKey, videos);
      return videos;
    } catch (e) {
      if (isQuotaExceededError(e)) {
        quotaExceededUntilTs = Date.now() + QUOTA_COOLDOWN_MS;
        return await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
      }
      if (e && e.code === 'YOUTUBE_API_KEY_MISSING') {
        return await fetchVideosFromFeed(feedUrlForChannel(channelId), { limit });
      }
      throw e;
    }
  });
}

async function fetchVideosByPlaylist(playlistId, { limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!playlistId) return [];

  const cacheKey = `playlist:${playlistId}:limit:${limit}`;
  return runWithInflight(cacheKey, async () => {
    const cached = getFromCache(cacheKey, ttlMs);
    if (cached) return cached;

    if (Date.now() < quotaExceededUntilTs) {
      return await fetchVideosFromFeed(feedUrlForPlaylist(playlistId), { limit });
    }

    try {
      const data = await youtubeGet('playlistItems', {
        part: 'snippet',
        playlistId,
        maxResults: Math.min(50, Math.max(1, Number(limit) || 12)),
      });

      const items = Array.isArray(data && data.items) ? data.items : [];
      const videos = items.map(mapPlaylistItemToVideo).filter((v) => v && v.id);
      setCache(cacheKey, videos);
      return videos;
    } catch (e) {
      if (isQuotaExceededError(e)) {
        quotaExceededUntilTs = Date.now() + QUOTA_COOLDOWN_MS;
        return await fetchVideosFromFeed(feedUrlForPlaylist(playlistId), { limit });
      }
      if (e && e.code === 'YOUTUBE_API_KEY_MISSING') {
        return await fetchVideosFromFeed(feedUrlForPlaylist(playlistId), { limit });
      }
      throw e;
    }
  });
}

module.exports = {
  fetchLatestVideosByChannel,
  fetchPopularVideosByChannel,
  fetchVideosByPlaylist,
};
