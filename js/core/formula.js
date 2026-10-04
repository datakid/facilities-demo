window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util;

  const FN = {
    if: { n: [3, 3], line: 'if(test, then, otherwise)', help: 'Pick one of two values' },
    min: { n: [1, 99], line: 'min(a, b, …)', help: 'Smallest value' },
    max: { n: [1, 99], line: 'max(a, b, …)', help: 'Largest value' },
    sum: { n: [1, 99], line: 'sum(a, b, …)', help: 'Add values' },
    avg: { n: [1, 99], line: 'avg(a, b, …)', help: 'Average of values' },
    abs: { n: [1, 1], line: 'abs(x)', help: 'Drop the minus sign' },
    round: { n: [1, 2], line: 'round(x, digits)', help: 'Round to whole or digits' },
    floor: { n: [1, 1], line: 'floor(x)', help: 'Round down' },
    ceil: { n: [1, 1], line: 'ceil(x)', help: 'Round up' },
    sqrt: { n: [1, 1], line: 'sqrt(x)', help: 'Square root' },
    log: { n: [1, 1], line: 'log(x)', help: 'Natural log, squashes big numbers' },
    log10: { n: [1, 1], line: 'log10(x)', help: 'Log base 10' },
    ln: { n: [1, 1], line: 'ln(x)', help: 'Natural log (same as log)' },
    log2: { n: [1, 1], line: 'log2(x)', help: 'Log base 2' },
    pick: { n: [3, 99], line: 'pick(x, "a", 1, "b", 2, other)', help: 'A value per answer, like a lookup' },
    wait: { n: [3, 3], line: 'wait(arrivals, served per server, servers)', help: 'Average queue wait (M/M/c), same time unit as arrivals' },
    within: { n: [4, 4], line: 'within(arrivals, served per server, servers, time)', help: 'Share served within a time limit' },
    erlangc: { n: [3, 3], line: 'erlangc(arrivals, served per server, servers)', help: 'Chance a newcomer has to wait' },
    runway: { n: [2, 2], line: 'runway(headroom, growth per period)', help: 'Periods until growth eats the headroom' },
    avail: { n: [2, 2], line: 'avail(uptime of one, copies)', help: 'Uptime when any one of several copies is enough' },
    exp: { n: [1, 1], line: 'exp(x)', help: 'e to the power x' },
    pow: { n: [2, 2], line: 'pow(x, p)', help: 'x to the power p' },
    clamp: { n: [3, 3], line: 'clamp(x, low, high)', help: 'Keep x between two limits' }
  };
  const WORD_OPS = { and: '&&', or: '||', not: '!' };
  const CONST = { true: 1, false: 0, yes: 1, no: 0 };
  const SYM = { '≤': '<=', '≥': '>=', '≠': '!=', '<>': '!=', '=': '==', '×': '*', '÷': '/', '−': '-' };

  class FErr extends Error { constructor(msg, pos, len) { super(msg); this.pos = pos ?? 0; this.len = len ?? 1; } }

  function tokenize(src) {
    const out = []; let i = 0; const s = String(src ?? '');
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const num = /^(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i));
      if (num) {
        let j = i + num[0].length, txt = num[0];
        const pct = s[j] === '%' && !/^\s*[\w(\[.]/.test(s.slice(j + 1));
        out.push({ k: 'num', v: parseFloat(txt) / (pct ? 100 : 1), pos: i, len: j - i + (pct ? 1 : 0) });
        i = j + (pct ? 1 : 0); continue;
      }
      if (ch === '"' || ch === '\'' || ch === '“' || ch === '‘') {
        const close = ch === '“' ? '”' : ch === '‘' ? '’' : ch;
        const j = s.indexOf(close, i + 1);
        if (j < 0) throw new FErr('This text is missing its closing quote', i, s.length - i);
        out.push({ k: 'str', v: s.slice(i + 1, j), pos: i, len: j - i + 1 }); i = j + 1; continue;
      }
      if (ch === '[') {
        const j = s.indexOf(']', i + 1);
        if (j < 0) throw new FErr('A [ name ] is missing its closing ]', i, s.length - i);
        out.push({ k: 'id', v: s.slice(i + 1, j).trim(), br: true, pos: i, len: j - i + 1 }); i = j + 1; continue;
      }
      const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (w) {
        const lw = w[0].toLowerCase();
        if (WORD_OPS[lw]) out.push({ k: 'op', v: WORD_OPS[lw], pos: i, len: w[0].length });
        else if (lw in CONST) out.push({ k: 'num', v: CONST[lw], pos: i, len: w[0].length, word: lw });
        else out.push({ k: 'id', v: w[0], pos: i, len: w[0].length });
        i += w[0].length; continue;
      }
      const two = s.slice(i, i + 2);
      if (['<=', '>=', '!=', '==', '&&', '||', '<>'].includes(two)) { out.push({ k: 'op', v: SYM[two] || two, pos: i, len: 2 }); i += 2; continue; }
      if ('+-*/%^(),<>!=≤≥≠×÷−'.includes(ch)) { out.push({ k: 'op', v: SYM[ch] || ch, pos: i, len: 1 }); i++; continue; }
      throw new FErr(`“${ch}” isn't something a formula understands`, i, 1);
    }
    out.push({ k: 'end', pos: s.length, len: 0 });
    return out;
  }

  function parse(src) {
    if (!String(src ?? '').trim()) return { error: { msg: 'The formula is empty', pos: 0, len: 0 } };
    let T, p = 0;
    try { T = tokenize(src); } catch (e) { return { error: { msg: e.message, pos: e.pos, len: e.len } }; }
    const peek = () => T[p], next = () => T[p++];
    const isOp = v => T[p].k === 'op' && T[p].v === v;
    const expect = (v, msg) => { if (!isOp(v)) throw new FErr(msg, T[p].pos, T[p].len || 1); return next(); };
    const bin = (sub, ops) => () => {
      let a = sub();
      while (T[p].k === 'op' && ops.includes(T[p].v)) { const t = next(); a = { t: 'bin', op: t.v, a, b: sub(), pos: t.pos }; }
      return a;
    };
    const atom = () => {
      const t = peek();
      if (t.k === 'num') { next(); return { t: 'num', v: t.v, pos: t.pos }; }
      if (t.k === 'str') { next(); return { t: 'str', v: t.v, pos: t.pos }; }
      if (t.k === 'id') {
        next();
        if (!t.br && isOp('(')) {
          next();
          const args = [];
          if (!isOp(')')) { do { args.push(or()); } while (isOp(',') && next()); }
          expect(')', `${t.v}( is missing its closing )`);
          return { t: 'call', fn: t.v.toLowerCase(), raw: t.v, args, pos: t.pos, len: t.len };
        }
        return { t: 'id', name: t.v, br: !!t.br, pos: t.pos, len: t.len };
      }
      if (isOp('(')) { const o = next(); const e = or(); if (!isOp(')')) throw new FErr('A ( is never closed', o.pos, 1); next(); return e; }
      if (t.k === 'end') throw new FErr('The formula stops too early, something is missing at the end', t.pos, 1);
      if (t.k === 'op' && t.v === ')') throw new FErr('There is a ) without a matching (', t.pos, 1);
      if (t.k === 'op' && t.v === ',') throw new FErr('A comma only goes between the values of a function', t.pos, 1);
      throw new FErr(`Expected a value before “${t.v}”`, t.pos, t.len);
    };
    const pow = () => { const a = atom(); if (isOp('^')) { const t = next(); return { t: 'bin', op: '^', a, b: unary(), pos: t.pos }; } return a; };
    const unary = () => { if (isOp('-') || isOp('+')) { const t = next(); const a = unary(); return t.v === '-' ? { t: 'un', op: '-', a, pos: t.pos } : a; } return pow(); };
    const mul = bin(unary, ['*', '/', '%']);
    const add = bin(mul, ['+', '-']);
    const cmp = () => {
      const a = add();
      if (T[p].k === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(T[p].v)) { const t = next(); return { t: 'bin', op: t.v, a, b: add(), pos: t.pos }; }
      return a;
    };
    const not = () => { if (isOp('!')) { const t = next(); return { t: 'un', op: '!', a: not(), pos: t.pos }; } return cmp(); };
    const and = bin(not, ['&&']);
    const or = bin(and, ['||']);
    try {
      const ast = or();
      if (T[p].k !== 'end') {
        const t = T[p];
        if (t.k === 'op' && t.v === ')') throw new FErr('There is a ) without a matching (', t.pos, 1);
        throw new FErr(`Something is missing before “${String(src).slice(t.pos, t.pos + t.len)}”, like + or *`, t.pos, t.len);
      }
      return { ast };
    } catch (e) { return { error: { msg: e.message, pos: e.pos, len: e.len } }; }
  }

  function bind(ast, env) {
    const refs = new Set(); let error = null;
    const fail = (msg, node) => { if (!error) error = { msg, pos: node.pos ?? 0, len: node.len ?? 1 }; };
    const walk = n => {
      if (!n || error) return;
      if (n.t === 'id') {
        const id = env.resolve(n.name, n.br);
        if (id == null) {
          const sug = U.closest(n.name, env.suggest());
          fail(`I don't know “${n.name}”.` + (sug ? ` Did you mean ${sug}?` : ' Pick a name from the list below.'), n);
          return;
        }
        n.ref = id; refs.add(id); return;
      }
      if (n.t === 'call') {
        const f = FN[n.fn];
        if (!f) { const sug = U.closest(n.fn, Object.keys(FN)); fail(`There is no function called ${n.raw}.` + (sug ? ` Did you mean ${sug}?` : ''), n); return; }
        if (n.args.length < f.n[0] || n.args.length > f.n[1]) {
          const want = f.n[0] === f.n[1] ? `${f.n[0]} value${f.n[0] > 1 ? 's' : ''}` : f.n[1] > 9 ? `at least ${f.n[0]} value` : `${f.n[0]} or ${f.n[1]} values`;
          fail(`${n.fn} needs ${want}: ${f.line}`, n); return;
        }
        n.args.forEach(walk); return;
      }
      if (n.a) walk(n.a); if (n.b) walk(n.b);
    };
    walk(ast);
    return { error, refs: [...refs] };
  }

  class RErr extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }
  const Q = {
    erlangc(l, m, c) { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 0; if (!(m > 0)) return 1; const a = l / m, p = a / c; if (p >= 1) return 1; let B = 1; for (let k = 1; k <= c; k++) B = a * B / (k + a * B); return B / (1 - p * (1 - B)); },
    wait(l, m, c) { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 0; if (!(m > 0) || l >= c * m) return Infinity; return Q.erlangc(l, m, c) / (c * m - l); },
    within(l, m, c, t) { c = Math.max(1, Math.floor(c)); if (!(l > 0)) return 1; if (!(m > 0) || l >= c * m) return 0; return 1 - Q.erlangc(l, m, c) * Math.exp(-(c * m - l) * t); },
    runway(h, g) { if (!(h > 1)) return 0; if (!(g > 0)) return 999; return Math.min(999, Math.log(h) / Math.log(1 + g)); },
    avail(p, n) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), Math.max(0, n)); }
  };
  const isStr = v => typeof v === 'string';

  function evaluate(n, scope, label) {
    const L = label || (id => id);
    const num = (v, node) => {
      if (isStr(v)) throw new RErr(`“${v}” is text, so it can't be used in maths. Compare it instead, like ${node && node.t === 'id' ? node.name : 'name'} = "${v}"`, 'text');
      return v;
    };
    const ev = n => {
      switch (n.t) {
        case 'num': return n.v;
        case 'str': return n.v;
        case 'id': {
          const v = scope[n.ref ?? n.name];
          if (v == null) throw new RErr(`${L(n.ref ?? n.name)} is missing`, 'missing');
          return typeof v === 'boolean' ? (v ? 1 : 0) : v;
        }
        case 'un': { const a = ev(n.a); return n.op === '-' ? -num(a, n.a) : (a ? 0 : 1); }
        case 'call': {
          if (n.fn === 'if') return ev(n.args[0]) ? ev(n.args[1]) : ev(n.args[2]);
          if (n.fn === 'pick') {
            const key = String(ev(n.args[0])).trim().toLowerCase();
            for (let i = 1; i + 1 < n.args.length; i += 2) if (String(ev(n.args[i])).trim().toLowerCase() === key) return ev(n.args[i + 1]);
            return n.args.length % 2 === 0 ? ev(n.args[n.args.length - 1]) : (() => { throw new RErr(`pick has no value for “${key}”`, 'missing'); })();
          }
          const a = n.args.map(x => num(ev(x), x));
          switch (n.fn) {
            case 'min': return Math.min(...a);
            case 'max': return Math.max(...a);
            case 'sum': return a.reduce((x, y) => x + y, 0);
            case 'avg': return a.reduce((x, y) => x + y, 0) / a.length;
            case 'abs': return Math.abs(a[0]);
            case 'round': { const f = 10 ** (a[1] || 0); return Math.round(a[0] * f) / f; }
            case 'floor': return Math.floor(a[0]);
            case 'ceil': return Math.ceil(a[0]);
            case 'sqrt': if (a[0] < 0) throw new RErr('sqrt of a negative number', 'math'); return Math.sqrt(a[0]);
            case 'log': if (a[0] <= 0) throw new RErr('log needs a number above 0', 'math'); return Math.log(a[0]);
            case 'log10': if (a[0] <= 0) throw new RErr('log10 needs a number above 0', 'math'); return Math.log10(a[0]);
            case 'ln': if (a[0] <= 0) throw new RErr('ln needs a number above 0', 'math'); return Math.log(a[0]);
            case 'log2': if (a[0] <= 0) throw new RErr('log2 needs a number above 0', 'math'); return Math.log2(a[0]);
            case 'wait': return Q.wait(a[0], a[1], a[2]);
            case 'within': return Q.within(a[0], a[1], a[2], a[3]);
            case 'erlangc': return Q.erlangc(a[0], a[1], a[2]);
            case 'runway': return Q.runway(a[0], a[1]);
            case 'avail': return Q.avail(a[0], a[1]);
            case 'exp': return Math.exp(a[0]);
            case 'pow': return Math.pow(a[0], a[1]);
            case 'clamp': return Math.max(a[1], Math.min(a[2], a[0]));
          }
          return 0;
        }
        case 'bin': {
          if (n.op === '&&') return ev(n.a) && ev(n.b) ? 1 : 0;
          if (n.op === '||') return ev(n.a) || ev(n.b) ? 1 : 0;
          const a = ev(n.a), b = ev(n.b);
          if (n.op === '==' || n.op === '!=') {
            const eq = (isStr(a) || isStr(b)) ? String(a).trim().toLowerCase() === String(b).trim().toLowerCase() : a === b;
            return (n.op === '==') === eq ? 1 : 0;
          }
          const x = num(a, n.a), y = num(b, n.b);
          switch (n.op) {
            case '+': return x + y;
            case '-': return x - y;
            case '*': return x * y;
            case '/': if (y === 0) throw new RErr('Division by zero', 'math'); return x / y;
            case '%': if (y === 0) throw new RErr('Division by zero', 'math'); return x % y;
            case '^': return Math.pow(x, y);
            case '<': return x < y ? 1 : 0;
            case '<=': return x <= y ? 1 : 0;
            case '>': return x > y ? 1 : 0;
            case '>=': return x >= y ? 1 : 0;
          }
        }
      }
      return 0;
    };
    const v = ev(n);
    if (typeof v === 'number' && Number.isNaN(v)) throw new RErr('The result is not a real number', 'math');
    return v;
  }

  const PREC = { '||': 1, '&&': 2, '==': 4, '!=': 4, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 };
  const PRETTY = { '&&': 'and', '||': 'or', '==': '=', '!=': '≠', '<=': '≤', '>=': '≥', '*': '×', '/': '÷', '-': '−' };

  function print(n, name, pretty) {
    const op = o => pretty ? (PRETTY[o] || o) : (o === '==' ? '=' : o === '&&' ? 'and' : o === '||' ? 'or' : o);
    const go = (n, parent, right) => {
      let s, pr = 10;
      switch (n.t) {
        case 'num': s = n.v === 1 && n.word ? n.word : String(+n.v.toFixed(10)); break;
        case 'str': s = JSON.stringify(n.v); break;
        case 'id': s = name(n.ref ?? n.name, n); break;
        case 'call': s = `${n.fn}(${n.args.map(a => go(a, 0)).join(', ')})`; break;
        case 'un': pr = n.op === '!' ? 3 : 7; s = (n.op === '!' ? 'not ' : (pretty ? '−' : '-')) + go(n.a, pr); break;
        case 'bin': pr = PREC[n.op]; s = `${go(n.a, pr, false)} ${op(n.op)} ${go(n.b, pr + (n.op === '^' ? 0 : 0.5), true)}`; break;
      }
      return (parent && pr < parent) || (right && parent === pr && n.t === 'bin') ? `(${s})` : s;
    };
    return go(n, 0);
  }

  function toJS(n, ref) {
    const go = n => {
      switch (n.t) {
        case 'num': return String(n.v);
        case 'str': return JSON.stringify(n.v);
        case 'id': return ref(n.ref ?? n.name);
        case 'un': return n.op === '-' ? `(-${go(n.a)})` : `(${go(n.a)} ? 0 : 1)`;
        case 'call':
          if (n.fn === 'if') return `(${go(n.args[0])} ? ${go(n.args[1])} : ${go(n.args[2])})`;
          if (n.fn === 'pick') return `F.pick(${go(n.args[0])}, [${n.args.slice(1).map(go).join(', ')}])`;
          return `F.${n.fn}(${n.args.map(go).join(', ')})`;
        case 'bin':
          if (n.op === '==' || n.op === '!=') return `(${n.op === '!=' ? '!' : ''}F.eq(${go(n.a)}, ${go(n.b)}) ? 1 : 0)`;
          if (n.op === '&&' || n.op === '||') return `((${go(n.a)}) ${n.op} (${go(n.b)}) ? 1 : 0)`;
          if (['<', '<=', '>', '>='].includes(n.op)) return `(${go(n.a)} ${n.op} ${go(n.b)} ? 1 : 0)`;
          if (n.op === '^') return `Math.pow(${go(n.a)}, ${go(n.b)})`;
          return `(${go(n.a)} ${n.op} ${go(n.b)})`;
      }
      return '0';
    };
    return go(n);
  }

  M.formula = { FN, Q, parse, bind, evaluate, print, toJS, RErr };
})(window.M);
