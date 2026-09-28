window.M = window.M || {};
(function (M) {
  'use strict';
  const { parse, check, toJS, JS_RUNTIME } = M.expr;
  const { fmtN } = M.util;
  const compute = M.engine.compute;

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
  const srcOf = c => c.source.kind === 'column' ? c.source.column : c.source.kind === 'calc' ? c.source.calc : c.source.expr;
  function critFormula(model, res, c) {
    const src = srcOf(c);
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
    const lines = [`${model.name}`, ''];
    if (model.params.length) { lines.push('Knobs:'); model.params.forEach(p => lines.push(`  ${p.id} = ${fmtN(+p.value)}${p.unit ? ' ' + p.unit : ''}   (${p.label})`)); lines.push(''); }
    if ((model.calcs || []).length) { lines.push('Calculations, in order:'); model.calcs.forEach(k => lines.push(`  ${k.id} = ${k.expr}${k.unit ? '   [' + k.unit + ']' : ''}`)); lines.push(''); }
    lines.push(`Score = Rules × ( ${main || '…'} ) × 100`, '');
    model.criteria.filter(c => res.used.includes(c.id)).forEach(c => lines.push(critFormula(model, res, c)));
    const gs = model.gates.filter(g => g.enabled);
    if (gs.length) { lines.push(''); lines.push('Rules = 1 when all of these hold, else 0:'); gs.forEach(g => lines.push(`  ${g.label || 'Rule'}: ${g.expr}`)); }
    return lines.join('\n');
  }
  function js(model, res) {
    res = res || compute(model);
    const cols = new Set(model.columns.map(c => c.id)), pars = new Set(model.params.map(p => p.id));
    const calcs = model.calcs || [], calcIds = new Set(calcs.map(k => k.id));
    const colType = {}; model.columns.forEach(c => { colType[c.id] = c.type; });
    const rowMap = n => calcIds.has(n) ? `k.${n}` : cols.has(n) ? `r.${n}` : pars.has(n) ? `P.${n}` : n;
    const names = new Set([...cols, ...pars]);
    const L = [];
    L.push(`const P = { ${model.params.map(p => `${p.id}: ${+p.value}`).join(', ')} };`);
    L.push(`const W = { ${res.used.map(id => `${id}: ${+res.weights[id].toFixed(6)}`).join(', ')} };`);
    L.push(JS_RUNTIME);
    L.push(`const norm = (x, lo, hi) => hi === lo ? (isFinite(x) ? 0.5 : (x > 0 ? 1 : 0)) : F.clamp((x - lo) / (hi - lo), 0, 1);`);
    const used = new Set(model.criteria.filter(c => res.used.includes(c.id)).map(c => c.shape.type));
    if (used.has('curve')) L.push(`const curve = (t, k) => Math.pow(t, k);`);
    if (used.has('scurve')) L.push(`const scurve = (t, a, c) => { const g = x => 1 / (1 + Math.exp(-a * (x - c))); return (g(t) - g(0)) / (g(1) - g(0)); };`);
    if (used.has('step')) L.push(`const step = (t, c) => (t >= c ? 1 : 0);`);
    if (used.has('target')) L.push(`const target = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));`);
    L.push(`export function score(r) {`);
    L.push(`  const k = {};`);
    calcs.forEach(c => {
      const p = parse(c.expr);
      if (p.error || check(p.ast, names)) { names.add(c.id); L.push(`  k.${c.id} = null;`); return; }
      names.add(c.id);
      L.push(`  k.${c.id} = ${toJS(p.ast, rowMap)};`);
    });
    model.gates.filter(g => g.enabled).forEach(g => {
      const p = parse(g.expr); if (p.error || check(p.ast, names)) return;
      L.push(`  if (!${toJS(p.ast, rowMap)}) return { pass: false, score: 0, s: {}, k };`);
    });
    L.push(`  const s = {};`);
    model.criteria.filter(c => res.used.includes(c.id)).forEach(c => {
      let raw;
      if (c.source.kind === 'expr') raw = toJS(parse(c.source.expr).ast, rowMap);
      else if (c.source.kind === 'calc') raw = `k.${c.source.calc}`;
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
      }
      const pol = c.missing || 'worst';
      if (c.source.kind !== 'expr') {
        const ref = c.source.kind === 'calc' ? `k.${c.source.calc}` : `r.${c.source.column}`;
        if (pol === 'exclude') { L.push(`  if (${ref} == null) return { pass: false, score: 0, s: {}, k };`); L.push(`  s.${c.id} = ${line};`); return; }
        const fb = pol === 'best' ? 1 : pol === 'neutral' ? 0.5 : 0;
        L.push(`  s.${c.id} = ${ref} == null ? ${fb} : ${line};`); return;
      }
      L.push(`  s.${c.id} = ${line};`);
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
    L.push(`  return { pass: true, score: S * 100, s, k };`);
    L.push(`}`);
    return L.join('\n');
  }
  function csv(model, res) {
    res = res || compute(model);
    const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const calcs = model.calcs || [];
    const head = ['id', 'label', ...model.columns.map(c => c.id), ...calcs.map(k => k.id), ...res.used.map(id => 's_' + id), 'score', 'rank', 'pass'];
    const lines = [head.join(',')];
    res.rows.forEach(r => {
      const src = model.rows.find(x => x.id === r.id);
      lines.push([r.id, r.label, ...model.columns.map(c => src.v[c.id]), ...calcs.map(k => { const v = r.calc[k.id] && r.calc[k.id].v; return typeof v === 'number' ? +v.toFixed(6) : v; }),
        ...res.used.map(id => r.crit[id].s.toFixed(4)), r.score.toFixed(2), r.rank ?? '', r.pass].map(q).join(','));
    });
    return lines.join('\n');
  }
  M.codegen = { js, formula, critFormula, csv };
})(window.M);
