const mongoose = require('mongoose');

const galleryImageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  r2Url: {
    type: String,
    required: true,
    trim: true
  },
  r2Key: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  },
  views: {
    type: Number,
    default: 0
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  bookmarks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
});

galleryImageSchema.virtual('likeCount').get(function () {
  return this.likes ? this.likes.length : 0;
});

galleryImageSchema.virtual('bookmarkCount').get(function () {
  return this.bookmarks ? this.bookmarks.length : 0;
});

module.exports = mongoose.model('GalleryImage', galleryImageSchema);
