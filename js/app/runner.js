window.M = window.M || {};
(function (M) {
  'use strict';
  let w = null, ok = null, seq = 0;
  const jobs = new Map();
  function worker() {
    if (ok === false) return null;
    if (w) return w;
    try {
      if (location.protocol === 'file:' || typeof Worker === 'undefined') throw new Error('no worker');
      w = new Worker('js/core/plan-worker.js');
      w.onmessage = e => { const j = jobs.get(e.data.id); if (!j) return; if (e.data.progress) j.onP && j.onP(e.data.progress); else { jobs.delete(e.data.id); j.res(e.data.done); } };
      w.onerror = () => { ok = false; w = null; jobs.forEach(j => j.fallback()); jobs.clear(); };
      ok = true;
      return w;
    } catch (e) { ok = false; return null; }
  }
  const local = (job, model, spec, opt, onP) => {
    if (job === 'find') return M.plan.find(model, spec, Object.assign({}, opt, { progress: onP }));
    if (job === 'hourly') return M.plan.hourly(model, opt);
    return M.plan.fitAll(model, spec);
  };
  function run(job, model, spec, opt, onP) {
    return new Promise(res => {
      const ww = worker();
      const fallback = () => setTimeout(() => res(local(job, model, spec, opt, onP)), 20);
      if (!ww) return fallback();
      const id = ++seq;
      jobs.set(id, { res, onP, fallback });
      ww.postMessage({ id, job, model: JSON.parse(JSON.stringify(model)), spec, opt });
    });
  }
  function cancel() { if (w) { w.terminate(); w = null; ok = null; } jobs.clear(); }
  M.runner = { run, cancel, warm: () => worker(), usingWorker: () => ok === true };
})(window.M);
