const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const dlsiteService = require('../services/dlsiteService');
const socketLib = require('../lib/socket');
const path = require('path');
const ejs = require('ejs');
const mongoose = require('mongoose');
const Setting = require('../models/Setting');
const CacheGCLog = require('../models/CacheGCLog');
const youtubeApi = require('../services/youtubeDataApiService');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const RelatedClick = require('../models/RelatedClick');
const RelatedImpression = require('../models/RelatedImpression');
const { isAdminEmail } = require('../lib/admin');

// キャッシュ設定
let rankingCache = null;
let rankingCacheTime = null;
let rankingFetchInProgress = false;
let rankingFetchLastError = null;
let rankingFetchLastStarted = null;
let rankingFetchLastFinished = null;
let rankingFetchProgress = 0;
let rankingFetchTarget = 0;
let rankingFetchPromise = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1日
const { ensureAdmin } = require('../middleware/auth');

// Contact form (simple in-memory rate limit)
const contactRate = new Map();
const contactCooldown = new Map();
const contactDedupe = new Map();
const contactInFlight = new Map();
const CONTACT_RATE_WINDOW_MS = 10 * 60 * 1000;
const CONTACT_RATE_MAX = 5;
// fixed anti-spam timings
// - same IP+email: cannot send again within 10 minutes
// - same content (IP+email+subject+message): cannot send again within 1 hour
const CONTACT_COOLDOWN_MS = 10 * 60 * 1000;
const CONTACT_DEDUPE_WINDOW_MS = 60 * 60 * 1000;
// in-flight suppression: prevent double-submit while SMTP is processing
const CONTACT_INFLIGHT_TTL_MS = 2 * 60 * 1000;

function getClientIp(req) {
  try {
    const xf = req.headers['x-forwarded-for'];
    if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
    if (Array.isArray(xf) && xf[0]) return String(xf[0]).trim();
  } catch (_) {}
  return (req.ip || req.connection?.remoteAddress || '').toString();
}

function isRateLimited(key, now = Date.now()) {
  const rec = contactRate.get(key);
  if (!rec) {
    contactRate.set(key, { count: 1, start: now });
    return false;
  }
  if (now - rec.start > CONTACT_RATE_WINDOW_MS) {
    contactRate.set(key, { count: 1, start: now });
    return false;
  }
  rec.count += 1;
  contactRate.set(key, rec);
  return rec.count > CONTACT_RATE_MAX;
}

function isCoolingDown(key, now = Date.now()) {
  if (CONTACT_COOLDOWN_MS <= 0) return false;
  const last = contactCooldown.get(key);
  if (!last) return false;
  return (now - last) < CONTACT_COOLDOWN_MS;
}

function markSent(key, now = Date.now()) {
  contactCooldown.set(key, now);
}

