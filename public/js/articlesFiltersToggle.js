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

    // 絞り込み中（クエリあり）の場合は開いたまま
    const params = new URLSearchParams(window.location.search || '');
    const filterKeys = ['q', 'tags', 'tag', 'ratings', 'rating', 'year', 'month'];
    const hasActiveFilter = filterKeys.some((k) => {
      if (!params.has(k)) return false;
      const all = params.getAll(k);
      return all.some((v) => String(v || '').trim() !== '');
    });

    setOpen(hasActiveFilter);

    btn.addEventListener('click', function () {
      setOpen(panel.hidden);
    });
  });
})();
