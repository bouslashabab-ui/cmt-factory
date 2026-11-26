'use strict';
/* CMT factory pages */
const dt = (v) => v ? String(v).slice(0, 10) : '';
const canW = () => !!MZ.user && MZ.user.role !== 'viewer';
const cOpts = () => optsOf('clients', x => x.active);
const clientName = (id) => nameOf('clients', id);
const selEl = (opts, val) => { const el = h('select', { class: 'inp' }, h('option', { value: '' }, '—'), opts.map(o => h('option', { value: o.v }, o.t))); el.value = val ?? ''; return el; };
const P = MZ.pages;
const money = (n) => fmt(n);

function gridEd(cols, rows, onchange) {
  const body = h('tbody'); const lines = [];
  const tbl = h('table', { class: 'grid' }, h('thead', null, h('tr', null, cols.map(c => h('th', null, c.t)), h('th', null, ''))), body);
  const fire = () => onchange && onchange();
  const add = (v = {}) => {
    const cells = {}; const tr = h('tr');
    cols.forEach(c => {
      let el;
      if (c.opts) el = selEl(typeof c.opts === 'function' ? c.opts() : c.opts, v[c.k]);
      else el = h('input', { class: 'inp', type: c.type === 'number' ? 'number' : 'text', step: 'any', min: c.type === 'number' ? '0' : null, value: v[c.k] ?? '', placeholder: c.ph || null });
      el.addEventListener('input', fire); el.addEventListener('change', fire); cells[c.k] = el; tr.append(h('td', null, el));
    });
    const L = { cells, tr };
    tr.append(h('td', null, h('button', { class: 'btn sm danger', type: 'button', onclick: () => { tr.remove(); lines.splice(lines.indexOf(L), 1); fire(); } }, '×')));
    lines.push(L); body.append(tr); fire(); return L;
  };
  rows.forEach(add);
  const get = () => lines.map(L => Object.fromEntries(cols.map(c => { const v = L.cells[c.k].value; return [c.k, c.opts ? (v === '' ? null : v) : (c.type === 'number' ? (v === '' ? null : +v) : (v === '' ? null : v))]; })));
  const clear = () => { lines.splice(0).forEach(L => L.tr.remove()); fire(); };
  return { el: h('div', { class: 'tbl-wrap' }, tbl), add, get, clear };
}
const formGrid = (fields, vals) => {
  const fs = fields.map(f => ({ ...mkField(f, vals && vals[f.k]), k: f.k }));
  return { el: h('div', { class: 'form-grid' }, fs.map(x => h('label', { class: 'fld' + (x.f.full ? ' full' : '') }, h('span', null, x.f.t + (x.f.req ? ' *' : '')), x.el))), fs, get: () => Object.fromEntries(fs.map(x => [x.k, x.get()])), by: (k) => fs.find(x => x.k === k) };
};
const note = (t) => h('div', { class: 'panel' }, h('div', { class: 'pb', style: { color: '#7a4a00', background: '#fff6e5' } }, t));
const tag = (t, ok) => h('span', { class: 'tag' + (ok ? ' ok' : '') }, t);
const coHead = (title, extra) => h('div', { class: 'hd' }, h('span', { class: 'plogo', html: LOGO.replace(/#fff/g, '#c26a00') }), h('div', null, h('h2', null, MZ.settings.company_name || ''), h('div', null, [MZ.settings.address, MZ.settings.phone].filter(Boolean).join(' - '))), h('div', null, h('h2', null, title), extra || ''));
const sigRow = (a, b, c) => h('div', { class: 'sig' }, [a, b, c].map(x => h('div', null, x + ': ____________')));

/* ---------- generic CRUD ---------- */
function crud(cfg) {
  return async () => {
    const root = h('div');
    const render = async () => {
      const rows = await GET(cfg.path); if (cfg.lookup) await load(cfg.lookup, true);
      root.innerHTML = '';
      const cols = [...cfg.cols, canW() ? { t: '', f: (r) => h('span', null, btn('تعديل', () => edit(r), 'sm'), ' ', btn('حذف', async () => { if (await confirmBox('حذف هذا السجل؟')) { await DEL(cfg.path + '/' + r.id); toast('تم الحذف'); await render(); } }, 'sm danger')) } : null].filter(Boolean);
      root.append(pageHead(cfg.title, canW() ? btn('➕ جديد', () => edit(null), 'pri') : null, btn('⬇ تصدير Excel (CSV)', () => download(cfg.title + '.csv', csvOf(cfg.cols, rows)))), table(cols, rows, { empty: 'لا توجد بيانات بعد' }));
    };
    const edit = (r) => {
      const f = formGrid(cfg.fields, r || cfg.defaults || {});
      modal((r ? 'تعديل: ' : 'جديد: ') + cfg.title, f.el, [{ t: 'حفظ', kind: 'pri', fn: async (close) => { const b = f.get(); if (r) await PUT(cfg.path + '/' + r.id, b); else await POST(cfg.path, b); close(); toast('تم الحفظ'); await render(); } }, { t: 'إلغاء', fn: (c) => c() }]);
    };
    await render(); return root;
  };
}
const activeTag = (r) => tag(r.active ? 'نشط' : 'موقوف', r.active);
P.clients = crud({ title: 'العملاء', path: '/clients', lookup: 'clients', defaults: { active: 1 },
  cols: [{ t: 'الكود', k: 'code' }, { t: 'اسم العميل', k: 'name' }, { t: 'الهاتف', k: 'phone' }, { t: 'العنوان', k: 'address' }, { t: 'الحالة', f: activeTag, csv: r => r.active ? 'نشط' : 'موقوف' }],
  fields: [{ k: 'code', t: 'الكود', req: 1 }, { k: 'name', t: 'اسم العميل', req: 1 }, { k: 'phone', t: 'الهاتف' }, { k: 'address', t: 'العنوان' }, { k: 'notes', t: 'ملاحظات', full: 1 }, { k: 'active', t: 'نشط', type: 'check' }] });
P.models = async () => { await load('clients'); return crud({ title: 'الموديلات', path: '/models', lookup: 'models', defaults: { active: 1 },
  cols: [{ t: 'الكود', k: 'code' }, { t: 'الموديل', k: 'name' }, { t: 'العميل', f: r => clientName(r.client_id), csv: r => clientName(r.client_id) }, { t: 'سعر التصنيع للقطعة', k: 'price', num: 1 }, { t: 'الوصف', k: 'description' }, { t: 'الحالة', f: activeTag, csv: r => r.active ? 'نشط' : 'موقوف' }],
  fields: [{ k: 'code', t: 'كود الموديل', req: 1 }, { k: 'name', t: 'اسم الموديل', req: 1 }, { k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts }, { k: 'price', t: 'سعر التصنيع للقطعة', type: 'number' }, { k: 'description', t: 'الوصف', full: 1 }, { k: 'active', t: 'نشط', type: 'check' }] })(); };
P.stages = crud({ title: 'مراحل الإنتاج', path: '/stages', lookup: 'stages', defaults: { active: 1, seq: 1 },
  cols: [{ t: 'الترتيب', k: 'seq' }, { t: 'اسم المرحلة', k: 'name' }, { t: 'الحالة', f: activeTag, csv: r => r.active ? 'نشط' : 'موقوف' }],
  fields: [{ k: 'seq', t: 'الترتيب', type: 'number' }, { k: 'name', t: 'اسم المرحلة', req: 1 }, { k: 'active', t: 'نشط', type: 'check' }] });
P.payments = async () => { await load('clients'); return crud({ title: 'مدفوعات العملاء', path: '/payments', defaults: { date: today() },
  cols: [{ t: 'التاريخ', f: r => dt(r.date) }, { t: 'العميل', f: r => clientName(r.client_id), csv: r => clientName(r.client_id) }, { t: 'المبلغ', k: 'amount', num: 1 }, { t: 'الطريقة', k: 'method' }, { t: 'ملاحظات', k: 'notes' }],
  fields: [{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts, req: 1 }, { k: 'date', t: 'التاريخ', type: 'date', req: 1 }, { k: 'amount', t: 'المبلغ', type: 'number', req: 1 }, { k: 'method', t: 'الطريقة', type: 'select', options: ['نقدي', 'تحويل بنكي', 'شيك'].map(x => ({ v: x, t: x })) }, { k: 'notes', t: 'ملاحظات', full: 1 }] })(); };

/* ---------- fabric receipts ---------- */
P.receipts = async () => {
  await load('clients', true);
  const root = h('div');
  const render = async () => {
    const rows = await GET('/receipts'); root.innerHTML = '';
    root.append(pageHead('استلام قماش من العملاء', canW() ? btn('➕ استلام جديد', newForm, 'pri') : null), note('القماش ملك العميل: يُسجَّل بالطول والوزن واللون فقط، ولا يدخل مخزون الشركة ولا يُقيَّم بسعر.'),
      table([{ t: 'رقم الاستلام', k: 'number' }, { t: 'التاريخ', f: r => dt(r.date) }, { t: 'العميل', k: 'client_name' }, { t: 'إذن العميل', k: 'ref_no' }, { t: 'عدد الأتواب', k: 'roll_count' }, { t: 'الطول (م)', f: r => fq(r.length_m), num: 1 }, { t: 'الوزن (كجم)', f: r => fq(r.weight_kg), num: 1 }, { t: 'المستخدم (م)', f: r => fq(r.used_m), num: 1 }], rows, { onrow: (r) => view(r.id), empty: 'لا يوجد استلام قماش بعد' }));
  };
  const view = async (id) => {
    const r = await GET('/receipts/' + id);
    const doc = h('div', { class: 'print-doc' }, coHead('إيصال استلام قماش', r.number), h('p', null, 'العميل: ' + r.client_name + '   |   التاريخ: ' + dt(r.date) + '   |   إذن العميل: ' + (r.ref_no || '-')),
      table([{ t: '#', f: (x, i) => i + 1 }, { t: 'رقم التوب', k: 'roll_no' }, { t: 'الخامة', k: 'fabric_type' }, { t: 'اللون', k: 'color' }, { t: 'الطول (م)', f: x => fq(x.length_m), num: 1 }, { t: 'الوزن (كجم)', f: x => fq(x.weight_kg), num: 1 }], r.rolls, { foot: [null, null, null, 'الإجمالي', fq(r.rolls.reduce((a, x) => a + +x.length_m, 0)), fq(r.rolls.reduce((a, x) => a + +x.weight_kg, 0))] }),
      h('p', null, 'القماش مملوك للعميل ومحتفظ به لدى المصنع لغرض التصنيع فقط.'), sigRow('أمين المخزن', 'المستلم', 'مندوب العميل'));
    modal('استلام ' + r.number, doc, [{ t: '🖨 طباعة', kind: 'pri', fn: () => printEl(r.number, doc) }, canW() ? { t: '🗑 حذف الاستلام', kind: 'danger', fn: async (c) => { if (await confirmBox('حذف الاستلام ' + r.number + '؟')) { await DEL('/receipts/' + id); c(); toast('تم الحذف'); render(); } } } : null, { t: 'إغلاق', fn: (c) => c() }].filter(Boolean), { wide: 1 });
  };
  const newForm = () => {
    const f = formGrid([{ k: 'client_id', t: 'العميل (صاحب القماش)', type: 'ref', ref: cOpts, req: 1 }, { k: 'date', t: 'تاريخ الاستلام', type: 'date', def: today(), req: 1 }, { k: 'ref_no', t: 'رقم إذن العميل / الشحنة' }, { k: 'notes', t: 'ملاحظات' }]);
    const tot = h('b', null, '');
    let g;
    g = gridEd([{ k: 'roll_no', t: 'رقم التوب (اختياري)' }, { k: 'fabric_type', t: 'الخامة' }, { k: 'color', t: 'اللون' }, { k: 'length_m', t: 'الطول (م)', type: 'number' }, { k: 'weight_kg', t: 'الوزن (كجم)', type: 'number' }], [{}, {}], () => { const r = g ? g.get() : []; tot.textContent = 'عدد الأتواب: ' + r.filter(x => x.length_m).length + ' | الطول: ' + fq(r.reduce((a, x) => a + (x.length_m || 0), 0)) + ' م | الوزن: ' + fq(r.reduce((a, x) => a + (x.weight_kg || 0), 0)) + ' كجم'; });
    modal('استلام قماش جديد', h('div', null, f.el, h('h3', null, 'الأتواب'), g.el, btn('➕ توب', () => g.add({}), 'sm'), h('div', null, tot)), [{ t: 'حفظ الاستلام', kind: 'pri', fn: async (close) => { const b = f.get(); b.rolls = g.get().filter(x => x.length_m || x.roll_no || x.color); const r = await POST('/receipts', b); close(); toast('تم الاستلام ' + r.number); await render(); view(r.id); } }, { t: 'إلغاء', fn: (c) => c() }], { wide: 1 });
  };
  await render(); return root;
};

/* ---------- client rolls balance ---------- */
P.rolls = async () => {
  await load('clients', true);
  const root = h('div'), body = h('div');
  const run = async (v = {}) => {
    const rows = await GET('/rolls' + qs({ client_id: v.client_id, available: v.avail ? 1 : '' })); body.innerHTML = '';
    body.append(table([{ t: 'العميل', k: 'client_name' }, { t: 'رقم التوب', k: 'roll_no' }, { t: 'الاستلام', k: 'receipt_number' }, { t: 'الخامة', k: 'fabric_type' }, { t: 'اللون', k: 'color' }, { t: 'الطول (م)', f: r => fq(r.length_m), num: 1 }, { t: 'المستخدم (م)', f: r => fq(r.used_m), num: 1 }, { t: 'المتبقي (م)', f: r => fq(r.remaining_m), num: 1 }, { t: 'المتبقي (كجم)', f: r => fq(r.remaining_kg), num: 1 }], rows,
      { foot: [null, null, null, null, 'الإجمالي', fq(rows.reduce((a, r) => a + +r.length_m, 0)), fq(rows.reduce((a, r) => a + +r.used_m, 0)), fq(rows.reduce((a, r) => a + +r.remaining_m, 0)), fq(rows.reduce((a, r) => a + +r.remaining_kg, 0))], empty: 'لا توجد أتواب' }));
  };
  root.append(pageHead('أرصدة أتواب العملاء'), note('هذه أرصدة قماش مملوك للعملاء، منفصلة تماماً عن مخزون الشركة.'), filterBar([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts }, { k: 'avail', t: 'المتاح فقط', type: 'check', def: 1 }], run, { avail: 1 }), body);
  await run({ avail: 1 }); return root;
};

/* ---------- cutting orders ---------- */
const cutStatus = (r) => (r.net - r.delivered - r.defects) <= 0 ? tag('مكتمل', 1) : (r.finished > 0 || r.defects > 0 || r.wip < r.net ? tag('قيد التشغيل') : tag('تم القص'));
async function showCut(id, after) {
  const r = await GET('/cuts/' + id); const p = r.progress;
  const sizesT = table([{ t: 'المقاس', k: 'size' }, { t: 'النسبة في الماركر', k: 'ratio' }, { t: 'عدد القطع', k: 'pieces', num: 0 }], r.sizes, { foot: ['الإجمالي', r.sizes.reduce((a, x) => a + x.ratio, 0), r.pieces_cut] });
  const layersT = table([{ t: 'التوب', k: 'roll_no' }, { t: 'اللون', k: 'color' }, { t: 'الطبقات', k: 'layers' }, { t: 'هدر نهاية التوب (م)', f: x => fq(x.end_waste_m), num: 1 }, { t: 'القماش المستخدم (م)', f: x => fq(x.used_m), num: 1 }], r.layers, { foot: [null, 'الإجمالي', r.total_layers, fq(r.waste_m), fq(r.fabric_used_m)] });
  const stT = table([{ t: 'المرحلة', k: 'name' }, { t: 'الوارد', k: 'input' }, { t: 'سليم', k: 'ok' }, { t: 'عيوب', k: 'defect' }, { t: 'تحت التشغيل', k: 'wip' }], p.stages);
  const doc = h('div', { class: 'print-doc' }, coHead('بطاقة أمر قص', r.number),
    h('p', null, 'العميل: ' + r.client_name + '   |   الموديل: ' + r.model_code + ' - ' + r.model_name + '   |   التاريخ: ' + dt(r.date)),
    h('p', null, 'طول الماركر: ' + fq(r.marker_len) + ' م   |   عدد الطبقات: ' + r.total_layers + '   |   القطع المقصوصة: ' + r.pieces_cut + '   |   تالف القص: ' + r.damaged_pcs + '   |   الصافي: ' + p.net),
    h('h3', null, 'المقاسات'), sizesT, h('h3', null, 'الفرد (الطبقات)'), layersT,
    h('p', null, 'هدر القماش: ' + fq(r.waste_m) + ' م (' + (r.fabric_used_m > 0 ? fq(100 * r.waste_m / r.fabric_used_m) : 0) + '%)'), h('h3', null, 'مراحل الإنتاج'), stT,
    h('p', null, 'منتهي: ' + p.finished + '   |   مسلّم للعميل: ' + p.delivered + '   |   بالمصنع جاهز للتسليم: ' + p.at_factory), sigRow('مسؤول القص', 'مدير الإنتاج', 'المراقب'));
  const logsT = table([{ t: 'التاريخ', f: x => dt(x.date) }, { t: 'المرحلة', k: 'stage_name' }, { t: 'سليم', k: 'qty_ok' }, { t: 'عيوب', k: 'qty_defect' }, { t: 'الخط/الماكينة', k: 'line_name' }], r.logs);
  modal('أمر القص ' + r.number, h('div', null, doc, h('h3', null, 'سجل الإنتاج'), logsT), [{ t: '🖨 طباعة بطاقة القص', kind: 'pri', fn: () => printEl(r.number, doc) }, canW() ? { t: '🗑 حذف الأمر', kind: 'danger', fn: async (c) => { if (await confirmBox('حذف أمر القص ' + r.number + ' وإرجاع القماش للتوب؟')) { await DEL('/cuts/' + id); c(); toast('تم الحذف'); after && after(); } } } : null, { t: 'إغلاق', fn: (c) => c() }].filter(Boolean), { wide: 1 });
}
P.cuts = async () => {
  await Promise.all([load('clients', true), load('models', true)]);
  const root = h('div');
  const render = async () => {
    const rows = await GET('/cuts'); root.innerHTML = '';
    root.append(pageHead('أوامر القص', canW() ? btn('➕ أمر قص جديد', newForm, 'pri') : null),
      table([{ t: 'الأمر', k: 'number' }, { t: 'التاريخ', f: r => dt(r.date) }, { t: 'العميل', k: 'client_name' }, { t: 'الموديل', f: r => r.model_code + ' - ' + r.model_name }, { t: 'الطبقات', k: 'total_layers' }, { t: 'قطع مقصوصة', k: 'pieces_cut' }, { t: 'تالف القص', k: 'damaged_pcs' }, { t: 'منتهي', k: 'finished' }, { t: 'مسلّم', k: 'delivered' }, { t: 'هدر (م)', f: r => fq(r.waste_m), num: 1 }, { t: 'الحالة', f: cutStatus }], rows, { onrow: (r) => showCut(r.id, render), empty: 'لا توجد أوامر قص' }));
  };
  const newForm = async () => {
    let rolls = [];
    const f = formGrid([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts, req: 1 }, { k: 'model_id', t: 'الموديل', type: 'ref', ref: () => [], req: 1 }, { k: 'date', t: 'تاريخ القص', type: 'date', def: today(), req: 1 }, { k: 'marker_len', t: 'طول الماركر (م)', type: 'number', req: 1 }, { k: 'damaged_pcs', t: 'قطع تالفة في القص', type: 'number', def: 0 }, { k: 'notes', t: 'ملاحظات' }]);
    const sum = h('div', { class: 'kpis' });
    let sizes, layers;
    sizes = gridEd([{ k: 'size', t: 'المقاس' }, { k: 'ratio', t: 'عدد القطع في الماركر', type: 'number' }], [{ size: 'M', ratio: 1 }], () => calc());
    layers = gridEd([{ k: 'roll_id', t: 'التوب (المتاح)', opts: () => rolls.map(x => ({ v: x.id, t: x.roll_no + ' | ' + (x.color || '-') + ' | متاح ' + fq(x.remaining_m) + ' م' })) }, { k: 'layers', t: 'عدد الطبقات', type: 'number' }, { k: 'end_waste_m', t: 'هدر نهاية التوب (م)', type: 'number' }], [], () => calc());
    function calc() {
      if (typeof sizes === 'undefined' || typeof layers === 'undefined') return;
      const marker = +(f.get().marker_len || 0), rs = sizes.get().reduce((a, x) => a + (x.ratio || 0), 0), L = layers.get();
      const tl = L.reduce((a, x) => a + (x.layers || 0), 0), used = L.reduce((a, x) => a + (x.layers || 0) * marker + (x.end_waste_m || 0), 0);
      const k = (t, v) => h('div', { class: 'kpi' }, h('span', null, t), h('b', null, v));
      sum.innerHTML = ''; sum.append(k('إجمالي الطبقات', tl), k('القطع المتوقعة', tl * rs), k('القماش المستخدم (م)', fq(used)), k('الهدر (م)', fq(L.reduce((a, x) => a + (x.end_waste_m || 0), 0))));
    }
    const cl = f.by('client_id');
    cl.el.querySelector('input').addEventListener('change', async () => {
      const cid = cl.get(); layers.clear(); rolls = cid ? await GET('/rolls' + qs({ client_id: cid, available: 1 })) : [];
      f.by('model_id').el._combo.setOptions(optsOf('models', x => x.active && (!x.client_id || x.client_id === cid)));
      layers.add({});
    });
    f.by('marker_len').el.addEventListener('input', calc);
    modal('أمر قص جديد', h('div', null, f.el, h('h3', null, 'المقاسات ونسبتها في الماركر'), sizes.el, btn('➕ مقاس', () => sizes.add({}), 'sm'), h('h3', null, 'الفرد: الأتواب وعدد الطبقات'), layers.el, btn('➕ توب', () => layers.add({}), 'sm'), sum),
      [{ t: 'حفظ أمر القص', kind: 'pri', fn: async (close) => { const b = f.get(); b.sizes = sizes.get().filter(x => x.size); b.layers = layers.get().filter(x => x.roll_id); const r = await POST('/cuts', b); close(); toast('تم أمر القص ' + r.number + ' (' + r.pieces_cut + ' قطعة)'); await render(); } }, { t: 'إلغاء', fn: (c) => c() }], { wide: 1 });
    calc();
  };
  await render(); return root;
};

/* ---------- production ---------- */
const openCuts = (rows) => rows.filter(r => (r.net - r.delivered - r.defects) > 0);
P.prod = async () => {
  await Promise.all([load('stages', true), load('clients')]);
  const root = h('div'), prog = h('div'), logs = h('div');
  let cuts = await GET('/cuts');
  const cutOpts = () => openCuts(cuts).map(r => ({ v: r.id, t: r.number + ' | ' + r.model_name + ' | ' + r.client_name + ' | صافي ' + r.net }));
  const f = formGrid([{ k: 'cut_id', t: 'أمر القص', type: 'ref', ref: cutOpts, req: 1 }, { k: 'stage_id', t: 'المرحلة', type: 'ref', ref: () => optsOf('stages', s => s.active, s => s.name), req: 1 }, { k: 'date', t: 'التاريخ', type: 'date', def: today() }, { k: 'qty_ok', t: 'الكمية السليمة', type: 'number' }, { k: 'qty_defect', t: 'كمية العيوب', type: 'number', def: 0 }, { k: 'line_name', t: 'الماكينة / الخط / العامل' }, { k: 'notes', t: 'ملاحظات' }]);
  const showProg = async () => {
    prog.innerHTML = ''; const id = f.by('cut_id').get(); if (!id) return;
    const r = await GET('/cuts/' + id); const p = r.progress;
    prog.append(h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'تقدم ' + r.number + ' - ' + r.model_name + ' (صافي القص ' + p.net + ' | منتهي ' + p.finished + ' | مسلّم ' + p.delivered + ')'), h('div', { class: 'pb' }, table([{ t: 'المرحلة', k: 'name' }, { t: 'الوارد للمرحلة', k: 'input' }, { t: 'سليم', k: 'ok' }, { t: 'عيوب', k: 'defect' }, { t: 'المتاح للتسجيل', k: 'wip' }], p.stages))));
  };
  const loadLogs = async () => { const rows = await GET('/prod'); logs.innerHTML = ''; logs.append(h('h3', null, 'آخر حركات الإنتاج'), table([{ t: 'التاريخ', f: r => dt(r.date) }, { t: 'الأمر', k: 'cut_number' }, { t: 'الموديل', k: 'model_name' }, { t: 'العميل', k: 'client_name' }, { t: 'المرحلة', k: 'stage_name' }, { t: 'سليم', k: 'qty_ok' }, { t: 'عيوب', k: 'qty_defect' }, { t: 'الخط', k: 'line_name' }, canW() ? { t: '', f: r => btn('حذف', async () => { if (await confirmBox('حذف هذه الحركة؟')) { await DEL('/prod/' + r.id); toast('تم الحذف'); await refresh(); } }, 'sm danger') } : null].filter(Boolean), rows.slice(0, 100), { empty: 'لا توجد حركات' })); };
  const refresh = async () => { cuts = await GET('/cuts'); f.by('cut_id').el._combo.setOptions(cutOpts()); await showProg(); await loadLogs(); };
  f.by('cut_id').el.querySelector('input').addEventListener('change', showProg);
  root.append(pageHead('تسجيل الإنتاج بالمراحل'), note('كل مرحلة لا تقبل كمية أكبر من السليم في المرحلة السابقة (والمرحلة الأولى من صافي القص).'), h('div', { class: 'panel' }, h('div', { class: 'pb' }, f.el, canW() ? btn('💾 تسجيل', async () => { const b = f.get(); await POST('/prod', b); toast('تم تسجيل الإنتاج'); f.by('qty_ok').set(''); f.by('qty_defect').set(0); await refresh(); }, 'pri') : null)), prog, logs);
  await loadLogs(); return root;
};
P.track = async () => {
  await load('stages', true); await load('clients', true);
  const root = h('div'), body = h('div');
  const st = MZ.L.stages.filter(s => s.active);
  const run = async (v = {}) => {
    let rows = await GET('/cuts'); if (v.client_id) rows = rows.filter(r => r.client_id === +v.client_id); if (v.open) rows = openCuts(rows);
    body.innerHTML = '';
    body.append(table([{ t: 'الأمر', k: 'number' }, { t: 'العميل', k: 'client_name' }, { t: 'الموديل', k: 'model_name' }, { t: 'صافي القص', k: 'net' }, ...st.map(s => ({ t: s.name + ' (سليم/متاح)', f: r => { const x = r.progress.stages.find(y => y.stage_id === s.id); return x ? x.ok + ' / ' + Math.max(x.wip, 0) : ''; } })), { t: 'عيوب', k: 'defects' }, { t: 'جاهز بالمصنع', k: 'at_factory' }, { t: 'مسلّم', k: 'delivered' }], rows, { onrow: (r) => showCut(r.id, () => run(filt.values())), empty: 'لا توجد أوامر' }));
  };
  const filt = filterBar([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts }, { k: 'open', t: 'المفتوحة فقط', type: 'check', def: 1 }], run, { open: 1 });
  root.append(pageHead('متابعة أوامر التشغيل'), filt, body); await run({ open: 1 }); return root;
};

