const express = require('express');
const router = express.Router();
const passport = require('passport');

// Google認証
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Googleコールバック
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/',
    failureFlash: false 
  }),
  (req, res) => {
    // 管理者はダッシュボードへ、一般ユーザーはトップページへ
    if (req.user.email === 'hiderance1919@gmail.com') {
      res.redirect('/dashboard');
    } else {
      res.redirect('/');
    }
  }
);

// ログアウト
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/');
  });
});

module.exports = router;
