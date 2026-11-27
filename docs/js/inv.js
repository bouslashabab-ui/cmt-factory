'use strict';
/* Inventory pages */
const MK = { in: 'وارد', out: 'صادر', adjust: 'تسوية جرد', trin: 'تحويل (إلى)', trout: 'تحويل (من)' };
const optsOf = (rows, f) => rows.map(r => ({ v: r.id, t: f(r) }));
async function moveDlg(kind) {
  const items = await GET('/inv/items'), whs = await GET('/inv/wh'); if (!items.length) { toast('أضف أصنافًا أولًا من شاشة الأصناف والمخازن', 'err'); return; }
  const fl = [{ k: 'date', t: 'التاريخ', type: 'date', def: today() }, { k: 'item_id', t: 'الصنف', type: 'select', options: optsOf(items, i => i.code + ' ' + i.name) }, { k: 'wh_id', t: kind === 'transfer' ? 'من مخزن' : 'المخزن', type: 'select', options: optsOf(whs, w => w.name) }];
  if (kind === 'transfer') fl.push({ k: 'to_wh', t: 'إلى مخزن', type: 'select', options: optsOf(whs, w => w.name) });
  fl.push({ k: 'qty', t: 'الكمية', type: 'number' }); if (kind === 'in') fl.push({ k: 'unit_cost', t: 'تكلفة الوحدة', type: 'number' });
  fl.push({ k: 'ref', t: 'المرجع (فاتورة/إذن)' }, { k: 'notes', t: 'ملاحظات', full: 1 });
  const g = formGrid(fl); modal({ in: 'إذن إضافة (وارد)', out: 'إذن صرف (صادر)', transfer: 'تحويل بين المخازن' }[kind], g.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await POST('/inv/moves', { ...g.get(), kind }); c(); toast('تم تسجيل الحركة'); openPage('inv_stock'); } }]);
}
P.inv_stock = async () => {
  const d = await GET('/inv/stock'); const low = d.rows.filter(r => r.low).length;
  return h('div', null, pageHead('📦 رصيد المخزون', canW() ? btn('➕ وارد', () => moveDlg('in'), 'pri') : null, canW() ? btn('➖ صادر', () => moveDlg('out')) : null, canW() ? btn('🔁 تحويل', () => moveDlg('transfer')) : null, btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
    h('div', { class: 'kpis' }, kpi('عدد الأصناف', d.rows.length), kpi('قيمة المخزون (متوسط مرجح)', fmt(d.total_value)), kpi('أصناف تحت الحد الأدنى', low)),
    table([{ t: 'الكود', k: 'code' }, { t: 'الصنف', k: 'name' }, { t: 'الوحدة', k: 'unit' }, { t: 'الرصيد', f: r => h('b', { style: { color: r.low ? '#b3261e' : '' } }, fmt(r.qty, 3).replace(/\.?0+$/, '')) }, { t: 'متوسط التكلفة', f: r => fmt(r.avg) }, { t: 'القيمة', f: r => fmt(r.value) }, { t: 'حسب المخزن', f: r => r.by_wh.filter(w => w.qty).map(w => w.name + ': ' + w.qty).join(' | ') }, { t: 'تنبيه', f: r => r.low ? h('span', { class: 'tag bad' }, 'تحت الحد') : '' }, { t: '', f: r => btn('كارت الصنف', () => { MZ.invItem = r.id; openPage('inv_card'); }, 'sm') }], d.rows, { foot: [null, null, null, null, 'الإجمالي', fmt(d.total_value), null, null, null] }));
};
P.inv_items = async () => {
  const items = await GET('/inv/items'), whs = await GET('/inv/wh');
  const addI = () => { const g = formGrid([{ k: 'code', t: 'كود الصنف', req: 1 }, { k: 'name', t: 'اسم الصنف', req: 1 }, { k: 'unit', t: 'الوحدة', def: 'قطعة' }, { k: 'min_qty', t: 'حد إعادة الطلب', type: 'number', def: 0 }]); modal('صنف جديد', g.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await POST('/inv/items', g.get()); c(); openPage('inv_items'); } }]); };
  const addW = () => { const g = formGrid([{ k: 'name', t: 'اسم المخزن', req: 1 }]); modal('مخزن جديد', g.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await POST('/inv/wh', g.get()); c(); openPage('inv_items'); } }]); };
  return h('div', null, pageHead('🏷 الأصناف والمخازن', canW() ? btn('➕ صنف', addI, 'pri') : null, canW() ? btn('➕ مخزن', addW) : null), note('مخزون المستلزمات (خيط، أزرار، إكسسوار، تغليف). قماش العملاء له شاشته الخاصة (مخزن استلام القماش) لأنه ملك العميل ولا يدخل في قيمة المخزون.'),
    table([{ t: 'الكود', k: 'code' }, { t: 'الصنف', k: 'name' }, { t: 'الوحدة', k: 'unit' }, { t: 'حد إعادة الطلب', f: r => fmt(r.min_qty, 0) }], items), h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'المخازن'), table([{ t: 'المخزن', k: 'name' }], whs)));
};
P.inv_moves = async () => { const rows = await GET('/inv/moves'); return h('div', null, pageHead('🧾 حركات المخزون', btn('⬇ تصدير', () => exportChooser())), table([{ t: 'التاريخ', k: 'date' }, { t: 'الحركة', f: r => MK[r.kind] }, { t: 'الصنف', f: r => r.code + ' ' + r.name }, { t: 'المخزن', k: 'wh' }, { t: 'الكمية', f: r => fmt(r.qty, 3).replace(/\.?0+$/, '') }, { t: 'التكلفة', f: r => r.unit_cost ? fmt(r.unit_cost) : '' }, { t: 'المرجع', k: 'ref' }, { t: 'ملاحظات', k: 'notes' }], rows)); };
P.inv_card = async () => {
  const items = await GET('/inv/items'); if (!items.length) return h('div', null, pageHead('📇 كارت الصنف'), note('لا توجد أصناف بعد.'));
  const sel = h('select', null, items.map(i => h('option', { value: i.id, selected: String(i.id) === String(MZ.invItem) }, i.code + ' ' + i.name))); const out = h('div');
  const show = async () => { MZ.invItem = sel.value; const d = await GET('/inv/card?item=' + sel.value); out.innerHTML = ''; out.append(table([{ t: 'التاريخ', k: 'date' }, { t: 'الحركة', f: r => MK[r.kind] }, { t: 'المخزن', k: 'wh' }, { t: 'الكمية', f: r => (r.signed > 0 ? '+' : '') + String(r.signed) }, { t: 'تكلفة الوحدة', f: r => fmt(r.cost) }, { t: 'الرصيد', f: r => String(r.bal) }, { t: 'قيمة الرصيد', f: r => fmt(r.bal_val) }], d.rows)); };
  sel.onchange = show; show(); return h('div', null, pageHead('📇 كارت الصنف', sel, btn('⬇ تصدير', () => exportChooser())), out);
};
P.inv_count = async () => {
  const whs = await GET('/inv/wh'), st = await GET('/inv/stock'); const ws = h('select', null, whs.map(w => h('option', { value: w.id }, w.name))); const dt = h('input', { type: 'date', value: today() }); const inputs = {};
  const rows = st.rows.map(r => { const i = h('input', { type: 'number', step: '0.001', min: '0', placeholder: 'الفعلي' }); inputs[r.id] = i; return { r, i }; });
  const sys = (r) => (r.by_wh.find(w => String(w.wh_id) === ws.value) || { qty: 0 }).qty;
  const tb = table([{ t: 'الصنف', f: x => x.r.code + ' ' + x.r.name }, { t: 'الرصيد الدفتري', f: x => String(sys(x.r)) }, { t: 'الكمية بالجرد', f: x => x.i }], rows);
  return h('div', null, pageHead('📋 جرد المخزون', ws, dt, canW() ? btn('اعتماد الجرد', async () => { const lines = Object.entries(inputs).filter(([k, i]) => i.value !== '').map(([k, i]) => ({ item_id: k, counted: i.value })); const x = await POST('/inv/count', { date: dt.value, wh_id: ws.value, lines }); toast('تم تسوية ' + x.adjusted + ' صنف'); openPage('inv_stock'); }, 'pri') : null), note('اكتب الكمية الفعلية للأصناف التي جردتها فقط. الفروق تُسجَّل كحركات تسوية بمتوسط التكلفة وتظهر في كارت الصنف.'), tb);
};
['inv_stock', 'inv_items', 'inv_moves', 'inv_card', 'inv_count'].forEach(k => { MZ.pages[k] = P[k]; });
