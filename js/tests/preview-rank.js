try { localStorage.removeItem('meridian.studio.v4'); } catch (e) { void e; }
(function () {
  const d = document.documentElement.dataset;
  history.replaceState(null, '', location.pathname + '#ex=' + (d.ex || 'pharmacy') + (d.view === 'build' ? '' : '&view=ranking'));
})();
