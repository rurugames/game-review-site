require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected');

    // lazy-load Setting model
    const Setting = require('../models/Setting');

    const pTTL = await Setting.get('detailsCacheTTL', null);
    const defaultMs = (pTTL && Number(pTTL)) ? Number(pTTL) : (60 * 60 * 1000);
    const seconds = Math.max(60, Math.floor(defaultMs / 1000));
    console.log('Using TTL (seconds):', seconds);

    const coll = mongoose.connection.collection('gamedetailcaches');
    const indexes = await coll.indexes();
    console.log('Existing indexes:', indexes.map(i => ({ name: i.name, key: i.key, expireAfterSeconds: i.expireAfterSeconds })));

    const existing = indexes.find(i => i.key && i.key.ts === 1);
    if (existing) {
      console.log('Found existing index on ts:', existing.name, 'expireAfterSeconds=', existing.expireAfterSeconds);
      try {
        await coll.dropIndex(existing.name);
        console.log('Dropped existing index', existing.name);
      } catch (e) {
        console.warn('Drop by name failed, trying by key', e && e.message ? e.message : e);
        try {
          await coll.dropIndex({ ts: 1 });
          console.log('Dropped existing index by key {ts:1}');
        } catch (e2) {
          console.error('Failed to drop existing index by name or key:', e2 && e2.message ? e2.message : e2);
          process.exit(2);
        }
      }
    }

    // create TTL index
    try {
      await coll.createIndex({ ts: 1 }, { expireAfterSeconds: seconds, background: true });
      console.log('Created TTL index on ts with expireAfterSeconds=', seconds);
    } catch (e) {
      console.error('Failed to create TTL index:', e && e.message ? e.message : e);
      process.exit(3);
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
