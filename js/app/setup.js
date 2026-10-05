window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, esc = U.esc, MD = M.model, E = M.engine, R = M.render;

  const TABS = [['matters', 'What matters'], ['rules', 'Must-haves'], ['formulas', 'Formulas'], ['options', 'Options'], ['equations', 'Equations']];
  const isOpen = k => !!(S.ui.exp || (S.ui.exp = {}))[k];

  R.setup = () => {
    const el = document.getElementById('setup'); if (!el) return;
    const t = S.ui.tab, m = S.model;
    const count = { matters: m.criteria.length, rules: m.rules.length, formulas: m.knobs.length + m.columns.filter(c => c.formula).length, options: m.rows.length, equations: R.eqData ? R.eqData().items.length : 0 };
    const tabs = `<div class="tabs-wrap"><button type="button" class="tabs-arrow l" data-act="tabs-scroll" data-v="-1" tabindex="-1" aria-hidden="true">${R.I.chev}</button><div class="tabs" role="tablist" aria-label="Build steps" data-keep-scroll="tabs">${TABS.map(([id, l], i) => `<button role="tab" id="tab-${id}" class="${id === 'equations' ? 'tab-view' : ''}" data-act="tab" data-v="${id}" aria-selected="${t === id}" title="${esc(l)}" data-g="tab:${id}"><span class="tab-n">${id === 'equations' ? '∑' : i + 1}</span>${id === 'matters' ? '<span class="hide-xs">What </span>matters' : l}<span class="tab-c num">${count[id]}</span></button>`).join('')}</div><button type="button" class="tabs-arrow r" data-act="tabs-scroll" data-v="1" tabindex="-1" aria-hidden="true">${R.I.chev}</button></div>`;
    const body = ({ matters: matters, rules: rules, formulas: formulas, options: options, equations: R.equationsHTML })[t]();
    R.keepFocus(el, () => { el.innerHTML = tabs + `<div class="tab-body${t === 'equations' ? ' eq-body' : ''}" role="tabpanel" aria-labelledby="tab-${t}" data-keep-scroll="tab-body">${body}</div>`; });
    if (t === 'equations' && R.eqMount) R.eqMount(el);
    R.tabsFit(true);
    R.strips();
    if (M.guide) M.guide.spot();
  };

  R.tabsFit = reveal => {
    const wrap = document.querySelector('#setup .tabs-wrap'); if (!wrap) return;
    const strip = wrap.querySelector('.tabs');
    const edges = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      wrap.classList.toggle('more-l', strip.scrollLeft > 2);
      wrap.classList.toggle('more-r', strip.scrollLeft < max - 2);
    };
    const show = () => {
      const on = strip.querySelector('[aria-selected="true"]');
      if (on && strip.scrollWidth > strip.clientWidth) {
        const a = strip.getBoundingClientRect(), b = on.getBoundingClientRect(), pad = 36;
        const prev = strip.style.scrollBehavior; strip.style.scrollBehavior = 'auto';
        if (b.right > a.right - pad) strip.scrollLeft += b.right - a.right + pad;
        else if (b.left < a.left + pad) strip.scrollLeft -= a.left - b.left + pad;
        strip.style.scrollBehavior = prev;
      }
      edges();
    };
    if (!strip.dataset.bound) {
      strip.dataset.bound = 1;
      strip.addEventListener('scroll', edges, { passive: true });
      strip.addEventListener('wheel', e => { if (strip.scrollWidth > strip.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); strip.scrollLeft += e.deltaY; } }, { passive: false });
    }
    if (reveal) { show(); requestAnimationFrame(show); } else edges();
  };
  if (window.ResizeObserver) new ResizeObserver(() => R.tabsFit(true)).observe(document.getElementById('setup'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => R.tabsFit && S.model && R.tabsFit(true));

  const help = (txt) => `<p class="lede">${txt}</p>`;

  function matters() {
    const m = S.model;
    let h = help('Pick what you care about, say how much, and which way is better. The ranking on the right updates as you go.');
    h += `<div class="method" data-g="method"><span class="lbl">Combine scores by</span>${R.seg('method', m.method, Object.entries(MD.METHODS).map(([k, v]) => [k, v.label]))}<span class="hint" data-live="method:">${esc(MD.METHODS[m.method].line)}</span></div>`;
    h += `<div class="crit-list">${m.criteria.map((c, i) => critCard(c, i)).join('')}</div>`;
    const used = new Set(m.criteria.map(c => c.col));
    const free = m.columns.filter(c => !used.has(c.id));
    if (m.criteria.length < H.LIMIT.criteria) {
      h += `<div class="adder" data-g="add-crit"><span class="lbl">Add what matters</span>${free.length ? free.map(c => `<button class="chip-btn" data-act="add-crit" data-id="${esc(c.id)}">${c.formula ? R.I.fx : ''}${R.I.plus}${esc(c.label)}</button>`).join('') : '<span class="hint">Every column is already used.</span>'}<button class="chip-btn dashed" data-act="new-col-crit">${R.I.plus}New column</button></div>`;
    }
    return h;
  }

  function critCard(c, i) {
    const col = H.col(c.col), k = H.cidx(c.id);
    const share = S.res.share[c.id];
    const type = col ? col.type : 'number';
    const open = isOpen('c:' + c.id);
    let h = `<article class="crit${c.on ? '' : ' off'}" data-g="crit:${esc(c.id)}" style="--c:var(--c${k});--t:var(--t${k});--k:var(--k${k})">
      <header class="crit-head"><span class="dot" aria-hidden="true"></span>
        <label class="sr" for="cc-${esc(c.id)}">Column</label>
        <select id="cc-${esc(c.id)}" class="plain-sel" data-in="crit-col" data-id="${esc(c.id)}" data-fk="cc-${esc(c.id)}">${R.opts(S.model.columns.map(x => [x.id, x.label + (x.unit ? ` (${x.unit})` : '')]), c.col)}</select>
        <span class="share num" data-live="share:${esc(c.id)}">${shareTxt(c.id)}</span>
        ${R.toggle('crit-on', c.id, c.on, 'Use ' + R.critName(c))}
        <button class="icon-btn sm" data-act="crit-del" data-id="${esc(c.id)}" aria-label="Remove ${esc(R.critName(c))}" title="Remove">${R.I.x}</button>
      </header>
      <div class="imp"><label class="sr" for="w-${esc(c.id)}">Importance</label>
        <input id="w-${esc(c.id)}" type="range" min="0" max="10" step="1" value="${c.weight}" data-in="weight" data-id="${esc(c.id)}" data-fk="w-${esc(c.id)}" style="--p:${c.weight * 10}%">
        <span class="imp-word" data-live="imp:${esc(c.id)}">${impTxt(c)}</span></div>`;
    if (type === 'text') {
      h += `<div class="want"><span class="hint">Each answer earns the points you give it.</span></div>`;
    } else {
      h += `<div class="want">${R.seg('want', c.want, type === 'yesno' ? [['more', 'Yes is better'], ['less', 'No is better']] : [['more', 'More is better'], ['less', 'Less is better']], `data-id="${esc(c.id)}"`)}
        ${type === 'number' ? `<button class="link" data-act="exp" data-v="c:${esc(c.id)}" aria-expanded="${open}">${R.I.chev}How to score<span class="curve-name">${esc(MD.CURVES[c.curve].label)}</span></button>` : ''}</div>`;
    }
    if (type === 'text') h += pointsEditor(c);
    else if (type === 'number' && open) h += curveEditor(c, col);
    void share; void i;
    return h + '</article>';
  }

  function shareTxt(id) { const s = S.res.share[id]; return s == null ? '—' : Math.round(s * 100) + '%'; }
  function impTxt(c) { return c.on ? MD.IMPORTANCE[Math.round(c.weight)] : 'Switched off'; }
  R.LIVE.share = shareTxt;
  R.LIVE.imp = id => { const c = H.crit(id); return c ? impTxt(c) : ''; };
  R.LIVE.method = () => esc(MD.METHODS[S.model.method].line);

  function pointsEditor(c) {
    const cats = (S.res.info[c.id] || {}).cats || [];
    if (!cats.length) return '<p class="hint">No answers yet. Fill this column on the Options tab.</p>';
    return `<div class="points">${cats.map(k => { const v = c.points[k] ?? 5; return `<label class="pt-row"><span class="pt-k">${esc(k)}</span>
      <input type="range" min="0" max="10" step="1" value="${v}" data-in="points" data-id="${esc(c.id)}" data-k="${esc(k)}" data-fk="p-${esc(c.id)}-${esc(k)}" style="--p:${v * 10}%" aria-label="Points for ${esc(k)}">
      <span class="num pt-v" data-live="pt:${esc(c.id)}|${esc(k)}">${v}</span></label>`; }).join('')}</div>`;
  }
  R.LIVE.pt = key => { const [id, k] = key.split('|'); const c = H.crit(id); return c ? String(c.points[k] ?? 5) : ''; };

  function curveEditor(c, col) {
    const R0 = S.res.ranges[c.id] || { lo: 0, hi: 0 };
    const list = Object.entries(MD.CURVES).map(([k, v]) => `<button class="curve-opt" data-act="curve" data-id="${esc(c.id)}" data-v="${k}" aria-pressed="${c.curve === k}">${curveIcon(k, c.want)}<span>${esc(v.label)}</span></button>`).join('');
    let extra = '';
    if (c.curve === 'enough') extra = `<label class="field-inline">Full points at ${c.want === 'less' ? 'or below' : 'or above'} <input class="num-in" type="text" inputmode="decimal" data-in="crit-at" data-id="${esc(c.id)}" data-fk="at-${esc(c.id)}" value="${esc(c.at ?? '')}" placeholder="${esc(U.fmtNum(R0.lo + (R0.hi - R0.lo) * (c.want === 'less' ? .3 : .7)))}"><span class="unit">${esc(col.unit)}</span></label>`;
    if (c.curve === 'target') extra = `<label class="field-inline">Sweet spot <input class="num-in" type="text" inputmode="decimal" data-in="crit-at" data-id="${esc(c.id)}" data-fk="at-${esc(c.id)}" value="${esc(c.at ?? '')}" placeholder="${esc(U.fmtNum((R0.lo + R0.hi) / 2))}"><span class="unit">${esc(col.unit)}</span></label>
      <label class="field-inline">zero points when off by <input class="num-in" type="text" inputmode="decimal" data-in="crit-tol" data-id="${esc(c.id)}" data-fk="tol-${esc(c.id)}" value="${esc(c.tol ?? '')}" placeholder="${esc(U.fmtNum((R0.hi - R0.lo) / 2))}"><span class="unit">${esc(col.unit)}</span></label>`;
    const rg = c.range.auto
      ? `<p class="hint">Worst and best come from your options: <span class="num" data-live="rng:${esc(c.id)}">${rangeTxt(c)}</span>. <button class="link inline" data-act="range-fix" data-id="${esc(c.id)}">Set my own</button></p>`
      : `<div class="field-inline">Score from <input class="num-in" type="text" inputmode="decimal" data-in="range-lo" data-id="${esc(c.id)}" data-fk="lo-${esc(c.id)}" value="${esc(c.range.lo ?? '')}"> to <input class="num-in" type="text" inputmode="decimal" data-in="range-hi" data-id="${esc(c.id)}" data-fk="hi-${esc(c.id)}" value="${esc(c.range.hi ?? '')}"><span class="unit">${esc(col.unit)}</span> <button class="link inline" data-act="range-auto" data-id="${esc(c.id)}">Use my options</button></div>`;
    return `<div class="curve-ed"><div class="curve-opts" role="group" aria-label="How points grow">${list}</div>
      <p class="hint">${esc(MD.CURVES[c.curve].line)}</p>${extra ? `<div class="curve-extra">${extra}</div>` : ''}
      <figure class="curve-fig" data-live="curve:${esc(c.id)}">${curveChart(c.id)}</figure>${rg}</div>`;
  }
  function rangeTxt(c) { const r = S.res.ranges[c.id]; if (!r || r.empty) return '—'; const u = H.unit(c.col); return `${U.withUnit(r.lo, u)} – ${U.withUnit(r.hi, u)}`; }
  R.LIVE.rng = id => { const c = H.crit(id); return c ? rangeTxt(c) : ''; };

  function curveIcon(type, want) {
    const pts = [], fake = { curve: type, want: 'more', at: 0.65, tol: 0.4 };
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const s = type === 'target' ? E.curveApply({ curve: 'target', at: 0.5, tol: 0.4 }, t, t, { lo: 0, hi: 1 }) : E.curveApply(fake, t, t, { lo: 0, hi: 1 });
      const x = want === 'less' && type !== 'target' ? 1 - t : t;
      pts.push(`${(3 + x * 34).toFixed(1)},${(23 - s * 19).toFixed(1)}`);
    }
    if (want === 'less' && type !== 'target') pts.reverse();
    return `<svg viewBox="0 0 40 26" aria-hidden="true"><path d="M3 23.5h34" stroke="currentColor" stroke-opacity=".25"/><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function curveChart(id) {
    const c = H.crit(id), r = S.res.ranges[id]; if (!c || !r || r.text || r.empty) return '';
    const col = H.col(c.col);
    let lo = r.lo, hi = r.hi;
    if (c.curve === 'target' && c.at != null) { lo = Math.min(lo, c.at - (c.tol || 1)); hi = Math.max(hi, c.at + (c.tol || 1)); }
    if (hi === lo) { lo -= 1; hi += 1; }
    const W = 320, Hh = 110, pl = 30, pr = 10, pt = 10, pb = 22;
    const X = v => pl + (v - lo) / (hi - lo) * (W - pl - pr), Y = s => pt + (1 - s) * (Hh - pt - pb);
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const v = lo + (hi - lo) * i / 60;
      let t = r.hi === r.lo ? 1 : U.clamp((v - r.lo) / (r.hi - r.lo), 0, 1); if (c.want === 'less' && r.hi !== r.lo) t = 1 - t;
      pts.push(`${X(v).toFixed(1)},${Y(E.curveApply(c, t, v, r)).toFixed(1)}`);
    }
    const k = H.cidx(id);
    const dots = S.res.rows.map(row => {
      const x = row.c[id]; if (!x || x.missing) return '';
      const sel = row.id === (S.ui.sel || (S.res.lead && S.res.lead.winner));
      return `<g class="cdot${row.pass ? '' : ' out'}${sel ? ' sel' : ''}"><circle cx="${X(x.raw).toFixed(1)}" cy="${Y(x.s).toFixed(1)}" r="${sel ? 4.5 : 3.2}"><title>${esc(row.label)}: ${esc(U.withUnit(x.raw, col.unit))} → ${(x.s * 10).toFixed(1)} of 10 points</title></circle>${sel ? `<text x="${X(x.raw).toFixed(1)}" y="${(Y(x.s) - 8).toFixed(1)}" text-anchor="middle">${esc(row.label)}</text>` : ''}</g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${Hh}" class="curve-svg" style="--c:var(--c${k});--k:var(--k${k})" role="img" aria-label="Points by ${esc(col.label)}">
      <line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" class="ax"/><line x1="${pl}" x2="${W - pr}" y1="${Y(1)}" y2="${Y(1)}" class="grid"/>
      <text x="${pl - 6}" y="${Y(1) + 3}" text-anchor="end">10</text><text x="${pl - 6}" y="${Y(0) + 3}" text-anchor="end">0</text>
      <text x="${pl}" y="${Hh - 6}">${esc(U.withUnit(lo, col.unit))}</text><text x="${W - pr}" y="${Hh - 6}" text-anchor="end">${esc(U.withUnit(hi, col.unit))}</text>
      <polyline points="${pts.join(' ')}" class="cline"/>${dots}</svg><figcaption class="sr">Points from 0 to 10 for each value of ${esc(col.label)}</figcaption>`;
  }
  R.LIVE.curve = curveChart;

  function rules() {
    const m = S.model;
    let h = help('Deal-breakers rule an option out. Softer wishes can take points off instead, so a great option that misses one still has a chance.');
    h += `<div class="rule-list">${m.rules.map(ruleCard).join('') || '<p class="empty">No must-haves yet. Everything gets ranked.</p>'}</div>`;
    if (m.rules.length < H.LIMIT.rules) h += `<div class="adder"><button class="btn" data-act="rule-add">${R.I.plus}Add a must-have</button></div>`;
    if (m.knobs.length) h += `<h3 class="sub">Settings used by must-haves</h3><div class="knob-list">${m.knobs.map(knobCard).join('')}</div>`;
    return h;
  }

  function ruleCard(r) {
    const parts = !isOpen('rf:' + r.id) ? MD.ruleParts(S.model, r.formula) : null;
    const issue = S.res.issues.find(x => x.where === 'rule' && x.id === r.id);
    let body;
    if (parts) {
      const col = H.col(parts.col), cols = S.model.columns;
      const ops = col.type === 'number' ? [['<=', 'at most'], ['>=', 'at least'], ['<', 'below'], ['>', 'above'], ['==', 'exactly'], ['!=', 'not']] : col.type === 'text' ? [['==', 'is'], ['!=', 'is not']] : [['==', 'is']];
      let val = '';
      if (col.type === 'number') {
        val = `<select class="sel" data-in="rule-src" data-id="${esc(r.id)}" aria-label="Compare with">${R.opts([['', 'a number'], ...S.model.knobs.map(k => [k.id, 'setting: ' + k.label])], parts.knob || '')}</select>`
          + (parts.knob ? '' : `<input class="num-in" type="text" inputmode="decimal" data-in="rule-val" data-id="${esc(r.id)}" data-fk="rv-${esc(r.id)}" value="${esc(parts.value)}" aria-label="Value"><span class="unit">${esc(col.unit)}</span>`);
      } else if (col.type === 'text') {
        const cats = [...new Set(S.model.rows.map(x => x.v[col.id]).filter(x => x != null && x !== '').map(String))];
        val = `<select class="sel" data-in="rule-val" data-id="${esc(r.id)}" aria-label="Value">${R.opts(cats.map(x => [x, x]), parts.value)}</select>`;
      } else val = `<select class="sel" data-in="rule-val" data-id="${esc(r.id)}" aria-label="Value">${R.opts([['true', 'yes'], ['false', 'no']], String(!!parts.value))}</select>`;
      body = `<div class="rule-build"><select class="sel" data-in="rule-col" data-id="${esc(r.id)}" aria-label="Column">${R.opts(cols.map(x => [x.id, x.label]), col.id)}</select>
        <select class="sel" data-in="rule-op" data-id="${esc(r.id)}" aria-label="Comparison">${R.opts(ops, parts.op)}</select>${val}</div>`;
    } else {
      body = `<div class="fx-edit">${R.I.fx}<textarea rows="1" class="fx-in${issue ? ' bad' : ''}" spellcheck="false" autocomplete="off" data-in="rule-fx" data-id="${esc(r.id)}" data-fk="rf-${esc(r.id)}" placeholder="e.g. Price <= Budget and Memory >= 16" aria-label="Must-have formula">${esc(r.formula)}</textarea></div>
        <div class="fx-status" data-live="rfx:${esc(r.id)}">${ruleStatus(r.id)}</div>`;
    }
    return `<article class="rule${r.on ? '' : ' off'}" data-g="rule:${esc(r.id)}">
      <header class="rule-head">${R.toggle('rule-on', r.id, r.on, 'Use this must-have')}
        <input class="hl" type="text" data-in="rule-label" data-id="${esc(r.id)}" data-fk="rl-${esc(r.id)}" value="${esc(r.label)}" placeholder="Name this must-have" aria-label="Must-have name">
        <button class="link sm" data-act="rule-mode" data-id="${esc(r.id)}">${parts ? 'Write as formula' : (MD.ruleParts(S.model, r.formula) ? 'Simple' : '')}</button>
        <button class="icon-btn sm" data-act="rule-del" data-id="${esc(r.id)}" aria-label="Remove must-have" title="Remove">${R.I.x}</button></header>
      ${body}
      <div class="rule-kind">${R.seg('rule-kind', r.soft ? 'soft' : 'hard', [['hard', 'Rule it out'], ['soft', 'Take off points']], `data-id="${esc(r.id)}"`)}${r.soft ? `<label class="field-inline">minus <input class="num-in" type="text" inputmode="decimal" data-in="rule-pen" data-id="${esc(r.id)}" data-fk="rp-${esc(r.id)}" value="${esc(r.penalty)}" aria-label="Points taken off"> points</label>` : ''}</div>
      <p class="rule-out${r.soft ? ' soft' : ''}" data-live="rout:${esc(r.id)}">${ruleOut(r.id)}</p></article>`;
  }
  function ruleStatus(id) {
    const iss = S.res.issues.find(x => x.where === 'rule' && x.id === id);
    if (iss) return errHTML(H.rule(id).formula, iss);
    const p = MD.pretty(S.model, H.rule(id).formula);
    return p ? `<span class="ok-line">${R.I.check}Reads as <span class="mono">${esc(p)}</span></span>` : '';
  }
  function ruleOut(id) {
    const r = H.rule(id); if (!r) return '';
    if (!r.on) return '<span class="muted">Switched off</span>';
    const fails = S.res.rows.filter(x => x.rules.some(y => y.id === id && !y.pass));
    if (!fails.length) return `<span class="muted">Every option passes</span>`;
    if (r.soft) return `Takes ${U.fmtNum(r.penalty)} points off <strong>${esc(U.list(fails.slice(0, 4).map(x => x.label)))}</strong>${fails.length > 4 ? ` and ${fails.length - 4} more` : ''}`;
    return `Rules out <strong>${esc(U.list(fails.slice(0, 4).map(x => x.label)))}</strong>${fails.length > 4 ? ` and ${fails.length - 4} more` : ''}`;
  }
  R.LIVE.rfx = ruleStatus;
  R.LIVE.rout = ruleOut;

  function errHTML(src, e) {
    const s = String(src || ''), p = Math.max(0, Math.min(e.pos ?? 0, s.length)), l = Math.max(1, e.len || 1);
    const show = s.length && e.pos != null ? `<span class="mono err-src">${esc(s.slice(0, p))}<mark>${esc(s.slice(p, p + l) || ' ')}</mark>${esc(s.slice(p + l))}</span>` : '';
    return `<span class="bad-line">${R.I.warn}${esc(e.msg)}</span>${show}`;
  }
  R.errHTML = errHTML;

  function knobCard(k) {
    const open = isOpen('k:' + k.id), pct = ((k.value - k.min) / ((k.max - k.min) || 1) * 100);
    return `<article class="knob" data-g="knob:${esc(k.id)}">
      <header class="knob-head"><input class="hl" type="text" data-in="knob-label" data-id="${esc(k.id)}" data-fk="kl-${esc(k.id)}" value="${esc(k.label)}" aria-label="Setting name">
        <span class="knob-val"><input class="num-in big" type="text" inputmode="decimal" data-in="knob-num" data-id="${esc(k.id)}" data-fk="kn-${esc(k.id)}" value="${esc(U.fmtNum(k.value).replace(/,/g, ''))}" aria-label="${esc(k.label)} value"><span class="unit">${esc(k.unit)}</span></span>
        <button class="icon-btn sm" data-act="exp" data-v="k:${esc(k.id)}" aria-expanded="${open}" aria-label="Edit range" title="Range and unit">${R.I.dots}</button>
        <button class="icon-btn sm" data-act="knob-del" data-id="${esc(k.id)}" aria-label="Remove setting" title="Remove">${R.I.x}</button></header>
      ${k.note ? `<p class="hint">${esc(k.note)}</p>` : ''}
      <input type="range" min="${k.min}" max="${k.max}" step="${k.step}" value="${k.value}" data-in="knob" data-id="${esc(k.id)}" data-fk="kr-${esc(k.id)}" style="--p:${pct}%" aria-label="${esc(k.label)}">
      <div class="strip" data-strip="${esc(k.id)}" aria-label="Who wins across ${esc(k.label)}"></div>
      ${open ? `<div class="knob-edit"><label>From <input class="num-in" data-in="knob-min" data-id="${esc(k.id)}" data-fk="kmin-${esc(k.id)}" value="${k.min}"></label><label>to <input class="num-in" data-in="knob-max" data-id="${esc(k.id)}" data-fk="kmax-${esc(k.id)}" value="${k.max}"></label><label>step <input class="num-in" data-in="knob-step" data-id="${esc(k.id)}" data-fk="kst-${esc(k.id)}" value="${k.step}"></label><label>unit <input class="num-in" data-in="knob-unit" data-id="${esc(k.id)}" data-fk="ku-${esc(k.id)}" value="${esc(k.unit)}"></label></div>` : ''}
    </article>`;
  }

  R.strips = () => {
    const els = [...document.querySelectorAll('[data-strip]')];
    if (!els.length) return;
    const prep = S.res.prep, steps = S.model.rows.length * S.model.columns.length > 400 ? 14 : 30;
    els.forEach(el => {
      const id = el.getAttribute('data-strip'), k = H.knob(id); if (!k) return;
      const sw = E.knobSweep(S.model, id, steps, prep); if (!sw) return;
      const n = sw.pts.length;
      const seg = [];
      sw.pts.forEach((p, i) => { if (!seg.length || seg[seg.length - 1].w !== p.winner) seg.push({ w: p.winner, a: i, b: i }); else seg[seg.length - 1].b = i; });
      const pos = ((k.value - k.min) / ((k.max - k.min) || 1)) * 100;
      el.innerHTML = `<div class="strip-bar">${seg.map(s => { const t = R.rowTone(s.w); const w = (s.b - s.a + 1) / n * 100; return `<span style="width:${w}%;--rc:${s.w ? `var(--c${t})` : 'var(--line-2)'}" title="${esc(R.rowLabel(s.w))} wins"></span>`; }).join('')}<i style="left:${pos}%"></i></div>
        <div class="strip-legend">${seg.length > 1 ? sw.flips.map(f => `<span>${esc(U.withUnit(+f.at.toPrecision(3), k.unit))}: <b>${esc(R.rowLabel(f.to))}</b> takes over</span>`).slice(0, 3).join('') : `<span><b>${esc(R.rowLabel(seg[0].w))}</b> wins across the whole range</span>`}</div>`;
    });
  };

  const grouped = (list, key) => {
    const g = new Map();
    list.forEach(x => { const k = x.group || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
    return [...g.entries()];
  };
  const matchQ = (x, q) => !q || (x.label + ' ' + (x.note || '') + ' ' + (x.formula || '')).toLowerCase().includes(q);
  function groupBlock(prefix, name, items, card, firstOpen) {
    if (!name) return items.map(card).join('');
    const key = prefix + name, open = S.ui.q ? true : (S.ui.exp && key in S.ui.exp ? S.ui.exp[key] : firstOpen);
    return `<div class="grp"><button class="grp-head" data-act="grp" data-v="${esc(key)}" data-d="${firstOpen ? 1 : 0}" aria-expanded="${open}">${R.I.chev}<span>${esc(name)}</span><span class="num muted">${items.length}</span></button>${open ? `<div class="grp-body">${items.map(card).join('')}</div>` : ''}</div>`;
  }

  function formulas() {
    const m = S.model, q = (S.ui.q || '').trim().toLowerCase();
    const big = m.knobs.length + m.columns.filter(c => c.formula).length > 12;
    let h = help('Settings are numbers you can turn. Worked-out columns are calculated from other columns and settings for every option, like a spreadsheet.');
    if (big) h += `<div class="find"><input class="find-in" type="search" data-in="q" data-fk="q" value="${esc(S.ui.q || '')}" placeholder="Find a setting or formula" aria-label="Find a setting or formula"></div>`;
    const knobs = m.knobs.filter(k => matchQ(k, q));
    h += `<section class="block"><div class="block-head"><h3>Settings</h3><button class="btn sm" data-act="knob-add">${R.I.plus}Add setting</button></div>`;
    h += knobs.length ? `<div class="knob-list">${grouped(knobs).map(([g, items], i) => groupBlock('kg:', g, items, knobCard, i === 0)).join('')}</div>` : `<p class="empty">${q ? 'No setting matches.' : 'No settings. Add one for numbers like a budget or order size that apply to every option.'}</p>`;
    h += '</section>';
    const calc = m.columns.filter(c => c.formula && matchQ(c, q));
    h += `<section class="block"><div class="block-head"><h3>Worked-out columns</h3><span class="block-acts">${calc.length ? `<button class="btn sm ghost" data-act="eq-open">∑ See all as equations</button>` : ''}<button class="btn sm" data-act="calc-add">${R.I.plus}Add worked-out column</button></span></div>`;
    const gl = grouped(calc), lastRes = gl.findIndex(([g]) => /result/i.test(g));
    h += calc.length ? gl.map(([g, items], i) => groupBlock('cg:', g, items, calcCard, lastRes >= 0 ? i === lastRes : i === 0)).join('') : `<p class="empty">${q ? 'No formula matches.' : 'None yet. Example: <span class="mono">Rent / Size</span> gives a rent per m² for every flat.'}</p>`;
    h += '</section>';
    h += `<section class="block"><button class="link" data-act="exp" data-v="fnhelp" aria-expanded="${isOpen('fnhelp')}">${R.I.chev}How to write a formula</button>${isOpen('fnhelp') ? fnHelp() : ''}</section>`;
    return h;
  }

  function calcCard(c) {
    const issue = S.res.issues.find(x => x.where === 'column' && x.id === c.id);
    return `<article class="calc" data-g="col:${esc(c.id)}">
      <header class="calc-head"><span class="fx-badge">ƒ</span><input class="hl" type="text" data-in="col-label" data-id="${esc(c.id)}" data-fk="cl-${esc(c.id)}" value="${esc(c.label)}" aria-label="Column name">
        <input class="unit-in" type="text" data-in="col-unit" data-id="${esc(c.id)}" data-fk="cu-${esc(c.id)}" value="${esc(c.unit)}" placeholder="unit" aria-label="Unit">
        ${issue ? '' : `<button class="icon-btn sm" data-act="eq-open" data-v="column" data-id="${esc(c.id)}" aria-label="See ${esc(c.label)} as an equation" title="See as an equation"><span class="sig" aria-hidden="true">∑</span></button>`}
        <button class="icon-btn sm" data-act="col-del" data-id="${esc(c.id)}" aria-label="Remove column" title="Remove">${R.I.x}</button></header>
      <div class="fx-edit"><span class="eq">=</span><textarea rows="1" class="fx-in${issue ? ' bad' : ''}" spellcheck="false" autocomplete="off" data-in="col-fx" data-id="${esc(c.id)}" data-fk="cf-${esc(c.id)}" aria-label="Formula for ${esc(c.label)}" placeholder="e.g. Price / Size">${esc(c.formula)}</textarea></div>
      <div class="names" aria-label="Insert a name">${nameChips(c.id)}</div>
      <div class="fx-status" data-live="cfx:${esc(c.id)}">${calcStatus(c.id)}</div></article>`;
  }

  function nameChips(exclude) {
    const m = S.model;
    const chip = (id, label, kind) => `<button class="name-chip ${kind}" data-act="insert" data-v="${esc(/^[A-Za-z_][A-Za-z0-9_]*$/.test(label) ? label : '[' + label + ']')}" tabindex="-1">${esc(label)}</button>`;
    return m.columns.filter(c => c.id !== exclude).map(c => chip(c.id, c.label, c.formula ? 'calc' : 'col')).join('') + m.knobs.map(k => chip(k.id, k.label, 'knob')).join('');
  }

  function calcStatus(id) {
    const c = H.col(id); if (!c) return '';
    const iss = S.res.issues.find(x => x.where === 'column' && x.id === id);
    if (iss) return errHTML(c.formula, iss);
    if (!S.res.prep.comp[id]) return '<span class="muted">Type a formula above.</span>';
    const rid = S.ui.sel || (S.res.lead && S.res.lead.winner) || (S.res.rows[0] && S.res.rows[0].id);
    const row = S.res.byId[rid];
    const vals = S.res.rows.map(r => r.vals[id]).filter(v => typeof v === 'number');
    const st = E.trace(S.model, S.res, rid).find(x => x.col === id);
    let h = '';
    if (row && st) {
      h += st.err ? `<span class="bad-line">${R.I.warn}${esc(row.label)}: ${esc(st.err)}</span>` : `<span class="ok-line">${R.I.check}<span>For <b>${esc(row.label)}</b>: <span class="mono">${esc(st.plug)}</span> = <b class="num">${esc(H.val(id, st.value))}</b></span></span>`;
    }
    const errs = S.res.rows.filter(r => r.errs[id]);
    if (errs.length && !(errs.length === 1 && errs[0].id === rid)) h += `<span class="bad-line">${R.I.warn}${errs.length} option${errs.length > 1 ? 's' : ''} can't be worked out: ${esc(errs[0].label)}, ${esc(errs[0].errs[id])}</span>`;
    if (vals.length > 1) h += `<span class="muted">Across options: <span class="num">${esc(H.val(id, Math.min(...vals)))} – ${esc(H.val(id, Math.max(...vals)))}</span></span>`;
    if (c.note) h += `<span class="muted">${esc(c.note)}</span>`;
    const used = S.model.criteria.some(x => x.col === id) || S.model.rules.some(r => (MD.compileFormula(S.model, r.formula).refs || []).includes(id)) || S.model.columns.some(x => S.res.prep.comp[x.id] && S.res.prep.comp[x.id].refs.includes(id));
    if (!used) h += `<span class="muted">Not used yet. <button class="link inline" data-act="add-crit" data-id="${esc(id)}">Score options on it</button></span>`;
    return h;
  }
  R.LIVE.cfx = calcStatus;

  function fnHelp() {
    const F = M.formula.FN;
    return `<div class="fn-help"><div class="fn-grid">
      <div><b>Names</b><p>Use any column or setting name. Names with spaces go in [brackets]: <span class="mono">[Unit price] * [Order size]</span>. Capitals don't matter.</p></div>
      <div><b>Maths</b><p><span class="mono">+ − × ÷ ^ ( )</span>. You can type * and / too. <span class="mono">15%</span> means 0.15.</p></div>
      <div><b>Comparisons</b><p><span class="mono">= ≠ &lt; ≤ &gt; ≥</span> or <span class="mono">&lt;= &gt;= !=</span>. Join with <span class="mono">and</span>, <span class="mono">or</span>, <span class="mono">not</span>.</p></div>
      <div><b>Text and yes/no</b><p><span class="mono">Area = "Quiet"</span>, <span class="mono">Balcony</span>, <span class="mono">not Balcony</span>.</p></div></div>
      <ul class="fn-list">${Object.entries(F).map(([k, v]) => `<li><button class="name-chip fn" data-act="insert" data-v="${esc(k)}(" tabindex="-1">${esc(v.line)}</button><span>${esc(v.help)}</span></li>`).join('')}</ul></div>`;
  }

  function options() {
    const m = S.model, res = S.res;
    let h = help('Type over any value. Units like $ or kg are understood, and worked-out columns (ƒ) fill themselves in.');
    h += `<div class="toolbar"><button class="btn" data-act="row-add">${R.I.plus}Add option</button><button class="btn" data-act="col-add">${R.I.plus}Add column</button><button class="btn" data-act="open-paste" data-v="rows">${R.I.paste}Paste from spreadsheet</button><span class="muted num toolbar-n">${m.rows.length} options · ${m.columns.length} columns</span></div>`;
    h += `<div class="table-wrap" data-g="table" data-keep-scroll="table"><table class="grid"><thead><tr><th scope="col" class="th-opt">Option</th>`;
    m.columns.forEach(c => {
      const open = S.ui.colSel === c.id;
      h += `<th scope="col" class="${c.formula ? 'th-calc' : ''}"><div class="th-in">${c.formula ? '<span class="fx-badge sm">ƒ</span>' : ''}<input class="hl" type="text" data-in="col-label" data-id="${esc(c.id)}" data-fk="h-${esc(c.id)}" value="${esc(c.label)}" aria-label="Column name">
        <button class="icon-btn xs" data-act="col-menu" data-id="${esc(c.id)}" aria-expanded="${open}" aria-label="Column options">${R.I.chev}</button></div>
        ${open ? colMenu(c) : `<span class="th-unit">${esc(c.unit || (c.type === 'yesno' ? 'yes / no' : c.type === 'text' ? 'text' : ''))}</span>`}</th>`;
    });
    h += `<th class="th-x"><span class="sr">Remove</span></th></tr></thead><tbody>`;
    m.rows.forEach(r => {
      const rr = res.byId[r.id];
      h += `<tr class="${S.ui.sel === r.id ? 'sel' : ''}${rr && !rr.pass ? ' out' : ''}"><th scope="row"><span class="rdot" style="--rc:var(--c${R.rowTone(r.id)})"></span><input class="cell lbl" type="text" data-in="row-label" data-id="${esc(r.id)}" data-fk="rl-${esc(r.id)}" value="${esc(r.label)}" aria-label="Option name"></th>`;
      m.columns.forEach(c => {
        const v = r.v[c.id];
        if (c.formula) h += `<td class="calc-cell num" data-live="cell:${esc(r.id)}|${esc(c.id)}">${cellCalc(r.id, c.id)}</td>`;
        else if (c.type === 'yesno') h += `<td class="yn"><label class="yn-l"><input type="checkbox" data-in="cell-yn" data-id="${esc(r.id)}" data-col="${esc(c.id)}" ${v ? 'checked' : ''} aria-label="${esc(c.label)} for ${esc(r.label)}"><span>${v ? 'yes' : 'no'}</span></label></td>`;
        else {
          const bad = c.type === 'number' && v != null && typeof v !== 'number';
          h += `<td><input class="cell${c.type === 'number' ? ' n' : ''}${bad ? ' bad' : ''}" type="text" ${c.type === 'number' ? 'inputmode="decimal"' : `list="dl-${esc(c.id)}"`} data-in="cell" data-id="${esc(r.id)}" data-col="${esc(c.id)}" data-fk="c-${esc(r.id)}-${esc(c.id)}" value="${esc(v ?? '')}" placeholder="—" aria-label="${esc(c.label)} for ${esc(r.label)}"></td>`;
        }
      });
      h += `<td class="td-x"><button class="icon-btn xs" data-act="row-del" data-id="${esc(r.id)}" aria-label="Remove ${esc(r.label)}" title="Remove">${R.I.trash}</button></td></tr>`;
    });
    h += '</tbody></table></div>';
    m.columns.filter(c => c.type === 'text').forEach(c => { h += `<datalist id="dl-${esc(c.id)}">${[...new Set(m.rows.map(r => r.v[c.id]).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`; });
    return h;
  }
  function cellCalc(rid, cid) {
    const r = S.res.byId[rid]; if (!r) return '';
    if (r.errs[cid]) return `<span class="cell-err" title="${esc(r.errs[cid])}">can't work out</span>`;
    return esc(H.val(cid, r.vals[cid]));
  }
  R.LIVE.cell = key => { const [r, c] = key.split('|'); return cellCalc(r, c); };

  function colMenu(c) {
    return `<div class="col-menu"><label>Unit <input class="unit-in" type="text" data-in="col-unit" data-id="${esc(c.id)}" data-fk="mu-${esc(c.id)}" value="${esc(c.unit)}" placeholder="$, kg, min"></label>
      ${c.formula ? '' : `<label>Type <select class="sel" data-in="col-type" data-id="${esc(c.id)}">${R.opts([['number', 'Number'], ['yesno', 'Yes / no'], ['text', 'Text']], c.type)}</select></label>`}
      <button class="link danger" data-act="col-del" data-id="${esc(c.id)}">Remove column</button></div>`;
  }
})(window.M);
