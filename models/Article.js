const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  gameTitle: {
    type: String,
    required: true,
    trim: true
  },
  genre: {
    type: String,
    trim: true
  },
  releaseDate: {
    type: Date
  },
  developer: {
    type: String,
    trim: true
  },
  platform: {
    type: String,
    default: 'PC',
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 10
  },
  imageUrl: {
    type: String
  },
  affiliateLink: {
    type: String
  },
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  },
  views: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 更新時にupdatedAtを自動更新
ArticleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// テキスト検索用のインデックスを作成
ArticleSchema.index({
  title: 'text',
  gameTitle: 'text',
  description: 'text',
  content: 'text',
  tags: 'text'
}, {
  name: 'ArticleTextIndex',
  weights: { title: 10, gameTitle: 8, tags: 5, description: 3, content: 1 }
});

module.exports = mongoose.model('Article', ArticleSchema);
