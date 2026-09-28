window.M = window.M || {};
(function (M) {
  'use strict';
  const { parse, check, evaluate } = M.expr;
  const { clamp, fmt, fmtN } = M.util;

  const isNum = v => typeof v === 'number' && !Number.isNaN(v);

  function compile(model) {
    const errors = [];
    const colType = {}; model.columns.forEach(c => { colType[c.id] = c.type; });
    const names = new Set([...model.columns.map(c => c.id), ...model.params.map(p => p.id)]);
    const comp = (src, set, where, id, sink) => {
      const out = sink || errors, r = parse(src);
      if (r.error) { out.push({ where, id, msg: r.error.msg, pos: r.error.pos }); return null; }
      const e = check(r.ast, set);
      if (e) { out.push({ where, id, msg: e.msg, pos: e.pos }); return null; }
      return r.ast;
    };
    const CA = (model.calcs || []).map(k => { const ast = comp(k.expr, names, 'calc', k.id); names.add(k.id); return { k, ast }; });
    const G = model.gates.filter(g => g.enabled).map(g => ({ g, ast: comp(g.expr, names, 'gate', g.id) })).filter(x => x.ast);
    const calcIds = new Set(CA.map(x => x.k.id));
    const C = [];
    model.criteria.forEach(c => {
      if (!c.enabled) return;
      let ast = null;
      if (c.source.kind === 'expr') { ast = comp(c.source.expr, names, 'criterion', c.id); if (!ast) return; }
      else if (c.source.kind === 'calc') { if (!calcIds.has(c.source.calc)) { errors.push({ where: 'criterion', id: c.id, msg: 'Calculation not found: ' + c.source.calc, pos: 0 }); return; } }
      else if (!(c.source.column in colType)) { errors.push({ where: 'criterion', id: c.id, msg: 'Column not found: ' + c.source.column, pos: 0 }); return; }
      C.push({ c, ast, isMap: c.shape.type === 'map' });
    });
    return { errors, colType, names, comp, CA, G, C };
  }

  function compute(model, opts) {
    opts = opts || {};
    const K = opts.K || compile(model), errors = K.errors.slice(), colType = K.colType, C = K.C;
    const P = {}; model.params.forEach(p => { P[p.id] = +p.value; });
    if (opts.P) Object.assign(P, opts.P);

    const rawOf = (x, r, sc) => {
      const c = x.c;
      if (x.ast) {
        try { const v = evaluate(x.ast, sc); return isNum(v) ? { raw: v } : x.isMap && typeof v === 'string' ? { raw: v } : { raw: null, error: 'Result is not a number' }; }
        catch (e) { return { raw: null, error: e.msg || String(e) }; }
      }
      if (c.source.kind === 'calc') {
        const cv = r.calc[c.source.calc];
        if (!cv || cv.v === null) return { raw: null, error: cv && cv.error ? cv.error : 'Missing value' };
        if (x.isMap) return { raw: String(cv.v) };
        return isNum(cv.v) ? { raw: cv.v } : { raw: null, error: 'Text needs the per-category shape' };
      }
      const v = r.v[c.source.column];
      if (v === null || v === undefined || v === '') return { raw: null, error: 'Missing value' };
      const ty = colType[c.source.column];
      if (ty === 'boolean') return { raw: (v === true || v === 'true' || v === 1) ? 1 : 0 };
      if (x.isMap) return { raw: String(v) };
      if (ty === 'category') return { raw: null, error: 'Text needs the per-category shape' };
      const n = +v; return isFinite(n) ? { raw: n } : { raw: null, error: 'Not a number' };
    };

    const rows = model.rows.map(r => {
      const sc = Object.assign({}, r.v, P), calc = {};
      if (opts.rowP && opts.rowP[r.id]) Object.assign(sc, opts.rowP[r.id]);
      K.CA.forEach(x => {
        if (!x.ast) { calc[x.k.id] = { v: null, error: 'Formula has an error' }; return; }
        try {
          const v = evaluate(x.ast, sc);
          if (isNum(v) || typeof v === 'string') { calc[x.k.id] = { v }; sc[x.k.id] = v; }
          else calc[x.k.id] = { v: null, error: 'Not a number' };
        } catch (e) { calc[x.k.id] = { v: null, error: e.msg || String(e) }; }
      });
      const rr = { id: r.id, label: r.label, calc, v: r.v };
      const gates = K.G.map(x => {
        try { const v = evaluate(x.ast, sc); return { id: x.g.id, pass: typeof v === 'number' ? v !== 0 && !isNaN(v) : !!v, error: null }; }
        catch (e) { return { id: x.g.id, pass: false, error: e.msg || String(e) }; }
      });
      const f = gates.find(g => !g.pass), fg = f && K.G.find(x => x.g.id === f.id).g;
      const crit = {}; C.forEach(x => { crit[x.c.id] = rawOf(x, rr, sc); });
      delete rr.v;
      return Object.assign(rr, { pass: !f, gates, failReason: fg ? (fg.label || fg.expr) : null, crit, S: 0, score: 0, rank: null });
    });

    const ranges = {};
    C.forEach(x => {
      if (x.isMap) return;
      const c = x.c; let lo, hi; const auto = c.range.auto !== false;
      if (auto && opts.ranges && opts.ranges[c.id]) { ranges[c.id] = opts.ranges[c.id]; return; }
      if (auto) { const vals = rows.map(r => r.crit[c.id].raw).filter(v => typeof v === 'number' && isFinite(v)); lo = vals.length ? Math.min(...vals) : 0; hi = vals.length ? Math.max(...vals) : 0; }
      else { lo = +c.range.lo || 0; hi = +c.range.hi || 0; }
      ranges[c.id] = { lo, hi, auto };
    });
    const total = C.reduce((a, x) => a + Math.max(0, +x.c.weight || 0), 0);
    const weights = {}; C.forEach(x => { weights[x.c.id] = total > 0 ? Math.max(0, +x.c.weight || 0) / total : 0; });
    const active = C.filter(x => weights[x.c.id] > 0);
    let ctype = model.combine.type, cast = null, customFallback = false;
    if (ctype === 'custom') {
      const names = new Set([...model.params.map(p => p.id), ...C.map(x => x.c.id), ...C.map(x => 'w_' + x.c.id)]);
      cast = K.comp(model.combine.expr, names, 'combine', 'combine', errors);
      if (!cast) { ctype = 'sum'; customFallback = true; }
    }
    let outOfRange = false;
    rows.forEach(r => {
      C.forEach(x => {
        const e = r.crit[x.c.id], w = weights[x.c.id]; let t = null, s = 0; e.t0 = null;
        if (e.raw === null) {
          const pol = x.c.missing || 'worst';
          e.imputed = pol;
          if (pol === 'neutral') s = 0.5; else if (pol === 'best') s = 1;
          else if (pol === 'exclude' && r.pass) { r.pass = false; r.missingOut = true; r.failReason = 'No value for ' + x.c.label; }
        } else if (x.isMap) s = M.shapes.apply(x.c.shape, 0, e.raw);
        else {
          const R = ranges[x.c.id];
          t = R.hi === R.lo ? (isFinite(e.raw) ? 0.5 : (e.raw > 0 ? 1 : 0)) : clamp((e.raw - R.lo) / (R.hi - R.lo), 0, 1);
          e.t0 = t;
          if (x.c.direction === 'lower' && x.c.shape.type !== 'target') t = 1 - t;
          s = M.shapes.apply(x.c.shape, t);
        }
        e.t = t; e.s = s; e.w = w; e.contrib = w * s;
      });
      let S = 0;
      if (total > 0) {
        if (ctype === 'sum') S = active.reduce((a, x) => a + r.crit[x.c.id].contrib, 0);
        else if (ctype === 'product') S = active.length ? active.reduce((a, x) => a * Math.pow(r.crit[x.c.id].s, weights[x.c.id]), 1) : 0;
        else if (ctype === 'min') S = active.length ? Math.min(...active.map(x => r.crit[x.c.id].s)) : 0;
        else {
          const sc = Object.assign({}, P);
          C.forEach(x => { sc[x.c.id] = r.crit[x.c.id].s; sc['w_' + x.c.id] = weights[x.c.id]; });
          try { S = evaluate(cast, sc); if (!isNum(S) || !isFinite(S)) { S = 0; r.combineError = 'Not a number'; } }
          catch (e) { S = 0; r.combineError = e.msg; }
          if (S < 0 || S > 1) outOfRange = true;
        }
      }
      r.S = S; r.score = r.pass ? S * 100 : 0;
    });
    if (outOfRange) errors.push({ where: 'combine', id: 'combine', msg: 'Some results fall outside 0–1, so scores can go below 0 or above 100', pos: 0, warn: true });
    const ranked = rows.filter(r => r.pass).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    ranked.forEach((r, i) => { r.rank = i + 1; });
    const out = rows.filter(r => !r.pass).sort((a, b) => a.label.localeCompare(b.label));
    let lead = null;
    if (ranked.length >= 2) {
      const a = ranked[0], b = ranked[1];
      lead = { winner: a.id, runnerUp: b.id, margin: a.score - b.score, driver: null };
      if (ctype === 'sum') {
        let best = null;
        active.forEach(x => { const d = (a.crit[x.c.id].contrib - b.crit[x.c.id].contrib) * 100; if (!best || d > best.pts) best = { critId: x.c.id, pts: d }; });
        lead.driver = best;
      }
    } else if (ranked.length === 1) lead = { winner: ranked[0].id, runnerUp: null, margin: null, driver: null };
    const byId = {}; rows.forEach(r => { byId[r.id] = r; });
    return { ranges, weights, rows, byId, ranked: ranked.map(r => r.id), out: out.map(r => r.id), lead, errors,
      total, ctype, customFallback, used: C.map(x => x.c.id), active: active.map(x => x.c.id), P, cast };
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function combineS(res, sv, W) {
    const ids = res.active, ct = res.ctype;
    if (!ids.length) return 0;
    if (ct === 'product') return ids.reduce((a, id) => a * Math.pow(sv[id], W[id]), 1);
    if (ct === 'min') return Math.min(...ids.map(id => sv[id]));
    if (ct === 'custom' && res.cast) {
      const sc = Object.assign({}, res.P); res.used.forEach(id => { sc[id] = sv[id] ?? 0; sc['w_' + id] = W[id] ?? 0; });
      try { const v = evaluate(res.cast, sc); return isNum(v) && isFinite(v) ? v : 0; } catch (e) { return 0; }
    }
    return ids.reduce((a, id) => a + W[id] * sv[id], 0);
  }

  function uncertainty(model, res, samples) {
    samples = samples || 1000;
    const noisy = model.criteria.filter(c => res.used.includes(c.id) && +c.noise > 0 && c.shape.type !== 'map');
    if (!noisy.length || res.ranked.length < 2) return null;
    const R = rng(7), rows = res.ranked.map(id => res.byId[id]);
    const first = {}, ranks = {}; rows.forEach(r => { first[r.id] = 0; ranks[r.id] = []; });
    const byId = {}; model.criteria.forEach(c => { byId[c.id] = c; });
    for (let k = 0; k < samples; k++) {
      const scored = rows.map(r => {
        const sv = {};
        res.used.forEach(id => {
          const e = r.crit[id], c = byId[id];
          if (+c.noise > 0 && c.shape.type !== 'map' && e.t0 != null) {
            let t = clamp(e.t0 + gauss(R) * c.noise / 100, 0, 1);
            if (c.direction === 'lower' && c.shape.type !== 'target') t = 1 - t;
            sv[id] = M.shapes.apply(c.shape, t);
          } else sv[id] = e.s;
        });
        return { id: r.id, S: combineS(res, sv, res.weights) };
      }).sort((a, b) => b.S - a.S);
      first[scored[0].id]++;
      scored.forEach((x, i) => ranks[x.id].push(i + 1));
    }
    const out = {};
    rows.forEach(r => {
      const s = ranks[r.id].sort((a, b) => a - b);
      out[r.id] = { pFirst: first[r.id] / samples, lo: s[Math.floor(0.05 * (s.length - 1))], hi: s[Math.floor(0.95 * (s.length - 1))] };
    });
    return { samples, byRow: out, noisy: noisy.map(c => c.id) };
  }

  function weightFree(model, res, samples) {
    samples = samples || 2000;
    const ids = res.active;
    if (ids.length < 2 || res.ranked.length < 2 || res.ctype === 'min') return null;
    const R = rng(11), rows = res.ranked.map(id => res.byId[id]);
    const sv = rows.map(r => { const o = {}; res.used.forEach(id => { o[id] = r.crit[id].s; }); return o; });
    const wins = {}; rows.forEach(r => { wins[r.id] = 0; });
    for (let k = 0; k < samples; k++) {
      const g = ids.map(() => -Math.log(R() || 1e-12)), gs = g.reduce((a, b) => a + b, 0);
      const W = {}; ids.forEach((id, i) => { W[id] = g[i] / gs; });
      let best = -Infinity, who = null;
      rows.forEach((r, i) => { const S = combineS(res, sv[i], W); if (S > best) { best = S; who = r.id; } });
      wins[who]++;
    }
    const shares = {}; Object.keys(wins).forEach(id => { shares[id] = wins[id] / samples; });
    return { samples, shares };
  }

  function reversal(model, res) {
    if (!Object.values(res.ranges).some(R => R.auto) || res.ranked.length < 3 || model.rows.length > 80) return [];
    const win = res.ranked[0], out = [];
    model.rows.forEach(row => {
      if (row.id === win) return;
      const m = Object.assign({}, model, { rows: model.rows.filter(x => x.id !== row.id) });
      const w2 = compute(m).ranked[0];
      if (w2 && w2 !== win) out.push({ removed: row.id, winner: w2 });
    });
    return out;
  }

  function sweep(model, critId, step) {
    step = step || 1;
    const m = structuredClone(model);
    const en = m.criteria.filter(c => c.enabled);
    const me = en.find(c => c.id === critId); if (!me) return null;
    const others = en.filter(c => c !== me);
    const orig = others.map(c => +c.weight || 0), osum = orig.reduce((a, b) => a + b, 0);
    const total = en.reduce((a, c) => a + (+c.weight || 0), 0);
    const current = total > 0 ? (+me.weight || 0) / total * 100 : 0;
    const runs = [];
    for (let v = 0; v <= 100; v += step) {
      me.weight = v;
      others.forEach((c, i) => { c.weight = osum > 0 ? orig[i] / osum * (100 - v) : (100 - v) / others.length; });
      const w = compute(m).ranked[0] || null;
      const last = runs[runs.length - 1];
      if (last && last.winner === w) last.to = v; else runs.push({ from: v, to: v, winner: w });
    }
    return { runs, current };
  }

  function knobSweep(model, paramId, steps) {
    steps = steps || 24;
    const p = model.params.find(x => x.id === paramId); if (!p) return null;
    const lo = +p.min, hi = +p.max; if (!(hi > lo)) return null;
    const pts = [], K = compile(model);
    for (let i = 0; i <= steps; i++) {
      const v = lo + (hi - lo) * i / steps, r = compute(model, { P: { [paramId]: v }, K });
      const w = r.ranked[0] || null;
      pts.push({ v, winner: w, score: w ? r.byId[w].score : 0, left: r.ranked.length });
    }
    const runs = [];
    pts.forEach((x, i) => {
      const last = runs[runs.length - 1];
      if (last && last.winner === x.winner) { last.to = x.v; last.toI = i; }
      else runs.push({ from: x.v, to: x.v, fromI: i, toI: i, winner: x.winner });
    });
    return { id: paramId, lo, hi, current: +p.value, pts, runs, steps };
  }

  function scenarios(model) {
    const K = compile(model);
    return (model.scenarios || []).map(s => {
      const r = compute(model, { P: s.values || {}, K });
      const w = r.ranked[0] || null;
      return { id: s.id, label: s.label, winner: w, score: w ? r.byId[w].score : 0, top: r.ranked.slice(0, 3), left: r.ranked.length, res: r };
    });
  }

  function trace(model, res, rowId) {
    const r = res.byId[rowId]; if (!r) return [];
    const L = [];
    (model.calcs || []).forEach(k => {
      const cv = r.calc[k.id] || {};
      L.push({ kind: 'calc', calcId: k.id, text: k.label, sub: k.expr, value: cv.v === null || cv.v === undefined ? 'missing' : M.format.calc(k, cv.v), error: cv.error });
    });
    model.gates.filter(g => g.enabled).forEach(g => {
      const gr = r.gates.find(x => x.id === g.id);
      L.push({ kind: 'gate', text: g.label || g.expr, sub: g.expr, value: gr ? (gr.pass ? 'pass' : 'fail') : 'skipped', error: gr ? gr.error : 'This rule has an error and was skipped' });
    });
    L.push({ kind: 'gate-total', text: 'Rules', value: r.pass ? '1' : '0' });
    model.criteria.forEach(c => {
      const e = r.crit[c.id]; if (!e) return;
      const R = res.ranges[c.id];
      const src = c.source.kind === 'column' ? c.source.column : c.source.kind === 'calc' ? c.source.calc : c.source.expr;
      L.push({ kind: 'raw', critId: c.id, text: src, value: e.raw == null ? 'missing' : fmtN(e.raw), error: e.error });
      if (e.raw == null) L.push({ kind: 'impute', critId: c.id, text: { worst: 'missing, so counted as worst', neutral: 'missing, so counted as middle', best: 'missing, so counted as best', exclude: 'missing, so ruled out' }[c.missing || 'worst'], value: fmt(e.s, 3) });
      if (c.shape.type !== 'map' && e.raw != null) {
        L.push({ kind: 'norm', critId: c.id, text: `placed on ${fmtN(R.lo)} … ${fmtN(R.hi)}`, value: fmt(e.t0, 3) });
        if (c.direction === 'lower' && c.shape.type !== 'target') L.push({ kind: 'dir', critId: c.id, text: 'lower is better, so 1 − t', value: fmt(e.t, 3) });
      }
      L.push({ kind: 'shape', critId: c.id, text: 'shape: ' + M.shapes.META[c.shape.type].label.toLowerCase(), value: fmt(e.s, 3) });
      if (res.ctype === 'sum') L.push({ kind: 'weight', critId: c.id, text: `× share ${fmt(e.w * 100, 1)}%`, value: fmt(e.contrib * 100, 2) + ' pts' });
      else L.push({ kind: 'weight', critId: c.id, text: 'share', value: fmt(e.w * 100, 1) + '%' });
    });
    const cl = { sum: 'Add up the points', product: 'Multiply s^share', min: 'Take the weakest', custom: 'Custom formula' }[res.ctype];
    L.push({ kind: 'combine', text: cl, value: fmt(r.S, 4), error: r.combineError });
    L.push({ kind: 'final', text: r.pass ? 'Rules × S × 100' : 'Ruled out, so 0', value: fmt(r.score, 1) });
    return L;
  }

  M.format = {
    calc(k, v) {
      if (typeof v === 'string') return v;
      if (!isNum(v)) return '—';
      if (v === Infinity) return '∞';
      if (v === -Infinity) return '−∞';
      if (k && k.format === 'pct') return fmt(v * 100, Math.abs(v) < 0.1 ? 1 : 0) + '%';
      const u = k && k.unit ? ' ' + k.unit : '';
      const a = Math.abs(v);
      const s = a >= 1000 ? Math.round(v).toLocaleString('en-US') : a >= 1 ? String(+v.toFixed(1)) : a === 0 ? '0' : String(+v.toPrecision(2));
      return s + u;
    }
  };
  M.engine = { compile, compute, trace, uncertainty, weightFree, reversal, rng, combineS, knobSweep, scenarios };
  M.sensitivity = { sweep, knob: knobSweep };
})(window.M);
