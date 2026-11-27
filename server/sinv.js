'use strict';
/* Invoices: sales (cash, credit, return, quote/proforma) and purchases, with full GL posting.
   Item lines also drive inventory moves; per-move GL is posted here with source='invmove'
   so the acct autoPost sweep never double-posts them. */
const C = require('./core');
const ACC = require('./acct');
const INV = require('./inv');
const { bad, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

const SCH = [
  `CREATE TABLE IF NOT EXISTS branches(id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, address VARCHAR(255), phone VARCHAR(40), active TINYINT NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sales_invoices(id INT AUTO_INCREMENT PRIMARY KEY, no VARCHAR(30) NOT NULL UNIQUE, type VARCHAR(10) NOT NULL, date DATE NOT NULL, client_id INT NULL, supplier_id INT NULL, branch_id INT NULL, settle VARCHAR(8) NOT NULL DEFAULT 'cash', wh_id INT NULL, ref_id INT NULL, status VARCHAR(12) NOT NULL DEFAULT 'posted', base DECIMAL(16,2) NOT NULL, discount DECIMAL(16,2) NOT NULL DEFAULT 0, vat_rate DECIMAL(6,2) NOT NULL DEFAULT 0, vat DECIMAL(16,2) NOT NULL DEFAULT 0, total DECIMAL(16,2) NOT NULL, entry_id INT NULL, notes VARCHAR(255), created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX(type), INDEX(date), INDEX(client_id), INDEX(supplier_id))`,
  `CREATE TABLE IF NOT EXISTS sales_invoice_lines(id INT AUTO_INCREMENT PRIMARY KEY, invoice_id INT NOT NULL, item_id INT NULL, description VARCHAR(255) NOT NULL, qty DECIMAL(14,3) NOT NULL, price DECIMAL(16,2) NOT NULL, disc DECIMAL(6,2) NOT NULL DEFAULT 0, total DECIMAL(16,2) NOT NULL, INDEX(invoice_id))`];
const EXTRA_ACC = [['4200', 'مردودات ومسموحات المبيعات', 'revenue'], ['2500', 'ضريبة القيمة المضافة - مخرجات', 'liability'], ['1450', 'ضريبة القيمة المضافة - مدخلات', 'asset']];
const TYPES = ['cash', 'credit', 'return', 'quote', 'purchase'];
const PREFIX = { cash: 'CSH', credit: 'CRD', return: 'RTN', quote: 'QT', purchase: 'PUR' };
let ready = false;
async function ensure() {
  if (ready) return;
  for (const s of SCH) await C.db().query(s);
  for (const a of EXTRA_ACC) await C.db().query('INSERT IGNORE INTO gl_accounts(code,name,type) VALUES(?,?,?)', a);
  try { await C.db().query('ALTER TABLE inv_moves ADD COLUMN reversed_by INT NULL'); } catch (e) { /* exists */ }
  ready = true;
}
const accId = async (code) => { const [a] = await Q('SELECT id FROM gl_accounts WHERE code=?', [code]); if (!a) throw bad('حساب ' + code + ' غير موجود في الدليل'); return a.id; };

/* Validate and normalize an invoice payload. Shared by create and update. */
async function prepare(body) {
  const type = String(body.type || ''); if (!TYPES.includes(type)) throw bad('نوع الفاتورة غير صحيح');
  if (!isDate(body.date)) throw bad('التاريخ غير صحيح'); await ACC.lockGuard(body.date);
  const isSale = type !== 'purchase';
  let client_id = null, supplier_id = null;
  if (isSale) { client_id = +body.client_id || null; if (!client_id || !(await Q('SELECT id FROM clients WHERE id=?', [client_id])).length) throw bad('اختر العميل'); }
  else { supplier_id = +body.supplier_id || null; if (!supplier_id || !(await Q('SELECT id FROM suppliers WHERE id=?', [supplier_id])).length) throw bad('اختر المورد'); }
  const settle = body.settle === 'credit' ? 'credit' : 'cash';
  const branch_id = +body.branch_id || null;
  if (branch_id && !(await Q('SELECT id FROM branches WHERE id=? AND active=1', [branch_id])).length) throw bad('الفرع غير موجود');
  const wh_id = +body.wh_id || null;
  const vat_rate = Math.max(0, Math.min(100, Number(body.vat_rate || 0)));
  const linesIn = Array.isArray(body.lines) ? body.lines : [];
  const lines = [];
  for (const l of linesIn) {
    const desc = String(l.description || '').trim();
    const item_id = +l.item_id || null;
    const qty = Number(l.qty), price = Number(l.price), disc = Math.max(0, Math.min(100, Number(l.disc || 0)));
    if (!desc && !item_id) continue;
    if (!(qty > 0) || !(price >= 0)) throw bad('الكمية أو السعر غير صحيح في سطر: ' + (desc || item_id));
    if (item_id && !(await Q('SELECT id FROM inv_items WHERE id=?', [item_id])).length) throw bad('صنف غير موجود في أحد السطور');
    lines.push({ item_id, description: desc || ('صنف #' + item_id), qty, price: r2(price), disc, total: r2(qty * price * (1 - disc / 100)) });
  }
  if (!lines.length) throw bad('أضف سطرًا واحدًا على الأقل');
  if (lines.some(l => l.item_id) && !wh_id) throw bad('اختر المخزن لأن الفاتورة تحتوي أصنافًا');
  if (wh_id && !(await Q('SELECT id FROM inv_wh WHERE id=?', [wh_id])).length) throw bad('المخزن غير موجود');
  const base = r2(lines.reduce((s, l) => s + l.total, 0));
  const discount = r2(lines.reduce((s, l) => s + l.qty * l.price * (l.disc / 100), 0));
  const vat = r2(base * vat_rate / 100), total = r2(base + vat);
  if (!(total > 0)) throw bad('إجمالي الفاتورة يجب أن يكون أكبر من صفر');
  return { type, date: body.date, isSale, client_id, supplier_id, settle, branch_id, wh_id, vat_rate, lines, base, discount, vat, total, notes: String(body.notes || '').slice(0, 250) };
}

/* Post GL entries and inventory moves for an invoice. Shared by create and update.
   Returns the header GL entry id (or null). */
async function effects(conn, u, invId, no, d) {
  const { type, date, isSale, client_id, supplier_id, settle, wh_id, lines, base, vat, total } = d;
  const [cash, ar, ap, rev, ret, invA, vin, vout, exp] = await Promise.all(['1100', '1200', '2100', '4100', '4200', '1300', '1450', '2500', '5200'].map(accId));
  let entry_id = null;
  if (type === 'quote') { /* no GL for proforma */ }
  else if (isSale) {
    const ls = [];
    if (type === 'return') {
      ls.push({ account_id: ret, debit: base });
      if (vat > 0) ls.push({ account_id: vout, debit: vat });
      ls.push(settle === 'credit' ? { account_id: ar, credit: total, client_id } : { account_id: cash, credit: total });
    } else {
      ls.push(type === 'credit' ? { account_id: ar, debit: total, client_id } : { account_id: cash, debit: total });
      ls.push({ account_id: rev, credit: base });
      if (vat > 0) ls.push({ account_id: vout, credit: vat });
    }
    const r = await ACC.post(conn, date, (type === 'return' ? 'مرتجع مبيعات ' : 'فاتورة مبيعات ') + no, 'normal', ls, { source: 'sinv', source_id: invId, uid: u.id });
    entry_id = r.id;
    if (lines.some(l => l.item_id)) {
      const cards = (await INV.compute()).cards;
      for (const l of lines) {
        if (!l.item_id) continue;
        if (type === 'return') {
          const card = cards[l.item_id] || []; let q = 0, v = 0; card.forEach(c => { q += c.signed; v += c.signed * c.cost; });
          const avg = q > 0 ? r2(v / q) : 0;
          const [mr] = await conn.query('INSERT INTO inv_moves(date,item_id,wh_id,kind,qty,unit_cost,ref,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)', [date, l.item_id, wh_id, 'in', l.qty, avg, no, 'مرتجع مبيعات', u.id]);
          if (avg > 0) await ACC.post(conn, date, 'إرجاع مخزون مرتجع ' + no, 'normal', [{ account_id: invA, debit: r2(avg * l.qty) }, { account_id: exp, credit: r2(avg * l.qty) }], { source: 'invmove', source_id: mr.insertId, uid: u.id });
        } else {
          await conn.query('INSERT INTO inv_moves(date,item_id,wh_id,kind,qty,unit_cost,ref,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)', [date, l.item_id, wh_id, 'out', l.qty, 0, no, 'فاتورة مبيعات', u.id]);
        }
      }
    }
  } else {
    const itemLines = lines.filter(l => l.item_id), svcBase = r2(lines.filter(l => !l.item_id).reduce((s, l) => s + l.total, 0));
    for (const l of itemLines) {
      const [mr] = await conn.query('INSERT INTO inv_moves(date,item_id,wh_id,kind,qty,unit_cost,ref,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)', [date, l.item_id, wh_id, 'in', l.qty, l.price, no, 'فاتورة شراء', u.id]);
      const cr = settle === 'credit' ? { account_id: ap, credit: l.total, supplier_id } : { account_id: cash, credit: l.total };
      await ACC.post(conn, date, 'توريد مخزون فاتورة ' + no, 'normal', [{ account_id: invA, debit: l.total }, cr], { source: 'invmove', source_id: mr.insertId, uid: u.id });
    }
    if (svcBase > 0 || vat > 0) {
      const ls = [];
      if (svcBase > 0) ls.push({ account_id: exp, debit: svcBase });
      if (vat > 0) ls.push({ account_id: vin, debit: vat });
      const amt = r2(svcBase + vat);
      ls.push(settle === 'credit' ? { account_id: ap, credit: amt, supplier_id } : { account_id: cash, credit: amt });
      const r = await ACC.post(conn, date, 'فاتورة شراء ' + no, 'normal', ls, { source: 'sinv', source_id: invId, uid: u.id });
      entry_id = r.id;
    }
  }
  return entry_id;
}

/* Reverse every accounting and stock effect of a posted invoice, dated today.
   Each original move gets a counter-move; every GL entry (header + per-move,
   posting it first if the sweep has not run yet) gets an exact reversal entry.
   Reversal entries carry source='invmove'/source_id of the counter-move so the
   autoPost sweep never double-posts them. */
async function reverseInvoice(conn, u, inv) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  await ACC.lockGuard(today);
  const [invA, ap, exp] = await Promise.all(['1300', '2100', '5200'].map(accId));
  if (inv.entry_id) {
    const [ls] = await conn.query('SELECT account_id,client_id,supplier_id,debit,credit FROM gl_lines WHERE entry_id=?', [inv.entry_id]);
    if (ls.length) await ACC.post(conn, today, 'عكس قيد فاتورة ' + inv.no, 'normal', ls.map(l => ({ account_id: l.account_id, client_id: l.client_id, supplier_id: l.supplier_id, debit: l.credit, credit: l.debit })), { source: 'sinv', source_id: inv.id, reversed_of: inv.entry_id, uid: u.id });
  }
  const [moves] = await conn.query("SELECT * FROM inv_moves WHERE ref=? AND notes NOT LIKE 'عكس%' AND kind IN ('in','out') AND reversed_by IS NULL", [inv.no]);
  if (!moves.length) return;
  const cards = (await INV.compute()).cards;
  const byId = {}; for (const k of Object.keys(cards)) for (const mv of cards[k]) byId[mv.id] = mv;
  for (const m of moves) {
    const [gl] = await conn.query("SELECT id FROM gl_entries WHERE source='invmove' AND source_id=?", [m.id]);
    const card = byId[m.id];
    const cost = m.kind === 'in' ? r2(m.unit_cost) : r2(card ? card.cost : 0);
    const v = r2(Number(m.qty) * cost);
    if (!gl.length && v > 0) {
      // the sweep has not posted this move yet: post it now so its reversal is exact
      if (m.kind === 'in') await ACC.post(conn, m.date, 'توريد مخزون ' + inv.no, 'normal', [{ account_id: invA, debit: v }, { account_id: ap, credit: v }], { source: 'invmove', source_id: m.id, uid: u.id });
      else await ACC.post(conn, m.date, 'صرف مخزون ' + inv.no, 'normal', [{ account_id: exp, debit: v }, { account_id: invA, credit: v }], { source: 'invmove', source_id: m.id, uid: u.id });
    }
    const [eidRow] = await conn.query("SELECT id FROM gl_entries WHERE source='invmove' AND source_id=?", [m.id]);
    const flipKind = m.kind === 'in' ? 'out' : 'in';
    const [cm] = await conn.query('INSERT INTO inv_moves(date,item_id,wh_id,kind,qty,unit_cost,ref,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)', [today, m.item_id, m.wh_id, flipKind, m.qty, cost, inv.no, 'عكس فاتورة ' + inv.no, u.id]);
    await conn.query('UPDATE inv_moves SET reversed_by=? WHERE id=?', [cm.insertId, m.id]);
    if (eidRow.length && v > 0) {
      const [ls] = await conn.query('SELECT account_id,client_id,supplier_id,debit,credit FROM gl_lines WHERE entry_id=?', [eidRow[0].id]);
      await ACC.post(conn, today, 'عكس حركة مخزون فاتورة ' + inv.no, 'normal', ls.map(l => ({ account_id: l.account_id, client_id: l.client_id, supplier_id: l.supplier_id, debit: l.credit, credit: l.debit })), { source: 'invmove', source_id: cm.insertId, reversed_of: eidRow[0].id, uid: u.id });
    }
  }
}

