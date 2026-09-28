window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc;
  const R = M.render = M.render || {};
  let builtView = null;

  R.ICON = {
    mark: '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--brand)"/><circle cx="16" cy="16" r="10" fill="none" stroke="var(--on-brand)" stroke-opacity=".45" stroke-width="1.6"/><path d="M16 5.5 19.4 16h-6.8z" fill="var(--on-brand)"/><path d="M16 26.5 19.4 16h-6.8z" fill="oklch(80% .07 300)"/><circle cx="16" cy="16" r="1.9" fill="var(--brand)"/></svg>',
    undo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3 2 6l3 3"/><path d="M2 6h7.5a4 4 0 0 1 0 8H6"/></svg>',
    redo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3l3 3-3 3"/><path d="M14 6H6.5a4 4 0 0 0 0 8H10"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12"/></svg>',
    grid: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.5"/><rect x="9" y="2" width="5" height="5" rx="1.5"/><rect x="2" y="9" width="5" height="5" rx="1.5"/><rect x="9" y="9" width="5" height="5" rx="1.5"/></svg>',
    blocks: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8 14 5 8 8.2 2 5z"/><path d="M2 8.2 8 11.4l6-3.2"/><path d="M2 11.2 8 14.4l6-3.2"/></svg>',
    chev: '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 6.5 5 3.5 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pin: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.5 1.5 14.5 5.5 12 6.5 9.5 9 10 12.5 8.5 14 5.8 10.2 2 14 2 14 5.8 10.2 2 7.5 3.5 6 7 6.5 9.5 4z"/></svg>'
  };

  function topHTML() {
    const u = S.ui, I = R.ICON;
    return `<div class="brand">${I.mark}<span class="brand-name">Meridian</span>
      <input class="model-name" type="text" data-in="model-name" data-focus-key="name" value="${esc(S.model.name)}" aria-label="Model name"></div>
    <div class="center"><div class="seg seg-lg" role="group" aria-label="View">
      <button data-action="set-view" data-v="build" aria-pressed="${u.view === 'build'}">Build</button>
      <button data-action="set-view" data-v="data" aria-pressed="${u.view === 'data'}">Data</button></div></div>
    <div class="right">
      <button class="btn ghost" data-action="open-gallery" data-focus-key="gallery">${I.grid}<span class="hide-sm">Templates</span></button>
      <button class="switch" role="switch" aria-checked="${u.advanced}" data-action="toggle-advanced" data-focus-key="adv"><span class="track"></span><span class="lbl">Advanced</span></button>
      <span class="divider hide-sm"></span>
      <button class="icon-btn" data-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)" ${H.canUndo() ? '' : 'disabled'}>${I.undo}</button>
      <button class="icon-btn" data-action="redo" aria-label="Redo" title="Redo (Shift+Ctrl+Z)" ${H.canRedo() ? '' : 'disabled'}>${I.redo}</button>
      <button class="btn primary" data-action="open-export">Export</button></div>`;
  }

  R.all = () => {
    const ae = document.activeElement, fk = ae && ae.dataset ? ae.dataset.focusKey : null;
    const recipeScroll = document.getElementById('recipe') ? document.getElementById('recipe').scrollTop : 0;
    document.getElementById('topbar').innerHTML = topHTML();
    const main = document.getElementById('main');
    if (builtView !== S.ui.view) {
      main.innerHTML = S.ui.view === 'build'
        ? `<div class="pane-switch seg" role="group" aria-label="Panel"><button data-action="set-pane" data-v="recipe">Setup</button><button data-action="set-pane" data-v="result">Results</button></div>
           <div class="build" id="build"><aside class="recipe" id="recipe" aria-label="Setup"></aside><section class="result" id="result" aria-label="Results"><div class="result-inner" id="result-inner"></div></section></div>`
        : '<section class="data" id="data-view" aria-label="Data"></section>';
      builtView = S.ui.view;
    }
    if (S.ui.view === 'build') {
      document.getElementById('build').dataset.pane = S.ui.pane;
      document.querySelectorAll('.pane-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.ui.pane)));
      const rc = document.getElementById('recipe');
      rc.innerHTML = R.recipeHTML(); rc.scrollTop = recipeScroll;
      R.renderResult();
    } else document.getElementById('data-view').innerHTML = R.dataHTML();
    const ins = document.getElementById('inspector');
    ins.classList.toggle('open', !!S.ui.inspector);
    ins.setAttribute('aria-hidden', S.ui.inspector ? 'false' : 'true');
    ins.innerHTML = S.ui.inspector ? R.inspectorHTML() : '';
    document.getElementById('modal-root').innerHTML = R.modalHTML();
    M.ui.enhanceAll();
    if (fk) { const el = document.querySelector(`[data-focus-key="${CSS.escape(fk)}"]`); if (el && el !== document.activeElement) el.focus({ preventScroll: true }); }
  };

  R.live = () => {
    if (S.ui.view === 'build') R.renderResult();
    const ch = document.getElementById('insp-chart');
    if (ch && S.ui.inspector && S.ui.inspector.kind === 'criterion') ch.innerHTML = R.chartSVG(H.crit(S.ui.inspector.id));
    document.querySelectorAll('[data-live]').forEach(el => { const t = R.liveText(el.dataset.live); if (t !== null && el.textContent !== t) el.textContent = t; });
  };

  R.analysis = () => {
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('analysis-gaps', R.gapsHTML());
    set('analysis-flips', R.flipsHTML());
    set('analysis-robust', R.robustHTML());
    set('analysis-scen', R.scenariosHTML());
    set('analysis-day', R.dayHTML());
    set('analysis-stress', R.stressHTML());
    document.querySelectorAll('[data-chance]').forEach(el => { el.textContent = R.chanceText(el.dataset.chance); });
  };

  R.liveText = key => {
    const parts = key.split(':'), kind = parts[0], a = parts[1], res = S.result;
    const c = H.crit(a);
    switch (kind) {
      case 'share': return c && c.enabled && res.weights[a] != null ? H.pct(res.weights[a]) : '—';
      case 'wv': return c ? String(c.weight) : '';
      case 'param': { const p = H.param(a); return p ? H.paramText(p) : ''; }
      case 'calc': { const k = H.calc(a); return k ? H.calcText(k, H.focusRow()) : ''; }
      case 'sp': return c ? R.shapeParamText(c, parts[2]) : '';
      case 'map': { const cat = parts.slice(2).join(':'); return c ? H.fmt(+(c.shape.map[cat] ?? 0), 2) : ''; }
      case 'err': return H.errFor(a, parts.slice(2).join(':'));
      case 'noise': return c ? R.noiseText(+c.noise || 0) : '';
      case 'formula': return c && res.used.includes(a) ? M.codegen.critFormula(S.model, res, c) : '';
    }
    return null;
  };
  R.noiseText = n => n ? `±${n}%` : 'exact';
})(window.M);
