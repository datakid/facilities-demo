window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, esc = U.esc, MD = M.model;
  const R = M.render = M.render || {};

  const sv = d => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  R.I = {
    mark: '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--brand-soft)"/><circle cx="16" cy="16" r="10" fill="none" stroke="var(--brand)" stroke-opacity=".32" stroke-width="1.4"/><path d="M16 5.5 19.2 16h-6.4z" fill="var(--brand)"/><path d="M16 26.5 19.2 16h-6.4z" fill="var(--brand-mid)"/><circle cx="16" cy="16" r="1.8" fill="var(--brand-soft)"/></svg>',
    undo: sv('<path d="M5 3 2 6l3 3"/><path d="M2 6h7.5a4 4 0 0 1 0 8H6"/>'),
    redo: sv('<path d="M11 3l3 3-3 3"/><path d="M14 6H6.5a4 4 0 0 0 0 8H10"/>'),
    x: sv('<path d="M4 4l8 8M12 4l-8 8"/>'),
    plus: sv('<path d="M8 3v10M3 8h10"/>'),
    trash: sv('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
    chev: sv('<path d="M4 6l4 4 4-4"/>'),
    book: sv('<path d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z"/>'),
    share: sv('<path d="M8 2v8M5 5l3-3 3 3"/><path d="M3 9v4h10V9"/>'),
    paste: sv('<rect x="3.5" y="3" width="9" height="11" rx="1.5"/><path d="M6 3V2h4v1"/><path d="M6 7h4M6 10h3"/>'),
    fx: '<span class="fx" aria-hidden="true">ƒ</span>',
    check: sv('<path d="M3 8.5l3 3 7-7"/>'),
    warn: sv('<path d="M8 2.5l6 11H2z"/><path d="M8 7v3M8 12v.01"/>'),
    info: sv('<circle cx="8" cy="8" r="6"/><path d="M8 7.5V11M8 5v.01"/>'),
    dots: sv('<path d="M3.5 8h.01M8 8h.01M12.5 8h.01"/>'),
    copy: sv('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/>')
  };

  R.opts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  R.seg = (act, cur, list, extra) => `<div class="seg" role="group">${list.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${esc(v)}" ${extra || ''} aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  R.toggle = (act, id, on, label) => `<button type="button" class="switch" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-act="${act}" data-id="${esc(id)}"><span></span></button>`;
  R.rowTone = id => { const i = S.model.rows.findIndex(r => r.id === id); return i < 0 ? 0 : (i % 8) + 1; };
  R.rowLabel = id => { const r = S.model.rows.find(x => x.id === id); return r ? r.label : 'nobody'; };
  R.critName = c => { const col = H.col(c.col); return col ? col.label : '(missing column)'; };

  function keepFocus(root, fn) {
    const a = document.activeElement;
    const key = a && root.contains(a) ? a.getAttribute('data-fk') : null;
    const sel = key && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    const scrollers = [...root.querySelectorAll('[data-keep-scroll]')].map(el => [el.getAttribute('data-keep-scroll'), el.scrollTop, el.scrollLeft]);
    const st = root.scrollTop;
    fn();
    root.scrollTop = st;
    scrollers.forEach(([k, t, l]) => { const el = root.querySelector(`[data-keep-scroll="${k}"]`); if (el) { el.scrollTop = t; el.scrollLeft = l; } });
    if (key) {
      const el = root.querySelector(`[data-fk="${CSS.escape(key)}"]`);
      if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { void e; } }
    }
  }
  R.keepFocus = keepFocus;

  R.top = () => {
    const el = document.getElementById('topbar'); if (!el) return;
    const m = S.model;
    const html = `<a class="brand" href="./" aria-label="Meridian Studio">${R.I.mark}<span class="brand-name">Meridian</span></a>
      <div class="title-wrap">
        <input class="title-in" data-in="name" data-fk="name" value="${esc(m.name)}" aria-label="Ranking name" spellcheck="false">
        <input class="question-in" data-in="question" data-fk="question" value="${esc(m.question)}" placeholder="What are you deciding?" aria-label="The question" spellcheck="false">
      </div>
      <nav class="top-actions" aria-label="Main">
        <button class="btn ghost" data-act="open-start">${R.I.book}<span class="hide-sm">Examples</span></button>
        ${m.guide && m.guide.steps && S.ui.guide == null ? `<button class="btn ghost" data-act="guide-start"><span>Show me how</span></button>` : ''}
        <span class="sep" aria-hidden="true"></span>
        <button class="icon-btn" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo" ${H.canUndo() ? '' : 'disabled'}>${R.I.undo}</button>
        <button class="icon-btn" data-act="redo" title="Redo (Shift+Ctrl+Z)" aria-label="Redo" ${H.canRedo() ? '' : 'disabled'}>${R.I.redo}</button>
        <button class="btn" data-act="open-export">${R.I.share}<span class="hide-sm">Save &amp; share</span></button>
      </nav>`;
    const sg = [H.canUndo(), H.canRedo(), S.ui.guide == null, !!(m.guide && m.guide.steps)].join('|');
    if (!el.innerHTML || el.dataset.sig !== sg) { keepFocus(el, () => { el.innerHTML = html; }); el.dataset.sig = sg; }
    else {
      const n = el.querySelector('.title-in'), q = el.querySelector('.question-in');
      if (n && document.activeElement !== n && n.value !== m.name) n.value = m.name;
      if (q && document.activeElement !== q && q.value !== m.question) q.value = m.question;
    }
    document.title = `${m.name} · Meridian Studio`;
  };

  R.live = () => {
    document.querySelectorAll('[data-live]').forEach(el => {
      const [k, id] = el.getAttribute('data-live').split(':');
      const f = R.LIVE[k]; if (!f) return;
      const h = f(id); if (h != null && el.innerHTML !== h) el.innerHTML = h;
    });
  };
  R.LIVE = R.LIVE || {};

  R.pane = () => {
    document.body.dataset.pane = S.ui.pane;
    document.querySelectorAll('[data-act="pane"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.ui.pane)));
  };
})(window.M);
