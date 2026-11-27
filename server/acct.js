'use strict';
/* General ledger: chart of accounts, journal, ledger, trial balance, adjusting/closing entries, statements. */
const C = require('./core');
const { bad, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const SCH = [
`CREATE TABLE IF NOT EXISTS gl_accounts(id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, type VARCHAR(12) NOT NULL, active TINYINT NOT NULL DEFAULT 1)`,
`CREATE TABLE IF NOT EXISTS gl_entries(id INT AUTO_INCREMENT PRIMARY KEY, no INT NOT NULL, date DATE NOT NULL, memo VARCHAR(255), kind VARCHAR(12) NOT NULL DEFAULT 'normal', source VARCHAR(20), source_id INT, reversed_of INT NULL, created_by INT, INDEX(date), INDEX(source,source_id))`,
`CREATE TABLE IF NOT EXISTS gl_lines(id INT AUTO_INCREMENT PRIMARY KEY, entry_id INT NOT NULL, account_id INT NOT NULL, debit DECIMAL(16,2) NOT NULL DEFAULT 0, credit DECIMAL(16,2) NOT NULL DEFAULT 0, INDEX(entry_id), INDEX(account_id))`,
`CREATE TABLE IF NOT EXISTS suppliers(id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL, phone VARCHAR(40), notes VARCHAR(255), active TINYINT NOT NULL DEFAULT 1)`];
const CHART = [['1100', 'الصندوق (نقدية)', 'asset'], ['1110', 'البنك', 'asset'], ['1200', 'العملاء (مدينون)', 'asset'], ['1300', 'مخزون مستلزمات', 'asset'], ['1500', 'الأصول الثابتة (ماكينات)', 'asset'], ['1590', 'مجمع الإهلاك', 'asset'],
['2100', 'الموردون (دائنون)', 'liability'], ['2200', 'مصروفات مستحقة', 'liability'], ['2300', 'رواتب مستحقة', 'liability'], ['2400', 'سلف وأمانات عملاء', 'liability'],
['3100', 'رأس المال', 'equity'], ['3200', 'جاري المالك (مسحوبات)', 'equity'], ['3300', 'أرباح مرحّلة', 'equity'],
['4100', 'إيراد خدمة التصنيع', 'revenue'], ['4200', 'إيرادات أخرى', 'revenue'],
['5100', 'أجور مباشرة', 'expense'], ['5200', 'مصروفات تشغيل عامة', 'expense'], ['5300', 'إيجار', 'expense'], ['5400', 'كهرباء ومياه', 'expense'], ['5500', 'صيانة', 'expense'], ['5600', 'مصروف إهلاك', 'expense'], ['5900', 'مصروفات متنوعة', 'expense']];
const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
let ready = false, ready2 = false;
async function ensure() {
  if (!ready) { for (const s of SCH) await C.db().query(s); ready = true; }
  if (!ready2) { for (const t of ['ALTER TABLE gl_lines ADD COLUMN supplier_id INT NULL', 'ALTER TABLE inv_moves ADD COLUMN supplier_id INT NULL']) { try { await C.db().query(t); } catch (e) { /* exists */ } }
    try { await C.db().query('ALTER TABLE gl_lines ADD COLUMN client_id INT NULL'); } catch (e) { /* exists */ }
    try { await C.db().query("UPDATE gl_lines l JOIN gl_entries e ON e.id=l.entry_id JOIN cut_orders o ON e.source='order' AND o.id=e.source_id JOIN gl_accounts a ON a.id=l.account_id AND a.code='1200' SET l.client_id=o.client_id WHERE l.client_id IS NULL"); await C.db().query("UPDATE gl_lines l JOIN gl_entries e ON e.id=l.entry_id JOIN payments p ON e.source='payment' AND p.id=e.source_id JOIN gl_accounts a ON a.id=l.account_id AND a.code='1200' SET l.client_id=p.client_id WHERE l.client_id IS NULL"); } catch (e) { console.error('subledger backfill', e.message); }
    ready2 = true; }
  const [[n]] = await C.db().query('SELECT COUNT(*) n FROM gl_accounts'); if (!n.n) for (const a of CHART) await C.db().query('INSERT INTO gl_accounts(code,name,type) VALUES(?,?,?)', a);
}
const acc = async (code) => (await Q('SELECT id FROM gl_accounts WHERE code=?', [code]))[0].id;
async function post(conn, date, memo, kind, lines, o = {}) {
  const ls = lines.map(l => ({ a: +l.account_id, d: r2(l.debit), c: r2(l.credit), cl: l.client_id ? +l.client_id : null, sp: l.supplier_id ? +l.supplier_id : null })).filter(l => l.d || l.c);
  if (ls.length < 2) throw bad('القيد يحتاج سطرين على الأقل');
  if (ls.some(l => (l.d && l.c) || l.d < 0 || l.c < 0)) throw bad('السطر إما مدين أو دائن بقيمة موجبة');
  const D = r2(ls.reduce((s, l) => s + l.d, 0)), K = r2(ls.reduce((s, l) => s + l.c, 0));
  if (D !== K) throw bad('القيد غير متزن: المدين ' + D + ' والدائن ' + K);
  const [[m]] = await conn.query('SELECT COALESCE(MAX(no),0)+1 n FROM gl_entries');
  const [r] = await conn.query('INSERT INTO gl_entries(no,date,memo,kind,source,source_id,reversed_of,created_by) VALUES(?,?,?,?,?,?,?,?)', [m.n, date, String(memo || '').slice(0, 250), kind, o.source || null, o.source_id || null, o.reversed_of || null, o.uid || null]);
  for (const l of ls) await conn.query('INSERT INTO gl_lines(entry_id,account_id,debit,credit,client_id,supplier_id) VALUES(?,?,?,?,?,?)', [r.insertId, l.a, l.d, l.c, l.cl, l.sp]);
  return { id: r.insertId, no: m.n };
}
async function lockGuard(date) { const s = await C.getSettings(); const lb = String(s.lock_before || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(lb) && date < lb) throw new HttpError(423, 'الفترة مقفلة قبل ' + lb); }
async function balances(from, to, kinds) {
  const w = ['1=1'], p = []; if (from) { w.push('e.date>=?'); p.push(from); } if (to) { w.push('e.date<=?'); p.push(to); }
  if (kinds) w.push("e.kind IN ('" + kinds.join("','") + "')");
  return Q('SELECT a.id,a.code,a.name,a.type,COALESCE(SUM(l.debit),0) debit,COALESCE(SUM(l.credit),0) credit FROM gl_accounts a LEFT JOIN (gl_lines l JOIN gl_entries e ON e.id=l.entry_id AND ' + w.join(' AND ') + ') ON l.account_id=a.id GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code', p);
}
const net = (r) => (r.type === 'asset' || r.type === 'expense') ? r2(r.debit - r.credit) : r2(r.credit - r.debit);
async function autoPost(uid) {
  let n = 0; const conn = await C.db().getConnection();
  try {
    const cash = await acc('1100'), ar = await acc('1200'), rev = await acc('4100'), exp = await acc('5200');
    const has = async (s, id) => (await conn.query('SELECT id FROM gl_entries WHERE source=? AND source_id=?', [s, id]))[0].length;
    for (const o of await Q('SELECT id,code,date,total_pcs,unit_cost,client_id FROM cut_orders WHERE date IS NOT NULL')) { const v = r2((o.total_pcs || 0) * (o.unit_cost || 0)); if (v > 0 && !(await has('order', o.id))) { await post(conn, o.date, 'إيراد تصنيع أمر القص ' + o.code, 'normal', [{ account_id: ar, debit: v, client_id: o.client_id }, { account_id: rev, credit: v }], { source: 'order', source_id: o.id, uid }); n++; } }
    for (const p of await Q('SELECT id,date,amount,client_id FROM payments')) if (!(await has('payment', p.id))) { await post(conn, p.date, 'تحصيل من عميل', 'normal', [{ account_id: cash, debit: p.amount }, { account_id: ar, credit: p.amount, client_id: p.client_id }], { source: 'payment', source_id: p.id, uid }); n++; }
    for (const x of await Q('SELECT id,date,amount,category,cut_code FROM expenses')) if (!(await has('expense', x.id))) { await post(conn, x.date, 'مصروف: ' + (x.category || '') + ' ' + (x.cut_code || ''), 'normal', [{ account_id: exp, debit: x.amount }, { account_id: cash, credit: x.amount }], { source: 'expense', source_id: x.id, uid }); n++; }
    { // inventory moves -> journal (weighted-average cost from the stock card)
      const I = require('./inv'); const stock = await acc('1300'), ap = await acc('2100'), misc = await acc('5900'); const cards = (await I.compute()).cards;
      for (const k of Object.keys(cards)) for (const mv of cards[k]) {
        if (mv.kind === 'trin' || mv.kind === 'trout' || (await has('invmove', mv.id))) continue;
        const v = r2(Math.abs(mv.signed) * (mv.kind === 'in' ? mv.unit_cost : mv.cost)); if (!(v > 0)) continue; const dt = mv.date;
        if (mv.kind === 'in') await post(conn, dt, 'توريد مخزون ' + (mv.ref || ''), 'normal', [{ account_id: stock, debit: v }, { account_id: ap, credit: v, supplier_id: mv.supplier_id }], { source: 'invmove', source_id: mv.id, uid });
        else if (mv.kind === 'out') await post(conn, dt, 'صرف مخزون ' + (mv.ref || ''), 'normal', [{ account_id: exp, debit: v }, { account_id: stock, credit: v }], { source: 'invmove', source_id: mv.id, uid });
        else if (mv.signed > 0) await post(conn, dt, 'فرق جرد (زيادة)', 'normal', [{ account_id: stock, debit: v }, { account_id: misc, credit: v }], { source: 'invmove', source_id: mv.id, uid });
        else await post(conn, dt, 'فرق جرد (عجز)', 'normal', [{ account_id: misc, debit: v }, { account_id: stock, credit: v }], { source: 'invmove', source_id: mv.id, uid });
        n++;
      }
    }
  } finally { conn.release(); }
  return n;
}
async function api(head, req, u, id, body, q, parts) {
  if (head !== 'gl') return undefined; await ensure(); const sub = parts[1], m = req.method;
  const write = () => { if (u.role === 'viewer') throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
  if (sub === 'accounts') {
    if (m === 'GET') return Q('SELECT * FROM gl_accounts ORDER BY code');
    write(); const code = String(body.code || '').trim(), name = String(body.name || '').trim();
    if (!/^\d{3,10}$/.test(code) || !name || !TYPES.includes(body.type)) throw bad('بيانات الحساب غير صحيحة');
    try { await C.db().query('INSERT INTO gl_accounts(code,name,type) VALUES(?,?,?)', [code, name.slice(0, 120), body.type]); } catch (e) { throw bad('كود الحساب مكرر'); } return { ok: true };
  }
  if (sub === 'entries') {
    if (m === 'GET') {
      const w = ['1=1'], p = []; if (q.from) { w.push('e.date>=?'); p.push(q.from); } if (q.to) { w.push('e.date<=?'); p.push(q.to); }
      const es = await Q('SELECT e.* FROM gl_entries e WHERE ' + w.join(' AND ') + ' ORDER BY e.date DESC, e.id DESC LIMIT 500', p);
      const ls = es.length ? await Q('SELECT l.*,a.code,a.name FROM gl_lines l JOIN gl_accounts a ON a.id=l.account_id WHERE l.entry_id IN (' + es.map(e => +e.id).join(',') + ') ORDER BY l.id') : [];
      return es.map(e => ({ ...e, lines: ls.filter(l => l.entry_id === e.id) }));
    }
    write();
    if (m === 'POST') {
      if (!isDate(body.date)) throw bad('التاريخ غير صحيح'); await lockGuard(body.date);
      const kind = ['normal', 'adjusting'].includes(body.kind) ? body.kind : 'normal'; const conn = await C.db().getConnection();
      try { await conn.beginTransaction(); const r = await post(conn, body.date, body.memo, kind, body.lines || [], { uid: u.id }); await conn.commit(); await C.audit(u, 'create', 'gl_entry', r.id); return r; } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    }
    if (m === 'DELETE' && id) { // reversal, never delete
      const [e] = await Q('SELECT * FROM gl_entries WHERE id=?', [id]); if (!e) throw new HttpError(404, 'غير موجود');
      if (e.reversed_of) throw bad('هذا قيد عكسي بالفعل'); if ((await Q('SELECT id FROM gl_entries WHERE reversed_of=?', [id])).length) throw bad('القيد معكوس سابقًا');
      if (e.kind === 'closing') throw bad('قيود الإقفال تُلغى من شاشة الإقفال'); const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); await lockGuard(date);
      const ls = await Q('SELECT * FROM gl_lines WHERE entry_id=?', [id]); const conn = await C.db().getConnection();
      try { await conn.beginTransaction(); await post(conn, date, 'عكس القيد رقم ' + e.no, 'normal', ls.map(l => ({ account_id: l.account_id, debit: l.credit, credit: l.debit })), { reversed_of: id, uid: u.id }); await conn.commit(); } catch (x) { await conn.rollback(); throw x; } finally { conn.release(); }
      await C.audit(u, 'reverse', 'gl_entry', id); return { ok: true };
    }
  }
  if (sub === 'autopost' && m === 'POST') { write(); const n = await autoPost(u.id); return { posted: n }; }
  if (sub === 'suppliers') {
    if (m === 'GET') return Q('SELECT * FROM suppliers WHERE active=1 ORDER BY name');
    write(); const nm = String(body.name || '').trim(); if (!nm) throw bad('اسم المورد مطلوب'); const code = String(body.code || '').trim() || ('S' + String(Date.now()).slice(-6));
    try { await C.db().query('INSERT INTO suppliers(code,name,phone,notes) VALUES(?,?,?,?)', [code.slice(0, 30), nm.slice(0, 160), String(body.phone || '').slice(0, 40), String(body.notes || '').slice(0, 250)]); } catch (e) { throw bad('كود المورد مكرر'); } return { ok: true };
  }
  if (sub === 'suppay' && m === 'POST') { // pay a supplier: Dr 2100 (supplier) / Cr cash or bank
    write(); const amt = r2(body.amount), sid = +body.supplier_id; if (!(amt > 0)) throw bad('المبلغ غير صحيح'); if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) throw bad('التاريخ غير صحيح');
    if (!(await Q('SELECT id FROM suppliers WHERE id=?', [sid])).length) throw bad('اختر موردًا'); await lockGuard(body.date);
    const ap = await acc('2100'), src = await acc(body.method === 'bank' ? '1110' : '1100'); const conn = await C.db().getConnection();
    try { await post(conn, body.date, 'سداد مورد ' + String(body.notes || ''), 'normal', [{ account_id: ap, debit: amt, supplier_id: sid }, { account_id: src, credit: amt }], { source: 'suppay', uid: u.id }); } finally { conn.release(); }
    await C.audit(u, 'create', 'supplier_payment', sid, String(amt)); return { ok: true };
  }
  if (sub === 'supledger') { // supplier sub-ledger vs control account 2100
    const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '9999-12-31';
    const rows = await Q("SELECT l.supplier_id, COALESCE(SUM(l.debit),0) debit, COALESCE(SUM(l.credit),0) credit FROM gl_lines l JOIN gl_entries e ON e.id=l.entry_id AND e.date<=? JOIN gl_accounts a ON a.id=l.account_id AND a.code='2100' GROUP BY l.supplier_id", [to]);
    const ss = await Q('SELECT id,code,name FROM suppliers'); const nm = {}; ss.forEach(c => { nm[c.id] = c; });
    const out = rows.map(r => ({ supplier_id: r.supplier_id, code: r.supplier_id ? (nm[r.supplier_id] || {}).code : '', name: r.supplier_id ? ((nm[r.supplier_id] || {}).name || '#' + r.supplier_id) : 'غير مرتبط بمورد', debit: r2(r.debit), credit: r2(r.credit), balance: r2(r.credit - r.debit) }));
    const control = r2(rows.reduce((s, r) => s + r.credit - r.debit, 0)), subs = r2(out.filter(r => r.supplier_id).reduce((s, r) => s + r.balance, 0)), un = r2(out.filter(r => !r.supplier_id).reduce((s, r) => s + r.balance, 0));
    return { rows: out, control, subs, unassigned: un, reconciled: Math.abs(un) < 0.005 };
  }
  if (sub === 'subledger') { // customer sub-ledger vs control account 1200
    const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '9999-12-31';
    const rows = await Q("SELECT l.client_id, COALESCE(SUM(l.debit),0) debit, COALESCE(SUM(l.credit),0) credit FROM gl_lines l JOIN gl_entries e ON e.id=l.entry_id AND e.date<=? JOIN gl_accounts a ON a.id=l.account_id AND a.code='1200' GROUP BY l.client_id", [to]);
    const cs = await Q('SELECT id,code,name FROM clients'); const nm = {}; cs.forEach(c => { nm[c.id] = c; });
    const out = rows.map(r => ({ client_id: r.client_id, code: r.client_id ? (nm[r.client_id] || {}).code : '', name: r.client_id ? ((nm[r.client_id] || {}).name || '#' + r.client_id) : 'غير مرتبط بعميل', debit: r2(r.debit), credit: r2(r.credit), balance: r2(r.debit - r.credit) }));
    const control = r2(rows.reduce((s, r) => s + r.debit - r.credit, 0)), subs = r2(out.filter(r => r.client_id).reduce((s, r) => s + r.balance, 0)), un = r2(out.filter(r => !r.client_id).reduce((s, r) => s + r.balance, 0));
    return { rows: out, control, subs, unassigned: un, reconciled: Math.abs(un) < 0.005 };
  }
  if (sub === 'ledger') {
    const a = (await Q('SELECT * FROM gl_accounts WHERE id=?', [+q.account]))[0]; if (!a) throw bad('اختر حسابًا');
    const rows = await Q('SELECT e.date,e.no,e.memo,e.kind,l.debit,l.credit FROM gl_lines l JOIN gl_entries e ON e.id=l.entry_id WHERE l.account_id=? ORDER BY e.date,e.id,l.id', [a.id]);
    const dn = a.type === 'asset' || a.type === 'expense'; let bal = 0; const out = rows.map(r => { bal = r2(bal + (dn ? r.debit - r.credit : r.credit - r.debit)); return { ...r, balance: bal }; });
    return { account: a, rows: out, balance: bal };
  }
  if (sub === 'trial') { const rs = (await balances(q.from, q.to)).filter(r => r.debit || r.credit); return { rows: rs.map(r => { const b = r2(r.debit - r.credit); return { code: r.code, name: r.name, type: r.type, debit: r2(r.debit), credit: r2(r.credit), bal_debit: b > 0 ? b : 0, bal_credit: b < 0 ? -b : 0 }; }) }; }
  if (sub === 'statements') {
    const to = q.to || '9999-12-31', from = q.from || '0000-01-01';
    const pl = (await balances(from, to, ['normal', 'adjusting'])).filter(r => r.type === 'revenue' || r.type === 'expense');
    const revs = pl.filter(r => r.type === 'revenue').map(r => ({ code: r.code, name: r.name, amount: net(r) })).filter(r => r.amount), exps = pl.filter(r => r.type === 'expense').map(r => ({ code: r.code, name: r.name, amount: net(r) })).filter(r => r.amount);
    const tr = r2(revs.reduce((s, r) => s + r.amount, 0)), te = r2(exps.reduce((s, r) => s + r.amount, 0));
    const all = await balances(null, to); const sec = (t) => all.filter(r => r.type === t).map(r => ({ code: r.code, name: r.name, amount: net(r) })).filter(r => r.amount);
    const assets = sec('asset'), liab = sec('liability'), eq = sec('equity'); const profitToDate = r2(all.filter(r => r.type === 'revenue').reduce((s, r) => s + net(r), 0) - all.filter(r => r.type === 'expense').reduce((s, r) => s + net(r), 0));
    const ta = r2(assets.reduce((s, r) => s + r.amount, 0)), tl = r2(liab.reduce((s, r) => s + r.amount, 0)), te2 = r2(eq.reduce((s, r) => s + r.amount, 0));
    const cashAcc = all.filter(r => ['1100', '1110'].includes(r.code)).reduce((s, r) => s + net(r), 0);
    return { income: { revenue: revs, expenses: exps, total_revenue: tr, total_expense: te, net: r2(tr - te) }, balance: { assets, liabilities: liab, equity: eq, profit_unclosed: profitToDate, total_assets: ta, total_liab: tl, total_equity: r2(te2 + profitToDate), check: r2(ta - tl - te2 - profitToDate) }, cash: r2(cashAcc) };
  }
  if (sub === 'close' && m === 'POST') {
    write(); if (u.role !== 'admin') throw new HttpError(403, 'الإقفال للمدير فقط'); if (!isDate(body.to)) throw bad('حدد تاريخ نهاية الفترة'); const from = isDate(body.from) ? body.from : '0000-01-01';
    if ((await Q("SELECT id FROM gl_entries WHERE kind='closing' AND date=?", [body.to])).length) throw bad('تم إقفال هذه الفترة من قبل');
    const pl = (await balances(from, body.to, ['normal', 'adjusting'])).filter(r => (r.type === 'revenue' || r.type === 'expense') && r2(r.debit - r.credit) !== 0);
    if (!pl.length) throw bad('لا توجد أرصدة إيرادات أو مصروفات للإقفال'); const re = await acc('3300'); const lines = []; let prof = 0;
    for (const r of pl) { const b = r2(r.debit - r.credit); lines.push({ account_id: r.id, debit: b < 0 ? -b : 0, credit: b > 0 ? b : 0 }); prof = r2(prof - b); }
    lines.push({ account_id: re, debit: prof < 0 ? -prof : 0, credit: prof > 0 ? prof : 0 });
    const conn = await C.db().getConnection(); try { await conn.beginTransaction(); const r = await post(conn, body.to, 'قيد إقفال الإيرادات والمصروفات إلى الأرباح المرحّلة', 'closing', lines, { uid: u.id }); await conn.commit(); } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    await C.db().query('INSERT INTO settings(k,v) VALUES("lock_before",?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [new Date(new Date(body.to).getTime() + 86400000).toISOString().slice(0, 10)]);
    await C.audit(u, 'close', 'gl_period', 0, body.to); return { ok: true, profit: prof };
  }
  throw new HttpError(404, 'غير موجود');
}
module.exports = { api, post, lockGuard };
