(function () {
  function setOpen(open) {
    const btn = document.querySelector('[data-filters-toggle]');
    const panel = document.getElementById('articles-filters');
    if (!btn || !panel) return;

    if (open) {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'フィルターを非表示';
    } else {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'フィルターを表示';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.querySelector('[data-filters-toggle]');
    const panel = document.getElementById('articles-filters');
    if (!btn || !panel) return;

    // 初期は非表示
    setOpen(false);

    btn.addEventListener('click', function () {
      setOpen(panel.hidden);
    });
  });
})();
