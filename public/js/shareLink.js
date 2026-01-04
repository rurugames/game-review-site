(function () {
  function safeText(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  async function copyToClipboard(text) {
    const t = safeText(text).trim();
    if (!t) return false;

    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (_) {
      // fall through
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.querySelector('[data-share-link-button="1"]');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      const url = btn.getAttribute('data-share-url') || window.location.href;
      const ok = await copyToClipboard(url);
      if (ok) {
        alert('リンクをコピーしました');
        return;
      }
      window.prompt('このリンクをコピーしてください', url);
    });
  });
})();
