window.M = window.M || {};
(function (M) {
  'use strict';
  const U = M.util, MD = M.model;
  const MAXF = 6000;
  const colName = i => { let t = ''; i++; while (i > 0) { const m = (i - 1) % 26; t = String.fromCharCode(65 + m) + t; i = Math.floor((i - 1) / 26); } return t; };
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';

  function erl(l, m, c) {
    const C = `MAX(1,INT(${c}))`, A = `(${l}/${m})`;
    const p = `POISSON(${C},${A},FALSE)*${C}/(${C}-${A})`;
    return { C, e: `IF(NOT(${l}>0),0,IF(NOT(${m}>0),1,IF(${A}/${C}>=1,1,(${p})/(${p}+POISSON(${C}-1,${A},TRUE)))))` };
  }
  function call(fn, a) {
    switch (fn) {
      case 'if': return `IF(${a[0]},${a[1]},${a[2]})`;
      case 'min': return `MIN(${a.join(',')})`;
      case 'max': return `MAX(${a.join(',')})`;
      case 'sum': return `SUM(${a.join(',')})`;
      case 'avg': return `AVERAGE(${a.join(',')})`;
      case 'abs': return `ABS(${a[0]})`;
      case 'round': return `ROUND(${a[0]},${a[1] == null ? 0 : a[1]})`;
      case 'floor': return `INT(${a[0]})`;
      case 'ceil': return `(-INT(-(${a[0]})))`;
      case 'sqrt': return `SQRT(${a[0]})`;
      case 'log': case 'ln': return `LN(${a[0]})`;
      case 'log10': return `LOG10(${a[0]})`;
      case 'log2': return `LOG(${a[0]},2)`;
      case 'exp': return `EXP(${a[0]})`;
      case 'pow': return `POWER(${a[0]},${a[1]})`;
      case 'clamp': return `MIN(${a[2]},MAX(${a[1]},${a[0]}))`;
      case 'pick': {
        const x = a[0], rest = a.slice(1), pairs = rest.length - (rest.length % 2);
        let out = rest.length % 2 ? rest[rest.length - 1] : 'NA()';
        for (let i = pairs - 2; i >= 0; i -= 2) out = `IF(${x}=${rest[i]},${rest[i + 1]},${out})`;
        return out;
      }
      case 'erlangc': return erl(a[0], a[1], a[2]).e;
      case 'wait': { const r = erl(a[0], a[1], a[2]); return `IF(NOT(${a[0]}>0),0,IF(OR(NOT(${a[1]}>0),${a[0]}>=${r.C}*${a[1]}),NA(),${r.e}/(${r.C}*${a[1]}-${a[0]})))`; }
      case 'within': { const r = erl(a[0], a[1], a[2]); return `IF(NOT(${a[0]}>0),1,IF(OR(NOT(${a[1]}>0),${a[0]}>=${r.C}*${a[1]}),0,1-${r.e}*EXP(-(${r.C}*${a[1]}-${a[0]})*${a[3]})))`; }
      case 'runway': return `IF(NOT(${a[0]}>1),0,IF(NOT(${a[1]}>0),999,MIN(999,LN(${a[0]})/LN(1+${a[1]}))))`;
      case 'avail': return `(1-POWER(1-MAX(0,MIN(1,${a[0]})),MAX(0,${a[1]})))`;
    }
    throw new Error('no ' + fn);
  }
  function fx(ast, ref) {
    const go = n => {
      switch (n.t) {
        case 'num': return String(+n.v.toPrecision(15));
        case 'str': return q(n.v);
        case 'id': return ref(n.ref != null ? n.ref : n.name);
        case 'un': return n.op === '-' ? `(-${go(n.a)})` : `IF(${go(n.a)},0,1)`;
        case 'bin': {
          const a = go(n.a), b = go(n.b);
          if (n.op === '&&') return `IF(AND(${a},${b}),1,0)`;
          if (n.op === '||') return `IF(OR(${a},${b}),1,0)`;
          if (n.op === '==') return `IF(${a}=${b},1,0)`;
          if (n.op === '!=') return `IF(${a}<>${b},1,0)`;
          if (['<', '<=', '>', '>='].includes(n.op)) return `IF(${a}${n.op}${b},1,0)`;
          if (n.op === '%') return `(${a}-${b}*TRUNC(${a}/${b}))`;
          return `(${a}${n.op}${b})`;
        }
        case 'call': return call(n.fn, n.args.map(go));
      }
      throw new Error('node');
    };
    const s = go(ast);
    if (s.length > MAXF) throw new Error('long');
    return s;
  }

  function plan(model, res) {
    const prep = res.prep, sheets = [], stat = [];
    const knobRow = {}; model.knobs.forEach((k, i) => { knobRow[k.id] = i + 2; });
    const colL = {}; model.columns.forEach((c, i) => { colL[c.id] = colName(i + 1); });
    const nR = model.rows.length, lastData = nR + 1;
    const mk = (pre, row) => id => {
      if (knobRow[id]) return `Settings!$B$${knobRow[id]}`;
      if (colL[id]) return `${pre}${colL[id]}${row}`;
      throw new Error('ref');
    };
    const lit = v => typeof v === 'number' && isFinite(v) ? { n: v } : typeof v === 'boolean' ? { n: v ? 1 : 0 } : typeof v === 'string' ? { s: v } : null;

    if (model.knobs.length) sheets.push({ name: 'Settings', widths: [30, 14, 14], rows: [[{ s: 'Setting', h: 1 }, { s: 'Value', h: 1 }, { s: 'Unit', h: 1 }], ...model.knobs.map(k => [{ s: k.label }, { n: +k.value }, { s: k.unit || '' }])] });

    const dataRows = [[{ s: 'Option', h: 1 }, ...model.columns.map(c => ({ s: c.label + (c.unit ? ` (${c.unit})` : c.type === 'yesno' ? ' (1 = yes)' : ''), h: 1 }))]];
    model.rows.forEach((row, ri) => {
      const out = [{ s: row.label }], rr = ri + 2, rv = res.byId[row.id];
      model.columns.forEach(c => {
        if (c.formula && c.formula.trim()) {
          const k = prep.comp[c.id];
          if (!k) { out.push(null); return; }
          try { out.push({ f: `IFERROR(${fx(k.ast, mk('', rr))},"")` }); }
          catch (e) { stat.push(`${c.label}: ${row.label}`); out.push(rv ? lit(rv.vals[c.id]) : null); }
        } else out.push(lit(row.v[c.id]));
      });
      dataRows.push(out);
    });
    sheets.push({ name: 'Data', widths: [30, ...model.columns.map(() => 16)], rows: dataRows });

    const crs = res.crits.map(id => model.criteria.find(c => c.id === id));
    const nC = crs.length, FIRST = 7, LAST = FIRST + nR - 1;
    const tC = nC + 1, pC = nC + 2, sC = nC + 3, rC = nC + 4, stC = nC + 5, aC = nC + 6;
    const L = j => colName(j + 1);
    const head = [{ s: 'Option', h: 1 }, ...crs.map(c => ({ s: MD.labelOf(model, c.col), h: 1 })), { s: 'Total (0 to 1)', h: 1 }, { s: 'Penalty', h: 1 }, { s: 'Score', h: 1 }, { s: 'Rank', h: 1 }, { s: 'Status', h: 1 }, { s: 'App score', h: 1 }];
    const rowW = [{ s: 'Importance (0 to 10)' }], rowLo = [{ s: 'Range from' }], rowHi = [{ s: 'Range to' }], rowAt = [{ s: 'Full points at / sweet spot' }], rowTol = [{ s: 'Zero points when off by / share of range' }];
    crs.forEach((c, j) => {
      const col = prep.colById[c.col], l = L(j), dl = colL[c.col], rng = `Data!${dl}$2:${dl}$${lastData}`;
      rowW.push({ n: +c.weight });
      if (col.type === 'text') { rowLo.push(null); rowHi.push(null); rowAt.push(null); rowTol.push(null); return; }
      const fixed = c.range && !c.range.auto && Number.isFinite(c.range.lo) && Number.isFinite(c.range.hi) && c.range.lo !== c.range.hi;
      rowLo.push(fixed ? { n: Math.min(c.range.lo, c.range.hi) } : { f: `MIN(${rng})` });
      rowHi.push(fixed ? { n: Math.max(c.range.lo, c.range.hi) } : { f: `MAX(${rng})` });
      const less = c.want === 'less';
      if (c.curve === 'enough') {
        rowAt.push(c.at != null ? { n: +c.at } : { f: `${l}$3+(${l}$4-${l}$3)*${less ? 0.3 : 0.7}` });
        const x = `MAX(0,MIN(1,(${l}$5-${l}$3)/IF(${l}$4=${l}$3,1,${l}$4-${l}$3)))`;
        rowTol.push({ f: less ? `1-${x}` : x });
      } else if (c.curve === 'target') {
        rowAt.push(c.at != null ? { n: +c.at } : { f: `(${l}$3+${l}$4)/2` });
        rowTol.push(c.tol ? { n: +c.tol } : { f: `MAX((${l}$4-${l}$3)/2,1E-9)` });
      } else if (c.curve === 'step') {
        rowAt.push(c.at != null ? { n: +c.at } : { f: `(${l}$3+${l}$4)/2` }); rowTol.push(null);
      } else { rowAt.push(null); rowTol.push(null); }
    });
    const pad = n => Array(n).fill(null);
    const W = `$${L(0)}$2:$${L(nC - 1)}$2`;
    const customX = (c, T, raw, l) => {
      const k = M.engine.customCurve(c.fx);
      if (!k.ok) return '0';
      try { return fx(k.ast, nm => nm === 'x' ? raw : nm === 't' ? `(${T})` : `${l}$${nm === 'lo' ? 3 : 4}`); } catch (e) { return null; }
    };
    const scoreRows = [];
    model.rows.forEach((row, ri) => {
      const r = FIRST + ri, dr = ri + 2, rv = res.byId[row.id], out = [{ s: row.label }];
      crs.forEach((c, j) => {
        const col = prep.colById[c.col], l = L(j), raw = `Data!${colL[c.col]}${dr}`;
        if (col.type === 'text') {
          const keys = [...new Set([...(col.choices || []), ...model.rows.map(x => x.v[c.col]).filter(x => x != null).map(String)])];
          let e = String(U.clamp(5 / 10, 0, 1));
          for (let i = keys.length - 1; i >= 0; i--) e = `IF(${raw}=${q(keys[i])},${U.clamp((c.points[keys[i]] != null ? c.points[keys[i]] : 5) / 10, 0, 1)},${e})`;
          out.push({ f: `IF(ISBLANK(${raw}),0,${e})` });
          return;
        }
        const T0 = `MAX(0,MIN(1,(${raw}-${l}$3)/(${l}$4-${l}$3)))`, T = `IF(${l}$4=${l}$3,1,${c.want === 'less' ? '1-' : ''}${T0})`;
        const cv = c.curve === 'gentle' ? `SQRT(${T})` : c.curve === 'steep' ? `POWER(${T},2)` : c.curve === 'enough' ? `IF(${l}$6<=0,1,MIN(1,MAX(0,${T}/${l}$6)))` : c.curve === 'target' ? `MAX(0,MIN(1,1-ABS(${raw}-${l}$5)/${l}$6))` : c.curve === 'scurve' ? `(${T})*(${T})*(3-2*(${T}))` : c.curve === 'step' ? `IF(${raw}${c.want === 'less' ? '<=' : '>='}${l}$5,1,0)` : c.curve === 'custom' ? customX(c, T, raw, l) : T;
        if (cv === null) { stat.push(`${MD.labelOf(model, c.col)}: ${row.label}`); out.push(rv && rv.c[c.id] ? { n: rv.c[c.id].s } : null); return; }
        out.push({ f: `IF(ISNUMBER(${raw}),MAX(0,MIN(1,${cv})),0)` });
      });
      const Rr = nC ? `${L(0)}${r}:${L(nC - 1)}${r}` : '';
      const total = !nC ? '0' : model.method === 'strict' ? `IF(SUM(${W})=0,0,SUMPRODUCT(${Rr},${W})/SUM(${W})*(0.5+0.5*SUMPRODUCT(MIN(${Rr}+(${W}<=0)))))` : model.method === 'balanced' ? `IF(SUM(${W})=0,0,MAX(0,MIN(1,(EXP(SUMPRODUCT(${W}/SUM(${W}),LN(0.1+0.9*${Rr})))-0.1)/0.9)))` : `IF(SUM(${W})=0,0,SUMPRODUCT(${Rr},${W})/SUM(${W}))`;
      const ruleX = prep.rules.map(({ r: rule, ast }) => {
        try { return { rule, e: `NOT(IFERROR(${fx(ast, mk('Data!', dr))},FALSE))` }; }
        catch (e) { stat.push(`${rule.label || rule.id}: ${row.label}`); const pass = rv && rv.rules.find(x => x.id === rule.id); return { rule, e: pass && pass.pass ? 'FALSE' : 'TRUE' }; }
      });
      const pen = ruleX.filter(x => x.rule.soft).map(x => `IF(${x.e},${Math.max(0, +x.rule.penalty || 0)},0)`).join('+') || '0';
      let status = '""';
      ruleX.filter(x => !x.rule.soft).reverse().forEach(x => { status = `IF(${x.e},${q('Ruled out: ' + (x.rule.label || x.rule.id))},${status})`; });
      const tl = L(tC - 1), pl = L(pC - 1), sl = L(sC - 1), stl = L(stC - 1);
      out.push({ f: total }, { f: pen }, { f: `IF(${stl}${r}<>"",0,MAX(0,${tl}${r}*100-${pl}${r}))` });
      out.push({ f: `IF(${stl}${r}<>"","",1+COUNTIFS($${sl}$${FIRST}:$${sl}$${LAST},">"&${sl}${r},$${stl}$${FIRST}:$${stl}$${LAST},""))` });
      out.push({ f: status }, { n: rv ? rv.score : 0 });
      scoreRows.push(out);
    });
    sheets.push({ name: 'Scores', widths: [30, ...Array(nC + 6).fill(16)], rows: [head, rowW, rowLo, rowHi, rowAt, rowTol, ...scoreRows] });
    return { sheets, stat, FIRST, scoreCol: sC, rankCol: rC, appCol: aC };
  }

  function describe(model, res) {
    const p = plan(model, res);
    const L = [];
    if (model.knobs.length) L.push(`Settings: ${model.knobs.length} setting${model.knobs.length > 1 ? 's' : ''}. Change one and every sheet recalculates.`);
    L.push(`Data: ${model.rows.length} options by ${model.columns.length} columns. Worked-out columns are live formulas.`);
    L.push('Scores: points for each criterion, the total, penalties, rank and who is ruled out, all as live formulas.');
    L.push('Rows 2 to 6 on Scores hold the importance and ranges. Edit them to try other choices.');
    L.push('The App score column is what this app showed, so you can check the two agree.');
    if (p.stat.length) L.push(`${p.stat.length} value${p.stat.length > 1 ? 's were' : ' was'} too long for one formula and saved as numbers instead.`);
    return L.join('\n');
  }

  const T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
  const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cd = [];
    let off = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.data), cs = crc(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, cs, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, cs, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cd.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    let cdSize = 0; cd.forEach(x => { cdSize += x.length; });
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    const all = [...parts, ...cd, new Uint8Array(e.buffer)];
    let len = 0; all.forEach(x => { len += x.length; });
    const out = new Uint8Array(len); let p = 0;
    all.forEach(x => { out.set(x, p); p += x.length; });
    return out;
  }
  const xe = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function sheetXml(sh) {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>';
    sh.widths.forEach((w, i) => { x += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`; });
    x += '</cols><sheetData>';
    sh.rows.forEach((r, ri) => {
      x += `<row r="${ri + 1}">`;
      r.forEach((c, ci) => {
        if (!c) return;
        const ref = colName(ci) + (ri + 1), st = c.h ? ' s="1"' : '';
        if (c.f !== undefined) x += `<c r="${ref}"${st}><f>${xe(c.f)}</f></c>`;
        else if (typeof c.n === 'number') x += `<c r="${ref}"${st}><v>${c.n}</v></c>`;
        else x += `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(c.s == null ? '' : c.s)}</t></is></c>`;
      });
      x += '</row>';
    });
    return x + '</sheetData></worksheet>';
  }
  function build(model, res) {
    const p = plan(model, res), hdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', ns = 'http://schemas.openxmlformats.org/';
    const n = p.sheets.length, idx = Array.from({ length: n }, (_, i) => i + 1);
    return zip([
      { name: '[Content_Types].xml', data: hdr + `<Types xmlns="${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${idx.map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', data: hdr + `<Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: hdr + `<workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets>${p.sheets.map((s, i) => `<sheet name="${xe(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: hdr + `<Relationships xmlns="${ns}package/2006/relationships">${idx.map(i => `<Relationship Id="rId${i}" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${ns}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: hdr + `<styleSheet xmlns="${ns}spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
      ...p.sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }))
    ]);
  }

  M.xlsx = { build, plan, describe, fx };
})(window.M);
