'use strict';
/* GL extensions (stage by stage): cash flow statement, bank reconciliation, fixed assets, payroll accruals, prepaid/accrued, VAT, supplier statement */
const C = require('./core');
const ACC = require('./acct');
const { bad, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const EXTRA = [['1400', 'مصروفات مدفوعة مقدمًا', 'asset'], ['1450', 'ضريبة القيمة المضافة - مدخلات', 'asset'], ['2500', 'ضريبة القيمة المضافة - مخرجات', 'liability'], ['5700', 'رواتب وأجور إدارية', 'expense'], ['1150', 'سلف موظفين', 'asset']];
const SCH = [
`CREATE TABLE IF NOT EXISTS bank_recs(id INT AUTO_INCREMENT PRIMARY KEY, statement_date DATE NOT NULL, statement_balance DECIMAL(16,2) NOT NULL, cleared_net DECIMAL(16,2) NOT NULL, book_balance DECIMAL(16,2) NOT NULL, difference DECIMAL(16,2) NOT NULL, created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX(statement_date))`,
`CREATE TABLE IF NOT EXISTS fixed_assets(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, category VARCHAR(80), purchase_date DATE NOT NULL, cost DECIMAL(16,2) NOT NULL, salvage DECIMAL(16,2) NOT NULL DEFAULT 0, life_years DECIMAL(6,2) NOT NULL, account_id INT NOT NULL, dep_account_id INT NOT NULL, acc_dep_account_id INT NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'active', created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX(status))`,
`CREATE TABLE IF NOT EXISTS asset_dep(id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL, month VARCHAR(7) NOT NULL, amount DECIMAL(16,2) NOT NULL, entry_id INT NOT NULL, created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_asset_month(asset_id,month), INDEX(month))`,
`CREATE TABLE IF NOT EXISTS payroll_accruals(id INT AUTO_INCREMENT PRIMARY KEY, ym CHAR(7) NOT NULL UNIQUE, gross DECIMAL(16,2) NOT NULL, net DECIMAL(16,2) NOT NULL, advances DECIMAL(16,2) NOT NULL, other_ded DECIMAL(16,2) NOT NULL, entry_id INT NOT NULL, paid_amount DECIMAL(16,2) NOT NULL DEFAULT 0, created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
`CREATE TABLE IF NOT EXISTS prepaids(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, expense_account_id INT NOT NULL, start_month CHAR(7) NOT NULL, months INT NOT NULL, total DECIMAL(16,2) NOT NULL, amortized DECIMAL(16,2) NOT NULL DEFAULT 0, pay_entry_id INT, created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
`CREATE TABLE IF NOT EXISTS prepaid_amort(id INT AUTO_INCREMENT PRIMARY KEY, prepaid_id INT NOT NULL, month CHAR(7) NOT NULL, amount DECIMAL(16,2) NOT NULL, entry_id INT NOT NULL, created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_prepaid_month(prepaid_id,month), INDEX(month))`,
`CREATE TABLE IF NOT EXISTS accruals(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, month CHAR(7) NOT NULL, amount DECIMAL(16,2) NOT NULL, expense_account_id INT NOT NULL, entry_id INT NOT NULL, settled TINYINT NOT NULL DEFAULT 0, settled_entry_id INT NULL, settled_date DATE NULL, created_by INT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`];
let readyP = null;
function ensure() {
  if (!readyP) readyP = (async () => {
    for (const s of SCH) await C.db().query(s);
    try { await C.db().query('ALTER TABLE gl_lines ADD COLUMN rec_id INT NULL'); } catch (e) { /* exists */ }
    for (const a of EXTRA) await C.db().query('INSERT IGNORE INTO gl_accounts(code,name,type) VALUES(?,?,?)', a);
  })().catch((e) => { readyP = null; throw e; });
  return readyP;
}
const CASH = ['1100', '1110'];
const dayBefore = (d) => new Date(new Date(d + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);

/* ---------- cash flow statement (direct + indirect, reconciled) ---------- */
async function cashflow(q) {
  const to = isDate(q.to) ? q.to : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const from = isDate(q.from) ? q.from : to.slice(0, 4) + '-01-01';
  const before = dayBefore(from);
  // balances (debit - credit) per account at a date, closing entries excluded (they only move P&L into retained earnings)
  const bal = async (date) => { const m = {}; for (const r of await Q("SELECT a.code,a.name,a.type,COALESCE(SUM(l.debit-l.credit),0) b FROM gl_accounts a LEFT JOIN (gl_lines l JOIN gl_entries e ON e.id=l.entry_id AND e.date<=? AND e.kind<>'closing') ON l.account_id=a.id GROUP BY a.id,a.code,a.name,a.type", [date])) m[r.code] = { name: r.name, type: r.type, b: Number(r.b) }; return m; };
  const b0 = await bal(before), b1 = await bal(to);
  const opening = r2(CASH.reduce((s, c) => s + (b0[c] ? b0[c].b : 0), 0)), closing = r2(CASH.reduce((s, c) => s + (b1[c] ? b1[c].b : 0), 0));
  // direct method: cash-touching entries, each non-cash line contributes (credit - debit) to cash
  const rows = await Q("SELECT e.id,e.date,l.debit,l.credit,a.code,a.name FROM gl_lines l JOIN gl_entries e ON e.id=l.entry_id JOIN gl_accounts a ON a.id=l.account_id WHERE e.date>=? AND e.date<=? AND e.kind<>'closing' AND e.id IN (SELECT l2.entry_id FROM gl_lines l2 JOIN gl_accounts a2 ON a2.id=l2.account_id WHERE a2.code IN ('1100','1110'))", [from, to]);
  const sect = { operating: {}, investing: {}, financing: {} }; const byMonth = {};
  const entries = {}; rows.forEach(r => { (entries[r.id] = entries[r.id] || []).push(r); });
  for (const id of Object.keys(entries)) {
    const ls = entries[id]; const date = ls[0].date; let cashNet = 0;
    for (const l of ls) { if (CASH.includes(l.code)) cashNet += Number(l.debit) - Number(l.credit); else { const k = l.code.startsWith('15') ? 'investing' : (l.code.startsWith('3') ? 'financing' : 'operating'); const o = sect[k][l.code] = sect[k][l.code] || { code: l.code, name: l.name, amount: 0 }; o.amount += Number(l.credit) - Number(l.debit); } }
    const mo = date.slice(0, 7); const m = byMonth[mo] = byMonth[mo] || { month: mo, inflow: 0, outflow: 0 };
    if (cashNet > 0) m.inflow += cashNet; else if (cashNet < 0) m.outflow += -cashNet;
  }
  const mk = (o) => Object.values(o).map(x => ({ ...x, amount: r2(x.amount) })).filter(x => x.amount).sort((a, b) => a.code.localeCompare(b.code));
  const D = { operating: mk(sect.operating), investing: mk(sect.investing), financing: mk(sect.financing) };
  const tot = (a) => r2(a.reduce((s, x) => s + x.amount, 0));
  const dt = { operating: tot(D.operating), investing: tot(D.investing), financing: tot(D.financing) };
  // indirect method from balance changes
  const codes = Object.keys(b1); const eff = (c) => r2(-((b1[c] ? b1[c].b : 0) - (b0[c] ? b0[c].b : 0)));
  let profit = 0; codes.forEach(c => { const t = b1[c].type; if (t === 'revenue' || t === 'expense') profit += eff(c); }); profit = r2(profit);
  const adj = []; const inv = [], fin = [];
  const wcName = (c) => { const t = b1[c].type, e = eff(c); return (t === 'asset' ? (e < 0 ? 'الزيادة في ' : 'النقص في ') : (e > 0 ? 'الزيادة في ' : 'النقص في ')) + b1[c].name; };
  codes.forEach(c => {
    const t = b1[c].type; if (CASH.includes(c) || t === 'revenue' || t === 'expense') return; const e = eff(c); if (!e) return;
    if (c === '1590') adj.push({ code: c, name: 'إهلاك الفترة (بند غير نقدي)', amount: e });
    else if (c.startsWith('15')) inv.push({ code: c, name: e < 0 ? 'شراء أصول ثابتة: ' + b1[c].name : 'بيع أصول ثابتة: ' + b1[c].name, amount: e });
    else if (c.startsWith('3')) fin.push({ code: c, name: e > 0 ? 'زيادة: ' + b1[c].name : 'نقص: ' + b1[c].name, amount: e });
    else adj.push({ code: c, name: wcName(c), amount: e });
  });
  const io = r2(profit + tot(adj)), ii = tot(inv), ifn = tot(fin);
  const net = r2(closing - opening), directNet = r2(dt.operating + dt.investing + dt.financing), indirectNet = r2(io + ii + ifn);
  return { from, to, opening, closing, net_change: net,
    direct: { ...D, totals: dt, net: directNet },
    indirect: { profit, adjustments: adj, operating: io, investing: inv, investing_total: ii, financing: fin, financing_total: ifn, net: indirectNet },
    months: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ month: m.month, inflow: r2(m.inflow), outflow: r2(m.outflow) })),
    check: { direct_ok: Math.abs(directNet - net) < 0.005, indirect_ok: Math.abs(indirectNet - net) < 0.005, diff_direct: r2(directNet - net), diff_indirect: r2(indirectNet - net) } };
}

