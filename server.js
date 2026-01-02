require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const socketLib = require('./lib/socket');
const Setting = require('./models/Setting');
const dlsiteService = require('./services/dlsiteService');

// Global error handlers to help debugging startup crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});

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
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24時間
}));

// Passport初期化
app.use(passport.initialize());
app.use(passport.session());

// グローバル変数設定
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  // 管理者の表示名を「管理者」に変更
  if (req.user && req.user.email === 'hiderance1919@gmail.com') {
    res.locals.displayName = '管理者';
  } else if (req.user) {
    res.locals.displayName = req.user.displayName;
  }
  next();
});

// Health check (for keep-alive pings)
app.get('/healthz', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

// ルート
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/articles', require('./routes/articles'));
app.use('/comments', require('./routes/comments'));
app.use('/generator', require('./routes/generator'));
app.use('/csv', require('./routes/csv'));

// Socket.IO 初期化
const io = new Server(server, { path: '/socket.io' });
socketLib.set(io);

io.on('connection', (socket) => {
  console.log('クライアントが接続しました:', socket.id);
  // 初期ステータスを送る（routes/index.js が中身を持つ）
  try {
    const routes = require('./routes/index');
    if (typeof routes.getRankingStatus === 'function') {
      socket.emit('ranking:status', routes.getRankingStatus());
    }
    // If cache exists, also send rendered partial HTML so clients can update immediately
    try {
      if (typeof routes.getRankingPartialHtml === 'function') {
        routes.getRankingPartialHtml().then(html => {
          if (html) {
            socket.emit('ranking:complete', { html });
            try { console.log('Sent ranking:complete to new socket', socket.id, 'htmlLength=', html.length); } catch (e) {}
          }
        }).catch((err) => { console.warn('getRankingPartialHtml err', err && err.message ? err.message : err); });
      }
    } catch (e) {
      // ignore
    }
  } catch (e) {
    // ignore
  }
});

// サーバー起動
server.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
