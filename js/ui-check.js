(async function () {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const res = [];
  const ok = (n, p, d) => { res.push([n, !!p, d || '']); };
  const q = s => document.querySelector(s);
  await wait(400);
  try {
    ok('starts on the pharmacy template', M.state.model.name === 'Pharmacy staffing plan', M.state.model.name);
    ok('no native select is visible', [...document.querySelectorAll('select')].every(s => s.classList.contains('sel-native')));
    ok('inspector is hidden when closed', getComputedStyle(q('#inspector')).visibility === 'hidden');
    ok('key figures are shown', document.querySelectorAll('.fig').length >= 3);
    ok('ranking has rows', document.querySelectorAll('.rank-row').length > 0);

    const slider = q('input[data-in="param-value"][data-id="lam"]');
    const before = M.state.result.byId.p1.calc.lam_eff.v;
    slider.value = 40; slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true })); await wait(80);
    ok('moving a knob recomputes calculations', M.state.result.byId.p1.calc.lam_eff.v === 40 && before !== 40);
    M.undo(); await wait(60);
    ok('undo restores the knob', M.state.model.params.find(p => p.id === 'lam').value === 30);

    q('.calc-row').click(); await wait(60);
    ok('clicking a calculation opens it', M.state.ui.inspector && M.state.ui.inspector.kind === 'calc' && getComputedStyle(q('#inspector')).visibility === 'visible');
    q('[data-action="close-inspector"]').click(); await wait(300);

    q('[data-action="open-blocks"]').click(); await wait(60);
    ok('blocks library opens', document.querySelectorAll('.modal .tpl-card').length >= 20);
    q('[data-action="pick-block"][data-id="util"]').click(); await wait(60);
    const inputs = [...document.querySelectorAll('[data-in="block-in"]')].map(i => i.value);
    ok('block inputs are guessed from names', inputs[0] === 'lam', inputs.join(','));
    const lamIn = q('[data-in="block-in"][data-k="lam"]'); lamIn.value = 'lam_eff'; lamIn.dispatchEvent(new Event('input', { bubbles: true }));
    const muIn = q('[data-in="block-in"][data-k="mu"]'); muIn.value = 'mu'; muIn.dispatchEvent(new Event('input', { bubbles: true }));
    const cIn = q('[data-in="block-in"][data-k="c"]'); cIn.value = 'w_c'; cIn.dispatchEvent(new Event('input', { bubbles: true })); await wait(30);
    q('[data-action="add-block"]').click(); await wait(80);
    const added = M.state.model.calcs[M.state.model.calcs.length - 1];
    ok('block adds a working calculation', added.expr === 'lam_eff / (w_c * mu)' && Math.abs(M.state.result.byId.p1.calc[added.id].v - M.state.result.byId.p1.calc.util_win.v) < 1e-9, added.expr);
    M.undo(); await wait(60);

    q('[data-action="open-gallery"]').click(); await wait(60);
    ok('template gallery opens', document.querySelectorAll('.tpl-card').length >= 8);
    q('[data-action="load-template"][data-id="feed"]').click(); await wait(100);
    q('#dialog-root [data-dlg="1"]').click(); await wait(200);
    ok('loads the news feed template', M.state.model.name === 'News feed backend');
    const t = q('.toast .toast-btn'); ok('toast offers Undo', !!t); t.click(); await wait(150);
    ok('undo restores the pharmacy', M.state.model.name === 'Pharmacy staffing plan');

    M.app.actions['add-scenario'](); await wait(80);
    ok('saving a scenario stores every knob', Object.keys(M.state.model.scenarios[M.state.model.scenarios.length - 1].values).length === M.state.model.params.length);
    M.undo(); await wait(60);
    await wait(400);
    ok('stress strips render', document.querySelectorAll('#analysis-stress .strip').length === 3);
    ok('scenario cards render', document.querySelectorAll('.scen-card').length === 6);
    ok('day plan strip renders 14 hours', document.querySelectorAll('.day-strip .hour').length === 14);

    q('.scen-card').click(); await wait(60);
    ok('scenario opens in the inspector', M.state.ui.inspector && M.state.ui.inspector.kind === 'scenario' && document.querySelectorAll('.sv-row').length === 2);
    q('[data-action="close-inspector"]').click(); await wait(60);

    M.app.actions['open-scen-build'](); await wait(60);
    const ax = q('[data-pin="s-vals"]'); ax.value = '10, 20, 30'; ax.dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
    q('[data-action="scen-axis-add"]').click(); await wait(40);
    ok('scenario builder previews the grid', /\b\d+\b scenario/.test(q('.sb-preview').textContent));
    const n0 = M.state.model.scenarios.length, want = +q('.sb-preview b').textContent;
    q('[data-action="scen-build"]').click(); await wait(80);
    ok('scenario builder adds the grid', M.state.model.scenarios.length === n0 + want, n0 + ' + ' + want);
    M.undo(); await wait(60);

    M.app.actions['open-finder'](); await wait(60);
    ok('finder pre-selects the role columns', document.querySelectorAll('.fnd-col.on').length === 4);
    ok('finder estimate shows 625 combinations', q('#finder-est').textContent.includes('625'));
    const t0 = performance.now();
    q('[data-action="finder-run"]').click();
    for (let i = 0; i < 100 && (!M.state.ui.finder.result); i++) await wait(50);
    const dt = performance.now() - t0;
    ok('finder returns ranked plans', M.state.ui.finder.result && M.state.ui.finder.result.top.length === 5, M.state.ui.finder.result && M.state.ui.finder.result.top[0].label);
    ok('finder is fast enough (625 × 14 hours)', dt < 5000, Math.round(dt) + ' ms');
    const rows0 = M.state.model.rows.length;
    q('[data-action="finder-add-all"]').click(); await wait(100);
    ok('found plans are added as options', M.state.model.rows.length === rows0 + 5);
    M.undo(); await wait(60);
    q('[data-action="close-modal"]').click(); await wait(40);

    q('.hour').click(); await wait(80);
    ok('clicking an hour applies its knobs', M.state.model.params.find(p => p.id === 'lam').value === 10);
    M.undo(); await wait(60);
  } catch (e) { ok('script ran without errors', false, e.message + ' ' + e.stack); }
  const fail = res.filter(r => !r[1]);
  res.forEach(r => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0] + (r[2] ? ' — ' + r[2] : '')));
  console.log(`UI checks: ${res.length - fail.length} passed, ${fail.length} failed`);
})();
