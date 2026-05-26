const express = require('express');
const router = express.Router();
const FreeVideo = require('../models/FreeVideo');
const { ensureAdmin } = require('../middleware/auth');
const AdTag = require('../models/AdTag');

async function fetchDefaultAdTag() {
  try {
    const doc = await AdTag.findOne({ keyword: 'default', isActive: true }).lean();
    return doc ? doc.adHtml : null;
  } catch {
    return null;
  }
}

// @route   GET /free-videos
// @desc    無料動画一覧
router.get('/', async (req, res) => {
  try {
    const [videos, adTag] = await Promise.all([
      FreeVideo.find({ status: 'published' }).sort({ createdAt: -1 }).lean(),
      fetchDefaultAdTag(),
    ]);
    res.render('free-videos/index', {
      title: 'FANZA無料動画',
      videos,
      adTag,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// @route   GET /free-videos/:id
// @desc    無料動画詳細
router.get('/:id', async (req, res) => {
  try {
    const video = await FreeVideo.findById(req.params.id).lean();
    if (!video || video.status !== 'published') {
      return res.status(404).send('ページが見つかりません');
    }
    const adTag = await fetchDefaultAdTag();
    res.render('free-videos/show', {
      title: video.title,
      video,
      adTag,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// @route   GET /free-videos/:id/edit
// @desc    編集フォーム（管理者のみ）
router.get('/:id/edit', ensureAdmin, async (req, res) => {
  try {
    const video = await FreeVideo.findById(req.params.id).lean();
    if (!video) return res.status(404).send('ページが見つかりません');
    res.render('free-videos/edit', { title: '無料動画を編集', video });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// @route   PUT /free-videos/:id
// @desc    更新（管理者のみ）
router.put('/:id', ensureAdmin, async (req, res) => {
  try {
    const video = await FreeVideo.findById(req.params.id);
    if (!video) return res.status(404).send('ページが見つかりません');

    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const affiliateLinkRaw = String(req.body.affiliateLink || '').trim();

    if (!title || !description || !affiliateLinkRaw) {
      return res.status(400).send('タイトル・説明文・アフィリエイトリンクは必須です');
    }
    try { new URL(affiliateLinkRaw); } catch {
      return res.status(400).send('アフィリエイトリンクのURLが不正です');
    }

    const imageUrl = String(req.body.imageUrl || '').trim();

    video.title = title;
    video.description = description;
    video.affiliateLink = affiliateLinkRaw;
    if (imageUrl) {
      try { new URL(imageUrl); video.imageUrl = imageUrl; } catch {}
    } else {
      video.imageUrl = undefined;
    }
    video.actress = String(req.body.actress || '').split(',').map(s => s.trim()).filter(Boolean);
    video.maker = String(req.body.maker || '').trim() || undefined;
    video.series = String(req.body.series || '').trim() || undefined;
    video.tags = String(req.body.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    const vc = parseInt(req.body.viewCount, 10);
    video.viewCount = isNaN(vc) ? undefined : vc;
    video.status = req.body.status === 'draft' ? 'draft' : 'published';

    await video.save();
    res.redirect('/admin/free-videos');
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// @route   DELETE /free-videos/:id
// @desc    削除（管理者のみ）
router.delete('/:id', ensureAdmin, async (req, res) => {
  try {
    await FreeVideo.findByIdAndDelete(req.params.id);
    res.redirect('/admin/free-videos');
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

module.exports = router;
