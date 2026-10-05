window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, esc = U.esc, R = M.render, E = M.engine, MD = M.model, EQ = M.equations;
  const FMTS = [['math', 'Math'], ['sym', 'Symbols'], ['text', 'Plain text'], ['tex', 'LaTeX']];
  const KIND = { setting: 'Setting', column: 'Worked out', rule: 'Must-have', crit: 'Points', total: 'Total' };
  const fmt = () => S.ui.eqFmt || 'math';
  const copyKey = f => f === 'math' ? 'tex' : f;
  let cache = null;

  function data() {
    const sig = S.res;
    if (!cache || cache.res !== sig) cache = { res: sig, eq: EQ.build(S.model, S.res) };
    return cache.eq;
  }
  R.eqData = data;

  const rowId = () => {
    const id = S.ui.eqRow || S.ui.sel || (S.res.lead && S.res.lead.winner) || (S.res.rows[0] && S.res.rows[0].id);
    return S.res.byId[id] ? id : (S.res.rows[0] && S.res.rows[0].id);
  };
  const matchQ = (it, q) => !q || (it.label + ' ' + (it.group || '') + ' ' + EQ.strings(S.model, it).map(s => s.text).join(' ')).toLowerCase().includes(q);

  function numbers(it, row, trace) {
    if (!row || !S.ui.eqNums) return '';
    const sub = n => String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');
    let h = '';
    if (it.kind === 'column') {
      const st = trace.find(x => x.col === it.id);
      if (st) h = st.err ? `<span class="bad-line">${R.I.warn}${esc(st.err)}</span>` : `<span class="mono">${esc(st.plug)}</span> = <b class="num">${esc(H.val(it.id, st.value))}</b>`;
    } else if (it.kind === 'rule') {
      const x = row.rules.find(y => y.id === it.id);
      if (x) h = x.pass ? `<span class="eq-ok">${R.I.check}passes</span>` : `<span class="eq-bad">${R.I.x}${x.error ? esc(x.error) : it.soft ? 'missed, −' + U.fmtNum(it.penalty) + ' points' : 'fails, ruled out'}</span>`;
    } else if (it.kind === 'crit') {
      const x = row.c && row.c[it.id];
      if (x) h = x.missing ? '<span class="tag warn">blank, 0 points</span>' : `${esc(it.label)} = <b class="num">${esc(H.val(it.col, x.raw))}</b>${x.t != null && it.eqs.length > 1 ? ` · t${sub(it.n)} = <b class="num">${(+x.t.toFixed(3))}</b>` : ''} · p${sub(it.n)} = <b class="num">${(x.s * 10).toFixed(2)}</b> of 10`;
    } else if (it.kind === 'total') {
      h = row.pass ? `Score = <b class="num">${row.score.toFixed(1)}</b>${row.penalty ? ` <span class="muted">(${row.base.toFixed(1)} − ${U.fmtNum(row.penalty)})</span>` : ''}` : '<span class="eq-bad">ruled out by a must-have, not scored</span>';
    }
    return h ? `<div class="eq-nums">${h}</div>` : '';
  }

  function eqBody(it, f) {
    if (it.broken) return `<div class="eq-broken"><span class="bad-line">${R.I.warn}${esc(it.broken)}</span><code class="mono">${esc(it.raw)}</code></div>`;
    const ss = EQ.strings(S.model, it);
    if (f === 'math') return ss.map(s => `<div class="eq-math" data-tex="${esc(s.tex)}"><span class="eq-fallback mono">${esc(s.sym)}</span></div>`).join('');
    return `<pre class="eq-code${f === 'sym' ? ' sym' : ''}">${esc(ss.map(s => s[f]).join('\n'))}</pre>`;
  }

  function card(it, i, f, row, trace) {
    const meta = it.kind === 'crit' ? `<span class="share num" style="--k:var(--k${H.cidx(it.id)});--t:var(--t${H.cidx(it.id)})">${Math.round(it.share * 100)}%</span><span class="eq-how">${esc(it.how)}</span>`
      : it.kind === 'rule' ? `<span class="eq-how">${esc(it.effect || '')}</span>`
      : it.kind === 'setting' && it.note ? `<span class="eq-how">${esc(it.note)}</span>`
      : it.kind === 'column' && it.note ? `<span class="eq-how">${esc(it.note)}</span>` : '';
    const go = { setting: 'knob', column: 'column', rule: 'rule', crit: 'criterion' }[it.kind];
    return `<article class="eq-card k-${it.kind}${it.broken ? ' broken' : ''}" data-g="eq:${esc(it.kind)}:${esc(it.id)}">
      <header class="eq-head">${it.kind === 'crit' ? `<span class="eq-n num" style="--c:var(--c${H.cidx(it.id)})">${it.n}</span>` : `<span class="eq-kind">${KIND[it.kind]}</span>`}<b class="eq-label">${esc(it.label)}</b>${meta}
        <span class="eq-acts">${go ? `<button class="link sm" data-act="go" data-kind="${go}" data-id="${esc(it.id)}">Edit</button>` : ''}${it.broken ? '' : `<button class="icon-btn xs" data-act="eq-copy" data-v="${i}" title="Copy${f === 'math' ? ' as LaTeX' : ''}" aria-label="Copy ${esc(it.label)}">${R.I.copy}</button>`}</span></header>
      ${eqBody(it, f)}${numbers(it, row, trace)}</article>`;
  }

  R.equationsHTML = () => {
    const eq = data(), f = fmt(), q = (S.ui.eqQ || '').trim().toLowerCase();
    const rid = rowId(), row = S.res.byId[rid], trace = S.ui.eqNums && row ? (E.trace(S.model, S.res, rid) || []) : [];
    const counts = Object.fromEntries(EQ.SECTIONS.map(([k]) => [k, eq.items.filter(x => x.kind === k).length]));
    let h = `<p class="lede">Every formula behind the ranking, written out in full: settings, worked-out columns, must-haves, how each thing turns into points, and the total. Copy one, or export them all.</p>`;
    h += `<div class="eq-bar" data-g="eq-bar">${R.seg('eq-fmt', f, FMTS)}
      <span class="eq-bar-r"><button class="btn sm" data-act="eq-copy-all">${R.I.copy}Copy all</button><button class="btn sm" data-act="eq-dl">${R.I.share}Download .${f === 'math' || f === 'tex' ? 'tex' : 'txt'}</button></span></div>`;
    h += `<div class="eq-bar2"><label class="eq-nums-t">${R.toggle('eq-nums', 'n', !!S.ui.eqNums, 'Show the numbers for one option')}<span>Numbers for</span></label>
      <select class="sel" data-in="eq-row" aria-label="Option" ${S.ui.eqNums ? '' : 'disabled'}>${R.opts(S.model.rows.map(r => [r.id, r.label]), rid)}</select>
      ${eq.items.length > 14 ? `<input class="find-in eq-find" type="search" data-in="eq-q" data-fk="eq-q" value="${esc(S.ui.eqQ || '')}" placeholder="Find an equation" aria-label="Find an equation">` : ''}</div>`;
    h += `<nav class="eq-toc" aria-label="Sections">${EQ.SECTIONS.filter(([k]) => counts[k]).map(([k, t]) => `<button class="chip-btn" data-act="eq-jump" data-v="${k}">${esc(t.replace('Points of 10 for each thing that matters', 'Points'))}<span class="num muted">${counts[k]}</span></button>`).join('')}</nav>`;
    let any = false;
    EQ.SECTIONS.forEach(([k, title]) => {
      const list = eq.items.map((it, i) => [it, i]).filter(([it]) => it.kind === k && matchQ(it, q));
      if (!list.length) return;
      any = true;
      const note = k === 'crit' ? '<p class="hint eq-sec-n">Each value is placed on a 0–1 scale <span class="mono">t</span> between the worst and best of your options (kept between 0 and 1), then the curve turns it into points <span class="mono">p</span> from 0 to 10.</p>'
        : k === 'total' ? `<p class="hint eq-sec-n">${S.model.method === 'balanced' ? 'Balanced: a weighted geometric blend, so one weak spot pulls the score down more.' : 'Added up: each p times its share of importance, out of 100.'}</p>` : '';
      h += `<section class="eq-sec" id="eq-${k}" data-g="eq-sec:${k}"><h3 class="eq-sec-h">${esc(title)}<span class="num muted">${list.length}</span></h3>${note}<div class="eq-list">${list.map(([it, i]) => card(it, i, f, row, trace)).join('')}</div></section>`;
    });
    if (!any) h += `<p class="empty">${q ? 'No equation matches.' : 'Nothing to show yet.'}</p>`;
    return h;
  };

  R.eqMount = root => {
    const K = window.katex;
    root.querySelectorAll('.eq-math[data-tex]').forEach(el => {
      if (!K) { el.classList.add('plain'); return; }
      try { K.render(el.getAttribute('data-tex'), el, { throwOnError: false, displayMode: true, strict: 'ignore', output: 'html' }); }
      catch (e) { el.classList.add('plain'); }
    });
    fit(root);
  };

  function fit(root) {
    root.querySelectorAll('.eq-math:not(.plain)').forEach(el => {
      const k = el.querySelector('.katex'); if (!k) return;
      k.style.fontSize = '';
      el.classList.remove('wide', 'at-end');
      const w = k.scrollWidth, room = el.clientWidth - 4;
      if (w <= room || !room) return;
      const s = Math.max(0.82, room / w);
      k.style.fontSize = (1.08 * s).toFixed(3) + 'em';
      if (k.scrollWidth > el.clientWidth - 4) {
        el.classList.add('wide');
        if (!el.dataset.sb) { el.dataset.sb = 1; el.addEventListener('scroll', () => el.classList.toggle('at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 2), { passive: true }); }
      }
    });
  }
  let fitT = null;
  if (window.ResizeObserver) new ResizeObserver(() => { if (S.ui.tab !== 'equations') return; clearTimeout(fitT); fitT = setTimeout(() => fit(document.getElementById('setup')), 120); }).observe(document.getElementById('setup'));

  function allText(f) { return EQ.doc(S.model, data(), copyKey(f), it => matchQ(it, (S.ui.eqQ || '').trim().toLowerCase())); }
  R.eqExport = kind => EQ.doc(S.model, data(), kind);

  const A = M.app.ACT;
  A['eq-fmt'] = v => { S.ui.eqFmt = v; R.setup(); };
  A['eq-nums'] = () => { S.ui.eqNums = !S.ui.eqNums; R.setup(); };
  A['eq-copy'] = v => {
    const it = data().items[+v]; if (!it) return;
    const k = copyKey(fmt());
    M.app.copy(EQ.strings(S.model, it).map(s => s[k]).join('\n'), k === 'tex' ? 'Copied as LaTeX' : 'Copied');
  };
  A['eq-copy-all'] = () => M.app.copy(allText(fmt()), fmt() === 'math' || fmt() === 'tex' ? 'All equations copied as LaTeX' : 'All equations copied');
  A['eq-dl'] = () => { const k = copyKey(fmt()); M.app.download(M.app.slug(S.model.name) + '-equations.' + (k === 'tex' ? 'tex' : 'txt'), allText(fmt()), 'text/plain'); };
  A['eq-jump'] = v => { const el = document.getElementById('eq-' + v); if (el) el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  A['eq-open'] = (v, id) => {
    S.ui.tab = 'equations'; S.ui.pane = 'build'; R.pane(); R.setup();
    const g = v ? `eq:${v}:${id}` : null;
    requestAnimationFrame(() => { const el = g && document.querySelector(`[data-g="${CSS.escape(g)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); } else window.scrollTo(0, 0); });
  };

  window.addEventListener('load', () => { if (S.ui.tab === 'equations' && S.model) R.setup(); });
  A['eq-why'] = (v, id) => { S.ui.eqRow = id; S.ui.eqNums = true; A['eq-open'](); };

  document.addEventListener('change', e => {
    const el = e.target, k = el.getAttribute && el.getAttribute('data-in');
    if (k === 'eq-row') { S.ui.eqRow = el.value; R.setup(); }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.getAttribute && el.getAttribute('data-in') === 'eq-q') { S.ui.eqQ = el.value; R.setup(); }
  });
})(window.M);
