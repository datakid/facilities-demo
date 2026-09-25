/* Meridian Studio — starter models. Each is a plain Model object (see README). */
window.M = window.M || {};
(function (M) {
  'use strict';
  const rowsFrom = (cols, lines) => lines.map(l => {
    const [id, label, ...vals] = l; const v = {};
    cols.forEach((c, i) => { v[c.id] = vals[i]; });
    return { id, label, v };
  });
  const crit = (id, label, weight, opts) => Object.assign({
    id, label, enabled: true, weight, source: { kind: 'column', column: id }, direction: 'higher',
    range: { auto: true, lo: null, hi: null }, shape: { type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} }
  }, opts || {}, { shape: Object.assign({ type: 'linear', k: 2, a: 10, c: 0.5, width: 0.2, map: {} }, (opts || {}).shape || {}) });

  function blank() {
    const columns = [{ id: 'value', label: 'Value', type: 'number', unit: '' }];
    return { version: 1, name: 'Untitled model', columns,
      rows: rowsFrom(columns, [['r1', 'Option A', 1], ['r2', 'Option B', 2], ['r3', 'Option C', 3]]),
      params: [], gates: [], criteria: [], combine: { type: 'sum', expr: '' } };
  }

  function laptop() {
    const columns = [
      { id: 'price', label: 'Price', type: 'number', unit: '$' },
      { id: 'battery_h', label: 'Battery', type: 'number', unit: 'h' },
      { id: 'weight_kg', label: 'Weight', type: 'number', unit: 'kg' },
      { id: 'screen_nits', label: 'Screen', type: 'number', unit: 'nits' },
      { id: 'warranty_y', label: 'Warranty', type: 'number', unit: 'y' }];
    return { version: 1, name: 'Pick a laptop', columns,
      rows: rowsFrom(columns, [
        ['l1', 'Aster 13', 899, 14, 1.2, 400, 1], ['l2', 'Birch Pro 14', 1399, 18, 1.4, 500, 2],
        ['l3', 'Cobalt Air', 1099, 11, 1.0, 350, 1], ['l4', 'Dune 16', 1799, 9, 2.1, 600, 3],
        ['l5', 'Ember X', 749, 8, 1.6, 300, 1], ['l6', 'Fjord 14', 1249, 16, 1.3, 450, 2],
        ['l7', 'Garnet Book', 999, 12, 1.5, 400, 2], ['l8', 'Harbor Ultra', 1999, 20, 1.1, 550, 3]]),
      params: [],
      gates: [{ id: 'g1', label: 'Under budget', expr: 'price <= 1800', enabled: true, simple: { column: 'price', op: '<=', value: 1800 } }],
      criteria: [
        crit('price', 'Price', 30, { direction: 'lower' }), crit('battery_h', 'Battery', 25, { noise: 10 }), // DECISION: advertised battery life is fuzzy, so the starter shows the uncertainty feature
        crit('weight_kg', 'Weight', 20, { direction: 'lower', shape: { type: 'curve', k: 2 } }),
        crit('screen_nits', 'Screen', 15), crit('warranty_y', 'Warranty', 10)],
      combine: { type: 'sum', expr: '' } };
  }

  function jobs() {
    const columns = [
      { id: 'salary_k', label: 'Salary', type: 'number', unit: 'k' },
      { id: 'commute_min', label: 'Commute', type: 'number', unit: 'min' },
      { id: 'remote_days', label: 'Remote days', type: 'number', unit: '/wk' },
      { id: 'growth', label: 'Growth', type: 'number', unit: '/10' },
      { id: 'stage', label: 'Company stage', type: 'category', unit: '' },
      { id: 'visa', label: 'Sponsors visa', type: 'boolean', unit: '' }];
    return { version: 1, name: 'Choose a job offer', columns,
      rows: rowsFrom(columns, [
        ['j1', 'Northwind', 92, 45, 2, 6, 'enterprise', true], ['j2', 'Lumen Labs', 105, 20, 3, 8, 'startup', false],
        ['j3', 'Quarry & Co', 88, 10, 5, 5, 'scaleup', true], ['j4', 'Helio Health', 99, 35, 1, 7, 'enterprise', true],
        ['j5', 'Pinecone Studio', 80, 5, 4, 9, 'startup', true], ['j6', 'Tern Systems', 118, 60, 0, 6, 'scaleup', true]]),
      params: [],
      gates: [{ id: 'g1', label: 'Needs a visa', expr: 'visa == 1', enabled: true, simple: null }],
      criteria: [
        crit('salary_k', 'Salary', 30, { shape: { type: 'curve', k: 0.6 } }),
        crit('commute_min', 'Commute', 20, { direction: 'lower', shape: { type: 'scurve', a: 10, c: 0.5 } }),
        crit('remote_days', 'Remote', 15, { shape: { type: 'target', c: 0.6, width: 0.35 } }),
        crit('growth', 'Growth', 25),
        crit('stage', 'Stage', 10, { shape: { type: 'map', map: { startup: 0.5, scaleup: 1, enterprise: 0.7 } } })],
      combine: { type: 'sum', expr: '' } };
  }

  function features() {
    const columns = [
      { id: 'reach', label: 'Reach', type: 'number', unit: 'users/q' },
      { id: 'impact', label: 'Impact', type: 'number', unit: '0–3' },
      { id: 'confidence', label: 'Confidence', type: 'number', unit: '%' },
      { id: 'effort', label: 'Effort', type: 'number', unit: 'weeks' }];
    return { version: 1, name: 'Prioritize features', columns,
      rows: rowsFrom(columns, [
        ['f1', 'Bulk export', 1200, 1, 80, 2], ['f2', 'SSO login', 400, 3, 90, 5],
        ['f3', 'Dark mode', 3000, 0.5, 100, 1], ['f4', 'Offline sync', 900, 2, 50, 8],
        ['f5', 'Audit log', 250, 2, 80, 3], ['f6', 'Search filters', 2200, 1, 70, 2],
        ['f7', 'Mobile app', 2500, 2, 40, 12]]),
      params: [{ id: 'min_conf', label: 'Minimum confidence', value: 50, min: 0, max: 100, step: 5 }],
      gates: [{ id: 'g1', label: 'Confident enough', expr: 'confidence >= min_conf', enabled: true, simple: null }],
      criteria: [
        crit('rice', 'RICE', 60, { source: { kind: 'expr', expr: 'reach * impact * confidence / 100 / effort' }, shape: { type: 'curve', k: 0.5 } }),
        crit('reach', 'Reach', 15), crit('impact', 'Impact', 15),
        crit('effort', 'Effort', 10, { direction: 'lower' })],
      combine: { type: 'sum', expr: '' } };
  }

  // Ported verbatim from the original demo (docs/demo.html). Patient fixed in Sarema at x=34, y=30.
  const FACILITIES = [
    { id: 'sag', short: 'Sarema General', type: 'public', kind: 'hospital', x: 29, y: 27, cap: 60, load: 51, m: .95, q: .78, services: ['lab', 'xray', 'mri', 'cardio', 'dialysis', 'ortho', 'mater', 'peds', 'physio'] },
    { id: 'ntg', short: 'Northgate Teaching', type: 'public', kind: 'hospital', x: 88, y: 18, cap: 70, load: 44, m: 1, q: .86, services: ['lab', 'xray', 'mri', 'cardio', 'ortho', 'mater', 'peds', 'physio', 'onco'] },
    { id: 'krh', short: 'Kestrel Regional', type: 'public', kind: 'hospital', x: 66, y: 58, cap: 50, load: 21, m: .95, q: .74, services: ['lab', 'xray', 'mri', 'cardio', 'dialysis', 'ortho', 'mater', 'peds'] },
    { id: 'bfh', short: 'Bramble Ford HC', type: 'public', kind: 'clinic', x: 52, y: 42, cap: 24, load: 9, m: .9, q: .66, services: ['lab', 'xray', 'peds', 'mater', 'physio'] },
    { id: 'aru', short: 'Almond Row Unit', type: 'public', kind: 'clinic', x: 12, y: 16, cap: 14, load: 6, m: .9, q: .6, services: ['lab', 'peds', 'mater'] },
    { id: 'fcc', short: 'Fenwick Clinic', type: 'public', kind: 'clinic', x: 22, y: 56, cap: 18, load: 15, m: .9, q: .63, services: ['lab', 'xray', 'physio', 'peds'] },
    { id: 'lcu', short: 'Linden Care Unit', type: 'public', kind: 'clinic', x: 108, y: 46, cap: 16, load: 7, m: 1, q: .7, services: ['dialysis', 'lab', 'cardio'] },
    { id: 'pcu', short: 'Pebble Creek Unit', type: 'public', kind: 'clinic', x: 102, y: 70, cap: 16, load: 5, m: .9, q: .62, services: ['lab', 'xray', 'peds', 'mater', 'physio'] },
    { id: 'tdu', short: 'Thistledown Unit', type: 'public', kind: 'clinic', x: 52, y: 10, cap: 10, load: 3, m: .9, q: .58, services: ['lab', 'peds'] },
    { id: 'hhv', short: 'Harbor Heart', type: 'contracted', kind: 'hospital', x: 97, y: 27, cap: 30, load: 14, m: 1.5, q: .9, services: ['cardio', 'lab', 'xray', 'mri'] },
    { id: 'shl', short: 'Saffron Labs', type: 'contracted', kind: 'lab', x: 82, y: 44, cap: 40, load: 22, m: 1.35, q: .84, services: ['lab', 'xray', 'mri'] },
    { id: 'wbr', short: 'Willow Rehab', type: 'contracted', kind: 'clinic', x: 64, y: 29, cap: 26, load: 10, m: 1.4, q: .82, services: ['physio', 'ortho', 'xray'] },
    { id: 'srp', short: 'Sarema Renal', type: 'contracted', kind: 'clinic', x: 38, y: 34, cap: 20, load: 9, m: 1.55, q: .83, services: ['dialysis', 'lab'] },
    { id: 'tom', short: 'Tamarind Onco', type: 'contracted', kind: 'hospital', x: 46, y: 63, cap: 24, load: 11, m: 1.65, q: .88, services: ['onco', 'mri', 'lab', 'xray'] },
    { id: 'sgc', short: 'Sarema Grand', type: 'private', kind: 'hospital', x: 39, y: 23, cap: 36, load: 15, m: 2.4, q: .94, services: ['lab', 'xray', 'mri', 'cardio', 'ortho', 'mater', 'peds', 'physio', 'dialysis'] },
    { id: 'mwc', short: 'Marigold Care', type: 'private', kind: 'clinic', x: 14, y: 38, cap: 14, load: 5, m: 2.2, q: .92, services: ['mater', 'peds', 'lab', 'xray'] },
    { id: 'kbh', short: 'Kestrel Bayview', type: 'private', kind: 'hospital', x: 76, y: 64, cap: 30, load: 12, m: 2.7, q: .95, services: ['cardio', 'mri', 'ortho', 'onco', 'lab', 'xray', 'mater'] },
    { id: 'hiu', short: 'Harbor Imaging', type: 'private', kind: 'lab', x: 106, y: 15, cap: 22, load: 8, m: 2.3, q: .9, services: ['mri', 'xray', 'lab'] }];
  const SERVICES = [['lab', 'Lab work'], ['xray', 'X-ray'], ['mri', 'MRI/CT'], ['cardio', 'Cardiology'], ['dialysis', 'Dialysis'],
    ['physio', 'Physio'], ['ortho', 'Orthopedics'], ['onco', 'Oncology'], ['mater', 'Maternity'], ['peds', 'Pediatrics']];
  function care() {
    const columns = [
      { id: 'distance_km', label: 'Distance', type: 'number', unit: 'km' },
      { id: 'type', label: 'Type', type: 'category', unit: '' },
      { id: 'free_seats', label: 'Free seats', type: 'number', unit: '' },
      { id: 'occupancy', label: 'Occupancy', type: 'number', unit: '' },
      { id: 'cost_multiplier', label: 'Cost multiplier', type: 'number', unit: '×' },
      { id: 'quality', label: 'Quality', type: 'number', unit: '' },
      ...SERVICES.map(([id, label]) => ({ id, label, type: 'boolean', unit: '' }))];
    const r1 = x => Math.round(x * 10) / 10;
    const rows = FACILITIES.map(f => {
      const v = { distance_km: r1(Math.hypot(34 - f.x, 30 - f.y) * 1.3), type: f.type, free_seats: f.cap - f.load,
        occupancy: Math.round(f.load / f.cap * 10000) / 10000, cost_multiplier: f.m, quality: f.q };
      SERVICES.forEach(([id]) => { v[id] = f.services.includes(id); });
      return { id: f.id, label: f.short, v };
    });
    // DECISION (gaps from the demo):
    //  - Service coverage -> yes/no columns + one rule per needed service (patient: Ada, cardiology + lab).
    //  - Urgency -> a parameter that shrinks the reach rule by 15% per level, as in the demo.
    //    The demo's urgency boost to the distance *weight* is not ported: weights stay user-set and visible.
    //  - Public-first lock, split plans, overrides and the cohort simulation are routing policy, not scoring,
    //    so they stay out of the equation.
    const fixed = (lo, hi) => ({ auto: false, lo, hi });
    return { version: 1, name: 'Care routing', columns, rows,
      params: [
        { id: 'lambda', label: 'Distance decay', value: 40, min: 1, max: 200, step: 1 },
        { id: 'reach', label: 'Reach', value: 60, min: 10, max: 150, step: 1 },
        { id: 'urgency', label: 'Urgency', value: 0, min: 0, max: 2, step: 1 }],
      gates: [
        { id: 'g1', label: 'Has a free seat', expr: 'free_seats >= 1', enabled: true, simple: { column: 'free_seats', op: '>=', value: 1 } },
        { id: 'g2', label: 'Within reach', expr: 'distance_km <= reach * (1 - 0.15 * urgency)', enabled: true, simple: null },
        { id: 'g3', label: 'Offers cardiology', expr: 'cardio == 1', enabled: true, simple: { column: 'cardio', op: '==', value: 1 } },
        { id: 'g4', label: 'Offers lab work', expr: 'lab == 1', enabled: true, simple: { column: 'lab', op: '==', value: 1 } }],
      criteria: [
        crit('distance', 'Distance', 26, { source: { kind: 'expr', expr: 'exp(-distance_km / lambda)' }, range: fixed(0, 1) }),
        crit('cost', 'Cost', 16, { source: { kind: 'column', column: 'cost_multiplier' }, direction: 'lower', range: fixed(0.9, 2.8) }),
        crit('public_first', 'Public-first', 22, { source: { kind: 'column', column: 'type' }, shape: { type: 'map', map: { public: 1, contracted: 0.55, private: 0.25 } } }),
        crit('spare', 'Spare seats', 20, { source: { kind: 'expr', expr: '1 - occupancy^3' }, range: fixed(0, 1) }),
        crit('quality_c', 'Quality', 16, { source: { kind: 'column', column: 'quality' }, range: fixed(0, 1) })],
      combine: { type: 'sum', expr: '' } };
  }

  M.templates = {
    list: [
      { id: 'laptop', label: 'Pick a laptop', make: laptop },
      { id: 'jobs', label: 'Choose a job offer', make: jobs },
      { id: 'features', label: 'Prioritize features', make: features },
      { id: 'care', label: 'Care routing', make: care },
      { id: 'blank', label: 'Blank', make: blank }],
    get(id) { const t = this.list.find(x => x.id === id); return t ? t.make() : laptop(); },
    FACILITIES
  };
})(window.M);
