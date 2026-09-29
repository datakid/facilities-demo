window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, R = M.render, P = M.plan, fmt = H.fmt, fmtN = H.fmtN, U = M.util;
  R.modals = R.modals || {};
  R.inspectors = R.inspectors || {};
  const ui = fn => { fn(S.ui); R.all(); };
  const nextId = (list, pre) => { const ids = new Set(list.map(x => x.id)); let n = 1; while (ids.has(pre + n)) n++; return pre + n; };
  const seg = (action, cur, opts, disabled) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-action="${action}" data-v="${v}" aria-pressed="${cur === v}" ${disabled && disabled.includes(v) ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;

  function palette() {
    return id => { const n = id ? H.rowColor(id) : 0; return n ? { t: `var(--t${n})`, k: `var(--k${n})`, c: `var(--c${n})` } : { t: 'var(--bad-t)', k: 'var(--bad-k)', c: 'var(--bad)' }; };
  }

  R.dayHTML = () => {
    const m = S.model, D = m.day && H.param(m.day.knob) ? S.day : null;
    if (!D) return m.params.length ? `<h2>Day plan <span class="h-sub">hour by hour</span></h2><div class="card pad day-empty"><p class="help">Describe how a knob such as arrivals changes through the day, and see which option is best in each hour, where you should switch, and which single plan holds up all day.</p><button class="btn" data-action="open-day">Set up a day</button></div>` : '';
    const k = H.param(m.day.knob), col = palette(D.hours.map(h => h.winner));
    const max = Math.max(...D.hours.map(h => h.v), 1e-9), bmax = Math.max(...D.hours.map(h => h.after), 1);
    const cells = D.hours.map((h, i) => {
      const c = col(h.winner), nm = (h.winner ? H.rowLabel(h.winner) : 'No option passes') + (h.best && h.best !== h.winner ? ` (${H.rowLabel(h.best)} is ${fmt(h.res.byId[h.best].score - h.score, 1)} higher, below the switch threshold)` : '');
      return `<button class="hour ${h.winner ? '' : 'none'}" data-key="hr:${i}" data-action="apply-hour" data-i="${i}" style="--hc:${c.c};--ht:${c.t}" title="${esc(h.label)}–${esc(h.end)} · ${esc(k.label)} ${esc(fmtN(h.v))} · ${esc(nm)}${h.winner ? ' ' + fmt(h.score, 1) : ''}${D.carry ? ` · ${fmtN(+h.start.toFixed(1))} waiting at start, ${fmtN(+h.after.toFixed(1))} at end` : ''}">
        <span class="hour-col"><span class="hour-bar" style="height:${Math.max(8, h.v / max * 100)}%"></span>${D.carry && h.after > 0.5 ? `<span class="hour-back" style="height:${Math.min(100, h.after / bmax * 45)}%"></span>` : ''}</span><span class="hour-t num">${esc(h.label.slice(0, 2))}</span></button>`;
    }).join('');
    const segs = D.segs.map(s => {
      const c = col(s.winner);
      return `<li data-key="ds:${esc(s.from.id)}"><span class="sw" style="background:${c.c}"></span><span class="num seg-time">${esc(s.from.label)}–${esc(s.to.end)}</span><span class="seg-name">${s.winner ? esc(H.rowLabel(s.winner)) : '<span class="bad-text">No option passes</span>'}</span>${s.winner ? `<span class="num faint">${fmt(s.sum / s.n, 1)}</span>` : ''}</li>`;
    }).join('');
    const st = D.steady;
    const sum = st ? `If you keep one plan all day, <b>${esc(st.label)}</b> holds up best: its weakest hour (${esc(st.worstLabel)}) still scores <span class="num">${fmt(st.worst, 1)}</span>, average <span class="num">${fmt(st.avg, 1)}</span>.`
      : `No single option passes every hour. ${D.average ? `<b>${esc(D.average.label)}</b> has the best average (<span class="num">${fmt(D.average.avg, 1)}</span>) but fails at ${esc(D.average.worstLabel)}.` : ''} Try <b>Find plans</b> to search for one that does.`;
    return `<h2>Day plan <span class="h-sub">${esc(k.label)} by hour, switching for more than ${fmtN(m.day.sticky ?? 3)} points${m.day.link && H.param(m.day.link.knob) ? ', ' + esc(H.param(m.day.link.knob).label.toLowerCase()) + ' follows it' : ''} · ${D.switches > 0 ? D.switches + ' switch' + (D.switches > 1 ? 'es' : '') : 'one plan all day'}</span>
      <span class="h-actions"><button class="link" data-action="open-day">Edit</button><button class="link" data-action="day-to-scen">As scenarios</button></span></h2>
      <div class="card pad"><div class="day-strip" role="group" aria-label="Best option per hour. Click an hour to apply its knobs.">${cells}</div>
      ${D.carry ? `<p class="day-carry"><span class="sw carry-sw"></span>Striped: people still waiting at the end of the hour, carried into the next. ${D.closing > 0.5 ? `<b class="num">${fmtN(+D.closing.toFixed(1))}</b> still waiting at closing.` : 'The line is clear at closing.'}</p>` : ''}
      <ul class="day-segs">${segs}</ul><p class="day-sum">${sum}</p>
      <div class="day-actions"><button class="btn" data-action="open-finder" data-over="day" data-how="worst">Find a plan for the whole day</button></div></div>`;
  };

  function dayDraft() {
    const m = S.model, d = m.day, k = d ? H.param(d.knob) : (m.params.find(p => /lam|arriv|per hour|users|rps/i.test(p.id + ' ' + p.label)) || m.params[0]);
    const vals = d ? d.values : P.shape('two', 12, +k.min + (k.max - k.min) * 0.2, +k.value * 1.1, +k.step);
    return { knob: k.id, start: d ? d.start : 8, n: vals.length, shape: 'two', lo: Math.min(...vals), hi: Math.max(...vals), text: vals.join(', '),
      link: d && d.link ? d.link.knob : '', llo: d && d.link ? d.link.lo : 0, lhi: d && d.link ? d.link.hi : 1, sticky: d && d.sticky != null ? d.sticky : 3,
      cknob: d && d.carry ? d.carry.knob : '', ccalc: d && d.carry ? d.carry.calc : '' };
  }
  R.modals.day = () => {
    const D = S.ui.dayEdit, m = S.model;
    const opt = (id, sel) => m.params.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.label)}${p.unit ? ' (' + esc(p.unit) + ')' : ''}</option>`).join('');
    const n = P.parseList({ type: 'number' }, D.text).length;
    return `<div class="scrim" data-action="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="day-title">
      <div class="modal-head"><div><span class="kicker">Day plan</span><h3 id="day-title">How the day unfolds</h3></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${R.ICON.close}</button></div>
      <div class="field two"><label for="dy-knob">Knob that changes by hour<select id="dy-knob" data-pin="d-knob">${opt('', D.knob)}</select></label>
        <label>First hour <input type="number" min="0" max="23" step="1" data-pin="d-start" value="${D.start}"></label></div>
      <div class="field"><span class="lab">Fill from a shape</span>${seg('day-shape', D.shape, Object.entries(P.SHAPES).map(([k, s]) => [k, s.label]))}
        <div class="range-row fill-row"><label>Hours <input type="number" min="1" max="24" step="1" data-pin="d-n" value="${D.n}"></label><label>Low <input type="number" step="any" data-pin="d-lo" value="${D.lo}"></label><label>High <input type="number" step="any" data-pin="d-hi" value="${D.hi}"></label>
        <button class="btn" data-action="day-fill">Fill</button></div></div>
      <div class="field"><label for="dy-vals">Value for each hour</label><textarea id="dy-vals" rows="2" data-pin="d-text" spellcheck="false">${esc(D.text)}</textarea>
        <p class="help"><span id="dy-count">${n}</span> hours, starting at ${esc(P.hh(D.start))}. Separate values with commas.</p></div>
      <div class="field two"><label for="dy-link">Another knob that follows it<select id="dy-link" data-pin="d-link"><option value="">None</option>${opt('', D.link)}</select></label>
        <div class="range-row link-row"><label>At the quietest <input type="number" step="any" data-pin="d-llo" value="${D.llo}" ${D.link ? '' : 'disabled'}></label><label>At the busiest <input type="number" step="any" data-pin="d-lhi" value="${D.lhi}" ${D.link ? '' : 'disabled'}></label></div></div>
      <p class="help">For example, pressure goes from 0.1 in the quietest hour to 0.9 in the busiest, in step with arrivals.</p>
      <div class="field"><label>Only switch plans for a gain of more than <input type="number" min="0" max="50" step="0.5" data-pin="d-sticky" value="${D.sticky}" class="inline-num"> points</label>
        <p class="help">Changing who does what mid-shift has a cost. Small gains are ignored so the timeline doesn't flicker between near-ties.</p></div>
      <div class="field two"><label for="dy-ccalc">Carry into the next hour<select id="dy-ccalc" data-pin="d-ccalc"><option value="">Nothing, hours are independent</option>${m.calcs.map(c => `<option value="${esc(c.id)}" ${c.id === D.ccalc ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
        <label for="dy-cknob">as the knob<select id="dy-cknob" data-pin="d-cknob"><option value="">Choose…</option>${opt('', D.cknob)}</select></label></div>
      <p class="help">For example, the people still waiting at the end of one hour become the backlog of the next, so a rush spills over instead of vanishing.</p>
      <div class="modal-actions">${m.day ? '<button class="btn danger-ghost" data-action="day-remove">Remove day plan</button><span class="spacer"></span>' : ''}<button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="day-save">Save day plan</button></div></div></div>`;
  };

  function finderDraft(over, how) {
    const m = S.model, F = { on: {}, text: {}, base: (m.rows[0] || {}).id, over: over || (m.day ? 'day' : m.scenarios.length ? 'scenarios' : 'now'), how: how || 'avg', keep: 5, method: 'auto', result: null, added: {}, busy: false, progress: null };
    m.columns.forEach(c => {
      const ch = P.choicesFor(m, c);
      F.text[c.id] = ch.map(P.valText).join(', ');
      F.on[c.id] = !!(c.choices && c.choices.length);
    });
    if (!Object.values(F.on).some(Boolean)) { const c = m.columns.find(x => x.type !== 'number') || m.columns[0]; if (c) F.on[c.id] = true; }
    return F;
  }
  function finderSpec() {
    const F = S.ui.finder, vary = {};
    S.model.columns.forEach(c => { if (F.on[c.id]) vary[c.id] = P.parseList(c, F.text[c.id]); });
    return { vary, base: F.base, over: F.over, how: F.how, keep: F.keep, method: F.method === 'search' ? 'search' : 'auto' };
  }
  function estimate() {
    const sp = finderSpec(), X = P.prep(S.model, sp), runs = X.runs.length;
    const how = X.exhaustive ? 'every one is tried' : `step-by-step search, up to <b class="num">${X.maxEval.toLocaleString('en-US')}</b> checked`;
    return `<span><b class="num">${X.total.toLocaleString('en-US')}</b> combination${X.total === 1 ? '' : 's'} × <b class="num">${runs}</b> ${runs > 1 ? (sp.over === 'day' ? 'hours' : 'scenarios') : 'run'}${X.runs.carry ? ' with carry-over' : ''} · ${how}</span>`;
  }
  let worker = null, workerOk = typeof Worker !== 'undefined' && location.protocol !== 'file:', job = 0;
  function runFinder(spec, done, onProg) {
    const model = JSON.parse(JSON.stringify(S.model)), id = ++job;
    const local = () => setTimeout(() => { if (id === job) done(P.generate(model, spec)); }, 30);
    if (!workerOk) return local();
    try {
      if (!worker) worker = new Worker('js/core/plan-worker.js');
      worker.onmessage = e => { if (id !== job) return; if (e.data.progress) onProg(e.data.progress); else done(e.data.done); };
      worker.onerror = e => { e.preventDefault(); workerOk = false; worker = null; local(); };
      worker.postMessage({ model, spec });
    } catch (err) { workerOk = false; worker = null; local(); }
  }
  M.plan.warm = () => { if (workerOk && !worker) try { worker = new Worker('js/core/plan-worker.js'); } catch (err) { workerOk = false; } };
  function progressHTML() {
    const p = S.ui.finder.progress;
    if (!p) return '<p class="help">Searching…</p>';
    return `<div class="fnd-prog"><div class="fnd-bar"><span style="width:${Math.min(100, p.evals / p.max * 100).toFixed(1)}%"></span></div>
      <p class="help">Checked <b class="num">${p.evals.toLocaleString('en-US')}</b> plans. Best so far: <b>${esc(p.label || '—')}</b> <span class="num">${fmt(p.best, 1)}</span></p></div>`;
  }
  function resultHTML() {
    const F = S.ui.finder, X = F.result; if (F.busy) return progressHTML();
    if (!X) return '';
    if (X.error) return `<p class="err">${esc(X.error)}</p>`;
    const judged = X.how === 'worst' ? 'weakest ' + (X.runs > 1 ? X.runLabel.replace(/s$/, '') : 'run') : 'average';
    const row = (r, i, mine) => `<tr class="${mine ? 'mine' : ''}"><td class="num faint">${mine ? '—' : i + 1}</td><td class="fr-name">${esc(r.label)}</td><td class="num">${fmt(r.score, 1)}</td>
      ${X.runs > 1 ? `<td class="num faint">${r.pass}/${X.runs}</td><td class="faint">${r.worst > 0 ? fmt(r.worst, 1) : '<span class="bad-text">0</span>'}${r.worstRun ? ' · ' + esc(r.worstRun) : ''}</td>` : ''}
      <td>${mine ? '<span class="tag">yours</span>' : F.added[r.id] ? '<span class="tag ok-tag">added</span>' : `<button class="btn small" data-action="finder-add" data-id="${esc(r.id)}">Add</button>`}</td></tr>`;
    const beats = X.mine && X.top[0] && X.top[0].score > X.mine.score + 0.05;
    const meta = X.method === 'search'
      ? `Searched step by step: <b class="num">${X.tried.toLocaleString('en-US')}</b> of <b class="num">${X.total.toLocaleString('en-US')}</b> combinations checked from <b class="num">${X.starts}</b> starting points in <span class="num">${(X.ms / 1000).toFixed(1)} s</span>${X.timedOut ? ' (time limit reached)' : ''}. The best plan is very likely, but not guaranteed, to be the best overall.`
      : `Tried all <b class="num">${X.tried.toLocaleString('en-US')}</b> new combinations in <span class="num">${(X.ms / 1000).toFixed(1)} s</span>.`;
    return `<p class="fr-meta">${meta} <b class="num">${X.passing.toLocaleString('en-US')}</b> passed. Ranked by ${judged} score${X.carry ? ', with the queue carried from hour to hour' : ''}.</p>
      ${X.top.length ? `<div class="fr-wrap"><table class="fr-table"><thead><tr><th></th><th>Plan</th><th>Score</th>${X.runs > 1 ? '<th>Passes</th><th>Weakest</th>' : ''}<th></th></tr></thead><tbody>
        ${X.top.map((r, i) => row(r, i)).join('')}${X.mine ? row(X.mine, 0, true) : ''}</tbody></table></div>
        <p class="help">${beats ? `The best new plan beats your best current option (<b>${esc(X.mine.label)}</b>) by <span class="num">${fmt(X.top[0].score - X.mine.score, 1)}</span> points.` : X.mine ? `None beats your best current option, <b>${esc(X.mine.label)}</b>. Your list already holds the best plan.` : ''}</p>
        <div class="modal-actions"><button class="btn primary" data-action="finder-add-all">Add all ${X.top.filter(r => !F.added[r.id]).length} as options</button></div>`
        : '<p class="help">No new combination passes the rules. Allow more values, or loosen a rule.</p>'}`;
  }
  R.modals.finder = () => {
    const F = S.ui.finder, m = S.model;
    const cols = m.columns.map(c => `<div class="fnd-col ${F.on[c.id] ? 'on' : ''}"><label class="check"><input type="checkbox" data-pin="f-on" data-id="${esc(c.id)}" ${F.on[c.id] ? 'checked' : ''}> ${esc(c.label)}</label>
      <input type="text" class="mono" data-pin="f-vals" data-id="${esc(c.id)}" value="${esc(F.text[c.id])}" ${F.on[c.id] ? '' : 'disabled'} aria-label="Values to try for ${esc(c.label)}"></div>`).join('');
    const base = m.rows.map(r => `<option value="${esc(r.id)}" ${r.id === F.base ? 'selected' : ''}>${esc(r.label)}</option>`).join('');
    const off = [...(m.scenarios.length ? [] : ['scenarios']), ...(m.day ? [] : ['day'])];
    return `<div class="scrim" data-action="scrim"><div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="fnd-title">
      <div class="modal-head"><div><span class="kicker">Plan finder</span><h3 id="fnd-title">Find the best plan</h3></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${R.ICON.close}</button></div>
      <p class="help fnd-intro">Tick the columns to vary and list the values to try. Every combination is scored with your full equation. Small spaces are tried in full. Large ones (millions of combinations) are searched step by step: start from your plans and random ones, and keep changing one column at a time while the score improves. The best plans can be added as options.</p>
      <div class="fnd-cols">${cols}</div>
      <div class="fnd-opts">
        <div class="field"><span class="lab">Judge on</span>${seg('finder-over', F.over, [['now', 'Current knobs'], ['scenarios', 'Every scenario'], ['day', 'Every hour']], off)}</div>
        <div class="field"><span class="lab">Rank by</span>${seg('finder-how', F.how, [['avg', 'Average'], ['worst', 'Worst case']])}</div>
        <div class="field"><label for="fnd-base">Other columns from</label><select id="fnd-base" data-pin="f-base">${base}</select></div>
        <div class="field"><span class="lab">Method</span>${seg('finder-method', F.method, [['auto', 'Automatic'], ['search', 'Always search']])}</div>
        <div class="field keep"><label>Keep top <input type="number" min="1" max="12" step="1" data-pin="f-keep" value="${F.keep}"></label></div></div>
      <div class="fnd-run"><span id="finder-est">${estimate()}</span><button class="btn primary" data-action="finder-run" ${F.busy ? 'disabled' : ''}>Find plans</button></div>
      <div id="finder-result">${resultHTML()}</div></div></div>`;
  };

  const spread = p => { const b = +p.base, lo = +p.min, hi = +p.max, st = +p.step || 1, r = v => +(Math.round(v / st) * st).toFixed(6); return [...new Set([r(lo + (b - lo) * 0.5), r(b), r(b + (hi - b) * 0.5)])]; };
  function scenDraft() {
    const m = S.model, I = S.impact, pick = (I && I.list[0] && H.param(I.list[0].id)) || (m.day && H.param(m.day.knob)) || m.params[0];
    return { axes: [{ knob: pick.id, text: spread(pick).join(', ') }], mode: 'add' };
  }
  function scenGrid() {
    const B = S.ui.scenBuild;
    return P.grid(S.model, B.axes.map(a => ({ knob: a.knob, values: P.parseList({ type: 'number' }, a.text) })));
  }
  R.modals.scenbuild = () => {
    const B = S.ui.scenBuild, m = S.model, g = scenGrid(), room = H.LIMIT.scenarios - (B.mode === 'add' ? m.scenarios.length : 0);
    const opt = sel => m.params.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
    const axes = B.axes.map((a, i) => { const p = H.param(a.knob); return `<div class="axis" data-key="ax:${i}"><select data-pin="s-knob" data-i="${i}" aria-label="Knob ${i + 1}">${opt(a.knob)}</select>
      <input type="text" class="mono" data-pin="s-vals" data-i="${i}" value="${esc(a.text)}" aria-label="Values for knob ${i + 1}" placeholder="10, 20, 30">
      ${B.axes.length > 1 ? `<button class="x" data-action="scen-axis-rm" data-i="${i}" aria-label="Remove knob">×</button>` : '<span></span>'}
      ${p ? `<div class="ax-q"><span class="faint">range ${fmtN(+p.min)}–${fmtN(+p.max)}${p.unit ? ' ' + esc(p.unit) : ''} · now ${fmtN(+p.base)}</span><button class="link" data-action="ax-fill" data-i="${i}" data-v="lmh">low · base · high</button><button class="link" data-action="ax-fill" data-i="${i}" data-v="ends">min · max</button><button class="link" data-action="ax-fill" data-i="${i}" data-v="five">5 steps</button></div>` : ''}</div>`; }).join('');
    const peek = g.slice(0, 12).map(s => { const r = M.engine.compute(m, { P: Object.assign(H.scenValues(null), s.values) }), w = r.ranked[0]; return `<li><span>${esc(s.label)}</span><span class="sbp-w">${w ? `<i class="sw" style="background:var(--c${H.rowColor(w)})"></i>${esc(r.byId[w].label)} <span class="num faint">${fmt(r.byId[w].score, 0)}</span>` : '<span class="bad-text">none pass</span>'}</span></li>`; }).join('');
    return `<div class="scrim" data-action="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="sb-title">
      <div class="modal-head"><div><span class="kicker">Scenario builder</span><h3 id="sb-title">Build scenarios from knob values</h3></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${R.ICON.close}</button></div>
      <p class="help">Pick up to three knobs and the values to try. Every combination becomes a scenario. Knobs you don't list keep their baseline value.</p>
      <div class="axes">${axes}</div>${B.axes.length < 3 ? '<button class="link" data-action="scen-axis-add">Add a knob</button>' : ''}
      <div class="field sb-mode"><span class="lab">Existing scenarios</span>${seg('scen-mode', B.mode, [['add', 'Keep and add'], ['replace', 'Replace']])}</div>
      <div class="sb-preview"><b class="num">${g.length}</b> scenario${g.length === 1 ? '' : 's'}, with the leader of each${g.length > room ? ` <span class="bad-text">· only ${Math.max(0, room)} fit (limit ${H.LIMIT.scenarios})</span>` : ''}<ul class="sbp">${peek}${g.length > 12 ? `<li class="faint">and ${g.length - 12} more</li>` : ''}</ul></div>
      <div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="scen-build" ${g.length && g.length <= room ? '' : 'disabled'}>Create ${g.length} scenario${g.length === 1 ? '' : 's'}</button></div></div></div>`;
  };

  R.inspectors.scenario = id => {
    const s = S.model.scenarios.find(x => x.id === id), m = S.model, on = m.active === id;
    const keys = Object.keys(s.values || {}).filter(k => H.param(k));
    const r = (S.live || []).find(x => !x.now && x.id === id) || (S.scen || []).find(x => x.id === id);
    const b = (S.live || []).find(x => !x.now && x.id === '');
    let h = '';
    if (r) {
      const w = r.winner, bw = b && b.winner, d = w && b && b.res.byId[w] ? r.res.byId[w].score - b.res.byId[w].score : null;
      h += `<div class="calc-hero"><span class="muted">Leader</span><span class="big-score scen-big">${w ? esc(r.res.byId[w].label) : 'No option passes'}</span>${w ? `<span class="note"><span class="num">${fmt(r.score, 1)}</span>${d != null ? ' ' + R.delta(d) + ' vs baseline' : ''} · ${r.left} of ${m.rows.length} pass${bw && bw !== w ? ` · baseline leader: ${esc(H.rowLabel(bw))}` : ''}</span>` : ''}</div>`;
    }
    h += `<div class="insp-actions top">${on ? '<span class="tag ok-tag">In use</span>' : `<button class="btn primary" data-action="use-scen" data-id="${esc(id)}">Use this scenario</button>`}<button class="btn" data-action="scen-dup" data-id="${esc(id)}">Duplicate</button>
      <button class="btn danger-ghost" data-action="remove-scenario" data-id="${esc(id)}">Remove</button></div>`;
    h += `<div class="field"><label for="si-label">Name</label><input id="si-label" type="text" data-pin="sc-label" data-id="${esc(id)}" value="${esc(s.label)}"></div>`;
    h += `<div class="field"><span class="lab">Differs from baseline in</span>${keys.length ? keys.map(k => { const p = H.param(k); return `<div class="sv-row" data-key="sv:${esc(k)}"><span class="ellipsis" title="${esc(p.group)}">${esc(p.label)}</span>
      <span class="faint num sv-base">${esc(fmtN(+p.base))} →</span><input type="text" inputmode="decimal" class="num" data-pin="sc-val" data-id="${esc(id)}" data-k="${esc(k)}" value="${esc(fmtN(+s.values[k]))}" aria-label="${esc(p.label)}"><span class="faint sv-unit">${esc(p.unit)}</span>
      <button class="x" data-action="scen-key-rm" data-id="${esc(id)}" data-k="${esc(k)}" aria-label="Use the baseline for ${esc(p.label)}">×</button></div>`; }).join('') : '<p class="help">Nothing yet: it matches the baseline.</p>'}
      <p class="help">${on ? 'This scenario is in use. Move any knob on the left, then press Update to store it here.' : 'Use it to edit with the sliders, or type values here.'}</p></div>`;
    const free = m.params.filter(p => !keys.includes(p.id));
    if (free.length) h += `<div class="field"><label for="si-add">Also set</label><select id="si-add" data-pin="sc-add" data-id="${esc(id)}"><option value="">Choose a knob…</option>${free.map(p => `<option value="${esc(p.id)}">${esc(p.label)} (${esc(p.group)})</option>`).join('')}</select></div>`;
    return { title: s.label, kicker: on ? 'Scenario · in use' : 'Scenario', body: h };
  };

  const scen = id => S.model.scenarios.find(x => x.id === id);
  const PIN = {
    'f-on': el => { S.ui.finder.on[el.dataset.id] = el.checked; R.all(); },
    'f-vals': el => { S.ui.finder.text[el.dataset.id] = el.value; },
    'f-base': el => { S.ui.finder.base = el.value; },
    'f-keep': el => { S.ui.finder.keep = U.clamp(Math.round(+el.value) || 5, 1, 12); },
    'd-knob': el => { const D = S.ui.dayEdit, p = H.param(el.value); D.knob = el.value; D.lo = +(+p.min + (p.max - p.min) * 0.2).toFixed(4); D.hi = +p.value; R.all(); },
    'd-start': el => { S.ui.dayEdit.start = U.clamp(Math.round(+el.value) || 0, 0, 23); },
    'd-n': el => { S.ui.dayEdit.n = U.clamp(Math.round(+el.value) || 1, 1, 24); },
    'd-lo': el => { S.ui.dayEdit.lo = +el.value; }, 'd-hi': el => { S.ui.dayEdit.hi = +el.value; },
    'd-text': el => { S.ui.dayEdit.text = el.value; const c = document.getElementById('dy-count'); if (c) c.textContent = P.parseList({ type: 'number' }, el.value).length; },
    'd-link': el => { const D = S.ui.dayEdit, p = H.param(el.value); D.link = el.value; if (p) { D.llo = +p.min; D.lhi = +p.max; } R.all(); },
    'd-sticky': el => { S.ui.dayEdit.sticky = U.clamp(+el.value || 0, 0, 50); },
    'd-ccalc': el => { S.ui.dayEdit.ccalc = el.value; }, 'd-cknob': el => { S.ui.dayEdit.cknob = el.value; },
    'd-llo': el => { S.ui.dayEdit.llo = +el.value; }, 'd-lhi': el => { S.ui.dayEdit.lhi = +el.value; },
    's-knob': el => { const a = S.ui.scenBuild.axes[+el.dataset.i], p = H.param(el.value); a.knob = el.value; a.text = spread(p).join(', '); R.all(); },
    's-vals': el => { S.ui.scenBuild.axes[+el.dataset.i].text = el.value; },
    'sc-label': el => M.commit('Rename scenario', m => { m.scenarios.find(x => x.id === el.dataset.id).label = el.value.trim() || 'Scenario'; }),
    'sc-val': el => {
      const v = parseFloat(String(el.value).replace(/,/g, '')); if (!isFinite(v)) return R.all();
      M.commit('Scenario value', m => { const s = m.scenarios.find(x => x.id === el.dataset.id), p = m.params.find(x => x.id === el.dataset.k); s.values[el.dataset.k] = v; if (p) H.fit(p, v); if (m.active === s.id && p) p.value = v; });
    },
    'sc-add': el => {
      if (!el.value) return; const p = H.param(el.value);
      const st = +p.step || 1, v = +((+p.base + (+p.base + st <= +p.max ? st : -st)).toFixed(6));
      M.commit('Scenario knob', m => { const s = m.scenarios.find(x => x.id === el.dataset.id); s.values = s.values || {}; s.values[p.id] = v; if (m.active === s.id) m.params.find(x => x.id === p.id).value = v; });
    }
  };
  const LIVE = new Set(['f-vals', 'd-text', 's-vals']);
  document.addEventListener('input', e => {
    const el = e.target, k = el.dataset && el.dataset.pin; if (!k || !LIVE.has(k)) return;
    PIN[k](el);
    if (k === 'f-vals') { const x = document.getElementById('finder-est'); if (x) x.innerHTML = estimate(); }
  });
  document.addEventListener('change', e => {
    const el = e.target, k = el.dataset && el.dataset.pin; if (!k || !PIN[k]) return;
    PIN[k](el);
    if (k === 's-vals' || k === 'f-keep') R.all();
    if (k === 'f-vals' || k === 'f-base') { const x = document.getElementById('finder-est'); if (x) x.innerHTML = estimate(); }
  });

  const addRows = rs => {
    if (S.model.rows.length + rs.length > H.LIMIT.rows) { H.toast('Up to 1000 options'); return; }
    M.commit('Add plans', m => { rs.forEach(r => { const id = nextId(m.rows, 'r'); m.rows.push({ id, label: r.label, v: structuredClone(r.v) }); }); });
    rs.forEach(r => { S.ui.finder.added[r.id] = true; });
    R.all(); H.toastUndo(rs.length > 1 ? `Added ${rs.length} plans as options` : `Added ${rs[0].label}`);
  };
  Object.assign(M.app.actions, {
    'open-finder': el => ui(u => { M.plan.warm(); const over = el && el.dataset.over, how = el && el.dataset.how; if (!u.finder || over) u.finder = finderDraft(over, how); u.finder.result = null; u.modal = 'finder'; }),
    'finder-over': el => ui(u => { u.finder.over = el.dataset.v; u.finder.result = null; }),
    'finder-how': el => ui(u => { u.finder.how = el.dataset.v; u.finder.result = null; }),
    'finder-method': el => ui(u => { u.finder.method = el.dataset.v; u.finder.result = null; }),
    'finder-run': () => {
      const F = S.ui.finder, spec = finderSpec();
      F.busy = true; F.added = {}; F.progress = null; F.result = null; R.all();
      runFinder(spec, res => { F.result = res; F.busy = false; F.progress = null; if (S.ui.modal === 'finder') R.all(); },
        p => { F.progress = p; const el = document.getElementById('finder-result'); if (el && F.busy) el.innerHTML = progressHTML(); });
    },
    'finder-add': (el, id) => { const r = S.ui.finder.result.top.find(x => x.id === id); if (r) addRows([r]); },
    'finder-add-all': () => { const rs = S.ui.finder.result.top.filter(r => !S.ui.finder.added[r.id]); if (rs.length) addRows(rs); },
    'open-day': () => { if (!S.model.params.length) return H.toast('Add a knob first'); ui(u => { u.dayEdit = dayDraft(); u.modal = 'day'; }); },
    'day-shape': el => ui(u => { u.dayEdit.shape = el.dataset.v; }),
    'day-fill': () => {
      const D = S.ui.dayEdit, p = H.param(D.knob);
      D.text = P.shape(D.shape, D.n, D.lo, D.hi, +p.step).join(', '); R.all();
    },
    'day-save': () => {
      const D = S.ui.dayEdit, values = P.parseList({ type: 'number' }, D.text).slice(0, 24);
      if (!values.length) return H.toast('Enter at least one value');
      M.commit('Day plan', m => { m.day = { knob: D.knob, start: D.start, values, link: D.link && D.link !== D.knob ? { knob: D.link, lo: +D.llo, hi: +D.lhi } : null, sticky: +D.sticky,
        carry: D.ccalc && D.cknob && D.cknob !== D.knob ? { knob: D.cknob, calc: D.ccalc } : null }; });
      ui(u => { u.modal = null; u.dayEdit = null; }); H.toastUndo('Saved the day plan');
    },
    'day-remove': () => { M.commit('Remove day', m => { m.day = null; }); ui(u => { u.modal = null; }); H.toastUndo('Removed the day plan'); },
    'apply-hour': el => {
      const h = S.day && S.day.hours[+el.dataset.i]; if (!h) return;
      M.commit('Apply hour', m => { Object.entries(h.values).forEach(([k, v]) => H.setKnob(m, k, +v)); });
      H.toastUndo(`Knobs set to ${h.label}. Save as new to keep it`);
    },
    'day-to-scen': () => {
      const runs = P.dayRuns(S.model);
      if (runs.length > H.LIMIT.scenarios) return H.toast(`Up to ${H.LIMIT.scenarios} scenarios`);
      M.commit('Hours as scenarios', m => { m.scenarios = runs.map((r, i) => ({ id: 's' + (i + 1), label: `${r.label}–${r.end}`, values: r.values })); H.useScenario(m, null); });
      H.toastUndo(`Replaced scenarios with ${runs.length} hours`);
    },
    'ax-fill': el => ui(u => {
      const a = u.scenBuild.axes[+el.dataset.i], p = H.param(a.knob); if (!p) return;
      const st = +p.step || 1, r = v => +(Math.round(v / st) * st).toFixed(6), lo = +p.min, hi = +p.max;
      a.text = (el.dataset.v === 'ends' ? [lo, hi] : el.dataset.v === 'five' ? [0, 0.25, 0.5, 0.75, 1].map(t => r(lo + t * (hi - lo))) : spread(p)).filter((v, i, x) => x.indexOf(v) === i).join(', ');
    }),
    'open-scen-build': () => { if (!S.model.params.length) return H.toast('Add a knob first'); ui(u => { u.scenBuild = scenDraft(); u.modal = 'scenbuild'; }); },
    'scen-axis-add': () => ui(u => {
      const used = u.scenBuild.axes.map(a => a.knob), I = S.impact;
      const p = (I && I.list.map(x => H.param(x.id)).find(x => x && !used.includes(x.id))) || S.model.params.find(x => !used.includes(x.id)) || S.model.params[0];
      u.scenBuild.axes.push({ knob: p.id, text: spread(p).join(', ') });
    }),
    'scen-axis-rm': el => ui(u => { u.scenBuild.axes.splice(+el.dataset.i, 1); }),
    'scen-mode': el => ui(u => { u.scenBuild.mode = el.dataset.v; }),
    'scen-build': () => {
      const g = scenGrid(), mode = S.ui.scenBuild.mode;
      M.commit('Build scenarios', m => {
        if (mode === 'replace') m.scenarios = [];
        g.forEach(s => { m.scenarios.push({ id: nextId(m.scenarios, 's'), label: s.label, values: s.values }); });
      });
      ui(u => { u.modal = null; u.scenBuild = null; }); H.toastUndo(`Created ${g.length} scenario${g.length > 1 ? 's' : ''}`);
    },
    'scen-key-rm': el => M.commit('Scenario knob', m => { const s = m.scenarios.find(x => x.id === el.dataset.id); delete s.values[el.dataset.k]; if (m.active === s.id) { const p = m.params.find(x => x.id === el.dataset.k); if (p) p.value = +p.base; } }),
    'scen-dup': (el, id) => {
      if (S.model.scenarios.length >= H.LIMIT.scenarios) return H.toast(`Up to ${H.LIMIT.scenarios} scenarios`);
      const s = scen(id), nid = nextId(S.model.scenarios, 's');
      M.commit('Duplicate scenario', m => { m.scenarios.push({ id: nid, label: s.label + ' (copy)', values: structuredClone(s.values || {}) }); H.useScenario(m, nid); });
      ui(u => { u.inspector = { kind: 'scenario', id: nid }; });
    }
  });
})(window.M);
