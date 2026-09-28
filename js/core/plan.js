window.M = window.M || {};
(function (M) {
  'use strict';
  const E = M.engine, compute = E.compute, compile = E.compile, fmtN = M.util.fmtN;
  const LIMITS = { combos: 4096, work: 60000, search: 240000, ms: 4000 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const g = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
  const SHAPES = {
    flat: { label: 'Flat', f: () => 0.5 },
    morning: { label: 'Morning peak', f: t => g(t, 0.22, 0.2) },
    lunch: { label: 'Midday peak', f: t => g(t, 0.45, 0.16) },
    evening: { label: 'Evening peak', f: t => g(t, 0.8, 0.18) },
    two: { label: 'Two peaks', f: t => Math.max(g(t, 0.25, 0.14), g(t, 0.8, 0.13)) }
  };
  const hh = h => String(((h % 24) + 24) % 24).padStart(2, '0') + ':00';
  const shortLabel = s => String(s).replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const valText = v => v === true ? 'yes' : v === false ? 'no' : String(v);
  const finite = v => typeof v === 'number' && isFinite(v);

  function choicesFor(model, col) {
    if (col.choices && col.choices.length) return col.choices.slice();
    if (col.type === 'boolean') return [true, false];
    const seen = [];
    model.rows.forEach(r => { const v = r.v[col.id]; if (v !== null && v !== undefined && v !== '' && !seen.some(x => String(x) === String(v))) seen.push(v); });
    return col.type === 'number' ? seen.sort((a, b) => a - b) : seen;
  }
  function parseList(col, text) {
    const parts = String(text || '').split(',').map(s => s.trim()).filter(Boolean);
    const out = parts.map(s => col.type === 'number' ? (isFinite(+s) ? +s : null) : col.type === 'boolean' ? /^(true|yes|1|y)$/i.test(s) : s).filter(v => v !== null);
    return out.filter((v, i) => out.findIndex(x => String(x) === String(v)) === i);
  }
  function* combos(lists, keys) {
    const idx = keys.map(() => 0);
    while (true) {
      const o = {}; keys.forEach((k, i) => { o[k] = lists[k][idx[i]]; });
      yield o;
      let i = keys.length - 1;
      while (i >= 0 && ++idx[i] === lists[keys[i]].length) { idx[i] = 0; i--; }
      if (i < 0) return;
    }
  }
  function label(model, pick) {
    const keys = Object.keys(pick), counts = {};
    keys.forEach(k => { const s = valText(pick[k]); counts[s] = (counts[s] || 0) + 1; });
    const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const rest = keys.length > 2 && common[1] > 1;
    const colOf = k => model.columns.find(c => c.id === k) || { label: k };
    const parts = keys.filter(k => !(rest && valText(pick[k]) === common[0])).map(k => `${shortLabel(colOf(k).label)} ${valText(pick[k])}`);
    if (rest) parts.push(`rest ${common[0]}`);
    return parts.join(' · ') || `all ${common[0]}`;
  }

  function carryOf(model) {
    const c = model.day && model.day.carry;
    return c && model.params.some(p => p.id === c.knob) && (model.calcs || []).some(k => k.id === c.calc) ? c : null;
  }
  function dayRuns(model) {
    const d = model.day;
    if (!d || !d.values || !d.values.length || !model.params.some(p => p.id === d.knob)) return [];
    const lo = Math.min(...d.values), hi = Math.max(...d.values);
    const link = d.link && model.params.some(p => p.id === d.link.knob) ? d.link : null;
    const runs = d.values.map((v, i) => {
      const values = { [d.knob]: v };
      if (link) values[link.knob] = +(link.lo + (hi > lo ? (v - lo) / (hi - lo) : 0.5) * (link.hi - link.lo)).toFixed(4);
      return { id: 'h' + i, label: hh(d.start + i), end: hh(d.start + i + 1), values };
    });
    runs.carry = carryOf(model);
    return runs;
  }
  function runSet(model, over) {
    if (over === 'scenarios' && model.scenarios.length) return model.scenarios.map(s => ({ id: s.id, label: s.label, values: s.values || {} }));
    if (over === 'day') { const r = dayRuns(model); if (r.length) return r; }
    return [{ id: 'now', label: 'Current knobs', values: {} }];
  }
  const leftOf = (r, carry) => { const c = r.calc[carry.calc]; return c && finite(c.v) ? Math.max(0, c.v) : 0; };

  function judge(model, runs, o) {
    o = o || {};
    const K = o.K || compile(model), carry = runs.carry, tot = {}, per = [];
    model.rows.forEach(r => { tot[r.id] = { sum: 0, sSum: 0, worst: Infinity, pass: 0, worstRun: null, left: 0 }; });
    let rowP = null;
    runs.forEach((run, i) => {
      const res = compute(model, { P: run.values, K, rowP, ranges: o.ranges && o.ranges[i] });
      res.rows.forEach(r => {
        const t = tot[r.id], s = r.pass ? r.score : 0;
        t.sum += s; t.sSum += finite(r.S) ? r.S * 100 : 0; if (r.pass) t.pass++;
        if (s < t.worst) { t.worst = s; t.worstRun = run.id; }
      });
      if (carry) { rowP = {}; res.rows.forEach(r => { const l = leftOf(r, carry); rowP[r.id] = { [carry.knob]: l }; tot[r.id].left = l; }); }
      if (o.keep) per.push({ run, res });
    });
    const n = runs.length || 1;
    Object.values(tot).forEach(t => { t.avg = t.sum / n; t.mS = t.sSum / n; });
    return { tot, per };
  }

  function prep(model, spec) {
    const lists = {};
    model.columns.forEach(c => { const l = spec.vary[c.id]; if (l && l.length) lists[c.id] = l; });
    const keys = Object.keys(lists);
    const total = keys.reduce((a, k) => a * lists[k].length, keys.length ? 1 : 0);
    const runs = runSet(model, spec.over);
    const exhaustive = spec.method !== 'search' && total <= LIMITS.combos && (total + model.rows.length) * runs.length <= LIMITS.work;
    return { lists, keys, total, runs, exhaustive, maxEval: Math.max(100, Math.floor(LIMITS.search / runs.length)) };
  }

  function generate(model, spec, onProgress) {
    const t0 = now(), X = prep(model, spec), { lists, keys, total, runs } = X;
    if (!keys.length) return { error: 'Pick at least one column to vary.' };
    const K = compile(model), how = spec.how === 'worst' ? 'worst' : 'avg', keepN = Math.max(1, Math.min(12, spec.keep || 5));
    const base = model.rows.find(r => r.id === spec.base) || model.rows[0] || { v: {} };
    const sig = v => model.columns.map(c => valText(v[c.id] ?? '')).join('\u0001');
    const existing = new Map(model.rows.map(r => [sig(r.v), r.id]));
    const recs = new Map(); let gi = 0;
    const record = (row, t, mine) => {
      const x = { id: row.id, label: row.label, v: row.v, sig: row.sig, mine, avg: t.avg, worst: t.worst, pass: t.pass, left: t.left,
        worstRun: (runs.find(r => r.id === t.worstRun) || {}).label || '' };
      x.score = x[how];
      x.fit = x.score + 1e-3 * (t.pass / runs.length) + 1e-5 * t.mS - 1e-6 * t.left;
      return x;
    };
    const rowOf = pick => { const v = Object.assign({}, base.v, pick); return { id: '__g' + gi++, label: label(model, pick), v, sig: sig(v), pick }; };
    const finish = (extra) => {
      const all = [...recs.values()], mine = all.filter(r => r.mine).sort((a, b) => b.fit - a.fit)[0] || null;
      const good = all.filter(r => !r.mine && r.score > 0).sort((a, b) => b.fit - a.fit);
      return Object.assign({ total, runs: runs.length, runLabel: runs.length > 1 ? (spec.over === 'day' ? 'hours' : 'scenarios') : 'run', how,
        carry: !!runs.carry, passing: good.length, top: good.slice(0, keepN), mine, ms: Math.round(now() - t0) }, extra);
    };

    if (X.exhaustive) {
      const gen = [];
      for (const pick of combos(lists, keys)) { const r = rowOf(pick); if (!existing.has(r.sig)) { existing.set(r.sig, r.id); gen.push(r); } }
      const J = judge(Object.assign({}, model, { rows: model.rows.concat(gen) }), runs, { K });
      model.rows.forEach(r => recs.set(r.id, record(Object.assign({ sig: sig(r.v) }, r), J.tot[r.id], true)));
      gen.forEach(r => recs.set(r.id, record(r, J.tot[r.id], false)));
      return finish({ method: 'all', tried: gen.length });
    }

    const R = E.rng(spec.seed || 13);
    const rand = () => { const o = {}; keys.forEach(k => { o[k] = lists[k][Math.floor(R() * lists[k].length)]; }); return o; };
    const refRows = model.rows.concat(Array.from({ length: 160 }, () => rowOf(rand())));
    const refModel = Object.assign({}, model, { rows: refRows });
    const ranges = runs.map(run => compute(refModel, { P: run.values, K }).ranges);
    const bySig = new Map();
    let evals = 0, starts = 0, lastPing = 0;
    const out = () => evals >= X.maxEval || now() - t0 > LIMITS.ms;
    const evalRows = (rows, mine) => {
      const fresh = rows.filter(r => !bySig.has(r.sig));
      if (!fresh.length) return;
      const J = judge(Object.assign({}, model, { rows: fresh }), runs, { K, ranges });
      fresh.forEach(r => { const x = record(r, J.tot[r.id], mine || existing.has(r.sig)); x.pick = r.pick; bySig.set(r.sig, x); recs.set(r.id, x); });
      evals += fresh.length;
      if (onProgress && now() - lastPing > 120) { lastPing = now(); const b = best(); onProgress({ evals, max: X.maxEval, best: b ? b.score : 0, label: b ? b.label : '' }); }
    };
    const best = () => { let b = null; bySig.forEach(x => { if (!x.mine && (!b || x.fit > b.fit)) b = x; }); return b; };
    const pickOf = v => { const o = {}; keys.forEach(k => { const l = lists[k], hit = l.find(x => String(x) === String(v[k])); o[k] = hit !== undefined ? hit : l[0]; }); return o; };
    evalRows(model.rows.map(r => Object.assign({ sig: sig(r.v), pick: pickOf(r.v) }, r)), true);
    const climb = pick => {
      let cur = bySig.get(sig(Object.assign({}, base.v, pick)));
      if (!cur) { evalRows([rowOf(pick)]); cur = bySig.get(sig(Object.assign({}, base.v, pick))); }
      starts++;
      while (!out()) {
        const nb = [];
        keys.forEach(k => lists[k].forEach(val => { if (String(val) !== String(cur.pick[k])) nb.push(rowOf(Object.assign({}, cur.pick, { [k]: val }))); }));
        evalRows(nb);
        let next = cur;
        nb.forEach(r => { const x = bySig.get(r.sig); if (x && x.fit > next.fit + 1e-9) next = x; });
        if (next === cur) break;
        cur = next;
      }
    };
    const seeds = model.rows.map(r => pickOf(r.v));
    let turn = 0;
    while (!out()) {
      const b = best();
      let start;
      if (turn < seeds.length) start = seeds[turn];
      else if (b && turn % 2) { start = Object.assign({}, b.pick); for (let j = 0; j < 2; j++) { const k = keys[Math.floor(R() * keys.length)]; start[k] = lists[k][Math.floor(R() * lists[k].length)]; } }
      else start = rand();
      turn++;
      climb(start);
      if (turn > seeds.length + 400) break;
    }
    const tried = [...bySig.values()].filter(x => !x.mine).length;
    return finish({ method: 'search', tried, evals, starts, budget: X.maxEval, timedOut: now() - t0 > LIMITS.ms });
  }

  function grid(model, axes) {
    const ax = axes.filter(a => a && a.values && a.values.length && model.params.some(p => p.id === a.knob));
    if (!ax.length) return [];
    let out = [{ label: [], values: {} }];
    ax.forEach(a => {
      const p = model.params.find(x => x.id === a.knob), next = [];
      out.forEach(o => a.values.forEach(v => next.push({ label: o.label.concat(`${p.label} ${fmtN(v)}${p.unit ? ' ' + p.unit : ''}`), values: Object.assign({}, o.values, { [a.knob]: v }) })));
      out = next;
    });
    return out.map(o => ({ label: o.label.join(' · '), values: o.values }));
  }

  function shape(name, n, lo, hi, step) {
    const f = (SHAPES[name] || SHAPES.flat).f, st = step > 0 ? step : 1;
    return Array.from({ length: n }, (_, i) => { const v = lo + f((i + 0.5) / n) * (hi - lo); return +(Math.round(v / st) * st).toFixed(6); });
  }

  function day(model) {
    const runs = dayRuns(model); if (!runs.length) return null;
    const K = compile(model), carry = runs.carry, sticky = Math.max(0, +(model.day.sticky ?? 3));
    const J = judge(model, runs, { K });
    let prev = null, backlog = carry ? +(model.params.find(p => p.id === carry.knob).value) || 0 : 0;
    const hours = runs.map(run => {
      const P = Object.assign({}, run.values); if (carry) P[carry.knob] = backlog;
      const res = compute(model, { P, K }), best = res.ranked[0] || null;
      let w = best;
      if (prev && best && res.byId[prev].pass && res.byId[best].score - res.byId[prev].score <= sticky) w = prev;
      prev = w;
      const start = backlog;
      if (carry) {
        const src = w ? res.byId[w] : res.rows.slice().sort((a, b) => leftOf(a, carry) - leftOf(b, carry))[0];
        backlog = src ? leftOf(src, carry) : 0;
      }
      return { id: run.id, label: run.label, end: run.end, values: P, v: run.values[model.day.knob], winner: w, best, score: w ? res.byId[w].score : 0, left: res.ranked.length, res, start, after: backlog };
    });
    const segs = [];
    hours.forEach(h => { const s = segs[segs.length - 1]; if (s && s.winner === h.winner) { s.to = h; s.n++; s.sum += h.score; } else segs.push({ winner: h.winner, from: h, to: h, n: 1, sum: h.score }); });
    const rank = k => model.rows.map(r => Object.assign({ id: r.id, label: r.label }, J.tot[r.id])).sort((a, b) => b[k] - a[k] || b.avg - a.avg)[0] || null;
    const steady = rank('worst'), average = rank('avg');
    const worstLabel = t => t && (runs.find(x => x.id === t.worstRun) || {}).label;
    return { hours, segs, carry: !!carry, closing: carry ? backlog : 0, switches: segs.filter(s => s.winner).length - 1, gaps: hours.filter(h => !h.winner),
      steady: steady && steady.worst > 0 ? Object.assign(steady, { worstLabel: worstLabel(steady) }) : null,
      average: average ? Object.assign(average, { worstLabel: worstLabel(average) }) : null };
  }

  M.plan = { LIMITS, SHAPES, hh, choicesFor, parseList, valText, label, carryOf, dayRuns, runSet, judge, prep, generate, grid, shape, day };
})(window.M);
