const mongoose = require('mongoose');

const FreeVideoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    affiliateLink: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    actress: [{ type: String, trim: true }],
    maker: {
      type: String,
      trim: true,
    },
    series: {
      type: String,
      trim: true,
    },
    tags: [{ type: String, trim: true }],
    viewCount: {
      type: Number,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'published',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FreeVideo', FreeVideoSchema);
