(function (M) {
  'use strict';
  const out = [];
  let pending = 0;
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail || '' });
  const near = (a, b, e) => Math.abs(a - b) <= (e ?? 1e-9);
  const ev = (src, scope) => { const p = M.expr.parse(src); if (p.error) return 'ERR:' + p.error.msg; return M.expr.evaluate(p.ast, scope || {}); };

  ok('1+2*3 = 7', ev('1+2*3') === 7);
  ok('2^3^2 = 512', ev('2^3^2') === 512);
  ok('-2^2 = -4', ev('-2^2') === -4);
  ok('min(3,1,2) = 1', ev('min(3,1,2)') === 1);
  ok('if(1>2,5,6) = 6', ev('if(1>2,5,6)') === 6);
  ok('clamp(5,0,3) = 3', ev('clamp(5,0,3)') === 3);
  ok('sum / avg / ceil', ev('sum(1,2,3)') === 6 && ev('avg(2,4)') === 3 && ev('ceil(1.2)') === 2);
  ok('pick by name', ev('pick(k, "a", 1, "b", 2, 9)', { k: 'b' }) === 2 && ev('pick(k, "a", 1, 9)', { k: 'z' }) === 9);
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

  const Q = M.expr.Q;
  ok('Erlang C, 1 server = utilisation', near(Q.erlangc(0.5, 1, 1), 0.5, 1e-12));
  ok('M/M/1 wait = rho/(mu-lambda)', near(Q.wait(0.5, 1, 1), 1, 1e-12));
  ok('Erlang C textbook: a=2, c=3 → 0.4444', near(Q.erlangc(2, 1, 3), 4 / 9, 1e-9), Q.erlangc(2, 1, 3));
  ok('overloaded queue waits forever', Q.wait(3, 1, 2) === Infinity);
  ok('within(t=0) = 1 - P(wait)', near(Q.within(2, 1, 3, 0), 1 - 4 / 9, 1e-9));
  ok('avail(0.99, 2) = 0.9999', near(Q.avail(0.99, 2), 0.9999, 1e-12));
  ok('runway: 2× headroom at 100% growth = 1 period', near(Q.runway(2, 1), 1, 1e-12));

  const A = (type, t, extra) => M.shapes.apply(Object.assign({ type, k: 2, a: 10, c: 0.5, width: 0.2 }, extra || {}), t);
  ok('curve(.5, k=2) = .25', near(A('curve', 0.5), 0.25));
  ok('scurve(0) = 0 and (1) = 1', near(A('scurve', 0), 0) && near(A('scurve', 1), 1));
  ok('target(c) = 1', near(A('target', 0.3, { c: 0.3 }), 1));

  const base = () => ({ version: 1, name: 't', columns: [{ id: 'price', label: 'Price', type: 'number' }, { id: 'q', label: 'Q', type: 'number' }],
    rows: [{ id: 'A', label: 'A', v: { price: 100, q: 0.9 } }, { id: 'B', label: 'B', v: { price: 200, q: 0.6 } }, { id: 'C', label: 'C', v: { price: 300, q: 0.3 } }, { id: 'D', label: 'D', v: { price: 150, q: 0.3 } }],
    params: [], gates: [], calcs: [],
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
  ok('product: B=50, D=0', near(sc('B'), 50) && near(sc('D'), 0));

  const kc = base(); kc.params = [{ id: 'tax', label: 'Tax', value: 0.1, min: 0, max: 1, step: 0.1 }];
  kc.calcs = [{ id: 'gross', label: 'Gross', expr: 'price * (1 + tax)' }, { id: 'gross2', label: 'Twice', expr: 'gross * 2' }];
  kc.gates = [{ id: 'g1', label: 'cheap', expr: 'gross2 < 500', enabled: true, simple: null }];
  kc.criteria[0].source = { kind: 'calc', calc: 'gross' };
  r = M.engine.compute(kc);
  ok('calculations chain in order', near(r.byId.B.calc.gross2.v, 440, 1e-9), r.byId.B.calc.gross2.v);
  ok('rules can use calculations', r.out.includes('C'));
  ok('criteria can score on a calculation', near(r.byId.A.crit.pr.raw, 110, 1e-9));
  const bad = structuredClone(kc); bad.calcs[0].expr = 'price * nope';
  const br = M.engine.compute(bad);
  ok('a broken calculation is reported, not thrown', br.errors.some(e => e.where === 'calc' && e.id === 'gross'));
  r = M.engine.compute(kc, { P: { tax: 1 } });
  ok('knob override changes calculations', near(r.byId.A.calc.gross.v, 200));

  const lap = M.templates.get('laptop'), lr = M.engine.compute(lap);
  ok('trace final line equals score for every laptop', lr.rows.every(row => { const t = M.engine.trace(lap, lr, row.id); return t[t.length - 1].value === row.score.toFixed(1); }));
  const sw = M.sensitivity.sweep(lap, 'price');
  ok('weight sweep covers 0..100', sw.runs[0].from === 0 && sw.runs[sw.runs.length - 1].to === 100);
  const hr = M.engine.honesty(lap, lr, { price: sw });
  ok('honesty report returns items', Array.isArray(hr) && hr.length > 0);
  const flat = base(); flat.rows.forEach(x => { x.v.q = 0.5; });
  ok('honesty flags a criterion that is equal for all', M.engine.honesty(flat, M.engine.compute(flat), null).some(x => /same for every option/.test(x.text)));

  const care = M.templates.get('care'), cr = M.engine.compute(care);
  const sar = cr.rows.find(x => x.label === 'Sarema General');
  ok('care routing computes without errors', cr.errors.length === 0, JSON.stringify(cr.errors));
  ok('Care routing: Sarema General = 79.3 (±0.05)', sar && near(sar.score, 79.3, 0.05), sar ? sar.score.toFixed(3) : 'missing');

  const ph = M.templates.get('pharmacy'), pr = M.engine.compute(ph);
  ok('Pharmacy computes without errors', pr.errors.length === 0, JSON.stringify(pr.errors));
  const all = pr.byId.p1;
  ok('Pharmacy: everyone at windows juggles 2 tasks', all.calc.jug.v === 2);
  ok('Pharmacy: dedicated back office removes juggling', pr.byId.p5.calc.jug.v === 0 && near(pr.byId.p5.calc.m_win.v, 2.5));
  ok('Pharmacy: half-day Sam counts as a half', near(pr.byId.p1.calc.pres_sam.v, 0.5 * 4 / 6, 1e-12));
  ok('Pharmacy: manager effective speed is reduced by managing', pr.byId.p1.calc.e_maya.v < 1.25 * (1 - 0.8 * 0.15));
  const crowd = structuredClone(ph); crowd.params.find(x => x.id === 'windows').value = 2;
  const cc = M.engine.compute(crowd);
  ok('Pharmacy: 3+ people on 2 windows lose speed', cc.byId.p1.calc.pooled.v < cc.byId.p1.calc.w_sp.v);
  const sn = M.engine.scenarios(ph);
  ok('Pharmacy: scenarios compute', sn.length === 6 && sn.every(s => s.res.errors.length === 0));
  const ks = M.sensitivity.knob(ph, 'lam', 12);
  ok('Pharmacy: knob sweep runs from low to high', ks.pts.length === 13 && ks.pts[0].v === 4 && ks.pts[12].v === 60);
  ok('Pharmacy: at 60/h nobody keeps up', ks.pts[12].winner === null);

  const fd = M.templates.get('feed'), fr = M.engine.compute(fd);
  ok('News feed computes without errors', fr.errors.length === 0, JSON.stringify(fr.errors));
  ok('News feed: starter monolith fails the peak', fr.out.includes('a1'));
  const viral = M.engine.compute(fd, { P: { dau: 0.2 } });
  ok('News feed: at launch scale more architectures pass', viral.ranked.length > fr.ranked.length);
  const vn = M.templates.get('venue'), vr = M.engine.compute(vn);
  ok('Crowd control computes without errors', vr.errors.length === 0, JSON.stringify(vr.errors));
  ok('Crowd control: bare minimum fails a safety rule', vr.out.includes('v6'));

  const mv = base(); mv.rows[1].v.q = null;
  const pol = x => { const m = structuredClone(mv); m.criteria[1].missing = x; return M.engine.compute(m); };
  ok('missing = worst / neutral / best', pol('worst').byId.B.crit.qq.s === 0 && pol('neutral').byId.B.crit.qq.s === 0.5 && pol('best').byId.B.crit.qq.s === 1);
  ok('missing = exclude rules the option out', pol('exclude').out.includes('B'));

  const wfr = M.engine.weightFree(lap, lr, 500);
  ok('weight-free shares sum to 1', near(Object.values(wfr.shares).reduce((a, b) => a + b, 0), 1, 1e-9));
  const un = M.engine.uncertainty(lap, lr, 300);
  ok('uncertainty: chances of first sum to 1', near(Object.values(un.byRow).reduce((a, b) => a + b.pFirst, 0), 1, 1e-9));
  ok('uncertainty is repeatable (seeded)', JSON.stringify(un) === JSON.stringify(M.engine.uncertainty(lap, lr, 300)));

  const PL = M.plan;
  ok('plan: parseList by type', JSON.stringify(PL.parseList({ type: 'number' }, '1, 2, x, 2')) === '[1,2]' && PL.parseList({ type: 'boolean' }, 'yes, no').join() === 'true,false');
  const cols = { a: ['x', 'y'], b: [1, 2, 3] };
  const pm = base(); pm.columns = [{ id: 'a', label: 'A', type: 'category', choices: cols.a }, { id: 'b', label: 'B', type: 'number' }];
  pm.rows = [{ id: 'r1', label: 'one', v: { a: 'x', b: 1 } }];
  pm.criteria = [{ id: 'cb', label: 'B', enabled: true, weight: 1, source: { kind: 'column', column: 'b' }, direction: 'higher', range: { auto: false, lo: 0, hi: 3 }, shape: { type: 'linear' } }];
  const gen = PL.generate(pm, { vary: cols, base: 'r1', over: 'now', how: 'avg', keep: 12 });
  ok('plan: every combination tried, existing one skipped', gen.total === 6 && gen.tried === 5, gen.tried);
  ok('plan: best new combination is ranked first', gen.top[0].v.b === 3 && gen.top[0].score === 100);
  ok('plan: current best is reported', gen.mine && gen.mine.id === 'r1');
  ok('plan: a huge list switches to search instead of refusing', PL.generate(pm, { vary: { b: Array.from({ length: 5000 }, (_, i) => i) }, over: 'now' }).method === 'search');
  const gr = PL.grid(ph, [{ knob: 'lam', values: [10, 20, 30] }, { knob: 'pressure', values: [0.2, 0.8] }]);
  ok('plan: scenario grid is the cross product', gr.length === 6 && gr[5].values.lam === 30 && gr[5].values.pressure === 0.8);
  const sh = PL.shape('evening', 10, 5, 25, 1);
  ok('plan: evening shape peaks late and respects step', sh.indexOf(Math.max(...sh)) >= 7 && sh.every(v => Number.isInteger(v) && v >= 5 && v <= 25), sh.join(','));
  const dy = PL.day(ph);
  ok('plan: pharmacy day has 14 hours with a winner or a gap each', dy.hours.length === 14 && dy.segs.reduce((a, s) => a + s.n, 0) === 14);
  ok('plan: linked pressure follows arrivals', near(dy.hours[0].values.pressure, 0.1) && near(dy.hours[10].values.pressure, 0.85));
  const loose = structuredClone(ph); loose.day.sticky = 0;
  ok('plan: switch threshold reduces flicker', PL.day(loose).switches > dy.switches, PL.day(loose).switches + ' vs ' + dy.switches);
  ok('plan: calm hour winner differs from peak hour winner', dy.hours[0].best !== dy.hours[10].best, dy.hours[0].best + ' / ' + dy.hours[10].best);
  const pv = {}; ph.columns.forEach(c => { pv[c.id] = c.choices; });
  const pg = PL.generate(ph, { vary: pv, base: 'p1', over: 'day', how: 'worst', keep: 5 });
  ok('plan: pharmacy finder searches all 625 role splits over the day', !pg.error && pg.total === 625, pg.error || pg.tried);
  ok('plan: full search reports both new plans and your best', pg.top.length > 0 && pg.mine && pg.mine.mine, pg.top[0].score.toFixed(2) + ' new vs ' + pg.mine.score.toFixed(2) + ' ' + pg.mine.label);

  const big = base(); big.columns = []; big.criteria = []; big.rows = [];
  const targets = [3, 7, 1, 9, 4, 6, 2, 8];
  targets.forEach((t, i) => {
    big.columns.push({ id: 'x' + i, label: 'X' + i, type: 'number' });
    big.criteria.push({ id: 'c' + i, label: 'C' + i, enabled: true, weight: 1, source: { kind: 'expr', expr: `10 - abs(x${i} - ${t})` }, direction: 'higher', range: { auto: false, lo: 0, hi: 10 }, shape: { type: 'linear' } });
  });
  big.rows = [{ id: 'r1', label: 'start', v: Object.fromEntries(targets.map((t, i) => ['x' + i, 0])) }];
  const vary = Object.fromEntries(targets.map((t, i) => ['x' + i, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]));
  const t1 = performance.now(), sr = PL.generate(big, { vary, base: 'r1', over: 'now', how: 'avg', keep: 3 }), dt1 = performance.now() - t1;
  ok('search: 100 million combinations switch to step-by-step', sr.method === 'search' && sr.total === 1e8, sr.method + ' ' + sr.total);
  ok('search: finds the exact best of 100 million', sr.top[0] && Math.abs(sr.top[0].score - 100) < 1e-9, sr.top[0] && sr.top[0].label);
  ok('search: stays within the time budget', dt1 < PL.LIMITS.ms + 500, Math.round(dt1) + ' ms, ' + sr.tried + ' checked');
  const ps = PL.generate(ph, { vary: pv, base: 'p1', over: 'day', how: 'worst', keep: 3, method: 'search' });
  ok('search: forced search on the pharmacy matches the full search', ps.method === 'search' && Math.abs(ps.top[0].score - pg.top[0].score) < 0.5, ps.top[0].score.toFixed(2) + ' vs ' + pg.top[0].score.toFixed(2));

  const cm = structuredClone(ph);
  const rush = PL.day(cm);
  ok('carry: day plan carries the queue', rush.carry && rush.hours.some(h => h.start > 0));
  const nocarry = structuredClone(ph); nocarry.day.carry = null;
  const d0 = PL.day(nocarry);
  ok('carry: hours start empty without carry-over', d0.hours.every(h => h.start === 0));
  const peak = rush.hours.findIndex(h => h.after === Math.max(...rush.hours.map(x => x.after)));
  ok('carry: backlog after the busiest hour reaches the next hour', peak < rush.hours.length - 1 && Math.abs(rush.hours[peak + 1].start - rush.hours[peak].after) < 1e-9, rush.hours[peak].after.toFixed(2));
  const jc = PL.judge(cm, PL.dayRuns(cm)), jn = PL.judge(nocarry, PL.dayRuns(nocarry));
  ok('carry: backlog lowers the whole-day score of a slow plan', jc.tot.p1.avg <= jn.tot.p1.avg + 1e-9, jc.tot.p1.avg.toFixed(1) + ' vs ' + jn.tot.p1.avg.toFixed(1));
  const K1 = M.engine.compile(ph), rA = M.engine.compute(ph, { K: K1 }), rB = M.engine.compute(ph);
  ok('compile once: reused compile gives identical scores', rA.rows.every((r, i) => r.score === rB.rows[i].score));

  pending++;
  try {
    const w = new Worker('js/core/plan-worker.js'); let prog = 0;
    w.onmessage = e => {
      if (e.data.progress) { prog++; return; }
      const d = e.data.done;
      ok('worker: search runs off the main thread', d && !d.error && d.top.length > 0 && Math.abs(d.top[0].score - 100) < 1e-9, d && (d.error || d.top[0].label));
      w.terminate(); if (--pending === 0) done();
    };
    w.onerror = e => { e.preventDefault(); ok('worker: loads', false, e.message); if (--pending === 0) done(); };
    w.postMessage({ model: big, spec: { vary, base: 'r1', over: 'now', how: 'avg', keep: 1 } });
  } catch (e) { ok('worker: available', false, e.message); pending--; }

  const codegenCheck = (name, model) => {
    pending++;
    const res = M.engine.compute(model);
    const code = `window.__ms_${name} = (function () {\n` + M.codegen.js(model, res).replace('export function score', 'function score') + `\nreturn score;\n})();`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const s = document.createElement('script'); s.src = url;
    s.onload = () => {
      const f = window['__ms_' + name];
      const badRows = res.rows.filter(row => !near(f(model.rows.find(x => x.id === row.id).v).score, row.score, 1e-6));
      ok(`${name} codegen matches engine for every row`, !badRows.length, badRows.map(b => b.label).join(', '));
      if (--pending === 0) done();
    };
    s.onerror = () => { ok(`${name} codegen loads`, false, 'script failed to load'); if (--pending === 0) done(); };
    document.head.appendChild(s);
  };
  codegenCheck('laptop', lap);
  codegenCheck('pharmacy', ph);
  codegenCheck('feed', fd);

  function done() {
    const list = document.getElementById('list');
    list.innerHTML = out.map(t => `<li><span class="${t.pass ? 'p' : 'f'}">${t.pass ? 'PASS' : 'FAIL'}</span><span>${M.util.esc(t.name)} <span class="faint">${M.util.esc(String(t.detail))}</span></span></li>`).join('');
    const pass = out.filter(t => t.pass).length, fail = out.length - pass;
    document.getElementById('summary').textContent = `${pass} passed, ${fail} failed`;
    console.log(`Meridian tests: ${pass} passed, ${fail} failed`);
    out.filter(t => !t.pass).forEach(t => console.error('FAIL', t.name, t.detail));
  }
})(window.M);
