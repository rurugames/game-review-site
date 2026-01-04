const cheerio = require('cheerio');

const DEFAULT_AID = 'r18Hub';
const DLSITE_HOSTS = new Set(['www.dlsite.com', 'dlsite.com']);

function normalizeAid(aid) {
  const v = String(aid || '').trim();
  return v || DEFAULT_AID;
}

function extractWorkInfoFromDlsiteUrl(rawUrl) {
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!DLSITE_HOSTS.has(url.hostname)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  // Example: /maniax/work/=/product_id/RJ01484541.html
  const site = segments[0];
  if (!site) return null;

  const idx = segments.findIndex((s) => s === 'product_id');
  if (idx < 0 || idx + 1 >= segments.length) return null;

  const idRaw = segments[idx + 1];
  const id = String(idRaw || '').replace(/\.html?$/i, '');
  if (!id) return null;

  return { site, id };
}

function isDlafWorkUrl(rawUrl) {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return url.hostname === 'dlaf.jp' && /\/id\/[A-Za-z0-9_]+\.html?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function toDlafWorkUrl({ site, id, aid }) {
  const safeAid = encodeURIComponent(normalizeAid(aid));
  const safeSite = encodeURIComponent(String(site || '').trim());
  const safeId = encodeURIComponent(String(id || '').trim());
  if (!safeSite || !safeId) return null;
  return `https://dlaf.jp/${safeSite}/dlaf/=/t/s/link/work/aid/${safeAid}/id/${safeId}.html`;
}

function normalizeAffiliateLink(rawUrl, { aid } = {}) {
  if (!rawUrl) return '';
  const s = String(rawUrl).trim();
  if (!s) return '';

  // Already a dlaf work link
  if (isDlafWorkUrl(s)) return s;

  const info = extractWorkInfoFromDlsiteUrl(s);
  if (!info) return s;

  return toDlafWorkUrl({ ...info, aid: normalizeAid(aid) }) || s;
}

function rewriteDlsiteWorkLinksInHtml(html, { aid } = {}) {
  const input = String(html || '');
  if (!input) return { html: input, firstAffiliateLink: '' };

  const safeAid = normalizeAid(aid);
  const $ = cheerio.load(`<div id="__root">${input}</div>`, { decodeEntities: false });

  let firstAffiliateLink = '';

  $('#__root a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const converted = normalizeAffiliateLink(href, { aid: safeAid });

    if (!firstAffiliateLink && isDlafWorkUrl(converted)) {
      firstAffiliateLink = converted;
    }

    if (converted !== href) {
      $(el).attr('href', converted);

      const rel = String($(el).attr('rel') || '')
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!rel.includes('sponsored')) rel.push('sponsored');
      $(el).attr('rel', Array.from(new Set(rel)).join(' '));
    }
  });

  return {
    html: $('#__root').html() || input,
    firstAffiliateLink,
  };
}

module.exports = {
  DEFAULT_AID,
  extractWorkInfoFromDlsiteUrl,
  normalizeAffiliateLink,
  rewriteDlsiteWorkLinksInHtml,
  toDlafWorkUrl,
};
