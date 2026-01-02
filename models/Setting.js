const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedAt: { type: Date, default: Date.now }
});

SettingSchema.statics.get = async function(key, defaultValue) {
  const rec = await this.findOne({ key }).lean();
  if (!rec) return defaultValue;
  return rec.value;
};

SettingSchema.statics.set = async function(key, value) {
  await this.updateOne({ key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
  return value;
};

module.exports = mongoose.model('Setting', SettingSchema);
