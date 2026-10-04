self.window = self;
importScripts('util.js', 'formula.js', 'model.js', 'engine.js', 'plan.js');
self.onmessage = e => {
  const { id, job, model, spec, opt } = e.data;
  try {
    let out;
    if (job === 'find') out = M.plan.find(model, spec, Object.assign({}, opt, { progress: p => self.postMessage({ id, progress: p }) }));
    else if (job === 'hourly') out = M.plan.hourly(model, opt);
    else if (job === 'fitAll') out = M.plan.fitAll(model, spec);
    self.postMessage({ id, done: out });
  } catch (err) { self.postMessage({ id, done: { error: String(err && err.message || err) } }); }
};
