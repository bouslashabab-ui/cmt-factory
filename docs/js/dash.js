'use strict';
/* Dashboard extras: financial snapshot chart, inventory alerts, quick actions (no libraries) */
(function () {
  const orig = MZ.pages.home;
  const bar = (label, v, max, color) => h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, label), h('div', { class: 'bt' }, h('i', { style: { width: (max ? Math.max(2, Math.round(v / max * 100)) : 0) + '%', background: color } })), h('b', null, fmt(v)));
  MZ.pages.home = P.home = async () => {
    const root = await orig(); const extra = h('div', { class: 'dash-x' });
    const y = new Date().getFullYear(); const jobs = await Promise.allSettled([GET('/gl/statements?from=' + y + '-01-01&to=' + today()), GET('/inv/stock')]);
    const st = jobs[0].status === 'fulfilled' ? jobs[0].value : null, inv = jobs[1].status === 'fulfilled' ? jobs[1].value : null;
    if (st) { const I = st.income, mx = Math.max(I.total_revenue, I.total_expense, Math.abs(I.net), 1); extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'الموقف المالي منذ بداية ' + y), h('div', { class: 'pb' }, bar('الإيرادات', I.total_revenue, mx, '#7fb800'), bar('المصروفات', I.total_expense, mx, '#e07a1f'), bar('صافي الربح', Math.abs(I.net), mx, I.net >= 0 ? '#1d6b3a' : '#b3261e'), bar('النقدية', Math.abs(st.cash), mx, '#2b4a45')))); }
    if (inv) { const low = inv.rows.filter(r => r.low); extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'المخزون: القيمة ' + fmt(inv.total_value)), h('div', { class: 'pb' }, low.length ? low.map(r => h('div', { class: 'alert-line' }, '⚠ ' + r.name + ': الرصيد ' + r.qty + ' (الحد ' + r.min_qty + ')')) : (inv.rows.length ? '✔ لا توجد أصناف تحت الحد الأدنى' : 'لا أصناف بعد. أضف من: المخزون ثم الأصناف والمخازن.')))); }
    const qa = [['📥', 'استلام قماش', 'store'], ['✂', 'أمر قص', 'orders'], ['💰', 'مقبوضة', 'payments'], ['📒', 'قيد يومية', 'gl_journal'], ['📦', 'المخزون', 'inv_stock'], ['🧾', 'الإقفال اليومي', 'daily_close']].filter(x => MZ.pages[x[2]]);
    extra.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'اختصارات سريعة'), h('div', { class: 'pb qa' }, qa.map(x => h('button', { class: 'qa-b', onclick: () => openPage(x[2]) }, h('span', null, x[0]), x[1])))));
    root.append(extra); return root;
  };
})();