async function create(u, body) {
  const d = await prepare(body);
  const conn = await C.db().getConnection();
  try {
    await conn.beginTransaction();
    const [[nn]] = await conn.query('SELECT COALESCE(MAX(CAST(SUBSTRING(no,?) AS UNSIGNED)),0)+1 n FROM sales_invoices WHERE type=?', [PREFIX[d.type].length + 2, d.type]);
    const no = PREFIX[d.type] + '-' + String(nn.n).padStart(5, '0');
    const [ir] = await conn.query('INSERT INTO sales_invoices(no,type,date,client_id,supplier_id,branch_id,settle,wh_id,ref_id,status,base,discount,vat_rate,vat,total,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [no, d.type, d.date, d.client_id, d.supplier_id, d.branch_id, d.settle, d.wh_id, +body.ref_id || null, d.type === 'quote' ? 'open' : 'posted', d.base, d.discount, d.vat_rate, d.vat, d.total, d.notes, u.id]);
    const invId = ir.insertId;
    for (const l of d.lines) await conn.query('INSERT INTO sales_invoice_lines(invoice_id,item_id,description,qty,price,disc,total) VALUES(?,?,?,?,?,?,?)', [invId, l.item_id, l.description.slice(0, 250), l.qty, l.price, l.disc, l.total]);
    const entry_id = await effects(conn, u, invId, no, d);
    if (entry_id) await conn.query('UPDATE sales_invoices SET entry_id=? WHERE id=?', [entry_id, invId]);
    if (d.type !== 'quote' && +body.ref_id) await conn.query("UPDATE sales_invoices SET status='converted' WHERE id=? AND type='quote'", [+body.ref_id]);
    await conn.commit();
    await C.audit(u, 'create', 'sales_invoice', invId, no);
    return { ok: true, id: invId, no, total: d.total };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

/* Edit a saved invoice: reverse every old effect, then repost with the new data.
   The number and type never change. Quotes (open) edit without any reversal. */
async function update(u, body) {
  const id = +body.id; if (!id) throw bad('الفاتورة غير محددة');
  const [inv] = await Q('SELECT * FROM sales_invoices WHERE id=?', [id]);
  if (!inv) throw new HttpError(404, 'الفاتورة غير موجودة');
  if (inv.status === 'canceled') throw bad('الفاتورة ملغاة ولا يمكن تعديلها');
  if (inv.type === 'quote' && inv.status !== 'open') throw bad('عرض السعر محوَّل ولا يمكن تعديله');
  const d = await prepare(Object.assign({}, body, { type: inv.type }));
  const conn = await C.db().getConnection();
  try {
    await conn.beginTransaction();
    if (inv.type !== 'quote') await reverseInvoice(conn, u, inv);
    await conn.query('UPDATE sales_invoices SET date=?,client_id=?,supplier_id=?,branch_id=?,settle=?,wh_id=?,base=?,discount=?,vat_rate=?,vat=?,total=?,notes=? WHERE id=?',
      [d.date, d.client_id, d.supplier_id, d.branch_id, d.settle, d.wh_id, d.base, d.discount, d.vat_rate, d.vat, d.total, d.notes, id]);
    await conn.query('DELETE FROM sales_invoice_lines WHERE invoice_id=?', [id]);
    for (const l of d.lines) await conn.query('INSERT INTO sales_invoice_lines(invoice_id,item_id,description,qty,price,disc,total) VALUES(?,?,?,?,?,?,?)', [id, l.item_id, l.description.slice(0, 250), l.qty, l.price, l.disc, l.total]);
    const entry_id = await effects(conn, u, id, inv.no, d);
    await conn.query('UPDATE sales_invoices SET entry_id=? WHERE id=?', [entry_id, id]);
    await conn.commit();
    await C.audit(u, 'edit', 'sales_invoice', id, inv.no + ' إجمالي ' + d.total);
    return { ok: true, id, no: inv.no, total: d.total };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

/* Cancel (delete) an invoice: full accounting + stock reversal, audit-kept. */
async function cancel(u, body) {
  const id = +body.id; if (!id) throw bad('الفاتورة غير محددة');
  const [inv] = await Q('SELECT * FROM sales_invoices WHERE id=?', [id]);
  if (!inv) throw new HttpError(404, 'الفاتورة غير موجودة');
  if (inv.status === 'canceled') throw bad('الفاتورة ملغاة بالفعل');
  if (inv.type === 'quote' && inv.status !== 'open') throw bad('عرض السعر محوَّل — ألغِ الفاتورة الناتجة عنه أولًا');
  const conn = await C.db().getConnection();
  try {
    await conn.beginTransaction();
    if (inv.type !== 'quote') await reverseInvoice(conn, u, inv);
    await conn.query("UPDATE sales_invoices SET status='canceled' WHERE id=?", [id]);
    await conn.commit();
    await C.audit(u, 'cancel', 'sales_invoice', id, inv.no);
    return { ok: true, id, no: inv.no };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

async function convert(u, body) {
  const [qv] = await Q("SELECT * FROM sales_invoices WHERE id=? AND type='quote'", [+body.id]);
  if (!qv) throw new HttpError(404, 'عرض السعر غير موجود');
  if (qv.status !== 'open') throw bad('عرض السعر محوّل بالفعل');
  const lines = await Q('SELECT item_id,description,qty,price,disc FROM sales_invoice_lines WHERE invoice_id=?', [qv.id]);
  return create(u, { type: body.type === 'cash' ? 'cash' : 'credit', date: isDate(body.date) ? body.date : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }), client_id: qv.client_id, branch_id: qv.branch_id, wh_id: qv.wh_id, vat_rate: qv.vat_rate, notes: qv.notes, ref_id: qv.id, lines });
}

async function api(head, req, u, id, body, q, parts) {
  if (head !== 'sinv') return undefined; await ensure(); const sub = parts[1], m = req.method;
  const write = () => { if (u.role === 'viewer') throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
  if (sub === 'meta' && m === 'GET') {
    const [clients, suppliers, items, whs, brs] = await Promise.all([
      Q('SELECT id,code,name FROM clients WHERE active=1 ORDER BY name'),
      Q('SELECT id,code,name FROM suppliers WHERE active=1 ORDER BY name'),
      Q('SELECT id,code,name,unit,sell_price FROM inv_items WHERE active=1 ORDER BY code'),
      Q('SELECT id,name FROM inv_wh ORDER BY id'),
      Q('SELECT id,code,name FROM branches WHERE active=1 ORDER BY code')]);
    return { clients, suppliers, items, warehouses: whs, branches: brs, prefixes: PREFIX };
  }
  if (sub === 'list' && m === 'GET') {
    const w = ['1=1'], p = [];
    if (q.type && TYPES.includes(q.type)) { w.push('v.type=?'); p.push(q.type); }
    if (q.q) { w.push('(v.no LIKE ? OR c.name LIKE ? OR s.name LIKE ?)'); const like = '%' + q.q + '%'; p.push(like, like, like); }
    return Q('SELECT v.id,v.no,v.type,v.date,v.total,v.status,v.settle,c.name client,s.name supplier,b.name branch FROM sales_invoices v LEFT JOIN clients c ON c.id=v.client_id LEFT JOIN suppliers s ON s.id=v.supplier_id LEFT JOIN branches b ON b.id=v.branch_id WHERE ' + w.join(' AND ') + ' ORDER BY v.id DESC LIMIT 300', p);
  }
  if (sub === 'one' && m === 'GET') {
    const [v] = await Q('SELECT v.*,c.name client,s.name supplier,b.name branch,w.name wh FROM sales_invoices v LEFT JOIN clients c ON c.id=v.client_id LEFT JOIN suppliers s ON s.id=v.supplier_id LEFT JOIN branches b ON b.id=v.branch_id LEFT JOIN inv_wh w ON w.id=v.wh_id WHERE v.id=?', [+q.id]);
    if (!v) throw new HttpError(404, 'الفاتورة غير موجودة');
    const lines = await Q('SELECT l.*,i.code item_code,i.name item_name,i.unit FROM sales_invoice_lines l LEFT JOIN inv_items i ON i.id=l.item_id WHERE l.invoice_id=? ORDER BY l.id', [v.id]);
    let entry = null;
    if (v.entry_id) { const [e] = await Q('SELECT e.id,e.no,e.date FROM gl_entries e WHERE e.id=?', [v.entry_id]); entry = e || null; }
    return { invoice: v, lines, entry };
  }
  if (sub === 'create') { write(); if (m !== 'POST') throw new HttpError(405, 'غير مسموح'); return create(u, body); }
  if (sub === 'update') { write(); if (m !== 'POST') throw new HttpError(405, 'غير مسموح'); return update(u, body); }
  if (sub === 'cancel') { write(); if (m !== 'POST') throw new HttpError(405, 'غير مسموح'); return cancel(u, body); }
  if (sub === 'convert') { write(); if (m !== 'POST') throw new HttpError(405, 'غير مسموح'); return convert(u, body); }
  if (sub === 'branches') {
    if (m === 'GET') return Q('SELECT b.*, (SELECT COUNT(*) FROM sales_invoices v WHERE v.branch_id=b.id) invoices FROM branches b ORDER BY b.code');
    write();
    const code = String(body.code || '').trim(), name = String(body.name || '').trim();
    if (!/^[A-Za-z0-9-]{1,30}$/.test(code) || !name) throw bad('كود واسم الفرع مطلوبان (الكود حروف/أرقام إنجليزية)');
    try { await C.db().query('INSERT INTO branches(code,name,address,phone) VALUES(?,?,?,?)', [code, name.slice(0, 120), String(body.address || '').slice(0, 250), String(body.phone || '').slice(0, 40)]); }
    catch (e) { throw bad('كود الفرع مكرر'); }
    await C.audit(u, 'create', 'branch', 0, code); return { ok: true };
  }
  if (sub === 'branch-toggle') { write(); if (m !== 'POST') throw new HttpError(405, 'غير مسموح'); await C.db().query('UPDATE branches SET active=1-active WHERE id=?', [+body.id]); return { ok: true }; }
  return undefined;
}
module.exports = { api, ensure };
