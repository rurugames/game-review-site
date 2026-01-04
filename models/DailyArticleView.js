const mongoose = require('mongoose');

const DailyArticleViewSchema = new mongoose.Schema({
  day: {
    type: String, // YYYY-MM-DD (JST)
    required: true,
    index: true,
  },
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
    index: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  views: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

DailyArticleViewSchema.index({ day: 1, article: 1 }, { unique: true, name: 'DailyArticleViewDayArticleUnique' });
DailyArticleViewSchema.index({ author: 1, day: 1 }, { name: 'DailyArticleViewAuthorDay' });

DailyArticleViewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('DailyArticleView', DailyArticleViewSchema);
