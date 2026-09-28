window.M = window.M || {};
(function (M) {
  'use strict';
  const H = M.h, S = H.S, esc = H.esc, R = M.render, fmt = H.fmt, fmtN = H.fmtN, U = M.util;

  function shapeIcon(type) {
    if (type === 'step') return '<svg viewBox="0 0 44 28" aria-hidden="true"><polyline points="4,24 22,24 22,4 40,4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const sh = { type, k: 2, a: 12, c: 0.5, width: 0.2 }, pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(`${(4 + t * 36).toFixed(1)},${(24 - M.shapes.apply(sh, t) * 20).toFixed(1)}`); }
    return `<svg viewBox="0 0 44 28" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  const unitOf = c => {
    if (c.source.kind === 'column') { const k = H.col(c.source.column); return k && k.unit ? ' ' + k.unit : ''; }
    if (c.source.kind === 'calc') { const k = H.calc(c.source.calc); return k && k.unit ? ' ' + k.unit : ''; }
    return '';
  };
  R.shapeParamText = (c, key) => {
    const Rg = S.result.ranges[c.id], sh = c.shape, u = unitOf(c);
    if (key === 'k') return `${fmt(+sh.k, 2)} ${sh.k > 1 ? '(strict)' : sh.k < 1 ? '(lenient)' : ''}`;
    if (key === 'a') return fmt(+sh.a, 0);
    if (!Rg) return fmt(+sh[key], 2);
    const span = Rg.hi - Rg.lo;
    if (key === 'width') return `± ${fmtN(sh.width * span)}${u}`;
    const flip = c.direction === 'lower' && sh.type !== 'target';
    return `${fmtN(Rg.lo + (flip ? 1 - sh.c : sh.c) * span)}${u}`;
  };
  R.chartSVG = c => {
    if (!c || c.shape.type === 'map') return '';
    const res = S.result, Rg = res.ranges[c.id]; if (!Rg) return '<p class="note">No chart while this criterion has an error.</p>';
    const W = 336, Ht = 136, p = 14, bot = Ht - p - 14, top = p;
    const X = u => p + u * (W - 2 * p), Y = s => bot - s * (bot - top);
    const pts = [];
    for (let i = 0; i < 64; i++) { const u = i / 63; let t = u; if (c.direction === 'lower' && c.shape.type !== 'target') t = 1 - t; pts.push(`${X(u).toFixed(1)},${Y(M.shapes.apply(c.shape, Rg.hi === Rg.lo ? 0.5 : t)).toFixed(1)}`); }
    const k = H.cidx(c.id);
    let dots = '', lab = '';
    res.rows.forEach(r => {
      const e = r.crit[c.id]; if (!e || typeof e.raw !== 'number') return;
      const u = Rg.hi === Rg.lo ? 0.5 : U.clamp((e.raw - Rg.lo) / (Rg.hi - Rg.lo), 0, 1);
      const sel = S.ui.selectedRow === r.id, cx = X(u).toFixed(1), cy = Y(e.s).toFixed(1);
      dots += r.pass ? `<circle cx="${cx}" cy="${cy}" r="${sel ? 5.5 : 3.5}" fill="var(--c${k})" stroke="var(--surface)" stroke-width="1.5"><title>${esc(r.label)}: ${fmtN(e.raw)} → ${fmt(e.s, 2)}</title></circle>`
        : `<circle cx="${cx}" cy="${cy}" r="${sel ? 5 : 3}" fill="var(--surface)" stroke="var(--ink-3)"><title>${esc(r.label)} (ruled out)</title></circle>`;
      if (sel) lab = `<text x="${Math.min(W - p, +cx + 8)}" y="${Math.max(top + 8, +cy - 8)}" font-size="11" fill="var(--ink)" text-anchor="${u > 0.7 ? 'end' : 'start'}" font-family="var(--sans)">${esc(r.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Shape of ${esc(c.label)} with each option as a dot">
      <rect x="0" y="0" width="${W}" height="${Ht}" rx="12" fill="var(--sunken)"/>
      <line x1="${p}" y1="${bot}" x2="${W - p}" y2="${bot}" stroke="var(--line-2)"/><line x1="${p}" y1="${top}" x2="${W - p}" y2="${top}" stroke="var(--line)" stroke-dasharray="2 3"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--c${k})" stroke-width="2" stroke-linejoin="round"/>${dots}${lab}
      <text x="${p}" y="${Ht - 6}" font-size="10.5" fill="var(--ink-3)" font-family="var(--mono)">${esc(fmtN(Rg.lo))}</text>
      <text x="${W - p}" y="${Ht - 6}" font-size="10.5" fill="var(--ink-3)" font-family="var(--mono)" text-anchor="end">${esc(fmtN(Rg.hi))}</text></svg>`;
  };

  function namesHint(combine) {
    const m = S.model;
    const names = combine ? [...m.criteria.map(c => c.id), ...m.criteria.map(c => 'w_' + c.id), ...m.params.map(p => p.id)] : H.names().map(n => n.id);
    return `<details class="names"><summary>Names and functions</summary><p class="mono">${names.map(esc).join(' · ') || 'none'}</p>
      <ul class="fn-help">${Object.keys(M.expr.FN).map(f => `<li><span class="mono">${f}</span>${M.expr.FN_HELP[f] ? ' — ' + esc(M.expr.FN_HELP[f]) : ''}</li>`).join('')}</ul></details>`;
  }

  function inspCrit(c) {
    const adv = S.ui.advanced, res = S.result, Rg = res.ranges[c.id], k = H.cidx(c.id);
    const srcCol = c.source.kind === 'column' ? H.col(c.source.column) : null;
    const srcCalc = c.source.kind === 'calc' ? H.calc(c.source.calc) : null;
    const isCat = srcCol && srcCol.type === 'category';
    const t = c.shape.type;
    let h = `<div class="field"><label for="ci-label">Name</label><input id="ci-label" type="text" data-in="crit-label" data-id="${c.id}" data-focus-key="cl:${c.id}" value="${esc(c.label)}"></div>`;
    const colOpts = S.model.columns.map(x => `<option value="col:${esc(x.id)}" ${srcCol && srcCol.id === x.id ? 'selected' : ''}>${esc(x.label)}${x.type !== 'number' ? ' (' + x.type + ')' : ''}</option>`).join('');
    const calcOpts = S.model.calcs.map(x => `<option value="calc:${esc(x.id)}" ${srcCalc && srcCalc.id === x.id ? 'selected' : ''} data-hint="calc">${esc(x.label)}</option>`).join('');
    h += `<div class="field"><label for="ci-src">Uses</label><select id="ci-src" data-in="crit-source" data-id="${c.id}">${calcOpts}${colOpts}${adv || c.source.kind === 'expr' ? `<option value="expr" ${c.source.kind === 'expr' ? 'selected' : ''}>Expression…</option>` : ''}</select></div>`;
    if (c.source.kind === 'expr' && adv) {
      h += `<div class="field"><label for="ci-expr">Expression</label><textarea id="ci-expr" rows="2" data-in="crit-expr" data-id="${c.id}" data-focus-key="ce:${c.id}" spellcheck="false">${esc(c.source.expr)}</textarea>
        <div class="err" data-live="err:criterion:${c.id}">${esc(H.errFor('criterion', c.id))}</div>${namesHint(false)}</div>`;
    } else if (c.source.kind === 'expr') h += `<p class="note mono">${esc(c.source.expr)}</p><p class="note">Turn on Advanced to edit this formula.</p>`;
    if (t !== 'target' && t !== 'map') h += `<div class="field"><span class="lab">Better when</span><div class="seg" role="group" aria-label="Better when">
      <button data-action="set-direction" data-id="${c.id}" data-v="higher" aria-pressed="${c.direction === 'higher'}">Higher</button>
      <button data-action="set-direction" data-id="${c.id}" data-v="lower" aria-pressed="${c.direction === 'lower'}">Lower</button></div></div>`;
    if (isCat || t === 'map') {
      const cats = [...new Set([...(srcCol ? H.distinct(srcCol.id) : []), ...(srcCol && srcCol.choices ? srcCol.choices : []), ...Object.keys(c.shape.map || {})])];
      h += `<div class="field"><span class="lab">Points per category</span>${cats.map(cat => { const v = +(c.shape.map[cat] ?? 0); return `<div class="map-row"><span class="ellipsis">${esc(cat)}</span>
        <input type="range" min="0" max="1" step="0.05" value="${v}" data-in="map-val" data-id="${c.id}" data-cat="${esc(cat)}" data-focus-key="mv:${c.id}:${esc(cat)}" style="--fill:var(--c${k});--pct:${v * 100}%" aria-label="Points for ${esc(cat)}">
        <span class="num" data-live="map:${c.id}:${esc(cat)}">${fmt(v, 2)}</span></div>`; }).join('') || '<p class="note">No categories in the data yet.</p>'}</div>`;
    } else {
      h += `<div class="field"><span class="lab">Shape</span><div class="shapes" role="group" aria-label="Shape">${['linear', 'curve', 'scurve', 'step', 'target'].map(s => `<button class="shape-btn" data-action="set-shape" data-id="${c.id}" data-v="${s}" aria-pressed="${t === s}" title="${esc(M.shapes.META[s].line)}">${shapeIcon(s)}${M.shapes.META[s].label}</button>`).join('')}</div>
        <p class="help">${esc(M.shapes.META[t].line)}.</p></div>`;
      const params = M.shapes.META[t].params;
      if (params.length) {
        h += '<div class="field">' + params.map(pm => {
          const v = +c.shape[pm.key];
          const numIn = adv ? (pm.raw || pm.rawWidth) && Rg
            ? `<input type="number" step="any" data-in="shape-raw" data-id="${c.id}" data-k="${pm.key}" value="${esc(pm.key === 'width' ? +(v * (Rg.hi - Rg.lo)).toFixed(4) : +(Rg.lo + ((c.direction === 'lower' && t !== 'target') ? 1 - v : v) * (Rg.hi - Rg.lo)).toFixed(4))}" aria-label="${pm.label} in raw units">`
            : `<input type="number" step="${pm.step}" min="${pm.min}" max="${pm.max}" data-in="shape-param" data-id="${c.id}" data-k="${pm.key}" value="${v}" aria-label="${pm.label}">` : '';
          return `<div class="sl"><span>${pm.label} ${pm.raw ? 'at ' : ''}<b class="num" data-live="sp:${c.id}:${pm.key}">${esc(R.shapeParamText(c, pm.key))}</b></span>${numIn}
            <input type="range" min="${pm.min}" max="${pm.max}" step="${pm.step}" value="${v}" data-in="shape-param" data-id="${c.id}" data-k="${pm.key}" data-focus-key="sp:${c.id}:${pm.key}" style="--fill:var(--c${k});--pct:${((v - pm.min) / (pm.max - pm.min) * 100).toFixed(1)}%" aria-label="${pm.label}"></div>`;
        }).join('') + '</div>';
      }
      h += `<div id="insp-chart">${R.chartSVG(c)}</div>`;
      if (Rg && Rg.hi === Rg.lo) h += '<p class="note warn-text">Every row is equal here, so this criterion has no effect.</p>';
      else h += '<p class="help">Dots are your options. Hollow dots are ruled out.</p>';
      if (Rg) {
        h += `<div class="field"><span class="lab">Range</span><div class="range-row">
          <label class="check"><input type="checkbox" data-in="range-auto" data-id="${c.id}" ${c.range.auto ? 'checked' : ''}> Auto</label>
          <input type="number" step="any" data-in="range-lo" data-id="${c.id}" value="${esc(c.range.auto ? Rg.lo : c.range.lo)}" ${c.range.auto ? 'disabled' : ''} aria-label="Low end">
          <span>to</span><input type="number" step="any" data-in="range-hi" data-id="${c.id}" value="${esc(c.range.auto ? Rg.hi : c.range.hi)}" ${c.range.auto ? 'disabled' : ''} aria-label="High end"></div>
          <p class="help">${c.range.auto ? 'Auto uses the lowest and highest value among your options.' : 'Fixed: the worst and best values you care about. Values outside are clipped to the ends.'}</p></div>`;
      }
    }
    h += `<div class="field"><div class="sl"><span>Weight <b class="num" data-live="wv:${c.id}">${c.weight}</b></span><span class="num muted">share <span data-live="share:${c.id}">${c.enabled ? H.pct(res.weights[c.id]) : '—'}</span></span>
      <input type="range" min="0" max="100" step="1" value="${c.weight}" data-in="weight" data-id="${c.id}" data-focus-key="iw:${c.id}" style="--fill:var(--c${k});--pct:${c.weight}%" aria-label="Weight"></div></div>`;
    const bad = res.rows.filter(r => r.crit[c.id] && r.crit[c.id].raw === null);
    const pol = c.missing || 'worst';
    h += `<div class="field"><label for="ci-miss">When a value is missing</label><select id="ci-miss" data-in="crit-missing" data-id="${c.id}">
      ${[['worst', 'Count it as the worst (0)'], ['neutral', 'Count it as the middle (0.5)'], ['best', 'Count it as the best (1)'], ['exclude', 'Rule the option out']].map(o => `<option value="${o[0]}" ${o[0] === pol ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      <p class="help">${bad.length ? `${bad.length} option${bad.length > 1 ? 's are' : ' is'} missing a value here${bad[0].crit[c.id].error && bad[0].crit[c.id].error !== 'Missing value' ? ' (' + esc(bad[0].crit[c.id].error) + ')' : ''}.` : 'No option is missing a value here.'}</p></div>`;
    if (t !== 'map') {
      const nz = +c.noise || 0;
      h += `<div class="field"><div class="sl"><span>How sure are these numbers? <b class="num" data-live="noise:${c.id}">${R.noiseText(nz)}</b></span><span></span>
        <input type="range" min="0" max="30" step="1" value="${nz}" data-in="crit-noise" data-id="${c.id}" data-focus-key="nz:${c.id}" style="--fill:var(--c${k});--pct:${nz / 30 * 100}%" aria-label="Error margin"></div>
        <p class="help">An error margin as a share of the range. The ranking then shows each option's chance of coming first.</p></div>`;
    }
    if (adv) h += `<div class="field"><span class="lab">Formula</span><div class="mono note code" data-live="formula:${c.id}">${esc(res.used.includes(c.id) ? M.codegen.critFormula(S.model, res, c) : '')}</div></div>`;
    return h;
  }

  function inspGate(g) {
    const res = S.result, fails = res.rows.filter(r => { const x = r.gates.find(y => y.id === g.id); return x && !x.pass; }).length;
    let h = `<div class="field"><label for="gi-label">Name</label><input id="gi-label" type="text" data-in="gate-label" data-id="${g.id}" data-focus-key="gl:${g.id}" value="${esc(g.label)}"></div>`;
    h += `<div class="field"><label for="gi-expr">Must be true</label><textarea id="gi-expr" rows="2" data-in="gate-expr" data-id="${g.id}" data-focus-key="ge:${g.id}" spellcheck="false">${esc(g.expr)}</textarea>
      <div class="err" data-live="err:gate:${g.id}">${esc(H.errFor('gate', g.id))}</div>${namesHint(false)}</div>`;
    h += `<p class="note">${g.enabled ? `Rules out <b class="num">${fails}</b> of <span class="num">${res.rows.length}</span> options.` : 'This rule is turned off.'}</p>`;
    return h;
  }

  function inspParam(p) {
    const inStress = S.model.stress.includes(p.id);
    let h = p.help ? `<p class="note help-card">${esc(p.help)}</p>` : '';
    h += `<div class="field"><div class="sl"><span>Value <b class="num" data-live="param:${esc(p.id)}">${esc(H.paramText(p))}</b></span><span></span>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-in="param-value" data-id="${esc(p.id)}" data-focus-key="ip:${esc(p.id)}" style="--pct:${((p.value - p.min) / ((p.max - p.min) || 1) * 100).toFixed(1)}%" aria-label="Value"></div>
        <input type="number" step="any" data-in="param-exact" data-id="${esc(p.id)}" value="${p.value}" aria-label="Exact value" class="exact"></div>`;
    h += `<div class="field"><label class="check"><input type="checkbox" data-in="param-stress" data-id="${esc(p.id)}" ${inStress ? 'checked' : ''}> Show in the stress test</label>
      <p class="help">Sweeps this knob from ${fmtN(+p.min)} to ${fmtN(+p.max)} and shows who wins along the way.</p></div>`;
    h += `<div class="field"><label for="pi-label">Name</label><input id="pi-label" type="text" data-in="param-label" data-id="${esc(p.id)}" value="${esc(p.label)}"></div>
      <div class="field two"><label>Group <input type="text" data-in="param-group" data-id="${esc(p.id)}" value="${esc(p.group)}"></label><label>Unit <input type="text" data-in="param-unit" data-id="${esc(p.id)}" value="${esc(p.unit)}"></label></div>`;
    if (S.ui.advanced) h += `<div class="field"><label for="pi-id">Id used in formulas</label><input id="pi-id" type="text" class="mono" data-in="param-id" data-id="${esc(p.id)}" value="${esc(p.id)}"></div>
      <div class="field range-row"><label>Min <input type="number" step="any" data-in="param-min" data-id="${esc(p.id)}" value="${p.min}"></label>
        <label>Max <input type="number" step="any" data-in="param-max" data-id="${esc(p.id)}" value="${p.max}"></label>
        <label>Step <input type="number" step="any" data-in="param-step" data-id="${esc(p.id)}" value="${p.step}"></label></div>
      <button class="btn danger-ghost" data-action="remove-param" data-id="${esc(p.id)}">Remove knob</button>`;
    return h;
  }

  function inspCalc(k) {
    const fr = H.focusRow(), r = fr && S.result.byId[fr], cv = r && r.calc[k.id];
    const users = S.model.calcs.filter(x => x.id !== k.id && M.expr.idents(x.expr).some(t => t.name === k.id)).map(x => x.label);
    let h = `<div class="calc-hero"><span class="muted">${r ? esc(r.label) : ''}</span><span class="big-score num" data-live="calc:${esc(k.id)}">${esc(H.calcText(k, fr))}</span>${cv && cv.error ? `<span class="err">${esc(cv.error)}</span>` : ''}</div>`;
    if (k.note) h += `<p class="note help-card">${esc(k.note)}</p>`;
    h += `<div class="field"><label for="ki-expr">Formula</label><textarea id="ki-expr" rows="3" data-in="calc-expr" data-id="${esc(k.id)}" data-focus-key="ke:${esc(k.id)}" spellcheck="false">${esc(k.expr)}</textarea>
      <div class="err" data-live="err:calc:${esc(k.id)}">${esc(H.errFor('calc', k.id))}</div>${namesHint(false)}</div>`;
    if (r) {
      const vals = M.expr.idents(k.expr).map(t => t.name).filter((x, i, a) => a.indexOf(x) === i && !M.expr.FN[x]).map(n => {
        const p = H.param(n), c = H.col(n), cc = H.calc(n);
        const v = p ? H.paramText(p) : c ? String(S.model.rows.find(x => x.id === fr).v[n] ?? '—') : cc ? M.format.calc(cc, (r.calc[n] || {}).v) : '?';
        return `<div class="tl"><span class="t">${p ? 'knob' : c ? 'column' : cc ? 'calc' : ''} <span class="mono">${esc(n)}</span></span><span class="v">${esc(v)}</span></div>`;
      }).join('');
      if (vals) h += `<div class="trace-g"><h4>Plugged in</h4>${vals}</div>`;
    }
    h += `<div class="field"><label class="check"><input type="checkbox" data-in="calc-pin" data-id="${esc(k.id)}" ${k.pin ? 'checked' : ''}> Pin to key figures</label></div>`;
    h += `<div class="field"><label for="ki-label">Name</label><input id="ki-label" type="text" data-in="calc-label" data-id="${esc(k.id)}" value="${esc(k.label)}"></div>
      <div class="field two"><label>Unit <input type="text" data-in="calc-unit" data-id="${esc(k.id)}" value="${esc(k.unit)}"></label>
      <label>Show as <select data-in="calc-format" data-id="${esc(k.id)}"><option value="num" ${k.format !== 'pct' ? 'selected' : ''}>Number</option><option value="pct" ${k.format === 'pct' ? 'selected' : ''}>Percent</option></select></label></div>
      <div class="field two"><label>Group <input type="text" data-in="calc-group" data-id="${esc(k.id)}" value="${esc(k.group)}"></label>
      <label>Id <input type="text" class="mono" data-in="calc-id" data-id="${esc(k.id)}" value="${esc(k.id)}"></label></div>`;
    if (users.length) h += `<p class="help">Used by ${users.map(esc).join(', ')}.</p>`;
    h += `<div class="insp-actions"><button class="btn" data-action="criterion-from-calc" data-id="${esc(k.id)}">Score on this</button><button class="btn" data-action="rule-from-calc" data-id="${esc(k.id)}">Make a rule</button>
      <button class="btn danger-ghost" data-action="remove-calc" data-id="${esc(k.id)}">Remove</button></div>`;
    return h;
  }

  function inspCombine() {
    return `<div class="field"><label for="co-expr">Score (0 to 1) =</label><textarea id="co-expr" rows="3" data-in="combine-expr" data-focus-key="co" spellcheck="false">${esc(S.model.combine.expr)}</textarea>
      <div class="err" data-live="err:combine:combine">${esc(H.errFor('combine', 'combine'))}</div>${namesHint(true)}
      <p class="help">A criterion id stands for its 0–1 score. <span class="mono">w_id</span> is its share.</p></div>`;
  }

  function inspRow(id) {
    const res = S.result, r = res.byId[id]; if (!r) return '';
    const lines = M.engine.trace(S.model, res, id);
    let h = `<div class="calc-hero"><span class="big-score num">${fmt(r.score, 1)}</span><span class="note">${r.pass ? `Rank <b class="num">${r.rank}</b> of <span class="num">${res.ranked.length}</span>` : `Ruled out: ${esc(r.failReason)}`}</span></div>`;
    const line = l => `<div class="tl ${l.error ? 'e' : ''}"><span class="t" title="${esc(l.error || l.sub || '')}">${esc(l.text)}${l.error ? ` <span class="err-inline">· ${esc(l.error)}</span>` : ''}</span><span class="v">${esc(l.value)}</span></div>`;
    const cl = lines.filter(l => l.kind === 'calc');
    if (cl.length) h += `<details class="trace-g" ${cl.length <= 12 ? 'open' : ''}><summary><h4>Calculations</h4></summary>${cl.map(line).join('')}</details>`;
    const gl = lines.filter(l => l.kind === 'gate' || l.kind === 'gate-total');
    h += `<div class="trace-g"><h4>Rules</h4>${gl.map(line).join('')}</div>`;
    S.model.criteria.forEach(c => {
      const ll = lines.filter(l => l.critId === c.id); if (!ll.length) return;
      h += `<div class="trace-g"><h4><span class="dot" style="background:var(--c${H.cidx(c.id)})"></span>${esc(c.label)}</h4>${ll.map(line).join('')}</div>`;
    });
    h += `<div class="trace-g"><h4>Result</h4>${lines.filter(l => l.kind === 'combine' || l.kind === 'final').map(line).join('')}</div>`;
    return h;
  }

  R.inspectorHTML = () => {
    const i = S.ui.inspector;
    let title = '', kicker = '', body = '';
    if (R.inspectors && R.inspectors[i.kind]) ({ title, kicker, body } = R.inspectors[i.kind](i.id));
    else if (i.kind === 'criterion') { const c = H.crit(i.id); title = c.label; kicker = 'Criterion'; body = inspCrit(c); }
    else if (i.kind === 'gate') { const g = H.gate(i.id); title = g.label || 'Rule'; kicker = 'Rule'; body = inspGate(g); }
    else if (i.kind === 'param') { const p = H.param(i.id); title = p.label; kicker = 'Knob · ' + p.group; body = inspParam(p); }
    else if (i.kind === 'calc') { const k = H.calc(i.id); title = k.label; kicker = 'Calculation' + (k.group ? ' · ' + k.group : ''); body = inspCalc(k); }
    else if (i.kind === 'combine') { title = 'Custom formula'; kicker = 'Combine'; body = inspCombine(); }
    else if (i.kind === 'row') { const r = S.result.byId[i.id]; title = r ? r.label : ''; kicker = 'Option trace'; body = inspRow(i.id); }
    return `<div class="insp-head"><div><span class="kicker">${esc(kicker)}</span><h3>${esc(title)}</h3></div><button class="icon-btn" data-action="close-inspector" aria-label="Close inspector">${R.ICON.close}</button></div>${body}`;
  };
})(window.M);
