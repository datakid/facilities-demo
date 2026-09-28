self.window = self;
importScripts('expr.js', 'shapes.js', 'engine.js', 'plan.js');
self.onmessage = e => {
  try { self.postMessage({ done: M.plan.generate(e.data.model, e.data.spec, p => self.postMessage({ progress: p })) }); }
  catch (err) { self.postMessage({ done: { error: String(err && err.message || err) } }); }
};
