const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAdultConfirmed } = require('../middleware/adultGate');

let DailyOutboundClick = null;
try {
  DailyOutboundClick = require('../models/DailyOutboundClick');
} catch (_) {
  DailyOutboundClick = null;
}

function safeText(s, max = 128) {
  const v = String(s || '').trim();
  if (!v) return '';
  return v.length > max ? v.slice(0, max) : v;
}

function getJstDateKey(now = new Date()) {
  try {
    const dt = new Date(now);
    const parts = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(dt);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {}
  return new Date(now).toISOString().slice(0, 10);
}

function isAllowedDestination(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = String(url.hostname || '').toLowerCase();
    const allowed = new Set(['video.fc2.com', 'adult.contents.fc2.com', 'contents.fc2.com']);
    if (!allowed.has(host)) return false;
    // Default: allow only FC2 video content pages
    if (host === 'video.fc2.com') {
      const p = url.pathname || '';
      if (!(p.startsWith('/a/content/') || p.startsWith('/content/'))) return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function extractFc2VideoIdFromUrl(u) {
  try {
    const url = new URL(u);
    const host = String(url.hostname || '').toLowerCase();
    if (host !== 'video.fc2.com') return '';
    const p = String(url.pathname || '');
    const m = p.match(/^\/(?:a\/content|content)\/([^\/\?#]+)(?:[\/\?#]|$)/);
    return m && m[1] ? String(m[1]).trim() : '';
  } catch (_) {
    return '';
  }
}

function toPos(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  if (i < 0) return 0;
  if (i > 50) return 50;
  return i;
}

router.get('/', requireAdultConfirmed(), async (req, res) => {
  const destRaw = String(req.query.u || '').trim();
  if (!destRaw) return res.status(400).send('missing u');

  let dest = '';
  try {
    dest = decodeURIComponent(destRaw);
  } catch (_) {
    dest = destRaw;
  }

  if (!isAllowedDestination(dest)) {
    return res.status(400).send('invalid destination');
  }

  const kind = safeText(req.query.k || 'unknown', 64) || 'unknown';
  const section = safeText(req.query.s || 'unknown', 64) || 'unknown';
  const pos = toPos(req.query.pos);

  const vidParam = safeText(req.query.vid || '', 128);
  const extractedVid = extractFc2VideoIdFromUrl(dest);
  const videoId = (vidParam || extractedVid || '').slice(0, 128);

  // Best-effort count; do not block redirect.
  try {
    if (DailyOutboundClick && mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
      const date = getJstDateKey();
      DailyOutboundClick.updateOne(
        { kind, section, url: dest, date },
        {
          $inc: { count: 1 },
          $set: { lastTs: new Date(), videoId, pos },
          $setOnInsert: { kind, section, url: dest, date, videoId, pos },
        },
        { upsert: true }
      ).catch(() => {});
    }
  } catch (_) {}

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.redirect(302, dest);
});

module.exports = router;
