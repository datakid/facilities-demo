window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, MD = M.model, F = M.formula;

  const csvCell = v => { const s = v == null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function results(model, res) {
    const cols = model.columns;
    const head = ['Rank', 'Option', 'Score', ...cols.map(c => c.label + (c.unit ? ` (${c.unit})` : '')), 'Note'];
    const order = [...res.ranked, ...res.out];
    const lines = order.map(id => {
      const r = res.byId[id];
      const fail = r.failRule ? (model.rules.find(x => x.id === r.failRule) || {}) : null;
      return [r.rank ?? '', r.label, r.pass ? r.score.toFixed(1) : '', ...cols.map(c => { const v = r.vals[c.id]; return typeof v === 'number' ? +v.toPrecision(6) : v; }), fail ? 'Fails: ' + (fail.label || MD.pretty(model, fail.formula) || fail.formula) : ''];
    });
    return [head, ...lines].map(l => l.map(csvCell).join(',')).join('\n');
  }

  function recipe(model, res) {
    const L = [];
    L.push(model.name);
    if (model.question) L.push(model.question);
    L.push('');
    if (model.knobs.length) { L.push('Settings'); model.knobs.forEach(k => L.push(`  ${k.label} = ${U.withUnit(k.value, k.unit)}`)); L.push(''); }
    const calc = model.columns.filter(c => c.formula);
    if (calc.length) { L.push('Worked-out columns'); calc.forEach(c => L.push(`  ${c.label} = ${MD.pretty(model, c.formula) || c.formula}`)); L.push(''); }
    const rules = model.rules.filter(r => r.on);
    if (rules.length) { L.push('Must-haves (an option that fails any is ruled out)'); rules.forEach(r => L.push(`  ${r.label ? r.label + ': ' : ''}${MD.pretty(model, r.formula) || r.formula}`)); L.push(''); }
    L.push(`Score = ${model.method === 'balanced' ? 'balanced blend' : 'sum'} of points × importance share, out of 100`);
    model.criteria.filter(c => c.on && res.share[c.id] != null).forEach(c => {
      const R = res.ranges[c.id], col = model.columns.find(x => x.id === c.col);
      let how;
      if (R.text) how = 'points per answer: ' + Object.entries(c.points).map(([k, v]) => `${k} ${v}/10`).join(', ');
      else how = `${c.want === 'less' ? 'lower' : 'higher'} is better, ${U.withUnit(R.lo, col.unit)} → ${U.withUnit(R.hi, col.unit)}, ${MD.CURVES[c.curve].label.toLowerCase()}` + (c.curve === 'enough' || c.curve === 'target' ? ` (${U.withUnit(c.at, col.unit)})` : '');
      L.push(`  ${Math.round(res.share[c.id] * 100)}%  ${col.label}: ${how}`);
    });
    L.push('');
    L.push('Ranking');
    res.ranked.forEach(id => { const r = res.byId[id]; L.push(`  ${r.rank}. ${r.label}  ${r.score.toFixed(1)}`); });
    res.out.forEach(id => L.push(`  —  ${res.byId[id].label}  (ruled out)`));
    return L.join('\n');
  }

  function js(model, res) {
    const ref = id => (model.knobs.some(k => k.id === id) ? 'K.' : 'r.') + id;
    const L = [];
    L.push(`// ${model.name} · exported from Meridian Studio`);
    L.push(`const K = ${JSON.stringify(Object.fromEntries(model.knobs.map(k => [k.id, k.value])))};`);
    L.push('const F = { min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, log: Math.log, log10: Math.log10, pow: Math.pow, floor: Math.floor, ceil: Math.ceil,');
    L.push('  sum: (...a) => a.reduce((x, y) => x + y, 0), avg: (...a) => a.reduce((x, y) => x + y, 0) / a.length,');
    L.push('  round: (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n, clamp: (x, a, b) => Math.max(a, Math.min(b, x)),');
    L.push('  ln: Math.log, log2: Math.log2, pick: (x, a) => { const k = String(x).trim().toLowerCase(); for (let i = 0; i + 1 < a.length; i += 2) if (String(a[i]).trim().toLowerCase() === k) return a[i + 1]; return a.length % 2 ? a[a.length - 1] : undefined; },');
    L.push('  erlangc: (l, m, c) => { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 0; if (!(m > 0)) return 1; const a = l / m, p = a / c; if (p >= 1) return 1; let B = 1; for (let k = 1; k <= c; k++) B = a * B / (k + a * B); return B / (1 - p * (1 - B)); },');
    L.push('  wait: (l, m, c) => { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 0; if (!(m > 0) || l >= c * m) return Infinity; return F.erlangc(l, m, c) / (c * m - l); },');
    L.push('  within: (l, m, c, t) => { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 1; if (!(m > 0) || l >= c * m) return 0; return 1 - F.erlangc(l, m, c) * Math.exp(-(c * m - l) * t); },');
    L.push('  runway: (h, g) => !(h > 1) ? 0 : !(g > 0) ? 999 : Math.min(999, Math.log(h) / Math.log(1 + g)), avail: (p, n) => 1 - Math.pow(1 - F.clamp(p, 0, 1), Math.max(0, n)),');
    L.push('  eq: (a, b) => typeof a === "string" || typeof b === "string" ? String(a).trim().toLowerCase() === String(b).trim().toLowerCase() : a === b };');
    L.push('const lin = (x, lo, hi) => hi === lo ? 1 : F.clamp((x - lo) / (hi - lo), 0, 1);');
    L.push('');
    L.push('export function score(r) {');
    L.push('  r = Object.assign({}, r);');
    res.prep.order.forEach(id => L.push(`  r.${id} = ${F.toJS(res.prep.comp[id].ast, ref)};`));
    res.prep.rules.forEach(({ r, ast }) => L.push(`  if (!(${F.toJS(ast, ref)})) return { pass: false, score: 0, fails: ${JSON.stringify(r.label || r.formula)} };`));
    L.push('  const s = {};');
    model.criteria.filter(c => c.on && res.share[c.id] != null).forEach(c => {
      const R = res.ranges[c.id], col = model.columns.find(x => x.id === c.col);
      const x = col.type === 'yesno' ? `(r.${c.col} ? 1 : 0)` : `r.${c.col}`;
      if (R.text) { L.push(`  s.${c.id} = (${JSON.stringify(Object.fromEntries(Object.entries(c.points).map(([k, v]) => [k, v / 10])))})[r.${c.col}] ?? 0.5;`); return; }
      let t = `lin(${x}, ${+R.lo.toPrecision(15)}, ${+R.hi.toPrecision(15)})`;
      if (c.want === 'less') t = `(1 - ${t})`;
      let s = t;
      if (c.curve === 'gentle') s = `Math.sqrt(${t})`;
      if (c.curve === 'steep') s = `${t} ** 2`;
      if (c.curve === 'enough') {
        const span = R.hi - R.lo || 1; let ta = U.clamp(((c.at ?? 0) - R.lo) / span, 0, 1); if (c.want === 'less') ta = 1 - ta;
        s = ta <= 0 ? '1' : `F.clamp(${t} / ${+ta.toPrecision(15)}, 0, 1)`;
      }
      if (c.curve === 'target') s = `F.clamp(1 - Math.abs(${x} - ${c.at}) / ${c.tol}, 0, 1)`;
      L.push(`  s.${c.id} = ${s};`);
    });
    const ws = model.criteria.filter(c => c.on && res.share[c.id] != null).map(c => [c.id, +res.share[c.id].toPrecision(15)]);
    if (model.method === 'balanced') L.push(`  const S = (Math.exp(${ws.map(([id, w]) => `${w} * Math.log(0.1 + 0.9 * s.${id})`).join(' + ') || '0'}) - 0.1) / 0.9;`);
    else L.push(`  const S = ${ws.map(([id, w]) => `${w} * s.${id}`).join(' + ') || '0'};`);
    L.push('  return { pass: true, score: F.clamp(S, 0, 1) * 100, s };');
    L.push('}');
    return L.join('\n');
  }

  function json(model) { return JSON.stringify(model, null, 2); }

  M.exporter = { results, recipe, js, json };
})(window.M);