function makeDedupeKey(ip, email, subject, message) {
  const raw = `${ip}\n${email}\n${subject}\n${message}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function isDuplicateSubmission(key, now = Date.now()) {
  if (CONTACT_DEDUPE_WINDOW_MS <= 0) return false;
  const last = contactDedupe.get(key);
  if (!last) return false;
  return (now - last) < CONTACT_DEDUPE_WINDOW_MS;
}

function markDuplicateSubmission(key, now = Date.now()) {
  contactDedupe.set(key, now);
}

function isInFlight(key, now = Date.now()) {
  const ts = contactInFlight.get(key);
  if (!ts) return false;
  if (CONTACT_INFLIGHT_TTL_MS > 0 && (now - ts) > CONTACT_INFLIGHT_TTL_MS) {
    contactInFlight.delete(key);
    return false;
  }
  return true;
}

function markInFlight(key, now = Date.now()) {
  contactInFlight.set(key, now);
}

function clearInFlight(key) {
  contactInFlight.delete(key);
}

function sanitizeSingleLine(value, maxLen) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeMultiline(value, maxLen) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, maxLen);
}

function createMailTransport() {
  const smtpUrl = (process.env.SMTP_URL || '').trim();
  if (smtpUrl) {
    return nodemailer.createTransport(smtpUrl);
  }
  const host = (process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

/**
 * Start or return existing ranking fetch promise.
 * Ensures only one fetch runs at a time and emits progress/status via socketLib.
 * @param {number} maxItems
 * @returns {Promise<Array>} resolves to ranking array
 */
function startRankingFetch(maxItems = 100) {
  if (rankingFetchInProgress && rankingFetchPromise) {
    return rankingFetchPromise;
  }
  rankingFetchInProgress = true;
  rankingFetchLastStarted = Date.now();
  rankingFetchProgress = 0;
  rankingFetchTarget = maxItems;

  rankingFetchPromise = (async () => {
    try {
        const fetched = await dlsiteService.fetchPopularRanking(maxItems, (count) => {
        rankingFetchProgress = count;
        try { socketLib.emit('ranking:progress', makeStatus()); } catch (e) {}
      });
        rankingCache = fetched || [];
        // set cache time before rendering partial so emitted HTML shows correct timestamps
        rankingCacheTime = Date.now();
        // render partial HTML for clients to replace without reload (include status info)
        try {
          const partialPath = path.join(__dirname, '..', 'views', 'partials', 'rankingList.ejs');
          // limit to top 10 for the partial sent to home clients
          const limited = Array.isArray(rankingCache) ? rankingCache.slice(0, 10) : [];
          const rankingStatus = makeStatus();
          const rankingStatusFormatted = {
            lastUpdatedStr: rankingStatus.cacheTime ? formatJp(rankingStatus.cacheTime) : null,
            nextUpdateStr: rankingStatus.nextUpdate ? formatJp(rankingStatus.nextUpdate) : null
          };
          const html = await ejs.renderFile(partialPath, { ranking: limited, per: 10, totalCount: limited.length, page: 1, totalPages: 1, query: {}, rankingStatus, rankingStatusFormatted });
          try {
            socketLib.emit('ranking:complete', { html, rankingStatus });
            console.log('Emitted ranking:complete with html length=', html ? html.length : 0);
          } catch (e) {}
        } catch (renderErr) {
          console.warn('ランキング部分レンダリング失敗:', renderErr && renderErr.message ? renderErr.message : renderErr);
        }
        rankingFetchLastFinished = Date.now();
      rankingFetchLastError = null;
      try { socketLib.emit('ranking:status', makeStatus()); } catch (e) {}
      return rankingCache;
    } catch (err) {
      rankingFetchLastError = String(err || err.message || err);
      rankingFetchLastFinished = Date.now();
      try { socketLib.emit('ranking:status', makeStatus()); } catch (e) {}
      throw err;
    } finally {
      rankingFetchInProgress = false;
      rankingFetchPromise = null;
      try { socketLib.emit('ranking:status', makeStatus()); } catch (e) {}
    }
  })();

  return rankingFetchPromise;
}

// ホームページ - 記事一覧とDLsiteランキング
router.get('/', async (req, res) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('author')
      .sort({ createdAt: -1 })
      .limit(10);

    // YouTube Data API v3
    const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID || '';
    const youtubeRecommendedPlaylistId = process.env.YOUTUBE_RECOMMENDED_PLAYLIST_ID || '';
    let latestVideos = [];
    let recommendedVideos = [];

    try {
      // APIキーが無い場合はサービスが例外を投げるので握りつぶしてスキップ
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
    
    // ランキング取得（キャッシュ優先）。キャッシュ未取得時はバックグラウンドで取得を開始し即時レンダリングする。
    let ranking = [];
    const now = Date.now();

    if (rankingCache && rankingCacheTime && (now - rankingCacheTime < CACHE_DURATION)) {
      // キャッシュ有効
      ranking = rankingCache;
      console.log('ランキングキャッシュ使用');
    } else {
      // キャッシュが無ければ、既に取得中でなければバックグラウンドで取得を開始
      if (!rankingFetchInProgress) {
        // fire-and-forget のバックグラウンド取得（startRankingFetch が重複を防ぐ）
        console.log('ランキングのバックグラウンド取得を開始します');
        startRankingFetch(100)
          .then((fetched) => {
            console.log('ランキングのバックグラウンド取得が完了しました:', (fetched || []).length, '件');
          })
          .catch((bgErr) => {
            console.error('ランキングのバックグラウンド取得でエラー:', bgErr);
          });
      } else {
        console.log('ランキング取得は既にバックグラウンドで進行中');
      }
      // 現時点ではキャッシュが無いため空配列を表示
      ranking = rankingCache || [];
    }
    
    const heroHtml = `
      <div class="hero">
        <h1>✨ (R18)PC同人ゲームレビューサイト ✨</h1>
        <p>最新の同人PCゲーム情報・攻略・レビューをチェック！</p>
      </div>
    `;

    // ホームではランキングは上位10件だけ表示（内部では最大100件取得してキャッシュ）
    const topRanking = Array.isArray(ranking) ? ranking.slice(0, 10) : [];
    const rankingStatus = makeStatus();
    const rankingStatusFormatted = {
      lastUpdatedStr: rankingStatus.cacheTime ? formatJp(rankingStatus.cacheTime) : null,
      nextUpdateStr: rankingStatus.nextUpdate ? formatJp(rankingStatus.nextUpdate) : null
    };
    res.render('index', {
      title: 'トップ',
      metaDescription: '成人向け同人PCゲームの最新記事・人気ランキング・おすすめ動画をまとめてチェックできます。',
      articles,
      ranking: topRanking,
      heroHtml,
      rankingStatus,
      rankingStatusFormatted,
      latestVideos,
      recommendedVideos,
      youtubeChannelId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// Help page
router.get('/help', function(req, res, next) {
  res.render('help', { title: 'ヘルプ' });
});

// Contact page
router.get('/contact', function(req, res) {
  const sent = String(req.query.sent || '') === '1';
  res.render('contact', {
    title: 'お問い合わせ',
    sent,
    error: null,
    form: null,
  });
});

router.post('/contact', async function(req, res) {
  const ip = getClientIp(req);
  const now = Date.now();

  // spam対策: honeypot / レート制限
  const company = String((req.body && req.body.company) || '').trim();
  if (company) {
    return res.redirect('/contact?sent=1');
  }
  if (isRateLimited(ip, now)) {
    return res.status(429).render('contact', {
      title: 'お問い合わせ',
      sent: false,
      error: '送信回数が多すぎます。時間をおいて再度お試しください。',
      form: {
        name: sanitizeSingleLine(req.body?.name, 80),
        email: sanitizeSingleLine(req.body?.email, 120),
        subject: sanitizeSingleLine(req.body?.subject, 120),
        message: sanitizeMultiline(req.body?.message, 4000),
      },
    });
  }

  const name = sanitizeSingleLine(req.body?.name, 80);
  const email = sanitizeSingleLine(req.body?.email, 120);
  const subject = sanitizeSingleLine(req.body?.subject, 120);
  const message = sanitizeMultiline(req.body?.message, 4000);

  // クールダウン（IP+メールの組み合わせ）
  const coolKey = `${ip}|${email}`;
  if (email && isCoolingDown(coolKey, now)) {
    return res.status(429).render('contact', {
      title: 'お問い合わせ',
      sent: false,
      error: '短時間に連続送信できません。少し時間をおいて再度お試しください。',
      form: { name, email, subject, message },
    });
  }

  // 同一内容の重複送信抑止（連打/再送対策）
  const dedupeKey = makeDedupeKey(ip, email, subject, message);
  if (isDuplicateSubmission(dedupeKey, now)) {
    // 既に送信済み扱いでメールは送らず、UXは成功に寄せる
    return res.redirect('/contact?sent=1');
  }

  // 送信処理中の二重送信を防止
  const inflightKey = `${coolKey}|${dedupeKey}`;
  if (isInFlight(inflightKey, now)) {
    return res.status(429).render('contact', {
      title: 'お問い合わせ',
      sent: false,
      error: '送信処理中です。少し時間をおいて再度お試しください。',
      form: { name, email, subject, message },
    });
  }
  markInFlight(inflightKey, now);

  if (!name || !email || !subject || !message) {
    return res.status(400).render('contact', {
      title: 'お問い合わせ',
      sent: false,
      error: '必須項目を入力してください。',
      form: { name, email, subject, message },
    });
  }

  const to = sanitizeSingleLine(process.env.CONTACT_TO_EMAIL, 200);
  const from = sanitizeSingleLine(process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER, 200);

  if (!to) {
    return res.status(500).render('contact', {
      title: 'お問い合わせ',
      sent: false,
      error: '現在お問い合わせフォームは利用できません。時間をおいて再度お試しください。',
      form: { name, email, subject, message },
    });
  }

  const transporter = createMailTransport();
  if (!transporter) {
    return res.status(500).render('contact', {
      title: 'お問い合わせ',
      sent: false,
      error: '現在お問い合わせフォームは利用できません。時間をおいて再度お試しください。',
      form: { name, email, subject, message },
    });
  }

  try {
    const ua = sanitizeSingleLine(req.headers['user-agent'], 300);
    const text = [
      'お問い合わせフォームからの送信',
      '',
      `お名前: ${name}`,
      `返信先: ${email}`,
      `件名: ${subject}`,
      '',
      '内容:',
      message,
      '',
      `IP: ${ip}`,
      `UA: ${ua}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');

    await transporter.sendMail({
      to,
      from: from || to,
      replyTo: email,
      subject: `[Contact] ${subject}`,
      text,
    });

    // success: mark cooldown + dedupe
    try { markSent(coolKey, now); } catch (_) {}
    try { markDuplicateSubmission(dedupeKey, now); } catch (_) {}

    return res.redirect('/contact?sent=1');
  } catch (e) {
    console.error('Contact mail send failed:', e);
    return res.status(500).render('contact', {
      title: 'お問い合わせ',
      sent: false,
      error: '送信に失敗しました。時間をおいて再度お試しください。',
      form: { name, email, subject, message },
    });
  } finally {
    try { clearInFlight(inflightKey); } catch (_) {}
  }
});

