'use strict';
/* Screens that mirror the factory's Excel workbook (his Arabic labels) */
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const weekday = (d) => d ? WD[new Date(String(d).slice(0, 10) + 'T12:00:00').getDay()] : '';
const n3 = (v) => (v === null || v === undefined || v === '') ? '' : fmt(v, 3).replace(/\.?0+$/, '');
const n0 = (v) => (v === null || v === undefined || v === '') ? '' : fmt(v, 2).replace(/\.00$/, '');
const kpi = (t, v) => h('div', { class: 'kpi' }, h('span', null, t), h('b', null, v));
const sizeKeys = [['s_2xl', '2XL'], ['s_xl', 'XL'], ['s_l', 'L'], ['s_m', 'M'], ['s_s', 'S'], ['s_xs', 'XS']];
const delBtn = (path, render, msg) => (r) => btn('حذف', async () => { if (await confirmBox(msg || 'حذف هذا السجل؟')) { await DEL(path + '/' + r.id); toast('تم الحذف'); render(); } }, 'sm');

/* ---------- مخزن استلام القماش ---------- */
P.store = async () => {
  await load('clients', true);
  const root = h('div'); let fil = {};
  const render = async () => {
    const rows = await GET('/store' + (fil.client_id ? '?client_id=' + fil.client_id : ''));
    const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
    root.innerHTML = '';
    const cols = [
      { t: 'تاريخ الاستلام', f: r => dt(r.date) }, { t: 'اسم العميل', k: 'client_name' }, { t: 'كود التوب / الصنف', k: 'item_code' }, { t: 'اسم الخامة', k: 'fabric' },
      { t: 'الكمية المستلمة', f: r => n0(r.qty), csv: r => r.qty }, { t: 'وحدة القياس', k: 'unit' }, { t: 'وزن التوب المستلم (كجم)', f: r => n3(r.weight), csv: r => r.weight }, { t: 'اللون', k: 'color' },
      { t: 'الكمية المحولة للقص', f: r => n0(r.t_qty), csv: r => r.t_qty }, { t: 'الوزن المحول للقص (كجم)', f: r => n3(r.t_weight), csv: r => r.t_weight }, { t: 'تاريخ التحويل للقص', f: r => dt(r.t_date) },
      { t: 'رقم أمر القص', k: 'cut_codes' }, { t: 'اسم الموديل / القصة', k: 'model_names' },
      { t: 'حالة التوب', f: r => tag(r.status, r.status === 'متاح بالمخزن'), csv: r => r.status }, { t: 'المتبقي بالمخزن (كمية)', f: r => n0(r.left_qty), csv: r => r.left_qty }, { t: 'الوزن المتبقي (كجم)', f: r => n3(r.left_weight), csv: r => r.left_weight },
      canW() ? { t: '', f: r => h('span', null, btn('تحويل للقص', () => transfer(r), 'sm pri'), ' ', btn('تعديل', () => edit(r), 'sm'), ' ', delBtn('/store', render, 'حذف هذا الصنف من المخزن؟')(r)) } : null].filter(Boolean);
    const bar = filterBar([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts }], v => { fil = v; render(); }, fil);
    root.append(pageHead('مخزن استلام القماش', canW() ? btn('➕ استلام قماش', () => edit(null), 'pri') : null, btn('⬇ تصدير Excel (CSV)', () => download('مخزن استلام القماش.csv', csvOf(cols.slice(0, 16), rows)))), bar,
      h('div', { class: 'kpis' }, kpi('إجمالي الأتواب المسجلة', n0(sum('qty'))), kpi('إجمالي الوزن المستلم (كجم)', n3(sum('weight'))), kpi('الكمية المحولة للقص', n0(sum('t_qty'))), kpi('الوزن المحول للقص (كجم)', n3(sum('t_weight'))), kpi('المتبقي بالمخزن (أتواب)', n0(sum('left_qty'))), kpi('الوزن المتبقي (كجم)', n3(sum('left_weight')))),
      table(cols, rows, { empty: 'لا توجد أصناف مستلمة' }));
  };
  const edit = (r) => {
    const f = formGrid([{ k: 'date', t: 'تاريخ الاستلام', type: 'date', req: 1, def: today() }, { k: 'client_id', t: 'اسم العميل', type: 'ref', ref: cOpts, req: 1 }, { k: 'item_code', t: 'كود التوب / الصنف' }, { k: 'fabric', t: 'اسم الخامة' },
      { k: 'qty', t: 'الكمية المستلمة', type: 'number' }, { k: 'unit', t: 'وحدة القياس', def: 'توب' }, { k: 'weight', t: 'وزن التوب المستلم (كجم)', type: 'number' }, { k: 'color', t: 'اللون' }, { k: 'notes', t: 'ملاحظات', full: 1 }], r || { date: today(), unit: 'توب' });
    modal(r ? 'تعديل صنف' : 'استلام قماش من العميل', f.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { const b = f.get(); if (r) await PUT('/store/' + r.id, b); else await POST('/store', b); c(); toast('تم الحفظ'); render(); } }]);
  };
  const transfer = (r) => {
    const f = formGrid([{ k: 'cut_code', t: 'رقم أمر القص / كود القصة', req: 1 }, { k: 'date', t: 'تاريخ التحويل للقص', type: 'date', def: today() }, { k: 'qty', t: 'الكمية المحولة (المتبقي ' + n0(r.left_qty) + ')', type: 'number', def: r.left_qty }, { k: 'weight', t: 'الوزن المحول (كجم) - اتركه فارغاً للحساب بالتناسب', type: 'number' }, { k: 'model_name', t: 'اسم الموديل / القصة', full: 1 }], { date: today(), qty: r.left_qty });
    const hist = r.transfers.length ? table([{ t: 'التاريخ', f: x => dt(x.date) }, { t: 'أمر القص', k: 'cut_code' }, { t: 'الكمية', f: x => n0(x.qty) }, { t: 'الوزن', f: x => n3(x.weight) }, canW() ? { t: '', f: x => btn('إلغاء', async () => { if (await confirmBox('إلغاء هذا التحويل وإرجاع القماش للمخزن؟')) { await DEL('/store-transfer/' + x.id); toast('تم'); document.querySelector('.modal-back') && document.querySelector('.modal-back').remove(); render(); } }, 'sm') } : null].filter(Boolean), r.transfers) : null;
    modal('تحويل للقص: ' + (r.fabric || '') + ' ' + (r.color || '') + ' - ' + r.client_name, h('div', null, f.el, hist ? h('div', null, h('h4', null, 'التحويلات السابقة'), hist) : null), [{ t: 'تحويل', kind: 'pri', fn: async (c) => { const b = f.get(); const x = await POST('/store/' + r.id + '/transfer', b); c(); toast('تم التحويل، الوزن ' + n3(x.weight) + ' كجم'); render(); } }], { wide: true });
  };
  await render(); return root;
};

