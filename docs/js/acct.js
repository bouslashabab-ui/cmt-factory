'use strict';
/* Accounting cycle: chart of accounts, journal, ledger, trial balance, statements, period close */
const GT = { asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
const KD = { normal: 'عادي', adjusting: 'تسوية', closing: 'إقفال' };
const dr = () => { const y = new Date().getFullYear(); return { from: MZ.glFrom || (y + '-01-01'), to: MZ.glTo || today() }; };
const rangeBar = (page) => { const r = dr(); const a = h('input', { type: 'date', value: r.from }), b = h('input', { type: 'date', value: r.to }); const go = () => { MZ.glFrom = a.value; MZ.glTo = b.value; openPage(page); }; return h('div', { class: 'rng' }, h('span', null, 'من'), a, h('span', null, 'إلى'), b, btn('تطبيق', go, 'sm')); };
P.gl_accounts = async () => {
  const rows = await GET('/gl/accounts');
  const add = () => { const g = formGrid([{ k: 'code', t: 'الكود (أرقام)', req: 1 }, { k: 'name', t: 'اسم الحساب', req: 1 }, { k: 'type', t: 'النوع', type: 'select', options: Object.keys(GT).map(k => ({ v: k, t: GT[k] })), def: 'expense' }]); modal('حساب جديد', g.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await POST('/gl/accounts', g.get()); c(); toast('تمت الإضافة'); openPage('gl_accounts'); } }]); };
  return h('div', null, pageHead('📚 دليل الحسابات', canW() ? btn('➕ حساب', add, 'pri') : null, btn('⬇ تصدير', () => exportChooser())), note('دليل حسابات جاهز لمصنع ملابس (أصول، التزامات، حقوق ملكية، إيرادات، مصروفات). يمكنك إضافة حسابات.'),
    table([{ t: 'الكود', k: 'code' }, { t: 'الحساب', k: 'name' }, { t: 'النوع', f: r => GT[r.type] }], rows));
};
P.gl_journal = async () => {
  const r = dr(); let es = await GET('/gl/entries?from=' + r.from + '&to=' + r.to); let accs = await GET('/gl/accounts'); if (!Array.isArray(es)) es = []; if (!Array.isArray(accs)) accs = [];
  const newEntry = (kind) => {
    const date = h('input', { type: 'date', value: today() }), memo = h('input', { placeholder: 'البيان' }); const box = h('div'); const tot = h('div', { class: 'gl-tot' });
    const sel = () => h('select', null, h('option', { value: '' }, '-- حساب --'), accs.map(a => h('option', { value: a.id }, a.code + ' ' + a.name)));
    const rows = []; const upd = () => { const d = rows.reduce((s, x) => s + (+x.d.value || 0), 0), c = rows.reduce((s, x) => s + (+x.c.value || 0), 0); tot.textContent = 'المدين ' + fmt(d) + ' | الدائن ' + fmt(c) + (Math.abs(d - c) < 0.005 && d > 0 ? ' ✔ متزن' : ' ✖ غير متزن'); tot.style.color = Math.abs(d - c) < 0.005 && d > 0 ? '#2d6a2d' : '#b3261e'; };
    const addRow = () => { const x = { a: sel(), d: h('input', { type: 'number', step: '0.01', min: '0', placeholder: 'مدين', oninput: upd }), c: h('input', { type: 'number', step: '0.01', min: '0', placeholder: 'دائن', oninput: upd }) }; rows.push(x); box.append(h('div', { class: 'gl-row' }, x.a, x.d, x.c)); };
    addRow(); addRow(); upd();
    modal(kind === 'adjusting' ? 'قيد تسوية' : 'قيد يومية', h('div', null, h('div', { class: 'gl-row' }, date, memo), box, btn('+ سطر', addRow, 'sm'), tot), [{ t: 'ترحيل القيد', kind: 'pri', fn: async (c) => { await POST('/gl/entries', { date: date.value, memo: memo.value, kind, lines: rows.map(x => ({ account_id: x.a.value, debit: x.d.value, credit: x.c.value })).filter(l => l.account_id) }); c(); toast('تم الترحيل'); openPage('gl_journal'); } }], { wide: true });
  };
  const body = h('div', null, pageHead('📒 قيود اليومية', canW() ? btn('➕ قيد', () => newEntry('normal'), 'pri') : null, canW() ? btn('قيد تسوية', () => newEntry('adjusting')) : null, canW() ? btn('⚙ ترحيل العمليات تلقائيًا', async () => { const x = await POST('/gl/autopost', {}); toast('تم ترحيل ' + x.posted + ' قيد'); openPage('gl_journal'); }) : null, btn('⬇ تصدير', () => exportChooser())), rangeBar('gl_journal'),
    note('الترحيل التلقائي يحوّل أوامر القص (إيراد = القطع × التكلفة) والمقبوضات والمصروفات إلى قيود مزدوجة مرة واحدة فقط لكل عملية. الإلغاء يتم بقيد عكسي ولا يُحذف شيء.'));
  es.forEach(e => { if (!Array.isArray(e.lines)) e.lines = []; const D = e.lines.reduce((s, l) => s + l.debit, 0); body.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, '#' + e.no + ' | ' + e.date + ' | ' + KD[e.kind] + ' | ' + (e.memo || ''), canW() && e.kind !== 'closing' && !e.reversed_of ? btn('عكس', async () => { if (await confirmBox('عكس القيد #' + e.no + '؟')) { await DEL('/gl/entries/' + e.id); openPage('gl_journal'); } }, 'sm') : ''), table([{ t: 'الحساب', f: l => l.code + ' ' + l.name }, { t: 'مدين', f: l => l.debit ? fmt(l.debit) : '' , num: 0 }, { t: 'دائن', f: l => l.credit ? fmt(l.credit) : '' }], e.lines))); });
  if (!es.length) body.append(table([{ t: '', k: 'x' }], [], { empty: 'لا توجد قيود في هذه الفترة' }));
  return body;
};
P.gl_ledger = async () => {
  let accs = await GET('/gl/accounts'); if (!Array.isArray(accs)) accs = []; const root = h('div'); const sel = h('select', null, accs.map(a => h('option', { value: a.id, selected: String(a.id) === String(MZ.glAcc) }, a.code + ' ' + a.name)));
  const show = async () => { MZ.glAcc = sel.value; const d = await GET('/gl/ledger?account=' + sel.value) || {}; if (!Array.isArray(d.rows)) d.rows = []; out.innerHTML = ''; out.append(h('div', { class: 'kpis' }, kpi('رصيد الحساب', fmt(d.balance))), table([{ t: 'التاريخ', k: 'date' }, { t: 'قيد', k: 'no' }, { t: 'البيان', k: 'memo' }, { t: 'مدين', f: r => r.debit ? fmt(r.debit) : '' }, { t: 'دائن', f: r => r.credit ? fmt(r.credit) : '' }, { t: 'الرصيد', f: r => fmt(r.balance) }], d.rows)); };
  const out = h('div'); sel.onchange = show; root.append(pageHead('📖 دفتر الأستاذ', sel, btn('⬇ تصدير', () => exportChooser())), out); show(); return root;
};
P.gl_trial = async () => {
  const r = dr(); const d = await GET('/gl/trial?from=' + r.from + '&to=' + r.to) || {}; if (!Array.isArray(d.rows)) d.rows = []; const sd = d.rows.reduce((s, x) => s + x.debit, 0), sc = d.rows.reduce((s, x) => s + x.credit, 0), bd = d.rows.reduce((s, x) => s + x.bal_debit, 0), bc = d.rows.reduce((s, x) => s + x.bal_credit, 0);
  return h('div', null, pageHead('⚖ ميزان المراجعة', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())), rangeBar('gl_trial'),
    h('div', { class: 'kpis' }, kpi('إجمالي المدين', fmt(sd)), kpi('إجمالي الدائن', fmt(sc)), kpi('الحالة', Math.abs(sd - sc) < 0.005 ? '✔ متزن' : '✖ غير متزن')),
    table([{ t: 'الكود', k: 'code' }, { t: 'الحساب', k: 'name' }, { t: 'حركة مدين', f: x => fmt(x.debit) }, { t: 'حركة دائن', f: x => fmt(x.credit) }, { t: 'رصيد مدين', f: x => x.bal_debit ? fmt(x.bal_debit) : '' }, { t: 'رصيد دائن', f: x => x.bal_credit ? fmt(x.bal_credit) : '' }], d.rows, { foot: [null, 'الإجمالي', fmt(sd), fmt(sc), fmt(bd), fmt(bc)] }));
};
P.gl_statements = async () => {
  const r = dr(); const d = await GET('/gl/statements?from=' + r.from + '&to=' + r.to) || {}; if (!d.income) d.income = {}; if (!d.balance) d.balance = {}; if (!Array.isArray(d.balance.equity)) d.balance.equity = []; const sec = (t, rows, tot) => h('div', { class: 'panel' }, h('div', { class: 'ph' }, t), table([{ t: 'الحساب', f: x => x.code + ' ' + x.name }, { t: 'المبلغ', f: x => fmt(x.amount) }], rows, { foot: ['الإجمالي', fmt(tot)] }));
  const I = d.income, B = d.balance;
  return h('div', null, pageHead('📊 القوائم المالية', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())), rangeBar('gl_statements'),
    h('div', { class: 'kpis' }, kpi('إجمالي الإيرادات', fmt(I.total_revenue)), kpi('إجمالي المصروفات', fmt(I.total_expense)), kpi('صافي الربح', fmt(I.net)), kpi('النقدية', fmt(d.cash))),
    h('h3', null, 'قائمة الدخل'), sec('الإيرادات', I.revenue, I.total_revenue), sec('المصروفات', I.expenses, I.total_expense),
    h('h3', null, 'قائمة المركز المالي (حتى ' + r.to + ')'), sec('الأصول', B.assets, B.total_assets), sec('الالتزامات', B.liabilities, B.total_liab), sec('حقوق الملكية', B.equity.concat([{ code: '', name: 'ربح الفترة غير المقفل', amount: B.profit_unclosed }]), B.total_equity),
    note(Math.abs(B.check || 0) < 0.005 ? '✔ الميزانية متوازنة: الأصول = الالتزامات + حقوق الملكية' : '✖ الميزانية غير متوازنة بفارق ' + fmt(B.check)));
};
P.gl_close = async () => {
  const to = h('input', { type: 'date', value: today() });
  return h('div', null, pageHead('🔒 إقفال الفترة'), note('الإقفال يرحّل أرصدة الإيرادات والمصروفات إلى الأرباح المرحّلة بقيد إقفال، ثم يقفل التعديل على كل ما قبل اليوم التالي لتاريخ الإقفال. الخطوات الصحيحة: 1) رحّل العمليات 2) سجّل قيود التسوية (إهلاك، مستحقات) 3) راجع ميزان المراجعة 4) أقفل. للمدير فقط، وللتراجع يفتح المدير القفل من الإعدادات.'),
    h('div', { class: 'panel' }, h('div', { class: 'pb' }, h('label', null, 'تاريخ نهاية الفترة ', to), ' ', MZ.user.role === 'admin' ? btn('إقفال الفترة', async () => { if (await confirmBox('إقفال الفترة حتى ' + to.value + '؟ سيُمنع التعديل على ما قبلها.')) { const x = await POST('/gl/close', { to: to.value }); toast('تم الإقفال. صافي الربح ' + fmt(x.profit)); openPage('gl_close'); } }, 'pri') : 'للمدير فقط')));
};
P.gl_subledger = async () => {
  const d = await GET('/gl/subledger?to=' + today()) || {};
  return h('div', null, pageHead('👥 أستاذ مساعد العملاء', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
    h('div', { class: 'kpis' }, kpi('رصيد حساب العملاء (الرئيسي)', fmt(d.control)), kpi('مجموع أرصدة العملاء', fmt(d.subs)), kpi('غير مرتبط بعميل', fmt(d.unassigned)), kpi('التسوية', d.reconciled ? '✔ مطابق' : '✖ فروق')),
    table([{ t: 'الكود', k: 'code' }, { t: 'العميل', k: 'name' }, { t: 'مدين', f: x => fmt(x.debit) }, { t: 'دائن', f: x => fmt(x.credit) }, { t: 'الرصيد', f: x => fmt(x.balance) }], d.rows, {}));
};
P.gl_suppliers = async () => {
  let rows = await GET('/gl/suppliers'); if (!Array.isArray(rows)) rows = [];
  const add = () => { const g = formGrid([{ k: 'name', t: 'اسم المورد', req: 1 }, { k: 'code', t: 'الكود (اختياري)' }, { k: 'phone', t: 'الهاتف' }, { k: 'notes', t: 'ملاحظات', full: 1 }]); modal('مورد جديد', g.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await POST('/gl/suppliers', g.get()); c(); toast('تمت الإضافة'); openPage('gl_suppliers'); } }]); };
  const pay = () => { if (!rows.length) { toast('أضف مورّدًا أولًا', 'err'); return; } const g = formGrid([{ k: 'date', t: 'التاريخ', type: 'date', def: today() }, { k: 'supplier_id', t: 'المورد', type: 'select', options: rows.map(r => ({ v: r.id, t: r.name })) }, { k: 'amount', t: 'المبلغ', type: 'number' }, { k: 'method', t: 'من', type: 'select', options: [{ v: 'cash', t: 'الصندوق' }, { v: 'bank', t: 'البنك' }] }, { k: 'notes', t: 'ملاحظات', full: 1 }]); modal('سداد مورد', g.el, [{ t: 'ترحيل السداد', kind: 'pri', fn: async (c) => { await POST('/gl/suppay', g.get()); c(); toast('تم السداد وترحيله'); openPage('gl_supledger'); } }]); };
  const edit = (r) => { const g = formGrid([{ k: 'name', t: 'اسم المورد', req: 1 }, { k: 'phone', t: 'الهاتف' }, { k: 'notes', t: 'ملاحظات', full: 1 }, { k: 'active', t: 'نشط', type: 'check' }], { ...r, active: r.active ? true : false }); modal('تعديل', g.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await PUT('/gl/suppliers/' + r.id, g.get()); c(); toast('تم الحفظ'); openPage('gl_suppliers'); } }, { t: 'إلغاء', fn: (c) => c() }]); };
  return h('div', null, pageHead('🏭 الموردون', canW() ? btn('➕ مورد', add, 'pri') : null, canW() ? btn('💸 سداد مورد', pay) : null), note('الموردون يُربطون بإذن الإضافة (الوارد) في المخزون، ويظهر رصيدهم في أستاذ مساعد الموردين بعد ترحيل القيود.'),
    table([{ t: 'الكود', k: 'code' }, { t: 'المورد', k: 'name' }, { t: 'الهاتف', k: 'phone' }, { t: 'ملاحظات', k: 'notes' }, { t: 'الحالة', f: r => r.active ? '' : h('span', { class: 'okb' }, 'موقوف') }, canW() ? { t: '', f: (r) => h('span', null, btn('تعديل', () => edit(r), 'sm'), ' ', btn('حذف', async () => { if (await confirmBox('حذف هذا السجل؟')) { await DEL('/gl/suppliers/' + r.id); toast('تم الحذف'); openPage('gl_suppliers'); } }, 'sm danger')) } : null].filter(Boolean), rows));
};
P.gl_supledger = async () => {
  const d = await GET('/gl/supledger?to=' + today()) || {};
  return h('div', null, pageHead('🏭 أستاذ مساعد الموردين', btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
    h('div', { class: 'kpis' }, kpi('رصيد الموردين (الرئيسي)', fmt(d.control)), kpi('مجموع أرصدة الموردين', fmt(d.subs)), kpi('غير مرتبط بمورد', fmt(d.unassigned)), kpi('التسوية', d.reconciled ? '✔ مطابق' : '✖ فروق')),
    table([{ t: 'الكود', k: 'code' }, { t: 'المورد', k: 'name' }, { t: 'سداد (مدين)', f: x => fmt(x.debit) }, { t: 'مشتريات (دائن)', f: x => fmt(x.credit) }, { t: 'المستحق له', f: x => fmt(x.balance) }], d.rows, {}));
};
['gl_accounts', 'gl_journal', 'gl_subledger', 'gl_suppliers', 'gl_supledger', 'gl_ledger', 'gl_trial', 'gl_statements', 'gl_close'].forEach(k => { MZ.pages[k] = P[k]; });
