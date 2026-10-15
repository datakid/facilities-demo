window.M = window.M || {};
(function (M) {
  'use strict';
  const esc = M.util.esc;
  const CH = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let cur = null, queued = false;

  function close(refocus) {
    if (!cur) return;
    cur.menu.remove();
    cur.btn.setAttribute('aria-expanded', 'false');
    if (refocus && cur.btn.isConnected) cur.btn.focus({ preventScroll: true });
    cur = null;
  }

  function open(sel, btn) {
    close();
    const opts = Array.from(sel.options);
    let hot = Math.max(0, sel.selectedIndex);
    const menu = document.createElement('div');
    menu.className = 'dd-menu';
    menu.setAttribute('role', 'listbox');
    menu.innerHTML = opts.map((o, i) => `<div class="dd-opt${i === sel.selectedIndex ? ' sel' : ''}" role="option" aria-selected="${i === sel.selectedIndex}" data-i="${i}">${esc(o.textContent)}</div>`).join('');
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.minWidth = r.width + 'px';
    const mh = menu.offsetHeight, below = innerHeight - r.bottom;
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (below < mh + 12 && r.top > below ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    const paint = () => Array.from(menu.children).forEach((c, i) => c.classList.toggle('hot', i === hot));
    const pick = i => {
      const changed = i !== sel.selectedIndex;
      close(true);
      if (changed) { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    menu.addEventListener('mousemove', e => { const o = e.target.closest('.dd-opt'); if (o) { hot = +o.dataset.i; paint(); } });
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => { const o = e.target.closest('.dd-opt'); if (o) pick(+o.dataset.i); });
    cur = {
      menu, btn, sel,
      key(e) {
        if (e.key === 'ArrowDown') hot = Math.min(opts.length - 1, hot + 1);
        else if (e.key === 'ArrowUp') hot = Math.max(0, hot - 1);
        else if (e.key === 'Home') hot = 0;
        else if (e.key === 'End') hot = opts.length - 1;
        else if (e.key === 'Enter' || e.key === ' ') pick(hot);
        else if (e.key === 'Escape' || e.key === 'Tab') { close(true); if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } return; }
        else return;
        e.preventDefault(); e.stopPropagation();
        if (cur) { paint(); const h = menu.children[hot]; if (h) h.scrollIntoView({ block: 'nearest' }); }
      }
    };
    paint();
    const h0 = menu.children[hot];
    if (h0) h0.scrollIntoView({ block: 'nearest' });
  }

  function upgrade() {
    queued = false;
    document.querySelectorAll('select:not([data-dd])').forEach(sel => {
      sel.dataset.dd = '1';
      const w = document.createElement('span');
      w.className = 'dd ' + sel.className;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dd-btn';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');
      const lab = sel.getAttribute('aria-label');
      if (lab) btn.setAttribute('aria-label', lab);
      const text = document.createElement('span');
      text.className = 'dd-text';
      btn.appendChild(text);
      btn.insertAdjacentHTML('beforeend', CH);
      const sync = () => { const o = sel.options[sel.selectedIndex]; text.textContent = o ? o.textContent : ''; btn.disabled = sel.disabled; };
      sel.parentNode.insertBefore(w, sel);
      w.appendChild(btn);
      w.appendChild(sel);
      sel.tabIndex = -1;
      sel.setAttribute('aria-hidden', 'true');
      sync();
      sel.addEventListener('change', () => setTimeout(sync, 0));
      sel.addEventListener('focus', () => btn.focus({ preventScroll: true }));
      btn.addEventListener('click', () => { if (cur && cur.btn === btn) close(); else open(sel, btn); });
      btn.addEventListener('keydown', e => { if (!cur && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open(sel, btn); } });
    });
  }

  function schedule() { if (!queued) { queued = true; requestAnimationFrame(upgrade); } }

  document.addEventListener('keydown', e => { if (cur) cur.key(e); }, true);
  document.addEventListener('mousedown', e => { if (cur && !cur.menu.contains(e.target) && !cur.btn.contains(e.target)) close(); }, true);
  window.addEventListener('scroll', e => { if (cur && !cur.menu.contains(e.target)) close(); }, true);
  window.addEventListener('resize', () => close());
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') schedule(); else document.addEventListener('DOMContentLoaded', schedule);

  M.dropdown = { upgrade, close };
})(window.M);
