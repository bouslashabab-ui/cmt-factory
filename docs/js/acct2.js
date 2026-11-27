'use strict';
/* Accounting extensions: cash flow statement, bank reconciliation, fixed assets, accruals, VAT, supplier statement */
(function () {
  const P2 = {};
  const sec = (title, rows, totalLabel, total) => h('div', { class: 'panel' }, h('div', { class: 'ph' }, title), table([{ t: 'البند', f: x => x.name }, { t: 'المبلغ', cls: 'num', f: x => (x.amount < 0 ? '(' + fmt(-x.amount) + ')' : fmt(x.amount)) }], rows, { foot: [totalLabel, total < 0 ? '(' + fmt(-total) + ')' : fmt(total)], empty: 'لا توجد حركة' }));
  const money = (n) => n < 0 ? '(' + fmt(-n) + ')' : fmt(n);
  P2.cash_flow = async () => {
    const r = dr(); const pr = VZ.prevRange(r.from, r.to);
    const [d, p] = await Promise.all([GET('/gl2/cashflow?from=' + r.from + '&to=' + r.to), GET('/gl2/cashflow?from=' + pr.from + '&to=' + pr.to)]);
    const inflow = d.months.reduce((s, m) => s + m.inflow, 0), outflow = d.months.reduce((s, m) => s + m.outflow, 0), pin = p.months.reduce((s, m) => s + m.inflow, 0), pout = p.months.reduce((s, m) => s + m.outflow, 0);
    const D = d.direct, I = d.indirect; const box = h('div');
    const direct = () => h('div', null, sec('أولًا: التدفقات النقدية من الأنشطة التشغيلية', D.operating, 'صافي التدفق التشغيلي', D.totals.operating), sec('ثانيًا: التدفقات النقدية من الأنشطة الاستثمارية', D.investing, 'صافي التدفق الاستثماري', D.totals.investing), sec('ثالثًا: التدفقات النقدية من الأنشطة التمويلية', D.financing, 'صافي التدفق التمويلي', D.totals.financing));
    const indirect = () => h('div', null,
      sec('أولًا: الأنشطة التشغيلية (الطريقة غير المباشرة)', [{ name: 'صافي ربح الفترة', amount: I.profit }].concat(I.adjustments), 'صافي التدفق التشغيلي', I.operating),
      sec('ثانيًا: الأنشطة الاستثمارية', I.investing, 'صافي التدفق الاستثماري', I.investing_total), sec('ثالثًا: الأنشطة التمويلية', I.financing, 'صافي التدفق التمويلي', I.financing_total));
    let mode = 'direct'; const seg = h('div', { class: 'seg' });
    const show = (m) => { mode = m; box.innerHTML = ''; box.append(m === 'direct' ? direct() : indirect()); seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); };
    [['direct', 'الطريقة المباشرة'], ['indirect', 'الطريقة غير المباشرة']].forEach(([m, t]) => seg.append(h('button', { 'data-m': m, onclick: () => show(m) }, t)));
    show('direct');
    const sum = h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'ملخص التغير في النقدية'), table([{ t: 'البند', f: x => x[0] }, { t: 'المبلغ', cls: 'num', f: x => x[1] }], [
      ['النقدية وما في حكمها أول الفترة (' + r.from + ')', money(d.opening)], ['صافي التدفق التشغيلي', money(D.totals.operating)], ['صافي التدفق الاستثماري', money(D.totals.investing)], ['صافي التدفق التمويلي', money(D.totals.financing)], ['صافي التغير في النقدية', money(d.net_change)]], { foot: ['النقدية وما في حكمها آخر الفترة (' + r.to + ')', money(d.closing)] }));
    const okTag = h('span', { class: 'okb ' + (d.check.direct_ok && d.check.indirect_ok ? 'ok' : 'bad') }, d.check.direct_ok && d.check.indirect_ok ? '✔ الطريقتان تطابقان رصيد الصندوق والبنك' : '✖ يوجد فرق: مباشر ' + fmt(d.check.diff_direct) + ' | غير مباشر ' + fmt(d.check.diff_indirect));
    return h('div', null, pageHead('💧 قائمة التدفقات النقدية', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())), rangeBar('cash_flow'),
      h('div', { class: 'kpis' }, VZ.kpiD('نقدية أول الفترة', d.opening, p.opening), VZ.kpiD('إجمالي المقبوضات', inflow, pin, true), VZ.kpiD('إجمالي المدفوعات', outflow, pout, false), VZ.kpiD('نقدية آخر الفترة', d.closing, p.closing, true)),
      VZ.bars('المقبوضات والمدفوعات شهريًا', d.months.map(m => ({ l: VZ.monthLabel(m.month), v: { in: m.inflow, out: m.outflow } })), [{ k: 'in', label: 'مقبوضات', color: '#3547e0' }, { k: 'out', label: 'مدفوعات', color: '#f0457a' }]),
      h('div', { class: 'panel' }, h('div', { class: 'pb' }, okTag, ' ', h('small', { style: { color: 'var(--mut)' } }, 'النقدية = الصندوق (1100) + البنك (1110). مقارنة الفترة السابقة: ' + pr.from + ' إلى ' + pr.to))), seg, box, sum);
  };
  Object.assign(MZ.pages, P2);
})();