/* ---------- deliveries ---------- */
P.deliveries = async () => {
  await load('clients', true);
  const root = h('div');
  const render = async () => {
    const rows = await GET('/deliveries'); root.innerHTML = '';
    root.append(pageHead('تسليم بضاعة للعميل', canW() ? btn('➕ تسليم جديد', newForm, 'pri') : null),
      table([{ t: 'رقم التسليم', k: 'number' }, { t: 'التاريخ', f: r => dt(r.date) }, { t: 'العميل', k: 'client_name' }, { t: 'السائق', k: 'driver' }, { t: 'إجمالي القطع', k: 'qty' }, { t: 'الفوترة', f: r => +r.billed_lines >= +r.lines && +r.lines > 0 ? tag('مفوتر', 1) : tag('غير مفوتر') }], rows, { onrow: (r) => view(r.id), empty: 'لا توجد تسليمات' }));
  };
  const view = async (id) => {
    const r = await GET('/deliveries/' + id);
    const doc = h('div', { class: 'print-doc' }, coHead('إذن تسليم بضاعة تامة الصنع', r.number), h('p', null, 'العميل: ' + r.client_name + '   |   التاريخ: ' + dt(r.date) + '   |   السائق: ' + (r.driver || '-')),
      table([{ t: '#', f: (x, i) => i + 1 }, { t: 'أمر القص', k: 'cut_number' }, { t: 'الموديل', f: x => x.model_code + ' - ' + x.model_name }, { t: 'الكمية (قطعة)', k: 'qty' }], r.lines, { foot: [null, null, 'الإجمالي', r.lines.reduce((a, x) => a + x.qty, 0)] }), sigRow('أمين المخزن', 'السائق', 'مستلم العميل'));
    modal('تسليم ' + r.number, doc, [{ t: '🖨 طباعة', kind: 'pri', fn: () => printEl(r.number, doc) }, canW() ? { t: '🗑 حذف', kind: 'danger', fn: async (c) => { if (await confirmBox('حذف التسليم ' + r.number + '؟')) { await DEL('/deliveries/' + id); c(); toast('تم الحذف'); render(); } } } : null, { t: 'إغلاق', fn: (c) => c() }].filter(Boolean), { wide: 1 });
  };
  const newForm = () => {
    let cuts = [];
    const f = formGrid([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts, req: 1 }, { k: 'date', t: 'تاريخ التسليم', type: 'date', def: today(), req: 1 }, { k: 'driver', t: 'السائق / المستلم' }, { k: 'notes', t: 'ملاحظات' }]);
    const g = gridEd([{ k: 'cut_id', t: 'أمر القص (المتاح للتسليم)', opts: () => cuts.map(r => ({ v: r.id, t: r.number + ' | ' + r.model_name + ' | متاح ' + r.at_factory })) }, { k: 'qty', t: 'الكمية', type: 'number' }], []);
    f.by('client_id').el.querySelector('input').addEventListener('change', async () => { const cid = f.by('client_id').get(); g.clear(); cuts = cid ? (await GET('/cuts')).filter(r => r.client_id === cid && r.at_factory > 0) : []; g.add({}); });
    modal('تسليم جديد للعميل', h('div', null, f.el, g.el, btn('➕ سطر', () => g.add({}), 'sm')), [{ t: 'حفظ التسليم', kind: 'pri', fn: async (close) => { const b = f.get(); b.lines = g.get().filter(x => x.cut_id && x.qty); const r = await POST('/deliveries', b); close(); toast('تم التسليم ' + r.number); await render(); view(r.id); } }, { t: 'إلغاء', fn: (c) => c() }], { wide: 1 });
  };
  await render(); return root;
};

