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

  const fmtV = v => (Number.isFinite(v) ? U.fmtNum(+v.toPrecision(4)) : v > 0 ? '∞' : '−∞');
  const cut = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);
  const axisTitle = (W, Ht, txt, L, pw) => `<text class="ch-ttl" x="${L + pw / 2}" y="${Ht - 6}" text-anchor="middle">${esc(txt)}</text>`;
  const yAxis = (L, T, ph, pw, Y, yl) => [0, 5, 10].map(v => `<line class="ch-grid${v === 0 ? ' base' : ''}" x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ch-tick" x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`).join('') + `<text class="ch-ttl" transform="translate(11 ${T + ph / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>`;

  const optNo = id => S.res.rows.findIndex(r => r.id === id) + 1;
  const chartW = () => { const el = document.getElementById('setup'); return el && el.clientWidth > 0 && el.clientWidth < 560 ? 330 : 420; };

  function keyHTML(items) {
    return `<ol class="ch-key">${items.map(x => `<li${x.out ? ' class="out"' : ''}><span class="ch-n">${x.no}</span>${esc(x.label)}${x.note ? ` <span class="ch-off">${esc(x.note)}</span>` : ''}</li>`).join('')}</ol>`;
  }

  function curveSVG(d, it, selId) {
    const W = chartW(), Ht = 222, L = 40, Rr = 16, T = 18, B = 50, pw = W - L - Rr, ph = Ht - T - B, MAXC = 22;
    const X = x => L + (x - d.d0) / (d.d1 - d.d0) * pw, Y = y => T + ph - y / 10 * ph;
    const pts = d.curve.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`);
    let g = yAxis(L, T, ph, pw, Y, d.yLabel);
    g += d.ticks.map(t => `<line class="ch-grid v" x1="${X(t.x)}" x2="${X(t.x)}" y1="${T}" y2="${T + ph}"/><text class="ch-tick" x="${X(t.x)}" y="${T + ph + 19}" text-anchor="middle">${esc(t.label)}</text>`).join('');
    g += `<path class="ch-area" d="M${X(d.curve[0].x).toFixed(1)},${Y(0)} L${pts.join(' L')} L${X(d.curve[d.curve.length - 1].x).toFixed(1)},${Y(0)} Z"/><polyline class="ch-line" points="${pts.join(' ')}"/>`;
    const boxes = [];
    if (d.mark) {
      const mx = X(d.mark.x), right = mx > L + pw * 0.62, mt = `${d.mark.label} ${fmtV(d.mark.x)}`, mw = mt.length * 5.6 + 6;
      g += `<line class="ch-mark" x1="${mx}" x2="${mx}" y1="${T - 12}" y2="${T + ph}"/><text class="ch-mark-t" x="${mx + (right ? -4 : 4)}" y="${T - 7}" text-anchor="${right ? 'end' : 'start'}">${esc(mt)}</text>`;
      boxes.push({ l: right ? mx - 4 - mw : mx + 2, r: right ? mx - 2 : mx + 4 + mw, t: T - 17, b: T - 3 });
    }
    const groups = [];
    d.dots.forEach(p => {
      const px = X(p.x), py = Y(p.y), key = Math.round(px / 4) + ':' + Math.round(py / 4) + ':' + (p.off || '');
      let grp = groups.find(q => q.key === key);
      if (!grp) { grp = { key, px, py, ps: [] }; groups.push(grp); }
      grp.ps.push(p);
    });
    let crowded = false;
    groups.forEach(q => {
      q.sel = q.ps.some(p => p.id === selId); q.pass = q.ps.some(p => p.pass);
      const off = q.ps[0].off, names = q.ps.length > 2 ? q.ps.length + ' options' : q.ps.map(p => p.label).join(', ');
      if (names.length > MAXC) crowded = true;
      q.text = names + (off ? ' · ' + fmtV(q.ps[0].raw) + (off === 'hi' ? ' →' : ' ←') : '');
      q.w = q.text.length * 5.9 + 4;
    });
    const order = groups.slice().sort((a, b) => (b.sel - a.sel) || (a.px - b.px));
    if (!crowded) {
      order.forEach(q => {
        const s = q.w / 2 + 9, cands = [[0, -9], [0, 16], [s, 3.5], [-s, 3.5], [0, -23], [0, 30], [s, -10], [-s, -10], [s, 17], [-s, 17], [0, -37], [0, 44]];
        let best = null;
        for (const [dx, dy] of cands) {
          let left = q.px + dx - q.w / 2;
          if (left < L + 2) left = L + 2;
          if (left + q.w > W - 4) left = W - 4 - q.w;
          const ty = q.py + dy, box = { l: left, r: left + q.w, t: ty - 10, b: ty + 3 };
          const inside = box.t >= 1 && box.b <= T + ph + 6;
          const hit = boxes.some(o => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t) || groups.some(o => { const m = o === q ? 5 : 7; return box.l < o.px + m && box.r > o.px - m && box.t < o.py + m && box.b > o.py - m; });
          if (inside && !hit) { best = { box, ty }; break; }
        }
        if (!best) { crowded = true; return; }
        boxes.push(best.box); q.at = best;
      });
    }
    let key = '';
    if (!crowded) {
      groups.forEach(q => {
        const tip = q.ps.map(p => `${p.label}: ${fmtV(p.raw)} → ${(+p.y.toFixed(2))} points`).join('\n');
        g += `<circle class="ch-dot${q.pass ? '' : ' out'}${q.sel ? ' sel' : ''}" cx="${q.px.toFixed(1)}" cy="${q.py.toFixed(1)}" r="${q.sel ? 6 : 4.6}"><title>${esc(tip)}</title></circle>`;
      });
      groups.forEach(q => { g += `<text class="ch-lab${q.sel ? ' sel' : ''}${q.pass ? '' : ' out'}" x="${(q.at.box.l + 2).toFixed(1)}" y="${q.at.ty.toFixed(1)}">${esc(q.text)}</text>`; });
    } else {
      const clusters = [];
      groups.slice().sort((a, b) => a.px - b.px).forEach(q => {
        const c = clusters.find(k => Math.abs(k.px - q.px) < 16 && Math.abs(k.py - q.py) < 12);
        if (!c) { clusters.push({ px: q.px, py: q.py, ps: q.ps.slice(), sel: q.sel, pass: q.pass }); return; }
        const n = c.ps.length, m = q.ps.length;
        c.px = (c.px * n + q.px * m) / (n + m); c.py = (c.py * n + q.py * m) / (n + m);
        c.ps = c.ps.concat(q.ps); c.sel = c.sel || q.sel; c.pass = c.pass || q.pass;
      });
      clusters.sort((a, b) => a.sel - b.sel).forEach(q => {
        const nums = q.ps.map(p => optNo(p.id)).sort((a, b) => a - b).join(' '), w = Math.max(17, nums.length * 6.4 + 9);
        const cx = Math.min(Math.max(q.px, L + w / 2), W - 4 - w / 2);
        const tip = q.ps.map(p => `${p.label}: ${fmtV(p.raw)} → ${(+p.y.toFixed(2))} points`).join('\n');
        g += `<g class="ch-pin${q.pass ? '' : ' out'}${q.sel ? ' sel' : ''}"><title>${esc(tip)}</title><rect x="${(cx - w / 2).toFixed(1)}" y="${(q.py - 8).toFixed(1)}" width="${w.toFixed(1)}" height="16" rx="8"/><text x="${cx.toFixed(1)}" y="${(q.py + 3.4).toFixed(1)}" text-anchor="middle">${nums}</text></g>`;
      });
      key = keyHTML(d.dots.slice().sort((a, b) => optNo(a.id) - optNo(b.id)).map(p => ({ no: optNo(p.id), label: p.label, out: !p.pass, note: p.off ? `${fmtV(p.raw)}, off the scale` : '' })));
    }
    g += axisTitle(W, Ht, d.xLabel, L, pw);
    return { svg: `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(it.label)}: points from 0 to 10 against ${esc(d.xLabel)}">${g}</svg>`, key };
  }

  function catsSVG(d, it) {
    const W = chartW(), L = 40, Rr = 16, T = 20, ph = 104, pw = W - L - Rr, n = d.cats.length || 1, slot = pw / n, bw = Math.min(60, slot * 0.62);
    const perLine = Math.max(6, Math.floor(slot / 5.6)), fits = d.cats.every(c => c.names.length <= 3 && c.names.every(s => s.length <= perLine));
    const rows = fits ? Math.max(0, ...d.cats.map(c => c.names.length)) : 1, Ht = T + ph + 18 + rows * 12 + 28, Y = y => T + ph - y / 10 * ph;
    let g = yAxis(L, T, ph, pw, Y, d.yLabel);
    d.cats.forEach((c, i) => {
      const cx = L + slot * (i + 0.5), h = ph - (Y(c.y) - T);
      g += `<rect class="ch-bar" x="${(cx - bw / 2).toFixed(1)}" y="${Y(c.y).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="4"><title>${esc(c.k)}: ${fmtV(c.y)} points</title></rect>`;
      g += `<text class="ch-val" x="${cx}" y="${Y(c.y) - 5}" text-anchor="middle">${esc(fmtV(c.y))}</text>`;
      g += `<text class="ch-cat" x="${cx}" y="${T + ph + 15}" text-anchor="middle">${esc(cut(c.k, perLine))}</text>`;
      const shown = fits ? c.names : [c.names.length ? c.names.length + (c.names.length === 1 ? ' option' : ' options') : ''];
      g += shown.map((s, j) => `<text class="ch-names" x="${cx}" y="${T + ph + 28 + j * 12}" text-anchor="middle">${esc(s)}</text>`).join('');
    });
    g += axisTitle(W, Ht, d.xLabel, L, pw);
    const key = fits ? '' : `<ul class="ch-key cats">${d.cats.filter(c => c.names.length).map(c => `<li><b>${esc(c.k)}</b> ${c.names.map(esc).join(', ')}</li>`).join('')}</ul>`;
    return { svg: `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(it.label)}: points for each answer">${g}</svg>`, key };
  }

  function chart(it, selId) {
    if (it.kind !== 'crit') return '';
    const d = EQ.chartData(S.model, S.res, it.id);
    if (!d) return '';
    const r = d.kind === 'cats' ? catsSVG(d, it) : curveSVG(d, it, selId);
    const notes = [];
    if (d.kind === 'curve' && d.dots.some(p => !p.pass)) notes.push('Hollow dots are ruled out by a must-have.');
    if (d.blank.length) notes.push(`No value for ${d.blank.map(esc).join(', ')}: 0 points.`);
    return `<figure class="eq-chart" style="--c:var(--c${H.cidx(it.id)})">${r.svg}${r.key}${notes.length ? `<figcaption>${notes.join(' ')}</figcaption>` : ''}</figure>`;
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
      ${it.kind === 'crit' && !it.broken ? `<div class="eq-split"><div class="eq-main">${eqBody(it, f)}${numbers(it, row, trace)}</div>${chart(it, S.ui.eqNums ? row && row.id : null)}</div>` : `${eqBody(it, f)}${numbers(it, row, trace)}`}</article>`;
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
        : k === 'total' ? `<p class="hint eq-sec-n">${S.model.method === 'strict' ? 'Weakest link: each p times its share of importance, then scaled by how strong the weakest p is. A zero anywhere halves the score.' : S.model.method === 'balanced' ? 'Balanced: a weighted geometric blend, so one weak spot pulls the score down more.' : 'Added up: each p times its share of importance, out of 100.'}</p>` : '';
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
