'use strict';
/* Smart assistant, production stages, expenses & profit, debt aging, printing and Office exports */
const LV = { err: ['خطأ', 'bad'], warn: ['تنبيه', 'warn'], info: ['معلومة', '']};
const lvTag = (l) => h('span', { class: 'tag ' + LV[l][1] }, LV[l][0]);

/* ---------- print + export of the visible screen ---------- */
function activeWin() { return document.querySelector('.win-content.on'); }
function pageTitle() { const w = activeWin(); const t = w && w.querySelector('.page-head h2'); return t ? t.textContent.trim() : (TITLES[MZ.active] || 'تقرير'); }
function printPage() {
  const w = activeWin(); if (!w) return;
  const hd = h('div', { class: 'print-hd' }, h('div', null, h('b', null, MZ.settings.company_name || ''), h('div', null, pageTitle())), h('div', null, new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }), h('br'), MZ.user ? (MZ.user.name || MZ.user.username) : ''));
  w.prepend(hd); document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); hd.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 150); setTimeout(done, 60000);
}
function exportSecs(secs, title, fmt) {
  const co = MZ.settings.company_name || ''; const base = (title || 'تقرير').replace(/[\\/:*?"<>|]/g, '-') + ' ' + today();
  if (!secs.length || !secs.some(s => s.rows.length || s.head.length)) { toast('لا توجد بيانات للتصدير في هذه الشاشة', 'err'); return; }
  if (fmt === 'xlsx') EXP.save(base + '.xlsx', EXP.xlsx(secs, co), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  else if (fmt === 'docx') EXP.save(base + '.docx', EXP.docx(secs, title, co), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  else if (fmt === 'pptx') EXP.save(base + '.pptx', EXP.pptx(secs, title, co), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  else if (fmt === 'csv') EXP.save(base + '.csv', EXP.csv(secs), 'text/csv;charset=utf-8');
  else if (fmt === 'pdf') { toast('في نافذة الطباعة اختر "حفظ كـ PDF"'); printPage(); }
  toast('تم التصدير');
}
function exportChooser(secs, title) {
  const w = activeWin(); secs = secs || EXP.scrape(w || document); title = title || pageTitle();
  const b = (t, f, note) => h('button', { class: 'btn', style: { padding: '14px', textAlign: 'center' }, onclick: () => { exportSecs(secs, title, f); } }, h('div', { style: { fontSize: '16px', fontWeight: 800 } }, t), h('small', { style: { color: 'var(--mut)' } }, note));
  modal('تصدير: ' + title, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, b('Excel', 'xlsx', 'ملف .xlsx حقيقي'), b('Word', 'docx', 'ملف .docx'), b('PowerPoint', 'pptx', 'عرض .pptx'), b('PDF', 'pdf', 'حفظ كـ PDF من الطباعة'), b('CSV', 'csv', 'نص مفصول بفواصل'), b('🖨 طباعة A4', 'pdf', 'ورقة جاهزة للطباعة')), []);
}
// every CSV download in the app now offers all formats
const parseCsv = (t) => { const rows = []; let r = [], c = '', q = false; t = t.replace(/^\ufeff/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else c += ch; } if (c || r.length) { r.push(c); rows.push(r); } return rows; };
download = function (name, text) { const m = parseCsv(text); if (!m.length) return; exportChooser([{ title: name.replace(/\.csv$/i, ''), head: m[0], rows: m.slice(1) }], name.replace(/\.csv$/i, '')); };

/* ---------- المساعد الذكي ---------- */
async function assistCount() { try { const a = await GET('/assistant'); MZ.assist = a; const n = a.counts.err + a.counts.warn; document.querySelectorAll('.nv[data-k=assistant] .bdg').forEach(e => e.remove()); const nv = document.querySelector('.nv[data-k=assistant]'); if (nv && n) nv.append(h('span', { class: 'bdg' }, n)); return a; } catch (e) { return null; } }
P.assistant = async () => {
  const a = await assistCount(); if (!a) throw new Error('تعذر تحميل المساعد');
  const goto = { 'القص': 'orders', 'التسليم': 'orders', 'التكلفة': 'orders', 'المخزن': 'store', 'الخارج': 'outs', 'الحسابات': 'aging', 'الإنتاج': 'stages', 'الرواتب': 'payroll', 'الحضور': 'attendance', 'تكرار': null };
  const cols = [{ t: 'النوع', f: r => lvTag(r.level) }, { t: 'القسم', k: 'area' }, { t: 'التنبيه', k: 'msg' }, { t: '', f: r => goto[r.area] ? btn('فتح الشاشة', () => openPage(goto[r.area]), 'sm') : '' }];
  return h('div', null, pageHead('🤖 المساعد الذكي', btn('🔄 فحص الآن', async () => { await openPage('assistant'); }), btn('⬇ تصدير', () => exportChooser())),
    h('div', { class: 'kpis' }, kpi('أخطاء تحتاج تصحيح', a.counts.err), kpi('تنبيهات للمراجعة', a.counts.warn), kpi('معلومات', a.counts.info)),
    h('div', { class: 'panel' }, h('div', { class: 'pb' }, a.items.length ? 'المساعد يفحص بياناتك تلقائياً: الأوزان والهالك، التسليم، التكلفة، التكرار، الخارج المتأخر، أعمار الديون، المخزن الراكد، الحضور والمرتبات.' : '✅ لا توجد ملاحظات الآن. كل شيء يبدو سليماً.')),
    a.items.length ? table(cols, a.items) : '',
    h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'حدود التنبيه الحالية'), h('div', { class: 'pb' }, 'الهالك فوق ' + a.limits.waste + '% | قماش راكد فوق ' + a.limits.idle + ' يوم | خارج متأخر فوق ' + a.limits.out + ' يوم | دين متأخر فوق ' + a.limits.aging + ' يوم | تغيير تكلفة فوق ' + a.limits.dev + '% | غياب فوق ' + a.limits.abs + ' أيام. تُعدّل من الإعدادات.')));
};

/* ---------- لوحة مراحل الإنتاج ---------- */
P.stages_board = async () => {
  const d = await GET('/stages'); const root = h('div');
  const col = (st) => { const items = d.rows.filter(r => r.stage === st); return h('div', { class: 'kcol' }, h('div', { class: 'kh' }, st, h('span', null, items.length)), items.map(r => {
    const i = d.stages.indexOf(st); return h('div', { class: 'kcard' + (r.days_in_stage > 10 && st !== 'تم التسليم' ? ' late' : '') }, h('b', null, r.code), h('div', null, r.client_name + ' | ' + (r.model_name || '')), h('small', null, r.pieces + ' قطعة | مسلّم ' + r.delivered + ' | ' + r.days_in_stage + ' يوم'),
      canW() ? h('div', { class: 'kmv' }, i > 0 ? btn('→ ' + d.stages[i - 1], async () => { await PUT('/stages/' + r.id, { stage: d.stages[i - 1] }); openPage('stages_board'); }, 'sm') : '', i < d.stages.length - 1 ? btn(d.stages[i + 1] + ' ←', async () => { await PUT('/stages/' + r.id, { stage: d.stages[i + 1] }); openPage('stages_board'); }, 'sm pri') : '') : ''); })); };
  root.append(pageHead('🏭 لوحة مراحل الإنتاج', btn('⬇ تصدير', () => exportChooser([{ title: 'المراحل', head: ['كود القصة', 'العميل', 'الموديل', 'القطع', 'المسلّم', 'المرحلة', 'أيام في المرحلة'], rows: d.rows.map(r => [r.code, r.client_name, r.model_name || '', r.pieces, r.delivered, r.stage, r.days_in_stage]) }], 'مراحل الإنتاج'))),
    h('div', { class: 'panel' }, h('div', { class: 'pb' }, 'كل قصة تظهر مرة واحدة. حرّكها بين المراحل بالأزرار. القصة التي يكتمل تسليمها تنتقل تلقائياً إلى "تم التسليم"، وتُلوَّن بالأحمر لو تأخرت أكثر من 10 أيام في مرحلة.')),
    h('div', { class: 'kanban' }, d.stages.map(col))); return root;
};
MZ.pages.stages_board = P.stages_board;

/* ---------- المصروفات والربحية ---------- */
const EXP_CATS = ['خيوط', 'أزرار وإكسسوار', 'طباعة / تطريز', 'نقل وشحن', 'صيانة', 'كهرباء ومياه', 'إيجار', 'أخرى'];
P.expenses = async () => {
  const root = h('div'); const orders = await GET('/orders'); const codes = [...new Set(orders.map(o => o.code))];
  const render = async () => {
    const rows = await GET('/expenses'); root.innerHTML = '';
    const tot = rows.reduce((a, r) => a + Number(r.amount), 0);
    root.append(pageHead('💸 المصروفات', canW() ? btn('➕ مصروف جديد', () => edit(null), 'pri') : null, btn('⬇ تصدير', () => exportChooser())), h('div', { class: 'kpis' }, kpi('إجمالي المصروفات', fmt(tot))),
      table([{ t: 'التاريخ', f: r => dt(r.date) }, { t: 'أمر القص', f: r => r.cut_code || 'مصروف عام' }, { t: 'البند', k: 'category' }, { t: 'المبلغ', f: r => fmt(r.amount), cls: 'num' }, { t: 'ملاحظات', k: 'notes' }, canW() ? { t: '', f: r => h('span', null, btn('تعديل', () => edit(r), 'sm'), ' ', delBtn('/expenses', render)(r)) } : null].filter(Boolean), rows, { empty: 'لا توجد مصروفات' }));
  };
  const edit = (r) => {
    const f = formGrid([{ k: 'date', t: 'التاريخ', type: 'date', def: today() }, { k: 'cut_code', t: 'أمر القص (اتركه فارغاً لمصروف عام)', type: 'select', options: [{ v: '', t: '— مصروف عام —' }, ...codes.map(c => ({ v: c, t: c }))] }, { k: 'category', t: 'البند', type: 'select', options: EXP_CATS.map(c => ({ v: c, t: c })), def: 'خيوط' }, { k: 'amount', t: 'المبلغ', type: 'number', req: 1 }, { k: 'notes', t: 'ملاحظات', full: 1 }], r || { date: today() });
    modal(r ? 'تعديل مصروف' : 'مصروف جديد', f.el, [{ t: 'حفظ', kind: 'pri', fn: async (c) => { const b = f.get(); if (r) await PUT('/expenses/' + r.id, b); else await POST('/expenses', b); c(); toast('تم الحفظ'); render(); } }]);
  };
  await render(); return root;
};
P.profit = async () => {
  const d = await GET('/profit'); const net = d.totals.revenue - d.totals.expenses;
  return h('div', null, pageHead('📈 ربحية أوامر القص', btn('⬇ تصدير', () => exportChooser()), btn('🖨 طباعة', printPage)),
    h('div', { class: 'kpis' }, kpi('الإيراد (تكلفة التصنيع على العملاء)', fmt(d.totals.revenue)), kpi('إجمالي المصروفات', fmt(d.totals.expenses)), kpi('الربح الصافي', fmt(net)), kpi('مصروفات عامة غير موزعة', fmt(d.general_expenses))),
    table([{ t: 'كود القصة', k: 'code' }, { t: 'العميل', k: 'client_name' }, { t: 'الموديل', k: 'model_name' }, { t: 'القطع', f: r => r.pieces, cls: 'num' }, { t: 'الإيراد', f: r => fmt(r.revenue), cls: 'num' }, { t: 'المصروفات', f: r => fmt(r.expenses), cls: 'num' }, { t: 'الربح', f: r => h('b', { class: r.profit < 0 ? 'neg' : 'pos' }, fmt(r.profit)), cls: 'num' }, { t: 'الهامش %', f: r => r.margin === null ? '' : fmt(r.margin, 1), cls: 'num' }, { t: 'ربح القطعة', f: r => r.per_piece === null ? '' : fmt(r.per_piece), cls: 'num' }], d.rows, { empty: 'لا توجد أوامر قص' }));
};
P.aging = async () => {
  const rows = await GET('/aging'); const s = (k) => rows.reduce((a, r) => a + r[k], 0);
  return h('div', null, pageHead('⏳ أعمار الديون', btn('⬇ تصدير', () => exportChooser()), btn('🖨 طباعة', printPage)),
    h('div', { class: 'kpis' }, kpi('إجمالي المتبقي على العملاء', fmt(s('total'))), kpi('أكثر من 60 يوماً', fmt(s('b60') + s('b90')))),
    h('div', { class: 'panel' }, h('div', { class: 'pb' }, 'تُحسب بتوزيع المقبوضات على أقدم أوامر القص أولاً، ثم يُوزَّع المتبقي حسب عمر كل أمر من تاريخه.')),
    table([{ t: 'العميل', k: 'name' }, { t: '0-30 يوم', f: r => fmt(r.b0), cls: 'num' }, { t: '31-60 يوم', f: r => fmt(r.b30), cls: 'num' }, { t: '61-90 يوم', f: r => fmt(r.b60), cls: 'num' }, { t: 'أكثر من 90', f: r => fmt(r.b90), cls: 'num' }, { t: 'الإجمالي', f: r => h('b', null, fmt(r.total)), cls: 'num' }, { t: 'أقدم دين (يوم)', f: r => r.oldest_days === null ? '' : r.oldest_days, cls: 'num' }, { t: 'رصيد دائن', f: r => r.credit ? fmt(r.credit) : '', cls: 'num' }], rows, { empty: 'لا توجد مديونيات' }));
};
MZ.pages.assistant = P.assistant; MZ.pages.expenses = P.expenses; MZ.pages.profit = P.profit; MZ.pages.aging = P.aging;