// 人気ランキング専用ページ
router.get('/ranking', async (req, res) => {
  try {
    let ranking = [];
    const now = Date.now();
    let isLoading = false;
    if (rankingCache && rankingCacheTime && (now - rankingCacheTime < CACHE_DURATION)) {
      ranking = rankingCache;
      console.log('ランキングキャッシュ使用 (/ranking)');
    } else if (rankingFetchInProgress) {
      // 既に取得中でキャッシュが空 → ローディング画面を返す
      console.log('ランキングは取得中のためローディング画面を表示します (/ranking)');
      isLoading = true;
      ranking = rankingCache || [];
    } else {
      try {
        ranking = await startRankingFetch(100) || [];
      } catch (error) {
        rankingFetchLastError = String(error || error.message || error);
        console.error('ランキング取得失敗 (/ranking):', error);
        ranking = rankingCache || [];
      }
    }

    const heroHtml = `
      <div class="hero">
        <h1>人気ランキング TOP10</h1>
        <p>DLsite の人気ランキング上位を一覧で表示します。</p>
      </div>
    `;

    // 件数制御 + ページネーション
    const allowed = [10, 30, 50, 100];
    let per = parseInt(req.query.per, 10) || 10;
    if (!allowed.includes(per)) per = 10;
    let page = parseInt(req.query.page, 10) || 1;
    if (page < 1) page = 1;

    const totalCount = Array.isArray(ranking) ? ranking.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / per));
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * per;
    const limitedRanking = Array.isArray(ranking) ? ranking.slice(start, start + per) : [];

    const rankingStatus = makeStatus();
    const rankingStatusFormatted = {
      lastUpdatedStr: rankingStatus.cacheTime ? formatJp(rankingStatus.cacheTime) : null,
      nextUpdateStr: rankingStatus.nextUpdate ? formatJp(rankingStatus.nextUpdate) : null
    };
    res.render('ranking', {
      title: '人気ランキング',
      metaDescription: 'DLsiteの人気ランキング上位を一覧で表示します。',
      ranking: limitedRanking,
      heroHtml,
      per,
      totalCount,
      page,
      totalPages,
      query: req.query,
      isLoading,
      rankingStatus,
      rankingStatusFormatted
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 部分レンダリング: ランキング表示用の HTML 断片を返す（非同期差し替え用）
router.get('/ranking/partial', async (req, res) => {
  try {
    // same per/page handling as /ranking
    const allowed = [10, 30, 50, 100];
    let per = parseInt(req.query.per, 10) || 10;
    if (!allowed.includes(per)) per = 10;
    let page = parseInt(req.query.page, 10) || 1;

    const now = Date.now();
    if (!(rankingCache && rankingCacheTime && (now - rankingCacheTime < CACHE_DURATION))) {
      // nothing cached yet
      return res.status(204).send();
    }

    const ranking = rankingCache || [];
    const totalCount = Array.isArray(ranking) ? ranking.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / per));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * per;
    const limitedRanking = Array.isArray(ranking) ? ranking.slice(start, start + per) : [];

    // render partial template and return HTML
    const ejs = require('ejs');
    const path = require('path');
    const partialPath = path.join(__dirname, '..', 'views', 'partials', 'rankingList.ejs');
    const rankingStatus = makeStatus();
    const rankingStatusFormatted = {
      lastUpdatedStr: rankingStatus.cacheTime ? formatJp(rankingStatus.cacheTime) : null,
      nextUpdateStr: rankingStatus.nextUpdate ? formatJp(rankingStatus.nextUpdate) : null
    };
    const html = await ejs.renderFile(partialPath, { ranking: limitedRanking, per, totalCount, page, totalPages, query: req.query, rankingStatus, rankingStatusFormatted });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('ranking partial error', e && e.message ? e.message : e);
    res.status(500).send('部分レンダリングに失敗しました');
  }
});

// ランキング取得ステータス（簡易API）
router.get('/ranking-status', (req, res) => {
  res.json({
    inProgress: !!rankingFetchInProgress,
    lastStarted: rankingFetchLastStarted ? new Date(rankingFetchLastStarted).toISOString() : null,
    lastFinished: rankingFetchLastFinished ? new Date(rankingFetchLastFinished).toISOString() : null,
    lastError: rankingFetchLastError || null,
    cachedCount: Array.isArray(rankingCache) ? rankingCache.length : 0,
    cacheTime: rankingCacheTime ? new Date(rankingCacheTime).toISOString() : null,
    progress: {
      fetched: rankingFetchProgress || 0,
      target: rankingFetchTarget || 0
    }
  });
});

// helper for socket initial status
function makeStatus() {
  return {
    inProgress: !!rankingFetchInProgress,
    lastStarted: rankingFetchLastStarted ? new Date(rankingFetchLastStarted).toISOString() : null,
    lastFinished: rankingFetchLastFinished ? new Date(rankingFetchLastFinished).toISOString() : null,
    lastError: rankingFetchLastError || null,
    cachedCount: Array.isArray(rankingCache) ? rankingCache.length : 0,
    cacheTime: rankingCacheTime ? new Date(rankingCacheTime).toISOString() : null,
    nextUpdate: (rankingCacheTime ? new Date(rankingCacheTime + CACHE_DURATION).toISOString() : null),
    progress: { fetched: rankingFetchProgress || 0, target: rankingFetchTarget || 0 }
  };
}

// Format timestamp to JST human readable string 'YYYY年MM月DD日 HH:mm:ss'
function formatJp(ts) {
  try {
    if (!ts) return null;
    const d = new Date(ts);
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const jst = new Date(utc + (9 * 60 * 60 * 1000));
    const Y = jst.getFullYear();
    const M = String(jst.getMonth() + 1).padStart(2, '0');
    const D = String(jst.getDate()).padStart(2, '0');
    const hh = String(jst.getHours()).padStart(2, '0');
    const mm = String(jst.getMinutes()).padStart(2, '0');
    const ss = String(jst.getSeconds()).padStart(2, '0');
    return `${Y}年${M}月${D}日 ${hh}:${mm}:${ss}`;
  } catch (e) {
    return String(ts || '');
  }
}

// expose for server.js to call on new socket
exports.getRankingStatus = makeStatus;

// expose helper to get rendered partial HTML for cached ranking (or null)
exports.getRankingPartialHtml = async function(per = 10, page = 1) {
  try {
    const now = Date.now();
    if (!(rankingCache && rankingCacheTime && (now - rankingCacheTime < CACHE_DURATION))) return null;
    const ranking = rankingCache || [];
    const totalCount = Array.isArray(ranking) ? ranking.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / per));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * per;
    const limitedRanking = Array.isArray(ranking) ? ranking.slice(start, start + per) : [];
    const ejs = require('ejs');
    const path = require('path');
    const partialPath = path.join(__dirname, '..', 'views', 'partials', 'rankingList.ejs');
    // For helper use (emit on socket connect), prefer to render only the limited set and present its total as limited length
    const rankingStatus = makeStatus();
    const rankingStatusFormatted = {
      lastUpdatedStr: rankingStatus.cacheTime ? formatJp(rankingStatus.cacheTime) : null,
      nextUpdateStr: rankingStatus.nextUpdate ? formatJp(rankingStatus.nextUpdate) : null
    };
    const html = await ejs.renderFile(partialPath, { ranking: limitedRanking, per, totalCount: limitedRanking.length, page, totalPages: Math.max(1, Math.ceil(limitedRanking.length / per)), query: {}, rankingStatus, rankingStatusFormatted });
    return html;
  } catch (e) {
    console.warn('getRankingPartialHtml error', e && e.message ? e.message : e);
    return null;
  }
};

