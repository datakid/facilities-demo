window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, E = M.engine, MD = M.model;

  function corr(a, b) {
    const n = a.length; if (n < 4) return null;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
  }

  function verdict(res) {
    const L = res.lead;
    if (!res.rows.length) return { level: 'none', text: 'Add some options to rank' };
    if (!res.totalW) return { level: 'none', text: 'Give at least one thing some importance' };
    if (!L) return { level: 'none', text: 'No option passes the must-haves' };
    if (L.margin == null) return { level: 'clear', text: 'Only one option passes' };
    if (L.margin < 2) return { level: 'tie', text: 'Too close to call' };
    if (L.margin < 6) return { level: 'lean', text: 'Leaning, but close' };
    return { level: 'clear', text: 'Clear winner' };
  }

  function weightRobustness(model, res) {
    const L = res.lead; if (!L || !L.runnerUp) return [];
    const out = [];
    model.criteria.filter(c => c.on && res.share[c.id] != null).forEach(c => {
      const runs = E.weightSweep(model, res, c.id);
      const cur = c.weight;
      const here = runs.find(r => cur >= r.from && cur <= r.to);
      if (!here) return;
      const lower = runs.filter(r => r.to < here.from).pop(), higher = runs.find(r => r.from > here.to);
      out.push({ crit: c.id, runs, down: lower ? { at: lower.to, winner: lower.winner } : null, up: higher ? { at: higher.from, winner: higher.winner } : null });
    });
    return out;
  }

  function dominated(model, res) {
    const ids = res.crits; if (ids.length < 2) return [];
    const pass = res.rows.filter(r => r.pass);
    const out = [];
    pass.forEach(a => {
      const by = pass.find(b => b !== a && ids.every(c => b.c[c].s >= a.c[c].s - 1e-9) && ids.some(c => b.c[c].s > a.c[c].s + 1e-9));
      if (by) out.push({ row: a.id, by: by.id });
    });
    return out;
  }

  function build(model, res) {
    const G = [];
    const rl = id => res.byId[id] ? res.byId[id].label : id;
    const cl = id => { const c = model.criteria.find(x => x.id === id); return c ? MD.labelOf(model, c.col) : id; };
    const v = verdict(res);
    res.issues.forEach(e => {
      const who = e.where === 'rule' ? 'A must-have' : `The formula for ${MD.labelOf(model, e.id)}`;
      G.push({ tone: 'bad', key: 'err-' + e.id, title: `${who} has a problem`, body: e.msg, go: { kind: e.where === 'rule' ? 'rule' : 'column', id: e.id } });
    });
    const miss = res.rows.filter(r => r.missing.length);
    if (miss.length) {
      const first = miss[0];
      G.push({ tone: 'warn', key: 'missing', title: `${miss.length} option${miss.length > 1 ? 's have' : ' has'} blanks`, body: `Blank values get zero points, so ${rl(first.id)} is scored as worst on ${U.list(first.missing.map(cl))}. Fill them in on the Options tab to be fair.`, go: { kind: 'tab', id: 'options' } });
    }
    const ruleErr = res.rows.filter(r => r.rules.some(x => x.error));
    if (ruleErr.length) G.push({ tone: 'warn', key: 'rule-err', title: 'A must-have could not be checked', body: `${rl(ruleErr[0].id)}: ${ruleErr[0].rules.find(x => x.error).error}. It is treated as failing.` });
    if (res.rows.length && !res.ranked.length && model.rules.some(r => r.on)) G.push({ tone: 'bad', key: 'all-out', title: 'Every option fails a must-have', body: 'Loosen one of the must-haves, or switch one off to see the ranking again.', go: { kind: 'tab', id: 'rules' } });
    res.crits.forEach(id => { if (res.info[id] && res.info[id].flat && res.rows.length > 1) G.push({ tone: 'info', key: 'flat-' + id, title: `${cl(id)} doesn't change anything`, body: 'Every option has the same value here, so it gives everyone the same points. Remove it or add options that differ.' }); });

    const L = res.lead;
    if (L && L.runnerUp) {
      if (v.level === 'tie') G.push({ tone: 'warn', key: 'tie', title: `${rl(L.winner)} and ${rl(L.runnerUp)} are neck and neck`, body: `Only ${U.pts(L.margin)} points apart. Small changes in importance or data can swap them, so treat both as winners and decide on something the model doesn't capture.` });
      const rob = weightRobustness(model, res);
      const fragile = rob.map(r => {
        const c = model.criteria.find(x => x.id === r.crit);
        const near = [r.down && { d: c.weight - r.down.at, at: r.down.at, w: r.down.winner, dir: 'down' }, r.up && { d: r.up.at - c.weight, at: r.up.at, w: r.up.winner, dir: 'up' }].filter(Boolean).sort((a, b) => a.d - b.d)[0];
        return near ? Object.assign(near, { crit: r.crit }) : null;
      }).filter(Boolean).sort((a, b) => a.d - b.d);
      if (fragile.length && fragile[0].d <= 1.5) {
        const f = fragile[0];
        G.push({ tone: 'warn', key: 'fragile', title: `Sensitive to how much ${cl(f.crit)} matters`, body: `If you set ${cl(f.crit)} to ${f.at} (now ${model.criteria.find(c => c.id === f.crit).weight}), ${rl(f.w)} takes first place. Be sure about that importance.`, go: { kind: 'criterion', id: f.crit } });
      } else if (rob.length) {
        G.push({ tone: 'ok', key: 'robust', title: `${rl(L.winner)} holds up`, body: fragile.length ? `It stays first unless you move one importance by more than ${Math.floor(fragile[0].d)} steps.` : 'It stays first whatever single importance you change.' });
      }
      if (res.crits.length >= 2) {
        const w = res.byId[L.winner];
        const parts = res.crits.map(id => ({ id, p: w.c[id].contrib })).sort((a, b) => b.p - a.p);
        const tot = parts.reduce((a, x) => a + x.p, 0);
        if (tot > 0 && parts[0].p / tot > 0.6) G.push({ tone: 'info', key: 'one-trick', title: `${rl(L.winner)} wins mostly on ${cl(parts[0].id)}`, body: `${Math.round(parts[0].p / tot * 100)}% of its score comes from that one thing. If ${cl(parts[0].id)} isn't really that important, lower it.`, go: { kind: 'criterion', id: parts[0].id } });
      }
    }
    dominated(model, res).slice(0, 2).forEach(d => G.push({ tone: 'info', key: 'dom-' + d.row, title: `${rl(d.row)} can never win`, body: `${rl(d.by)} is at least as good on everything you score, whatever the importance. You could drop it.` }));
    for (let i = 0; i < res.crits.length; i++) for (let j = i + 1; j < res.crits.length; j++) {
      const a = res.crits[i], b = res.crits[j];
      const pass = res.rows.filter(r => !r.c[a].missing && !r.c[b].missing);
      const r = corr(pass.map(x => x.c[a].s), pass.map(x => x.c[b].s));
      if (r != null && r > 0.97) G.push({ tone: 'info', key: 'dup-' + a + b, title: `${cl(a)} and ${cl(b)} say the same thing`, body: 'They rank the options almost identically, so together they count twice. Keep one, or lower both.' });
    }
    model.knobs.slice(0, 6).forEach(k => {
      const s = E.knobSweep(model, k.id, 16, res.prep);
      if (!s || !s.flips.length) return;
      const near = s.flips.map(f => ({ f, d: Math.abs(f.at - k.value) / ((k.max - k.min) || 1) })).sort((a, b) => a.d - b.d)[0];
      if (near.d < 0.12) G.push({ tone: 'warn', key: 'knob-' + k.id, title: `Close to a switch on ${k.label}`, body: `At about ${U.withUnit(+near.f.at.toPrecision(3), k.unit)} the winner changes from ${rl(near.f.from) || 'nobody'} to ${rl(near.f.to) || 'nobody'}.`, go: { kind: 'knob', id: k.id } });
    });
    return { verdict: v, items: G };
  }

  M.insights = { build, verdict, weightRobustness, dominated, corr };
})(window.M);
