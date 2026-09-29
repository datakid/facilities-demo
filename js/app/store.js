window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, esc = U.esc;
  const KEY = 'meridian.studio.v2';
  const LIMIT = { rows: 1000, columns: 24, params: 60, gates: 12, criteria: 8, calcs: 60, scenarios: 24 };

  const S = M.state = {
    model: null, result: null, ref: null, baseRes: null, peek: null, live: [], sens: {}, knobs: {}, scen: [], day: null, gaps: [], flips: [], extra: {}, impact: null, explore: null, busy: false,
    ui: { view: 'build', tab: 'situation', advanced: false, inspector: null, selectedRow: null, modal: null, exportTab: 'json', outOpen: false, open: {}, block: null, pane: 'recipe',
      cmp: 'last', knobSort: 'model', knobQ: '', gapsAll: false, needleAll: false, matrixAll: false }
  };
  let past = [], future = [], gestureSnap = null, gestureRes = null, saveT = null, anaT = null, frameQ = false;

  const H = M.h = {
    S, LIMIT, esc, fmt: U.fmt, fmtN: U.fmtN,
    col: id => S.model.columns.find(c => c.id === id),
    crit: id => S.model.criteria.find(c => c.id === id),
    gate: id => S.model.gates.find(g => g.id === id),
    param: id => S.model.params.find(p => p.id === id),
    calc: id => S.model.calcs.find(k => k.id === id),
    scen: id => S.model.scenarios.find(s => s.id === id),
    active: () => S.model.active ? S.model.scenarios.find(s => s.id === S.model.active) || null : null,
    cidx: id => S.model.criteria.findIndex(c => c.id === id) + 1,
    pct: w => (w == null ? '—' : Math.round(w * 100) + '%'),
    cur: () => S.peek ? S.peek.res : S.result,
    refRes: () => S.peek ? S.result : S.ui.cmp === 'off' ? null : S.ui.cmp === 'base' ? S.baseRes : S.ref,
    rowLabel: id => ((S.peek ? S.peek.res : S.result).byId[id] || S.result.byId[id] || {}).label || id,
    canUndo: () => past.length > 0, canRedo: () => future.length > 0,
    reduced: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    focusRow: () => { const r = H.cur(); return S.ui.selectedRow && r.byId[S.ui.selectedRow] ? S.ui.selectedRow : (r.ranked[0] || (S.model.rows[0] || {}).id); },
    calcText: (k, row, res) => { const r = (res || H.cur()).byId[row]; const cv = r && r.calc[k.id]; return cv ? M.format.calc(k, cv.v) : '—'; },
    calcVal: (id, row, res) => { const r = (res || H.cur()).byId[row]; const cv = r && r.calc[id]; return cv && typeof cv.v === 'number' ? cv.v : null; },
    paramText: p => U.fmtN(+p.value) + (p.unit ? ' ' + p.unit : ''),
    distinct: cid => [...new Set(S.model.rows.map(r => r.v[cid]).filter(v => v !== null && v !== undefined && v !== '').map(String))],
    taken: () => new Set([...S.model.columns.map(c => c.id), ...S.model.params.map(p => p.id), ...S.model.calcs.map(k => k.id)]),
    names: () => [...S.model.params.map(p => ({ id: p.id, label: p.label, kind: 'knob' })), ...S.model.columns.map(c => ({ id: c.id, label: c.label, kind: 'column' })), ...S.model.calcs.map(k => ({ id: k.id, label: k.label, kind: 'calc' }))],
    errFor(where, id) { const e = S.result.errors.find(x => x.where === where && x.id === id); return e ? (e.warn ? e.msg : `${e.msg} at ${e.pos}`) : ''; },
    near: (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)),
    target: (p, m) => { m = m || S.model; const s = m.active ? m.scenarios.find(x => x.id === m.active) : null; return s && s.values && s.values[p.id] !== undefined ? +s.values[p.id] : +p.base; },
    diffs: m => { m = m || S.model; return m.params.filter(p => !H.near(+p.value, H.target(p, m))); },
    fit(p, v) { if (v < p.min) p.min = v; if (v > p.max) p.max = v; },
    setKnob(m, id, v) { const p = m.params.find(x => x.id === id); if (!p || !isFinite(v)) return; p.value = v; H.fit(p, v); },
    targetValues: m => { m = m || S.model; const P = {}; m.params.forEach(p => { P[p.id] = H.target(p, m); }); return P; },
    draftLabel(m) {
      m = m || S.model;
      const d = m.params.filter(p => !H.near(+p.value, +p.base));
      if (!d.length) return 'Copy of baseline';
      const parts = d.slice(0, 3).map(p => `${p.label} ${U.fmtN(+p.value)}${p.unit ? ' ' + p.unit : ''}`);
      return parts.join(' · ') + (d.length > 3 ? ` +${d.length - 3}` : '');
    },
    rowColor: id => { const i = S.model.rows.findIndex(r => r.id === id); return i < 0 ? 0 : (i % 8) + 1; },
    calcDir: id => { const c = S.model.criteria.find(x => x.enabled && x.source.kind === 'calc' && x.source.calc === id && x.shape.type !== 'target' && x.shape.type !== 'map'); return c ? c.direction : null; },
    useScenario(m, id) {
      const s = id ? m.scenarios.find(x => x.id === id) : null;
      m.active = s ? s.id : null;
      m.params.forEach(p => { p.value = +p.base; });
      if (s) Object.entries(s.values || {}).forEach(([k, v]) => { const p = m.params.find(x => x.id === k); if (p) { p.value = +v; H.fit(p, +v); } });
    },
    saveDraft(m) {
      const s = m.active ? m.scenarios.find(x => x.id === m.active) : null;
      m.params.forEach(p => {
        if (s) { if (H.near(+p.value, +p.base)) delete s.values[p.id]; else s.values[p.id] = +p.value; }
        else p.base = +p.value;
      });
    },
    overrides: m => { const o = {}; m.params.forEach(p => { if (!H.near(+p.value, +p.base)) o[p.id] = +p.value; }); return o; },
    scenValues: s => { const P = {}; S.model.params.forEach(p => { P[p.id] = +p.base; }); Object.assign(P, (s && s.values) || {}); return P; },
    delta(rowId, res, ref) {
      res = res || H.cur(); ref = ref === undefined ? H.refRes() : ref;
      if (!ref || !ref.byId[rowId] || !res.byId[rowId]) return 0;
      return res.byId[rowId].score - ref.byId[rowId].score;
    },
    liveScen: () => S.live
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
    m.params.forEach(p => { p.unit = p.unit || ''; p.group = p.group || 'Knobs'; p.help = p.help || ''; if (p.step === undefined) p.step = 1; p.value = +p.value; if (p.base === undefined || p.base === null || !isFinite(+p.base)) p.base = p.value; p.base = +p.base; });
    m.calcs.forEach(k => { k.unit = k.unit || ''; k.format = k.format || 'num'; k.group = k.group || ''; k.pin = !!k.pin; k.note = k.note || ''; });
    m.gates.forEach(g => { if (g.enabled === undefined) g.enabled = true; if (g.simple === undefined) g.simple = null; });
    m.scenarios.forEach(s => { s.values = s.values || {}; });
    if (m.active === undefined || (m.active && !m.scenarios.some(s => s.id === m.active))) m.active = null;
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

  function liveScenarios() {
    const m = S.model, n = m.scenarios.length, draft = H.diffs().length > 0;
    S.live = [];
    if (!m.params.length) return;
    if ((n + 2) * Math.max(1, m.rows.length) * Math.max(1, m.calcs.length + m.criteria.length) > 400000) { S.live = null; return; }
    const K = M.engine.compile(m), B = H.scenValues(null);
    const one = (id, label, P, res, now) => {
      res = res || M.engine.compute(m, { P, K });
      const w = res.ranked[0] || null;
      return { id, label, now: !!now, winner: w, score: w ? res.byId[w].score : 0, left: res.ranked.length, res, P };
    };
    if (draft) S.live.push(one('__now', 'Now', null, S.result, true));
    S.live.push(one('', 'Baseline', B, !draft && !m.active ? S.result : null));
    m.scenarios.forEach(s => S.live.push(one(s.id, s.label, Object.assign({}, B, s.values || {}), !draft && s.id === m.active ? S.result : null)));
  }
  function recompute() {
    S.result = M.engine.compute(S.model);
    liveScenarios();
    const tgt = S.live && S.live.find(x => !x.now && x.id === (S.model.active || ''));
    S.baseRes = tgt ? tgt.res : (H.diffs().length ? M.engine.compute(S.model, { P: H.targetValues() }) : S.result);
    if (S.peek) S.peek.res = M.engine.compute(S.model, { P: S.peek.P });
  }
  function fixUi() {
    const i = S.ui.inspector;
    if (i) {
      const ok = i.kind === 'combine' || (i.kind === 'criterion' && H.crit(i.id)) || (i.kind === 'gate' && H.gate(i.id)) || (i.kind === 'param' && H.param(i.id))
        || (i.kind === 'calc' && H.calc(i.id)) || (i.kind === 'scenario' && H.scen(i.id)) || (i.kind === 'row' && S.model.rows.some(r => r.id === i.id));
      if (!ok) S.ui.inspector = null;
    }
    if (S.ui.selectedRow && !S.model.rows.some(r => r.id === S.ui.selectedRow)) S.ui.selectedRow = null;
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ model: S.model, advanced: S.ui.advanced, tab: S.ui.tab, cmp: S.ui.cmp })); } catch (e) { void e; } }, 400);
  }
  function frame() {
    if (frameQ) return; frameQ = true;
    requestAnimationFrame(() => { frameQ = false; M.render.all(); });
  }
  function settle(prev) {
    if (prev) S.ref = prev;
    S.ver = (S.ver || 0) + 1;
    recompute(); fixUi(); save(); S.explore = null; M.render.all(); scheduleAnalysis();
  }
  M.commit = (label, fn) => {
    const snap = gestureSnap || structuredClone(S.model), prev = gestureRes || S.result; gestureSnap = null; gestureRes = null;
    if (fn(S.model) === false) { S.model = snap; recompute(); M.render.all(); return; }
    past.push(snap); if (past.length > 100) past.shift(); future = [];
    settle(prev);
  };
  M.preview = fn => {
    if (!gestureSnap) { gestureSnap = structuredClone(S.model); gestureRes = S.result; S.ref = S.result; }
    fn(S.model); recompute(); frame(); scheduleAnalysis(120);
  };
  M.endGesture = () => {
    if (!gestureSnap) return;
    const prev = gestureRes;
    past.push(gestureSnap); if (past.length > 100) past.shift(); future = []; gestureSnap = null; gestureRes = null;
    settle(prev);
  };
  M.inGesture = () => !!gestureSnap;
  M.undo = () => { if (!past.length) return; const prev = S.result; future.push(structuredClone(S.model)); S.model = past.pop(); settle(prev); };
  M.redo = () => { if (!future.length) return; const prev = S.result; past.push(structuredClone(S.model)); S.model = future.pop(); settle(prev); };
  M.peek = P => {
    if (!P) { if (!S.peek) return; S.peek = null; frame(); return; }
    if (S.peek && S.peek.key === P.key) return;
    S.peek = { key: P.key, P: P.values, label: P.label, id: P.id, res: P.res || M.engine.compute(S.model, { P: P.values }) };
    frame();
  };
  function replaceModel(m) {
    past.push(structuredClone(S.model)); future = [];
    S.model = normalize(m); S.ui.inspector = null; S.ui.selectedRow = null; S.ui.open = {}; S.ui.knobQ = ''; S.ref = null; S.peek = null; S.impact = null; S.sens = {}; S.knobs = {};
    if (!S.model.params.length) S.ui.tab = 'equation';
    settle();
  }

  let worker = null, workerOk = typeof Worker !== 'undefined' && location.protocol !== 'file:', wid = 0, inflight = false, again = false;
  function apply(out) {
    S.sens = out.sens; S.knobs = out.knobs; S.scen = out.scen; S.day = out.day; S.extra = out.extra; S.gaps = out.gaps; S.flips = out.flips; S.impact = out.impact; S.busy = false;
    frame();
  }
  function runLocal() { apply(M.analysis.run(S.model)); }
  function runAnalysis() {
    if (!workerOk) return runLocal();
    if (inflight) { again = true; return; }
    try {
      if (!worker) {
        worker = new Worker('js/core/analysis-worker.js');
        worker.onmessage = e => {
          inflight = false;
          if (e.data.error) { workerOk = false; runLocal(); return; }
          if (e.data.out) apply(e.data.out);
          if (again) { again = false; runAnalysis(); }
        };
        worker.onerror = e => { e.preventDefault(); workerOk = false; worker = null; inflight = false; runLocal(); };
      }
      inflight = true; S.busy = true;
      worker.postMessage({ id: ++wid, model: S.model });
    } catch (err) { workerOk = false; worker = null; inflight = false; runLocal(); }
  }
  function scheduleAnalysis(ms) { clearTimeout(anaT); anaT = setTimeout(runAnalysis, ms ?? (workerOk ? 30 : 160)); }

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
    if (!model) { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && isModel(s.model)) { model = s.model; S.ui.advanced = !!s.advanced; if (s.tab) S.ui.tab = s.tab; if (s.cmp) S.ui.cmp = s.cmp; } } catch (e) { void e; } }
    if (!model) model = M.templates.get('pharmacy');
    S.model = normalize(model);
    if (!S.model.params.length) S.ui.tab = 'equation';
    recompute(); M.render.all();
    if (workerOk) runAnalysis(); else setTimeout(runLocal, 0);
  }
  M.store = { KEY, normalize, isModel, replaceModel, save, runAnalysis, scheduleAnalysis, runLocal, b64enc, b64dec, boot, recompute, frame };
})(window.M);