// 管理用: 強制ランキング更新をトリガー (管理者専用)
router.post('/admin/ranking-refresh', ensureAdmin, (req, res) => {
  if (rankingFetchInProgress) {
    return res.status(409).json({ success: false, message: 'ランキング取得は既に進行中です' });
  }

  // start background fetch via centralized helper
  startRankingFetch(100)
    .then((fetched) => {
      console.log('管理者トリガー: ランキング取得完了:', (fetched || []).length);
    })
    .catch((err) => {
      rankingFetchLastError = String(err || err.message || err);
      console.error('管理者トリガー: ランキング取得エラー:', err);
    });

  res.status(202).json({ success: true, message: 'ランキング更新をバックグラウンドで開始しました' });
});

// 管理用: 最新キャッシュをダウンロード (JSON)
router.get('/admin/ranking-download', ensureAdmin, (req, res) => {
  if (!Array.isArray(rankingCache) || rankingCache.length === 0) {
    return res.status(404).json({ success: false, message: 'ランキングキャッシュがありません' });
  }
  const filename = `ranking_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(rankingCache, null, 2));
});

// 管理用: 設定ページの表示
router.get('/admin/settings', ensureAdmin, async (req, res) => {
  try {
    const current = dlsiteService.getSettings ? dlsiteService.getSettings() : { concurrency: 8, detailsCacheTTL: 3600000 };
    // read persisted values if any
    const pConcurrency = await Setting.get('concurrency', current.concurrency);
    const pTTL = await Setting.get('detailsCacheTTL', current.detailsCacheTTL);
    // render TTL in minutes for admin UI
    // fetch recent GC logs (last 10)
    let recentGC = [];
    try {
      recentGC = await CacheGCLog.find().sort({ ts: -1 }).limit(10).lean();
    } catch (e) {
      console.warn('Failed to read recent GC logs:', e && e.message ? e.message : e);
    }
    res.render('admin/settings', { settings: { concurrency: Number(pConcurrency), detailsCacheTTL: Number(pTTL) }, recentGC });
  } catch (e) {
    console.error('設定ページ取得エラー:', e);
    res.status(500).send('設定の取得に失敗しました');
  }
});

// 管理用: 設定の更新
router.post('/admin/settings', ensureAdmin, async (req, res) => {
  try {
    const concurrency = Number(req.body.concurrency) || 1;
    // Admin posts TTL in minutes; convert to milliseconds for storage and runtime
    const detailsCacheTTLMinutes = Number(req.body.detailsCacheTTL) || 60;
    const detailsCacheTTL = Math.max(1, detailsCacheTTLMinutes) * 60 * 1000;
    await Setting.set('concurrency', concurrency);
    await Setting.set('detailsCacheTTL', detailsCacheTTL);
    // apply to running service
    try { dlsiteService.setConcurrency(concurrency); } catch (e) {}
    try { dlsiteService.setDetailsCacheTTL(detailsCacheTTL); } catch (e) {}
    // restart cache GC to pick up new TTL
    try { dlsiteService.stopCacheGC(); dlsiteService.startCacheGC(); } catch (e) {}

    // Update MongoDB TTL index (expireAfterSeconds)
    try {
      const coll = mongoose.connection.collection('gamedetailcaches');
      const seconds = Math.max(60, Math.floor(detailsCacheTTL / 1000));
      const indexes = await coll.indexes();
      const existing = indexes.find(i => i.key && i.key.ts === 1);
      if (existing && typeof existing.expireAfterSeconds !== 'undefined' && existing.expireAfterSeconds !== seconds) {
        try {
          await coll.dropIndex(existing.name);
          console.log('Dropped existing TTL index', existing.name);
        } catch (e) {
          try { await coll.dropIndex({ ts: 1 }); console.log('Dropped existing TTL index by key {ts:1}'); } catch (e2) { console.warn('Failed to drop existing TTL index by name and key:', e && e.message ? e.message : e); }
        }
        try {
          await coll.createIndex({ ts: 1 }, { expireAfterSeconds: seconds, background: true });
          console.log('Created/updated TTL index on GameDetailCache.ts expireAfterSeconds=', seconds);
        } catch (e) {
          console.warn('Failed to create TTL index after dropping existing:', e && e.message ? e.message : e);
        }
      } else if (existing && typeof existing.expireAfterSeconds === 'undefined') {
        console.warn('Existing index on GameDetailCache.ts exists without expireAfterSeconds. Please drop index "' + existing.name + '" manually or via DB admin to enable TTL indexing. Skipping automatic TTL index creation.');
      } else {
        try {
          await coll.createIndex({ ts: 1 }, { expireAfterSeconds: seconds, background: true });
          console.log('Created/updated TTL index on GameDetailCache.ts expireAfterSeconds=', seconds);
        } catch (e) {
          console.warn('Failed to create TTL index:', e && e.message ? e.message : e);
        }
      }
    } catch (e) {
      console.warn('TTL index update failed:', e && e.message ? e.message : e);
    }

    res.json({ success: true, settings: { concurrency, detailsCacheTTL } });
  } catch (e) {
    console.error('設定更新エラー:', e);
    res.status(500).json({ success: false, message: '設定の保存に失敗しました' });
  }
});

// 管理用: 今すぐGC実行
router.post('/admin/run-gc', ensureAdmin, async (req, res) => {
  try {
    if (typeof dlsiteService.runGCNow !== 'function') {
      return res.status(500).json({ success: false, message: 'GC機能がサーバに存在しません' });
    }
    const result = await dlsiteService.runGCNow();
    // return latest GC logs including this run
    let recentGC = [];
    try { recentGC = await CacheGCLog.find().sort({ ts: -1 }).limit(10).lean(); } catch (e) {}
    res.json({ success: true, result, recentGC });
  } catch (e) {
    console.error('admin run-gc error', e);
    res.status(500).json({ success: false, message: 'GC実行に失敗しました' });
  }
});

// 検索ページ
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const genre = (req.query.genre || '').trim();
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;

    // 検索ワークフロー: 1) Article は $text 検索（インデックスを使用）+ フィルタ、2) ranking（games）はローカルフィルタ
    const articlesQuery = { status: 'published' };
    let projection = {};
    let sort = { createdAt: -1 };

    if (q) {
      // $text 検索を利用
      articlesQuery.$text = { $search: q };
      // NOTE: projection を指定すると指定フィールド以外が返らないため、表示/ハイライトに必要な項目も含める
      projection = {
        score: { $meta: 'textScore' },
        title: 1,
        gameTitle: 1,
        imageUrl: 1,
        featuredImage: 1,
        description: 1,
        excerpt: 1,
        content: 1,
        tags: 1,
        genre: 1,
        developer: 1,
        platform: 1,
        releaseDate: 1,
        createdAt: 1,
      };
      sort = { score: { $meta: 'textScore' }, createdAt: -1 };
    }

    if (genre) {
      articlesQuery.genre = genre;
    }

    if (fromDate || toDate) {
      articlesQuery.releaseDate = {};
      if (fromDate) articlesQuery.releaseDate.$gte = fromDate;
      if (toDate) articlesQuery.releaseDate.$lte = toDate;
    }

    let articles = await Article.find(articlesQuery, projection)
      .sort(sort)
      .limit(50)
      .lean();

    // 提供するジャンル一覧（フィルタUI用）
    let genres = [];
    try {
      genres = await Article.distinct('genre', { status: 'published' });
      genres = genres.filter(Boolean).sort();
    } catch (e) {
      console.error('ジャンル取得エラー:', e);
    }

    // ハイライト用ユーティリティ
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function makeHighlightedSnippet(text, query, maxLen = 220) {
      if (!text) return '';
      // strip HTML tags so raw tags don't appear in excerpts
      const withoutTags = String(text).replace(/<[^>]*>/g, '');
      const plain = withoutTags;
      if (!query) {
        return escapeHtml(plain.slice(0, maxLen)) + (plain.length > maxLen ? '…' : '');
      }
      const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(q, 'ig');
      const match = re.exec(plain);
      let start = 0;
      if (match) {
        start = Math.max(0, match.index - Math.floor(maxLen / 2));
      }
      let snippet = plain.slice(start, start + maxLen);
      snippet = escapeHtml(snippet);
      // ハイライト（<mark>）を挿入 — マッチ部分だけエスケープ済み文字列に置換
      snippet = snippet.replace(new RegExp(q, 'ig'), function(m){ return '<mark class="search-highlight">' + escapeHtml(m) + '</mark>'; });
      if (start > 0) snippet = '…' + snippet;
      if (plain.length > start + maxLen) snippet = snippet + '…';
      return snippet;
    }

    // prepare highlighted excerpts
    articles = articles.map(a => {
      const source = a.content || a.description || '';
      a._highlight = makeHighlightedSnippet(source, q);
      // Prepare safe highlighted title: strip tags, escape, then insert <mark>
      const rawTitle = String(a.title || '');
      const titlePlain = rawTitle.replace(/<[^>]*>/g, '');
      const escapedTitle = escapeHtml(titlePlain);
      if (q) {
        const qEsc = q.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
        const reTitle = new RegExp(qEsc, 'ig');
        a._highlightTitle = escapedTitle.replace(reTitle, m => '<mark class="search-highlight">' + escapeHtml(m) + '</mark>');
      } else {
        a._highlightTitle = escapedTitle;
      }
      return a;
    });

    // ランキング（games）側の絞り込み: キーワード、価格帯
    let games = [];
    try {
      if (typeof dlsiteService.fetchPopularRanking === 'function') {
        // search内の同期取得は startRankingFetch を使って重複を防止
        let ranking = [];
        try {
          ranking = await startRankingFetch(100) || [];
        } catch (eFetch) {
          rankingFetchLastError = String(eFetch || eFetch.message || eFetch);
          ranking = rankingCache || [];
        }
        const qLower = q.toLowerCase();
        games = ranking.filter(g => {
          const matchesQ = !q || ((g.title && g.title.toLowerCase().includes(qLower)) || (g.circle && g.circle.toLowerCase().includes(qLower)));
          if (!matchesQ) return false;
          // price filter (if provided) - attempt to extract digits
          if ((minPrice !== null && !isNaN(minPrice)) || (maxPrice !== null && !isNaN(maxPrice))) {
            let p = null;
            if (g.price) {
              const m = String(g.price).replace(/[,\s]/g, '').match(/(\d+)/);
              if (m) p = Number(m[1]);
            }
            if (p === null) return false;
            if (minPrice !== null && !isNaN(minPrice) && p < minPrice) return false;
            if (maxPrice !== null && !isNaN(maxPrice) && p > maxPrice) return false;
          }
          return true;
        }).slice(0, 24);
      }
    } catch (err) {
      rankingFetchInProgress = false;
      rankingFetchLastError = String(err || err.message || err);
      console.error('ランキング検索中にエラー:', err);
      games = [];
    }

    // ハイライトをゲームタイトルにも付与（簡易）
    if (q) {
      const qEsc = q.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
      const re = new RegExp(qEsc, 'ig');
      games = games.map(g => {
        const raw = String(g.title || '');
        const plain = raw.replace(/<[^>]*>/g, '');
        const esc = escapeHtml(plain);
        g._titleHighlighted = esc.replace(re, m => '<mark class="search-highlight">' + escapeHtml(m) + '</mark>');
        return g;
      });
    }

    const total = (articles ? articles.length : 0) + (games ? games.length : 0);
    res.render('search', { query: q, articles, games, total, filters: { genre, minPrice, maxPrice, fromDate: req.query.fromDate || '', toDate: req.query.toDate || '' }, genres });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// ダッシュボード（ログイン必須）
router.get('/dashboard', ensureAuth, async (req, res) => {
  try {
    const allowedPer = [10, 20, 50, 100];
    let per = parseInt(req.query.per, 10) || 20;
    if (!allowedPer.includes(per)) per = 20;
    let page = parseInt(req.query.page, 10) || 1;
    if (page < 1) page = 1;

    const articlesQuery = { author: req.user.id };
    const totalCount = await Article.countDocuments(articlesQuery);
    const totalPages = Math.max(1, Math.ceil(totalCount / per));
    if (page > totalPages) page = totalPages;

    const articles = await Article.find(articlesQuery)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * per)
      .limit(per);

    let relatedClicks = [];
    let relatedClicksByBlock = [];
    let relatedClicksByBlockPosition = [];
    let relatedClicksTopDestinations = [];

    let relatedImpressionsByBlock = [];
    let relatedImpressionsByBlockPosition = [];

    let relatedCtrByBlock = [];
    let relatedCtrByPosition = [];

    const isAdmin = !!(req.user && isAdminEmail(req.user.email));
    if (isAdmin) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      relatedClicks = await RelatedClick.find({ ts: { $gte: since } })
        .sort({ ts: -1 })
        .limit(50)
        .populate('fromArticle', 'title gameTitle')
        .populate('toArticle', 'title gameTitle')
        .lean();

      relatedClicksByBlock = await RelatedClick.aggregate([
        { $match: { ts: { $gte: since } } },
        { $group: { _id: '$block', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]);

      relatedClicksByBlockPosition = await RelatedClick.aggregate([
        { $match: { ts: { $gte: since } } },
        { $group: { _id: { block: '$block', position: '$position' }, count: { $sum: 1 } } },
        { $sort: { count: -1, '_id.block': 1, '_id.position': 1 } },
      ]);

      relatedImpressionsByBlock = await RelatedImpression.aggregate([
        { $match: { ts: { $gte: since } } },
        { $group: { _id: '$block', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]);

      relatedImpressionsByBlockPosition = await RelatedImpression.aggregate([
        { $match: { ts: { $gte: since } } },
        { $group: { _id: { block: '$block', position: '$position' }, count: { $sum: 1 } } },
        { $sort: { count: -1, '_id.block': 1, '_id.position': 1 } },
      ]);

      // CTR = clicks / impressions
      const clickByBlock = new Map((relatedClicksByBlock || []).map((r) => [String(r._id), Number(r.count) || 0]));
      const impByBlock = new Map((relatedImpressionsByBlock || []).map((r) => [String(r._id), Number(r.count) || 0]));
      const blocks = Array.from(new Set([...clickByBlock.keys(), ...impByBlock.keys()]));
      relatedCtrByBlock = blocks.map((block) => {
        const clicks = clickByBlock.get(block) || 0;
        const impressions = impByBlock.get(block) || 0;
        const ctr = impressions > 0 ? clicks / impressions : null;
        return { block, clicks, impressions, ctr };
      }).sort((a, b) => (b.ctr || 0) - (a.ctr || 0));

      const clickByPos = new Map((relatedClicksByBlockPosition || []).map((r) => {
        const b = r && r._id ? String(r._id.block) : '';
        const p = r && r._id ? (r._id.position == null ? '' : String(r._id.position)) : '';
        return [`${b}|${p}`, Number(r.count) || 0];
      }));
      const impByPos = new Map((relatedImpressionsByBlockPosition || []).map((r) => {
        const b = r && r._id ? String(r._id.block) : '';
        const p = r && r._id ? (r._id.position == null ? '' : String(r._id.position)) : '';
        return [`${b}|${p}`, Number(r.count) || 0];
      }));
      const posKeys = Array.from(new Set([...clickByPos.keys(), ...impByPos.keys()]));
      relatedCtrByPosition = posKeys.map((key) => {
        const [block, positionStr] = key.split('|');
        const position = positionStr ? Number(positionStr) : null;
        const clicks = clickByPos.get(key) || 0;
        const impressions = impByPos.get(key) || 0;
        const ctr = impressions > 0 ? clicks / impressions : null;
        return { block, position, clicks, impressions, ctr };
      }).sort((a, b) => (b.ctr || 0) - (a.ctr || 0));

      relatedClicksTopDestinations = await RelatedClick.aggregate([
        { $match: { ts: { $gte: since } } },
        { $group: { _id: { toArticle: '$toArticle', block: '$block' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: 'articles',
            localField: '_id.toArticle',
            foreignField: '_id',
            as: 'toArticle',
          },
        },
        { $unwind: { path: '$toArticle', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            count: 1,
            block: '$_id.block',
            toArticleId: '$_id.toArticle',
            toTitle: '$toArticle.title',
            toGameTitle: '$toArticle.gameTitle',
          },
        },
      ]);
    }

    res.render('dashboard', {
      articles,
      per,
      totalCount,
      page,
      totalPages,
      query: req.query,
      relatedClicks,
      relatedClicksByBlock,
      relatedClicksByBlockPosition,
      relatedClicksTopDestinations,
      relatedImpressionsByBlock,
      relatedImpressionsByBlockPosition,
      relatedCtrByBlock,
      relatedCtrByPosition,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 認証チェックミドルウェア
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

module.exports = router;
