window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, esc = U.esc, R = M.render;

  R.modal = () => {
    const root = document.getElementById('modal-root'); if (!root) return;
    const k = S.ui.modal;
    if (!k) { root.innerHTML = ''; document.body.classList.remove('has-modal'); return; }
    document.body.classList.add('has-modal');
    const fn = (R.extraModals && R.extraModals[k]) || ({ start, export: exp, paste })[k];
    const body = fn();
    const prev = root.querySelector('.modal'), st = prev && prev.classList.contains(k) ? prev.scrollTop : 0;
    const a = document.activeElement, fk = a && root.contains(a) ? a.getAttribute('data-fk') : null;
    root.innerHTML = `<div class="scrim" data-act="close-modal"></div><div class="modal ${k}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${body}</div>`;
    root.querySelector('.modal').scrollTop = st;
    if (fk) { const el = root.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el) { el.focus(); return; } }
    if (st) return;
    const f = root.querySelector('[autofocus]') || root.querySelector('.modal button, .modal textarea');
    if (f) f.focus();
  };

  function start() {
    const OPS = ['pharmacy', 'feed', 'venue', 'cafe', 'care', 'shift', 'supplier'];
    const card = e => {
      const m = e.make();
      return `<button class="ex-card" data-act="load-ex" data-id="${e.id}">
        <span class="ex-level">${esc(m.guide.level)}</span>
        <span class="ex-name">${esc(m.name)}</span>
        <span class="ex-q">${esc(m.question)}</span>
        <span class="ex-about">${esc(m.about)}</span>
        <span class="ex-teach">${esc(m.guide.teaches)}</span>
        <span class="ex-meta num">${m.rows.length} options · ${m.criteria.length} things that matter${m.columns.some(c => c.formula) ? ' · formulas' : ''}${(m.scenarios || []).length ? ' · situations' : m.knobs.length ? ' · settings' : ''}</span></button>`;
    };
    const cards = `<p class="ex-sec">Everyday decisions</p><div class="ex-grid">${M.examples.filter(e => !OPS.includes(e.id)).map(card).join('')}</div>
      <p class="ex-sec">Planning with formulas</p><div class="ex-grid">${OPS.map(id => M.examples.find(e => e.id === id)).filter(Boolean).map(card).join('')}</div>`;
    return `<header class="modal-head"><div><h2 id="modal-title" class="serif">Rank anything, and know why</h2><p class="muted">Start from an example with a short guided tour, or bring your own table. Every example is fully editable.</p></div>
      ${S.ui.fresh ? '' : `<button class="icon-btn" data-act="close-modal" aria-label="Close">${R.I.x}</button>`}</header>
      <div class="how3"><div><span class="n">1</span><b>Options</b><p>The things you compare: laptops, flats, job offers, plans.</p></div><div><span class="n">2</span><b>What matters</b><p>Price, size, time. Say how much each matters and which way is better.</p></div><div><span class="n">3</span><b>A ranking you can explain</b><p>Every score breaks down into the points behind it.</p></div></div>
      ${cards}
      <div class="start-own"><button class="btn primary" data-act="open-paste" data-v="new">${R.I.paste}Paste my own table</button><button class="btn" data-act="load-blank">Start blank</button>${S.ui.fresh ? '<button class="btn ghost" data-act="close-modal">Just look around</button>' : ''}</div>`;
  }

  function paste() {
    const mode = S.ui.pasteMode || 'new';
    const prev = U.parseTable(S.ui.paste || '');
    let pv = '';
    if (prev.length >= 2) {
      const head = prev[0], body = prev.slice(1, 6);
      const types = head.map((_, i) => i === 0 ? 'label' : U.detectType(prev.slice(1).map(r => r[i])));
      pv = `<div class="paste-pv"><p class="muted">I see <b class="num">${prev.length - 1}</b> options and <b class="num">${head.length - 1}</b> columns. The first column is the option name.</p><div class="table-wrap sm"><table class="grid ro"><thead><tr>${head.map((h, i) => `<th>${esc(h || '—')}<span class="th-unit">${i === 0 ? 'name' : types[i] === 'yesno' ? 'yes / no' : types[i] === 'text' ? 'text' : (U.detectUnit(h, prev.slice(1).map(r => r[i])) || 'number')}</span></th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${head.map((_, i) => `<td>${esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    } else if ((S.ui.paste || '').trim()) pv = '<p class="bad-line">I need a header row and at least one option.</p>';
    return `<header class="modal-head"><div><h2 id="modal-title" class="serif">Paste a table</h2><p class="muted">Copy cells from Excel, Google Sheets or Numbers, or type CSV. First row: column names. First column: option names.</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${R.I.x}</button></header>
      <textarea class="paste-in" id="paste-in" data-in="paste" rows="7" autofocus spellcheck="false" placeholder="Car, Price ($), Seats, Electric&#10;Model A, 32000, 5, yes&#10;Model B, 27500, 7, no&#10;Model C, 41000, 5, yes">${esc(S.ui.paste || '')}</textarea>
      <div id="paste-pv">${pv}</div>
      <div class="modal-foot">${R.seg('paste-mode', mode, [['new', 'Start a new ranking'], ['rows', 'Replace options here']])}<button class="btn primary" data-act="paste-go" ${prev.length >= 2 ? '' : 'disabled'}>Use this table</button></div>`;
  }
  R.pastePreview = () => {
    const box = document.getElementById('paste-pv'); if (!box) return;
    const html = paste();
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    box.innerHTML = tmp.querySelector('#paste-pv').innerHTML;
    const go = document.querySelector('[data-act="paste-go"]'); const ok = tmp.querySelector('[data-act="paste-go"]');
    if (go && ok) go.disabled = ok.disabled;
  };

  function exp() {
    const t = S.ui.exportTab;
    const text = t === 'recipe' ? M.exporter.recipe(S.model, S.res) : t === 'csv' ? M.exporter.results(S.model, S.res) : t === 'js' ? M.exporter.js(S.model, S.res) : M.exporter.json(S.model);
    const what = { recipe: 'A plain-text summary of the whole ranking, to paste in an email or doc.', csv: 'The ranking with every value, ready for a spreadsheet.', js: 'A JavaScript function that scores an option exactly like this app.', json: 'The full ranking file. Open it again with Open file.' }[t];
    return `<header class="modal-head"><div><h2 id="modal-title" class="serif">Save &amp; share</h2><p class="muted">Your work is saved in this browser automatically.</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${R.I.x}</button></header>
      <div class="share-row"><button class="btn primary" data-act="share-link">${R.I.share}Copy a link to this ranking</button><button class="btn" data-act="import">Open file</button></div>
      <div class="exp-tabs">${R.seg('exp-tab', t, [['recipe', 'Summary'], ['csv', 'Spreadsheet'], ['js', 'Code'], ['json', 'File']])}</div>
      <p class="hint">${esc(what)}</p>
      <pre class="exp-pre" tabindex="0">${esc(text)}</pre>
      <div class="modal-foot"><span></span><div><button class="btn" data-act="copy-exp">Copy</button><button class="btn" data-act="dl-exp">Download</button></div></div>`;
  }
  R.exportText = () => { const t = S.ui.exportTab; return { text: t === 'recipe' ? M.exporter.recipe(S.model, S.res) : t === 'csv' ? M.exporter.results(S.model, S.res) : t === 'js' ? M.exporter.js(S.model, S.res) : M.exporter.json(S.model), ext: { recipe: 'txt', csv: 'csv', js: 'js', json: 'json' }[t] }; };

  function fromTable(rowsIn, mode) {
    const head = rowsIn[0], body = rowsIn.slice(1).filter(r => r.some(x => String(x).trim()));
    const taken = new Set(U.RESERVED), cols = [];
    head.slice(1).forEach((h, i) => {
      const vals = body.map(r => r[i + 1]);
      const type = U.detectType(vals), label = U.cleanLabel(h || 'Column ' + (i + 1));
      const id = U.toId(label, taken); taken.add(id);
      cols.push({ id, label, type, unit: type === 'number' ? U.detectUnit(h, vals) : '', formula: '' });
    });
    const rows = body.map((r, j) => { const v = {}; cols.forEach((c, i) => { v[c.id] = U.castCell(r[i + 1], c.type); }); return { id: 'r' + (j + 1), label: r[0] || 'Option ' + (j + 1), v }; });
    if (mode === 'rows' && S.model) {
      const m = U.clone(S.model);
      const keep = m.columns.filter(c => c.formula);
      const byLabel = new Map(m.columns.filter(c => !c.formula).map(c => [c.label.toLowerCase(), c]));
      const newCols = cols.map(c => { const old = byLabel.get(c.label.toLowerCase()); return old ? Object.assign({}, old, { type: c.type, unit: old.unit || c.unit, _from: c.id }) : Object.assign({}, c, { _from: c.id }); });
      const ids = new Set(newCols.map(c => c.id)); keep.forEach(c => { if (ids.has(c.id)) c.id = U.toId(c.label + ' calc', ids); });
      m.rows = rows.map(r => ({ id: r.id, label: r.label, v: Object.fromEntries(newCols.map(c => [c.id, r.v[c._from]])) }));
      m.columns = [...newCols.map(c => { delete c._from; return c; }), ...keep];
      m.criteria = m.criteria.filter(c => m.columns.some(x => x.id === c.col));
      if (!m.criteria.length) m.criteria = autoCrit(m.columns);
      return m;
    }
    return { name: 'My ranking', question: `Which ${String(head[0] || 'option').toLowerCase()} is best?`, method: 'add', columns: cols, rows, knobs: [], rules: [], criteria: autoCrit(cols), guide: null };
  }
  function autoCrit(cols) {
    return cols.filter(c => c.type !== 'text' || true).slice(0, 6).map(c => M.model.crit(c.id, c.id, 5, { want: c.type === 'number' ? U.guessDir(c.label) : 'more' }));
  }
  R.fromTable = fromTable;
})(window.M);
