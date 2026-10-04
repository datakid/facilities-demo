window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, esc = U.esc, R = M.render;

  const fill = s => String(s || '').replace(/\{winner\}/g, () => { const L = S.res && S.res.lead; return L ? S.res.byId[L.winner].label : 'Nobody'; });

  function steps() { return (S.model.guide && S.model.guide.steps) || []; }

  function go(i, quiet) {
    const st = steps();
    if (!st.length || i == null || i < 0) { end(); return; }
    if (i >= st.length) { end(true); return; }
    S.ui.guide = i;
    const s = st[i];
    if (s.focus && s.focus.startsWith('crit:')) (S.ui.exp = S.ui.exp || {})['c:' + s.focus.slice(5)] = true;
    if (s.tab) S.ui.tab = s.tab;
    R.setup();
    if (window.matchMedia('(max-width: 900px)').matches) { S.ui.pane = ['results', 'why', 'checks', 'situations'].includes(s.focus) ? 'results' : 'build'; R.pane(); }
    card();
    R.top();
    M.store.save();
    if (!quiet) scrollTo(s.focus);
  }

  function scrollTo(f) {
    const el = f && document.querySelector(`[data-g="${CSS.escape(f)}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function spot() {
    document.querySelectorAll('.g-spot').forEach(e => e.classList.remove('g-spot'));
    if (S.ui.guide == null) return;
    const s = steps()[S.ui.guide]; if (!s || !s.focus) return;
    const el = document.querySelector(`[data-g="${CSS.escape(s.focus)}"]`);
    if (el) el.classList.add('g-spot');
  }

  function card() {
    const el = document.getElementById('coach'); if (!el) return;
    const st = steps();
    if (S.ui.guide == null || !st.length) { el.hidden = true; el.innerHTML = ''; return; }
    const i = S.ui.guide, s = st[i];
    el.hidden = false;
    el.innerHTML = `<div class="coach-top"><span class="coach-n num">${i + 1} / ${st.length}</span><div class="coach-dots">${st.map((_, j) => `<button data-act="guide-go" data-v="${j}" aria-label="Step ${j + 1}" aria-current="${j === i}"></button>`).join('')}</div><button class="icon-btn sm" data-act="guide-end" aria-label="Close guide">${R.I.x}</button></div>
      <h3 class="coach-t">${esc(fill(s.title))}</h3><p class="coach-b">${esc(fill(s.body))}</p>${s.task ? `<p class="coach-task"><span>Try it</span>${esc(fill(s.task))}</p>` : ''}
      <div class="coach-nav"><button class="btn sm ghost" data-act="guide-go" data-v="${i - 1}" ${i ? '' : 'disabled'}>Back</button><button class="btn sm primary" data-act="guide-go" data-v="${i + 1}">${i === st.length - 1 ? 'Finish' : 'Next'}</button></div>`;
  }

  function end(done) {
    S.ui.guide = null;
    spot(); card(); R.top(); M.store.save();
    if (done) M.store.toast('Tour done. Everything here is yours to change.');
  }

  M.guide = { go, spot, card, end, refresh: () => { spot(); card(); } };
})(window.M);