/* ---------- أمر القص التفصيلي ---------- */
P.orders = async () => {
  await load('clients', true);
  const root = h('div'); let fil = {};
  const render = async () => {
    const qs = [fil.client_id ? 'client_id=' + fil.client_id : '', fil.code ? 'code=' + encodeURIComponent(fil.code) : ''].filter(Boolean).join('&');
    const rows = await GET('/orders' + (qs ? '?' + qs : ''));
    const tot = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
    root.innerHTML = '';
    const cols = [
      { t: 'كود القصة / أمر القص', k: 'code' }, { t: 'اسم العميل', k: 'client_name' }, { t: 'اسم الخامة', k: 'fabric' }, { t: 'اسم الموديل / القصة', k: 'model_name' },
      { t: 'وزن القماش المحول للقص', f: r => n3(r.weight_in), csv: r => r.weight_in }, { t: 'اللون في القصة', k: 'color' }, { t: 'وزن القماش الفعلي المستخدم', f: r => n3(r.weight_used), csv: r => r.weight_used }, { t: 'هالك القماش', f: r => n3(r.waste), csv: r => r.waste },
      { t: 'طول الراق (متر)', f: r => n0(r.marker_len), csv: r => r.marker_len }, { t: 'عرض الراق (سم)', f: r => n0(r.marker_width), csv: r => r.marker_width }, { t: 'وزن الراق (كجم)', f: r => n3(r.marker_weight), csv: r => r.marker_weight },
      { t: 'عدد الراقات', k: 'layers' }, { t: 'عدد المقاسات في الراق', k: 'sizes_in_marker' }, { t: 'عدد القطع في الراق', k: 'pcs_in_marker' },
      ...sizeKeys.map(([k, t]) => ({ t, k })), { t: 'إجمالي القطع الناتجة', f: r => h('b', null, fmt(r.total, 0)), csv: r => r.total },
      { t: 'تكلفة تصنيع القطعة', f: r => n0(r.unit_cost), csv: r => r.unit_cost }, { t: 'إجمالي التكلفة', f: r => h('b', null, fmt(r.cost_total)), csv: r => r.cost_total }, { t: 'القص', k: 'cut_status' },
      { t: 'إجمالي القطع المسلمة', k: 'delivered' }, { t: 'المتبقي للتسليم', f: r => fmt(r.left, 0), csv: r => r.left }, { t: 'حالة التسليم', f: r => tag(r.deliv_status, r.deliv_status === 'تم التسليم'), csv: r => r.deliv_status },
      canW() ? { t: '', f: r => h('span', null, btn('تعديل', () => edit(r), 'sm'), ' ', delBtn('/orders', render, 'حذف سطر أمر القص؟')(r)) } : null].filter(Boolean);
    const bar = filterBar([{ k: 'code', t: 'بحث بكود القصة' }, { k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts }], v => { fil = v; render(); }, fil);
    root.append(pageHead('أمر القص التفصيلي', canW() ? btn('➕ سطر قص جديد', () => edit(null), 'pri') : null, btn('🖨 طباعة', () => printEl('أمر القص', table(cols.slice(0, -1), rows))), btn('⬇ تصدير Excel (CSV)', () => download('أمر القص التفصيلي.csv', csvOf(cols.slice(0, -1), rows)))), bar,
      h('div', { class: 'kpis' }, kpi('عدد الأسطر', rows.length), kpi('إجمالي القطع الناتجة', fmt(tot('total'), 0)), kpi('إجمالي التكلفة (جنيه)', fmt(tot('cost_total'))), kpi('القطع المسلمة', fmt(tot('delivered'), 0)), kpi('المتبقي للتسليم', fmt(tot('left'), 0))),
      note('كل لون في سطر مستقل. إجمالي القطع = مجموع المقاسات (أو الرقم المكتوب إذا لم تُكتب مقاسات). إجمالي التكلفة = القطع × تكلفة القطعة. وزن القماش المحول يُسحب تلقائياً من مخزن القماش بنفس كود القصة.'),
      table(cols, rows, { empty: 'لا توجد أوامر قص' }));
  };
  const edit = (r) => {
    const flds = [{ k: 'code', t: 'كود القصة / أمر القص', req: 1 }, { k: 'client_id', t: 'اسم العميل', type: 'ref', ref: cOpts, req: 1 }, { k: 'fabric', t: 'اسم الخامة (تلقائي من المخزن إن تُرك فارغاً)' }, { k: 'model_name', t: 'اسم الموديل / القصة' }, { k: 'color', t: 'اللون في القصة' }, { k: 'date', t: 'تاريخ القص', type: 'date' },
      { k: 'weight_used', t: 'وزن القماش الفعلي المستخدم (كجم)', type: 'number' }, { k: 'marker_len', t: 'طول الراق (متر)', type: 'number' }, { k: 'marker_width', t: 'عرض الراق (سم)', type: 'number' }, { k: 'marker_weight', t: 'وزن الراق (كجم)', type: 'number' },
      { k: 'layers', t: 'عدد الراقات', type: 'number' }, { k: 'sizes_in_marker', t: 'عدد المقاسات في الراق', type: 'number' }, { k: 'pcs_in_marker', t: 'عدد القطع في الراق', type: 'number' },
      ...sizeKeys.map(([k, t]) => ({ k, t: 'عدد ' + t, type: 'number' })), { k: 'total_pcs', t: 'إجمالي القطع (إن لم تُكتب مقاسات)', type: 'number' }, { k: 'unit_cost', t: 'تكلفة تصنيع القطعة (جنيه)', type: 'number' },
      { k: 'cut_status', t: 'القص', def: 'تم القص' }, { k: 'delivered', t: 'إجمالي القطع المسلمة', type: 'number', def: 0 }, { k: 'notes', t: 'ملاحظات', full: 1 }];
    const f = formGrid(flds, r || { date: today(), cut_status: 'تم القص', delivered: 0 });
    const info = h('div', { class: 'panel' }, h('div', { class: 'pb' }));
    const upd = () => { const b = f.get(); const sz = sizeKeys.reduce((a, [k]) => a + (Number(b[k]) || 0), 0); const any = sizeKeys.some(([k]) => b[k] !== null && b[k] !== ''); const tot = any ? sz : (Number(b.total_pcs) || 0); info.firstChild.textContent = 'إجمالي القطع: ' + fmt(tot, 0) + '   |   إجمالي التكلفة: ' + fmt(tot * (Number(b.unit_cost) || 0)) + ' جنيه'; };
    f.el.addEventListener('input', upd); upd();
    modal(r ? 'تعديل سطر القص' : 'سطر قص جديد', h('div', null, f.el, info), [{ t: 'حفظ', kind: 'pri', fn: async (c) => { const b = f.get(); if (r) await PUT('/orders/' + r.id, b); else await POST('/orders', b); c(); toast('تم الحفظ'); render(); } }], { wide: true });
  };
  await render(); return root;
};

