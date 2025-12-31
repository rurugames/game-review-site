const express = require('express');
const router = express.Router();
const Article = require('../models/Article');

// ホームページ - 記事一覧
router.get('/', async (req, res) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('author')
      .sort({ createdAt: -1 })
      .limit(20);
    
    // URLパラメータからエラーメッセージを取得
    const error = req.query.error;
    let errorMessage = null;
    if (error === 'unauthorized') {
      errorMessage = 'このメールアドレスではログインできません。管理者にお問い合わせください。';
    }
    
    res.render('index', { articles, errorMessage });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// ダッシュボード（ログイン必須）
router.get('/dashboard', ensureAuth, async (req, res) => {
  try {
    const articles = await Article.find({ author: req.user.id })
      .sort({ createdAt: -1 });
    
    res.render('dashboard', { articles });
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
