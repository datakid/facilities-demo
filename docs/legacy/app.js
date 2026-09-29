/* Meridian Studio — app: state, history, rendering, events. Depends on core.js + templates.js */
window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, esc = U.esc, fmt = U.fmt, fmtN = U.fmtN;
  const KEY = 'meridian.studio.v1';
  const LIMIT = { rows: 1000, columns: 24, params: 12, gates: 8, criteria: 8 };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = M.state = { model: null, result: null, sens: {}, gaps: [], flips: [],
    ui: { view: 'build', advanced: false, inspector: null, selectedRow: null, modal: null, exportTab: 'json', outOpen: false } };
  let past = [], future = [], gestureSnap = null, saveT = null, anaT = null, builtView = null;

  /* ---------------- helpers ---------------- */
  const col = id => S.model.columns.find(c => c.id === id);
  const crit = id => S.model.criteria.find(c => c.id === id);
  const gate = id => S.model.gates.find(g => g.id === id);
  const param = id => S.model.params.find(p => p.id === id);
  const cidx = id => S.model.criteria.findIndex(c => c.id === id) + 1;
  const pct = w => (w == null ? '—' : Math.round(w * 100) + '%');
  const rowLabel = id => (S.result.byId[id] || {}).label || id;
  // One toast at a time. toastUndo adds an Undo button and stays a little longer.
  let toastEl = null, toastT = null;
  function dropToast() { clearTimeout(toastT); if (toastEl) { const t = toastEl; toastEl = null; t.classList.add('out'); setTimeout(() => t.remove(), 180); } }
  function toast(msg, withUndo) {
    dropToast();
    const t = document.createElement('div'); t.className = 'toast' + (withUndo ? ' has-action' : ''); t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button type="button" class="toast-btn" data-action="toast-undo">Undo</button>' : ''}`;
    document.body.appendChild(t); toastEl = t;
    toastT = setTimeout(dropToast, withUndo ? 5000 : 2600);
  }
  const toastUndo = msg => toast(msg, true);
  const distinct = cid => [...new Set(S.model.rows.map(r => r.v[cid]).filter(v => v !== null && v !== undefined && v !== '').map(String))];
  const colMax = cid => { const v = S.model.rows.map(r => +r.v[cid]).filter(isFinite); return v.length ? Math.max(...v) : 0; };
  const unitOf = c => { if (c.source.kind !== 'column') return ''; const k = col(c.source.column); return k && k.unit ? ' ' + k.unit : ''; };
  function errFor(where, id) { const e = S.result.errors.find(x => x.where === where && x.id === id); return e ? (e.warn ? e.msg : `${e.msg} at ${e.pos}`) : ''; }

  function normalize(m) {
    m.params = m.params || []; m.gates = m.gates || []; m.combine = m.combine || { type: 'sum', expr: '' };
    m.name = m.name || 'Untitled model';
    m.gates.forEach(g => { if (g.enabled === undefined) g.enabled = true; if (g.simple === undefined) g.simple = null; });
    m.criteria.forEach(c => {
      if (c.enabled === undefined) c.enabled = true;
      c.range = Object.assign({ auto: true, lo: null, hi: null }, c.range || {});
      c.shape = Object.assign({ type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} }, c.shape || {});
      c.direction = c.direction || 'higher';
      if (!c.missing) c.missing = 'worst';
      if (c.noise === undefined) c.noise = 0;
      c.source = c.source || { kind: 'column', column: (m.columns[0] || {}).id };
    });
    m.rows.forEach(r => { r.v = r.v || {}; });
    return m;
  }
  const isModel = m => m && m.version === 1 && Array.isArray(m.columns) && Array.isArray(m.rows) && Array.isArray(m.criteria);

  /* ---------------- store ---------------- */
  function recompute() {
    const t0 = performance.now();
    S.result = M.engine.compute(S.model);
    const dt = performance.now() - t0;
    if (S.model.rows.length >= 500 && dt > 50) console.warn(`Meridian: re-rank took ${dt.toFixed(1)} ms for ${S.model.rows.length} rows`);
  }
  function fixUi() {
    const i = S.ui.inspector;
    if (i) {
      const ok = i.kind === 'combine' || (i.kind === 'criterion' && crit(i.id)) || (i.kind === 'gate' && gate(i.id)) || (i.kind === 'param' && param(i.id)) || (i.kind === 'row' && S.model.rows.some(r => r.id === i.id));
      if (!ok) S.ui.inspector = null;
    }
    if (S.ui.selectedRow && !S.model.rows.some(r => r.id === S.ui.selectedRow)) S.ui.selectedRow = null;
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ model: S.model, advanced: S.ui.advanced })); } catch (e) { /* storage full */ } }, 400);
  }
  function settle() { recompute(); fixUi(); save(); R.all(); scheduleAnalysis(); }
  M.commit = (label, fn) => {
    const snap = gestureSnap || structuredClone(S.model); gestureSnap = null;
    if (fn(S.model) === false) { S.model = snap; recompute(); R.all(); return; }
    past.push(snap); if (past.length > 100) past.shift(); future = [];
    settle();
  };
  M.preview = fn => {
    if (!gestureSnap) gestureSnap = structuredClone(S.model);
    fn(S.model); recompute(); R.live(); scheduleAnalysis();
  };
  M.endGesture = () => {
    if (!gestureSnap) return;
    past.push(gestureSnap); if (past.length > 100) past.shift(); future = []; gestureSnap = null;
    settle();
  };
  M.undo = () => { if (!past.length) return; future.push(structuredClone(S.model)); S.model = past.pop(); settle(); };
  M.redo = () => { if (!future.length) return; past.push(structuredClone(S.model)); S.model = future.pop(); settle(); };
  function replaceModel(m) { past.push(structuredClone(S.model)); future = []; S.model = normalize(m); S.ui.inspector = null; S.ui.selectedRow = null; settle(); }

  function scheduleAnalysis() { clearTimeout(anaT); anaT = setTimeout(runAnalysis, 150); }
  function runAnalysis() {
    const m = S.model, res = S.result, sens = {};
    const step = m.rows.length > 300 ? 4 : m.rows.length > 100 ? 2 : 1;
    if (res.ranked.length > 1 && res.total > 0 && res.active.length > 1) res.active.forEach(id => { sens[id] = M.sensitivity.sweep(m, id, step); });
    S.sens = sens;
    const big = m.rows.length > 300;
    S.extra = {
      weightFree: M.engine.weightFree(m, res, big ? 500 : 2000),
      uncertainty: M.engine.uncertainty(m, res, big ? 300 : 1000),
      reversal: M.engine.reversal(m, res)
    };
    S.gaps = M.engine.honesty(m, res, sens, S.extra);
    S.flips = M.engine.flips(m, res);
    const a = document.getElementById('analysis-gaps'); if (a) a.innerHTML = gapsHTML();
    const f = document.getElementById('analysis-flips'); if (f) f.innerHTML = flipsHTML();
    const r = document.getElementById('analysis-robust'); if (r) r.innerHTML = robustHTML();
    document.querySelectorAll('[data-chance]').forEach(el => { el.textContent = chanceText(el.dataset.chance); });
  }

  /* ---------------- base64url share ---------------- */
  function b64enc(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); }

  /* ---------------- icons ---------------- */
  const ICON = {
    mark: '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="var(--brand)" stroke-width="1.5"/><path d="M14 5 L17 14 L14 23 L11 14 Z" fill="var(--brand)" opacity=".9"/><path d="M14 5 L17 14 L11 14 Z" fill="var(--brand-soft)"/><circle cx="14" cy="14" r="1.6" fill="var(--surface)"/></svg>',
    undo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 3 2 6l3 3"/><path d="M2 6h7.5a4 4 0 0 1 0 8H6"/></svg>',
    redo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M11 3l3 3-3 3"/><path d="M14 6H6.5a4 4 0 0 0 0 8H10"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12"/></svg>'
  };
  function shapeIcon(type) {
    const sh = Object.assign({ type, k: 2, a: 12, c: 0.5, width: 0.2 }, {});
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; const s = M.shapes.apply(sh, t); pts.push(`${(4 + t * 36).toFixed(1)},${(24 - s * 20).toFixed(1)}`); }
    if (type === 'step') return '<svg viewBox="0 0 44 28" aria-hidden="true"><polyline points="4,24 22,24 22,4 40,4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
    return `<svg viewBox="0 0 44 28" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  /* ---------------- render ---------------- */
  const R = M.render = {};
  R.all = () => {
    const ae = document.activeElement, fk = ae && ae.dataset ? ae.dataset.focusKey : null;
    document.getElementById('topbar').innerHTML = topHTML();
    const main = document.getElementById('main');
    if (builtView !== S.ui.view) {
      main.innerHTML = S.ui.view === 'build'
        ? '<div class="build"><aside class="recipe" id="recipe" aria-label="Recipe"></aside><section class="result" id="result" aria-label="Result"><div class="result-inner" id="result-inner"></div></section></div>'
        : '<section class="data" id="data-view" aria-label="Data"></section>';
      builtView = S.ui.view;
    }
    if (S.ui.view === 'build') { document.getElementById('recipe').innerHTML = recipeHTML(); renderResult(); }
    else document.getElementById('data-view').innerHTML = dataHTML();
    const ins = document.getElementById('inspector');
    ins.classList.toggle('open', !!S.ui.inspector);
    ins.setAttribute('aria-hidden', S.ui.inspector ? 'false' : 'true');
    ins.innerHTML = S.ui.inspector ? inspectorHTML() : '';
    document.getElementById('modal-root').innerHTML = modalHTML();
    M.ui.enhanceAll();
    if (fk) { const el = document.querySelector(`[data-focus-key="${CSS.escape(fk)}"]`); if (el && el !== document.activeElement) el.focus(); }
  };
  R.live = () => {
    if (S.ui.view === 'build') renderResult();
    const ch = document.getElementById('insp-chart');
    if (ch && S.ui.inspector && S.ui.inspector.kind === 'criterion') ch.innerHTML = chartSVG(crit(S.ui.inspector.id));
    document.querySelectorAll('[data-live]').forEach(el => { const t = liveText(el.dataset.live); if (t !== null && el.textContent !== t) el.textContent = t; });
  };
  function liveText(key) {
    const parts = key.split(':'), kind = parts[0], a = parts[1], res = S.result;
    const c = crit(a);
    switch (kind) {
      case 'share': return c && c.enabled && res.weights[a] != null ? pct(res.weights[a]) : '—';
      case 'wv': return c ? String(c.weight) : '';
      case 'param': { const p = param(a); return p ? fmtN(+p.value) : ''; }
      case 'sp': return c ? shapeParamText(c, parts[2]) : '';
      case 'map': { const cat = parts.slice(2).join(':'); return c ? fmt(+(c.shape.map[cat] ?? 0), 2) : ''; }
      case 'err': return errFor(a, parts.slice(2).join(':'));
      case 'noise': return c ? noiseText(+c.noise || 0) : '';
      case 'formula': return c && res.used.includes(a) ? M.codegen.critFormula(S.model, res, c) : '';
    }
    return null;
  }

  /* ---- top bar ---- */
  function topHTML() {
    const u = S.ui;
    return `<div class="brand">${ICON.mark}<b>Meridian</b>
      <input class="model-name" type="text" data-in="model-name" data-focus-key="name" value="${esc(S.model.name)}" size="${Math.min(28, Math.max(6, S.model.name.length + 1))}" aria-label="Model name"></div>
    <div class="center"><div class="seg" role="group" aria-label="View">
      <button data-action="set-view" data-v="build" aria-pressed="${u.view === 'build'}">Build</button>
      <button data-action="set-view" data-v="data" aria-pressed="${u.view === 'data'}">Data</button></div></div>
    <div class="right">
      ${templatesMenu('top')}
      <button class="switch" role="switch" aria-checked="${u.advanced}" data-action="toggle-advanced" data-focus-key="adv"><span class="track"></span><span class="lbl">Advanced</span></button>
      <button class="icon-btn" data-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)" ${past.length ? '' : 'disabled'}>${ICON.undo}</button>
      <button class="icon-btn" data-action="redo" aria-label="Redo" title="Redo (Shift+Ctrl+Z)" ${future.length ? '' : 'disabled'}>${ICON.redo}</button>
      <button class="btn primary" data-action="open-export">Export</button></div>`;
  }
  function templatesMenu(where) {
    return `<button class="btn sel-trigger ${where === 'top' ? 'hide-sm' : ''}" data-action="templates-menu" data-focus-key="tpl:${where}" aria-haspopup="menu" aria-expanded="false">Templates<svg class="sel-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  }

  /* ---- recipe ---- */
  const NUM_OPS = [['<=', '≤'], ['<', '<'], ['>=', '≥'], ['>', '>'], ['==', '='], ['!=', '≠']];
  function gateExpr(s) {
    const c = col(s.column); if (!c) return 'true';
    if (c.type === 'category') return `${s.column} ${s.op} ${JSON.stringify(String(s.value))}`;
    if (c.type === 'boolean') return `${s.column} ${s.op} ${s.value ? 1 : 0}`;
    return `${s.column} ${s.op} ${+s.value || 0}`;
  }
  function gateRow(g) {
    const res = S.result, err = errFor('gate', g.id);
    const fails = res.rows.filter(r => { const x = r.gates.find(y => y.id === g.id); return x && !x.pass; }).length;
    const sc = g.simple && col(g.simple.column);
    let body;
    if (sc) {
      const s = g.simple, c = sc;
      const cols = S.model.columns.map(k => `<option value="${esc(k.id)}" ${k.id === s.column ? 'selected' : ''}>${esc(k.label)}</option>`).join('');
      let ops, val;
      if (c.type === 'category') {
        ops = [['==', 'is'], ['!=', 'is not']];
        const vals = distinct(c.id); if (!vals.includes(String(s.value))) vals.unshift(String(s.value));
        val = `<select class="g-val" data-in="gate-val" data-id="${g.id}" aria-label="Value">${vals.map(v => `<option ${v === String(s.value) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
      } else if (c.type === 'boolean') {
        ops = [['==', 'is'], ['!=', 'is not']];
        val = `<select class="g-val" data-in="gate-val" data-id="${g.id}" aria-label="Value"><option value="1" ${s.value ? 'selected' : ''}>yes</option><option value="0" ${!s.value ? 'selected' : ''}>no</option></select>`;
      } else {
        ops = NUM_OPS;
        val = `<input class="g-val" type="number" data-in="gate-val" data-id="${g.id}" data-focus-key="gv:${g.id}" value="${esc(s.value)}" aria-label="Value">`;
      }
      body = `<select class="g-col" data-in="gate-col" data-id="${g.id}" aria-label="Column">${cols}</select>
        <select class="g-op" data-in="gate-op" data-id="${g.id}" aria-label="Comparison">${ops.map(o => `<option value="${o[0]}" ${o[0] === s.op ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>${val}
        ${S.ui.advanced ? `<button class="icon-btn" style="width:24px;height:24px" data-action="open" data-kind="gate" data-id="${g.id}" aria-label="Edit rule" title="Edit as formula">ƒ</button>` : ''}`;
    } else {
      body = `<button class="g-expr" data-action="open" data-kind="gate" data-id="${g.id}" title="${esc(g.label)}">${esc(g.expr)}</button><span class="tag ${err ? 'bad' : ''}">${err ? 'error' : 'custom'}</span>`;
    }
    return `<div class="gate">
      <button class="dot ${g.enabled ? '' : 'off'}" style="background:var(--ink-2)" data-action="toggle-gate" data-id="${g.id}" aria-pressed="${g.enabled}" aria-label="${g.enabled ? 'Turn off' : 'Turn on'} rule ${esc(g.label)}"></button>
      ${body}
      <span class="num faint" title="Options this rule rules out" style="font-size:var(--fs-xs);min-width:22px;text-align:right">${g.enabled && fails ? '−' + fails : ''}</span>
      <button class="x" data-action="remove-gate" data-id="${g.id}" aria-label="Remove rule">×</button></div>`;
  }
  function critMeta(c) {
    const src = c.source.kind === 'expr' ? 'formula' : ((col(c.source.column) || {}).label || c.source.column);
    const t = c.shape.type, dir = (t === 'target' || t === 'map') ? '' : (c.direction === 'lower' ? 'lower is better · ' : 'higher is better · ');
    return `${esc(src)} · ${dir}${M.shapes.META[t].label.toLowerCase()}`;
  }
  function recipeHTML() {
    const m = S.model, res = S.result, adv = S.ui.advanced;
    let h = `<section class="sec" id="rules-section"><h2>Rules <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:400">every option must pass</span></h2>`;
    if (!m.gates.length) h += '<p class="help" style="margin:0 0 8px">No rules. Every option is in the running.</p>';
    h += m.gates.map(gateRow).join('');
    h += `<button class="link" data-action="add-gate">Add a rule</button></section>`;

    h += `<section class="sec" id="criteria-section"><h2>Criteria <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:400">share of the score</span></h2>`;
    if (!m.criteria.length) h += '<p class="help" style="margin:0 0 8px">What makes one option better than another?</p>';
    m.criteria.forEach((c, i) => {
      const k = i + 1, err = errFor('criterion', c.id);
      h += `<div class="crit ${c.enabled ? '' : 'off'}">
        <div class="crit-top">
          <button class="dot ${c.enabled ? '' : 'off'}" style="background:var(--c${k})" data-action="toggle-criterion" data-id="${c.id}" aria-pressed="${c.enabled}" aria-label="${c.enabled ? 'Turn off' : 'Turn on'} ${esc(c.label)}"></button>
          <button class="crit-label" data-action="open" data-kind="criterion" data-id="${c.id}">${esc(c.label)}</button>
          ${err ? '<span class="tag bad">error</span>' : ''}
          <span class="share" data-live="share:${c.id}">${c.enabled ? pct(res.weights[c.id]) : '—'}</span>
          <button class="x" data-action="remove-criterion" data-id="${c.id}" aria-label="Remove ${esc(c.label)}">×</button></div>
        <input type="range" min="0" max="100" step="1" value="${c.weight}" data-in="weight" data-id="${c.id}" data-focus-key="w:${c.id}" style="--fill:var(--c${k});--pct:${c.weight}%" aria-label="Weight of ${esc(c.label)}" ${c.enabled ? '' : 'disabled'}>
        <div class="crit-meta">${critMeta(c)}</div></div>`;
    });
    h += `<button class="link" data-action="add-criterion">Add a criterion</button></section>`;

    const ct = m.combine.type;
    const opts = [['sum', 'Add up'], ['product', 'Multiply'], ['min', 'Weakest link']];
    if (adv || ct === 'custom') opts.push(['custom', 'Custom']);
    const help = { sum: 'Strengths make up for weaknesses.', product: 'A weak spot drags the whole score down.', min: 'Only the worst criterion counts.', custom: 'Write your own.' }[ct];
    h += `<section class="sec" id="combine-section"><h2>Combine</h2><div class="seg" role="group" aria-label="Combine method">${opts.map(o => `<button data-action="set-combine" data-v="${o[0]}" aria-pressed="${ct === o[0]}">${o[1]}</button>`).join('')}</div>
      <p class="help">${help}${ct === 'custom' ? ` <button class="link" data-action="open" data-kind="combine" data-id="combine">Edit formula</button>` : ''}</p></section>`;

    if (adv) {
      h += `<section class="sec" id="params-section"><h2>Parameters</h2>`;
      if (!m.params.length) h += '<p class="help" style="margin:0 0 8px">Named numbers you can use in any formula.</p>';
      m.params.forEach(p => {
        h += `<div class="param"><button class="p-label" data-action="open" data-kind="param" data-id="${p.id}">${esc(p.label)} <span class="mono faint" style="font-weight:400;font-size:var(--fs-xs)">${esc(p.id)}</span></button>
          <span class="num" data-live="param:${p.id}">${fmtN(+p.value)}</span>
          <button class="x" data-action="remove-param" data-id="${p.id}" aria-label="Remove parameter">×</button>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-in="param-value" data-id="${p.id}" data-focus-key="p:${p.id}" style="--pct:${((p.value - p.min) / ((p.max - p.min) || 1) * 100).toFixed(1)}%" aria-label="${esc(p.label)}"></div>`;
      });
      h += `<button class="link" data-action="add-param">Add a parameter</button></section>`;
    }
    return h;
  }

  /* ---- result ---- */
  function chip(c) {
    const k = cidx(c.id);
    return `<button class="chip" style="background:var(--t${k});border-color:var(--c${k});color:var(--k${k})" data-action="open" data-kind="criterion" data-id="${c.id}">${esc(c.label)}</button>`;
  }
  function equationHTML() {
    const m = S.model, res = S.result, act = m.criteria.filter(c => res.used.includes(c.id));
    const rules = '<span class="chip rules" title="1 if every rule passes, otherwise 0">Rules</span>';
    let inner;
    if (!act.length) inner = '…';
    else if (res.ctype === 'product') inner = act.map(c => `${chip(c)}<sup class="num" style="font-size:.45em">${res.weights[c.id].toFixed(2)}</sup>`).join(' × ');
    else if (res.ctype === 'min') inner = 'min( ' + act.map(chip).join(', ') + ' )';
    else if (res.ctype === 'custom') inner = `<span class="mono" style="font-style:normal;font-size:.6em">${esc(m.combine.expr)}</span>`;
    else inner = act.map((c, i) => `<span style="white-space:nowrap"><span class="num" style="font-style:normal;font-size:.6em">${pct(res.weights[c.id])}</span> ${chip(c)}${i === act.length - 1 ? ' ) × 100' : ''}</span>`).join(' + ');
    const tail = res.ctype === 'sum' && act.length ? '' : ' ) × 100';
    let h = `<p class="equation" id="equation">Score = ${rules} × ( ${inner}${tail}</p>`;
    const r = S.ui.selectedRow && res.byId[S.ui.selectedRow];
    if (r && act.length) {
      let n;
      const A = act.filter(c => res.active.includes(c.id));
      if (res.ctype === 'product') n = A.map(c => `${fmt(r.crit[c.id].s, 2)}^${fmt(res.weights[c.id], 2)}`).join(' × ');
      else if (res.ctype === 'min') n = 'min(' + A.map(c => fmt(r.crit[c.id].s, 2)).join(', ') + ')';
      else if (res.ctype === 'custom') n = fmt(r.S, 3);
      else n = A.map(c => `${fmt(res.weights[c.id], 2)}·${fmt(r.crit[c.id].s, 2)}`).join(' + ');
      h += `<p class="eq-nums">${esc(r.label)}: = ${r.pass ? 1 : 0} × ( ${n} ) × 100 = ${fmt(r.score, 1)}</p>`;
    }
    if (S.ui.advanced && act.length) h += `<div class="eq-lines">${act.map(c => esc(M.codegen.critFormula(m, res, c))).join('\n')}</div>`;
    return h;
  }
  function leadHTML() {
    const res = S.result, L = res.lead;
    if (!res.ranked.length) return '<p class="lead">Every option is ruled out. Loosen a rule to see a ranking.</p>';
    if (!L || L.runnerUp == null) return `<p class="lead"><b>${esc(rowLabel(res.ranked[0]))}</b> is the only option left.</p>`;
    let s = `<p class="lead"><b>${esc(rowLabel(L.winner))}</b> leads <b>${esc(rowLabel(L.runnerUp))}</b> by <span class="num">${fmt(L.margin, 1)}</span> points.`;
    if (L.driver && L.driver.pts > 0) s += ` Biggest reason: ${esc(crit(L.driver.critId).label)} (<span class="num">+${fmt(L.driver.pts, 1)}</span>).`;
    return s + '</p>';
  }
  function gapsHTML() {
    const G = S.gaps;
    const lvl = G.some(g => g.level === 'bad') ? 'bad' : G.some(g => g.level === 'warn') ? 'warn' : 'ok';
    const label = { bad: 'Has errors', warn: 'Check before trusting', ok: 'Holds up' }[lvl];
    return `<h2>Honesty check <span class="verdict ${lvl}">${label}</span></h2>
      <ul class="gaps">${G.map(g => `<li><span class="sig ${g.level}" aria-label="${g.level}"></span><span>${esc(g.text)}</span></li>`).join('') || '<li><span class="sig ok"></span><span>Nothing to flag.</span></li>'}</ul>`;
  }
  function flipsHTML() {
    const F = S.flips; if (!F.length) return '';
    const lead = rowLabel(S.result.ranked[0]);
    return `<h2>What would change first place</h2><ul class="flips">${F.map(f => `<li><b>${esc(f.label)}</b> <span class="num faint">−${fmt(f.gap, 1)}</span> ${f.opts.length
      ? 'would pass ' + esc(lead) + ' if ' + f.opts.slice(0, 3).map(o => esc(o.text)).join(', or if ') + '.'
      : '<span class="muted">cannot catch up by changing one criterion alone.</span>'}</li>`).join('')}</ul>
      <p class="help">One criterion at a time, everything else held still.</p>`;
  }
  function robustHTML() {
    if (!S.ui.advanced) return '';
    const res = S.result, ids = Object.keys(S.sens);
    if (!ids.length) return res.ranked.length > 1 && res.active.length > 1 ? '<h2>Robustness</h2><p class="help">Calculating…</p>' : '';
    const win = res.ranked[0];
    return `<h2>Robustness <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:400">who wins as one share moves from 0 to 100%</span></h2>` + ids.map(id => {
      const sw = S.sens[id], c = crit(id); if (!sw || !c) return '';
      const cur = Math.round(sw.current), run = sw.runs.find(r => cur >= r.from && cur <= r.to) || sw.runs[0];
      const runs = sw.runs.map(r => { const w = (r.to - r.from + 1) / (sw.runs[sw.runs.length - 1].to + 1 - sw.runs[0].from) * 100; const nm = r.winner ? rowLabel(r.winner) : 'none'; return `<div class="run ${r.winner === win ? 'win' : ''}" style="width:${w}%" title="${esc(nm)}: ${r.from}–${r.to}%">${esc(nm)}</div>`; }).join('');
      const cap = sw.runs.length === 1 ? `${esc(rowLabel(run.winner))} wins at any share of ${esc(c.label)}.` : `${esc(rowLabel(run.winner))} stays on top while ${esc(c.label)} is between ${run.from}% and ${run.to}%.`;
      return `<div class="strip"><div class="strip-head"><span style="font-weight:600;color:var(--k${cidx(id)})">${esc(c.label)}</span><span class="num muted">${Math.round(sw.current)}%</span></div>
        <div class="strip-bar">${runs}<span class="marker" style="left:calc(${sw.current}% - 1px)"></span></div><div class="strip-cap">${cap}</div></div>`;
    }).join('');
  }
  function chanceText(id) {
    const u = S.extra && S.extra.uncertainty; if (!u || !u.byRow[id]) return '';
    const x = u.byRow[id], p = Math.round(x.pFirst * 100);
    return `${p < 1 && x.pFirst > 0 ? '<1' : p}% first · rank ${x.lo === x.hi ? x.lo : x.lo + '–' + x.hi}`;
  }
  function rankingHTML() {
    const res = S.result, m = S.model, sum = res.ctype === 'sum';
    const rows = res.ranked.map(id => {
      const r = res.byId[id];
      let bar;
      if (sum) bar = res.active.map(cid => `<span style="width:${Math.max(0, r.crit[cid].contrib * 100)}%;background:var(--c${cidx(cid)})" title="${esc(crit(cid).label)} ${fmt(r.crit[cid].contrib * 100, 1)}"></span>`).join('');
      else bar = `<span style="width:${U.clamp(r.score, 0, 100)}%;background:var(--brand)"></span>`;
      return `<button class="rank-row ${S.ui.selectedRow === id ? 'sel' : ''}" data-action="select-row" data-id="${esc(id)}" data-row-id="${esc(id)}" aria-pressed="${S.ui.selectedRow === id}">
        <span class="rk">${r.rank}</span><span><span class="nm">${esc(r.label)}</span><span class="bar" aria-hidden="true">${bar}</span></span><span class="sc">${fmt(r.score, 1)}<span class="chance" data-chance="${esc(id)}">${esc(chanceText(id))}</span></span></button>`;
    }).join('');
    let h = `<div class="block"><h2>Ranking</h2><div class="ranking" id="ranking">${rows || '<p class="empty">Nothing is ranked.</p>'}</div></div>`;
    if (res.out.length) {
      h += `<details class="out block" ${S.ui.outOpen ? 'open' : ''} id="out-details"><summary>Ruled out · <span class="num">${res.out.length}</span></summary>
        ${res.out.map(id => { const r = res.byId[id]; const e = r.gates.find(g => !g.pass && g.error); return `<button class="out-row" data-action="select-row" data-id="${esc(id)}"><span>${esc(r.label)}</span><span class="tag ${e ? 'warn' : 'bad'}">${esc(e ? 'could not check: ' + e.error : r.failReason)}</span></button>`; }).join('')}</details>`;
    }
    void m; return h;
  }
  function renderResult() {
    const el = document.getElementById('result-inner'); if (!el) return;
    const m = S.model, res = S.result;
    const before = {};
    el.querySelectorAll('[data-row-id]').forEach(x => { before[x.dataset.rowId] = x.getBoundingClientRect().top; });
    let h;
    if (!m.rows.length) h = '<p class="empty">Add some options in Data.</p><button class="btn" data-action="set-view" data-v="data">Open Data</button>';
    else if (!m.criteria.length) h = '<p class="equation">Score = <span class="chip rules">Rules</span> × ( … ) × 100</p><p class="lead">Add a criterion to start scoring.</p><button class="btn primary" data-action="add-criterion">Add a criterion</button>';
    else {
      h = equationHTML() + leadHTML();
      if (res.total === 0 && res.used.length) h += '<p class="lead" style="color:var(--bad-k)">Give at least one criterion some weight.</p>';
      h += `<div class="block" id="analysis-gaps">${gapsHTML()}</div>`;
      h += rankingHTML();
      h += `<div class="block" id="analysis-flips">${flipsHTML()}</div>`;
      h += `<div class="block" id="analysis-robust">${robustHTML()}</div>`;
    }
    el.innerHTML = h;
    if (!reduced()) el.querySelectorAll('[data-row-id]').forEach(x => {
      const o = before[x.dataset.rowId]; if (o == null) return;
      const d = o - x.getBoundingClientRect().top; if (Math.abs(d) < 1) return;
      x.style.transition = 'none'; x.style.transform = `translateY(${d}px)`; void x.offsetHeight;
      x.style.transition = 'transform var(--t-med) var(--ease)'; x.style.transform = '';
    });
  }

  /* ---- inspector ---- */
  function noiseText(n) { return n ? `±${n}%` : 'exact'; }
  function shapeParamText(c, key) {
    const R = S.result.ranges[c.id], sh = c.shape, u = unitOf(c);
    if (key === 'k') return `${fmt(+sh.k, 2)} ${sh.k > 1 ? '(strict)' : sh.k < 1 ? '(lenient)' : ''}`;
    if (key === 'a') return fmt(+sh.a, 0);
    if (!R) return fmt(+sh[key], 2);
    const span = R.hi - R.lo;
    if (key === 'width') return `± ${fmtN(sh.width * span)}${u}`;
    const flip = c.direction === 'lower' && sh.type !== 'target';
    return `${fmtN(R.lo + (flip ? 1 - sh.c : sh.c) * span)}${u}`;
  }
  function chartSVG(c) {
    if (!c || c.shape.type === 'map') return '';
    const res = S.result, R = res.ranges[c.id]; if (!R) return '<p class="note">No chart while this criterion has an error.</p>';
    const W = 336, H = 128, p = 12, bot = H - p - 14, top = p;
    const X = u => p + u * (W - 2 * p), Y = s => bot - s * (bot - top);
    const pts = [];
    for (let i = 0; i < 64; i++) { const u = i / 63; let t = u; if (c.direction === 'lower' && c.shape.type !== 'target') t = 1 - t; pts.push(`${X(u).toFixed(1)},${Y(M.shapes.apply(c.shape, R.hi === R.lo ? 0.5 : t)).toFixed(1)}`); }
    const k = cidx(c.id);
    let dots = '', lab = '';
    res.rows.forEach(r => {
      const e = r.crit[c.id]; if (!e || typeof e.raw !== 'number') return;
      const u = R.hi === R.lo ? 0.5 : U.clamp((e.raw - R.lo) / (R.hi - R.lo), 0, 1);
      const sel = S.ui.selectedRow === r.id, cx = X(u).toFixed(1), cy = Y(e.s).toFixed(1);
      dots += r.pass ? `<circle cx="${cx}" cy="${cy}" r="${sel ? 5 : 3}" fill="var(--c${k})"><title>${esc(r.label)}: ${fmtN(e.raw)} → ${fmt(e.s, 2)}</title></circle>`
        : `<circle cx="${cx}" cy="${cy}" r="${sel ? 5 : 3}" fill="none" stroke="var(--ink-3)"><title>${esc(r.label)} (ruled out)</title></circle>`;
      if (sel) lab = `<text x="${Math.min(W - p, +cx + 8)}" y="${Math.max(top + 8, +cy - 8)}" font-size="11" fill="var(--ink)" text-anchor="${u > 0.7 ? 'end' : 'start'}" font-family="var(--sans)">${esc(r.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Shape of ${esc(c.label)} with each option as a dot">
      <line x1="${p}" y1="${bot}" x2="${W - p}" y2="${bot}" stroke="var(--line)"/><line x1="${p}" y1="${top}" x2="${W - p}" y2="${top}" stroke="var(--line)" stroke-dasharray="2 3"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--c${k})" stroke-width="1.5"/>${dots}${lab}
      <text x="${p}" y="${H - 4}" font-size="11" fill="var(--ink-3)" font-family="var(--mono)">${esc(fmtN(R.lo))}</text>
      <text x="${W - p}" y="${H - 4}" font-size="11" fill="var(--ink-3)" font-family="var(--mono)" text-anchor="end">${esc(fmtN(R.hi))}</text></svg>`;
  }
  function inspectorHTML() {
    const i = S.ui.inspector;
    let title = '', body = '';
    if (i.kind === 'criterion') { const c = crit(i.id); title = c.label; body = inspCrit(c); }
    else if (i.kind === 'gate') { const g = gate(i.id); title = g.label || 'Rule'; body = inspGate(g); }
    else if (i.kind === 'param') { const p = param(i.id); title = p.label; body = inspParam(p); }
    else if (i.kind === 'combine') { title = 'Custom formula'; body = inspCombine(); }
    else if (i.kind === 'row') { const r = S.result.byId[i.id]; title = r ? r.label : ''; body = inspRow(i.id); }
    return `<div class="insp-head"><h3>${esc(title)}</h3><button class="icon-btn" data-action="close-inspector" aria-label="Close inspector">${ICON.close}</button></div>${body}`;
  }
  function inspCrit(c) {
    const adv = S.ui.advanced, res = S.result, R = res.ranges[c.id], k = cidx(c.id);
    const srcCol = c.source.kind === 'column' ? col(c.source.column) : null;
    const isCat = srcCol && srcCol.type === 'category';
    const t = c.shape.type;
    let h = `<div class="field"><label for="ci-label">Name</label><input id="ci-label" type="text" data-in="crit-label" data-id="${c.id}" data-focus-key="cl:${c.id}" value="${esc(c.label)}"></div>`;
    const opts = S.model.columns.map(x => `<option value="col:${esc(x.id)}" ${srcCol && srcCol.id === x.id ? 'selected' : ''}>${esc(x.label)}${x.type !== 'number' ? ' (' + x.type + ')' : ''}</option>`).join('');
    h += `<div class="field"><label for="ci-src">Uses</label><select id="ci-src" data-in="crit-source" data-id="${c.id}">${opts}${adv || c.source.kind === 'expr' ? `<option value="expr" ${c.source.kind === 'expr' ? 'selected' : ''}>Expression…</option>` : ''}</select></div>`;
    if (c.source.kind === 'expr' && adv) {
      h += `<div class="field"><label for="ci-expr">Expression</label><textarea id="ci-expr" rows="2" data-in="crit-expr" data-id="${c.id}" data-focus-key="ce:${c.id}" spellcheck="false">${esc(c.source.expr)}</textarea>
        <div class="err" data-live="err:criterion:${c.id}">${esc(errFor('criterion', c.id))}</div>${namesHint(false)}</div>`;
    } else if (c.source.kind === 'expr') h += `<p class="note mono">${esc(c.source.expr)}</p><p class="note">Turn on Advanced to edit this formula.</p>`;
    if (t !== 'target' && t !== 'map') h += `<div class="field"><span class="lab">Better when</span><div class="seg" role="group" aria-label="Better when">
      <button data-action="set-direction" data-id="${c.id}" data-v="higher" aria-pressed="${c.direction === 'higher'}">Higher</button>
      <button data-action="set-direction" data-id="${c.id}" data-v="lower" aria-pressed="${c.direction === 'lower'}">Lower</button></div></div>`;
    if (isCat || t === 'map') {
      const cats = [...new Set([...(srcCol ? distinct(srcCol.id) : []), ...Object.keys(c.shape.map || {})])];
      h += `<div class="field"><span class="lab">Points per category</span>${cats.map(cat => { const v = +(c.shape.map[cat] ?? 0); return `<div class="map-row"><span style="overflow:hidden;text-overflow:ellipsis">${esc(cat)}</span>
        <input type="range" min="0" max="1" step="0.05" value="${v}" data-in="map-val" data-id="${c.id}" data-cat="${esc(cat)}" data-focus-key="mv:${c.id}:${esc(cat)}" style="--fill:var(--c${k});--pct:${v * 100}%" aria-label="Points for ${esc(cat)}">
        <span class="num" data-live="map:${c.id}:${esc(cat)}">${fmt(v, 2)}</span></div>`; }).join('') || '<p class="note">No categories in the data yet.</p>'}</div>`;
    } else {
      h += `<div class="field"><span class="lab">Shape</span><div class="shapes" role="group" aria-label="Shape">${['linear', 'curve', 'scurve', 'step', 'target'].map(s => `<button class="shape-btn" data-action="set-shape" data-id="${c.id}" data-v="${s}" aria-pressed="${t === s}" title="${esc(M.shapes.META[s].line)}">${shapeIcon(s)}${M.shapes.META[s].label}</button>`).join('')}</div>
        <p class="help">${esc(M.shapes.META[t].line)}.</p></div>`;
      const params = M.shapes.META[t].params;
      if (params.length) {
        h += '<div class="field">' + params.map(pm => {
          const v = +c.shape[pm.key];
          const numIn = adv ? (pm.raw || pm.rawWidth) && R
            ? `<input type="number" step="any" data-in="shape-raw" data-id="${c.id}" data-k="${pm.key}" value="${esc(pm.key === 'width' ? +(v * (R.hi - R.lo)).toFixed(4) : +(R.lo + ((c.direction === 'lower' && t !== 'target') ? 1 - v : v) * (R.hi - R.lo)).toFixed(4))}" aria-label="${pm.label} in raw units">`
            : `<input type="number" step="${pm.step}" min="${pm.min}" max="${pm.max}" data-in="shape-param" data-id="${c.id}" data-k="${pm.key}" value="${v}" aria-label="${pm.label}">` : '';
          return `<div class="sl"><span>${pm.label} ${pm.raw ? 'at ' : ''}<b class="num" data-live="sp:${c.id}:${pm.key}">${esc(shapeParamText(c, pm.key))}</b></span>${numIn}
            <input type="range" min="${pm.min}" max="${pm.max}" step="${pm.step}" value="${v}" data-in="shape-param" data-id="${c.id}" data-k="${pm.key}" data-focus-key="sp:${c.id}:${pm.key}" style="--fill:var(--c${k});--pct:${((v - pm.min) / (pm.max - pm.min) * 100).toFixed(1)}%" aria-label="${pm.label}"></div>`;
        }).join('') + '</div>';
      }
      h += `<div id="insp-chart">${chartSVG(c)}</div>`;
      if (R && R.hi === R.lo) h += '<p class="note" style="color:var(--warn-k)">Every row is equal here, so this criterion has no effect.</p>';
      else h += '<p class="help" style="margin-top:0">Dots are your options. Hollow dots are ruled out.</p>';
      if (adv && R) {
        h += `<div class="field"><span class="lab">Range</span><div class="range-row">
          <label><input type="checkbox" data-in="range-auto" data-id="${c.id}" ${c.range.auto ? 'checked' : ''}> Auto</label>
          <input type="number" step="any" data-in="range-lo" data-id="${c.id}" value="${esc(c.range.auto ? R.lo : c.range.lo)}" ${c.range.auto ? 'disabled' : ''} aria-label="Low end">
          <span>to</span><input type="number" step="any" data-in="range-hi" data-id="${c.id}" value="${esc(c.range.auto ? R.hi : c.range.hi)}" ${c.range.auto ? 'disabled' : ''} aria-label="High end"></div>
          <p class="help">${c.range.auto ? 'Auto uses the lowest and highest value in your data.' : 'Values outside this range are clipped to the ends.'}</p></div>`;
      }
    }
    h += `<div class="field"><div class="sl"><span>Weight <b class="num" data-live="wv:${c.id}">${c.weight}</b></span><span class="num muted">share <span data-live="share:${c.id}">${c.enabled ? pct(res.weights[c.id]) : '—'}</span></span>
      <input type="range" min="0" max="100" step="1" value="${c.weight}" data-in="weight" data-id="${c.id}" data-focus-key="iw:${c.id}" style="--fill:var(--c${k});--pct:${c.weight}%" aria-label="Weight"></div></div>`;
    const bad = res.rows.filter(r => r.crit[c.id] && r.crit[c.id].raw === null);
    const pol = c.missing || 'worst';
    h += `<div class="field"><label for="ci-miss">When a value is missing</label><select id="ci-miss" data-in="crit-missing" data-id="${c.id}">
      ${[['worst', 'Count it as the worst (0)'], ['neutral', 'Count it as the middle (0.5)'], ['best', 'Count it as the best (1)'], ['exclude', 'Rule the option out']].map(o => `<option value="${o[0]}" ${o[0] === pol ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      <p class="help">${bad.length ? `${bad.length} option${bad.length > 1 ? 's are' : ' is'} missing a value here${bad[0].crit[c.id].error && bad[0].crit[c.id].error !== 'Missing value' ? ' (' + esc(bad[0].crit[c.id].error) + ')' : ''}.` : 'No option is missing a value here.'}</p></div>`;
    if (t !== 'map') {
      const nz = +c.noise || 0;
      h += `<div class="field"><div class="sl"><span>How sure are these numbers? <b class="num" data-live="noise:${c.id}">${noiseText(nz)}</b></span><span></span>
        <input type="range" min="0" max="30" step="1" value="${nz}" data-in="crit-noise" data-id="${c.id}" data-focus-key="nz:${c.id}" style="--fill:var(--c${k});--pct:${nz / 30 * 100}%" aria-label="Error margin"></div>
        <p class="help">An error margin as a share of the range. The ranking shows each option's chance of coming first.</p></div>`;
    }
    if (adv) h += `<div class="field"><span class="lab">Formula</span><div class="mono note" data-live="formula:${c.id}">${esc(res.used.includes(c.id) ? M.codegen.critFormula(S.model, res, c) : '')}</div></div>`;
    return h;
  }
  function namesHint(combine) {
    const m = S.model;
    const names = combine ? [...m.criteria.map(c => c.id), ...m.criteria.map(c => 'w_' + c.id), ...m.params.map(p => p.id)] : [...m.columns.map(c => c.id), ...m.params.map(p => p.id)];
    return `<p class="help">Names: <span class="mono">${names.map(esc).join(', ') || 'none'}</span><br>Functions: <span class="mono">min max abs sqrt exp ln log10 pow clamp if round</span></p>`;
  }
  function inspGate(g) {
    const res = S.result, fails = res.rows.filter(r => { const x = r.gates.find(y => y.id === g.id); return x && !x.pass; }).length;
    let h = `<div class="field"><label for="gi-label">Name</label><input id="gi-label" type="text" data-in="gate-label" data-id="${g.id}" data-focus-key="gl:${g.id}" value="${esc(g.label)}"></div>`;
    if (S.ui.advanced) h += `<div class="field"><label for="gi-expr">Must be true</label><textarea id="gi-expr" rows="2" data-in="gate-expr" data-id="${g.id}" data-focus-key="ge:${g.id}" spellcheck="false">${esc(g.expr)}</textarea>
      <div class="err" data-live="err:gate:${g.id}">${esc(errFor('gate', g.id))}</div>${namesHint(false)}</div>`;
    else h += `<p class="note mono">${esc(g.expr)}</p><p class="note">Turn on Advanced to edit the formula.</p>`;
    h += `<p class="note">${g.enabled ? `Rules out <b class="num">${fails}</b> of <span class="num">${res.rows.length}</span> options.` : 'This rule is turned off.'}</p>`;
    return h;
  }
  function inspParam(p) {
    return `<div class="field"><label for="pi-label">Name</label><input id="pi-label" type="text" data-in="param-label" data-id="${p.id}" value="${esc(p.label)}"></div>
      <div class="field"><label for="pi-id">Id used in formulas</label><input id="pi-id" type="text" class="mono" data-in="param-id" data-id="${p.id}" value="${esc(p.id)}"></div>
      <div class="field"><div class="sl"><span>Value <b class="num" data-live="param:${p.id}">${fmtN(+p.value)}</b></span><span></span>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-in="param-value" data-id="${p.id}" data-focus-key="ip:${p.id}" style="--pct:${((p.value - p.min) / ((p.max - p.min) || 1) * 100).toFixed(1)}%" aria-label="Value"></div></div>
      <div class="field range-row"><label>Min <input type="number" step="any" data-in="param-min" data-id="${p.id}" value="${p.min}"></label>
        <label>Max <input type="number" step="any" data-in="param-max" data-id="${p.id}" value="${p.max}"></label>
        <label>Step <input type="number" step="any" data-in="param-step" data-id="${p.id}" value="${p.step}"></label></div>`;
  }
  function inspCombine() {
    return `<div class="field"><label for="co-expr">Score (0 to 1) =</label><textarea id="co-expr" rows="3" data-in="combine-expr" data-focus-key="co" spellcheck="false">${esc(S.model.combine.expr)}</textarea>
      <div class="err" data-live="err:combine:combine">${esc(errFor('combine', 'combine'))}</div>${namesHint(true)}
      <p class="help">A criterion id stands for its 0–1 score. <span class="mono">w_id</span> is its share.</p></div>`;
  }
  function inspRow(id) {
    const res = S.result, r = res.byId[id]; if (!r) return '';
    const lines = M.engine.trace(S.model, res, id);
    let h = `<p class="big-score">${fmt(r.score, 1)}</p><p class="note">${r.pass ? `Rank <b class="num">${r.rank}</b> of <span class="num">${res.ranked.length}</span>` : `Ruled out: ${esc(r.failReason)}`}</p>`;
    const line = l => `<div class="tl ${l.error ? 'e' : ''}"><span class="t" title="${esc(l.error || l.sub || '')}">${esc(l.text)}${l.error ? ` <span style="color:var(--bad-k)">· ${esc(l.error)}</span>` : ''}</span><span class="v">${esc(l.value)}</span></div>`;
    const gl = lines.filter(l => l.kind === 'gate' || l.kind === 'gate-total');
    h += `<div class="trace-g"><h4>Rules</h4>${gl.map(line).join('')}</div>`;
    S.model.criteria.forEach(c => {
      const cl = lines.filter(l => l.critId === c.id); if (!cl.length) return;
      h += `<div class="trace-g"><h4><span class="dot" style="background:var(--c${cidx(c.id)});cursor:default"></span>${esc(c.label)}</h4>${cl.map(line).join('')}</div>`;
    });
    h += `<div class="trace-g"><h4>Result</h4>${lines.filter(l => l.kind === 'combine' || l.kind === 'final').map(line).join('')}</div>`;
    return h;
  }

  /* ---- data view ---- */
  function dataHTML() {
    const m = S.model, adv = S.ui.advanced;
    let h = `<div class="toolbar"><button class="btn" data-action="add-row">Add row</button><button class="btn" data-action="add-column">Add column</button>
      <button class="btn" data-action="paste-csv">Paste CSV</button><button class="btn" data-action="import-json">Import model</button>${templatesMenu('data')}
      <span class="muted" style="font-size:var(--fs-sm);margin-left:auto"><span class="num">${m.rows.length}</span> options · <span class="num">${m.columns.length}</span> columns</span></div>`;
    h += `<div class="table-wrap"><table class="grid"><thead><tr><th scope="col">Option</th>`;
    m.columns.forEach(c => {
      h += `<th scope="col"><div style="display:flex;gap:4px;align-items:center"><input class="hl" type="text" data-in="col-label" data-id="${esc(c.id)}" value="${esc(c.label)}" aria-label="Column name">
        <button class="x" data-action="remove-column" data-id="${esc(c.id)}" aria-label="Remove column ${esc(c.label)}">×</button></div>
        ${adv ? `<input class="hid" type="text" data-in="col-id" data-id="${esc(c.id)}" value="${esc(c.id)}" aria-label="Column id">` : `<span class="hid">${esc(c.id)}</span>`}
        <div style="display:flex;gap:4px"><select data-in="col-type" data-id="${esc(c.id)}" aria-label="Column type">${['number', 'category', 'boolean'].map(t => `<option ${t === c.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input type="text" data-in="col-unit" data-id="${esc(c.id)}" value="${esc(c.unit || '')}" placeholder="unit" aria-label="Unit" style="width:54px;font-size:var(--fs-xs);padding:1px 4px"></div></th>`;
    });
    h += '<th class="rm"></th></tr></thead><tbody>';
    m.rows.forEach(r => {
      h += `<tr><td><input type="text" data-in="row-label" data-id="${esc(r.id)}" value="${esc(r.label)}" aria-label="Option name" style="font-weight:600"></td>`;
      m.columns.forEach(c => {
        const v = r.v[c.id];
        h += `<td><input type="text" ${c.type === 'number' ? 'inputmode="decimal" class="mono"' : ''} data-in="cell" data-id="${esc(r.id)}" data-col="${esc(c.id)}" value="${esc(v === null || v === undefined ? '' : String(v))}" aria-label="${esc(r.label)} ${esc(c.label)}"></td>`;
      });
      h += `<td class="rm"><button class="x" style="opacity:.6" data-action="remove-row" data-id="${esc(r.id)}" aria-label="Remove ${esc(r.label)}">×</button></td></tr>`;
    });
    h += '</tbody></table></div><p class="help" style="margin:0">Leave a cell empty for a missing value. The honesty check will tell you where that matters.</p>';
    return h;
  }

  /* ---- modal ---- */
  function exportText(tab) {
    const m = S.model, res = S.result;
    if (tab === 'json') return JSON.stringify(m, null, 2);
    if (tab === 'js') return M.codegen.js(m, res);
    if (tab === 'formula') return M.codegen.formula(m, res);
    return M.codegen.csv(m, res);
  }
  function modalHTML() {
    const md = S.ui.modal; if (!md) return '';
    if (md === 'csv') return `<div class="scrim" data-action="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="csv-title"><h3 id="csv-title">Paste CSV</h3>
      <p class="help">The first line is the headers. The first column is the option name. This replaces your data.</p>
      <textarea id="csv-text" rows="12" spellcheck="false" placeholder="name,price,rating&#10;Alpha,120,4.5"></textarea>
      <div class="modal-actions" style="margin-top:12px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="csv-apply">Replace data</button></div></div></div>`;
    const tabs = [['json', 'JSON'], ['js', 'JavaScript'], ['formula', 'Formula'], ['csv', 'CSV']];
    return `<div class="scrim" data-action="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ex-title"><h3 id="ex-title">Export</h3>
      <div class="seg" role="tablist">${tabs.map(t => `<button role="tab" data-action="export-tab" data-v="${t[0]}" aria-pressed="${S.ui.exportTab === t[0]}" aria-selected="${S.ui.exportTab === t[0]}">${t[1]}</button>`).join('')}</div>
      <pre id="export-pre">${esc(exportText(S.ui.exportTab))}</pre>
      <div class="modal-actions"><button class="btn" data-action="share-link">Copy share link</button><span style="flex:1"></span>
        <button class="btn" data-action="copy-export">Copy</button><button class="btn primary" data-action="download-export">Download</button><button class="btn" data-action="close-modal">Close</button></div></div></div>`;
  }

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  }
  function applyCSV(text) {
    const t = parseCSV(text.trim());
    if (t.length < 2 || t[0].length < 2) { toast('Need a header line and at least one row, with two or more columns'); return false; }
    const head = t[0].map(s => s.trim()), body = t.slice(1, 1 + LIMIT.rows);
    if (t.length - 1 > LIMIT.rows) toast('Up to 1000 rows. Extra rows were dropped');
    const taken = new Set(S.model.params.map(p => p.id));
    const cols = head.slice(1, 1 + LIMIT.columns).map((hd, j) => {
      const id = U.uniqueId(hd || 'col', taken); taken.add(id);
      const vals = body.map(r => (r[j + 1] ?? '').trim()).filter(v => v !== '');
      const type = vals.length && vals.every(v => isFinite(+v.replace(/,/g, ''))) ? 'number' : vals.length && vals.every(v => /^(true|false)$/i.test(v)) ? 'boolean' : 'category';
      return { id, label: hd || id, type, unit: '' };
    });
    const rows = body.map((r, i) => {
      const v = {};
      cols.forEach((c, j) => { const x = (r[j + 1] ?? '').trim(); v[c.id] = x === '' ? null : c.type === 'number' ? +x.replace(/,/g, '') : c.type === 'boolean' ? /^true$/i.test(x) : x; });
      return { id: 'r' + (i + 1), label: (r[0] || 'Row ' + (i + 1)).trim(), v };
    });
    M.commit('Paste CSV', m => {
      m.columns = cols; m.rows = rows;
      const ids = new Set(cols.map(c => c.id));
      const before = m.criteria.length + m.gates.length;
      m.criteria = m.criteria.filter(c => c.source.kind === 'expr' || ids.has(c.source.column));
      m.gates = m.gates.filter(g => !g.simple || ids.has(g.simple.column));
      const dropped = before - m.criteria.length - m.gates.length;
      if (dropped) setTimeout(() => toast(`${dropped} criteria or rules used old columns and were removed`), 50);
    });
    return true;
  }

  /* ---------------- rename ---------------- */
  function validNewId(neu, old, kind) {
    const m = S.model;
    if (!U.ID_RE.test(neu)) return 'Ids use a–z, 0–9 and _, and start with a letter';
    if (M.expr.RESERVED.has(neu)) return `'${neu}' is a reserved word`;
    const others = [...m.columns.map(c => c.id), ...m.params.map(p => p.id), ...(kind === 'param' ? m.criteria.map(c => c.id) : [])].filter(x => x !== old);
    if (others.includes(neu)) return `'${neu}' is already used`;
    return null;
  }
  function renameIn(m, old, neu, kind) {
    m.gates.forEach(g => { g.expr = M.expr.rename(g.expr, old, neu); if (g.simple && g.simple.column === old) g.simple.column = neu; });
    m.criteria.forEach(c => {
      if (c.source.kind === 'expr') c.source.expr = M.expr.rename(c.source.expr, old, neu);
      else if (kind === 'column' && c.source.column === old) c.source.column = neu;
    });
    if (kind === 'param') m.combine.expr = M.expr.rename(m.combine.expr, old, neu);
  }

  /* ---------------- input handlers ---------------- */
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const IN = {
    'model-name': (m, el) => { m.name = el.value.trim() || 'Untitled model'; },
    'weight': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).weight = +el.value; },
    'gate-col': (m, el) => {
      const g = m.gates.find(x => x.id === el.dataset.id), c = col(el.value); if (!c) return false;
      g.simple = c.type === 'category' ? { column: c.id, op: '==', value: distinct(c.id)[0] || '' } : c.type === 'boolean' ? { column: c.id, op: '==', value: 1 } : { column: c.id, op: '<=', value: colMax(c.id) };
      g.expr = gateExpr(g.simple); g.label = c.label + ' rule';
    },
    'gate-op': (m, el) => { const g = m.gates.find(x => x.id === el.dataset.id); g.simple.op = el.value; g.expr = gateExpr(g.simple); },
    'gate-val': (m, el) => {
      const g = m.gates.find(x => x.id === el.dataset.id), c = col(g.simple.column);
      g.simple.value = c.type === 'number' ? num(el.value) : c.type === 'boolean' ? +el.value : el.value;
      g.expr = gateExpr(g.simple);
    },
    'param-value': (m, el) => { m.params.find(p => p.id === el.dataset.id).value = +el.value; },
    'crit-label': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).label = el.value || 'Untitled'; },
    'crit-source': (m, el) => {
      const c = m.criteria.find(x => x.id === el.dataset.id);
      if (el.value === 'expr') { const was = c.source.kind === 'column' ? c.source.column : '0'; c.source = { kind: 'expr', expr: was }; if (c.shape.type === 'map') c.shape.type = 'linear'; return; }
      const cid = el.value.slice(4), k = col(cid);
      c.source = { kind: 'column', column: cid }; c.range = { auto: true, lo: null, hi: null };
      if (k.type === 'category') { c.shape.type = 'map'; const mp = {}; distinct(cid).forEach(v => { mp[v] = c.shape.map[v] ?? 0.5; }); c.shape.map = mp; }
      else if (c.shape.type === 'map') c.shape.type = 'linear';
    },
    'crit-missing': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).missing = el.value; },
    'crit-noise': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).noise = +el.value; },
    'crit-expr': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).source.expr = el.value; },
    'shape-param': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).shape[el.dataset.k] = +el.value; },
    'shape-raw': (m, el) => {
      const c = m.criteria.find(x => x.id === el.dataset.id), R = S.result.ranges[c.id]; if (!R || R.hi === R.lo) return;
      const span = R.hi - R.lo, v = num(el.value);
      if (el.dataset.k === 'width') c.shape.width = U.clamp(v / span, 0.05, 1);
      else { let t = (v - R.lo) / span; if (c.direction === 'lower' && c.shape.type !== 'target') t = 1 - t; c.shape.c = U.clamp(t, 0, 1); }
    },
    'range-auto': (m, el) => { const c = m.criteria.find(x => x.id === el.dataset.id), R = S.result.ranges[c.id]; c.range.auto = el.checked; if (!el.checked && R) { c.range.lo = R.lo; c.range.hi = R.hi; } },
    'range-lo': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).range.lo = num(el.value); },
    'range-hi': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).range.hi = num(el.value); },
    'map-val': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).shape.map[el.dataset.cat] = +el.value; },
    'gate-label': (m, el) => { m.gates.find(g => g.id === el.dataset.id).label = el.value; },
    'gate-expr': (m, el) => { const g = m.gates.find(x => x.id === el.dataset.id); g.expr = el.value; g.simple = null; },
    'param-label': (m, el) => { m.params.find(p => p.id === el.dataset.id).label = el.value || 'Parameter'; },
    'param-min': (m, el) => { m.params.find(p => p.id === el.dataset.id).min = num(el.value); },
    'param-max': (m, el) => { m.params.find(p => p.id === el.dataset.id).max = num(el.value); },
    'param-step': (m, el) => { const v = num(el.value); m.params.find(p => p.id === el.dataset.id).step = v > 0 ? v : 1; },
    'param-id': (m, el) => {
      const old = el.dataset.id, neu = el.value.trim(); if (neu === old) return;
      const e = validNewId(neu, old, 'param'); if (e) { toast(e); return false; }
      m.params.find(p => p.id === old).id = neu; renameIn(m, old, neu, 'param');
      if (S.ui.inspector && S.ui.inspector.id === old) S.ui.inspector.id = neu;
    },
    'combine-expr': (m, el) => { m.combine.expr = el.value; },
    'cell': (m, el) => {
      const r = m.rows.find(x => x.id === el.dataset.id), c = m.columns.find(x => x.id === el.dataset.col), s = el.value.trim();
      r.v[c.id] = s === '' ? null : c.type === 'number' ? (isFinite(+s.replace(/,/g, '')) ? +s.replace(/,/g, '') : null) : c.type === 'boolean' ? /^(true|yes|1|y)$/i.test(s) : s;
      if (c.type === 'number' && s !== '' && r.v[c.id] === null) setTimeout(() => toast('That is not a number, so the cell is now empty'), 30);
    },
    'row-label': (m, el) => { m.rows.find(x => x.id === el.dataset.id).label = el.value.trim() || 'Untitled'; },
    'col-label': (m, el) => { m.columns.find(x => x.id === el.dataset.id).label = el.value.trim() || el.dataset.id; },
    'col-unit': (m, el) => { m.columns.find(x => x.id === el.dataset.id).unit = el.value.trim(); },
    'col-id': (m, el) => {
      const old = el.dataset.id, neu = el.value.trim(); if (neu === old) return;
      const e = validNewId(neu, old, 'column'); if (e) { toast(e); return false; }
      m.columns.find(c => c.id === old).id = neu;
      m.rows.forEach(r => { r.v[neu] = r.v[old]; delete r.v[old]; });
      renameIn(m, old, neu, 'column');
    },
    'col-type': (m, el) => {
      const c = m.columns.find(x => x.id === el.dataset.id), t = el.value; c.type = t;
      m.rows.forEach(r => { const v = r.v[c.id]; if (v === null || v === undefined) return; r.v[c.id] = t === 'number' ? (isFinite(+v) ? +v : null) : t === 'boolean' ? /^(true|yes|1)$/i.test(String(v)) : String(v); });
      m.criteria.forEach(k => {
        if (k.source.kind !== 'column' || k.source.column !== c.id) return;
        if (t === 'category') { k.shape.type = 'map'; const mp = {}; distinct(c.id).forEach(v => { mp[v] = 0.5; }); k.shape.map = mp; } else if (k.shape.type === 'map') k.shape.type = 'linear';
      });
      m.gates.forEach(g => { if (g.simple && g.simple.column === c.id) { g.simple = t === 'category' ? { column: c.id, op: '==', value: '' } : t === 'boolean' ? { column: c.id, op: '==', value: 1 } : { column: c.id, op: '<=', value: 0 }; g.expr = gateExpr(g.simple); } });
    }
  };
  const COMMIT_ONLY = new Set(['cell', 'row-label', 'col-label', 'col-id', 'col-unit', 'param-id', 'col-type', 'crit-source', 'range-auto', 'gate-col', 'gate-op']);

  document.addEventListener('input', e => {
    const el = e.target, k = el.dataset && el.dataset.in; if (!k || !IN[k]) return;
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || COMMIT_ONLY.has(k)) return;
    if (el.type === 'range') el.style.setProperty('--pct', ((el.value - el.min) / ((el.max - el.min) || 1) * 100) + '%');
    if (k === 'model-name') return;
    M.preview(m => IN[k](m, el));
  });
  document.addEventListener('change', e => {
    const el = e.target, k = el.dataset && el.dataset.in; if (!k || !IN[k]) return;
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || COMMIT_ONLY.has(k) || k === 'model-name') M.commit(k, m => IN[k](m, el));
    else { M.preview(m => IN[k](m, el)); M.endGesture(); }
  });
  document.addEventListener('toggle', e => { if (e.target.id === 'out-details') S.ui.outOpen = e.target.open; }, true);

  /* ---------------- click actions ---------------- */
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }
  async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg || 'Copied'); } catch (e) { toast('Copy failed. Select the text and copy it by hand'); } }
  function ui(fn) { fn(S.ui); R.all(); }
  function newCritFor(m) {
    const used = new Set(m.criteria.filter(c => c.source.kind === 'column').map(c => c.source.column));
    const taken = new Set([...m.criteria.map(c => c.id), ...m.params.map(p => p.id)]);
    const pick = m.columns.find(c => c.type === 'number' && !used.has(c.id)) || m.columns.find(c => !used.has(c.id));
    if (!pick) return null;
    const id = taken.has(pick.id) || M.expr.RESERVED.has(pick.id) ? U.uniqueId(pick.id, taken) : pick.id;
    const shape = { type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} };
    if (pick.type === 'category') { shape.type = 'map'; distinct(pick.id).forEach(v => { shape.map[v] = 0.5; }); }
    return { id, label: pick.label, enabled: true, weight: 20, source: { kind: 'column', column: pick.id }, direction: 'higher', range: { auto: true, lo: null, hi: null }, shape };
  }
  const A = {
    'set-view': el => ui(u => { u.view = el.dataset.v; }),
    'toggle-advanced': () => { S.ui.advanced = !S.ui.advanced; save(); R.all(); if (S.ui.advanced) runAnalysis(); },
    'undo': () => M.undo(), 'redo': () => M.redo(),
    'open-export': () => ui(u => { u.modal = 'export'; }),
    'close-modal': () => ui(u => { u.modal = null; }),
    'scrim': (el, id, e) => { if (e.target === el) ui(u => { u.modal = null; }); },
    'export-tab': el => ui(u => { u.exportTab = el.dataset.v; }),
    'copy-export': () => copy(exportText(S.ui.exportTab)),
    'download-export': () => {
      const t = S.ui.exportTab, ext = { json: 'json', js: 'js', formula: 'txt', csv: 'csv' }[t];
      download(U.slug(S.model.name) + '.' + ext, exportText(t), { json: 'application/json', js: 'text/javascript', formula: 'text/plain', csv: 'text/csv' }[t]);
    },
    'import-json': () => document.getElementById('import-file').click(),
    'share-link': () => {
      const url = location.href.split('#')[0] + '#m=' + b64enc(JSON.stringify(S.model));
      if (url.length > 8000) toast('This link is very long and may not open everywhere. Export JSON instead');
      copy(url, 'Share link copied');
    },
    'add-criterion': () => {
      if (S.model.criteria.length >= LIMIT.criteria) return toast('Up to 8 criteria');
      const c = newCritFor(S.model); if (!c) return toast(S.model.columns.length ? 'Every column is already used. Add a column in Data' : 'Add a column in Data first');
      M.commit('Add criterion', m => { m.criteria.push(c); }); ui(u => { u.inspector = { kind: 'criterion', id: c.id }; });
    },
    'remove-criterion': (el, id) => { const c = crit(id); M.commit('Remove criterion', m => { m.criteria = m.criteria.filter(x => x.id !== id); }); toastUndo(`Removed ${c.label}`); },
    'toggle-criterion': (el, id) => M.commit('Toggle criterion', m => { const c = m.criteria.find(x => x.id === id); c.enabled = !c.enabled; }),
    'add-gate': () => {
      const m = S.model; if (m.gates.length >= LIMIT.gates) return toast('Up to 8 rules');
      if (!m.columns.length) return toast('Add a column in Data first');
      const c = m.columns.find(x => x.type === 'number') || m.columns[0];
      const simple = c.type === 'number' ? { column: c.id, op: '<=', value: colMax(c.id) } : c.type === 'boolean' ? { column: c.id, op: '==', value: 1 } : { column: c.id, op: '==', value: distinct(c.id)[0] || '' };
      const ids = new Set(m.gates.map(g => g.id)); let n = 1; while (ids.has('g' + n)) n++;
      M.commit('Add rule', mm => { mm.gates.push({ id: 'g' + n, label: c.label + ' rule', expr: gateExpr(simple), enabled: true, simple }); });
    },
    'remove-gate': (el, id) => { const g = gate(id); M.commit('Remove rule', m => { m.gates = m.gates.filter(x => x.id !== id); }); toastUndo(`Removed ${g.label || 'rule'}`); },
    'toggle-gate': (el, id) => M.commit('Toggle rule', m => { const g = m.gates.find(x => x.id === id); g.enabled = !g.enabled; }),
    'add-param': () => {
      const m = S.model; if (m.params.length >= LIMIT.params) return toast('Up to 12 parameters');
      const id = U.uniqueId('p', new Set([...m.columns.map(c => c.id), ...m.params.map(p => p.id), ...m.criteria.map(c => c.id)]));
      M.commit('Add parameter', mm => { mm.params.push({ id, label: 'New parameter', value: 1, min: 0, max: 10, step: 0.1 }); });
      ui(u => { u.inspector = { kind: 'param', id }; });
    },
    'remove-param': (el, id) => {
      const p = param(id), users = [...S.model.gates.map(g => g.expr), ...S.model.criteria.filter(c => c.source.kind === 'expr').map(c => c.source.expr), S.model.combine.expr].filter(s => M.expr.idents(s).some(t => t.name === id)).length;
      M.commit('Remove parameter', m => { m.params = m.params.filter(x => x.id !== id); });
      toastUndo(users ? `Removed ${p.label}. ${users} formula${users > 1 ? 's' : ''} now show an error` : `Removed ${p.label}`);
    },
    'open': el => ui(u => { u.inspector = { kind: el.dataset.kind, id: el.dataset.id }; }),
    'close-inspector': () => ui(u => { if (u.inspector && u.inspector.kind === 'row') u.selectedRow = null; u.inspector = null; }),
    'select-row': (el, id) => ui(u => { u.selectedRow = id; u.inspector = { kind: 'row', id }; }),
    'set-combine': el => {
      const v = el.dataset.v;
      M.commit('Combine', m => {
        m.combine.type = v;
        if (v === 'custom' && !m.combine.expr) m.combine.expr = m.criteria.filter(c => c.enabled).map(c => `w_${c.id} * ${c.id}`).join(' + ') || '0';
      });
      if (v === 'custom') ui(u => { u.inspector = { kind: 'combine', id: 'combine' }; });
    },
    'set-shape': (el, id) => M.commit('Shape', m => { const c = m.criteria.find(x => x.id === id); c.shape.type = el.dataset.v; }),
    'set-direction': (el, id) => M.commit('Direction', m => { m.criteria.find(x => x.id === id).direction = el.dataset.v; }),
    'templates-menu': el => {
      const hints = { laptop: 'Simple', jobs: 'Every shape', features: 'Formula + parameter', care: 'Ported demo', blank: 'Start empty' };
      M.ui.list(el, M.templates.list.map(t => ({ label: t.label, value: t.id, hint: hints[t.id] || '' })), async id => {
        const t = M.templates.list.find(x => x.id === id);
        const ok = await M.ui.confirm({ title: `Load “${t.label}”?`, body: 'This replaces the current model. You can undo it.', ok: 'Load template' });
        if (ok) { replaceModel(M.templates.get(id)); toastUndo(`Loaded ${t.label}`); }
      }, { role: 'menu', label: 'Templates', align: 'end', minWidth: 240 });
    },
    'add-row': () => {
      const m = S.model; if (m.rows.length >= LIMIT.rows) return toast('Up to 1000 rows');
      const ids = new Set(m.rows.map(r => r.id)); let n = m.rows.length + 1; while (ids.has('r' + n)) n++;
      M.commit('Add row', mm => { const v = {}; mm.columns.forEach(c => { v[c.id] = null; }); mm.rows.push({ id: 'r' + n, label: 'New option', v }); });
    },
    'remove-row': (el, id) => { const r = S.model.rows.find(x => x.id === id); M.commit('Remove row', m => { m.rows = m.rows.filter(x => x.id !== id); }); toastUndo(`Removed ${r ? r.label : 'row'}`); },
    'add-column': () => {
      const m = S.model; if (m.columns.length >= LIMIT.columns) return toast('Up to 24 columns');
      const id = U.uniqueId('col', new Set([...m.columns.map(c => c.id), ...m.params.map(p => p.id)]));
      M.commit('Add column', mm => { mm.columns.push({ id, label: 'New column', type: 'number', unit: '' }); mm.rows.forEach(r => { r.v[id] = null; }); });
    },
    'remove-column': async (el, id) => {
      const m = S.model, c = col(id), deps = m.criteria.filter(k => k.source.kind === 'column' && k.source.column === id).length + m.gates.filter(g => g.simple && g.simple.column === id).length;
      if (deps && !(await M.ui.confirm({ title: `Remove “${c.label}”?`, body: `${deps} ${deps > 1 ? 'criteria or rules use' : 'criterion or rule uses'} this column and will be removed with it. You can undo this.`, ok: 'Remove column', danger: true }))) return;
      setTimeout(() => toastUndo(`Removed ${c.label}`), 0);
      M.commit('Remove column', mm => {
        mm.columns = mm.columns.filter(c => c.id !== id); mm.rows.forEach(r => { delete r.v[id]; });
        mm.criteria = mm.criteria.filter(c => !(c.source.kind === 'column' && c.source.column === id));
        mm.gates = mm.gates.filter(g => !(g.simple && g.simple.column === id));
      });
    },
    'paste-csv': () => ui(u => { u.modal = 'csv'; }),
    'toast-undo': () => { M.undo(); dropToast(); },
    'csv-apply': () => { const t = document.getElementById('csv-text').value; if (applyCSV(t)) ui(u => { u.modal = null; }); }
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const f = A[el.dataset.action]; if (f) f(el, el.dataset.id, e);
  });
  document.addEventListener('keydown', e => {
    const tgt = e.target, typing = tgt.matches && tgt.matches('input[type=text],input[type=number],textarea');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? M.redo() : M.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); M.redo(); }
    else if (e.key === 'Escape') {
      if (M.ui.isListOpen() || document.querySelector('#dialog-root .scrim')) return;
      if (S.ui.modal) ui(u => { u.modal = null; });
      else if (S.ui.inspector) A['close-inspector']();
    }
  });

  /* ---------------- boot ---------------- */
  function boot() {
    const f = document.getElementById('import-file');
    f.addEventListener('change', async () => {
      const file = f.files[0]; f.value = ''; if (!file) return;
      try { const m = JSON.parse(await file.text()); if (!isModel(m)) throw 0; replaceModel(m); ui(u => { u.modal = null; }); toast('Model imported'); }
      catch (e) { toast("That file isn't a Meridian model"); }
    });
    let model = null;
    const hm = /#m=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (hm) { try { const m = JSON.parse(b64dec(hm[1])); if (isModel(m)) model = m; } catch (e) { /* bad link */ }
      if (!model) setTimeout(() => toast("That link doesn't hold a Meridian model"), 100);
      history.replaceState(null, '', location.pathname + location.search); // DECISION: drop the hash so later edits persist on reload
    }
    if (!model) { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && isModel(s.model)) { model = s.model; S.ui.advanced = !!s.advanced; } } catch (e) { /* ignore */ } }
    if (!model) model = M.templates.get('laptop'); // DECISION: a general-purpose starter instead of Care routing
    S.model = normalize(model);
    recompute(); R.all(); runAnalysis();
  }
  M.app = { boot, applyCSV, parseCSV };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.M);
