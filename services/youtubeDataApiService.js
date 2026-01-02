const axios = require('axios');

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, {ts:number, data:any}>} */
const cache = new Map();

function getFromCache(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) return null;
  return hit.data;
}

function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
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

async function youtubeGet(path, params, { timeoutMs = 8000 } = {}) {
  const key = assertApiKey();
  const url = `https://www.googleapis.com/youtube/v3/${path}`;
  const resp = await axios.get(url, {
    timeout: timeoutMs,
    params: { ...params, key },
  });
  return resp.data;
}

async function fetchLatestVideosByChannel(channelId, { limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!channelId) return [];

  const cacheKey = `latest:channel:${channelId}:limit:${limit}`;
  const cached = getFromCache(cacheKey, ttlMs);
  if (cached) return cached;

  const data = await youtubeGet('search', {
    part: 'snippet',
    channelId,
    order: 'date',
    type: 'video',
    maxResults: Math.min(50, Math.max(1, Number(limit) || 12)),
  });

  const items = Array.isArray(data && data.items) ? data.items : [];
  const videos = items.map(mapSearchItemToVideo).filter((v) => v && v.id);
  setCache(cacheKey, videos);
  return videos;
}

async function fetchPopularVideosByChannel(channelId, { limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!channelId) return [];

  const cacheKey = `popular:channel:${channelId}:limit:${limit}`;
  const cached = getFromCache(cacheKey, ttlMs);
  if (cached) return cached;

  const data = await youtubeGet('search', {
    part: 'snippet',
    channelId,
    order: 'viewCount',
    type: 'video',
    maxResults: Math.min(50, Math.max(1, Number(limit) || 12)),
  });

  const items = Array.isArray(data && data.items) ? data.items : [];
  const videos = items.map(mapSearchItemToVideo).filter((v) => v && v.id);
  setCache(cacheKey, videos);
  return videos;
}

async function fetchVideosByPlaylist(playlistId, { limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!playlistId) return [];

  const cacheKey = `playlist:${playlistId}:limit:${limit}`;
  const cached = getFromCache(cacheKey, ttlMs);
  if (cached) return cached;

  const data = await youtubeGet('playlistItems', {
    part: 'snippet',
    playlistId,
    maxResults: Math.min(50, Math.max(1, Number(limit) || 12)),
  });

  const items = Array.isArray(data && data.items) ? data.items : [];
  const videos = items.map(mapPlaylistItemToVideo).filter((v) => v && v.id);
  setCache(cacheKey, videos);
  return videos;
}

module.exports = {
  fetchLatestVideosByChannel,
  fetchPopularVideosByChannel,
  fetchVideosByPlaylist,
};
