function sanitizeNextPath(nextPath) {
  const p = String(nextPath || '').trim();
  if (!p) return '/';
  if (!p.startsWith('/')) return '/';
  // prevent protocol-relative and other weirdness
  if (p.startsWith('//')) return '/';
  return p;
}

function isAdultConfirmed(req) {
  try {
    return !!(req && req.session && req.session.adultConfirmed === true);
  } catch (_) {
    return false;
  }
}

function redirectToAdultConfirm(req, res) {
  const nextPath = sanitizeNextPath(req.originalUrl || req.url || '/');
  const q = new URLSearchParams({ next: nextPath }).toString();
  return res.redirect(`/adult/confirm?${q}`);
}

function requireAdultConfirmed() {
  return (req, res, next) => {
    if (isAdultConfirmed(req)) return next();
    return redirectToAdultConfirm(req, res);
  };
}

function requireSiteAdultConfirmation(options = {}) {
  const allowPrefixes = Array.isArray(options.allowPrefixes) ? options.allowPrefixes : [];
  const allowPaths = new Set(Array.isArray(options.allowPaths) ? options.allowPaths : []);

  return (req, res, next) => {
    if (isAdultConfirmed(req)) return next();

    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return next();

    const path = String(req.path || req.url || '/');
    if (allowPaths.has(path)) return next();
    if (allowPrefixes.some((prefix) => path.startsWith(prefix))) return next();

    const accept = String((req.headers && req.headers.accept) || '').toLowerCase();
    if (accept && !accept.includes('text/html') && !accept.includes('*/*')) {
      return next();
    }

    return redirectToAdultConfirm(req, res);
  };
}

module.exports = {
  isAdultConfirmed,
  redirectToAdultConfirm,
  requireAdultConfirmed,
  requireSiteAdultConfirmation,
  sanitizeNextPath,
};
