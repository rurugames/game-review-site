const axios = require('axios');
const cheerio = require('cheerio');

// In-memory cache TTL (ページアクセス時の過剰なAPI呼び出しを抑える)
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, {ts:number, data:any}>} */
const cache = new Map();

/** @type {Map<string, Promise<any>>} */
const inflight = new Map();

function normalizeSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function safeText(s) {
  return normalizeSpaces(s);
}

function toJpDateString(isoLike) {
  const v = String(isoLike || '').trim();
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

function getFromCache(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) return null;
  return hit.data;
}

function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

function runWithInflight(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function toAbsoluteUrl(href, base) {
  const h = String(href || '').trim();
  if (!h) return '';
  try {
    return new URL(h, base).toString();
  } catch (_) {
    return '';
  }
}

function stripUrlQueryHash(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return s.split('#')[0].split('?')[0];
  }
}

function parseSrcsetBestUrl(srcset) {
  const s = safeText(srcset);
  if (!s) return '';
  const parts = s
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let bestUrl = '';
  let bestScore = -1;
  for (const part of parts) {
    const segs = part.split(/\s+/).filter(Boolean);
    const url = segs[0] || '';
    const desc = segs[1] || '';
    let score = 0;
    const mW = desc.match(/(\d+)w/i);
    if (mW) score = Number(mW[1]) || 0;
    const mX = desc.match(/(\d+(?:\.\d+)?)x/i);
    if (!mW && mX) score = Math.floor((Number(mX[1]) || 0) * 1000);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return safeText(bestUrl);
}

function scoreThumbCandidate(u) {
  const s = safeText(u).toLowerCase();
  if (!s) return 0;
  if (!/^https?:\/\//i.test(s)) return 0;
  let score = 1;
  if (/(thumb|thumbnail)/i.test(s)) score += 3;
  if (/(jpg|jpeg|png|webp)(\?|#|$)/i.test(s)) score += 2;
  if (/sprite|icon|logo/i.test(s)) score -= 4;
  if (/siteicon/i.test(s)) score -= 4;
  return score;
}

function findBestThumbnailUrl($, el, baseUrl) {
  const candidates = [];
  const $el = $(el);

  const pushFromImg = (img) => {
    try {
      const $img = $(img);
      const srcset = $img.attr('data-srcset') || $img.attr('srcset');
      const srcsetUrl = parseSrcsetBestUrl(srcset);
      const raw =
        srcsetUrl ||
        $img.attr('data-src') ||
        $img.attr('data-original') ||
        $img.attr('data-lazy') ||
        $img.attr('src') ||
        '';
      const abs = raw ? stripUrlQueryHash(toAbsoluteUrl(raw, baseUrl)) : '';
      if (abs) candidates.push(abs);
    } catch (_) {}
  };

  // 1) inside the link
  $el.find('img').each((_, img) => pushFromImg(img));

  // 2) nearby container (a few ancestors)
  let $p = $el;
  for (let i = 0; i < 3; i++) {
    $p = $p.parent();
    if (!$p || !$p.length) break;
    $p.find('img').slice(0, 4).each((_, img) => pushFromImg(img));
  }

  let best = { url: '', score: 0 };
  for (const c of candidates) {
    const sc = scoreThumbCandidate(c);
    if (sc > best.score) best = { url: c, score: sc };
  }
  return best.url;
}

function extractIdFromFc2ContentUrl(u) {
  const s = String(u || '');
  const m = s.match(/\/content\/([^/?#]+)/);
  return safeText(m ? m[1] : '');
}

function scoreTitleCandidate(t) {
  const s = safeText(t);
  if (!s) return 0;

  // Duration / counters / badges (avoid picking these as titles)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return 1;
  if (/^\d+(?:\.\d+)?\s*[kKmM]?$/.test(s)) return 1;
  if (s === '全員' || s === '全員★' || s === '★') return 1;

  let score = Math.min(60, s.length);
  if (/[ぁ-んァ-ヶ一-龠]/.test(s)) score += 20;
  if (/\s/.test(s)) score += 3;
  if (/[a-zA-Z]/.test(s)) score += 1;
  return score;
}

function getScrapeUrl(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'popular' || k === 'trend') {
    return String(process.env.FC2_SCRAPE_POPULAR_URL || 'https://video.fc2.com/a/trend').trim();
  }
  return String(process.env.FC2_SCRAPE_LATEST_URL || 'https://video.fc2.com/a/').trim();
}

function isAdultContentUrl(u) {
  const s = String(u || '');
  return /^(https?:\/\/video\.fc2\.com)?\/a\/content\//.test(s) || /^https?:\/\/video\.fc2\.com\/a\/content\//.test(s);
}

async function fetchFromScrape(kind, { limit = 12, ttlMs = DEFAULT_TTL_MS, timeoutMs = 10000 } = {}) {
  const scrapeUrl = getScrapeUrl(kind);
  if (!scrapeUrl) return [];

  const cacheKey = `fc2:scrape:${kind}:${scrapeUrl}:limit:${limit}`;
  const cached = getFromCache(cacheKey, ttlMs);
  if (cached) return cached;

  return runWithInflight(cacheKey, async () => {
    const resp = await axios.get(scrapeUrl, {
      timeout: Math.max(1000, Number(timeoutMs) || 10000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.8',
        'User-Agent': 'mytool/1.0 (+https://example.invalid)',
      },
      validateStatus: () => true,
    });

    if (!resp || resp.status < 200 || resp.status >= 300) {
      const err = new Error(`FC2 scrape request failed status=${resp && resp.status ? resp.status : 'unknown'}`);
      err.code = 'FC2_SCRAPE_HTTP_ERROR';
      err.httpStatus = resp && resp.status ? resp.status : null;
      throw err;
    }

    const html = String(resp.data || '');
    const $ = cheerio.load(html);

    /** @type {Map<string, any>} */
    const byUrl = new Map();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (!isAdultContentUrl(href)) return;

      const abs = stripUrlQueryHash(toAbsoluteUrl(href, scrapeUrl));
      if (!abs || !abs.includes('/a/content/')) return;

      const existing = byUrl.get(abs) || {
        id: extractIdFromFc2ContentUrl(abs) || abs,
        title: '',
        _titleScore: 0,
        _thumbScore: 0,
        url: abs,
        thumbnailUrl: '',
        publishedAt: '',
        publishedAtJp: '',
        tags: [],
      };

      const textTitle = safeText($(el).text());
      const attrTitle = safeText($(el).attr('title'));
      const imgAlt = safeText($(el).find('img').attr('alt'));
      const candidateTitle = textTitle || attrTitle || imgAlt;
      const candScore = scoreTitleCandidate(candidateTitle);
      if (candScore > (existing._titleScore || 0)) {
        existing.title = safeText(candidateTitle);
        existing._titleScore = candScore;
      }

      const thumbUrl = findBestThumbnailUrl($, el, scrapeUrl);
      const thumbScore = scoreThumbCandidate(thumbUrl);
      if (thumbUrl && thumbScore > (existing._thumbScore || 0)) {
        existing.thumbnailUrl = thumbUrl;
        existing._thumbScore = thumbScore;
      }

      byUrl.set(abs, existing);
    });

    const items = Array.from(byUrl.values())
      .map((v) => {
        if (!v || typeof v !== 'object') return v;
        const { _titleScore, _thumbScore, ...rest } = v;
        return rest;
      })
      .filter((v) => v && v.title && v.url)
      .slice(0, Math.max(0, Number(limit) || 0) || 12);

    setCache(cacheKey, items);
    return items;
  });
}

function buildAuth({ headers, params }) {
  const apiKey = String(process.env.FC2_API_KEY || '').trim();
  const mode = String(process.env.FC2_API_AUTH_MODE || 'bearer').trim().toLowerCase();

  if (!apiKey) return { headers, params };

  if (mode === 'query') {
    const keyParam = String(process.env.FC2_API_KEY_PARAM || 'api_key').trim();
    return {
      headers,
      params: { ...(params || {}), [keyParam]: apiKey },
    };
  }

  if (mode === 'header') {
    const headerName = String(process.env.FC2_API_KEY_HEADER || 'X-API-Key').trim();
    return {
      headers: { ...(headers || {}), [headerName]: apiKey },
      params,
    };
  }

  // default: bearer
  return {
    headers: { ...(headers || {}), Authorization: `Bearer ${apiKey}` },
    params,
  };
}

function mapAnyItemToVideo(item) {
  const it = item && typeof item === 'object' ? item : {};

  const id = safeText(it.id || it.videoId || it.contentId || it.code || it.uuid);
  const title = safeText(it.title || it.name || it.caption || it.subject);
  const url = safeText(it.url || it.link || it.permalink || it.watchUrl);
  const thumbnailUrl = safeText(it.thumbnailUrl || it.thumbnail || it.thumb || (it.images && (it.images.thumbnail || it.images.thumb)));
  const publishedAt = safeText(it.publishedAt || it.published || it.createdAt || it.created || it.date);

  const tagsRaw = it.tags || it.tag || [];
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => safeText(t)).filter(Boolean)
    : safeText(tagsRaw)
        .split(/[,、\s]+/)
        .map((t) => safeText(t))
        .filter(Boolean);

  return {
    id: id || url,
    title,
    url,
    thumbnailUrl,
    publishedAt,
    publishedAtJp: toJpDateString(publishedAt),
    tags,
  };
}

async function fetchFromEndpoint(endpointPath, { limit = 12, ttlMs = DEFAULT_TTL_MS, timeoutMs = 8000 } = {}) {
  const baseUrl = sanitizeBaseUrl(process.env.FC2_API_BASE_URL);
  if (!baseUrl) {
    const err = new Error('FC2 API is not configured (missing FC2_API_BASE_URL)');
    err.code = 'FC2_API_CONFIG_MISSING';
    throw err;
  }

  const ep = String(endpointPath || '').trim();
  if (!ep) return [];

  const url = ep.startsWith('http://') || ep.startsWith('https://') ? ep : `${baseUrl}${ep.startsWith('/') ? '' : '/'}${ep}`;

  const cacheKey = `fc2:${url}:limit:${limit}`;
  const cached = getFromCache(cacheKey, ttlMs);
  if (cached) return cached;

  return runWithInflight(cacheKey, async () => {
    const params = limit ? { limit } : {};
    const auth = buildAuth({ headers: {}, params });

    const resp = await axios.get(url, {
      timeout: Math.max(1000, Number(timeoutMs) || 8000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'mytool/1.0 (+https://example.invalid)',
        ...(auth.headers || {}),
      },
      params: auth.params || {},
      validateStatus: () => true,
    });

    if (!resp || resp.status < 200 || resp.status >= 300) {
      const err = new Error(`FC2 API request failed status=${resp && resp.status ? resp.status : 'unknown'}`);
      err.code = 'FC2_API_HTTP_ERROR';
      err.httpStatus = resp && resp.status ? resp.status : null;
      throw err;
    }

    const body = resp.data;
    const items = Array.isArray(body)
      ? body
      : (body && Array.isArray(body.items))
        ? body.items
        : (body && body.data && Array.isArray(body.data))
          ? body.data
          : [];

    const mapped = (items || [])
      .map(mapAnyItemToVideo)
      .filter((v) => v && v.title && v.url)
      .slice(0, Math.max(0, Number(limit) || 0) || 12);

    setCache(cacheKey, mapped);
    return mapped;
  });
}

async function fetchLatestAdultVideos({ limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  const ep = process.env.FC2_API_LATEST_ENDPOINT || '/videos/latest';
  try {
    return await fetchFromEndpoint(ep, { limit, ttlMs });
  } catch (err) {
    if (err && err.code === 'FC2_API_CONFIG_MISSING') {
      return fetchFromScrape('latest', { limit, ttlMs });
    }
    throw err;
  }
}

async function fetchPopularAdultVideos({ limit = 12, ttlMs = DEFAULT_TTL_MS } = {}) {
  const ep = process.env.FC2_API_POPULAR_ENDPOINT || '/videos/popular';
  try {
    return await fetchFromEndpoint(ep, { limit, ttlMs });
  } catch (err) {
    if (err && err.code === 'FC2_API_CONFIG_MISSING') {
      return fetchFromScrape('popular', { limit, ttlMs });
    }
    throw err;
  }
}

module.exports = {
  fetchLatestAdultVideos,
  fetchPopularAdultVideos,
};
