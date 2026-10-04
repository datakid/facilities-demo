window.M = window.M || {};
(function (M) {
  'use strict';
  const C = (id, label, type, unit, formula, note) => ({ id, label, type: type || 'number', unit: unit || '', formula: formula || '', note: note || '' });
  const K = (id, label, value, min, max, step, unit, note) => ({ id, label, value, min, max, step, unit: unit || '', note: note || '' });
  const R = (id, label, formula) => ({ id, label, formula, on: true });
  const W = (id, col, weight, o) => Object.assign({ id, col, on: true, weight, want: 'more', curve: 'even', at: null, tol: null, points: {}, range: { auto: true, lo: null, hi: null } }, o || {});
  const rows = (cols, list) => list.map((l, i) => { const [label, ...vals] = l; const v = {}; cols.filter(c => !c.formula).forEach((c, j) => { v[c.id] = vals[j]; }); return { id: 'r' + (i + 1), label, v }; });
  const S = (tab, focus, title, body, task) => ({ tab, focus, title, body, task: task || '' });

  const laptop = () => {
    const columns = [C('price', 'Price', 'number', '$'), C('battery', 'Battery', 'number', 'h'), C('weight', 'Weight', 'number', 'kg'), C('screen', 'Screen', 'number', 'in'), C('ram', 'Memory', 'number', 'GB')];
    return {
      name: 'Pick a laptop', question: 'Which laptop should I buy?', method: 'add',
      about: 'Six laptops, four things that matter, one budget. The smallest complete example.',
      columns,
      rows: rows(columns, [['Aster 13', 899, 14, 1.2, 13.3, 16], ['Borealis 14', 1299, 18, 1.4, 14, 16], ['Cirrus 16', 1599, 11, 2.0, 16, 32], ['Dune 14 Pro', 1749, 20, 1.5, 14.2, 32], ['Ember 15', 749, 8, 1.8, 15.6, 8], ['Fjord Air', 1099, 16, 1.1, 13.6, 16]]),
      knobs: [K('budget', 'Budget', 1500, 600, 2500, 50, '$', 'The most you are willing to spend')],
      rules: [R('g1', 'Enough memory', 'Memory >= 16'), R('g2', 'Within budget', 'Price <= Budget')],
      criteria: [W('price', 'price', 7, { want: 'less' }), W('battery', 'battery', 6, { curve: 'gentle' }), W('weight', 'weight', 5, { want: 'less' }), W('screen', 'screen', 3, { curve: 'target', at: 14, tol: 2.5 })],
      guide: { level: 'Start here', teaches: 'Importance, better-direction, must-haves, one setting', steps: [
        S('matters', 'results', 'This is a ranking you can argue with', '{winner} is on top right now. Every bar on the right is built from the things listed under What matters, so you can always see why.'),
        S('matters', 'crit:battery', 'Importance is a slider, not a guess', 'Each thing that matters gets an importance from 0 to 10. The percentage next to it is its real share of the score.', 'Drag Battery all the way to Crucial and watch the order change.'),
        S('matters', 'crit:screen', 'Not everything is “more is better”', 'Screen size uses a sweet spot: 14 in gets full points and anything further away gets less. Open How to score to see it.', 'Change the sweet spot to 16 and see who climbs.'),
        S('rules', 'rule:g1', 'Must-haves rule options out', 'An option that fails a must-have is not scored at all. Ember 15 only has 8 GB, so it is out, no matter how cheap.', 'Switch the rule off with its toggle to bring it back.'),
        S('rules', 'knob:budget', 'Settings are numbers you can turn', 'Budget is a setting. The “Within budget” rule uses it, so moving it changes who is allowed in.', 'Drag Budget down to $1,100.'),
        S('matters', 'why', 'Click any option to see why', 'The breakdown shows each value, the points it earned and what it would take to change places.', 'Click the second option in the ranking.'),
        S('options', 'table', 'Now make it yours', 'Type over any value, rename the laptops, or paste your own table from a spreadsheet. Everything updates as you type.')
      ] }
    };
  };

  const job = () => {
    const columns = [C('salary', 'Salary', 'number', '$'), C('bonus', 'Bonus', 'number', '$'), C('hours', 'Hours per week', 'number', 'h'), C('commute', 'Commute one way', 'number', 'min'), C('remote', 'Remote days', 'number', 'd/wk'), C('growth', 'Growth', 'text'), C('vacation', 'Vacation', 'number', 'days'),
      C('commute_yr', 'Commute per year', 'number', 'h', '[Commute one way] * 2 * (5 - [Remote days]) * [Work weeks] / 60', 'Time spent travelling to the office in a year'),
      C('total', 'Total pay', 'number', '$', 'Salary + Bonus'),
      C('real_hourly', 'Real hourly pay', 'number', '$/h', '[Total pay] / ([Hours per week] * [Work weeks] + [Commute per year])', 'Pay for every hour the job really takes, travel included')];
    return {
      name: 'Choose a job offer', question: 'Which offer is really the best deal?', method: 'add',
      about: 'Salary alone is misleading. Worked-out columns turn commute and hours into a real hourly pay.',
      columns,
      rows: rows(columns, [['Northwind', 92000, 8000, 45, 50, 1, 'Medium', 25], ['Larkspur', 84000, 0, 38, 15, 2, 'High', 28], ['Quayside', 105000, 15000, 50, 70, 0, 'Medium', 20], ['Tern Labs', 78000, 4000, 40, 0, 5, 'High', 30], ['Halcyon', 88000, 6000, 40, 35, 3, 'Low', 25]]),
      knobs: [K('weeks', 'Work weeks', 46, 40, 52, 1, 'wk', 'Weeks you actually work in a year'), K('need', 'Minimum I need', 80000, 50000, 120000, 1000, '$')],
      rules: [R('g1', 'Pays enough', '[Total pay] >= [Minimum I need]')],
      criteria: [W('real_hourly', 'real_hourly', 8), W('growth', 'growth', 6, { points: { Low: 2, Medium: 6, High: 10 } }), W('vacation', 'vacation', 3, { curve: 'gentle' }), W('remote', 'remote', 4, { curve: 'enough', at: 3 })],
      guide: { level: 'Formulas', teaches: 'Worked-out columns, text answers as points, good-enough curves', steps: [
        S('formulas', 'col:commute_yr', 'A column can be worked out', 'Commute per year is not typed in. It is a formula that uses other columns and the Work weeks setting. Names with spaces go in [brackets].'),
        S('formulas', 'col:real_hourly', 'Formulas can build on formulas', 'Real hourly pay divides Total pay by every hour the job takes, including travel. This is the number that is actually compared.', 'Below the formula you can see it worked out for one offer, with the real numbers plugged in.'),
        S('matters', 'crit:growth', 'Words can earn points too', 'Growth is Low, Medium or High. You decide how many points each answer is worth.', 'Give Medium 9 points and see what moves.'),
        S('matters', 'crit:remote', '“Good enough” curves', 'Three remote days already earns full points. More than that adds nothing. This avoids over-rewarding extremes.'),
        S('formulas', 'knob:need', 'Settings feed rules', 'Minimum I need is used by the Pays enough must-have.', 'Raise it to $95,000 and see who drops out.'),
        S('matters', 'checks', 'Read the checks', 'The checks say where the ranking is fragile: close calls, things that count twice, options that can never win.')
      ] }
    };
  };

  const rice = () => {
    const columns = [C('reach', 'Reach', 'number', 'users', '', 'People affected per quarter'), C('impact', 'Impact', 'number', '×', '', '3 massive, 2 high, 1 medium, 0.5 low, 0.25 minimal'), C('confidence', 'Confidence', 'number', '%'), C('effort', 'Effort', 'number', 'wk', '', 'Person-weeks'), C('strategic', 'Strategic', 'yesno'),
      C('rice', 'RICE score', 'number', '', 'Reach * Impact * Confidence / 100 / Effort', 'Reach × Impact × Confidence ÷ Effort')];
    return {
      name: 'Prioritise features', question: 'What should the team build next?', method: 'add',
      about: 'A classic product formula (RICE) built as a worked-out column, then blended with strategy.',
      columns,
      rows: rows(columns, [['Dark mode', 9000, 0.5, 90, 2, false], ['CSV import', 2500, 2, 80, 3, true], ['SSO login', 800, 3, 70, 6, true], ['Mobile app', 12000, 2, 50, 20, true], ['Onboarding tour', 6000, 1, 80, 3, false], ['Usage alerts', 3500, 1, 60, 1.5, false], ['API v2', 1500, 2, 90, 10, true]]),
      knobs: [K('capacity', 'Team capacity', 12, 2, 30, 1, 'wk', 'The biggest job the team can take this quarter')],
      rules: [R('g1', 'Fits the quarter', 'Effort <= [Team capacity]')],
      pairs: [{ a: 'r2', b: 'r1' }, { a: 'r6', b: 'r5' }],
      criteria: [W('rice', 'rice', 8, { curve: 'gentle' }), W('strategic', 'strategic', 3), W('confidence', 'confidence', 2)],
      guide: { level: 'Formulas', teaches: 'Rebuilding a known equation, squashing big numbers', steps: [
        S('formulas', 'col:rice', 'Known equations fit right in', 'RICE = Reach × Impact × Confidence ÷ Effort. It is typed exactly like that. You can use × ÷ or * /.'),
        S('matters', 'crit:rice', 'Big numbers need squashing', 'RICE scores range from tiny to huge, so one feature could dominate. “First steps count most” squashes the top end.', 'Switch it to “Every bit counts” and see how lopsided it gets.'),
        S('matters', 'crit:strategic', 'Yes / no columns', 'Strategic is yes or no. Yes earns full points.'),
        S('rules', 'knob:capacity', 'Capacity as a must-have', 'Anything bigger than the team capacity is ruled out.', 'Raise capacity to 20 weeks to let the mobile app in.')
      ] }
    };
  };

  const flat = () => {
    const columns = [C('rent', 'Rent', 'number', '$'), C('size', 'Size', 'number', 'm²'), C('commute', 'Commute', 'number', 'min'), C('balcony', 'Balcony', 'yesno'), C('area', 'Neighbourhood', 'text'), C('light', 'Daylight', 'number', '/5'),
      C('per_m2', 'Rent per m²', 'number', '$/m²', 'Rent / Size')];
    return {
      name: 'Find a flat', question: 'Which flat should I sign for?', method: 'balanced',
      about: 'Balanced scoring: a flat that is terrible on one thing cannot hide it behind the rest.',
      columns,
      rows: rows(columns, [['Elm St loft', 1650, 62, 18, true, 'Lively', 4], ['Harbour 3B', 1400, 48, 35, false, 'Quiet', 3], ['Park Row', 1950, 75, 12, true, 'Central', 5], ['Mill Lane', 1200, 55, 55, true, 'Quiet', 3], ['Kings Ct', 1550, 58, 22, false, 'Central', 2], ['Rose Yard', 1700, 70, 28, true, 'Quiet', 5]]),
      knobs: [K('max_rent', 'Max rent', 1800, 1000, 2500, 50, '$')],
      rules: [R('g1', 'Affordable', 'Rent <= [Max rent]'), Object.assign(R('g2', 'Ideally a balcony', 'Balcony'), { soft: true, penalty: 6 })],
      criteria: [W('per_m2', 'per_m2', 6, { want: 'less' }), W('size', 'size', 5, { curve: 'gentle' }), W('commute', 'commute', 7, { want: 'less', curve: 'enough', at: 25 }), W('area', 'area', 4, { points: { Quiet: 8, Lively: 5, Central: 9 } }), W('light', 'light', 4)],
      guide: { level: 'Start here', teaches: 'Balanced vs add-up, good-enough commute', steps: [
        S('matters', 'method', 'Add up or balanced', 'This one uses Balanced: a very weak spot drags the score down more. Add up lets strengths make up for weaknesses.', 'Switch to Add up and see whether Mill Lane, cheap but far away, climbs.'),
        S('matters', 'crit:commute', 'Anything under 25 minutes is fine', 'Commute uses “good enough”: 25 minutes or less earns full points.', 'Change the line to 15 minutes.'),
        S('matters', 'crit:area', 'Your taste in points', 'Neighbourhood answers are worth what you say they are.'),
        S('rules', 'rule:g2', 'Soft must-haves', 'A balcony is nice, not a deal-breaker. This must-have takes 6 points off instead of ruling a flat out.', 'Switch it to “Rule it out” and see who disappears.'),
        S('matters', 'tools', 'Not sure about importances?', 'Teach it my taste: say which flat you would pick over another, and it suggests importances that agree with you.', 'Open Teach it my taste.')
      ] }
    };
  };

  const supplier = () => {
    const columns = [C('unit', 'Unit price', 'number', '$'), C('setup', 'Setup fee', 'number', '$'), C('lead', 'Lead time', 'number', 'days'), C('defect', 'Defect rate', 'number', '%'), C('certified', 'ISO certified', 'yesno'),
      C('total', 'Total cost', 'number', '$', '[Setup fee] + [Unit price] * [Order size]', 'What the whole order costs'),
      C('bad', 'Faulty units', 'number', 'units', '[Order size] * [Defect rate] / 100')];
    return {
      name: 'Choose a supplier', question: 'Who should make our next order?', method: 'add',
      about: 'A setting (order size) flips the winner: fixed fees win small orders, cheap units win big ones.',
      columns,
      rows: rows(columns, [['Atlas Parts', 4.2, 1500, 21, 1.2, true], ['Brightline', 3.1, 9000, 30, 0.8, true], ['Cobalt Co', 5.0, 0, 10, 2.5, true], ['Delta Fab', 2.9, 6000, 45, 3.5, false], ['Evergreen', 3.6, 4000, 14, 1.0, true]]),
      knobs: [K('qty', 'Order size', 5000, 500, 20000, 500, 'units')],
      rules: [R('g1', 'Certified', '[ISO certified]')],
      criteria: [W('total', 'total', 8, { want: 'less' }), W('lead', 'lead', 5, { want: 'less', curve: 'enough', at: 14 }), W('bad', 'bad', 6, { want: 'less' })],
      guide: { level: 'Settings', teaches: 'Settings that flip the winner, reading switch points', steps: [
        S('formulas', 'col:total', 'Cost depends on the order', 'Total cost = Setup fee + Unit price × Order size. Order size is a setting, not a column.'),
        S('formulas', 'knob:qty', 'Find the switch point', 'The strip under the slider shows who wins at every order size. Each colour change is a switch point.', 'Drag Order size from 500 to 20,000 and watch first place change hands.'),
        S('matters', 'checks', 'Checks warn near a switch', 'When the current setting sits close to a switch point, the checks tell you, so you know the decision is on a knife edge.')
      ] }
    };
  };

  const shift = () => {
    const columns = [C('tills', 'Tills open', 'number', ''), C('floor_staff', 'Floor staff', 'number', ''),
      C('capacity', 'Till capacity', 'number', '/h', '[Tills open] * 60 / [Minutes per customer]', 'Customers the tills can serve per hour'),
      C('busy', 'How busy', 'number', '%', '[Customers per hour] / [Till capacity] * 100', 'Above 85% queues grow fast'),
      C('wait', 'Expected wait', 'number', 'min', 'if([How busy] < 100, wait([Customers per hour], 60 / [Minutes per customer], [Tills open]) * 60, 60)', 'Real queue maths (M/M/c): average minutes in line before a till is free'),
      C('cost', 'Staff cost', 'number', '$/h', '([Tills open] + [Floor staff]) * Wage')];
    return {
      name: 'Staff a shop shift', question: 'How should we staff the Saturday rush?', method: 'add',
      about: 'A real planning equation: capacity, how busy, expected wait and cost, all worked out from four settings.',
      columns,
      rows: rows(columns, [['2 tills, 1 floor', 2, 1], ['3 tills, 0 floor', 3, 0], ['3 tills, 1 floor', 3, 1], ['3 tills, 2 floor', 3, 2], ['4 tills, 1 floor', 4, 1], ['5 tills, 0 floor', 5, 0], ['5 tills, 2 floor', 5, 2]]),
      knobs: [K('cph', 'Customers per hour', 70, 10, 160, 5, '/h'), K('mpc', 'Minutes per customer', 2.4, 1, 6, 0.1, 'min'), K('wage', 'Wage', 19, 12, 35, 0.5, '$/h')],
      rules: [R('g1', 'Queue stays under control', '[How busy] < 90')],
      criteria: [W('wait', 'wait', 8, { want: 'less', curve: 'enough', at: 1 }), W('cost', 'cost', 6, { want: 'less' }), W('floor_staff', 'floor_staff', 3, { curve: 'gentle' })],
      guide: { level: 'Advanced', teaches: 'Chained formulas, a queue model, planning under load', steps: [
        S('formulas', 'col:busy', 'A chain of formulas', 'Till capacity → How busy → Expected wait. Each step uses the one before, and the settings.'),
        S('formulas', 'col:wait', 'Real queue maths', 'wait(arrivals, served per till, tills) is the standard M/M/c queue used by call centres and banks. if() caps the wait at 60 minutes when the tills are overloaded and the line never clears.'),
        S('rules', 'rule:g1', 'Safety first', 'Plans that run the tills above 90% are ruled out before scoring.'),
        S('formulas', 'knob:cph', 'Plan for the rush', 'Drag Customers per hour up to 120 and watch the plan that wins shift towards more tills.'),
        S('options', 'table', 'Try your own plan', 'Add an option, type how many tills and floor staff, and its wait and cost are worked out for you.', 'Click Add option.'),
        S('matters', 'tools', 'Let it find the plan', 'Find the best option tries every number of tills and floor staff, and shows the best ones you haven’t thought of.', 'Open Find the best option and press Find.')
      ] }
    };
  };

  const blank = () => Object.assign(M.model.blank(), { name: 'My ranking', question: 'What am I deciding?', about: 'A blank start: two columns and three options. Replace them with yours.' });

  M.examples = [
    { id: 'laptop', make: laptop },
    { id: 'flat', make: flat },
    { id: 'job', make: job },
    { id: 'rice', make: rice },
    { id: 'supplier', make: supplier },
    { id: 'shift', make: shift }
  ];
  M.examples.blank = blank;
  M.examples.get = id => { const e = M.examples.find(x => x.id === id); return e ? Object.assign(M.model.normalize(e.make()), { example: id }) : null; };
})(window.M);
