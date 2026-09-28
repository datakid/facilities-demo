window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, esc = U.esc;
  const KEY = 'meridian.studio.v2';
  const LIMIT = { rows: 1000, columns: 24, params: 60, gates: 12, criteria: 8, calcs: 60, scenarios: 24 };

  const S = M.state = {
    model: null, result: null, sens: {}, knobs: {}, scen: [], day: null, gaps: [], flips: [], extra: {}, explore: null,
    ui: { view: 'build', advanced: false, inspector: null, selectedRow: null, modal: null, exportTab: 'json', outOpen: false, open: {}, block: null, pane: 'recipe' }
  };
  let past = [], future = [], gestureSnap = null, saveT = null, anaT = null;

  const H = M.h = {
    S, LIMIT, esc, fmt: U.fmt, fmtN: U.fmtN,
    col: id => S.model.columns.find(c => c.id === id),
    crit: id => S.model.criteria.find(c => c.id === id),
    gate: id => S.model.gates.find(g => g.id === id),
    param: id => S.model.params.find(p => p.id === id),
    calc: id => S.model.calcs.find(k => k.id === id),
    cidx: id => S.model.criteria.findIndex(c => c.id === id) + 1,
    pct: w => (w == null ? '—' : Math.round(w * 100) + '%'),
    rowLabel: id => (S.result.byId[id] || {}).label || id,
    canUndo: () => past.length > 0, canRedo: () => future.length > 0,
    reduced: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    focusRow: () => S.ui.selectedRow && S.result.byId[S.ui.selectedRow] ? S.ui.selectedRow : (S.result.ranked[0] || (S.model.rows[0] || {}).id),
    calcText: (k, row) => { const r = S.result.byId[row]; const cv = r && r.calc[k.id]; return cv ? M.format.calc(k, cv.v) : '—'; },
    paramText: p => U.fmtN(+p.value) + (p.unit ? ' ' + p.unit : ''),
    distinct: cid => [...new Set(S.model.rows.map(r => r.v[cid]).filter(v => v !== null && v !== undefined && v !== '').map(String))],
    taken: () => new Set([...S.model.columns.map(c => c.id), ...S.model.params.map(p => p.id), ...S.model.calcs.map(k => k.id)]),
    names: () => [...S.model.params.map(p => ({ id: p.id, label: p.label, kind: 'knob' })), ...S.model.columns.map(c => ({ id: c.id, label: c.label, kind: 'column' })), ...S.model.calcs.map(k => ({ id: k.id, label: k.label, kind: 'calc' }))],
    errFor(where, id) { const e = S.result.errors.find(x => x.where === where && x.id === id); return e ? (e.warn ? e.msg : `${e.msg} at ${e.pos}`) : ''; }
  };

  let toastEl = null, toastT = null;
  H.dropToast = () => { clearTimeout(toastT); if (toastEl) { const t = toastEl; toastEl = null; t.classList.add('out'); setTimeout(() => t.remove(), 180); } };
  H.toast = (msg, withUndo) => {
    H.dropToast();
    const t = document.createElement('div'); t.className = 'toast' + (withUndo ? ' has-action' : ''); t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button type="button" class="toast-btn" data-action="toast-undo">Undo</button>' : ''}`;
    document.body.appendChild(t); toastEl = t;
    toastT = setTimeout(H.dropToast, withUndo ? 5000 : 2600);
  };
  H.toastUndo = msg => H.toast(msg, true);

  function normalize(m) {
    m.params = m.params || []; m.gates = m.gates || []; m.calcs = m.calcs || []; m.scenarios = m.scenarios || []; m.stress = m.stress || [];
    m.combine = m.combine || { type: 'sum', expr: '' };
    m.name = m.name || 'Untitled model'; m.note = m.note || ''; m.day = m.day || null;
    m.columns.forEach(c => { if (c.choices && !c.choices.length) delete c.choices; });
    m.params.forEach(p => { p.unit = p.unit || ''; p.group = p.group || 'Knobs'; p.help = p.help || ''; if (p.step === undefined) p.step = 1; });
    m.calcs.forEach(k => { k.unit = k.unit || ''; k.format = k.format || 'num'; k.group = k.group || ''; k.pin = !!k.pin; k.note = k.note || ''; });
    m.gates.forEach(g => { if (g.enabled === undefined) g.enabled = true; if (g.simple === undefined) g.simple = null; });
    m.criteria.forEach(c => {
      if (c.enabled === undefined) c.enabled = true;
      c.range = Object.assign({ auto: true, lo: null, hi: null }, c.range || {});
      c.shape = Object.assign({ type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} }, c.shape || {});
      c.direction = c.direction || 'higher';
      if (!c.missing) c.missing = 'worst';
      if (c.noise === undefined) c.noise = 0;
      c.source = c.source || { kind: 'column', column: (m.columns[0] || {}).id };
    });
    m.rows.forEach(r => { r.v = r.v || {}; });
    return m;
  }
  const isModel = m => m && m.version === 1 && Array.isArray(m.columns) && Array.isArray(m.rows) && Array.isArray(m.criteria);

  function recompute() { S.result = M.engine.compute(S.model); }
  function fixUi() {
    const i = S.ui.inspector;
    if (i) {
      const ok = i.kind === 'combine' || (i.kind === 'criterion' && H.crit(i.id)) || (i.kind === 'gate' && H.gate(i.id)) || (i.kind === 'param' && H.param(i.id))
        || (i.kind === 'calc' && H.calc(i.id)) || (i.kind === 'scenario' && S.model.scenarios.some(s => s.id === i.id)) || (i.kind === 'row' && S.model.rows.some(r => r.id === i.id));
      if (!ok) S.ui.inspector = null;
    }
    if (S.ui.selectedRow && !S.model.rows.some(r => r.id === S.ui.selectedRow)) S.ui.selectedRow = null;
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ model: S.model, advanced: S.ui.advanced })); } catch (e) { void e; } }, 400);
  }
  function settle() { recompute(); fixUi(); save(); S.explore = null; M.render.all(); scheduleAnalysis(); }
  M.commit = (label, fn) => {
    const snap = gestureSnap || structuredClone(S.model); gestureSnap = null;
    if (fn(S.model) === false) { S.model = snap; recompute(); M.render.all(); return; }
    past.push(snap); if (past.length > 100) past.shift(); future = [];
    settle();
  };
  M.preview = fn => {
    if (!gestureSnap) gestureSnap = structuredClone(S.model);
    fn(S.model); recompute(); M.render.live(); scheduleAnalysis();
  };
  M.endGesture = () => {
    if (!gestureSnap) return;
    past.push(gestureSnap); if (past.length > 100) past.shift(); future = []; gestureSnap = null;
    settle();
  };
  M.undo = () => { if (!past.length) return; future.push(structuredClone(S.model)); S.model = past.pop(); settle(); };
  M.redo = () => { if (!future.length) return; past.push(structuredClone(S.model)); S.model = future.pop(); settle(); };
  function replaceModel(m) { past.push(structuredClone(S.model)); future = []; S.model = normalize(m); S.ui.inspector = null; S.ui.selectedRow = null; S.ui.open = {}; settle(); }

  function scheduleAnalysis() { clearTimeout(anaT); anaT = setTimeout(runAnalysis, 160); }
  function runAnalysis() {
    const m = S.model, res = S.result, sens = {};
    const step = m.rows.length > 300 ? 4 : m.rows.length > 100 ? 2 : 1;
    if (res.ranked.length > 1 && res.total > 0 && res.active.length > 1) res.active.forEach(id => { sens[id] = M.sensitivity.sweep(m, id, step); });
    S.sens = sens;
    const knobs = {};
    m.stress.filter(id => H.param(id)).forEach(id => { knobs[id] = M.sensitivity.knob(m, id, m.rows.length > 200 ? 12 : 24); });
    S.knobs = knobs;
    S.scen = M.engine.scenarios(m);
    S.day = M.plan.day(m);
    const big = m.rows.length > 300;
    S.extra = {
      weightFree: M.engine.weightFree(m, res, big ? 500 : 2000),
      uncertainty: M.engine.uncertainty(m, res, big ? 300 : 1000),
      reversal: M.engine.reversal(m, res), knobs, scenarios: S.scen
    };
    S.gaps = M.engine.honesty(m, res, sens, S.extra);
    S.flips = M.engine.flips(m, res);
    M.render.analysis();
  }

  function b64enc(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); }

  function boot() {
    let model = null;
    const hm = /#m=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (hm) {
      try { const m = JSON.parse(b64dec(hm[1])); if (isModel(m)) model = m; } catch (e) { void e; }
      if (!model) setTimeout(() => H.toast("That link doesn't hold a Meridian model"), 100);
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (!model) { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && isModel(s.model)) { model = s.model; S.ui.advanced = !!s.advanced; } } catch (e) { void e; } }
    if (!model) model = M.templates.get('pharmacy');
    S.model = normalize(model);
    recompute(); M.render.all(); runAnalysis();
  }
  M.store = { KEY, normalize, isModel, replaceModel, save, runAnalysis, scheduleAnalysis, b64enc, b64dec, boot, recompute };
})(window.M);
