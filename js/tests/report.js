(function () {
  const res = (window.M && M.testResults) || [];
  const fail = res.filter(r => !r.pass);
  document.getElementById('summary').textContent = `${res.length - fail.length} of ${res.length} passed`;
  document.getElementById('list').innerHTML = [...fail, ...res.filter(r => r.pass)].map(r => `<li><span class="${r.pass ? 'p' : 'f'}">${r.pass ? 'pass' : 'FAIL'}</span><span>${M.util.esc(r.name)}${r.detail && !r.pass ? ' · ' + M.util.esc(r.detail) : ''}</span></li>`).join('');
  console.log(`TESTS ${res.length - fail.length}/${res.length}`);
  fail.forEach(f => console.log('FAIL ' + f.name + ' :: ' + f.detail));
})();
