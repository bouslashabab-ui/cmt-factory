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
  /* ---------- fixed assets: register + straight-line monthly depreciation ---------- */
  P2.assets = async () => {
    const root = h('div');
    let list = await GET('/gl2/assets');
    const kpiBox = h('div', { class: 'kpis' }), chartBox = h('div'), tblBox = h('div'), formBox = h('div'), runBox = h('div'), histBox = h('div');
    const renderList = () => {
      const totC = r2c(list.reduce((s, a) => s + a.cost, 0)), totA = r2c(list.reduce((s, a) => s + a.acc_dep, 0)), totN = r2c(list.reduce((s, a) => s + a.nbv, 0));
      kpiBox.innerHTML = '';
      kpiBox.append(VZ.kpiD('عدد الأصول', list.length, undefined, undefined, false), VZ.kpiD('إجمالي التكلفة', totC), VZ.kpiD('مجمع الإهلاك', totA), VZ.kpiD('صافي القيمة الدفترية', totN));
      chartBox.innerHTML = '';
      const byCat = {}; list.forEach(a => { const k = a.category || 'بدون فئة'; byCat[k] = r2c((byCat[k] || 0) + a.cost); });
      if (list.length) chartBox.append(
        VZ.donut('توزيع التكلفة حسب الفئة', Object.keys(byCat).map(k => ({ l: k, v: byCat[k] }))),
        VZ.hbars('أعلى الأصول قيمة دفترية', list.map(a => ({ l: a.name.slice(0, 30), v: a.nbv })).sort((x, y) => y.v - x.v).slice(0, 6)));
      tblBox.innerHTML = '';
      tblBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'سجل الأصول الثابتة'), table([
        { t: 'الأصل', f: a => a.name }, { t: 'الفئة', f: a => a.category || '—' }, { t: 'تاريخ الشراء', f: a => a.purchase_date || '' },
        { t: 'التكلفة', cls: 'num', f: a => fmt(a.cost) }, { t: 'الخردة', cls: 'num', f: a => fmt(a.salvage) },
        { t: 'العمر (سنة)', cls: 'num', f: a => a.life_years }, { t: 'قسط شهري', cls: 'num', f: a => fmt(a.monthly) },
        { t: 'مجمع الإهلاك', cls: 'num', f: a => fmt(a.acc_dep) }, { t: 'صافي القيمة', cls: 'num', f: a => fmt(a.nbv) },
        { t: 'الحالة', f: a => a.fully_depreciated ? h('span', { class: 'okb' }, 'مُهلك بالكامل') : h('span', { class: 'okb ok' }, 'نشط') }
      ], list, { empty: 'لا توجد أصول مسجلة بعد — أضف أول أصل من النموذج أدناه' })));
    };
    if (canW()) {
      const nm = h('input', { type: 'text', placeholder: 'مثال: ماكينة قص أوتوماتيك' });
      const cat = h('input', { type: 'text', placeholder: 'مثال: ماكينات ومعدات' });
      const pd = h('input', { type: 'date', value: today() });
      const cost = h('input', { type: 'number', step: 'any', placeholder: 'تكلفة الشراء' });
      const salv = h('input', { type: 'number', step: 'any', value: 0 });
      const life = h('input', { type: 'number', step: 'any', value: 10 });
      const pay = h('select', { class: 'inp' },
        h('option', { value: '' }, 'بدون قيد — مسجّل سابقًا في الدفاتر'),
        h('option', { value: '1100' }, '1100 الصندوق (نقدًا)'),
        h('option', { value: '1110' }, '1110 البنك (تحويل بنكي)'),
        h('option', { value: '2100' }, '2100 الموردون (على الحساب)'));
      const add = guard(async () => {
        if (!(await confirmBox('تسجيل الأصل "' + nm.value + '" بتكلفة ' + fmt(+cost.value) + '؟'))) return;
        const r = await POST('/gl2/assets', { name: nm.value, category: cat.value, purchase_date: pd.value, cost: +cost.value, salvage: +salv.value, life_years: +life.value, pay_account: pay.value || null });
        toast(r.entry ? 'سُجّل الأصل وقيد الشراء رقم ' + r.entry.no + ' ✔' : 'سُجّل الأصل ✔');
        nm.value = ''; cat.value = ''; cost.value = ''; salv.value = 0; life.value = 10;
        list = await GET('/gl2/assets'); renderList();
      });
      formBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'إضافة أصل ثابت'), h('div', { class: 'filters' },
        h('label', null, h('span', null, 'اسم الأصل'), nm), h('label', null, h('span', null, 'الفئة'), cat),
        h('label', null, h('span', null, 'تاريخ الشراء'), pd), h('label', null, h('span', null, 'التكلفة'), cost),
        h('label', null, h('span', null, 'قيمة الخردة'), salv), h('label', null, h('span', null, 'العمر الإنتاجي (سنوات)'), life),
        h('label', null, h('span', null, 'طريقة السداد / القيد'), pay), btn('➕ تسجيل الأصل', add, 'pri'))));
    }
    const moIn = h('input', { type: 'month', value: today().slice(0, 7) });
    const pvBox = h('div'), okBox = h('div');
    let pv = null;
    const loadHist = guard(async () => {
      const rs = await GET('/gl2/depruns'); histBox.innerHTML = '';
      histBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'سجل الإهلاكات المرحّلة'), table([
        { t: 'الشهر', f: r => VZ.monthLabel(r.month) }, { t: 'الأصل', f: r => r.asset_name }, { t: 'القسط', cls: 'num', f: r => fmt(r.amount) },
        { t: 'قيد', cls: 'num', f: r => r.entry_no || '' }, { t: 'وقت الترحيل', k: 'created_at' }
      ], rs, { empty: 'لا توجد إهلاكات مرحّلة بعد' })));
    });
    const run = guard(async () => {
      if (!pv || !(await confirmBox('ترحيل إهلاك شهر ' + moIn.value + ' بإجمالي ' + fmt(pv.due_total) + '؟ سيُنشأ قيد تسوية لكل أصل.'))) return;
      const r = await POST('/gl2/depreciation', { month: moIn.value });
      toast(r.posted ? 'رُحّل إهلاك ' + r.posted + ' أصل بإجمالي ' + fmt(r.total) + ' ✔' : 'لا يوجد إهلاك مستحق لهذا الشهر');
      list = await GET('/gl2/assets'); renderList(); await preview(); await loadHist();
    });
    const preview = guard(async () => {
      pv = await GET('/gl2/depreciation?month=' + moIn.value);
      pvBox.innerHTML = ''; okBox.innerHTML = '';
      pvBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'إهلاك شهر ' + VZ.monthLabel(pv.month) + ' — القيد بتاريخ ' + pv.month_end), table([
        { t: 'الأصل', f: i => i.name }, { t: 'الفئة', f: i => i.category || '—' }, { t: 'مجمع سابق', cls: 'num', f: i => fmt(i.acc_dep) },
        { t: 'قسط هذا الشهر', cls: 'num', f: i => i.posted ? '' : fmt(i.due) },
        { t: 'الحالة', f: i => i.posted ? h('span', { class: 'okb ok' }, 'مرحّل هذا الشهر') : (i.due > 0 ? h('span', { class: 'okb' }, 'مستحق') : h('span', { class: 'okb' }, 'مُهلك بالكامل')) }
      ], pv.items, { empty: 'لا توجد أصول نشطة مستحقة لهذا الشهر' })));
      const pending = pv.items.filter(i => !i.posted && i.due > 0);
      okBox.append(h('div', { class: 'panel' }, h('div', { class: 'pb' },
        pv.future ? h('span', { class: 'okb bad' }, '✖ لا يمكن ترحيل إهلاك شهر في المستقبل')
          : pending.length ? h('span', null, h('span', { class: 'okb ok' }, 'إجمالي مستحق الترحيل: ' + fmt(pv.due_total)), ' ', canW() ? btn('✅ ترحيل إهلاك ' + VZ.monthLabel(pv.month), run, 'pri') : null)
            : h('span', { class: 'okb ok' }, '✔ لا يوجد إهلاك مستحق لهذا الشهر'))));
    });
    root.append(pageHead('🏗️ الأصول الثابتة والإهلاك', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
      note('سجّل أصول المصنع الثابتة (ماكينات، معدات، سيارات) ودع النظام يحسب إهلاك القسط الثابت شهريًا ويرحّله بقيد تسوية (مدين 5600 مصروف إهلاك / دائن 1590 مجمع الإهلاك). يبدأ الإهلاك من شهر الشراء ويتوقف عند الوصول لقيمة الخردة. عند إضافة أصل يمكنك إنشاء قيد الشراء تلقائيًا أو تسجيله دون قيد إن كان مسجلًا سابقًا.'),
      kpiBox, chartBox, tblBox, formBox,
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'ترحيل الإهلاك الشهري'), h('div', { class: 'filters' }, h('label', null, h('span', null, 'الشهر'), moIn), btn('عرض المستحق', preview, 'pri')), okBox, pvBox),
      histBox);
    renderList(); await loadHist();
    return root;
  };
  Object.assign(MZ.pages, P2);
})();
