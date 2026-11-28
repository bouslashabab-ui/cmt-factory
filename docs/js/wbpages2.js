'use strict';
/* Smart assistant, production stages, expenses & profit, debt aging, printing and Office exports */
const LV = { err: ['خطأ', 'bad'], warn: ['تنبيه', 'warn'], info: ['معلومة', '']};
const lvTag = (l) => h('span', { class: 'tag ' + LV[l][1] }, LV[l][0]);

/* ---------- print + export of the visible screen ---------- */
function activeWin() { return document.querySelector('.win-content.on'); }
function pageTitle() { const w = activeWin(); const t = w && w.querySelector('.page-head h2'); return t ? t.textContent.trim() : (TITLES[MZ.active] || 'تقرير'); }
function printPage() {
  const w = activeWin(); if (!w) return;
  const hd = h('div', { class: 'print-hd' }, h('div', null, h('b', null, MZ.settings.company_name || ''), h('div', null, pageTitle())), h('div', null, new Date().toLocaleDateString(window.MZ_LOC ? MZ_LOC() : 'ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }), h('br'), MZ.user ? (MZ.user.name || MZ.user.username) : ''));
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
  const a = await assistCount(); if (!a) return h('div', null, pageHead('🤖 المساعد الذكي'), h('div', { class: 'panel' }, h('div', { class: 'pb' }, 'تعذر تحميل المساعد')));
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
  let d = null, sbBase = '/stages-board'; try { d = await GET('/stages-board'); } catch (e) { sbBase = '/stages'; d = await GET('/stages'); }
  d = d || {}; if (!Array.isArray(d.rows)) d.rows = []; if (!Array.isArray(d.stages)) d.stages = []; const root = h('div');
  const col = (st) => { const items = d.rows.filter(r => r.stage === st); return h('div', { class: 'kcol' }, h('div', { class: 'kh' }, st, h('span', null, items.length)), items.map(r => {
    const i = d.stages.indexOf(st); return h('div', { class: 'kcard' + (r.days_in_stage > 10 && st !== 'تم التسليم' ? ' late' : '') }, h('b', null, r.code), h('div', null, r.client_name + ' | ' + (r.model_name || '')), h('small', null, r.pieces + ' قطعة | مسلّم ' + r.delivered + ' | ' + r.days_in_stage + ' يوم'),
      canW() ? h('div', { class: 'kmv' }, i > 0 ? btn('→ ' + d.stages[i - 1], async () => { await PUT(sbBase + '/' + r.id, { stage: d.stages[i - 1] }); openPage('stages_board'); }, 'sm') : '', i < d.stages.length - 1 ? btn(d.stages[i + 1] + ' ←', async () => { await PUT(sbBase + '/' + r.id, { stage: d.stages[i + 1] }); openPage('stages_board'); }, 'sm pri') : '') : ''); })); };
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
  const d = await GET('/profit') || {}; if (!d.totals) d.totals = {}; const net = (+d.totals.revenue || 0) - (+d.totals.expenses || 0);
  return h('div', null, pageHead('📈 ربحية أوامر القص', btn('⬇ تصدير', () => exportChooser()), btn('🖨 طباعة', printPage)),
    h('div', { class: 'kpis' }, kpi('الإيراد (تكلفة التصنيع على العملاء)', fmt(d.totals.revenue)), kpi('إجمالي المصروفات', fmt(d.totals.expenses)), kpi('الربح الصافي', fmt(net)), kpi('مصروفات عامة غير موزعة', fmt(d.general_expenses))),
    table([{ t: 'كود القصة', k: 'code' }, { t: 'العميل', k: 'client_name' }, { t: 'الموديل', k: 'model_name' }, { t: 'القطع', f: r => r.pieces, cls: 'num' }, { t: 'الإيراد', f: r => fmt(r.revenue), cls: 'num' }, { t: 'المصروفات', f: r => fmt(r.expenses), cls: 'num' }, { t: 'الربح', f: r => h('b', { class: r.profit < 0 ? 'neg' : 'pos' }, fmt(r.profit)), cls: 'num' }, { t: 'الهامش %', f: r => r.margin === null ? '' : fmt(r.margin, 1), cls: 'num' }, { t: 'ربح القطعة', f: r => r.per_piece === null ? '' : fmt(r.per_piece), cls: 'num' }], d.rows, { empty: 'لا توجد أوامر قص' }));
};
P.aging = async () => {
  let rows = await GET('/aging'); if (!Array.isArray(rows)) rows = []; const s = (k) => rows.reduce((a, r) => a + r[k], 0);
  return h('div', null, pageHead('⏳ أعمار الديون', btn('⬇ تصدير', () => exportChooser()), btn('🖨 طباعة', printPage)),
    h('div', { class: 'kpis' }, kpi('إجمالي المتبقي على العملاء', fmt(s('total'))), kpi('أكثر من 60 يوماً', fmt(s('b60') + s('b90')))),
    h('div', { class: 'panel' }, h('div', { class: 'pb' }, 'تُحسب بتوزيع المقبوضات على أقدم الفواتير أولاً، ثم يُوزَّع المتبقي حسب عمر كل فاتورة من تاريخها.')),
    table([{ t: 'العميل', k: 'name' }, { t: '0-30 يوم', f: r => fmt(r.b0), cls: 'num' }, { t: '31-60 يوم', f: r => fmt(r.b30), cls: 'num' }, { t: '61-90 يوم', f: r => fmt(r.b60), cls: 'num' }, { t: 'أكثر من 90', f: r => fmt(r.b90), cls: 'num' }, { t: 'الإجمالي', f: r => h('b', null, fmt(r.total)), cls: 'num' }, { t: 'أقدم دين (يوم)', f: r => r.oldest_days === null ? '' : r.oldest_days, cls: 'num' }, { t: 'رصيد دائن', f: r => r.credit ? fmt(r.credit) : '', cls: 'num' }], rows, { empty: 'لا توجد مديونيات' }));
};
MZ.pages.assistant = P.assistant; MZ.pages.expenses = P.expenses; MZ.pages.profit = P.profit; MZ.pages.aging = P.aging;

/* ---------- Code 128 barcode (SVG, no libraries) + print templates ---------- */
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
function barcodeSvg(text, h2) {
  text = String(text || '').replace(/[^\x20-\x7e]/g, ''); if (!text) text = '0';
  const codes = [104]; for (const ch of text) codes.push(ch.charCodeAt(0) - 32);
  let sum = codes[0]; for (let i = 1; i < codes.length; i++) sum += codes[i] * i; codes.push(sum % 103, 106);
  let x = 10, bars = '';
  for (const c of codes) { const p = C128[c]; for (let i = 0; i < p.length; i++) { const w = +p[i]; if (i % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + w + '" height="' + (h2 || 50) + '"/>'; x += w; } }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (x + 10) + ' ' + (h2 || 50) + '" width="' + Math.min(260, (x + 10) * 1.6) + '" height="' + (h2 || 50) + '" preserveAspectRatio="none" style="direction:ltr;background:#fff"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">' + bars + '</g></svg>';
}
function sheetHd(title, sub) {
  return h('div', { class: 'print-doc' }, h('div', { class: 'print-hd', style: 'display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px' }, h('div', null, h('b', null, MZ.settings.company_name || ''), h('div', null, title)), h('div', null, sub || new Date().toLocaleDateString(window.MZ_LOC ? MZ_LOC() : 'ar-EG'))));
}
function kv(pairs) { return h('table', { class: 'grid' }, h('tbody', null, ...pairs.map(([a, b]) => h('tr', null, h('th', { style: 'width:30%;text-align:right' }, a), h('td', null, b == null ? '' : String(b)))))); }
window.printCutSheet = function (r) {
  const doc = sheetHd('ورقة أمر القص ' + r.code);
  doc.append(h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin:6px 0' }, h('div', { html: barcodeSvg(r.code, 50) }), h('div', { html: (window.QRS ? QRS.svg(String(r.code), 96) : ''), title: r.code })));
  doc.append(kv([['كود القصة', r.code], ['العميل', r.client_name], ['الموديل', r.model_name], ['الخامة', r.fabric], ['اللون', r.color], ['وزن القماش المحول (كجم)', n3(r.weight_in)], ['الوزن المستخدم (كجم)', n3(r.weight_used)], ['الهالك (كجم)', n3(r.waste)], ['طول الراق (م) / عرض (سم)', (r.marker_len || 0) + ' / ' + (r.marker_width || 0)], ['عدد الراقات', r.layers], ['إجمالي القطع', fmt(r.total, 0)], ['تكلفة القطعة', fmt(r.unit_cost)], ['إجمالي التكلفة', fmt(r.cost_total)], ['المسلم / المتبقي', fmt(r.delivered, 0) + ' / ' + fmt(r.left, 0)]]));
  doc.append(h('h3', null, 'المقاسات'), table(sizeKeys.map(([k, t]) => ({ t, k })), [r]));
  doc.append(h('div', { style: 'display:flex;justify-content:space-between;margin-top:40px' }, h('div', null, 'توقيع القصّاص: ..............'), h('div', null, 'توقيع المراجع: ..............')));
  printEl('أمر القص ' + r.code, doc);
};
window.printPayslips = function (rows, ym) {
  const wrap = h('div');
  rows.forEach((r) => {
    const d = sheetHd('قسيمة مرتب شهر ' + ym, r.name);
    d.style.cssText = 'page-break-inside:avoid;margin-bottom:24px;border:1px solid #888;padding:10px';
    d.append(kv([['الموظف', r.name + (r.code ? ' (' + r.code + ')' : '')], ['الوظيفة', r.job], ['الراتب الأساسي', fmt(r.salary)], ['أيام الحضور', r.present], ['الأجر اليومي', fmt(r.daily)], ['قيمة الجمع', fmt(r.friday_value)], ['قيمة الإضافي', fmt(r.ot_value)], ['إجمالي المستحق', fmt(r.gross)], ['السلف', fmt(r.advances)], ['الخصم', fmt(r.deduction)], ['أيام الغياب', r.absent], ['إجمالي الاستقطاعات', fmt(r.total_deductions)], ['صافي المرتب', fmt(r.net)]]));
    d.append(h('div', { style: 'margin-top:14px' }, 'توقيع المستلم: ..............'));
    wrap.append(d);
  });
  printEl('قسائم المرتبات ' + ym, wrap);
};

/* Enter moves to the next field inside forms (fast numeric entry); select text on focus */
document.addEventListener('focusin', (e) => { const t = e.target; if (t.tagName === 'INPUT' && (t.type === 'number' || t.type === 'text')) setTimeout(() => { try { t.select(); } catch (x) {} }, 0); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey) return; const t = e.target; if (t.tagName !== 'INPUT' || t.type === 'submit' || t.type === 'button') return;
  const scope = t.closest('.modal, form, .grid-form') || document; const els = [...scope.querySelectorAll('input:not([type=hidden]):not([disabled]), select, textarea')].filter(x => x.offsetParent !== null);
  const i = els.indexOf(t); if (i >= 0 && i < els.length - 1) { e.preventDefault(); els[i + 1].focus(); }
});

/* ---------- one-click backup (JSON + Excel of all data) and global search ---------- */
window.backupAll = async function () {
  const ym = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 7);
  const eps = [['clients', '/clients'], ['store', '/store'], ['orders', '/orders'], ['outs', '/outs'], ['payments', '/payments'], ['employees', '/employees'], ['expenses', '/expenses'], ['accounts', '/accounts'], ['aging', '/aging'], ['profit', '/profit'], ['receipts', '/receipts'], ['cuts', '/cuts'], ['prod_logs', '/prod'], ['deliveries', '/deliveries'], ['invoices', '/invoices'], ['attendance', '/attendance?ym=' + ym], ['payroll', '/payroll?ym=' + ym]];
  const data = {}; for (const [k, p] of eps) { try { data[k] = await GET(p); } catch (e) { data[k] = { error: String(e.message || e) }; } }
  const day = new Date().toISOString().slice(0, 10);
  const secs = []; const flat = (v) => (v && typeof v === 'object') ? JSON.stringify(v) : (v == null ? '' : v);
  for (const [k, v] of Object.entries(data)) { const rows = Array.isArray(v) ? v : (v && Array.isArray(v.rows) ? v.rows : null); if (!rows || !rows.length || typeof rows[0] !== 'object') continue; const head = [...new Set(rows.flatMap(r => Object.keys(r)))]; secs.push({ title: k, head, rows: rows.map(r => head.map(c => flat(r[c]))) }); }
  EXP.save('backup-' + day + '.json', JSON.stringify({ exported: new Date().toISOString(), data }, null, 1), 'application/json');
  if (secs.length) EXP.save('backup-' + day + '.xlsx', EXP.xlsx(secs, 'نسخة احتياطية'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  toast('تم تنزيل النسخة الاحتياطية (JSON + Excel)');
};
window.globalSearch = async function (q) {
  q = String(q || '').trim().toLowerCase(); if (!q) return;
  const [ord, st, cl, pay] = await Promise.all(['/orders', '/store', '/clients', '/payments'].map(p => GET(p).catch(() => [])));
  const has = (o) => JSON.stringify(Object.values(o || {})).toLowerCase().includes(q);
  const res = [];
  (ord || []).filter(has).slice(0, 15).forEach(r => res.push(['أمر قص', r.code + ' - ' + (r.client_name || '') + ' - ' + (r.model_name || ''), 'orders']));
  (st || []).filter(has).slice(0, 15).forEach(r => res.push(['مخزن', (r.item_code || r.code || '') + ' - ' + (r.client_name || '') + ' - ' + (r.fabric || ''), 'store']));
  (cl || []).filter(has).slice(0, 10).forEach(r => res.push(['عميل', (r.code || '') + ' - ' + (r.name || ''), 'clients']));
  (pay || []).filter(has).slice(0, 10).forEach(r => res.push(['مقبوضات', (r.receipt_no || r.number || '') + ' - ' + (r.client_name || '') + ' - ' + (r.amount || ''), 'payments']));
  const body = res.length ? h('div', null, ...res.map(([t, s, k]) => h('div', { class: 'srow', style: 'padding:8px;border-bottom:1px solid #ddd;cursor:pointer', onclick: () => { document.querySelectorAll('.modal-back').forEach(m => m.remove()); openPage(k); } }, h('b', null, t + ': '), s))) : h('div', null, 'لا توجد نتائج');
  modal('نتائج البحث عن: ' + q, body, [{ t: 'إغلاق', fn: (c) => c() }]);
};
(function () { const add = () => { const tb = document.querySelector('.topbar'); if (!tb || tb.querySelector('.gsearch')) return; const inp = h('input', { class: 'gsearch', placeholder: '🔎 بحث شامل (كود/عميل/باركود)', style: 'padding:6px 10px;border-radius:8px;border:1px solid #ccc;min-width:180px', onkeydown: (e) => { if (e.key === 'Enter') { e.stopPropagation(); globalSearch(inp.value); } } }); const b = h('button', { class: 'tbn', onclick: () => backupAll() }, '💾 نسخة احتياطية'); const t = tb.querySelector(':scope > .tbn'); tb.insertBefore(b, t); tb.insertBefore(inp, b); }; new MutationObserver(add).observe(document.body, { childList: true, subtree: true }); })();

/* ---------- AI helper panel (Gemini free tier; only aggregated numbers leave the server) ---------- */
(function () {
  const base = P.assistant;
  P.assistant = async () => {
    const root = await base();
    const inp = h('input', { placeholder: 'اسأل المساعد: مثلاً "كم نسبة الهالك؟" أو "ما أهم مشكلة الآن؟"', style: 'width:70%;padding:8px;border:1px solid #ccc;border-radius:8px' });
    const out = h('div', { style: 'margin-top:10px;white-space:pre-wrap;line-height:1.8' });
    const go = async () => { const q = inp.value.trim(); if (!q) return; out.textContent = '... جاري التفكير'; try { const r = await POST('/ai-ask', { question: q }); out.textContent = r.answer || r.error || ''; } catch (e) { out.textContent = String(e.message || e); } };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); go(); } });
    root.prepend(h('div', { class: 'panel' }, h('div', { class: 'ph' }, '💬 اسأل المساعد (Gemini)'), h('div', { class: 'pb' }, inp, ' ', btn('إرسال', go, 'pri'), out, h('small', { style: 'display:block;margin-top:8px;color:#666' }, 'يُرسل إلى الذكاء الاصطناعي أرقام مجمّعة فقط (بدون أسماء عملاء أو أكواد). النسخة المجانية قد تستخدم المحتوى لتحسين خدمات جوجل.'))));
    return root;
  };
  MZ.pages.assistant = P.assistant;
})();

/* ---------- الإقفال اليومي ---------- */
P.daily_close = async () => {
  const dt = (MZ.dcDate || today()); const d = await GET('/daily-close?date=' + dt) || {}; ['attendance', 'production'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; }); ['deliveries', 'payments', 'expenses'].forEach(k => { if (!d[k]) d[k] = {}; ['n', 'qty', 'total'].forEach(f2 => { if (d[k][f2] === undefined) d[k][f2] = 0; }); }); if (!d.date) d.date = dt; const f = (n) => Number(n || 0).toLocaleString(window.MZ_LOC ? MZ_LOC() : 'ar-EG');
  const inp = h('input', { type: 'date', value: d.date, onchange: () => { MZ.dcDate = inp.value; openPage('daily_close'); } });
  const att = {}; d.attendance.forEach(a => { att[a.status] = a.n; });
  return h('div', null, pageHead('🧾 الإقفال اليومي', inp, btn('🖨 طباعة', () => printPage()), btn('⬇ تصدير', () => exportChooser())),
    h('div', { class: 'kpis' }, kpi('قصات جديدة', d.orders), kpi('إيصالات استلام', d.receipts), kpi('تسليمات (قطع)', d.deliveries.n + ' (' + f(d.deliveries.qty) + ')'), kpi('تحصيلات', f(d.payments.total)), kpi('مصروفات', f(d.expenses.total))),
    h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'إنتاج اليوم حسب المرحلة'), d.production.length ? table([{ t: 'المرحلة', k: 'stage' }, { t: 'سليم', f: r => f(r.ok) }, { t: 'تالف', f: r => f(r.defect) }], d.production) : h('div', { class: 'pb' }, 'لا إنتاج مسجل في هذا اليوم')),
    h('div', { class: 'panel' }, h('div', { class: 'ph' }, 'الحضور'), h('div', { class: 'pb' }, d.attendance.length ? d.attendance.map(a => a.status + ': ' + a.n).join(' | ') : 'لم يُسجَّل حضور في هذا اليوم')),
    h('div', { class: 'panel' }, h('div', { class: 'pb' }, 'لإقفال الفترة ومنع التعديل على ما قبل تاريخ معيّن: الإعدادات، ثم "قفل ما قبل تاريخ".')));
};
MZ.pages.daily_close = P.daily_close;
