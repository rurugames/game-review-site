(() => {
  const socket = io();
  function renderStatus(s) {
    const el = document.getElementById('ranking-progress');
    if (!el) return;
    if (s && s.inProgress) {
      el.style.display = 'flex';
      const pct = s.progress && s.progress.target ? Math.round((s.progress.fetched / s.progress.target) * 100) : 0;
      el.querySelector('.rp-label').textContent = `ランキング取得中：${s.progress.fetched}/${s.progress.target} (${pct}%)`;
      el.querySelector('.rp-bar-inner').style.width = pct + '%';
    } else if (s && s.cachedCount) {
      el.style.display = 'flex';
      el.querySelector('.rp-label').textContent = `ランキング：キャッシュ ${s.cachedCount} 件`;
      el.querySelector('.rp-bar-inner').style.width = '100%';
    } else {
      el.style.display = 'none';
    }
  }

  socket.on('connect', () => {
    try { console.log('socket connected'); } catch (e) {}
  });
  socket.on('ranking:progress', (payload) => {
    try { console.log('ranking:progress', payload); } catch (e) {}
    renderStatus(payload);
  });
  socket.on('ranking:status', (payload) => {
    try { console.log('ranking:status', payload); } catch (e) {}
    renderStatus(payload);
    // No full reload: client will receive partial update HTML via socket and replace DOM
  });
  socket.on('ranking:complete', (payload) => {
    try {
      const isOnRanking = /\/ranking(\b|$)/.test(location.pathname);
      const isHome = location.pathname === '/' || location.pathname === '';
      try { console.log('ranking:complete received', { isOnRanking, isHome, payloadExists: !!payload && !!payload.html }); } catch (e) {}
      // prefer payload html if present; otherwise try to fetch partial as fallback
      (async function handleComplete() {
        try {
          let html = payload && payload.html;
          if (!html) {
            // attempt quick fallback fetch
            try {
              const qs = location.search || '';
              const res = await fetch('/ranking/partial' + qs, { credentials: 'same-origin' });
              if (res && res.status === 200) {
                html = await res.text();
              }
            } catch (e) {
              // ignore fetch error - no fallback available
            }
          }

          if (!html) return;

          const container = document.getElementById('ranking-container');
          if (container) {
            container.innerHTML = html;
            try { document.querySelectorAll('.loading-screen').forEach(n => n.remove()); } catch (e) {}
                  // Show the top of the page for the ranking view
                  window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          // If not on /ranking but on home page, insert or replace .ranking-wrap block
          try {
            const isHome = location.pathname === '/' || location.pathname === '';
            if (isHome) {
              const wrap = document.querySelector('.ranking-wrap');
              const existingGrid = wrap ? wrap.querySelector('.ranking-grid') : null;
              if (existingGrid) {
                const tmp = document.createElement('div');
                tmp.innerHTML = html || '';
                const parsedGrid = tmp.querySelector('.ranking-grid');
                  if (parsedGrid) {
                  existingGrid.innerHTML = parsedGrid.innerHTML;
                  try { document.querySelectorAll('.loading-screen').forEach(n => n.remove()); } catch (e) {}
                  window.dispatchEvent(new Event('resize'));
                }
              } else {
                // no existing ranking block on home: create container and insert full partial HTML
                // Prefer inserting the ranking section before the articles section so it appears
                // in the same place as the server-rendered static ranking.
                const articlesSection = document.querySelector('.articles-section');
                const articlesGrid = document.querySelector('.articles-grid');
                const hero = document.querySelector('.hero');
                const containerEl = document.createElement('div');
                containerEl.id = 'ranking-container';
                containerEl.innerHTML = html || '';
                // If the partial only contains the .ranking-grid (no surrounding section),
                // wrap it in the same structure used by the server-rendered page so
                // the auto-inserted block matches the static layout.
                try {
                  const hasGrid = !!containerEl.querySelector('.ranking-grid');
                  const hasSection = !!containerEl.querySelector('.ranking-section');
                  if (hasGrid && !hasSection) {
                    const parsedGrid = containerEl.querySelector('.ranking-grid');
                    const section = document.createElement('section');
                    section.id = 'ranking';
                    section.className = 'ranking-section';
                    const title = document.createElement('h2');
                    title.className = 'ranking-title';
                    title.textContent = '🏆 DLsite 人気ランキング TOP10 🏆';
                    section.appendChild(title);
                    const wrap = document.createElement('div');
                    wrap.className = 'ranking-wrap';
                    // nav buttons
                    const prev = document.createElement('button'); prev.className = 'ranking-nav prev'; prev.setAttribute('aria-label','前へ'); prev.textContent = '‹';
                    const next = document.createElement('button'); next.className = 'ranking-nav next'; next.setAttribute('aria-label','次へ'); next.textContent = '›';
                    const toggle = document.createElement('button'); toggle.className = 'ranking-toggle'; toggle.title = 'ナビ表示切替'; toggle.textContent = '◎';
                    const dots = document.createElement('div'); dots.className = 'ranking-dots';
                    wrap.appendChild(prev);
                    wrap.appendChild(toggle);
                    wrap.appendChild(parsedGrid);
                    wrap.appendChild(next);
                    wrap.appendChild(dots);
                    section.appendChild(wrap);
                    containerEl.innerHTML = '';
                    containerEl.appendChild(section);
                  }
                } catch (e) { /* ignore wrapping errors */ }
                if (articlesSection && articlesSection.parentNode) {
                  articlesSection.parentNode.insertBefore(containerEl, articlesSection);
                } else if (hero && hero.parentNode) {
                  hero.parentNode.insertBefore(containerEl, hero.nextSibling);
                } else if (articlesGrid && articlesGrid.parentNode) {
                  articlesGrid.parentNode.insertBefore(containerEl, articlesGrid);
                } else {
                  // fallback: append at top of body
                  document.body.insertBefore(containerEl, document.body.firstChild);
                }
                try { document.querySelectorAll('.loading-screen').forEach(n => n.remove()); } catch (e) {}
                window.dispatchEvent(new Event('resize'));
              }
            }
          } catch (e) { /* ignore */ }
        } catch (e) {
          console.warn('ranking:complete handler inner error', e);
        }
      })();
    } catch (e) {
      console.warn('ranking:complete handler error', e);
    }
  });

  // On initial load, try to fetch partial immediately for /ranking and for home (/)
  (function tryFetchPartialOnLoad(){
    try {
      const isOnRanking = /\/ranking(\b|$)/.test(location.pathname);
      const isHome = location.pathname === '/' || location.pathname === '';
      if (!isOnRanking && !isHome) return;

      const qs = location.search || '';

      if (isOnRanking) {
        let container = document.getElementById('ranking-container');
        const loadingEl = document.querySelector('.loading-screen');
        if (!container && loadingEl) {
          container = document.createElement('div');
          container.id = 'ranking-container';
          loadingEl.parentNode.insertBefore(container, loadingEl);
        }
        if (!container) return;

        // try to fetch partial once; if 204, we wait for socket 'ranking:complete'
        fetch('/ranking/partial' + qs, { credentials: 'same-origin' })
          .then(r => { if (r.status === 204) return null; if (!r.ok) throw new Error('partial fetch failed'); return r.text(); })
          .then(html => {
            if (!html) return;
            container.innerHTML = html;
            try { document.querySelectorAll('.loading-screen').forEach(n => n.remove()); } catch (e) {}
            // Show the top of the page for the ranking view
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
          .catch(() => {});
        return;
      }

      if (isHome) {
        // Home page: try to fetch partial and insert .ranking-grid into .ranking-wrap
        const wrap = document.querySelector('.ranking-wrap');
        const existingGrid = wrap ? wrap.querySelector('.ranking-grid') : null;
        // if there's no place to insert, skip
        if (!wrap || !existingGrid) return;

        fetch('/ranking/partial' + qs, { credentials: 'same-origin' })
          .then(r => { if (r.status === 204) return null; if (!r.ok) throw new Error('partial fetch failed'); return r.text(); })
          .then(html => {
            if (!html) return;
            const tmp = document.createElement('div'); tmp.innerHTML = html;
            const parsedGrid = tmp.querySelector('.ranking-grid');
              if (parsedGrid) {
              existingGrid.innerHTML = parsedGrid.innerHTML;
              try { document.querySelectorAll('.loading-screen').forEach(n => n.remove()); } catch (e) {}
              window.dispatchEvent(new Event('resize'));
            }
          })
          .catch(()=>{});
      }
    } catch (e) {}
  })();
  
  // Fallback poller: try fetching partial repeatedly until successful or max attempts reached.
  (function fallbackPoller(){
    try {
      const isOnRanking = /\/ranking(\b|$)/.test(location.pathname);
      const isHome = location.pathname === '/' || location.pathname === '';
      if (!isOnRanking && !isHome) return;

      let attempts = 0;
      const maxAttempts = 15; // ~30 seconds with 2s interval
      const intMs = 2000;
      const timer = setInterval(async () => {
        attempts++;
        try {
          // stop if we already received a complete event that replaced DOM
          const container = document.getElementById('ranking-container');
          const wrap = document.querySelector('.ranking-wrap');
          const existingGrid = wrap ? wrap.querySelector('.ranking-grid') : null;
          const hasContent = (container && container.innerHTML.trim().length > 0) || (existingGrid && existingGrid.innerHTML.trim().length > 0);
          if (hasContent) { clearInterval(timer); return; }

          // quick status check - if server reports cachedCount > 0, try fetch
          let shouldFetch = false;
          try {
            const st = await fetch('/ranking-status', { credentials: 'same-origin' }).then(r => r.json()).catch(() => null);
            if (st && st.cachedCount && st.cachedCount > 0) shouldFetch = true;
          } catch (e) {}

          // also attempt fetch even if status says 0, because sometimes server has HTML available
          if (!shouldFetch && attempts < 3) shouldFetch = true;

          if (shouldFetch) {
            try {
              const qs = location.search || '';
              const res = await fetch('/ranking/partial' + qs, { credentials: 'same-origin' });
              if (res && res.status === 200) {
                const html = await res.text();
                if (html) {
                  if (container) {
                    container.innerHTML = html;
                    } else if (existingGrid) {
                    const tmp = document.createElement('div'); tmp.innerHTML = html;
                    const parsedGrid = tmp.querySelector('.ranking-grid');
                    if (parsedGrid) existingGrid.innerHTML = parsedGrid.innerHTML;
                  } else {
                    // no existing target: create container on home and insert
                    // Prefer inserting before the articles section so layout matches static render
                    const articlesSection = document.querySelector('.articles-section');
                    const articlesGrid = document.querySelector('.articles-grid');
                    const hero = document.querySelector('.hero');
                    const containerEl = document.createElement('div');
                    containerEl.id = 'ranking-container';
                    containerEl.innerHTML = html || '';
                    try {
                      const hasGrid = !!containerEl.querySelector('.ranking-grid');
                      const hasSection = !!containerEl.querySelector('.ranking-section');
                      if (hasGrid && !hasSection) {
                        const parsedGrid = containerEl.querySelector('.ranking-grid');
                        const section = document.createElement('section');
                        section.id = 'ranking';
                        section.className = 'ranking-section';
                        const title = document.createElement('h2');
                        title.className = 'ranking-title';
                        title.textContent = '🏆 DLsite 人気ランキング TOP10 🏆';
                        section.appendChild(title);
                        const wrap = document.createElement('div');
                        wrap.className = 'ranking-wrap';
                        const prev = document.createElement('button'); prev.className = 'ranking-nav prev'; prev.setAttribute('aria-label','前へ'); prev.textContent = '‹';
                        const next = document.createElement('button'); next.className = 'ranking-nav next'; next.setAttribute('aria-label','次へ'); next.textContent = '›';
                        const toggle = document.createElement('button'); toggle.className = 'ranking-toggle'; toggle.title = 'ナビ表示切替'; toggle.textContent = '◎';
                        const dots = document.createElement('div'); dots.className = 'ranking-dots';
                        wrap.appendChild(prev);
                        wrap.appendChild(toggle);
                        wrap.appendChild(parsedGrid);
                        wrap.appendChild(next);
                        wrap.appendChild(dots);
                        section.appendChild(wrap);
                        containerEl.innerHTML = '';
                        containerEl.appendChild(section);
                      }
                    } catch (e) { /* ignore */ }
                    if (articlesSection && articlesSection.parentNode) {
                      articlesSection.parentNode.insertBefore(containerEl, articlesSection);
                    } else if (hero && hero.parentNode) {
                      hero.parentNode.insertBefore(containerEl, hero.nextSibling);
                    } else if (articlesGrid && articlesGrid.parentNode) {
                      articlesGrid.parentNode.insertBefore(containerEl, articlesGrid);
                    } else {
                      document.body.insertBefore(containerEl, document.body.firstChild);
                    }
                  }
                  try { document.querySelectorAll('.loading-screen').forEach(n => n.remove()); } catch (e) {}
                  window.dispatchEvent(new Event('resize'));
                  clearInterval(timer);
                  return;
                }
              }
            } catch (e) {
              // ignore per-attempt error
            }
          }

          if (attempts >= maxAttempts) {
            clearInterval(timer);
          }
        } catch (e) { /* ignore */ }
      }, intMs);
    } catch (e) {}
  })();
  
  // (overlay helper removed) 
  // in case we want to poll fallback
  fetch('/ranking-status').then(r => r.json()).then(s => renderStatus(s)).catch(()=>{});
})();