/* ---------- invoices ---------- */
P.invoices = async () => {
  await load('clients', true);
  const root = h('div');
  const render = async () => {
    const rows = await GET('/invoices'); root.innerHTML = '';
    root.append(pageHead('فواتير التصنيع', canW() ? btn('➕ فاتورة جديدة', newForm, 'pri') : null),
      table([{ t: 'رقم الفاتورة', k: 'number' }, { t: 'التاريخ', f: r => dt(r.date) }, { t: 'العميل', k: 'client_name' }, { t: 'الإجمالي', k: 'total', num: 1 }], rows, { onrow: (r) => view(r.id), empty: 'لا توجد فواتير' }));
  };
  const view = async (id) => {
    const r = await GET('/invoices/' + id);
    const doc = h('div', { class: 'print-doc' }, coHead('فاتورة خدمة تصنيع', r.number), h('p', null, 'العميل: ' + r.client_name + '   |   التاريخ: ' + dt(r.date)),
      table([{ t: '#', f: (x, i) => i + 1 }, { t: 'البيان', k: 'description' }, { t: 'الكمية', f: x => fq(x.qty), num: 1 }, { t: 'السعر', k: 'price', num: 1 }, { t: 'الإجمالي', k: 'amount', num: 1 }], r.lines, { foot: [null, null, null, 'الإجمالي (' + (MZ.settings.currency || '') + ')', fmt(r.total)] }),
      h('p', null, 'الفاتورة عن خدمة التصنيع فقط، والقماش مملوك للعميل.'), h('p', null, MZ.settings.invoice_footer || ''), sigRow('المحاسب', 'المدير', 'استلام العميل'));
    modal('فاتورة ' + r.number, doc, [{ t: '🖨 طباعة', kind: 'pri', fn: () => printEl(r.number, doc) }, canW() ? { t: '🗑 حذف', kind: 'danger', fn: async (c) => { if (await confirmBox('حذف الفاتورة ' + r.number + ' وإعادة التسليمات للفوترة؟')) { await DEL('/invoices/' + id); c(); toast('تم الحذف'); render(); } } } : null, { t: 'إغلاق', fn: (c) => c() }].filter(Boolean), { wide: 1 });
  };
  const newForm = () => {
    const f = formGrid([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts, req: 1 }, { k: 'date', t: 'تاريخ الفاتورة', type: 'date', def: today(), req: 1 }, { k: 'notes', t: 'ملاحظات' }]);
    const box = h('div'); const tot = h('b', null, ''); let items = [];
    let extra;
    extra = gridEd([{ k: 'description', t: 'بند خدمة إضافي (اختياري)' }, { k: 'qty', t: 'الكمية', type: 'number' }, { k: 'price', t: 'السعر', type: 'number' }], [], () => calc());
    function calc() {
      if (typeof extra === 'undefined') return;
      let t = 0; items.forEach(x => { if (x.chk.checked) t += x.qty * (+x.price.value || 0); });
      extra.get().forEach(x => { t += (x.qty || 0) * (x.price || 0); }); tot.textContent = 'الإجمالي: ' + fmt(t);
    }
    f.by('client_id').el.querySelector('input').addEventListener('change', async () => {
      const cid = f.by('client_id').get(); box.innerHTML = ''; items = []; if (!cid) return;
      const rows = await GET('/unbilled?client_id=' + cid);
      if (!rows.length) box.append(h('p', { class: 'empty' }, 'لا توجد تسليمات غير مفوترة لهذا العميل'));
      const tb = h('table', { class: 'grid' }, h('thead', null, h('tr', null, ['', 'التسليم', 'الموديل', 'الكمية', 'سعر القطعة', 'الإجمالي'].map(x => h('th', null, x)))));
      const body = h('tbody'); rows.forEach(r => {
        const chk = h('input', { type: 'checkbox', class: 'chk', checked: true }), price = h('input', { class: 'inp', type: 'number', step: 'any', value: r.price }), amt = h('td', { class: 'num' }, '');
        const x = { chk, price, qty: r.qty, id: r.delivery_line_id, r }; items.push(x);
        const upd = () => { amt.textContent = fmt(r.qty * (+price.value || 0)); calc(); }; chk.addEventListener('change', upd); price.addEventListener('input', upd); amt.textContent = fmt(r.qty * r.price);
        body.append(h('tr', null, h('td', null, chk), h('td', null, r.delivery_number + ' (' + dt(r.date) + ')'), h('td', null, r.model_code + ' - ' + r.model_name), h('td', { class: 'num' }, r.qty), h('td', null, price), amt));
      });
      tb.append(body); box.append(h('div', { class: 'tbl-wrap' }, tb)); calc();
    });
    modal('فاتورة تصنيع جديدة', h('div', null, f.el, h('h3', null, 'قطع مسلّمة غير مفوترة'), box, h('h3', null, 'بنود إضافية'), extra.el, btn('➕ بند', () => extra.add({}), 'sm'), h('div', null, tot)),
      [{ t: 'حفظ الفاتورة', kind: 'pri', fn: async (close) => { const b = f.get(); b.lines = [...items.filter(x => x.chk.checked).map(x => ({ delivery_line_id: x.id, price: +x.price.value })), ...extra.get().filter(x => x.description).map(x => ({ description: x.description, qty: x.qty, price: x.price }))]; const r = await POST('/invoices', b); close(); toast('تمت الفاتورة ' + r.number + ' بإجمالي ' + fmt(r.total)); await render(); view(r.id); } }, { t: 'إلغاء', fn: (c) => c() }], { wide: 1 });
  };
  await render(); return root;
};

