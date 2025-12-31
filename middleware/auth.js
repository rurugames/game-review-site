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
    if (req.isAuthenticated() && req.user.email === 'hiderance1919@gmail.com') {
      return next();
    }
    res.status(403).send('管理者のみアクセス可能です');
  }
};
