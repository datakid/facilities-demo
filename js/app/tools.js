window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, esc = U.esc, R = M.render, P = M.plan, ST = M.store, MD = M.model;
  R.extraModals = R.extraModals || {};
  const T = S.ui.tools = S.ui.tools || { find: null, found: null, pairA: '', pairB: '' };
  const rl = id => R.rowLabel(id);
  const dot = id => `<span class="rdot" style="--rc:var(--c${R.rowTone(id)})"></span>`;
  const valTxt = (cid, v) => H.val(cid, v);

  R.toolsHTML = () => {
    const m = S.model;
    const b = (act, title, line) => `<button class="tool" data-act="${act}"><b>${title}</b><span>${line}</span></button>`;
    return `<h3 class="checks-h">Go further</h3><div class="tool-grid">
      ${b('open-find', 'Find the best option', 'Try every combination of values, not just the options you typed.')}
      ${m.knobs.length ? b('open-matrix', 'Compare situations', 'Every option in every situation, and the safest all-round.') : ''}
      ${m.knobs.length ? b('open-day', m.day ? 'Edit the day plan' : 'Plan a day', 'Change a setting hour by hour and get a switching plan.') : ''}
      ${b('open-pairs', 'Teach it my taste', 'Say “I’d pick A over B” and it tunes the importances.')}</div>`;
  };

  R.dayHTML = () => {
    const m = S.model, D = S.day;
    if (!m.day || !D) return '';
    const k = H.knob(m.day.knob); if (!k) return '';
    const maxV = Math.max(...m.day.values, 1);
    const cells = D.hours.map((h, i) => {
      const p = D.plan[i], v = m.day.values[i], q = D.carry && p ? (h.res.byId[p].vals[m.day.carry.knob] || 0) : 0;
      return `<button class="hr${p ? '' : ' none'}" data-act="day-hour" data-v="${i}" style="--rc:${p ? `var(--c${R.rowTone(p)})` : 'var(--line-2)'};--h:${(v / maxV * 100).toFixed(1)}%" title="${esc(h.label)} · ${esc(k.label)} ${esc(U.withUnit(v, k.unit))} · ${esc(p ? rl(p) : 'nothing passes')}${q > 0.5 ? ` · ${U.fmtNum(q)} carried over` : ''}"><i></i>${q > 0.5 ? '<s></s>' : ''}<span>${esc(h.label.slice(0, 2))}</span></button>`;
    }).join('');
    const sw = D.switches.filter(s => s.row);
    const all = D.per.find(p => p.id === D.allDay);
    const endQ = D.carry && all ? all.endQueue : null;
    return `<div class="day-head"><h3>Day plan</h3><button class="link sm" data-act="open-day">Edit</button></div>
      <div class="day-strip" role="group" aria-label="Best option by hour">${cells}</div>
      <p class="day-line">${sw.length > 1 ? sw.slice(0, 4).map((s, i) => `${i ? 'switch to' : 'Start with'} <b>${esc(rl(s.row))}</b> ${i ? 'at ' + esc(s.at) : ''}`).join(', ') + (sw.length > 4 ? ` and ${sw.length - 4} more switches` : '') + '.' : sw.length ? `<b>${esc(rl(sw[0].row))}</b> is best all day.` : 'Nothing passes at any hour.'}</p>
      ${all && sw.length > 1 ? `<p class="hint">One plan for the whole day: ${dot(all.id)}<b>${esc(all.label)}</b>, average ${U.pts(all.avg)}${endQ != null ? `, ${U.fmtNum(endQ)} still waiting at closing` : ''}.</p>` : ''}`;
  };

  R.extraModals.matrix = () => {
    const mx = P.matrix(S.model, S.res.prep);
    const head = mx.cols.map((c, i) => `<th scope="col" class="${i === 0 ? 'mx-now' : ''}"><span>${esc(c.label)}</span></th>`).join('');
    const body = mx.rows.slice().sort((a, b) => b.avg - a.avg).map(r => `<tr class="${r.id === mx.safest ? 'safe' : ''}"><th scope="row">${dot(r.id)}${esc(r.label)}${r.id === mx.safest ? '<span class="tag ok">safest</span>' : ''}${r.id === mx.bestAvg && r.id !== mx.safest ? '<span class="tag">best average</span>' : ''}</th>
      ${r.cells.map((c, i) => `<td class="num${c.lead ? ' lead' : ''}${c.score == null ? ' out' : ''}${i === 0 ? ' mx-now' : ''}" style="--a:${c.score == null ? 0 : (c.score / 100).toFixed(2)}">${c.score == null ? 'out' : c.score.toFixed(0)}</td>`).join('')}
      <td class="num">${r.worst.toFixed(0)}</td><td class="num">${r.avg.toFixed(0)}</td><td class="num">${r.wins}</td></tr>`).join('');
    const safe = mx.rows.find(r => r.id === mx.safest);
    return `<header class="modal-head"><div><h2 id="modal-title" class="serif">Every option in every situation</h2><p class="muted">Scores out of 100. Bold is the winner of that situation. “Out” means a must-have fails there.</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${R.I.x}</button></header>
      ${safe ? `<p class="mx-sum">${dot(safe.id)}<b>${esc(safe.label)}</b> is the safest all-round choice: it never scores below ${safe.worst.toFixed(0)}${safe.wins ? ` and wins ${safe.wins} of ${mx.cols.length - 1}` : ''}.${mx.bestAvg && mx.bestAvg !== mx.safest ? ` ${esc(rl(mx.bestAvg))} has the best average but a worse worst case.` : ''}</p>` : '<p class="mx-sum">No option passes in every situation.</p>'}
      <div class="table-wrap mx-wrap"><table class="grid ro mx"><thead><tr><th scope="col">Option</th>${head}<th scope="col">Worst</th><th scope="col">Average</th><th scope="col">Wins</th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="hint" style="margin-top:10px">Worst, average and wins leave out “Now” and count only the saved situations and the baseline.</p>`;
  };

  function findSpec() {
    const m = S.model;
    if (!T.find || T.find.model !== m.name) {
      const from = (S.res.lead && S.res.lead.winner) || (m.rows[0] && m.rows[0].id);
      const cols = {}; m.columns.filter(c => !c.formula).forEach(c => { cols[c.id] = { on: false, vals: P.spaceFor(m, c.id) }; });
      const vary = m.columns.filter(c => !c.formula && new Set(m.rows.map(r => String(r.v[c.id]))).size > 1).slice(0, 4);
      vary.forEach(c => { cols[c.id].on = true; });
      T.find = { model: m.name, from, cols, judge: (m.scenarios || []).length ? 'situations' : 'now', agg: 'avg' };
      T.found = null;
    }
    return T.find;
  }
  const valsTxt = (c, vals) => vals.map(v => typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)).join(', ');
  const parseVals = (c, s) => String(s).split(',').map(x => x.trim()).filter(Boolean).map(x => c.type === 'number' ? U.parseNum(x) : c.type === 'yesno' ? /^(y|yes|true|1)$/i.test(x) : x).filter(x => x != null);

  R.extraModals.find = () => {
    const m = S.model, f = findSpec();
    const spec = {}; Object.entries(f.cols).forEach(([k, x]) => { if (x.on && x.vals.length) spec[k] = x.vals; });
    const { total } = P.product(spec);
    const nCtx = f.judge === 'situations' ? (m.scenarios || []).length : f.judge === 'day' ? (m.day ? m.day.values.length : 1) : 1;
    const runs = total * nCtx, full = total <= P.LIMIT.full && runs <= P.LIMIT.runs;
    const colRows = m.columns.filter(c => !c.formula).map(c => {
      const x = f.cols[c.id];
      return `<li class="fd-col${x.on ? ' on' : ''}"><label class="fd-chk"><input type="checkbox" data-in="fd-on" data-id="${esc(c.id)}" ${x.on ? 'checked' : ''}><span>${esc(c.label)}</span></label>
        <input class="fd-vals" type="text" data-in="fd-vals" data-id="${esc(c.id)}" data-fk="fdv-${esc(c.id)}" value="${esc(valsTxt(c, x.vals))}" ${x.on ? '' : 'disabled'} aria-label="Values to try for ${esc(c.label)}"><span class="num muted">${x.on ? x.vals.length : ''}</span></li>`;
    }).join('');
    const judges = [['now', 'Current settings']];
    if ((m.scenarios || []).length) judges.push(['situations', 'Every situation']);
    if (m.day) judges.push(['day', 'Whole day']);
    let out = '';
    const F = T.found;
    if (F && F.error) out = `<p class="bad-line">${esc(F.error)}</p>`;
    else if (F) {
      const best = F.top[0], gain = best ? best.s - F.current.s : 0;
      out = `<div class="fd-res"><p class="fd-sum">${F.method === 'all' ? `Tried all <b class="num">${F.checked.toLocaleString('en-US')}</b> combinations` : `Too many to try them all (${F.total.toLocaleString('en-US')}), so it searched step by step and checked <b class="num">${F.checked.toLocaleString('en-US')}</b>. The best is very likely, not certain`} in ${F.ms} ms.
        ${best ? (gain > 0.05 ? ` The best scores <b class="num">${best.s.toFixed(1)}</b>, ${gain.toFixed(1)} more than your best option, ${esc(F.current.label)}.` : ` None beats your best option, ${esc(F.current.label)} (${F.current.s.toFixed(1)}).`) : ' Nothing passes the must-haves.'}</p>
        <ol class="fd-list">${F.top.map((t, i) => `<li><span class="num fd-s">${t.s.toFixed(1)}</span><span class="fd-n">${esc(t.name)}${t.existing ? ` <span class="tag">already ${esc(rl(t.existing))}</span>` : ''}</span>${t.existing ? '' : `<button class="btn sm" data-act="fd-add" data-v="${i}">${R.I.plus}Add</button>`}</li>`).join('')}</ol></div>`;
    }
    return `<header class="modal-head"><div><h2 id="modal-title" class="serif">Find the best option</h2><p class="muted">Start from one option, pick the columns to vary and the values to try. Every combination is scored with your full ranking: formulas, must-haves and importances.</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${R.I.x}</button></header>
      <div class="fd-top"><label>Start from <select class="sel" data-in="fd-from">${R.opts(m.rows.map(r => [r.id, r.label]), f.from)}</select></label>
        <label>Judge on ${R.seg('fd-judge', f.judge, judges)}</label>
        ${f.judge !== 'now' ? `<label>Rank by ${R.seg('fd-agg', f.agg, [['avg', 'Average'], ['worst', 'Worst case']])}</label>` : ''}</div>
      <ul class="fd-cols">${colRows}</ul>
      <div class="modal-foot"><span class="muted num">${total.toLocaleString('en-US')} combinations${nCtx > 1 ? ` × ${nCtx} ${f.judge === 'day' ? 'hours' : 'situations'}` : ''} · ${full ? 'tries them all' : 'searches step by step'}</span><button class="btn primary" data-act="fd-run" ${total ? '' : 'disabled'}>Find</button></div>${out}`;
  };

  R.extraModals.day = () => {
    const m = S.model, d = m.day || { knob: m.knobs[0].id, start: 8, values: [], link: null, carry: null, sticky: 3 };
    if (!T.day) T.day = U.clone(d);
    const D = T.day, k = H.knob(D.knob) || m.knobs[0];
    if (!D.values.length) D.values = P.shape({ day: D, knobs: m.knobs }, 'two', 12);
    const others = m.knobs.filter(x => x.id !== D.knob);
    const numCols = m.columns.filter(c => c.formula && c.type === 'number');
    const bars = D.values.map((v, i) => `<span style="--h:${((v - k.min) / ((k.max - k.min) || 1) * 100).toFixed(1)}%" title="${P.hh(D.start + i)} ${esc(U.withUnit(v, k.unit))}"><i></i><b>${P.hh(D.start + i).slice(0, 2)}</b></span>`).join('');
    return `<header class="modal-head"><div><h2 id="modal-title" class="serif">Plan a day</h2><p class="muted">One setting changes hour by hour. Every hour is scored, and you get a plan that only switches when it is clearly worth it.</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${R.I.x}</button></header>
      <div class="dy-grid">
        <label>Setting that changes <select class="sel" data-in="dy-knob">${R.opts(m.knobs.map(x => [x.id, x.label]), D.knob)}</select></label>
        <label>First hour <input class="num-in" data-in="dy-start" data-fk="dys" value="${D.start}"></label>
        <label class="wide">Value each hour (${esc(k.unit || 'no unit')}) <input class="fd-vals" data-in="dy-vals" data-fk="dyv" value="${esc(D.values.join(', '))}"></label>
        <div class="wide dy-shapes"><span class="lbl">Fill from a shape</span>${Object.entries(P.SHAPES).map(([id, s]) => `<button class="chip-btn" data-act="dy-shape" data-v="${id}">${esc(s.label)}</button>`).join('')}</div>
        <div class="wide dy-bars">${bars}</div>
        <label>Also move <select class="sel" data-in="dy-link">${R.opts([['', 'nothing'], ...others.map(x => [x.id, x.label])], D.link ? D.link.knob : '')}</select></label>
        ${D.link ? `<label>from <input class="num-in" data-in="dy-lo" data-fk="dylo" value="${D.link.lo}"> at the quietest hour to <input class="num-in" data-in="dy-hi" data-fk="dyhi" value="${D.link.hi}"> at the busiest</label>` : '<span></span>'}
        <label>Carry over <select class="sel" data-in="dy-ccol">${R.opts([['', 'nothing'], ...numCols.map(c => [c.id, c.label])], D.carry ? D.carry.col : '')}</select></label>
        ${D.carry ? `<label>into the next hour’s <select class="sel" data-in="dy-cknob">${R.opts(others.map(x => [x.id, x.label]), D.carry.knob)}</select></label>` : '<span class="hint">For example the queue left at the end of an hour.</span>'}
        <label class="wide">Only switch plans for a gain of at least <input class="num-in" data-in="dy-sticky" data-fk="dyst" value="${D.sticky ?? 3}"> points</label>
      </div>
      <div class="modal-foot">${m.day ? '<button class="btn ghost" data-act="dy-remove">Remove day plan</button>' : '<span></span>'}<div><button class="btn" data-act="dy-sits">Save hours as situations</button><button class="btn primary" data-act="dy-save">Use this day</button></div></div>`;
  };

  R.extraModals.pairs = () => {
    const m = S.model, prep = S.res.prep;
    const ag = P.agreement(m, prep, m.pairs);
    const ok = ag.filter(x => x.ok === true).length, n = ag.filter(x => x.ok != null).length;
    const list = ag.map((x, i) => `<li class="pr ${x.ok === true ? 'ok' : x.ok === false ? 'bad' : 'skip'}">${x.ok === true ? R.I.check : x.ok === false ? R.I.warn : R.I.info}<span>I’d pick <b>${esc(rl(x.p.a))}</b> over <b>${esc(rl(x.p.b))}</b></span><span class="muted pr-why">${x.ok == null ? `${esc(rl(x.out))} is ruled out` : x.ok ? `agrees by ${x.gap.toFixed(1)}` : `ranking disagrees by ${(-x.gap).toFixed(1)}`}</span><button class="icon-btn xs" data-act="pr-del" data-v="${i}" aria-label="Remove">${R.I.x}</button></li>`).join('');
    const F = T.fitted;
    return `<header class="modal-head"><div><h2 id="modal-title" class="serif">Teach it my taste</h2><p class="muted">Not sure how important each thing is? Compare a few options you know. It finds importances that agree with you, changing as little as possible.</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${R.I.x}</button></header>
      <div class="pr-add">I’d pick <select class="sel" data-in="pr-a">${R.opts([['', 'choose…'], ...m.rows.map(r => [r.id, r.label])], T.pairA)}</select> over <select class="sel" data-in="pr-b">${R.opts([['', 'choose…'], ...m.rows.map(r => [r.id, r.label])], T.pairB)}</select><button class="btn" data-act="pr-add" ${T.pairA && T.pairB && T.pairA !== T.pairB ? '' : 'disabled'}>${R.I.plus}Add</button></div>
      ${m.pairs.length ? `<p class="pr-sum">The ranking agrees with <b class="num">${ok} of ${n}</b> of your choices.</p><ul class="pr-list">${list}</ul>` : '<p class="empty">Add two or three choices to start. Pick pairs where you know your answer.</p>'}
      ${F ? `<div class="pr-fit">${F.changes.length ? `<p>Suggested: ${F.changes.map(c => `<b>${esc(R.critName(H.crit(c.id)))}</b> ${c.from} → ${c.to}`).join(', ')}. That agrees with <b>${F.after.ok} of ${F.after.of}</b> (now ${F.before.ok}).</p><button class="btn primary sm" data-act="pr-apply">Use these importances</button>` : `<p>${F.after.ok === F.after.of ? 'Your importances already agree with every choice.' : 'No change in importances fixes the rest. Something else is driving your choice: maybe a missing column, a must-have, or a different curve.'}</p>`}</div>` : ''}
      <div class="modal-foot"><span class="hint">Pairs are saved with the ranking.</span><button class="btn primary" data-act="pr-fit" ${n ? '' : 'disabled'}>Suggest importances</button></div>`;
  };

  const A = M.app.ACT;
  const re = () => R.modal();
  A['open-find'] = () => { findSpec(); S.ui.modal = 'find'; re(); };
  A['open-matrix'] = () => { S.ui.modal = 'matrix'; re(); };
  A['open-day'] = () => { T.day = null; S.ui.modal = 'day'; re(); };
  A['open-pairs'] = () => { T.fitted = null; S.ui.modal = 'pairs'; re(); };
  A['fd-judge'] = v => { T.find.judge = v; T.found = null; re(); };
  A['fd-agg'] = v => { T.find.agg = v; T.found = null; re(); };
  A['fd-run'] = () => {
    const f = T.find, spec = {}; Object.entries(f.cols).forEach(([k, x]) => { if (x.on && x.vals.length) spec[k] = x.vals; });
    const btn = document.querySelector('[data-act="fd-run"]'); if (btn) { btn.disabled = true; btn.textContent = 'Finding…'; }
    setTimeout(() => { T.found = P.find(S.model, spec, { from: f.from, judge: f.judge, agg: f.agg }); re(); }, 20);
  };
  A['fd-add'] = v => {
    const t = T.found.top[+v]; if (!t) return;
    const id = U.uid('r', S.model.rows);
    ST.change(m => { m.rows.push({ id, label: t.name.length > 60 ? t.name.slice(0, 57) + '…' : t.name, v: U.clone(t.v) }); }, { setup: true });
    t.existing = id; re(); ST.toast('Added to your options');
  };
  A['dy-shape'] = v => { T.day.values = P.shape({ day: T.day, knobs: S.model.knobs }, v, T.day.values.length || 12); re(); };
  A['dy-save'] = () => { const d = U.clone(T.day); ST.change(m => { m.day = d; }); S.ui.modal = null; re(); ST.toast('Day plan ready, see the ranking panel'); };
  A['dy-remove'] = () => { ST.change(m => { m.day = null; }); S.ui.modal = null; re(); };
  A['dy-sits'] = () => {
    const m = S.model, ctx = P.dayContexts(Object.assign({}, m, { day: T.day }));
    const keep = new Set(Object.keys(m.base));
    ST.change(mm => { ctx.slice(0, 24).forEach((c, i) => { const vals = {}; Object.entries(c.K).forEach(([k, v]) => { if (keep.has(k) && Math.abs(v - mm.base[k]) > 1e-9) vals[k] = v; }); mm.scenarios = mm.scenarios.filter(s => s.id !== 'h' + i); mm.scenarios.push({ id: 'h' + i, label: c.label, values: vals }); }); mm.scenarios = mm.scenarios.slice(0, 24); });
    S.ui.modal = null; re(); ST.toast('Each hour is now a situation');
  };
  A['day-hour'] = v => {
    const h = S.day && S.day.hours[+v]; if (!h) return;
    ST.change(m => { m.knobs.forEach(k => { if (h.K[k.id] != null) k.value = h.K[k.id]; }); }, { setup: true });
    ST.toast(`Settings for ${h.label} applied`);
  };
  A['pr-add'] = () => { ST.change(m => { m.pairs.push({ a: T.pairA, b: T.pairB }); }); T.pairA = ''; T.pairB = ''; T.fitted = null; re(); };
  A['pr-del'] = v => { ST.change(m => { m.pairs.splice(+v, 1); }); T.fitted = null; re(); };
  A['pr-fit'] = () => { T.fitted = P.fit(S.model, S.model.pairs); re(); };
  A['pr-apply'] = () => { const W = T.fitted.W; ST.change(m => { m.criteria.forEach(c => { if (W[c.id] != null) c.weight = W[c.id]; }); }, { setup: true }); T.fitted = null; re(); ST.toast('Importances updated. Ctrl+Z to go back'); };

  document.addEventListener('change', e => {
    const el = e.target, k = el.getAttribute && el.getAttribute('data-in'); if (!k) return;
    const id = el.getAttribute('data-id'), v = el.value;
    const f = T.find, d = T.day;
    switch (k) {
      case 'fd-from': f.from = v; T.found = null; re(); break;
      case 'fd-on': f.cols[id].on = el.checked; T.found = null; re(); break;
      case 'fd-vals': { const c = H.col(id); f.cols[id].vals = [...new Set(parseVals(c, v))]; T.found = null; re(); break; }
      case 'dy-knob': d.knob = v; d.values = P.shape({ day: d, knobs: S.model.knobs }, 'two', d.values.length || 12); if (d.link && d.link.knob === v) d.link = null; re(); break;
      case 'dy-start': d.start = Math.round(U.clamp(U.parseNum(v) ?? 8, 0, 23)); re(); break;
      case 'dy-vals': d.values = v.split(',').map(x => U.parseNum(x)).filter(x => x != null).slice(0, 24); re(); break;
      case 'dy-link': { const kn = H.knob(v); d.link = kn ? { knob: v, lo: kn.min, hi: kn.max } : null; re(); break; }
      case 'dy-lo': d.link.lo = U.parseNum(v) ?? d.link.lo; re(); break;
      case 'dy-hi': d.link.hi = U.parseNum(v) ?? d.link.hi; re(); break;
      case 'dy-ccol': d.carry = v ? { col: v, knob: (d.carry && d.carry.knob) || (S.model.knobs.find(x => x.id !== d.knob) || {}).id } : null; re(); break;
      case 'dy-cknob': d.carry.knob = v; re(); break;
      case 'dy-sticky': d.sticky = Math.max(0, U.parseNum(v) ?? 3); re(); break;
      case 'pr-a': T.pairA = v; re(); break;
      case 'pr-b': T.pairB = v; re(); break;
      case 'rule-soft': ST.change(() => { H.rule(id).soft = v === 'soft'; }, { setup: true }); break;
    }
  });
  A['rule-kind'] = (v, id) => ST.change(() => { H.rule(id).soft = v === 'soft'; }, { setup: true });
  document.addEventListener('input', e => {
    const el = e.target; if (el.getAttribute && el.getAttribute('data-in') === 'rule-pen') {
      const n = U.parseNum(el.value); if (n == null) return;
      ST.change(() => { H.rule(el.getAttribute('data-id')).penalty = U.clamp(n, 0, 100); }, { live: e.type === 'input' });
    }
  });
  document.addEventListener('change', e => { if (e.target.getAttribute && e.target.getAttribute('data-in') === 'rule-pen') ST.settle(); });
})(window.M);