/* ---------- reports ---------- */
P.statement = async () => {
  await load('clients', true);
  const root = h('div'), body = h('div');
  const run = async (v) => {
    if (!v.client_id) { toast('اختر العميل', 'err'); return; }
    const r = await GET('/reports/statement?client_id=' + v.client_id); body.innerHTML = '';
    const doc = h('div', { class: 'print-doc' }, coHead('كشف حساب عميل'), h('p', null, 'العميل: ' + r.client.name),
      table([{ t: 'التاريخ', f: x => dt(x.date) }, { t: 'البيان', f: x => x.kind === 'invoice' ? 'فاتورة ' + x.ref : x.ref }, { t: 'مدين', k: 'debit', num: 1 }, { t: 'دائن', k: 'credit', num: 1 }, { t: 'الرصيد', k: 'balance', num: 1 }], r.rows, { foot: [null, 'الرصيد المستحق على العميل', null, null, fmt(r.balance)] }));
    body.append(btn('🖨 طباعة', () => printEl('كشف حساب', doc)), doc);
  };
  root.append(pageHead('كشف حساب عميل'), filterBar([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts }], run), body); return root;
};
P.stockrep = async () => {
  await load('clients', true);
  const root = h('div'), body = h('div');
  const run = async (v = {}) => {
    const r = await GET('/reports/stock' + qs({ client_id: v.client_id })); body.innerHTML = '';
    body.append(h('h3', null, 'أقمشة العملاء لدى المصنع (بالطول والوزن، بدون قيمة)'), table([{ t: 'العميل', k: 'client_name' }, { t: 'الخامة', k: 'fabric_type' }, { t: 'اللون', k: 'color' }, { t: 'أتواب', k: 'rolls' }, { t: 'المستلم (م)', f: x => fq(x.received_m), num: 1 }, { t: 'المستخدم (م)', f: x => fq(x.used_m), num: 1 }, { t: 'المتبقي (م)', f: x => fq(x.remaining_m), num: 1 }, { t: 'المتبقي (كجم)', f: x => fq(x.remaining_kg), num: 1 }], r.rolls, { empty: 'لا يوجد قماش' }),
      h('h3', null, 'بضاعة العملاء (قطع) داخل المصنع'), table([{ t: 'العميل', k: 'client_name' }, { t: 'قطع تحت التشغيل', k: 'in_production' }, { t: 'جاهزة للتسليم', k: 'finished_at_factory' }, { t: 'تم تسليمها', k: 'delivered' }, { t: 'عيوب مسجلة', k: 'defects' }], r.pieces, { empty: 'لا توجد بيانات' }));
  };
  root.append(pageHead('مخزون العملاء (غير مقيّم)'), note('هذا مخزون مملوك للعملاء ومنفصل عن أي مخزون أو أصول للشركة، ولا يظهر له سعر أو قيمة.'), filterBar([{ k: 'client_id', t: 'العميل', type: 'ref', ref: cOpts }], run), body);
  await run(); return root;
};
P.waste = async () => {
  const root = h('div'), body = h('div');
  const run = async (v = {}) => {
    const rows = await GET('/reports/waste' + qs(v)); body.innerHTML = '';
    body.append(table([{ t: 'الأمر', k: 'number' }, { t: 'التاريخ', f: r => dt(r.date) }, { t: 'العميل', k: 'client_name' }, { t: 'الموديل', k: 'model_name' }, { t: 'قماش مستخدم (م)', f: r => fq(r.fabric_used_m), num: 1 }, { t: 'هدر (م)', f: r => fq(r.waste_m), num: 1 }, { t: 'نسبة الهدر %', f: r => fq(r.waste_pct), num: 1 }, { t: 'قطع مقصوصة', k: 'pieces_cut' }, { t: 'تالف القص', k: 'damaged_pcs' }, { t: 'عيوب الإنتاج', k: 'prod_defects' }], rows, { empty: 'لا توجد بيانات' }));
  };
  root.append(pageHead('الهدر والعيوب'), filterBar([{ k: 'from', t: 'من', type: 'date' }, { k: 'to', t: 'إلى', type: 'date' }], run), body); await run(); return root;
};

