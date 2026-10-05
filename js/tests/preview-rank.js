try { localStorage.removeItem('meridian.studio.v4'); } catch (e) { void e; }
(function () {
  const d = document.documentElement.dataset;
  history.replaceState(null, '', location.pathname + '#ex=' + (d.ex || 'pharmacy') + (d.view === 'build' ? '' : '&view=ranking'));
  if (d.scroll) window.addEventListener('load', () => setTimeout(() => { const el = document.querySelector(d.scroll); if (el) el.scrollIntoView({ block: 'start' }); }, 600));
  if (d.tab) window.addEventListener('load', () => setTimeout(() => { M.state.ui.eqNums = d.nums === '1'; if (d.fmt) M.state.ui.eqFmt = d.fmt; M.app.ACT.tab(d.tab); }, 300));
  if (d.first) window.addEventListener('load', () => setTimeout(() => { const el = document.querySelector(d.first); const p = document.getElementById('results'); if (el && p) p.prepend(el); }, 400));
})();
