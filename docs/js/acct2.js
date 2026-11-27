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
  /* ---------- stage 4: accrued payroll + prepaid expenses + accrued expenses ---------- */
  const EXP_OPTS = [['5200', 'مصروفات تشغيل عامة'], ['5300', 'إيجار'], ['5400', 'كهرباء ومياه'], ['5500', 'صيانة'], ['5700', 'رواتب وأجور إدارية'], ['5900', 'مصروفات متنوعة']];
  const PAY_OPTS = [['1100', 'الصندوق (نقدًا)'], ['1110', 'البنك (تحويل بنكي)']];
  const selOf = (opts, first) => h('select', { class: 'inp' }, (first ? [h('option', { value: '' }, first)] : []).concat(opts.map(o => h('option', { value: o[0] }, o[0] + ' ' + o[1]))));
  P2.accruals = async () => {
    const root = h('div');
    const kpiBox = h('div', { class: 'kpis' });
    const refreshKpis = async () => {
      const [pa, pr, ac] = await Promise.all([GET('/gl2/payroll-accruals'), GET('/gl2/prepaids'), GET('/gl2/accruals')]);
      kpiBox.innerHTML = '';
      kpiBox.append(
        VZ.kpiD('رواتب مستحقة غير مسددة', r2c(pa.reduce((s, x) => s + (x.net - x.paid_amount), 0))),
        VZ.kpiD('مصروفات مقدمة متبقية', r2c(pr.reduce((s, x) => s + x.remaining, 0))),
        VZ.kpiD('مصروفات مستحقة غير مسددة', r2c(ac.filter(x => !x.settled).reduce((s, x) => s + x.amount, 0))),
        VZ.kpiD('أشهر رواتب مرحّلة', pa.length, undefined, undefined, false));
      return { pa, pr, ac };
    };
    /* --- payroll accrual --- */
    const pym = h('input', { type: 'month', value: today().slice(0, 7) });
    const pInfo = h('div'), pAct = h('div'), pHist = h('div');
    let pData = null;
    const loadPayrollHist = guard(async () => {
      const rs = await GET('/gl2/payroll-accruals'); pHist.innerHTML = '';
      pHist.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'سجل استحقاقات الرواتب'), table([
        { t: 'الشهر', f: r => VZ.monthLabel(r.ym) }, { t: 'الإجمالي', cls: 'num', f: r => fmt(+r.gross) }, { t: 'الصافي', cls: 'num', f: r => fmt(+r.net) },
        { t: 'المسدد', cls: 'num', f: r => fmt(+r.paid_amount) }, { t: 'المتبقي', cls: 'num', f: r => fmt(r2c(r.net - r.paid_amount)) },
        { t: 'قيد', cls: 'num', f: r => r.entry_no || '' }, { t: 'الحالة', f: r => +r.net - +r.paid_amount > 0.004 ? h('span', { class: 'okb' }, 'غير مسددة بالكامل') : h('span', { class: 'okb ok' }, 'مسددة') }
      ], rs, { empty: 'لا توجد استحقاقات مرحّلة بعد' })));
    });
    const payNow = guard(async () => {
      const outstanding = pData && pData.accrual ? pData.accrual.outstanding : 0;
      if (!(await confirmBox('سداد ' + fmt(outstanding) + ' رواتب شهر ' + pym.value + '؟'))) return;
      const r = await POST('/gl2/payroll-pay', { ym: pym.value, pay_account: paySel.value || '1100' });
      toast('سُدد ' + fmt(r.amount) + ' — المتبقي ' + fmt(r.outstanding) + ' ✔');
      await showPayroll(); await loadPayrollHist(); await refreshKpis();
    });
    const accrueNow = guard(async () => {
      if (!(await confirmBox('ترحيل استحقاق رواتب شهر ' + pym.value + ' بصافي ' + fmt(pData.calc.net) + '؟'))) return;
      const r = await POST('/gl2/payroll-accrual', { ym: pym.value });
      toast('رُحّل الاستحقاق بقيد رقم ' + r.entry.no + ' ✔');
      await showPayroll(); await loadPayrollHist(); await refreshKpis();
    });
    const paySel = selOf(PAY_OPTS);
    const showPayroll = guard(async () => {
      pData = await GET('/gl2/payroll-accrual?ym=' + pym.value);
      const c = pData.calc; pInfo.innerHTML = ''; pAct.innerHTML = '';
      pInfo.append(h('div', { class: 'kpis' }, VZ.kpiD('إجمالي المستحق', c.gross), VZ.kpiD('السلف (تُسترد)', c.advances), VZ.kpiD('خصومات أخرى', c.other_ded), VZ.kpiD('صافي الرواتب', c.net)));
      const st = pData.accrual;
      pAct.append(h('div', { class: 'panel' }, h('div', { class: 'pb' },
        pData.future ? h('span', { class: 'okb bad' }, '✖ لا يمكن استحقاق رواتب شهر في المستقبل')
          : !st ? h('span', null, h('span', { class: 'okb' }, c.gross > 0 ? 'غير مرحّل — القيد سيكون بتاريخ ' + pData.month_end : 'لا توجد رواتب مستحقة لهذا الشهر'), ' ', c.gross > 0 && canW() ? btn('✅ ترحيل الاستحقاق', accrueNow, 'pri') : null)
          : h('span', null, h('span', { class: 'okb ok' }, 'مرحّل بقيد رقم ' + (st.entry_no || '') + ' — المتبقي ' + fmt(st.outstanding)), ' ', st.outstanding > 0.004 && canW() ? btn('💵 سداد الرواتب', payNow, 'pri') : null, st.outstanding > 0.004 ? h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', marginInlineStart: '8px' } }, h('span', null, 'من'), paySel) : null))));
    });
    /* --- prepaid expenses --- */
    const prName = h('input', { type: 'text', placeholder: 'مثال: إيجار مدفوع مقدمًا عن سنة' });
    const prExp = selOf(EXP_OPTS); prExp.value = '5300';
    const prStart = h('input', { type: 'month', value: today().slice(0, 7) });
    const prMonths = h('input', { type: 'number', value: 12, min: 1, max: 60 });
    const prTotal = h('input', { type: 'number', step: 'any', placeholder: 'إجمالي المبلغ المدفوع' });
    const prPay = selOf(PAY_OPTS, 'بدون قيد — مسجّل سابقًا');
    const prTbl = h('div'), amBox = h('div'), amAct = h('div'), amHist = h('div');
    const loadPrepaids = guard(async () => {
      const rs = await GET('/gl2/prepaids'); prTbl.innerHTML = '';
      prTbl.append(table([
        { t: 'المصروف', f: r => r.name }, { t: 'حساب المصروف', f: r => r.expense_name }, { t: 'من شهر', f: r => VZ.monthLabel(r.start_month) },
        { t: 'شهور', cls: 'num', f: r => r.months }, { t: 'الإجمالي', cls: 'num', f: r => fmt(r.total) }, { t: 'شهريًا', cls: 'num', f: r => fmt(r.monthly) },
        { t: 'المستهلك', cls: 'num', f: r => fmt(r.amortized) }, { t: 'المتبقي', cls: 'num', f: r => fmt(r.remaining) },
        { t: 'الحالة', f: r => r.done ? h('span', { class: 'okb' }, 'مستهلك بالكامل') : h('span', { class: 'okb ok' }, 'نشط') }
      ], rs, { empty: 'لا توجد مصروفات مقدمة — أضف أول واحد أعلاه' }));
    });
    const addPrepaid = guard(async () => {
      if (!(await confirmBox('تسجيل مصروف مقدم "' + prName.value + '" بإجمالي ' + fmt(+prTotal.value) + ' على ' + prMonths.value + ' شهر؟'))) return;
      const r = await POST('/gl2/prepaids', { name: prName.value, expense_account: prExp.value, start_month: prStart.value, months: +prMonths.value, total: +prTotal.value, pay_account: prPay.value || null });
      toast(r.entry ? 'سُجّل وقُيّد الدفع رقم ' + r.entry.no + ' ✔' : 'سُجّل ✔');
      prName.value = ''; prTotal.value = '';
      await loadPrepaids(); await refreshKpis();
    });
    const amMonth = h('input', { type: 'month', value: today().slice(0, 7) });
    let amPv = null;
    const loadAmortHist = guard(async () => {
      const rs = await GET('/gl2/amorts'); amHist.innerHTML = '';
      amHist.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'سجل الاستهلاك الشهري'), table([
        { t: 'الشهر', f: r => VZ.monthLabel(r.month) }, { t: 'المصروف', f: r => r.prepaid_name }, { t: 'المبلغ', cls: 'num', f: r => fmt(+r.amount) },
        { t: 'قيد', cls: 'num', f: r => r.entry_no || '' }, { t: 'وقت الترحيل', k: 'created_at' }
      ], rs, { empty: 'لا يوجد استهلاك مرحّل بعد' })));
    });
    const runAmort = guard(async () => {
      if (!amPv || !(await confirmBox('ترحيل استهلاك شهر ' + amMonth.value + ' بإجمالي ' + fmt(amPv.due_total) + '؟'))) return;
      const r = await POST('/gl2/amortize', { month: amMonth.value });
      toast(r.posted ? 'رُحّل استهلاك ' + r.posted + ' بإجمالي ' + fmt(r.total) + ' ✔' : 'لا يوجد استهلاك مستحق');
      await loadPrepaids(); await previewAmort(); await loadAmortHist(); await refreshKpis();
    });
    const previewAmort = guard(async () => {
      amPv = await GET('/gl2/amortize?month=' + amMonth.value);
      amBox.innerHTML = ''; amAct.innerHTML = '';
      amBox.append(table([
        { t: 'المصروف', f: i => i.name }, { t: 'المستهلك', cls: 'num', f: i => fmt(i.amortized) }, { t: 'هذا الشهر', cls: 'num', f: i => i.posted ? '' : fmt(i.due) },
        { t: 'الحالة', f: i => i.posted ? h('span', { class: 'okb ok' }, 'مرحّل هذا الشهر') : h('span', { class: 'okb' }, 'مستحق') }
      ], amPv.items, { empty: 'لا يوجد استهلاك مستحق لهذا الشهر' }));
      const pending = amPv.items.filter(i => !i.posted && i.due > 0);
      amAct.append(h('div', { class: 'pb' },
        amPv.future ? h('span', { class: 'okb bad' }, '✖ لا يمكن ترحيل شهر في المستقبل')
          : pending.length ? h('span', null, h('span', { class: 'okb ok' }, 'إجمالي مستحق: ' + fmt(amPv.due_total)), ' ', canW() ? btn('✅ ترحيل الاستهلاك', runAmort, 'pri') : null)
          : h('span', { class: 'okb ok' }, '✔ لا يوجد استهلاك مستحق لهذا الشهر')));
    });
    /* --- accrued expenses --- */
    const acName = h('input', { type: 'text', placeholder: 'مثال: فاتورة كهرباء ديسمبر' });
    const acExp = selOf(EXP_OPTS);
    const acMonth = h('input', { type: 'month', value: today().slice(0, 7) });
    const acAmt = h('input', { type: 'number', step: 'any', placeholder: 'المبلغ المستحق' });
    const acTbl = h('div');
    const acPay = selOf(PAY_OPTS);
    const loadAccruals = guard(async () => {
      const rs = await GET('/gl2/accruals'); acTbl.innerHTML = '';
      const settle = (r) => guard(async () => {
        if (!(await confirmBox('سداد "' + r.name + '" بمبلغ ' + fmt(r.amount) + '؟'))) return;
        const res = await POST('/gl2/accrual-settle', { id: r.id, pay_account: acPay.value || '1100' });
        toast('سُدد بقيد رقم ' + res.entry.no + ' ✔');
        await loadAccruals(); await refreshKpis();
      })();
      acTbl.append(table([
        { t: 'المصروف', f: r => r.name }, { t: 'الحساب', f: r => r.expense_name }, { t: 'شهر الاستحقاق', f: r => VZ.monthLabel(r.month) },
        { t: 'المبلغ', cls: 'num', f: r => fmt(r.amount) }, { t: 'قيد الاستحقاق', cls: 'num', f: r => r.entry_no || '' },
        { t: 'الحالة', f: r => r.settled ? h('span', { class: 'okb ok' }, 'مسدد — قيد ' + (r.settled_entry_no || '')) : h('span', { class: 'okb' }, 'غير مسدد') },
        { t: '', f: r => !r.settled && canW() ? btn('💵 سداد', () => settle(r)) : null }
      ], rs, { empty: 'لا توجد مصروفات مستحقة — أضف أول واحد أعلاه' }));
    });
    const addAccrual = guard(async () => {
      if (!(await confirmBox('تسجيل مصروف مستحق "' + acName.value + '" بمبلغ ' + fmt(+acAmt.value) + ' عن شهر ' + acMonth.value + '؟'))) return;
      const r = await POST('/gl2/accruals', { name: acName.value, expense_account: acExp.value, month: acMonth.value, amount: +acAmt.value });
      toast('سُجّل بقيد رقم ' + r.entry.no + ' ✔');
      acName.value = ''; acAmt.value = '';
      await loadAccruals(); await refreshKpis();
    });
    root.append(pageHead('📆 الاستحقاقات: رواتب ومصروفات مقدمة ومستحقة', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
      note('ثلاث أدوات بقيد آلي: (1) استحقاق الرواتب — يحسب رواتب الشهر من الحضور ويرحّلها بقيد تسوية (مدين 5100 / دائن 2300 رواتب مستحقة، والسلف تُسترد على 1150)، ثم سدادها لاحقًا. (2) المصروفات المدفوعة مقدمًا — تُسجّل على 1400 وتُستهلك شهريًا بالتساوي. (3) المصروفات المستحقة — تُسجّل (مدين المصروف / دائن 2200) وتُسوّى عند السداد.'),
      kpiBox,
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, '1) استحقاق الرواتب الشهرية'), h('div', { class: 'filters' }, h('label', null, h('span', null, 'الشهر'), pym), btn('عرض الرواتب', showPayroll, 'pri')), pInfo, pAct),
      pHist,
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, '2) المصروفات المدفوعة مقدمًا'), canW() ? h('div', { class: 'filters' },
        h('label', null, h('span', null, 'اسم المصروف'), prName), h('label', null, h('span', null, 'حساب المصروف'), prExp),
        h('label', null, h('span', null, 'من شهر'), prStart), h('label', null, h('span', null, 'عدد الشهور'), prMonths),
        h('label', null, h('span', null, 'الإجمالي'), prTotal), h('label', null, h('span', null, 'الدفع'), prPay),
        btn('➕ تسجيل', addPrepaid, 'pri')) : null, prTbl,
        h('div', { class: 'filters', style: { marginTop: '8px' } }, h('label', null, h('span', null, 'شهر الاستهلاك'), amMonth), btn('عرض المستحق', previewAmort, 'pri')),
        amAct, amBox),
      amHist,
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, '3) المصروفات المستحقة'), canW() ? h('div', { class: 'filters' },
        h('label', null, h('span', null, 'اسم المصروف'), acName), h('label', null, h('span', null, 'الحساب'), acExp),
        h('label', null, h('span', null, 'شهر الاستحقاق'), acMonth), h('label', null, h('span', null, 'المبلغ'), acAmt),
        h('label', null, h('span', null, 'حساب السداد'), acPay), btn('➕ تسجيل', addAccrual, 'pri')) : null, acTbl));
    await refreshKpis(); await loadPayrollHist(); await loadPrepaids(); await loadAmortHist(); await loadAccruals(); await showPayroll();
    return root;
  };

  /* ---------- VAT center: taxable docs, periodic return, settlement ---------- */
  P2.vat = async () => {
    const root = h('div');
    const accs = await GET('/gl/accounts');
    const revOpts = accs.filter(a => a.type === 'revenue').map(a => [a.code, a.name]);
    const expOpts = accs.filter(a => a.type === 'expense' || a.type === 'asset').map(a => [a.code, a.name]);
    const kindSel = h('select', { class: 'inp' }, h('option', { value: 'sale' }, 'بيع (ضريبة مخرجات)'), h('option', { value: 'purchase' }, 'شراء (ضريبة مدخلات)'));
    const dIn = h('input', { type: 'date', value: today() });
    const partyIn = h('input', { type: 'text', placeholder: 'اسم العميل / المورد' });
    const amtIn = h('input', { type: 'number', step: 'any', placeholder: 'المبلغ' });
    const rateIn = h('input', { type: 'number', step: 'any', value: 14, min: 0, max: 100, style: { width: '90px' } });
    const incCb = h('input', { type: 'checkbox', class: 'chk' });
    const netSel = selOf(revOpts), settleSel = h('select', { class: 'inp' });
    const SETTLE = { sale: [['1200', 'آجل - العملاء (مدينون)'], ['1100', 'الصندوق (نقدًا)'], ['1110', 'البنك (تحويل بنكي)']], purchase: [['2100', 'آجل - الموردون (دائنون)'], ['1100', 'الصندوق (نقدًا)'], ['1110', 'البنك (تحويل بنكي)']] };
    const preview = h('div', { class: 'panel' }, h('div', { class: 'pb' }, h('small', { style: { color: 'var(--mut)' } }, 'أدخل المبلغ لمعاينة القيد قبل التسجيل')));
    const calc = () => {
      const amount = +amtIn.value || 0, rate = +rateIn.value || 0, inc = incCb.checked;
      const base = r2c(inc ? amount / (1 + rate / 100) : amount), vat = r2c(inc ? amount - base : base * rate / 100), total = r2c(base + vat);
      return { base, vat, total, ok: amount > 0 };
    };
    const updPreview = () => {
      const c = calc(); preview.innerHTML = '';
      if (!c.ok) { preview.append(h('div', { class: 'pb' }, h('small', { style: { color: 'var(--mut)' } }, 'أدخل المبلغ لمعاينة القيد قبل التسجيل'))); return; }
      const sale = kindSel.value === 'sale';
      preview.append(h('div', { class: 'pb' }, table([{ t: 'البند', f: x => x[0] }, { t: 'مدين', cls: 'num', f: x => x[1] ? fmt(x[1]) : '' }, { t: 'دائن', cls: 'num', f: x => x[2] ? fmt(x[2]) : '' }],
        sale ? [['التحصيل (' + settleSel.options[settleSel.selectedIndex].text + ')', c.total, 0], ['الإيراد (صافي)', 0, c.base], ['ض.ق.م - مخرجات', 0, c.vat]]
          : [[netSel.options[netSel.selectedIndex] ? netSel.options[netSel.selectedIndex].text : 'المصروف', c.base, 0], ['ض.ق.م - مدخلات', c.vat, 0], ['السداد (' + settleSel.options[settleSel.selectedIndex].text + ')', 0, c.total]],
        { foot: ['الإجمالي', fmt(c.total), fmt(c.total)] })));
    };
    const syncKind = () => {
      const sale = kindSel.value === 'sale';
      netSel.innerHTML = ''; (sale ? revOpts : expOpts).forEach(o => netSel.append(h('option', { value: o[0] }, o[0] + ' ' + o[1])));
      settleSel.innerHTML = ''; SETTLE[kindSel.value].forEach(o => settleSel.append(h('option', { value: o[0] }, o[1])));
      updPreview();
    };
    kindSel.addEventListener('change', syncKind);
    [amtIn, rateIn].forEach(el => el.addEventListener('input', updPreview));
    incCb.addEventListener('change', updPreview);
    netSel.addEventListener('change', updPreview); settleSel.addEventListener('change', updPreview);
    syncKind();
    const kpiBox = h('div', { class: 'kpis' });
    const rf = h('input', { type: 'date' }), rt = h('input', { type: 'date', value: today() });
    rf.value = today().slice(0, 4) + '-01-01';
    const repBox = h('div'), setBox = h('div'), histBox = h('div'), docsBox = h('div');
    let rep = null;
    const paySel = selOf(PAY_OPTS);
    const refreshKpis = async () => {
      const r = await GET('/gl2/vat-report');
      kpiBox.innerHTML = '';
      kpiBox.append(VZ.kpiD('ض. مخرجات مستحقة (رصيد)', r.balance_output), VZ.kpiD('ض. مدخلات قابلة للخصم (رصيد)', r.balance_input), VZ.kpiD('صافي المستحق للمصلحة', r.net_due, undefined, r.net_due <= 0));
      return r;
    };
    const settleNow = guard(async () => {
      if (!rep) return;
      if (!(await confirmBox('تسوية ضريبة حتى ' + rt.value + ': مخرجات ' + fmt(rep.balance_output) + '، يُخصم منها مدخلات ' + fmt(Math.min(rep.balance_output, rep.balance_input)) + '، ويُسدد صافي ' + fmt(rep.net_due) + '؟'))) return;
      const r = await POST('/gl2/vat-settle', { date: rt.value, pay_account: paySel.value });
      toast('سُويت الضريبة بقيد رقم ' + r.entry.no + ' — سُدد ' + fmt(r.paid) + ' ✔');
      await loadReport(); await refreshKpis(); await loadHist(); await loadDocs();
    });
    const loadReport = guard(async () => {
      rep = await GET('/gl2/vat-report?from=' + rf.value + '&to=' + rt.value);
      repBox.innerHTML = ''; setBox.innerHTML = '';
      repBox.append(h('div', { class: 'kpis' },
        VZ.kpiD('مبيعات الفترة (صافي)', rep.sales_base), VZ.kpiD('ضريبة المخرجات', rep.sales_vat),
        VZ.kpiD('مشتريات الفترة (صافي)', rep.purch_base), VZ.kpiD('ضريبة المدخلات', rep.purch_vat)));
      setBox.append(h('div', { class: 'panel' }, h('div', { class: 'pb' },
        h('span', null, 'أرصدة الضريبة حتى ' + rt.value + ': مخرجات ', h('b', null, fmt(rep.balance_output)), ' — مدخلات ', h('b', null, fmt(rep.balance_input)), ' — '),
        rep.net_due > 0 ? h('span', { class: 'okb bad' }, 'صافي مستحق للمصلحة ' + fmt(rep.net_due)) : h('span', { class: 'okb ok' }, rep.balance_output > 0 ? 'المدخلات تغطي المخرجات بالكامل' : (rep.carry_forward > 0 ? 'لا يوجد مستحق — رصيد مدخلات يُرحَّل ' + fmt(rep.carry_forward) : 'لا يوجد مستحق')),
        ' ', rep.balance_output > 0 && canW() ? h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } }, h('span', null, 'السداد من'), paySel) : null,
        ' ', rep.balance_output > 0 && canW() ? btn('🧾 تسوية وسداد الضريبة', settleNow, 'pri') : null)));
    });
    const loadHist = guard(async () => {
      const rs = await GET('/gl2/vat-settlements'); histBox.innerHTML = '';
      histBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'سجل التسويات'), table([
        { t: 'التاريخ', k: 'date' }, { t: 'المخرجات', cls: 'num', f: r => fmt(+r.output) }, { t: 'المدخلات المخصومة', cls: 'num', f: r => fmt(+r.input_used) },
        { t: 'المسدد نقدًا', cls: 'num', f: r => fmt(+r.paid) }, { t: 'قيد', cls: 'num', f: r => r.entry_no || '' }
      ], rs, { empty: 'لا توجد تسويات بعد' })));
    });
    const loadDocs = guard(async () => {
      const rs = await GET('/gl2/vat-docs?from=' + rf.value + '&to=' + rt.value); docsBox.innerHTML = '';
      docsBox.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'سجل المستندات الضريبية'), table([
        { t: 'التاريخ', k: 'date' }, { t: 'النوع', f: r => r.kind === 'sale' ? h('span', { class: 'okb ok' }, 'بيع') : h('span', { class: 'okb' }, 'شراء') },
        { t: 'الطرف', f: r => r.party || '' }, { t: 'الصافي', cls: 'num', f: r => fmt(+r.base) }, { t: 'الضريبة', cls: 'num', f: r => fmt(+r.vat) },
        { t: 'الإجمالي', cls: 'num', f: r => fmt(+r.total) }, { t: 'الحساب', f: r => r.account_name }, { t: 'السداد', f: r => r.settle_name }, { t: 'قيد', cls: 'num', f: r => r.entry_no || '' }
      ], rs, { empty: 'لا توجد مستندات في الفترة' })));
    });
    const addDoc = guard(async () => {
      const c = calc(); if (!c.ok) throw new Error('أدخل مبلغًا صحيحًا');
      const r = await POST('/gl2/vat-docs', { kind: kindSel.value, date: dIn.value, party: partyIn.value, amount: +amtIn.value, rate: +rateIn.value, vat_included: incCb.checked, net_account: netSel.value, settle_account: settleSel.value });
      toast('سُجل المستند بقيد رقم ' + r.entry.no + ' — ضريبة ' + fmt(r.vat) + ' ✔');
      partyIn.value = ''; amtIn.value = ''; updPreview();
      await loadDocs(); await loadReport(); await refreshKpis();
    });
    root.append(
      pageHead('🧾 ضريبة القيمة المضافة', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
      h('div', { class: 'panel' }, h('div', { class: 'pb' }, h('small', null, 'سجّل الفواتير الضريبية (بيع/شراء) بصافي المبلغ والضريبة (الافتراضي 14%)، وفي نهاية الفترة راجع الإقرار وسوِّ الضريبة بضغطة واحدة: تُخصم المدخلات من المخرجات ويُسدد الصافي، وأي مدخلات زائدة ترحّل للفترة التالية.'))),
      kpiBox,
      canW() ? h('div', { class: 'panel' }, h('div', { class: 'ph' }, '1) تسجيل مستند ضريبي'), h('div', { class: 'filters' },
        h('label', null, h('span', null, 'النوع'), kindSel), h('label', null, h('span', null, 'التاريخ'), dIn),
        h('label', null, h('span', null, 'الطرف'), partyIn), h('label', null, h('span', null, 'المبلغ'), amtIn),
        h('label', null, h('span', null, 'النسبة %'), rateIn),
        h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } }, incCb, h('span', null, 'المبلغ شامل الضريبة')),
        h('label', null, h('span', null, 'حساب الإيراد/المصروف'), netSel), h('label', null, h('span', null, 'السداد'), settleSel),
        btn('➕ تسجيل المستند', addDoc, 'pri')), preview) : null,
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, '2) إقرار الفترة والتسوية'), h('div', { class: 'filters' },
        h('label', null, h('span', null, 'من'), rf), h('label', null, h('span', null, 'إلى'), rt), btn('عرض الإقرار', loadReport, 'pri')), repBox, setBox),
      histBox, docsBox);
    await refreshKpis(); await loadReport(); await loadHist(); await loadDocs();
    return root;
  };
  Object.assign(MZ.pages, P2);
})();
