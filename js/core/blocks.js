window.M = window.M || {};
(function (M) {
  'use strict';
  const B = (group, id, label, line, expr, inputs, out) => ({ group, id, label, line, expr, inputs, out });
  const I = (key, label, hint, guess) => ({ key, label, hint, guess: guess || [] });

  const LIST = [
    B('Queues', 'util', 'Utilisation', 'How busy the servers are. Above 100% the line grows forever; above about 85% waits climb fast.',
      '{lam} / ({c} * {mu})', [I('lam', 'Arrivals per unit of time', 'e.g. customers per hour', ['lam', 'rx_hr', 'arrivals', 'peak_rps']), I('mu', 'Served per server per unit of time', 'same time unit as arrivals', ['mu', 'service_rate']), I('c', 'Servers open', 'windows, lanes, agents', ['seats', 'windows', 'lanes', 'servers'])],
      { id: 'utilisation', label: 'Utilisation', unit: '', format: 'pct' }),
    B('Queues', 'pwait', 'Chance of waiting', 'Erlang C: the chance a newcomer finds every server busy.',
      'erlangc({lam}, {mu}, {c})', [I('lam', 'Arrivals per unit of time', '', ['lam']), I('mu', 'Served per server per unit of time', '', ['mu']), I('c', 'Servers open', '', ['seats', 'lanes'])],
      { id: 'p_wait', label: 'Chance of waiting', unit: '', format: 'pct' }),
    B('Queues', 'wq', 'Average wait in line', 'M/M/c queue: the average time spent waiting before service starts. Uses the same time unit as the rates. Infinite when demand exceeds capacity.',
      'wait({lam}, {mu}, {c})', [I('lam', 'Arrivals per unit of time', '', ['lam']), I('mu', 'Served per server per unit of time', '', ['mu']), I('c', 'Servers open', '', ['seats', 'lanes'])],
      { id: 'wait_line', label: 'Wait in line', unit: 'min', format: 'num' }),
    B('Queues', 'sla', 'Served within a target', 'Share of people whose wait is shorter than the target time.',
      'within({lam}, {mu}, {c}, {t})', [I('lam', 'Arrivals per unit of time', '', ['lam']), I('mu', 'Served per server per unit of time', '', ['mu']), I('c', 'Servers open', '', ['seats', 'lanes']), I('t', 'Target wait', 'same time unit', ['target_min', 'sla_min'])],
      { id: 'within_target', label: 'Served within target', unit: '', format: 'pct' }),
    B('Queues', 'little', 'People in line', 'Little’s law: people waiting = arrival rate × average wait.',
      '{lam} * {w}', [I('lam', 'Arrivals per unit of time', '', ['lam']), I('w', 'Average wait', 'same time unit', ['wait_line'])],
      { id: 'queue_len', label: 'People in line', unit: 'people', format: 'num' }),
    B('Queues', 'rate', 'Service rate from task time', 'Turns minutes per task into tasks per hour for one person, scaled by their speed.',
      '60 / {minutes} * {speed}', [I('minutes', 'Minutes per task', 'for an average person', ['t_fill', 'task_min']), I('speed', 'Speed', '1 = average, 1.2 = 20% faster', ['1'])],
      { id: 'per_hour', label: 'Tasks per hour', unit: '/h', format: 'num' }),

    B('Staffing', 'presence', 'Presence share', 'How much of the opening time a person is actually there: part of the day × days per week.',
      '{day} * {days} / {open}', [I('day', 'Share of the day', '1 = full day, 0.5 = half', ['day_']), I('days', 'Days per week', '', ['days_']), I('open', 'Days you are open', '', ['open_days', '6'])],
      { id: 'presence', label: 'Presence', unit: '', format: 'pct' }),
    B('Staffing', 'speed', 'Speed under pressure', 'Blends normal speed with peak speed. Pressure 0 is a calm hour, 1 is the worst rush.',
      '{speed} * (1 - {pressure} * (1 - {kept}))', [I('speed', 'Normal speed', '1 = average', ['sp_']), I('pressure', 'Pressure', '0 to 1', ['peak', 'pressure']), I('kept', 'Speed kept at peak', '0.8 = 20% slower', ['pk_'])],
      { id: 'speed_now', label: 'Speed now', unit: '×', format: 'num' }),
    B('Staffing', 'accuracy', 'Accuracy under pressure', 'Blends normal accuracy with accuracy in a rush.',
      '{acc} - {pressure} * ({acc} - {acc_peak})', [I('acc', 'Normal accuracy', '0.99 = 1 slip in 100', ['ac_']), I('pressure', 'Pressure', '0 to 1', ['peak']), I('acc_peak', 'Accuracy in a rush', '', ['ap_'])],
      { id: 'accuracy_now', label: 'Accuracy now', unit: '', format: 'pct' }),
    B('Staffing', 'juggle', 'Juggling cost', 'Doing several task types at once costs switching time on every item. Dedicated people avoid it.',
      '{base} + {extra} * {switch}', [I('base', 'Minutes for the main task', '', ['t_fill']), I('extra', 'Extra task types juggled', 'count', ['jugg']), I('switch', 'Minutes lost per switch', '', ['t_switch'])],
      { id: 'task_min', label: 'Minutes per item', unit: 'min', format: 'num' }),
    B('Staffing', 'crowd', 'Crowded counter', 'More people than windows: the extras only help a little (fetching, checking). 3 people on 2 windows is not 3 on 3.',
      'if({people} <= {windows}, {speed}, {speed} * ({windows} + {help} * ({people} - {windows})) / max({people}, 1))',
      [I('people', 'People assigned', '', ['n_win']), I('windows', 'Windows open', '', ['windows']), I('speed', 'Their combined speed', '', ['eff_win']), I('help', 'Value of an extra person', '0 none, 1 full', ['help'])],
      { id: 'pooled', label: 'Useful speed', unit: '×', format: 'num' }),
    B('Staffing', 'bottleneck', 'Bottleneck', 'A chain is only as fast as its slowest step.',
      'min({a}, {b})', [I('a', 'Capacity of step 1', '', []), I('b', 'Capacity of step 2', '', [])],
      { id: 'bottleneck', label: 'Bottleneck', unit: '/h', format: 'num' }),

    B('Capacity', 'rps', 'Requests per second', 'Average load from daily users.',
      '{users} * {per_user} / 86400', [I('users', 'Daily active users', '', ['dau_users', 'dau']), I('per_user', 'Requests per user per day', '', ['req_user'])],
      { id: 'avg_rps', label: 'Average load', unit: 'req/s', format: 'num' }),
    B('Capacity', 'peak', 'Peak load', 'Busy-hour load: average × peak factor.',
      '{avg} * {factor}', [I('avg', 'Average load', '', ['avg_rps']), I('factor', 'Peak factor', '3 = three times the average', ['peak_factor'])],
      { id: 'peak_load', label: 'Peak load', unit: 'req/s', format: 'num' }),
    B('Capacity', 'cache', 'Load after the cache', 'Only misses reach the database.',
      '{load} * (1 - {hit})', [I('load', 'Load before the cache', '', ['reads']), I('hit', 'Cache hit rate', '0 to 1', ['hit'])],
      { id: 'db_load', label: 'Load after cache', unit: 'req/s', format: 'num' }),
    B('Capacity', 'headroom', 'Headroom', 'Capacity ÷ load. Under 1 means it falls over at peak.',
      '{cap} / {load}', [I('cap', 'Capacity', '', ['app_cap']), I('load', 'Load', '', ['peak_rps'])],
      { id: 'headroom', label: 'Headroom', unit: '×', format: 'num' }),
    B('Capacity', 'runway', 'Growth runway', 'How many periods of growth before headroom runs out.',
      'runway({headroom}, {growth})', [I('headroom', 'Headroom', '', ['headroom']), I('growth', 'Growth per period', '0.08 = 8%', ['growth'])],
      { id: 'runway', label: 'Runway', unit: 'months', format: 'num' }),
    B('Capacity', 'fanout', 'Fan-out writes', 'One post copied into every follower’s timeline.',
      '{writes} * {followers}', [I('writes', 'Posts per second', '', ['writes']), I('followers', 'Followers per post', '', ['followers'])],
      { id: 'fanout_writes', label: 'Timeline writes', unit: 'ops/s', format: 'num' }),

    B('Reliability', 'avail', 'Availability with copies', 'Chance at least one of n independent copies is up.',
      'avail({p}, {n})', [I('p', 'Uptime of one copy', '0.995', ['node_up']), I('n', 'Number of copies', '', ['replicas'])],
      { id: 'availability', label: 'Availability', unit: '', format: 'pct' }),
    B('Reliability', 'downtime', 'Downtime per month', 'Minutes down in a 30-day month.',
      '(1 - {a}) * 43200', [I('a', 'Availability', '', ['availability'])],
      { id: 'downtime', label: 'Downtime', unit: 'min/mo', format: 'num' }),
    B('Reliability', 'rpo', 'Data you could lose', 'On average you lose half the time between backups.',
      '{interval} / 2', [I('interval', 'Minutes between backups', '', ['backup_min'])],
      { id: 'loss_window', label: 'Data loss window', unit: 'min', format: 'num' }),

    B('Crowds', 'density', 'Crowd density', 'People per square metre. Around 2 is crowded, above 4 is dangerous.',
      '{people} / {area}', [I('people', 'People', '', ['attendees']), I('area', 'Usable area (m²)', '', ['area_m2'])],
      { id: 'density', label: 'Density', unit: 'p/m²', format: 'num' }),
    B('Crowds', 'evac', 'Time to clear', 'People ÷ (exit width × flow per metre) + walking time.',
      '{people} / ({width} * {flow}) + {walk}', [I('people', 'People', '', ['attendees']), I('width', 'Total exit width (m)', '', ['exit_m']), I('flow', 'Flow per metre per minute', 'about 60–80', ['flow']), I('walk', 'Walking time (min)', '', ['walk_min'])],
      { id: 'clear_min', label: 'Time to clear', unit: 'min', format: 'num' }),
    B('Crowds', 'arrivals', 'Arrival rate at the gate', 'Share of people arriving in the busiest window, per minute.',
      '{people} * {share} / {window}', [I('people', 'People', '', ['attendees']), I('share', 'Share arriving in the rush', '', ['rush_share']), I('window', 'Rush length (min)', '', ['rush_min'])],
      { id: 'arrive_min', label: 'Arrivals', unit: '/min', format: 'num' }),

    B('Money', 'per_unit', 'Cost per unit', 'Spread a cost over what it serves.',
      '{cost} / {units}', [I('cost', 'Cost', '', ['cost']), I('units', 'Units served', '', [])],
      { id: 'cost_per', label: 'Cost per unit', unit: '$', format: 'num' }),
    B('Money', 'payback', 'Payback time', 'Months until savings cover an upfront cost.',
      '{upfront} / max({saving}, 0.0001)', [I('upfront', 'Upfront cost', '', []), I('saving', 'Saving per month', '', [])],
      { id: 'payback', label: 'Payback', unit: 'months', format: 'num' })
  ];
  const GROUPS = ['Queues', 'Staffing', 'Capacity', 'Reliability', 'Crowds', 'Money'];

  function guessFor(inp, names) {
    for (const g of inp.guess) {
      if (/^[0-9.]+$/.test(g)) return g;
      if (names.includes(g)) return g;
      const pre = names.find(n => g.endsWith('_') && n.startsWith(g));
      if (pre) return pre;
    }
    return '';
  }
  function build(block, vals) {
    let ok = true;
    const expr = block.expr.replace(/\{(\w+)\}/g, (m, k) => {
      const v = String(vals[k] ?? '').trim();
      if (!v) { ok = false; return '?'; }
      return /^[A-Za-z_][A-Za-z0-9_]*$|^-?[0-9.]+$/.test(v) ? v : '(' + v + ')';
    });
    return { expr, ok };
  }
  M.blocks = { LIST, GROUPS, get: id => LIST.find(b => b.id === id), guessFor, build };
})(window.M);
