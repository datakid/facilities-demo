/* Drives the real app to verify themed dropdowns, dialogs and undo toasts. Results go to the console. */
(async function () {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const res = [];
  const ok = (n, p, d) => { res.push([n, !!p, d || '']); };
  await wait(300);
  try {
    ok('no native select is visible', [...document.querySelectorAll('select')].every(s => s.classList.contains('sel-native')));
    const opBtn = document.querySelector('.gate .sel-btn.g-op');
    ok('rule comparison is a themed button', !!opBtn, opBtn && opBtn.textContent.trim());
    opBtn.click(); await wait(50);
    const pop = document.getElementById('sel-pop');
    ok('dropdown opens', !pop.hidden, pop.querySelectorAll('.sel-opt').length + ' options');
    const ge = [...pop.querySelectorAll('.sel-opt')].find(o => o.textContent.trim() === '<');
    ge.click(); await wait(50);
    ok('picking an option updates the model', M.state.model.gates[0].expr === 'price < 1800', M.state.model.gates[0].expr);
    ok('dropdown closes after pick', pop.hidden);
    // keyboard
    const colBtn = document.querySelector('.gate .sel-btn.g-col');
    colBtn.focus(); colBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await wait(50);
    ok('ArrowDown opens the list', !pop.hidden);
    pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(50);
    ok('keyboard pick changes the column', M.state.model.gates[0].simple.column === 'battery_h', M.state.model.gates[0].simple.column);
    M.undo(); M.undo(); await wait(50);
    ok('undo restores the rule', M.state.model.gates[0].expr === 'price <= 1800', M.state.model.gates[0].expr);
    // templates menu + confirm dialog
    document.querySelector('[data-action="templates-menu"]').click(); await wait(50);
    ok('templates menu opens', !pop.hidden && pop.getAttribute('role') === 'menu');
    [...pop.querySelectorAll('.sel-opt')].find(o => o.textContent.includes('Care routing')).click(); await wait(80);
    const dlg = document.querySelector('#dialog-root .dialog');
    ok('themed confirm dialog appears', !!dlg, dlg && dlg.querySelector('h3').textContent);
    dlg.querySelector('[data-dlg="1"]').click(); await wait(120);
    ok('confirm loads the template', M.state.model.name === 'Care routing');
    const t = document.querySelector('.toast .toast-btn');
    ok('toast offers Undo', !!t);
    t.click(); await wait(80);
    ok('toast Undo restores the previous model', M.state.model.name === 'Pick a laptop', M.state.model.name);
    // cancel path
    document.querySelector('[data-action="templates-menu"]').click(); await wait(50);
    pop.querySelector('.sel-opt').click(); await wait(80);
    document.querySelector('#dialog-root [data-dlg="0"]').click(); await wait(80);
    ok('cancel keeps the model', M.state.model.name === 'Pick a laptop');
    // inspector select
    M.state.ui.inspector = { kind: 'criterion', id: 'price' }; M.render.all(); await wait(50);
    const miss = document.getElementById('ci-miss');
    ok('inspector select is themed', miss && miss.classList.contains('sel-btn'));
    miss.click(); await wait(50);
    [...pop.querySelectorAll('.sel-opt')].find(o => o.textContent.includes('middle')).click(); await wait(80);
    ok('inspector pick commits', M.state.model.criteria[0].missing === 'neutral');
    ok('focus stays on the dropdown after re-render', document.activeElement && document.activeElement.id === 'ci-miss');
  } catch (e) { ok('script ran without errors', false, e.message); }
  const fail = res.filter(r => !r[1]);
  res.forEach(r => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0] + (r[2] ? ' — ' + r[2] : '')));
  console.log(`UI checks: ${res.length - fail.length} passed, ${fail.length} failed`);

})();
