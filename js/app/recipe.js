window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, R = M.render;
  const NUM_OPS = [['<=', '≤'], ['<', '<'], ['>=', '≥'], ['>', '>'], ['==', '='], ['!=', '≠']];

  R.gateExpr = s => {
    const c = H.col(s.column); if (!c) return 'true';
    if (c.type === 'category') return `${s.column} ${s.op} ${JSON.stringify(String(s.value))}`;
    if (c.type === 'boolean') return `${s.column} ${s.op} ${s.value ? 1 : 0}`;
    return `${s.column} ${s.op} ${+s.value || 0}`;
  };
  const pctOf = p => ((p.value - p.min) / ((p.max - p.min) || 1) * 100).toFixed(1) + '%';
  const isOpen = (key, dflt) => S.ui.open[key] === undefined ? dflt : S.ui.open[key];
  function groupHead(key, title, count, open, extra) {
    return `<button class="grp-head" data-action="toggle-open" data-key="${esc(key)}" aria-expanded="${open}">${R.ICON.chev}<span class="grp-title">${esc(title)}</span>${extra || ''}<span class="grp-count">${count}</span></button>`;
  }
  function secHead(title, sub, action) {
    return `<header class="sec-head"><h2>${esc(title)}</h2>${sub ? `<span class="sec-sub">${sub}</span>` : ''}${action || ''}</header>`;
  }

  function knobRow(p) {
    return `<div class="knob">
      <button class="knob-label" data-action="open" data-kind="param" data-id="${esc(p.id)}" title="${esc(p.help || p.label)}">${esc(p.label)}${S.ui.advanced ? ` <span class="mono id-hint">${esc(p.id)}</span>` : ''}</button>
      <span class="knob-val num" data-live="param:${esc(p.id)}">${esc(H.paramText(p))}</span>
      <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-in="param-value" data-id="${esc(p.id)}" data-focus-key="p:${esc(p.id)}" style="--pct:${pctOf(p)}" aria-label="${esc(p.label)}"></div>`;
  }
  function knobsHTML() {
    const m = S.model, adv = S.ui.advanced;
    if (!m.params.length && !adv) return '';
    const groups = [];
    m.params.forEach(p => { let g = groups.find(x => x.name === p.group); if (!g) groups.push(g = { name: p.group, items: [] }); g.items.push(p); });
    let h = `<section class="sec" id="knobs-section">${secHead('Knobs', 'the situation you plan for', adv ? '<button class="link" data-action="add-param">Add</button>' : '')}`;
    if (!m.params.length) h += '<p class="help">Knobs are named numbers any formula can use: arrivals per hour, users, budget.</p>';
    const many = groups.length > 1;
    groups.forEach((g, i) => {
      const open = !many || isOpen('k:' + g.name, i < 2 && !/^Team/.test(g.name));
      if (many) h += `<div class="grp">${groupHead('k:' + g.name, g.name, g.items.length, open)}`;
      if (open) h += `<div class="grp-body">${g.items.map(knobRow).join('')}</div>`;
      if (many) h += '</div>';
    });
    return h + '</section>';
  }

  function calcRow(k) {
    const err = H.errFor('calc', k.id);
    return `<button class="calc-row ${err ? 'is-err' : ''}" data-action="open" data-kind="calc" data-id="${esc(k.id)}" title="${esc(k.note || k.expr)}">
      <span class="calc-name">${k.pin ? `<span class="pin">${R.ICON.pin}</span>` : ''}${esc(k.label)}${S.ui.advanced ? ` <span class="mono id-hint">${esc(k.id)}</span>` : ''}</span>
      <span class="calc-val num" data-live="calc:${esc(k.id)}">${err ? 'error' : esc(H.calcText(k, H.focusRow()))}</span></button>`;
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
      if (many) h += `<div class="grp">${groupHead('c:' + g.name, g.name, g.items.length, open)}`;
      if (open) h += `<div class="grp-body">${g.items.map(calcRow).join('')}</div>`;
      if (many) h += '</div>';
    });
    return h + '</section>';
  }

  function gateRow(g) {
    const res = S.result, err = H.errFor('gate', g.id);
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
        val = `<input class="g-val" type="number" data-in="gate-val" data-id="${g.id}" data-focus-key="gv:${g.id}" value="${esc(s.value)}" aria-label="Value">`;
      }
      body = `<div class="gate-sentence"><select class="g-col" data-in="gate-col" data-id="${g.id}" aria-label="Column">${cols}</select>
        <select class="g-op" data-in="gate-op" data-id="${g.id}" aria-label="Comparison">${ops.map(o => `<option value="${o[0]}" ${o[0] === s.op ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>${val}</div>`;
    } else {
      body = `<button class="g-text" data-action="open" data-kind="gate" data-id="${g.id}"><span class="g-label">${esc(g.label || 'Rule')}</span><span class="g-expr mono">${esc(g.expr)}</span></button>`;
    }
    return `<div class="gate ${g.enabled ? '' : 'off'}">
      <button class="toggle-dot ${g.enabled ? 'on' : ''}" data-action="toggle-gate" data-id="${g.id}" aria-pressed="${g.enabled}" aria-label="${g.enabled ? 'Turn off' : 'Turn on'} rule ${esc(g.label)}"></button>
      ${body}
      ${err ? '<span class="tag bad">error</span>' : g.enabled && fails ? `<span class="tag" title="Options this rule rules out">−${fails}</span>` : ''}
      <button class="x" data-action="remove-gate" data-id="${g.id}" aria-label="Remove rule">×</button></div>`;
  }
  function critMeta(c) {
    const src = c.source.kind === 'expr' ? 'formula' : c.source.kind === 'calc' ? ((H.calc(c.source.calc) || {}).label || c.source.calc) : ((H.col(c.source.column) || {}).label || c.source.column);
    const t = c.shape.type, dir = (t === 'target' || t === 'map') ? '' : (c.direction === 'lower' ? 'lower is better · ' : 'higher is better · ');
    return `${esc(src)} · ${dir}${M.shapes.META[t].label.toLowerCase()}`;
  }

  R.recipeHTML = () => {
    const m = S.model, res = S.result, adv = S.ui.advanced;
    let h = `<input class="m-name" type="text" data-in="model-name" data-focus-key="name-m" value="${esc(m.name)}" aria-label="Model name">`;
    if (m.note) h += `<p class="model-note">${esc(m.note)}</p>`;
    h += knobsHTML();
    h += calcsHTML();

    h += `<section class="sec" id="rules-section">${secHead('Rules', 'every option must pass', '<button class="link" data-action="add-gate">Add</button>')}`;
    if (!m.gates.length) h += '<p class="help">No rules. Every option is in the running.</p>';
    h += m.gates.map(gateRow).join('') + '</section>';

    h += `<section class="sec" id="criteria-section">${secHead('Criteria', 'share of the score', '<button class="link" data-action="add-criterion">Add</button>')}`;
    if (!m.criteria.length) h += '<p class="help">What makes one option better than another?</p>';
    m.criteria.forEach((c, i) => {
      const k = i + 1, err = H.errFor('criterion', c.id);
      h += `<div class="crit ${c.enabled ? '' : 'off'}" style="--cc:var(--c${k});--ct:var(--t${k});--ck:var(--k${k})">
        <div class="crit-top">
          <button class="toggle-dot tinted ${c.enabled ? 'on' : ''}" data-action="toggle-criterion" data-id="${c.id}" aria-pressed="${c.enabled}" aria-label="${c.enabled ? 'Turn off' : 'Turn on'} ${esc(c.label)}"></button>
          <button class="crit-label" data-action="open" data-kind="criterion" data-id="${c.id}">${esc(c.label)}</button>
          ${err ? '<span class="tag bad">error</span>' : ''}
          <span class="share num" data-live="share:${c.id}">${c.enabled ? H.pct(res.weights[c.id]) : '—'}</span>
          <button class="x" data-action="remove-criterion" data-id="${c.id}" aria-label="Remove ${esc(c.label)}">×</button></div>
        <input type="range" min="0" max="100" step="1" value="${c.weight}" data-in="weight" data-id="${c.id}" data-focus-key="w:${c.id}" style="--fill:var(--c${k});--pct:${c.weight}%" aria-label="Weight of ${esc(c.label)}" ${c.enabled ? '' : 'disabled'}>
        <div class="crit-meta">${critMeta(c)}</div></div>`;
    });
    h += '</section>';

    const ct = m.combine.type;
    const opts = [['sum', 'Add up'], ['product', 'Multiply'], ['min', 'Weakest link']];
    if (adv || ct === 'custom') opts.push(['custom', 'Custom']);
    const help = { sum: 'Strengths make up for weaknesses.', product: 'A weak spot drags the whole score down.', min: 'Only the worst criterion counts.', custom: 'Write your own.' }[ct];
    h += `<section class="sec" id="combine-section">${secHead('Combine', '', '')}<div class="seg" role="group" aria-label="Combine method">${opts.map(o => `<button data-action="set-combine" data-v="${o[0]}" aria-pressed="${ct === o[0]}">${o[1]}</button>`).join('')}</div>
      <p class="help">${help}${ct === 'custom' ? ` <button class="link" data-action="open" data-kind="combine" data-id="combine">Edit formula</button>` : ''}</p></section>`;

    if (m.params.length) {
      h += `<section class="sec" id="scen-section">${secHead('Scenarios', 'knob settings to compare', '<button class="link" data-action="add-scenario">Save current</button>')}`;
      if (!m.scenarios.length) h += '<p class="help">Save the knobs as a scenario ("Evening peak", "Launch day") to compare winners side by side.</p>';
      m.scenarios.forEach(s => {
        const keys = Object.keys(s.values || {});
        h += `<div class="scen-row"><input type="text" class="scen-name" data-in="scen-label" data-id="${esc(s.id)}" value="${esc(s.label)}" aria-label="Scenario name">
          <span class="faint scen-keys" title="${esc(keys.map(k => k + ' = ' + s.values[k]).join(', '))}">${keys.length ? keys.length + ' knob' + (keys.length > 1 ? 's' : '') : 'current'}</span>
          <button class="link" data-action="apply-scenario" data-id="${esc(s.id)}">Apply</button>
          <button class="x" data-action="remove-scenario" data-id="${esc(s.id)}" aria-label="Remove scenario">×</button></div>`;
      });
      h += '</section>';
    }
    return h;
  };
})(window.M);
