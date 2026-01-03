(() => {
  const root = document.querySelector('[data-article-id]');
  const fromArticleId = root ? root.getAttribute('data-article-id') : '';
  if (!fromArticleId) return;

  const endpoint = '/events/related-click';

  const send = (payload) => {
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

      send({
        fromArticleId,
        toArticleId,
        block,
        position: Number.isFinite(position) ? position : undefined,
      });
    },
    { capture: true }
  );
})();
