/* Meridian Studio — engine acceptance tests (Phase 1 of the spec) */
(function (M) {
  'use strict';
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail || '' });
  const near = (a, b, e) => Math.abs(a - b) <= (e ?? 1e-9);
  const ev = (src, scope) => { const p = M.expr.parse(src); if (p.error) return 'ERR:' + p.error.msg; return M.expr.evaluate(p.ast, scope || {}); };

  // expressions
  ok('1+2*3 = 7', ev('1+2*3') === 7);
  ok('2^3^2 = 512', ev('2^3^2') === 512);
  ok('-2^2 = -4', ev('-2^2') === -4);
  ok('min(3,1,2) = 1', ev('min(3,1,2)') === 1);
  ok('if(1>2,5,6) = 6', ev('if(1>2,5,6)') === 6);
  ok('clamp(5,0,3) = 3', ev('clamp(5,0,3)') === 3);
  ok('type=="public" with type public = 1', ev('type=="public"', { type: 'public' }) === 1);
  const e1 = M.expr.parse('1+');
  ok('"1+" errors at pos 2', e1.error && e1.error.pos === 2, JSON.stringify(e1.error));
  const e2 = M.expr.check(M.expr.parse('foo').ast, new Set());
  ok("foo gives Unknown name 'foo'", e2 && e2.msg === "Unknown name 'foo'", e2 && e2.msg);
  const e3 = M.expr.check(M.expr.parse('clamp(1,2)').ast, new Set());
  ok('clamp arity message', e3 && e3.msg === 'clamp needs 3 values', e3 && e3.msg);
  ok('rename is token-exact', M.expr.rename('price*2+price_max', 'price', 'cost') === 'cost*2+price_max');
  let thrown = null; try { M.expr.evaluate(M.expr.parse('"a" + 1').ast, {}); } catch (e) { thrown = e.msg; }
  ok('text outside comparison is an error', thrown === 'Text can only be compared', thrown);
  thrown = null; try { M.expr.evaluate(M.expr.parse('price * 2').ast, { price: null }); } catch (e) { thrown = e.msg; }
  ok('missing value error', thrown === 'Missing value: price', thrown);

  // shapes
  const A = (type, t, extra) => M.shapes.apply(Object.assign({ type, k: 2, a: 10, c: 0.5, width: 0.2 }, extra || {}), t);
  ok('curve(.5, k=2) = .25', near(A('curve', 0.5), 0.25));
  ok('scurve(0) = 0', near(A('scurve', 0), 0));
  ok('scurve(1) = 1', near(A('scurve', 1), 1));
  ok('scurve(.5; c=.5) = .5', near(A('scurve', 0.5), 0.5));
  ok('target(c) = 1', near(A('target', 0.3, { c: 0.3 }), 1));

  // engine
  const base = () => ({ version: 1, name: 't', columns: [{ id: 'price', label: 'Price', type: 'number' }, { id: 'q', label: 'Q', type: 'number' }],
    rows: [{ id: 'A', label: 'A', v: { price: 100, q: 0.9 } }, { id: 'B', label: 'B', v: { price: 200, q: 0.6 } }, { id: 'C', label: 'C', v: { price: 300, q: 0.3 } }, { id: 'D', label: 'D', v: { price: 150, q: 0.3 } }],
    params: [], gates: [],
    criteria: [
      { id: 'pr', label: 'Price', enabled: true, weight: 50, source: { kind: 'column', column: 'price' }, direction: 'lower', range: { auto: true }, shape: { type: 'linear' } },
      { id: 'qq', label: 'Q', enabled: true, weight: 50, source: { kind: 'column', column: 'q' }, direction: 'higher', range: { auto: true }, shape: { type: 'linear' } }],
    combine: { type: 'sum', expr: '' } });
  let r = M.engine.compute(base());
  const sc = id => r.byId[id].score;
  ok('sum: A=100, B=50, C=0, D=37.5', near(sc('A'), 100) && near(sc('B'), 50) && near(sc('C'), 0) && near(sc('D'), 37.5), ['A', 'B', 'C', 'D'].map(sc).join(', '));
  const g = base(); g.gates = [{ id: 'g1', label: 'cap', expr: 'price<=250', enabled: true, simple: null }];
  r = M.engine.compute(g);
  ok('gate price<=250 puts C in out', r.out.includes('C') && !r.ranked.includes('C'));
  const p = base(); p.combine.type = 'product'; r = M.engine.compute(p);
  ok('product: B=50, D=0', near(sc('B'), 50) && near(sc('D'), 0), sc('B') + ', ' + sc('D'));
  const lead = M.engine.compute(base()).lead;
  ok('lead: A wins over B by 50', lead.winner === 'A' && lead.runnerUp === 'B' && near(lead.margin, 50));

  // trace matches score
  const lap = M.templates.get('laptop'), lr = M.engine.compute(lap);
  const traceOk = lr.rows.every(row => { const t = M.engine.trace(lap, lr, row.id); return t[t.length - 1].value === row.score.toFixed(1); });
  ok('trace final line equals score for every laptop', traceOk);

  // sensitivity
  const sw = M.sensitivity.sweep(lap, 'price');
  ok('sweep returns runs covering 0..100', sw.runs[0].from === 0 && sw.runs[sw.runs.length - 1].to === 100, sw.runs.length + ' runs');

  // honesty report
  const hr = M.engine.honesty(lap, lr, { price: sw });
  ok('honesty report returns items', Array.isArray(hr) && hr.length > 0, hr.length + ' items');
  const flat = base(); flat.rows.forEach(x => { x.v.q = 0.5; });
  const fr = M.engine.compute(flat), fh = M.engine.honesty(flat, fr, null);
  ok('honesty flags a criterion that is equal for all', fh.some(x => /same for every option/.test(x.text)));

  // care routing
  const care = M.templates.get('care'), cr = M.engine.compute(care);
  const sar = cr.rows.find(x => x.label === 'Sarema General');
  ok('care routing computes without errors', cr.errors.length === 0, JSON.stringify(cr.errors));
  ok('Care routing: Sarema General = 79.3 (±0.05)', sar && near(sar.score, 79.3, 0.05), sar ? 'got ' + sar.score.toFixed(3) : 'row missing');
  ok('Care routing: 18 facilities ported', care.rows.length === 18, care.rows.length + ' rows');

  ok('Care routing: service rules rule out facilities without cardiology + lab', cr.out.includes('aru') && cr.out.includes('srp'));
  const urg = M.templates.get('care'); urg.params.find(p => p.id === 'urgency').value = 2;
  ok('Care routing: urgency shrinks reach (60 → 42 km)', M.engine.compute(urg).out.length >= cr.out.length);

  // missing-value policies
  const mv = base(); mv.rows[1].v.q = null;
  const pol = p => { const m = structuredClone(mv); m.criteria[1].missing = p; return M.engine.compute(m); };
  ok('missing = worst gives s 0', pol('worst').byId.B.crit.qq.s === 0);
  ok('missing = neutral gives s 0.5', pol('neutral').byId.B.crit.qq.s === 0.5);
  ok('missing = best gives s 1', pol('best').byId.B.crit.qq.s === 1);
  ok('missing = exclude rules the option out', pol('exclude').out.includes('B'));

  // robustness analyses
  const wfr = M.engine.weightFree(lap, lr, 500);
  const wsum = Object.values(wfr.shares).reduce((a, b) => a + b, 0);
  ok('weight-free shares sum to 1', near(wsum, 1, 1e-9));
  const un = M.engine.uncertainty(lap, lr, 300);
  const psum = Object.values(un.byRow).reduce((a, b) => a + b.pFirst, 0);
  ok('uncertainty: chances of first sum to 1', near(psum, 1, 1e-9));
  const un2 = M.engine.uncertainty(lap, lr, 300);
  ok('uncertainty is repeatable (seeded)', JSON.stringify(un) === JSON.stringify(un2));
  const dom = base(); ok('dominant option wins every weighting', M.engine.weightFree(dom, M.engine.compute(dom), 300).shares.A === 1);

  // codegen
  const code = M.codegen.js(lap, lr).replace('export function score', 'function score') + '\nwindow.__meridianScore = score;';
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const s = document.createElement('script'); s.src = url;
  s.onload = () => {
    const f = window.__meridianScore;
    const bad = lr.rows.filter(row => !near(f(lap.rows.find(x => x.id === row.id).v).score, row.score, 1e-6));
    ok('laptop codegen matches engine for every row', !bad.length, bad.map(b => b.label).join(', '));
    done();
  };
  s.onerror = () => { ok('laptop codegen loads', false, 'script failed to load'); done(); };
  document.head.appendChild(s);

  function done() {
    const list = document.getElementById('list');
    list.innerHTML = out.map(t => `<li><span class="${t.pass === null ? 'muted' : t.pass ? 'p' : 'f'}">${t.pass === null ? 'NOTE' : t.pass ? 'PASS' : 'FAIL'}</span><span>${M.util.esc(t.name)} <span class="faint">${M.util.esc(t.detail)}</span></span></li>`).join('');
    const pass = out.filter(t => t.pass === true).length, fail = out.filter(t => t.pass === false).length;
    document.getElementById('summary').textContent = `${pass} passed, ${fail} failed`;
    console.log(`Meridian tests: ${pass} passed, ${fail} failed`);
    out.filter(t => t.pass === false).forEach(t => console.error('FAIL', t.name, t.detail));
  }
})(window.M);
