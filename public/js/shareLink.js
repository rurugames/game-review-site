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
    const wrap = document.querySelector('[data-share-wrap="1"]');
    if (!wrap) return;

    const toggleBtn = wrap.querySelector('[data-share-toggle="1"]');
    const menu = wrap.querySelector('[data-share-menu="1"]');
    const lineLink = wrap.querySelector('[data-share-line="1"]');
    const xLink = wrap.querySelector('[data-share-x="1"]');
    const copyBtn = wrap.querySelector('[data-share-copy="1"]');
    if (!toggleBtn || !menu) return;

    const shareUrl = wrap.getAttribute('data-share-url') || window.location.href;
    const shareText = wrap.getAttribute('data-share-text') || '';

    if (lineLink) {
      lineLink.href = 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(shareUrl);
    }
    if (xLink) {
      const base = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(shareUrl);
      xLink.href = shareText ? (base + '&text=' + encodeURIComponent(shareText)) : base;
    }

    function closeMenu() {
      menu.hidden = true;
      toggleBtn.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      menu.hidden = false;
      toggleBtn.setAttribute('aria-expanded', 'true');
    }

    toggleBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        const ok = await copyToClipboard(shareUrl);
        if (ok) {
          alert('URLをコピーしました');
          closeMenu();
          return;
        }
        closeMenu();
        window.prompt('このURLをコピーしてください', shareUrl);
      });
    }

    document.addEventListener('click', function (e) {
      if (menu.hidden) return;
      if (wrap.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  });
})();