/* ---------- تتبع الخارج والراجع ---------- */
P.outs = async () => {
  const root = h('div');
  const render = async () => {
    const rows = await GET('/outs'); root.innerHTML = '';
    const cols = [{ t: 'التاريخ', f: r => dt(r.date) }, { t: 'رقم أمر القص', k: 'cut_code' }, { t: 'اسم العميل (تلقائي)', k: 'client_name' }, { t: 'البيان / الأجزاء (صدر/ظهر/رقبة)', k: 'part' }, { t: 'جهة المعالجة (المطبعة)', k: 'party' }, { t: 'الكمية المرسلة (قطعة)', k: 'sent' }, { t: 'الكمية المستلمة (قطعة)', k: 'received' }, { t: 'المتبقي بالخارج', k: 'left' }, { t: 'الحالة', f: r => tag(r.status, r.status === 'مكتمل الاستلام'), csv: r => r.status }];
    const doc = h('div', { class: 'print-doc' }, coHead('متابعة أجزاء المقصوصات المرسلة والمستلمة (طباعة / تطريز)'), table(cols, rows), sigRow('المسلّم', 'المستلم', 'المدير'));
    root.append(pageHead('تتبع الخارج والراجع (طباعة)', canW() ? btn('➕ تسجيل', () => edit(null), 'pri') : null, btn('🖨 طباعة', () => printEl('تتبع الخارج والراجع', doc)), btn('⬇ تصدير Excel (CSV)', () => download('تتبع الخارج والراجع.csv', csvOf(cols, rows)))),
      table([...cols, canW() ? { t: '', f: r => h('span', null, btn('تعديل', () => edit(r), 'sm'), ' ', delBtn('/outs', render)(r)) } : null].filter(Boolean), rows, { empty: 'لا توجد حركات' }));
  };
  const edit = (r) => {
    const f = formGrid([{ k: 'date', t: 'التاريخ', type: 'date', def: today() }, { k: 'cut_code', t: 'رقم أمر القص', req: 1 }, { k: 'part', t: 'البيان / الأجزاء (صدر/ظهر/رقبة)' }, { k: 'party', t: 'جهة المعالجة (المطبعة)' }, { k: 'sent', t: 'الكمية المرسلة (قطعة)', type: 'number' }, { k: 'received', t: 'الكمية المستلمة (قطعة)', type: 'number', def: 0 }], r || { date: today(), received: 0 });
    modal(r ? 'تعديل' : 'تسجيل خارج / راجع', f.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { const b = f.get(); if (r) await PUT('/outs/' + r.id, b); else await POST('/outs', b); c(); toast('تم الحفظ'); render(); } }]);
  };
  await render(); return root;
};

