window.M = window.M || {};
(function (M) {
  'use strict';
  const K = (id, label, value, min, max, step, group, unit, note) => ({ id, label, value, min, max, step, group: group || '', unit: unit || '', note: note || '' });
  const F = (id, label, formula, o) => Object.assign({ id, label, type: 'number', unit: '', formula, note: '', group: '', pin: false, pct: false }, o || {});
  const C = (id, label, type, unit, o) => Object.assign({ id, label, type: type || 'number', unit: unit || '', formula: '' }, o || {});
  const W = (id, col, weight, o) => Object.assign({ id, col, on: true, weight, want: 'more', curve: 'even', at: null, tol: null, points: {}, range: { auto: true, lo: null, hi: null } }, o || {});
  const R = (id, label, formula) => ({ id, label, formula, on: true });
  const fixed = (lo, hi) => ({ auto: false, lo, hi });
  const S = (tab, focus, title, body, task) => ({ tab, focus, title, body, task: task || '' });
  const rows = (cols, list) => list.map(([id, label, ...vals]) => { const v = {}; cols.forEach((c, i) => { v[c.id] = vals[i]; }); return { id, label, v }; });

  const STAFF = [
    { id: 'maya', name: 'Maya', mgr: true, sp: 1.25, pk: 0.85, ac: 0.995, ap: 0.985, day: 1, days: 6 },
    { id: 'omar', name: 'Omar', sp: 1.1, pk: 0.7, ac: 0.985, ap: 0.95, day: 1, days: 6 },
    { id: 'lina', name: 'Lina', sp: 0.9, pk: 0.95, ac: 0.997, ap: 0.994, day: 1, days: 5 },
    { id: 'sam', name: 'Sam', sp: 0.8, pk: 0.8, ac: 0.98, ap: 0.96, day: 0.5, days: 4 }];
  const ROLES = ['window', 'typing', 'records', 'back', 'off'];

  function pharmacy() {
    const knobs = [
      K('lam', 'Patients per hour', 30, 4, 60, 1, 'The hour', '/h', 'Prescriptions arriving in the hour you plan for.'),
      K('pressure', 'Pressure', 0.8, 0, 1, 0.05, 'The hour', '', '0 is a calm hour, 1 the worst rush of the week. Everyone slows down and slips more, by their own amounts.'),
      K('surge', 'Unexpected surge', 0, 0, 0.6, 0.05, 'The hour', '', 'Extra demand on top: a clinic next door lets out, a bus arrives.'),
      K('backlog', 'Still waiting from before', 0, 0, 60, 1, 'The hour', 'people', 'Patients left in line when the previous hour ended.'),
      K('windows', 'Teller windows', 3, 1, 5, 1, 'The pharmacy', '', 'Counters where a patient can be served.'),
      K('open_days', 'Days open per week', 6, 5, 7, 1, 'The pharmacy', 'days'),
      K('help', 'Value of an extra person at a full counter', 0.3, 0, 1, 0.05, 'The pharmacy', '', '0: a third person at two windows adds nothing. 1: a full person.'),
      K('t_fill', 'Minutes to fill a prescription', 2.5, 1, 6, 0.1, 'The work', 'min'),
      K('q_miss', 'Share with missing items', 0.25, 0, 0.7, 0.01, 'The work', '', 'These need a new prescription typed for the missing item.'),
      K('t_type', 'Minutes to type a missed item', 3, 1, 8, 0.1, 'The work', 'min'),
      K('t_record', 'Minutes to record a patient', 0.8, 0, 4, 0.1, 'The work', 'min'),
      K('t_switch', 'Minutes lost per task switch', 0.3, 0, 2, 0.05, 'The work', 'min'),
      K('jug_err', 'Extra slips per task juggled', 0.004, 0, 0.02, 0.001, 'The work'),
      K('mgr_load', 'Manager time spent managing', 0.3, 0, 0.8, 0.05, 'The work', '', 'Share of Maya’s time lost to calls, suppliers and questions.'),
      K('target_min', 'Acceptable wait', 10, 2, 30, 1, 'The work', 'min')];
    STAFF.forEach(s => {
      const g = 'Team · ' + s.name + (s.mgr ? ' (manager)' : '');
      knobs.push(K('sp_' + s.id, s.name + ' speed', s.sp, 0.4, 1.6, 0.05, g, '×', '1 = an average pharmacist on a calm day.'));
      knobs.push(K('pk_' + s.id, s.name + ' speed kept in a rush', s.pk, 0.4, 1, 0.01, g, '', '0.7 means 30% slower at full pressure.'));
      knobs.push(K('ac_' + s.id, s.name + ' accuracy', s.ac, 0.9, 1, 0.001, g, '', '0.99 = one slip in 100.'));
      knobs.push(K('ap_' + s.id, s.name + ' accuracy in a rush', s.ap, 0.85, 1, 0.001, g));
      knobs.push(K('day_' + s.id, s.name + ' share of the day', s.day, 0, 1, 0.05, g, '', '1 full day, 0.5 half day, 0 not in.'));
      knobs.push(K('days_' + s.id, s.name + ' days per week', s.days, 0, 7, 1, g, 'days'));
    });
    const role = id => `role_${id}`;
    const sumIf = (test, term) => STAFF.map(s => `if(${test(s.id)}, ${term(s.id)}, 0)`).join(' + ');
    const isW = id => `${role(id)} = "window"`;
    const isT = id => `${role(id)} = "typing" or ${role(id)} = "back"`;
    const isR = id => `${role(id)} = "records" or ${role(id)} = "back"`;
    const isB = id => `${role(id)} = "back"`;
    const isBack = id => `${role(id)} = "typing" or ${role(id)} = "records" or ${role(id)} = "back"`;
    const columns = STAFF.map(s => C('role_' + s.id, s.name + (s.mgr ? ' (mgr)' : ''), 'text', '', { choices: ROLES.slice() }));
    STAFF.forEach(s => {
      columns.push(F('pres_' + s.id, s.name + ' presence', `day_${s.id} * days_${s.id} / open_days`, { group: 'People', pct: true, note: 'Share of opening hours this person is in.' }));
      columns.push(F('e_' + s.id, s.name + ' effective speed', `sp_${s.id} * (1 - pressure * (1 - pk_${s.id})) * pres_${s.id}` + (s.mgr ? ' * (1 - mgr_load)' : ''), { group: 'People', unit: '×' }));
      columns.push(F('a_' + s.id, s.name + ' accuracy now', `ac_${s.id} - pressure * (ac_${s.id} - ap_${s.id})`, { group: 'People', pct: true }));
    });
    columns.push(
      F('lam_eff', 'Patients to serve', 'lam * (1 + surge) + backlog', { group: 'Demand', unit: '/h' }),
      F('w_n', 'People at the windows', sumIf(isW, id => 'pres_' + id), { group: 'Windows', unit: 'people' }),
      F('w_sp', 'Window speed', sumIf(isW, id => 'e_' + id), { group: 'Windows', unit: '×' }),
      F('w_acc', 'Window accuracy', `(${sumIf(isW, id => `a_${id} * e_${id}`)}) / max(w_sp, 0.0001)`, { group: 'Windows', pct: true }),
      F('t_sp', 'Typing speed', sumIf(isT, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      F('r_sp', 'Recording speed', sumIf(isR, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      F('bk_sp', 'Speed of people doing both', sumIf(isB, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      F('back_cap', 'Back-office speed', sumIf(isBack, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      F('b_acc', 'Typing accuracy', `(${sumIf(isT, id => `a_${id} * e_${id}`)}) / max(t_sp, 0.0001)`, { group: 'Back office', pct: true }),
      F('has_typ', 'Typing is dedicated', 't_sp > 0', { group: 'Back office', note: '1 when someone else types missed items.' }),
      F('has_rec', 'Recording is dedicated', 'r_sp > 0', { group: 'Back office' }),
      F('jug', 'Extra tasks at the window', '(1 - has_typ) + (1 - has_rec)', { group: 'Windows', note: '0, 1 or 2 task types juggled on top of filling.' }),
      F('m_win', 'Minutes per patient', 't_fill + (1 - has_typ) * q_miss * t_type + (1 - has_rec) * t_record + jug * t_switch', { group: 'Windows', unit: 'min' }),
      F('pooled', 'Useful window speed', 'if(w_n <= windows, w_sp, w_sp * (windows + help * (w_n - windows)) / w_n)', { group: 'Windows', unit: '×', note: 'People beyond the windows only count for “help”.' }),
      F('w_c', 'Windows in use', 'max(1, min(windows, ceil(w_n - 0.05)))', { group: 'Windows' }),
      F('mu', 'Served per window', '60 / m_win * pooled / w_c', { group: 'Windows', unit: '/h' }),
      F('util_win', 'Window load', 'lam_eff / (w_c * mu)', { group: 'Result', pct: true, pin: true, note: 'Above 100% the line never clears.' }),
      F('wait_min', 'Average wait', 'wait(lam_eff, mu, w_c) * 60', { group: 'Result', unit: 'min', pin: true, note: 'A real queue model (M/M/c).' }),
      F('left', 'Still waiting at the end', 'if(util_win < 1, lam_eff * wait_min / 60, lam_eff - w_c * mu)', { group: 'Result', unit: 'people' }),
      F('sla', 'Served on time', 'within(lam_eff, mu, w_c, target_min / 60)', { group: 'Result', pct: true }),
      F('back_load', 'Back-office work', 'lam_eff * (has_typ * q_miss * t_type + has_rec * t_record + if(bk_sp > 0, t_switch, 0)) / 60', { group: 'Back office', unit: '×' }),
      F('back_util', 'Back-office load', 'if(back_cap > 0, back_load / back_cap, 0)', { group: 'Result', pct: true, pin: true }),
      F('slips', 'Slips per 100 patients', '100 * ((1 - w_acc) + jug * jug_err + q_miss * (1 - if(has_typ, b_acc, w_acc)))', { group: 'Result', unit: '/100', pin: true }),
      F('busiest', 'Busiest station', 'max(util_win, back_util)', { group: 'Result', pct: true }));
    const plans = [
      ['p1', 'Everyone at the windows', 'window', 'window', 'window', 'window'],
      ['p2', 'Sam on the back office', 'window', 'window', 'window', 'back'],
      ['p3', 'Manager on the back office', 'back', 'window', 'window', 'window'],
      ['p4', 'Manager records, Sam types', 'records', 'window', 'window', 'typing'],
      ['p5', 'Lina types, Sam records', 'window', 'window', 'typing', 'records'],
      ['p6', 'Manager only manages', 'off', 'window', 'window', 'window'],
      ['p7', 'Lina types, rest at windows', 'window', 'window', 'typing', 'window'],
      ['p8', 'Two windows, two in the back', 'back', 'window', 'window', 'back'],
      ['p9', 'Sam types, records at windows', 'window', 'window', 'window', 'typing']];
    return {
      name: 'Pharmacy staffing plan', question: 'How should four people split the work this hour?', method: 'add',
      about: 'Four people, three kinds of work and a real queue model. Each option is a role split; the settings describe the hour.',
      columns, knobs,
      rows: plans.map(([id, label, ...r]) => { const v = {}; STAFF.forEach((s, i) => { v['role_' + s.id] = r[i]; }); return { id, label, v }; }),
      rules: [R('g1', 'Someone is at a window', 'w_n > 0'), R('g2', 'The windows keep up', 'util_win < 1'), R('g3', 'The back office keeps up', 'back_util < 1')],
      criteria: [
        W('wait', 'wait_min', 6, { want: 'less', range: fixed(0, 15) }),
        W('ontime', 'sla', 3, { range: fixed(0.5, 1) }),
        W('safety', 'slips', 5, { want: 'less', range: fixed(2, 4.5) }),
        W('strain', 'busiest', 3, { want: 'less', range: fixed(0.5, 1), curve: 'steep' }),
        W('manager', 'role_maya', 3, { points: { off: 10, records: 7.5, back: 6, typing: 5.5, window: 2.5 } })],
      scenarios: [
        { id: 's1', label: 'Calm morning', values: { lam: 12, pressure: 0.1 } },
        { id: 's2', label: 'Midday', values: { lam: 22, pressure: 0.45 } },
        { id: 's3', label: 'Evening peak', values: { lam: 30, pressure: 0.8 } },
        { id: 's4', label: 'Peak + surprise', values: { lam: 30, pressure: 1, surge: 0.1 } },
        { id: 's5', label: 'Lina off (midday)', values: { lam: 22, pressure: 0.45, day_lina: 0 } },
        { id: 's6', label: 'Sam off (midday)', values: { lam: 22, pressure: 0.45, day_sam: 0 } }],
      day: { knob: 'lam', start: 8, values: [10, 14, 18, 22, 24, 20, 16, 14, 18, 26, 30, 28, 20, 12], link: { knob: 'pressure', lo: 0.1, hi: 0.85 }, carry: { col: 'left', knob: 'backlog' }, sticky: 3 },
      guide: { level: 'Advanced', teaches: 'Queues, role splits, situations, big formula chains', steps: [
        S('matters', 'results', 'Nine ways to split four people', 'Each option gives Maya, Omar, Lina and Sam a role: at a window, typing, recording, both (back) or off. Right now {winner} is best for this hour.'),
        S('matters', 'situations', 'One plan per part of the day', 'Situations are saved settings: a calm morning, the evening peak, someone off sick. Each chip shows who wins there.', 'Click Calm morning, then Evening peak.'),
        S('formulas', 'knob:lam', 'Turn the hour', 'Patients per hour and Pressure describe the hour. Every formula re-runs for every plan as you drag.', 'Drag Patients per hour up to 45 and see plans drop out.'),
        S('formulas', 'col:wait_min', 'A real queue model', 'Average wait uses wait(arrivals, served per window, windows), the M/M/c queue. Below the formula you see it with the numbers plugged in.'),
        S('rules', 'rule:g2', 'Overloaded plans are out', 'If the windows can’t keep up, the line grows forever, so the plan is ruled out instead of scored.'),
        S('matters', 'crit:manager', 'Words can earn points', 'Maya is the manager. Plans that keep her free to manage earn more points.'),
        S('matters', 'day', 'A plan for the whole day', 'The day plan scores every hour from 08:00. Patients still waiting at the end of an hour carry into the next (the striped bits), so a plan that lets the line build up pays for it later.', 'Click the busiest hour to load its settings.'),
        S('matters', 'tools', 'Let it find the split', 'Find the best option tries all 625 role splits on the whole day, including ones not in your list.', 'Open Find the best option, judge on Whole day, press Find.'),
        S('options', 'table', 'Try your own split', 'Change any role in the table, or add a plan. Everything downstream is worked out for you.', 'Set Sam to typing in the first plan.')
      ] }
    };
  }

  function feed() {
    const columns = [C('server', 'App servers', 'text', '', { choices: ['vm', 'containers', 'bare', 'serverless'] }), C('nodes', 'App nodes'), C('cache', 'Cache', 'text', '', { choices: ['none', 'memcached', 'redis', 'dax'] }), C('db', 'Database', 'text', '', { choices: ['postgres', 'cassandra', 'dynamo'] }), C('replicas', 'Read replicas'), C('shards', 'Write shards'), C('fanout', 'Feed build', 'text', '', { choices: ['pull', 'push', 'hybrid'] }), C('backup_min', 'Backup every', 'number', 'min'), C('regions', 'Regions')];
    const data = rows(columns, [
      ['a1', 'Starter monolith', 'vm', 2, 'none', 'postgres', 0, 1, 'pull', 1440, 1],
      ['a2', 'Monolith + Redis', 'vm', 4, 'redis', 'postgres', 2, 1, 'pull', 60, 1],
      ['a3', 'Containers + Redis + replicas', 'containers', 8, 'redis', 'postgres', 4, 1, 'hybrid', 15, 1],
      ['a4', 'Sharded Postgres, push feed', 'containers', 16, 'redis', 'postgres', 4, 6, 'push', 15, 1],
      ['a5', 'Cassandra timelines', 'containers', 12, 'memcached', 'cassandra', 2, 6, 'push', 5, 2],
      ['a6', 'Serverless + DynamoDB', 'serverless', 0, 'dax', 'dynamo', 0, 8, 'hybrid', 5, 2],
      ['a7', 'Big iron, one region', 'bare', 4, 'redis', 'postgres', 6, 1, 'pull', 60, 1],
      ['a8', 'Multi-region hybrid', 'containers', 20, 'redis', 'cassandra', 4, 8, 'hybrid', 5, 3]]);
    const knobs = [
      K('dau', 'Daily active users', 2, 0.05, 50, 0.05, 'Traffic', 'M'),
      K('req_user', 'Requests per user per day', 120, 20, 600, 10, 'Traffic', '', 'Feed loads, likes, profile views, posts.'),
      K('read_share', 'Share of reads', 0.92, 0.5, 0.995, 0.005, 'Traffic', '', 'A feed is 90–98% reads. Chat is closer to 50–70%.'),
      K('peak_factor', 'Peak vs average', 3, 1, 8, 0.5, 'Traffic', '×'),
      K('followers', 'Followers per poster', 150, 10, 2000, 10, 'Traffic', '', 'A push feed copies each post into this many timelines.'),
      K('post_share', 'Share of writes that are posts', 0.1, 0.02, 0.6, 0.01, 'Traffic'),
      K('growth', 'Growth per month', 0.08, 0, 0.4, 0.01, 'Traffic'),
      K('growth_cap', 'Required runway', 6, 1, 36, 1, 'Goals', 'months'),
      K('max_loss', 'Most data you can lose', 60, 1, 1440, 1, 'Goals', 'min'),
      K('budget', 'Monthly budget', 60, 2, 200, 1, 'Goals', 'k$'),
      K('node_up', 'Uptime of one machine', 0.995, 0.95, 0.9999, 0.0005, 'Assumptions')];
    const pick = (col, pairs, d) => `pick(${col}, ${pairs.map(([k, v]) => `"${k}", ${v}`).join(', ')}, ${d})`;
    columns.push(
      F('avg_rps', 'Average load', 'dau * 1000000 * req_user / 86400', { group: 'Load', unit: 'req/s' }),
      F('peak_rps', 'Peak load', 'avg_rps * peak_factor', { group: 'Load', unit: 'req/s', pin: true }),
      F('reads', 'Peak reads', 'peak_rps * read_share', { group: 'Load', unit: 'req/s' }),
      F('writes', 'Peak writes', 'peak_rps * (1 - read_share)', { group: 'Load', unit: 'req/s' }),
      F('fan', 'Timeline copies per post', pick('fanout', [['push', 'followers'], ['hybrid', 'followers * 0.3'], ['pull', 0]], 0), { group: 'Load', note: 'pick() gives a value per answer.' }),
      F('read_cost', 'DB reads per feed read', pick('fanout', [['push', 1], ['hybrid', 3], ['pull', 12]], 1), { group: 'Load' }),
      F('hit', 'Cache hit rate', pick('cache', [['none', 0], ['memcached', 0.85], ['redis', 0.9], ['dax', 0.88]], 0), { group: 'Cache', pct: true }),
      F('db_reads', 'Reads reaching the DB', 'reads * read_cost * (1 - hit)', { group: 'Database', unit: 'ops/s' }),
      F('db_writes', 'Writes reaching the DB', 'writes * (1 + post_share * fan)', { group: 'Database', unit: 'ops/s' }),
      F('node_rps', 'Requests per app node', pick('server', [['vm', 900], ['containers', 1200], ['bare', 4000], ['serverless', 0]], 1000), { group: 'App', unit: 'req/s' }),
      F('app_cap', 'App capacity', 'if(server = "serverless", 1000000, nodes * node_rps)', { group: 'App', unit: 'req/s' }),
      F('read_node', 'Reads per DB node', pick('db', [['postgres', 6000], ['cassandra', 9000], ['dynamo', 40000]], 5000), { group: 'Database', unit: 'ops/s' }),
      F('write_node', 'Writes per DB shard', pick('db', [['postgres', 4000], ['cassandra', 12000], ['dynamo', 25000]], 2000), { group: 'Database', unit: 'ops/s' }),
      F('read_cap', 'DB read capacity', 'read_node * (1 + replicas) * shards', { group: 'Database', unit: 'ops/s' }),
      F('write_cap', 'DB write capacity', 'write_node * shards', { group: 'Database', unit: 'ops/s' }),
      F('headroom', 'Headroom at peak', 'min(app_cap / peak_rps, read_cap / max(db_reads, 1), write_cap / max(db_writes, 1))', { group: 'Result', unit: '×', pin: true, note: 'Under 1 means it falls over at peak.' }),
      F('limit', 'Runs out first', 'if(app_cap / peak_rps <= min(read_cap / max(db_reads, 1), write_cap / max(db_writes, 1)), "app", if(read_cap / max(db_reads, 1) <= write_cap / max(db_writes, 1), "db reads", "db writes"))', { group: 'Result', type: 'text' }),
      F('runway', 'Growth runway', 'runway(headroom, growth)', { group: 'Result', unit: 'months', pin: true }),
      F('copies', 'Copies of the data', 'if(db = "postgres", 1 + replicas, 3) * regions', { group: 'Reliability' }),
      F('availability', 'Availability', 'avail(node_up, min(copies, 6)) * avail(node_up, if(server = "serverless", 6, max(nodes, 1))) * if(regions > 1, 1, 0.9995)', { group: 'Reliability', pct: true }),
      F('downtime', 'Downtime per month', '(1 - availability) * 43200', { group: 'Result', unit: 'min', pin: true }),
      F('loss', 'Data you could lose', 'if(db = "postgres" and replicas = 0, backup_min, if(db = "postgres", 1, 0.1))', { group: 'Reliability', unit: 'min' }),
      F('latency', 'Feed read time', '8 + (1 - hit) * read_cost * 4 + if(regions > 1, 0, 35)', { group: 'Result', unit: 'ms' }),
      F('cost', 'Monthly cost', `${pick('server', [['vm', 0.25], ['containers', 0.3], ['bare', 1.1], ['serverless', 0]], 0.3)} * nodes + if(server = "serverless", peak_rps * 0.004, 0) + ${pick('db', [['postgres', 1.2], ['cassandra', 1.6], ['dynamo', 0]], 1)} * (1 + replicas) * shards + if(db = "dynamo", db_reads * 0.0006 + db_writes * 0.003, 0) + ${pick('cache', [['none', 0], ['memcached', 0.8], ['redis', 1], ['dax', 1.3]], 0)} * regions + 0.02 * regions * 1440 / backup_min`, { group: 'Result', unit: 'k$', pin: true, note: 'Illustrative prices. Put in your own.' }));
    return {
      name: 'News feed backend', question: 'Which architecture should the feed run on?', method: 'add',
      about: 'Eight architectures scored against your traffic. Move users or the read/write mix and watch which layer breaks first.',
      columns, rows: data, knobs,
      rules: [R('g1', 'Survives the peak', 'headroom >= 1'), R('g2', 'Enough runway', 'runway >= growth_cap'), R('g3', 'Data loss within limit', 'loss <= max_loss'), R('g4', 'Within budget', 'cost <= budget')],
      criteria: [
        W('c_cost', 'cost', 6, { want: 'less', range: fixed(0, 60), curve: 'gentle' }),
        W('c_room', 'runway', 5, { range: fixed(0, 48), curve: 'gentle' }),
        W('c_up', 'downtime', 4, { want: 'less', range: fixed(0, 30), curve: 'steep' }),
        W('c_fast', 'latency', 3, { want: 'less', range: fixed(8, 90) }),
        W('c_ops', 'db', 2, { points: { postgres: 9, cassandra: 3.5, dynamo: 7.5 } })],
      scenarios: [
        { id: 's1', label: 'Launch', values: { dau: 0.2, growth: 0.2 } },
        { id: 's2', label: 'Today', values: {} },
        { id: 's3', label: 'Viral month', values: { dau: 8, peak_factor: 5 } },
        { id: 's4', label: 'Write-heavy (chat)', values: { read_share: 0.6, followers: 20 } },
        { id: 's5', label: 'Tight budget', values: { budget: 20 } }],
      guide: { level: 'Advanced', teaches: 'Capacity planning, pick(), text results, situations', steps: [
        S('matters', 'results', 'Architectures, not products', 'Each option is a stack: servers, cache, database, replicas, shards. {winner} fits today’s traffic best.'),
        S('formulas', 'col:fan', 'pick() turns words into numbers', 'Feed build is push, pull or hybrid. pick() gives a number for each answer, here the timeline copies per post.'),
        S('formulas', 'col:headroom', 'Find the bottleneck', 'Headroom is the tightest of app, DB reads and DB writes. Runs out first names which one.'),
        S('rules', 'rule:g1', 'Hard limits first', 'Stacks that fall over at peak, run out of runway, lose too much data or cost too much are ruled out.'),
        S('matters', 'situations', 'Plan for the future', 'Situations replay the ranking for launch, a viral month or a chat-like product.', 'Click Viral month.'),
        S('formulas', 'knob:read_share', 'Reads vs writes', 'Drag Share of reads down to 0.6 and watch push feeds and Postgres struggle.')
      ] }
    };
  }

  function venue() {
    const columns = [C('gates', 'Entry gates'), C('lanes', 'Lanes per gate'), C('screen_s', 'Screening time', 'number', 's'), C('exit_m', 'Exit width', 'number', 'm'), C('area_m2', 'Standing area', 'number', 'm²'), C('stewards', 'Stewards'), C('timed', 'Timed entry', 'yesno')];
    const data = rows(columns, [
      ['v1', 'Two gates, bag check', 2, 4, 14, 22, 3200, 30, false],
      ['v2', 'Three gates, bag check', 3, 4, 14, 22, 3200, 36, false],
      ['v3', 'Three gates, no-bag policy', 3, 4, 7, 22, 3200, 36, false],
      ['v4', 'Four gates, timed entry', 4, 3, 12, 24, 3200, 38, true],
      ['v5', 'Open the side field', 3, 5, 12, 30, 4600, 44, false],
      ['v6', 'Bare minimum', 2, 3, 14, 16, 3200, 14, false],
      ['v7', 'Five gates, express lanes', 5, 4, 9, 28, 3800, 48, true]]);
    const knobs = [
      K('attendees', 'Attendees', 9000, 1000, 20000, 250, 'The event', 'people'),
      K('rush_share', 'Share arriving in the rush', 0.35, 0.2, 0.9, 0.05, 'The event', '', 'Timed entry cuts it by a third.'),
      K('rush_min', 'Rush length', 60, 15, 120, 5, 'The event', 'min'),
      K('flow', 'Exit flow per metre', 70, 40, 90, 1, 'Safety', 'p/m/min', '60–80 is a common planning value.'),
      K('walk_min', 'Walk to the exits', 2, 0.5, 6, 0.5, 'Safety', 'min'),
      K('max_clear', 'Most time to clear', 8, 4, 15, 0.5, 'Safety', 'min'),
      K('max_density', 'Highest safe density', 4, 2, 5, 0.25, 'Safety', 'p/m²'),
      K('steward_ratio', 'People per steward', 250, 100, 500, 10, 'Safety'),
      K('steward_cost', 'Cost per steward', 180, 80, 400, 10, 'Money', '$')];
    columns.push(
      F('lam', 'Arrivals per minute', 'attendees * rush_share * if(timed, 0.67, 1) / rush_min', { group: 'Entry', unit: '/min' }),
      F('lanes_open', 'Lanes open', 'gates * lanes', { group: 'Entry' }),
      F('mu', 'People per lane per minute', '60 / screen_s', { group: 'Entry', unit: '/min' }),
      F('util', 'Lane load', 'lam / (lanes_open * mu)', { group: 'Result', pct: true, pin: true }),
      F('wq', 'Wait at the gate', 'wait(lam, mu, lanes_open)', { group: 'Result', unit: 'min', pin: true }),
      F('in_line', 'People queuing outside', 'lam * wq', { group: 'Entry', unit: 'people' }),
      F('density', 'Density inside', 'attendees / area_m2', { group: 'Result', unit: 'p/m²', pin: true }),
      F('clear_min', 'Time to clear', 'attendees / (exit_m * flow) + walk_min', { group: 'Result', unit: 'min', pin: true }),
      F('steward_gap', 'Steward cover', 'stewards * steward_ratio / attendees', { group: 'Safety', pct: true }),
      F('cost', 'Staff cost', 'stewards * steward_cost + lanes_open * 120', { group: 'Result', unit: '$' }));
    return {
      name: 'Event crowd control', question: 'Which entry plan is safe and comfortable?', method: 'add',
      about: 'Safety rules come first: clearance, density, steward cover. Comfort and cost only rank the plans that are safe.',
      columns, rows: data, knobs,
      rules: [R('g1', 'Clears in time', 'clear_min <= max_clear'), R('g2', 'Density is safe', 'density <= max_density'), R('g3', 'Lanes keep up', 'util < 1'), R('g4', 'Enough stewards', 'steward_gap >= 1')],
      criteria: [
        W('c_wait', 'wq', 7, { want: 'less', range: fixed(0, 30), curve: 'enough', at: 5 }),
        W('c_margin', 'clear_min', 6, { want: 'less', range: fixed(3, 10) }),
        W('c_room', 'density', 3, { want: 'less', range: fixed(1, 4) }),
        W('c_cost', 'cost', 4, { want: 'less' })],
      scenarios: [
        { id: 's1', label: 'Half full', values: { attendees: 4500 } },
        { id: 's2', label: 'Sold out', values: {} },
        { id: 's3', label: 'Late surge', values: { rush_share: 0.5, rush_min: 40 } },
        { id: 's4', label: 'Rain, slow exits', values: { flow: 55, walk_min: 3 } }],
      guide: { level: 'Settings', teaches: 'Safety rules before scoring, queues at gates', steps: [
        S('rules', 'rule:g1', 'Safety is a must-have', 'A plan that can’t clear the venue in time is ruled out, however comfortable it is.'),
        S('formulas', 'col:wq', 'Gate queues', 'Wait at the gate uses the same queue maths as a pharmacy or a call centre.'),
        S('matters', 'situations', 'What if it rains?', 'Situations replay the plans for half full, a late surge or slow exits.', 'Click Rain, slow exits.'),
        S('formulas', 'knob:attendees', 'Sell more tickets', 'Drag Attendees to 14,000 and see which plans stay safe.')
      ] }
    };
  }

  function cafe() {
    const columns = [C('registers', 'Registers'), C('baristas', 'Baristas'), C('mobile', 'Mobile ordering', 'yesno'), C('wage', 'Wage bill', 'number', '$/h')];
    const data = rows(columns, [['c1', '1 register, 1 barista', 1, 1, false, 36], ['c2', '1 register, 2 baristas', 1, 2, false, 54], ['c3', '2 registers, 2 baristas', 2, 2, false, 72], ['c4', '1 register, 2 baristas, app', 1, 2, true, 58], ['c5', '2 registers, 3 baristas', 2, 3, false, 90], ['c6', '1 register, 3 baristas, app', 1, 3, true, 76]]);
    const knobs = [K('lam', 'Customers per hour', 70, 10, 160, 5, 'The hour', '/h'), K('t_order', 'Minutes to take an order', 0.9, 0.3, 3, 0.1, 'The work', 'min'), K('t_drink', 'Minutes to make a drink', 1.6, 0.5, 5, 0.1, 'The work', 'min'), K('app_share', 'Orders through the app', 0.3, 0, 0.8, 0.05, 'The work', '', 'App orders skip the register.')];
    columns.push(
      F('lam_reg', 'Customers at the register', 'lam * (1 - if(mobile, app_share, 0))', { unit: '/h' }),
      F('w_reg', 'Wait to order', 'wait(lam_reg, 60 / t_order, registers) * 60', { unit: 'min', pin: true }),
      F('w_bar', 'Wait for the drink', 'wait(lam, 60 / t_drink, baristas) * 60', { unit: 'min', pin: true }),
      F('total', 'Total wait', 'w_reg + w_bar', { unit: 'min', pin: true }),
      F('bottleneck', 'Bottleneck', 'if(lam_reg * t_order / registers >= lam * t_drink / baristas, "register", "bar")', { type: 'text' }));
    return {
      name: 'Coffee shop rush', question: 'How do we staff the morning rush?', method: 'add',
      about: 'The smallest queue model: order, then drink. The slower step sets the wait.',
      columns, rows: data, knobs,
      rules: [R('g1', 'Keeps up', 'total < 60'), Object.assign(R('g2', 'Drinks within 5 minutes', 'total <= 5'), { soft: true, penalty: 12 })],
      day: { knob: 'lam', start: 6, values: [30, 80, 110, 90, 60, 50, 70, 55, 40, 45, 60, 35, 20], link: null, carry: null, sticky: 3 },
      criteria: [W('c_wait', 'total', 6, { want: 'less', range: fixed(0, 15) }), W('c_cost', 'wage', 4, { want: 'less' })],
      scenarios: [{ id: 's1', label: 'Quiet', values: { lam: 25 } }, { id: 's2', label: 'Morning rush', values: { lam: 70 } }, { id: 's3', label: 'Commuter peak', values: { lam: 110 } }],
      guide: { level: 'Formulas', teaches: 'Two-step queue, the bottleneck, wait()', steps: [
        S('formulas', 'col:w_reg', 'Two queues in a row', 'Wait to order and Wait for the drink each use wait(). Total wait adds them.'),
        S('formulas', 'col:bottleneck', 'Formulas can return words', 'Bottleneck says “register” or “bar”, whichever is busier.'),
        S('matters', 'situations', 'Quiet vs rush', 'The cheapest plan wins when it’s quiet. More baristas win at the peak.', 'Click Commuter peak.'),
        S('formulas', 'knob:app_share', 'Does the app help?', 'Drag Orders through the app up and see the app plans climb.')
      ] }
    };
  }

  const FAC = [
    ['sag', 'Sarema General', 'public', 29, 27, 60, 51, .95, .78, 'lab xray mri cardio dialysis ortho mater peds physio'],
    ['ntg', 'Northgate Teaching', 'public', 88, 18, 70, 44, 1, .86, 'lab xray mri cardio ortho mater peds physio onco'],
    ['krh', 'Kestrel Regional', 'public', 66, 58, 50, 21, .95, .74, 'lab xray mri cardio dialysis ortho mater peds'],
    ['bfh', 'Bramble Ford HC', 'public', 52, 42, 24, 9, .9, .66, 'lab xray peds mater physio'],
    ['aru', 'Almond Row Unit', 'public', 12, 16, 14, 6, .9, .6, 'lab peds mater'],
    ['fcc', 'Fenwick Clinic', 'public', 22, 56, 18, 15, .9, .63, 'lab xray physio peds'],
    ['lcu', 'Linden Care Unit', 'public', 108, 46, 16, 7, 1, .7, 'dialysis lab cardio'],
    ['pcu', 'Pebble Creek Unit', 'public', 102, 70, 16, 5, .9, .62, 'lab xray peds mater physio'],
    ['tdu', 'Thistledown Unit', 'public', 52, 10, 10, 3, .9, .58, 'lab peds'],
    ['hhv', 'Harbor Heart', 'contracted', 97, 27, 30, 14, 1.5, .9, 'cardio lab xray mri'],
    ['shl', 'Saffron Labs', 'contracted', 82, 44, 40, 22, 1.35, .84, 'lab xray mri'],
    ['wbr', 'Willow Rehab', 'contracted', 64, 29, 26, 10, 1.4, .82, 'physio ortho xray'],
    ['srp', 'Sarema Renal', 'contracted', 38, 34, 20, 9, 1.55, .83, 'dialysis lab'],
    ['tom', 'Tamarind Onco', 'contracted', 46, 63, 24, 11, 1.65, .88, 'onco mri lab xray'],
    ['sgc', 'Sarema Grand', 'private', 39, 23, 36, 15, 2.4, .94, 'lab xray mri cardio ortho mater peds physio dialysis'],
    ['mwc', 'Marigold Care', 'private', 14, 38, 14, 5, 2.2, .92, 'mater peds lab xray'],
    ['kbh', 'Kestrel Bayview', 'private', 76, 64, 30, 12, 2.7, .95, 'cardio mri ortho onco lab xray mater'],
    ['hiu', 'Harbor Imaging', 'private', 106, 15, 22, 8, 2.3, .9, 'mri xray lab']];
  const SERV = [['lab', 'Lab work'], ['xray', 'X-ray'], ['mri', 'MRI or CT'], ['cardio', 'Cardiology'], ['dialysis', 'Dialysis'], ['physio', 'Physio'], ['ortho', 'Orthopedics'], ['onco', 'Oncology'], ['mater', 'Maternity'], ['peds', 'Pediatrics']];

  function care() {
    const columns = [C('distance_km', 'Distance', 'number', 'km'), C('type', 'Type', 'text', '', { choices: ['public', 'contracted', 'private'] }), C('free_seats', 'Free seats'), C('occupancy', 'Occupancy', 'number', '', { pct: true }), C('cost_multiplier', 'Cost multiplier', 'number', '×'), C('quality', 'Quality'),
      ...SERV.map(([id, l]) => C(id, l, 'yesno')),
      F('nearness', 'Nearness', 'exp(-distance_km / lambda)', { note: 'Points fade with distance. Distance decay sets how fast.' }),
      F('spare', 'Spare room', '1 - occupancy ^ 3', { note: 'Stays high until a place is nearly full.' })];
    const r1 = x => Math.round(x * 10) / 10;
    const data = FAC.map(([id, label, type, x, y, cap, load, m, q, svc]) => {
      const s = svc.split(' ');
      const v = { distance_km: r1(Math.hypot(34 - x, 30 - y) * 1.3), type, free_seats: cap - load, occupancy: Math.round(load / cap * 10000) / 10000, cost_multiplier: m, quality: q };
      SERV.forEach(([k]) => { v[k] = s.includes(k); });
      return { id, label, v };
    });
    return {
      name: 'Care routing', question: 'Where should this patient go?', method: 'add',
      about: 'Route a patient to the best facility. Must-haves check services and reach; the score balances distance, cost and spare room.',
      columns, rows: data,
      knobs: [K('lambda', 'Distance decay', 40, 1, 200, 1, '', 'km', 'Bigger means distance matters less.'), K('reach', 'Reach', 60, 10, 150, 1, '', 'km', 'Furthest a patient can be sent.'), K('urgency', 'Urgency', 0, 0, 2, 1, '', '', '0 routine, 1 soon, 2 urgent. Urgent cuts the reach.')],
      rules: [R('g1', 'Has a free seat', 'free_seats >= 1'), R('g2', 'Within reach', 'distance_km <= reach * (1 - 0.15 * urgency)'), R('g3', 'Offers cardiology', 'cardio'), R('g4', 'Offers lab work', 'lab')],
      criteria: [
        W('distance', 'nearness', 6.5, { range: fixed(0, 1) }),
        W('cost', 'cost_multiplier', 4, { want: 'less', range: fixed(0.9, 2.8) }),
        W('public_first', 'type', 5.5, { points: { public: 10, contracted: 5.5, private: 2.5 } }),
        W('spare', 'spare', 5, { range: fixed(0, 1) }),
        W('quality_c', 'quality', 4, { range: fixed(0, 1) })],
      scenarios: [{ id: 's1', label: 'Routine', values: { urgency: 0 } }, { id: 's2', label: 'Urgent', values: { urgency: 2 } }, { id: 's3', label: 'Rural patient', values: { reach: 120, lambda: 90 } }],
      guide: { level: 'Settings', teaches: 'Yes/no must-haves, decay formulas, public-first points', steps: [
        S('rules', 'rule:g3', 'Needs the right service', 'The patient needs cardiology and lab work. Places without them are ruled out.', 'Switch off Offers cardiology and see who comes back.'),
        S('formulas', 'col:nearness', 'Distance that fades', 'Nearness = exp(−distance ÷ decay). Close places get nearly full points, far ones fade smoothly.'),
        S('matters', 'crit:public_first', 'Public first', 'Public places earn 10 points, contracted 5.5, private 2.5. Change these to match your policy.'),
        S('matters', 'situations', 'Urgent cases', 'Urgent shrinks the reach, so far-away places drop out.', 'Click Urgent.')
      ] }
    };
  }

  const list = [
    { id: 'pharmacy', make: pharmacy }, { id: 'feed', make: feed }, { id: 'venue', make: venue }, { id: 'cafe', make: cafe }, { id: 'care', make: care }];
  list.forEach(e => M.examples.push(e));
})(window.M);
