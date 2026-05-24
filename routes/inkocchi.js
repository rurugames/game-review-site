const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('inkocchi', {
    title: 'インコっち',
    metaDescription: 'ドット絵のインコを育てるブラウザゲーム。たまごからせいちょうしたインコへ進化させよう！',
    layout: 'layout',
  });
});

module.exports = router;
