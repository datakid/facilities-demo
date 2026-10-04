window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, F = M.formula, MD = M.model;

  function prepare(model) {
    const issues = [], colById = {}, comp = {};
    model.columns.forEach(c => { colById[c.id] = c; });
    const calc = model.columns.filter(c => c.formula && c.formula.trim());
    calc.forEach(c => {
      const k = MD.compileFormula(model, c.formula, c.id);
      if (k.error) issues.push({ where: 'column', id: c.id, msg: k.error.msg, pos: k.error.pos, len: k.error.len });
      else comp[c.id] = k;
    });
    const order = [], state = {};
    const visit = (id, path) => {
      if (state[id] === 2) return true;
      if (state[id] === 1) { issues.push({ where: 'column', id, msg: `This formula goes in a circle: ${path.map(p => MD.labelOf(model, p)).join(' → ')} → ${MD.labelOf(model, id)}` }); return false; }
      state[id] = 1;
      const k = comp[id];
      if (k) for (const r of k.refs) if (comp[r] && !visit(r, path.concat(id))) { delete comp[id]; state[id] = 2; return false; }
      state[id] = 2; if (comp[id]) order.push(id); return true;
    };
    Object.keys(comp).forEach(id => visit(id, []));
    const rules = model.rules.filter(r => r.on).map(r => {
      const k = MD.compileFormula(model, r.formula);
      if (k.error) { issues.push({ where: 'rule', id: r.id, msg: k.error.msg, pos: k.error.pos, len: k.error.len }); return null; }
      return { r, ast: k.ast };
    }).filter(Boolean);
    return { colById, comp, order, rules, issues };
  }

  function valuesFor(model, prep, row, K, V, RK) {
    const s = {}, errs = {}, rk = RK && RK[row.id];
    model.knobs.forEach(k => { s[k.id] = rk && rk[k.id] != null ? +rk[k.id] : K && K[k.id] != null ? +K[k.id] : +k.value; });
    const ov = V && V[row.id];
    model.columns.forEach(c => { if (!(c.formula && c.formula.trim())) s[c.id] = ov && c.id in ov ? ov[c.id] : (row.v[c.id] ?? null); else s[c.id] = null; });
    const label = id => MD.labelOf(model, id);
    prep.order.forEach(id => {
      try { s[id] = F.evaluate(prep.comp[id].ast, s, label); }
      catch (e) { s[id] = null; errs[id] = e.message; }
    });
    return { s, errs };
  }

  function curveApply(c, t, raw, R) {
    switch (c.curve) {
      case 'gentle': return Math.sqrt(t);
      case 'steep': return t * t;
      case 'enough': {
        const at = c.at ?? (R.lo + (R.hi - R.lo) * (c.want === 'less' ? 0.3 : 0.7));
        const span = R.hi - R.lo || 1;
        let ta = U.clamp((at - R.lo) / span, 0, 1); if (c.want === 'less') ta = 1 - ta;
        return ta <= 0 ? 1 : U.clamp(t / ta, 0, 1);
      }
      case 'target': {
        const at = c.at ?? (R.lo + R.hi) / 2, tol = c.tol || Math.max((R.hi - R.lo) / 2, 1e-9);
        return U.clamp(1 - Math.abs(raw - at) / tol, 0, 1);
      }
    }
    return t;
  }

  function rangeOf(c, vals) {
    if (c.range && !c.range.auto && isFinite(c.range.lo) && isFinite(c.range.hi) && c.range.lo !== c.range.hi) return { lo: Math.min(c.range.lo, c.range.hi), hi: Math.max(c.range.lo, c.range.hi), auto: false };
    const v = vals.filter(x => typeof x === 'number' && isFinite(x));
    if (!v.length) return { lo: 0, hi: 0, auto: true, empty: true };
    return { lo: Math.min(...v), hi: Math.max(...v), auto: true };
  }

  function compute(model, opt) {
    opt = opt || {};
    const prep = opt.prep || prepare(model);
    const src = opt.rows || model.rows;
    const rows = src.map(r => { const { s, errs } = valuesFor(model, prep, r, opt.K, opt.V, opt.RK); return { id: r.id, label: r.label, vals: s, errs }; });
    const label = id => MD.labelOf(model, id);
    rows.forEach(row => {
      row.rules = prep.rules.map(({ r, ast }) => {
        try { return { id: r.id, pass: !!F.evaluate(ast, row.vals, label), soft: !!r.soft }; }
        catch (e) { return { id: r.id, pass: false, error: e.message, soft: !!r.soft }; }
      });
      const f = row.rules.find(x => !x.pass && !x.soft);
      row.pass = !f;
      row.failRule = f ? f.id : null;
      row.penalties = row.rules.filter(x => !x.pass && x.soft).map(x => { const r = prep.rules.find(y => y.r.id === x.id).r; return { id: x.id, pts: Math.max(0, +r.penalty || 0) }; });
      row.penalty = row.penalties.reduce((a, p) => a + p.pts, 0);
    });
    const crits = model.criteria.filter(c => c.on && prep.colById[c.col]);
    const wOf = c => opt.W && opt.W[c.id] != null ? opt.W[c.id] : c.weight;
    const totalW = crits.reduce((a, c) => a + wOf(c), 0);
    const share = {}, ranges = {}, info = {};
    crits.forEach(c => { share[c.id] = totalW ? wOf(c) / totalW : 0; });
    crits.forEach(c => {
      const col = prep.colById[c.col];
      const raws = rows.map(r => { const v = r.vals[c.col]; return col.type === 'yesno' ? (v == null ? null : (v ? 1 : 0)) : v; });
      if (col.type === 'text') {
        ranges[c.id] = { text: true };
        const cats = [...new Set([...(col.choices || []), ...raws.filter(x => x != null).map(x => String(x))])];
        info[c.id] = { cats, flat: cats.length < 2 || cats.every(k => (c.points[k] ?? 5) === (c.points[cats[0]] ?? 5)) };
      } else {
        ranges[c.id] = opt.R && opt.R[c.id] ? opt.R[c.id] : rangeOf(c, raws);
        info[c.id] = { flat: ranges[c.id].lo === ranges[c.id].hi && c.curve !== 'target' };
      }
      rows.forEach((row, i) => {
        row.c = row.c || {};
        const raw = raws[i];
        let t = null, s = 0, missing = false, bad = null;
        if (raw == null || (col.type !== 'text' && typeof raw !== 'number')) { missing = true; bad = row.errs[c.col] || (typeof raw === 'string' ? `“${raw}” isn't a number` : null); }
        else if (col.type === 'text') { s = U.clamp((c.points[String(raw)] ?? 5) / 10, 0, 1); t = s; }
        else {
          const R = ranges[c.id];
          t = R.hi === R.lo ? 1 : U.clamp((raw - R.lo) / (R.hi - R.lo), 0, 1);
          if (c.want === 'less' && R.hi !== R.lo) t = 1 - t;
          s = U.clamp(curveApply(c, t, raw, R), 0, 1);
        }
        row.c[c.id] = { raw, t, s, w: share[c.id], missing, bad, contrib: 0 };
      });
    });
    rows.forEach(row => {
      row.c = row.c || {};
      let S = 0;
      if (!totalW) S = 0;
      else if (model.method === 'balanced') {
        let lg = 0; crits.forEach(c => { lg += share[c.id] * Math.log(0.1 + 0.9 * row.c[c.id].s); });
        S = U.clamp((Math.exp(lg) - 0.1) / 0.9, 0, 1);
        const base = crits.reduce((a, c) => a + share[c.id] * row.c[c.id].s, 0);
        crits.forEach(c => { row.c[c.id].contrib = base ? S * share[c.id] * row.c[c.id].s / base : 0; });
      } else {
        crits.forEach(c => { const x = row.c[c.id]; x.contrib = share[c.id] * x.s; S += x.contrib; });
      }
      row.S = S;
      row.base = S * 100;
      row.score = row.pass ? Math.max(0, S * 100 - row.penalty) : 0;
      row.missing = crits.filter(c => row.c[c.id].missing).map(c => c.id);
    });
    const byId = {}; rows.forEach(r => { byId[r.id] = r; });
    const ranked = rows.filter(r => r.pass).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).map(r => r.id);
    const out = rows.filter(r => !r.pass).map(r => r.id);
    ranked.forEach((id, i) => { byId[id].rank = i + 1; });
    out.forEach(id => { byId[id].rank = null; });
    let lead = null;
    if (ranked.length) {
      const w = byId[ranked[0]], r2 = ranked[1] ? byId[ranked[1]] : null;
      let driver = null, best = -Infinity, weak = null, worst = Infinity;
      if (r2) crits.forEach(c => { const d = (w.c[c.id].contrib - r2.c[c.id].contrib) * 100; if (d > best) { best = d; driver = c.id; } if (d < worst) { worst = d; weak = c.id; } });
      lead = { winner: w.id, runnerUp: r2 ? r2.id : null, margin: r2 ? w.score - r2.score : null, driver, driverPts: best, weak: worst < 0 ? weak : null, weakPts: worst };
    }
    return { rows, byId, ranked, out, share, ranges, info, crits: crits.map(c => c.id), totalW, lead, issues: prep.issues, prep, K: opt.K || null };
  }

  function withModel(model, fn) { const m = U.clone(model); fn(m); return m; }

  function weightSweep(model, res, critId) {
    const runs = [], prep = res.prep;
    for (let w = 0; w <= 10; w += 0.5) {
      const r = compute(model, { prep, W: { [critId]: w } });
      const win = r.ranked[0] || null;
      if (!runs.length || runs[runs.length - 1].winner !== win) runs.push({ from: w, to: w, winner: win }); else runs[runs.length - 1].to = w;
    }
    return runs;
  }

  function knobSweep(model, knobId, steps, prep, K) {
    steps = steps || 24;
    const k = model.knobs.find(x => x.id === knobId); if (!k) return null;
    prep = prep || prepare(model);
    const at = v => compute(model, { prep, K: Object.assign({}, K || {}, { [knobId]: v }) });
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const v = k.min + (k.max - k.min) * i / steps;
      const r = at(v);
      pts.push({ v, winner: r.ranked[0] || null, score: r.ranked[0] ? r.byId[r.ranked[0]].score : 0 });
    }
    const flips = [];
    for (let i = 1; i < pts.length; i++) if (pts[i].winner !== pts[i - 1].winner) {
      let lo = pts[i - 1].v, hi = pts[i].v;
      for (let j = 0; j < 10; j++) {
        const mid = (lo + hi) / 2;
        const w = at(mid).ranked[0] || null;
        if (w === pts[i - 1].winner) lo = mid; else hi = mid;
      }
      flips.push({ at: (lo + hi) / 2, from: pts[i - 1].winner, to: pts[i].winner });
    }
    return { pts, flips };
  }

  function situations(model, prep) {
    prep = prep || prepare(model);
    return (model.scenarios || []).map(s => {
      const r = compute(model, { prep, K: Object.assign({}, model.base || {}, s.values || {}) });
      const w = r.ranked[0] || null;
      return { id: s.id, label: s.label, winner: w, score: w ? r.byId[w].score : 0, margin: r.lead ? r.lead.margin : null, out: r.out.length, res: r };
    });
  }

  function whatItTakes(model, res, rowId) {
    const row = res.byId[rowId], lead = res.lead;
    if (!row || !lead || !row.pass) return [];
    const target = row.rank === 1 ? res.ranked[1] : lead.winner;
    if (!target) return [];
    const out = [];
    const editable = model.columns.filter(c => !(c.formula && c.formula.trim()) && c.type === 'number');
    const used = new Set();
    model.criteria.filter(c => c.on && c.weight > 0).forEach(c => {
      const roots = rootInputs(model, res.prep, c.col);
      roots.forEach(id => used.add(id));
    });
    editable.filter(c => used.has(c.id)).forEach(col => {
      const cur = model.rows.find(r => r.id === rowId).v[col.id];
      if (typeof cur !== 'number') return;
      const vals = model.rows.map(r => r.v[col.id]).filter(x => typeof x === 'number');
      const span = Math.max(Math.max(...vals) - Math.min(...vals), Math.abs(cur) * 0.5, 1);
      const test = v => {
        const r = compute(model, { prep: res.prep, V: { [rowId]: { [col.id]: v } } });
        return row.rank === 1 ? r.ranked[0] !== rowId : r.ranked[0] === rowId;
      };
      [-1, 1].forEach(dir => {
        const far = cur + dir * span * 1.5;
        if (!test(far)) return;
        let lo = cur, hi = far;
        for (let j = 0; j < 16; j++) { const mid = (lo + hi) / 2; if (test(mid)) hi = mid; else lo = mid; }
        out.push({ col: col.id, from: cur, to: hi, delta: hi - cur, rel: Math.abs(hi - cur) / span });
      });
    });
    return out.sort((a, b) => a.rel - b.rel).slice(0, 4).map(x => Object.assign(x, { lose: row.rank === 1, vs: target }));
  }

  function rootInputs(model, prep, colId, seen) {
    seen = seen || new Set();
    if (seen.has(colId)) return [];
    seen.add(colId);
    const k = prep.comp[colId];
    if (!k) return [colId];
    return k.refs.flatMap(r => model.knobs.some(x => x.id === r) ? [] : rootInputs(model, prep, r, seen));
  }

  function trace(model, res, rowId) {
    const row = res.byId[rowId]; if (!row) return null;
    const steps = [];
    model.columns.filter(c => res.prep.comp[c.id]).forEach(c => {
      const k = res.prep.comp[c.id];
      const plug = F.print(k.ast, id => { const v = row.vals[id]; if (typeof v === 'string') return JSON.stringify(v); if (typeof v === 'boolean') return v ? 'yes' : 'no'; return U.withUnit(v, (model.columns.find(x => x.id === id) || model.knobs.find(x => x.id === id) || {}).unit); }, true);
      steps.push({ kind: 'calc', col: c.id, formula: MD.pretty(model, c.formula), plug, value: row.vals[c.id], err: row.errs[c.id] });
    });
    return steps;
  }

  M.engine = { prepare, compute, curveApply, weightSweep, knobSweep, situations, whatItTakes, trace, rootInputs, withModel };
})(window.M);
