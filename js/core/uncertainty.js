window.M = window.M || {};
(function (M) {
  'use strict';
  const E = M.engine;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function columns(model) {
    return model.columns.filter(c => c.unc && c.unc.v > 0 && c.type === 'number' && !(c.formula && c.formula.trim()));
  }
  function spread(col, x) { return col.unc.mode === 'abs' ? col.unc.v : Math.abs(x) * col.unc.v / 100; }

  function trials(model, size) {
    const units = Math.max(1, model.rows.length * (model.columns.length + model.criteria.length));
    return Math.max(150, Math.min(1000, Math.floor(size / units)));
  }

  function run(model, res, opt) {
    opt = opt || {};
    const uc = columns(model);
    if (!uc.length || !res || res.ranked.length < 2) return null;
    const total = opt.n || trials(model, 150000), cap = opt.ms == null ? 700 : opt.ms, t0 = now();
    const R = rng(hash(model.name + '|' + model.rows.length + '|' + uc.map(c => c.id).join(',')));
    const wins = {}, rankSum = {}, seen = {};
    res.rows.forEach(r => { wins[r.id] = 0; rankSum[r.id] = 0; seen[r.id] = 0; });
    let n = 0;
    while (n < total && (n < 100 || now() - t0 < cap)) {
      const V = {};
      model.rows.forEach(row => {
        let o = null;
        uc.forEach(c => {
          const x = row.v[c.id];
          if (typeof x === 'number' && isFinite(x)) (o = o || {})[c.id] = x + (R() * 2 - 1) * spread(c, x);
        });
        if (o) V[row.id] = o;
      });
      const r = E.compute(model, { prep: res.prep, V });
      if (r.ranked.length) wins[r.ranked[0]]++;
      r.ranked.forEach((id, i) => { rankSum[id] += i + 1; seen[id]++; });
      n++;
    }
    const top = res.rows.map(r => ({ id: r.id, p: wins[r.id] / n, avg: seen[r.id] ? rankSum[r.id] / seen[r.id] : null, seen: seen[r.id] / n }))
      .filter(x => x.p > 0 || x.id === res.ranked[0]).sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));
    return { n, cols: uc.map(c => c.id), top, ms: Math.round(now() - t0) };
  }

  M.uncertainty = { run, columns, spread, trials };
})(window.M);
