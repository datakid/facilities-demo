window.M = window.M || {};
(function (M) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const PREFIX = new Set(['$', '€', '£', '¥', '₹']);

  const fmtNum = x => {
    if (x == null || x === '') return '—';
    if (typeof x === 'boolean') return x ? 'yes' : 'no';
    if (typeof x !== 'number') return String(x);
    if (x === Infinity) return '∞';
    if (!isFinite(x)) return '—';
    const a = Math.abs(x);
    if (a >= 10000) return Math.round(x).toLocaleString('en-US');
    if (a >= 1000) return (+x.toFixed(1)).toLocaleString('en-US');
    if (a >= 100) return String(+x.toFixed(1));
    if (a >= 1) return String(+x.toFixed(2));
    return String(+x.toFixed(3));
  };
  const withUnit = (x, unit) => {
    const n = fmtNum(x);
    if (!unit || n === '—' || typeof x !== 'number' || !isFinite(x)) return n;
    if (PREFIX.has(unit)) return (x < 0 ? '−' : '') + unit + fmtNum(Math.abs(x));
    if (unit === '%') return n + '%';
    return n + ' ' + unit;
  };
  const pts = x => (x == null || !isFinite(x)) ? '—' : x.toFixed(1);

  const RESERVED = new Set(['and', 'or', 'not', 'true', 'false', 'yes', 'no', 'if', 'min', 'max', 'abs', 'round', 'floor', 'ceil', 'sqrt', 'log', 'log10', 'exp', 'pow', 'clamp', 'avg', 'sum']);
  const toId = (label, taken) => {
    let x = String(label || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
    if (!x) x = 'col';
    if (/^[0-9]/.test(x)) x = 'c_' + x;
    if (RESERVED.has(x)) x = x + '_';
    let id = x, n = 2;
    while (taken && taken.has(id)) id = x + '_' + n++;
    return id;
  };
  const uid = (pre, list) => { const ids = new Set(list.map(x => x.id)); let n = 1; while (ids.has(pre + n)) n++; return pre + n; };

  const lev = (a, b) => {
    a = a.toLowerCase(); b = b.toLowerCase();
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const closest = (word, list) => {
    let best = null, bd = Infinity;
    list.forEach(w => { const d = lev(word, w) - (w.startsWith(word.slice(0, 2)) ? 0.5 : 0); if (d < bd) { bd = d; best = w; } });
    return best && bd <= Math.max(2, word.length / 2) ? best : null;
  };

  const LESS = /(price|cost|fee|rent|expens|spend|budget|time|minute|min\b|hour|commute|distance|km|mile|weight|kg|lb|risk|effort|wait|delay|latency|lag|noise|debt|loss|crime|error|bug|defect|churn|age|calor|sugar|fat|tax|interest|duration|days|travel|price_per|per_m2|carbon|co2|emission|pollut|complaint|rank_no)/i;
  const guessDir = label => LESS.test(String(label)) ? 'less' : 'more';

  const YES = new Set(['yes', 'y', 'true', '✓', '✔', 'x']), NO = new Set(['no', 'n', 'false', '✗', '✘', '-', '']);
  const parseNum = raw => {
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    let s = String(raw ?? '').trim();
    if (!s) return null;
    s = s.replace(/^[$€£¥₹]\s*/, '').replace(/\s*(%|[a-zA-Z²³/]+)$/, '').replace(/[,\s](?=\d{3}\b)/g, '').replace(/\u2212/g, '-');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    return parseFloat(s);
  };
  const detectType = values => {
    const v = values.map(x => String(x ?? '').trim()).filter(x => x !== '');
    if (!v.length) return 'number';
    if (v.every(x => parseNum(x) != null)) return 'number';
    if (v.every(x => YES.has(x.toLowerCase()) || NO.has(x.toLowerCase()))) return 'yesno';
    return 'text';
  };
  const detectUnit = (header, values) => {
    const m = /[([]\s*([^)\]]{1,8})\s*[)\]]/.exec(header || '');
    if (m) return m[1].trim();
    const v = values.map(x => String(x ?? '').trim()).filter(Boolean);
    if (!v.length) return '';
    const pre = /^([$€£¥₹])/.exec(v[0]);
    if (pre && v.every(x => x.startsWith(pre[1]))) return pre[1];
    if (v.every(x => /%$/.test(x))) return '%';
    const suf = /\d\s*([a-zA-Z²³/]{1,5})$/.exec(v[0]);
    if (suf && v.every(x => x.endsWith(suf[1]))) return suf[1];
    return '';
  };
  const cleanLabel = h => String(h || '').replace(/\s*[([][^)\]]{1,8}[)\]]\s*$/, '').trim() || 'Column';
  const castCell = (raw, type) => {
    const s = String(raw ?? '').trim();
    if (type === 'number') return parseNum(s);
    if (type === 'yesno') return s === '' ? null : YES.has(s.toLowerCase());
    return s === '' ? null : s;
  };

  const parseTable = text => {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return [];
    const first = lines[0];
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    return lines.map(line => {
      const out = []; let cell = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
        else if (ch === '"' && cell.trim() === '') q = true;
        else if (ch === delim) { out.push(cell.trim()); cell = ''; }
        else cell += ch;
      }
      out.push(cell.trim());
      return out;
    });
  };

  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  const list = (arr, word) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' ' + (word || 'and') + ' ' + arr[arr.length - 1];

  M.util = { esc, clamp, fmtNum, withUnit, pts, toId, uid, closest, guessDir, parseNum, detectType, detectUnit, cleanLabel, castCell, parseTable, rng, clone, b64e, b64d, list, RESERVED };
})(window.M);
