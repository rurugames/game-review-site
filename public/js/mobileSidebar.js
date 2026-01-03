(function () {
  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  function setOpen(open) {
    document.body.classList.toggle('sidebar-open', open);
    const btn = document.querySelector('[data-sidebar-toggle]');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggle() {
    const open = document.body.classList.contains('sidebar-open');
    setOpen(!open);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.querySelector('[data-sidebar-toggle]');
    const overlay = document.querySelector('[data-sidebar-overlay]');
    if (btn) btn.addEventListener('click', function () {
      if (!isMobile()) return;
      toggle();
    });
    if (overlay) overlay.addEventListener('click', function () {
      setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    // Close drawer when navigating
    const leftRail = document.getElementById('left-rail');
    if (leftRail) {
      leftRail.addEventListener('click', function (e) {
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (a) setOpen(false);
      });
    }

    // Ensure state resets when switching to desktop
    window.addEventListener('resize', function () {
      if (!isMobile()) setOpen(false);
    });
  });
})();
