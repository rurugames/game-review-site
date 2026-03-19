const mongoose = require('mongoose');

const DailyOutboundClickSchema = new mongoose.Schema({
  kind: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64,
    index: true,
  },
  section: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64,
    index: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
    index: true,
  },
  date: {
    // YYYY-MM-DD (Asia/Tokyo)
    type: String,
    required: true,
    trim: true,
    maxlength: 10,
    index: true,
  },
  count: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastTs: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

DailyOutboundClickSchema.index({ kind: 1, section: 1, url: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.DailyOutboundClick || mongoose.model('DailyOutboundClick', DailyOutboundClickSchema);