/* ---------- home ---------- */
P.home = async () => {
  const d = await GET('/reports/dashboard');
  const k = (t, v, c) => h('div', { class: 'kpi ' + (c || '') }, h('span', null, t), h('b', null, v));
  const step = (n, t, key, sub) => h('button', { class: 'btn', style: { padding: '12px 16px', margin: '4px' }, onclick: () => openPage(key) }, h('b', null, n + '. ' + t), h('div', { style: { fontSize: '11px', opacity: .8 } }, sub));
  return h('div', null, pageHead('الرئيسية - ' + (MZ.settings.company_name || '')),
    h('div', { class: 'kpis' }, k('عملاء', d.clients), k('قماش العملاء المتبقي (م)', fq(d.fabric_m)), k('أوامر قص مفتوحة', d.open_orders), k('قطع تحت التشغيل', d.in_production), k('جاهز للتسليم', d.ready_to_deliver), k('مسلّم للعملاء', d.delivered), k('غير مفوتر (قطع)', d.unbilled_qty), k('غير مفوتر (قيمة)', fmt(d.unbilled_value)), k('رصيد العملاء المستحق', fmt(d.balance), d.balance > 0 ? 'neg' : 'pos')),
    h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'مسار العمل'), h('div', { class: 'pb' }, step(1, 'استلام قماش', 'receipts', 'أتواب العميل'), step(2, 'أمر قص', 'cuts', 'طبقات ومقاسات'), step(3, 'الإنتاج', 'prod', 'خياطة وكي وتشطيب'), step(4, 'تسليم للعميل', 'deliveries', 'إذن تسليم'), step(5, 'فاتورة التصنيع', 'invoices', 'بالقطعة'))),
    note('المصنع يعمل بالتصنيع للغير فقط: القماش ملك العميل ولا يدخل مخزون الشركة، والفاتورة عن الخدمة بالقطعة.'));
};

