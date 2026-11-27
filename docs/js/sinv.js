'use strict';
/* Invoices UI: all sales types + purchases, Excel-style grid, formal navy print layout */
(function () {
  const P2 = {};
  const TNAMES = { cash: 'نقدية', credit: 'آجلة', return: 'مرتجع', quote: 'عرض سعر', purchase: 'مشتريات' };
  const TICONS = { cash: '💵', credit: '📕', return: '↩️', quote: '📋', purchase: '🛒' };
  let META = null;
  async function meta() { META = await GET('/sinv/meta') || {}; ['suppliers', 'clients', 'branches', 'warehouses', 'items'].forEach(k => { if (!Array.isArray(META[k])) META[k] = []; }); return META; }
  const sel = (opts, val, attrs) => { const s = h('select', attrs || {}); s.append(...opts.map(o => h('option', { value: String(o[0]), selected: String(o[0]) === String(val) ? 'selected' : null }, o[1]))); return s; };

  /* ---------- invoice editor (new + edit) ---------- */
  async function editor(editId, winKey) {
    if (!META) await meta();
    let pre = null;
    if (editId) {
      const r = await GET('/sinv/one?id=' + editId);
      if (r.invoice.status === 'canceled') throw new Error('الفاتورة ملغاة ولا يمكن تعديلها');
      if (r.invoice.type === 'quote' && r.invoice.status !== 'open') throw new Error('عرض السعر محوَّل ولا يمكن تعديله');
      pre = r;
    }
    let type = pre ? pre.invoice.type : 'cash', grid = null, party = null, dateIn = null, whSel = null, brSel = null, stSel = null, vatIn = null, notesIn = null, totalsBox = null, glBox = null;
    const isSale = () => type !== 'purchase';
    const r2c = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    function totals() {
      const rows = grid ? grid.rows() : [];
      const base = r2c(rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0) * (1 - (parseFloat(r.disc) || 0) / 100), 0));
      const rate = parseFloat(vatIn.value) || 0, vat = r2c(base * rate / 100);
      return { rows, base, rate, vat, total: r2c(base + vat) };
    }
    function glPreview() {
      const t = totals(); if (!(t.total > 0)) { glBox.innerHTML = '<small>أدخل سطورًا لعرض القيد</small>'; return; }
      const L = [];
      if (type === 'quote') { glBox.innerHTML = '<small>عرض السعر لا يُنشئ قيدًا محاسبيًا حتى يُحوَّل إلى فاتورة</small>'; return; }
      const money = (n) => fmt(n);
      if (type === 'cash') L.push(['1100 الصندوق', money(t.total), ''], ['4100 إيراد المبيعات', '', money(t.base)]);
      else if (type === 'credit') L.push(['1200 العملاء', money(t.total), ''], ['4100 إيراد المبيعات', '', money(t.base)]);
      else if (type === 'return') { L.push(['4200 مردودات المبيعات', money(t.base), '']); if (t.vat > 0) L.push(['2500 ض.ق.م مخرجات', money(t.vat), '']); L.push([stSel.value === 'credit' ? '1200 العملاء' : '1100 الصندوق', '', money(t.total)]); }
      else { L.push(['1300 المخزون / 5200 مصروف', money(t.base), '']); if (t.vat > 0) L.push(['1450 ض.ق.م مدخلات', money(t.vat), '']); L.push([stSel.value === 'credit' ? '2100 الموردون' : '1100 الصندوق', '', money(t.total)]); }
      if (isSale() && type !== 'return' && t.vat > 0) L.push(['2500 ض.ق.م مخرجات', '', money(t.vat)]);
      glBox.innerHTML = ''; glBox.append(table([{ t: 'الحساب', f: x => x[0] }, { t: 'مدين', cls: 'num', f: x => x[1] }, { t: 'دائن', cls: 'num', f: x => x[2] }], L, { empty: '' }));
    }
    function refreshTotals() { const t = totals(); totalsBox.innerHTML = ''; totalsBox.append(
      h('div', { class: 'trow' }, h('span', null, 'الإجمالي قبل الضريبة'), h('b', null, fmt(t.base))),
      h('div', { class: 'trow' }, h('span', null, 'ض.ق.م (' + t.rate + '%)'), h('b', null, fmt(t.vat))),
      h('div', { class: 'trow big' }, h('span', null, 'الإجمالي المستحق'), h('b', null, fmt(t.total)))); glPreview(); }
    function headFields() {
      const isP = !isSale();
      const parties = isP ? META.suppliers.map(x => [x.id, x.code + ' — ' + x.name]) : META.clients.map(x => [x.id, x.code + ' — ' + x.name]);
      party = sel(parties, party ? party.value : (pre ? String(isP ? pre.invoice.supplier_id : pre.invoice.client_id) : null), { class: 'in' });
      brSel = sel([['', '— بدون فرع —']].concat(META.branches.map(b => [b.id, b.code + ' — ' + b.name])), brSel ? brSel.value : (pre && pre.invoice.branch_id ? String(pre.invoice.branch_id) : ''), { class: 'in' });
      whSel = sel(META.warehouses.map(w => [w.id, w.name]), whSel ? whSel.value : (pre && pre.invoice.wh_id ? String(pre.invoice.wh_id) : null), { class: 'in' });
      const showSettle = type === 'return' || type === 'purchase';
      stSel = sel([['cash', 'نقدي'], ['credit', 'آجل']], stSel ? stSel.value : (pre ? pre.invoice.settle : null), { class: 'in', onchange: glPreview });
      return h('div', { class: 'sinv-head' },
        h('label', null, isP ? 'المورد' : 'العميل', party),
        h('label', null, 'التاريخ', dateIn),
        h('label', null, 'الفرع', brSel),
        h('label', null, 'المخزن', whSel),
        showSettle ? h('label', null, 'السداد', stSel) : null,
        h('label', null, 'ض.ق.م %', vatIn),
        h('label', { class: 'wide' }, 'ملاحظات', notesIn));
    }
    const headBox = h('div');
    function buildHead() { headBox.innerHTML = ''; headBox.append(headFields()); }
    dateIn = h('input', { class: 'in', type: 'date', value: pre ? String(pre.invoice.date).slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) });
    vatIn = h('input', { class: 'in', type: 'number', min: '0', max: '100', step: '0.01', value: pre ? String(pre.invoice.vat_rate) : '14', inputmode: 'decimal', oninput: refreshTotals });
    notesIn = h('input', { class: 'in', placeholder: 'اختياري', value: pre ? (pre.invoice.notes || '') : '' });
    totalsBox = h('div', { class: 'sinv-totals' });
    glBox = h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'القيد المحاسبي (معاينة حية)'));
    function buildGrid() {
      grid = XG.create({
        items: META.items,
        columns: [
          { key: 'item', title: 'الصنف (كود أو اسم)', type: 'item', width: '22%' },
          { key: 'description', title: 'البيان', type: 'text', width: '34%' },
          { key: 'qty', title: 'الكمية', type: 'num', width: '9%' },
          { key: '_unit', title: 'الوحدة', type: 'unit', width: '7%' },
          { key: 'price', title: 'سعر الوحدة', type: 'num', width: '12%' },
          { key: 'disc', title: 'خصم %', type: 'num', width: '9%' },
          { key: 'total', title: 'الإجمالي', type: 'calc', width: '13%' }],
        onChange: refreshTotals
      });
      gridBox.innerHTML = ''; gridBox.append(grid.el);
    }
    const gridBox = h('div');
    const seg = h('div', { class: 'seg sinv-seg' });
    function drawSeg() {
      seg.innerHTML = '';
      Object.keys(TNAMES).forEach(k => {
        if (editId && k !== type) return; // the type never changes on edit
        seg.append(h('button', { class: k === type ? 'on' : '', onclick: editId ? null : () => { type = k; drawSeg(); buildHead(); glPreview(); } }, TICONS[k] + ' ' + TNAMES[k]));
      });
    }
    drawSeg(); buildHead(); buildGrid();
    if (pre) grid.setRows(pre.lines.map(l => ({ item_id: l.item_id || null, description: l.description, qty: String(l.qty), price: String(l.price), disc: String(l.disc), _unit: l.unit || '' })));
    refreshTotals();
    function snapshot() {
      return JSON.stringify({ type, p: party && party.value, d: dateIn.value, b: brSel && brSel.value, w: whSel && whSel.value, s: stSel && stSel.value, v: vatIn.value, n: notesIn.value, rows: grid ? grid.rows() : [] });
    }
    let snap = snapshot();
    MZ.regDirty(winKey, { isDirty: () => snapshot() !== snap, save: async () => !!(await save(false)) });
    async function save(nav) {
      if (nav === undefined) nav = true;
      const t = totals();
      if (!t.rows.length) { toast('أضف سطرًا واحدًا على الأقل', 'err'); return false; }
      if (!party.value) { toast(isSale() ? 'اختر العميل' : 'اختر المورد', 'err'); return false; }
      if (t.rows.some(r => r.item_id) && !whSel.value) { toast('اختر المخزن', 'err'); return false; }
      const body = { type, date: dateIn.value, vat_rate: t.rate, notes: notesIn.value, branch_id: brSel.value || null, wh_id: whSel.value || null, settle: stSel ? stSel.value : 'cash', lines: t.rows.map(r => ({ item_id: r.item_id || null, description: r.description || '', qty: parseFloat(r.qty) || 0, price: parseFloat(r.price) || 0, disc: parseFloat(r.disc) || 0 })) };
      if (isSale()) body.client_id = +party.value; else body.supplier_id = +party.value;
      if (editId) body.id = editId;
      try {
        const r = await POST(editId ? '/sinv/update' : '/sinv/create', body); SND.play('save');
        toast((editId ? 'تم حفظ تعديل ' : type === 'quote' ? 'تم حفظ عرض السعر ' : 'تم حفظ الفاتورة ') + r.no, 'ok');
        MZ.clearDirty(winKey);
        if (nav) {
          if (!editId) { grid.clear(); notesIn.value = ''; }
          openPage('sinv_view_' + r.id);
        } else { snap = snapshot(); }
        return true;
      } catch (e) { toast(e.message || 'تعذر الحفظ', 'err'); return false; }
    }
    return h('div', null,
      pageHead(editId ? '✏️ تعديل ' + (type === 'quote' ? 'عرض السعر' : 'فاتورة') + ' ' + pre.invoice.no : '🧾 فاتورة جديدة', btn(editId ? '💾 حفظ التعديل' : '💾 حفظ', () => save()), btn('➕ سطر', () => grid.addRow())),
      editId ? h('div', { class: 'sinv-editnote' }, 'عند الحفظ يُعكس القيد وحركات المخزون القديمة ويُرحَّل القيد الجديد بنفس الرقم — كل الخطوات مسجلة في سجل المراجعة.') : null,
      seg,
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'بيانات الفاتورة'), headBox),
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'السطور — شبكة إكسل: الأسهم/Tab/Enter للتنقل · Ctrl+D تعبئة لأسفل · Ctrl+Insert سطر · Ctrl+Delete حذف · لصق جدول كامل مدعوم'), gridBox, totalsBox),
      glBox);
  }
  P2.sinv_new = () => editor(null, 'sinv_new');

  /* ---------- invoice list ---------- */
  P2.sinv_list = async () => {
    let type = '', q = '';
    const box = h('div');
    const seg = h('div', { class: 'seg sinv-seg' });
    const search = h('input', { class: 'in', placeholder: '🔍 بحث برقم الفاتورة أو الاسم', oninput: () => { q = search.value; load(); } });
    async function load() {
      const rows = await GET('/sinv/list' + (type ? '?type=' + type + (q ? '&q=' + encodeURIComponent(q) : '') : (q ? '?q=' + encodeURIComponent(q) : '')));
      box.innerHTML = '';
      box.append(table([
        { t: 'الرقم', f: x => x.no }, { t: 'النوع', f: x => TICONS[x.type] + ' ' + TNAMES[x.type] }, { t: 'التاريخ', f: x => String(x.date).slice(0, 10) },
        { t: 'الطرف', f: x => x.client || x.supplier || '—' }, { t: 'الفرع', f: x => x.branch || '—' },
        { t: 'الإجمالي', cls: 'num', f: x => fmt(x.total) }, { t: 'الحالة', f: x => x.status === 'canceled' ? '⛔ ملغاة' : x.type === 'quote' ? (x.status === 'open' ? 'مفتوح' : 'محوَّل') : 'مرحَّلة' }],
        rows, { empty: 'لا توجد فواتير بعد', onclick: x => openPage('sinv_view_' + x.id) }));
    }
    seg.append(h('button', { class: 'on', onclick: function () { seg.querySelectorAll('button').forEach(b => b.classList.remove('on')); this.classList.add('on'); type = ''; load(); } }, 'الكل'));
    Object.keys(TNAMES).forEach(k => seg.append(h('button', { onclick: function () { seg.querySelectorAll('button').forEach(b => b.classList.remove('on')); this.classList.add('on'); type = k; load(); } }, TICONS[k] + ' ' + TNAMES[k])));
    await load();
    return h('div', null, pageHead('🗂 سجل الفواتير', btn('➕ فاتورة جديدة', () => openPage('sinv_new'))), seg, search, box);
  };

  /* ---------- invoice view / print ---------- */
  async function viewPage(id) {
    const { invoice: v, lines, entry } = await GET('/sinv/one?id=' + id);
    const isP = v.type === 'purchase';
    const partyName = v.client || v.supplier || '—';
    const ln = lines.map((l, i) => h('tr', null, h('td', null, String(i + 1)), h('td', null, l.item_code ? l.item_code + ' — ' : '', l.description), h('td', { class: 'num' }, fmt(l.qty)), h('td', { class: 'num' }, fmt(l.price)), h('td', { class: 'num' }, l.disc ? fmt(l.disc) + '%' : '—'), h('td', { class: 'num' }, fmt(l.total))));
    const convBtns = v.type === 'quote' && v.status === 'open' ? [
      btn('➡ تحويل لفاتورة آجلة', async () => { const r = await POST('/sinv/convert', { id: v.id, type: 'credit' }); toast('أُنشئت الفاتورة ' + r.no, 'ok'); openPage('sinv_view_' + r.id); }),
      btn('➡ تحويل لفاتورة نقدية', async () => { const r = await POST('/sinv/convert', { id: v.id, type: 'cash' }); toast('أُنشئت الفاتورة ' + r.no, 'ok'); openPage('sinv_view_' + r.id); })] : [];
    const editable = (v.type === 'quote' && v.status === 'open') || (v.type !== 'quote' && v.status === 'posted');
    const editBtn = editable ? btn('✏️ تعديل', () => openPage('sinv_edit_' + v.id)) : null;
    const cancelBtn = editable ? btn('🗑 إلغاء', async () => {
      const k = await confirmDialog('إلغاء ' + (v.type === 'quote' ? 'عرض السعر' : 'الفاتورة') + ' ' + v.no,
        v.type === 'quote' ? 'سيُلغى عرض السعر ولن يمكن تحويله بعد ذلك.' : 'سيتم عكس القيد المحاسبي وحركات المخزون بالكامل بتاريخ اليوم، وتسجيل العملية في سجل المراجعة. لا يمكن التراجع عن الإلغاء.',
        [{ k: 'yes', t: '🗑 نعم، إلغاء نهائي', kind: 'dan' }, { k: 'no', t: 'تراجع', kind: 'pri' }]);
      if (k !== 'yes') return;
      try { await POST('/sinv/cancel', { id: v.id }); SND.play('save'); toast('أُلغيت ' + v.no + ' وعُكس قيدها ومخزونها', 'ok'); openPage('sinv_list'); }
      catch (e) { toast(e.message || 'تعذر الإلغاء', 'err'); }
    }, 'dan') : null;
    return h('div', null,
      pageHead(h('span', null, TICONS[v.type] + ' ' + (v.type === 'quote' ? 'عرض سعر' : 'فاتورة') + ' ' + v.no, v.status === 'canceled' ? h('span', { class: 'sinv-canceled' }, '⛔ ملغاة') : null), btn('🖨 طباعة', () => printPage()), btn('🗂 السجل', () => openPage('sinv_list')), editBtn, cancelBtn, ...convBtns),
      h('div', { class: 'sinv-doc' },
        h('div', { class: 'sd-band' }, h('div', null, h('h2', null, MZ.settings.company_name || 'إدارة مصنع الملابس'), h('small', null, 'نظام التصنيع للغير')),
          h('div', { class: 'sd-type' }, (isP ? 'فاتورة شراء' : v.type === 'quote' ? 'عرض سعر (بروفورما)' : v.type === 'return' ? 'إشعار مرتجع مبيعات' : 'فاتورة ضريبية'), h('b', null, v.no))),
        h('div', { class: 'sd-meta' },
          h('div', null, h('span', null, isP ? 'المورد' : 'العميل'), h('b', null, partyName)),
          h('div', null, h('span', null, 'التاريخ'), h('b', null, String(v.date).slice(0, 10))),
          v.branch ? h('div', null, h('span', null, 'الفرع'), h('b', null, v.branch)) : null,
          v.wh ? h('div', null, h('span', null, 'المخزن'), h('b', null, v.wh)) : null,
          h('div', null, h('span', null, 'السداد'), h('b', null, v.type === 'credit' ? 'آجل' : v.type === 'cash' ? 'نقدي' : v.settle === 'credit' ? 'آجل' : 'نقدي')),
          entry ? h('div', null, h('span', null, 'قيد اليومية'), h('b', null, '#' + entry.no)) : null),
        h('table', { class: 'sd-lines' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'البيان'), h('th', null, 'الكمية'), h('th', null, 'السعر'), h('th', null, 'الخصم'), h('th', null, 'الإجمالي'))), h('tbody', null, ln)),
        h('div', { class: 'sd-totals' },
          h('div', null, h('span', null, 'الإجمالي قبل الضريبة'), h('b', null, fmt(v.base))),
          h('div', null, h('span', null, 'ض.ق.م (' + fmt(v.vat_rate) + '%)'), h('b', null, fmt(v.vat))),
          h('div', { class: 'grand' }, h('span', null, 'الإجمالي المستحق'), h('b', null, fmt(v.total)))),
        v.notes ? h('div', { class: 'sd-notes' }, 'ملاحظات: ', v.notes) : null,
        h('div', { class: 'sd-foot' }, h('span', null, 'توقيع المستلم: ........................'), h('span', null, 'توقيع المحاسب: ........................'))));
  }
  // dynamic view pages: register a resolver
  const origOpen = window.openPage;
  window.openPage = function (key) {
    if (String(key).startsWith('sinv_view_')) { const id = +String(key).split('_').pop(); openWin(key, 'فاتورة', async () => viewPage(id), { refresh: true }); return; }
    if (String(key).startsWith('sinv_edit_')) { const id = +String(key).split('_').pop(); openWin(key, 'تعديل فاتورة', async () => editor(id, key), { refresh: true }); return; }
    return origOpen(key);
  };

  /* ---------- branches admin ---------- */
  P2.branches = async () => {
    const box = h('div');
    async function load() {
      const rows = await GET('/sinv/branches');
      box.innerHTML = '';
      box.append(table([
        { t: 'الكود', f: x => x.code }, { t: 'الاسم', f: x => x.name }, { t: 'العنوان', f: x => x.address || '—' }, { t: 'الهاتف', f: x => x.phone || '—' },
        { t: 'الفواتير', cls: 'num', f: x => fmt(x.invoices) }, { t: 'الحالة', f: x => x.active ? '✅ نشط' : '⛔ موقوف' },
        { t: '', f: x => btn(x.active ? 'إيقاف' : 'تفعيل', async () => { await POST('/sinv/branch-toggle', { id: x.id }); load(); }) }],
        rows, { empty: 'لا توجد فروع بعد — أضف أول فرع' }));
    }
    const code = h('input', { class: 'in', placeholder: 'كود (BR01)' });
    const name = h('input', { class: 'in', placeholder: 'اسم الفرع' });
    const addr = h('input', { class: 'in', placeholder: 'العنوان (اختياري)' });
    const phone = h('input', { class: 'in', placeholder: 'الهاتف (اختياري)' });
    async function add() {
      if (!code.value.trim() || !name.value.trim()) return toast('الكود والاسم مطلوبان', 'err');
      try { await POST('/sinv/branches', { code: code.value.trim(), name: name.value.trim(), address: addr.value.trim(), phone: phone.value.trim() }); SND.play('save'); toast('تمت إضافة الفرع', 'ok'); code.value = name.value = addr.value = phone.value = ''; META = null; load(); }
      catch (e) { toast(e.message || 'تعذر الإضافة', 'err'); }
    }
    await load();
    return h('div', null, pageHead('🏬 الفروع'),
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'إضافة فرع جديد'), h('div', { class: 'sinv-head' }, h('label', null, 'الكود', code), h('label', null, 'الاسم', name), h('label', null, 'العنوان', addr), h('label', null, 'الهاتف', phone), h('label', null, ' ', btn('➕ إضافة الفرع', add)))),
      box);
  };

  Object.assign(MZ.pages, P2);
})();
