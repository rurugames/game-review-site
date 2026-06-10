const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('koma', {
    title: 'Koma - マンガビューワアプリ',
    metaDescription: 'KomaはZIP・CBZ・RAR・CBR・EPUBに対応した無料のAndroidマンガビューワアプリです。読書中は広告ゼロで快適に読めます。',
    layout: 'layout',
  });
});

module.exports = router;
