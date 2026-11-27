'use strict';
/* Workbook-style modules: fabric store (مخزن استلام القماش), cut orders (أمر القص التفصيلي),
   outgoing/returning tracking, client accounts. Mirrors the factory's Excel workbook. */
const C = require('./core');
const { bad, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 1000) / 1000;
const nn = (x) => { const n = Number(x); return isFinite(n) ? n : 0; };
const str = (x, max, name, req) => { const s = x === undefined || x === null ? '' : String(x).trim(); if (req && !s) throw bad('الحقل مطلوب: ' + name); return s.slice(0, max) || null; };
const num0 = (x, name) => { if (x === '' || x === null || x === undefined) return 0; const n = Number(x); if (!isFinite(n) || n < 0) throw bad('قيمة غير صحيحة: ' + name); return n; };
const needWrite = (u) => { if (u.role === 'viewer') throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
const SIZES = ['s_2xl', 's_xl', 's_l', 's_m', 's_s', 's_xs'];
const SIZE_LBL = { s_2xl: '2XL', s_xl: 'XL', s_l: 'L', s_m: 'M', s_s: 'S', s_xs: 'XS' };

const SCHEMA = [
`CREATE TABLE IF NOT EXISTS store_items(id INT AUTO_INCREMENT PRIMARY KEY, date DATE NOT NULL, client_id INT NOT NULL, item_code VARCHAR(60), fabric VARCHAR(120), qty DECIMAL(12,2) NOT NULL DEFAULT 0, unit VARCHAR(20), weight DECIMAL(12,3) NOT NULL DEFAULT 0, color VARCHAR(80), notes VARCHAR(255), created_by INT, INDEX(client_id), INDEX(date))`,
`CREATE TABLE IF NOT EXISTS store_transfers(id INT AUTO_INCREMENT PRIMARY KEY, store_id INT NOT NULL, date DATE NOT NULL, cut_code VARCHAR(60) NOT NULL, qty DECIMAL(12,2) NOT NULL DEFAULT 0, weight DECIMAL(12,3) NOT NULL DEFAULT 0, model_name VARCHAR(160), created_by INT, INDEX(store_id), INDEX(cut_code))`,
`CREATE TABLE IF NOT EXISTS cut_orders(id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(60) NOT NULL, client_id INT NOT NULL, fabric VARCHAR(120), model_name VARCHAR(160), color VARCHAR(120), weight_used DECIMAL(12,3), marker_len DECIMAL(10,2), marker_width DECIMAL(10,1), marker_weight DECIMAL(10,3), layers INT, sizes_in_marker INT, pcs_in_marker INT, s_2xl INT, s_xl INT, s_l INT, s_m INT, s_s INT, s_xs INT, total_pcs INT, unit_cost DECIMAL(14,2), cut_status VARCHAR(40), delivered INT NOT NULL DEFAULT 0, date DATE, notes VARCHAR(255), created_by INT, INDEX(code), INDEX(client_id))`,
`CREATE TABLE IF NOT EXISTS outs(id INT AUTO_INCREMENT PRIMARY KEY, date DATE, cut_code VARCHAR(60), part VARCHAR(160), party VARCHAR(120), sent INT NOT NULL DEFAULT 0, received INT NOT NULL DEFAULT 0, notes VARCHAR(255), INDEX(cut_code))`,
`CREATE TABLE IF NOT EXISTS employees(id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, job VARCHAR(80), salary DECIMAL(12,2) NOT NULL DEFAULT 0, active TINYINT NOT NULL DEFAULT 1)`,
`CREATE TABLE IF NOT EXISTS attendance(emp_id INT NOT NULL, date DATE NOT NULL, status VARCHAR(12) NOT NULL, PRIMARY KEY(emp_id,date))`,
`CREATE TABLE IF NOT EXISTS payroll_inputs(emp_id INT NOT NULL, ym CHAR(7) NOT NULL, ot_hours DECIMAL(8,2) NOT NULL DEFAULT 0, fridays INT NOT NULL DEFAULT 0, advances DECIMAL(12,2) NOT NULL DEFAULT 0, deduction DECIMAL(12,2) NOT NULL DEFAULT 0, PRIMARY KEY(emp_id,ym))`,
'ALTER TABLE payments ADD COLUMN doc_no VARCHAR(40)',
'ALTER TABLE cut_orders ADD COLUMN stage VARCHAR(30)',
'ALTER TABLE cut_orders ADD COLUMN stage_at DATETIME',
`CREATE TABLE IF NOT EXISTS expenses(id INT AUTO_INCREMENT PRIMARY KEY, date DATE NOT NULL, cut_code VARCHAR(60), category VARCHAR(60), amount DECIMAL(14,2) NOT NULL DEFAULT 0, notes VARCHAR(255), created_by INT, INDEX(cut_code))`
];
async function migrate(pool) {
  for (const s of SCHEMA) { try { await pool.query(s); } catch (e) { if (!/Duplicate column/i.test(e.message)) throw e; } }
}

// ---- store ----
function storeStatus(qty, tq) { return tq <= 0 ? 'متاح بالمخزن' : (tq >= qty ? 'محول للقص' : 'محول جزئياً'); }
async function storeList(q) {
  const p = []; let w = '';
  if (q.client_id) { w = ' WHERE s.client_id=?'; p.push(+q.client_id); }
  const rows = await Q('SELECT s.*, c.name client_name FROM store_items s JOIN clients c ON c.id=s.client_id' + w + ' ORDER BY s.date DESC, s.id DESC', p);
  const tr = await Q('SELECT store_id, cut_code, qty, weight, date, model_name FROM store_transfers ORDER BY date, id');
  const by = {}; tr.forEach(t => (by[t.store_id] = by[t.store_id] || []).push(t));
  rows.forEach(r => {
    const ts = by[r.id] || [];
    r.t_qty = r3(ts.reduce((a, t) => a + nn(t.qty), 0)); r.t_weight = r3(ts.reduce((a, t) => a + nn(t.weight), 0));
    r.t_date = ts.length ? ts[ts.length - 1].date : null;
    r.cut_codes = [...new Set(ts.map(t => t.cut_code))].join(' + ');
    r.model_names = [...new Set(ts.map(t => t.model_name).filter(Boolean))].join(' + ');
    r.left_qty = r3(Math.max(0, nn(r.qty) - r.t_qty)); r.left_weight = r3(nn(r.weight) - r.t_weight);
    r.status = storeStatus(nn(r.qty), r.t_qty);
    r.transfers = ts;
  });
  return rows;
}
function storeBody(b, partial) {
  if (!isDate(b.date)) throw bad('تاريخ الاستلام غير صحيح');
  if (!b.client_id) throw bad('اختر العميل');
  return { date: b.date, client_id: +b.client_id, item_code: str(b.item_code, 60), fabric: str(b.fabric, 120), qty: num0(b.qty, 'الكمية'), unit: str(b.unit, 20) || 'توب', weight: num0(b.weight, 'الوزن'), color: str(b.color, 80), notes: str(b.notes, 255) };
}
async function storeApi(req, u, id, body, q, sub) {
  const m = req.method;
  if (m === 'GET') return storeList(q);
  needWrite(u);
  if (sub === 'transfer' && m === 'POST') {
    // withdraw fabric for a cut order: decrements the store
    return C.tx(async (conn) => {
      const [[it]] = await conn.query('SELECT * FROM store_items WHERE id=? FOR UPDATE', [id]); if (!it) throw new HttpError(404, 'الصنف غير موجود');
      const [[t]] = await conn.query('SELECT COALESCE(SUM(qty),0) q, COALESCE(SUM(weight),0) w FROM store_transfers WHERE store_id=?', [id]);
      const code = str(body.cut_code, 60, 'كود أمر القص', true);
      if (!isDate(body.date)) throw bad('تاريخ التحويل غير صحيح');
      const qty = num0(body.qty, 'الكمية'); if (qty <= 0) throw bad('الكمية المحولة يجب أن تكون أكبر من صفر');
      if (nn(t.q) + qty > nn(it.qty) + 1e-9) throw bad('الكمية المحولة أكبر من المتبقي بالمخزن (' + r3(nn(it.qty) - nn(t.q)) + ')');
      let w = body.weight === '' || body.weight === null || body.weight === undefined ? null : num0(body.weight, 'الوزن');
      if (w === null) w = nn(it.qty) > 0 ? r3(nn(it.weight) * qty / nn(it.qty)) : 0;   // proportional, like the workbook
      if (nn(t.w) + w > nn(it.weight) + 0.0005) w = r3(Math.max(0, nn(it.weight) - nn(t.w)));
      const [r] = await conn.query('INSERT INTO store_transfers(store_id,date,cut_code,qty,weight,model_name,created_by) VALUES(?,?,?,?,?,?,?)', [id, body.date, code, qty, w, str(body.model_name, 160), u.id]);
      await C.audit(u, 'transfer', 'store', id, code + ' qty=' + qty + ' w=' + w, conn);
      return { id: r.insertId, weight: w };
    });
  }
  if (sub === 'transfer' && m === 'DELETE') { await C.db().query('DELETE FROM store_transfers WHERE id=?', [id]); await C.audit(u, 'delete', 'store_transfer', id); return { ok: true }; }
  if (m === 'POST') {
    const o = storeBody(body); const k = Object.keys(o);
    const [r] = await C.db().query('INSERT INTO store_items(' + k.join(',') + ',created_by) VALUES(' + k.map(() => '?').join(',') + ',?)', [...k.map(x => o[x]), u.id]);
    await C.audit(u, 'create', 'store', r.insertId, o.fabric); return { id: r.insertId };
  }
  if (m === 'PUT' && id) {
    const o = storeBody(body);
    const [[t]] = await C.db().query('SELECT COALESCE(SUM(qty),0) q FROM store_transfers WHERE store_id=?', [id]);
    if (o.qty < nn(t.q)) throw bad('لا يمكن جعل الكمية المستلمة أقل من الكمية المحولة للقص (' + nn(t.q) + ')');
    const k = Object.keys(o); await C.db().query('UPDATE store_items SET ' + k.map(x => x + '=?').join(',') + ' WHERE id=?', [...k.map(x => o[x]), id]);
    await C.audit(u, 'update', 'store', id); return { ok: true };
  }
  if (m === 'DELETE' && id) {
    const [[t]] = await C.db().query('SELECT COUNT(*) c FROM store_transfers WHERE store_id=?', [id]);
    if (t.c) throw bad('لا يمكن حذف صنف محوّل للقص، احذف التحويلات أولاً');
    await C.db().query('DELETE FROM store_items WHERE id=?', [id]); await C.audit(u, 'delete', 'store', id); return { ok: true };
  }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---- cut orders ----
function ordStatus(total, deliv) { if (!total) return ''; if (deliv <= 0) return 'لم يسلم'; return deliv >= total ? 'تم التسليم' : 'تسليم جزئي'; }
async function ordList(q) {
  const p = [], w = [];
  if (q.client_id) { w.push('o.client_id=?'); p.push(+q.client_id); }
  if (q.code) { w.push('o.code=?'); p.push(String(q.code)); }
  const rows = await Q('SELECT o.*, c.name client_name FROM cut_orders o JOIN clients c ON c.id=o.client_id' + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY o.id', p);
  const tr = await Q('SELECT t.cut_code, t.weight, s.color FROM store_transfers t JOIN store_items s ON s.id=t.store_id');
  const meta = await Q('SELECT t.cut_code, MIN(s.fabric) fabric, MIN(t.model_name) model_name FROM store_transfers t JOIN store_items s ON s.id=t.store_id GROUP BY t.cut_code');
  const mm = {}; meta.forEach(x => mm[x.cut_code] = x);
  const lookup = (code, color) => {
    // like the workbook: a single/blank/"a - b" colour takes all transfers of the code; otherwise those of that colour
    const all = !color || /-/.test(color);
    return r3(tr.filter(t => t.cut_code === code && (all || String(t.color || '').trim() === String(color).trim())).reduce((a, t) => a + nn(t.weight), 0));
  };
  rows.forEach(r => {
    const sz = SIZES.reduce((a, k) => a + nn(r[k]), 0), hasSz = SIZES.some(k => r[k] !== null && r[k] !== undefined);
    r.total = hasSz ? sz : nn(r.total_pcs);
    r.cost_total = r.unit_cost === null || r.unit_cost === undefined ? 0 : r2(r.total * nn(r.unit_cost));
    r.weight_in = lookup(r.code, r.color) || null;
    r.waste = r.weight_in !== null && r.weight_used !== null ? r3(r.weight_in - nn(r.weight_used)) : null;
    r.left = r.total - nn(r.delivered);
    r.deliv_status = ordStatus(r.total, nn(r.delivered));
    if (!r.fabric && mm[r.code]) r.fabric = mm[r.code].fabric;
    if (!r.model_name && mm[r.code]) r.model_name = mm[r.code].model_name;
  });
  return rows;
}
function ordBody(b) {
  if (!b.client_id) throw bad('اختر العميل');
  const code = str(b.code, 60, 'كود القصة / أمر القص', true);
  const o = { code, client_id: +b.client_id, fabric: str(b.fabric, 120), model_name: str(b.model_name, 160), color: str(b.color, 120),
    weight_used: b.weight_used === '' || b.weight_used == null ? null : num0(b.weight_used, 'الوزن الفعلي'),
    marker_len: b.marker_len === '' || b.marker_len == null ? null : num0(b.marker_len, 'طول الراق'),
    marker_width: b.marker_width === '' || b.marker_width == null ? null : num0(b.marker_width, 'عرض الراق'),
    marker_weight: b.marker_weight === '' || b.marker_weight == null ? null : num0(b.marker_weight, 'وزن الراق'),
    layers: b.layers === '' || b.layers == null ? null : Math.round(num0(b.layers, 'عدد الراقات')),
    sizes_in_marker: b.sizes_in_marker === '' || b.sizes_in_marker == null ? null : Math.round(num0(b.sizes_in_marker, 'عدد المقاسات')),
    pcs_in_marker: b.pcs_in_marker === '' || b.pcs_in_marker == null ? null : Math.round(num0(b.pcs_in_marker, 'عدد القطع في الراق')),
    total_pcs: b.total_pcs === '' || b.total_pcs == null ? null : Math.round(num0(b.total_pcs, 'إجمالي القطع')),
    unit_cost: b.unit_cost === '' || b.unit_cost == null ? null : r2(num0(b.unit_cost, 'تكلفة القطعة')),
    cut_status: str(b.cut_status, 40), delivered: Math.round(num0(b.delivered, 'القطع المسلمة')), date: isDate(b.date) ? b.date : null, notes: str(b.notes, 255) };
  SIZES.forEach(k => { o[k] = b[k] === '' || b[k] == null ? null : Math.round(num0(b[k], SIZE_LBL[k])); });
  return o;
}
async function ordApi(req, u, id, body, q) {
  const m = req.method;
  if (m === 'GET') return ordList(q);
  needWrite(u);
  if (m === 'POST' || (m === 'PUT' && id)) {
    const o = ordBody(body); const k = Object.keys(o);
    if (m === 'POST') { const [r] = await C.db().query('INSERT INTO cut_orders(' + k.join(',') + ',created_by) VALUES(' + k.map(() => '?').join(',') + ',?)', [...k.map(x => o[x]), u.id]); await C.audit(u, 'create', 'cut_order', r.insertId, o.code); return { id: r.insertId }; }
    await C.db().query('UPDATE cut_orders SET ' + k.map(x => x + '=?').join(',') + ' WHERE id=?', [...k.map(x => o[x]), id]); await C.audit(u, 'update', 'cut_order', id, o.code); return { ok: true };
  }
  if (m === 'DELETE' && id) { await C.db().query('DELETE FROM cut_orders WHERE id=?', [id]); await C.audit(u, 'delete', 'cut_order', id); return { ok: true }; }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---- outgoing / returning ----
async function outsApi(req, u, id, body) {
  const m = req.method;
  if (m === 'GET') {
    const rows = await Q('SELECT o.*, (SELECT MIN(x.client_id) FROM cut_orders x WHERE x.code=o.cut_code) cid FROM outs o ORDER BY o.id DESC');
    const cl = await Q('SELECT id,name FROM clients'); const cm = {}; cl.forEach(c => cm[c.id] = c.name);
    rows.forEach(r => { r.client_name = cm[r.cid] || ''; r.left = nn(r.sent) - nn(r.received); r.status = !r.sent ? '' : (r.left <= 0 ? 'مكتمل الاستلام' : 'متبقي بالمطبعة'); });
    return rows;
  }
  needWrite(u);
  if (m === 'DELETE' && id) { await C.db().query('DELETE FROM outs WHERE id=?', [id]); return { ok: true }; }
  const o = { date: isDate(body.date) ? body.date : null, cut_code: str(body.cut_code, 60, 'رقم أمر القص', true), part: str(body.part, 160), party: str(body.party, 120), sent: Math.round(num0(body.sent, 'الكمية المرسلة')), received: Math.round(num0(body.received, 'الكمية المستلمة')), notes: str(body.notes, 255) };
  if (o.received > o.sent) throw bad('الكمية المستلمة أكبر من المرسلة');
  const k = Object.keys(o);
  if (m === 'POST') { const [r] = await C.db().query('INSERT INTO outs(' + k.join(',') + ') VALUES(' + k.map(() => '?').join(',') + ')', k.map(x => o[x])); return { id: r.insertId }; }
  if (m === 'PUT' && id) { await C.db().query('UPDATE outs SET ' + k.map(x => x + '=?').join(',') + ' WHERE id=?', [...k.map(x => o[x]), id]); return { ok: true }; }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---- client accounts ----
async function accounts(q) {
  const cl = await Q('SELECT id,code,name FROM clients ORDER BY name');
  const o = await Q('SELECT client_id, SUM(CASE WHEN COALESCE(s_2xl,s_xl,s_l,s_m,s_s,s_xs) IS NULL THEN COALESCE(total_pcs,0) ELSE COALESCE(s_2xl,0)+COALESCE(s_xl,0)+COALESCE(s_l,0)+COALESCE(s_m,0)+COALESCE(s_s,0)+COALESCE(s_xs,0) END) pcs, SUM((CASE WHEN COALESCE(s_2xl,s_xl,s_l,s_m,s_s,s_xs) IS NULL THEN COALESCE(total_pcs,0) ELSE COALESCE(s_2xl,0)+COALESCE(s_xl,0)+COALESCE(s_l,0)+COALESCE(s_m,0)+COALESCE(s_s,0)+COALESCE(s_xs,0) END)*COALESCE(unit_cost,0)) due, SUM(delivered) deliv, COUNT(DISTINCT code) orders FROM cut_orders GROUP BY client_id');
  const p = await Q('SELECT client_id, SUM(amount) paid, COUNT(*) n FROM payments GROUP BY client_id');
  const om = {}, pm = {}; o.forEach(x => om[x.client_id] = x); p.forEach(x => pm[x.client_id] = x);
  return cl.map(c => { const a = om[c.id] || {}, b = pm[c.id] || {}; const due = r2(a.due), paid = r2(b.paid); return { client_id: c.id, name: c.name, orders: +a.orders || 0, pieces: +a.pcs || 0, delivered: +a.deliv || 0, due, paid, balance: r2(due - paid) }; })
    .filter(x => x.orders || x.paid || q.all);
}
async function statement(q) {
  const id = +q.client_id; if (!id) throw bad('اختر العميل');
  const [cl] = await Q('SELECT id,code,name,phone FROM clients WHERE id=?', [id]); if (!cl) throw new HttpError(404, 'عميل غير موجود');
  const pays = await Q('SELECT id,doc_no,date,amount,method,notes FROM payments WHERE client_id=? ORDER BY date,id', [id]);
  const ords = await ordList({ client_id: id });
  const due = r2(ords.reduce((a, r) => a + r.cost_total, 0)); let cum = 0;
  const rows = pays.map(p => { cum = r2(cum + nn(p.amount)); return { ...p, cum, after: r2(due - cum) }; });
  return { client: cl, due, paid: cum, balance: r2(due - cum), pieces: ords.reduce((a, r) => a + r.total, 0), payments: rows, orders: ords.map(r => ({ code: r.code, model_name: r.model_name, color: r.color, total: r.total, unit_cost: r.unit_cost, cost_total: r.cost_total, delivered: r.delivered })) };
}

// ---- employees / attendance / payroll (from the attendance & payroll workbook) ----
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return ym + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };
const ymOk = (ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym || ''));
async function empApi(req, u, id, body) {
  const m = req.method;
  if (m === 'GET') return Q('SELECT * FROM employees ORDER BY id');
  needWrite(u);
  if (m === 'DELETE' && id) { await C.db().query('DELETE FROM attendance WHERE emp_id=?', [id]); await C.db().query('DELETE FROM payroll_inputs WHERE emp_id=?', [id]); await C.db().query('DELETE FROM employees WHERE id=?', [id]); return { ok: true }; }
  const o = { code: str(body.code, 30, 'كود الموظف', true), name: str(body.name, 120, 'اسم الموظف', true), job: str(body.job, 80), salary: r2(num0(body.salary, 'الراتب')), active: body.active === 0 || body.active === '0' ? 0 : 1 };
  const k = Object.keys(o);
  if (m === 'POST') { const [r] = await C.db().query('INSERT INTO employees(' + k.join(',') + ') VALUES(' + k.map(() => '?').join(',') + ')', k.map(x => o[x])); await C.audit(u, 'create', 'employee', r.insertId, o.name); return { id: r.insertId }; }
  if (m === 'PUT' && id) { await C.db().query('UPDATE employees SET ' + k.map(x => x + '=?').join(',') + ' WHERE id=?', [...k.map(x => o[x]), id]); return { ok: true }; }
  throw new HttpError(405, 'طريقة غير مدعومة');
}
async function attApi(req, u, body, q) {
  const m = req.method;
  if (m === 'GET') {
    if (!ymOk(q.ym)) throw bad('الشهر غير صحيح');
    const emps = await Q('SELECT id,code,name,job,salary FROM employees WHERE active=1 ORDER BY id');
    const rows = await Q('SELECT emp_id, date, status FROM attendance WHERE date>=? AND date<=?', [q.ym + '-01', q.ym + '-31'].map((d, i) => i ? lastDay(q.ym) : d));
    const map = {}; rows.forEach(r => (map[r.emp_id] = map[r.emp_id] || {})[String(r.date).slice(8, 10)] = r.status);
    return emps.map(e => ({ ...e, days: map[e.id] || {} }));
  }
  needWrite(u);
  // body: {emp_id, date, status} status: حضور | غياب | '' (clear)
  if (!body.emp_id || !isDate(body.date)) throw bad('بيانات غير صحيحة');
  if (!body.status) await C.db().query('DELETE FROM attendance WHERE emp_id=? AND date=?', [+body.emp_id, body.date]);
  else { if (!['حضور', 'غياب'].includes(body.status)) throw bad('الحالة غير صحيحة'); await C.db().query('INSERT INTO attendance(emp_id,date,status) VALUES(?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)', [+body.emp_id, body.date, body.status]); }
  return { ok: true };
}
async function payrollApi(req, u, body, q) {
  const m = req.method;
  if (!ymOk(q.ym || body.ym)) throw bad('الشهر غير صحيح');
  const ym = q.ym || body.ym;
  if (m === 'POST') {
    needWrite(u); if (!body.emp_id) throw bad('اختر الموظف');
    const v = [+body.emp_id, ym, num0(body.ot_hours, 'الساعات الإضافية'), Math.round(num0(body.fridays, 'عدد الجمع')), r2(num0(body.advances, 'السلف')), r2(num0(body.deduction, 'الخصم'))];
    await C.db().query('INSERT INTO payroll_inputs(emp_id,ym,ot_hours,fridays,advances,deduction) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ot_hours=VALUES(ot_hours),fridays=VALUES(fridays),advances=VALUES(advances),deduction=VALUES(deduction)', v);
    return { ok: true };
  }
  const st = await C.getSettings();
  const dim = nn(st.pay_days_in_month) || 30, hpd = nn(st.pay_hours_per_day) || 9, otx = nn(st.pay_ot_mult) || 2, frx = nn(st.pay_friday_mult) || 1.5;
  const emps = await Q('SELECT id,code,name,job,salary FROM employees WHERE active=1 ORDER BY id');
  const att = await Q("SELECT emp_id, SUM(status='حضور') p, SUM(status='غياب') a FROM attendance WHERE date>=? AND date<=? GROUP BY emp_id", [ym + '-01', lastDay(ym)]);
  const inp = await Q('SELECT * FROM payroll_inputs WHERE ym=?', [ym]);
  const am = {}, im = {}; att.forEach(x => am[x.emp_id] = x); inp.forEach(x => im[x.emp_id] = x);
  return { ym, params: { days_in_month: dim, hours_per_day: hpd, ot_mult: otx, friday_mult: frx }, rows: emps.map(e => {
    const a = am[e.id] || {}, i = im[e.id] || {}; const present = +a.p || 0, absent = +a.a || 0;
    const daily = nn(e.salary) / dim, hour = daily / hpd;
    const fri = r2(daily * (i.fridays || 0) * frx), ot = r2(nn(i.ot_hours) * hour * otx);
    const earned = r2(present * daily), gross = r2(earned + ot + fri);
    const dbl = String(st.pay_absence_double == null ? '1' : st.pay_absence_double) !== '0';
    const ded = r2(nn(i.advances) + nn(i.deduction) + (dbl ? daily * absent : 0)), net = r2(gross - ded);
    return { emp_id: e.id, code: e.code, name: e.name, job: e.job, salary: nn(e.salary), present, absent, daily: r2(daily), hour: r2(hour), ot_hours: nn(i.ot_hours), fridays: +i.fridays || 0, ot_value: ot, friday_value: fri, earned, gross, advances: nn(i.advances), deduction: nn(i.deduction), absence_value: r2(daily * absent), total_deductions: ded, net, absence_double: dbl };
  }) };
}

async function wbApi(head, req, u, id, body, q, parts) {
  { const r2x = await require('./wb2').api(head, req, u, id, body, q, parts); if (r2x !== undefined) return r2x; }
  { const rg = await require('./acct').api(head, req, u, id, body, q, parts); if (rg !== undefined) return rg; }
  { const ri = await require('./inv').api(head, req, u, id, body, q, parts); if (ri !== undefined) return ri; }
  if (head === 'store') return storeApi(req, u, id, body, q, parts[2] === 'transfer' ? 'transfer' : (parts[1] === 'transfer' ? 'transfer' : null));
  if (head === 'store-transfer') return storeApi(req, u, id, body, q, 'transfer');
  if (head === 'orders') return ordApi(req, u, id, body, q);
  if (head === 'outs') return outsApi(req, u, id, body);
  if (head === 'employees') return empApi(req, u, id, body);
  if (head === 'attendance') return attApi(req, u, body, q);
  if (head === 'payroll') return payrollApi(req, u, body, q);
  if (head === 'accounts') return accounts(q);
  if (head === 'acct-statement') return statement(q);
  return undefined;
}
module.exports = { migrate, wbApi, ordList, storeList, accounts, lastDay, ymOk };
