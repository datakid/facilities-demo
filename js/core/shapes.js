window.M = window.M || {};
(function (M) {
  'use strict';
  const clamp = M.util.clamp;
  const sig = (x, a, c) => 1 / (1 + Math.exp(-a * (x - c)));
  const SH = {
    linear: t => t,
    curve: (t, p) => Math.pow(t, p.k ?? 2),
    scurve: (t, p) => { const a = p.a ?? 10, c = p.c ?? 0.5, s0 = sig(0, a, c), s1 = sig(1, a, c); return (sig(t, a, c) - s0) / (s1 - s0); },
    step: (t, p) => (t >= (p.c ?? 0.5) ? 1 : 0),
    target: (t, p) => { const w = p.width ?? 0.2; return Math.exp(-(((t - (p.c ?? 0.5)) / w) ** 2)); }
  };
  M.shapes = {
    apply(shape, t, raw) {
      if (shape.type === 'map') return clamp(+((shape.map || {})[String(raw)]) || 0, 0, 1);
      const f = SH[shape.type] || SH.linear; const s = f(t, shape);
      return isFinite(s) ? clamp(s, 0, 1) : 0;
    },
    META: {
      linear: { label: 'Linear', line: 'Every step counts the same', params: [] },
      curve: { label: 'Curve', line: 'Bends toward strict or lenient', params: [{ key: 'k', label: 'Bend', min: 0.25, max: 4, step: 0.05 }] },
      scurve: { label: 'S-curve', line: 'Soft cut-off around a point', params: [{ key: 'a', label: 'Steepness', min: 2, max: 30, step: 1 }, { key: 'c', label: 'Turning point', min: 0, max: 1, step: 0.01, raw: true }] },
      step: { label: 'Step', line: 'Full points past a line, none before', params: [{ key: 'c', label: 'Line', min: 0, max: 1, step: 0.01, raw: true }] },
      target: { label: 'Target', line: 'Best at a sweet spot', params: [{ key: 'c', label: 'Sweet spot', min: 0, max: 1, step: 0.01, raw: true }, { key: 'width', label: 'Tolerance', min: 0.05, max: 1, step: 0.01, rawWidth: true }] },
      map: { label: 'Per category', line: 'Points per category', params: [] }
    }
  };
})(window.M);
