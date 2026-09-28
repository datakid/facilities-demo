window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, U = M.util, R = M.render, LIMIT = H.LIMIT;
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const colMax = cid => { const v = S.model.rows.map(r => +r.v[cid]).filter(isFinite); return v.length ? Math.max(...v) : 0; };

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
    if (t.length < 2 || t[0].length < 2) { H.toast('Need a header line and at least one row, with two or more columns'); return false; }
    const head = t[0].map(s => s.trim()), body = t.slice(1, 1 + LIMIT.rows);
    if (t.length - 1 > LIMIT.rows) H.toast('Up to 1000 rows. Extra rows were dropped');
    const taken = new Set([...S.model.params.map(p => p.id), ...S.model.calcs.map(k => k.id)]);
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
      m.criteria = m.criteria.filter(c => c.source.kind !== 'column' || ids.has(c.source.column));
      m.gates = m.gates.filter(g => !g.simple || ids.has(g.simple.column));
      const dropped = before - m.criteria.length - m.gates.length;
      if (dropped) setTimeout(() => H.toast(`${dropped} criteria or rules used old columns and were removed`), 50);
    });
    return true;
  }

  function validNewId(neu, old) {
    const m = S.model;
    if (!U.ID_RE.test(neu)) return 'Ids use a–z, 0–9 and _, and start with a letter';
    if (M.expr.RESERVED.has(neu)) return `'${neu}' is a reserved word`;
    const others = [...m.columns.map(c => c.id), ...m.params.map(p => p.id), ...m.calcs.map(k => k.id), ...m.criteria.map(c => c.id)].filter(x => x !== old);
    if (others.includes(neu)) return `'${neu}' is already used`;
    return null;
  }
  function renameIn(m, old, neu, kind) {
    m.gates.forEach(g => { g.expr = M.expr.rename(g.expr, old, neu); if (g.simple && g.simple.column === old) g.simple.column = neu; });
    m.calcs.forEach(k => { k.expr = M.expr.rename(k.expr, old, neu); });
    m.criteria.forEach(c => {
      if (c.source.kind === 'expr') c.source.expr = M.expr.rename(c.source.expr, old, neu);
      else if (kind === 'column' && c.source.kind === 'column' && c.source.column === old) c.source.column = neu;
      else if (kind === 'calc' && c.source.kind === 'calc' && c.source.calc === old) c.source.calc = neu;
    });
    if (kind === 'param') {
      m.combine.expr = M.expr.rename(m.combine.expr, old, neu);
      m.stress = m.stress.map(x => x === old ? neu : x);
      m.scenarios.forEach(s => { if (s.values && old in s.values) { s.values[neu] = s.values[old]; delete s.values[old]; } });
    }
  }
  const guessLower = s => /wait|cost|load|slip|error|downtime|latency|time|loss|density|util|price|queue|busiest/i.test(s);

  const IN = {
    'model-name': (m, el) => { m.name = el.value.trim() || 'Untitled model'; },
    'weight': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).weight = +el.value; },
    'gate-col': (m, el) => {
      const g = m.gates.find(x => x.id === el.dataset.id), c = H.col(el.value); if (!c) return false;
      g.simple = c.type === 'category' ? { column: c.id, op: '==', value: H.distinct(c.id)[0] || '' } : c.type === 'boolean' ? { column: c.id, op: '==', value: 1 } : { column: c.id, op: '<=', value: colMax(c.id) };
      g.expr = R.gateExpr(g.simple); g.label = c.label + ' rule';
    },
    'gate-op': (m, el) => { const g = m.gates.find(x => x.id === el.dataset.id); g.simple.op = el.value; g.expr = R.gateExpr(g.simple); },
    'gate-val': (m, el) => {
      const g = m.gates.find(x => x.id === el.dataset.id), c = H.col(g.simple.column);
      g.simple.value = c.type === 'number' ? num(el.value) : c.type === 'boolean' ? +el.value : el.value;
      g.expr = R.gateExpr(g.simple);
    },
    'param-value': (m, el) => { m.params.find(p => p.id === el.dataset.id).value = +el.value; },
    'param-exact': (m, el) => {
      const p = m.params.find(x => x.id === el.dataset.id), v = parseFloat(el.value); if (!isFinite(v)) return false;
      p.value = v; if (v < p.min) p.min = v; if (v > p.max) p.max = v;
    },
    'param-stress': (m, el) => { const id = el.dataset.id; m.stress = m.stress.filter(x => x !== id); if (el.checked) m.stress.push(id); },
    'param-group': (m, el) => { m.params.find(p => p.id === el.dataset.id).group = el.value.trim() || 'Knobs'; },
    'param-unit': (m, el) => { m.params.find(p => p.id === el.dataset.id).unit = el.value.trim(); },
    'crit-label': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).label = el.value || 'Untitled'; },
    'crit-source': (m, el) => {
      const c = m.criteria.find(x => x.id === el.dataset.id);
      if (el.value === 'expr') { const was = c.source.kind === 'column' ? c.source.column : c.source.kind === 'calc' ? c.source.calc : '0'; c.source = { kind: 'expr', expr: was }; if (c.shape.type === 'map') c.shape.type = 'linear'; return; }
      c.range = { auto: true, lo: null, hi: null };
      if (el.value.startsWith('calc:')) { c.source = { kind: 'calc', calc: el.value.slice(5) }; if (c.shape.type === 'map') c.shape.type = 'linear'; return; }
      const cid = el.value.slice(4), k = H.col(cid);
      c.source = { kind: 'column', column: cid };
      if (k.type === 'category') { c.shape.type = 'map'; const mp = {}; [...H.distinct(cid), ...(k.choices || [])].forEach(v => { mp[v] = c.shape.map[v] ?? 0.5; }); c.shape.map = mp; }
      else if (c.shape.type === 'map') c.shape.type = 'linear';
    },
    'crit-missing': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).missing = el.value; },
    'crit-noise': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).noise = +el.value; },
    'crit-expr': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).source.expr = el.value; },
    'shape-param': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).shape[el.dataset.k] = +el.value; },
    'shape-raw': (m, el) => {
      const c = m.criteria.find(x => x.id === el.dataset.id), Rg = S.result.ranges[c.id]; if (!Rg || Rg.hi === Rg.lo) return;
      const span = Rg.hi - Rg.lo, v = num(el.value);
      if (el.dataset.k === 'width') c.shape.width = U.clamp(v / span, 0.05, 1);
      else { let t = (v - Rg.lo) / span; if (c.direction === 'lower' && c.shape.type !== 'target') t = 1 - t; c.shape.c = U.clamp(t, 0, 1); }
    },
    'range-auto': (m, el) => { const c = m.criteria.find(x => x.id === el.dataset.id), Rg = S.result.ranges[c.id]; c.range.auto = el.checked; if (!el.checked && Rg) { c.range.lo = isFinite(Rg.lo) ? Rg.lo : 0; c.range.hi = isFinite(Rg.hi) ? Rg.hi : 1; } },
    'range-lo': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).range.lo = num(el.value); },
    'range-hi': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).range.hi = num(el.value); },
    'map-val': (m, el) => { m.criteria.find(c => c.id === el.dataset.id).shape.map[el.dataset.cat] = +el.value; },
    'gate-label': (m, el) => { m.gates.find(g => g.id === el.dataset.id).label = el.value; },
    'gate-expr': (m, el) => { const g = m.gates.find(x => x.id === el.dataset.id); g.expr = el.value; g.simple = null; },
    'param-label': (m, el) => { m.params.find(p => p.id === el.dataset.id).label = el.value || 'Knob'; },
    'param-min': (m, el) => { m.params.find(p => p.id === el.dataset.id).min = num(el.value); },
    'param-max': (m, el) => { m.params.find(p => p.id === el.dataset.id).max = num(el.value); },
    'param-step': (m, el) => { const v = num(el.value); m.params.find(p => p.id === el.dataset.id).step = v > 0 ? v : 1; },
    'param-id': (m, el) => {
      const old = el.dataset.id, neu = el.value.trim(); if (neu === old) return;
      const e = validNewId(neu, old); if (e) { H.toast(e); return false; }
      m.params.find(p => p.id === old).id = neu; renameIn(m, old, neu, 'param');
      if (S.ui.inspector && S.ui.inspector.id === old) S.ui.inspector.id = neu;
    },
    'calc-expr': (m, el) => { m.calcs.find(k => k.id === el.dataset.id).expr = el.value; },
    'calc-label': (m, el) => { m.calcs.find(k => k.id === el.dataset.id).label = el.value || 'Calculation'; },
    'calc-unit': (m, el) => { m.calcs.find(k => k.id === el.dataset.id).unit = el.value.trim(); },
    'calc-group': (m, el) => { m.calcs.find(k => k.id === el.dataset.id).group = el.value.trim(); },
    'calc-format': (m, el) => { m.calcs.find(k => k.id === el.dataset.id).format = el.value; },
    'calc-pin': (m, el) => { m.calcs.find(k => k.id === el.dataset.id).pin = el.checked; },
    'calc-id': (m, el) => {
      const old = el.dataset.id, neu = el.value.trim(); if (neu === old) return;
      const e = validNewId(neu, old); if (e) { H.toast(e); return false; }
      m.calcs.find(k => k.id === old).id = neu; renameIn(m, old, neu, 'calc');
      if (S.ui.inspector && S.ui.inspector.id === old) S.ui.inspector.id = neu;
    },
    'scen-label': (m, el) => { m.scenarios.find(s => s.id === el.dataset.id).label = el.value.trim() || 'Scenario'; },
    'combine-expr': (m, el) => { m.combine.expr = el.value; },
    'cell': (m, el) => {
      const r = m.rows.find(x => x.id === el.dataset.id), c = m.columns.find(x => x.id === el.dataset.col), s = el.value.trim();
      r.v[c.id] = s === '' ? null : c.type === 'number' ? (isFinite(+s.replace(/,/g, '')) ? +s.replace(/,/g, '') : null) : c.type === 'boolean' ? /^(true|yes|1|y)$/i.test(s) : s;
      if (c.type === 'number' && s !== '' && r.v[c.id] === null) setTimeout(() => H.toast('That is not a number, so the cell is now empty'), 30);
    },
    'row-label': (m, el) => { m.rows.find(x => x.id === el.dataset.id).label = el.value.trim() || 'Untitled'; },
    'col-label': (m, el) => { m.columns.find(x => x.id === el.dataset.id).label = el.value.trim() || el.dataset.id; },
    'col-unit': (m, el) => { m.columns.find(x => x.id === el.dataset.id).unit = el.value.trim(); },
    'col-id': (m, el) => {
      const old = el.dataset.id, neu = el.value.trim(); if (neu === old) return;
      const e = validNewId(neu, old); if (e) { H.toast(e); return false; }
      m.columns.find(c => c.id === old).id = neu;
      m.rows.forEach(r => { r.v[neu] = r.v[old]; delete r.v[old]; });
      renameIn(m, old, neu, 'column');
    },
    'col-type': (m, el) => {
      const c = m.columns.find(x => x.id === el.dataset.id), t = el.value; c.type = t; if (t !== 'category') delete c.choices;
      m.rows.forEach(r => { const v = r.v[c.id]; if (v === null || v === undefined) return; r.v[c.id] = t === 'number' ? (isFinite(+v) ? +v : null) : t === 'boolean' ? /^(true|yes|1)$/i.test(String(v)) : String(v); });
      m.criteria.forEach(k => {
        if (k.source.kind !== 'column' || k.source.column !== c.id) return;
        if (t === 'category') { k.shape.type = 'map'; const mp = {}; H.distinct(c.id).forEach(v => { mp[v] = 0.5; }); k.shape.map = mp; } else if (k.shape.type === 'map') k.shape.type = 'linear';
      });
      m.gates.forEach(g => { if (g.simple && g.simple.column === c.id) { g.simple = t === 'category' ? { column: c.id, op: '==', value: '' } : t === 'boolean' ? { column: c.id, op: '==', value: 1 } : { column: c.id, op: '<=', value: 0 }; g.expr = R.gateExpr(g.simple); } });
    }
  };
  const COMMIT_ONLY = new Set(['cell', 'row-label', 'col-label', 'col-id', 'col-unit', 'param-id', 'col-type', 'crit-source', 'range-auto', 'gate-col', 'gate-op',
    'param-exact', 'param-group', 'param-unit', 'calc-label', 'calc-unit', 'calc-group', 'calc-id', 'scen-label', 'param-label']);

  function blockLive() {
    const b = S.ui.block && M.blocks.get(S.ui.block.id); if (!b) return;
    const built = M.blocks.build(b, S.ui.block.vals), taken = H.taken().has(S.ui.block.outId);
    const pv = document.querySelector('.formula-preview'); if (pv) pv.textContent = `${S.ui.block.outId} = ${built.expr}`;
    const btn = document.querySelector('[data-action="add-block"]'); if (btn) btn.disabled = !built.ok || taken;
  }
  document.addEventListener('input', e => {
    const el = e.target, k = el.dataset && el.dataset.in;
    if (k === 'block-in') { S.ui.block.vals[el.dataset.k] = el.value; blockLive(); return; }
    if (k === 'block-label') { S.ui.block.label = el.value; return; }
    if (k === 'block-id') { S.ui.block.outId = el.value.trim(); blockLive(); return; }
    if (!k || !IN[k]) return;
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || COMMIT_ONLY.has(k)) return;
    if (el.type === 'range') el.style.setProperty('--pct', ((el.value - el.min) / ((el.max - el.min) || 1) * 100) + '%');
    if (k === 'model-name') return;
    M.preview(m => IN[k](m, el));
  });
  document.addEventListener('change', e => {
    const el = e.target, k = el.dataset && el.dataset.in;
    if (k === 'block-id' || k === 'block-in') { R.all(); return; }
    if (!k || !IN[k]) return;
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || COMMIT_ONLY.has(k) || k === 'model-name') M.commit(k, m => IN[k](m, el));
    else { M.preview(m => IN[k](m, el)); M.endGesture(); }
  });
  document.addEventListener('toggle', e => { if (e.target.id === 'out-details') S.ui.outOpen = e.target.open; }, true);

  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }
  async function copy(text, msg) { try { await navigator.clipboard.writeText(text); H.toast(msg || 'Copied'); } catch (e) { H.toast('Copy failed. Select the text and copy it by hand'); } }
  function ui(fn) { fn(S.ui); R.all(); }
  function newCritFor(m) {
    const used = new Set(m.criteria.filter(c => c.source.kind === 'column').map(c => c.source.column));
    const taken = new Set([...m.criteria.map(c => c.id), ...m.params.map(p => p.id), ...m.calcs.map(k => k.id)]);
    const pick = m.columns.find(c => c.type === 'number' && !used.has(c.id)) || m.columns.find(c => !used.has(c.id));
    if (!pick) return null;
    const id = U.uniqueId('c_' + pick.id, taken);
    const shape = { type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} };
    if (pick.type === 'category') { shape.type = 'map'; H.distinct(pick.id).forEach(v => { shape.map[v] = 0.5; }); }
    return { id, label: pick.label, enabled: true, weight: 20, source: { kind: 'column', column: pick.id }, direction: 'higher', range: { auto: true, lo: null, hi: null }, shape, missing: 'worst', noise: 0 };
  }
  const allIds = () => new Set([...S.model.columns.map(c => c.id), ...S.model.params.map(p => p.id), ...S.model.calcs.map(k => k.id), ...S.model.criteria.map(c => c.id)]);

  const A = {
    'set-view': el => ui(u => { u.view = el.dataset.v; }),
    'set-pane': el => ui(u => { u.pane = el.dataset.v; }),
    'toggle-open': el => ui(u => { u.open[el.dataset.key] = el.getAttribute('aria-expanded') !== 'true'; }),
    'toggle-advanced': () => { S.ui.advanced = !S.ui.advanced; M.store.save(); R.all(); M.store.runAnalysis(); },
    'undo': () => M.undo(), 'redo': () => M.redo(),
    'open-export': () => ui(u => { u.modal = 'export'; }),
    'open-gallery': () => ui(u => { u.modal = 'gallery'; }),
    'open-blocks': () => ui(u => { u.modal = 'blocks'; u.block = null; }),
    'close-modal': () => ui(u => { u.modal = null; u.block = null; }),
    'scrim': (el, id, e) => { if (e.target === el) ui(u => { u.modal = null; u.block = null; }); },
    'export-tab': el => ui(u => { u.exportTab = el.dataset.v; }),
    'copy-export': () => copy(R.exportText(S.ui.exportTab)),
    'download-export': () => {
      const t = S.ui.exportTab, ext = { json: 'json', js: 'js', formula: 'txt', csv: 'csv' }[t];
      download(U.slug(S.model.name) + '.' + ext, R.exportText(t), { json: 'application/json', js: 'text/javascript', formula: 'text/plain', csv: 'text/csv' }[t]);
    },
    'import-json': () => document.getElementById('import-file').click(),
    'share-link': () => {
      const url = location.href.split('#')[0] + '#m=' + M.store.b64enc(JSON.stringify(S.model));
      if (url.length > 8000) H.toast('This link is very long and may not open everywhere. Export JSON instead');
      copy(url, 'Share link copied');
    },
    'load-template': async (el, id) => {
      const t = M.templates.list.find(x => x.id === id);
      const ok = await M.ui.confirm({ title: `Load “${t.label}”?`, body: 'This replaces the current model. You can undo it.', ok: 'Load template' });
      if (ok) { S.ui.modal = null; M.store.replaceModel(M.templates.get(id)); H.toastUndo(`Loaded ${t.label}`); }
    },
    'pick-block': (el, id) => {
      if (!id) return ui(u => { u.block = null; });
      const b = M.blocks.get(id), names = H.names().map(n => n.id), vals = {};
      b.inputs.forEach(inp => { vals[inp.key] = M.blocks.guessFor(inp, names); });
      ui(u => { u.block = { id, vals, label: b.out.label, outId: U.uniqueId(b.out.id, allIds()) }; });
    },
    'add-block': () => {
      const st = S.ui.block, b = M.blocks.get(st.id), built = M.blocks.build(b, st.vals);
      if (S.model.calcs.length >= LIMIT.calcs) return H.toast('Up to 60 calculations');
      const e = validNewId(st.outId, null); if (e) return H.toast(e);
      M.commit('Add block', m => { m.calcs.push({ id: st.outId, label: st.label || b.out.label, expr: built.expr, unit: b.out.unit, format: b.out.format, group: b.group, pin: false, note: b.line }); });
      ui(u => { u.modal = null; u.block = null; u.inspector = { kind: 'calc', id: st.outId }; u.open['c:' + b.group] = true; });
      H.toastUndo(`Added ${st.label || b.out.label}`);
    },
    'add-calc': () => {
      if (S.model.calcs.length >= LIMIT.calcs) return H.toast('Up to 60 calculations');
      const id = U.uniqueId('calc', allIds());
      const first = S.model.params[0] || S.model.columns.find(c => c.type === 'number');
      M.commit('Add calculation', m => { m.calcs.push({ id, label: 'New calculation', expr: first ? first.id + ' * 1' : '1', unit: '', format: 'num', group: '', pin: false, note: '' }); });
      ui(u => { u.inspector = { kind: 'calc', id }; });
    },
    'remove-calc': (el, id) => {
      const k = H.calc(id), users = [...S.model.calcs.map(x => x.expr), ...S.model.gates.map(g => g.expr), ...S.model.criteria.filter(c => c.source.kind === 'expr').map(c => c.source.expr)].filter(s => M.expr.idents(s).some(t => t.name === id)).length
        + S.model.criteria.filter(c => c.source.kind === 'calc' && c.source.calc === id).length;
      M.commit('Remove calculation', m => { m.calcs = m.calcs.filter(x => x.id !== id); });
      H.toastUndo(users ? `Removed ${k.label}. ${users} item${users > 1 ? 's' : ''} now show an error` : `Removed ${k.label}`);
    },
    'criterion-from-calc': (el, id) => {
      if (S.model.criteria.length >= LIMIT.criteria) return H.toast('Up to 8 criteria');
      const k = H.calc(id), cid = U.uniqueId('c_' + id, allIds());
      M.commit('Criterion from calc', m => { m.criteria.push({ id: cid, label: k.label, enabled: true, weight: 20, source: { kind: 'calc', calc: id }, direction: guessLower(k.label) ? 'lower' : 'higher', range: { auto: true, lo: null, hi: null }, shape: { type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} }, missing: 'worst', noise: 0 }); });
      ui(u => { u.inspector = { kind: 'criterion', id: cid }; });
    },
    'rule-from-calc': (el, id) => {
      if (S.model.gates.length >= LIMIT.gates) return H.toast('Up to 12 rules');
      const k = H.calc(id), fr = H.focusRow(), v = fr && S.result.byId[fr].calc[id] ? S.result.byId[fr].calc[id].v : 0;
      const lower = guessLower(k.label), val = typeof v === 'number' && isFinite(v) ? +v.toPrecision(3) : 1;
      const ids = new Set(S.model.gates.map(g => g.id)); let n = 1; while (ids.has('g' + n)) n++;
      M.commit('Rule from calc', m => { m.gates.push({ id: 'g' + n, label: k.label + (lower ? ' low enough' : ' high enough'), expr: `${id} ${lower ? '<=' : '>='} ${val}`, enabled: true, simple: null }); });
      ui(u => { u.inspector = { kind: 'gate', id: 'g' + n }; });
    },
    'add-criterion': () => {
      if (S.model.criteria.length >= LIMIT.criteria) return H.toast('Up to 8 criteria');
      const c = newCritFor(S.model); if (!c) return H.toast(S.model.columns.length ? 'Every column is already used. Add a column in Data' : 'Add a column in Data first');
      M.commit('Add criterion', m => { m.criteria.push(c); }); ui(u => { u.inspector = { kind: 'criterion', id: c.id }; });
    },
    'remove-criterion': (el, id) => { const c = H.crit(id); M.commit('Remove criterion', m => { m.criteria = m.criteria.filter(x => x.id !== id); }); H.toastUndo(`Removed ${c.label}`); },
    'toggle-criterion': (el, id) => M.commit('Toggle criterion', m => { const c = m.criteria.find(x => x.id === id); c.enabled = !c.enabled; }),
    'add-gate': () => {
      const m = S.model; if (m.gates.length >= LIMIT.gates) return H.toast('Up to 12 rules');
      const ids = new Set(m.gates.map(g => g.id)); let n = 1; while (ids.has('g' + n)) n++;
      const c = m.columns.find(x => x.type === 'number') || m.columns[0];
      if (!c) { const k = m.calcs[0]; if (!k) return H.toast('Add a column in Data first'); M.commit('Add rule', mm => { mm.gates.push({ id: 'g' + n, label: 'New rule', expr: `${k.id} > 0`, enabled: true, simple: null }); }); return; }
      const simple = c.type === 'number' ? { column: c.id, op: '<=', value: colMax(c.id) } : c.type === 'boolean' ? { column: c.id, op: '==', value: 1 } : { column: c.id, op: '==', value: H.distinct(c.id)[0] || '' };
      M.commit('Add rule', mm => { mm.gates.push({ id: 'g' + n, label: c.label + ' rule', expr: R.gateExpr(simple), enabled: true, simple }); });
    },
    'remove-gate': (el, id) => { const g = H.gate(id); M.commit('Remove rule', m => { m.gates = m.gates.filter(x => x.id !== id); }); H.toastUndo(`Removed ${g.label || 'rule'}`); },
    'toggle-gate': (el, id) => M.commit('Toggle rule', m => { const g = m.gates.find(x => x.id === id); g.enabled = !g.enabled; }),
    'add-param': () => {
      const m = S.model; if (m.params.length >= LIMIT.params) return H.toast('Up to 60 knobs');
      const id = U.uniqueId('k', allIds());
      M.commit('Add knob', mm => { mm.params.push({ id, label: 'New knob', value: 1, min: 0, max: 10, step: 0.1, group: 'Knobs', unit: '', help: '' }); });
      ui(u => { u.inspector = { kind: 'param', id }; });
    },
    'remove-param': (el, id) => {
      const p = H.param(id), users = [...S.model.gates.map(g => g.expr), ...S.model.calcs.map(k => k.expr), ...S.model.criteria.filter(c => c.source.kind === 'expr').map(c => c.source.expr), S.model.combine.expr].filter(s => M.expr.idents(s).some(t => t.name === id)).length;
      M.commit('Remove knob', m => { m.params = m.params.filter(x => x.id !== id); m.stress = m.stress.filter(x => x !== id); });
      H.toastUndo(users ? `Removed ${p.label}. ${users} formula${users > 1 ? 's' : ''} now show an error` : `Removed ${p.label}`);
    },
    'add-scenario': () => {
      const m = S.model; if (m.scenarios.length >= LIMIT.scenarios) return H.toast('Up to 10 scenarios');
      const ids = new Set(m.scenarios.map(s => s.id)); let n = 1; while (ids.has('s' + n)) n++;
      const values = {}; m.params.forEach(p => { values[p.id] = +p.value; });
      M.commit('Save scenario', mm => { mm.scenarios.push({ id: 's' + n, label: 'Scenario ' + n, values }); });
      H.toast('Saved the current knobs as a scenario. Rename it on the left');
    },
    'apply-scenario': (el, id) => {
      const s = S.model.scenarios.find(x => x.id === id); if (!s) return;
      M.commit('Apply scenario', m => { Object.entries(s.values || {}).forEach(([k, v]) => { const p = m.params.find(x => x.id === k); if (p) { p.value = v; if (v < p.min) p.min = v; if (v > p.max) p.max = v; } }); });
      H.toastUndo(`Applied ${s.label}`);
    },
    'remove-scenario': (el, id) => { const s = S.model.scenarios.find(x => x.id === id); M.commit('Remove scenario', m => { m.scenarios = m.scenarios.filter(x => x.id !== id); }); H.toastUndo(`Removed ${s.label}`); },
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
    'set-shape': (el, id) => M.commit('Shape', m => { m.criteria.find(x => x.id === id).shape.type = el.dataset.v; }),
    'set-direction': (el, id) => M.commit('Direction', m => { m.criteria.find(x => x.id === id).direction = el.dataset.v; }),
    'add-row': () => {
      const m = S.model; if (m.rows.length >= LIMIT.rows) return H.toast('Up to 1000 rows');
      const ids = new Set(m.rows.map(r => r.id)); let n = m.rows.length + 1; while (ids.has('r' + n)) n++;
      M.commit('Add row', mm => { const v = {}; mm.columns.forEach(c => { v[c.id] = c.choices ? c.choices[0] : null; }); mm.rows.push({ id: 'r' + n, label: 'New option', v }); });
    },
    'remove-row': (el, id) => { const r = S.model.rows.find(x => x.id === id); M.commit('Remove row', m => { m.rows = m.rows.filter(x => x.id !== id); }); H.toastUndo(`Removed ${r ? r.label : 'row'}`); },
    'add-column': () => {
      const m = S.model; if (m.columns.length >= LIMIT.columns) return H.toast('Up to 24 columns');
      const id = U.uniqueId('col', allIds());
      M.commit('Add column', mm => { mm.columns.push({ id, label: 'New column', type: 'number', unit: '' }); mm.rows.forEach(r => { r.v[id] = null; }); });
    },
    'remove-column': async (el, id) => {
      const m = S.model, c = H.col(id), deps = m.criteria.filter(k => k.source.kind === 'column' && k.source.column === id).length + m.gates.filter(g => g.simple && g.simple.column === id).length;
      if (deps && !(await M.ui.confirm({ title: `Remove “${c.label}”?`, body: `${deps} ${deps > 1 ? 'criteria or rules use' : 'criterion or rule uses'} this column and will be removed with it. You can undo this.`, ok: 'Remove column', danger: true }))) return;
      setTimeout(() => H.toastUndo(`Removed ${c.label}`), 0);
      M.commit('Remove column', mm => {
        mm.columns = mm.columns.filter(x => x.id !== id); mm.rows.forEach(r => { delete r.v[id]; });
        mm.criteria = mm.criteria.filter(x => !(x.source.kind === 'column' && x.source.column === id));
        mm.gates = mm.gates.filter(g => !(g.simple && g.simple.column === id));
      });
    },
    'paste-csv': () => ui(u => { u.modal = 'csv'; }),
    'toast-undo': () => { M.undo(); H.dropToast(); },
    'csv-apply': () => { const t = document.getElementById('csv-text').value; if (applyCSV(t)) ui(u => { u.modal = null; }); }
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const f = A[el.dataset.action]; if (f) f(el, el.dataset.id, e);
  });
  document.addEventListener('keydown', e => {
    const tgt = e.target, typing = tgt.matches && tgt.matches('input[type=text],input[type=number],textarea');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? M.redo() : M.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); M.redo(); }
    else if (e.key === 'Escape') {
      if (M.ui.isListOpen() || document.querySelector('#dialog-root .scrim')) return;
      if (S.ui.modal) ui(u => { u.modal = null; u.block = null; });
      else if (S.ui.inspector) A['close-inspector']();
    }
  });

  function boot() {
    const f = document.getElementById('import-file');
    f.addEventListener('change', async () => {
      const file = f.files[0]; f.value = ''; if (!file) return;
      try { const m = JSON.parse(await file.text()); if (!M.store.isModel(m)) throw 0; M.store.replaceModel(m); ui(u => { u.modal = null; }); H.toast('Model imported'); }
      catch (err) { H.toast("That file isn't a Meridian model"); }
    });
    M.store.boot();
  }
  M.app = { boot, applyCSV, parseCSV, actions: A };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.M);
