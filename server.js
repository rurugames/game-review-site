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

// データベース接続
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB接続成功'))
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
  next();
});

// ルート
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/articles', require('./routes/articles'));
app.use('/comments', require('./routes/comments'));

// サーバー起動
app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