/* ---------- سجل مقبوضات العملاء ---------- */
P.payments = async () => { await load('clients', true); return crud({ title: 'سجل مقبوضات العملاء', path: '/payments', defaults: { date: today(), method: 'نقدي' },
  cols: [{ t: 'رقم الإذن', k: 'doc_no' }, { t: 'التاريخ', f: r => dt(r.date) }, { t: 'اسم العميل', f: r => clientName(r.client_id), csv: r => clientName(r.client_id) }, { t: 'المبلغ المدفوع (جنيه)', k: 'amount', num: 1 }, { t: 'طريقة الدفع', k: 'method' }, { t: 'ملاحظات', k: 'notes' }, { t: 'يوم الدفع', f: r => weekday(r.date) }],
  fields: [{ k: 'doc_no', t: 'رقم الإذن' }, { k: 'date', t: 'التاريخ', type: 'date', req: 1 }, { k: 'client_id', t: 'اسم العميل', type: 'ref', ref: cOpts, req: 1 }, { k: 'amount', t: 'المبلغ المدفوع (جنيه)', type: 'number', req: 1 }, { k: 'method', t: 'طريقة الدفع', type: 'select', options: ['نقدي', 'تحويل بنكي', 'إنستاباي', 'شيك'].map(x => ({ v: x, t: x })) }, { k: 'notes', t: 'ملاحظات', full: 1 }] })(); };

