'use strict';
/* Extra modules: expenses & profit per cut order, production stage board, debt aging, smart assistant (rule-based checks). */
const C = require('./core');
const { bad, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const nn = (x) => { const n = Number(x); return isFinite(n) ? n : 0; };
const needWrite = (u) => { if (u.role === 'viewer') throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
const STAGES = ['تم القص', 'طباعة / تطريز', 'خياطة', 'كي وتغليف', 'جاهز للتسليم', 'تم التسليم'];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const dstr = (d) => d ? (d instanceof Date ? d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) : String(d).slice(0, 10)) : null;
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const W = () => require('./wb');
const lim = async () => { const s = await C.getSettings(); const g = (k, d) => nn(s[k]) || d; return { waste: g('warn_waste_pct', 5), idle: g('warn_idle_days', 30), out: g('warn_out_days', 14), stage: g('warn_stage_days', 10), dev: g('warn_cost_dev', 40), ot: g('warn_ot_hours', 60), abs: g('warn_absent_days', 5), aging: g('warn_aging_days', 60) }; };

async function expensesApi(req, u, id, body) {
  const m = req.method;
  if (m === 'GET') return Q('SELECT * FROM expenses ORDER BY date DESC, id DESC');
  needWrite(u);
  if (m === 'DELETE' && id) { await C.db().query('DELETE FROM expenses WHERE id=?', [id]); await C.audit(u, 'delete', 'expense', id); return { ok: true }; }
  if (!isDate(body.date)) throw bad('تاريخ المصروف غير صحيح');
  const amount = r2(nn(body.amount)); if (!(amount > 0)) throw bad('أدخل مبلغ المصروف');
  const o = { date: body.date, cut_code: body.cut_code ? String(body.cut_code).trim().slice(0, 60) : null, category: String(body.category || 'عام').slice(0, 60), amount, notes: body.notes ? String(body.notes).slice(0, 255) : null };
  const k = Object.keys(o);
  if (m === 'POST') { const [r] = await C.db().query('INSERT INTO expenses(' + k.join(',') + ',created_by) VALUES(' + k.map(() => '?').join(',') + ',?)', [...k.map(x => o[x]), u.id]); await C.audit(u, 'create', 'expense', r.insertId, o.category); return { id: r.insertId }; }
  if (m === 'PUT' && id) { await C.db().query('UPDATE expenses SET ' + k.map(x => x + '=?').join(',') + ' WHERE id=?', [...k.map(x => o[x]), id]); return { ok: true }; }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

async function profit() {
  // canonical: revenue comes from detailed-track invoices (per cut via billed delivery lines; direct invoices listed separately)
  const cuts = await Q('SELECT t.id, t.number, t.date, t.pieces_cut pieces, c.name client_name, m.name model_name FROM cuts t JOIN clients c ON c.id=t.client_id JOIN models m ON m.id=t.model_id ORDER BY t.date DESC, t.id DESC');
  const revRows = await Q('SELECT dl.cut_id, SUM(il.amount) rev FROM invoice_lines il JOIN delivery_lines dl ON dl.id=il.delivery_line_id GROUP BY dl.cut_id');
  const rmap = {}; revRows.forEach(r => rmap[r.cut_id] = nn(r.rev));
  const ex = await Q('SELECT cut_code, SUM(amount) a FROM expenses GROUP BY cut_code');
  const em = {}; ex.forEach(x => em[x.cut_code || ''] = nn(x.a));
  const usedExp = new Set();
  const rows = cuts.map(t => {
    const rev = r2(rmap[t.id] || 0); const e = r2(em[t.number] || 0); if (e) usedExp.add(t.number);
    return { code: t.number, client_name: t.client_name, model_name: t.model_name, pieces: t.pieces, revenue: rev, expenses: e, profit: r2(rev - e), margin: rev ? r2((rev - e) / rev * 100) : null, per_piece: t.pieces ? r2((rev - e) / t.pieces) : null };
  });
  const direct = await Q('SELECT i.number, i.date, i.total, c.name client_name FROM invoices i JOIN clients c ON c.id=i.client_id WHERE NOT EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoice_id=i.id AND il.delivery_line_id IS NOT NULL) ORDER BY i.date DESC, i.id DESC');
  direct.forEach(d => { const rev = r2(d.total); rows.push({ code: d.number, client_name: d.client_name, model_name: 'فاتورة مباشرة', pieces: null, revenue: rev, expenses: 0, profit: rev, margin: rev ? 100 : null, per_piece: null }); });
  const general = r2(Object.keys(em).filter(k => k && !usedExp.has(k)).reduce((a, k) => a + em[k], 0) + (em[''] || 0));
  return { rows, general_expenses: general, totals: { revenue: r2(rows.reduce((a, r) => a + r.revenue, 0)), expenses: r2(rows.reduce((a, r) => a + r.expenses, 0) + general) } };
}

async function aging() {
  // canonical: debts come from detailed-track invoices, settled FIFO by payments
  const inv = await Q('SELECT id, client_id, date, total FROM invoices');
  const pays = await Q('SELECT client_id, SUM(amount) p FROM payments GROUP BY client_id');
  const cl = await Q('SELECT id,name FROM clients'); const nm = {}; cl.forEach(c => nm[c.id] = c.name);
  const pm = {}; pays.forEach(p => pm[p.client_id] = nn(p.p)); const t = today();
  const by = {}; inv.forEach(o => (by[o.client_id] = by[o.client_id] || []).push(o));
  pays.forEach(p => { if (!by[p.client_id]) by[p.client_id] = []; });
  const out = [];
  for (const cid of Object.keys(by)) {
    let pool = pm[cid] || 0; const b = { b0: 0, b30: 0, b60: 0, b90: 0 };
    const list = by[cid].slice().sort((a, c) => String(dstr(a.date) || '9999').localeCompare(String(dstr(c.date) || '9999')));
    let oldest = null;
    for (const o of list) {
      let due = nn(o.total); const use = Math.min(pool, due); pool -= use; due -= use; if (due <= 0) continue;
      const age = o.date ? Math.max(0, days(dstr(o.date), t)) : 0; if (oldest === null || age > oldest) oldest = age;
      b[age <= 30 ? 'b0' : age <= 60 ? 'b30' : age <= 90 ? 'b60' : 'b90'] += due;
    }
    const total = b.b0 + b.b30 + b.b60 + b.b90;
    out.push({ client_id: +cid, name: nm[cid], b0: r2(b.b0), b30: r2(b.b30), b60: r2(b.b60), b90: r2(b.b90), total: r2(total), oldest_days: oldest, credit: r2(pool) });
  }
  return out.sort((a, b) => b.total - a.total);
}

async function stagesApi(req, u, id, body) {
  if (req.method === 'GET') {
    const ords = await W().ordList({}); const t = today(); const seen = new Set(); const rows = [];
    ords.forEach(o => { if (seen.has(o.code)) return; seen.add(o.code); const tot = ords.filter(x => x.code === o.code).reduce((a, x) => a + x.total, 0), del = ords.filter(x => x.code === o.code).reduce((a, x) => a + nn(x.delivered), 0);
      const stage = del >= tot && tot > 0 ? 'تم التسليم' : (o.stage || STAGES[0]); const since = o.stage_at ? dstr(o.stage_at) : dstr(o.date);
      rows.push({ id: o.id, code: o.code, client_name: o.client_name, model_name: o.model_name, pieces: tot, delivered: del, stage, since, days_in_stage: since ? Math.max(0, days(since, t)) : 0 }); });
    return { stages: STAGES, rows };
  }
  needWrite(u);
  if (!id) throw bad('أمر غير معروف'); if (!STAGES.includes(body.stage)) throw bad('مرحلة غير صحيحة');
  const [[o]] = await C.db().query('SELECT code FROM cut_orders WHERE id=?', [id]); if (!o) throw new HttpError(404, 'غير موجود');
  await C.db().query('UPDATE cut_orders SET stage=?, stage_at=NOW() WHERE code=?', [body.stage, o.code]); await C.audit(u, 'stage', 'cut_order', id, o.code + ' → ' + body.stage); return { ok: true };
}

// ---- smart assistant: rule-based checks, no external service ----
async function assistant() {
  const L = await lim(); const t = today(); const A = [];
  const add = (level, area, msg, ref) => A.push({ level, area, msg, ref: ref || null });
  const W_ = W(); const ords = await W_.ordList({}); const store = await W_.storeList({});
  // cut orders
  const byModel = {}; ords.forEach(o => { if (o.unit_cost && o.model_name) (byModel[o.model_name] = byModel[o.model_name] || []).push(nn(o.unit_cost)); });
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const seenCut = {};
  ords.forEach(o => {
    const r = o.code;
    if (o.weight_in !== null && o.weight_used !== null) {
      if (nn(o.weight_used) > o.weight_in + 0.0005) add('err', 'القص', 'قصة ' + r + ': الوزن المستخدم (' + o.weight_used + ' كجم) أكبر من القماش المحوّل (' + o.weight_in + ' كجم). راجع الأوزان أو حوّل المزيد من المخزن.', r);
      else if (o.weight_in > 0 && (o.waste / o.weight_in * 100) > L.waste) add('warn', 'القص', 'قصة ' + r + ': الهالك ' + o.waste + ' كجم = ' + r2(o.waste / o.weight_in * 100) + '% من القماش (الحد ' + L.waste + '%).', r);
    }
    if (o.weight_in === null && o.total > 0) add('warn', 'القص', 'قصة ' + r + ': لا يوجد قماش محوّل من المخزن بنفس كود القصة، لن يظهر الوزن والهالك.', r);
    if (nn(o.delivered) > o.total) add('err', 'التسليم', 'قصة ' + r + ': المسلّم (' + o.delivered + ') أكبر من القطع الناتجة (' + o.total + ').', r);
    if (o.total > 0 && !nn(o.unit_cost)) add('warn', 'التكلفة', 'قصة ' + r + ': لم تُدخل تكلفة تصنيع القطعة، فلن تُحسب على حساب العميل.', r);
    const m = byModel[o.model_name]; if (m && m.length >= 2 && nn(o.unit_cost)) { const md = med(m); if (md > 0 && Math.abs(o.unit_cost - md) / md * 100 > L.dev) add('warn', 'التكلفة', 'قصة ' + r + ': تكلفة القطعة ' + o.unit_cost + ' بعيدة عن المعتاد لنفس الموديل (' + r2(md) + ').', r); }
    const key = r + '|' + (o.color || ''); if (seenCut[key]) add('warn', 'تكرار', 'قصة ' + r + ' لنفس اللون "' + (o.color || '') + '" مسجلة أكثر من مرة. هل هو تكرار؟', r); seenCut[key] = 1;
    if (o.total > 0 && o.pcs_in_marker && o.layers && o.total !== o.pcs_in_marker * o.layers) add('info', 'القص', 'قصة ' + r + ': القطع ' + o.total + ' لا تساوي (قطع الراق × الراقات = ' + o.pcs_in_marker * o.layers + ').', r);
  });
  // store
  store.forEach(s => {
    if (s.left_weight < -0.0005) add('err', 'المخزن', 'صنف ' + (s.item_code || s.fabric) + ': المحوّل أكبر من المستلم.', s.id);
    const d = dstr(s.date); if (s.left_qty > 0 && d && days(d, t) > L.idle) add('warn', 'المخزن', 'قماش ' + s.client_name + ' (' + (s.fabric || s.item_code || '') + ') متبقي ' + s.left_weight + ' كجم له ' + days(d, t) + ' يوم في المخزن بدون قص.', s.id);
  });
  const sk = {}; store.forEach(s => { const k = [s.client_id, dstr(s.date), s.item_code, s.weight].join('|'); if (sk[k]) add('warn', 'تكرار', 'إيصال قماش مكرر؟ ' + s.client_name + ' بتاريخ ' + dstr(s.date) + ' ' + (s.item_code || '') + ' ' + s.weight + ' كجم.', s.id); sk[k] = 1; });
  // outs
  const outs = await Q('SELECT * FROM outs'); const ok = {};
  outs.forEach(o => { const left = nn(o.sent) - nn(o.received); const d = dstr(o.date);
    if (left > 0 && d && days(d, t) > L.out) add('warn', 'الخارج', 'قصة ' + o.cut_code + ' عند ' + (o.party || 'الجهة') + ': متبقي ' + left + ' قطعة من ' + days(d, t) + ' يوم.', o.id);
    const k = [d, o.cut_code, o.party, o.part, o.sent].join('|'); if (ok[k]) add('warn', 'تكرار', 'حركة خارج مكررة؟ ' + o.cut_code + ' ' + (o.party || '') + ' ' + o.sent + ' بتاريخ ' + d + '.', o.id); ok[k] = 1;
    const co = ords.find(x => x.code === o.cut_code); if (!co) add('warn', 'الخارج', 'حركة خارج لقصة غير موجودة: ' + o.cut_code, o.id);
    else if (nn(o.sent) > co.total) add('err', 'الخارج', 'قصة ' + o.cut_code + ': المرسل للخارج (' + o.sent + ') أكبر من القطع المقصوصة (' + co.total + ').', o.id); });
  // payments + aging
  const pays = await Q('SELECT p.*, c.name client_name FROM payments p JOIN clients c ON c.id=p.client_id'); const pk = {};
  pays.forEach(p => { const k = [p.client_id, dstr(p.date), nn(p.amount)].join('|'); if (pk[k]) add('warn', 'تكرار', 'دفعة مكررة؟ ' + p.client_name + ' ' + dstr(p.date) + ' بمبلغ ' + nn(p.amount) + '.', p.id); pk[k] = 1; });
  (await aging()).forEach(a => { if (a.credit > 0) add('info', 'الحسابات', 'العميل ' + a.name + ': مدفوع زيادة ' + a.credit + ' عن المستحق (رصيد دائن).', a.client_id);
    if (a.b60 + a.b90 > 0 || (a.oldest_days !== null && a.oldest_days > L.aging)) add('warn', 'الحسابات', 'العميل ' + a.name + ': مستحقات متأخرة أكثر من ' + L.aging + ' يوم (إجمالي المتبقي ' + a.total + ').', a.client_id); });
  // stages
  ((await stagesApi({ method: 'GET' })).rows).forEach(s => { if (s.stage !== 'تم التسليم' && s.days_in_stage > L.stage) add('warn', 'الإنتاج', 'قصة ' + s.code + ' واقفة في "' + s.stage + '" منذ ' + s.days_in_stage + ' يوم.', s.code); });
  // payroll for the current month
  const ym = t.slice(0, 7); const pr = await (async () => { try { const fake = { method: 'GET' }; return await require('./wb').wbApi('payroll', fake, { role: 'viewer' }, null, {}, { ym }, ['payroll']); } catch (e) { return null; } })();
  if (pr) {
    const emps = await Q('SELECT id FROM employees WHERE active=1');
    pr.rows.forEach(r => { const n = r.name;
      if (!r.salary) add('warn', 'الرواتب', 'الموظف ' + n + ': الراتب صفر.', r.emp_id);
      if (r.absent > L.abs) add('warn', 'الحضور', 'الموظف ' + n + ': غياب ' + r.absent + ' أيام هذا الشهر.', r.emp_id);
      if (r.ot_hours > L.ot) add('warn', 'الرواتب', 'الموظف ' + n + ': ساعات إضافي ' + r.ot_hours + ' غير معتادة.', r.emp_id);
      if (r.net < 0) add('err', 'الرواتب', 'الموظف ' + n + ': صافي الراتب سالب (' + r.net + ').', r.emp_id);
      else if (r.total_deductions > r.salary) add('warn', 'الرواتب', 'الموظف ' + n + ': الخصومات (' + r.total_deductions + ') أكبر من الراتب.', r.emp_id);
      if (!r.present && !r.absent && t.slice(8, 10) > '05') add('info', 'الحضور', 'الموظف ' + n + ': لا يوجد حضور مسجل هذا الشهر.', r.emp_id); });
  }
  const order = { err: 0, warn: 1, info: 2 }; A.sort((a, b) => order[a.level] - order[b.level]);
  return { counts: { err: A.filter(a => a.level === 'err').length, warn: A.filter(a => a.level === 'warn').length, info: A.filter(a => a.level === 'info').length }, limits: L, items: A };
}

// quick check used by forms before saving: returns hints for a cut order draft
async function check(body) {
  const L = await lim(); const hints = [];
  const W_ = W(); const o = await W_.ordList({ code: String(body.code || '') });
  const wi = o.length ? o.find(x => x.weight_in) : null; const wu = nn(body.weight_used);
  if (wi && wu && wu > wi.weight_in) hints.push({ level: 'err', msg: 'الوزن المستخدم أكبر من القماش المحوّل (' + wi.weight_in + ').' });
  if (wi && wu && wi.weight_in && (wi.weight_in - wu) / wi.weight_in * 100 > L.waste) hints.push({ level: 'warn', msg: 'الهالك أكبر من ' + L.waste + '%.' });
  return { hints };
}


/* AI helper: Gemini free tier. aiAsk sends ONLY aggregated numbers (no client names, codes or prices per client). Key lives in env GEMINI_API_KEY. */
async function aiContext() {
  const W_ = W(); const ords = await W_.ordList({}); const store = await W_.storeList({}); const a = await assistant(); const p = await profit();
  const sum = (arr, f) => r2(arr.reduce((x, o) => x + nn(f(o)), 0));
  const areas = {}; a.items.forEach(i => { const k = i.area + '/' + (i.level === 'err' ? 'خطأ' : i.level === 'warn' ? 'تنبيه' : 'معلومة'); areas[k] = (areas[k] || 0) + 1; });
  return { عدد_أوامر_القص: ords.length, إجمالي_القطع: sum(ords, o => o.total), إجمالي_التكلفة_على_العملاء: sum(ords, o => o.cost_total), المسلّم: sum(ords, o => o.delivered), المتبقي_للتسليم: sum(ords, o => o.left), إجمالي_الهالك_كجم: sum(ords, o => o.waste), نسبة_الهالك_بالمئة_من_القماش_المحول: sum(ords, o => o.weight_in) > 0 ? r2(sum(ords, o => o.waste) / sum(ords, o => o.weight_in) * 100) : null, الوزن_المحول_كجم: sum(ords, o => o.weight_in), أصناف_المخزن: store.length, المصروفات: p.totals.expenses, الإيراد: p.totals.revenue, الربح: r2(p.totals.revenue - p.totals.expenses), تنبيهات_المساعد: a.counts, تفاصيل_التنبيهات_حسب_القسم: areas };
}
let aiHits = [];
async function aiAsk(body) {
  const key = process.env.GEMINI_API_KEY; if (!key) return { error: 'المساعد الذكي غير مفعّل (لا يوجد مفتاح).' };
  const q = String((body && body.question) || '').trim().slice(0, 500); if (!q) return { error: 'اكتب سؤالك.' };
  const now = Date.now(); aiHits = aiHits.filter(t => now - t < 60000); if (aiHits.length >= 10) return { error: 'عدد كبير من الأسئلة، حاول بعد دقيقة.' }; aiHits.push(now);
  const ctx = await aiContext();
  const prompt = 'أنت مساعد لمصنع ملابس (تصنيع للغير، العميل يملك القماش). أجب بالعربية باختصار ووضوح اعتماداً فقط على الأرقام المجمعة التالية، ولا تخترع أرقاماً. إذا لم تكفِ البيانات قل ذلك.\nالأرقام: ' + JSON.stringify(ctx) + '\nالسؤال: ' + q;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const j = await r.json(); if (!r.ok) return { error: 'تعذر الاتصال بالمساعد الذكي (' + r.status + ').' };
    const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts ? j.candidates[0].content.parts.map(x => x.text || '').join('') : '';
    return { answer: t || 'لا توجد إجابة.', model };
  } catch (e) { return { error: 'تعذر الاتصال بالمساعد الذكي.' }; }
}

/* ---------- AI chat assistant (Gemini free tier) ----------
   One endpoint, real conversation. The model may:
   1) answer from aggregated numbers (summary) or ask for record lookups - lookups run
      server-side and only for screens the user has permission to see;
   2) draft text (customer messages, invoice notes, ...) for the user to copy;
   3) open a screen (whitelisted page ids, filtered by the user's permissions);
   4) propose ONE draft create (client/model/payment/expense) which is NEVER saved here:
      the client shows it and, only after the user presses "confirm create", posts it to the
      normal API endpoint with the user's own token - so role checks, screen permissions,
      period locks and the audit log all apply exactly as if the user typed it himself.
   Honest limits: free-tier quotas (per-minute + a conservative daily cap), no edits/deletes,
   no complex documents (invoices/journals) - for those it opens the right screen instead. */
const AI_OPEN_PAGES = { home: null, clients: 'masters', models: 'masters', stages: 'masters', store: 'fabric', orders: 'fabric', outs: 'fabric', receipts: 'fabric', cuts: 'fabric', prod: 'fabric', deliveries: 'fabric', invoices: 'fabric', stages_board: 'tools', employees: 'hr', attendance: 'hr', payroll: 'hr', payments: 'accounts', accounts: 'accounts', acctstmt: 'accounts', aging: 'tools', expenses: 'tools', profit: 'tools', daily_close: 'tools', inv_stock: 'inventory', inv_items: 'inventory', inv_moves: 'inventory', sinv_list: 'invoices', sinv_new: 'invoices', pinv_list: 'invoices', pinv_new: 'invoices', branches: 'invoices', gl_accounts: 'accounting', gl_journal: 'accounting', gl_ledger: 'accounting', gl_subledger: 'accounting', gl_suppliers: 'accounting', gl_supledger: 'accounting', supplier_statement: 'accounting', gl_trial: 'accounting', gl_statements: 'accounting', cash_flow: 'accounting', bank_rec: 'accounting', assets: 'accounting', accruals: 'accounting', vat: 'accounting', gl_close: 'accounting' };
const AI_CREATES = {
  client: { perm: 'masters', endpoint: '/clients', label: 'عميل جديد', fields: ['code', 'name', 'phone', 'address', 'notes'], req: ['code', 'name'], nums: [] },
  model: { perm: 'masters', endpoint: '/models', label: 'موديل جديد', fields: ['code', 'name', 'client_id', 'description', 'price'], req: ['code', 'name'], nums: ['client_id', 'price'] },
  payment: { perm: 'accounts', endpoint: '/payments', label: 'دفعة مقبوضات', fields: ['client_id', 'date', 'amount', 'method', 'notes'], req: ['client_id', 'date', 'amount'], nums: ['client_id', 'amount'] },
  expense: { perm: 'tools', endpoint: '/expenses', label: 'مصروف', fields: ['date', 'cut_code', 'category', 'amount', 'notes'], req: ['date', 'category', 'amount'], nums: ['amount'] }
};
const aiPerm = (u, p) => !p || u.perms.includes('*') || u.perms.includes(p);
const aiCanWrite = (u) => u.role === 'admin' || u.role === 'staff';
const AI_MIN_LIMIT = 8, AI_DAY_LIMIT = 400;
const aiState = { min: [], day: '', n: 0 };

const AI_LOOKUPS = {
  summary: { perm: 'tools', run: () => aiContext() },
  clients: { perm: 'masters', run: (q) => Q('SELECT id,code,name,phone,active FROM clients WHERE name LIKE ? OR code LIKE ? OR phone LIKE ? ORDER BY name LIMIT 8', aiLike(q, 3)) },
  models: { perm: 'masters', run: (q) => Q('SELECT m.id,m.code,m.name,m.price,c.name client_name FROM models m LEFT JOIN clients c ON c.id=m.client_id WHERE m.name LIKE ? OR m.code LIKE ? ORDER BY m.code LIMIT 8', aiLike(q, 2)) },
  cut_orders: { perm: 'fabric', run: (q) => Q('SELECT o.code,o.date,c.name client_name,o.model_name,o.total_pcs,o.delivered,o.cut_status,o.stage,o.unit_cost FROM cut_orders o LEFT JOIN clients c ON c.id=o.client_id WHERE o.code LIKE ? OR c.name LIKE ? OR o.model_name LIKE ? ORDER BY o.id DESC LIMIT 8', aiLike(q, 3)) },
  cuts: { perm: 'fabric', run: (q) => Q('SELECT t.number,t.date,c.name client_name,m.name model_name,t.pieces_cut,t.damaged_pcs,t.waste_m,t.fabric_used_m FROM cuts t JOIN clients c ON c.id=t.client_id JOIN models m ON m.id=t.model_id WHERE t.number LIKE ? OR c.name LIKE ? OR m.name LIKE ? ORDER BY t.id DESC LIMIT 8', aiLike(q, 3)) },
  store: { perm: 'fabric', run: (q) => Q('SELECT s.id,s.date,c.name client_name,s.item_code,s.fabric,s.qty,s.unit,s.weight,s.color FROM store_items s JOIN clients c ON c.id=s.client_id WHERE s.item_code LIKE ? OR s.fabric LIKE ? OR c.name LIKE ? ORDER BY s.id DESC LIMIT 8', aiLike(q, 3)) },
  rolls: { perm: 'fabric', run: (q) => Q('SELECT r.roll_no,c.name client_name,r.fabric_type,r.color,r.length_m,r.used_m,(r.length_m-r.used_m) remaining_m,r.weight_kg FROM rolls r JOIN clients c ON c.id=r.client_id WHERE r.roll_no LIKE ? OR r.fabric_type LIKE ? OR c.name LIKE ? OR r.color LIKE ? ORDER BY remaining_m DESC LIMIT 8', aiLike(q, 4)) },
  outs: { perm: 'fabric', run: (q) => Q('SELECT o.date,o.cut_code,o.part,o.party,o.sent,o.received FROM outs o WHERE o.cut_code LIKE ? OR o.party LIKE ? OR o.part LIKE ? ORDER BY o.id DESC LIMIT 8', aiLike(q, 3)) },
  deliveries: { perm: 'fabric', run: (q) => Q('SELECT d.number,d.date,c.name client_name,d.driver FROM deliveries d JOIN clients c ON c.id=d.client_id WHERE d.number LIKE ? OR c.name LIKE ? ORDER BY d.id DESC LIMIT 8', aiLike(q, 2)) },
  invoices: { perm: 'fabric', run: (q) => Q('SELECT i.number,i.date,c.name client_name,i.total,i.notes FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.number LIKE ? OR c.name LIKE ? ORDER BY i.id DESC LIMIT 8', aiLike(q, 2)) },
  sales_invoices: { perm: 'invoices', run: (q) => Q("SELECT s.no,s.date,s.type,s.total,s.status,s.settle,COALESCE(c.name,p.name,'') party FROM sales_invoices s LEFT JOIN clients c ON c.id=s.client_id LEFT JOIN suppliers p ON p.id=s.supplier_id WHERE s.no LIKE ? OR c.name LIKE ? OR p.name LIKE ? ORDER BY s.id DESC LIMIT 8", aiLike(q, 3)) },
  payments: { perm: 'accounts', run: (q) => Q('SELECT p.date,c.name client_name,p.amount,p.method,p.notes FROM payments p JOIN clients c ON c.id=p.client_id WHERE c.name LIKE ? OR p.notes LIKE ? OR p.method LIKE ? ORDER BY p.id DESC LIMIT 8', aiLike(q, 3)) },
  expenses: { perm: 'tools', run: (q) => Q('SELECT e.date,e.cut_code,e.category,e.amount,e.notes FROM expenses e WHERE e.category LIKE ? OR e.cut_code LIKE ? OR e.notes LIKE ? ORDER BY e.id DESC LIMIT 8', aiLike(q, 3)) },
  employees: { perm: 'hr', run: (q) => Q('SELECT id,code,name,job,salary,active FROM employees WHERE name LIKE ? OR code LIKE ? OR job LIKE ? ORDER BY name LIMIT 8', aiLike(q, 3)) },
  attendance: { perm: 'hr', run: (q) => Q('SELECT e.name emp_name,a.date,a.status FROM attendance a JOIN employees e ON e.id=a.emp_id WHERE e.name LIKE ? ORDER BY a.date DESC LIMIT 12', aiLike(q, 1)) },
  inv_items: { perm: 'inventory', run: (q) => Q("SELECT i.code,i.name,i.unit,COALESCE(SUM(CASE WHEN m.kind IN ('out','trout') THEN -m.qty ELSE m.qty END),0) balance,i.min_qty FROM inv_items i LEFT JOIN inv_moves m ON m.item_id=i.id WHERE i.code LIKE ? OR i.name LIKE ? GROUP BY i.id,i.code,i.name,i.unit,i.min_qty ORDER BY i.name LIMIT 8", aiLike(q, 2)) },
  suppliers: { perm: 'accounting', run: (q) => Q('SELECT id,code,name,phone FROM suppliers WHERE name LIKE ? OR code LIKE ? OR phone LIKE ? ORDER BY name LIMIT 8', aiLike(q, 3)) }
};
function aiLike(q, n) { const s = '%' + String(q || '').replace(/[%_]/g, '').trim().slice(0, 60) + '%'; return Array(n).fill(s); }

async function aiGemini(key, sys, contents) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 1400 } }) });
    const j = await r.json();
    if (!r.ok) {
      if (r.status === 429) return { error: 'النسخة المجانية من Gemini وصلت لحد السرعة مؤقتًا. انتظر دقيقة وحاول مجددًا.' };
      return { error: 'تعذر الاتصال بالمساعد الذكي (' + r.status + ').' };
    }
    const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts ? j.candidates[0].content.parts.map(x => x.text || '').join('') : '';
    try { return JSON.parse(t); } catch (e) {
      const m = t.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* fall through */ } }
      if (t && t.trim()) return { say: t.replace(/[{}]/g, '').slice(0, 1500) };
      return { error: 'لم يصل رد صالح من المساعد الذكي، حاول صياغة الطلب بطريقة أخرى.' };
    }
  } catch (e) { return { error: 'تعذر الاتصال بالمساعد الذكي، تحقق من الإنترنت وحاول مرة أخرى.' }; }
}

