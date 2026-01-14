const mongoose = require('mongoose');

const DailyArticleReferrerSchema = new mongoose.Schema({
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
  refType: {
    type: String,
    enum: ['direct', 'internal', 'external'],
    required: true,
    index: true,
  },
  refHost: {
    type: String,
    default: '',
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

DailyArticleReferrerSchema.index(
  { day: 1, article: 1, refType: 1, refHost: 1 },
  { unique: true, name: 'DailyArticleReferrerDayArticleRefUnique' }
);
DailyArticleReferrerSchema.index({ author: 1, day: 1 }, { name: 'DailyArticleReferrerAuthorDay' });

DailyArticleReferrerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('DailyArticleReferrer', DailyArticleReferrerSchema);