/* ---------- حسابات العملاء المجمعة ---------- */
P.accounts = async () => {
  const rows = await GET('/accounts'); const s = (k) => rows.reduce((a, r) => a + r[k], 0);
  const cols = [{ t: 'اسم العميل', k: 'name' }, { t: 'عدد الأوامر', k: 'orders' }, { t: 'إجمالي القطع', f: r => fmt(r.pieces, 0), csv: r => r.pieces }, { t: 'إجمالي المستحق (جنيه)', k: 'due', num: 1 }, { t: 'إجمالي المدفوعات (جنيه)', k: 'paid', num: 1 }, { t: 'الرصيد المتبقي للمصنع (جنيه)', f: r => h('b', { style: { color: r.balance > 0 ? '#b00020' : '#1b7a2b' } }, fmt(r.balance)), csv: r => r.balance }, { t: '', f: r => btn('كشف الحساب', () => { MZ.stmtClient = r.client_id; closeWin('acctstmt'); openPage('acctstmt'); }, 'sm') }];
  return h('div', null, pageHead('حسابات العملاء المجمعة', btn('⬇ تصدير Excel (CSV)', () => download('حسابات العملاء.csv', csvOf(cols.slice(0, 6), rows)))),
    table(cols, rows, { empty: 'لا توجد حسابات', foot: ['الإجمالي', null, fmt(s('pieces'), 0), fmt(s('due')), fmt(s('paid')), fmt(s('balance')), null] }),
    note('المستحق = مجموع إجمالي تكلفة أوامر القص للعميل. الرصيد = المستحق - المدفوعات.'));
};
P.acctstmt = async () => {
  await load('clients', true);
  const root = h('div'), body = h('div');
  const run = async (v) => {
    if (!v.client_id) { toast('اختر العميل', 'err'); return; }
    const r = await GET('/acct-statement?client_id=' + v.client_id); body.innerHTML = '';
    const doc = h('div', { class: 'print-doc' }, coHead('كشف حساب العميل'), h('p', null, 'العميل: ' + r.client.name),
      h('div', { class: 'kpis' }, kpi('إجمالي المدفوعات', fmt(r.paid)), kpi('إجمالي المستحق', fmt(r.due)), kpi('الرصيد المتبقي', fmt(r.balance))),
      h('h4', null, 'سجل دفعات وسدادات العميل'), table([{ t: 'التاريخ', f: x => dt(x.date) }, { t: 'يوم السداد', f: x => weekday(x.date) }, { t: 'رقم الإذن', k: 'doc_no' }, { t: 'المبلغ المسدد (الدفعة)', k: 'amount', num: 1 }, { t: 'إجمالي المدفوعات التراكمي', k: 'cum', num: 1 }, { t: 'الرصيد المتبقي بعد الدفعة', k: 'after', num: 1 }], r.payments, { empty: 'لا توجد دفعات' }),
      h('h4', null, 'أوامر القص'), table([{ t: 'كود القصة', k: 'code' }, { t: 'الموديل', k: 'model_name' }, { t: 'اللون', k: 'color' }, { t: 'القطع', f: x => fmt(x.total, 0) }, { t: 'تكلفة القطعة', k: 'unit_cost', num: 1 }, { t: 'إجمالي التكلفة', k: 'cost_total', num: 1 }], r.orders, { empty: 'لا توجد أوامر', foot: [null, null, 'الإجمالي', fmt(r.pieces, 0), null, fmt(r.due)] }));
    body.append(btn('🖨 طباعة', () => printEl('كشف حساب العميل', doc)), doc);
  };
  const bar = filterBar([{ k: 'client_id', t: 'اسم العميل (اختر من القائمة)', type: 'ref', ref: cOpts }], run, MZ.stmtClient ? { client_id: MZ.stmtClient } : {});
  root.append(pageHead('كشف حساب العميل'), bar, body); if (MZ.stmtClient) { await run({ client_id: MZ.stmtClient }); MZ.stmtClient = null; } return root;
};