async function aiChat(body, u) {
  if (!aiPerm(u, 'tools')) return { error: 'لا تملك صلاحية استخدام المساعد الذكي.' };
  const key = process.env.GEMINI_API_KEY; if (!key) return { error: 'المساعد الذكي غير مفعّل (لا يوجد مفتاح).' };
  const msg = String((body && body.message) || '').trim().slice(0, 800); if (!msg) return { error: 'اكتب طلبك.' };
  const now = Date.now(); aiState.min = aiState.min.filter(t => now - t < 60000);
  if (aiState.min.length >= AI_MIN_LIMIT) return { error: 'طلبات كثيرة في دقيقة واحدة، حاول بعد قليل.' };
  const dayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  if (aiState.day !== dayCairo) { aiState.day = dayCairo; aiState.n = 0; }
  if (aiState.n >= AI_DAY_LIMIT) return { error: 'وصلنا للحد اليومي الآمن للنسخة المجانية، يتجدد غدًا بإذن الله.' };
  aiState.min.push(now); aiState.n++;

  const lang = body && body.lang === 'en' ? 'en' : 'ar';
  const lookupsAllowed = Object.keys(AI_LOOKUPS).filter(k => aiPerm(u, AI_LOOKUPS[k].perm));
  const createsAllowed = aiCanWrite(u) ? Object.keys(AI_CREATES).filter(k => aiPerm(u, AI_CREATES[k].perm)) : [];
  const pagesAllowed = Object.keys(AI_OPEN_PAGES).filter(k => aiPerm(u, AI_OPEN_PAGES[k]));
  const sys = [
    'أنت "مساعد المصنع" داخل نظام ERP لمصنع ملابس يعمل بالتصنيع للغير (العميل يملك القماش، والمصنع يستلمه ويقص ويخيط ويسلّم ويحاسب بالقطعة). تتحدث مع مستخدم داخل النظام.',
    'أجب دائمًا بكائن JSON واحد فقط بدون أي نص خارجه، بالشكل:',
    '{"say":"ردك للمستخدم","draft":{"title":"...","text":"..."},"open":"معرف_شاشة","create":{"entity":"...","fields":{...}},"need":[{"kind":"...","query":"..."}]}',
    'كل الحقول اختيارية عدا say.',
    'قدراتك:',
    '1) بيانات النظام: عند الحاجة لأرقام أو سجلات أرسل need (حتى 4 عناصر) مع say قصير، وستصلك النتائج في الرسالة التالية فتجيب نهائيًا بدون need. الأنواع المتاحة لهذا المستخدم: ' + lookupsAllowed.join(', ') + ' (summary = أرقام مجمعة عامة؛ cut_orders = أوامر القص؛ cuts = القصات التفصيلية؛ sales_invoices = فواتير المبيعات/المشتريات الجديدة؛ invoices = فواتير التصنيع؛ rolls = أتواب القماش؛ store = مخزن قماش العملاء).',
    '2) صياغة النصوص draft: رسائل واتساب/إيميل للعملاء، ملاحظات فواتير، إشعارات. اكتب النص كاملًا جاهزًا للنسخ باللغة والأسلوب اللذين يطلبهما المستخدم.',
    '3) فتح شاشة open: فقط من هذه المعرفات: ' + pagesAllowed.join(', ') + '.',
    createsAllowed.length ?
      '4) مسودة إنشاء create من الأنواع: ' + createsAllowed.map(k => k + ' (' + AI_CREATES[k].label + ', حقول: ' + AI_CREATES[k].fields.join('/') + ')').join('; ') + '. لا يُحفظ شيء إلا بعد ضغط المستخدم "تأكيد الإنشاء". client_id يجب أن يكون id رقميًا من نتائج بحث clients: ابحث أولًا ثم استخدمه، ولا تخمّنه. التاريخ YYYY-MM-DD والمبالغ أرقام. لا تقترح create إلا إذا طلب المستخدم الإنشاء صراحة، وإن نقصت بيانات اسأل عنها في say بدل التخمين.' :
      '4) هذا المستخدم صلاحيته عرض فقط: لا تقترح أي create، وإن طلب إنشاءً اعتذر بلطف ووجّهه لمن يملك صلاحية الكتابة.',
    'القواعد:',
    '- لا تخترع أرقامًا أو أسماء أو أكوادًا؛ اعتمد فقط على نتائج البحث. إن لم تكفِ البيانات قل ذلك صراحة.',
    '- لا تستطيع التعديل أو الحذف أو إنشاء فواتير أو قيود محاسبية؛ عند الحاجة افتح الشاشة المناسبة بـ open واشرح الخطوات باختصار.',
    '- say نص طبيعي ودود ومختصر بدون ذكر JSON أو مصطلحات تقنية.',
    '- لغة say: ' + (lang === 'en' ? 'English' : 'العربية') + '.',
    '- أنت على النسخة المجانية من Gemini: لو سُئلت عن حدودك فكن صريحًا (حد أقصى للطلبات في الدقيقة واليوم).',
    'اليوم: ' + dayCairo + '. المستخدم: ' + (u.name || u.username) + ' (الدور: ' + u.role + ').'
  ].join('\n');

  const hist = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const contents = hist.map(m2 => ({ role: m2 && m2.role === 'model' ? 'model' : 'user', parts: [{ text: String((m2 && m2.text) || '').slice(0, 800) }] })).filter(c => c.parts[0].text);
  contents.push({ role: 'user', parts: [{ text: msg }] });

  let j = await aiGemini(key, sys, contents);
  if (j.error) return j;
  if (Array.isArray(j.need) && j.need.length) {
    const results = {};
    for (const nd of j.need.slice(0, 4)) {
      const L = nd && AI_LOOKUPS[nd.kind];
      if (!L || !aiPerm(u, L.perm)) { if (nd && nd.kind) results[nd.kind] = { note: 'نوع غير متاح لصلاحيات هذا المستخدم' }; continue; }
      try { results[nd.kind] = await L.run(String(nd.query || '')); } catch (e) { results[nd.kind] = { note: 'تعذر البحث' }; }
    }
    contents.push({ role: 'model', parts: [{ text: JSON.stringify(j) }] });
    contents.push({ role: 'user', parts: [{ text: 'نتائج البحث من النظام (JSON): ' + JSON.stringify(results).slice(0, 7000) + '\nأجب الآن إجابة نهائية بنفس صيغة JSON وبدون need.' }] });
    j = await aiGemini(key, sys, contents);
    if (j.error) return j;
  }

  const out = { say: String(j.say || '').slice(0, 2000) };
  if (j.draft && j.draft.text) out.draft = { title: String(j.draft.title || 'مسودة نص').slice(0, 120), text: String(j.draft.text).slice(0, 4000) };
  if (j.open && pagesAllowed.includes(String(j.open))) out.open = String(j.open);
  if (j.create && j.create.entity) {
    const ent = String(j.create.entity); const spec = AI_CREATES[ent];
    if (spec && createsAllowed.includes(ent)) {
      const f = {};
      for (const k of spec.fields) {
        let v = j.create.fields ? j.create.fields[k] : undefined;
        if (v === undefined || v === null || v === '') continue;
        if (spec.nums.includes(k)) { v = Number(v); if (!isFinite(v)) continue; }
        else if (k === 'date') { v = String(v).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) continue; }
        else v = String(v).slice(0, 250);
        f[k] = v;
      }
      const missing = spec.req.filter(k => f[k] === undefined);
      if (missing.length) out.say = (out.say ? out.say + '\n' : '') + 'لم أجهّز مسودة الإنشاء لنقص البيانات: ' + missing.join('، ') + '. أرسلها لي وأكملها فورًا.';
      else out.create = { entity: ent, label: spec.label, endpoint: spec.endpoint, fields: f };
    }
  }
  if (!out.say && !out.draft && !out.create) out.say = lang === 'en' ? 'I could not build a useful reply. Try rephrasing.' : 'لم أستطع تكوين رد مفيد، حاول صياغة الطلب بطريقة أخرى.';
  out.quota = { used: aiState.n, limit: AI_DAY_LIMIT };
  return out;
}


