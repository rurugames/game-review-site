const mongoose = require('mongoose');

const RelatedClickSchema = new mongoose.Schema({
  fromArticle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
    index: true,
  },
  toArticle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
    index: true,
  },
  block: {
    type: String,
    enum: ['same_attribute', 'same_developer'],
    required: true,
    index: true,
  },
  position: {
    type: Number,
    min: 1,
    max: 3,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  referrer: {
    type: String,
    trim: true,
    maxlength: 2048,
  },
  ua: {
    type: String,
    trim: true,
    maxlength: 512,
  },
  ipHash: {
    type: String,
    trim: true,
    maxlength: 128,
  },
  ts: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

RelatedClickSchema.index({ fromArticle: 1, block: 1, ts: -1 });
RelatedClickSchema.index({ toArticle: 1, ts: -1 });

module.exports = mongoose.model('RelatedClick', RelatedClickSchema);
