window.M = window.M || {};
(function (M) {
  'use strict';
  const T = M.tpl = M.tpl || {};
  const P = (id, label, value, min, max, step, group, unit, help) => ({ id, label, value, min, max, step, group, unit: unit || '', help: help || '' });
  const K = (id, label, expr, o) => Object.assign({ id, label, expr, unit: '', format: 'num', group: '', pin: false, note: '' }, o || {});
  const sh = o => Object.assign({ type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} }, o || {});
  const C = (id, label, weight, source, o) => Object.assign({ id, label, enabled: true, weight, source, direction: 'higher', range: { auto: true, lo: null, hi: null }, missing: 'worst', noise: 0, shape: sh() }, o || {}, { shape: sh((o || {}).shape) });
  const fixed = (lo, hi) => ({ auto: false, lo, hi });
  const rowsFrom = (cols, lines) => lines.map(l => { const [id, label, ...vals] = l; const v = {}; cols.forEach((c, i) => { v[c.id] = vals[i]; }); return { id, label, v }; });

  function feed() {
    const columns = [
      { id: 'server', label: 'App servers', type: 'category', unit: '' },
      { id: 'nodes', label: 'App nodes', type: 'number', unit: '' },
      { id: 'cache', label: 'Cache', type: 'category', unit: '' },
      { id: 'db', label: 'Database', type: 'category', unit: '' },
      { id: 'replicas', label: 'Read replicas', type: 'number', unit: '' },
      { id: 'shards', label: 'Write shards', type: 'number', unit: '' },
      { id: 'fanout', label: 'Feed build', type: 'category', unit: '' },
      { id: 'backup_min', label: 'Backup every', type: 'number', unit: 'min' },
      { id: 'regions', label: 'Regions', type: 'number', unit: '' }];
    const rows = rowsFrom(columns, [
      ['a1', 'Starter monolith', 'vm', 2, 'none', 'postgres', 0, 1, 'pull', 1440, 1],
      ['a2', 'Monolith + Redis', 'vm', 4, 'redis', 'postgres', 2, 1, 'pull', 60, 1],
      ['a3', 'Containers + Redis + replicas', 'containers', 8, 'redis', 'postgres', 4, 1, 'hybrid', 15, 1],
      ['a4', 'Sharded Postgres, push feed', 'containers', 16, 'redis', 'postgres', 4, 6, 'push', 15, 1],
      ['a5', 'Cassandra timelines', 'containers', 12, 'memcached', 'cassandra', 2, 6, 'push', 5, 2],
      ['a6', 'Serverless + DynamoDB', 'serverless', 0, 'dax', 'dynamo', 0, 8, 'hybrid', 5, 2],
      ['a7', 'Big iron, one region', 'bare', 4, 'redis', 'postgres', 6, 1, 'pull', 60, 1],
      ['a8', 'Multi-region hybrid', 'containers', 20, 'redis', 'cassandra', 4, 8, 'hybrid', 5, 3]]);
    const params = [
      P('dau', 'Daily active users', 2, 0.05, 50, 0.05, 'Traffic', 'M'),
      P('req_user', 'Requests per user per day', 120, 20, 600, 10, 'Traffic', '', 'Feed loads, likes, profile views, posts.'),
      P('read_share', 'Share of requests that are reads', 0.92, 0.5, 0.995, 0.005, 'Traffic', '', 'A news feed is about 90–98% reads. A chat app is closer to 50–70%.'),
      P('peak_factor', 'Peak hour vs average', 3, 1, 8, 0.5, 'Traffic', '×', 'Evening peak, a live event or a viral post.'),
      P('followers', 'Average followers per poster', 150, 10, 2000, 10, 'Traffic', '', 'Push feeds copy each post into this many timelines.'),
      P('post_share', 'Share of writes that are posts', 0.1, 0.02, 0.6, 0.01, 'Traffic', '', 'The rest are likes, comments and reads-marked.'),
      P('growth', 'Growth per month', 0.08, 0, 0.4, 0.01, 'Traffic', '', 'Users grow by this much every month.'),
      P('growth_cap', 'Required runway', 6, 1, 36, 1, 'Goals', 'months', 'Architectures that run out of room sooner are ruled out.'),
      P('max_loss', 'Most data you can lose', 60, 1, 1440, 1, 'Goals', 'min', 'Recovery point objective: worst-case minutes of writes lost in a crash.'),
      P('budget', 'Monthly budget', 60, 2, 200, 1, 'Goals', 'k$'),
      P('node_up', 'Uptime of one machine', 0.995, 0.95, 0.9999, 0.0005, 'Assumptions', '')];
    const pick = (col, pairs, dflt) => `pick(${col}, ${pairs.map(([k, v]) => `"${k}", ${v}`).join(', ')}, ${dflt})`;
    const calcs = [
      K('avg_rps', 'Average load', 'dau * 1000000 * req_user / 86400', { group: 'Load', unit: 'req/s' }),
      K('peak_rps', 'Peak load', 'avg_rps * peak_factor', { group: 'Load', unit: 'req/s', pin: true }),
      K('reads', 'Peak reads', 'peak_rps * read_share', { group: 'Load', unit: 'req/s' }),
      K('writes', 'Peak writes', 'peak_rps * (1 - read_share)', { group: 'Load', unit: 'req/s' }),
      K('fan', 'Timeline copies per post', pick('fanout', [['push', 'followers'], ['hybrid', 'followers * 0.3'], ['pull', 0]], 0), { group: 'Load', note: 'Push copies every post to every follower. Hybrid skips big accounts. Pull builds the feed on read.' }),
      K('read_cost', 'DB reads per feed read', pick('fanout', [['push', 1], ['hybrid', 3], ['pull', 12]], 1), { group: 'Load', note: 'Pull merges many timelines on every read.' }),
      K('hit', 'Cache hit rate', pick('cache', [['none', 0], ['memcached', 0.85], ['redis', 0.9], ['dax', 0.88]], 0), { group: 'Cache', format: 'pct' }),
      K('db_reads', 'Reads reaching the DB', 'reads * read_cost * (1 - hit)', { group: 'Database', unit: 'ops/s' }),
      K('db_writes', 'Writes reaching the DB', 'writes * (1 + post_share * fan)', { group: 'Database', unit: 'ops/s', note: 'Every write, plus timeline copies for posts.' }),
      K('node_rps', 'Requests one app node handles', pick('server', [['vm', 900], ['containers', 1200], ['bare', 4000], ['serverless', 0]], 1000), { group: 'App', unit: 'req/s' }),
      K('app_cap', 'App capacity', 'if(server == "serverless", 1000000, nodes * node_rps)', { group: 'App', unit: 'req/s', note: 'Serverless scales out on its own, up to account limits.' }),
      K('read_node', 'Reads one DB node serves', pick('db', [['postgres', 6000], ['cassandra', 9000], ['dynamo', 40000]], 5000), { group: 'Database', unit: 'ops/s' }),
      K('write_node', 'Writes one DB shard takes', pick('db', [['postgres', 4000], ['cassandra', 12000], ['dynamo', 25000]], 2000), { group: 'Database', unit: 'ops/s' }),
      K('read_cap', 'DB read capacity', 'read_node * (1 + replicas) * shards', { group: 'Database', unit: 'ops/s' }),
      K('write_cap', 'DB write capacity', 'write_node * shards', { group: 'Database', unit: 'ops/s' }),
      K('headroom', 'Headroom at peak', 'min(app_cap / peak_rps, read_cap / max(db_reads, 1), write_cap / max(db_writes, 1))', { group: 'Result', unit: '×', pin: true, note: 'The tightest of app, DB reads and DB writes. Under 1 means it falls over at peak.' }),
      K('limit', 'What runs out first', 'if(app_cap / peak_rps <= min(read_cap / max(db_reads, 1), write_cap / max(db_writes, 1)), "app", if(read_cap / max(db_reads, 1) <= write_cap / max(db_writes, 1), "db reads", "db writes"))', { group: 'Result' }),
      K('runway', 'Growth runway', 'runway(headroom, growth)', { group: 'Result', unit: 'months', pin: true }),
      K('copies', 'Copies of the data', 'if(db == "postgres", 1 + replicas, 3) * regions', { group: 'Reliability' }),
      K('availability', 'Availability', 'avail(node_up, min(copies, 6)) * avail(node_up, if(server == "serverless", 6, max(nodes, 1))) * if(regions > 1, 1, 0.9995)', { group: 'Reliability', format: 'pct', note: 'Both the app tier and the data tier must be up. One region also carries a small region-wide risk.' }),
      K('downtime', 'Downtime per month', '(1 - availability) * 43200', { group: 'Result', unit: 'min/mo', pin: true }),
      K('loss', 'Data you could lose', 'if(db == "postgres" && replicas == 0, backup_min, if(db == "postgres", 1, 0.1))', { group: 'Reliability', unit: 'min', note: 'With replicas or a replicated store, a crash loses seconds, not the backup interval.' }),
      K('latency', 'Typical feed read', '8 + (1 - hit) * read_cost * 4 + if(regions > 1, 0, 35)', { group: 'Result', unit: 'ms', note: 'Rough model: base + cache misses × DB reads + distance for far users.' }),
      K('cost', 'Monthly cost', `(${pick('server', [['vm', 0.25], ['containers', 0.3], ['bare', 1.1], ['serverless', 0]], 0.3)}) * nodes + if(server == "serverless", peak_rps * 0.004, 0) + ${pick('db', [['postgres', 1.2], ['cassandra', 1.6], ['dynamo', 0]], 1)} * (1 + replicas) * shards + if(db == "dynamo", (db_reads * 0.0006 + db_writes * 0.003), 0) + ${pick('cache', [['none', 0], ['memcached', 0.8], ['redis', 1], ['dax', 1.3]], 0)} * regions + 0.02 * regions * 1440 / backup_min`, { group: 'Result', unit: 'k$', pin: true, note: 'Illustrative prices. Put your own in.' })];
    return {
      version: 1, name: 'News feed backend', columns, rows, params, calcs,
      note: 'Eight architectures for a social feed, scored against your traffic. Move users, the read/write mix or the peak and watch which layer breaks first. Scenarios compare launch, a viral month and a write-heavy (chat-like) product.',
      gates: [
        { id: 'g1', label: 'Survives the peak', expr: 'headroom >= 1', enabled: true, simple: null },
        { id: 'g2', label: 'Enough runway', expr: 'runway >= growth_cap', enabled: true, simple: null },
        { id: 'g3', label: 'Data loss within limit', expr: 'loss <= max_loss', enabled: true, simple: null },
        { id: 'g4', label: 'Within budget', expr: 'cost <= budget', enabled: true, simple: null }],
      criteria: [
        C('c_cost', 'Cost', 30, { kind: 'calc', calc: 'cost' }, { direction: 'lower', range: fixed(0, 60), shape: { type: 'curve', k: 0.8 } }),
        C('c_room', 'Room to grow', 25, { kind: 'calc', calc: 'runway' }, { range: fixed(0, 48), shape: { type: 'curve', k: 0.6 } }),
        C('c_up', 'Uptime', 20, { kind: 'calc', calc: 'downtime' }, { direction: 'lower', range: fixed(0, 30), shape: { type: 'curve', k: 2 } }),
        C('c_fast', 'Fast feed', 15, { kind: 'calc', calc: 'latency' }, { direction: 'lower', range: fixed(8, 90) }),
        C('c_ops', 'Easy to run', 10, { kind: 'column', column: 'db' }, { shape: { type: 'map', map: { postgres: 0.9, cassandra: 0.35, dynamo: 0.75 } } })],
      combine: { type: 'sum', expr: '' },
      stress: ['dau', 'read_share', 'peak_factor'],
      scenarios: [
        { id: 's1', label: 'Launch', values: { dau: 0.2, growth: 0.2 } },
        { id: 's2', label: 'Today', values: {} },
        { id: 's3', label: 'Viral month', values: { dau: 8, peak_factor: 5 } },
        { id: 's4', label: 'Write-heavy (chat)', values: { read_share: 0.6, followers: 20 } },
        { id: 's5', label: 'Tight budget', values: { budget: 20 } }]
    };
  }

  function venue() {
    const columns = [
      { id: 'gates', label: 'Entry gates', type: 'number', unit: '' },
      { id: 'lanes', label: 'Lanes per gate', type: 'number', unit: '' },
      { id: 'screen_s', label: 'Screening time', type: 'number', unit: 's' },
      { id: 'exit_m', label: 'Exit width', type: 'number', unit: 'm' },
      { id: 'area_m2', label: 'Standing area', type: 'number', unit: 'm²' },
      { id: 'stewards', label: 'Stewards', type: 'number', unit: '' },
      { id: 'timed', label: 'Timed entry', type: 'boolean', unit: '' }];
    const rows = rowsFrom(columns, [
      ['v1', 'Two gates, bag check', 2, 4, 14, 22, 3200, 30, false],
      ['v2', 'Three gates, bag check', 3, 4, 14, 22, 3200, 36, false],
      ['v3', 'Three gates, no-bag policy', 3, 4, 7, 22, 3200, 36, false],
      ['v4', 'Four gates, timed entry', 4, 3, 12, 24, 3200, 38, true],
      ['v5', 'Open the side field', 3, 5, 12, 30, 4600, 44, false],
      ['v6', 'Bare minimum', 2, 3, 14, 16, 3200, 14, false],
      ['v7', 'Five gates, express lanes', 5, 4, 9, 28, 3800, 48, true]]);
    const params = [
      P('attendees', 'Attendees', 9000, 1000, 20000, 250, 'The event', 'people'),
      P('rush_share', 'Share arriving in the rush', 0.35, 0.2, 0.9, 0.05, 'The event', '', 'Share of the crowd that turns up in the busiest window. Timed entry cuts it by a third.'),
      P('rush_min', 'Rush length', 60, 15, 120, 5, 'The event', 'min'),
      P('flow', 'Exit flow per metre', 70, 40, 90, 1, 'Safety', 'p/m/min', 'People per metre of exit width per minute. 60–80 is a common planning value.'),
      P('walk_min', 'Walk to the exits', 2, 0.5, 6, 0.5, 'Safety', 'min'),
      P('max_clear', 'Most time to clear', 8, 4, 15, 0.5, 'Safety', 'min', 'Emergency clearance target.'),
      P('max_density', 'Highest safe density', 4, 2, 5, 0.25, 'Safety', 'p/m²'),
      P('target_q', 'Acceptable wait at the gate', 10, 2, 30, 1, 'Comfort', 'min'),
      P('steward_ratio', 'People per steward', 250, 100, 500, 10, 'Safety', '', 'A common guide is one steward per 250 people.'),
      P('steward_cost', 'Cost per steward', 180, 80, 400, 10, 'Money', '$')];
    const calcs = [
      K('lam', 'Arrivals per minute', 'attendees * rush_share * if(timed, 0.67, 1) / rush_min', { group: 'Entry', unit: '/min' }),
      K('lanes_open', 'Lanes open', 'gates * lanes', { group: 'Entry' }),
      K('mu', 'People per lane per minute', '60 / screen_s', { group: 'Entry', unit: '/min' }),
      K('util', 'Lane load', 'lam / (lanes_open * mu)', { group: 'Result', format: 'pct', pin: true }),
      K('wq', 'Average wait at the gate', 'wait(lam, mu, lanes_open)', { group: 'Result', unit: 'min', pin: true }),
      K('in_line', 'People queuing outside', 'lam * wq', { group: 'Entry', unit: 'people', note: 'Little’s law.' }),
      K('density', 'Density inside', 'attendees / area_m2', { group: 'Result', unit: 'p/m²', pin: true }),
      K('clear_min', 'Time to clear', 'attendees / (exit_m * flow) + walk_min', { group: 'Result', unit: 'min', pin: true }),
      K('steward_gap', 'Steward cover', 'stewards * steward_ratio / attendees', { group: 'Safety', format: 'pct', note: 'Above 100% meets the guide.' }),
      K('cost', 'Staff cost', 'stewards * steward_cost + lanes_open * 120', { group: 'Result', unit: '$' })];
    return {
      version: 1, name: 'Event crowd control', columns, rows, params, calcs,
      note: 'Seven entry and layout plans for one event. Hard safety rules (clearance time, density, steward cover) come first. Comfort and cost only rank the plans that are safe.',
      gates: [
        { id: 'g1', label: 'Clears in time', expr: 'clear_min <= max_clear', enabled: true, simple: null },
        { id: 'g2', label: 'Density is safe', expr: 'density <= max_density', enabled: true, simple: null },
        { id: 'g3', label: 'Lanes keep up', expr: 'util < 1', enabled: true, simple: null },
        { id: 'g4', label: 'Enough stewards', expr: 'steward_gap >= 1', enabled: true, simple: null }],
      criteria: [
        C('c_wait', 'Short gate wait', 35, { kind: 'calc', calc: 'wq' }, { direction: 'lower', range: fixed(0, 30), shape: { type: 'scurve', a: 8, c: 0.35 } }),
        C('c_margin', 'Safety margin', 30, { kind: 'calc', calc: 'clear_min' }, { direction: 'lower', range: fixed(3, 10) }),
        C('c_room', 'Room to move', 15, { kind: 'calc', calc: 'density' }, { direction: 'lower', range: fixed(1, 4) }),
        C('c_cost', 'Cost', 20, { kind: 'calc', calc: 'cost' }, { direction: 'lower' })],
      combine: { type: 'sum', expr: '' },
      stress: ['attendees', 'rush_share', 'rush_min'],
      scenarios: [
        { id: 's1', label: 'Half full', values: { attendees: 4500 } },
        { id: 's2', label: 'Sold out', values: {} },
        { id: 's3', label: 'Late surge', values: { rush_share: 0.5, rush_min: 40 } },
        { id: 's4', label: 'Rain, slow exits', values: { flow: 55, walk_min: 3 } }]
    };
  }

  function cafe() {
    const columns = [
      { id: 'registers', label: 'Registers', type: 'number', unit: '' },
      { id: 'baristas', label: 'Baristas', type: 'number', unit: '' },
      { id: 'mobile', label: 'Mobile ordering', type: 'boolean', unit: '' },
      { id: 'wage', label: 'Wage bill', type: 'number', unit: '$/h' }];
    const rows = rowsFrom(columns, [
      ['c1', '1 register, 1 barista', 1, 1, false, 36], ['c2', '1 register, 2 baristas', 1, 2, false, 54],
      ['c3', '2 registers, 2 baristas', 2, 2, false, 72], ['c4', '1 register, 2 baristas, app', 1, 2, true, 58],
      ['c5', '2 registers, 3 baristas', 2, 3, false, 90], ['c6', '1 register, 3 baristas, app', 1, 3, true, 76]]);
    const params = [
      P('lam', 'Customers per hour', 70, 10, 160, 5, 'The hour', '/h'),
      P('t_order', 'Minutes to take an order', 0.9, 0.3, 3, 0.1, 'The work', 'min'),
      P('t_drink', 'Minutes to make a drink', 1.6, 0.5, 5, 0.1, 'The work', 'min'),
      P('app_share', 'Orders through the app', 0.3, 0, 0.8, 0.05, 'The work', '', 'App orders skip the register.')];
    const calcs = [
      K('lam_reg', 'Customers at the register', 'lam * (1 - if(mobile, app_share, 0))', { group: 'Register', unit: '/h' }),
      K('w_reg', 'Wait to order', 'wait(lam_reg, 60 / t_order, registers) * 60', { group: 'Result', unit: 'min', pin: true }),
      K('w_bar', 'Wait for the drink', 'wait(lam, 60 / t_drink, baristas) * 60', { group: 'Result', unit: 'min', pin: true }),
      K('total', 'Total wait', 'w_reg + w_bar', { group: 'Result', unit: 'min', pin: true }),
      K('bottleneck', 'Bottleneck', 'if(lam_reg * t_order / registers >= lam * t_drink / baristas, "register", "bar")', { group: 'Result' })];
    return {
      version: 1, name: 'Coffee shop rush', columns, rows, params, calcs,
      note: 'The smallest queue model: two steps in a row (order, then drink). The slower step sets the wait. A good first template to learn calculations and knobs.',
      gates: [{ id: 'g1', label: 'Keeps up', expr: 'total < 60', enabled: true, simple: null }],
      criteria: [
        C('c_wait', 'Short wait', 60, { kind: 'calc', calc: 'total' }, { direction: 'lower', range: fixed(0, 15) }),
        C('c_cost', 'Wage bill', 40, { kind: 'column', column: 'wage' }, { direction: 'lower' })],
      combine: { type: 'sum', expr: '' },
      stress: ['lam'],
      scenarios: [
        { id: 's1', label: 'Quiet', values: { lam: 25 } }, { id: 's2', label: 'Morning rush', values: { lam: 70 } },
        { id: 's3', label: 'Commuter peak', values: { lam: 110 } }]
    };
  }

  T.feed = feed; T.venue = venue; T.cafe = cafe;
})(window.M);
