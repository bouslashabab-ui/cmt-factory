'use strict';
/* Small SVG chart kit in the Indigo Atelier palette (no libraries). */
const VZ = (() => {
  const PAL = ['#3547e0', '#f0457a', '#0e9f6e', '#9aa8ff', '#f2a93b', '#6d7bd9', '#14b8c4', '#8b5cf6'];
  const AR_M = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const EN_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = (ym) => ((window.I18N && I18N.lang === 'en') ? EN_M : AR_M)[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
  const short = (n) => { const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K' : String(Math.round(a))); };
  const wrap = (title, svg, legend) => h('div', { class: 'panel viz' }, h('div', { class: 'ph' }, title), h('div', { class: 'pb' }, h('div', { class: 'viz-svg', html: svg }), legend ? h('div', { class: 'viz-leg' }, legend.map(l => h('span', null, h('i', { style: { background: l.color } }), l.label))) : null));
  /* nice axis ceilings: round a max up to 1/2/2.5/5 x 10^k; empty data gets a clean 0-100 scale */
  const niceCeil = (n) => { if (!isFinite(n) || n <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(n))), d = n / p; return (d <= 1 ? 1 : d <= 2 ? 2 : d <= 2.5 ? 2.5 : d <= 5 ? 5 : 10) * p; };
  const niceFloor = (n) => (!isFinite(n) || n >= 0) ? 0 : -niceCeil(-n);
  const emptyNote = (W, H) => '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" fill="#7a82a6">لا توجد حركة في الفترة</text>';
  /* grouped bars: data=[{l,v:{key:num}}], series=[{k,label,color}] */
  function bars(title, data, series) {
    const W = 680, H = 250, pl = 46, pr = 10, pt = 14, pb = 30, ch = H - pt - pb, cw = W - pl - pr;
    const mx = niceCeil(Math.max(0, ...data.flatMap(d => series.map(s => Math.abs(d.v[s.k] || 0))))); let g = '';
    for (let i = 0; i <= 4; i++) { const y = pt + ch * i / 4; g += '<line x1="' + pl + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e1e5f4" stroke-dasharray="3 5"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10.5" fill="#7a82a6">' + short(mx * (4 - i) / 4) + '</text>'; }
    const gap = cw / Math.max(1, data.length), bw = Math.min(30, (gap - 10) / series.length);
    data.forEach((d, i) => { const cx = pl + gap * i + gap / 2; series.forEach((s, j) => { const v = Math.abs(d.v[s.k] || 0), hh = v / mx * ch, x = cx - bw * series.length / 2 + j * bw; g += '<rect class="svg-bar" style="animation-delay:' + (i * 70 + j * 40) + 'ms" x="' + (x + 1) + '" y="' + (pt + ch - hh) + '" width="' + (bw - 2) + '" height="' + Math.max(hh, 1) + '" rx="5" fill="' + s.color + '"><title>' + d.l + ' - ' + s.label + ': ' + fmt(d.v[s.k] || 0) + '</title></rect>'; }); g += '<text x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle" font-size="11.5" fill="#7a82a6">' + d.l + '</text>'; });
    if (!data.length) g += emptyNote(W, H);
    return wrap(title, '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img">' + g + '</svg>', series.map(s => ({ color: s.color, label: s.label })));
  }
  /* donut: items=[{l,v}] */
  function donut(title, items, centerLabel) {
    const tot = items.reduce((s, x) => s + x.v, 0);
    if (!items.length || tot <= 0) return h('div', { class: 'panel viz' }, h('div', { class: 'ph' }, title), h('div', { class: 'pb' }, h('div', { class: 'empty' }, 'لا توجد بيانات')));
    const R = 70, CIRC = 2 * Math.PI * R; let off = 0, g = '';
    items.forEach((x, i) => { const len = x.v / tot * CIRC; g += '<circle class="donut-seg" cx="100" cy="100" r="' + R + '" fill="none" stroke="' + PAL[i % PAL.length] + '" stroke-width="26" stroke-dasharray="' + len + ' ' + (CIRC - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 100 100)"><title>' + x.l + ': ' + fmt(x.v) + '</title></circle>'; off += len; });
    g += '<text x="100" y="96" text-anchor="middle" font-size="12" fill="#7a82a6">' + (centerLabel || 'الإجمالي') + '</text><text x="100" y="118" text-anchor="middle" font-size="17" font-weight="800" fill="#0f1437">' + short(tot) + '</text>';
    return wrap(title, '<svg viewBox="0 0 200 200" width="220" height="220">' + g + '</svg>', items.map((x, i) => ({ color: PAL[i % PAL.length], label: x.l + ' (' + Math.round(x.v / tot * 100) + '%)' })));
  }
  /* line / area: points=[{l,v}] */
  function line(title, points, color) {
    const W = 680, H = 230, pl = 46, pr = 14, pt = 14, pb = 28, ch = H - pt - pb, cw = W - pl - pr; color = color || '#3547e0';
    const vs = points.map(p => p.v), mx = niceCeil(Math.max(0, ...vs)), mn = niceFloor(Math.min(0, ...vs)), sp = (mx - mn) || 1; let g = '';
    for (let i = 0; i <= 4; i++) { const y = pt + ch * i / 4; g += '<line x1="' + pl + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e1e5f4" stroke-dasharray="3 5"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10.5" fill="#7a82a6">' + short(mx - sp * i / 4) + '</text>'; }
    const X = (i) => pl + (points.length < 2 ? cw / 2 : cw * i / (points.length - 1)), Y = (v) => pt + ch - (v - mn) / sp * ch;
    const d = points.map((p, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(p.v)).join(' ');
    if (points.length > 1) g += '<path d="' + d + ' L' + X(points.length - 1) + ' ' + (pt + ch) + ' L' + X(0) + ' ' + (pt + ch) + ' Z" fill="' + color + '" opacity=".1"/><path class="svg-line" d="' + d + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    points.forEach((p, i) => { g += '<circle cx="' + X(i) + '" cy="' + Y(p.v) + '" r="4" fill="#fff" stroke="' + color + '" stroke-width="2.5"><title>' + p.l + ': ' + fmt(p.v) + '</title></circle><text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#7a82a6">' + p.l + '</text>'; });
    if (!points.length) g += emptyNote(W, H);
    return wrap(title, '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img">' + g + '</svg>');
  }
  /* horizontal ranked bars: items=[{l,v}] */
  function hbars(title, items, color) {
    const mx = niceCeil(Math.max(0, ...items.map(x => Math.abs(x.v))));
    if (items.length && !items.some(x => Math.abs(x.v) > 0)) items = [];
    return h('div', { class: 'panel viz' }, h('div', { class: 'ph' }, title), h('div', { class: 'pb' }, items.length ? items.map((x, i) => h('div', { class: 'hb-row' }, h('span', { class: 'hb-l' }, x.l), h('div', { class: 'hb-t' }, h('i', { style: { width: Math.max(3, Math.abs(x.v) / mx * 100) + '%', background: color || PAL[i % PAL.length], animationDelay: (i * 60) + 'ms' } })), h('b', null, fmt(x.v)))) : h('div', { class: 'empty' }, 'لا توجد بيانات')));
  }
  /* KPI with change vs previous period: cur, prev numbers; goodUp=true if higher is better */
  function kpiD(t, cur, prev, goodUp, isMoney) {
    const f = isMoney === false ? (x => String(x)) : fmt; let d = null;
    if (prev !== undefined && prev !== null) { const diff = cur - prev, pct = prev ? Math.round(diff / Math.abs(prev) * 100) : null; const up = diff > 0, good = diff === 0 ? null : (up === (goodUp !== false)); d = h('small', { class: 'dl ' + (good === null ? '' : good ? 'up' : 'dn') }, (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '= ') + (pct === null ? fmt(Math.abs(diff)) : Math.abs(pct) + '%') + ' ', 'عن الفترة السابقة'); }
    return h('div', { class: 'kpi' }, h('span', null, t), h('b', null, f(cur)), d);
  }
  const prevRange = (from, to) => { const a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z'), n = Math.round((b - a) / 86400000) + 1; const pe = new Date(a.getTime() - 86400000), ps = new Date(pe.getTime() - (n - 1) * 86400000); const f = x => x.toISOString().slice(0, 10); return { from: f(ps), to: f(pe) }; };
  return { PAL, bars, donut, line, hbars, kpiD, monthLabel, short, prevRange };
})();
