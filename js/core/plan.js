window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, E = M.engine;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const LIMIT = { full: 4096, runs: 60000, search: 200000, ms: 3500 };

  function contexts(model, judge) {
    const base = Object.assign({}, model.base || {});
    if (judge === 'situations' && (model.scenarios || []).length) return model.scenarios.map(s => ({ id: s.id, label: s.label, K: Object.assign({}, base, s.values || {}) }));
    if (judge === 'day' && model.day && model.day.values.length) return dayContexts(model);
    return [{ id: 'now', label: 'Current settings', K: Object.fromEntries(model.knobs.map(k => [k.id, k.value])) }];
  }

  function matrix(model, prep) {
    prep = prep || E.prepare(model);
    const cols = [{ id: 'now', label: 'Now', K: Object.fromEntries(model.knobs.map(k => [k.id, k.value])) }, { id: 'base', label: 'Baseline', K: Object.assign({}, model.base) }]
      .concat((model.scenarios || []).map(s => ({ id: s.id, label: s.label, K: Object.assign({}, model.base, s.values || {}) })));
    const res = cols.map(c => E.compute(model, { prep, K: c.K }));
    const rows = model.rows.map(r => {
      const cells = res.map(x => { const y = x.byId[r.id]; return { score: y.pass ? y.score : null, rank: y.rank, lead: x.ranked[0] === r.id }; });
      const sc = cells.slice(1).map(c => c.score ?? 0);
      return { id: r.id, label: r.label, cells, worst: Math.min(...sc), avg: sc.reduce((a, b) => a + b, 0) / sc.length, wins: cells.slice(1).filter(c => c.lead).length, outIn: cells.slice(1).filter(c => c.score == null).length };
    });
    const safest = rows.slice().sort((a, b) => b.worst - a.worst || b.avg - a.avg)[0] || null;
    const bestAvg = rows.slice().sort((a, b) => b.avg - a.avg || b.worst - a.worst)[0] || null;
    return { cols: cols.map((c, i) => ({ id: c.id, label: c.label, leader: res[i].ranked[0] || null })), rows, safest: safest && safest.worst > 0 ? safest.id : null, bestAvg: bestAvg && bestAvg.avg > 0 ? bestAvg.id : null };
  }

  const SHAPES = {
    flat: { label: 'Flat', f: () => 0.5 },
    morning: { label: 'Morning peak', f: t => g(t, 0.22, 0.2) },
    lunch: { label: 'Midday peak', f: t => g(t, 0.45, 0.16) },
    evening: { label: 'Evening peak', f: t => g(t, 0.8, 0.18) },
    two: { label: 'Two peaks', f: t => Math.max(g(t, 0.25, 0.14), g(t, 0.8, 0.13)) }
  };
  function g(t, c, w) { return Math.exp(-(((t - c) / w) ** 2)); }
  function shape(model, kind, hours) {
    const d = model.day, k = model.knobs.find(x => x.id === d.knob); if (!k) return [];
    const lo = k.min + (k.max - k.min) * 0.15, hi = k.min + (k.max - k.min) * 0.75;
    const n = hours || d.values.length || 12, f = (SHAPES[kind] || SHAPES.flat).f;
    return Array.from({ length: n }, (_, i) => { const v = lo + (hi - lo) * f(n === 1 ? 0.5 : i / (n - 1)); return +(Math.round(v / k.step) * k.step).toFixed(6); });
  }
  const hh = h => String(((h % 24) + 24) % 24).padStart(2, '0') + ':00';

  function dayContexts(model) {
    const d = model.day, base = Object.assign({}, model.base || {}, Object.fromEntries(model.knobs.map(k => [k.id, k.value])));
    const vmin = Math.min(...d.values), vmax = Math.max(...d.values);
    return d.values.map((v, i) => {
      const K = Object.assign({}, base, { [d.knob]: v });
      if (d.link && model.knobs.some(k => k.id === d.link.knob)) K[d.link.knob] = +(d.link.lo + (d.link.hi - d.link.lo) * (vmax === vmin ? 0.5 : (v - vmin) / (vmax - vmin))).toFixed(4);
      return { id: 'h' + i, label: hh(d.start + i), K };
    });
  }

  function dayRun(model, prep, rows, fixedR) {
    prep = prep || E.prepare(model);
    const d = model.day; if (!d || !d.values.length) return null;
    const ctx = dayContexts(model);
    const carry = d.carry && model.knobs.some(k => k.id === d.carry.knob) && model.columns.some(c => c.id === d.carry.col) ? d.carry : null;
    const list = rows || model.rows;
    let RK = null;
    const hours = ctx.map(c => {
      const r = E.compute(model, { prep, K: c.K, RK, rows: list, R: fixedR });
      if (carry) { RK = {}; r.rows.forEach(x => { const v = x.vals[carry.col]; RK[x.id] = { [carry.knob]: typeof v === 'number' && isFinite(v) ? Math.max(0, v) : 0 }; }); }
      return { id: c.id, label: c.label, K: c.K, res: r, winner: r.ranked[0] || null, carried: carry ? Object.fromEntries(r.rows.map(x => [x.id, (x.vals[carry.knob] ?? 0)])) : null };
    });
    const per = list.map(r => {
      const sc = hours.map(h => { const x = h.res.byId[r.id]; return x.pass ? x.score : 0; });
      return { id: r.id, label: r.label, scores: sc, avg: sc.reduce((a, b) => a + b, 0) / sc.length, worst: Math.min(...sc), fails: sc.filter(s => s === 0).length, endQueue: carry ? (hours[hours.length - 1].res.byId[r.id].vals[carry.col] ?? 0) : null };
    });
    const allDay = per.slice().sort((a, b) => b.avg - a.avg || b.worst - a.worst)[0] || null;
    const sticky = d.sticky ?? 3, plan = [];
    let cur = null;
    hours.forEach((h, i) => {
      const best = h.winner; if (!best) { cur = null; plan.push(null); return; }
      if (cur == null) cur = best;
      else if (cur !== best) {
        const a = h.res.byId[cur], b = h.res.byId[best];
        if (!a.pass || b.score - a.score >= sticky) cur = best;
      }
      plan.push(cur); void i;
    });
    const switches = [];
    plan.forEach((p, i) => { if (i === 0 || p !== plan[i - 1]) switches.push({ at: hours[i].label, i, row: p }); });
    return { hours, per, allDay: allDay ? allDay.id : null, plan, switches, carry };
  }

  function product(spec) {
    const keys = Object.keys(spec).filter(k => spec[k] && spec[k].length);
    const total = keys.reduce((a, k) => a * spec[k].length, 1);
    return { keys, total };
  }

  function nameOf(model, v, keys, base) {
    const parts = keys.filter(k => v[k] !== base.v[k]).map(k => { const c = model.columns.find(x => x.id === k); const x = v[k]; return `${c.label} ${typeof x === 'boolean' ? (x ? 'yes' : 'no') : typeof x === 'number' ? U.withUnit(x, c.unit) : x}`; });
    return parts.length ? parts.join(', ') : base.label + ' (same)';
  }

  function find(model, spec, opt) {
    opt = opt || {};
    const t0 = now(), onP = typeof opt.progress === 'function' ? opt.progress : null;
    const LIM = { search: opt.runs || LIMIT.search, ms: opt.ms || LIMIT.ms };
    let lastP = 0;
    const report = force => {
      if (!onP) return;
      const t = now(); if (!force && t - lastP < 120) return; lastP = t;
      let best = null; seen.forEach(x => { if (!best || x.s > best.s) best = x; });
      onP({ checked: seen.size, total, method, frac: method === 'all' ? seen.size / total : Math.min(0.99, Math.max(runs / LIM.search, (t - t0) / LIM.ms)), best: best ? { s: best.s, name: nameOf(model, best.v, keys, base) } : null });
    };
    const prep = E.prepare(model);
    const base = model.rows.find(r => r.id === opt.from) || model.rows[0];
    const { keys, total } = product(spec);
    if (!keys.length || !base) return { error: 'Pick at least one column to vary.' };
    if (opt.judge === 'situations-day') opt = Object.assign({}, opt, { judge: model.day ? 'day' : 'now' });
    const ctx = opt.ctxK ? [{ id: 'k', label: '', K: opt.ctxK }] : opt.judge === 'day' ? null : contexts(model, opt.judge);
    const nCtx = opt.judge === 'day' ? model.day.values.length : ctx.length;
    const sig = v => keys.map(k => String(v[k])).join('|');
    const existing = new Map(model.rows.map(r => [sig(r.v), r.id]));
    const fixedR = fixedRanges(model, prep, ctx, keys, spec, base);
    const scoreRows = cands => {
      const rows = cands.map((v, i) => ({ id: '__c' + i, label: '', v }));
      let agg;
      if (opt.judge === 'day') {
        const dr = dayRun(model, prep, rows, fixedR);
        agg = dr.per.map(p => ({ avg: p.avg, worst: p.worst }));
      } else {
        const per = rows.map(() => []);
        ctx.forEach(c => { const r = E.compute(model, { prep, K: c.K, rows, R: fixedR }); r.rows.forEach((x, i) => per[i].push(x.pass ? x.score : 0)); });
        agg = per.map(s => ({ avg: s.reduce((a, b) => a + b, 0) / s.length, worst: Math.min(...s) }));
      }
      return agg.map(a => (opt.agg === 'worst' ? a.worst + a.avg / 1000 : a.avg + a.worst / 1000));
    };
    const seen = new Map();
    let runs = 0;
    const evalBatch = list => {
      const fresh = list.filter(v => !seen.has(sig(v)));
      const uniq = [...new Map(fresh.map(v => [sig(v), v])).values()];
      if (uniq.length) { const s = scoreRows(uniq); runs += uniq.length * nCtx; uniq.forEach((v, i) => seen.set(sig(v), { v, s: s[i] })); }
      report();
    };
    const mk = pick => Object.assign({}, base.v, pick);
    let method = 'all';
    if (total <= LIMIT.full && total * nCtx <= LIMIT.runs) {
      const all = [];
      const rec = (i, acc) => { if (i === keys.length) { all.push(mk(acc)); return; } spec[keys[i]].forEach(x => rec(i + 1, Object.assign({}, acc, { [keys[i]]: x }))); };
      rec(0, {});
      for (let i = 0; i < all.length; i += 256) evalBatch(all.slice(i, i + 256));
    } else {
      method = 'search';
      const rnd = U.rng(7);
      const starts = model.rows.map(r => mk(Object.fromEntries(keys.map(k => [k, spec[k].includes(r.v[k]) ? r.v[k] : spec[k][0]]))));
      for (let i = 0; i < 12; i++) starts.push(mk(Object.fromEntries(keys.map(k => [k, spec[k][Math.floor(rnd() * spec[k].length)]]))));
      evalBatch(starts);
      let climbs = 0;
      const climb = v => {
        let cur = v, cs = seen.get(sig(v)).s;
        for (let step = 0; step < 40; step++) {
          const nb = [];
          keys.forEach(k => spec[k].forEach(x => { if (x !== cur[k]) nb.push(Object.assign({}, cur, { [k]: x })); }));
          evalBatch(nb);
          let best = null, bs = cs;
          nb.forEach(n => { const s = seen.get(sig(n)).s; if (s > bs + 1e-9) { bs = s; best = n; } });
          if (!best || runs > LIM.search || now() - t0 > LIM.ms) break;
          cur = best; cs = bs;
        }
        climbs++;
      };
      starts.forEach(s => { if (runs < LIM.search && now() - t0 < LIM.ms) climb(s); });
      while (runs < LIM.search && now() - t0 < LIM.ms) {
        const top = [...seen.values()].sort((a, b) => b.s - a.s)[0].v;
        const kick = Object.assign({}, top);
        keys.forEach(k => { if (rnd() < 0.35) kick[k] = spec[k][Math.floor(rnd() * spec[k].length)]; });
        evalBatch([kick]); climb(kick);
        if (climbs > 400) break;
      }
    }
    report(true);
    const ranked = [...seen.values()].sort((a, b) => b.s - a.s);
    const curBest = (() => {
      const vs = model.rows.map(r => r.v);
      const s = scoreRows(vs);
      let bi = 0; s.forEach((x, i) => { if (x > s[bi]) bi = i; });
      return { id: model.rows[bi].id, label: model.rows[bi].label, s: s[bi] };
    })();
    const top = ranked.filter(x => x.s > 0).slice(0, 8).map(x => ({ v: x.v, s: x.s, name: nameOf(model, x.v, keys, base), existing: existing.get(sig(x.v)) || null }));
    return { method, total, checked: seen.size, runs, ms: Math.round(now() - t0), top, current: curBest, keys, contexts: nCtx, agg: opt.agg || 'avg', judge: opt.judge || 'now' };
  }

  function fixedRanges(model, prep, ctx, keys, spec, base) {
    const rnd = U.rng(3), sample = model.rows.map(r => r.v);
    for (let i = 0; i < 60; i++) sample.push(Object.assign({}, base.v, Object.fromEntries(keys.map(k => [k, spec[k][Math.floor(rnd() * spec[k].length)]]))));
    keys.forEach(k => spec[k].forEach(x => sample.push(Object.assign({}, base.v, { [k]: x }))));
    const rows = sample.map((v, i) => ({ id: '__s' + i, label: '', v }));
    const R = {};
    (ctx || [{ K: Object.assign({}, model.base) }]).slice(0, 6).forEach(c => {
      const r = E.compute(model, { prep, K: c.K, rows });
      Object.entries(r.ranges).forEach(([id, x]) => { if (x.text || x.empty) return; if (!R[id]) R[id] = { lo: x.lo, hi: x.hi, auto: x.auto }; else { R[id].lo = Math.min(R[id].lo, x.lo); R[id].hi = Math.max(R[id].hi, x.hi); } });
    });
    return R;
  }

  function spaceFor(model, colId) {
    const c = model.columns.find(x => x.id === colId); if (!c || c.formula) return [];
    if (c.type === 'yesno') return [false, true];
    const vals = model.rows.map(r => r.v[colId]).filter(x => x != null);
    if (c.type === 'text') return [...new Set([...(c.choices || []), ...vals.map(String)])];
    const nums = [...new Set(vals.filter(x => typeof x === 'number'))].sort((a, b) => a - b);
    if (nums.length && nums.every(Number.isInteger) && nums[nums.length - 1] - nums[0] <= 12) { const out = []; for (let i = nums[0]; i <= nums[nums.length - 1]; i++) out.push(i); return out; }
    return nums;
  }

  function agreement(model, prep, pairs, W) {
    const r = E.compute(model, { prep, W });
    return pairs.map(p => {
      const a = r.byId[p.a], b = r.byId[p.b];
      if (!a || !b) return { p, ok: null };
      if (!a.pass || !b.pass) return { p, ok: null, out: !a.pass ? p.a : p.b };
      return { p, ok: a.score > b.score + 1e-9, gap: a.score - b.score };
    });
  }

  function fit(model, pairs) {
    const prep = E.prepare(model);
    const crits = model.criteria.filter(c => c.on && prep.colById[c.col]);
    const orig = Object.fromEntries(crits.map(c => [c.id, c.weight]));
    const loss = W => {
      const ag = agreement(model, prep, pairs, W);
      const bad = ag.reduce((a, x) => a + (x.ok === false ? 1 : 0), 0);
      const hinge = ag.reduce((a, x) => a + (x.gap != null ? Math.max(0, 2 - x.gap) : 0), 0);
      const drift = crits.reduce((a, c) => a + Math.abs(W[c.id] - orig[c.id]), 0);
      return bad * 1000 + hinge + drift * 0.15;
    };
    let W = Object.assign({}, orig), L = loss(W);
    if (Object.values(W).every(w => !w)) crits.forEach(c => { W[c.id] = 5; });
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      crits.forEach(c => {
        for (let w = 0; w <= 10; w++) {
          if (w === W[c.id]) continue;
          const T = Object.assign({}, W, { [c.id]: w });
          if (!Object.values(T).some(x => x > 0)) continue;
          const l = loss(T);
          if (l < L - 1e-9) { L = l; W = T; moved = true; }
        }
      });
      if (!moved) break;
    }
    const before = agreement(model, prep, pairs, orig), after = agreement(model, prep, pairs, W);
    const n = a => a.filter(x => x.ok === true).length, m = a => a.filter(x => x.ok != null).length;
    const changes = crits.filter(c => W[c.id] !== orig[c.id]).map(c => ({ id: c.id, from: orig[c.id], to: W[c.id] }));
    return { W, changes, before: { ok: n(before), of: m(before) }, after: { ok: n(after), of: m(after) }, detail: after, skipped: after.filter(x => x.ok == null) };
  }

  function hourly(model, opt) {
    opt = opt || {};
    const prep = opt.prep || E.prepare(model);
    const d = model.day; if (!d || !d.values.length) return { error: 'Set up a day plan first.' };
    const cost = Math.max(0, opt.cost ?? d.switchCost ?? 4);
    const ctx = dayContexts(model), H = ctx.length;
    const list = (opt.rows || model.rows).slice(0, 120), n = list.length; void n;
    const carry = d.carry && model.knobs.some(k => k.id === d.carry.knob) && model.columns.some(c => c.id === d.carry.col) ? d.carry : null;
    const MAXS = opt.maxStates || 4000;
    const step = (h, q) => {
      const RK = carry ? Object.fromEntries(list.map(r => [r.id, { [d.carry.knob]: q }])) : null;
      const res = E.compute(model, { prep, K: ctx[h].K, RK, rows: list, R: opt.R });
      return list.map(r => { const x = res.byId[r.id]; const nq = carry ? Math.max(0, +x.vals[d.carry.col] || 0) : 0; return { s: x.pass ? x.score : 0, q: isFinite(nq) ? nq : 1e6 }; });
    };
    let states = [{ q: 0, total: 0, path: [], qs: [], last: -1 }];
    const cache = new Map();
    const at = (h, q) => { const key = h + '|' + (carry ? +q.toFixed(2) : 0); if (!cache.has(key)) cache.set(key, step(h, q)); return cache.get(key); };
    for (let h = 0; h < H; h++) {
      const next = [];
      states.forEach(st => {
        const out = at(h, st.q);
        out.forEach((o, i) => {
          const sw = st.last >= 0 && st.last !== i ? cost : 0;
          next.push({ q: o.q, total: st.total + o.s - sw, path: st.path.concat(i), qs: st.qs.concat(o.q), last: i, sc: o.s });
        });
      });
      const byLast = new Map();
      next.forEach(s => { if (!byLast.has(s.last)) byLast.set(s.last, []); byLast.get(s.last).push(s); });
      states = [];
      byLast.forEach(arr => {
        if (!carry) { states.push(arr.reduce((a, b) => (b.total > a.total ? b : a))); return; }
        arr.sort((a, b) => a.q - b.q || b.total - a.total);
        let best = -Infinity;
        arr.forEach(s => { if (s.total > best + 1e-9) { states.push(s); best = s.total; } });
      });
      states.sort((a, b) => b.total - a.total);
      if (states.length > MAXS) states = states.slice(0, MAXS);
    }
    const best = states.sort((a, b) => b.total - a.total || a.q - b.q)[0];
    const scores = [];
    let q = 0;
    best.path.forEach((i, h) => { const o = at(h, q)[i]; scores.push(o.s); q = o.q; });
    const switches = [];
    best.path.forEach((i, h) => { if (h === 0 || i !== best.path[h - 1]) switches.push({ i: h, at: ctx[h].label, row: list[i].id }); });
    const dr = dayRun(model, prep, opt.R ? model.rows : list, opt.R);
    const single = dr.per.find(p => p.id === dr.allDay);
    return { plan: best.path.map(i => list[i].id), scores, avg: scores.reduce((a, b) => a + b, 0) / H, total: best.total, switches, nSwitch: switches.length - 1, cost, endQueue: carry ? q : null,
      single: single ? { id: single.id, avg: single.avg, endQueue: single.endQueue } : null, hours: ctx.map(c => c.label), carry: !!carry };
  }

  function hourlyFind(model, spec, opt) {
    opt = opt || {};
    if (!model.day) return { error: 'Set up a day plan first.' };
    const t0 = now(), onP = typeof opt.progress === 'function' ? opt.progress : null;
    const prep = opt.prep || E.prepare(model), keys = Object.keys(spec).filter(k => spec[k] && spec[k].length);
    const base = model.rows.find(r => r.id === opt.from) || model.rows[0];
    const sig = v => JSON.stringify(keys.map(k => v[k]));
    const known = new Map(), cand = [];
    model.rows.forEach(r => known.set(sig(r.v), r.id));
    const addV = v => { const k = sig(v); if (known.has(k)) return known.get(k); const id = '__n' + cand.length; known.set(k, id); cand.push({ id, label: nameOf(model, v, keys, base), v: Object.assign({}, v) }); return id; };
    const ctx = dayContexts(model), budget = opt.ms || 6000, per = Math.max(250, Math.floor(budget * 0.5 / ctx.length));
    const say = (stage, frac) => onP && onP({ stage, frac, checked: cand.length });
    const { total } = product(spec);
    say('Finding the best option for each hour', 0);
    ctx.forEach((c, i) => {
      const f = find(model, spec, { from: opt.from, ctxK: c.K, ms: per, runs: total > LIMIT.full ? 40000 : undefined });
      (f.top || []).slice(0, 3).forEach(t => addV(t.v));
      say('Finding the best option for each hour', 0.5 * (i + 1) / ctx.length);
    });
    const fd = find(model, spec, { from: opt.from, judge: 'day', ms: per * 2 });
    (fd.top || []).slice(0, 3).forEach(t => addV(t.v));
    let rows = model.rows.concat(cand);
    const R0 = rangesFor(model, prep, ctx, rows);
    let h = hourly(model, { prep, cost: opt.cost, rows, R: R0 }), rounds = 0;
    while (now() - t0 < budget && rounds < 6) {
      rounds++;
      const used = [...new Set(h.plan)].map(id => rows.find(r => r.id === id));
      const before = cand.length;
      used.forEach(r => keys.forEach(k => spec[k].forEach(x => { if (x !== r.v[k]) addV(Object.assign({}, r.v, { [k]: x })); })));
      if (cand.length === before) break;
      rows = model.rows.concat(prune(model, prep, ctx, cand, h, R0));
      const h2 = hourly(model, { prep, cost: opt.cost, rows, R: R0 });
      say('Improving the day plan', 0.5 + 0.5 * Math.min(1, (now() - t0) / budget));
      if (h2.total <= h.total + 1e-9) break;
      h = h2;
    }
    const lab = Object.fromEntries(model.rows.concat(cand).map(r => [r.id, r.label]));
    h.newRows = cand.filter(c => h.plan.includes(c.id)).map(c => ({ id: c.id, label: c.label, v: c.v }));
    h.labels = lab; h.switches.forEach(s => { s.label = lab[s.row]; });
    h.tried = model.rows.length + cand.length; h.rounds = rounds; h.ms = Math.round(now() - t0); h.total0 = total;
    return h;
  }

  function rangesFor(model, prep, ctx, rows) {
    const R = {};
    ctx.forEach(c => { const r = E.compute(model, { prep, K: c.K, rows }); Object.entries(r.ranges).forEach(([id, x]) => { if (x.text || x.empty) return; if (!R[id]) R[id] = { lo: x.lo, hi: x.hi, auto: x.auto }; else { R[id].lo = Math.min(R[id].lo, x.lo); R[id].hi = Math.max(R[id].hi, x.hi); } }); });
    model.criteria.forEach(c => { if (c.range && !c.range.auto && R[c.id]) { R[c.id] = { lo: c.range.lo, hi: c.range.hi, auto: false }; } });
    return R;
  }

  function prune(model, prep, ctx, cand, h, R) {
    if (cand.length <= 40) return cand;
    const best = new Map();
    ctx.forEach(c => { const r = E.compute(model, { prep, K: c.K, rows: cand, R }); r.ranked.slice(0, 4).forEach((id, i) => best.set(id, Math.min(best.get(id) ?? 99, i))); });
    const keep = new Set(h.plan);
    [...best.entries()].sort((a, b) => a[1] - b[1]).forEach(([id]) => { if (keep.size < 40) keep.add(id); });
    return cand.filter(c => keep.has(c.id));
  }

  const CURVE_LIST = ['even', 'gentle', 'steep', 'enough'];
  function fitAll(model, pairs) {
    const prep = E.prepare(model);
    const first = fit(model, pairs);
    let m = U.clone(model);
    m.criteria.forEach(c => { if (first.W[c.id] != null) c.weight = first.W[c.id]; });
    const score = mm => { const ag = agreement(mm, E.prepare(mm), pairs); return { ok: ag.filter(x => x.ok === true).length, gap: ag.reduce((a, x) => a + (x.gap != null ? Math.min(x.gap, 5) : 0), 0) }; };
    let cur = score(m);
    const curveChanges = [];
    if (cur.ok < first.after.of) {
      m.criteria.filter(c => c.on && prep.colById[c.col] && prep.colById[c.col].type === 'number').forEach(c => {
        let bestC = c.curve, best = cur;
        CURVE_LIST.forEach(cv => {
          if (cv === c.curve) return;
          const t = U.clone(m); const tc = t.criteria.find(x => x.id === c.id); tc.curve = cv; if (cv === 'enough') tc.at = null;
          const s = score(t);
          if (s.ok > best.ok || (s.ok === best.ok && s.gap > best.gap + 1)) { best = s; bestC = cv; }
        });
        if (bestC !== c.curve) { curveChanges.push({ id: c.id, from: c.curve, to: bestC }); c.curve = bestC; if (bestC === 'enough') c.at = null; cur = best; }
      });
      if (curveChanges.length) {
        const again = fit(m, pairs);
        m.criteria.forEach(c => { if (again.W[c.id] != null) c.weight = again.W[c.id]; });
        cur = score(m);
      }
    }
    const weightChanges = model.criteria.filter(c => { const x = m.criteria.find(y => y.id === c.id); return x && x.weight !== c.weight; }).map(c => ({ id: c.id, from: c.weight, to: m.criteria.find(y => y.id === c.id).weight }));
    return { model: m, W: Object.fromEntries(m.criteria.map(c => [c.id, c.weight])), changes: weightChanges, curves: curveChanges, before: first.before, after: { ok: cur.ok, of: first.after.of } };
  }

  function compare(a, b) {
    const ra = E.compute(a), rb = E.compute(b);
    const key = r => r.label.trim().toLowerCase();
    const mapB = new Map(b.rows.map(r => [key(r), r]));
    const rows = a.rows.map(r => {
      const o = mapB.get(key(r)), x = ra.byId[r.id], y = o ? rb.byId[o.id] : null;
      return { label: r.label, a: { rank: x.rank, score: x.pass ? x.score : null }, b: y ? { rank: y.rank, score: y.pass ? y.score : null } : null };
    });
    b.rows.forEach(r => { if (!a.rows.some(x => key(x) === key(r))) { const y = rb.byId[r.id]; rows.push({ label: r.label, a: null, b: { rank: y.rank, score: y.pass ? y.score : null } }); } });
    const diffs = [];
    const nm = (m, c) => { const col = m.columns.find(x => x.id === c.col); return col ? col.label : c.col; };
    a.criteria.forEach(c => {
      const o = b.criteria.find(x => x.col === c.col || x.id === c.id);
      if (!o) { diffs.push(`${nm(a, c)} only counts in A`); return; }
      if (o.on !== c.on) diffs.push(`${nm(a, c)} is ${c.on ? 'on' : 'off'} in A, ${o.on ? 'on' : 'off'} in B`);
      if (o.weight !== c.weight) diffs.push(`${nm(a, c)} importance ${c.weight} → ${o.weight}`);
      if (o.want !== c.want) diffs.push(`${nm(a, c)}: ${c.want} is better → ${o.want}`);
      if (o.curve !== c.curve) diffs.push(`${nm(a, c)} curve ${MD().CURVES[c.curve].label.toLowerCase()} → ${MD().CURVES[o.curve].label.toLowerCase()}`);
    });
    b.criteria.forEach(c => { if (!a.criteria.some(x => x.col === c.col || x.id === c.id)) diffs.push(`${nm(b, c)} only counts in B`); });
    a.knobs.forEach(k => { const o = b.knobs.find(x => x.id === k.id); if (o && Math.abs(o.value - k.value) > 1e-9) diffs.push(`${k.label} ${U.withUnit(k.value, k.unit)} → ${U.withUnit(o.value, o.unit)}`); });
    const rf = r => `${r.label || r.formula}${r.on ? '' : ' (off)'}${r.soft ? ` (−${r.penalty})` : ''}`;
    a.rules.forEach(r => { const o = b.rules.find(x => x.id === r.id); if (!o) diffs.push(`Must-have “${rf(r)}” only in A`); else if (rf(o) !== rf(r) || o.formula !== r.formula) diffs.push(`Must-have “${rf(r)}” → “${rf(o)}”`); });
    b.rules.forEach(r => { if (!a.rules.some(x => x.id === r.id)) diffs.push(`Must-have “${rf(r)}” only in B`); });
    if (a.method !== b.method) diffs.push(`Combine: ${a.method} → ${b.method}`);
    const cellDiff = rows.filter(x => x.a && x.b).length;
    let dataChanges = 0;
    a.rows.forEach(r => { const o = mapB.get(key(r)); if (o) a.columns.forEach(c => { if (!c.formula && JSON.stringify(r.v[c.id]) !== JSON.stringify(o.v[c.id])) dataChanges++; }); });
    if (dataChanges) diffs.push(`${dataChanges} value${dataChanges > 1 ? 's' : ''} differ in the options`);
    void cellDiff;
    rows.sort((x, y) => (x.b ? x.b.rank ?? 99 : 99) - (y.b ? y.b.rank ?? 99 : 99) || (x.a ? x.a.rank ?? 99 : 99) - (y.a ? y.a.rank ?? 99 : 99));
    return { rows, diffs, winA: ra.ranked[0] ? ra.byId[ra.ranked[0]].label : null, winB: rb.ranked[0] ? rb.byId[rb.ranked[0]].label : null };
  }
  const MD = () => M.model;

  M.plan = { matrix, dayRun, dayContexts, shape, SHAPES, find, spaceFor, fit, fitAll, agreement, product, hourly, hourlyFind, compare, LIMIT, hh };
})(window.M);
