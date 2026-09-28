window.M = window.M || {};
(function (M) {
  'use strict';
  const { fmtN } = M.util;
  const compute = M.engine.compute;

  function corr(a, b) {
    const n = a.length; if (n < 4) return null;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
  }

  function honesty(model, res, sens, extra) {
    extra = extra || {};
    const G = [];
    const crit = id => model.criteria.find(c => c.id === id);
    const L = id => (crit(id) || {}).label || id;
    const rl = id => res.byId[id] ? res.byId[id].label : id;
    if (!model.rows.length) return G;
    res.errors.forEach(e => {
      const who = e.where === 'combine' ? 'Custom formula' : e.where === 'gate' ? 'Rule ' + ((model.gates.find(g => g.id === e.id) || {}).label || e.id)
        : e.where === 'calc' ? 'Calculation ' + (((model.calcs || []).find(k => k.id === e.id) || {}).label || e.id) : L(e.id);
      G.push({ level: e.warn ? 'warn' : 'bad', text: `${who}: ${e.msg}.${e.warn ? '' : ' It is being ignored.'}` });
    });
    if (res.customFallback) G.push({ level: 'bad', text: 'The custom formula has an error, so scores below use Add up instead.' });
    if (res.total === 0 && res.used.length) G.push({ level: 'bad', text: 'Every weight is 0, so every score is 0.' });

    (model.calcs || []).forEach(k => {
      const inf = res.rows.filter(r => r.pass && r.calc[k.id] && r.calc[k.id].v === Infinity).length;
      if (inf) G.push({ level: 'warn', text: `${k.label} is unbounded for ${inf} ranked option${inf > 1 ? 's' : ''}: demand is at or above capacity, so the queue grows without limit. Add a rule such as “load below 100%” to rule ${inf > 1 ? 'them' : 'it'} out.` });
    });

    const errOut = res.rows.filter(r => !r.pass && r.gates.some(g => g.error)).length;
    if (errOut) G.push({ level: 'warn', text: `${errOut} option${errOut > 1 ? 's were' : ' was'} ruled out because a rule could not be checked (usually a missing value), not because they failed it.` });
    if (res.out.length && res.out.length >= res.rows.length / 2) G.push({ level: 'info', text: `Rules remove ${res.out.length} of ${res.rows.length} options. The ranking is only among the ${res.ranked.length} left.` });
    if (res.ranked.length && res.ranked.length < 3) G.push({ level: 'info', text: `Only ${res.ranked.length} option${res.ranked.length > 1 ? 's are' : ' is'} ranked. There is little to compare.` });

    res.used.forEach(id => {
      const R = res.ranges[id];
      if (R && R.hi === R.lo) G.push({ level: 'warn', text: `${L(id)} is the same for every option, so it has no effect.` });
      const miss = res.rows.filter(r => r.crit[id] && r.crit[id].raw === null).length;
      if (miss) {
        const pol = (crit(id) || {}).missing || 'worst';
        const how = { worst: 'They get 0 points there, the worst possible result', neutral: 'They get half points there, a guess in the middle', best: 'They get full points there, which flatters them', exclude: 'They are ruled out' }[pol];
        G.push({ level: pol === 'exclude' ? 'info' : 'warn', text: `${miss} option${miss > 1 ? 's have' : ' has'} no usable value for ${L(id)}. ${how}. You can change this in the criterion.` });
      }
      if (R && !R.auto && R.hi !== R.lo) {
        const clip = res.rows.filter(r => typeof r.crit[id].raw === 'number' && isFinite(r.crit[id].raw) && (r.crit[id].raw < Math.min(R.lo, R.hi) || r.crit[id].raw > Math.max(R.lo, R.hi))).length;
        if (clip) G.push({ level: 'info', text: `${clip} option${clip > 1 ? 's fall' : ' falls'} outside the fixed range of ${L(id)} and ${clip > 1 ? 'are' : 'is'} clipped to the end.` });
      }
    });
    const shares = res.active.map(id => [id, res.weights[id]]).sort((a, b) => b[1] - a[1]);
    if (shares.length > 1 && shares[0][1] > 0.5) G.push({ level: 'info', text: `${L(shares[0][0])} carries ${Math.round(shares[0][1] * 100)}% of the weight. The other criteria mostly break ties.` });
    if (res.ctype === 'min') G.push({ level: 'info', text: 'With Weakest link, the weights have no effect. Only the lowest criterion counts.' });
    if (res.ctype === 'product') {
      const z = res.ranked.filter(id => res.active.some(c => res.byId[id].crit[c].s === 0)).length;
      if (z) G.push({ level: 'info', text: `${z} option${z > 1 ? 's score' : ' scores'} 0 because ${z > 1 ? 'they are' : 'it is'} at the bottom of at least one criterion. Multiply is unforgiving.` });
    }
    const pass = res.ranked.map(id => res.byId[id]);
    for (let i = 0; i < res.active.length; i++) for (let j = i + 1; j < res.active.length; j++) {
      const a = res.active[i], b = res.active[j];
      const r = corr(pass.map(x => x.crit[a].s), pass.map(x => x.crit[b].s));
      if (r !== null && r > 0.9) G.push({ level: 'info', text: `${L(a)} and ${L(b)} move together (r = ${r.toFixed(2)}). You may be counting the same thing twice.` });
    }
    if (res.ranked.length > 1 && res.active.length > 1 && model.rows.length <= 200) res.active.forEach(id => {
      const m = structuredClone(model); m.criteria.find(c => c.id === id).enabled = false;
      const r2 = compute(m);
      if (r2.ranked.join() === res.ranked.join()) G.push({ level: 'info', text: `Dropping ${L(id)} would not change the order. It adds nothing with this data.` });
    });
    const lead = res.lead;
    if (lead && lead.margin != null && lead.margin < 2) G.push({ level: 'warn', text: `${rl(lead.winner)} and ${rl(lead.runnerUp)} are ${lead.margin.toFixed(1)} points apart. Treat this as a tie unless your numbers are exact.` });
    if (sens && lead) {
      let fragile = false, allStable = true; const frag = [];
      Object.entries(sens).forEach(([id, sw]) => {
        if (!sw) return;
        if (sw.runs.length > 1) allStable = false;
        const cur = Math.round(sw.current);
        const i = sw.runs.findIndex(r => cur >= r.from && cur <= r.to); if (i < 0) return;
        const run = sw.runs[i];
        const down = i > 0 ? cur - run.from + 1 : Infinity, up = i < sw.runs.length - 1 ? run.to - cur + 1 : Infinity;
        const d = Math.min(down, up);
        if (d <= 5) { fragile = true; frag.push({ id, d, other: (down <= up ? sw.runs[i - 1] : sw.runs[i + 1]).winner }); }
      });
      if (frag.length === 1 || frag.length === 2) frag.forEach(f => G.push({ level: 'warn', text: `Changing ${L(f.id)}'s share by about ${f.d} point${f.d > 1 ? 's' : ''} hands first place to ${f.other ? rl(f.other) : 'nobody'}. The result is fragile here.` }));
      else if (frag.length > 2) {
        const ds = frag.map(f => f.d), lo = Math.min(...ds), hi = Math.max(...ds);
        const who = [...new Set(frag.map(f => f.other ? rl(f.other) : 'nobody'))];
        G.push({ level: 'warn', text: `Moving any one of ${frag.map(f => L(f.id)).join(', ')} by ${lo === hi ? lo : lo + '–' + hi} points of share hands first place to ${who.join(' or ')}. The winner depends on weights you probably can't justify that precisely.` });
      }
      if (allStable && Object.keys(sens).length) G.push({ level: 'ok', text: `${rl(lead.winner)} stays on top however you set any single weight.` });
      else if (!fragile && Object.keys(sens).length) G.push({ level: 'ok', text: 'No single weight is within 5 points of changing the winner.' });
    }
    const ks = extra.knobs || {};
    Object.values(ks).forEach(k => {
      if (!k || !lead) return;
      const p = model.params.find(x => x.id === k.id); if (!p) return;
      if (k.runs.length === 1) return;
      const i = k.runs.findIndex(r => k.current >= r.from - 1e-9 && k.current <= r.to + 1e-9);
      const run = k.runs[i >= 0 ? i : 0];
      const nm = w => w ? rl(w) : 'nobody';
      const parts = k.runs.map(r => `${nm(r.winner)} ${fmtN(r.from)}–${fmtN(r.to)}`).join(', ');
      const span = (k.hi - k.lo) || 1, near = Math.min(Math.abs(k.current - run.from), Math.abs(run.to - k.current)) / span;
      const edge = (run.from > k.lo + 1e-9 && Math.abs(k.current - run.from) / span < 0.1) || (run.to < k.hi - 1e-9 && Math.abs(run.to - k.current) / span < 0.1);
      G.push({ level: edge ? 'warn' : 'info', text: `${p.label} decides the winner: ${parts}.${edge ? ` You are close to a switch point, so check that ${p.label.toLowerCase()} is right.` : ''}` });
      void near;
    });
    const sc = extra.scenarios || [];
    if (sc.length > 1 && lead) {
      const wins = [...new Set(sc.map(s => s.winner))];
      if (wins.length === 1) G.push({ level: 'ok', text: `${rl(wins[0])} wins in every scenario (${sc.map(s => s.label).join(', ')}).` });
      else G.push({ level: 'info', text: `The winner changes by scenario: ${sc.map(s => `${s.label} → ${s.winner ? rl(s.winner) : 'nobody'}`).join(', ')}. Pick the one you can live with in the worst scenario, or plan to switch.` });
    }
    const wf = extra.weightFree;
    if (wf && lead) {
      const top = Object.entries(wf.shares).sort((a, b) => b[1] - a[1]);
      const mine = Math.round((wf.shares[lead.winner] || 0) * 100);
      if (top[0][0] === lead.winner && mine >= 60) G.push({ level: 'ok', text: `${rl(lead.winner)} wins under ${mine}% of all possible weightings. The result mostly comes from the data, not from your weights.` });
      else if (top[0][0] === lead.winner) G.push({ level: 'info', text: `${rl(lead.winner)} wins under ${mine}% of all possible weightings. Your weights matter here, so be ready to defend them.` });
      else G.push({ level: 'warn', text: `Across all possible weightings, ${rl(top[0][0])} wins most often (${Math.round(top[0][1] * 100)}%). ${rl(lead.winner)} wins only ${mine}% of the time, so your weights are what put it first.` });
    }
    const un = extra.uncertainty;
    if (un && lead) {
      const p = Math.round(un.byRow[lead.winner].pFirst * 100);
      const ns = un.noisy.map(L).join(', ');
      if (p < 60) G.push({ level: 'warn', text: `With the error margins you set on ${ns}, ${rl(lead.winner)} comes first only ${p}% of the time. The data isn't precise enough to separate the leaders.` });
      else G.push({ level: 'ok', text: `With the error margins you set on ${ns}, ${rl(lead.winner)} still comes first ${p}% of the time.` });
    }
    const rv = extra.reversal;
    if (rv && rv.length) {
      const f = rv[0];
      G.push({ level: 'warn', text: `Removing ${rl(f.removed)}, which isn't the winner, would make ${rl(f.winner)} the winner${rv.length > 1 ? ` (${rv.length} options do this)` : ''}. Auto ranges make scores depend on who else is in the list. Fixed ranges avoid this.` });
    } else if (Object.values(res.ranges).some(R => R.auto)) G.push({ level: 'info', text: 'Scores are relative to these options. Adding or removing one can change everyone else’s score.' });
    const order = { bad: 0, warn: 1, info: 2, ok: 3 };
    return G.sort((a, b) => order[a.level] - order[b.level]);
  }

  function flips(model, res) {
    if (res.ctype !== 'sum' || res.ranked.length < 2) return [];
    const a = res.byId[res.ranked[0]], out = [];
    const colType = {}; model.columns.forEach(c => { colType[c.id] = c.type; });
    res.ranked.slice(1, 4).forEach(bid => {
      const b = res.byId[bid], gap = a.score - b.score, opts = [];
      model.criteria.forEach(c => {
        if (!res.active.includes(c.id)) return;
        const e = b.crit[c.id], w = res.weights[c.id];
        if (e.raw == null) return;
        if ((1 - e.s) * w * 100 <= gap + 1e-9) return;
        const need = e.s + (gap + 0.05) / (w * 100);
        if (c.shape.type === 'map') {
          const cats = Object.entries(c.shape.map || {}).filter(([, v]) => v >= need).map(([k]) => k);
          if (cats.length) opts.push({ critId: c.id, text: `${c.label} were “${cats[0]}”` });
          return;
        }
        if (c.shape.type === 'target') return;
        if (c.source.kind !== 'column') { opts.push({ critId: c.id, text: `its ${c.label} score rose from ${e.s.toFixed(2)} to ${need.toFixed(2)}` }); return; }
        const R = res.ranges[c.id]; if (!R || R.hi === R.lo) return;
        const f = u => M.shapes.apply(c.shape, u);
        if (f(1) < need) return;
        let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (f(mid) >= need) hi = mid; else lo = mid; }
        const t0 = c.direction === 'lower' ? 1 - hi : hi, raw = R.lo + t0 * (R.hi - R.lo);
        if (colType[c.source.column] === 'boolean') opts.push({ critId: c.id, text: `${c.label} were yes` });
        else {
          const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)) - 2);
          const rr = raw > e.raw ? Math.ceil(raw / mag) * mag : Math.floor(raw / mag) * mag;
          opts.push({ critId: c.id, text: `${c.label} were ${fmtN(+rr.toPrecision(6))} instead of ${fmtN(e.raw)}` });
        }
      });
      out.push({ rowId: bid, label: b.label, gap, opts });
    });
    return out;
  }

  M.engine.honesty = honesty;
  M.engine.flips = flips;
})(window.M);
