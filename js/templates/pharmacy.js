window.M = window.M || {};
(function (M) {
  'use strict';
  const T = M.tpl = M.tpl || {};
  const P = (id, label, value, min, max, step, group, unit, help) => ({ id, label, value, min, max, step, group, unit: unit || '', help: help || '' });
  const K = (id, label, expr, o) => Object.assign({ id, label, expr, unit: '', format: 'num', group: '', pin: false, note: '' }, o || {});

  const STAFF = [
    { id: 'maya', name: 'Maya', role: 'manager', sp: 1.25, pk: 0.85, ac: 0.995, ap: 0.985, day: 1, days: 6 },
    { id: 'omar', name: 'Omar', sp: 1.1, pk: 0.7, ac: 0.985, ap: 0.95, day: 1, days: 6 },
    { id: 'lina', name: 'Lina', sp: 0.9, pk: 0.95, ac: 0.997, ap: 0.994, day: 1, days: 5 },
    { id: 'sam', name: 'Sam', sp: 0.8, pk: 0.8, ac: 0.98, ap: 0.96, day: 0.5, days: 4 }];
  const ROLES = ['window', 'typing', 'records', 'back', 'off'];

  function pharmacy() {
    const params = [
      P('lam', 'Patients per hour', 30, 4, 60, 1, 'The hour', '/h', 'How many prescriptions arrive in the hour you are planning for.'),
      P('pressure', 'Pressure', 0.8, 0, 1, 0.05, 'The hour', '', '0 is a calm hour. 1 is the worst rush of the week. Each person slows down and slips more as it rises, by their own amounts.'),
      P('surge', 'Unexpected surge', 0, 0, 0.6, 0.05, 'The hour', '', 'Extra demand on top of the normal rate: a clinic next door lets out, a system outage clears, a bus arrives.'),
      P('windows', 'Teller windows', 3, 1, 5, 1, 'The pharmacy', '', 'Counters where a patient can be served. More pharmacists than windows only helps a little.'),
      P('open_days', 'Days open per week', 6, 5, 7, 1, 'The pharmacy', 'days'),
      P('help', 'Value of an extra person at a full counter', 0.3, 0, 1, 0.05, 'The pharmacy', '', '0: a third person at two windows adds nothing. 1: they add a full person. Fetching stock and double-checking is usually 0.2–0.4.'),
      P('t_fill', 'Minutes to fill a prescription', 2.5, 1, 6, 0.1, 'The work', 'min', 'For an average pharmacist on a calm day.'),
      P('q_miss', 'Share with missing items', 0.25, 0, 0.7, 0.01, 'The work', '', 'Share of patients whose prescription lacks an item, so the pharmacist types a new prescription for it.'),
      P('t_type', 'Minutes to type a missed-item prescription', 3, 1, 8, 0.1, 'The work', 'min'),
      P('t_record', 'Minutes to record a patient', 0.8, 0, 4, 0.1, 'The work', 'min', 'Logging the dispense in the records system. It can be done at the window between patients or by a dedicated person.'),
      P('t_switch', 'Minutes lost per task switch', 0.3, 0, 2, 0.05, 'The work', 'min', 'Each extra kind of task a window person juggles costs this much per patient.'),
      P('jug_err', 'Extra slips per task juggled', 0.004, 0, 0.02, 0.001, 'The work', '', 'Added error rate for every extra task type a window person carries.'),
      P('mgr_load', 'Manager time spent managing', 0.3, 0, 0.8, 0.05, 'The work', '', 'Share of Maya’s time lost to calls, suppliers and staff questions.'),
      P('target_min', 'Acceptable wait', 10, 2, 30, 1, 'The work', 'min')];
    STAFF.forEach(s => {
      const g = 'Team · ' + s.name + (s.role ? ' (manager)' : '');
      params.push(P('sp_' + s.id, 'Speed', s.sp, 0.4, 1.6, 0.05, g, '×', '1 = average pharmacist on a calm day.'));
      params.push(P('pk_' + s.id, 'Speed kept in a rush', s.pk, 0.4, 1, 0.01, g, '', '0.7 means 30% slower at full pressure.'));
      params.push(P('ac_' + s.id, 'Accuracy', s.ac, 0.9, 1, 0.001, g, '', '0.99 = one slip in 100 prescriptions.'));
      params.push(P('ap_' + s.id, 'Accuracy in a rush', s.ap, 0.85, 1, 0.001, g));
      params.push(P('day_' + s.id, 'Share of the day', s.day, 0, 1, 0.05, g, '', '1 = full day, 0.5 = half day, 0 = not in.'));
      params.push(P('days_' + s.id, 'Days per week', s.days, 0, 7, 1, g, 'days'));
    });

    const role = r => `role_${r}`;
    const sumIf = (test, term) => STAFF.map(s => `if(${test(s.id)}, ${term(s.id)}, 0)`).join(' + ');
    const isW = id => `${role(id)} == "window"`;
    const isT = id => `${role(id)} == "typing" || ${role(id)} == "back"`;
    const isR = id => `${role(id)} == "records" || ${role(id)} == "back"`;
    const isB = id => `${role(id)} == "back"`;
    const isBack = id => `${role(id)} == "typing" || ${role(id)} == "records" || ${role(id)} == "back"`;

    const calcs = [];
    STAFF.forEach(s => {
      const g = 'People';
      calcs.push(K('pres_' + s.id, s.name + ' presence', `day_${s.id} * days_${s.id} / open_days`, { group: g, format: 'pct', note: 'Share of opening hours this person is in.' }));
      calcs.push(K('e_' + s.id, s.name + ' effective speed', `sp_${s.id} * (1 - pressure * (1 - pk_${s.id})) * pres_${s.id}` + (s.role ? ' * (1 - mgr_load)' : ''), { group: g, unit: '×', note: 'Speed under the current pressure, times presence' + (s.role ? ', minus time spent managing.' : '.') }));
      calcs.push(K('a_' + s.id, s.name + ' accuracy now', `ac_${s.id} - pressure * (ac_${s.id} - ap_${s.id})`, { group: g, format: 'pct' }));
    });
    calcs.push(
      K('lam_eff', 'Patients arriving', 'lam * (1 + surge)', { group: 'Demand', unit: '/h' }),
      K('w_n', 'People at the windows', sumIf(isW, id => 'pres_' + id), { group: 'Windows', unit: 'people', note: 'Counted by presence, so a half-day person counts as a half.' }),
      K('w_sp', 'Window speed (sum)', sumIf(isW, id => 'e_' + id), { group: 'Windows', unit: '×' }),
      K('w_acc', 'Window accuracy', `(${sumIf(isW, id => `a_${id} * e_${id}`)}) / max(w_sp, 0.0001)`, { group: 'Windows', format: 'pct', note: 'Weighted by how many prescriptions each person handles.' }),
      K('t_sp', 'Typing speed (dedicated)', sumIf(isT, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      K('r_sp', 'Recording speed (dedicated)', sumIf(isR, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      K('bk_sp', 'Speed of people doing both', sumIf(isB, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      K('back_cap', 'Back-office speed (sum)', sumIf(isBack, id => 'e_' + id), { group: 'Back office', unit: '×' }),
      K('b_acc', 'Typing accuracy', `(${sumIf(isT, id => `a_${id} * e_${id}`)}) / max(t_sp, 0.0001)`, { group: 'Back office', format: 'pct' }),
      K('has_typ', 'Typing is dedicated', 't_sp > 0', { group: 'Back office', note: '1 if someone types missed-item prescriptions, so window staff don’t.' }),
      K('has_rec', 'Recording is dedicated', 'r_sp > 0', { group: 'Back office' }),
      K('jug', 'Extra tasks at the window', '(1 - has_typ) + (1 - has_rec)', { group: 'Windows', note: 'How many task types window staff juggle on top of filling: 0, 1 or 2.' }),
      K('m_win', 'Minutes per patient at a window', 't_fill + (1 - has_typ) * q_miss * t_type + (1 - has_rec) * t_record + jug * t_switch', { group: 'Windows', unit: 'min', note: 'Filling, plus whatever back-office work nobody else takes, plus switching cost.' }),
      K('pooled', 'Useful window speed', 'if(w_n <= windows, w_sp, w_sp * (windows + help * (w_n - windows)) / w_n)', { group: 'Windows', unit: '×', note: 'More people than windows: the extras only count for "help".' }),
      K('w_c', 'Windows in use', 'max(1, min(windows, ceil(w_n - 0.05)))', { group: 'Windows' }),
      K('mu', 'Patients per hour per window', '60 / m_win * pooled / w_c', { group: 'Windows', unit: '/h' }),
      K('util_win', 'Window load', 'lam_eff / (w_c * mu)', { group: 'Result', format: 'pct', pin: true, note: 'Above 100% the line never clears.' }),
      K('wait_min', 'Average wait', 'wait(lam_eff, mu, w_c) * 60', { group: 'Result', unit: 'min', pin: true, note: 'M/M/c queue. Infinite when the windows can’t keep up.' }),
      K('sla', 'Served within the acceptable wait', 'within(lam_eff, mu, w_c, target_min / 60)', { group: 'Result', format: 'pct' }),
      K('back_load', 'Back-office work', 'lam_eff * (has_typ * q_miss * t_type + has_rec * t_record + if(bk_sp > 0, t_switch, 0)) / 60', { group: 'Back office', unit: '×', note: 'Person-hours of typing and recording per hour.' }),
      K('back_util', 'Back-office load', 'if(back_cap > 0, back_load / back_cap, 0)', { group: 'Result', format: 'pct', pin: true, note: 'Typing and recording staff are pooled. Above 100% the records fall behind.' }),
      K('slips', 'Slips per 100 patients', '100 * ((1 - w_acc) + jug * jug_err + q_miss * (1 - if(has_typ, b_acc, w_acc)))', { group: 'Result', unit: '/100', pin: true }),
      K('busiest', 'Busiest station', 'max(util_win, back_util)', { group: 'Result', format: 'pct', note: 'Load on whichever station is busier. Above 90% for long leads to burnout and errors.' }));

    const columns = STAFF.map(s => ({ id: 'role_' + s.id, label: s.name + (s.role ? ' (mgr)' : ''), type: 'category', unit: '', choices: ROLES.slice() }));
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
    const rows = plans.map(([id, label, ...roles]) => { const v = {}; STAFF.forEach((s, i) => { v['role_' + s.id] = roles[i]; }); return { id, label, v }; });

    const fixed = (lo, hi) => ({ auto: false, lo, hi });
    const sh = o => Object.assign({ type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} }, o || {});
    const C = (id, label, weight, source, o) => Object.assign({ id, label, enabled: true, weight, source, direction: 'higher', range: { auto: true, lo: null, hi: null }, missing: 'worst', noise: 0, shape: sh() }, o || {}, { shape: sh((o || {}).shape) });
    return {
      version: 1, name: 'Pharmacy staffing plan', columns, rows, params, calcs,
      note: 'Each option is a way to split four people across three kinds of work: filling at a window, typing missed-item prescriptions and recording. Change the hour on the left, and the plans are re-scored with a queue model. Scenarios at the bottom show which plan to use in each part of the day.',
      gates: [
        { id: 'g1', label: 'Someone is at a window', expr: 'w_n > 0', enabled: true, simple: null },
        { id: 'g2', label: 'The windows keep up', expr: 'util_win < 1', enabled: true, simple: null },
        { id: 'g3', label: 'The back office keeps up', expr: 'back_util < 1', enabled: true, simple: null }],
      criteria: [
        C('wait', 'Short wait', 30, { kind: 'calc', calc: 'wait_min' }, { direction: 'lower', range: fixed(0, 15) }),
        C('ontime', 'Served on time', 15, { kind: 'calc', calc: 'sla' }, { range: fixed(0.5, 1) }),
        C('safety', 'Few slips', 25, { kind: 'calc', calc: 'slips' }, { direction: 'lower', range: fixed(2, 4.5) }),
        C('strain', 'No one overloaded', 15, { kind: 'calc', calc: 'busiest' }, { direction: 'lower', range: fixed(0.5, 1), shape: { type: 'curve', k: 1.6 } }),
        C('manager', 'Manager free to manage', 15, { kind: 'column', column: 'role_maya' }, { shape: { type: 'map', map: { off: 1, records: 0.75, back: 0.6, typing: 0.55, window: 0.25 } } })],
      combine: { type: 'sum', expr: '' },
      stress: ['lam', 'pressure', 'q_miss'],
      scenarios: [
        { id: 's1', label: 'Calm morning', values: { lam: 12, pressure: 0.1 } },
        { id: 's2', label: 'Midday', values: { lam: 22, pressure: 0.45 } },
        { id: 's3', label: 'Evening peak', values: { lam: 30, pressure: 0.8 } },
        { id: 's4', label: 'Peak + surprise', values: { lam: 30, pressure: 1, surge: 0.1 } },
        { id: 's5', label: 'Lina off (midday)', values: { lam: 22, pressure: 0.45, day_lina: 0 } },
        { id: 's6', label: 'Sam off (midday)', values: { lam: 22, pressure: 0.45, day_sam: 0 } }]
    };
  }
  T.pharmacy = pharmacy;
  T.ROLES = ROLES;
})(window.M);