/* ---------- الموظفون والحضور والمرتبات ---------- */
P.employees = crud({ title: 'الموظفون', path: '/employees', defaults: { active: 1 },
  cols: [{ t: 'كود الموظف', k: 'code' }, { t: 'اسم الموظف', k: 'name' }, { t: 'الوظيفة', k: 'job' }, { t: 'الراتب', k: 'salary', num: 1 }, { t: 'الحالة', f: r => tag(r.active ? 'نشط' : 'موقوف', r.active), csv: r => r.active ? 'نشط' : 'موقوف' }],
  fields: [{ k: 'code', t: 'كود الموظف', req: 1 }, { k: 'name', t: 'اسم الموظف', req: 1 }, { k: 'job', t: 'الوظيفة' }, { k: 'salary', t: 'الراتب', type: 'number' }, { k: 'active', t: 'نشط', type: 'check' }] });
const thisYm = () => new Date().toISOString().slice(0, 7);
const ymBar = (ym, go) => { const i = h('input', { class: 'inp', type: 'month', value: ym }); i.addEventListener('change', () => i.value && go(i.value)); return h('label', { class: 'fld' }, h('span', null, 'الشهر'), i); };
P.attendance = async () => {
  const root = h('div'); let ym = MZ.ym || thisYm();
  const render = async () => {
    MZ.ym = ym; const rows = await GET('/attendance?ym=' + ym); root.innerHTML = '';
    const [y, m] = ym.split('-').map(Number), dim = new Date(y, m, 0).getDate();
    const head = h('tr', null, h('th', null, 'كود'), h('th', null, 'اسم الموظف'), h('th', null, 'الوظيفة'), Array.from({ length: dim }, (_, i) => h('th', null, WD[new Date(y, m - 1, i + 1).getDay()].slice(0, 3), h('br'), i + 1)), h('th', null, 'حضور'), h('th', null, 'غياب'));
    const tb = h('tbody');
    rows.forEach(e => {
      const cnt = { 'حضور': 0, 'غياب': 0 }; Object.values(e.days).forEach(s => cnt[s]++);
      const pc = h('td', { class: 'num' }, cnt['حضور']), ac = h('td', { class: 'num' }, cnt['غياب']);
      const tr = h('tr', null, h('td', null, e.code), h('td', null, e.name), h('td', null, e.job || ''));
      for (let d = 1; d <= dim; d++) {
        const dd = String(d).padStart(2, '0'); const td = h('td', { class: 'att' });
        const paint = () => { const s = e.days[dd] || ''; td.textContent = s === 'حضور' ? '✔' : (s === 'غياب' ? '✘' : ''); td.style.color = s === 'غياب' ? '#b00020' : '#1b7a2b'; td.style.cursor = canW() ? 'pointer' : 'default'; td.title = s; };
        paint();
        if (canW()) td.onclick = guard(async () => { const cur = e.days[dd] || ''; const nx = cur === '' ? 'حضور' : (cur === 'حضور' ? 'غياب' : ''); await POST('/attendance', { emp_id: e.id, date: ym + '-' + dd, status: nx }); if (cur) cnt[cur]--; if (nx) cnt[nx]++; if (nx) e.days[dd] = nx; else delete e.days[dd]; pc.textContent = cnt['حضور']; ac.textContent = cnt['غياب']; paint(); });
        tr.append(td);
      }
      tr.append(pc, ac); tb.append(tr);
    });
    root.append(pageHead('حضور وانصراف العمال', canW() ? btn('✔ تعبئة الشهر حضور للجميع (ما لم يُسجَّل)', async () => { if (!await confirmBox('تسجيل "حضور" لكل الأيام غير المسجلة حتى اليوم؟')) return; const lim = ym === thisYm() ? new Date().getDate() : dim; for (const e of rows) for (let d = 1; d <= lim; d++) { const dd = String(d).padStart(2, '0'); if (!e.days[dd]) await POST('/attendance', { emp_id: e.id, date: ym + '-' + dd, status: 'حضور' }); } toast('تم'); render(); }) : null),
      h('div', { class: 'filters' }, ymBar(ym, v => { ym = v; render(); })), note('اضغط على الخانة لتبديل: فارغ ← حضور ✔ ← غياب ✘ ← فارغ.'),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'grid att-grid' }, h('thead', null, head), tb)));
  };
  await render(); return root;
};
P.payroll = async () => {
  const root = h('div'); let ym = MZ.ym || thisYm();
  const render = async () => {
    MZ.ym = ym; const d = await GET('/payroll?ym=' + ym); root.innerHTML = ''; const rows = d.rows; const s = (k) => rows.reduce((a, r) => a + r[k], 0);
    const cols = [{ t: 'كود', k: 'code' }, { t: 'اسم الموظف', k: 'name' }, { t: 'الوظيفة', k: 'job' }, { t: 'الراتب الأساسي', k: 'salary', num: 1 }, { t: 'أيام الحضور', k: 'present' }, { t: 'الأجر اليومي', k: 'daily', num: 1 }, { t: 'الساعات الإضافية', k: 'ot_hours' }, { t: 'عدد الجمع', k: 'fridays' }, { t: 'قيمة الجمع', k: 'friday_value', num: 1 }, { t: 'قيمة الإضافي', k: 'ot_value', num: 1 }, { t: 'إجمالي المستحق', k: 'gross', num: 1 }, { t: 'السلف', k: 'advances', num: 1 }, { t: 'أيام الغياب', k: 'absent' }, { t: 'الخصم (إنتاج - استئذان)', k: 'deduction', num: 1 }, { t: 'إجمالي الاستقطاعات', k: 'total_deductions', num: 1 }, { t: 'صافي الراتب', f: r => h('b', null, fmt(r.net)), csv: r => r.net }];
    const edit = (r) => { const f = formGrid([{ k: 'ot_hours', t: 'عدد الساعات الإضافية', type: 'number' }, { k: 'fridays', t: 'عدد الجمع (أيام الجمعة المشتغلة)', type: 'number' }, { k: 'advances', t: 'السلف', type: 'number' }, { k: 'deduction', t: 'الخصم (إنتاج - استئذان)', type: 'number' }], r);
      modal('مدخلات مرتب: ' + r.name, f.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await POST('/payroll', { ...f.get(), ym, emp_id: r.emp_id }); c(); toast('تم الحفظ'); render(); } }]); };
    const full = [...cols, canW() ? { t: '', f: r => btn('مدخلات', () => edit(r), 'sm') } : null].filter(Boolean);
    const doc = h('div', { class: 'print-doc' }, coHead('كشف مرتبات شهر ' + ym), table(cols, rows, { foot: [null, 'الإجمالي', null, fmt(s('salary')), null, null, null, null, fmt(s('friday_value')), fmt(s('ot_value')), fmt(s('gross')), fmt(s('advances')), null, fmt(s('deduction')), fmt(s('total_deductions')), fmt(s('net'))] }));
    root.append(pageHead('المرتبات', btn('🖨 طباعة', () => printEl('كشف المرتبات', doc)), btn('⬇ تصدير Excel (CSV)', () => download('مرتبات ' + ym + '.csv', csvOf(cols, rows)))),
      h('div', { class: 'filters' }, ymBar(ym, v => { ym = v; render(); })),
      h('div', { class: 'kpis' }, kpi('إجمالي المستحق', fmt(s('gross'))), kpi('إجمالي الاستقطاعات', fmt(s('total_deductions'))), kpi('صافي المرتبات', fmt(s('net')))),
      note('الأجر اليومي = الراتب ÷ ' + d.params.days_in_month + ' | قيمة الساعة = اليومي ÷ ' + d.params.hours_per_day + ' | الإضافي = ساعات × قيمة الساعة × ' + d.params.ot_mult + ' | الجمعة = اليومي × عدد الجمع × ' + d.params.friday_mult + ' | الصافي = أيام الحضور × اليومي + الجمع + الإضافي - (السلف + الخصم). الغياب لا يُخصم مرة ثانية لأن الراتب محسوب على أيام الحضور فقط.'),
      table(full, rows, { empty: 'أضف الموظفين أولاً', foot: [null, 'الإجمالي', null, fmt(s('salary')), null, null, null, null, fmt(s('friday_value')), fmt(s('ot_value')), fmt(s('gross')), fmt(s('advances')), null, fmt(s('deduction')), fmt(s('total_deductions')), fmt(s('net')), null] }));
  };
  await render(); return root;
};

