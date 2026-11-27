'use strict';
/* GL extensions (stage by stage): cash flow statement, bank reconciliation, fixed assets, payroll accruals, prepaid/accrued, VAT, supplier statement */
const C = require('./core');
const { bad, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const EXTRA = [['1400', 'مصروفات مدفوعة مقدمًا', 'asset'], ['1450', 'ضريبة القيمة المضافة - مدخلات', 'asset'], ['2500', 'ضريبة القيمة المضافة - مخرجات', 'liability'], ['5700', 'رواتب وأجور إدارية', 'expense']];
const SCH = [];
let readyP = null;
function ensure() {
  if (!readyP) readyP = (async () => {
    for (const s of SCH) await C.db().query(s);
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

async function api(head, req, u, id, body, q, parts) {
  if (head !== 'gl2') return undefined; await ensure(); const sub = parts[1], m = req.method;
  const write = () => { if (u.role === 'viewer') throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
  if (sub === 'cashflow' && m === 'GET') return cashflow(q);
  throw new HttpError(404, 'غير موجود');
}
module.exports = { api, ensure, cashflow };
