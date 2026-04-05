const express = require('express');
const router = express.Router();
const GalleryImage = require('../models/GalleryImage');

// デバッグ: DB接続先とドキュメント数を返す（確認後に削除）
router.get('/debug-count', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const dbName = db ? db.databaseName : 'unknown';
    const total = await GalleryImage.countDocuments();
    const published = await GalleryImage.countDocuments({ status: 'published' });
    res.json({ dbName, total, published });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// ギャラリートップページ取得
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    // 最新順にソートして公開済みの画像を取得
    const images = await GalleryImage.find({ status: 'published' })
      .sort({ uploadDate: -1 })
      .skip(skip)
      .limit(limit);

    const totalImages = await GalleryImage.countDocuments({ status: 'published' });
    const totalPages = Math.ceil(totalImages / limit);

    res.render('gallery', {
      title: 'ギャラリー',
      images,
      currentPage: page,
      totalPages,
      user: req.user // passportのログイン状況を渡す
    });
  } catch (err) {
    console.error('Gallery Fetch Error:', err);
    res.status(500).render('error', { 
      message: 'ギャラリーの読み込み中にエラーが発生しました。',
      error: err
    });
  }
});

// 特定の画像詳細ページ（必要であれば）
router.get('/:id', async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image) {
       return res.status(404).render('error', { message: '画像が見つかりません。' });
    }
    
    // 詳細表示用デザインは必要に応じて追加
    res.render('gallery-detail', { 
      title: image.title,
      image,
      user: req.user 
    });
  } catch(err) {
    console.error('Gallery Detail Fetch Error:', err);
    res.status(500).render('error', { message: 'エラーが発生しました。' });
  }
});

module.exports = router;
