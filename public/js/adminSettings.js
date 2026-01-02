document.addEventListener('DOMContentLoaded', function(){
  const form = document.getElementById('settings-form');
  const result = document.getElementById('save-result');
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(b => {
    b.addEventListener('click', () => {
      const m = Number(b.getAttribute('data-min')) || 0;
      const input = document.getElementById('detailsCacheTTL');
      if (input) input.value = m;
    });
  });
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    result.textContent = '保存中…';
    const data = new FormData(form);
    const payload = {};
    data.forEach((v,k)=>payload[k]=v);
    try {
      const resp = await fetch('/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await resp.json();
      if (j && j.success) {
        result.textContent = '保存しました';
        // update TTL input to current saved value (server returns ms)
        try {
          if (j.settings && typeof j.settings.detailsCacheTTL !== 'undefined') {
            const minutes = Math.max(1, Math.round(Number(j.settings.detailsCacheTTL) / 60000));
            document.getElementById('detailsCacheTTL').value = minutes;
          }
        } catch (e) {}
        setTimeout(()=> result.textContent = '', 3000);
      } else {
        result.textContent = (j && j.message) ? j.message : '保存に失敗しました';
      }
    } catch (e) {
      console.error(e);
      result.textContent = '通信エラー';
    }
  });

  // Run GC Now button
  const runGcBtn = document.getElementById('run-gc-now');
  const runGcResult = document.getElementById('run-gc-result');
  if (runGcBtn) {
    runGcBtn.addEventListener('click', async function(){
      runGcBtn.disabled = true;
      runGcResult.textContent = '実行中…';
      try {
        const resp = await fetch('/admin/run-gc', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const j = await resp.json();
        if (j && j.success) {
          runGcResult.textContent = `削除件数: ${j.result.deletedCount}`;
          // refresh GC log table if present
          try {
            if (Array.isArray(j.recentGC) && j.recentGC.length > 0) {
              const tbody = document.querySelector('.gc-log-table tbody');
              if (tbody) {
                tbody.innerHTML = '';
                j.recentGC.forEach(g => {
                  const tr = document.createElement('tr');
                  const td1 = document.createElement('td'); td1.textContent = new Date(g.ts).toLocaleString('ja-JP');
                  const td2 = document.createElement('td'); td2.textContent = g.deletedCount;
                  tr.appendChild(td1); tr.appendChild(td2);
                  tbody.appendChild(tr);
                });
              }
            }
          } catch (e) {}
        } else {
          runGcResult.textContent = (j && j.message) ? j.message : '実行に失敗しました';
        }
      } catch (e) {
        console.error(e);
        runGcResult.textContent = '通信エラー';
      } finally {
        runGcBtn.disabled = false;
        setTimeout(()=> runGcResult.textContent = '', 5000);
      }
    });
  }
});
