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
  uploadDate: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GalleryImage', galleryImageSchema);
