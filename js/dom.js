window.M = window.M || {};
(function (M) {
  'use strict';
  const SEL_SKIP = new Set(['id', 'class', 'tabindex', 'aria-hidden', 'data-enhanced', 'style']);
  const OPEN_SKIP = new Set(['open']);
  const isGen = n => n.nodeType === 1 && n.hasAttribute('data-gen');
  const keyOf = n => n.nodeType === 1 ? (n.getAttribute('data-key') || (n.id ? '#' + n.id : null)) : null;
  const realNext = n => { while (n && isGen(n)) n = n.nextSibling; return n; };

  function syncAttrs(a, b, skip) {
    const rm = [];
    for (let i = 0; i < a.attributes.length; i++) { const at = a.attributes[i]; if (!b.hasAttribute(at.name) && !(skip && skip.has(at.name))) rm.push(at.name); }
    rm.forEach(n => a.removeAttribute(n));
    for (let i = 0; i < b.attributes.length; i++) { const at = b.attributes[i]; if (skip && skip.has(at.name)) continue; if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); }
  }

  function morph(a, b) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    const sig = b.getAttribute('data-sig');
    if (sig !== null && a.getAttribute('data-sig') === sig) return;
    const tag = a.nodeName;
    if (tag === 'SELECT') {
      const si = Array.prototype.findIndex.call(b.options, o => o.hasAttribute('selected'));
      syncAttrs(a, b, a._btn ? SEL_SKIP : null);
      kids(a, b);
      const want = si >= 0 ? si : 0;
      if (a.selectedIndex !== want) a.selectedIndex = want;
      if (a._btn && M.ui && M.ui.sync) M.ui.sync(a);
      return;
    }
    syncAttrs(a, b, b.hasAttribute('data-keep-open') ? OPEN_SKIP : null);
    if (tag === 'INPUT') {
      const t = a.type;
      if (t === 'checkbox' || t === 'radio') { const c = b.hasAttribute('checked'); if (a.checked !== c) a.checked = c; }
      else if (!a.hasAttribute('data-free') && (document.activeElement !== a || t === 'range')) { const v = b.getAttribute('value') ?? ''; if (a.value !== v) a.value = v; }
      return;
    }
    if (tag === 'TEXTAREA') {
      const v = b.value;
      if (!a.hasAttribute('data-free') && document.activeElement !== a && a.value !== v) a.value = v;
      return;
    }
    kids(a, b);
  }

  function kids(a, b) {
    const olds = [];
    for (let n = a.firstChild; n; n = n.nextSibling) if (!isGen(n)) olds.push(n);
    const keyed = new Map();
    olds.forEach(n => { const k = keyOf(n); if (k) keyed.set(k, n); });
    const used = new Set();
    let i = 0, ref = realNext(a.firstChild), nb = b.firstChild;
    while (nb) {
      const next = nb.nextSibling, k = keyOf(nb);
      let m = null;
      if (k) { const c = keyed.get(k); if (c && !used.has(c) && c.nodeName === nb.nodeName) m = c; }
      else {
        while (i < olds.length && (used.has(olds[i]) || keyOf(olds[i]))) i++;
        if (i < olds.length && olds[i].nodeName === nb.nodeName) { m = olds[i]; i++; }
      }
      let node;
      if (m) { used.add(m); morph(m, nb); node = m; } else node = nb;
      if (node !== ref) { a.insertBefore(node, ref); if (node._btn) node.after(node._btn); }
      else ref = realNext(node.nextSibling);
      nb = next;
    }
    olds.forEach(n => { if (!used.has(n)) { if (n._btn) n._btn.remove(); n.remove(); } });
  }

  const tpl = document.createElement('template');
  function patch(el, html) {
    if (!el) return;
    tpl.innerHTML = html;
    kids(el, tpl.content);
    tpl.innerHTML = '';
  }
  function put(el, html) {
    if (!el || el._html === html) return false;
    el._html = html; patch(el, html); return true;
  }
  function blocks(el, list) {
    if (!el) return;
    const sk = list.map(b => b[0]).join('|');
    if (el._sk !== sk) {
      el._sk = sk;
      const have = {}; Array.from(el.children).forEach(c => { if (c.id) have[c.id] = c; });
      list.forEach(b => { let c = have[b[0]]; if (!c) { c = document.createElement('div'); c.id = b[0]; } el.appendChild(c); delete have[b[0]]; });
      Object.values(have).forEach(c => c.remove());
    }
    list.forEach(b => { const c = document.getElementById(b[0]); if (!c) return; if (c.className !== b[1]) c.className = b[1]; put(c, b[2]); });
  }
  function text(el, s) { if (el && el.textContent !== s) el.textContent = s; }

  M.dom = { patch, put, blocks, text };
})(window.M);
