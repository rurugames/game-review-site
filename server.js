require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('passport');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const path = require('path');
const axios = require('axios');
const packageJson = require('./package.json');
const Article = require('./models/Article');
const Comment = require('./models/Comment');
const { createTrafficMonitor } = require('./lib/trafficMonitor');

// Debug helper: find unexpected process exits (set DEBUG_PROCESS_EXIT=1)
if (process.env.DEBUG_PROCESS_EXIT === '1') {
  const originalExit = process.exit.bind(process);
  process.exit = (code) => {
    try {
      const err = new Error('process.exit called');
      console.error('process.exit called with code=', code);
      console.error(err && err.stack ? err.stack : err);
    } catch (_) {}
    return originalExit(code);
  };

  try {
    console.error('[exit-debug] enabled pid=', process.pid, 'node=', process.version, 'platform=', process.platform);
  } catch (_) {}

  try {
    process.on('beforeExit', (code) => {
      try {
        const err = new Error('beforeExit');
        console.error('[exit-debug] beforeExit code=', code);
        console.error(err && err.stack ? err.stack : err);
      } catch (_) {}
    });

    process.on('exit', (code) => {
      try {
        console.error('[exit-debug] exit code=', code);
      } catch (_) {}
    });

    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'];
    for (const sig of signals) {
      try {
        process.on(sig, () => {
          try {
            const err = new Error('signal ' + sig);
            console.error('[exit-debug] received', sig);
            console.error(err && err.stack ? err.stack : err);
          } catch (_) {}
          // Keep default behavior: terminate after logging
          try { originalExit(0); } catch (_) {}
        });
      } catch (_) {
        // ignore unsupported signals
      }
    }
  } catch (_) {}
}

const app = express();
const PORT = process.env.PORT || 3000;
const ASSET_VERSION = String(process.env.ASSET_VERSION || packageJson.version || '1').trim();
const DISABLE_PUBLIC_ARTICLES = process.env.EMERGENCY_DISABLE_PUBLIC_ARTICLES !== '0';
const ENABLE_TRAFFIC_MONITOR = process.env.ENABLE_TRAFFIC_MONITOR !== '0';
const http = require('http');
const server = http.createServer(app);
const { ADMIN_DISPLAY_NAMES, getAdminDisplayNameByEmail, isAdminEmail } = require('./lib/admin');
const Setting = require('./models/Setting');
const dlsiteService = require('./services/dlsiteService');
const trafficMonitor = ENABLE_TRAFFIC_MONITOR
  ? createTrafficMonitor({ intervalMs: Number(process.env.TRAFFIC_MONITOR_INTERVAL_MS || 60 * 1000) || 60 * 1000 })
  : null;

if (trafficMonitor) {
  trafficMonitor.installAxiosMonitor(axios);
}

// Global error handlers to help debugging startup crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});

if (ENABLE_TRAFFIC_MONITOR) {
  console.log('[traffic] monitor enabled');
}

// データベース接続
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB接続成功');
    try {
      // load persisted settings and apply to service
      const pConcurrency = await Setting.get('concurrency', dlsiteService.getSettings ? dlsiteService.getSettings().concurrency : dlsiteService.concurrentFetchLimit);
      const pTTL = await Setting.get('detailsCacheTTL', dlsiteService.getSettings ? dlsiteService.getSettings().detailsCacheTTL : dlsiteService.detailsCacheTTL);
      try { dlsiteService.setConcurrency(Number(pConcurrency) || dlsiteService.concurrentFetchLimit); } catch (e) {}
      try { dlsiteService.setDetailsCacheTTL(Number(pTTL) || dlsiteService.detailsCacheTTL); } catch (e) {}
      // start cache GC using current TTL
      try { dlsiteService.startCacheGC(); } catch (e) {}
      // ensure MongoDB TTL index matches configured TTL
      try {
        const seconds = Math.max(60, Math.floor((Number(pTTL) || dlsiteService.detailsCacheTTL) / 1000));
        const coll = mongoose.connection.collection('gamedetailcaches');
        const indexes = await coll.indexes();
        const existing = indexes.find(i => i.key && i.key.ts === 1);
        if (existing && typeof existing.expireAfterSeconds !== 'undefined' && existing.expireAfterSeconds !== seconds) {
          try {
            await coll.dropIndex(existing.name);
            console.log('Dropped existing TTL index', existing.name);
          } catch (e) {
            try {
              await coll.dropIndex({ ts: 1 });
              console.log('Dropped existing TTL index by key {ts:1}');
            } catch (e2) {
              console.warn('Failed to drop existing TTL index by name and key:', e && e.message ? e.message : e);
            }
          }
        } else if (existing && typeof existing.expireAfterSeconds === 'undefined') {
          // Existing index found but no expireAfterSeconds option — do not attempt to recreate automatically
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
        console.warn('TTL index ensure failed at startup:', e && e.message ? e.message : e);
      }
    } catch (e) {
      console.warn('設定の読み込み/適用に失敗しました', e && e.message ? e.message : e);
    }
  })
  .catch(err => console.error('MongoDB接続エラー:', err));

