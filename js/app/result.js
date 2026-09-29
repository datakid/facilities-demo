window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, R = M.render, D = M.dom, fmt = H.fmt, fmtN = H.fmtN;

  const unitOf = c => {
    if (c.source.kind === 'column') { const k = H.col(c.source.column); return k && k.unit ? k.unit : ''; }
    if (c.source.kind === 'calc') { const k = H.calc(c.source.calc); return k ? (k.format === 'pct' ? '%' : k.unit) : ''; }
    return '';
  };
  const rawText = (c, raw) => {
    if (raw == null) return 'missing';
    if (typeof raw === 'string') return raw;
    if (c.source.kind === 'calc') { const k = H.calc(c.source.calc); if (k) return M.format.calc(k, raw); }
    const u = unitOf(c); return fmtN(+raw.toPrecision(4)) + (u ? ' ' + u : '');
  };

  function chip(c, res) {
    const k = H.cidx(c.id);
    return `<button class="chip" style="--ct:var(--t${k});--cc:var(--c${k});--ck:var(--k${k})" data-action="open" data-kind="criterion" data-id="${c.id}">${esc(c.label)}${res.ctype === 'sum' ? ` <span class="chip-w num">${H.pct(res.weights[c.id])}</span>` : ''}</button>`;
  }
  function equationLine(res) {
    const m = S.model, act = m.criteria.filter(c => res.used.includes(c.id));
    const rules = `<span class="chip rules" title="1 if every rule passes, otherwise 0">Rules</span>`;
    let inner;
    if (!act.length) inner = '…';
    else if (res.ctype === 'product') inner = act.map(c => `${chip(c, res)}<sup class="num eq-w">${res.weights[c.id].toFixed(2)}</sup>`).join('<span class="eq-op">×</span>');
    else if (res.ctype === 'min') inner = '<span class="eq-op">min</span> ' + act.map(c => chip(c, res)).join('<span class="eq-op">,</span>');
    else if (res.ctype === 'custom') inner = `<span class="mono eq-custom">${esc(m.combine.expr)}</span>`;
    else inner = act.map(c => chip(c, res)).join('<span class="eq-op">+</span>');
    return `<div class="equation" id="equation"><span class="eq-lhs">Score</span><span class="eq-op">=</span>${rules}<span class="eq-op">×</span><span class="eq-paren">(</span>${inner}<span class="eq-paren">)</span><span class="eq-op">× 100</span></div>`;
  }

  function ledger(res, ref, rowId) {
    const m = S.model, r = res.byId[rowId]; if (!r) return '';
    const rr = ref && ref.byId[rowId];
    const act = m.criteria.filter(c => res.used.includes(c.id));
    const sum = res.ctype === 'sum', minId = res.ctype === 'min' && res.active.length ? res.active.reduce((a, id) => r.crit[id].s < r.crit[a].s ? id : a, res.active[0]) : null;
    const lines = act.map(c => {
      const e = r.crit[c.id], k = H.cidx(c.id), pe = rr && rr.crit[c.id];
      const pts = sum ? e.contrib * 100 : null, ppts = sum && pe ? pe.contrib * 100 : null;
      const off = !res.active.includes(c.id);
      const rawD = pe && typeof e.raw === 'number' && typeof pe.raw === 'number' && !H.near(e.raw, pe.raw) ? e.raw - pe.raw : null;
      const dir = c.shape.type === 'target' || c.shape.type === 'map' ? null : c.direction;
      return `<button class="lg-row ${off ? 'off' : ''} ${minId === c.id ? 'decisive' : ''}" data-key="lg:${esc(c.id)}" data-action="open" data-kind="criterion" data-id="${esc(c.id)}" style="--cc:var(--c${k});--ct:var(--t${k});--ck:var(--k${k})">
        <span class="lg-name"><i class="sw"></i>${esc(c.label)}</span>
        <span class="lg-raw num" title="Input value">${esc(rawText(c, e.raw))}${rawD != null ? R.delta(rawD, { invert: dir === 'lower', neutral: !dir, text: rawD > 0 ? '▲' : '▼' }) : ''}</span>
        <span class="lg-s" title="Score on this criterion, 0 to 1"><span class="lg-bar"><i style="width:${(e.s * 100).toFixed(1)}%"></i></span><span class="num">${fmt(e.s, 2)}</span></span>
        <span class="lg-w num" title="Share of the score">${sum ? '× ' + H.pct(e.w) : res.ctype === 'product' ? '^' + fmt(e.w, 2) : ''}</span>
        <span class="lg-p num">${sum ? fmt(pts, 1) : minId === c.id ? 'lowest' : ''}</span>
        <span class="lg-d">${sum && ppts != null ? R.delta(pts - ppts) : ''}</span></button>`;
    }).join('');
    const d = rr ? r.score - rr.score : null;
    const gatesFail = r.gates.filter(g => !g.pass);
    const rule = r.pass ? '<span class="lg-rule ok">rules pass · × 1</span>' : `<span class="lg-rule bad">ruled out · × 0 · ${esc(r.failReason || '')}</span>`;
    void gatesFail;
    return `<div class="ledger" id="ledger">
      <div class="lg-head"><button class="lg-who" data-action="select-row" data-id="${esc(rowId)}"><span class="rk-dot num">${r.rank || '–'}</span><b>${esc(r.label)}</b></button>${rule}
        <span class="lg-total"><span class="num big">${fmt(r.score, 1)}</span>${d != null ? R.delta(d) : ''}</span></div>
      <div class="lg-cols"><span>criterion</span><span>input</span><span>score</span><span>${sum ? 'share' : res.ctype === 'product' ? 'power' : ''}</span><span>${sum ? 'points' : ''}</span><span></span></div>
      ${lines}</div>`;
  }

  function cmpSeg() {
    const c = S.ui.cmp, a = H.active();
    return `<div class="seg seg-sm cmp" role="group" aria-label="Show changes against"><span class="seg-lab">Δ vs</span>
      <button data-action="set-cmp" data-v="last" aria-pressed="${c === 'last'}" title="Changes since your last edit">last edit</button>
      <button data-action="set-cmp" data-v="base" aria-pressed="${c === 'base'}" title="Changes against the saved ${a ? 'scenario' : 'baseline'}">${a ? esc(a.label) : 'baseline'}</button>
      <button data-action="set-cmp" data-v="off" aria-pressed="${c === 'off'}">off</button></div>`;
  }

  function leadHTML(res, ref) {
    const L = res.lead;
    if (!res.ranked.length) return '<p class="lead">Every option is ruled out. Loosen a rule or change a knob to see a ranking.</p>';
    if (!L || L.runnerUp == null) return `<p class="lead"><b>${esc(H.rowLabel(res.ranked[0]))}</b> is the only option left.</p>`;
    let s = `<p class="lead"><b>${esc(H.rowLabel(L.winner))}</b> leads <b>${esc(H.rowLabel(L.runnerUp))}</b> by <span class="num">${fmt(L.margin, 1)}</span> points.`;
    if (L.driver && L.driver.pts > 0) s += ` Biggest gap: ${esc(H.crit(L.driver.critId).label)} (<span class="num">+${fmt(L.driver.pts, 1)}</span>).`;
    if (ref && ref.ranked[0] && ref.ranked[0] !== L.winner) s += ` <span class="lead-flip">New leader, was ${esc(H.rowLabel(ref.ranked[0]))}.</span>`;
    return s + '</p>';
  }

  function heroHTML() {
    const res = H.cur(), ref = H.refRes(), fr = H.focusRow();
    return `${equationLine(res)}<div class="hero-bar">${leadHTML(res, ref)}${cmpSeg()}</div>${fr ? ledger(res, ref, fr) : ''}
      ${S.ui.advanced && res.used.length ? `<div class="eq-lines">${S.model.criteria.filter(c => res.used.includes(c.id)).map(c => esc(M.codegen.critFormula(S.model, res, c))).join('\n')}</div>` : ''}`;
  }

  function figuresHTML() {
    const pins = S.model.calcs.filter(k => k.pin);
    const fr = H.focusRow(); if (!pins.length || !fr) return '';
    const res = H.cur(), ref = H.refRes(), r = res.byId[fr];
    const cards = pins.map(k => {
      const cv = r.calc[k.id] || {}, bad = cv.v === Infinity || cv.error;
      const v = cv.v, pv = ref ? H.calcVal(k.id, fr, ref) : null, dir = H.calcDir(k.id);
      let dl = '';
      if (typeof v === 'number' && isFinite(v) && pv != null && isFinite(pv) && !H.near(v, pv)) {
        const txt = k.format === 'pct' ? R.fmtD((v - pv) * 100, 1) + ' pt' : R.fmtD(v - pv, Math.abs(v - pv) < 1 ? 2 : 1);
        dl = R.delta(v - pv, { neutral: !dir, invert: dir === 'lower', text: txt, eps: 1e-9 });
      } else if (pv != null && !isFinite(pv) && isFinite(v)) dl = '<span class="dl up">now finite</span>';
      return `<button class="fig ${bad ? 'is-bad' : ''}" data-key="f:${esc(k.id)}" data-action="open" data-kind="calc" data-id="${esc(k.id)}" title="${esc(k.note || k.expr)}"><span class="fig-label">${esc(k.label)}</span><span class="fig-val num">${esc(H.calcText(k, fr, res))}</span>${dl}</button>`;
    }).join('');
    return `<h2>Key figures <span class="h-sub">for ${esc(r.label)}${r.pass ? '' : ' (ruled out)'}</span></h2><div class="figs">${cards}</div>`;
  }

  function spark(x, win) {
    const W = 132, Ht = 30, pts = x.pts; if (!pts || pts.length < 2) return '';
    const mx = Math.max(100, ...pts.map(p => p.s)), X = i => (i / (pts.length - 1) * W).toFixed(1), Y = s => (Ht - 3 - s / mx * (Ht - 6)).toFixed(1);
    const bad = pts.map((p, i) => p.w !== win ? `<rect x="${Math.max(0, i / (pts.length - 1) * W - W / (pts.length - 1) / 2).toFixed(1)}" y="0" width="${(W / (pts.length - 1)).toFixed(1)}" height="${Ht}" class="sp-lose"/>` : '').join('');
    const cx = ((x.cur - x.lo) / ((x.hi - x.lo) || 1) * W).toFixed(1);
    return `<svg class="sp" viewBox="0 0 ${W} ${Ht}" preserveAspectRatio="none" aria-hidden="true">${bad}<polyline points="${pts.map((p, i) => X(i) + ',' + Y(p.s)).join(' ')}" class="sp-line"/><line x1="${cx}" x2="${cx}" y1="0" y2="${Ht}" class="sp-cur"/></svg>`;
  }
  function needleHTML() {
    const I = S.impact, m = S.model;
    if (!m.params.length) return '';
    if (!I) return `<h2>What moves the needle</h2><div class="card pad"><p class="help">${S.result.ranked.length ? 'Measuring each knob…' : 'Nothing is ranked, so there is no leader to measure.'}</p></div>`;
    const win = I.winner, list = I.list.filter(x => x.swing >= 0.05 || x.below || x.above), quiet = I.list.length - list.length;
    const N = S.ui.needleAll ? list.length : 6, top = I.top || 1;
    const rows = list.slice(0, N).map(x => {
      const p = H.param(x.id); if (!p) return '';
      const tip = [x.below, x.above].filter(Boolean).sort((a, b) => Math.abs(a.at - x.cur) - Math.abs(b.at - x.cur))[0];
      const dir = x.sHi > x.sLo + 0.05 ? 'up' : x.sHi < x.sLo - 0.05 ? 'down' : 'mixed';
      return `<div class="nd-row" data-key="nd:${esc(x.id)}">
        <button class="nd-name" data-action="open" data-kind="param" data-id="${esc(x.id)}"><span>${esc(p.label)}</span><span class="nd-now"><span class="nd-g">${esc(p.group.replace(/^Team · /, ''))}</span> · <span class="num">${esc(H.paramText(p))}</span></span></button>
        <div class="nd-spark" data-spark="${esc(x.id)}" title="Hover to preview, click to set. Red: someone else leads.">${spark(x, win)}</div>
        <span class="nd-sw"><span class="imp-bar"><i style="width:${Math.max(4, x.swing / top * 100).toFixed(1)}%"></i></span><span class="num">±${x.swing >= 10 ? x.swing.toFixed(0) : x.swing.toFixed(1)}</span></span>
        <span class="nd-tip">${tip ? `flips at <b class="num">${fmtN(+tip.at.toPrecision(3))}</b> → ${esc(tip.who ? H.rowLabel(tip.who) : 'none')}` : `<span class="faint">${dir === 'up' ? 'more is better' : dir === 'down' ? 'less is better' : 'holds'}</span>`}</span></div>`;
    }).join('');
    return `<h2>What moves the needle <span class="h-sub">each knob swept min → max, holding the rest · score of ${esc(H.rowLabel(win))}</span></h2>
      <div class="card needle">${rows || '<p class="help pad-s">No knob changes the leader’s score.</p>'}
      ${list.length > 6 || quiet ? `<div class="nd-foot">${list.length > 6 ? `<button class="link" data-action="toggle-ui" data-k="needleAll">${S.ui.needleAll ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}${quiet ? `<span class="faint">${quiet} knob${quiet > 1 ? 's' : ''} with no effect</span>` : ''}</div>` : ''}</div>`;
  }

  R.gapsHTML = () => {
    const G = S.gaps || [];
    const lvl = G.some(g => g.level === 'bad') ? 'bad' : G.some(g => g.level === 'warn') ? 'warn' : 'ok';
    const label = { bad: 'Has errors', warn: 'Check before trusting', ok: 'Holds up' }[lvl];
    const all = S.ui.gapsAll, show = all ? G : G.slice(0, 3);
    return `<h2>Honesty check <span class="verdict ${lvl}">${label}</span>${G.length > 3 ? `<span class="h-actions"><button class="link" data-action="toggle-ui" data-k="gapsAll">${all ? 'Show fewer' : `All ${G.length}`}</button></span>` : ''}</h2>
      <ul class="gaps">${show.map((g, i) => `<li class="${g.level}" data-key="gp:${i}:${esc(g.text.slice(0, 24))}"><span class="sig" aria-label="${g.level}"></span><span>${esc(g.text)}</span></li>`).join('') || '<li class="ok"><span class="sig"></span><span>Nothing to flag.</span></li>'}</ul>`;
  };
  R.flipsHTML = () => {
    const F = S.flips; if (!F || !F.length) return '';
    const lead = H.rowLabel(S.result.ranked[0]);
    return `<h2>What would change first place</h2><ul class="flips">${F.map(f => `<li><b>${esc(f.label)}</b> <span class="num faint">−${fmt(f.gap, 1)}</span> ${f.opts.length
      ? 'would pass ' + esc(lead) + ' if ' + f.opts.slice(0, 3).map(o => esc(o.text)).join(', or if ') + '.'
      : '<span class="muted">cannot catch up by changing one criterion alone.</span>'}</li>`).join('')}</ul>
      <p class="help">One criterion at a time, everything else held still.</p>`;
  };
  R.chanceText = id => {
    const u = S.extra && S.extra.uncertainty; if (!u || !u.byRow[id] || S.peek) return '';
    const x = u.byRow[id], p = Math.round(x.pFirst * 100);
    return `${p < 1 && x.pFirst > 0 ? '<1' : p}% first · rank ${x.lo === x.hi ? x.lo : x.lo + '–' + x.hi}`;
  };
  function rowFigs(r) {
    const pins = S.model.calcs.filter(k => k.pin).slice(0, 4);
    if (!pins.length) return '';
    return `<span class="row-figs">${pins.map(k => `<span title="${esc(k.label)}"><i>${esc(k.label)}</i> ${esc(M.format.calc(k, (r.calc[k.id] || {}).v))}</span>`).join('')}</span>`;
  }
  function rankingHTML() {
    const res = H.cur(), ref = H.refRes(), sum = res.ctype === 'sum';
    const rows = res.ranked.map(id => {
      const r = res.byId[id], pr = ref && ref.byId[id];
      let bar;
      if (sum) bar = res.active.map(cid => `<span style="width:${Math.max(0, r.crit[cid].contrib * 100).toFixed(2)}%;background:var(--c${H.cidx(cid)})" title="${esc(H.crit(cid).label)} ${fmt(r.crit[cid].contrib * 100, 1)}"></span>`).join('');
      else bar = `<span style="width:${M.util.clamp(r.score, 0, 100).toFixed(2)}%;background:var(--brand)"></span>`;
      const mv = pr ? (pr.pass ? pr.rank - r.rank : null) : 0;
      const mvH = mv === null ? '<span class="mv new" title="Was ruled out">new</span>' : mv > 0 ? `<span class="mv up" title="Up ${mv}">▲${mv}</span>` : mv < 0 ? `<span class="mv dn" title="Down ${-mv}">▼${-mv}</span>` : '';
      const ch = R.chanceText(id);
      return `<button class="rank-row ${S.ui.selectedRow === id ? 'sel' : ''} ${r.rank === 1 ? 'first' : ''}" data-key="rr:${esc(id)}" data-action="select-row" data-id="${esc(id)}" data-row-id="${esc(id)}" aria-pressed="${S.ui.selectedRow === id}">
        <span class="rk">${r.rank}</span><span class="rank-main"><span class="nm">${esc(r.label)}${mvH}</span><span class="bar" aria-hidden="true">${bar}</span>${rowFigs(r)}</span>
        <span class="sc"><span class="sc-v">${fmt(r.score, 1)}</span>${pr ? R.delta(r.score - pr.score) : ''}${ch ? `<span class="chance">${esc(ch)}</span>` : ''}</span></button>`;
    }).join('');
    let h = `<h2>Ranking <span class="h-sub">${res.ranked.length} of ${res.rows.length} options</span><span class="h-actions"><button class="link" data-action="open-finder">Find better plans</button></span></h2><div class="ranking card" id="ranking">${rows || '<p class="empty">Nothing is ranked.</p>'}</div>`;
    if (res.out.length) {
      h += `<details class="out" data-keep-open ${S.ui.outOpen ? 'open' : ''} id="out-details"><summary>Ruled out · <span class="num">${res.out.length}</span></summary><div class="card">
        ${res.out.map(id => { const r = res.byId[id]; const e = r.gates.find(g => !g.pass && g.error); const was = ref && ref.byId[id] && ref.byId[id].pass; return `<button class="out-row" data-key="or:${esc(id)}" data-action="select-row" data-id="${esc(id)}"><span>${esc(r.label)}${was ? ' <span class="mv dn">just out</span>' : ''}</span><span class="tag ${e ? 'warn' : 'bad'}">${esc(e ? 'could not check: ' + e.error : r.failReason)}</span></button>`; }).join('')}</div></details>`;
    }
    return h;
  }

  function matrixHTML() {
    const m = S.model;
    if (!m.params.length) return '';
    let cols = S.live;
    if (!cols) cols = [{ id: '', label: 'Baseline', res: S.baseRes, winner: S.baseRes.ranked[0] }].concat((S.scen || []).map(s => ({ id: s.id, label: s.label, res: s.res, winner: s.winner })));
    if (cols.length < 2 && !m.scenarios.length) {
      return `<h2>Scenarios <span class="h-sub">compare the same plans in different situations</span></h2>
        <div class="card pad scen-empty"><p class="help">Move knobs, then press <b>Save as new</b> above the knobs. Or make a whole set at once from knob values.</p>
        <div class="row-gap"><button class="btn" data-action="scen-new">${R.ICON.plus} Save current as a scenario</button><button class="btn" data-action="open-scen-build">${R.ICON.grid3} Build a grid</button></div></div>`;
    }
    const res = H.cur(), act = m.active || '', saved = cols.filter(c => !c.now);
    const order = res.ranked.concat(res.out);
    const worst = {}, avg = {};
    order.forEach(id => { const ss = saved.map(c => (c.res.byId[id] && c.res.byId[id].pass) ? c.res.byId[id].score : 0); worst[id] = Math.min(...ss); avg[id] = ss.reduce((a, b) => a + b, 0) / (ss.length || 1); });
    const robust = order.slice().sort((a, b) => worst[b] - worst[a] || avg[b] - avg[a])[0];
    const limit = S.ui.matrixAll ? order.length : Math.min(order.length, 8);
    const peekId = S.peek ? S.peek.id : null;
    const head = cols.map(c => `<th scope="col" class="${!c.now && c.id === act ? 'on' : ''} ${c.now ? 'now' : ''} ${peekId === c.id ? 'peeking' : ''}" data-key="mh:${esc(c.id)}">${c.now ? `<span class="mx-h now-h">Now<span class="faint">unsaved</span></span>` : `<button class="mx-h" data-action="use-scen" data-id="${esc(c.id)}" data-peek="${esc(c.id)}" title="Use this scenario">${esc(c.label)}</button>`}</th>`).join('');
    const body = order.slice(0, limit).map(id => {
      const lab = H.rowLabel(id), k = H.rowColor(id);
      const cells = cols.map(c => {
        const r = c.res.byId[id]; if (!r) return '<td></td>';
        const win = c.winner === id, sc = r.pass ? r.score : null;
        return `<td class="${win ? 'win' : ''} ${sc == null ? 'out' : ''} ${!c.now && c.id === act ? 'on' : ''}" style="--f:${sc == null ? 0 : Math.max(0, Math.min(100, sc)).toFixed(0)}%">${sc == null ? '<span title="Ruled out">—</span>' : fmt(sc, 0)}</td>`;
      }).join('');
      return `<tr data-key="mr:${esc(id)}" class="${S.ui.selectedRow === id ? 'sel' : ''}"><th scope="row"><button class="mx-row" data-action="select-row" data-id="${esc(id)}"><i class="sw" style="background:var(--c${k})"></i><span class="ellipsis">${esc(lab)}</span></button></th>${cells}
        <td class="mx-sum ${id === robust && worst[id] > 0 ? 'best' : ''}" title="Worst and average over saved scenarios"><span class="num">${worst[id] > 0 ? fmt(worst[id], 0) : '—'}</span><span class="num faint">${fmt(avg[id], 0)}</span></td></tr>`;
    }).join('');
    const winners = new Set(saved.map(c => c.winner));
    const sub = saved.length > 1 ? (winners.size === 1 && saved[0].winner ? `${esc(H.rowLabel(saved[0].winner))} wins everywhere` : `${winners.size} different leaders`) : '';
    return `<h2>Scenarios <span class="h-sub">${sub}${robust && worst[robust] > 0 && saved.length > 1 ? ` · safest all-round: <b>${esc(H.rowLabel(robust))}</b>` : ''}</span>
      <span class="h-actions"><button class="link" data-action="open-scen-build">${R.ICON.grid3} Grid</button><button class="link" data-action="open-finder" data-over="scenarios" data-how="worst">Find a plan for all</button></span></h2>
      <div class="card mx-wrap"><table class="mx"><thead><tr><th class="mx-corner">Option</th>${head}<th class="mx-sum-h" title="Worst · average over saved scenarios">worst · avg</th></tr></thead><tbody>${body}</tbody></table>
      ${order.length > 8 ? `<div class="nd-foot"><button class="link" data-action="toggle-ui" data-k="matrixAll">${S.ui.matrixAll ? 'Show fewer' : `Show all ${order.length}`}</button><span class="faint">Hover a column to preview it, click to use it.</span></div>` : '<div class="nd-foot"><span class="faint">Hover a column to preview it, click to use it. Bold = leader.</span></div>'}</div>`;
  }

  R.stressHTML = () => {
    const ks = Object.values(S.knobs || {}).filter(Boolean); if (!ks.length) return '';
    const win = S.result.ranked[0];
    const colorOf = id => id ? `var(--t${H.rowColor(id)})` : 'var(--sunken)';
    const inkOf = id => id ? `var(--k${H.rowColor(id)})` : 'var(--ink-3)';
    return `<h2>Stress test <span class="h-sub">who wins as one knob moves</span></h2>` + ks.map(k => {
      const p = H.param(k.id); if (!p) return '';
      const total = k.steps + 1;
      const runs = k.runs.map(r => {
        const w = (r.toI - r.fromI + 1) / total * 100, nm = r.winner ? H.rowLabel(r.winner) : 'nobody passes';
        return `<div class="run ${r.winner === win ? 'win' : ''}" style="width:${w}%;background:${colorOf(r.winner)};color:${inkOf(r.winner)}" title="${esc(nm)}: ${fmtN(r.from)}–${fmtN(r.to)}">${esc(nm)}</div>`;
      }).join('');
      const pos = ((+p.value - k.lo) / ((k.hi - k.lo) || 1) * 100);
      return `<div class="strip" data-key="st:${esc(k.id)}"><div class="strip-head"><button class="link" data-action="open" data-kind="param" data-id="${esc(p.id)}">${esc(p.label)}</button><span class="num muted">${esc(H.paramText(p))}</span></div>
        <div class="strip-bar" data-spark="${esc(p.id)}">${runs}<span class="marker" style="left:calc(${pos}% - 1px)"></span></div>
        <div class="strip-scale num"><span>${fmtN(k.lo)}</span><span>${fmtN(k.hi)}${p.unit ? ' ' + esc(p.unit) : ''}</span></div></div>`;
    }).join('');
  };

  R.robustHTML = () => {
    if (!S.ui.advanced) return '';
    const res = S.result, ids = Object.keys(S.sens || {});
    if (!ids.length) return res.ranked.length > 1 && res.active.length > 1 ? '<h2>Weight robustness</h2><p class="help">Calculating…</p>' : '';
    const win = res.ranked[0];
    return `<h2>Weight robustness <span class="h-sub">who wins as one share moves from 0 to 100%</span></h2>` + ids.map(id => {
      const sw = S.sens[id], c = H.crit(id); if (!sw || !c) return '';
      const cur = Math.round(sw.current), run = sw.runs.find(r => cur >= r.from && cur <= r.to) || sw.runs[0];
      const runs = sw.runs.map(r => { const w = (r.to - r.from + 1) / 101 * 100; const nm = r.winner ? H.rowLabel(r.winner) : 'none'; return `<div class="run ${r.winner === win ? 'win' : ''}" style="width:${w}%" title="${esc(nm)}: ${r.from}–${r.to}%">${esc(nm)}</div>`; }).join('');
      const cap = sw.runs.length === 1 ? `${esc(H.rowLabel(run.winner))} wins at any share of ${esc(c.label)}.` : `${esc(H.rowLabel(run.winner))} stays on top while ${esc(c.label)} is between ${run.from}% and ${run.to}%.`;
      return `<div class="strip" data-key="rb:${esc(id)}"><div class="strip-head"><span style="font-weight:600;color:var(--k${H.cidx(id)})">${esc(c.label)}</span><span class="num muted">${Math.round(sw.current)}%</span></div>
        <div class="strip-bar">${runs}<span class="marker" style="left:calc(${sw.current}% - 1px)"></span></div><div class="strip-cap">${cap}</div></div>`;
    }).join('');
  };

  function peekBar() {
    if (!S.peek) return '';
    return `<div class="peek-bar"><span class="peek-dot"></span>Previewing <b>${esc(S.peek.label)}</b><span class="faint">· click to apply</span></div>`;
  }

  R.renderResult = () => {
    const el = document.getElementById('result-inner'); if (!el) return;
    const m = S.model, res = H.cur();
    const rk = document.getElementById('ranking'), before = {};
    if (rk && !H.reduced()) rk.querySelectorAll('[data-row-id]').forEach(x => { before[x.dataset.rowId] = x.offsetTop; });
    if (!m.rows.length) {
      D.blocks(el, [['rs-empty', 'empty-state', '<p class="empty">Add some options in Data.</p><button class="btn" data-action="set-view" data-v="data">Open Data</button>']]); return;
    }
    if (!m.criteria.length) {
      D.blocks(el, [['rs-empty', 'empty-state', '<div class="equation"><span class="eq-lhs">Score</span><span class="eq-op">=</span><span class="chip rules">Rules</span><span class="eq-op">× ( … ) × 100</span></div><p class="lead">Add a criterion to start scoring.</p><button class="btn primary" data-action="add-criterion">Add a criterion</button>']]); return;
    }
    const warn = res.total === 0 && res.used.length ? '<p class="lead" style="color:var(--bad-k)">Give at least one criterion some weight.</p>' : '';
    D.blocks(el, [
      ['rs-peek', 'peek-wrap', peekBar()],
      ['rs-hero', 'hero card', heroHTML() + warn],
      ['rs-figs', 'block', figuresHTML()],
      ['rs-rank', 'block', rankingHTML()],
      ['rs-scen', 'block', matrixHTML()],
      ['rs-needle', 'block', needleHTML()],
      ['rs-gaps', 'block card pad', R.gapsHTML()],
      ['analysis-day', 'block', R.dayHTML ? R.dayHTML() : ''],
      ['analysis-stress', 'block', R.stressHTML()],
      ['analysis-flips', 'block', R.flipsHTML()],
      ['analysis-robust', 'block', R.robustHTML()]
    ]);
    const rk2 = document.getElementById('ranking');
    if (rk2 && Object.keys(before).length) rk2.querySelectorAll('[data-row-id]').forEach(x => {
      const o = before[x.dataset.rowId]; if (o == null) return;
      const d = o - x.offsetTop; if (Math.abs(d) < 1) return;
      x.style.transition = 'none'; x.style.transform = `translateY(${d}px)`; void x.offsetHeight;
      x.style.transition = 'transform var(--t-med) var(--ease)'; x.style.transform = '';
    });
  };
  R.analysis = () => M.store.frame();
})(window.M);
