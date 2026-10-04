window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, H = M.h, S = H.S, esc = U.esc, MD = M.model, E = M.engine, R = M.render;

  R.results = () => {
    const el = document.getElementById('results'); if (!el) return;
    R.keepFocus(el, () => {
      el.innerHTML = `<section class="verdict" id="verdict" data-g="results" aria-live="polite">${verdict()}</section>
        <section class="sits" id="situations" data-g="situations">${sits()}</section>
        <section class="ranking" aria-label="Ranking">${legend()}<ol class="rank-list" id="rank-list">${ranking()}</ol>${outList()}</section>
        <section class="why" id="why" data-g="why">${why()}</section>
        <section class="checks" id="checks" data-g="checks"></section>`;
    });
    R.checks();
  };

  function verdict() {
    const res = S.res, L = res.lead, v = M.insights.verdict(res);
    if (!L) return `<p class="v-kicker">${esc(S.model.question || 'Result')}</p><h2 class="v-title muted-title">${esc(v.text)}</h2>`;
    const w = res.byId[L.winner];
    let line = '';
    if (L.runnerUp) {
      const d = L.driver ? MD.labelOf(S.model, H.crit(L.driver).col) : null;
      line = `${U.pts(L.margin)} points ahead of ${esc(res.byId[L.runnerUp].label)}` + (d ? `, mostly thanks to <b>${esc(d)}</b>` : '') + '.';
      if (L.weak) line += ` ${esc(res.byId[L.runnerUp].label)} is better on ${esc(MD.labelOf(S.model, H.crit(L.weak).col))}.`;
    }
    return `<p class="v-kicker">${esc(S.model.question || 'Result')}</p>
      <div class="v-row"><h2 class="v-title"><span class="rdot lg" style="--rc:var(--c${R.rowTone(w.id)})"></span>${esc(w.label)}</h2><span class="v-score num">${w.score.toFixed(1)}<small>/100</small></span><span class="pill ${v.level}">${esc(v.text)}</span></div>
      <p class="v-line">${line}</p>`;
  }
  R.verdictOnly = () => { const el = document.getElementById('verdict'); if (el) el.innerHTML = verdict(); };

  function sits() {
    const m = S.model; if (!m.knobs.length) return '';
    const act = H.activeSit(), list = m.scenarios || [], sit = S.sit || [];
    const lead = id => { const x = sit.find(y => y.id === id); return x ? x.winner : undefined; };
    const baseWin = (() => { const r = M.engine.compute(m, { prep: S.res.prep, K: m.base }); return r.ranked[0] || null; })();
    const chip = (id, label, w) => `<button class="sit${act === id ? ' on' : ''}" data-act="sit" data-id="${esc(id)}" aria-pressed="${act === id}" style="--rc:${w ? `var(--c${R.rowTone(w)})` : 'var(--line-2)'}"><span class="sit-l">${esc(label)}</span><span class="sit-w"><i></i>${w === undefined ? '…' : esc(w ? R.rowLabel(w) : 'nobody')}</span></button>`;
    let h = `<div class="sits-head"><h3>Situations</h3><span class="hint">Saved settings. See who wins in each.</span></div><div class="sit-row" data-keep-scroll="sits">`;
    h += chip('base', 'Baseline', baseWin);
    list.forEach(s => { h += chip(s.id, s.label, lead(s.id)); });
    h += '</div>';
    if (act == null) h += `<div class="sit-draft"><span>Settings changed</span><button class="btn sm" data-act="sit-save">${R.I.plus}Save as situation</button><button class="btn sm ghost" data-act="sit-base">Make baseline</button></div>`;
    else if (act !== 'base') {
      const s = list.find(x => x.id === act);
      h += `<div class="sit-draft"><input class="hl sit-name" data-in="sit-label" data-id="${esc(act)}" data-fk="sitl" value="${esc(s.label)}" aria-label="Situation name"><span class="muted sit-diff">${esc(diffText(s.values))}</span><button class="link sm" data-act="sit-del" data-id="${esc(act)}">Remove</button></div>`;
    } else if (!list.length) h += `<p class="hint">Change a setting, then save it as a situation, like “busy day” or “tight budget”.</p>`;
    const wins = new Set(sit.map(x => x.winner).filter(Boolean));
    if (sit.length > 1) h += `<p class="sit-sum">${wins.size === 1 ? `<b>${esc(R.rowLabel([...wins][0]))}</b> wins in every situation.` : `${wins.size} different winners across ${sit.length} situations. Pick per situation, or choose the one that holds up best.`}</p>`;
    return h;
  }
  function diffText(vals) {
    const m = S.model;
    const d = Object.entries(vals || {}).filter(([k, v]) => m.knobs.some(x => x.id === k) && Math.abs(v - m.base[k]) > 1e-9).map(([k, v]) => { const kn = m.knobs.find(x => x.id === k); return `${kn.label} ${U.withUnit(v, kn.unit)}`; });
    return d.length ? d.slice(0, 3).join(' · ') + (d.length > 3 ? ` · +${d.length - 3}` : '') : 'Same as baseline';
  }
  R.situations = () => { const el = document.getElementById('situations'); if (el) R.keepFocus(el, () => { el.innerHTML = sits(); }); };

  function legend() {
    const ids = S.res.crits;
    if (!ids.length) return '';
    return `<div class="legend">${ids.map(id => { const c = H.crit(id), k = H.cidx(id); return `<span style="--c:var(--c${k})"><i></i>${esc(R.critName(c))}</span>`; }).join('')}</div>`;
  }

  function ranking() {
    const res = S.res, prev = S.prev;
    if (!res.ranked.length) return '';
    const sel = S.ui.sel || (res.lead && res.lead.winner);
    return res.ranked.map(id => {
      const r = res.byId[id], p = prev && prev.byId[id];
      const mv = p && p.rank && r.rank ? p.rank - r.rank : 0;
      const segs = res.crits.map(cid => { const x = r.c[cid], k = H.cidx(cid); const w = x.contrib * 100; return w > 0.05 ? `<span style="width:${w.toFixed(2)}%;--c:var(--c${k})" title="${esc(R.critName(H.crit(cid)))}: ${w.toFixed(1)} pts"></span>` : ''; }).join('');
      const miss = r.missing.length ? `<span class="tag warn" title="Blank values score zero">blank</span>` : '';
      return `<li class="rank-row${sel === id ? ' sel' : ''}" data-key="${esc(id)}"><button class="rank-btn" data-act="select" data-id="${esc(id)}" aria-pressed="${sel === id}">
        <span class="rank-n num">${r.rank}</span>
        <span class="rank-name">${esc(r.label)}${miss}</span>
        <span class="rank-mv ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}" aria-label="${mv ? (mv > 0 ? 'up ' : 'down ') + Math.abs(mv) : ''}">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + (-mv) : ''}</span>
        <span class="bar" aria-hidden="true">${segs}</span>
        <span class="rank-s num">${r.score.toFixed(1)}</span></button></li>`;
    }).join('');
  }

  function outList() {
    const res = S.res; if (!res.out.length) return '';
    return `<div class="out-list"><p class="out-h">Ruled out by must-haves</p><ul>${res.out.map(id => {
      const r = res.byId[id], g = H.rule(r.failRule), x = r.rules.find(y => y.id === r.failRule);
      return `<li><button class="out-btn" data-act="select" data-id="${esc(id)}"><span class="out-name">${esc(r.label)}</span><span class="out-why">${x && x.error ? esc(x.error) : 'fails ' + esc(g ? (g.label || MD.pretty(S.model, g.formula) || g.formula) : 'a rule')}</span></button></li>`;
    }).join('')}</ul></div>`;
  }

  function why() {
    const res = S.res, id = S.ui.sel || (res.lead && res.lead.winner) || (res.rows[0] && res.rows[0].id);
    const r = res.byId[id]; if (!r) return '';
    const m = S.model;
    let h = `<div class="why-head"><h3>Why ${esc(r.label)} ${r.pass ? `is ${ordinal(r.rank)}` : 'is ruled out'}</h3>${r.pass ? `<span class="num why-s">${r.score.toFixed(1)}</span>` : ''}</div>`;
    if (!r.pass) {
      const fails = r.rules.filter(x => !x.pass).map(x => { const g = H.rule(x.id); return `<li>${R.I.x}<span>${esc(g.label || 'Must-have')}: <span class="mono">${esc(MD.pretty(m, g.formula) || g.formula)}</span>${x.error ? ` · ${esc(x.error)}` : ''}</span></li>`; });
      h += `<ul class="fail-list">${fails.join('')}</ul><p class="hint">Change its values on the Options tab or loosen the must-have to bring it back.</p>`;
      return h;
    }
    h += `<table class="why-t"><thead><tr><th scope="col">Thing</th><th scope="col" class="r">Value</th><th scope="col">Points of 10</th><th scope="col" class="r">Counts</th><th scope="col" class="r">Adds</th></tr></thead><tbody>`;
    res.crits.forEach(cid => {
      const c = H.crit(cid), x = r.c[cid], k = H.cidx(cid);
      const pts10 = x.s * 10;
      h += `<tr style="--c:var(--c${k});--t:var(--t${k})"><th scope="row"><i class="sw"></i>${esc(R.critName(c))}</th>
        <td class="r num">${x.missing ? '<span class="tag warn">blank</span>' : esc(H.val(c.col, x.raw))}</td>
        <td><span class="mini"><span style="width:${(x.s * 100).toFixed(1)}%"></span></span><span class="num mini-v">${pts10.toFixed(1)}</span></td>
        <td class="r num muted">${Math.round(x.w * 100)}%</td><td class="r num"><b>${(x.contrib * 100).toFixed(1)}</b></td></tr>`;
    });
    h += `</tbody><tfoot><tr><td colspan="4">${m.method === 'balanced' ? 'Balanced total' : 'Total'}</td><td class="r num"><b>${r.score.toFixed(1)}</b></td></tr></tfoot></table>`;
    const calcs = E.trace(m, res, id);
    if (calcs.length) h += `<details class="calc-trace"><summary>Worked out for ${esc(r.label)}</summary><ul>${calcs.map(s => `<li><b>${esc(MD.labelOf(m, s.col))}</b> = <span class="mono">${esc(s.plug)}</span> = <b class="num">${s.err ? esc(s.err) : esc(H.val(s.col, s.value))}</b></li>`).join('')}</ul></details>`;
    const wit = E.whatItTakes(m, res, id);
    if (wit.length) {
      h += `<div class="takes"><p class="takes-h">${r.rank === 1 ? `What would cost ${esc(r.label)} first place` : `What it would take for ${esc(r.label)} to win`}</p><ul>${wit.map(w => {
        const col = H.col(w.col);
        return `<li><button class="takes-btn" data-act="try" data-id="${esc(id)}" data-col="${esc(w.col)}" data-v="${w.to}" title="Try it (undo to go back)"><span>${esc(col.label)} ${esc(H.val(w.col, w.from))} → <b>${esc(H.val(w.col, +w.to.toPrecision(3)))}</b></span><span class="muted">${r.rank === 1 ? esc(R.rowLabel(w.vs)) + ' would lead' : 'try it'}</span></button></li>`;
      }).join('')}</ul></div>`;
    } else if (r.rank === 1 && res.ranked.length > 1) h += `<p class="hint takes-none">No single realistic change to its numbers costs it first place.</p>`;
    return h;
  }
  const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

  R.checks = () => {
    const el = document.getElementById('checks'); if (!el) return;
    const ins = S.ins;
    if (!ins) { el.innerHTML = '<h3 class="checks-h">Checks</h3><p class="muted">Checking…</p>'; return; }
    const items = ins.items;
    const icon = t => t === 'ok' ? R.I.check : t === 'info' ? R.I.info : R.I.warn;
    el.innerHTML = `<h3 class="checks-h">Can I trust this?</h3>` + (items.length ? `<ul class="check-list">${items.slice(0, S.ui.allChecks ? 99 : 4).map(g => `<li class="ck ${g.tone}">${icon(g.tone)}<div><b>${esc(g.title)}</b><p>${esc(g.body)}</p>${g.go ? `<button class="link inline" data-act="go" data-kind="${esc(g.go.kind)}" data-id="${esc(g.go.id)}">Show me</button>` : ''}</div></li>`).join('')}</ul>${items.length > 4 && !S.ui.allChecks ? `<button class="link" data-act="all-checks">Show ${items.length - 4} more</button>` : ''}` : '<p class="muted">Nothing to flag.</p>');
  };
})(window.M);
