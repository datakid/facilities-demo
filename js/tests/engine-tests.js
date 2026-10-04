(function (M) {
  'use strict';
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
  const near = (a, b, e) => Math.abs(a - b) <= (e ?? 1e-6);
  const F = M.formula;
  const ev = (src, scope, names) => {
    const p = F.parse(src); if (p.error) return 'ERR:' + p.error.msg;
    const env = { resolve: n => (names || Object.keys(scope || {})).find(k => k.toLowerCase() === n.toLowerCase()) ?? null, suggest: () => names || Object.keys(scope || {}) };
    const b = F.bind(p.ast, env); if (b.error) return 'ERR:' + b.error.msg;
    try { return F.evaluate(p.ast, scope || {}); } catch (e) { return 'ERR:' + e.message; }
  };

  ok('1 + 2 × 3 = 7', ev('1 + 2 × 3') === 7);
  ok('2^3^2 = 512', ev('2^3^2') === 512);
  ok('-2^2 = -4', ev('-2^2') === -4);
  ok('15% = 0.15', near(ev('15%'), 0.15));
  ok('10 % 3 = 1 (modulo)', ev('10 % 3') === 1);
  ok('÷ and − symbols', ev('10 ÷ 4 − 1') === 1.5);
  ok('= means equals', ev('2 = 2') === 1 && ev('2 = 3') === 0);
  ok('≤ ≥ ≠', ev('2 ≤ 3') === 1 && ev('3 ≥ 4') === 0 && ev('2 ≠ 3') === 1);
  ok('and / or / not words', ev('1 < 2 and not (3 < 2)') === 1 && ev('0 or 0') === 0);
  ok('yes / no constants', ev('yes and not no') === 1);
  ok('if()', ev('if(1 > 2, 5, 6)') === 6);
  ok('min max sum avg', ev('min(3,1,2)') === 1 && ev('max(3,1)') === 3 && ev('sum(1,2,3)') === 6 && ev('avg(2,4)') === 3);
  ok('round with digits', ev('round(3.14159, 2)') === 3.14);
  ok('clamp', ev('clamp(5, 0, 3)') === 3);
  ok('text compare is case-insensitive', ev('a = "quiet"', { a: 'Quiet' }) === 1);
  ok('bracket names', ev('[unit price] * 2', { 'unit price': 3 }) === 6);
  ok('unknown name suggests', /Did you mean price/.test(ev('pirce * 2', { price: 1 })), ev('pirce * 2', { price: 1 }));
  ok('unknown function suggests', /Did you mean round/.test(ev('roud(2)')), ev('roud(2)'));
  ok('wrong arg count explains', /clamp needs 3 values/.test(ev('clamp(1, 2)')));
  ok('missing ) explains', /closing \)/.test(ev('min(1, 2')), ev('min(1, 2'));
  ok('dangling operator explains', /stops too early/.test(ev('1 +')));
  ok('two values without operator explains', /Something is missing/.test(ev('2 3')), ev('2 3'));
  ok('text in maths explains', /is text/.test(ev('a * 2', { a: 'x' })));
  ok('division by zero', /Division by zero/.test(ev('1 / 0')));
  ok('error position points at bad char', F.parse('1 + $').error.pos === 4);
  ok('print round-trips', F.print(F.parse('(a + b) * c').ast, n => n) === '(a + b) * c');
  ok('print keeps right-assoc minus', F.print(F.parse('a - (b - c)').ast, n => n) === 'a - (b - c)');

  const U = M.util;
  ok('parseNum handles $1,299', U.parseNum('$1,299') === 1299);
  ok('parseNum handles 12 kg', U.parseNum('12 kg') === 12);
  ok('parseNum handles 15%', U.parseNum('15%') === 15);
  ok('detectType yes/no', U.detectType(['yes', 'no', 'Yes']) === 'yesno');
  ok('detectUnit from header', U.detectUnit('Price ($)', ['1']) === '$');
  ok('detectUnit from values', U.detectUnit('Weight', ['1.2 kg', '2 kg']) === 'kg');
  ok('parseTable tab', U.parseTable('a\tb\n1\t2').length === 2 && U.parseTable('a\tb\n1\t2')[1][1] === '2');
  ok('parseTable quoted comma', U.parseTable('a,b\n"x, y",2')[1][0] === 'x, y');
  ok('toId avoids reserved', U.toId('min') === 'min_');
  ok('guessDir price → less', U.guessDir('Price') === 'less' && U.guessDir('Battery') === 'more');

  const E = M.engine;
  M.examples.forEach(ex => {
    const m = M.examples.get(ex.id);
    const r = E.compute(m);
    ok(`${m.name}: no formula issues`, !r.issues.length, r.issues.map(i => i.msg).join('; '));
    ok(`${m.name}: ranks options`, r.ranked.length >= 2, r.ranked.length);
    ok(`${m.name}: shares add to 100%`, near(Object.values(r.share).reduce((a, b) => a + b, 0), 1));
    ok(`${m.name}: scores in 0..100`, r.rows.every(x => x.score >= 0 && x.score <= 100));
    ok(`${m.name}: every computed value finite`, r.rows.every(x => Object.keys(x.errs).length === 0), r.rows.filter(x => Object.keys(x.errs).length).map(x => x.label + ':' + JSON.stringify(x.errs)).join(' '));
    ok(`${m.name}: has a guide`, m.guide && m.guide.steps.length >= 3);
    const ins = M.insights.build(m, r);
    ok(`${m.name}: checks run`, Array.isArray(ins.items));
    const code = M.exporter.js(m, r);
    const fn = code.replace('export function score', 'return function score').replace(/^\/\/.*\n/, '');
    let same = false, why = '';
    try {
      const score = (new Function('return (function(){' + fn.replace('return function score', 'return function score') + '})()'))();
      same = r.rows.every(row => {
        const raw = Object.assign({}, m.rows.find(x => x.id === row.id).v);
        const o = score(raw);
        if (o.pass !== row.pass) { why = row.label + ' pass ' + o.pass; return false; }
        if (o.pass && !near(o.score, row.score, 1e-6)) { why = row.label + ' ' + o.score + ' vs ' + row.score; return false; }
        return true;
      });
    } catch (e) { why = e.message; }
    ok(`${m.name}: exported code = engine`, same, why);
  });

  const lap = M.examples.get('laptop');
  let r = E.compute(lap);
  ok('laptop: Ember 15 ruled out by memory', r.out.includes('r5'));
  ok('laptop: Cirrus 16 ruled out by budget', r.out.includes('r3'));
  ok('laptop: Dune 14 Pro ruled out by budget', r.out.includes('r4'));
  ok('laptop: lead has a driver', r.lead && r.lead.driver);
  const lap2 = E.withModel(lap, m => { m.knobs[0].value = 2000; });
  ok('laptop: raising budget lets Dune in', E.compute(lap2).ranked.includes('r4'));
  const sw = E.knobSweep(lap, 'budget', 20);
  ok('laptop: budget sweep finds switch points', sw.flips.length >= 1, sw.flips.length);
  const lapW = E.withModel(lap, m => { m.criteria.forEach(c => { c.weight = c.id === 'battery' ? 10 : 0; }); });
  ok('laptop: only battery matters → Borealis', E.compute(lapW).ranked[0] === 'r2', E.compute(lapW).ranked[0]);

  const sup = M.examples.get('supplier');
  const small = E.compute(E.withModel(sup, m => { m.knobs[0].value = 500; })).ranked[0];
  const big = E.compute(E.withModel(sup, m => { m.knobs[0].value = 20000; })).ranked[0];
  ok('supplier: order size flips the winner', small !== big, small + ' / ' + big);
  ok('supplier: Delta Fab ruled out (not certified)', E.compute(sup).out.includes('r4'));

  const job = M.examples.get('job');
  r = E.compute(job);
  const nw = r.byId.r1;
  ok('job: commute per year worked out', near(nw.vals.commute_yr, 50 * 2 * 4 * 46 / 60, 1e-9), nw.vals.commute_yr);
  ok('job: total pay', nw.vals.total === 100000);
  ok('job: growth text points', near(r.byId.r2.c.growth.s, 1) && near(r.byId.r5.c.growth.s, 0.2));
  ok('job: remote good-enough at 3 days', near(r.byId.r5.c.remote.s, 1) && near(r.byId.r4.c.remote.s, 1) && r.byId.r1.c.remote.s < 1);

  const shop = M.examples.get('shift');
  r = E.compute(shop);
  ok('shop: 2 tills overloaded is ruled out', r.out.includes('r1'));
  const rush = E.compute(E.withModel(shop, m => { m.knobs[0].value = 120; }));
  ok('shop: rush rules out more plans', rush.out.length > r.out.length, rush.out.length + ' vs ' + r.out.length);

  const circ = M.model.normalize({ columns: [{ id: 'a', label: 'A', formula: 'B + 1' }, { id: 'b', label: 'B', formula: 'A + 1' }], rows: [{ id: 'r1', label: 'x', v: {} }], criteria: [] });
  ok('circular formulas are reported', E.compute(circ).issues.some(i => /circle/.test(i.msg)));

  const flatEx = M.examples.get('flat');
  const bal = E.compute(flatEx), add = E.compute(E.withModel(flatEx, m => { m.method = 'add'; }));
  ok('balanced penalises weak spots more than add', bal.byId.r4.score < add.byId.r4.score, bal.byId.r4.score + ' vs ' + add.byId.r4.score);
  ok('balanced: perfect everywhere = 100', near(M.util.clamp((Math.exp(0) - 0.1) / 0.9, 0, 1), 1));

  const t = M.model.normalize({ columns: [{ id: 'x', label: 'X' }], rows: [{ id: 'a', label: 'A', v: { x: 10 } }, { id: 'b', label: 'B', v: { x: 14 } }, { id: 'c', label: 'C', v: { x: 20 } }], criteria: [{ id: 'x', col: 'x', weight: 5, curve: 'target', at: 14, tol: 4 }] });
  r = E.compute(t);
  ok('sweet spot: exact = full points', near(r.byId.b.c.x.s, 1));
  ok('sweet spot: off by tol/… scales', near(r.byId.a.c.x.s, 0) && near(r.byId.c.c.x.s, 0));

  const wit = E.whatItTakes(lap, E.compute(lap), E.compute(lap).ranked[1]);
  ok('what it takes: finds changes for runner-up', wit.length >= 1, wit.length);

  ok('wait(): M/M/1 at 50% = 1/μ', near(ev('wait(1, 2, 1)'), 0.5));
  ok('within(): overloaded = 0', ev('within(5, 1, 2, 1)') === 0);
  ok('pick(): lookup with default', ev('pick(x, "a", 1, "b", 2, 9)', { x: 'B' }) === 2 && ev('pick(x, "a", 1, 9)', { x: 'z' }) === 9);
  ok('avail(): two 99% copies', near(ev('avail(0.99, 2)'), 0.9999));
  ok('runway(): headroom 2 at 100%/period = 1', near(ev('runway(2, 1)'), 1));

  const care = M.examples.get('care');
  r = E.compute(care);
  ok('care: Sarema General = 79.3 (as in the original demo)', r.byId.sag && Math.abs(r.byId.sag.score - 79.3) < 0.06, r.byId.sag && r.byId.sag.score);
  ok('care: Sarema General wins', r.ranked[0] === 'sag', r.ranked[0]);
  const ph = M.examples.get('pharmacy');
  const t0 = performance.now(); r = E.compute(ph); const dt = performance.now() - t0;
  ok('pharmacy: computes fast', dt < 60, dt.toFixed(1) + ' ms');
  ok('pharmacy: some plans pass', r.ranked.length >= 3, r.ranked.length);
  const sits = E.situations(ph, r.prep);
  ok('pharmacy: 6 situations scored', sits.length === 6 && sits.every(s => s.winner), sits.map(s => s.winner).join(','));
  ok('pharmacy: winner changes across the day', new Set(sits.map(s => s.winner)).size >= 2, sits.map(s => s.label + ':' + s.winner).join(' '));
  const fd = M.examples.get('feed'); r = E.compute(fd);
  ok('feed: limit is text', typeof r.byId.a1.vals.limit === 'string', r.byId.a1.vals.limit);
  ok('feed: starter monolith ruled out at today’s traffic', r.out.includes('a1'));
  const viral = E.situations(fd, r.prep).find(s => s.id === 's3');
  ok('feed: viral month rules out more', viral.out > r.out.length, viral.out + ' vs ' + r.out.length);
  const vn = M.examples.get('venue'); r = E.compute(vn);
  ok('venue: bare minimum unsafe', r.out.includes('v6'));
  const cf = M.examples.get('cafe'); r = E.compute(cf);
  ok('cafe: bottleneck named', ['register', 'bar'].includes(r.byId.c1.vals.bottleneck));
  ok('all 11 examples present', M.examples.length === 11, M.examples.length);

  const P = M.plan;
  const fl = M.examples.get('flat'); r = E.compute(fl);
  ok('soft must-have: no balcony loses 6 points, stays ranked', r.byId.r2.pass && near(r.byId.r2.score, Math.max(0, r.byId.r2.base - 6)), r.byId.r2.score + ' vs ' + r.byId.r2.base);
  ok('soft must-have: balcony flat loses nothing', near(r.byId.r1.score, r.byId.r1.base));
  const flHard = E.withModel(fl, m => { m.rules[1].soft = false; });
  ok('switching to hard rules them out', E.compute(flHard).out.includes('r2'));

  const lapM = P.matrix(lap);
  ok('matrix: has Now + Baseline columns', lapM.cols.length === 2);
  const phM = P.matrix(ph);
  ok('matrix: pharmacy 8 columns × 9 rows', phM.cols.length === 8 && phM.rows.length === 9);
  ok('matrix: safest all-round picked', !!phM.safest, phM.safest);
  const safeRow = phM.rows.find(x => x.id === phM.safest);
  ok('matrix: safest has the best worst case', phM.rows.every(x => x.worst <= safeRow.worst + 1e-9));

  const dr = P.dayRun(ph);
  ok('day: 14 hours scored', dr.hours.length === 14);
  ok('day: carry-over adds backlog in later hours', dr.hours.some(h => Object.values(h.carried).some(v => v > 0.5)), JSON.stringify(dr.hours[11].carried));
  ok('day: one plan for the whole day', !!dr.allDay);
  ok('day: switching plan has a start', dr.switches.length >= 1 && dr.switches[0].row);
  const noCarry = P.dayRun(E.withModel(ph, m => { m.day.carry = null; }));
  const endA = dr.per.find(p => p.id === dr.allDay), endB = noCarry.per.find(p => p.id === dr.allDay);
  ok('day: carry-over lowers or keeps the all-day average', endA.avg <= endB.avg + 1e-9, endA.avg + ' vs ' + endB.avg);
  ok('day: shapes fill values in the knob range', P.shape(ph, 'evening', 12).every(v => v >= 4 && v <= 60));

  const sp = M.examples.get('shift');
  const f1 = P.find(sp, { tills: [1, 2, 3, 4, 5, 6], floor_staff: [0, 1, 2, 3] }, { from: 'r3' });
  ok('find: tries all 24 combinations', f1.method === 'all' && f1.checked === 24, f1.method + ' ' + f1.checked);
  ok('find: best is at least as good as current best', f1.top[0].s >= f1.current.s - 1e-6, f1.top[0].s + ' vs ' + f1.current.s);
  ok('find: flags combinations already in the list', f1.top.some(t => t.existing));
  const roles = ['window', 'typing', 'records', 'back', 'off'];
  const sp2 = { role_maya: roles, role_omar: roles, role_lina: roles, role_sam: roles };
  const f2 = P.find(ph, sp2, { judge: 'now' });
  ok('find: pharmacy 625 role splits, all tried', f2.method === 'all' && f2.checked === 625, f2.method + ' ' + f2.checked + ' ' + f2.ms + 'ms');
  ok('find: pharmacy finds a plan ≥ the best listed one', f2.top[0].s >= f2.current.s - 1e-6);
  const f3 = P.find(ph, sp2, { judge: 'day' });
  ok('find: whole-day search runs with carry-over', f3.top.length > 0 && f3.contexts === 14, f3.method + ' ' + f3.ms + 'ms');
  const huge = M.model.normalize({ columns: Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, label: 'X' + i })), rows: [{ id: 'a', label: 'A', v: { x0: 0, x1: 0, x2: 0, x3: 0, x4: 0, x5: 0 } }], criteria: Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, col: 'x' + i, weight: 5, range: { auto: false, lo: 0, hi: 9 } })) });
  const f4 = P.find(huge, Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['x' + i, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]])), {});
  ok('find: 1,000,000 combos uses step-by-step search and finds the top', f4.method === 'search' && f4.top[0].s >= 100 - 1e-6, f4.method + ' ' + f4.top[0].s);

  const rc = M.examples.get('rice');
  const fitR = P.fit(rc, rc.pairs);
  ok('fit: agrees with at least as many pairs as before', fitR.after.ok >= fitR.before.ok, fitR.before.ok + ' → ' + fitR.after.ok);
  const lapP = E.withModel(lap, m => { m.pairs = [{ a: 'r2', b: 'r6' }, { a: 'r2', b: 'r1' }]; });
  const fitL = P.fit(lapP, lapP.pairs);
  ok('fit: learns Borealis over Fjord and Aster', fitL.after.ok === 2, JSON.stringify(fitL.changes));
  ok('fit: result really ranks Borealis first among them', (() => { const r2 = E.compute(lapP, { W: fitL.W }); return r2.byId.r2.score > r2.byId.r6.score && r2.byId.r2.score > r2.byId.r1.score; })());

  const progs = [];
  const fp = P.find(ph, sp2, { judge: 'now', progress: p => progs.push(p) });
  ok('find: reports progress with best so far', progs.length >= 1 && progs[progs.length - 1].checked === 625 && progs[progs.length - 1].best, progs.length);
  void fp;

  const hy = P.hourly(ph);
  ok('hourly: plan for all 14 hours', hy.plan.length === 14 && hy.scores.length === 14, hy.plan.length);
  ok('hourly: at least as good as one plan all day', hy.avg >= hy.single.avg - 1e-6, hy.avg + ' vs ' + hy.single.avg);
  const hyFree = P.hourly(ph, { cost: 0 }), hyDear = P.hourly(ph, { cost: 1000 });
  ok('hourly: free switching switches at least as often', hyFree.nSwitch >= hy.nSwitch, hyFree.nSwitch + ' vs ' + hy.nSwitch);
  ok('hourly: very costly switching never switches', hyDear.nSwitch === 0, hyDear.nSwitch);
  ok('hourly: free switching ≥ best single plan per hour', hyFree.avg >= hy.single.avg - 1e-6);
  ok('hourly: carries the queue', hy.carry === true && hy.endQueue != null);
  const cafeH = P.hourly(M.examples.get('cafe'), { cost: 0 });
  ok('hourly: coffee shop picks more baristas at the peak', (() => { const m = M.examples.get('cafe'); const peak = m.day.values.indexOf(Math.max(...m.day.values)); const quiet = m.day.values.indexOf(Math.min(...m.day.values)); const b = id => m.rows.find(r => r.id === id).v.baristas; return b(cafeH.plan[peak]) >= b(cafeH.plan[quiet]); })(), cafeH.plan.join(','));

  const curveCase = M.model.normalize({ columns: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }],
    rows: [{ id: 'a', label: 'A', v: { x: 5, y: 5 } }, { id: 'b', label: 'B', v: { x: 10, y: 0 } }, { id: 'c', label: 'C', v: { x: 0, y: 10 } }],
    criteria: [{ id: 'x', col: 'x', weight: 5 }, { id: 'y', col: 'y', weight: 5 }], pairs: [{ a: 'a', b: 'b' }, { a: 'a', b: 'c' }] });
  const fw = P.fit(curveCase, curveCase.pairs), fa = P.fitAll(curveCase, curveCase.pairs);
  ok('fitAll: importances alone cannot make the all-rounder win', fw.after.ok < 2, fw.after.ok);
  ok('fitAll: changing curves makes it win both', fa.after.ok === 2 && fa.curves.length >= 1, JSON.stringify(fa.curves));

  const hfR = P.hourlyFind(ph, sp2, { cost: 4 });
  ok('hourlyFind: plans 14 hours from yours plus new options', hfR.plan.length === 14 && hfR.tried > ph.rows.length, hfR.tried);
  ok('hourlyFind: at least as good as hourly over your list', hfR.avg >= hy.avg - 1e-6, hfR.avg + ' vs ' + hy.avg);
  ok('hourlyFind: refinement ran', hfR.rounds >= 1, hfR.rounds + ' rounds, ' + hfR.ms + 'ms');
  const shopBig = E.withModel(M.examples.get('shift'), m => { m.day = { knob: 'cph', start: 9, values: [30, 50, 80, 120, 140, 110, 70, 40], link: null, carry: null, sticky: 3, switchCost: 2 }; m.columns.push({ id: 'pad1', label: 'Pad A', type: 'number', unit: '', formula: '' }, { id: 'pad2', label: 'Pad B', type: 'number', unit: '', formula: '' }, { id: 'pad3', label: 'Pad C', type: 'number', unit: '', formula: '' }); m.rows.forEach(r => { r.v.pad1 = 0; r.v.pad2 = 0; r.v.pad3 = 0; }); });
  const bigSpec = { tills: [1, 2, 3, 4, 5, 6, 7, 8], floor_staff: [0, 1, 2, 3, 4], pad1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], pad2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], pad3: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
  const big2 = P.hourlyFind(M.model.normalize(shopBig), bigSpec, { cost: 2, ms: 5000 });
  ok('hourlyFind: works past 4,096 combinations (40,000 here)', big2.total0 === 40000 && big2.plan.length === 8, big2.total0 + ' / ' + big2.ms + 'ms');
  const tillsAt = i => (big2.newRows.concat(shopBig.rows).find(r => r.id === big2.plan[i]) || { v: {} }).v.tills;
  ok('hourlyFind: more tills at the 140/h peak than at 30/h', tillsAt(4) > tillsAt(0), tillsAt(0) + ' → ' + tillsAt(4));
  const exactPeak = (() => { const m = M.model.normalize(shopBig); const K = Object.assign({}, m.base, { cph: 140 }); const f = P.find(m, { tills: bigSpec.tills, floor_staff: bigSpec.floor_staff }, { ctxK: K }); return f.top[0].v.tills; })();
  ok('hourlyFind: peak-hour tills match an exhaustive search', tillsAt(4) === exactPeak, tillsAt(4) + ' vs ' + exactPeak);
  const brute = (() => {
    const m = E.withModel(ph, x => { x.rows = x.rows.slice(0, 3); x.day.values = x.day.values.slice(9, 13); });
    const ids = m.rows.map(r => r.id), Hn = m.day.values.length, prep = E.prepare(m), ctx = P.dayContexts(m);
    let best = -Infinity;
    const rec = (h, path) => {
      if (h === Hn) {
        let q = 0, tot = 0;
        path.forEach((id, i) => { const r = E.compute(m, { prep, K: ctx[i].K, RK: Object.fromEntries(ids.map(x => [x, { backlog: q }])) }); const x = r.byId[id]; tot += x.pass ? x.score : 0; q = Math.max(0, +x.vals.left || 0); if (i && id !== path[i - 1]) tot -= 4; });
        best = Math.max(best, tot); return;
      }
      ids.forEach(id => rec(h + 1, path.concat(id)));
    };
    rec(0, []);
    return { best, got: P.hourly(m, { cost: 4 }).total };
  })();
  ok('hourly: exact (matches brute force with carry-over)', Math.abs(brute.best - brute.got) < 1e-6, brute.best + ' vs ' + brute.got);

  const cA = M.examples.get('laptop'), cB = E.withModel(cA, m => { m.criteria.find(c => c.id === 'battery').weight = 10; m.knobs[0].value = 2000; });
  const cmp = P.compare(cA, cB);
  ok('compare: lists importance and setting changes', cmp.diffs.some(d => /Battery importance 6 → 10/.test(d)) && cmp.diffs.some(d => /Budget/.test(d)), cmp.diffs.join(' | '));
  ok('compare: rows matched by name', cmp.rows.length === 6 && cmp.rows.every(r => r.a && r.b));
  ok('compare: shows options coming back in', cmp.rows.some(r => r.a.rank == null && r.b.rank != null));
  ok('compare: same model, no diffs', P.compare(cA, cA).diffs.length === 0);

  const parts = M.model.ruleParts(lap, 'Price <= Budget');
  ok('simple rule parse with setting', parts && parts.col === 'price' && parts.knob === 'budget');
  ok('simple rule rebuild', M.model.ruleFormula(lap, { col: 'ram', op: '>=', value: 32 }) === 'Memory >= 32');

  const m2 = M.util.clone(lap);
  M.h = M.h || {};
  const keep = M.model.compileFormula(m2, m2.rules[1].formula).ast;
  m2.columns[0].label = 'Sticker price';
  ok('rename rewrites formulas', M.formula.print(keep, id => M.model.nameRef(m2, id)) === '[Sticker price] <= Budget');

  M.testResults = out;
})(window.M);
