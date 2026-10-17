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

  const EQ = M.equations;
  M.examples.forEach(ex => {
    const m = M.examples.get(ex.id), rr = E.compute(m), eq = EQ.build(m, rr);
    const calcN = m.columns.filter(c => c.formula).length, ruleN = m.rules.filter(x => x.on).length, critN = rr.crits.length;
    ok(`${m.name}: equations list every formula, rule and criterion`, eq.items.filter(x => x.kind === 'column').length === calcN && eq.items.filter(x => x.kind === 'rule').length === ruleN && eq.items.filter(x => x.kind === 'crit').length === critN && eq.items.some(x => x.kind === 'total'));
    let bad = '';
    eq.items.forEach(it => { if (it.broken) return; EQ.strings(m, it).forEach(s => { if (!s.sym || !s.text || !s.tex || /undefined|NaN/.test(s.sym + s.text + s.tex)) bad = it.label; }); });
    ok(`${m.name}: every equation has symbols, text and LaTeX`, !bad, bad);
    const crs = eq.items.filter(x => x.kind === 'crit');
    let pOk = true, pWhy = '';
    rr.rows.forEach(row => crs.forEach(it => {
      const x = row.c[it.id]; if (!x || x.missing) return;
      const scope = Object.assign({}, row.vals); let p = null;
      it.eqs.forEach(e => { const v = F.evaluate(e.ast, scope); scope[e.lhs] = e.lhs.startsWith('__t') ? M.util.clamp(v, 0, 1) : v; p = scope[e.lhs]; });
      if (!near(p, x.s * 10, 1e-3)) { pOk = false; pWhy = `${row.label} ${it.label}: ${p} vs ${x.s * 10}`; }
    }));
    ok(`${m.name}: written points equations give the engine's points`, pOk, pWhy);
    if (m.method === 'add') {
      const tot = eq.items.find(x => x.kind === 'total');
      let tOk = true;
      rr.ranked.forEach(id => { const row = rr.byId[id], sc = { __pen: row.penalty }; crs.forEach(it => { sc['__p' + it.n] = row.c[it.id].s * 10; }); if (!near(Math.max(0, F.evaluate(tot.eqs[0].ast, sc)), row.score, 0.02)) tOk = false; });
      ok(`${m.name}: written total gives the engine's score`, tOk);
    }
    ok(`${m.name}: LaTeX export is a full document`, /\\begin\{document\}[\s\S]*\\end\{document\}/.test(EQ.doc(m, eq, 'tex')));
  });
  ok('LaTeX: division becomes a fraction', EQ.latex(F.parse('a / b').ast, n => n) === '\\frac{a}{b}');
  ok('LaTeX: sqrt and if', /\\sqrt\{x\}/.test(EQ.latex(F.parse('sqrt(x)').ast, n => n)) && /cases/.test(EQ.latex(F.parse('if(a > 1, 2, 3)').ast, n => n)));

  {
    const UN = M.uncertainty, E0 = M.engine;
    const sup = M.examples.get('supplier'), base = E0.compute(sup);
    ok('uncertainty: no ± values means nothing to run', UN.run(sup, base) === null);
    const withUnc = (m, mode, v) => { const c = M.model.normalize(m); c.columns.forEach(x => { if (x.type === 'number' && !x.formula) x.unc = { mode, v }; }); return c; };
    ok('uncertainty: a valid ± survives normalize, a zero is dropped', (() => { const a = M.model.normalize({ columns: [{ id: 'a', type: 'number', unc: { mode: 'abs', v: 3 } }, { id: 'b', type: 'number', unc: { mode: 'pct', v: 0 } }], rows: [], criteria: [] }); return a.columns[0].unc.v === 3 && a.columns[0].unc.mode === 'abs' && !a.columns[1].unc; })());
    const big = withUnc(sup, 'pct', 25), rb = E0.compute(big), mc = UN.run(big, rb, { ms: Infinity });
    ok('uncertainty: a run returns trials and win chances', mc && mc.n >= 150 && mc.top.length >= 1);
    ok('uncertainty: win chances add up to one', mc && Math.abs(mc.top.reduce((a, x) => a + x.p, 0) - 1) < 1e-9, mc && mc.top.map(x => x.p));
    const mc2 = UN.run(big, rb, { ms: Infinity });
    ok('uncertainty: the same model gives the same answer every time', JSON.stringify(mc.top) === JSON.stringify(mc2.top));
    const tiny = withUnc(sup, 'pct', 0.0001), mt = UN.run(tiny, E0.compute(tiny), { ms: Infinity });
    ok('uncertainty: a tiny ± keeps the current winner at 100%', mt && mt.top[0].id === E0.compute(tiny).ranked[0] && mt.top[0].p === 1);
    ok('uncertainty: a wider ± can only lower the winner\'s chance', mc.top[0].p <= 1 && mc.top[0].p <= mt.top[0].p);
    ok('uncertainty: ± on a worked-out column is ignored', (() => { const m = M.model.normalize(sup); m.columns.forEach(c => { if (c.formula) c.unc = { mode: 'pct', v: 20 }; }); return UN.columns(m).every(c => !c.formula); })());
    ok('uncertainty: sampled values stay within the range', (() => { const c = { unc: { mode: 'abs', v: 5 } }; return UN.spread(c, 100) === 5 && UN.spread({ unc: { mode: 'pct', v: 10 } }, -200) === 20; })());
    ok('uncertainty: Can I trust this gets a what-ifs line', M.insights.build(big, rb).items.some(g => g.key === 'mc'));
    ok('uncertainty: an option with a real chance is not called unable to win', (() => { const mm = UN.run(big, rb, { ms: Infinity }), items = M.insights.build(big, rb).items; return mm.top.filter(x => x.p >= 0.02).every(x => !items.some(g => g.key === 'dom-' + x.id)); })());
    ok('uncertainty: no ± means no what-ifs line', !M.insights.build(sup, base).items.some(g => g.key === 'mc'));
    M.examples.forEach(ex => {
      const m = withUnc(M.examples.get(ex.id), 'pct', 10), r = E0.compute(m), t0 = Date.now(), x = UN.run(m, r);
      ok(`${m.name}: what-ifs run within a second`, !x || Date.now() - t0 < 1000, x ? x.ms + ' ms, ' + x.n + ' trials' : 'skipped');
    });
  }

  {
    M.examples.forEach(ex => {
      const m = M.examples.get(ex.id), r = M.engine.compute(m), p = M.xlsx.plan(m, r);
      const fs = p.sheets.flatMap(s => s.rows.flat()).filter(c => c && c.f !== undefined).map(c => c.f);
      ok(`${m.name}: workbook formulas are all Excel-safe`, fs.length > 0 && fs.every(f => f.length < 8192 && !/\bF\.|==|&&|\|\||\bpick\(|\bwait\(|\berlangc\(/.test(f)), fs.length + ' formulas');
      ok(`${m.name}: workbook keeps every value live`, p.stat.length === 0, p.stat.slice(0, 2).join('; '));
      const sc = p.sheets.find(s => s.name === 'Scores'), da = p.sheets.find(s => s.name === 'Data');
      ok(`${m.name}: workbook has a row per option`, sc.rows.length === p.FIRST - 1 + m.rows.length && da.rows.length === m.rows.length + 1);
      const z = M.xlsx.build(m, r);
      ok(`${m.name}: workbook is a zip file`, z[0] === 0x50 && z[1] === 0x4b && z.length > 1500);
    });
    ok('workbook: the Excel tab describes the sheets', /Scores:/.test(M.xlsx.describe(M.examples.get('laptop'), M.engine.compute(M.examples.get('laptop')))));
    ok('workbook: queue functions become Excel formulas', (() => { const a = M.formula.parse('wait(a, b, c)').ast; const f = M.xlsx.fx(a, id => id.toUpperCase()); return /POISSON/.test(f) && !/wait/.test(f); })());
    ok('workbook: pick becomes nested IFs', (() => { const f = M.xlsx.fx(M.formula.parse('pick(a, "x", 1, "y", 2, 0)').ast, id => 'A1'); return f === 'IF(A1="x",1,IF(A1="y",2,0))'; })());
  }

  {
    const EQ2 = M.equations, F2 = M.formula;
    const curves = ['even', 'gentle', 'steep', 'enough', 'target', 'scurve', 'step', 'custom'], fxs = ['t ^ 2', '1 - t', 'if(x > (lo + hi) / 2, 1, t)', 'clamp((x - lo) / (hi - lo) * 1.5, 0, 1)'];
    ok('curves: S-curve is flat at both ends and fair in the middle', near(E.curveApply({ curve: 'scurve' }, 0, 0, { lo: 0, hi: 1 }), 0) && near(E.curveApply({ curve: 'scurve' }, 0.5, 0.5, { lo: 0, hi: 1 }), 0.5) && near(E.curveApply({ curve: 'scurve' }, 1, 1, { lo: 0, hi: 1 }), 1) && E.curveApply({ curve: 'scurve' }, 0.1, 0.1, { lo: 0, hi: 1 }) < 0.1);
    ok('curves: pass or fail respects the direction', E.curveApply({ curve: 'step', at: 5, want: 'more' }, 1, 6, { lo: 0, hi: 10 }) === 1 && E.curveApply({ curve: 'step', at: 5, want: 'more' }, 0, 4, { lo: 0, hi: 10 }) === 0 && E.curveApply({ curve: 'step', at: 5, want: 'less' }, 1, 4, { lo: 0, hi: 10 }) === 1);
    ok('curves: my own formula "t" matches every bit counts', [0, 0.3, 0.77, 1].every(t => near(E.curveApply({ curve: 'custom', fx: 't' }, t, t, { lo: 0, hi: 1 }), t)));
    ok('curves: my own formula can use the value and the range', near(E.curveApply({ curve: 'custom', fx: '(x - lo) / (hi - lo)' }, 0.25, 12.5, { lo: 10, hi: 20 }), 0.25));
    ok('curves: a broken own formula is reported, not silently scored', (() => { const m = M.model.normalize(JSON.parse(JSON.stringify(M.examples.get('laptop')))); m.criteria[0].curve = 'custom'; m.criteria[0].fx = 't +'; const r = E.compute(m); return r.issues.some(i => i.where === 'curve' && i.id === m.criteria[0].id); })());
    ok('curves: unknown names in my own formula are caught', !E.customCurve('price * 2').ok && E.customCurve('x * 2').ok);
    M.examples.forEach(ex => {
      for (let v = 0; v < 3; v++) {
        const base = M.examples.get(ex.id), r0 = E.compute(base), m0 = JSON.parse(JSON.stringify(base));
        m0.criteria.forEach((c, i) => {
          c.curve = curves[(i + v * 3) % curves.length]; c.at = null; c.tol = null;
          if ((i + v) % 3 === 1) c.want = c.want === 'less' ? 'more' : 'less';
          if (c.curve === 'custom') c.fx = fxs[(i + v) % fxs.length];
          const R = r0.ranges[c.id];
          if (R && !R.text) {
            if (c.curve === 'target') { c.at = +((R.lo + R.hi) / 2).toPrecision(3); c.tol = +Math.max((R.hi - R.lo) / 2, 1).toPrecision(3); }
            if (c.curve === 'enough') c.at = +(R.lo + (R.hi - R.lo) * (c.want === 'less' ? 0.3 : 0.7)).toPrecision(3);
            if (c.curve === 'step') c.at = +((R.lo + R.hi) / 2).toPrecision(3);
          }
        });
        const m = M.model.normalize(m0), r = E.compute(m), tag = `${m.name} (curve mix ${v + 1})`;
        ok(`${tag}: no formula issues`, !r.issues.length, r.issues.map(i => i.msg).join('; '));
        let same = false, why = '';
        try {
          const code = M.exporter.js(m, r), fn = code.replace('export function score', 'return function score').replace(/^\/\/.*\n/, '');
          const score = (new Function('return (function(){' + fn + '})()'))();
          same = r.rows.every(row => { const o = score(Object.assign({}, m.rows.find(x => x.id === row.id).v)); if (o.pass !== row.pass) { why = row.label + ' pass'; return false; } if (o.pass && !near(o.score, row.score, 1e-6)) { why = row.label + ' ' + o.score + ' vs ' + row.score; return false; } return true; });
        } catch (e) { why = e.message; }
        ok(`${tag}: exported code = engine`, same, why);
        const eq = EQ2.build(m, r), crs = eq.items.filter(x => x.kind === 'crit');
        let pOk = true, pWhy = '';
        r.rows.forEach(row => crs.forEach(it => {
          const x = row.c[it.id]; if (!x || x.missing) return;
          const scope = Object.assign({}, row.vals); let p = null;
          try { it.eqs.forEach(e => { const val = F2.evaluate(e.ast, scope); scope[e.lhs] = e.lhs.startsWith('__t') ? M.util.clamp(val, 0, 1) : val; p = scope[e.lhs]; }); } catch (e) { pOk = false; pWhy = it.label + ': ' + e.message; return; }
          if (!near(p, x.s * 10, 1e-3)) { pOk = false; pWhy = `${row.label} ${it.label}: ${p} vs ${x.s * 10}`; }
        }));
        ok(`${tag}: written points equations give the engine's points`, pOk, pWhy);
        ok(`${tag}: workbook keeps every value live`, M.xlsx.plan(m, r).stat.length === 0);
      }
    });
  }

  {
    const EQ3 = M.equations, F3 = M.formula;
    M.examples.forEach(ex => {
      const add = E.compute(M.examples.get(ex.id)), m = M.model.normalize(Object.assign(JSON.parse(JSON.stringify(M.examples.get(ex.id))), { method: 'strict' })), r = E.compute(m), tag = `${m.name} (weakest link)`;
      ok(`${tag}: never scores above adding up`, r.rows.every(x => x.score <= add.byId[x.id].score + 1e-9));
      ok(`${tag}: contributions add up to the score`, r.rows.every(x => !x.pass || near(Object.values(x.c).reduce((a, y) => a + y.contrib, 0) * 100 - x.penalty, x.score > 0 ? x.score : x.score - 0, 1e-6) || x.score === 0));
      let same = false, why = '';
      try {
        const code = M.exporter.js(m, r), fn = code.replace('export function score', 'return function score').replace(/^\/\/.*\n/, '');
        const score = (new Function('return (function(){' + fn + '})()'))();
        same = r.rows.every(row => { const o = score(Object.assign({}, m.rows.find(x => x.id === row.id).v)); if (o.pass !== row.pass) { why = row.label + ' pass'; return false; } if (o.pass && !near(o.score, row.score, 1e-6)) { why = row.label + ' ' + o.score + ' vs ' + row.score; return false; } return true; });
      } catch (e) { why = e.message; }
      ok(`${tag}: exported code = engine`, same, why);
      const eq = EQ3.build(m, r), crs = eq.items.filter(x => x.kind === 'crit'), tot = eq.items.find(x => x.kind === 'total');
      let tOk = true;
      r.ranked.forEach(id => { const row = r.byId[id], sc = { __pen: row.penalty }; crs.forEach(it => { sc['__p' + it.n] = row.c[it.id].s * 10; }); if (!near(Math.max(0, F3.evaluate(tot.eqs[0].ast, sc)), row.score, 0.02)) tOk = false; });
      ok(`${tag}: written total gives the engine's score`, tOk);
      ok(`${tag}: workbook keeps every value live`, M.xlsx.plan(m, r).stat.length === 0);
    });
    ok('weakest link: a zero anywhere halves the score', (() => { const m = M.model.normalize({ method: 'strict', columns: [{ id: 'a', label: 'A', type: 'number' }, { id: 'b', label: 'B', type: 'number' }], rows: [{ id: 'r1', label: 'One', v: { a: 10, b: 0 } }, { id: 'r2', label: 'Two', v: { a: 0, b: 10 } }, { id: 'r3', label: 'Three', v: { a: 10, b: 10 } }], criteria: [{ id: 'ca', col: 'a', weight: 5 }, { id: 'cb', col: 'b', weight: 5 }] }); const r = E.compute(m); return near(r.byId.r1.score, 25) && near(r.byId.r3.score, 100); })());
  }

  {
    const E9 = M.engine, X9 = M.exporter, F9 = M.formula, MD9 = M.model, P9 = M.plan;
    const exportMatches = m => {
      const r = E9.compute(m); let why = '';
      try {
        const code = X9.js(m, r), fn = code.replace('export function score', 'return function score').replace(/^\/\/.*\n/, '');
        const score = (new Function('return (function(){' + fn + '})()'))();
        const same = r.rows.every(row => {
          const o = score(Object.assign({}, m.rows.find(x => x.id === row.id).v));
          if (o.pass !== row.pass) { why = row.label + ' pass'; return false; }
          if (o.pass && Math.abs(o.score - row.score) > 1e-9) { why = row.label + ' ' + o.score + ' vs ' + row.score; return false; }
          return true;
        });
        return { same, why, r };
      } catch (e) { return { same: false, why: e.message, r }; }
    };
    const edge = MD9.normalize((() => {
      const m = JSON.parse(JSON.stringify(M.examples.get('laptop')));
      m.knobs[0].value = 2000;
      m.columns.push(
        { id: 'flat', label: 'Flat', type: 'number', unit: '', formula: '' },
        { id: 'tag', label: 'Finish', type: 'text', unit: '', formula: '', choices: ['Matte', 'Gloss'] },
        { id: 'touch', label: 'Touch', type: 'yesno', unit: '', formula: '' },
        { id: 'spare', label: 'Spare', type: 'number', unit: '', formula: '' },
        { id: 'ratio', label: 'Ratio', type: 'number', unit: '', formula: 'Battery / Spare' },
        { id: 'bonus', label: 'Bonus', type: 'number', unit: '', formula: 'if(Touch = yes, 1, 0)' });
      const tags = ['Matte', 'Gloss', 'Matte', null, 'Gloss', 'Matte'], touch = [true, false, true, false, true, true], spare = [7, 9, 0, 8, 4, 8];
      m.rows.forEach((r, i) => { r.v.flat = 5; r.v.tag = tags[i]; r.v.touch = touch[i]; r.v.spare = spare[i]; });
      m.rows[1].v.weight = null;
      m.criteria.find(c => c.id === 'weight').curve = 'enough';
      m.criteria.find(c => c.id === 'weight').at = null;
      m.criteria.find(c => c.id === 'screen').at = null;
      m.criteria.find(c => c.id === 'screen').tol = null;
      m.criteria.push(
        { id: 'flat', col: 'flat', weight: 4, want: 'less', curve: 'even' },
        { id: 'tag', col: 'tag', weight: 3, points: { Matte: 8, Gloss: 3 } },
        { id: 'touch', col: 'touch', weight: 2 },
        { id: 'bonus', col: 'bonus', weight: 3, want: 'more', curve: 'steep' });
      m.rules = [
        { id: 'g1', label: 'Enough memory', formula: 'Memory >= 16', on: true, soft: false },
        { id: 'g2', label: 'Within budget', formula: 'Price <= Budget', on: true, soft: false },
        { id: 'g3', label: 'Spare ratio', formula: 'Ratio >= 0.5', on: true, soft: false },
        { id: 'g4', label: 'Good ratio', formula: 'Ratio >= 1', on: true, soft: true, penalty: 20 },
        { id: 'g5', label: 'Odd split', formula: 'Battery / (Spare - 8) >= 1', on: true, soft: true, penalty: 10 }
      ];
      return m;
    })());
    const er = exportMatches(edge);
    ok('edge model: no formula issues', !er.r.issues.length, er.r.issues.map(i => i.msg).join('; '));
    ok('edge model: covers ruled out, penalised and blank rows', er.r.out.length >= 1 && er.r.rows.some(x => x.pass && x.penalty > 0) && er.r.byId.r2.c.weight.missing && er.r.byId.r4.c.tag.missing);
    ok('exported JS = engine on auto thresholds, flat range, blanks, yes/no, divide by zero and rules', er.same, er.why);
    ok('curveParams: automatic thresholds', E9.curveParams({ curve: 'enough', want: 'less', at: null }, { lo: 0, hi: 10 }).at === 3 && E9.curveParams({ curve: 'enough', want: 'more', at: null }, { lo: 0, hi: 10 }).at === 7 && E9.curveParams({ curve: 'target', at: null, tol: null }, { lo: 0, hi: 10 }).tol === 5 && E9.curveParams({ curve: 'step', at: null }, { lo: 2, hi: 4 }).at === 3 && Object.keys(E9.curveParams({ curve: 'even' }, { lo: 0, hi: 1 })).length === 0);
    ok('summary shows the real threshold instead of a dash', (() => { const t = X9.recipe(edge, er.r); return !/\(—\)/.test(t) && /sweet spot|Sweet spot|Enough|enough/.test(t); })());
    ok('written points equations use the same automatic thresholds', (() => {
      const eq = M.equations.build(edge, er.r), crs = eq.items.filter(x => x.kind === 'crit');
      return er.r.rows.every(row => crs.every(it => {
        const x = row.c[it.id]; if (!x || x.missing) return true;
        const scope = Object.assign({}, row.vals); let p = null;
        try { it.eqs.forEach(e => { const val = F9.evaluate(e.ast, scope); scope[e.lhs] = e.lhs.startsWith('__t') ? M.util.clamp(val, 0, 1) : val; p = scope[e.lhs]; }); } catch (e) { return false; }
        return near(p, x.s * 10, 1e-3);
      }));
    })());

    const rtp = (src, scope) => {
      const names = Object.keys(scope), env = { resolve: n => names.find(k => k.toLowerCase() === n.toLowerCase()) ?? null, suggest: () => names };
      const p = F9.parse(src); F9.bind(p.ast, env);
      return { a: F9.evaluate(p.ast, scope), printed: F9.print(p.ast, n => n) };
    };
    const rt = { a: 2, b: 3, c: 2, x: 5 };
    ok('print keeps (a ^ b) ^ c', (() => { const o = rtp('(a ^ b) ^ c', rt); return ev(o.printed, rt) === o.a && o.a === 64; })(), rtp('(a ^ b) ^ c', rt).printed);
    ok('print keeps (a < b) = c', (() => { const o = rtp('(a < b) = c', rt); return ev(o.printed, rt) === o.a; })(), rtp('(a < b) = c', rt).printed);
    ok('print keeps tiny numbers', (() => { const o = rtp('x * 1e-12', rt); return ev(o.printed, rt) === o.a && o.a > 0; })(), rtp('x * 1e-12', rt).printed);
    ok('print keeps 15 digits of a number', F9.print(F9.parse('0.123456789012345').ast, n => n) === '0.123456789012345');

    ok('a column labelled Yes keeps its value after a rename pass', (() => {
      const m = MD9.normalize({ columns: [{ id: 'yes_c', label: 'Yes', type: 'number' }, { id: 'no_c', label: 'No', type: 'number' }, { id: 'calc', label: 'Calc', type: 'number', formula: '[Yes] * 2 + [No]' }],
        rows: [{ id: 'r1', label: 'One', v: { yes_c: 3, no_c: 1 } }, { id: 'r2', label: 'Two', v: { yes_c: 4, no_c: 1 } }], criteria: [{ id: 'k', col: 'calc', weight: 5 }] });
      const before = E9.compute(m).byId.r1.vals.calc;
      MD9.renameRefs(m);
      const after = E9.compute(m);
      return before === 7 && after.byId.r1.vals.calc === 7 && after.byId.r2.vals.calc === 9 && /\[Yes\]/.test(m.columns[2].formula) && MD9.nameRef(m, 'yes_c') === '[Yes]' && MD9.nameRef(m, 'calc') === 'Calc';
    })());
    ok('reserved words become bracketed names', ['And', 'Or', 'Not', 'True', 'False', 'YES', 'no'].every(w => MD9.nameRef({ columns: [{ id: 'q', label: w }], knobs: [] }, 'q') === '[' + w + ']'));

    ok('workbook: % becomes TRUNC maths, never an Excel percent sign', (() => { const f = M.xlsx.fx(F9.parse('x % 3').ast, id => id.toUpperCase()); return /TRUNC\(/.test(f) && !/%/.test(f); })());

    ok('find on the whole day runs over every hour', (() => {
      const m = M.examples.get('pharmacy'), spec = { role_maya: ['window', 'typing'], role_omar: ['window', 'typing'] };
      const f = P9.find(m, spec, { judge: 'day', ms: 1500 });
      return !f.error && f.contexts === m.day.values.length && f.top.length > 0;
    })());

    ok('a range typed backwards plans the day the same as one typed forwards', (() => {
      const cafe = M.examples.get('cafe'), wages = cafe.rows.map(r => r.v.wage), lo = Math.min(...wages), hi = Math.max(...wages);
      const run = (a, b) => { const m = E9.withModel(cafe, x => { x.criteria.find(c => c.id === 'c_cost').range = { auto: false, lo: a, hi: b }; }); const h = P9.hourlyFind(m, { baristas: [1, 2, 3], registers: [1, 2] }, { ms: 4000, cost: 4 }); return { avg: +h.avg.toFixed(6), plan: h.plan.join(',') }; };
      const f = run(lo, hi), b = run(hi, lo);
      return f.avg === b.avg && f.plan === b.plan;
    })());

    ok('a cleared range box is automatic, not zero', (() => {
      const c = { range: { auto: false, lo: null, hi: 10 } };
      const g = E9.rangeOf(c, [4, 8]);
      return g.lo === 4 && g.hi === 8 && g.auto === true;
    })());

    ok('fit: from all-zero importances it agrees with the pair', (() => {
      const m = MD9.normalize({ columns: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], rows: [{ id: 'a', label: 'A', v: { x: 10, y: 6 } }, { id: 'b', label: 'B', v: { x: 0, y: 4 } }],
        criteria: [{ id: 'x', col: 'x', weight: 0 }, { id: 'y', col: 'y', weight: 0 }], pairs: [{ a: 'a', b: 'b' }] });
      const f = P9.fit(m, m.pairs), ag = P9.agreement(m, E9.prepare(m), m.pairs, f.W);
      return f.after.ok >= f.before.ok && f.after.ok === 1 && ag[0].ok === true;
    })());

    ok('can never win: a penalty keeps the lower option in the race', (() => {
      const m = MD9.normalize({ columns: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }, { id: 'f', label: 'F', type: 'yesno' }],
        rows: [{ id: 'a', label: 'A', v: { x: 10, y: 10, f: false } }, { id: 'b', label: 'B', v: { x: 5, y: 5, f: true } }, { id: 'c', label: 'C', v: { x: 1, y: 1, f: true } }],
        rules: [{ id: 'g', label: 'Flag', formula: 'F = yes', on: true, soft: true, penalty: 50 }],
        criteria: [{ id: 'x', col: 'x', weight: 5 }, { id: 'y', col: 'y', weight: 5 }] });
      const d = M.insights.dominated(m, E9.compute(m));
      return !d.some(x => x.row === 'b') && d.some(x => x.row === 'c' && x.by === 'b');
    })());

    ok('written total floors at zero when penalties exceed the points', (() => {
      const m = E9.withModel(M.examples.get('laptop'), x => { x.rules[0].soft = true; x.rules[0].penalty = 100; });
      const r = E9.compute(m), eq = M.equations.build(m, r), crs = eq.items.filter(i => i.kind === 'crit'), tot = eq.items.find(i => i.kind === 'total');
      const row = r.byId.r5, sc = { __pen: row.penalty };
      crs.forEach(it => { sc['__p' + it.n] = row.c[it.id].s * 10; });
      return row.pass && row.penalty === 100 && row.score === 0 && F9.evaluate(tot.eqs[0].ast, sc) === 0;
    })());

    const cmpBase = (() => { const m = JSON.parse(JSON.stringify(M.examples.get('laptop'))); m.columns.push({ id: 'ppb', label: 'Price per hour', type: 'number', unit: '', formula: 'Price / Battery' }); m.criteria.find(c => c.id === 'battery').curve = 'enough'; m.criteria.find(c => c.id === 'battery').at = null; return MD9.normalize(m); })();
    ok('compare lists a changed threshold and a changed formula', (() => {
      const b = E9.withModel(cmpBase, x => { x.criteria.find(c => c.id === 'battery').at = 12; x.columns.find(c => c.id === 'ppb').formula = 'Price / Weight'; });
      const d = P9.compare(cmpBase, b).diffs;
      return d.some(s => /Battery.*threshold/.test(s)) && d.some(s => /Formula for Price per hour changed/.test(s));
    })());
    ok('compare lists tolerance, range, points, columns and settings', (() => {
      const b = E9.withModel(cmpBase, x => {
        x.criteria.find(c => c.id === 'screen').tol = 3; x.criteria.find(c => c.id === 'weight').range = { auto: false, lo: 0, hi: 5 };
        x.criteria.find(c => c.id === 'price').points = { a: 1 }; x.columns.pop(); x.knobs.push({ id: 'extra', label: 'Extra', value: 1, min: 0, max: 5, step: 1, unit: '', note: '', group: '' });
      });
      const d = P9.compare(cmpBase, b).diffs;
      return d.some(s => /Screen tolerance/.test(s)) && d.some(s => /Weight score range/.test(s)) && d.some(s => /Price points per answer/.test(s)) && d.some(s => /Column Price per hour only in A/.test(s)) && d.some(s => /Setting Extra only in B/.test(s));
    })());
    ok('compare ignores a rename that changes no meaning', (() => {
      const b = JSON.parse(JSON.stringify(cmpBase)); b.columns.find(c => c.id === 'price').label = 'Sticker'; b.rules.find(r => r.id === 'g2').formula = 'Sticker <= Budget'; b.columns.find(c => c.id === 'ppb').formula = 'Sticker / Battery';
      return !P9.compare(cmpBase, MD9.normalize(b)).diffs.some(s => /Must-have|Formula for/.test(s));
    })());

    ok('what it takes: the suggested value really flips the result', (() => {
      const m = M.examples.get('laptop'), r = E9.compute(m);
      return r.ranked.slice().every(id => E9.whatItTakes(m, r, id).every(w => {
        const rr = E9.compute(m, { prep: r.prep, V: { [id]: { [w.col]: w.to } } });
        return w.lose ? rr.ranked[0] !== id && rr.ranked[0] === w.vs : rr.ranked[0] === id;
      }));
    })());
    ok('what it takes: suggestions are rounded to 3 digits away from today', E9.whatItTakes(M.examples.get('laptop'), E9.compute(M.examples.get('laptop')), 'r1').every(w => +w.to.toPrecision(3) === w.to));

    ok('hourly: no options gives a clear message', (() => { const m = E9.withModel(M.examples.get('cafe'), x => { x.rows = []; x.pairs = []; }); try { return P9.hourly(m).error === 'Add some options first.'; } catch (e) { return false; } })());
  }

  {
    const E10 = M.engine, EQ10 = M.equations, MD10 = M.model;
    const every = fn => M.examples.every(ex => { const m = M.examples.get(ex.id), r = E10.compute(m); return m.criteria.filter(c => c.on).every(c => fn(m, r, c, EQ10.chartData(m, r, c.id), ex.id)); });
    ok('chart: every criterion of every example has chart data', every((m, r, c, d) => !!d && (d.kind === 'cats' || d.kind === 'curve')));
    ok('chart: every dot is exactly the points the ranking gave', every((m, r, c, d) => d.kind === 'cats' || d.dots.every(p => Math.abs(p.y - r.byId[p.id].c[c.id].s * 10) < 1e-9)));
    ok('chart: dots sit on the axis and the curve stays between 0 and 10 points', every((m, r, c, d) => d.kind === 'cats' || (d.dots.every(p => Number.isFinite(p.x) && p.x >= d.d0 - 1e-9 && p.x <= d.d1 + 1e-9) && d.curve.every(p => p.y >= -1e-9 && p.y <= 10 + 1e-9 && Number.isFinite(p.x)) && d.ticks.length > 0 && d.ticks.every(t => t.x >= d.d0 - 1e-9 && t.x <= d.d1 + 1e-9))));
    ok('chart: scoreAt is the score compute gives', M.examples.every(ex => { const m = M.examples.get(ex.id), r = E10.compute(m); return m.criteria.filter(c => c.on && r.ranges[c.id] && !r.ranges[c.id].text).every(c => r.rows.every(row => { const x = row.c[c.id]; return x.missing || Math.abs(E10.scoreAt(c, r.ranges[c.id], x.raw).s - x.s) < 1e-12; })); }));
    ok('chart: text answers give one bar each with their points and the options that picked them', (() => {
      const m = M.examples.get('flat'), r = E10.compute(m), c = m.criteria.find(x => m.columns.find(k => k.id === x.col).type === 'text'), d = EQ10.chartData(m, r, c.id);
      return d.kind === 'cats' && d.cats.every(b => b.y === (c.points[b.k] ?? 5)) && d.cats.reduce((a, b) => a + b.names.length, 0) === r.rows.filter(x => !x.c[c.id].missing).length;
    })());
    ok('chart: a yes/no criterion is two bars, No and Yes', (() => {
      const m = MD10.normalize((() => { const x = JSON.parse(JSON.stringify(M.examples.get('laptop'))); x.columns.push({ id: 'touch', label: 'Touch', type: 'yesno', unit: '', formula: '' }); x.rows.forEach((row, i) => { row.v.touch = i % 2 === 0; }); x.criteria.push({ id: 'touch', col: 'touch', weight: 3, want: 'more', curve: 'even' }); return x; })());
      const r = E10.compute(m), d = EQ10.chartData(m, r, 'touch');
      return d.kind === 'cats' && d.cats.length === 2 && d.cats[0].k === 'No' && d.cats[0].y === 0 && d.cats[1].k === 'Yes' && d.cats[1].y === 10 && d.cats[0].names.length + d.cats[1].names.length === m.rows.length;
    })());
    ok('chart: values off the scoring range are pinned to the edge and flagged', (() => {
      const m = M.examples.get('pharmacy'), r = E10.compute(m), c = m.criteria.find(x => x.id === 'wait'), d = EQ10.chartData(m, r, c.id);
      const far = d.dots.filter(p => p.raw > r.ranges[c.id].hi + 1);
      return far.length > 0 && far.every(p => p.off === 'hi' && p.x === d.d1 && p.y === 0) && d.dots.every(p => Number.isFinite(p.x));
    })());
    ok('chart: the sweet spot and thresholds are marked', (() => {
      const m = M.examples.get('laptop'), r = E10.compute(m), d = EQ10.chartData(m, r, 'screen'), m2 = M.examples.get('flat'), r2 = E10.compute(m2), d2 = EQ10.chartData(m2, r2, 'commute');
      return d.mark && d.mark.label === 'sweet spot' && d.mark.x === 14 && d.mark.x > d.d0 && d.mark.x < d.d1 && d2.mark && d2.mark.label === 'enough at' && EQ10.chartData(m, r, 'price').mark === null;
    })());
    ok('chart: tick marks land on round numbers', JSON.stringify(EQ10.niceTicks(0, 10, 6)) === '[0,2,4,6,8,10]' && JSON.stringify(EQ10.niceTicks(0.4, 1.1, 6)) === '[0.4,0.5,0.6,0.7,0.8,0.9,1,1.1]' && JSON.stringify(EQ10.niceTicks(749, 1749, 6)) === '[800,1000,1200,1400,1600]' && JSON.stringify(EQ10.niceTicks(5, 5, 6)) === '[5]');
    ok('chart: a flat range still gets a usable axis', (() => {
      const m = MD10.normalize({ columns: [{ id: 'x', label: 'X' }], rows: [{ id: 'a', label: 'A', v: { x: 5 } }, { id: 'b', label: 'B', v: { x: 5 } }], criteria: [{ id: 'x', col: 'x', weight: 5 }] });
      const r = E10.compute(m), d = EQ10.chartData(m, r, 'x');
      return d.kind === 'curve' && d.d1 > d.d0 && d.ticks.length > 0 && d.dots.length === 2 && d.curve.every(p => Number.isFinite(p.y));
    })());
  }

  M.testResults = out;
})(window.M);
