const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
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

    const content = String(req.body.content || '').trim();
    const parentIdRaw = req.body.parentId;
    const parentId = parentIdRaw ? String(parentIdRaw).trim() : '';

    if (!content) {
      return res.status(400).send('コメント内容が空です');
    }

    let parent = null;
    if (parentId) {
      if (!mongoose.Types.ObjectId.isValid(parentId)) {
        return res.status(400).send('返信先コメントが不正です');
      }
      parent = await Comment.findById(parentId);
      if (!parent) {
        return res.status(404).send('返信先コメントが見つかりません');
      }
      // 同じ記事への返信のみ許可
      if (String(parent.article) !== String(req.params.articleId)) {
        return res.status(400).send('返信先コメントが不正です');
      }
      // 返信の多段化は避け、1段階のみ（親がトップレベルのみ許可）
      if (parent.parent) {
        return res.status(400).send('返信は1段階までです');
      }
    }

    await Comment.create({
      content,
      parent: parent ? parent._id : null,
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('コメントIDが不正です');
    }
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).send('コメントが見つかりません');
    }

    // 管理者または投稿者のみ削除可能
    const { isAdminEmail } = require('../lib/admin');
    if (comment.author.toString() !== req.user.id && !(req.user && isAdminEmail(req.user.email))) {
      return res.status(403).send('削除権限がありません');
    }

    // 親コメントの削除時は、直下の返信も削除（1段階）
    await Comment.deleteMany({ $or: [{ _id: comment._id }, { parent: comment._id }] });
    res.redirect('back');
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラー');
  }
});

module.exports = router;