/* ---------- bank reconciliation: GL bank account 1110 vs the bank statement ---------- */
const BANK = '1110';
const bankAccId = async () => { const a = (await Q('SELECT id FROM gl_accounts WHERE code=?', [BANK]))[0]; if (!a) throw bad('حساب البنك 1110 غير موجود في دليل الحسابات'); return a.id; };
async function bankrecGet(q) {
  const to = isDate(q.to) ? q.to : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const accId = await bankAccId();
  const rows = await Q("SELECT l.id line_id, l.entry_id, e.no, e.date, e.memo, e.kind, l.debit, l.credit, l.rec_id FROM gl_lines l JOIN gl_entries e ON e.id=l.entry_id AND e.date<=? AND e.kind<>'closing' WHERE l.account_id=? ORDER BY e.date, e.id, l.id", [to, accId]);
  const f = (r) => Number(r.debit) - Number(r.credit);
  const book = r2(rows.reduce((s, r) => s + f(r), 0));
  const un = rows.filter(r => !r.rec_id);
  const clearedNet = r2(rows.filter(r => r.rec_id).reduce((s, r) => s + f(r), 0));
  const last = (await Q('SELECT * FROM bank_recs ORDER BY statement_date DESC, id DESC LIMIT 1'))[0] || null;
  return { to, book, cleared_net: clearedNet, uncleared_net: r2(book - clearedNet),
    stats: { count: rows.length, cleared_count: rows.length - un.length, uncleared_count: un.length, uncleared_debits: r2(un.reduce((s, r) => s + Number(r.debit), 0)), uncleared_credits: r2(un.reduce((s, r) => s + Number(r.credit), 0)) },
    lines: rows.map(r => ({ line_id: r.line_id, entry_id: r.entry_id, no: r.no, date: r.date, memo: r.memo, debit: Number(r.debit), credit: Number(r.credit), cleared: !!r.rec_id })),
    last_rec: last };
}
async function bankrecPost(u, body) {
  const date = body.date; if (!isDate(date)) throw bad('تاريخ كشف البنك غير صحيح');
  const sb = r2(body.statement_balance); if (!isFinite(sb)) throw bad('رصيد كشف البنك غير صحيح');
  const ids = Array.isArray(body.line_ids) ? body.line_ids.map(x => +x).filter(Number.isInteger) : [];
  const accId = await bankAccId();
  const rows = await Q("SELECT l.id, l.debit, l.credit, l.rec_id FROM gl_lines l JOIN gl_entries e ON e.id=l.entry_id AND e.date<=? AND e.kind<>'closing' WHERE l.account_id=?", [date, accId]);
  const byId = {}; rows.forEach(r => { byId[r.id] = r; });
  const idSet = new Set(ids);
  for (const r of rows) if (r.rec_id && !idSet.has(r.id)) throw bad('لا يمكن إلغاء مطابقة حركة اعتُمدت في تسوية سابقة');
  for (const i of ids) if (!byId[i]) throw bad('حركة غير موجودة ضمن كشف هذا التاريخ');
  const net = r2(ids.reduce((s, i) => s + (Number(byId[i].debit) - Number(byId[i].credit)), 0));
  const diff = r2(sb - net);
  if (Math.abs(diff) >= 0.005) throw bad('التسوية غير متوازنة: الفرق ' + diff + ' بين كشف البنك والحركات المحددة. راجع التحديد أو سجّل حركات البنك الناقصة (عمولات، فوائد) بقيد يومية أولًا');
  const book = r2(rows.reduce((s, r) => s + (Number(r.debit) - Number(r.credit)), 0));
  return C.tx(async (conn) => {
    const [r] = await conn.query('INSERT INTO bank_recs(statement_date,statement_balance,cleared_net,book_balance,difference,created_by) VALUES(?,?,?,?,?,?)', [date, sb, net, book, diff, u.id]);
    let newly = 0;
    for (const i of ids) if (!byId[i].rec_id) { await conn.query('UPDATE gl_lines SET rec_id=? WHERE id=?', [r.insertId, i]); newly++; }
    await C.audit(u, 'create', 'bank_rec', r.insertId, date + ' bal=' + sb, conn);
    return { id: r.insertId, statement_balance: sb, cleared_net: net, book, difference: diff, newly_cleared: newly };
  });
}

