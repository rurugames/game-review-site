const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Fc2VideoCacheSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  items: { type: [Schema.Types.Mixed], default: [] },
  ts: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.models.Fc2VideoCache || mongoose.model('Fc2VideoCache', Fc2VideoCacheSchema);
