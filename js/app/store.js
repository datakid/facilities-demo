window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, E = M.engine, MD = M.model;
  const KEY = 'meridian.studio.v4';
  const LIMIT = { rows: 500, columns: 80, knobs: 80, rules: 16, criteria: 8, scenarios: 24 };

  const S = M.state = {
    model: null, res: null, ins: null, prev: null,
    ui: { tab: 'matters', sel: null, open: null, modal: null, colSel: null, guide: null, pane: 'build', paste: '', exportTab: 'recipe', toast: null, fresh: false }
  };
  let past = [], future = [], snap = null, saveT = null, insT = null;
  const R = M.render = M.render || {};

  const H = M.h = {
    S, LIMIT,
    col: id => S.model.columns.find(c => c.id === id),
    knob: id => S.model.knobs.find(k => k.id === id),
    crit: id => S.model.criteria.find(c => c.id === id),
    rule: id => S.model.rules.find(r => r.id === id),
    cidx: id => Math.max(0, S.model.criteria.findIndex(c => c.id === id)) % 8 + 1,
    unit: id => { const c = H.col(id) || H.knob(id); return c ? c.unit : ''; },
    val: (id, v) => {
      const c = H.col(id);
      if (c && c.type === 'yesno') return v == null ? '—' : v ? 'yes' : 'no';
      if (typeof v === 'boolean') return v ? 'yes' : 'no';
      if (c && c.pct && typeof v === 'number' && isFinite(v)) return (Math.abs(v) < 0.1 ? +(v * 100).toFixed(2) : +(v * 100).toFixed(1)) + '%';
      return U.withUnit(v, H.unit(id));
    },
    activeSit: () => {
      const m = S.model, eq = (a, b) => Math.abs(+a - +b) < 1e-9;
      const cur = Object.fromEntries(m.knobs.map(k => [k.id, k.value]));
      const matches = vals => m.knobs.every(k => eq(cur[k.id], vals[k.id] ?? m.base[k.id] ?? k.value));
      const s = (m.scenarios || []).find(x => matches(x.values));
      if (s) return s.id;
      return matches({}) ? 'base' : null;
    },
    taken: () => new Set([...S.model.columns.map(c => c.id), ...S.model.knobs.map(k => k.id), ...U.RESERVED]),
    canUndo: () => past.length > 0, canRedo: () => future.length > 0
  };

  function recompute() {
    S.res = E.compute(S.model);
    if (S.ui.sel && !S.res.byId[S.ui.sel]) S.ui.sel = null;
    clearTimeout(insT);
    insT = setTimeout(() => {
      S.sit = E.situations(S.model, S.res.prep);
      S.day = S.model.day && M.plan ? M.plan.dayRun(S.model, S.res.prep) : null;
      R.day && R.day();
      S.ins = M.insights.build(S.model, S.res);
      R.checks && R.checks(); R.verdictOnly && R.verdictOnly(); R.situations && R.situations();
    }, 160);
  }

  function refresh(setup) {
    recompute();
    if (setup) R.setup(); else R.live();
    R.results(); R.top();
  }

  function change(fn, o) {
    o = o || {};
    if (snap == null) { snap = JSON.stringify(S.model); S.prev = S.res; }
    fn(S.model);
    refresh(!!o.setup);
    if (!o.live) settle();
  }

  function settle() {
    if (snap != null) {
      const now = JSON.stringify(S.model);
      if (snap !== now) { past.push(snap); if (past.length > 120) past.shift(); future = []; }
      snap = null;
    }
    save(); R.top();
    if (R.strips) R.strips();
  }

  function undo() { settle(); if (!past.length) return; future.push(JSON.stringify(S.model)); S.prev = S.res; S.model = JSON.parse(past.pop()); refresh(true); save(); R.strips(); toast('Undone'); }
  function redo() { settle(); if (!future.length) return; past.push(JSON.stringify(S.model)); S.prev = S.res; S.model = JSON.parse(future.pop()); refresh(true); save(); R.strips(); toast('Redone'); }

  function load(model, o) {
    o = o || {};
    if (S.model && !o.keepHistory) { past.push(JSON.stringify(S.model)); future = []; }
    S.model = MD.normalize(model);
    S.ui.sel = null; S.ui.open = null; S.ui.colSel = null;
    S.ui.tab = o.tab || 'matters';
    S.ui.guide = S.model.guide && S.model.guide.steps && o.guide !== false ? 0 : null;
    S.ui.pane = 'build';
    S.res = null; S.prev = null; S.ins = null; S.ui.allChecks = false;
    refresh(true); save();
    if (S.ui.guide != null && M.guide) M.guide.go(0);
  }

  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ model: S.model, guide: S.ui.guide, tab: S.ui.tab })); } catch (e) { void e; } }, 300);
  }

  function boot() {
    let model = null, guide = null, tab = null;
    const h = location.hash.match(/#m=([A-Za-z0-9_-]+)/);
    if (h) { try { model = JSON.parse(U.b64d(h[1])); history.replaceState(null, '', location.pathname); } catch (e) { model = null; } }
    const ex = location.hash.match(/#ex=([a-z]+)/);
    if (!model && ex && M.examples.get(ex[1])) {
      model = M.examples.get(ex[1]); guide = /tour/.test(location.hash) ? 0 : null;
      if (/view=ranking/.test(location.hash)) S.ui.pane = 'results';
      history.replaceState(null, '', location.pathname);
    }
    if (!model) { try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && raw.model) { model = raw.model; guide = raw.guide; tab = raw.tab; } } catch (e) { void e; } }
    if (!model) { S.ui.fresh = true; model = M.examples.get('laptop'); }
    S.model = MD.normalize(model);
    S.ui.tab = tab || 'matters';
    S.ui.guide = S.ui.fresh ? null : (guide ?? null);
    recompute();
    R.setup(); R.results(); R.top(); R.pane();
    if (S.ui.fresh) { S.ui.modal = 'start'; R.modal(); }
    else if (S.ui.guide != null && M.guide) M.guide.go(S.ui.guide, true);
  }

  let toastT = null;
  function toast(msg) {
    const el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800);
  }

  function rewrite(mutate) {
    const m = S.model, keep = [];
    m.columns.forEach(c => { if (c.formula) { const k = MD.compileFormula(m, c.formula, c.id); if (k.ast) keep.push([c, 'formula', k.ast]); } });
    m.rules.forEach(r => { const k = MD.compileFormula(m, r.formula); if (k.ast) keep.push([r, 'formula', k.ast]); });
    mutate(m);
    keep.forEach(([o, f, ast]) => { o[f] = M.formula.print(ast, id => MD.nameRef(m, id)); });
  }

  M.store = { change, settle, undo, redo, load, save, boot, toast, refresh, rewrite, recompute, LIMIT };
})(window.M);
