const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Review = require('../models/Review');
const Article = require('../models/Article');
const { ensureAuth } = require('../middleware/auth');
const { isAdminEmail } = require('../lib/admin');

function parseTags(raw, { maxItems = 3, maxLen = 20 } = {}) {
  const src = String(raw || '').trim();
  if (!src) return [];
  const parts = src
    .split(/[,、]/)
    .map((t) => String(t || '').trim())
    .filter(Boolean);

  const out = [];
  for (const t of parts) {
    if (t.length > maxLen) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizePlaytimeBucket(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const allowed = new Set(['lt1', '1to5', '5to20', '20plus']);
  return allowed.has(s) ? s : null;
}

// @route   POST /reviews/:articleId
// @desc    レビュー投稿/更新（1ユーザー1作品、upsert）
router.post('/:articleId', ensureAuth, async (req, res) => {
  try {
    const articleId = String(req.params.articleId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(articleId)) {
      return res.status(400).send('記事IDが不正です');
    }

    const article = await Article.findById(articleId).lean();
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }

    const rating = parseInt(String(req.body.rating || ''), 10);
    const headline = String(req.body.headline || '').trim();
    const prosTags = parseTags(req.body.prosTags);
    const consTags = parseTags(req.body.consTags);
    const playtimeBucket = normalizePlaytimeBucket(req.body.playtimeBucket);
    const spoiler = !!req.body.spoiler;

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).send('評価（★1〜5）が不正です');
    }
    if (!headline) {
      return res.status(400).send('短評が空です');
    }
    if (headline.length > 200) {
      return res.status(400).send('短評は200文字以内で入力してください');
    }

    const existed = await Review.exists({ article: articleId, author: req.user.id });

    await Review.updateOne(
      { article: articleId, author: req.user.id },
      {
        $set: {
          rating,
          headline,
          prosTags,
          consTags,
          playtimeBucket,
          spoiler,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          article: articleId,
          author: req.user.id,
          createdAt: new Date(),
          helpfulBy: [],
          helpfulCount: 0,
        },
      },
      { upsert: true }
    );

    // 投稿直後のフィードバック表示用（記事詳細で1回だけ消費）
    try {
      if (req.session) {
        req.session.reviewJustPosted = {
          articleId,
          action: existed ? 'updated' : 'created',
          rating,
          ts: Date.now(),
        };
      }
    } catch (_) {}

    res.redirect(`/articles/${articleId}#reviews`);
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラー');
  }
});

// @route   POST /reviews/:reviewId/helpful
// @desc    「参考になった」トグル
router.post('/:reviewId/helpful', ensureAuth, async (req, res) => {
  try {
    const reviewId = String(req.params.reviewId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).send('レビューIDが不正です');
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).send('レビューが見つかりません');
    }

    const uid = String(req.user.id);
    const exists = Array.isArray(review.helpfulBy) && review.helpfulBy.some((x) => String(x) === uid);
    if (exists) {
      review.helpfulBy = review.helpfulBy.filter((x) => String(x) !== uid);
    } else {
      review.helpfulBy = Array.isArray(review.helpfulBy) ? review.helpfulBy : [];
      review.helpfulBy.push(new mongoose.Types.ObjectId(uid));
    }

    await review.save();

    res.redirect(`/articles/${review.article}#reviews`);
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラー');
  }
});

// @route   DELETE /reviews/:id
// @desc    レビュー削除（投稿者または管理者）
router.delete('/:id', ensureAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('レビューIDが不正です');
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).send('レビューが見つかりません');
    }

    const isOwner = String(review.author) === String(req.user.id);
    const isAdmin = !!(req.user && isAdminEmail(req.user.email));
    if (!isOwner && !isAdmin) {
      return res.status(403).send('削除権限がありません');
    }

    const articleId = String(review.article);
    await Review.deleteOne({ _id: id });

    res.redirect(`/articles/${articleId}#reviews`);
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラー');
  }
});

module.exports = router;
