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
  const ords = await W().ordList({}); const ex = await Q('SELECT cut_code, SUM(amount) a FROM expenses GROUP BY cut_code');
  const em = {}; ex.forEach(x => em[x.cut_code || ''] = nn(x.a));
  const rows = ords.map(o => { const e = em[o.code] || 0; const rev = o.cost_total; return { code: o.code, client_name: o.client_name, model_name: o.model_name, pieces: o.total, revenue: rev, expenses: r2(e), profit: r2(rev - e), margin: rev ? r2((rev - e) / rev * 100) : null, per_piece: o.total ? r2((rev - e) / o.total) : null }; });
  const seen = new Set(); const uniq = rows.filter(r => seen.has(r.code) ? false : seen.add(r.code));
  // revenue is counted per row; expenses are attached once per code
  const used = new Set(); rows.forEach(r => { if (used.has(r.code)) { r.expenses = 0; r.profit = r.revenue; r.margin = r.revenue ? 100 : null; } used.add(r.code); });
  const general = r2(em[''] || 0);
  return { rows, general_expenses: general, totals: { revenue: r2(rows.reduce((a, r) => a + r.revenue, 0)), expenses: r2(rows.reduce((a, r) => a + r.expenses, 0) + general) } };
}

async function aging() {
  const W_ = W(); const ords = await W_.ordList({}); const pays = await Q('SELECT client_id, SUM(amount) p FROM payments GROUP BY client_id');
  const cl = await Q('SELECT id,name FROM clients'); const nm = {}; cl.forEach(c => nm[c.id] = c.name);
  const pm = {}; pays.forEach(p => pm[p.client_id] = nn(p.p)); const t = today();
  const by = {}; ords.forEach(o => (by[o.client_id] = by[o.client_id] || []).push(o));
  const out = [];
  for (const cid of Object.keys(by)) {
    let pool = pm[cid] || 0; const b = { b0: 0, b30: 0, b60: 0, b90: 0 };
    const list = by[cid].slice().sort((a, c) => String(dstr(a.date) || '9999').localeCompare(String(dstr(c.date) || '9999')));
    let oldest = null;
    for (const o of list) {
      let due = o.cost_total; const use = Math.min(pool, due); pool -= use; due -= use; if (due <= 0) continue;
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

async function api(head, req, u, id, body, q) {
  if (head === 'expenses') return expensesApi(req, u, id, body);
  if (head === 'profit') return profit();
  if (head === 'aging') return aging();
  if (head === 'stages') return stagesApi(req, u, id, body);
  if (head === 'assistant') return assistant();
  if (head === 'check') return check(body);
  return undefined;
}
module.exports = { api };
