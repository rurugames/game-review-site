const mongoose = require('mongoose');

const CacheGCLogSchema = new mongoose.Schema({
  ts: { type: Date, default: Date.now, index: true },
  deletedCount: { type: Number, default: 0 }
});

module.exports = mongoose.models.CacheGCLog || mongoose.model('CacheGCLog', CacheGCLogSchema);
