const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// 許可されたメールアドレスのリスト
const ALLOWED_EMAILS = [
  'hiderance1919@gmail.com', // あなたのメールアドレス
  // 他のユーザーを追加する場合はここに追加
];

module.exports = function(passport) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      
      // メールアドレスが許可リストに含まれているか確認
      if (!ALLOWED_EMAILS.includes(email)) {
        return done(null, false, { message: 'このメールアドレスではログインできません。' });
      }
      
      // ユーザーが既に存在するか確認
      let user = await User.findOne({ googleId: profile.id });

      if (user) {
        // 既存ユーザー
        return done(null, user);
      } else {
        // 新規ユーザー作成
        user = await User.create({
          googleId: profile.id,
          displayName: profile.displayName,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          email: profile.emails[0].value,
          image: profile.photos[0].value
        });
        return done(null, user);
      }
    } catch (err) {
      console.error(err);
      return done(err, null);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};