/* ---------- admin ---------- */
P.settings = async () => {
  const s = await GET('/settings');
  const f = formGrid([{ k: 'company_name', t: 'اسم المصنع' }, { k: 'currency', t: 'العملة' }, { k: 'address', t: 'العنوان' }, { k: 'phone', t: 'الهاتف' }, { k: 'invoice_footer', t: 'ذيل الفاتورة', full: 1 }], s);
  const pw = () => { const o = mkField({ type: 'password' }), n = mkField({ type: 'password' }); modal('تغيير كلمة مروري', h('div', { class: 'form-grid' }, h('label', { class: 'fld' }, h('span', null, 'الحالية'), o.el), h('label', { class: 'fld' }, h('span', null, 'الجديدة (8 أحرف)'), n.el)), [{ t: 'حفظ', kind: 'pri', fn: async (c) => { await POST('/password', { old: o.get(), password: n.get() }); c(); toast('تم تغيير كلمة المرور'); } }]); };
  return h('div', null, pageHead('الإعدادات'), h('div', { class: 'panel' }, h('div', { class: 'pb' }, f.el, btn('💾 حفظ', async () => { await PUT('/settings', f.get()); Object.assign(MZ.settings, f.get()); toast('تم الحفظ'); }, 'pri'), ' ', btn('🔑 تغيير كلمة مروري', pw))));
};
P.users = async () => {
  const root = h('div');
  const render = async () => {
    const rows = await GET('/users'); root.innerHTML = '';
    root.append(pageHead('المستخدمون', btn('➕ مستخدم', () => edit(null), 'pri')), table([{ t: 'اسم المستخدم', k: 'username' }, { t: 'الاسم', k: 'name' }, { t: 'الدور', f: r => ROLE_AR[r.role] }, { t: 'الحالة', f: activeTag }, { t: '', f: r => btn('تعديل', () => edit(r), 'sm') }], rows));
  };
  const edit = (r) => {
    const roles = Object.entries(ROLE_AR).map(([v, t]) => ({ v, t }));
    const f = formGrid([...(r ? [] : [{ k: 'username', t: 'اسم المستخدم', req: 1 }]), { k: 'name', t: 'الاسم' }, { k: 'role', t: 'الدور', type: 'select', options: roles, def: 'staff' }, { k: 'password', t: r ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور (8 أحرف)', type: 'password' }, ...(r ? [{ k: 'active', t: 'نشط', type: 'check' }] : [])], r || {});
    modal(r ? 'تعديل مستخدم' : 'مستخدم جديد', f.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { const b = f.get(); if (!b.password) delete b.password; if (r) await PUT('/users/' + r.id, b); else await POST('/users', b); c(); toast('تم الحفظ'); render(); } }]);
  };
  await render(); return root;
};
P.audit = async () => { const rows = await GET('/audit'); return h('div', null, pageHead('سجل المراجعة'), table([{ t: 'الوقت', f: r => String(r.ts).replace('T', ' ').slice(0, 19) }, { t: 'المستخدم', k: 'username' }, { t: 'العملية', k: 'action' }, { t: 'الكيان', k: 'entity' }, { t: 'التفاصيل', k: 'detail' }], rows)); };
