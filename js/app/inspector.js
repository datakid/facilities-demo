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
    const Rg = H.cur().ranges[c.id], sh = c.shape, u = unitOf(c);
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
    const res = H.cur(), Rg = res.ranges[c.id]; if (!Rg) return '<p class="note">No chart while this criterion has an error.</p>';
    const W = 336, Ht = 136, p = 14, bot = Ht - p - 14, top = p;
    const X = u => p + u * (W - 2 * p), Y = s => bot - s * (bot - top);
    const pts = [];
    for (let i = 0; i < 64; i++) { const u = i / 63; let t = u; if (c.direction === 'lower' && c.shape.type !== 'target') t = 1 - t; pts.push(`${X(u).toFixed(1)},${Y(M.shapes.apply(c.shape, Rg.hi === Rg.lo ? 0.5 : t)).toFixed(1)}`); }
    const k = H.cidx(c.id);
    let dots = '', lab = '';
    res.rows.forEach(r => {
      const e = r.crit[c.id]; if (!e || typeof e.raw !== 'number') return;
      const u = Rg.hi === Rg.lo ? 0.5 : U.clamp((e.raw - Rg.lo) / (Rg.hi - Rg.lo), 0, 1);
      const sel = H.focusRow() === r.id, cx = X(u).toFixed(1), cy = Y(e.s).toFixed(1);
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

  function valueOf(name, rowId, res) {
    const p = H.param(name); if (p) return { kind: 'knob', text: H.paramText(p) };
    const cc = H.calc(name), r = res.byId[rowId];
    if (cc) return { kind: 'calc', text: r ? M.format.calc(cc, (r.calc[name] || {}).v) : '—' };
    const c = H.col(name);
    if (c) { const row = S.model.rows.find(x => x.id === rowId); const v = row ? row.v[name] : null; return { kind: 'col', text: v === null || v === undefined ? '—' : v === true ? 'yes' : v === false ? 'no' : String(v) + (c.unit && typeof v === 'number' ? ' ' + c.unit : '') }; }
    return null;
  }
  R.liveFormula = (src, rowId, extra) => {
    const res = H.cur(), ids = M.expr.idents(src);
    let out = '', at = 0;
    ids.forEach(t => {
      out += esc(src.slice(at, t.start)); at = t.end;
      const v = extra && extra[t.name] !== undefined ? { kind: 'crit', text: extra[t.name] } : valueOf(t.name, rowId, res);
      if (M.expr.FN[t.name]) out += `<span class="tk fn">${esc(t.name)}</span>`;
      else if (v) out += `<span class="tk ${v.kind}" title="${esc(t.name)} = ${esc(v.text)}"><span class="tk-n">${esc(t.name)}</span><span class="tk-v num">${esc(v.text)}</span></span>`;
      else out += `<span class="tk bad">${esc(t.name)}</span>`;
    });
    out += esc(src.slice(at));
    return `<div class="live-f mono" aria-label="Formula with current values">${out}</div>`;
  };

  function insertBar(target, combine) {
    const m = S.model;
    const g = combine
      ? [['Criteria', m.criteria.filter(c => c.enabled).map(c => [c.id, c.label])], ['Shares', m.criteria.filter(c => c.enabled).map(c => ['w_' + c.id, 'share of ' + c.label])], ['Knobs', m.params.map(p => [p.id, p.label])]]
      : [['Knobs', m.params.map(p => [p.id, p.label])], ['Calculations', m.calcs.map(k => [k.id, k.label])], ['Columns', m.columns.map(c => [c.id, c.label])]];
    const fns = Object.keys(M.expr.FN);
    return `<div class="ins-bar" data-target="${esc(target)}">${g.filter(x => x[1].length).map(([t, list]) => `<details class="ins" data-keep-open><summary>${esc(t)} <span class="faint num">${list.length}</span></summary><div class="ins-list">${list.map(([id, l]) => `<button class="ins-i" data-action="insert" data-t="${esc(target)}" data-v="${esc(id)}" title="${esc(l)}"><span class="mono">${esc(id)}</span><span class="faint">${esc(l)}</span></button>`).join('')}</div></details>`).join('')}
      <details class="ins" data-keep-open><summary>Functions</summary><div class="ins-list">${fns.map(f => `<button class="ins-i" data-action="insert" data-t="${esc(target)}" data-v="${esc(f)}(" title="${esc(M.expr.FN_HELP[f] || f)}"><span class="mono">${esc(f)}</span><span class="faint">${esc(M.expr.FN_HELP[f] || '')}</span></button>`).join('')}</div></details></div>`;
  }

  function inspCrit(c) {
    const adv = S.ui.advanced, res = H.cur(), Rg = res.ranges[c.id], k = H.cidx(c.id);
    const srcCol = c.source.kind === 'column' ? H.col(c.source.column) : null;
    const srcCalc = c.source.kind === 'calc' ? H.calc(c.source.calc) : null;
    const isCat = srcCol && srcCol.type === 'category';
    const t = c.shape.type, fr = H.focusRow(), r = res.byId[fr], e = r && r.crit[c.id];
    let h = '';
    if (e) {
      const sum = res.ctype === 'sum';
      h += `<div class="calc-hero crit-hero" style="--cc:var(--c${k})"><span class="muted">${esc(r.label)}</span>
        <div class="ch-line num"><span>${esc(e.raw == null ? 'missing' : typeof e.raw === 'string' ? e.raw : fmtN(+e.raw.toPrecision(4)))}</span><span class="ch-ar">→</span><span>${fmt(e.s, 2)}</span>${sum ? `<span class="ch-ar">×</span><span>${H.pct(e.w)}</span><span class="ch-ar">=</span><b>${fmt(e.contrib * 100, 1)} pts</b>` : ''}</div></div>`;
    }
    h += `<div class="field"><label for="ci-label">Name</label><input id="ci-label" type="text" data-in="crit-label" data-id="${c.id}" value="${esc(c.label)}"></div>`;
    const colOpts = S.model.columns.map(x => `<option value="col:${esc(x.id)}" ${srcCol && srcCol.id === x.id ? 'selected' : ''}>${esc(x.label)}${x.type !== 'number' ? ' (' + x.type + ')' : ''}</option>`).join('');
    const calcOpts = S.model.calcs.map(x => `<option value="calc:${esc(x.id)}" ${srcCalc && srcCalc.id === x.id ? 'selected' : ''} data-hint="calc">${esc(x.label)}</option>`).join('');
    h += `<div class="field"><label for="ci-src">Uses</label><select id="ci-src" data-in="crit-source" data-id="${c.id}">${calcOpts}${colOpts}${adv || c.source.kind === 'expr' ? `<option value="expr" ${c.source.kind === 'expr' ? 'selected' : ''}>Expression…</option>` : ''}</select></div>`;
    if (c.source.kind === 'expr' && adv) {
      h += `<div class="field"><label for="ci-expr">Expression</label><textarea id="ci-expr" rows="2" data-in="crit-expr" data-id="${c.id}" spellcheck="false">${esc(c.source.expr)}</textarea>
        <div class="err">${esc(H.errFor('criterion', c.id))}</div>${R.liveFormula(c.source.expr, fr)}${insertBar('ci-expr')}</div>`;
    } else if (c.source.kind === 'expr') h += `${R.liveFormula(c.source.expr, fr)}<p class="note">Turn on Advanced to edit this formula.</p>`;
    if (t !== 'target' && t !== 'map') h += `<div class="field"><span class="lab">Better when</span><div class="seg" role="group" aria-label="Better when">
      <button data-action="set-direction" data-id="${c.id}" data-v="higher" aria-pressed="${c.direction === 'higher'}">Higher</button>
      <button data-action="set-direction" data-id="${c.id}" data-v="lower" aria-pressed="${c.direction === 'lower'}">Lower</button></div></div>`;
    if (isCat || t === 'map') {
      const cats = [...new Set([...(srcCol ? H.distinct(srcCol.id) : []), ...(srcCol && srcCol.choices ? srcCol.choices : []), ...Object.keys(c.shape.map || {})])];
      h += `<div class="field"><span class="lab">Points per category</span>${cats.map(cat => { const v = +(c.shape.map[cat] ?? 0); return `<div class="map-row" data-key="mp:${esc(cat)}"><span class="ellipsis">${esc(cat)}</span>
        <input type="range" min="0" max="1" step="0.05" value="${v}" data-in="map-val" data-id="${c.id}" data-cat="${esc(cat)}" style="--fill:var(--c${k});--pct:${v * 100}%" aria-label="Points for ${esc(cat)}">
        <span class="num">${fmt(v, 2)}</span></div>`; }).join('') || '<p class="note">No categories in the data yet.</p>'}</div>`;
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
          return `<div class="sl" data-key="sp:${pm.key}"><span>${pm.label} ${pm.raw ? 'at ' : ''}<b class="num">${esc(R.shapeParamText(c, pm.key))}</b></span>${numIn}
            <input type="range" min="${pm.min}" max="${pm.max}" step="${pm.step}" value="${v}" data-in="shape-param" data-id="${c.id}" data-k="${pm.key}" style="--fill:var(--c${k});--pct:${((v - pm.min) / (pm.max - pm.min) * 100).toFixed(1)}%" aria-label="${pm.label}"></div>`;
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
    h += `<div class="field"><div class="sl"><span>Weight <b class="num">${c.weight}</b></span><span class="num muted">share ${c.enabled ? H.pct(res.weights[c.id]) : '—'}</span>
      <input type="range" min="0" max="100" step="1" value="${c.weight}" data-in="weight" data-id="${c.id}" style="--fill:var(--c${k});--pct:${c.weight}%" aria-label="Weight"></div></div>`;
    const bad = res.rows.filter(x => x.crit[c.id] && x.crit[c.id].raw === null);
    const pol = c.missing || 'worst';
    h += `<div class="field"><label for="ci-miss">When a value is missing</label><select id="ci-miss" data-in="crit-missing" data-id="${c.id}">
      ${[['worst', 'Count it as the worst (0)'], ['neutral', 'Count it as the middle (0.5)'], ['best', 'Count it as the best (1)'], ['exclude', 'Rule the option out']].map(o => `<option value="${o[0]}" ${o[0] === pol ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      <p class="help">${bad.length ? `${bad.length} option${bad.length > 1 ? 's are' : ' is'} missing a value here${bad[0].crit[c.id].error && bad[0].crit[c.id].error !== 'Missing value' ? ' (' + esc(bad[0].crit[c.id].error) + ')' : ''}.` : 'No option is missing a value here.'}</p></div>`;
    if (t !== 'map') {
      const nz = +c.noise || 0;
      h += `<div class="field"><div class="sl"><span>How sure are these numbers? <b class="num">${R.noiseText(nz)}</b></span><span></span>
        <input type="range" min="0" max="30" step="1" value="${nz}" data-in="crit-noise" data-id="${c.id}" style="--fill:var(--c${k});--pct:${nz / 30 * 100}%" aria-label="Error margin"></div>
        <p class="help">An error margin as a share of the range. The ranking then shows each option's chance of coming first.</p></div>`;
    }
    if (adv) h += `<div class="field"><span class="lab">Formula</span><div class="mono note code">${esc(res.used.includes(c.id) ? M.codegen.critFormula(S.model, res, c) : '')}</div></div>`;
    return h;
  }

  function inspGate(g) {
    const res = H.cur(), fails = res.rows.filter(r => { const x = r.gates.find(y => y.id === g.id); return x && !x.pass; });
    const fr = H.focusRow(), rr = res.byId[fr], me = rr && rr.gates.find(x => x.id === g.id);
    let h = `<div class="field"><label for="gi-label">Name</label><input id="gi-label" type="text" data-in="gate-label" data-id="${g.id}" value="${esc(g.label)}"></div>`;
    h += `<div class="field"><label for="gi-expr">Must be true</label><textarea id="gi-expr" rows="2" data-in="gate-expr" data-id="${g.id}" spellcheck="false">${esc(g.expr)}</textarea>
      <div class="err">${esc(H.errFor('gate', g.id))}</div>
      ${rr ? `<div class="lf-head"><span class="faint">for ${esc(rr.label)}</span>${me ? `<span class="tag ${me.pass ? 'ok-tag' : 'bad'}">${me.pass ? 'passes' : 'fails'}</span>` : ''}</div>${R.liveFormula(g.expr, fr)}` : ''}${insertBar('gi-expr')}</div>`;
    h += `<p class="note">${g.enabled ? `Rules out <b class="num">${fails.length}</b> of <span class="num">${res.rows.length}</span> options${fails.length ? ': ' + fails.slice(0, 5).map(x => esc(x.label)).join(', ') + (fails.length > 5 ? '…' : '') : ''}.` : 'This rule is turned off.'}</p>`;
    return h;
  }

  let curveCache = { key: '', data: null };
  function knobCurve(p) {
    const key = p.id + '|' + S.model.params.filter(x => x.id !== p.id).map(x => x.value).join(',') + '|' + (M.state.ver || 0) + '|' + p.min + '|' + p.max;
    if (curveCache.key !== key) curveCache = { key, data: M.analysis.curve(S.model, p.id, 32) };
    const C = curveCache.data; if (!C) return '';
    const res = H.cur(), show = res.ranked.slice(0, 4); if (!show.length) return '<p class="help">No option passes at this setting.</p>';
    const W = 336, Ht = 150, pl = 26, pr = 10, pt = 10, pb = 22;
    const X = v => pl + (v - C.lo) / ((C.hi - C.lo) || 1) * (W - pl - pr), Y = s => Ht - pb - Math.max(0, Math.min(100, s)) / 100 * (Ht - pt - pb);
    const bands = C.pts.map((q, i) => {
      const a = i ? (C.pts[i - 1].v + q.v) / 2 : q.v, b = i < C.pts.length - 1 ? (C.pts[i + 1].v + q.v) / 2 : q.v;
      return `<rect x="${X(a).toFixed(1)}" y="${Ht - pb + 4}" width="${Math.max(0.5, X(b) - X(a)).toFixed(1)}" height="5" fill="${q.w ? `var(--c${H.rowColor(q.w)})` : 'var(--bad-t)'}"/>`;
    }).join('');
    const lines = show.map(id => `<polyline points="${C.pts.map(q => X(q.v).toFixed(1) + ',' + Y(q.sc[id] || 0).toFixed(1)).join(' ')}" fill="none" stroke="var(--c${H.rowColor(id)})" stroke-width="${id === res.ranked[0] ? 2.2 : 1.4}" stroke-linejoin="round" ${id === res.ranked[0] ? '' : 'stroke-opacity=".75"'}/>`).join('');
    const cx = X(+p.value).toFixed(1), tgt = H.target(p);
    const grid = [0, 50, 100].map(s => `<line x1="${pl}" x2="${W - pr}" y1="${Y(s)}" y2="${Y(s)}" stroke="var(--line)" ${s ? 'stroke-dasharray="2 3"' : ''}/><text x="${pl - 5}" y="${Y(s) + 3.5}" font-size="9.5" text-anchor="end" fill="var(--ink-3)" font-family="var(--mono)">${s}</text>`).join('');
    const legend = show.map(id => `<span><i class="sw" style="background:var(--c${H.rowColor(id)})"></i>${esc(H.rowLabel(id))} <b class="num">${fmt(res.byId[id].score, 1)}</b></span>`).join('');
    return `<div class="kc"><svg class="chart" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Scores of the top options as ${esc(p.label)} changes" data-curve="${esc(p.id)}" data-lo="${C.lo}" data-hi="${C.hi}" data-pl="${pl}" data-pr="${pr}" data-w="${W}">
      <rect x="0" y="0" width="${W}" height="${Ht}" rx="12" fill="var(--sunken)"/>${grid}${lines}${bands}
      ${!H.near(tgt, +p.value) ? `<line x1="${X(tgt).toFixed(1)}" x2="${X(tgt).toFixed(1)}" y1="${pt}" y2="${Ht - pb}" stroke="var(--ink-3)" stroke-dasharray="3 3"/>` : ''}
      <line x1="${cx}" x2="${cx}" y1="${pt}" y2="${Ht - pb + 9}" stroke="var(--ink)" stroke-width="1.5"/>
      <text x="${pl}" y="${Ht - 3}" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">${esc(fmtN(C.lo))}</text><text x="${W - pr}" y="${Ht - 3}" font-size="10" text-anchor="end" fill="var(--ink-3)" font-family="var(--mono)">${esc(fmtN(C.hi))}</text></svg>
      <div class="kc-leg">${legend}</div><p class="help">Score of the top options across the whole range. The strip under the chart shows who leads. Click the chart to set the knob.</p></div>`;
  }

  function inspParam(p) {
    const inStress = S.model.stress.includes(p.id), tgt = H.target(p), a = H.active();
    const users = S.model.calcs.filter(k => M.expr.idents(k.expr).some(t => t.name === p.id));
    const rules = S.model.gates.filter(g => M.expr.idents(g.expr).some(t => t.name === p.id));
    let h = p.help ? `<p class="note help-card">${esc(p.help)}</p>` : '';
    h += `<div class="field"><div class="sl"><span>Value <b class="num">${esc(H.paramText(p))}</b></span><span class="faint num">${!H.near(tgt, +p.value) ? `${esc(a ? a.label : 'baseline')}: ${esc(fmtN(tgt))}` : ''}</span>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-in="param-value" data-id="${esc(p.id)}" style="--pct:${R.pctOf(p)}" aria-label="Value"></div>
        <div class="row-gap"><div class="stepper"><button class="icon-btn sm" data-action="knob-step" data-id="${esc(p.id)}" data-d="-1" aria-label="Decrease">${R.ICON.minus}</button>
        <input type="text" inputmode="decimal" data-in="param-exact" data-id="${esc(p.id)}" value="${esc(fmtN(+p.value))}" aria-label="Exact value" class="exact num">
        <button class="icon-btn sm" data-action="knob-step" data-id="${esc(p.id)}" data-d="1" aria-label="Increase">${R.ICON.plus}</button></div>
        ${!H.near(tgt, +p.value) ? `<button class="btn small" data-action="knob-reset" data-id="${esc(p.id)}">${R.ICON.reset} Reset</button>` : ''}</div></div>`;
    h += `<div class="field"><span class="lab">How the ranking responds</span>${knobCurve(p)}</div>`;
    if (users.length || rules.length) h += `<div class="field"><span class="lab">Feeds into</span><div class="uses">${users.map(k => `<button class="use" data-action="open" data-kind="calc" data-id="${esc(k.id)}">${esc(k.label)}</button>`).join('')}${rules.map(g => `<button class="use rule" data-action="open" data-kind="gate" data-id="${esc(g.id)}">${esc(g.label)}</button>`).join('')}</div></div>`;
    h += `<div class="field"><label class="check"><input type="checkbox" data-in="param-stress" data-id="${esc(p.id)}" ${inStress ? 'checked' : ''}> Show in the stress test</label></div>`;
    h += `<div class="field"><label for="pi-label">Name</label><input id="pi-label" type="text" data-in="param-label" data-id="${esc(p.id)}" value="${esc(p.label)}"></div>
      <div class="field two"><label>Group <input type="text" data-in="param-group" data-id="${esc(p.id)}" value="${esc(p.group)}"></label><label>Unit <input type="text" data-in="param-unit" data-id="${esc(p.id)}" value="${esc(p.unit)}"></label></div>
      <div class="field range-row"><label>Min <input type="number" step="any" data-in="param-min" data-id="${esc(p.id)}" value="${p.min}"></label>
        <label>Max <input type="number" step="any" data-in="param-max" data-id="${esc(p.id)}" value="${p.max}"></label>
        <label>Step <input type="number" step="any" data-in="param-step" data-id="${esc(p.id)}" value="${p.step}"></label></div>`;
    if (S.ui.advanced) h += `<div class="field"><label for="pi-id">Id used in formulas</label><input id="pi-id" type="text" class="mono" data-in="param-id" data-id="${esc(p.id)}" value="${esc(p.id)}"></div>
      <button class="btn danger-ghost" data-action="remove-param" data-id="${esc(p.id)}">Remove knob</button>`;
    return h;
  }

  let drvCache = { key: '', data: null };
  function inspCalc(k) {
    const res = H.cur(), fr = H.focusRow(), r = fr && res.byId[fr], cv = r && r.calc[k.id], ref = H.refRes();
    const users = S.model.calcs.filter(x => x.id !== k.id && M.expr.idents(x.expr).some(t => t.name === k.id));
    const pv = ref && fr ? H.calcVal(k.id, fr, ref) : null, v = cv ? cv.v : null, dir = H.calcDir(k.id);
    const dl = typeof v === 'number' && pv != null && isFinite(v) && isFinite(pv) && !H.near(v, pv) ? R.delta(v - pv, { neutral: !dir, invert: dir === 'lower', text: k.format === 'pct' ? R.fmtD((v - pv) * 100, 1) + ' pt' : R.fmtD(v - pv, 2), eps: 1e-9 }) : '';
    let h = `<div class="calc-hero"><span class="muted">${r ? esc(r.label) : ''}</span><span class="big-score num">${esc(H.calcText(k, fr))}${dl}</span>${cv && cv.error ? `<span class="err">${esc(cv.error)}</span>` : ''}</div>`;
    if (k.note) h += `<p class="note help-card">${esc(k.note)}</p>`;
    h += `<div class="field"><label for="ki-expr">Formula</label>${r ? R.liveFormula(k.expr, fr) : ''}<textarea id="ki-expr" rows="3" data-in="calc-expr" data-id="${esc(k.id)}" spellcheck="false">${esc(k.expr)}</textarea>
      <div class="err">${esc(H.errFor('calc', k.id))}</div>${insertBar('ki-expr')}</div>`;
    if (r) {
      const key = k.id + '|' + fr + '|' + S.model.params.map(x => x.value).join(',') + '|' + (S.ver || 0);
      if (drvCache.key !== key) drvCache = { key, data: M.analysis.drivers(S.model, k.id, fr) };
      const D = drvCache.data;
      if (D && D.list.length) {
        const top = D.list.find(x => isFinite(x.swing)) ? Math.max(...D.list.filter(x => isFinite(x.swing)).map(x => x.swing)) || 1 : 1;
        const rows = D.list.slice(0, 8).map(x => {
          const p = H.param(x.id); if (!p) return '';
          const w = isFinite(x.swing) ? Math.max(3, x.swing / top * 100) : 100;
          const range = `${M.format.calc(k, x.a)} … ${M.format.calc(k, x.b)}`;
          return `<button class="drv" data-key="dv:${esc(x.id)}" data-action="open" data-kind="param" data-id="${esc(x.id)}" title="${esc(p.label)} from ${fmtN(x.lo)} to ${fmtN(x.hi)} moves this from ${esc(range)}">
            <span class="drv-n">${esc(p.label)}</span><span class="imp-bar"><i style="width:${w.toFixed(1)}%"></i></span><span class="drv-r num">${esc(range)}</span></button>`;
        }).join('');
        h += `<div class="field"><span class="lab">What drives it <span class="faint">each knob from min to max</span></span><div class="drvs">${rows}</div></div>`;
      }
    }
    h += `<div class="field"><label class="check"><input type="checkbox" data-in="calc-pin" data-id="${esc(k.id)}" ${k.pin ? 'checked' : ''}> Pin to key figures</label></div>`;
    h += `<div class="field"><label for="ki-label">Name</label><input id="ki-label" type="text" data-in="calc-label" data-id="${esc(k.id)}" value="${esc(k.label)}"></div>
      <div class="field two"><label>Unit <input type="text" data-in="calc-unit" data-id="${esc(k.id)}" value="${esc(k.unit)}"></label>
      <label>Show as <select data-in="calc-format" data-id="${esc(k.id)}"><option value="num" ${k.format !== 'pct' ? 'selected' : ''}>Number</option><option value="pct" ${k.format === 'pct' ? 'selected' : ''}>Percent</option></select></label></div>
      <div class="field two"><label>Group <input type="text" data-in="calc-group" data-id="${esc(k.id)}" value="${esc(k.group)}"></label>
      <label>Id <input type="text" class="mono" data-in="calc-id" data-id="${esc(k.id)}" value="${esc(k.id)}"></label></div>`;
    if (users.length) h += `<div class="field"><span class="lab">Used by</span><div class="uses">${users.map(x => `<button class="use" data-action="open" data-kind="calc" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div></div>`;
    h += `<div class="insp-actions"><button class="btn" data-action="criterion-from-calc" data-id="${esc(k.id)}">Score on this</button><button class="btn" data-action="rule-from-calc" data-id="${esc(k.id)}">Make a rule</button>
      <button class="btn danger-ghost" data-action="remove-calc" data-id="${esc(k.id)}">Remove</button></div>`;
    return h;
  }

  function inspCombine() {
    const res = H.cur(), fr = H.focusRow(), r = res.byId[fr], ex = {};
    if (r) res.used.forEach(id => { ex[id] = fmt(r.crit[id].s, 2); ex['w_' + id] = fmt(res.weights[id], 2); });
    return `<div class="field"><label for="co-expr">Score (0 to 1) =</label><textarea id="co-expr" rows="3" data-in="combine-expr" spellcheck="false">${esc(S.model.combine.expr)}</textarea>
      <div class="err">${esc(H.errFor('combine', 'combine'))}</div>${r ? `<div class="lf-head"><span class="faint">for ${esc(r.label)}</span><b class="num">${fmt(r.S, 3)}</b></div>${R.liveFormula(S.model.combine.expr, fr, ex)}` : ''}${insertBar('co-expr', true)}
      <p class="help">A criterion id stands for its 0–1 score. <span class="mono">w_id</span> is its share.</p></div>`;
  }

  function inspRow(id) {
    const res = H.cur(), r = res.byId[id]; if (!r) return '';
    const lines = M.engine.trace(S.model, res, id), ref = H.refRes(), pr = ref && ref.byId[id];
    let h = `<div class="calc-hero"><span class="big-score num">${fmt(r.score, 1)}${pr ? R.delta(r.score - pr.score) : ''}</span><span class="note">${r.pass ? `Rank <b class="num">${r.rank}</b> of <span class="num">${res.ranked.length}</span>` : `Ruled out: ${esc(r.failReason)}`}</span></div>`;
    const line = l => `<div class="tl ${l.error ? 'e' : ''}"><span class="t" title="${esc(l.error || l.sub || '')}">${esc(l.text)}${l.error ? ` <span class="err-inline">· ${esc(l.error)}</span>` : ''}</span><span class="v">${esc(l.value)}</span></div>`;
    const cl = lines.filter(l => l.kind === 'calc');
    if (cl.length) h += `<details class="trace-g" data-keep-open ${cl.length <= 12 ? 'open' : ''}><summary><h4>Calculations</h4></summary>${cl.map(line).join('')}</details>`;
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
    else if (i.kind === 'row') { const r = H.cur().byId[i.id]; title = r ? r.label : ''; kicker = 'Option trace'; body = inspRow(i.id); }
    return `<div class="insp-head" data-key="ih:${esc(i.kind + ':' + i.id)}"><div><span class="kicker">${esc(kicker)}</span><h3>${esc(title)}</h3></div><button class="icon-btn" data-action="close-inspector" aria-label="Close inspector">${R.ICON.close}</button></div><div class="insp-body" data-key="ib:${esc(i.kind + ':' + i.id)}">${body}</div>`;
  };
})(window.M);
