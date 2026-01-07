const mongoose = require('mongoose');

const REVIEW_HEADLINE_MAX = 200;
const TAG_MAX_LEN = 20;
const TAG_MAX_ITEMS = 3;

const PLAYTIME_BUCKETS = ['lt1', '1to5', '5to20', '20plus'];

const ReviewSchema = new mongoose.Schema({
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
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  headline: {
    type: String,
    required: true,
    trim: true,
    maxlength: REVIEW_HEADLINE_MAX,
  },
  prosTags: [{
    type: String,
    trim: true,
    maxlength: TAG_MAX_LEN,
  }],
  consTags: [{
    type: String,
    trim: true,
    maxlength: TAG_MAX_LEN,
  }],
  playtimeBucket: {
    type: String,
    enum: PLAYTIME_BUCKETS,
    default: null,
  },
  spoiler: {
    type: Boolean,
    default: false,
  },
  helpfulBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  helpfulCount: {
    type: Number,
    default: 0,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ReviewSchema.index({ article: 1, author: 1 }, { unique: true });

ReviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Keep helpfulCount in sync
  if (Array.isArray(this.helpfulBy)) {
    this.helpfulCount = this.helpfulBy.length;
  } else {
    this.helpfulCount = 0;
  }
  // Hard cap tags length/count defensively
  const capTags = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const t of arr) {
      const v = String(t || '').trim();
      if (!v) continue;
      if (v.length > TAG_MAX_LEN) continue;
      if (!out.includes(v)) out.push(v);
      if (out.length >= TAG_MAX_ITEMS) break;
    }
    return out;
  };
  this.prosTags = capTags(this.prosTags);
  this.consTags = capTags(this.consTags);

  next();
});

module.exports = mongoose.model('Review', ReviewSchema);
module.exports.REVIEW_HEADLINE_MAX = REVIEW_HEADLINE_MAX;
module.exports.PLAYTIME_BUCKETS = PLAYTIME_BUCKETS;
module.exports.TAG_MAX_ITEMS = TAG_MAX_ITEMS;
module.exports.TAG_MAX_LEN = TAG_MAX_LEN;
