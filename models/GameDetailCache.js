const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GameDetailCacheSchema = new Schema({
  gameId: { type: String, required: true, unique: true, index: true },
  details: { type: Schema.Types.Mixed },
  ts: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.models.GameDetailCache || mongoose.model('GameDetailCache', GameDetailCacheSchema);
