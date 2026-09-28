window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, R = M.render, fmt = H.fmt, fmtN = H.fmtN;

  function chip(c) {
    const k = H.cidx(c.id);
    return `<button class="chip" style="--ct:var(--t${k});--cc:var(--c${k});--ck:var(--k${k})" data-action="open" data-kind="criterion" data-id="${c.id}">${esc(c.label)}</button>`;
  }
  function equationHTML() {
    const m = S.model, res = S.result, act = m.criteria.filter(c => res.used.includes(c.id));
    const rules = '<span class="chip rules" title="1 if every rule passes, otherwise 0">Rules</span>';
    let inner;
    if (!act.length) inner = '…';
    else if (res.ctype === 'product') inner = act.map(c => `${chip(c)}<sup class="num eq-w">${res.weights[c.id].toFixed(2)}</sup>`).join(' × ');
    else if (res.ctype === 'min') inner = 'min( ' + act.map(chip).join(', ') + ' )';
    else if (res.ctype === 'custom') inner = `<span class="mono eq-custom">${esc(m.combine.expr)}</span>`;
    else inner = act.map(c => `<span class="eq-term"><span class="num eq-w">${H.pct(res.weights[c.id])}</span>${chip(c)}</span>`).join('<span class="eq-op">+</span>');
    let h = `<div class="equation" id="equation"><span class="eq-lhs">Score</span><span class="eq-op">=</span>${rules}<span class="eq-op">×</span><span class="eq-paren">(</span>${inner}<span class="eq-paren">)</span><span class="eq-op">× 100</span></div>`;
    const r = S.ui.selectedRow && res.byId[S.ui.selectedRow];
    if (r && act.length) {
      let n;
      const A = act.filter(c => res.active.includes(c.id));
      if (res.ctype === 'product') n = A.map(c => `${fmt(r.crit[c.id].s, 2)}^${fmt(res.weights[c.id], 2)}`).join(' × ');
      else if (res.ctype === 'min') n = 'min(' + A.map(c => fmt(r.crit[c.id].s, 2)).join(', ') + ')';
      else if (res.ctype === 'custom') n = fmt(r.S, 3);
      else n = A.map(c => `${fmt(res.weights[c.id], 2)}·${fmt(r.crit[c.id].s, 2)}`).join(' + ');
      h += `<p class="eq-nums"><b>${esc(r.label)}</b> = ${r.pass ? 1 : 0} × ( ${n} ) × 100 = <b>${fmt(r.score, 1)}</b></p>`;
    }
    if (S.ui.advanced && act.length) h += `<div class="eq-lines">${act.map(c => esc(M.codegen.critFormula(m, res, c))).join('\n')}</div>`;
    return h;
  }
  function leadHTML() {
    const res = S.result, L = res.lead;
    if (!res.ranked.length) return '<p class="lead">Every option is ruled out. Loosen a rule or change a knob to see a ranking.</p>';
    if (!L || L.runnerUp == null) return `<p class="lead"><b>${esc(H.rowLabel(res.ranked[0]))}</b> is the only option left.</p>`;
    let s = `<p class="lead"><b>${esc(H.rowLabel(L.winner))}</b> leads <b>${esc(H.rowLabel(L.runnerUp))}</b> by <span class="num">${fmt(L.margin, 1)}</span> points.`;
    if (L.driver && L.driver.pts > 0) s += ` Biggest reason: ${esc(H.crit(L.driver.critId).label)} (<span class="num">+${fmt(L.driver.pts, 1)}</span>).`;
    return s + '</p>';
  }
  function figuresHTML() {
    const pins = S.model.calcs.filter(k => k.pin);
    const fr = H.focusRow(); if (!pins.length || !fr) return '';
    const r = S.result.byId[fr];
    const cards = pins.map(k => {
      const cv = r.calc[k.id] || {}, bad = cv.v === Infinity || cv.error;
      return `<button class="fig ${bad ? 'is-bad' : ''}" data-action="open" data-kind="calc" data-id="${esc(k.id)}" title="${esc(k.note || k.expr)}"><span class="fig-label">${esc(k.label)}</span><span class="fig-val num" data-live="calc:${esc(k.id)}">${esc(H.calcText(k, fr))}</span></button>`;
    }).join('');
    return `<div class="block"><h2>Key figures <span class="h-sub">for ${esc(r.label)}${r.pass ? '' : ' (ruled out)'}</span></h2><div class="figs">${cards}</div></div>`;
  }
  R.gapsHTML = () => {
    const G = S.gaps;
    const lvl = G.some(g => g.level === 'bad') ? 'bad' : G.some(g => g.level === 'warn') ? 'warn' : 'ok';
    const label = { bad: 'Has errors', warn: 'Check before trusting', ok: 'Holds up' }[lvl];
    return `<h2>Honesty check <span class="verdict ${lvl}">${label}</span></h2>
      <ul class="gaps">${G.map(g => `<li class="${g.level}"><span class="sig" aria-label="${g.level}"></span><span>${esc(g.text)}</span></li>`).join('') || '<li class="ok"><span class="sig"></span><span>Nothing to flag.</span></li>'}</ul>`;
  };
  R.flipsHTML = () => {
    const F = S.flips; if (!F.length) return '';
    const lead = H.rowLabel(S.result.ranked[0]);
    return `<h2>What would change first place</h2><ul class="flips">${F.map(f => `<li><b>${esc(f.label)}</b> <span class="num faint">−${fmt(f.gap, 1)}</span> ${f.opts.length
      ? 'would pass ' + esc(lead) + ' if ' + f.opts.slice(0, 3).map(o => esc(o.text)).join(', or if ') + '.'
      : '<span class="muted">cannot catch up by changing one criterion alone.</span>'}</li>`).join('')}</ul>
      <p class="help">One criterion at a time, everything else held still.</p>`;
  };
  R.chanceText = id => {
    const u = S.extra && S.extra.uncertainty; if (!u || !u.byRow[id]) return '';
    const x = u.byRow[id], p = Math.round(x.pFirst * 100);
    return `${p < 1 && x.pFirst > 0 ? '<1' : p}% first · rank ${x.lo === x.hi ? x.lo : x.lo + '–' + x.hi}`;
  };
  function rowFigs(r) {
    const pins = S.model.calcs.filter(k => k.pin).slice(0, 4);
    if (!pins.length) return '';
    return `<span class="row-figs">${pins.map(k => `<span title="${esc(k.label)}"><i>${esc(k.label)}</i> ${esc(M.format.calc(k, (r.calc[k.id] || {}).v))}</span>`).join('')}</span>`;
  }
  function rankingHTML() {
    const res = S.result, sum = res.ctype === 'sum';
    const rows = res.ranked.map(id => {
      const r = res.byId[id];
      let bar;
      if (sum) bar = res.active.map(cid => `<span style="width:${Math.max(0, r.crit[cid].contrib * 100)}%;background:var(--c${H.cidx(cid)})" title="${esc(H.crit(cid).label)} ${fmt(r.crit[cid].contrib * 100, 1)}"></span>`).join('');
      else bar = `<span style="width:${M.util.clamp(r.score, 0, 100)}%;background:var(--brand)"></span>`;
      return `<button class="rank-row ${S.ui.selectedRow === id ? 'sel' : ''} ${r.rank === 1 ? 'first' : ''}" data-action="select-row" data-id="${esc(id)}" data-row-id="${esc(id)}" aria-pressed="${S.ui.selectedRow === id}">
        <span class="rk">${r.rank}</span><span class="rank-main"><span class="nm">${esc(r.label)}</span><span class="bar" aria-hidden="true">${bar}</span>${rowFigs(r)}</span><span class="sc">${fmt(r.score, 1)}<span class="chance" data-chance="${esc(id)}">${esc(R.chanceText(id))}</span></span></button>`;
    }).join('');
    let h = `<div class="block"><h2>Ranking <span class="h-sub">${res.ranked.length} of ${res.rows.length} options</span><span class="h-actions"><button class="link" data-action="open-finder">Find plans</button></span></h2><div class="ranking card" id="ranking">${rows || '<p class="empty">Nothing is ranked.</p>'}</div></div>`;
    if (res.out.length) {
      h += `<details class="out block" ${S.ui.outOpen ? 'open' : ''} id="out-details"><summary>Ruled out · <span class="num">${res.out.length}</span></summary><div class="card">
        ${res.out.map(id => { const r = res.byId[id]; const e = r.gates.find(g => !g.pass && g.error); return `<button class="out-row" data-action="select-row" data-id="${esc(id)}"><span>${esc(r.label)}</span><span class="tag ${e ? 'warn' : 'bad'}">${esc(e ? 'could not check: ' + e.error : r.failReason)}</span></button>`; }).join('')}</div></details>`;
    }
    return h;
  }

  R.scenariosHTML = () => {
    const sc = S.scen; if (!sc || !sc.length) return '';
    const res = S.result, pins = S.model.calcs.filter(k => k.pin).slice(0, 2);
    const cells = sc.map(s => {
      const w = s.winner, wr = w && s.res.byId[w];
      const figs = wr ? pins.map(k => `<span>${esc(k.label)} <b class="num">${esc(M.format.calc(k, (wr.calc[k.id] || {}).v))}</b></span>`).join('') : '';
      return `<button class="scen-card ${w && w === res.ranked[0] ? 'same' : ''}" data-action="open" data-kind="scenario" data-id="${esc(s.id)}" title="Open this scenario">
        <span class="scen-title">${esc(s.label)}</span>
        <span class="scen-win">${w ? esc(wr.label) : '<span class="muted">No option passes</span>'}</span>
        <span class="scen-meta">${w ? `<span class="num">${fmt(s.score, 1)}</span> · ${s.left} pass` : ''}</span>${figs ? `<span class="scen-figs">${figs}</span>` : ''}</button>`;
    }).join('');
    const wins = new Set(sc.map(s => s.winner));
    return `<h2>Scenarios <span class="h-sub">${wins.size === 1 && sc[0].winner ? 'same winner everywhere' : 'best option in each situation'}</span><span class="h-actions"><button class="link" data-action="open-scen-build">Build</button><button class="link" data-action="open-finder" data-over="scenarios" data-how="worst">Find a plan for all</button></span></h2><div class="scen-grid">${cells}</div>`;
  };

  R.stressHTML = () => {
    const ks = Object.values(S.knobs || {}).filter(Boolean); if (!ks.length) return '';
    const win = S.result.ranked[0];
    const palette = {}; let n = 0;
    const colorOf = id => { if (!id) return 'var(--sunken)'; if (!(id in palette)) palette[id] = (n++ % 8) + 1; return `var(--t${palette[id]})`; };
    const inkOf = id => id ? `var(--k${palette[id]})` : 'var(--ink-3)';
    return `<h2>Stress test <span class="h-sub">who wins as one knob moves</span></h2>` + ks.map(k => {
      const p = H.param(k.id); if (!p) return '';
      const total = k.steps + 1;
      const runs = k.runs.map(r => {
        const w = (r.toI - r.fromI + 1) / total * 100, nm = r.winner ? H.rowLabel(r.winner) : 'nobody passes';
        colorOf(r.winner);
        return `<div class="run ${r.winner === win ? 'win' : ''}" style="width:${w}%;background:${colorOf(r.winner)};color:${inkOf(r.winner)}" title="${esc(nm)}: ${fmtN(r.from)}–${fmtN(r.to)}">${esc(nm)}</div>`;
      }).join('');
      const pos = ((k.current - k.lo) / ((k.hi - k.lo) || 1) * 100);
      return `<div class="strip"><div class="strip-head"><button class="link" data-action="open" data-kind="param" data-id="${esc(p.id)}">${esc(p.label)}</button><span class="num muted">${esc(H.paramText(p))}</span></div>
        <div class="strip-bar">${runs}<span class="marker" style="left:calc(${pos}% - 1px)"></span></div>
        <div class="strip-scale num"><span>${fmtN(k.lo)}</span><span>${fmtN(k.hi)}${p.unit ? ' ' + esc(p.unit) : ''}</span></div></div>`;
    }).join('');
  };

  R.robustHTML = () => {
    if (!S.ui.advanced) return '';
    const res = S.result, ids = Object.keys(S.sens);
    if (!ids.length) return res.ranked.length > 1 && res.active.length > 1 ? '<h2>Weight robustness</h2><p class="help">Calculating…</p>' : '';
    const win = res.ranked[0];
    return `<h2>Weight robustness <span class="h-sub">who wins as one share moves from 0 to 100%</span></h2>` + ids.map(id => {
      const sw = S.sens[id], c = H.crit(id); if (!sw || !c) return '';
      const cur = Math.round(sw.current), run = sw.runs.find(r => cur >= r.from && cur <= r.to) || sw.runs[0];
      const runs = sw.runs.map(r => { const w = (r.to - r.from + 1) / 101 * 100; const nm = r.winner ? H.rowLabel(r.winner) : 'none'; return `<div class="run ${r.winner === win ? 'win' : ''}" style="width:${w}%" title="${esc(nm)}: ${r.from}–${r.to}%">${esc(nm)}</div>`; }).join('');
      const cap = sw.runs.length === 1 ? `${esc(H.rowLabel(run.winner))} wins at any share of ${esc(c.label)}.` : `${esc(H.rowLabel(run.winner))} stays on top while ${esc(c.label)} is between ${run.from}% and ${run.to}%.`;
      return `<div class="strip"><div class="strip-head"><span style="font-weight:600;color:var(--k${H.cidx(id)})">${esc(c.label)}</span><span class="num muted">${Math.round(sw.current)}%</span></div>
        <div class="strip-bar">${runs}<span class="marker" style="left:calc(${sw.current}% - 1px)"></span></div><div class="strip-cap">${cap}</div></div>`;
    }).join('');
  };

  R.renderResult = () => {
    const el = document.getElementById('result-inner'); if (!el) return;
    const m = S.model, res = S.result;
    const before = {};
    el.querySelectorAll('[data-row-id]').forEach(x => { before[x.dataset.rowId] = x.getBoundingClientRect().top; });
    let h;
    if (!m.rows.length) h = '<p class="empty">Add some options in Data.</p><button class="btn" data-action="set-view" data-v="data">Open Data</button>';
    else if (!m.criteria.length) h = '<div class="equation"><span class="eq-lhs">Score</span><span class="eq-op">=</span><span class="chip rules">Rules</span><span class="eq-op">× ( … ) × 100</span></div><p class="lead">Add a criterion to start scoring.</p><button class="btn primary" data-action="add-criterion">Add a criterion</button>';
    else {
      h = `<div class="hero card">${equationHTML()}${leadHTML()}</div>`;
      if (res.total === 0 && res.used.length) h += '<p class="lead" style="color:var(--bad-k)">Give at least one criterion some weight.</p>';
      h += figuresHTML();
      h += `<div class="block card pad" id="analysis-gaps">${R.gapsHTML()}</div>`;
      h += rankingHTML();
      h += `<div class="block" id="analysis-day">${R.dayHTML ? R.dayHTML() : ''}</div>`;
      h += `<div class="block" id="analysis-scen">${R.scenariosHTML()}</div>`;
      h += `<div class="block" id="analysis-stress">${R.stressHTML()}</div>`;
      h += `<div class="block" id="analysis-flips">${R.flipsHTML()}</div>`;
      h += `<div class="block" id="analysis-robust">${R.robustHTML()}</div>`;
    }
    el.innerHTML = h;
    if (!H.reduced()) el.querySelectorAll('[data-row-id]').forEach(x => {
      const o = before[x.dataset.rowId]; if (o == null) return;
      const d = o - x.getBoundingClientRect().top; if (Math.abs(d) < 1) return;
      x.style.transition = 'none'; x.style.transform = `translateY(${d}px)`; void x.offsetHeight;
      x.style.transition = 'transform var(--t-med) var(--ease)'; x.style.transform = '';
    });
  };
})(window.M);