/* ---------- fixed assets: register + straight-line monthly depreciation ---------- */
const accIdOf = async (code) => { const a = (await Q('SELECT id FROM gl_accounts WHERE code=?', [code]))[0]; if (!a) throw bad('حساب ' + code + ' غير موجود في دليل الحسابات'); return a.id; };
const isMonth = (mo) => /^\d{4}-\d{2}$/.test(mo || '');
const monthEnd = (mo) => new Date(Date.UTC(+mo.slice(0, 4), +mo.slice(5, 7), 0)).toISOString().slice(0, 10);
const curMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 7);
const monthlyAmt = (a) => r2((Number(a.cost) - Number(a.salvage)) / (Number(a.life_years) * 12));
async function assetsList() {
  const rows = await Q('SELECT a.*, COALESCE((SELECT SUM(d.amount) FROM asset_dep d WHERE d.asset_id=a.id),0) acc_dep, (SELECT COUNT(*) FROM asset_dep d WHERE d.asset_id=a.id) months_posted FROM fixed_assets a ORDER BY a.id DESC');
  return rows.map(a => { const base = r2(Number(a.cost) - Number(a.salvage)), acc = r2(a.acc_dep);
    return { id: a.id, name: a.name, category: a.category || '', purchase_date: a.purchase_date, cost: Number(a.cost), salvage: Number(a.salvage), life_years: Number(a.life_years), monthly: monthlyAmt(a), base, acc_dep: acc, nbv: r2(Number(a.cost) - acc), months_posted: a.months_posted, fully_depreciated: acc >= base - 0.005, status: a.status }; });
}
async function assetCreate(u, body) {
  const name = String(body.name || '').trim(); if (!name) throw bad('اسم الأصل مطلوب');
  const date = body.purchase_date; if (!isDate(date)) throw bad('تاريخ الشراء غير صحيح');
  const cost = r2(body.cost); if (!(cost > 0)) throw bad('تكلفة الأصل غير صحيحة');
  const salvage = r2(body.salvage || 0); if (salvage < 0 || salvage >= cost) throw bad('قيمة الخردة يجب أن تكون أقل من التكلفة');
  const life = Number(body.life_years); if (!(life > 0 && life <= 50)) throw bad('العمر الإنتاجي غير صحيح (من 0 إلى 50 سنة)');
  const assetA = await accIdOf('1500'), depA = await accIdOf('5600'), accA = await accIdOf('1590');
  const pay = body.pay_account ? String(body.pay_account) : null; let payId = null;
  if (pay) { if (!['1100', '1110', '2100'].includes(pay)) throw bad('حساب السداد غير صحيح'); payId = await accIdOf(pay); await ACC.lockGuard(date); }
  return C.tx(async (conn) => {
    const [r] = await conn.query('INSERT INTO fixed_assets(name,category,purchase_date,cost,salvage,life_years,account_id,dep_account_id,acc_dep_account_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)', [name, String(body.category || '').slice(0, 80), date, cost, salvage, life, assetA, depA, accA, u.id]);
    let entry = null;
    if (payId) entry = await ACC.post(conn, date, 'شراء أصل ثابت: ' + name, 'normal', [{ account_id: assetA, debit: cost }, { account_id: payId, credit: cost }], { source: 'asset', source_id: r.insertId, uid: u.id });
    await C.audit(u, 'create', 'fixed_asset', r.insertId, name + ' cost=' + cost, conn);
    return { id: r.insertId, entry };
  });
}
async function depPreview(month) {
  if (!isMonth(month)) throw bad('الشهر غير صحيح');
  const me = monthEnd(month);
  const rows = await Q("SELECT a.*, COALESCE((SELECT SUM(d.amount) FROM asset_dep d WHERE d.asset_id=a.id),0) acc_dep, EXISTS(SELECT 1 FROM asset_dep d WHERE d.asset_id=a.id AND d.month=?) posted FROM fixed_assets a WHERE a.status='active' AND a.purchase_date<=? ORDER BY a.id", [month, me]);
  const items = rows.map(a => { const base = r2(Number(a.cost) - Number(a.salvage)), acc = r2(a.acc_dep), due = r2(Math.min(monthlyAmt(a), base - acc));
    return { asset_id: a.id, name: a.name, category: a.category || '', acc_dep: acc, base, due: due > 0 ? due : 0, posted: !!a.posted, fully_depreciated: acc >= base - 0.005 }; });
  return { month, month_end: me, future: month > curMonth(), items, due_total: r2(items.filter(i => !i.posted).reduce((s, i) => s + i.due, 0)) };
}
async function depRun(u, body) {
  const month = body.month; if (!isMonth(month)) throw bad('الشهر غير صحيح');
  if (month > curMonth()) throw bad('لا يمكن ترحيل إهلاك شهر في المستقبل');
  const me = monthEnd(month); await ACC.lockGuard(me);
  const p = await depPreview(month);
  const due = p.items.filter(i => !i.posted && i.due > 0);
  if (!due.length) return { month, posted: 0, total: 0, note: 'لا يوجد إهلاك مستحق لهذا الشهر' };
  return C.tx(async (conn) => {
    let posted = 0, total = 0;
    for (const i of due) {
      const a = (await conn.query('SELECT * FROM fixed_assets WHERE id=? FOR UPDATE', [i.asset_id]))[0][0];
      const accRows = (await conn.query('SELECT COALESCE(SUM(amount),0) s FROM asset_dep WHERE asset_id=?', [i.asset_id]))[0];
      const base = r2(Number(a.cost) - Number(a.salvage)), acc = r2(accRows[0].s), amt = r2(Math.min(monthlyAmt(a), base - acc));
      if (!(amt > 0)) continue;
      try { await conn.query('INSERT INTO asset_dep(asset_id,month,amount,entry_id,created_by) VALUES(?,?,?,0,?)', [a.id, month, amt, u.id]); }
      catch (e) { continue; /* month already posted concurrently */ }
      const entry = await ACC.post(conn, me, 'إهلاك شهر ' + month + ': ' + a.name, 'adjusting', [{ account_id: a.dep_account_id, debit: amt }, { account_id: a.acc_dep_account_id, credit: amt }], { source: 'assetdep', source_id: a.id, uid: u.id });
      await conn.query('UPDATE asset_dep SET entry_id=? WHERE asset_id=? AND month=?', [entry.id, a.id, month]);
      posted++; total = r2(total + amt);
    }
    await C.audit(u, 'create', 'dep_run', month, posted + ' assets total=' + total, conn);
    return { month, posted, total };
  });
}
const depRuns = () => Q('SELECT d.id, d.month, d.amount, d.entry_id, d.created_at, a.name asset_name, e.no entry_no FROM asset_dep d JOIN fixed_assets a ON a.id=d.asset_id LEFT JOIN gl_entries e ON e.id=d.entry_id ORDER BY d.id DESC LIMIT 50');

