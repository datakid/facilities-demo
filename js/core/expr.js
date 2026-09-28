window.M = window.M || {};
(function (M) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (x, d = 1) => (x == null || typeof x !== 'number' || !isFinite(x)) ? (x === Infinity ? '∞' : '—') : x.toFixed(d);
  const fmtN = x => {
    if (x === Infinity) return '∞';
    if (typeof x !== 'number' || !isFinite(x)) return String(x ?? '—');
    if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString('en-US');
    if (Math.abs(x) >= 100) return String(+x.toFixed(1));
    return String(+x.toFixed(3));
  };
  const ID_RE = /^[a-z_][a-z0-9_]{0,31}$/;
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
  const toId = s => {
    let x = String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!/^[a-z_]/.test(x)) x = 'c_' + x;
    return x.slice(0, 32) || 'c';
  };

  const Q = {
    erlangc(lambda, mu, c) {
      c = Math.max(1, Math.floor(c));
      if (!(lambda > 0)) return 0;
      if (!(mu > 0)) return 1;
      const a = lambda / mu, rho = a / c;
      if (rho >= 1) return 1;
      let B = 1;
      for (let k = 1; k <= c; k++) B = a * B / (k + a * B);
      return B / (1 - rho * (1 - B));
    },
    wait(lambda, mu, c) {
      c = Math.max(1, Math.floor(c));
      if (!(lambda > 0)) return 0;
      if (!(mu > 0) || lambda >= c * mu) return Infinity;
      return Q.erlangc(lambda, mu, c) / (c * mu - lambda);
    },
    within(lambda, mu, c, t) {
      c = Math.max(1, Math.floor(c));
      if (!(lambda > 0)) return 1;
      if (!(mu > 0) || lambda >= c * mu) return 0;
      return 1 - Q.erlangc(lambda, mu, c) * Math.exp(-(c * mu - lambda) * t);
    },
    runway(headroom, g) {
      if (!(headroom > 1)) return 0;
      if (!(g > 0)) return 999;
      return Math.min(999, Math.log(headroom) / Math.log(1 + g));
    },
    avail(p, n) { return 1 - Math.pow(1 - clamp(p, 0, 1), Math.max(0, n)); }
  };

  const FN = {
    min: [1, 99], max: [1, 99], sum: [1, 99], avg: [1, 99], abs: [1, 1], sqrt: [1, 1], exp: [1, 1], ln: [1, 1],
    log10: [1, 1], log2: [1, 1], ceil: [1, 1], floor: [1, 1], pow: [2, 2], clamp: [3, 3], if: [3, 3], round: [1, 2],
    pick: [3, 99], erlangc: [3, 3], wait: [3, 3], within: [4, 4], runway: [2, 2], avail: [2, 2]
  };
  const FN_HELP = {
    pick: 'pick(key, "a", 1, "b", 2, default) chooses a value by name',
    erlangc: 'erlangc(arrivals, service_rate, servers) chance a newcomer has to wait',
    wait: 'wait(arrivals, service_rate, servers) average time in the queue (M/M/c)',
    within: 'within(arrivals, service_rate, servers, t) share served within t',
    runway: 'runway(headroom, growth) periods until capacity runs out',
    avail: 'avail(p, n) chance at least one of n copies is up',
    if: 'if(test, then, else)', clamp: 'clamp(x, lo, hi)', round: 'round(x, digits)'
  };
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

  const MEMO = new Map();
  function parse(src) {
    const key = String(src ?? '');
    let hit = MEMO.get(key);
    if (hit) return hit;
    hit = parseRaw(key);
    if (MEMO.size > 4000) MEMO.clear();
    MEMO.set(key, hit);
    return hit;
  }
  function parseRaw(src) {
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
          const need = f[1] === 99 ? `at least ${f[0]} value${f[0] > 1 ? 's' : ''}` : f[0] === f[1] ? `${f[0]} value${f[0] > 1 ? 's' : ''}` : `${f[0]} or ${f[1]} values`;
          err = { msg: `${n.fn} needs ${need}`, pos: n.pos }; return;
        }
        n.args.forEach(w);
      } else if (n.t === 'un') w(n.a);
      else if (n.t === 'bin') { w(n.a); w(n.b); }
    })(ast);
    return err;
  }

  const numv = v => { if (typeof v === 'string') throw { msg: 'Text can only be compared' }; return v; };
  function pickFn(key, args, S) {
    const n = args.length - 1, pairs = Math.floor(n / 2);
    for (let i = 0; i < pairs; i++) if (evaluate(args[1 + 2 * i], S) === key) return evaluate(args[2 + 2 * i], S);
    if (n % 2 === 1) return evaluate(args[n], S);
    throw { msg: `No match for "${key}" in pick` };
  }
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
        if (n.fn === 'pick') return pickFn(evaluate(n.args[0], S), n.args, S);
        const A = n.args.map(a => numv(evaluate(a, S)));
        switch (n.fn) {
          case 'min': return Math.min(...A); case 'max': return Math.max(...A);
          case 'sum': return A.reduce((s, v) => s + v, 0); case 'avg': return A.reduce((s, v) => s + v, 0) / A.length;
          case 'abs': return Math.abs(A[0]); case 'sqrt': return Math.sqrt(A[0]); case 'exp': return Math.exp(A[0]);
          case 'ln': return Math.log(A[0]); case 'log10': return Math.log10(A[0]); case 'log2': return Math.log2(A[0]);
          case 'ceil': return Math.ceil(A[0]); case 'floor': return Math.floor(A[0]); case 'pow': return Math.pow(A[0], A[1]);
          case 'clamp': return Math.max(A[1], Math.min(A[2], A[0]));
          case 'round': { const d = A[1] || 0; return Math.round(A[0] * 10 ** d) / 10 ** d; }
          case 'erlangc': return Q.erlangc(A[0], A[1], A[2]);
          case 'wait': return Q.wait(A[0], A[1], A[2]);
          case 'within': return Q.within(A[0], A[1], A[2], A[3]);
          case 'runway': return Q.runway(A[0], A[1]);
          case 'avail': return Q.avail(A[0], A[1]);
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
  const JS_RUNTIME = `const F = { min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log,
  log10: Math.log10, log2: Math.log2, ceil: Math.ceil, floor: Math.floor, pow: Math.pow,
  sum: (...a) => a.reduce((s, v) => s + v, 0), avg: (...a) => a.reduce((s, v) => s + v, 0) / a.length,
  round: (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n, clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
  pick: (k, ...r) => { for (let i = 0; i + 1 < r.length; i += 2) if (r[i] === k) return r[i + 1]; if (r.length % 2) return r[r.length - 1]; throw new Error('No match for ' + k); },
  erlangc: (l, m, c) => { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 0; if (!(m > 0)) return 1; const a = l / m, p = a / c; if (p >= 1) return 1; let B = 1; for (let k = 1; k <= c; k++) B = a * B / (k + a * B); return B / (1 - p * (1 - B)); },
  wait: (l, m, c) => { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 0; if (!(m > 0) || l >= c * m) return Infinity; return F.erlangc(l, m, c) / (c * m - l); },
  within: (l, m, c, t) => { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 1; if (!(m > 0) || l >= c * m) return 0; return 1 - F.erlangc(l, m, c) * Math.exp(-(c * m - l) * t); },
  runway: (h, g) => !(h > 1) ? 0 : !(g > 0) ? 999 : Math.min(999, Math.log(h) / Math.log(1 + g)),
  avail: (p, n) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), Math.max(0, n)) };`;

  M.expr = { parse, check, evaluate, idents, rename, toJS, FN, FN_HELP, RESERVED, JS_RUNTIME, Q };
  const uniqueId = (base, taken) => {
    let id = toId(base), i = 2; const root = id.slice(0, 28);
    while (taken.has(id) || RESERVED.has(id)) id = root + '_' + i++;
    return id;
  };
  M.util = { esc, clamp, fmt, fmtN, slug, toId, uniqueId, ID_RE };
})(window.M);
