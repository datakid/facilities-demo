window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, R = M.render, D = M.dom, fmtN = H.fmtN;
  const NUM_OPS = [['<=', '≤'], ['<', '<'], ['>=', '≥'], ['>', '>'], ['==', '='], ['!=', '≠']];

  R.gateExpr = s => {
    const c = H.col(s.column); if (!c) return 'true';
    if (c.type === 'category') return `${s.column} ${s.op} ${JSON.stringify(String(s.value))}`;
    if (c.type === 'boolean') return `${s.column} ${s.op} ${s.value ? 1 : 0}`;
    return `${s.column} ${s.op} ${+s.value || 0}`;
  };
  const span = p => (p.max - p.min) || 1;
  const pos = (p, v) => Math.max(0, Math.min(100, (v - p.min) / span(p) * 100));
  R.pctOf = p => pos(p, +p.value).toFixed(2) + '%';
  const isOpen = (key, dflt) => S.ui.open[key] === undefined ? dflt : S.ui.open[key];
  R.isOpen = isOpen;
  function groupHead(key, title, count, open, extra) {
    return `<button class="grp-head" data-action="toggle-open" data-key="${esc(key)}" aria-expanded="${open}">${R.ICON.chev}<span class="grp-title">${esc(title)}</span>${extra || ''}<span class="grp-count">${count}</span></button>`;
  }
  function secHead(title, sub, action) {
    return `<header class="sec-head"><h2>${esc(title)}</h2>${sub ? `<span class="sec-sub">${sub}</span>` : ''}${action || ''}</header>`;
  }
  R.secHead = secHead;

  function scenBar() {
    const m = S.model, live = S.live || [], act = m.active || '', diffs = H.diffs(), I = R.ICON;
    const peekId = S.peek ? S.peek.id : null;
    const winOf = id => { const x = live.find(l => !l.now && l.id === id); return x ? x.winner : undefined; };
    const chip = (id, label, n) => {
      const w = winOf(id), on = id === act, k = w ? H.rowColor(w) : 0;
      const sub = w === undefined ? '' : w ? esc(H.rowLabel(w)) : 'none pass';
      return `<button class="sc-chip ${on ? 'on' : ''} ${on && diffs.length ? 'dirty' : ''} ${peekId === id ? 'peeking' : ''}" data-key="sc:${esc(id)}" data-action="use-scen" data-id="${esc(id)}" data-peek="${esc(id)}" aria-pressed="${on}" title="${esc(label)}${sub ? ' · leader: ' + sub : ''}${n ? ' · sets ' + n + ' knob' + (n > 1 ? 's' : '') : ''}">
        <span class="sw" style="background:${k ? `var(--c${k})` : 'var(--line-2)'}"></span><span class="sc-name">${esc(label)}</span>${n ? `<span class="sc-n num">${n}</span>` : ''}</button>`;
    };
    let h = `<div class="sb-top"><span class="sb-title">Scenario</span><span class="sb-tools">
      <button class="link" data-action="open-scen-build" title="Make scenarios from combinations of knob values">${I.grid3}Grid</button>
      <button class="link" data-action="open-day" title="Plan hour by hour">${I.clock}Day</button></span></div>
      <div class="sb-chips" role="group" aria-label="Scenarios">${chip('', 'Baseline', 0)}${m.scenarios.map(s => chip(s.id, s.label, Object.keys(s.values || {}).length)).join('')}
      <button class="sc-chip add" data-key="sc:+" data-action="scen-new" title="Save the current knobs as a new scenario">${I.plus}<span>New</span></button></div>`;
    if (diffs.length) {
      const a = H.active(), where = a ? a.label : 'baseline';
      const res = S.result, ref = S.baseRes, lead = res.ranked[0], d = lead && ref && ref.byId[lead] ? res.byId[lead].score - ref.byId[lead].score : 0;
      const switched = ref && ref.ranked[0] !== lead;
      h += `<div class="draft" role="status"><div class="draft-t"><b class="num">${diffs.length}</b> knob${diffs.length > 1 ? 's' : ''} off ${esc(where)}
        <span class="draft-eff">${switched ? `leader now <b>${esc(H.rowLabel(lead) || 'none')}</b>` : lead ? `leader ${R.delta(d, { keep: false }) || 'unchanged'}` : ''}</span></div>
        <div class="draft-a"><button class="btn small primary" data-action="draft-save">${a ? 'Update ' + esc(a.label) : 'Set as baseline'}</button>
        <button class="btn small" data-action="draft-new">Save as new</button><button class="btn small ghost" data-action="draft-discard">Discard</button></div></div>`;
    }
    return h;
  }

  function knobRow(p, flat) {
    const tgt = H.target(p), changed = !H.near(+p.value, tgt), imp = S.impact && S.impact.byId[p.id];
    const top = S.impact ? S.impact.top || 0 : 0;
    const marks = [];
    if (changed) marks.push(`<i class="mk base" style="left:${pos(p, tgt).toFixed(2)}%" title="${esc(H.active() ? H.active().label : 'Baseline')}: ${fmtN(tgt)}"></i>`);
    if (imp && S.impact.winner) {
      [imp.below, imp.above].forEach(t => { if (t) marks.push(`<i class="mk tip" style="left:${pos(p, t.at).toFixed(2)}%" title="${esc(H.rowLabel(S.impact.winner))} loses first place to ${esc(t.who ? H.rowLabel(t.who) : 'nobody')} near ${fmtN(+t.at.toPrecision(3))}"></i>`); });
    }
    let impH = '';
    if (imp && imp.swing >= 0.05) {
      const w = top > 0 ? Math.max(4, imp.swing / top * 100) : 0;
      const tip = imp.above && imp.above.v > +p.value ? imp.above : imp.below;
      impH = `<div class="knob-imp" title="Across its range this knob moves ${esc(H.rowLabel(S.impact.winner))}'s score by up to ${imp.swing.toFixed(1)} points"><span class="imp-bar"><i style="width:${w.toFixed(1)}%"></i></span><span class="imp-t num">±${imp.swing >= 10 ? imp.swing.toFixed(0) : imp.swing.toFixed(1)}</span>${tip ? `<span class="imp-tip">leader changes at <b class="num">${fmtN(+tip.at.toPrecision(3))}</b></span>` : ''}</div>`;
    }
    return `<div class="knob ${changed ? 'chg' : ''}" data-key="k:${esc(p.id)}">
      <div class="knob-top"><button class="knob-label" data-action="open" data-kind="param" data-id="${esc(p.id)}" title="${esc(p.help || p.label)}">${flat ? `<span class="knob-grp">${esc(p.group.replace(/^Team · /, ''))}</span>` : ''}${esc(p.label)}${S.ui.advanced ? ` <span class="mono id-hint">${esc(p.id)}</span>` : ''}</button>
        ${changed ? `<button class="kn-reset" data-action="knob-reset" data-id="${esc(p.id)}" title="Back to ${esc(fmtN(tgt))}" aria-label="Reset ${esc(p.label)}">${R.ICON.reset}</button>` : ''}
        <label class="knob-v"><input class="knob-val num" type="text" inputmode="decimal" data-in="param-exact" data-id="${esc(p.id)}" value="${esc(fmtN(+p.value))}" aria-label="${esc(p.label)} exact value" autocomplete="off" spellcheck="false">${p.unit ? `<span class="knob-unit">${esc(p.unit)}</span>` : ''}</label></div>
      <div class="trk">${marks.join('')}<input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-in="param-value" data-id="${esc(p.id)}" style="--pct:${R.pctOf(p)}" aria-label="${esc(p.label)}" aria-valuetext="${esc(H.paramText(p))}"></div>${impH}</div>`;
  }

  function knobsHTML() {
    const m = S.model, adv = S.ui.advanced, q = S.ui.knobQ.trim().toLowerCase(), byImp = S.ui.knobSort === 'impact' && S.impact;
    let list = m.params;
    if (q) list = list.filter(p => (p.label + ' ' + p.id + ' ' + p.group + ' ' + p.help).toLowerCase().includes(q));
    const many = m.params.length > 8;
    let h = `<section class="sec knobs" id="knobs-section"><header class="sec-head"><h2>Knobs</h2><span class="sec-sub">the situation you plan for</span>${adv ? '<button class="link" data-action="add-param">Add</button>' : ''}</header>`;
    if (many) h += `<div class="kn-tools"><label class="kn-search">${R.ICON.search}<input type="text" data-in="knob-q" placeholder="Find a knob" value="${esc(S.ui.knobQ)}" aria-label="Find a knob" autocomplete="off"></label>
      <div class="seg seg-sm" role="group" aria-label="Order"><button data-action="knob-sort" data-v="model" aria-pressed="${!byImp}">Groups</button><button data-action="knob-sort" data-v="impact" aria-pressed="${!!byImp}" ${S.impact ? '' : 'disabled'}>Impact</button></div></div>`;
    if (!m.params.length) h += '<p class="help">Knobs are named numbers any formula can use: arrivals per hour, users, budget.</p>';
    else if (!list.length) h += `<p class="help">No knob matches “${esc(S.ui.knobQ)}”.</p>`;
    if (byImp) {
      const sorted = list.slice().sort((a, b) => ((S.impact.byId[b.id] || {}).swing || 0) - ((S.impact.byId[a.id] || {}).swing || 0));
      const moving = sorted.filter(p => ((S.impact.byId[p.id] || {}).swing || 0) >= 0.05), still = sorted.filter(p => !moving.includes(p));
      h += `<div class="grp-body flat">${moving.map(p => knobRow(p, true)).join('')}</div>`;
      if (still.length) {
        const open = isOpen('k:__still', false);
        h += `<div class="grp">${groupHead('k:__still', 'No effect on the leader', still.length, open)}${open ? `<div class="grp-body">${still.map(p => knobRow(p, true)).join('')}</div>` : ''}</div>`;
      }
      return h + '</section>';
    }
    const groups = [];
    list.forEach(p => { let g = groups.find(x => x.name === p.group); if (!g) groups.push(g = { name: p.group, items: [] }); g.items.push(p); });
    const multi = groups.length > 1;
    groups.forEach((g, i) => {
      const chg = g.items.filter(p => !H.near(+p.value, H.target(p))).length;
      const open = !multi || !!q || isOpen('k:' + g.name, i < 2 && !/^Team/.test(g.name));
      if (multi) h += `<div class="grp" data-key="kg:${esc(g.name)}">${groupHead('k:' + g.name, g.name, g.items.length, open, chg ? `<span class="grp-chg num" title="Changed">${chg}</span>` : '')}`;
      if (open) h += `<div class="grp-body">${g.items.map(p => knobRow(p)).join('')}</div>`;
      if (multi) h += '</div>';
    });
    return h + '</section>';
  }

  function calcRow(k, fr) {
    const err = H.errFor('calc', k.id), ref = H.refRes();
    const v = H.calcVal(k.id, fr), rv = ref ? H.calcVal(k.id, fr, ref) : null, dir = H.calcDir(k.id);
    let dl = '';
    if (v != null && rv != null && isFinite(v) && isFinite(rv) && !H.near(v, rv)) {
      const d = v - rv, rel = Math.abs(rv) > 1e-9 ? d / Math.abs(rv) : 1;
      if (Math.abs(rel) > 0.001) dl = R.delta(d, { neutral: !dir, invert: dir === 'lower', text: (d > 0 ? '▲' : '▼') + (Math.abs(rel) >= 0.995 && Math.abs(rv) < 1e-9 ? '' : Math.abs(rel * 100) >= 10 ? Math.round(Math.abs(rel * 100)) + '%' : Math.abs(rel * 100).toFixed(1) + '%') });
    }
    return `<button class="calc-row ${err ? 'is-err' : ''}" data-key="c:${esc(k.id)}" data-action="open" data-kind="calc" data-id="${esc(k.id)}" title="${esc(k.note || k.expr)}">
      <span class="calc-name">${k.pin ? `<span class="pin">${R.ICON.pin}</span>` : ''}${esc(k.label)}${S.ui.advanced ? ` <span class="mono id-hint">${esc(k.id)}</span>` : ''}</span>${dl}
      <span class="calc-val num">${err ? 'error' : esc(H.calcText(k, fr))}</span></button>`;
  }
  function calcsHTML() {
    const m = S.model, adv = S.ui.advanced;
    if (!m.calcs.length && !adv) return '';
    const fr = H.focusRow(), who = fr ? H.rowLabel(fr) : '';
    const act = `<span class="sec-actions"><button class="link" data-action="open-blocks">${R.ICON.blocks} Blocks</button>${adv ? '<button class="link" data-action="add-calc">Add</button>' : ''}</span>`;
    let h = `<section class="sec" id="calcs-section">${secHead('Calculations', who ? `values for <b>${esc(who)}</b>` : '', act)}`;
    if (!m.calcs.length) h += '<p class="help">Calculations turn knobs and columns into new numbers step by step: a wait time, a load, a cost. Start from a block.</p>';
    const groups = [];
    m.calcs.forEach(k => { const n = k.group || 'Steps'; let g = groups.find(x => x.name === n); if (!g) groups.push(g = { name: n, items: [] }); g.items.push(k); });
    const many = groups.length > 1;
    groups.forEach(g => {
      const open = !many || isOpen('c:' + g.name, g.name === 'Result');
      if (many) h += `<div class="grp" data-key="cg:${esc(g.name)}">${groupHead('c:' + g.name, g.name, g.items.length, open)}`;
      if (open) h += `<div class="grp-body">${g.items.map(k => calcRow(k, fr)).join('')}</div>`;
      if (many) h += '</div>';
    });
    return h + '</section>';
  }

  function gateRow(g) {
    const res = H.cur(), err = H.errFor('gate', g.id);
    const fails = res.rows.filter(r => { const x = r.gates.find(y => y.id === g.id); return x && !x.pass; }).length;
    const sc = g.simple && H.col(g.simple.column);
    let body;
    if (sc) {
      const s = g.simple, c = sc;
      const cols = S.model.columns.map(k => `<option value="${esc(k.id)}" ${k.id === s.column ? 'selected' : ''}>${esc(k.label)}</option>`).join('');
      let ops, val;
      if (c.type === 'category') {
        ops = [['==', 'is'], ['!=', 'is not']];
        const vals = H.distinct(c.id); if (!vals.includes(String(s.value))) vals.unshift(String(s.value));
        val = `<select class="g-val" data-in="gate-val" data-id="${g.id}" aria-label="Value">${vals.map(v => `<option ${v === String(s.value) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
      } else if (c.type === 'boolean') {
        ops = [['==', 'is'], ['!=', 'is not']];
        val = `<select class="g-val" data-in="gate-val" data-id="${g.id}" aria-label="Value"><option value="1" ${s.value ? 'selected' : ''}>yes</option><option value="0" ${!s.value ? 'selected' : ''}>no</option></select>`;
      } else {
        ops = NUM_OPS;
        val = `<input class="g-val" type="number" data-in="gate-val" data-id="${g.id}" value="${esc(s.value)}" aria-label="Value">`;
      }
      body = `<div class="gate-sentence"><select class="g-col" data-in="gate-col" data-id="${g.id}" aria-label="Column">${cols}</select>
        <select class="g-op" data-in="gate-op" data-id="${g.id}" aria-label="Comparison">${ops.map(o => `<option value="${o[0]}" ${o[0] === s.op ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>${val}</div>`;
    } else {
      body = `<button class="g-text" data-action="open" data-kind="gate" data-id="${g.id}"><span class="g-label">${esc(g.label || 'Rule')}</span><span class="g-expr mono">${esc(g.expr)}</span></button>`;
    }
    return `<div class="gate ${g.enabled ? '' : 'off'}" data-key="g:${esc(g.id)}">
      <button class="toggle-dot ${g.enabled ? 'on' : ''}" data-action="toggle-gate" data-id="${g.id}" aria-pressed="${g.enabled}" aria-label="${g.enabled ? 'Turn off' : 'Turn on'} rule ${esc(g.label)}"></button>
      ${body}
      ${err ? '<span class="tag bad">error</span>' : g.enabled && fails ? `<span class="tag" title="Options this rule rules out">−${fails}</span>` : g.enabled ? '<span class="tag ok-tag" title="Every option passes">✓</span>' : ''}
      <button class="x" data-action="remove-gate" data-id="${g.id}" aria-label="Remove rule">×</button></div>`;
  }
  function critMeta(c) {
    const src = c.source.kind === 'expr' ? 'formula' : c.source.kind === 'calc' ? ((H.calc(c.source.calc) || {}).label || c.source.calc) : ((H.col(c.source.column) || {}).label || c.source.column);
    const t = c.shape.type, dir = (t === 'target' || t === 'map') ? '' : (c.direction === 'lower' ? 'lower is better · ' : 'higher is better · ');
    return `${esc(src)} · ${dir}${M.shapes.META[t].label.toLowerCase()}`;
  }

  function equationTab() {
    const m = S.model, res = H.cur();
    let h = calcsHTML();
    h += `<section class="sec" id="rules-section">${secHead('Rules', 'every option must pass', '<button class="link" data-action="add-gate">Add</button>')}`;
    if (!m.gates.length) h += '<p class="help">No rules. Every option is in the running.</p>';
    h += m.gates.map(gateRow).join('') + '</section>';

    h += `<section class="sec" id="criteria-section">${secHead('Criteria', 'share of the score', '<button class="link" data-action="add-criterion">Add</button>')}`;
    if (!m.criteria.length) h += '<p class="help">What makes one option better than another?</p>';
    m.criteria.forEach((c, i) => {
      const k = i + 1, err = H.errFor('criterion', c.id);
      h += `<div class="crit ${c.enabled ? '' : 'off'}" data-key="cr:${esc(c.id)}" style="--cc:var(--c${k});--ct:var(--t${k});--ck:var(--k${k})">
        <div class="crit-top">
          <button class="toggle-dot tinted ${c.enabled ? 'on' : ''}" data-action="toggle-criterion" data-id="${c.id}" aria-pressed="${c.enabled}" aria-label="${c.enabled ? 'Turn off' : 'Turn on'} ${esc(c.label)}"></button>
          <button class="crit-label" data-action="open" data-kind="criterion" data-id="${c.id}">${esc(c.label)}</button>
          ${err ? '<span class="tag bad">error</span>' : ''}
          <span class="share num">${c.enabled ? H.pct(res.weights[c.id]) : '—'}</span>
          <button class="x" data-action="remove-criterion" data-id="${c.id}" aria-label="Remove ${esc(c.label)}">×</button></div>
        <input type="range" min="0" max="100" step="1" value="${c.weight}" data-in="weight" data-id="${c.id}" style="--fill:var(--c${k});--pct:${c.weight}%" aria-label="Weight of ${esc(c.label)}" ${c.enabled ? '' : 'disabled'}>
        <div class="crit-meta">${critMeta(c)}</div></div>`;
    });
    h += '</section>';

    const ct = m.combine.type, adv = S.ui.advanced;
    const opts = [['sum', 'Add up'], ['product', 'Multiply'], ['min', 'Weakest link']];
    if (adv || ct === 'custom') opts.push(['custom', 'Custom']);
    const help = { sum: 'Strengths make up for weaknesses.', product: 'A weak spot drags the whole score down.', min: 'Only the worst criterion counts.', custom: 'Write your own.' }[ct];
    h += `<section class="sec" id="combine-section">${secHead('Combine', '', '')}<div class="seg" role="group" aria-label="Combine method">${opts.map(o => `<button data-action="set-combine" data-v="${o[0]}" aria-pressed="${ct === o[0]}">${o[1]}</button>`).join('')}</div>
      <p class="help">${help}${ct === 'custom' ? ` <button class="link" data-action="open" data-kind="combine" data-id="combine">Edit formula</button>` : ''}</p></section>`;
    if (m.params.length) h += `<button class="btn finder-cta" data-action="open-finder">${R.ICON.spark} Find better plans: try every combination</button>`;
    return h;
  }

  function flowHTML() {
    const m = S.model, res = H.cur();
    const bits = [[m.params.length, 'knobs', 'situation'], [m.calcs.length, 'calculations', 'equation'], [m.gates.filter(g => g.enabled).length, 'rules', 'equation'], [res.used.length, 'criteria', 'equation']].filter(b => b[0]);
    return `<div class="flow" aria-label="How the score is built">${bits.map(b => `<button class="flow-b" data-action="set-tab" data-v="${b[2]}"><b class="num">${b[0]}</b> ${b[1]}</button>`).join('<span class="flow-ar">→</span>')}<span class="flow-ar">→</span><span class="flow-b end">score</span></div>`;
  }

  R.renderRecipe = el => {
    if (!el) return;
    const m = S.model, hasK = m.params.length > 0, tab = hasK ? S.ui.tab : 'equation';
    const noteOpen = isOpen('note', false);
    const tabs = hasK ? `<div class="tabs" role="tablist" aria-label="Setup">
      <button role="tab" data-action="set-tab" data-v="situation" aria-selected="${tab === 'situation'}">Situation<span class="tab-n num">${m.params.length}</span></button>
      <button role="tab" data-action="set-tab" data-v="equation" aria-selected="${tab === 'equation'}">Equation<span class="tab-n num">${m.calcs.length + m.gates.length + m.criteria.length}</span></button></div>` : '';
    const head = `<input class="m-name" type="text" data-in="model-name" value="${esc(m.name)}" aria-label="Model name">
      ${m.note ? `<button class="model-note ${noteOpen ? 'open' : ''}" data-action="toggle-open" data-key="note" aria-expanded="${noteOpen}">${esc(m.note)}</button>` : ''}${flowHTML()}`;
    D.blocks(el, [
      ['rc-head', 'rc-head', head],
      ['scen-bar', hasK ? 'scen-bar' : 'scen-bar hidden', hasK ? scenBar() : ''],
      ['rc-tabs', 'rc-tabs', tabs],
      ['rc-body', 'rc-body tab-' + tab, tab === 'situation' ? knobsHTML() : equationTab()]
    ]);
  };
})(window.M);