/* ---------- stage 4: accrued payroll, prepaid expenses (amortization), accrued expenses ---------- */
const EXP_ACCS = ['5200', '5300', '5400', '5500', '5700', '5900'];
const PAY_ACCS = ['1100', '1110'];
const W = () => require('./wb');
async function payrollCalc(u, ym) {
  const d = await W().wbApi('payroll', { method: 'GET' }, u, null, {}, { ym }, ['payroll']);
  const t = d.rows.reduce((s, r) => ({ gross: r2(s.gross + r.gross), net: r2(s.net + r.net), advances: r2(s.advances + r.advances), ded: r2(s.ded + r.total_deductions) }), { gross: 0, net: 0, advances: 0, ded: 0 });
  return { rows: d.rows, gross: t.gross, net: t.net, advances: t.advances, other_ded: r2(t.ded - t.advances) };
}
async function payAccrGet(u, q) {
  const ym = q.ym || curMonth(); if (!isMonth(ym)) throw bad('الشهر غير صحيح');
  const calc = await payrollCalc(u, ym);
  const acc = (await Q('SELECT a.*, e.no entry_no FROM payroll_accruals a LEFT JOIN gl_entries e ON e.id=a.entry_id WHERE a.ym=?', [ym]))[0] || null;
  return { ym, month_end: monthEnd(ym), future: ym > curMonth(), calc, accrual: acc ? { ...acc, outstanding: r2(acc.net - acc.paid_amount) } : null };
}
async function payAccrue(u, body) {
  const ym = body.ym; if (!isMonth(ym)) throw bad('الشهر غير صحيح');
  if (ym > curMonth()) throw bad('لا يمكن استحقاق رواتب شهر في المستقبل');
  const me = monthEnd(ym); await ACC.lockGuard(me);
  if ((await Q('SELECT id FROM payroll_accruals WHERE ym=?', [ym])).length) throw bad('رواتب هذا الشهر مُستحقة بالفعل');
  const calc = await payrollCalc(u, ym);
  if (!(calc.gross > 0)) throw bad('لا توجد رواتب مستحقة لهذا الشهر (راجع الحضور والمدخلات)');
  const exp = await accIdOf('5100'), pay = await accIdOf('2300'), adv = await accIdOf('1150'), oth = await accIdOf('4200');
  return C.tx(async (conn) => {
    const lines = [{ account_id: exp, debit: calc.gross }, { account_id: pay, credit: calc.net }];
    if (calc.advances > 0) lines.push({ account_id: adv, credit: calc.advances });
    if (calc.other_ded > 0) lines.push({ account_id: oth, credit: calc.other_ded });
    const entry = await ACC.post(conn, me, 'استحقاق رواتب شهر ' + ym, 'adjusting', lines, { source: 'payroll_accrual', source_id: 0, uid: u.id });
    const [r] = await conn.query('INSERT INTO payroll_accruals(ym,gross,net,advances,other_ded,entry_id,created_by) VALUES(?,?,?,?,?,?,?)', [ym, calc.gross, calc.net, calc.advances, calc.other_ded, entry.id, u.id]);
    await conn.query('UPDATE gl_entries SET source_id=? WHERE id=?', [r.insertId, entry.id]);
    await C.audit(u, 'create', 'payroll_accrual', r.insertId, ym + ' net=' + calc.net, conn);
    return { id: r.insertId, entry, ...calc };
  });
}
async function payPay(u, body) {
  const ym = body.ym; if (!isMonth(ym)) throw bad('الشهر غير صحيح');
  const acc = (await Q('SELECT * FROM payroll_accruals WHERE ym=?', [ym]))[0]; if (!acc) throw bad('رحّل استحقاق الرواتب أولًا');
  const out = r2(acc.net - acc.paid_amount); if (!(out > 0)) throw bad('رواتب هذا الشهر مسددة بالكامل');
  const amount = body.amount ? r2(body.amount) : out;
  if (!(amount > 0) || amount > out) throw bad('مبلغ السداد غير صحيح (المتبقي ' + out + ')');
  const date = isDate(body.date) ? body.date : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  await ACC.lockGuard(date);
  const pacct = PAY_ACCS.includes(String(body.pay_account)) ? String(body.pay_account) : '1100';
  const liab = await accIdOf('2300'), payId = await accIdOf(pacct);
  return C.tx(async (conn) => {
    const entry = await ACC.post(conn, date, 'سداد رواتب شهر ' + ym, 'normal', [{ account_id: liab, debit: amount }, { account_id: payId, credit: amount }], { source: 'payroll_pay', source_id: acc.id, uid: u.id });
    await conn.query('UPDATE payroll_accruals SET paid_amount=paid_amount+? WHERE id=?', [amount, acc.id]);
    await C.audit(u, 'update', 'payroll_pay', acc.id, ym + ' paid=' + amount, conn);
    return { entry, amount, outstanding: r2(out - amount) };
  });
}
const payAccruals = () => Q('SELECT a.*, e.no entry_no FROM payroll_accruals a LEFT JOIN gl_entries e ON e.id=a.entry_id ORDER BY a.ym DESC LIMIT 24');
async function prepaidsList() {
  const rows = await Q('SELECT p.*, a.name expense_name, COALESCE((SELECT COUNT(*) FROM prepaid_amort m WHERE m.prepaid_id=p.id),0) months_done FROM prepaids p JOIN gl_accounts a ON a.id=p.expense_account_id ORDER BY p.id DESC');
  return rows.map(p => ({ ...p, total: Number(p.total), amortized: Number(p.amortized), remaining: r2(Number(p.total) - Number(p.amortized)), monthly: r2(Number(p.total) / p.months), done: Number(p.amortized) >= Number(p.total) - 0.005 }));
}
async function prepaidCreate(u, body) {
  const name = String(body.name || '').trim(); if (!name) throw bad('اسم المصروف مطلوب');
  const total = r2(body.total); if (!(total > 0)) throw bad('المبلغ غير صحيح');
  const months = Math.round(Number(body.months)); if (!(months >= 1 && months <= 60)) throw bad('عدد الشهور غير صحيح (1-60)');
  const sm = body.start_month; if (!isMonth(sm)) throw bad('شهر البداية غير صحيح');
  const code = EXP_ACCS.includes(String(body.expense_account)) ? String(body.expense_account) : '5200';
  const expId = await accIdOf(code), pre = await accIdOf('1400');
  const date = isDate(body.pay_date) ? body.pay_date : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  await ACC.lockGuard(date);
  const pay = body.pay_account && PAY_ACCS.includes(String(body.pay_account)) ? String(body.pay_account) : null;
  const payId = pay ? await accIdOf(pay) : null;
  return C.tx(async (conn) => {
    const [r] = await conn.query('INSERT INTO prepaids(name,expense_account_id,start_month,months,total,created_by) VALUES(?,?,?,?,?,?)', [name, expId, sm, months, total, u.id]);
    let entry = null;
    if (payId) { entry = await ACC.post(conn, date, 'مصروف مدفوع مقدمًا: ' + name, 'normal', [{ account_id: pre, debit: total }, { account_id: payId, credit: total }], { source: 'prepaid', source_id: r.insertId, uid: u.id }); await conn.query('UPDATE prepaids SET pay_entry_id=? WHERE id=?', [entry.id, r.insertId]); }
    await C.audit(u, 'create', 'prepaid', r.insertId, name + ' total=' + total, conn);
    return { id: r.insertId, entry };
  });
}
async function amortPreview(month) {
  if (!isMonth(month)) throw bad('الشهر غير صحيح');
  const rows = await Q('SELECT p.*, a.name expense_name, EXISTS(SELECT 1 FROM prepaid_amort m WHERE m.prepaid_id=p.id AND m.month=?) posted FROM prepaids p JOIN gl_accounts a ON a.id=p.expense_account_id WHERE p.start_month<=? AND p.amortized < p.total - 0.004 ORDER BY p.id', [month, month]);
  const items = rows.map(p => { const due = r2(Math.min(r2(Number(p.total) / p.months), r2(Number(p.total) - Number(p.amortized))));
    return { prepaid_id: p.id, name: p.name, expense_name: p.expense_name, amortized: Number(p.amortized), total: Number(p.total), due, posted: !!p.posted }; });
  return { month, month_end: monthEnd(month), future: month > curMonth(), items, due_total: r2(items.filter(i => !i.posted).reduce((s, i) => s + i.due, 0)) };
}
async function amortRun(u, body) {
  const month = body.month; if (!isMonth(month)) throw bad('الشهر غير صحيح');
  if (month > curMonth()) throw bad('لا يمكن ترحيل شهر في المستقبل');
  const me = monthEnd(month); await ACC.lockGuard(me);
  const p = await amortPreview(month);
  const due = p.items.filter(i => !i.posted && i.due > 0);
  if (!due.length) return { month, posted: 0, total: 0, note: 'لا يوجد استهلاك مستحق لهذا الشهر' };
  const pre = await accIdOf('1400');
  return C.tx(async (conn) => {
    let posted = 0, total = 0;
    for (const i of due) {
      const a = (await conn.query('SELECT * FROM prepaids WHERE id=? FOR UPDATE', [i.prepaid_id]))[0][0];
      const amt = r2(Math.min(r2(Number(a.total) / a.months), r2(Number(a.total) - Number(a.amortized))));
      if (!(amt > 0)) continue;
      try { await conn.query('INSERT INTO prepaid_amort(prepaid_id,month,amount,entry_id,created_by) VALUES(?,?,?,0,?)', [a.id, month, amt, u.id]); }
      catch (e) { continue; }
      const entry = await ACC.post(conn, me, 'استهلاك مصروف مقدم شهر ' + month + ': ' + a.name, 'adjusting', [{ account_id: a.expense_account_id, debit: amt }, { account_id: pre, credit: amt }], { source: 'prepaid_amort', source_id: a.id, uid: u.id });
      await conn.query('UPDATE prepaid_amort SET entry_id=? WHERE prepaid_id=? AND month=?', [entry.id, a.id, month]);
      await conn.query('UPDATE prepaids SET amortized=amortized+? WHERE id=?', [amt, a.id]);
      posted++; total = r2(total + amt);
    }
    await C.audit(u, 'create', 'prepaid_amort_run', month, posted + ' items total=' + total, conn);
    return { month, posted, total };
  });
}
const amortRuns = () => Q('SELECT m.*, p.name prepaid_name, e.no entry_no FROM prepaid_amort m JOIN prepaids p ON p.id=m.prepaid_id LEFT JOIN gl_entries e ON e.id=m.entry_id ORDER BY m.id DESC LIMIT 50');
async function accrualsList() {
  const rows = await Q('SELECT c.*, a.name expense_name, e.no entry_no, se.no settled_entry_no FROM accruals c JOIN gl_accounts a ON a.id=c.expense_account_id LEFT JOIN gl_entries e ON e.id=c.entry_id LEFT JOIN gl_entries se ON se.id=c.settled_entry_id ORDER BY c.id DESC LIMIT 100');
  return rows.map(c => ({ ...c, amount: Number(c.amount) }));
}
async function accrualCreate(u, body) {
  const name = String(body.name || '').trim(); if (!name) throw bad('اسم المصروف مطلوب');
  const amount = r2(body.amount); if (!(amount > 0)) throw bad('المبلغ غير صحيح');
  const month = body.month; if (!isMonth(month)) throw bad('الشهر غير صحيح');
  if (month > curMonth()) throw bad('لا يمكن تسجيل استحقاق لشهر في المستقبل');
  const me = monthEnd(month); await ACC.lockGuard(me);
  const code = EXP_ACCS.includes(String(body.expense_account)) ? String(body.expense_account) : '5200';
  const expId = await accIdOf(code), liab = await accIdOf('2200');
  return C.tx(async (conn) => {
    const entry = await ACC.post(conn, me, 'مصروف مستحق ' + month + ': ' + name, 'adjusting', [{ account_id: expId, debit: amount }, { account_id: liab, credit: amount }], { source: 'accrual', source_id: 0, uid: u.id });
    const [r] = await conn.query('INSERT INTO accruals(name,month,amount,expense_account_id,entry_id,created_by) VALUES(?,?,?,?,?,?)', [name, month, amount, expId, entry.id, u.id]);
    await conn.query('UPDATE gl_entries SET source_id=? WHERE id=?', [r.insertId, entry.id]);
    await C.audit(u, 'create', 'accrual', r.insertId, name + ' ' + amount, conn);
    return { id: r.insertId, entry };
  });
}
async function accrualSettle(u, body) {
  const c = (await Q('SELECT * FROM accruals WHERE id=?', [+body.id]))[0]; if (!c) throw bad('المصروف غير موجود');
  if (c.settled) throw bad('سُدد هذا المصروف من قبل');
  const date = isDate(body.date) ? body.date : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  await ACC.lockGuard(date);
  const pacct = PAY_ACCS.includes(String(body.pay_account)) ? String(body.pay_account) : '1100';
  const liab = await accIdOf('2200'), payId = await accIdOf(pacct);
  return C.tx(async (conn) => {
    const entry = await ACC.post(conn, date, 'سداد مصروف مستحق: ' + c.name, 'normal', [{ account_id: liab, debit: c.amount }, { account_id: payId, credit: c.amount }], { source: 'accrual_settle', source_id: c.id, uid: u.id });
    await conn.query('UPDATE accruals SET settled=1, settled_entry_id=?, settled_date=? WHERE id=?', [entry.id, date, c.id]);
    await C.audit(u, 'update', 'accrual_settle', c.id, c.name, conn);
    return { entry, amount: Number(c.amount) };
  });
}

