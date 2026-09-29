self.window = self;
importScripts('expr.js', 'shapes.js', 'engine.js', 'honesty.js', 'plan.js', 'analysis.js');
self.onmessage = e => {
  try { self.postMessage({ id: e.data.id, out: M.analysis.run(e.data.model) }); }
  catch (err) { self.postMessage({ id: e.data.id, error: String(err && err.message || err) }); }
};
