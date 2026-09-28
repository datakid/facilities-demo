window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, R = M.render;

  R.dataHTML = () => {
    const m = S.model, adv = S.ui.advanced;
    let h = `<div class="toolbar"><button class="btn" data-action="add-row">Add option</button><button class="btn" data-action="add-column">Add column</button>
      <button class="btn" data-action="paste-csv">Paste CSV</button><button class="btn" data-action="import-json">Import model</button>
      <span class="muted toolbar-count"><span class="num">${m.rows.length}</span> options · <span class="num">${m.columns.length}</span> columns</span></div>`;
    h += `<div class="table-wrap"><table class="grid"><thead><tr><th scope="col">Option</th>`;
    m.columns.forEach(c => {
      h += `<th scope="col"><div class="th-top"><input class="hl" type="text" data-in="col-label" data-id="${esc(c.id)}" value="${esc(c.label)}" aria-label="Column name">
        <button class="x" data-action="remove-column" data-id="${esc(c.id)}" aria-label="Remove column ${esc(c.label)}">×</button></div>
        ${adv ? `<input class="hid" type="text" data-in="col-id" data-id="${esc(c.id)}" value="${esc(c.id)}" aria-label="Column id">` : `<span class="hid">${esc(c.id)}</span>`}
        <div class="th-meta"><select data-in="col-type" data-id="${esc(c.id)}" aria-label="Column type">${['number', 'category', 'boolean'].map(t => `<option ${t === c.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input type="text" class="unit-in" data-in="col-unit" data-id="${esc(c.id)}" value="${esc(c.unit || '')}" placeholder="unit" aria-label="Unit"></div></th>`;
    });
    h += '<th class="rm"></th></tr></thead><tbody>';
    m.rows.forEach(r => {
      h += `<tr><td><input type="text" class="row-name" data-in="row-label" data-id="${esc(r.id)}" value="${esc(r.label)}" aria-label="Option name"></td>`;
      m.columns.forEach(c => {
        const v = r.v[c.id];
        if (c.choices && c.choices.length) {
          const opts = [...new Set([...c.choices, ...(v != null ? [String(v)] : [])])];
          h += `<td><select class="cell-sel" data-in="cell" data-id="${esc(r.id)}" data-col="${esc(c.id)}" aria-label="${esc(r.label)} ${esc(c.label)}">${opts.map(o => `<option ${String(v) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></td>`;
        } else h += `<td><input type="text" ${c.type === 'number' ? 'inputmode="decimal" class="mono"' : ''} data-in="cell" data-id="${esc(r.id)}" data-col="${esc(c.id)}" value="${esc(v === null || v === undefined ? '' : String(v))}" aria-label="${esc(r.label)} ${esc(c.label)}"></td>`;
      });
      h += `<td class="rm"><button class="x" data-action="remove-row" data-id="${esc(r.id)}" aria-label="Remove ${esc(r.label)}">×</button></td></tr>`;
    });
    h += '</tbody></table></div><p class="help">Leave a cell empty for a missing value. The honesty check will tell you where that matters.</p>';
    return h;
  };

  R.exportText = tab => {
    const m = S.model, res = S.result;
    if (tab === 'json') return JSON.stringify(m, null, 2);
    if (tab === 'js') return M.codegen.js(m, res);
    if (tab === 'formula') return M.codegen.formula(m, res);
    return M.codegen.csv(m, res);
  };

  function galleryHTML() {
    const cats = [...new Set(M.templates.list.map(t => t.cat))];
    return `<div class="scrim" data-action="scrim"><div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="gal-title">
      <div class="modal-head"><div><span class="kicker">Start from an example</span><h3 id="gal-title">Templates</h3></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${R.ICON.close}</button></div>
      ${cats.map(cat => `<h4 class="gal-cat">${esc(cat)}</h4><div class="gallery">${M.templates.list.filter(t => t.cat === cat).map(t => `<button class="tpl-card" data-action="load-template" data-id="${esc(t.id)}">
        <span class="tpl-tag">${esc(t.tag)}</span><span class="tpl-name">${esc(t.label)}</span><span class="tpl-blurb">${esc(t.blurb)}</span></button>`).join('')}</div>`).join('')}
      <p class="help">Loading a template replaces the current model. You can undo it.</p></div></div>`;
  }

  function blocksHTML() {
    const b = S.ui.block && M.blocks.get(S.ui.block.id);
    let body;
    if (!b) {
      body = M.blocks.GROUPS.map(g => `<h4 class="gal-cat">${esc(g)}</h4><div class="gallery small">${M.blocks.LIST.filter(x => x.group === g).map(x => `<button class="tpl-card" data-action="pick-block" data-id="${esc(x.id)}">
        <span class="tpl-name">${esc(x.label)}</span><span class="tpl-blurb">${esc(x.line)}</span><span class="tpl-tag mono">${esc(x.expr.replace(/[{}]/g, ''))}</span></button>`).join('')}</div>`).join('');
    } else {
      const names = H.names();
      const opts = names.map(n => `<option value="${esc(n.id)}">${esc(n.label)} (${n.kind})</option>`).join('');
      const vals = S.ui.block.vals;
      const built = M.blocks.build(b, vals);
      const taken = H.taken();
      body = `<button class="link" data-action="pick-block" data-id="">← All blocks</button>
        <h4 class="blk-title">${esc(b.label)}</h4><p class="note">${esc(b.line)}</p>
        <datalist id="name-list">${opts}</datalist>
        ${b.inputs.map(inp => `<div class="field"><label for="bi-${inp.key}">${esc(inp.label)}</label>
          <input id="bi-${inp.key}" type="text" class="mono" list="name-list" data-in="block-in" data-k="${esc(inp.key)}" data-focus-key="bi:${esc(inp.key)}" value="${esc(vals[inp.key] || '')}" placeholder="a knob, column, calculation or number">
          ${inp.hint ? `<p class="help">${esc(inp.hint)}</p>` : ''}</div>`).join('')}
        <div class="field two"><label>Name <input type="text" data-in="block-label" data-focus-key="bl" value="${esc(S.ui.block.label)}"></label>
          <label>Id <input type="text" class="mono" data-in="block-id" data-focus-key="bid" value="${esc(S.ui.block.outId)}"></label></div>
        <p class="formula-preview mono">${esc(S.ui.block.outId)} = ${esc(built.expr)}</p>
        ${taken.has(S.ui.block.outId) ? '<p class="err">That id is already used. Pick another.</p>' : ''}
        <div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="add-block" ${built.ok && !taken.has(S.ui.block.outId) ? '' : 'disabled'}>Add calculation</button></div>`;
    }
    return `<div class="scrim" data-action="scrim"><div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="blk-title">
      <div class="modal-head"><div><span class="kicker">Building blocks</span><h3 id="blk-title">Add a ready-made formula</h3></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${R.ICON.close}</button></div>${body}</div></div>`;
  }

  R.modalHTML = () => {
    const md = S.ui.modal; if (!md) return '';
    if (md === 'gallery') return galleryHTML();
    if (md === 'blocks') return blocksHTML();
    if (md === 'csv') return `<div class="scrim" data-action="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="csv-title"><div class="modal-head"><h3 id="csv-title">Paste CSV</h3></div>
      <p class="help">The first line is the headers. The first column is the option name. This replaces your data.</p>
      <textarea id="csv-text" rows="12" spellcheck="false" placeholder="name,price,rating&#10;Alpha,120,4.5"></textarea>
      <div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="csv-apply">Replace data</button></div></div></div>`;
    const tabs = [['json', 'JSON'], ['js', 'JavaScript'], ['formula', 'Formula'], ['csv', 'CSV']];
    return `<div class="scrim" data-action="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ex-title"><div class="modal-head"><h3 id="ex-title">Export</h3><button class="icon-btn" data-action="close-modal" aria-label="Close">${R.ICON.close}</button></div>
      <div class="seg" role="tablist">${tabs.map(t => `<button role="tab" data-action="export-tab" data-v="${t[0]}" aria-pressed="${S.ui.exportTab === t[0]}" aria-selected="${S.ui.exportTab === t[0]}">${t[1]}</button>`).join('')}</div>
      <pre id="export-pre">${esc(R.exportText(S.ui.exportTab))}</pre>
      <div class="modal-actions"><button class="btn" data-action="share-link">Copy share link</button><span class="spacer"></span>
        <button class="btn" data-action="copy-export">Copy</button><button class="btn primary" data-action="download-export">Download</button></div></div></div>`;
  };
})(window.M);
