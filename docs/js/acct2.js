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
  /* ---------- bank reconciliation: match GL bank account 1110 with the bank statement ---------- */
  const r2c = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  P2.bank_rec = async () => {
    const root = h('div'); let data = null; const sel = new Set();
    const dIn = h('input', { type: 'date', value: today() });
    const sbIn = h('input', { type: 'number', step: 'any', placeholder: 'الرصيد كما في كشف البنك' });
    const kpiBox = h('div', { class: 'kpis' }), footBox = h('div'), tblBox = h('div'), statBox = h('div'), histBox = h('div');
    const absL = (l) => Math.abs(l.debit - l.credit);
    const netOf = () => !data ? 0 : r2c(data.lines.reduce((s, l) => sel.has(l.line_id) ? s + l.debit - l.credit : s, 0));
    const save = guard(async () => {
      if (!(await confirmBox('اعتماد التسوية البنكية بتاريخ ' + dIn.value + ' برصيد ' + fmt(+sbIn.value) + '؟'))) return;
      const r = await POST('/gl2/bankrec', { date: dIn.value, statement_balance: +sbIn.value, line_ids: [...sel] });
      toast('اعتُمدت التسوية: ' + r.newly_cleared + ' حركة جديدة ✔'); await load(); await loadHist();
    });
    const upd = () => {
      if (!data) return;
      const net = netOf(); const sb = sbIn.value === '' ? null : r2c(+sbIn.value);
      const diff = sb === null ? null : r2c(sb - net);
      kpiBox.innerHTML = '';
      kpiBox.append(VZ.kpiD('رصيد البنك بالدفاتر', data.book), VZ.kpiD('صافي المحدد للمطابقة', net), VZ.kpiD('رصيد كشف البنك', sb === null ? 0 : sb), VZ.kpiD('الفرق', diff === null ? 0 : Math.abs(diff), undefined, false));
      footBox.innerHTML = '';
      if (diff === null) footBox.append(h('div', { class: 'panel' }, h('div', { class: 'pb' }, h('span', { class: 'okb' }, 'أدخل رصيد كشف البنك لحساب الفرق لحظيًا'))));
      else footBox.append(h('div', { class: 'panel' }, h('div', { class: 'pb' },
        Math.abs(diff) < 0.005 ? h('span', { class: 'okb ok' }, '✔ متوازن: كشف البنك يطابق الحركات المحددة') : h('span', { class: 'okb bad' }, '✖ الفرق ' + fmt(diff) + ' — راجع التحديد أو سجّل حركات البنك الناقصة (عمولات، فوائد) بقيد يومية أولًا'),
        ' ', Math.abs(diff) < 0.005 && canW() ? btn('✅ اعتماد التسوية', save, 'pri') : null)));
    };
    const render = () => {
      tblBox.innerHTML = '';
      const cb = (l) => { const c = h('input', { type: 'checkbox', class: 'chk' }); c.checked = sel.has(l.line_id); if (l.cleared) c.disabled = true; else c.addEventListener('change', () => { if (c.checked) sel.add(l.line_id); else sel.delete(l.line_id); upd(); }); return c; };
      tblBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'حركات حساب البنك (1110) حتى ' + data.to), table([
        { t: '✔', f: l => cb(l) }, { t: 'التاريخ', k: 'date' }, { t: 'قيد', k: 'no' }, { t: 'البيان', f: l => l.memo || '' },
        { t: 'إيداع (مدين)', cls: 'num', f: l => l.debit ? fmt(l.debit) : '' }, { t: 'سحب (دائن)', cls: 'num', f: l => l.credit ? fmt(l.credit) : '' },
        { t: 'الحالة', f: l => l.cleared ? h('span', { class: 'okb ok' }, 'معتمدة سابقًا' ) : '' }
      ], data.lines, { empty: 'لا توجد حركات بنكية حتى هذا التاريخ' })));
      statBox.innerHTML = '';
      const matched = data.lines.filter(l => l.cleared), un = data.lines.filter(l => !l.cleared);
      statBox.append(
        VZ.donut('قيمة الحركات حتى ' + data.to, [{ l: 'معتمدة (' + matched.length + ')', v: r2c(matched.reduce((s, l) => s + absL(l), 0)) }, { l: 'بانتظار المطابقة (' + un.length + ')', v: r2c(un.reduce((s, l) => s + absL(l), 0)) }]),
        VZ.hbars('أكبر الحركات غير المطابقة', un.map(l => ({ l: (l.memo || ('قيد رقم ' + l.no)).slice(0, 30), v: r2c(absL(l)) })).sort((a, b) => b.v - a.v).slice(0, 6)));
      upd();
    };
    const load = guard(async () => { data = await GET('/gl2/bankrec?to=' + dIn.value); sel.clear(); data.lines.forEach(l => { if (l.cleared) sel.add(l.line_id); }); render(); });
    const loadHist = guard(async () => {
      const rs = await GET('/gl2/bankrecs'); histBox.innerHTML = '';
      histBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'سجل التسويات السابقة'), table([
        { t: 'تاريخ الكشف', k: 'statement_date' }, { t: 'رصيد الكشف', cls: 'num', f: r => fmt(r.statement_balance) }, { t: 'صافي المطابق', cls: 'num', f: r => fmt(r.cleared_net) },
        { t: 'رصيد الدفاتر', cls: 'num', f: r => fmt(r.book_balance) }, { t: 'الفرق', cls: 'num', f: r => fmt(r.difference) }, { t: 'وقت التسجيل', k: 'created_at' }
      ], rs, { empty: 'لا توجد تسويات سابقة' })));
    });
    sbIn.addEventListener('input', upd);
    root.append(pageHead('🏦 التسوية البنكية', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
      note('طابِق حركات حساب البنك (1110) مع كشف البنك: أدخل تاريخ الكشف ورصيده، علّم الحركات الظاهرة فيه، واعتمد التسوية عندما يصبح الفرق صفرًا. الحركات المعتمدة في تسويات سابقة محفوظة ومحددة مسبقًا ولا يمكن إلغاؤها من هنا.'),
      h('div', { class: 'filters' }, h('label', null, h('span', null, 'تاريخ كشف البنك'), dIn), h('label', null, h('span', null, 'رصيد كشف البنك'), sbIn), btn('عرض الحركات', load, 'pri')),
      kpiBox, footBox, tblBox, statBox, histBox);
    await load(); await loadHist(); return root;
  };
  Object.assign(MZ.pages, P2);
})();
