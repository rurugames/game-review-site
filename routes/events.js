const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const RelatedClick = require('../models/RelatedClick');
const RelatedImpression = require('../models/RelatedImpression');

const router = express.Router();

const getClientIp = (req) => {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return req.ip;
};

const hashIp = (ip) => {
  const salt = String(process.env.ANALYTICS_SALT || '').trim();
  if (!salt) return undefined;
  if (!ip) return undefined;
  try {
    return crypto.createHmac('sha256', salt).update(String(ip)).digest('hex');
  } catch (_) {
    return undefined;
  }
};

// POST /events/related-click
// Body: { fromArticleId, toArticleId, block, position }
router.post('/related-click', async (req, res) => {
  try {
    const fromArticleId = String(req.body && req.body.fromArticleId ? req.body.fromArticleId : '').trim();
    const toArticleId = String(req.body && req.body.toArticleId ? req.body.toArticleId : '').trim();
    const block = String(req.body && req.body.block ? req.body.block : '').trim();
    const positionRaw = req.body && typeof req.body.position !== 'undefined' ? req.body.position : undefined;
    const position = positionRaw === undefined || positionRaw === null || positionRaw === '' ? undefined : Number(positionRaw);

    if (!mongoose.Types.ObjectId.isValid(fromArticleId) || !mongoose.Types.ObjectId.isValid(toArticleId)) {
      return res.status(400).json({ error: 'invalid id' });
    }

    if (!['same_attribute', 'same_developer'].includes(block)) {
      return res.status(400).json({ error: 'invalid block' });
    }

    if (position !== undefined && (!Number.isFinite(position) || position < 1 || position > 3)) {
      return res.status(400).json({ error: 'invalid position' });
    }

    const ip = getClientIp(req);
    const doc = {
      fromArticle: new mongoose.Types.ObjectId(fromArticleId),
      toArticle: new mongoose.Types.ObjectId(toArticleId),
      block,
      position,
      user: req.user ? req.user.id : null,
      referrer: req.get('referer') || '',
      ua: req.get('user-agent') || '',
      ipHash: hashIp(ip),
      ts: new Date(),
    };

    await RelatedClick.create(doc);
    return res.status(204).send();
  } catch (err) {
    try {
      console.warn('related-click save failed:', err && err.message ? err.message : err);
    } catch (_) {}
    return res.status(204).send();
  }
});

// POST /events/related-impression
// Body: { fromArticleId, items: [{ toArticleId, block, position }] }
router.post('/related-impression', async (req, res) => {
  try {
    const fromArticleId = String(req.body && req.body.fromArticleId ? req.body.fromArticleId : '').trim();
    const items = (req.body && Array.isArray(req.body.items)) ? req.body.items : [];

    if (!mongoose.Types.ObjectId.isValid(fromArticleId)) {
      return res.status(400).json({ error: 'invalid id' });
    }

    if (!items.length) {
      return res.status(204).send();
    }

    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const referrer = req.get('referer') || '';
    const ua = req.get('user-agent') || '';
    const user = req.user ? req.user.id : null;
    const ts = new Date();

    const docs = [];
    const seen = new Set();
    for (const raw of items.slice(0, 12)) {
      const toArticleId = String(raw && raw.toArticleId ? raw.toArticleId : '').trim();
      const block = String(raw && raw.block ? raw.block : '').trim();
      const positionRaw = raw && typeof raw.position !== 'undefined' ? raw.position : undefined;
      const position = positionRaw === undefined || positionRaw === null || positionRaw === '' ? undefined : Number(positionRaw);

      if (!mongoose.Types.ObjectId.isValid(toArticleId)) continue;
      if (!['same_attribute', 'same_developer'].includes(block)) continue;
      if (position !== undefined && (!Number.isFinite(position) || position < 1 || position > 3)) continue;

      const key = `${toArticleId}|${block}|${position || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      docs.push({
        fromArticle: new mongoose.Types.ObjectId(fromArticleId),
        toArticle: new mongoose.Types.ObjectId(toArticleId),
        block,
        position,
        user,
        referrer,
        ua,
        ipHash,
        ts,
      });
    }

    if (!docs.length) return res.status(204).send();

    await RelatedImpression.insertMany(docs, { ordered: false });
    return res.status(204).send();
  } catch (err) {
    try {
      console.warn('related-impression save failed:', err && err.message ? err.message : err);
    } catch (_) {}
    return res.status(204).send();
  }
});

module.exports = router;
