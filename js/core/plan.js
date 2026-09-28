window.M = window.M || {};
(function (M) {
  'use strict';
  const compute = M.engine.compute, fmtN = M.util.fmtN;
  const LIMITS = { combos: 4096, work: 60000 };
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

  function dayRuns(model) {
    const d = model.day;
    if (!d || !d.values || !d.values.length || !model.params.some(p => p.id === d.knob)) return [];
    const lo = Math.min(...d.values), hi = Math.max(...d.values);
    const link = d.link && model.params.some(p => p.id === d.link.knob) ? d.link : null;
    return d.values.map((v, i) => {
      const values = { [d.knob]: v };
      if (link) values[link.knob] = +(link.lo + (hi > lo ? (v - lo) / (hi - lo) : 0.5) * (link.hi - link.lo)).toFixed(4);
      return { id: 'h' + i, label: hh(d.start + i), end: hh(d.start + i + 1), values };
    });
  }
  function runSet(model, over) {
    if (over === 'scenarios' && model.scenarios.length) return model.scenarios.map(s => ({ id: s.id, label: s.label, values: s.values || {} }));
    if (over === 'day') { const r = dayRuns(model); if (r.length) return r; }
    return [{ id: 'now', label: 'Current knobs', values: {} }];
  }
  function judge(model, runs) {
    const tot = {};
    model.rows.forEach(r => { tot[r.id] = { sum: 0, worst: Infinity, pass: 0, worstRun: null }; });
    const per = runs.map(run => {
      const res = compute(model, { P: run.values });
      res.rows.forEach(r => {
        const t = tot[r.id], s = r.pass ? r.score : 0;
        t.sum += s; if (r.pass) t.pass++;
        if (s < t.worst) { t.worst = s; t.worstRun = run.id; }
      });
      return { run, res };
    });
    Object.values(tot).forEach(t => { t.avg = t.sum / runs.length; });
    return { tot, per };
  }

  function generate(model, spec) {
    const lists = {};
    model.columns.forEach(c => { const l = spec.vary[c.id]; if (l && l.length) lists[c.id] = l; });
    const keys = Object.keys(lists);
    if (!keys.length) return { error: 'Pick at least one column to vary.' };
    const total = keys.reduce((a, k) => a * lists[k].length, 1);
    if (total > LIMITS.combos) return { error: `${total.toLocaleString('en-US')} combinations is too many. Allow fewer values (up to ${LIMITS.combos.toLocaleString('en-US')}).` };
    const runs = runSet(model, spec.over);
    if ((total + model.rows.length) * runs.length > LIMITS.work) return { error: `${total.toLocaleString('en-US')} combinations × ${runs.length} runs is too much work. Allow fewer values or judge on fewer runs.` };
    const base = model.rows.find(r => r.id === spec.base) || model.rows[0] || { v: {} };
    const sig = v => model.columns.map(c => valText(v[c.id] ?? '')).join('\u0001');
    const have = new Set(model.rows.map(r => sig(r.v)));
    const gen = []; let i = 0;
    for (const pick of combos(lists, keys)) {
      const v = Object.assign({}, base.v, pick), s = sig(v);
      if (have.has(s)) continue;
      have.add(s);
      gen.push({ id: '__g' + i++, label: label(model, pick), v, pick });
    }
    const J = judge(Object.assign({}, model, { rows: model.rows.concat(gen) }), runs);
    const how = spec.how === 'worst' ? 'worst' : 'avg';
    const val = r => J.tot[r.id][how];
    const out = r => { const t = J.tot[r.id]; return { id: r.id, label: r.label, v: r.v, score: val(r), avg: t.avg, worst: t.worst, pass: t.pass, worstRun: (runs.find(x => x.id === t.worstRun) || {}).label || '' }; };
    const good = gen.filter(r => val(r) > 0).sort((a, b) => val(b) - val(a) || J.tot[b.id].avg - J.tot[a.id].avg);
    const mine = model.rows.slice().sort((a, b) => val(b) - val(a))[0];
    return { total, tried: gen.length, runs: runs.length, runLabel: runs.length > 1 ? (spec.over === 'day' ? 'hours' : 'scenarios') : 'run', how,
      passing: good.length, top: good.slice(0, Math.max(1, Math.min(12, spec.keep || 5))).map(out), mine: mine ? out(mine) : null };
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
    const J = judge(model, runs);
    const sticky = Math.max(0, +(model.day.sticky ?? 3));
    let prev = null;
    const hours = J.per.map(({ run, res }) => {
      const best = res.ranked[0] || null;
      let w = best;
      if (prev && best && res.byId[prev].pass && res.byId[best].score - res.byId[prev].score <= sticky) w = prev;
      prev = w;
      return { id: run.id, label: run.label, end: run.end, values: run.values, v: run.values[model.day.knob], winner: w, best, score: w ? res.byId[w].score : 0, left: res.ranked.length, res };
    });
    const segs = [];
    hours.forEach(h => { const s = segs[segs.length - 1]; if (s && s.winner === h.winner) { s.to = h; s.n++; s.sum += h.score; } else segs.push({ winner: h.winner, from: h, to: h, n: 1, sum: h.score }); });
    const rank = k => model.rows.map(r => Object.assign({ id: r.id, label: r.label }, J.tot[r.id])).sort((a, b) => b[k] - a[k] || b.avg - a.avg)[0] || null;
    const steady = rank('worst'), average = rank('avg');
    const worstLabel = t => t && (runs.find(x => x.id === t.worstRun) || {}).label;
    return { hours, segs, switches: segs.filter(s => s.winner).length - 1, gaps: hours.filter(h => !h.winner),
      steady: steady && steady.worst > 0 ? Object.assign(steady, { worstLabel: worstLabel(steady) }) : null,
      average: average ? Object.assign(average, { worstLabel: worstLabel(average) }) : null };
  }

  M.plan = { LIMITS, SHAPES, hh, choicesFor, parseList, valText, label, dayRuns, runSet, judge, generate, grid, shape, day };
})(window.M);