/* ---------- الرئيسية ---------- */
P.home = async () => {
  const [st, od, ac] = await Promise.all([GET('/store'), GET('/orders'), GET('/accounts')]);
  const sum = (a, k) => a.reduce((x, r) => x + Number(r[k] || 0), 0);
  const step = (n, t, key, sub) => h('button', { class: 'btn', style: { padding: '12px 16px', margin: '4px' }, onclick: () => openPage(key) }, h('b', null, n + '. ' + t), h('div', { style: { fontSize: '11px', opacity: .8 } }, sub));
  return h('div', null, pageHead('الرئيسية - ' + (MZ.settings.company_name || '')),
    h('div', { class: 'kpis' }, kpi('المتبقي بالمخزن (أتواب)', n0(sum(st, 'left_qty'))), kpi('الوزن المتبقي (كجم)', n3(sum(st, 'left_weight'))), kpi('أسطر القص', od.length), kpi('إجمالي القطع الناتجة', fmt(sum(od, 'total'), 0)), kpi('المتبقي للتسليم', fmt(sum(od, 'left'), 0)),
      kpi('إجمالي المستحق', fmt(sum(ac, 'due'))), kpi('إجمالي المقبوض', fmt(sum(ac, 'paid'))), kpi('الرصيد المتبقي للمصنع', fmt(sum(ac, 'balance')))),
    h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'مسار العمل'), h('div', { class: 'pb' }, step(1, 'استلام قماش', 'store', 'أتواب وكيلو'), step(2, 'تحويل للقص', 'store', 'من المخزن لأمر القص'), step(3, 'أمر القص التفصيلي', 'orders', 'مقاسات وتكلفة'), step(4, 'الخارج والراجع', 'outs', 'طباعة / تطريز'), step(5, 'المقبوضات', 'payments', 'دفعات العملاء'), step(6, 'حسابات العملاء', 'accounts', 'المستحق والرصيد'))),
    note('المصنع يعمل بالتصنيع للغير: القماش ملك العميل، والمستحق على العميل = قطع أوامر القص × تكلفة تصنيع القطعة.'));
};
