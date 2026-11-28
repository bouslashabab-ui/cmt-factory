'use strict';
/* Inventory: items, warehouses, movements, stock counts, weighted-average valuation */
const C = require('./core');
const { bad, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 1000) / 1000;
const SCH = [
`CREATE TABLE IF NOT EXISTS inv_items(id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, unit VARCHAR(20) NOT NULL DEFAULT 'قطعة', min_qty DECIMAL(14,3) NOT NULL DEFAULT 0, active TINYINT NOT NULL DEFAULT 1)`,
`CREATE TABLE IF NOT EXISTS inv_wh(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE)`,
`CREATE TABLE IF NOT EXISTS inv_moves(id INT AUTO_INCREMENT PRIMARY KEY, date DATE NOT NULL, item_id INT NOT NULL, wh_id INT NOT NULL, kind VARCHAR(12) NOT NULL, qty DECIMAL(14,3) NOT NULL, unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0, ref VARCHAR(60), notes VARCHAR(255), grp VARCHAR(20), created_by INT, INDEX(item_id), INDEX(wh_id), INDEX(date))`];
let ready = false;
async function ensure() { if (!ready) { for (const s of SCH) await C.db().query(s); try { await C.db().query('ALTER TABLE inv_items ADD COLUMN sell_price DECIMAL(14,2) NULL'); } catch (e) { /* exists */ } ready = true; } const [[n]] = await C.db().query('SELECT COUNT(*) n FROM inv_wh'); if (!n.n) await C.db().query("INSERT INTO inv_wh(name) VALUES('المخزن الرئيسي')"); }
/* signed qty: in +, out -, adjust +/- stored signed, trin +, trout - */
const sign = (m) => (m.kind === 'out' || m.kind === 'trout') ? -m.qty : m.qty;
async function compute() {
  const moves = await Q('SELECT * FROM inv_moves ORDER BY date,id'); const st = {}; const wh = {}; const cards = {};
  for (const m of moves) {
    const s = st[m.item_id] || (st[m.item_id] = { qty: 0, val: 0 }); const q = sign(m); let uc = m.unit_cost, cost;
    if (m.kind === 'trin' || m.kind === 'trout') { cost = s.qty > 0 ? s.val / s.qty : uc; }
    else if (m.kind === 'in') { s.val = r2(s.val + q * uc); s.qty = r3(s.qty + q); cost = uc; }
    else if (q > 0) { s.val = r2(s.val + q * (s.qty > 0 ? s.val / s.qty : uc)); s.qty = r3(s.qty + q); cost = s.qty ? s.val / s.qty : uc; }
    else { const avg = s.qty > 0 ? s.val / s.qty : 0; s.val = r2(s.val + q * avg); s.qty = r3(s.qty + q); cost = avg; }
    const key = m.item_id + ':' + m.wh_id; wh[key] = r3((wh[key] || 0) + q);
    (cards[m.item_id] || (cards[m.item_id] = [])).push({ ...m, signed: q, cost: r2(cost), bal: s.qty, bal_val: s.val });
  }
  return { st, wh, cards };
}
async function api(head, req, u, id, body, q, parts) {
  if (head !== 'inv') return undefined; await ensure(); const sub = parts[1], m = req.method;
  const write = () => { if (u.role === 'viewer') throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
  if (sub === 'items') {
    if (m === 'GET') return Q('SELECT * FROM inv_items ORDER BY code');
    write();
    const iid = +parts[2] || 0;
    if (m === 'PUT' && iid) {
      const name = String(body.name || '').trim(); if (!name) throw bad('الاسم مطلوب');
      const mn = Number(body.min_qty || 0); if (!(mn >= 0)) throw bad('الحد الأدنى غير صحيح');
      const sp = Number(body.sell_price || 0); if (!(sp >= 0)) throw bad('سعر البيع غير صحيح');
      const act = body.active === 0 || body.active === '0' || body.active === false ? 0 : 1;
      await C.db().query('UPDATE inv_items SET name=?, unit=?, min_qty=?, sell_price=?, active=? WHERE id=?', [name.slice(0, 120), String(body.unit || 'قطعة').slice(0, 20), mn, sp, act, iid]);
      await C.audit(u, 'update', 'inv_item', iid, name); return { ok: true };
    }
    if (m === 'DELETE' && iid) {
      const [a] = await Q('SELECT COUNT(*) c FROM inv_moves WHERE item_id=?', [iid]);
      const [b] = await Q('SELECT COUNT(*) c FROM sales_invoice_lines WHERE item_id=?', [iid]);
      if (a.c || b.c) throw bad('لا يمكن حذف الصنف: عليه حركات مخزون أو فواتير. عدّله إلى غير نشط بدل الحذف');
      await C.db().query('DELETE FROM inv_items WHERE id=?', [iid]); await C.audit(u, 'delete', 'inv_item', iid); return { ok: true };
    }
    const code = String(body.code || '').trim(), name = String(body.name || '').trim(); if (!code || !name) throw bad('الكود والاسم مطلوبان');
    const mn = Number(body.min_qty || 0); if (!(mn >= 0)) throw bad('الحد الأدنى غير صحيح');
    const sp = Number(body.sell_price || 0); if (!(sp >= 0)) throw bad('سعر البيع غير صحيح');
    try { await C.db().query('INSERT INTO inv_items(code,name,unit,min_qty,sell_price) VALUES(?,?,?,?,?)', [code.slice(0, 30), name.slice(0, 120), String(body.unit || 'قطعة').slice(0, 20), mn, sp]); } catch (e) { throw bad('كود الصنف مكرر'); }
    await C.audit(u, 'create', 'inv_item', 0, code); return { ok: true };
  }
  if (sub === 'wh') {
    if (m === 'GET') return Q('SELECT * FROM inv_wh ORDER BY id');
    write();
    const wid = +parts[2] || 0;
    if (m === 'DELETE' && wid) {
      const [a] = await Q('SELECT COUNT(*) c FROM inv_moves WHERE wh_id=?', [wid]);
      const [b] = await Q('SELECT COUNT(*) c FROM sales_invoices WHERE wh_id=?', [wid]);
      if (a.c || b.c) throw bad('لا يمكن حذف المخزن: عليه حركات أو فواتير مسجلة');
      await C.db().query('DELETE FROM inv_wh WHERE id=?', [wid]); await C.audit(u, 'delete', 'inv_wh', wid); return { ok: true };
    }
    const n = String(body.name || '').trim(); if (!n) throw bad('اسم المخزن مطلوب'); try { await C.db().query('INSERT INTO inv_wh(name) VALUES(?)', [n.slice(0, 80)]); } catch (e) { throw bad('الاسم مكرر'); }
    await C.audit(u, 'create', 'inv_wh', 0, n); return { ok: true };
  }
  if (sub === 'stock') {
    const { st, wh } = await compute(); const items = await Q('SELECT * FROM inv_items ORDER BY code'); const whs = await Q('SELECT * FROM inv_wh ORDER BY id');
    const rows = items.map(i => { const s = st[i.id] || { qty: 0, val: 0 }; return { ...i, qty: s.qty, avg: s.qty > 0 ? r2(s.val / s.qty) : 0, value: s.val, low: s.qty <= i.min_qty && i.min_qty > 0, by_wh: whs.map(w => ({ wh_id: w.id, name: w.name, qty: wh[i.id + ':' + w.id] || 0 })) }; });
    return { rows, warehouses: whs, total_value: r2(rows.reduce((s, r) => s + r.value, 0)) };
  }
  if (sub === 'card') { const { cards } = await compute(); const it = (await Q('SELECT * FROM inv_items WHERE id=?', [+q.item]))[0]; if (!it) throw bad('اختر صنفًا'); const whs = await Q('SELECT * FROM inv_wh'); const wn = {}; whs.forEach(w => wn[w.id] = w.name); return { item: it, rows: (cards[it.id] || []).map(c => ({ ...c, wh: wn[c.wh_id] })) }; }
  if (sub === 'moves') {
    if (m === 'GET') return Q('SELECT v.*,i.code,i.name,w.name wh FROM inv_moves v JOIN inv_items i ON i.id=v.item_id JOIN inv_wh w ON w.id=v.wh_id ORDER BY v.date DESC,v.id DESC LIMIT 500');
    write(); if (m !== 'POST') throw new HttpError(405, 'غير مسموح'); if (!isDate(body.date)) throw bad('التاريخ غير صحيح');
    const gl = await C.getSettings(); const lb = String(gl.lock_before || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(lb) && body.date < lb) throw new HttpError(423, 'الفترة مقفلة قبل ' + lb);
    const item = +body.item_id, w = +body.wh_id, qty = Number(body.qty), kind = body.kind;
    if (!(await Q('SELECT id FROM inv_items WHERE id=?', [item])).length || !(await Q('SELECT id FROM inv_wh WHERE id=?', [w])).length) throw bad('الصنف أو المخزن غير موجود');
    if (!['in', 'out', 'transfer'].includes(kind) || !(qty > 0)) throw bad('الحركة أو الكمية غير صحيحة');
    const { st, wh } = await compute(); const have = wh[item + ':' + w] || 0;
    if (kind !== 'in' && have < qty) throw bad('الرصيد غير كافٍ في هذا المخزن: المتاح ' + have);
    const uc = kind === 'in' ? Number(body.unit_cost) : 0; if (kind === 'in' && !(uc >= 0)) throw bad('تكلفة الوحدة غير صحيحة');
    const ins = (k, wid, g, c) => C.db().query('INSERT INTO inv_moves(date,item_id,wh_id,kind,qty,unit_cost,ref,notes,grp,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)', [body.date, item, wid, k, qty, c, String(body.ref || '').slice(0, 60), String(body.notes || '').slice(0, 250), g, u.id]);
    if (kind === 'transfer') { const to = +body.to_wh; if (!to || to === w || !(await Q('SELECT id FROM inv_wh WHERE id=?', [to])).length) throw bad('اختر مخزنًا مختلفًا للتحويل'); const g = 'T' + Date.now(); await ins('trout', w, g, 0); await ins('trin', to, g, 0); }
    else { const [ir] = await ins(kind, w, null, uc); if (kind === 'in' && +body.supplier_id) { try { await C.db().query('UPDATE inv_moves SET supplier_id=? WHERE id=?', [+body.supplier_id, ir.insertId]); } catch (e) { /* column added by accounting module */ } } }
    await C.audit(u, 'create', 'inv_move', 0, kind); return { ok: true };
  }
  if (sub === 'count' && m === 'POST') { // stock count: counted vs system -> adjustment moves
    write(); if (!isDate(body.date)) throw bad('التاريخ غير صحيح'); const w = +body.wh_id; const { wh, st } = await compute(); let n = 0;
    for (const l of body.lines || []) { const it = +l.item_id, c = Number(l.counted); if (!it || !(c >= 0)) continue; const diff = r3(c - (wh[it + ':' + w] || 0)); if (!diff) continue;
      const s = st[it] || { qty: 0, val: 0 }; const avg = s.qty > 0 ? s.val / s.qty : 0;
      await C.db().query("INSERT INTO inv_moves(date,item_id,wh_id,kind,qty,unit_cost,ref,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)", [body.date, it, w, 'adjust', diff, r2(avg), 'جرد', 'فرق جرد', u.id]); n++; }
    return { adjusted: n };
  }
  throw new HttpError(404, 'غير موجود');
}
module.exports = { api, compute };
