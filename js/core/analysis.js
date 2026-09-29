window.M = window.M || {};
(function (M) {
  'use strict';
  const E = M.engine;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function baseP(model) { const P = {}; model.params.forEach(p => { P[p.id] = +(p.base ?? p.value); }); return P; }

  function scenarios(model, K) {
    const B = baseP(model);
    return (model.scenarios || []).map(s => {
      const r = E.compute(model, { P: Object.assign({}, B, s.values || {}), K });
      const w = r.ranked[0] || null;
      return { id: s.id, label: s.label, winner: w, score: w ? r.byId[w].score : 0, top: r.ranked.slice(0, 3), left: r.ranked.length, res: r };
    });
  }

  function impact(model, res, K) {
    const win = res.ranked[0];
    if (!win || !model.params.length) return null;
    const steps = Math.max(4, Math.min(12, Math.floor(6000 / (model.params.length * Math.max(10, model.rows.length)))));
    const list = model.params.map(p => {
      const lo = +p.min, hi = +p.max, cur = +p.value;
      if (!(hi > lo)) return { id: p.id, swing: 0, pts: [], lo, hi, cur };
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const v = lo + (hi - lo) * i / steps, r = E.compute(model, { P: { [p.id]: v }, K }), me = r.byId[win];
        pts.push({ v, s: me && me.pass ? me.score : 0, w: r.ranked[0] || null });
      }
      const ss = pts.map(x => x.s), mn = Math.min(...ss), mx = Math.max(...ss);
      let below = null, above = null;
      for (let i = pts.length - 1; i >= 0; i--) if (pts[i].v < cur - 1e-9 && pts[i].w !== win) { below = { v: pts[i].v, at: pts[i + 1] ? (pts[i].v + pts[i + 1].v) / 2 : pts[i].v, who: pts[i].w }; break; }
      for (let i = 0; i < pts.length; i++) if (pts[i].v > cur + 1e-9 && pts[i].w !== win) { above = { v: pts[i].v, at: pts[i - 1] ? (pts[i].v + pts[i - 1].v) / 2 : pts[i].v, who: pts[i].w }; break; }
      return { id: p.id, lo, hi, cur, pts, min: mn, max: mx, sLo: ss[0], sHi: ss[ss.length - 1], swing: mx - mn, below, above };
    });
    list.sort((a, b) => b.swing - a.swing || (b.below || b.above ? 1 : 0) - (a.below || a.above ? 1 : 0));
    const byId = {}; list.forEach(x => { byId[x.id] = x; });
    return { winner: win, score: res.byId[win].score, list, byId, top: list.length ? list[0].swing : 0 };
  }

  function run(model) {
    const t0 = now();
    const res = E.compute(model), K = E.compile(model);
    const sens = {};
    const step = model.rows.length > 300 ? 4 : model.rows.length > 100 ? 2 : 1;
    if (res.ranked.length > 1 && res.total > 0 && res.active.length > 1) res.active.forEach(id => { sens[id] = E.sweepFast(model, res, id, step); });
    const knobs = {};
    (model.stress || []).filter(id => model.params.some(p => p.id === id)).forEach(id => { knobs[id] = E.knobSweep(model, id, model.rows.length > 200 ? 12 : 24); });
    const scen = scenarios(model, K);
    const day = M.plan.day(model);
    const big = model.rows.length > 300;
    const extra = {
      weightFree: E.weightFree(model, res, big ? 500 : 2000),
      uncertainty: E.uncertainty(model, res, big ? 300 : 1000),
      reversal: E.reversal(model, res), knobs, scenarios: scen
    };
    const gaps = E.honesty(model, res, sens, extra);
    const flips = E.flips(model, res);
    const imp = impact(model, res, K);
    return { sens, knobs, scen, day, extra, gaps, flips, impact: imp, ms: Math.round(now() - t0) };
  }

  function curve(model, paramId, steps) {
    const p = model.params.find(x => x.id === paramId); if (!p) return null;
    const lo = +p.min, hi = +p.max; if (!(hi > lo)) return null;
    steps = steps || 24;
    const K = E.compile(model), pts = [];
    for (let i = 0; i <= steps; i++) {
      const v = lo + (hi - lo) * i / steps, r = E.compute(model, { P: { [paramId]: v }, K }), sc = {};
      r.rows.forEach(x => { sc[x.id] = x.pass ? x.score : 0; });
      pts.push({ v, sc, w: r.ranked[0] || null });
    }
    return { id: paramId, lo, hi, pts };
  }

  function depsOf(model) {
    const calcIds = new Set((model.calcs || []).map(k => k.id)), parIds = new Set(model.params.map(p => p.id)), colIds = new Set(model.columns.map(c => c.id));
    const memo = {};
    const walk = id => {
      if (memo[id]) return memo[id];
      const k = model.calcs.find(x => x.id === id), out = { p: new Set(), c: new Set(), k: new Set() };
      memo[id] = out;
      if (!k) return out;
      M.expr.idents(k.expr).forEach(t => {
        if (parIds.has(t.name)) out.p.add(t.name);
        else if (colIds.has(t.name)) out.c.add(t.name);
        else if (calcIds.has(t.name) && t.name !== id) { out.k.add(t.name); const d = walk(t.name); d.p.forEach(x => out.p.add(x)); d.c.forEach(x => out.c.add(x)); }
      });
      return out;
    };
    return walk;
  }
  function drivers(model, calcId, rowId) {
    const row = model.rows.find(r => r.id === rowId); if (!row) return null;
    const d = depsOf(model)(calcId), K = E.compile(model), one = Object.assign({}, model, { rows: [row] });
    const val = P => { const r = E.compute(one, { P, K }).rows[0]; const c = r && r.calc[calcId]; return c && typeof c.v === 'number' ? c.v : null; };
    const cur = val({});
    const list = [...d.p].map(id => {
      const p = model.params.find(x => x.id === id), lo = +p.min, hi = +p.max;
      const a = val({ [id]: lo }), b = val({ [id]: hi });
      const fin = x => typeof x === 'number' && isFinite(x);
      const swing = fin(a) && fin(b) ? Math.abs(b - a) : (fin(a) !== fin(b) ? Infinity : 0);
      return { id, lo, hi, a, b, swing, up: fin(a) && fin(b) ? b >= a : fin(a) };
    }).sort((x, y) => y.swing - x.swing);
    return { cur, list, cols: [...d.c], calcs: [...d.k] };
  }

  M.analysis = { run, impact, scenarios, baseP, curve, drivers, depsOf };
})(window.M);
