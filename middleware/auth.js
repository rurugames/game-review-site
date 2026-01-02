module.exports = {
  ensureAuth: function (req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/');
  },
  ensureGuest: function (req, res, next) {
    if (!req.isAuthenticated()) {
      return next();
    }
    res.redirect('/dashboard');
  },
  ensureAdmin: function (req, res, next) {
    const { isAdminEmail } = require('../lib/admin');
    if (req.isAuthenticated() && req.user && isAdminEmail(req.user.email)) {
      return next();
    }
    res.status(403).send('管理者のみアクセス可能です');
  }
};
