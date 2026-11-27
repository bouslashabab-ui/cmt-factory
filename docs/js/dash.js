'use strict';
/* Dashboard extras: financial snapshot chart, inventory alerts, quick actions (no libraries) */
(function () {
  const orig = MZ.pages.home;
  const bar = (label, v, max, color) => h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, label), h('div', { class: 'bt' }, h('i', { style: { width: (max ? Math.max(2, Math.round(v / max * 100)) : 0) + '%', background: color } })), h('b', null, fmt(v)));

  const AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  async function monthly() {
    const now = new Date(), ms = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(d.getFullYear(), d.getMonth() + 1, 0); const f = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); ms.push({ l: AR[d.getMonth()], from: f(d), to: f(e) }); }
    const rs = await Promise.allSettled(ms.map(m => GET('/gl/statements?from=' + m.from + '&to=' + m.to)));
    return ms.map((m, i) => { const I = rs[i].status === 'fulfilled' ? rs[i].value.income : null; return { l: m.l, rev: I ? +I.total_revenue || 0 : 0, exp: I ? +I.total_expense || 0 : 0 }; });
  }
  function chart(data) {
    const W = 640, H = 220, pl = 10, pb = 28, pt = 12, mx = Math.max(1, ...data.flatMap(d => [d.rev, d.exp])), bw = 26, gap = (W - pl * 2) / data.length, ch = H - pb - pt;
    let g = '';
    for (let i = 0; i <= 4; i++) { const y = pt + ch * i / 4; g += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e1e5f4" stroke-dasharray="3 5"/>'; }
    const pts = [];
    data.forEach((d, i) => {
      const cx = pl + gap * i + gap / 2, hr = d.rev / mx * ch, he = d.exp / mx * ch;
      g += '<rect class="svg-bar" style="animation-delay:' + (i * 80) + 'ms" x="' + (cx - bw - 2) + '" y="' + (pt + ch - hr) + '" width="' + bw + '" height="' + Math.max(hr, 1) + '" rx="6" fill="#3547e0"><title>' + d.l + ' إيراد ' + fmt(d.rev) + '</title></rect>';
      g += '<rect class="svg-bar" style="animation-delay:' + (i * 80 + 40) + 'ms" x="' + (cx + 2) + '" y="' + (pt + ch - he) + '" width="' + bw + '" height="' + Math.max(he, 1) + '" rx="6" fill="#f0457a"><title>' + d.l + ' مصروف ' + fmt(d.exp) + '</title></rect>';
      g += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" fill="#7a82a6">' + d.l + '</text>';
      pts.push((cx) + ',' + (pt + ch - (d.rev - d.exp > 0 ? (d.rev - d.exp) / mx * ch : 0)));
    });
    g += '<polyline class="svg-line" points="' + pts.join(' ') + '" fill="none" stroke="#0f1437" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    pts.forEach(p => { const [x, y] = p.split(','); g += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#fff" stroke="#0f1437" stroke-width="2"/>'; });
    const w = h('div', { class: 'chart-card' }); w.innerHTML = '<div class="legend"><span><i style="background:#3547e0"></i>إيرادات</span><span><i style="background:#f0457a"></i>مصروفات</span><span><i style="background:#0f1437"></i>صافي الربح</span></div><svg viewBox="0 0 ' + W + ' ' + H + '">' + g + '</svg>'; return w;
  }
  function donut(parts) {
    const tot = parts.reduce((a, b) => a + b.v, 0) || 1, R = 54, C = 2 * Math.PI * R; let off = 0, g = '';
    parts.forEach(p => { const len = p.v / tot * C; g += '<circle class="donut-seg" r="' + R + '" cx="70" cy="70" fill="none" stroke="' + p.c + '" stroke-width="22" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"/>'; off += len; });
    const w = h('div', { class: 'chart-card', style: { display: 'flex', gap: '18px', alignItems: 'center' } }); w.innerHTML = '<svg viewBox="0 0 140 140" style="width:150px;flex:none">' + g + '</svg><div>' + parts.map(p => '<div style="margin:6px 0"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + p.c + ';margin-left:8px"></i>' + p.l + ' <b>' + fmt(p.v) + '</b></div>').join('') + '</div>'; return w;
  }
  MZ.pages.home = P.home = async () => {
    const root = await orig(); const extra = h('div', { class: 'dash-x' });
    const y = new Date().getFullYear(); const jobs = await Promise.allSettled([GET('/gl/statements?from=' + y + '-01-01&to=' + today()), GET('/inv/stock'), monthly()]);
    try { if (jobs[2].status === 'fulfilled') extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'الإيرادات والمصروفات آخر 6 شهور'), chart(jobs[2].value))); } catch (e) {}
    const st = jobs[0].status === 'fulfilled' ? jobs[0].value : null, inv = jobs[1].status === 'fulfilled' ? jobs[1].value : null;
    if (st) { const I = st.income, mx = Math.max(I.total_revenue, I.total_expense, Math.abs(I.net), 1); extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'الموقف المالي منذ بداية ' + y), h('div', { class: 'pb' }, bar('الإيرادات', I.total_revenue, mx, '#3547e0'), bar('المصروفات', I.total_expense, mx, '#f0457a'), bar('صافي الربح', Math.abs(I.net), mx, I.net >= 0 ? '#3547e0' : '#b3261e'), bar('النقدية', Math.abs(st.cash), mx, '#0f1437')))); }
    if (inv) { try { const cats = {}; inv.rows.forEach(r => { const k = r.category || r.name || '-'; cats[k] = (cats[k] || 0) + (+r.value || 0); }); const cl = ['#3547e0', '#7a5af8', '#0ea5e9', '#14b8a6', '#f0457a', '#64748b']; const parts = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map((e, i) => ({ l: e[0], v: e[1], c: cl[i] })).filter(p => p.v > 0); if (parts.length) extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'توزيع قيمة المخزون'), donut(parts))); } catch (e) {} const low = inv.rows.filter(r => r.low); extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'المخزون: القيمة ' + fmt(inv.total_value)), h('div', { class: 'pb' }, low.length ? low.map(r => h('div', { class: 'alert-line' }, '⚠ ' + r.name + ': الرصيد ' + r.qty + ' (الحد ' + r.min_qty + ')')) : (inv.rows.length ? '✔ لا توجد أصناف تحت الحد الأدنى' : 'لا أصناف بعد. أضف من: المخزون ثم الأصناف والمخازن.')))); }
    const qa = [['📥', 'استلام قماش', 'store'], ['✂', 'أمر قص', 'orders'], ['💰', 'مقبوضة', 'payments'], ['📒', 'قيد يومية', 'gl_journal'], ['📦', 'المخزون', 'inv_stock'], ['🧾', 'الإقفال اليومي', 'daily_close']].filter(x => MZ.pages[x[2]]);
    extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'اختصارات سريعة'), h('div', { class: 'pb qa' }, qa.map(x => h('button', { class: 'qa-b', onclick: () => openPage(x[2]) }, h('span', null, x[0]), x[1])))));
    root.append(extra); return root;
  };
})();