async function api(head, req, u, id, body, q, parts) {
  if (head !== 'gl2') return undefined; await ensure(); const sub = parts[1], m = req.method;
  const write = () => { if (u.role === 'viewer') throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
  if (sub === 'cashflow' && m === 'GET') return cashflow(q);
  if (sub === 'bankrec') {
    if (m === 'GET') return bankrecGet(q);
    write(); if (m === 'POST') return bankrecPost(u, body);
  }
  if (sub === 'bankrecs' && m === 'GET') return Q('SELECT * FROM bank_recs ORDER BY statement_date DESC, id DESC LIMIT 50');
  if (sub === 'assets') {
    if (m === 'GET') return assetsList();
    write(); if (m === 'POST') return assetCreate(u, body);
  }
  if (sub === 'depreciation') {
    if (m === 'GET') return depPreview(q.month || curMonth());
    write(); if (m === 'POST') return depRun(u, body);
  }
  if (sub === 'depruns' && m === 'GET') return depRuns();
  if (sub === 'payroll-accrual') {
    if (m === 'GET') return payAccrGet(u, q);
    write(); if (m === 'POST') return payAccrue(u, body);
  }
  if (sub === 'payroll-pay') { write(); if (m === 'POST') return payPay(u, body); }
  if (sub === 'payroll-accruals' && m === 'GET') return payAccruals();
  if (sub === 'prepaids') {
    if (m === 'GET') return prepaidsList();
    write(); if (m === 'POST') return prepaidCreate(u, body);
  }
  if (sub === 'amortize') {
    if (m === 'GET') return amortPreview(q.month || curMonth());
    write(); if (m === 'POST') return amortRun(u, body);
  }
  if (sub === 'amorts' && m === 'GET') return amortRuns();
  if (sub === 'accruals') {
    if (m === 'GET') return accrualsList();
    write(); if (m === 'POST') return accrualCreate(u, body);
  }
  if (sub === 'accrual-settle') { write(); if (m === 'POST') return accrualSettle(u, body); }
  throw new HttpError(404, 'غير موجود');
}
module.exports = { api, ensure, cashflow, bankrecGet };
