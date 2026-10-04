window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util;

  const CURVES = {
    even: { label: 'Every bit counts', line: 'Points grow evenly from the worst option to the best.' },
    gentle: { label: 'First steps count most', line: 'Going from bad to okay is worth more than okay to great.' },
    steep: { label: 'Only the top end counts', line: 'Small differences near the best matter most.' },
    enough: { label: 'Good enough is enough', line: 'Full points once it reaches a level you choose.' },
    target: { label: 'Closest to a sweet spot', line: 'Full points at a value you choose, fewer the further away.' }
  };
  const METHODS = {
    add: { label: 'Add up', line: 'Strengths can make up for weaknesses.' },
    balanced: { label: 'Balanced', line: 'A weak spot pulls the score down more.' }
  };
  const IMPORTANCE = ['Ignore', 'Barely', 'A little', 'A little', 'Some', 'Some', 'Quite', 'Important', 'Very', 'Very', 'Crucial'];

  function blank() {
    return { v: 4, name: 'My ranking', question: 'Which option is best?', about: '', method: 'add',
      columns: [{ id: 'price', label: 'Price', type: 'number', unit: '$', formula: '' }, { id: 'quality', label: 'Quality', type: 'number', unit: '/10', formula: '' }],
      rows: [{ id: 'r1', label: 'Option A', v: { price: 120, quality: 6 } }, { id: 'r2', label: 'Option B', v: { price: 180, quality: 8 } }, { id: 'r3', label: 'Option C', v: { price: 90, quality: 5 } }],
      knobs: [], rules: [],
      criteria: [crit('price', 'price', 6, { want: 'less' }), crit('quality', 'quality', 6)],
      guide: null };
  }

  function crit(id, col, weight, o) {
    return Object.assign({ id, col, on: true, weight, want: 'more', curve: 'even', at: null, tol: null, points: {}, range: { auto: true, lo: null, hi: null } }, o || {});
  }

  function normalize(m) {
    m = U.clone(m || blank());
    m.v = 4;
    m.name = String(m.name || 'My ranking');
    m.question = String(m.question || '');
    m.about = String(m.about || '');
    m.method = METHODS[m.method] ? m.method : 'add';
    m.columns = (m.columns || []).map(c => ({ id: c.id, label: c.label || c.id, type: ['number', 'yesno', 'text'].includes(c.type) ? c.type : 'number', unit: c.unit || '', formula: c.formula || '', note: c.note || '', group: c.group || '', pin: !!c.pin, pct: !!c.pct, choices: Array.isArray(c.choices) ? c.choices.slice() : null }));
    m.rows = (m.rows || []).map((r, i) => ({ id: r.id || 'r' + (i + 1), label: String(r.label ?? 'Option ' + (i + 1)), v: Object.assign({}, r.v || {}), note: r.note || '' }));
    m.knobs = (m.knobs || []).map(k => ({ id: k.id, label: k.label || k.id, value: +k.value || 0, min: +(k.min ?? 0), max: +(k.max ?? 100), step: +(k.step || 1), unit: k.unit || '', note: k.note || '', group: k.group || '' }));
    m.scenarios = (m.scenarios || []).map((s, i) => ({ id: s.id || 's' + (i + 1), label: String(s.label || 'Situation ' + (i + 1)), values: Object.assign({}, s.values || {}) }));
    m.rules = (m.rules || []).map((r, i) => ({ id: r.id || 'g' + (i + 1), label: r.label || '', formula: String(r.formula || ''), on: r.on !== false, soft: !!r.soft, penalty: r.penalty == null ? 15 : U.clamp(+r.penalty || 0, 0, 100) }));
    m.day = m.day && m.day.knob ? { knob: m.day.knob, start: +m.day.start || 8, values: (m.day.values || []).map(Number), link: m.day.link || null, carry: m.day.carry || null, sticky: m.day.sticky ?? 3 } : null;
    m.pairs = (m.pairs || []).filter(p => p && p.a && p.b);
    m.pinned = m.pinned || null;
    m.criteria = (m.criteria || []).map(c => crit(c.id, c.col, c.weight ?? 5, c));
    m.criteria.forEach(c => { c.range = Object.assign({ auto: true, lo: null, hi: null }, c.range || {}); c.points = Object.assign({}, c.points || {}); c.weight = U.clamp(+c.weight || 0, 0, 10); });
    m.guide = m.guide || null;
    m.base = m.base && typeof m.base === 'object' ? Object.fromEntries(m.knobs.map(k => [k.id, m.base[k.id] ?? k.value])) : Object.fromEntries(m.knobs.map(k => [k.id, k.value]));
    return m;
  }

  function env(model, exclude) {
    const cols = model.columns.filter(c => c.id !== exclude), knobs = model.knobs;
    const byKey = new Map();
    const put = (k, id) => { const key = String(k).toLowerCase().trim(); if (key && !byKey.has(key)) byKey.set(key, id); };
    cols.forEach(c => put(c.id, c.id)); knobs.forEach(k => put(k.id, k.id));
    cols.forEach(c => { put(c.label, c.id); put(U.toId(c.label), c.id); });
    knobs.forEach(k => { put(k.label, k.id); put(U.toId(k.label), k.id); });
    return {
      resolve: name => {
        const k = String(name).toLowerCase().trim();
        return byKey.get(k) ?? byKey.get(U.toId(k)) ?? byKey.get(k.replace(/_/g, ' ')) ?? null;
      },
      suggest: () => [...cols.map(c => c.label.includes(' ') ? `[${c.label}]` : c.label), ...knobs.map(k => k.label.includes(' ') ? `[${k.label}]` : k.label)]
    };
  }

  function labelOf(model, id) {
    const c = model.columns.find(x => x.id === id); if (c) return c.label;
    const k = model.knobs.find(x => x.id === id); if (k) return k.label;
    return id;
  }
  const nameRef = (model, id) => { const l = labelOf(model, id); return /^[A-Za-z_][A-Za-z0-9_]*$/.test(l) ? l : `[${l}]`; };

  function compileFormula(model, src, exclude) {
    const p = M.formula.parse(src);
    if (p.error) return { error: p.error };
    const b = M.formula.bind(p.ast, env(model, exclude));
    if (b.error) return { error: b.error };
    return { ast: p.ast, refs: b.refs };
  }

  function pretty(model, src) {
    const c = compileFormula(model, src);
    if (c.error) return null;
    return M.formula.print(c.ast, id => nameRef(model, id), true);
  }

  function renameRefs(model) {
    model.columns.forEach(c => { if (c.formula) { const k = compileFormula(model, c.formula, c.id); if (k.ast) c.formula = M.formula.print(k.ast, id => nameRef(model, id)); } });
    model.rules.forEach(r => { const k = compileFormula(model, r.formula); if (k.ast) r.formula = M.formula.print(k.ast, id => nameRef(model, id)); });
  }

  const OPS = { '<=': '≤', '>=': '≥', '<': '<', '>': '>', '==': '=', '!=': '≠' };
  function ruleParts(model, src) {
    const c = compileFormula(model, src);
    if (!c.ast) return null;
    const a = c.ast;
    if (a.t === 'id') { const col = model.columns.find(x => x.id === a.ref); return col && col.type === 'yesno' ? { col: a.ref, op: '==', value: true } : null; }
    if (a.t === 'un' && a.op === '!' && a.a.t === 'id') { const col = model.columns.find(x => x.id === a.a.ref); return col && col.type === 'yesno' ? { col: a.a.ref, op: '==', value: false } : null; }
    if (a.t !== 'bin' || !OPS[a.op] || a.a.t !== 'id') return null;
    const col = model.columns.find(x => x.id === a.a.ref); if (!col) return null;
    if (a.b.t === 'num') return { col: col.id, op: a.op, value: col.type === 'yesno' ? !!a.b.v : a.b.v };
    if (a.b.t === 'str') return { col: col.id, op: a.op, value: a.b.v };
    if (a.b.t === 'id' && model.knobs.some(k => k.id === a.b.ref)) return { col: col.id, op: a.op, knob: a.b.ref };
    return null;
  }
  function ruleFormula(model, parts) {
    const col = model.columns.find(x => x.id === parts.col); if (!col) return '';
    const left = nameRef(model, col.id);
    if (col.type === 'yesno') return (parts.op === '!=' ? !parts.value : parts.value) ? left : `not ${left}`;
    const right = parts.knob ? nameRef(model, parts.knob) : col.type === 'text' ? JSON.stringify(String(parts.value ?? '')) : String(+parts.value || 0);
    return `${left} ${parts.op === '==' ? '=' : parts.op} ${right}`;
  }

  M.model = { CURVES, METHODS, IMPORTANCE, OPS, blank, crit, normalize, env, labelOf, nameRef, compileFormula, pretty, renameRefs, ruleParts, ruleFormula };
})(window.M);
