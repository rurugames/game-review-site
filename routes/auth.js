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
    if (!req.user) {
      // 認証失敗時（許可されていないユーザー）
      return res.redirect('/?error=unauthorized');
    }
    res.redirect('/dashboard');
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