/* Period lock: records dated before setting lock_before (YYYY-MM-DD) cannot be created, edited or deleted. Admin clears the setting to unlock. */
const LOCK_T = { orders: 'cut_orders', outs: 'outs', expenses: 'expenses', payments: 'payments' };
async function lockCheck(head, req, id, body) {
  const t = LOCK_T[head]; if (!t || !['POST', 'PUT', 'DELETE'].includes(req.method)) return;
  const s = await C.getSettings(); const lb = String(s.lock_before || '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(lb)) return;
  const dates = []; if (body && body.date) dates.push(String(body.date).slice(0, 10));
  if (id && (req.method === 'PUT' || req.method === 'DELETE')) { const [r] = await C.db().query('SELECT date FROM ' + t + ' WHERE id=?', [id]); if (r[0] && r[0].date) dates.push(r[0].date instanceof Date ? r[0].date.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) : String(r[0].date).slice(0, 10)); }
  if (dates.some(d => d < lb)) throw new HttpError(423, 'الفترة مقفلة: لا يمكن إضافة أو تعديل أو حذف سجل بتاريخ قبل ' + lb + '. يمكن للمدير فتح الفترة من الإعدادات.');
}

async function dailyClose(q) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const one = async (sql) => (await Q(sql, [d]))[0] || {};
  const prod = await Q('SELECT st.name stage, SUM(p.qty_ok) ok, SUM(p.qty_defect) defect FROM prod_logs p JOIN stages st ON st.id=p.stage_id WHERE p.date=? GROUP BY st.id, st.name ORDER BY st.id', [d]);
  const del = await one('SELECT COUNT(*) n FROM deliveries WHERE date=?');
  const delq = await one('SELECT COALESCE(SUM(l.qty),0) q FROM delivery_lines l JOIN deliveries x ON x.id=l.delivery_id WHERE x.date=?').catch(() => ({ q: 0 }));
  const rec = await one('SELECT COUNT(*) n FROM receipts WHERE date=?').catch(() => ({ n: 0 }));
  const pay = await one('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM payments WHERE date=?');
  const exp = await one('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM expenses WHERE date=?');
  const att = await Q('SELECT status, COUNT(*) n FROM attendance WHERE date=? GROUP BY status', [d]);
  const ords = await one('SELECT COUNT(*) n FROM cut_orders WHERE date=?');
  return { date: d, production: prod, deliveries: { n: del.n || 0, qty: Number(delq.q || 0) }, receipts: rec.n || 0, orders: ords.n || 0, payments: { n: pay.n || 0, total: Number(pay.s || 0) }, expenses: { n: exp.n || 0, total: Number(exp.s || 0) }, attendance: att };
}
async function api(head, req, u, id, body, q) {
  if (head === 'daily-close' && req.method === 'GET') return dailyClose(q || {});
  if (head === 'ai-ask' && req.method === 'POST') return aiAsk(body);
  if (head === 'ai-chat' && req.method === 'POST') return aiChat(body, u);
  if (head === 'expenses') return expensesApi(req, u, id, body);
  if (head === 'profit') return profit();
  if (head === 'aging') return aging();
  if (head === 'stages-board') return stagesApi(req, u, id, body);
  if (head === 'assistant') return assistant();
  if (head === 'check') return check(body);
  return undefined;
}
module.exports = { api , lockCheck };
