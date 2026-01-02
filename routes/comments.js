const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Article = require('../models/Article');
const { ensureAuth } = require('../middleware/auth');

// @route   POST /comments/:articleId
// @desc    コメント投稿
router.post('/:articleId', ensureAuth, async (req, res) => {
  try {
    const article = await Article.findById(req.params.articleId);
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }

    await Comment.create({
      content: req.body.content,
      article: req.params.articleId,
      author: req.user.id
    });

    res.redirect(`/articles/${req.params.articleId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラー');
  }
});

// @route   DELETE /comments/:id
// @desc    コメント削除（管理者または投稿者のみ）
router.delete('/:id', ensureAuth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).send('コメントが見つかりません');
    }

    // 管理者または投稿者のみ削除可能
    const { isAdminEmail } = require('../lib/admin');
    if (comment.author.toString() !== req.user.id && !(req.user && isAdminEmail(req.user.email))) {
      return res.status(403).send('削除権限がありません');
    }

    await Comment.findByIdAndDelete(req.params.id);
    res.redirect('back');
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラー');
  }
});

module.exports = router;
