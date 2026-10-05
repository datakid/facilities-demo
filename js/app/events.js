window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, R = M.render, MD = M.model, ST = M.store;
  let lastFx = null;

  const num = v => U.parseNum(v);
  const setP = (el, v, lo, hi) => { el.style.setProperty('--p', ((v - lo) / ((hi - lo) || 1) * 100) + '%'); };
  const focusLater = sel => requestAnimationFrame(() => { const el = document.querySelector(sel); if (el) { el.focus(); if (el.select) el.select(); el.scrollIntoView({ block: 'nearest' }); } });
  const exp = () => (S.ui.exp = S.ui.exp || {});

  function relabel(kind, id, label) {
    const m = S.model, list = kind === 'col' ? m.columns : m.knobs, obj = list.find(x => x.id === id);
    if (!obj) return;
    const clean = String(label);
    const clash = clean.trim() && [...m.columns, ...m.knobs].some(x => x !== obj && x.label.trim().toLowerCase() === clean.trim().toLowerCase());
    if (!clean.trim() || clash) { obj.label = clean; return; }
    ST.rewrite(() => { obj.label = clean; });
  }

  function catsOf(colId) { return [...new Set(S.model.rows.map(r => r.v[colId]).filter(x => x != null && x !== '').map(String))]; }

  function newCrit(colId) {
    const m = S.model, col = m.columns.find(c => c.id === colId);
    const id = m.criteria.some(c => c.id === colId) ? U.uid(colId + '_', m.criteria) : colId;
    const c = MD.crit(id, colId, 5, { want: col.type === 'number' ? U.guessDir(col.label) : 'more' });
    if (col.type === 'text') catsOf(colId).forEach((k, i, a) => { c.points[k] = a.length > 1 ? Math.round(i / (a.length - 1) * 10) : 5; });
    return c;
  }

  function onInput(e) {
    const el = e.target, k = el.getAttribute && el.getAttribute('data-in'); if (!k) return;
    const id = el.getAttribute('data-id'), v = el.value;
    const live = e.type === 'input';
    const L = { live };
    if (el.matches('.fx-in')) lastFx = el.getAttribute('data-fk');
    switch (k) {
      case 'name': ST.change(m => { m.name = v; }, L); break;
      case 'question': ST.change(m => { m.question = v; }, L); break;
      case 'weight': setP(el, +v, 0, 10); ST.change(() => { H.crit(id).weight = +v; }, L); break;
      case 'crit-col': ST.change(m => { const c = H.crit(id), col = H.col(v); c.col = v; if (col.type === 'text') { c.points = {}; catsOf(v).forEach((x, i, a) => { c.points[x] = a.length > 1 ? Math.round(i / (a.length - 1) * 10) : 5; }); } c.want = col.type === 'number' ? U.guessDir(col.label) : 'more'; c.curve = 'even'; c.at = null; c.tol = null; c.range = { auto: true, lo: null, hi: null }; void m; }, { setup: true }); break;
      case 'points': setP(el, +v, 0, 10); ST.change(() => { H.crit(id).points[el.getAttribute('data-k')] = +v; }, L); break;
      case 'crit-at': ST.change(() => { H.crit(id).at = num(v); }, L); break;
      case 'crit-tol': ST.change(() => { const n = num(v); H.crit(id).tol = n && n > 0 ? n : null; }, L); break;
      case 'range-lo': ST.change(() => { H.crit(id).range.lo = num(v); }, L); break;
      case 'range-hi': ST.change(() => { H.crit(id).range.hi = num(v); }, L); break;
      case 'rule-label': ST.change(() => { H.rule(id).label = v; }, L); break;
      case 'rule-fx': autoGrow(el); ST.change(() => { H.rule(id).formula = v; }, L); el.classList.toggle('bad', !!S.res.issues.find(x => x.where === 'rule' && x.id === id)); break;
      case 'rule-col': case 'rule-op': case 'rule-val': case 'rule-src': ruleEdit(k, id, v); break;
      case 'knob': {
        const kn = H.knob(id); setP(el, +v, kn.min, kn.max);
        ST.change(() => { kn.value = +v; }, L);
        const n = document.querySelector(`[data-in="knob-num"][data-id="${CSS.escape(id)}"]`); if (n) n.value = U.fmtNum(+v).replace(/,/g, '');
        moveStrip(id);
        break;
      }
      case 'knob-num': {
        const n = num(v); if (n == null) break;
        const kn = H.knob(id);
        ST.change(() => { kn.value = n; if (n < kn.min) kn.min = n; if (n > kn.max) kn.max = n; }, L);
        const r = document.querySelector(`[data-in="knob"][data-id="${CSS.escape(id)}"]`); if (r) { r.min = kn.min; r.max = kn.max; r.value = n; setP(r, n, kn.min, kn.max); }
        moveStrip(id);
        break;
      }
      case 'knob-label': ST.change(() => relabel('knob', id, v), L); break;
      case 'knob-min': case 'knob-max': case 'knob-step': if (!live) { const n = num(v); if (n == null) break; ST.change(() => { const kn = H.knob(id); kn[k.slice(5)] = k === 'knob-step' ? Math.max(n, 1e-6) : n; if (kn.min > kn.max) [kn.min, kn.max] = [kn.max, kn.min]; kn.value = U.clamp(kn.value, kn.min, kn.max); }, { setup: true }); } break;
      case 'knob-unit': ST.change(() => { H.knob(id).unit = v.trim(); }, live ? L : { setup: true }); break;
      case 'col-label': ST.change(() => relabel('col', id, v), L); break;
      case 'col-unit': ST.change(() => { H.col(id).unit = v.trim(); }, L); break;
      case 'col-type': ST.change(m => {
        const c = H.col(id);
        m.rows.forEach(r => { const x = r.v[id]; r.v[id] = x == null ? null : U.castCell(typeof x === 'boolean' ? (x ? 'yes' : 'no') : x, v); });
        c.type = v; if (v !== 'number') c.unit = '';
        m.criteria.filter(x => x.col === id).forEach(x => { const n = newCrit(id); Object.assign(x, { want: n.want, points: n.points, curve: 'even', at: null, tol: null }); });
      }, { setup: true }); break;
      case 'col-fx': autoGrow(el); ST.change(() => { H.col(id).formula = v; }, L); el.classList.toggle('bad', !!S.res.issues.find(x => x.where === 'column' && x.id === id)); break;
      case 'cell': {
        const col = H.col(el.getAttribute('data-col'));
        ST.change(() => { const r = S.model.rows.find(x => x.id === id); const t = v.trim(); r.v[col.id] = col.type === 'number' ? (t === '' ? null : (num(t) ?? t)) : (t === '' ? null : v); }, L);
        el.classList.toggle('bad', col.type === 'number' && v.trim() !== '' && num(v) == null);
        break;
      }
      case 'cell-yn': ST.change(() => { S.model.rows.find(x => x.id === id).v[el.getAttribute('data-col')] = el.checked; }); if (el.nextElementSibling) el.nextElementSibling.textContent = el.checked ? 'yes' : 'no'; break;
      case 'row-label': ST.change(() => { S.model.rows.find(x => x.id === id).label = v; }, L); break;
      case 'paste': S.ui.paste = v; R.pastePreview(); break;
      case 'q': S.ui.q = v; R.setup(); break;
      case 'sit-label': ST.change(m => { const s = m.scenarios.find(x => x.id === id); if (s) s.label = v; }, L); break;
    }
    if (!live && k !== 'paste' && k !== 'q') ST.settle();
  }

  function moveStrip(id) {
    const kn = H.knob(id), el = document.querySelector(`[data-strip="${CSS.escape(id)}"] i`);
    if (el) el.style.left = ((kn.value - kn.min) / ((kn.max - kn.min) || 1) * 100) + '%';
  }

  function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

  function ruleEdit(k, id, v) {
    const m = S.model, r = H.rule(id), p = MD.ruleParts(m, r.formula); if (!p) return;
    if (k === 'rule-col') {
      const col = H.col(v); p.col = v; delete p.knob;
      if (col.type === 'number') { p.op = '<='; const vals = m.rows.map(x => x.v[v]).filter(x => typeof x === 'number'); p.value = vals.length ? Math.max(...vals) : 0; }
      else if (col.type === 'text') { p.op = '=='; p.value = catsOf(v)[0] || ''; }
      else { p.op = '=='; p.value = true; }
    }
    if (k === 'rule-op') p.op = v;
    if (k === 'rule-src') { if (v) { p.knob = v; } else { delete p.knob; const kn = H.knob(MD.ruleParts(m, r.formula).knob); p.value = kn ? kn.value : 0; } }
    if (k === 'rule-val') { const col = H.col(p.col); p.value = col.type === 'number' ? (num(v) ?? 0) : col.type === 'yesno' ? v === 'true' : v; }
    const structural = k !== 'rule-val';
    ST.change(() => { r.formula = MD.ruleFormula(m, p); }, structural ? { setup: true } : { live: true });
  }

  function insertText(txt) {
    const el = lastFx && document.querySelector(`[data-fk="${CSS.escape(lastFx)}"]`);
    if (!el) { ST.toast('Click into a formula first'); return; }
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
    const before = el.value.slice(0, a), pad = before && !/[\s([,]$/.test(before) && !txt.endsWith('(') ? ' ' : '';
    el.value = before + pad + txt + el.value.slice(b);
    const pos = a + pad.length + txt.length;
    el.focus(); el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function goTo(kind, id) {
    const map = { tab: [id, null], criterion: ['matters', 'crit:' + id], rule: ['rules', 'rule:' + id], column: ['formulas', 'col:' + id], knob: ['formulas', 'knob:' + id] };
    const [tab, g] = map[kind] || [];
    if (!tab) return;
    if (kind === 'criterion') exp()['c:' + id] = true;
    S.ui.tab = tab; S.ui.pane = 'build'; R.pane(); R.setup();
    if (g) requestAnimationFrame(() => { const el = document.querySelector(`[data-g="${CSS.escape(g)}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); } });
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ranking';
  async function copy(text, ok) {
    try { await navigator.clipboard.writeText(text); ST.toast(ok); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ST.toast(ok); } catch (x) { ST.toast('Copy failed'); } t.remove(); }
  }

  function closeModal() { S.ui.modal = null; S.ui.fresh = false; R.modal(); }

  const ACT = {
    tab: v => { S.ui.tab = v; S.ui.colSel = null; R.setup(); ST.save(); if (S.ui.guide != null) M.guide.refresh(); },
    'tabs-scroll': v => { const s = document.querySelector('#setup .tabs'); if (s) s.scrollBy({ left: (+v) * Math.max(120, s.clientWidth * 0.6), behavior: 'smooth' }); },
    pane: v => { S.ui.pane = v; R.pane(); window.scrollTo(0, 0); },
    method: v => ST.change(m => { m.method = v; }, { setup: true }),
    'crit-on': (v, id) => ST.change(() => { const c = H.crit(id); c.on = !c.on; }, { setup: true }),
    'crit-del': (v, id) => { const name = R.critName(H.crit(id)); ST.change(m => { m.criteria = m.criteria.filter(c => c.id !== id); }, { setup: true }); ST.toast(`Removed ${name}. Ctrl+Z brings it back`); },
    want: (v, id) => ST.change(() => { const c = H.crit(id); c.want = v; c.at = null; }, { setup: true }),
    exp: v => { exp()[v] = !exp()[v]; R.setup(); },
    grp: (v, id, el) => { const cur = v in exp() ? exp()[v] : el.getAttribute('data-d') === '1'; exp()[v] = !cur; R.setup(); },
    sit: (v, id) => {
      const m = S.model, vals = id === 'base' ? {} : (m.scenarios.find(s => s.id === id) || {}).values || {};
      ST.change(mm => { mm.knobs.forEach(k => { k.value = vals[k.id] ?? mm.base[k.id] ?? k.value; }); }, { setup: true });
      R.situations();
    },
    'sit-save': () => {
      const m = S.model; if (m.scenarios.length >= H.LIMIT.scenarios) return ST.toast('Up to 24 situations');
      const vals = {}; m.knobs.forEach(k => { if (Math.abs(k.value - m.base[k.id]) > 1e-9) vals[k.id] = k.value; });
      const first = Object.keys(vals)[0], kn = first && H.knob(first);
      const label = kn ? `${kn.label} ${U.withUnit(vals[first], kn.unit)}` : 'New situation';
      const id = U.uid('s', m.scenarios);
      ST.change(mm => { mm.scenarios.push({ id, label, values: vals }); });
      R.situations(); focusLater('[data-fk="sitl"]'); ST.toast('Saved. Give it a name');
    },
    'sit-base': () => { ST.change(m => { m.knobs.forEach(k => { m.base[k.id] = k.value; }); }); R.situations(); ST.toast('These settings are the new baseline'); },
    'sit-del': (v, id) => { ST.change(m => { m.scenarios = m.scenarios.filter(s => s.id !== id); }); R.situations(); ST.toast('Situation removed. Ctrl+Z brings it back'); },
    curve: (v, id) => ST.change(() => { const c = H.crit(id); c.curve = v; if (v === 'target') { const r = S.res.ranges[id]; c.at = c.at ?? +((r.lo + r.hi) / 2).toPrecision(3); c.tol = c.tol ?? +(Math.max((r.hi - r.lo) / 2, 1)).toPrecision(3); } if (v === 'enough') { const r = S.res.ranges[id]; c.at = +(r.lo + (r.hi - r.lo) * (c.want === 'less' ? 0.3 : 0.7)).toPrecision(3); } }, { setup: true }),
    'range-fix': (v, id) => ST.change(() => { const c = H.crit(id), r = S.res.ranges[id]; c.range = { auto: false, lo: r.lo, hi: r.hi }; }, { setup: true }),
    'range-auto': (v, id) => ST.change(() => { H.crit(id).range = { auto: true, lo: null, hi: null }; }, { setup: true }),
    'add-crit': (v, id) => { if (S.model.criteria.length >= H.LIMIT.criteria) return ST.toast('Up to 8 things can matter'); ST.change(m => { m.criteria.push(newCrit(id)); }); S.ui.tab = 'matters'; R.setup(); },
    'new-col-crit': () => {
      if (S.model.columns.length >= H.LIMIT.columns) return ST.toast('Up to 80 columns');
      const id = U.toId('New column', H.taken());
      ST.change(m => { m.columns.push({ id, label: 'New column', type: 'number', unit: '', formula: '' }); m.criteria.push(MD.crit(id, id, 5)); });
      S.ui.tab = 'options'; R.setup(); focusLater(`[data-fk="h-${id}"]`); ST.toast('Name the column and fill in a value for each option');
    },
    'rule-add': () => {
      const m = S.model, id = U.uid('g', m.rules), col = m.columns.find(c => c.type === 'number' && !c.formula) || m.columns[0];
      let f = '';
      if (col) { const p = { col: col.id, op: col.type === 'number' ? '<=' : '==', value: col.type === 'number' ? Math.max(0, ...m.rows.map(r => r.v[col.id]).filter(x => typeof x === 'number')) : col.type === 'yesno' ? true : (catsOf(col.id)[0] || '') }; f = MD.ruleFormula(m, p); }
      ST.change(mm => { mm.rules.push({ id, label: '', formula: f, on: true }); }, { setup: true });
      focusLater(`[data-fk="rl-${id}"]`);
    },
    'rule-on': (v, id) => ST.change(() => { const r = H.rule(id); r.on = !r.on; }, { setup: true }),
    'rule-del': (v, id) => { ST.change(m => { m.rules = m.rules.filter(r => r.id !== id); }, { setup: true }); ST.toast('Must-have removed. Ctrl+Z brings it back'); },
    'rule-mode': (v, id) => { exp()['rf:' + id] = !exp()['rf:' + id]; R.setup(); if (exp()['rf:' + id]) focusLater(`[data-fk="rf-${id}"]`); },
    'knob-add': () => {
      if (S.model.knobs.length >= H.LIMIT.knobs) return ST.toast('Up to 80 settings');
      const label = 'Setting ' + (S.model.knobs.length + 1), id = U.toId(label, H.taken());
      ST.change(m => { m.knobs.push({ id, label, value: 50, min: 0, max: 100, step: 1, unit: '', note: '' }); }, { setup: true });
      exp()['k:' + id] = true; R.setup(); focusLater(`[data-fk="kl-${id}"]`);
    },
    'knob-del': (v, id) => { ST.change(m => { m.knobs = m.knobs.filter(k => k.id !== id); }, { setup: true }); ST.toast('Setting removed. Ctrl+Z brings it back'); },
    'calc-add': () => {
      if (S.model.columns.length >= H.LIMIT.columns) return ST.toast('Up to 80 columns');
      const label = 'New result', id = U.toId(label, H.taken());
      const base = S.model.columns.find(c => c.type === 'number') || null;
      const seed = base ? MD.nameRef(S.model, base.id) + ' * 1' : '1';
      ST.change(m => { m.columns.push({ id, label, type: 'number', unit: '', formula: seed }); }, { setup: true });
      focusLater(`[data-fk="cf-${id}"]`);
    },
    'col-del': (v, id) => { const l = H.col(id).label; ST.change(m => { m.columns = m.columns.filter(c => c.id !== id); m.criteria = m.criteria.filter(c => c.col !== id); m.rows.forEach(r => { delete r.v[id]; }); }, { setup: true }); S.ui.colSel = null; ST.toast(`Removed ${l}. Ctrl+Z brings it back`); },
    insert: v => insertText(v),
    'row-add': () => {
      if (S.model.rows.length >= H.LIMIT.rows) return ST.toast('Up to 500 options');
      const id = U.uid('r', S.model.rows);
      ST.change(m => { const v0 = {}; m.columns.forEach(c => { if (!c.formula) v0[c.id] = c.type === 'yesno' ? false : null; }); m.rows.push({ id, label: 'Option ' + (m.rows.length + 1), v: v0 }); }, { setup: true });
      focusLater(`[data-fk="rl-${id}"]`);
    },
    'col-add': () => {
      if (S.model.columns.length >= H.LIMIT.columns) return ST.toast('Up to 80 columns');
      const label = 'Column ' + (S.model.columns.length + 1), id = U.toId(label, H.taken());
      ST.change(m => { m.columns.push({ id, label, type: 'number', unit: '', formula: '' }); m.rows.forEach(r => { r.v[id] = null; }); }, { setup: true });
      focusLater(`[data-fk="h-${id}"]`);
    },
    'col-menu': (v, id) => { S.ui.colSel = S.ui.colSel === id ? null : id; R.setup(); },
    'row-del': (v, id) => { const l = (S.model.rows.find(r => r.id === id) || {}).label; ST.change(m => { m.rows = m.rows.filter(r => r.id !== id); }, { setup: true }); ST.toast(`Removed ${l}. Ctrl+Z brings it back`); },
    select: (v, id) => { S.ui.sel = id; S.prev = null; R.results(); R.live(); if (window.matchMedia('(max-width: 900px)').matches) requestAnimationFrame(() => { const w = document.getElementById('why'); if (w) w.scrollIntoView({ block: 'start', behavior: 'smooth' }); }); },
    try: (v, id, el) => { ST.change(m => { m.rows.find(r => r.id === id).v[el.getAttribute('data-col')] = +(+v).toPrecision(4); }, { setup: true }); ST.toast('Changed. Ctrl+Z to go back'); },
    go: (v, id, el) => goTo(el.getAttribute('data-kind'), id),
    'all-checks': () => { S.ui.allChecks = true; R.checks(); },
    'open-start': () => { S.ui.modal = 'start'; R.modal(); },
    'guide-start': () => M.guide.go(0),
    'guide-go': v => M.guide.go(+v),
    'guide-end': () => M.guide.end(),
    undo: () => ST.undo(), redo: () => ST.redo(),
    'open-export': () => { S.ui.modal = 'export'; R.modal(); },
    'close-modal': () => closeModal(),
    'load-ex': (v, id) => { closeModal(); ST.load(M.examples.get(id)); },
    'load-blank': () => { closeModal(); ST.load(M.examples.blank(), { guide: false, tab: 'options' }); },
    'open-paste': v => { S.ui.pasteMode = v === 'rows' ? 'rows' : 'new'; S.ui.paste = ''; S.ui.modal = 'paste'; R.modal(); },
    'paste-mode': v => { S.ui.pasteMode = v; const t = document.getElementById('paste-in'); S.ui.paste = t ? t.value : S.ui.paste; R.modal(); },
    'paste-go': () => {
      const rows = U.parseTable(S.ui.paste); if (rows.length < 2) return;
      const m = R.fromTable(rows, S.ui.pasteMode);
      closeModal(); ST.load(m, { guide: false, tab: S.ui.pasteMode === 'rows' ? 'options' : 'matters' });
      ST.toast(S.ui.pasteMode === 'rows' ? 'Options replaced' : 'Table loaded. Set how much each column matters');
    },
    'exp-tab': v => { S.ui.exportTab = v; R.modal(); },
    'copy-exp': () => copy(R.exportText().text, 'Copied'),
    'dl-exp': () => { const x = R.exportText(); download(slug(S.model.name) + (S.ui.exportTab === 'eq' || S.ui.exportTab === 'tex' ? '-equations' : '') + '.' + x.ext, x.text, x.ext === 'json' ? 'application/json' : 'text/plain'); },
    'share-link': () => { const x = Object.assign({}, S.model); delete x.pinned; copy(location.origin + location.pathname + '#m=' + U.b64e(JSON.stringify(x)), 'Link copied. Anyone with it sees this ranking'); },
    import: () => document.getElementById('import-file').click()
  };

  document.addEventListener('input', onInput);
  document.addEventListener('change', e => { if (e.target.matches('[data-in]')) onInput(e); });
  document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('.fx-in')) lastFx = e.target.getAttribute('data-fk'); });
  document.addEventListener('mousedown', e => { if (e.target.closest('[data-act="insert"]')) e.preventDefault(); });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const f = ACT[el.getAttribute('data-act')]; if (!f) return;
    e.preventDefault();
    f(el.getAttribute('data-v'), el.getAttribute('data-id'), el);
  });
  document.addEventListener('keydown', e => {
    const t = e.target, typing = t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) ST.redo(); else ST.undo(); return; }
    if (e.key === 'Escape') { if (S.ui.modal && !S.ui.fresh) closeModal(); else if (S.ui.modal) closeModal(); else if (S.ui.colSel) { S.ui.colSel = null; R.setup(); } return; }
    if (t && t.getAttribute && t.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const list = [...t.parentElement.querySelectorAll('[role="tab"]')], i = list.indexOf(t);
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
      e.preventDefault(); ACT.tab(list[j].dataset.v);
      requestAnimationFrame(() => { const n = document.getElementById('tab-' + list[j].dataset.v); if (n) n.focus(); });
      return;
    }
    if (e.key === 'Enter' && t && t.matches && t.matches('input.cell')) {
      e.preventDefault();
      const td = t.closest('td, th'), tr = td.parentElement, idx = [...tr.children].indexOf(td);
      const nx = (e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling);
      const tgt = nx && nx.children[idx] && nx.children[idx].querySelector('input');
      if (tgt) { tgt.focus(); tgt.select(); } else t.blur();
    }
  });
  document.getElementById('import-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const txt = String(rd.result);
      try { const m = JSON.parse(txt); if (!m.columns || !m.rows) throw new Error('x'); closeModal(); ST.load(m, { guide: false }); ST.toast('Opened ' + f.name); }
      catch (x) { const rows = U.parseTable(txt); if (rows.length >= 2) { closeModal(); ST.load(R.fromTable(rows, 'new'), { guide: false }); ST.toast('Table loaded from ' + f.name); } else ST.toast('That file is not a ranking or a table'); }
      e.target.value = '';
    };
    rd.readAsText(f);
  });
  window.addEventListener('hashchange', () => { if (/#m=/.test(location.hash)) location.reload(); });

  M.app = { ACT, insertText, goTo, copy, download, slug };
  M.app.start = () => { R.pane(); ST.boot(); document.querySelectorAll('textarea.fx-in').forEach(autoGrow); };
  const mo = new MutationObserver(() => document.querySelectorAll('textarea.fx-in').forEach(el => { if (!el.dataset.g) { el.dataset.g = 1; autoGrow(el); } }));
  mo.observe(document.getElementById('setup'), { childList: true, subtree: true });
})(window.M);