// Passport設定
require('./config/passport')(passport);

// ミドルウェア設定
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
if (trafficMonitor) {
  app.use(trafficMonitor.createMiddleware());
}
app.get('/images/siteicon.png', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  res.redirect(301, '/images/siteicon.svg');
});
app.get('/images/ruruGames.png', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  res.redirect(301, '/images/ruruGames.svg');
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// セッション設定
if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== 'production') {
  process.env.SESSION_SECRET = 'dev-session-secret';
  try { console.warn('SESSION_SECRET is not set. Using a dev default (NODE_ENV!=production).'); } catch (_) {}
}

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60 // 24時間（秒）
  }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24時間
}));

// Passport初期化
app.use(passport.initialize());
app.use(passport.session());
async function getUnreadReplyCountForUser(userId) {
  try {
    const uid = String(userId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(uid)) return 0;
    const objId = new mongoose.Types.ObjectId(uid);

    const rows = await Comment.aggregate([
      { $match: { parent: { $ne: null }, seenByParentAuthorAt: null, author: { $ne: objId } } },
      {
        $lookup: {
          from: 'comments',
          localField: 'parent',
          foreignField: '_id',
          as: 'parentDoc',
        },
      },
      { $unwind: '$parentDoc' },
      { $match: { 'parentDoc.author': objId } },
      { $count: 'count' },
    ]);
    const n = rows && rows[0] && rows[0].count ? Number(rows[0].count) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

// グローバル変数設定
app.use(async (req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.assetVersion = ASSET_VERSION;
  res.locals.disablePublicArticles = DISABLE_PUBLIC_ARTICLES;
  res.locals.adminDisplayNames = ADMIN_DISPLAY_NAMES;
  res.locals.isAdmin = !!(req.user && isAdminEmail(req.user.email));
  if (req.user) {
    res.locals.displayName = getAdminDisplayNameByEmail(req.user.email) || req.user.displayName;
  }

  // Adult gate state (used for ads / adult-only blocks)
  try {
    res.locals.isAdultConfirmed = !!(req.session && req.session.adultConfirmed);
  } catch (_) {
    res.locals.isAdultConfirmed = false;
  }

  // Affiliate banner config (optional)
  res.locals.fanzaBannerUrl = String(process.env.FANZA_BANNER_URL || '').trim();
  res.locals.fanzaBannerImgUrl = String(process.env.FANZA_BANNER_IMG_URL || '').trim();
  res.locals.fanzaBannerAlt = String(process.env.FANZA_BANNER_ALT || 'FANZA').trim();

  // 未読返信通知（自分のコメントに付いた返信）
  res.locals.notificationCount = 0;
  if (req.user) {
    res.locals.notificationCount = await getUnreadReplyCountForUser(req.user.id);
  }

  // Search Console verification (HTML tag method)
  res.locals.googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION || '';

  // SEO helpers
  const rawSiteUrl = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || '';
  const proto = forwardedProto || req.protocol || 'http';
  const computedSiteUrl = host ? `${proto}://${host}` : '';
  const siteUrl = rawSiteUrl || computedSiteUrl;

  res.locals.siteUrl = siteUrl;
  res.locals.canonicalUrl = siteUrl ? `${siteUrl}${req.path}` : req.path;

  // Default meta (can be overridden per render)
  res.locals.metaDescription = 'R18Hubは成人向け同人PCゲームのレビュー/攻略/ランキングをまとめて探せるサイトです。';
  res.locals.ogType = 'website';
  res.locals.ogImage = siteUrl ? `${siteUrl}/images/siteicon.png` : '/images/siteicon.png';

  // noindex for utility/admin pages
  const p = req.path || '';
  const isNoindex =
    p.startsWith('/admin') ||
    p.startsWith('/dashboard') ||
    p.startsWith('/csv') ||
    p.startsWith('/generator') ||
    p.startsWith('/auth') ||
    p.startsWith('/adult') ||
    p.startsWith('/out') ||
    p.startsWith('/comments') ||
    p.startsWith('/users') ||
    p.startsWith('/search') ||
    p.startsWith('/events') ||
    p === '/videos/fc2' ||
    (DISABLE_PUBLIC_ARTICLES && p === '/articles') ||
    /^\/articles\/.+\/edit$/.test(p) ||
    p === '/articles/new';
  res.locals.metaRobots = isNoindex ? 'noindex,nofollow' : 'index,follow';

  next();
});

// Google Search Console verification (fallback if static file serving is unavailable)
app.get('/googlee4cfbb7a627606e5.html', (req, res) => {
  res.status(200);
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send('google-site-verification: googlee4cfbb7a627606e5.html');
});

// robots.txt
app.get('/robots.txt', (req, res) => {
  const rawSiteUrl = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || '';
  const proto = forwardedProto || req.protocol || 'http';
  const siteUrl = rawSiteUrl || (host ? `${proto}://${host}` : '');

  res.type('text/plain; charset=utf-8');
  res.send([
    'User-agent: *',
    // Avoid crawling pages that are behind gates or likely to create redirect chains.
    // This helps reduce bot traffic / response counts.
    'Disallow: /adult/',
    'Disallow: /videos/fc2',
    ...(DISABLE_PUBLIC_ARTICLES ? ['Disallow: /articles'] : []),
    'Allow: /',
    siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml` : null,
    '',
  ].filter(Boolean).join('\n'));
});

// sitemap.xml
app.get('/sitemap.xml', async (req, res) => {
  const rawSiteUrl = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || '';
  const proto = forwardedProto || req.protocol || 'http';
  const siteUrl = rawSiteUrl || (host ? `${proto}://${host}` : '');

  if (!siteUrl) {
    return res.status(500).type('text/plain').send('SITE_URL is not configured');
  }

  const escapeXml = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  try {
    // Note: Exclude gated pages like /videos/fc2 from sitemap to avoid bot crawl/redirect loops.
    const staticPaths = ['/', '/videos', '/updates', '/help', '/contact'];
    if (!DISABLE_PUBLIC_ARTICLES) {
      staticPaths.splice(2, 0, '/articles');
    }
    const urls = staticPaths.map((p) => ({ loc: `${siteUrl}${p}`, lastmod: null }));

    if (!DISABLE_PUBLIC_ARTICLES) {
      const articles = await Article.find({ status: 'published' })
        .select('_id updatedAt createdAt')
        .sort({ updatedAt: -1 })
        .limit(5000)
        .lean();

      for (const a of (articles || [])) {
        const ts = a.updatedAt || a.createdAt;
        urls.push({
          loc: `${siteUrl}/articles/${a._id}`,
          lastmod: ts ? new Date(ts).toISOString() : null,
        });
      }
    }

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((u) => {
        const parts = [
          '<url>',
          `  <loc>${escapeXml(u.loc)}</loc>`,
          u.lastmod ? `  <lastmod>${escapeXml(u.lastmod)}</lastmod>` : null,
          '</url>'
        ].filter(Boolean);
        return parts.join('\n');
      }),
      '</urlset>',
      ''
    ].join('\n');

    res.type('application/xml; charset=utf-8').send(body);
  } catch (e) {
    console.error('sitemap generation failed:', e);
    res.status(500).type('text/plain').send('sitemap generation failed');
  }
});

// Health check (for keep-alive pings)
app.get('/healthz', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

// ルート
app.use('/', require('./routes/index'));
app.use('/adult', require('./routes/adult'));
app.use('/auth', require('./routes/auth'));
app.use('/articles', require('./routes/articles'));
app.use('/videos', require('./routes/videos'));
app.use('/comments', require('./routes/comments'));
app.use('/reviews', require('./routes/reviews'));
app.use('/users', require('./routes/users'));
app.use('/events', require('./routes/events'));
app.use('/generator', require('./routes/generator'));
app.use('/csv', require('./routes/csv'));
app.use('/out', require('./routes/out'));
app.use('/gallery', require('./routes/gallery'));

// サーバー起動
server.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
