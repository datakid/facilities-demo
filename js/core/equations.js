window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, F = M.formula, MD = M.model;
  const PREC = { '||': 1, '&&': 2, '==': 4, '!=': 4, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 };
  const LOP = { '&&': '\\land', '||': '\\lor', '==': '=', '!=': '\\neq', '<=': '\\leq', '>=': '\\geq', '<': '<', '>': '>', '+': '+', '-': '-', '*': '\\times', '%': '\\bmod' };
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = n => String(n).split('').map(d => SUB[+d]).join('');
  const SENT = /^__([tp])(\d+)$/;
  const texEsc = s => String(s).replace(/([\\{}$&#^_%~])/g, '\\$1');
  const texName = s => '\\text{' + texEsc(s) + '}';
  const texNum = n => String(+(+n).toPrecision(10));
  const num = n => String(+(+n).toPrecision(6));

  function sentinel(key) {
    if (key === '__pen') return { kind: 'pen' };
    const m = SENT.exec(key); return m ? { kind: m[1], n: +m[2] } : null;
  }

  function namer(model) {
    const env = MD.env(model);
    const idOf = key => { if (sentinel(key)) return null; return model.columns.some(c => c.id === key) || model.knobs.some(k => k.id === key) ? key : env.resolve(key); };
    return {
      idOf,
      sym: key => { const s = sentinel(key); if (s) return s.kind === 'pen' ? 'penalties' : s.kind + sub(s.n); const id = idOf(key); return id ? MD.nameRef(model, id) : key; },
      text: key => { const s = sentinel(key); if (s) return s.kind === 'pen' ? 'penalties' : s.kind + s.n; const id = idOf(key); return id ? MD.nameRef(model, id) : key; },
      tex: key => { const s = sentinel(key); if (s) return s.kind === 'pen' ? '\\text{penalties}' : `${s.kind}_{${s.n}}`; const id = idOf(key); return id ? texName(MD.labelOf(model, id)) : texName(key); }
    };
  }

  function latex(ast, name) {
    const go = (n, parent) => {
      let s, pr = 10;
      switch (n.t) {
        case 'num': s = n.word ? texName(n.word) : texNum(n.v); break;
        case 'str': s = texName('“' + n.v + '”'); break;
        case 'id': s = name(n.ref ?? n.name); break;
        case 'un': pr = n.op === '!' ? 3 : 7; s = (n.op === '!' ? '\\lnot ' : '-') + go(n.a, pr); break;
        case 'call': {
          const a = n.args.map(x => go(x, 0));
          if (n.fn === 'sqrt') s = `\\sqrt{${a[0]}}`;
          else if (n.fn === 'abs') s = `\\left|${a[0]}\\right|`;
          else if (n.fn === 'floor') s = `\\left\\lfloor ${a[0]} \\right\\rfloor`;
          else if (n.fn === 'ceil') s = `\\left\\lceil ${a[0]} \\right\\rceil`;
          else if (n.fn === 'exp') s = `e^{${a[0]}}`;
          else if (n.fn === 'pow') s = `{${go(n.args[0], 9)}}^{${a[1]}}`;
          else if (n.fn === 'if') s = `\\begin{cases} ${a[1]} & \\text{if } ${a[0]} \\\\ ${a[2]} & \\text{otherwise} \\end{cases}`;
          else if (n.fn === 'pick') {
            const rows = [];
            for (let i = 1; i + 1 < n.args.length; i += 2) rows.push(`${a[i + 1]} & ${a[0]} = ${a[i]}`);
            if (n.args.length % 2 === 0) rows.push(`${a[a.length - 1]} & \\text{otherwise}`);
            s = `\\begin{cases} ${rows.join(' \\\\ ')} \\end{cases}`;
          } else s = `\\operatorname{${n.fn}}\\left(${a.join(',\\ ')}\\right)`;
          break;
        }
        case 'bin':
          pr = PREC[n.op];
          if (n.op === '/') { s = `\\frac{${go(n.a, 0)}}{${go(n.b, 0)}}`; pr = 10; }
          else if (n.op === '^') s = `{${go(n.a, 9)}}^{${go(n.b, 0)}}`;
          else s = `${go(n.a, pr)} ${LOP[n.op]} ${go(n.b, pr + 0.5)}`;
          break;
      }
      return parent && pr < parent ? `\\left(${s}\\right)` : s;
    };
    return go(ast, 0);
  }

  function critEqs(model, c, R, col, n) {
    const env = MD.env(model);
    const P = src => {
      const p = F.parse(src); if (p.error) throw new Error(p.error.msg + ' in ' + src);
      F.bind(p.ast, { resolve: k => sentinel(k) ? k : env.resolve(k), suggest: () => [] });
      return p.ast;
    };
    const X = MD.nameRef(model, col.id), T = '__t' + n, Pn = '__p' + n;
    if (R.text) {
      const pts = Object.entries(c.points);
      const src = pts.length ? `pick(${X}, ${pts.map(([k, v]) => `${JSON.stringify(k)}, ${+v}`).join(', ')}, 5)` : '5';
      return [{ lhs: Pn, ast: P(src) }];
    }
    if (c.curve === 'target') {
      const at = c.at ?? (R.lo + R.hi) / 2, tol = c.tol || Math.max((R.hi - R.lo) / 2, 1e-9);
      return [{ lhs: Pn, ast: P(`10 * max(0, 1 - abs(${X} - ${num(at)}) / ${num(tol)})`) }];
    }
    const lo = num(R.lo), hi = num(R.hi);
    const tSrc = R.hi === R.lo ? '1' : c.want === 'less' ? `(${hi} - ${X}) / (${hi} - ${lo})` : `(${X} - ${lo}) / (${hi} - ${lo})`;
    let pSrc = `10 * ${T}`;
    if (c.curve === 'gentle') pSrc = `10 * sqrt(${T})`;
    if (c.curve === 'steep') pSrc = `10 * ${T}^2`;
    if (c.curve === 'enough') {
      const span = R.hi - R.lo || 1, at = c.at ?? (R.lo + span * (c.want === 'less' ? 0.3 : 0.7));
      let ta = U.clamp((at - R.lo) / span, 0, 1); if (c.want === 'less') ta = 1 - ta;
      pSrc = ta <= 0 ? '10' : `10 * min(1, ${T} / ${num(ta)})`;
    }
    return [{ lhs: T, ast: P(tSrc), note: 't is kept between 0 and 1' }, { lhs: Pn, ast: P(pSrc) }];
  }

  function build(model, res) {
    const P = src => { const p = F.parse(src); if (p.error) throw new Error(p.error.msg + ' in ' + src); return p.ast; };
    const items = [];
    model.knobs.forEach(k => items.push({ kind: 'setting', id: k.id, label: k.label, group: k.group, unit: k.unit, note: k.note, eqs: [{ lhs: k.id, ast: { t: 'num', v: k.value } }] }));
    res.prep.order.forEach(id => {
      const c = model.columns.find(x => x.id === id);
      items.push({ kind: 'column', id, label: c.label, group: c.group, unit: c.unit, note: c.note, eqs: [{ lhs: id, ast: res.prep.comp[id].ast }] });
    });
    model.columns.filter(c => c.formula && c.formula.trim() && !res.prep.comp[c.id]).forEach(c => items.push({ kind: 'column', id: c.id, label: c.label, group: c.group, broken: (res.issues.find(i => i.where === 'column' && i.id === c.id) || {}).msg || 'Not worked out', raw: c.formula, eqs: [] }));
    res.prep.rules.forEach(({ r, ast }) => items.push({ kind: 'rule', id: r.id, label: r.label || 'Must-have', soft: r.soft, penalty: r.penalty, effect: r.soft ? `−${U.fmtNum(r.penalty)} points if missed` : 'ruled out if missed', eqs: [{ lhs: null, ast }] }));
    model.rules.filter(r => r.on && !res.prep.rules.some(x => x.r.id === r.id)).forEach(r => items.push({ kind: 'rule', id: r.id, label: r.label || 'Must-have', broken: (res.issues.find(i => i.where === 'rule' && i.id === r.id) || {}).msg || 'Not understood', raw: r.formula, eqs: [] }));
    const crits = model.criteria.filter(c => c.on && res.share[c.id] != null);
    crits.forEach((c, i) => {
      const col = model.columns.find(x => x.id === c.col), R = res.ranges[c.id] || { lo: 0, hi: 0 };
      items.push({ kind: 'crit', id: c.id, n: i + 1, col: col.id, label: col.label, share: res.share[c.id], weight: c.weight, want: c.want,
        how: R.text ? 'Points per answer' : (c.want === 'less' ? 'Less is better' : 'More is better') + ' · ' + MD.CURVES[c.curve].label, eqs: (() => { try { return critEqs(model, c, R, col, i + 1); } catch (e) { return [{ lhs: '__p' + (i + 1), ast: { t: 'num', v: 5 } }]; } })() });
    });
    const W = crits.map((c, i) => [num(+res.share[c.id].toFixed(4)), i + 1]);
    const pen = model.rules.some(r => r.on && r.soft) ? ' - __pen' : '';
    const tot = model.method === 'balanced'
      ? `100 * (exp(${W.map(([w, n]) => `${w} * ln(0.1 + 0.09 * __p${n})`).join(' + ') || '0'}) - 0.1) / 0.9${pen}`
      : `10 * (${W.map(([w, n]) => `${w} * __p${n}`).join(' + ') || '0'})${pen}`;
    items.push({ kind: 'total', id: 'score', label: model.method === 'balanced' ? 'Score, balanced' : 'Score, added up', eqs: [{ lhs: 'Score', ast: P(tot) }] });
    return { name: model.name, question: model.question, method: model.method, items };
  }

  function strings(model, item) {
    const N = namer(model);
    return item.eqs.map(e => {
      const isSet = item.kind === 'setting';
      const rhsS = isSet ? U.withUnit(e.ast.v, item.unit) : F.print(e.ast, N.sym, true);
      const rhsT = isSet ? num(e.ast.v) : F.print(e.ast, N.text, false);
      const rhsX = isSet ? texNum(e.ast.v) : latex(e.ast, N.tex);
      if (e.lhs == null) return { sym: rhsS, text: rhsT, tex: rhsX };
      const l = e.lhs === 'Score' ? ['Score', 'Score', '\\text{Score}'] : [N.sym(e.lhs), N.text(e.lhs), N.tex(e.lhs)];
      return { sym: `${l[0]} = ${rhsS}`, text: `${l[1]} = ${rhsT}`, tex: `${l[2]} = ${rhsX}` };
    });
  }

  const SECTIONS = [['setting', 'Settings'], ['column', 'Worked-out columns'], ['rule', 'Must-haves'], ['crit', 'Points of 10 for each thing that matters'], ['total', 'Total score']];

  function doc(model, eq, kind, filter) {
    const items = filter ? eq.items.filter(filter) : eq.items;
    const k = kind === 'tex' ? 'tex' : kind === 'text' ? 'text' : 'sym';
    const L = [];
    const side = it => it.kind === 'rule' ? it.label + (it.effect ? ', ' + it.effect : '') : it.kind === 'crit' ? `${it.label}, ${Math.round(it.share * 100)}%` : '';
    if (k === 'tex') {
      L.push('\\documentclass{article}', '\\usepackage{amsmath,amssymb}', '\\begin{document}', `\\section*{${texEsc(eq.name)}}`);
      if (eq.question) L.push(texEsc(eq.question));
      SECTIONS.forEach(([kd, title]) => {
        const list = items.filter(x => x.kind === kd); if (!list.length) return;
        L.push(`\\subsection*{${texEsc(title)}}`, '\\begin{align*}');
        const lines = [];
        list.forEach(it => {
          if (it.broken) { lines.push(`&\\text{${texEsc(it.label)}: ${texEsc(it.raw)}} && \\text{(${texEsc(it.broken)})}`); return; }
          strings(model, it).forEach((s, j) => { const i = s.tex.indexOf(' = '); const body = i > 0 && it.kind !== 'rule' ? s.tex.slice(0, i) + ' &= ' + s.tex.slice(i + 3) : '&' + s.tex; lines.push(body + (j === it.eqs.length - 1 && side(it) ? ` && \\text{${texEsc(side(it)).replace('−', '-')}}` : '')); });
        });
        L.push(lines.join(' \\\\\n'), '\\end{align*}');
      });
      L.push('\\end{document}');
      return L.join('\n');
    }
    L.push(eq.name); if (eq.question) L.push(eq.question);
    SECTIONS.forEach(([kd, title]) => {
      const list = items.filter(x => x.kind === kd); if (!list.length) return;
      L.push('', title);
      list.forEach(it => {
        if (it.broken) { L.push(`  ${it.label}: ${it.raw}   (${it.broken})`); return; }
        const ss = strings(model, it);
        if (it.kind === 'rule' || it.kind === 'crit') L.push(`  ${side(it)}`);
        ss.forEach(s => L.push((it.kind === 'rule' || it.kind === 'crit' ? '      ' : '  ') + s[k]));
      });
    });
    if (k !== 'text') L.push('', 'Each t is kept between 0 and 1. Points p run from 0 to 10.');
    return L.join('\n');
  }

  M.equations = { build, strings, doc, latex, namer, sentinel, SECTIONS };
})(window.M);
