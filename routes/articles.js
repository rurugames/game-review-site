const express = require('express');
const router = express.Router();
const Article = require('../models/Article');

// 認証チェックミドルウェア
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

// 新規記事作成フォーム
router.get('/new', ensureAuth, (req, res) => {
  res.render('articles/new');
});

// 記事作成
router.post('/', ensureAuth, async (req, res) => {
  try {
    const articleData = {
      ...req.body,
      author: req.user.id
    };
    
    // タグの処理（カンマ区切りの文字列を配列に変換）
    if (req.body.tags) {
      articleData.tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    await Article.create(articleData);
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の作成に失敗しました');
  }
});

// 記事詳細
router.get('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id)
      .populate('author');
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    // 閲覧数を増加
    article.views += 1;
    await article.save();
    
    res.render('articles/show', { article });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 記事編集フォーム
router.get('/:id/edit', ensureAuth, async (req, res) => {
  try {
    const article = await Article.findOne({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    res.render('articles/edit', { article });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 記事更新
router.put('/:id', ensureAuth, async (req, res) => {
  try {
    let article = await Article.findOne({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    const updateData = { ...req.body };
    
    // タグの処理
    if (req.body.tags) {
      updateData.tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    article = await Article.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });
    
    res.redirect(`/articles/${article._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の更新に失敗しました');
  }
});

// 記事削除
router.delete('/:id', ensureAuth, async (req, res) => {
  try {
    const article = await Article.findOne({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    await Article.findByIdAndDelete(req.params.id);
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の削除に失敗しました');
  }
});

module.exports = router;
