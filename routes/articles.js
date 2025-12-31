const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');

// 新規記事作成フォーム（管理者のみ）
router.get('/new', ensureAdmin, (req, res) => {
  res.render('articles/new');
});

// 記事作成（管理者のみ）
router.post('/', ensureAdmin, async (req, res) => {
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
    
    // コメントを取得
    const comments = await Comment.find({ article: req.params.id })
      .populate('author')
      .sort({ createdAt: -1 });
    
    // 閲覧数を増加
    article.views += 1;
    await article.save();
    
    res.render('articles/show', { article, comments });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 記事編集フォーム（管理者のみ）
router.get('/:id/edit', ensureAdmin, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    res.render('articles/edit', { article });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 記事更新（管理者のみ）
router.put('/:id', ensureAdmin, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    const updateData = { ...req.body };
    
    // タグの処理
    if (req.body.tags) {
      updateData.tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    await Article.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });
    
    res.redirect(`/articles/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の更新に失敗しました');
  }
});

// 記事削除（管理者のみ）
router.delete('/:id', ensureAdmin, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    // 記事に関連するコメントも削除
    await Comment.deleteMany({ article: req.params.id });
    await Article.findByIdAndDelete(req.params.id);
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の削除に失敗しました');
  }
});

module.exports = router;
