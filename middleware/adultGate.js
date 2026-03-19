function sanitizeNextPath(nextPath) {
  const p = String(nextPath || '').trim();
  if (!p) return '/';
  if (!p.startsWith('/')) return '/';
  // prevent protocol-relative and other weirdness
  if (p.startsWith('//')) return '/';
  return p;
}

function requireAdultConfirmed() {
  return (req, res, next) => {
    try {
      if (req && req.session && req.session.adultConfirmed === true) return next();
    } catch (_) {}

    const nextPath = sanitizeNextPath(req.originalUrl || req.url || '/');
    const q = new URLSearchParams({ next: nextPath }).toString();
    return res.redirect(`/adult/confirm?${q}`);
  };
}

module.exports = {
  requireAdultConfirmed,
  sanitizeNextPath,
};
