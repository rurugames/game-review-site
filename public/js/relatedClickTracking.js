(() => {
  const root = document.querySelector('[data-article-id]');
  const fromArticleId = root ? root.getAttribute('data-article-id') : '';
  if (!fromArticleId) return;

  const clickEndpoint = '/events/related-click';
  const impressionEndpoint = '/events/related-impression';

  const sendJson = (endpoint, payload) => {
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      } catch (_) {
        // fall through
      }
    }

    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {});
    } catch (_) {
      // ignore
    }
  };

  const sendImpressionsOnce = () => {
    const storageKey = `rc_imp_${fromArticleId}`;
    try {
      if (sessionStorage.getItem(storageKey) === '1') return;
      sessionStorage.setItem(storageKey, '1');
    } catch (_) {
      // ignore (no storage)
    }

    const links = Array.from(document.querySelectorAll('a[data-related-click="1"][data-to-article-id][data-related-block]'));
    if (!links.length) return;

    const seen = new Set();
    const items = [];
    for (const a of links) {
      const toArticleId = (a.getAttribute('data-to-article-id') || '').trim();
      const block = (a.getAttribute('data-related-block') || '').trim();
      const position = Number(a.getAttribute('data-related-position') || '');
      if (!toArticleId || !block) continue;
      const key = `${toArticleId}|${block}|${Number.isFinite(position) ? position : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        toArticleId,
        block,
        position: Number.isFinite(position) ? position : undefined,
      });
    }

    if (!items.length) return;
    sendJson(impressionEndpoint, { fromArticleId, items });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendImpressionsOnce, { once: true });
  } else {
    sendImpressionsOnce();
  }

  document.addEventListener(
    'click',
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[data-related-click="1"]') : null;
      if (!a) return;

      const toArticleId = (a.getAttribute('data-to-article-id') || '').trim();
      const block = (a.getAttribute('data-related-block') || '').trim();
      const position = Number(a.getAttribute('data-related-position') || '');

      if (!toArticleId) return;
      if (!block) return;

      sendJson(clickEndpoint, {
        fromArticleId,
        toArticleId,
        block,
        position: Number.isFinite(position) ? position : undefined,
      });
    },
    { capture: true }
  );
})();
