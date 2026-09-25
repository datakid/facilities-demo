/* Meridian Studio — UI primitives: themed dropdowns, menus and confirm dialogs.
   Replaces native <select> popups and window.confirm() with components that match the app. */
window.M = window.M || {};
(function (M) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEVRON = '<svg class="sel-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------- listbox popover (shared by dropdowns and menus) ---------------- */
  const pop = document.createElement('div');
  pop.className = 'sel-pop'; pop.id = 'sel-pop'; pop.tabIndex = -1; pop.hidden = true;
  document.body.appendChild(pop);
  let cur = null; // { anchor, items, index, onPick, role }
  let typed = '', typedT = null;

  function place() {
    if (!cur) return;
    if (!cur.anchor.isConnected) return close(false);
    const r = cur.anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    pop.style.minWidth = Math.max(r.width, cur.minWidth || 0) + 'px';
    pop.style.maxHeight = '';
    const h = Math.min(pop.scrollHeight, 300), below = vh - r.bottom - 8, above = r.top - 8;
    let top = r.bottom + 4;
    if (h > below && above > below) { top = Math.max(8, r.top - 4 - Math.min(h, above)); pop.style.maxHeight = Math.min(300, above) + 'px'; }
    else pop.style.maxHeight = Math.max(120, Math.min(300, below)) + 'px';
    const w = pop.offsetWidth;
    let left = cur.align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function paintActive() {
    pop.querySelectorAll('.sel-opt').forEach((el, i) => el.classList.toggle('active', i === cur.index));
    const a = pop.querySelector('.sel-opt.active');
    if (a) { pop.setAttribute('aria-activedescendant', a.id); a.scrollIntoView({ block: 'nearest' }); }
  }
  function open(anchor, items, onPick, opts) {
    opts = opts || {};
    if (cur && cur.anchor === anchor) return close(true);
    if (cur) close(false);
    const sel = items.findIndex(i => i.selected);
    cur = { anchor, items, onPick, index: sel >= 0 ? sel : items.findIndex(i => !i.disabled), align: opts.align, minWidth: opts.minWidth, role: opts.role || 'listbox' };
    pop.setAttribute('role', cur.role);
    if (opts.label) pop.setAttribute('aria-label', opts.label); else pop.removeAttribute('aria-label');
    const itemRole = cur.role === 'menu' ? 'menuitem' : 'option';
    pop.innerHTML = items.map((it, i) => `<div class="sel-opt${it.selected ? ' is-sel' : ''}${it.danger ? ' danger' : ''}" id="sel-opt-${i}" role="${itemRole}" data-i="${i}" ${cur.role === 'listbox' ? `aria-selected="${!!it.selected}"` : ''} ${it.disabled ? 'aria-disabled="true"' : ''}>
      <span class="sel-opt-label">${esc(it.label)}</span>${it.hint ? `<span class="sel-opt-hint">${esc(it.hint)}</span>` : ''}</div>`).join('');
    pop.hidden = false; pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
    anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', 'sel-pop');
    place(); paintActive(); pop.focus({ preventScroll: true });
  }
  function close(refocus) {
    if (!cur) return;
    const a = cur.anchor; cur = null;
    pop.hidden = true; pop.innerHTML = ''; pop.removeAttribute('aria-activedescendant');
    if (a.isConnected) { a.setAttribute('aria-expanded', 'false'); if (refocus) a.focus({ preventScroll: true }); }
  }
  function choose(i) {
    if (!cur) return;
    const it = cur.items[i]; if (!it || it.disabled) return;
    const fn = cur.onPick; close(true); fn(it.value, it);
  }
  function move(d) {
    const n = cur.items.length; if (!n) return;
    let i = cur.index;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!cur.items[i].disabled) break; }
    cur.index = i; paintActive();
  }
  pop.addEventListener('keydown', e => {
    if (!cur) return;
    e.stopPropagation();
    const k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'Home') { e.preventDefault(); cur.index = -1; move(1); }
    else if (k === 'End') { e.preventDefault(); cur.index = cur.items.length; move(-1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(cur.index); }
    else if (k === 'Escape' || k === 'Tab') { e.preventDefault(); close(true); }
    else if (k.length === 1 && /\S/.test(k)) {
      clearTimeout(typedT); typed += k.toLowerCase(); typedT = setTimeout(() => { typed = ''; }, 600);
      const n = cur.items.length;
      for (let s = 1; s <= n; s++) {
        const i = (cur.index + (typed.length > 1 ? 0 : s)) % n;
        if (!cur.items[i].disabled && String(cur.items[i].label).toLowerCase().startsWith(typed)) { cur.index = i; paintActive(); break; }
      }
    }
  });
  pop.addEventListener('click', e => { const o = e.target.closest('.sel-opt'); if (o) choose(+o.dataset.i); });
  pop.addEventListener('mousemove', e => { const o = e.target.closest('.sel-opt'); if (o && cur && +o.dataset.i !== cur.index && !cur.items[+o.dataset.i].disabled) { cur.index = +o.dataset.i; paintActive(); } });
  document.addEventListener('pointerdown', e => { if (cur && !pop.contains(e.target) && !cur.anchor.contains(e.target)) close(false); }, true);
  window.addEventListener('resize', () => place());
  document.addEventListener('scroll', e => { if (cur && e.target !== pop && !pop.contains(e.target)) place(); }, true);

  /* ---------------- themed <select> ---------------- */
  // The native <select> stays in the DOM as the value holder (hidden). The button opens the themed list,
  // and picking an item sets the select and fires a normal 'change' event, so app code is unchanged.
  const selLabel = sel => { const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ''; };
  function enhance(sel) {
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = ('sel-btn ' + sel.className).trim();
    if (sel.style.cssText) btn.style.cssText = sel.style.cssText;
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.disabled = sel.disabled;
    btn.dataset.focusKey = sel.dataset.focusKey || 'sel:' + [sel.dataset.in, sel.dataset.id, sel.dataset.col, sel.dataset.cat].filter(Boolean).join(':');
    delete sel.dataset.focusKey;
    let name = sel.getAttribute('aria-label') || '';
    if (sel.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(sel.id)}"]`);
      btn.id = sel.id; sel.removeAttribute('id');
      if (lab) name = lab.textContent.trim();
    }
    const val = selLabel(sel);
    btn.innerHTML = `<span class="sel-val">${esc(val)}</span>${CHEVRON}`;
    btn.setAttribute('aria-label', name ? `${name}: ${val}` : val);
    btn.title = val.length > 18 ? val : '';
    sel.classList.add('sel-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);
    btn.addEventListener('click', () => {
      const items = Array.from(sel.options).map((o, i) => ({ label: o.textContent, value: i, selected: i === sel.selectedIndex, disabled: o.disabled, hint: o.dataset.hint || '' }));
      open(btn, items, i => {
        if (i === sel.selectedIndex) return;
        sel.selectedIndex = i;
        const v = selLabel(sel);
        btn.querySelector('.sel-val').textContent = v; btn.setAttribute('aria-label', name ? `${name}: ${v}` : v);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, { label: name });
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btn.click(); }
    });
  }
  function enhanceAll(root) { (root || document).querySelectorAll('select:not([data-enhanced])').forEach(enhance); }
  new MutationObserver(() => enhanceAll()).observe(document.body, { childList: true, subtree: true });

  /* ---------------- confirm dialog ---------------- */
  const dlgRoot = document.createElement('div'); dlgRoot.id = 'dialog-root'; document.body.appendChild(dlgRoot);
  function confirmDialog(o) {
    o = Object.assign({ title: 'Are you sure?', body: '', ok: 'Continue', cancel: 'Cancel', danger: false }, o);
    close(false);
    const back = document.activeElement;
    return new Promise(resolve => {
      dlgRoot.innerHTML = `<div class="scrim dlg-scrim"><div class="modal dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-b">
        <h3 id="dlg-t">${esc(o.title)}</h3>${o.body ? `<p id="dlg-b" class="dlg-body">${esc(o.body)}</p>` : ''}
        <div class="modal-actions"><button type="button" class="btn" data-dlg="0">${esc(o.cancel)}</button>
        <button type="button" class="btn ${o.danger ? 'danger' : 'primary'}" data-dlg="1">${esc(o.ok)}</button></div></div></div>`;
      const scrim = dlgRoot.firstElementChild, btns = Array.from(dlgRoot.querySelectorAll('[data-dlg]'));
      const done = v => { dlgRoot.innerHTML = ''; if (back && back.isConnected) back.focus({ preventScroll: true }); resolve(v); };
      scrim.addEventListener('click', e => { if (e.target === scrim) done(false); const b = e.target.closest('[data-dlg]'); if (b) done(b.dataset.dlg === '1'); });
      scrim.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          const i = btns.indexOf(document.activeElement);
          btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
        }
      });
      (o.danger ? btns[0] : btns[1]).focus();
    });
  }

  M.ui = { enhance, enhanceAll, list: open, closeList: close, confirm: confirmDialog, isListOpen: () => !!cur };
})(window.M);
