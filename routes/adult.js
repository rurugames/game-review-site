const express = require('express');
const router = express.Router();

const { sanitizeNextPath } = require('../middleware/adultGate');

const ADULT_DENY_REDIRECT_URL = 'https://www.google.com/';

router.get('/confirm', (req, res) => {
  const nextPath = sanitizeNextPath(req.query && req.query.next);
  res.render('adult/confirm', {
    title: '年齢確認',
    metaDescription: '成人向けコンテンツの閲覧前に年齢確認を行います。',
    metaRobots: 'noindex,nofollow',
    nextPath,
  });
});

router.post('/confirm', (req, res) => {
  const nextPath = sanitizeNextPath(req.body && req.body.next);
  try {
    if (req && req.session) {
      req.session.adultConfirmed = true;
    }
  } catch (_) {}

  res.redirect(nextPath || '/');
});

router.post('/deny', (req, res) => {
  try {
    if (req && req.session) {
      req.session.adultConfirmed = false;
    }
  } catch (_) {}

  res.redirect(ADULT_DENY_REDIRECT_URL);
});

module.exports = router;
