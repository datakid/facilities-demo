window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, D = M.dom;
  const R = M.render = M.render || {};
  let builtView = null;

  const sv = (w, d) => `<svg width="${w}" height="${w}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  R.ICON = {
    mark: '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--brand)"/><circle cx="16" cy="16" r="10" fill="none" stroke="var(--on-brand)" stroke-opacity=".45" stroke-width="1.6"/><path d="M16 5.5 19.4 16h-6.8z" fill="var(--on-brand)"/><path d="M16 26.5 19.4 16h-6.8z" fill="oklch(80% .07 300)"/><circle cx="16" cy="16" r="1.9" fill="var(--brand)"/></svg>',
    undo: sv(16, '<path d="M5 3 2 6l3 3"/><path d="M2 6h7.5a4 4 0 0 1 0 8H6"/>'),
    redo: sv(16, '<path d="M11 3l3 3-3 3"/><path d="M14 6H6.5a4 4 0 0 0 0 8H10"/>'),
    close: '<svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12"/></svg>',
    grid: sv(15, '<rect x="2" y="2" width="5" height="5" rx="1.5"/><rect x="9" y="2" width="5" height="5" rx="1.5"/><rect x="2" y="9" width="5" height="5" rx="1.5"/><rect x="9" y="9" width="5" height="5" rx="1.5"/>'),
    blocks: sv(15, '<path d="M8 1.8 14 5 8 8.2 2 5z"/><path d="M2 8.2 8 11.4l6-3.2"/><path d="M2 11.2 8 14.4l6-3.2"/>'),
    chev: '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 6.5 5 3.5 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pin: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.5 1.5 14.5 5.5 12 6.5 9.5 9 10 12.5 8.5 14 5.8 10.2 2 14 2 14 5.8 10.2 2 7.5 3.5 6 7 6.5 9.5 4z"/></svg>',
    plus: sv(13, '<path d="M8 3v10M3 8h10"/>'),
    minus: sv(13, '<path d="M3 8h10"/>'),
    reset: sv(13, '<path d="M3 3v4h4"/><path d="M3.5 10a5 5 0 1 0 1-5.3L3 7"/>'),
    search: sv(13, '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>'),
    fork: sv(13, '<circle cx="4" cy="3.5" r="1.6"/><circle cx="12" cy="3.5" r="1.6"/><circle cx="8" cy="12.5" r="1.6"/><path d="M4 5.1v1.4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5.1M8 8.5v2.4"/>'),
    grid3: sv(13, '<path d="M2.5 2.5h11v11h-11zM2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11"/>'),
    clock: sv(13, '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>'),
    spark: sv(13, '<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2 2M10.6 10.6l2 2M3.4 12.6l2-2M10.6 5.4l2-2"/>')
  };

  const fmtD = (d, dig) => { const a = Math.abs(d); return (d > 0 ? '+' : d < 0 ? '−' : '±') + (a >= 100 ? a.toFixed(0) : a.toFixed(dig ?? 1)); };
  R.delta = (d, o) => {
    o = o || {};
    const e = o.eps ?? 0.05;
    if (d == null || !isFinite(d) || Math.abs(d) < e) return o.keep ? '<span class="dl z"></span>' : '';
    const good = o.invert ? d < 0 : d > 0;
    return `<span class="dl ${o.neutral ? 'n' : good ? 'up' : 'dn'}">${o.text || fmtD(d, o.dig)}</span>`;
  };
  R.fmtD = fmtD;

  function topHTML() {
    const u = S.ui, I = R.ICON;
    return `<div class="brand">${I.mark}<span class="brand-name">Meridian</span>
      <input class="model-name" type="text" data-in="model-name" value="${esc(S.model.name)}" aria-label="Model name"></div>
    <div class="center"><div class="seg seg-lg" role="group" aria-label="View">
      <button data-action="set-view" data-v="build" aria-pressed="${u.view === 'build'}">Build</button>
      <button data-action="set-view" data-v="data" aria-pressed="${u.view === 'data'}">Data</button></div></div>
    <div class="right">
      <span class="busy ${S.busy ? 'on' : ''}" title="Checking robustness" aria-hidden="true"></span>
      <button class="btn ghost" data-action="open-gallery">${I.grid}<span class="hide-sm">Templates</span></button>
      <button class="switch" role="switch" aria-checked="${u.advanced}" data-action="toggle-advanced"><span class="track"></span><span class="lbl">Advanced</span></button>
      <span class="divider hide-sm"></span>
      <button class="icon-btn" data-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)" ${H.canUndo() ? '' : 'disabled'}>${I.undo}</button>
      <button class="icon-btn" data-action="redo" aria-label="Redo" title="Redo (Shift+Ctrl+Z)" ${H.canRedo() ? '' : 'disabled'}>${I.redo}</button>
      <button class="btn primary" data-action="open-export">Export</button></div>`;
  }

  R.all = () => {
    D.put(document.getElementById('topbar'), topHTML());
    document.body.classList.toggle('is-peek', !!S.peek);
    const main = document.getElementById('main');
    if (builtView !== S.ui.view) {
      main._html = null;
      D.patch(main, S.ui.view === 'build'
        ? `<div class="pane-switch seg" role="group" aria-label="Panel"><button data-action="set-pane" data-v="recipe">Setup</button><button data-action="set-pane" data-v="result">Results</button></div>
           <div class="build" id="build"><aside class="recipe" id="recipe" aria-label="Setup"></aside><section class="result" id="result" aria-label="Results"><div class="result-inner" id="result-inner"></div></section></div>`
        : '<section class="data" id="data-view" aria-label="Data"></section>');
      builtView = S.ui.view;
    }
    if (S.ui.view === 'build') {
      const b = document.getElementById('build');
      if (b.dataset.pane !== S.ui.pane) b.dataset.pane = S.ui.pane;
      document.querySelectorAll('.pane-switch button').forEach(x => { const v = String(x.dataset.v === S.ui.pane); if (x.getAttribute('aria-pressed') !== v) x.setAttribute('aria-pressed', v); });
      R.renderRecipe(document.getElementById('recipe'));
      R.renderResult();
    } else D.put(document.getElementById('data-view'), R.dataHTML());
    const ins = document.getElementById('inspector'), open = !!S.ui.inspector;
    ins.classList.toggle('open', open);
    if (ins.getAttribute('aria-hidden') !== String(!open)) ins.setAttribute('aria-hidden', String(!open));
    if (open) D.put(ins, R.inspectorHTML());
    D.put(document.getElementById('modal-root'), R.modalHTML());
  };

  R.noiseText = n => n ? `±${n}%` : 'exact';
})(window.M);
