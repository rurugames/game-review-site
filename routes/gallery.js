const express = require('express');
const router = express.Router();
const GalleryImage = require('../models/GalleryImage');
const GalleryComment = require('../models/GalleryComment');

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'ログインが必要です' });
}

// ギャラリートップ
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const images = await GalleryImage.find({ status: 'published' })
      .sort({ uploadDate: -1 })
      .skip(skip)
      .limit(limit);

    const totalImages = await GalleryImage.countDocuments({ status: 'published' });
    const totalPages = Math.ceil(totalImages / limit);

    // ログイン中ユーザーがいいね済みのIDセットを渡す
    const likedSet = new Set();
    if (req.user) {
      images.forEach(img => {
        if (img.likes && img.likes.some(uid => String(uid) === String(req.user._id))) {
          likedSet.add(String(img._id));
        }
      });
    }

    res.render('gallery', {
      title: 'ギャラリー',
      images,
      likedSet,
      currentPage: page,
      totalPages,
      user: req.user
    });
  } catch (err) {
    console.error('Gallery Fetch Error:', err);
    res.status(500).send('ギャラリーの読み込み中にエラーが発生しました。');
  }
});

// 画像詳細ページ
router.get('/:id', async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image || image.status !== 'published') {
      return res.status(404).send('画像が見つかりません。');
    }

    const comments = await GalleryComment.find({ image: image._id })
      .populate('author', 'displayName profilePhoto')
      .sort({ createdAt: 1 });

    const liked = req.user
      ? image.likes.some(uid => String(uid) === String(req.user._id))
      : false;

    res.render('gallery-detail', {
      title: image.title,
      image,
      comments,
      liked,
      queryError: req.query.error === '1',
      user: req.user
    });
  } catch (err) {
    console.error('Gallery Detail Error:', err);
    res.status(500).send('エラーが発生しました。');
  }
});

// いいねトグル（ログイン必須、JSON API）
router.post('/:id/like', ensureAuth, async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image) return res.status(404).json({ error: '画像が見つかりません' });

    const userId = req.user._id;
    const alreadyLiked = image.likes.some(uid => String(uid) === String(userId));

    if (alreadyLiked) {
      image.likes = image.likes.filter(uid => String(uid) !== String(userId));
    } else {
      image.likes.push(userId);
    }
    await image.save();

    res.json({ liked: !alreadyLiked, likeCount: image.likes.length });
  } catch (err) {
    console.error('Like Error:', err);
    res.status(500).json({ error: 'いいねの処理に失敗しました' });
  }
});

// コメント投稿（ログイン必須）
router.post('/:id/comment', ensureAuth, async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image) return res.status(404).send('画像が見つかりません。');

    const content = String(req.body.content || '').trim();
    if (!content || content.length > 500) {
      return res.redirect(`/gallery/${req.params.id}?error=1`);
    }

    await GalleryComment.create({
      image: image._id,
      author: req.user._id,
      content
    });

    res.redirect(`/gallery/${req.params.id}#comments`);
  } catch (err) {
    console.error('Comment Error:', err);
    res.redirect(`/gallery/${req.params.id}?error=1`);
  }
});

// コメント削除（本人のみ）
router.post('/comment/:commentId/delete', ensureAuth, async (req, res) => {
  try {
    const comment = await GalleryComment.findById(req.params.commentId);
    if (!comment) return res.status(404).send('コメントが見つかりません。');
    if (String(comment.author) !== String(req.user._id)) {
      return res.status(403).send('削除権限がありません。');
    }
    const imageId = comment.image;
    await comment.deleteOne();
    res.redirect(`/gallery/${imageId}#comments`);
  } catch (err) {
    console.error('Comment Delete Error:', err);
    res.status(500).send('削除に失敗しました。');
  }
});

module.exports = router;
