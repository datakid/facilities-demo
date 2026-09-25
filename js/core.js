/* Meridian Studio — core: util, expr, shapes, engine, sensitivity, honesty, codegen.
   Pure functions only. No eval / new Function anywhere. */
window.M = window.M || {};
(function (M) {
  'use strict';

  /* ---------------- util ---------------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (x, d = 1) => (x == null || typeof x !== 'number' || !isFinite(x)) ? '—' : x.toFixed(d);
  const fmtN = x => {
    if (typeof x !== 'number' || !isFinite(x)) return String(x ?? '—');
    if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString('en-US');
    return String(+x.toFixed(3));
  };
  const ID_RE = /^[a-z_][a-z0-9_]{0,31}$/;
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
  const toId = s => {
    let x = String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!/^[a-z_]/.test(x)) x = 'c_' + x;
    return x.slice(0, 32) || 'c';
  };

  /* ---------------- expr ---------------- */
  const FN = { min: [1, 99], max: [1, 99], abs: [1, 1], sqrt: [1, 1], exp: [1, 1], ln: [1, 1], log10: [1, 1],
    pow: [2, 2], clamp: [3, 3], if: [3, 3], round: [1, 2] };
  const RESERVED = new Set([...Object.keys(FN), 'true', 'false']);
  const OPS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '^', '(', ')', ',', '<', '>', '!'];

  function tokenize(src) {
    const out = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const rest = src.slice(i); let m;
      if ((m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest))) { out.push({ k: 'num', v: parseFloat(m[0]), s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { out.push({ k: 'id', v: m[0], s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if (c === '"') { const j = src.indexOf('"', i + 1); if (j < 0) throw { msg: 'Unclosed text', pos: i }; out.push({ k: 'str', v: src.slice(i + 1, j), s: i, e: j + 1 }); i = j + 1; continue; }
      const op = OPS.find(o => rest.startsWith(o));
      if (op) { out.push({ k: 'op', v: op, s: i, e: i + op.length }); i += op.length; continue; }
      throw { msg: 'Unexpected character', pos: i };
    }
    out.push({ k: 'end', v: '', s: src.length, e: src.length });
    return out;
  }

  function parse(src) {
    try {
      const T = tokenize(String(src ?? '')); let p = 0;
      const isOp = v => T[p].k === 'op' && T[p].v === v;
      const fail = msg => { throw { msg, pos: T[p].s }; };
      const or = () => { let a = and(); while (isOp('||')) { p++; a = { t: 'bin', op: '||', a, b: and() }; } return a; };
      const and = () => { let a = cmp(); while (isOp('&&')) { p++; a = { t: 'bin', op: '&&', a, b: cmp() }; } return a; };
      const cmp = () => { let a = add(); if (T[p].k === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(T[p].v)) { const op = T[p++].v; a = { t: 'bin', op, a, b: add() }; } return a; };
      const add = () => { let a = mul(); while (isOp('+') || isOp('-')) { const op = T[p++].v; a = { t: 'bin', op, a, b: mul() }; } return a; };
      const mul = () => { let a = un(); while (isOp('*') || isOp('/') || isOp('%')) { const op = T[p++].v; a = { t: 'bin', op, a, b: un() }; } return a; };
      const un = () => { if (isOp('-') || isOp('!')) { const op = T[p++].v; return { t: 'un', op, a: un() }; } return pw(); };
      const pw = () => { const a = atom(); if (isOp('^')) { p++; return { t: 'bin', op: '^', a, b: un() }; } return a; };
      const atom = () => {
        const t = T[p];
        if (t.k === 'num') { p++; return { t: 'num', v: t.v }; }
        if (t.k === 'str') { p++; return { t: 'str', v: t.v }; }
        if (t.k === 'id') {
          p++;
          if (t.v === 'true') return { t: 'num', v: 1 };
          if (t.v === 'false') return { t: 'num', v: 0 };
          if (isOp('(')) {
            p++; const args = [];
            if (!isOp(')')) { args.push(or()); while (isOp(',')) { p++; args.push(or()); } }
            if (!isOp(')')) fail("Expected ')'");
            p++; return { t: 'call', fn: t.v, args, pos: t.s };
          }
          return { t: 'id', name: t.v, pos: t.s };
        }
        if (isOp('(')) { p++; const e = or(); if (!isOp(')')) fail("Expected ')'"); p++; return e; }
        fail(t.k === 'end' ? 'Unexpected end' : "Unexpected '" + t.v + "'");
      };
      if (T[0].k === 'end') return { error: { msg: 'Empty expression', pos: 0 } };
      const ast = or();
      if (T[p].k !== 'end') fail("Unexpected '" + T[p].v + "'");
      return { ast };
    } catch (e) { if (e && e.msg) return { error: e }; throw e; }
  }

  function check(ast, names) {
    let err = null;
    (function w(n) {
      if (err) return;
      if (n.t === 'id') { if (!names.has(n.name)) err = { msg: `Unknown name '${n.name}'`, pos: n.pos }; }
      else if (n.t === 'call') {
        const f = FN[n.fn];
        if (!f) { err = { msg: `Unknown function '${n.fn}'`, pos: n.pos }; return; }
        if (n.args.length < f[0] || n.args.length > f[1]) {
          const need = f[1] === 99 ? `at least ${f[0]} value` : f[0] === f[1] ? `${f[0]} value${f[0] > 1 ? 's' : ''}` : `${f[0]} or ${f[1]} values`;
          err = { msg: `${n.fn} needs ${need}`, pos: n.pos }; return;
        }
        n.args.forEach(w);
      } else if (n.t === 'un') w(n.a);
      else if (n.t === 'bin') { w(n.a); w(n.b); }
    })(ast);
    return err;
  }

  const numv = v => { if (typeof v === 'string') throw { msg: 'Text can only be compared' }; return v; };
  function evaluate(n, S) {
    switch (n.t) {
      case 'num': case 'str': return n.v;
      case 'id': {
        const v = S[n.name];
        if (v === null || v === undefined || v === '') throw { msg: 'Missing value: ' + n.name };
        return typeof v === 'boolean' ? (v ? 1 : 0) : v;
      }
      case 'un': { const a = numv(evaluate(n.a, S)); return n.op === '-' ? -a : (a ? 0 : 1); }
      case 'bin': {
        if (n.op === '&&') return numv(evaluate(n.a, S)) && numv(evaluate(n.b, S)) ? 1 : 0;
        if (n.op === '||') return numv(evaluate(n.a, S)) || numv(evaluate(n.b, S)) ? 1 : 0;
        const a = evaluate(n.a, S), b = evaluate(n.b, S);
        if (n.op === '==') return a === b ? 1 : 0;
        if (n.op === '!=') return a !== b ? 1 : 0;
        const x = numv(a), y = numv(b);
        switch (n.op) {
          case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y;
          case '%': return x % y; case '^': return Math.pow(x, y);
          case '<': return x < y ? 1 : 0; case '<=': return x <= y ? 1 : 0;
          case '>': return x > y ? 1 : 0; case '>=': return x >= y ? 1 : 0;
        }
        break;
      }
      case 'call': {
        if (n.fn === 'if') return numv(evaluate(n.args[0], S)) ? evaluate(n.args[1], S) : evaluate(n.args[2], S);
        const A = n.args.map(a => numv(evaluate(a, S)));
        switch (n.fn) {
          case 'min': return Math.min(...A); case 'max': return Math.max(...A);
          case 'abs': return Math.abs(A[0]); case 'sqrt': return Math.sqrt(A[0]); case 'exp': return Math.exp(A[0]);
          case 'ln': return Math.log(A[0]); case 'log10': return Math.log10(A[0]); case 'pow': return Math.pow(A[0], A[1]);
          case 'clamp': return Math.max(A[1], Math.min(A[2], A[0]));
          case 'round': { const d = A[1] || 0; return Math.round(A[0] * 10 ** d) / 10 ** d; }
        }
      }
    }
    throw { msg: 'Cannot evaluate' };
  }

  function idents(src) { try { return tokenize(String(src)).filter(t => t.k === 'id').map(t => ({ name: t.v, start: t.s, end: t.e })); } catch (e) { return []; } }
  function rename(src, old, neu) {
    let out = String(src);
    idents(src).filter(t => t.name === old).reverse().forEach(t => { out = out.slice(0, t.start) + neu + out.slice(t.end); });
    return out;
  }
  // AST -> JavaScript source, fully parenthesised. map(name) gives the JS reference.
  function toJS(n, map) {
    switch (n.t) {
      case 'num': return String(n.v);
      case 'str': return JSON.stringify(n.v);
      case 'id': return map(n.name);
      case 'un': return n.op === '-' ? `(-${toJS(n.a, map)})` : `(!${toJS(n.a, map)})`;
      case 'bin': {
        const op = { '^': '**', '==': '===', '!=': '!==' }[n.op] || n.op;
        return `(${toJS(n.a, map)} ${op} ${toJS(n.b, map)})`;
      }
      case 'call':
        if (n.fn === 'if') return `(${toJS(n.args[0], map)} ? ${toJS(n.args[1], map)} : ${toJS(n.args[2], map)})`;
        return `F.${n.fn}(${n.args.map(a => toJS(a, map)).join(', ')})`;
    }
    return 'NaN';
  }
  // AST -> readable text
  function toText(n) {
    switch (n.t) {
      case 'num': return String(n.v); case 'str': return JSON.stringify(n.v); case 'id': return n.name;
      case 'un': return n.op + toText(n.a);
      case 'bin': return `(${toText(n.a)} ${n.op} ${toText(n.b)})`;
      case 'call': return `${n.fn}(${n.args.map(toText).join(', ')})`;
    }
    return '?';
  }
  M.expr = { parse, check, evaluate, idents, rename, toJS, toText, FN, RESERVED };
  const uniqueId = (base, taken) => {
    let id = toId(base), i = 2; const root = id.slice(0, 28);
    while (taken.has(id) || RESERVED.has(id)) id = root + '_' + i++;
    return id;
  };
  M.util = { esc, clamp, fmt, fmtN, slug, toId, uniqueId, ID_RE };

  /* ---------------- shapes ---------------- */
  const sig = (x, a, c) => 1 / (1 + Math.exp(-a * (x - c)));
  const SH = {
    linear: t => t,
    curve: (t, p) => Math.pow(t, p.k ?? 2),
    scurve: (t, p) => { const a = p.a ?? 10, c = p.c ?? 0.5, s0 = sig(0, a, c), s1 = sig(1, a, c); return (sig(t, a, c) - s0) / (s1 - s0); },
    step: (t, p) => (t >= (p.c ?? 0.5) ? 1 : 0),
    target: (t, p) => { const w = p.width ?? 0.2; return Math.exp(-(((t - (p.c ?? 0.5)) / w) ** 2)); }
  };
  M.shapes = {
    apply(shape, t, raw) {
      if (shape.type === 'map') return clamp(+((shape.map || {})[String(raw)]) || 0, 0, 1);
      const f = SH[shape.type] || SH.linear; const s = f(t, shape);
      return isFinite(s) ? clamp(s, 0, 1) : 0;
    },
    META: {
      linear: { label: 'Linear', line: 'Straight line', params: [] },
      curve: { label: 'Curve', line: 'Bends toward strict or lenient', params: [{ key: 'k', label: 'Bend', min: 0.25, max: 4, step: 0.05 }] },
      scurve: { label: 'S-curve', line: 'Soft cut-off around a point', params: [{ key: 'a', label: 'Steepness', min: 2, max: 30, step: 1 }, { key: 'c', label: 'Turning point', min: 0, max: 1, step: 0.01, raw: true }] },
      step: { label: 'Step', line: 'Full points past a line, none before', params: [{ key: 'c', label: 'Line', min: 0, max: 1, step: 0.01, raw: true }] },
      target: { label: 'Target', line: 'Best at a sweet spot', params: [{ key: 'c', label: 'Sweet spot', min: 0, max: 1, step: 0.01, raw: true }, { key: 'width', label: 'Tolerance', min: 0.05, max: 1, step: 0.01, rawWidth: true }] },
      map: { label: 'Per category', line: 'Points per category', params: [] }
    }
  };

  /* ---------------- engine ---------------- */
  function compute(model) {
    const errors = [], P = {};
    model.params.forEach(p => { P[p.id] = +p.value; });
    const colType = {}; model.columns.forEach(c => { colType[c.id] = c.type; });
    const base = new Set([...model.columns.map(c => c.id), ...model.params.map(p => p.id)]);
    const comp = (src, names, where, id) => {
      const r = parse(src);
      if (r.error) { errors.push({ where, id, msg: r.error.msg, pos: r.error.pos }); return null; }
      const e = check(r.ast, names);
      if (e) { errors.push({ where, id, msg: e.msg, pos: e.pos }); return null; }
      return r.ast;
    };
    const G = model.gates.filter(g => g.enabled).map(g => ({ g, ast: comp(g.expr, base, 'gate', g.id) })).filter(x => x.ast);
    const C = [];
    model.criteria.forEach(c => {
      if (!c.enabled) return;
      let ast = null;
      if (c.source.kind === 'expr') { ast = comp(c.source.expr, base, 'criterion', c.id); if (!ast) return; }
      else if (!(c.source.column in colType)) { errors.push({ where: 'criterion', id: c.id, msg: 'Column not found: ' + c.source.column, pos: 0 }); return; }
      C.push({ c, ast, isMap: c.shape.type === 'map' });
    });
    const rawOf = (x, r, sc) => {
      if (x.ast) {
        try { const v = evaluate(x.ast, sc); return (typeof v === 'number' && isFinite(v)) ? { raw: v } : { raw: null, error: 'Result is not a number' }; }
        catch (e) { return { raw: null, error: e.msg || String(e) }; }
      }
      const v = r.v[x.c.source.column];
      if (v === null || v === undefined || v === '') return { raw: null, error: 'Missing value' };
      const ty = colType[x.c.source.column];
      if (ty === 'boolean') return { raw: (v === true || v === 'true' || v === 1) ? 1 : 0 };
      if (x.isMap) return { raw: String(v) };
      if (ty === 'category') return { raw: null, error: 'Text needs the per-category shape' };
      const n = +v; return isFinite(n) ? { raw: n } : { raw: null, error: 'Not a number' };
    };
    const rows = model.rows.map(r => {
      const sc = Object.assign({}, r.v, P);
      const gates = G.map(x => {
        try { const v = evaluate(x.ast, sc); return { id: x.g.id, pass: typeof v === 'number' ? v !== 0 && !isNaN(v) : !!v, error: null }; }
        catch (e) { return { id: x.g.id, pass: false, error: e.msg || String(e) }; }
      });
      const f = gates.find(g => !g.pass); const fg = f && G.find(x => x.g.id === f.id).g;
      const crit = {}; C.forEach(x => { crit[x.c.id] = rawOf(x, r, sc); });
      return { id: r.id, label: r.label, pass: !f, gates, failReason: fg ? (fg.label || fg.expr) : null, crit, S: 0, score: 0, rank: null };
    });
    const ranges = {};
    C.forEach(x => {
      if (x.isMap) return;
      const c = x.c; let lo, hi; const auto = c.range.auto !== false;
      if (auto) { const vals = rows.map(r => r.crit[c.id].raw).filter(v => typeof v === 'number'); lo = vals.length ? Math.min(...vals) : 0; hi = vals.length ? Math.max(...vals) : 0; }
      else { lo = +c.range.lo || 0; hi = +c.range.hi || 0; }
      ranges[c.id] = { lo, hi, auto };
    });
    const total = C.reduce((a, x) => a + Math.max(0, +x.c.weight || 0), 0);
    const weights = {}; C.forEach(x => { weights[x.c.id] = total > 0 ? Math.max(0, +x.c.weight || 0) / total : 0; });
    const active = C.filter(x => weights[x.c.id] > 0);
    let ctype = model.combine.type, cast = null, customFallback = false;
    if (ctype === 'custom') {
      const names = new Set([...model.params.map(p => p.id), ...C.map(x => x.c.id), ...C.map(x => 'w_' + x.c.id)]);
      cast = comp(model.combine.expr, names, 'combine', 'combine');
      if (!cast) { ctype = 'sum'; customFallback = true; } // DECISION: a broken custom formula falls back to Add up so the page still ranks
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
        } else {
          if (x.isMap) s = M.shapes.apply(x.c.shape, 0, e.raw);
          else {
            const R = ranges[x.c.id];
            t = R.hi === R.lo ? 0.5 : clamp((e.raw - R.lo) / (R.hi - R.lo), 0, 1); e.t0 = t;
            if (x.c.direction === 'lower' && x.c.shape.type !== 'target') t = 1 - t;
            s = M.shapes.apply(x.c.shape, t);
          }
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
          try { S = evaluate(cast, sc); if (typeof S !== 'number' || !isFinite(S)) { S = 0; r.combineError = 'Not a number'; } }
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

  /* ---------------- randomness (seeded, so results are repeatable) ---------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // Combine s-values for one row, given shares. Mirrors compute() step 8.
  function combineS(res, sv, W) {
    const ids = res.active, ct = res.ctype;
    if (!ids.length) return 0;
    if (ct === 'product') return ids.reduce((a, id) => a * Math.pow(sv[id], W[id]), 1);
    if (ct === 'min') return Math.min(...ids.map(id => sv[id]));
    if (ct === 'custom' && res.cast) {
      const sc = Object.assign({}, res.P); res.used.forEach(id => { sc[id] = sv[id] ?? 0; sc['w_' + id] = W[id] ?? 0; });
      try { const v = evaluate(res.cast, sc); return typeof v === 'number' && isFinite(v) ? v : 0; } catch (e) { return 0; }
    }
    return ids.reduce((a, id) => a + W[id] * sv[id], 0);
  }

  // Uncertainty: every number used by a criterion with noise > 0 is jittered by N(0, noise% of its range).
  // Rules are not re-checked (an option that passes stays in), so this measures ranking noise only.
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

  // Weight-agnostic: draw shares uniformly from every possible weighting and count who wins.
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

  // Rank reversal: with auto ranges, removing an option that is not the winner can change the winner.
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

  function trace(model, res, rowId) {
    const r = res.byId[rowId]; if (!r) return [];
    const L = [];
    model.gates.filter(g => g.enabled).forEach(g => {
      const gr = r.gates.find(x => x.id === g.id);
      L.push({ kind: 'gate', text: g.label || g.expr, sub: g.expr, value: gr ? (gr.pass ? 'pass' : 'fail') : 'skipped', error: gr ? gr.error : 'This rule has an error and was skipped' });
    });
    L.push({ kind: 'gate-total', text: 'Rules', value: r.pass ? '1' : '0' });
    model.criteria.forEach(c => {
      const e = r.crit[c.id]; if (!e) return;
      const R = res.ranges[c.id];
      L.push({ kind: 'raw', critId: c.id, text: c.source.kind === 'column' ? c.source.column : c.source.expr, value: e.raw == null ? 'missing' : fmtN(e.raw), error: e.error });
      if (e.raw == null) L.push({ kind: 'impute', critId: c.id, text: { worst: 'missing, so counted as worst', neutral: 'missing, so counted as middle', best: 'missing, so counted as best', exclude: 'missing, so ruled out' }[c.missing || 'worst'], value: fmt(e.s, 3) });
      if (c.shape.type !== 'map' && e.raw != null) {
        L.push({ kind: 'norm', critId: c.id, text: `normalized over ${fmtN(R.lo)} … ${fmtN(R.hi)}`, value: fmt(e.t0, 3) });
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

  /* ---------------- sensitivity ---------------- */
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

  /* ---------------- honesty report ---------------- */
  function corr(a, b) {
    const n = a.length; if (n < 4) return null;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
  }
  function honesty(model, res, sens, extra) {
    extra = extra || {};
    const G = [];
    const crit = id => model.criteria.find(c => c.id === id);
    const L = id => (crit(id) || {}).label || id;
    const rl = id => res.byId[id] ? res.byId[id].label : id;
    if (!model.rows.length) return G;
    res.errors.forEach(e => {
      const who = e.where === 'combine' ? 'Custom formula' : e.where === 'gate' ? 'Rule ' + ((model.gates.find(g => g.id === e.id) || {}).label || e.id) : L(e.id);
      G.push({ level: e.warn ? 'warn' : 'bad', text: `${who}: ${e.msg}.${e.warn ? '' : ' It is being ignored.'}` });
    });
    if (res.customFallback) G.push({ level: 'bad', text: 'The custom formula has an error, so scores below use Add up instead.' });
    if (res.total === 0 && res.used.length) G.push({ level: 'bad', text: 'Every weight is 0, so every score is 0.' });
    // rules
    const errOut = res.rows.filter(r => !r.pass && r.gates.some(g => g.error)).length;
    if (errOut) G.push({ level: 'warn', text: `${errOut} option${errOut > 1 ? 's were' : ' was'} ruled out because a rule could not be checked (usually a missing value), not because they failed it.` });
    if (res.out.length && res.out.length >= res.rows.length / 2) G.push({ level: 'info', text: `Rules remove ${res.out.length} of ${res.rows.length} options. The ranking is only among the ${res.ranked.length} left.` });
    if (res.ranked.length && res.ranked.length < 3) G.push({ level: 'info', text: `Only ${res.ranked.length} option${res.ranked.length > 1 ? 's are' : ' is'} ranked. There is little to compare.` });
    // criteria
    res.used.forEach(id => {
      const R = res.ranges[id];
      if (R && R.hi === R.lo) G.push({ level: 'warn', text: `${L(id)} is the same for every option, so it has no effect.` });
      const miss = res.rows.filter(r => r.crit[id] && r.crit[id].raw === null).length;
      if (miss) {
        const pol = (crit(id) || {}).missing || 'worst';
        const how = { worst: 'They get 0 points there, the worst possible result', neutral: 'They get half points there, a guess in the middle', best: 'They get full points there, which flatters them', exclude: 'They are ruled out' }[pol];
        G.push({ level: pol === 'best' ? 'warn' : pol === 'exclude' ? 'info' : 'warn', text: `${miss} option${miss > 1 ? 's have' : ' has'} no usable value for ${L(id)}. ${how}. You can change this in the criterion.` });
      }
      if (R && !R.auto && R.hi !== R.lo) {
        const clip = res.rows.filter(r => typeof r.crit[id].raw === 'number' && (r.crit[id].raw < Math.min(R.lo, R.hi) || r.crit[id].raw > Math.max(R.lo, R.hi))).length;
        if (clip) G.push({ level: 'info', text: `${clip} option${clip > 1 ? 's fall' : ' falls'} outside the fixed range of ${L(id)} and ${clip > 1 ? 'are' : 'is'} clipped to the end.` });
      }
    });
    const shares = res.active.map(id => [id, res.weights[id]]).sort((a, b) => b[1] - a[1]);
    if (shares.length > 1 && shares[0][1] > 0.5) G.push({ level: 'info', text: `${L(shares[0][0])} carries ${Math.round(shares[0][1] * 100)}% of the weight. The other criteria mostly break ties.` });
    if (res.ctype === 'min') G.push({ level: 'info', text: 'With Weakest link, the weights have no effect. Only the lowest criterion counts.' });
    if (res.ctype === 'product') {
      const z = res.ranked.filter(id => res.active.some(c => res.byId[id].crit[c].s === 0)).length;
      if (z) G.push({ level: 'info', text: `${z} option${z > 1 ? 's score' : ' scores'} 0 because ${z > 1 ? 'they are' : 'it is'} at the bottom of at least one criterion. Multiply is unforgiving.` });
    }
    // double counting
    const pass = res.ranked.map(id => res.byId[id]);
    for (let i = 0; i < res.active.length; i++) for (let j = i + 1; j < res.active.length; j++) {
      const a = res.active[i], b = res.active[j];
      const r = corr(pass.map(x => x.crit[a].s), pass.map(x => x.crit[b].s));
      if (r !== null && r > 0.9) G.push({ level: 'info', text: `${L(a)} and ${L(b)} move together (r = ${r.toFixed(2)}). You may be counting the same thing twice.` });
    }
    // dead criteria
    if (res.ranked.length > 1 && res.active.length > 1) res.active.forEach(id => {
      const m = structuredClone(model); m.criteria.find(c => c.id === id).enabled = false;
      const r2 = compute(m);
      if (r2.ranked.join() === res.ranked.join()) G.push({ level: 'info', text: `Dropping ${L(id)} would not change the order. It adds nothing with this data.` });
    });
    // closeness + robustness
    const lead = res.lead;
    if (lead && lead.margin != null && lead.margin < 2) G.push({ level: 'warn', text: `${rl(lead.winner)} and ${rl(lead.runnerUp)} are ${lead.margin.toFixed(1)} points apart. Treat this as a tie unless your numbers are exact.` });
    if (sens && lead) {
      let fragile = false, allStable = true; const frag = [];
      Object.entries(sens).forEach(([id, sw]) => {
        if (!sw) return;
        if (sw.runs.length > 1) allStable = false;
        const cur = Math.round(sw.current);
        const i = sw.runs.findIndex(r => cur >= r.from && cur <= r.to); if (i < 0) return;
        const run = sw.runs[i];
        const down = i > 0 ? cur - run.from + 1 : Infinity, up = i < sw.runs.length - 1 ? run.to - cur + 1 : Infinity;
        const d = Math.min(down, up);
        if (d <= 5) {
          fragile = true;
          const other = (down <= up ? sw.runs[i - 1] : sw.runs[i + 1]).winner;
          frag.push({ id, d, other });
        }
      });
      if (frag.length === 1 || frag.length === 2) frag.forEach(f => G.push({ level: 'warn', text: `Changing ${L(f.id)}'s share by about ${f.d} point${f.d > 1 ? 's' : ''} hands first place to ${f.other ? rl(f.other) : 'nobody'}. The result is fragile here.` }));
      else if (frag.length > 2) {
        const ds = frag.map(f => f.d), lo = Math.min(...ds), hi = Math.max(...ds);
        const who = [...new Set(frag.map(f => f.other ? rl(f.other) : 'nobody'))];
        G.push({ level: 'warn', text: `Moving any one of ${frag.map(f => L(f.id)).join(', ')} by ${lo === hi ? lo : lo + '–' + hi} points of share hands first place to ${who.join(' or ')}. The winner depends on weights you probably can't justify that precisely.` });
      }
      if (allStable && Object.keys(sens).length) G.push({ level: 'ok', text: `${rl(lead.winner)} stays on top however you set any single weight.` });
      else if (!fragile && Object.keys(sens).length) G.push({ level: 'ok', text: 'No single weight is within 5 points of changing the winner.' });
    }
    // weight-free robustness
    const wf = extra.weightFree;
    if (wf && lead) {
      const top = Object.entries(wf.shares).sort((a, b) => b[1] - a[1]);
      const mine = Math.round((wf.shares[lead.winner] || 0) * 100);
      if (top[0][0] === lead.winner && mine >= 60) G.push({ level: 'ok', text: `${rl(lead.winner)} wins under ${mine}% of all possible weightings. The result mostly comes from the data, not from your weights.` });
      else if (top[0][0] === lead.winner) G.push({ level: 'info', text: `${rl(lead.winner)} wins under ${mine}% of all possible weightings. Your weights matter here, so be ready to defend them.` });
      else G.push({ level: 'warn', text: `Across all possible weightings, ${rl(top[0][0])} wins most often (${Math.round(top[0][1] * 100)}%). ${rl(lead.winner)} wins only ${mine}% of the time, so your weights are what put it first.` });
    }
    // uncertainty
    const un = extra.uncertainty;
    if (un && lead) {
      const p = Math.round(un.byRow[lead.winner].pFirst * 100);
      const ns = un.noisy.map(L).join(', ');
      if (p < 60) G.push({ level: 'warn', text: `With the error margins you set on ${ns}, ${rl(lead.winner)} comes first only ${p}% of the time. The data isn't precise enough to separate the leaders.` });
      else G.push({ level: 'ok', text: `With the error margins you set on ${ns}, ${rl(lead.winner)} still comes first ${p}% of the time.` });
    }
    // rank reversal
    const rv = extra.reversal;
    if (rv && rv.length) {
      const f = rv[0];
      G.push({ level: 'warn', text: `Removing ${rl(f.removed)}, which isn't the winner, would make ${rl(f.winner)} the winner${rv.length > 1 ? ` (${rv.length} options do this)` : ''}. Auto ranges make scores depend on who else is in the list. Fixed ranges avoid this.` });
    } else if (Object.values(res.ranges).some(R => R.auto)) G.push({ level: 'info', text: 'Scores are relative to these options. Adding or removing one can change everyone else’s score.' });
    const order = { bad: 0, warn: 1, info: 2, ok: 3 };
    return G.sort((a, b) => order[a.level] - order[b.level]);
  }

  // What would it take for the runners-up to take first place? (Add up mode, one criterion at a time)
  function flips(model, res) {
    if (res.ctype !== 'sum' || res.ranked.length < 2) return [];
    const a = res.byId[res.ranked[0]], out = [];
    const colType = {}; model.columns.forEach(c => { colType[c.id] = c.type; });
    res.ranked.slice(1, 4).forEach(bid => {
      const b = res.byId[bid], gap = a.score - b.score, opts = [];
      model.criteria.forEach(c => {
        if (!res.active.includes(c.id)) return;
        const e = b.crit[c.id], w = res.weights[c.id];
        if (e.raw == null) return;
        const gainA = a.crit[c.id].contrib; // the leader keeps its own value
        if ((1 - e.s) * w * 100 <= gap + 1e-9) return;
        const need = e.s + (gap + 0.05) / (w * 100);
        if (c.shape.type === 'map') {
          const cats = Object.entries(c.shape.map || {}).filter(([, v]) => v >= need).map(([k]) => k);
          if (cats.length) opts.push({ critId: c.id, text: `${c.label} were “${cats[0]}”` });
          return;
        }
        if (c.shape.type === 'target') return;
        if (c.source.kind !== 'column') { opts.push({ critId: c.id, text: `its ${c.label} score rose from ${e.s.toFixed(2)} to ${need.toFixed(2)}` }); return; }
        const R = res.ranges[c.id]; if (!R || R.hi === R.lo) return;
        const f = u => M.shapes.apply(c.shape, u);
        if (f(1) < need) return;
        let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (f(mid) >= need) hi = mid; else lo = mid; }
        const t0 = c.direction === 'lower' ? 1 - hi : hi, raw = R.lo + t0 * (R.hi - R.lo);
        if (colType[c.source.column] === 'boolean') opts.push({ critId: c.id, text: `${c.label} were yes` });
        else {
          // round toward the value that still flips (3 significant figures)
          const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)) - 2);
          const rr = raw > e.raw ? Math.ceil(raw / mag) * mag : Math.floor(raw / mag) * mag;
          opts.push({ critId: c.id, text: `${c.label} were ${fmtN(+rr.toPrecision(6))} instead of ${fmtN(e.raw)}` });
        }
        void gainA;
      });
      out.push({ rowId: bid, label: b.label, gap, opts });
    });
    return out;
  }

  M.engine = { compute, trace, honesty, flips, uncertainty, weightFree, reversal, rng };
  M.sensitivity = { sweep };

  /* ---------------- codegen ---------------- */
  const shapeText = (sh, x) => {
    switch (sh.type) {
      case 'curve': return `curve(${x}, k=${sh.k ?? 2})`;
      case 'scurve': return `scurve(${x}, a=${sh.a ?? 10}, c=${sh.c ?? 0.5})`;
      case 'step': return `step(${x}, c=${sh.c ?? 0.5})`;
      case 'target': return `target(${x}, c=${sh.c ?? 0.5}, width=${sh.width ?? 0.2})`;
      case 'map': return `points(${x} → ${Object.entries(sh.map || {}).map(([k, v]) => k + ':' + v).join(', ')})`;
      default: return `linear(${x})`;
    }
  };
  function critFormula(model, res, c) {
    const src = c.source.kind === 'column' ? c.source.column : c.source.expr;
    if (c.shape.type === 'map') return `${c.label} = ${shapeText(c.shape, src)}`;
    const R = res.ranges[c.id] || { lo: 0, hi: 0 };
    let x = `norm(${src}, ${fmtN(R.lo)}…${fmtN(R.hi)})`;
    if (c.direction === 'lower' && c.shape.type !== 'target') x = '1 − ' + x;
    return `${c.label} = ${shapeText(c.shape, x)}`;
  }
  function formula(model, res) {
    res = res || compute(model);
    const act = model.criteria.filter(c => res.active.includes(c.id));
    const pct = c => Math.round(res.weights[c.id] * 100) + '%';
    let main;
    if (res.ctype === 'product') main = act.map(c => `${c.label}^${res.weights[c.id].toFixed(2)}`).join(' × ');
    else if (res.ctype === 'min') main = 'min(' + act.map(c => c.label).join(', ') + ')';
    else if (res.ctype === 'custom') main = model.combine.expr;
    else main = act.map(c => `${pct(c)} ${c.label}`).join(' + ');
    const lines = [`${model.name}`, '', `Score = Rules × ( ${main || '…'} ) × 100`, ''];
    model.criteria.filter(c => res.used.includes(c.id)).forEach(c => lines.push(critFormula(model, res, c)));
    const gs = model.gates.filter(g => g.enabled);
    if (gs.length) { lines.push(''); lines.push('Rules = 1 when all of these hold, else 0:'); gs.forEach(g => lines.push(`  ${g.label || 'Rule'}: ${g.expr}`)); }
    return lines.join('\n');
  }
  function js(model, res) {
    res = res || compute(model);
    const cols = new Set(model.columns.map(c => c.id)), pars = new Set(model.params.map(p => p.id));
    const colType = {}; model.columns.forEach(c => { colType[c.id] = c.type; });
    const rowMap = n => cols.has(n) ? `r.${n}` : pars.has(n) ? `P.${n}` : n;
    const L = [];
    L.push(`// Meridian model: ${JSON.stringify(model.name)} · generated ${new Date().toISOString()}`);
    L.push(`const P = { ${model.params.map(p => `${p.id}: ${+p.value}`).join(', ')} };`);
    L.push(`const W = { ${res.used.map(id => `${id}: ${+res.weights[id].toFixed(6)}`).join(', ')} };`);
    L.push(`const F = { min:Math.min, max:Math.max, abs:Math.abs, sqrt:Math.sqrt, exp:Math.exp,
  ln:Math.log, log10:Math.log10, pow:Math.pow, round:(x,n=0)=>Math.round(x*10**n)/10**n,
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)), if:(c,a,b)=>c?a:b };`);
    L.push(`const norm = (x, lo, hi) => hi === lo ? 0.5 : F.clamp((x - lo) / (hi - lo), 0, 1);`);
    const used = new Set(model.criteria.filter(c => res.used.includes(c.id)).map(c => c.shape.type));
    if (used.has('curve')) L.push(`const curve = (t, k) => Math.pow(t, k);`);
    if (used.has('scurve')) L.push(`const scurve = (t, a, c) => { const g = x => 1 / (1 + Math.exp(-a * (x - c))); return (g(t) - g(0)) / (g(1) - g(0)); };`);
    if (used.has('step')) L.push(`const step = (t, c) => (t >= c ? 1 : 0);`);
    if (used.has('target')) L.push(`const target = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));`);
    L.push(`export function score(r) {`);
    model.gates.filter(g => g.enabled).forEach(g => {
      const p = parse(g.expr); if (p.error || check(p.ast, new Set([...cols, ...pars]))) return;
      L.push(`  if (!${toJS(p.ast, rowMap)}) return { pass: false, score: 0, s: {} }; // ${g.label || 'rule'}`);
    });
    L.push(`  const s = {};`);
    model.criteria.filter(c => res.used.includes(c.id)).forEach(c => {
      let raw;
      if (c.source.kind === 'expr') raw = toJS(parse(c.source.expr).ast, rowMap);
      else raw = colType[c.source.column] === 'boolean' ? `(r.${c.source.column} ? 1 : 0)` : `r.${c.source.column}`;
      let line;
      if (c.shape.type === 'map') line = `(${JSON.stringify(c.shape.map || {})}[${raw}] ?? 0)`;
      else {
        const R = res.ranges[c.id];
        let x = `norm(${raw}, ${R.lo}, ${R.hi})`;
        if (c.direction === 'lower' && c.shape.type !== 'target') x = `1 - ${x}`;
        const sh = c.shape;
        line = sh.type === 'curve' ? `curve(${x}, ${sh.k ?? 2})` : sh.type === 'scurve' ? `scurve(${x}, ${sh.a ?? 10}, ${sh.c ?? 0.5})`
          : sh.type === 'step' ? `step(${x}, ${sh.c ?? 0.5})` : sh.type === 'target' ? `target(${x}, ${sh.c ?? 0.5}, ${sh.width ?? 0.2})` : x;
        if (R.auto) line += '; // auto range from current data'; else line += ';';
      }
      const pol = c.missing || 'worst';
      if (c.source.kind === 'column') {
        const ref = `r.${c.source.column}`;
        if (pol === 'exclude') L.push(`  if (${ref} == null) return { pass: false, score: 0, s: {} }; // missing ${c.label}`);
        else { const fb = pol === 'best' ? 1 : pol === 'neutral' ? 0.5 : 0; L.push(`  if (${ref} == null) s.${c.id} = ${fb}; // missing counts as ${pol}`); L.push(`  else s.${c.id} = ${line.endsWith(';') || line.includes('// auto') ? line : line + ';'}`); return; }
      }
      L.push(`  s.${c.id} = ${line.endsWith(';') || line.includes('// auto') ? line : line + ';'}`);
    });
    const act = res.active;
    let Sx = '0';
    if (res.total > 0 && act.length) {
      if (res.ctype === 'product') Sx = act.map(id => `Math.pow(s.${id}, W.${id})`).join(' * ');
      else if (res.ctype === 'min') Sx = `Math.min(${act.map(id => 's.' + id).join(', ')})`;
      else if (res.ctype === 'custom') {
        const ids = new Set(res.used);
        Sx = toJS(parse(model.combine.expr).ast, n => ids.has(n) ? `s.${n}` : (n.startsWith('w_') && ids.has(n.slice(2))) ? `W.${n.slice(2)}` : `P.${n}`);
      } else Sx = act.map(id => `W.${id} * s.${id}`).join(' + ');
    }
    L.push(`  const S = ${Sx};`);
    L.push(`  return { pass: true, score: S * 100, s };`);
    L.push(`}`);
    return L.join('\n');
  }
  function csv(model, res) {
    res = res || compute(model);
    const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['id', 'label', ...model.columns.map(c => c.id), ...res.used.map(id => 's_' + id), 'score', 'rank', 'pass'];
    const lines = [head.join(',')];
    res.rows.forEach(r => {
      const src = model.rows.find(x => x.id === r.id);
      lines.push([r.id, r.label, ...model.columns.map(c => src.v[c.id]), ...res.used.map(id => r.crit[id].s.toFixed(4)), r.score.toFixed(2), r.rank ?? '', r.pass].map(q).join(','));
    });
    return lines.join('\n');
  }
  M.codegen = { js, formula, critFormula, csv };
})(window.M);
