'use strict';
const http = require('http');
const C = require('./core');
const { bad, money, isDate, HttpError } = C;
const Q = async (sql, p) => (await C.db().query(sql, p))[0];
const int = (x, name) => { const n = Number(x); if (!Number.isInteger(n) || n < 0) throw bad('القيمة غير صحيحة: ' + name); return n; };
const pos = (x, name) => { const n = Number(x); if (!isFinite(n) || n <= 0) throw bad('القيمة يجب أن تكون أكبر من صفر: ' + name); return n; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const str = (x, max, name, req) => { const s = x === undefined || x === null ? '' : String(x).trim(); if (req && !s) throw bad('الحقل مطلوب: ' + name); if (s.length > max) throw bad('النص أطول من المسموح: ' + name); return s || null; };

const SIMPLE = {
  clients: { cols: ['code', 'name', 'phone', 'address', 'notes', 'active'], used: ['receipts', 'cuts', 'deliveries', 'invoices', 'payments', 'models'], order: 'name' },
  models: { cols: ['code', 'name', 'client_id', 'description', 'price', 'active'], used: ['cuts'], order: 'code' },
  stages: { cols: ['name', 'seq', 'active'], used: ['prod_logs'], order: 'seq,id' },
  payments: { cols: ['client_id', 'date', 'amount', 'method', 'notes'], used: [], order: 'date DESC,id DESC' }
};
const USEDCOL = { receipts: 'client_id', cuts: 'client_id', deliveries: 'client_id', invoices: 'client_id', payments: 'client_id', models: 'client_id', prod_logs: 'stage_id' };
const SIMPLE_USEDCOL = { models: { cuts: 'model_id' } };

const DEFAULT_STAGES = [['خياطة', 1], ['كي', 2], ['فحص وتشطيب', 3], ['تعبئة', 4]];

const pub = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, perms: u.role === 'admin' ? ['*'] : (u.role === 'staff' ? ['write'] : []) });
async function auth(req) {
  const h = req.headers.authorization || '';
  const p = C.verify(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!p) throw new HttpError(401, 'انتهت الجلسة، سجل الدخول من جديد');
  const [r] = await C.db().query('SELECT * FROM users WHERE id=?', [p.uid]);
  if (!r[0] || !r[0].active) throw new HttpError(401, 'الحساب غير نشط');
  return { ...pub(r[0]), raw: r[0] };
}
const canWrite = (u) => u.role === 'admin' || u.role === 'staff';
const needWrite = (u) => { if (!canWrite(u)) throw new HttpError(403, 'صلاحيتك للعرض فقط'); };
const needAdmin = (u) => { if (u.role !== 'admin') throw new HttpError(403, 'هذه العملية لمدير النظام فقط'); };

const attempts = new Map();
function throttle(key) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter(t => now - t < 600000);
  if (a.length >= 8) throw new HttpError(429, 'محاولات كثيرة، حاول بعد 10 دقائق');
  a.push(now); attempts.set(key, a);
}

async function setup(b) {
  const [u] = await C.db().query('SELECT COUNT(*) c FROM users');
  if (u[0].c > 0) throw new HttpError(403, 'تم إعداد النظام من قبل');
  const username = String(b.username || '').trim().toLowerCase(), pw = String(b.password || '');
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) throw bad('اسم المستخدم: حروف إنجليزية وأرقام (3 على الأقل)');
  if (pw.length < 8) throw bad('كلمة المرور 8 أحرف على الأقل');
  await C.tx(async (conn) => {
    const set = { company_name: String(b.company || 'مصنع الملابس').slice(0, 120), currency: 'ج.م', invoice_footer: 'شكراً لتعاملكم معنا', address: '', phone: '' };
    for (const k of Object.keys(set)) await conn.query('INSERT INTO settings(k,v) VALUES(?,?)', [k, set[k]]);
    for (const s of DEFAULT_STAGES) await conn.query('INSERT INTO stages(name,seq) VALUES(?,?)', s);
    await conn.query('INSERT INTO users(username,name,pass_hash,role) VALUES(?,?,?,?)', [username, 'مدير النظام', C.hashPw(pw), 'admin']);
  });
  await C.audit({ username }, 'setup', 'system', 0, 'first-run setup');
}
async function login(b, ip) {
  const username = String(b.username || '').trim().toLowerCase();
  throttle(ip + '|' + username);
  const [r] = await C.db().query('SELECT * FROM users WHERE username=?', [username]);
  const u = r[0];
  if (!u || !u.active || !C.checkPw(String(b.password || ''), u.pass_hash)) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  attempts.delete(ip + '|' + username);
  await C.audit({ id: u.id, username }, 'login', 'user', u.id);
  return { token: C.sign({ uid: u.id, exp: Date.now() + 12 * 3600 * 1000 }), user: pub(u) };
}

// ---------- core calculations ----------
async function activeStages(conn) { return (await conn.query('SELECT * FROM stages WHERE active=1 ORDER BY seq,id'))[0]; }
// returns per cut progress
async function progressOf(conn, cutIds) {
  if (!cutIds.length) return {};
  const stages = await activeStages(conn);
  const [cuts] = await conn.query('SELECT id,pieces_cut,damaged_pcs FROM cuts WHERE id IN (?)', [cutIds]);
  const [logs] = await conn.query('SELECT cut_id,stage_id,SUM(qty_ok) ok,SUM(qty_defect) df FROM prod_logs WHERE cut_id IN (?) GROUP BY cut_id,stage_id', [cutIds]);
  const [dl] = await conn.query('SELECT cut_id,SUM(qty) q FROM delivery_lines WHERE cut_id IN (?) GROUP BY cut_id', [cutIds]);
  const out = {};
  for (const c of cuts) {
    const net = c.pieces_cut - c.damaged_pcs;
    let input = net; const st = [];
    for (const s of stages) {
      const l = logs.find(x => x.cut_id === c.id && x.stage_id === s.id);
      const ok = l ? +l.ok : 0, df = l ? +l.df : 0;
      st.push({ stage_id: s.id, name: s.name, input, ok, defect: df, wip: input - ok - df });
      input = ok;
    }
    const finished = stages.length ? st[st.length - 1].ok : net;
    const delivered = +((dl.find(x => x.cut_id === c.id) || {}).q || 0);
    const defects = st.reduce((a, x) => a + x.defect, 0);
    out[c.id] = { net, stages: st, finished, delivered, at_factory: finished - delivered, defects, wip: st.reduce((a, x) => a + Math.max(x.wip, 0), 0) - (stages.length ? 0 : 0) };
  }
  return out;
}
async function validateCut(conn, cutId) {
  const p = (await progressOf(conn, [cutId]))[cutId];
  if (!p) return;
  for (const s of p.stages) if (s.wip < 0) throw bad('العملية تخلّ بكميات مرحلة "' + s.name + '" اللاحقة، عدّل المراحل اللاحقة أولاً');
  if (p.at_factory < 0) throw bad('العملية تخلّ بكميات التسليم، احذف التسليم أولاً');
}

// ---------- simple tables ----------
async function simple(req, u, head, id, body, q) {
  const cfg = SIMPLE[head], m = req.method;
  if (m === 'GET') {
    if (id) { const r = await Q('SELECT * FROM `' + head + '` WHERE id=?', [id]); if (!r[0]) throw new HttpError(404, 'غير موجود'); return r[0]; }
    let sql = 'SELECT * FROM `' + head + '`', p = [];
    if (q.client_id && ['models', 'payments'].includes(head)) { sql += ' WHERE client_id=?'; p.push(+q.client_id); }
    return Q(sql + ' ORDER BY ' + cfg.order, p);
  }
  needWrite(u);
  if (m === 'DELETE' && id) {
    for (const t of cfg.used) { const col = (SIMPLE_USEDCOL[head] || {})[t] || (head === 'stages' ? 'stage_id' : 'client_id'); const c = await Q('SELECT COUNT(*) c FROM `' + t + '` WHERE `' + col + '`=?', [id]); if (c[0].c) throw bad('لا يمكن الحذف: السجل مستخدم في مستندات أخرى، يمكنك إيقافه بدل الحذف'); }
    await C.db().query('DELETE FROM `' + head + '` WHERE id=?', [id]); await C.audit(u, 'delete', head, id); return { ok: true };
  }
  const o = {};
  for (const c of cfg.cols) if (body[c] !== undefined) o[c] = body[c] === '' ? null : body[c];
  if (head === 'clients') { if (m === 'POST' || 'name' in o) { o.name = str(o.name, 160, 'الاسم', true); } if (m === 'POST' || 'code' in o) o.code = str(o.code, 30, 'الكود', true); }
  if (head === 'models') { if (m === 'POST' || 'name' in o) o.name = str(o.name, 160, 'الاسم', true); if (m === 'POST' || 'code' in o) o.code = str(o.code, 40, 'الكود', true); if ('price' in o) o.price = Math.max(0, r2(o.price || 0)); }
  if (head === 'stages') { o.name = str(o.name, 80, 'الاسم', true); o.seq = int(o.seq ?? 1, 'الترتيب'); }
  if (head === 'payments') { if (!isDate(o.date)) throw bad('التاريخ غير صحيح'); o.amount = r2(pos(o.amount, 'المبلغ')); if (!o.client_id) throw bad('اختر العميل'); }
  if (m === 'POST') {
    const keys = Object.keys(o); if (!keys.length) throw bad('لا توجد بيانات');
    const [r] = await C.db().query('INSERT INTO `' + head + '`(' + keys.map(k => '`' + k + '`').join(',') + ') VALUES(' + keys.map(() => '?').join(',') + ')', keys.map(k => o[k]));
    await C.audit(u, 'create', head, r.insertId); return { id: r.insertId };
  }
  if (m === 'PUT' && id) {
    const keys = Object.keys(o); if (!keys.length) return { ok: true };
    await C.db().query('UPDATE `' + head + '` SET ' + keys.map(k => '`' + k + '`=?').join(',') + ' WHERE id=?', [...keys.map(k => o[k]), id]);
    await C.audit(u, 'update', head, id); return { ok: true };
  }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---------- receipts (client fabric, not company stock) ----------
async function receiptsApi(req, u, id, body) {
  const m = req.method;
  if (m === 'GET') {
    if (id) {
      const h = (await Q('SELECT r.*, c.name client_name FROM receipts r JOIN clients c ON c.id=r.client_id WHERE r.id=?', [id]))[0];
      if (!h) throw new HttpError(404, 'غير موجود');
      h.rolls = await Q('SELECT * FROM rolls WHERE receipt_id=? ORDER BY id', [id]); return h;
    }
    return Q('SELECT r.*, c.name client_name, COUNT(l.id) roll_count, COALESCE(SUM(l.length_m),0) length_m, COALESCE(SUM(l.weight_kg),0) weight_kg, COALESCE(SUM(l.used_m),0) used_m FROM receipts r JOIN clients c ON c.id=r.client_id LEFT JOIN rolls l ON l.receipt_id=r.id GROUP BY r.id ORDER BY r.date DESC, r.id DESC LIMIT 500');
  }
  needWrite(u);
  if (m === 'POST') {
    if (!isDate(body.date)) throw bad('تاريخ الاستلام غير صحيح');
    const cl = (await Q('SELECT id FROM clients WHERE id=?', [+body.client_id]))[0]; if (!cl) throw bad('اختر العميل');
    const rolls = Array.isArray(body.rolls) ? body.rolls : [];
    if (!rolls.length) throw bad('أضف توب واحد على الأقل');
    return C.tx(async (conn) => {
      const n = await C.nextSeq(conn, 'RC'); const number = 'RC-' + C.pad(n);
      const [r] = await conn.query('INSERT INTO receipts(number,client_id,date,ref_no,notes,created_by) VALUES(?,?,?,?,?,?)', [number, cl.id, body.date, str(body.ref_no, 60), str(body.notes, 255), u.id]);
      let i = 0;
      for (const x of rolls) {
        i++;
        const len = pos(x.length_m, 'طول التوب (متر) في السطر ' + i); const wt = x.weight_kg === '' || x.weight_kg == null ? 0 : Number(x.weight_kg);
        if (!isFinite(wt) || wt < 0) throw bad('وزن غير صحيح في السطر ' + i);
        await conn.query('INSERT INTO rolls(receipt_id,client_id,roll_no,fabric_type,color,length_m,weight_kg,notes) VALUES(?,?,?,?,?,?,?,?)', [r.insertId, cl.id, str(x.roll_no, 60) || (number + '/' + i), str(x.fabric_type, 100), str(x.color, 60), r2(len), r2(wt), str(x.notes, 255)]);
      }
      await C.audit(u, 'create', 'receipt', r.insertId, number, conn);
      return { id: r.insertId, number };
    });
  }
  if (m === 'PUT' && id) {
    await C.db().query('UPDATE receipts SET ref_no=?, notes=? WHERE id=?', [str(body.ref_no, 60), str(body.notes, 255), id]); return { ok: true };
  }
  if (m === 'DELETE' && id) {
    const used = await Q('SELECT COUNT(*) c FROM rolls WHERE receipt_id=? AND used_m>0', [id]);
    if (used[0].c) throw bad('لا يمكن حذف الاستلام: توجد أتواب تم استخدامها في أوامر قص');
    await C.tx(async (conn) => { await conn.query('DELETE FROM rolls WHERE receipt_id=?', [id]); await conn.query('DELETE FROM receipts WHERE id=?', [id]); });
    await C.audit(u, 'delete', 'receipt', id); return { ok: true };
  }
  throw new HttpError(405, 'طريقة غير مدعومة');
}
async function rollsApi(q) {
  let sql = 'SELECT l.*, (l.length_m-l.used_m) remaining_m, ROUND(l.weight_kg*(l.length_m-l.used_m)/l.length_m,2) remaining_kg, r.number receipt_number, r.date receipt_date, c.name client_name FROM rolls l JOIN receipts r ON r.id=l.receipt_id JOIN clients c ON c.id=l.client_id WHERE 1=1', p = [];
  if (q.client_id) { sql += ' AND l.client_id=?'; p.push(+q.client_id); }
  if (q.available) sql += ' AND l.length_m-l.used_m>0.004';
  return Q(sql + ' ORDER BY l.id DESC LIMIT 2000', p);
}

// ---------- cutting orders ----------
async function cutsApi(req, u, id, body) {
  const m = req.method;
  if (m === 'GET') {
    if (id) {
      const h = (await Q('SELECT t.*, c.name client_name, md.code model_code, md.name model_name, md.price model_price FROM cuts t JOIN clients c ON c.id=t.client_id JOIN models md ON md.id=t.model_id WHERE t.id=?', [id]))[0];
      if (!h) throw new HttpError(404, 'غير موجود');
      h.layers = await Q('SELECT y.*, l.roll_no, l.color, l.fabric_type FROM cut_layers y JOIN rolls l ON l.id=y.roll_id WHERE y.cut_id=? ORDER BY y.id', [id]);
      h.sizes = await Q('SELECT * FROM cut_sizes WHERE cut_id=? ORDER BY id', [id]);
      h.logs = await Q('SELECT p.*, s.name stage_name FROM prod_logs p JOIN stages s ON s.id=p.stage_id WHERE p.cut_id=? ORDER BY p.date,p.id', [id]);
      h.progress = (await progressOf(C.db(), [id]))[id]; return h;
    }
    const rows = await Q('SELECT t.*, c.name client_name, md.code model_code, md.name model_name FROM cuts t JOIN clients c ON c.id=t.client_id JOIN models md ON md.id=t.model_id ORDER BY t.date DESC, t.id DESC LIMIT 500');
    const pr = await progressOf(C.db(), rows.map(r => r.id));
    return rows.map(r => ({ ...r, ...pr[r.id], stages: undefined, progress: pr[r.id] }));
  }
  needWrite(u);
  if (m === 'POST') {
    if (!isDate(body.date)) throw bad('تاريخ القص غير صحيح');
    const model = (await Q('SELECT * FROM models WHERE id=?', [+body.model_id]))[0]; if (!model) throw bad('اختر الموديل');
    const client_id = +body.client_id; const cl = (await Q('SELECT id FROM clients WHERE id=?', [client_id]))[0]; if (!cl) throw bad('اختر العميل');
    if (model.client_id && model.client_id !== client_id) throw bad('هذا الموديل يخص عميلاً آخر');
    const marker = pos(body.marker_len, 'طول الماركر (متر)');
    const sizes = (Array.isArray(body.sizes) ? body.sizes : []).filter(s => s && String(s.size || '').trim());
    if (!sizes.length) throw bad('أدخل المقاسات ونسبتها في الماركر');
    const layers = (Array.isArray(body.layers) ? body.layers : []).filter(l => l && l.roll_id);
    if (!layers.length) throw bad('أضف توب واحد على الأقل مع عدد الطبقات');
    return C.tx(async (conn) => {
      const n = await C.nextSeq(conn, 'CT'); const number = 'CT-' + C.pad(n);
      const ratioSum = sizes.reduce((a, s) => a + int(s.ratio, 'نسبة المقاس'), 0); if (ratioSum <= 0) throw bad('نسب المقاسات يجب أن تكون أكبر من صفر');
      let totalLayers = 0, used = 0, waste = 0; const need = {}; const rowsL = [];
      for (const l of layers) {
        const ly = int(l.layers, 'عدد الطبقات'); if (ly <= 0) throw bad('عدد الطبقات يجب أن يكون أكبر من صفر');
        const ew = l.end_waste_m === '' || l.end_waste_m == null ? 0 : Number(l.end_waste_m); if (!isFinite(ew) || ew < 0) throw bad('هدر نهاية التوب غير صحيح');
        const um = r2(ly * marker + ew);
        need[l.roll_id] = r2((need[l.roll_id] || 0) + um);
        rowsL.push({ roll_id: +l.roll_id, ly, ew: r2(ew), um });
        totalLayers += ly; used += um; waste += ew;
      }
      for (const rid of Object.keys(need)) {
        const [rr] = await conn.query('SELECT * FROM rolls WHERE id=? FOR UPDATE', [rid]);
        if (!rr[0]) throw bad('توب غير موجود'); if (rr[0].client_id !== client_id) throw bad('التوب ' + rr[0].roll_no + ' ليس ملك هذا العميل');
        const rem = r2(rr[0].length_m - rr[0].used_m);
        if (need[rid] > rem + 0.004) throw bad('التوب ' + rr[0].roll_no + ': المطلوب ' + need[rid] + ' م والمتاح ' + rem + ' م فقط');
        await conn.query('UPDATE rolls SET used_m=used_m+? WHERE id=?', [need[rid], rid]);
      }
      const pieces = totalLayers * ratioSum; const dmg = int(body.damaged_pcs || 0, 'القطع التالفة');
      if (dmg > pieces) throw bad('القطع التالفة أكبر من إجمالي القطع المقصوصة');
      const [r] = await conn.query('INSERT INTO cuts(number,client_id,model_id,date,marker_len,total_layers,pieces_cut,damaged_pcs,fabric_used_m,waste_m,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [number, client_id, model.id, body.date, marker, totalLayers, pieces, dmg, r2(used), r2(waste), str(body.notes, 255), u.id]);
      for (const l of rowsL) await conn.query('INSERT INTO cut_layers(cut_id,roll_id,layers,end_waste_m,used_m) VALUES(?,?,?,?,?)', [r.insertId, l.roll_id, l.ly, l.ew, l.um]);
      for (const s of sizes) await conn.query('INSERT INTO cut_sizes(cut_id,size,ratio,pieces) VALUES(?,?,?,?)', [r.insertId, str(s.size, 20), int(s.ratio, 'نسبة'), totalLayers * int(s.ratio, 'نسبة')]);
      await C.audit(u, 'create', 'cut', r.insertId, number, conn);
      return { id: r.insertId, number, pieces_cut: pieces };
    });
  }
  if (m === 'PUT' && id) { await C.db().query('UPDATE cuts SET notes=? WHERE id=?', [str(body.notes, 255), id]); return { ok: true }; }
  if (m === 'DELETE' && id) {
    await C.tx(async (conn) => {
      const [a] = await conn.query('SELECT COUNT(*) c FROM prod_logs WHERE cut_id=?', [id]); const [b] = await conn.query('SELECT COUNT(*) c FROM delivery_lines WHERE cut_id=?', [id]);
      if (a[0].c || b[0].c) throw bad('لا يمكن حذف أمر القص: عليه حركات إنتاج أو تسليم');
      const [ly] = await conn.query('SELECT roll_id,used_m FROM cut_layers WHERE cut_id=?', [id]);
      for (const l of ly) await conn.query('UPDATE rolls SET used_m=GREATEST(used_m-?,0) WHERE id=?', [l.used_m, l.roll_id]);
      await conn.query('DELETE FROM cut_layers WHERE cut_id=?', [id]); await conn.query('DELETE FROM cut_sizes WHERE cut_id=?', [id]); await conn.query('DELETE FROM cuts WHERE id=?', [id]);
    });
    await C.audit(u, 'delete', 'cut', id); return { ok: true };
  }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---------- production stages ----------
async function prodApi(req, u, id, body, q) {
  const m = req.method;
  if (m === 'GET') {
    let sql = 'SELECT p.*, s.name stage_name, t.number cut_number, md.name model_name, c.name client_name FROM prod_logs p JOIN stages s ON s.id=p.stage_id JOIN cuts t ON t.id=p.cut_id JOIN models md ON md.id=t.model_id JOIN clients c ON c.id=t.client_id WHERE 1=1', pr = [];
    if (q.cut_id) { sql += ' AND p.cut_id=?'; pr.push(+q.cut_id); }
    return Q(sql + ' ORDER BY p.date DESC, p.id DESC LIMIT 500', pr);
  }
  needWrite(u);
  if (m === 'POST') {
    if (!isDate(body.date)) throw bad('التاريخ غير صحيح');
    const ok = int(body.qty_ok || 0, 'الكمية السليمة'), df = int(body.qty_defect || 0, 'كمية العيوب');
    if (ok + df <= 0) throw bad('أدخل كمية');
    return C.tx(async (conn) => {
      const [c] = await conn.query('SELECT id FROM cuts WHERE id=? FOR UPDATE', [+body.cut_id]); if (!c[0]) throw bad('اختر أمر القص');
      const [s] = await conn.query('SELECT * FROM stages WHERE id=? AND active=1', [+body.stage_id]); if (!s[0]) throw bad('اختر المرحلة');
      const p = (await progressOf(conn, [c[0].id]))[c[0].id];
      const st = p.stages.find(x => x.stage_id === s[0].id);
      if (ok + df > st.wip) throw bad('الكمية أكبر من المتاح في مرحلة "' + s[0].name + '": المتاح ' + st.wip + ' قطعة');
      const [r] = await conn.query('INSERT INTO prod_logs(cut_id,stage_id,date,qty_ok,qty_defect,line_name,notes,created_by) VALUES(?,?,?,?,?,?,?,?)', [c[0].id, s[0].id, body.date, ok, df, str(body.line_name, 80), str(body.notes, 255), u.id]);
      await C.audit(u, 'create', 'prod', r.insertId, 'cut ' + c[0].id + ' stage ' + s[0].name + ' ok ' + ok + ' df ' + df, conn);
      return { id: r.insertId };
    });
  }
  if (m === 'DELETE' && id) {
    await C.tx(async (conn) => {
      const [l] = await conn.query('SELECT cut_id FROM prod_logs WHERE id=?', [id]); if (!l[0]) throw new HttpError(404, 'غير موجود');
      await conn.query('DELETE FROM prod_logs WHERE id=?', [id]); await validateCut(conn, l[0].cut_id);
    });
    await C.audit(u, 'delete', 'prod', id); return { ok: true };
  }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---------- deliveries back to client ----------
async function deliveriesApi(req, u, id, body) {
  const m = req.method;
  if (m === 'GET') {
    if (id) {
      const h = (await Q('SELECT d.*, c.name client_name FROM deliveries d JOIN clients c ON c.id=d.client_id WHERE d.id=?', [id]))[0]; if (!h) throw new HttpError(404, 'غير موجود');
      h.lines = await Q('SELECT l.*, t.number cut_number, md.code model_code, md.name model_name, md.price model_price FROM delivery_lines l JOIN cuts t ON t.id=l.cut_id JOIN models md ON md.id=t.model_id WHERE l.delivery_id=? ORDER BY l.id', [id]); return h;
    }
    return Q('SELECT d.*, c.name client_name, COALESCE(SUM(l.qty),0) qty, SUM(CASE WHEN l.invoice_id IS NULL THEN 0 ELSE 1 END) billed_lines, COUNT(l.id) lines FROM deliveries d JOIN clients c ON c.id=d.client_id LEFT JOIN delivery_lines l ON l.delivery_id=d.id GROUP BY d.id ORDER BY d.date DESC, d.id DESC LIMIT 500');
  }
  needWrite(u);
  if (m === 'POST') {
    if (!isDate(body.date)) throw bad('تاريخ التسليم غير صحيح');
    const client_id = +body.client_id; const cl = (await Q('SELECT id FROM clients WHERE id=?', [client_id]))[0]; if (!cl) throw bad('اختر العميل');
    const lines = (Array.isArray(body.lines) ? body.lines : []).filter(l => l && l.cut_id && Number(l.qty) > 0);
    if (!lines.length) throw bad('أضف سطراً واحداً على الأقل بكمية');
    return C.tx(async (conn) => {
      const sum = {}; for (const l of lines) sum[l.cut_id] = (sum[l.cut_id] || 0) + int(l.qty, 'الكمية');
      for (const cid of Object.keys(sum)) {
        const [c] = await conn.query('SELECT id,client_id,number FROM cuts WHERE id=? FOR UPDATE', [cid]); if (!c[0]) throw bad('أمر قص غير موجود');
        if (c[0].client_id !== client_id) throw bad('أمر القص ' + c[0].number + ' يخص عميلاً آخر');
        const p = (await progressOf(conn, [c[0].id]))[c[0].id];
        if (sum[cid] > p.at_factory) throw bad('أمر ' + c[0].number + ': المتاح للتسليم ' + p.at_factory + ' قطعة فقط (المنتهي ناقص المسلّم)');
      }
      const n = await C.nextSeq(conn, 'DL'); const number = 'DL-' + C.pad(n);
      const [r] = await conn.query('INSERT INTO deliveries(number,client_id,date,driver,notes,created_by) VALUES(?,?,?,?,?,?)', [number, client_id, body.date, str(body.driver, 80), str(body.notes, 255), u.id]);
      for (const l of lines) await conn.query('INSERT INTO delivery_lines(delivery_id,cut_id,qty) VALUES(?,?,?)', [r.insertId, +l.cut_id, int(l.qty, 'الكمية')]);
      await C.audit(u, 'create', 'delivery', r.insertId, number, conn);
      return { id: r.insertId, number };
    });
  }
  if (m === 'DELETE' && id) {
    const b = await Q('SELECT COUNT(*) c FROM delivery_lines WHERE delivery_id=? AND invoice_id IS NOT NULL', [id]);
    if (b[0].c) throw bad('لا يمكن حذف التسليم: تمت فوترته، احذف الفاتورة أولاً');
    await C.tx(async (conn) => { await conn.query('DELETE FROM delivery_lines WHERE delivery_id=?', [id]); await conn.query('DELETE FROM deliveries WHERE id=?', [id]); });
    await C.audit(u, 'delete', 'delivery', id); return { ok: true };
  }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---------- billing (service charge per piece) ----------
async function unbilled(client_id) {
  return Q('SELECT l.id delivery_line_id, l.qty, d.number delivery_number, d.date, t.id cut_id, t.number cut_number, md.code model_code, md.name model_name, md.price FROM delivery_lines l JOIN deliveries d ON d.id=l.delivery_id JOIN cuts t ON t.id=l.cut_id JOIN models md ON md.id=t.model_id WHERE l.invoice_id IS NULL AND d.client_id=? ORDER BY d.date, l.id', [client_id]);
}
async function invoicesApi(req, u, id, body) {
  const m = req.method;
  if (m === 'GET') {
    if (id) {
      const h = (await Q('SELECT i.*, c.name client_name, c.address client_address, c.phone client_phone FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=?', [id]))[0]; if (!h) throw new HttpError(404, 'غير موجود');
      h.lines = await Q('SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY id', [id]); return h;
    }
    return Q('SELECT i.*, c.name client_name FROM invoices i JOIN clients c ON c.id=i.client_id ORDER BY i.date DESC, i.id DESC LIMIT 500');
  }
  needWrite(u);
  if (m === 'POST') {
    if (!isDate(body.date)) throw bad('تاريخ الفاتورة غير صحيح');
    const client_id = +body.client_id; const cl = (await Q('SELECT id FROM clients WHERE id=?', [client_id]))[0]; if (!cl) throw bad('اختر العميل');
    const lines = (Array.isArray(body.lines) ? body.lines : []).filter(l => l && (l.delivery_line_id || String(l.description || '').trim()));
    if (!lines.length) throw bad('أضف بنداً واحداً على الأقل');
    return C.tx(async (conn) => {
      const n = await C.nextSeq(conn, 'IN'); const number = 'IN-' + C.pad(n);
      let total = 0; const rows = [];
      for (const l of lines) {
        let desc = str(l.description, 255), qty = Number(l.qty); const price = Number(l.price);
        if (!isFinite(price) || price < 0) throw bad('سعر غير صحيح');
        if (l.delivery_line_id) {
          const [dl] = await conn.query('SELECT l.id,l.qty,l.invoice_id,d.client_id,d.number dn,md.code,md.name FROM delivery_lines l JOIN deliveries d ON d.id=l.delivery_id JOIN cuts t ON t.id=l.cut_id JOIN models md ON md.id=t.model_id WHERE l.id=? FOR UPDATE', [+l.delivery_line_id]);
          if (!dl[0] || dl[0].client_id !== client_id) throw bad('بند تسليم غير صالح لهذا العميل');
          if (dl[0].invoice_id) throw bad('بند التسليم من ' + dl[0].dn + ' تمت فوترته من قبل');
          qty = dl[0].qty; if (!desc) desc = 'خدمة تصنيع ' + dl[0].name + ' (' + dl[0].code + ') - تسليم ' + dl[0].dn;
        } else if (!isFinite(qty) || qty <= 0) throw bad('كمية غير صحيحة');
        const amount = r2(qty * price); total += amount; rows.push({ dl: l.delivery_line_id || null, desc, qty, price: r2(price), amount });
      }
      const [r] = await conn.query('INSERT INTO invoices(number,client_id,date,notes,total,created_by) VALUES(?,?,?,?,?,?)', [number, client_id, body.date, str(body.notes, 255), r2(total), u.id]);
      for (const x of rows) {
        await conn.query('INSERT INTO invoice_lines(invoice_id,delivery_line_id,description,qty,price,amount) VALUES(?,?,?,?,?,?)', [r.insertId, x.dl, x.desc, x.qty, x.price, x.amount]);
        if (x.dl) await conn.query('UPDATE delivery_lines SET invoice_id=? WHERE id=?', [r.insertId, x.dl]);
      }
      await C.audit(u, 'create', 'invoice', r.insertId, number + ' total ' + r2(total), conn);
      return { id: r.insertId, number, total: r2(total) };
    });
  }
  if (m === 'DELETE' && id) {
    await C.tx(async (conn) => { await conn.query('UPDATE delivery_lines SET invoice_id=NULL WHERE invoice_id=?', [id]); await conn.query('DELETE FROM invoice_lines WHERE invoice_id=?', [id]); await conn.query('DELETE FROM invoices WHERE id=?', [id]); });
    await C.audit(u, 'delete', 'invoice', id); return { ok: true };
  }
  throw new HttpError(405, 'طريقة غير مدعومة');
}

// ---------- reports ----------
async function clientPieces(conn) {
  const cuts = await Q('SELECT id,client_id FROM cuts'); const pr = await progressOf(conn, cuts.map(c => c.id)); const out = {};
  for (const c of cuts) { const p = pr[c.id]; const o = out[c.client_id] || (out[c.client_id] = { in_production: 0, finished_at_factory: 0, delivered: 0, defects: 0 });
    o.in_production += p.stages.reduce((a, s) => a + Math.max(s.wip, 0), 0); o.finished_at_factory += p.at_factory; o.delivered += p.delivered; o.defects += p.defects + 0; }
  return out;
}
async function reports(kind, q) {
  if (kind === 'stock') {
    const w = q.client_id ? ' WHERE l.client_id=' + (+q.client_id) : '';
    const rolls = await Q('SELECT c.id client_id, c.name client_name, COALESCE(l.fabric_type,"") fabric_type, COALESCE(l.color,"") color, COUNT(*) rolls, SUM(l.length_m) received_m, SUM(l.used_m) used_m, SUM(l.length_m-l.used_m) remaining_m, SUM(l.weight_kg) received_kg, SUM(ROUND(l.weight_kg*(l.length_m-l.used_m)/l.length_m,2)) remaining_kg FROM rolls l JOIN clients c ON c.id=l.client_id' + w + ' GROUP BY c.id,c.name,l.fabric_type,l.color ORDER BY c.name,l.fabric_type,l.color');
    const pcs = await clientPieces(C.db());
    const clients = await Q('SELECT id,name FROM clients ORDER BY name');
    return { rolls, pieces: clients.filter(c => !q.client_id || c.id === +q.client_id).map(c => ({ client_id: c.id, client_name: c.name, ...(pcs[c.id] || { in_production: 0, finished_at_factory: 0, delivered: 0, defects: 0 }) })) };
  }
  if (kind === 'statement') {
    const id = +q.client_id; if (!id) throw bad('اختر العميل');
    const cl = (await Q('SELECT id,name,phone,address FROM clients WHERE id=?', [id]))[0]; if (!cl) throw bad('عميل غير موجود');
    const inv = await Q('SELECT id,date,number,total amount FROM invoices WHERE client_id=?', [id]); const pay = await Q('SELECT id,date,amount,method FROM payments WHERE client_id=?', [id]);
    const rows = [...inv.map(x => ({ date: x.date, kind: 'invoice', ref: x.number, debit: +x.amount, credit: 0 })), ...pay.map(x => ({ date: x.date, kind: 'payment', ref: 'دفعة ' + (x.method || ''), debit: 0, credit: +x.amount }))].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    let bal = 0; rows.forEach(r => { bal = r2(bal + r.debit - r.credit); r.balance = bal; });
    return { client: cl, rows, balance: bal };
  }
  if (kind === 'waste') {
    return Q('SELECT t.number, t.date, c.name client_name, md.name model_name, t.fabric_used_m, t.waste_m, ROUND(100*t.waste_m/t.fabric_used_m,2) waste_pct, t.pieces_cut, t.damaged_pcs, COALESCE((SELECT SUM(qty_defect) FROM prod_logs p WHERE p.cut_id=t.id),0) prod_defects FROM cuts t JOIN clients c ON c.id=t.client_id JOIN models md ON md.id=t.model_id WHERE t.date>=? AND t.date<=? ORDER BY t.date DESC,t.id DESC', [q.from || '2000-01-01', q.to || '2999-12-31']);
  }
  if (kind === 'dashboard') {
    const s = (await Q('SELECT (SELECT COUNT(*) FROM clients WHERE active=1) clients, (SELECT COALESCE(SUM(length_m-used_m),0) FROM rolls) fabric_m, (SELECT COUNT(*) FROM rolls WHERE length_m-used_m>0.004) rolls_left, (SELECT COALESCE(SUM(total),0) FROM invoices) invoiced, (SELECT COALESCE(SUM(amount),0) FROM payments) paid, (SELECT COUNT(*) FROM cuts) cuts'))[0];
    const cuts = await Q('SELECT id FROM cuts'); const pr = await progressOf(C.db(), cuts.map(c => c.id));
    let inprod = 0, ready = 0, open = 0, delivered = 0;
    for (const id of Object.keys(pr)) { const p = pr[id]; inprod += p.stages.reduce((a, x) => a + Math.max(x.wip, 0), 0); ready += p.at_factory; delivered += p.delivered; if (p.net - p.delivered - p.defects > 0) open++; }
    const ub = await Q('SELECT COALESCE(SUM(l.qty),0) qty, COALESCE(SUM(l.qty*md.price),0) value FROM delivery_lines l JOIN cuts t ON t.id=l.cut_id JOIN models md ON md.id=t.model_id WHERE l.invoice_id IS NULL');
    return { ...s, balance: r2(s.invoiced - s.paid), in_production: inprod, ready_to_deliver: ready, delivered, open_orders: open, unbilled_qty: +ub[0].qty, unbilled_value: r2(ub[0].value) };
  }
  throw new HttpError(404, 'تقرير غير موجود');
}

// ---------- router ----------
async function route(req, url, body) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const q = Object.fromEntries(url.searchParams); const m = req.method; const head = parts[0];
  if (head === 'health') return { ok: true, t: Date.now() };
  if (head === 'status') { const [r] = await C.db().query('SELECT COUNT(*) c FROM users'); return { setup_needed: r[0].c === 0 }; }
  if (head === 'setup' && m === 'POST') { await setup(body); return { ok: true }; }
  if (head === 'login' && m === 'POST') return login(body, req.socket.remoteAddress || 'ip');
  const u = await auth(req);
  const id = parts[1] && /^\d+$/.test(parts[1]) ? +parts[1] : null;
  if (head === 'me') return { user: pub(u.raw), settings: await C.getSettings() };
  if (head === 'password' && m === 'POST') {
    if (!C.checkPw(String(body.old || ''), u.raw.pass_hash)) throw bad('كلمة المرور الحالية غير صحيحة');
    if (String(body.password || '').length < 8) throw bad('كلمة المرور 8 أحرف على الأقل');
    await C.db().query('UPDATE users SET pass_hash=? WHERE id=?', [C.hashPw(body.password), u.id]); await C.audit(u, 'password', 'user', u.id); return { ok: true };
  }
  if (head === 'settings') {
    if (m === 'GET') return C.getSettings();
    needAdmin(u);
    for (const k of Object.keys(body)) if (/^[a-z_]{2,40}$/.test(k)) await C.db().query('INSERT INTO settings(k,v) VALUES(?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, String(body[k] ?? '').slice(0, 500)]);
    await C.audit(u, 'update', 'settings', 0, Object.keys(body).join(',')); return { ok: true };
  }
  if (head === 'users') {
    needAdmin(u);
    if (m === 'GET') return Q('SELECT id,username,name,role,active,created_at FROM users ORDER BY id');
    if (m === 'POST') {
      const un = String(body.username || '').trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,40}$/.test(un)) throw bad('اسم المستخدم غير صحيح');
      if (String(body.password || '').length < 8) throw bad('كلمة المرور 8 أحرف على الأقل');
      const role = ['admin', 'staff', 'viewer'].includes(body.role) ? body.role : 'staff';
      const [r] = await C.db().query('INSERT INTO users(username,name,pass_hash,role) VALUES(?,?,?,?)', [un, str(body.name, 120) || un, C.hashPw(body.password), role]);
      await C.audit(u, 'create', 'user', r.insertId, un); return { id: r.insertId };
    }
    if (m === 'PUT' && id) {
      const f = [], p = [];
      if (body.name !== undefined) { f.push('name=?'); p.push(str(body.name, 120)); }
      if (body.role !== undefined) { if (!['admin', 'staff', 'viewer'].includes(body.role)) throw bad('دور غير صحيح'); if (id === u.id && body.role !== 'admin') throw bad('لا يمكنك تغيير دور حسابك'); f.push('role=?'); p.push(body.role); }
      if (body.active !== undefined) { if (id === u.id && !+body.active) throw bad('لا يمكنك إيقاف حسابك'); f.push('active=?'); p.push(+body.active ? 1 : 0); }
      if (body.password) { if (String(body.password).length < 8) throw bad('كلمة المرور 8 أحرف على الأقل'); f.push('pass_hash=?'); p.push(C.hashPw(body.password)); }
      if (f.length) await C.db().query('UPDATE users SET ' + f.join(',') + ' WHERE id=?', [...p, id]);
      await C.audit(u, 'update', 'user', id); return { ok: true };
    }
    if (m === 'DELETE' && id) { if (id === u.id) throw bad('لا يمكنك حذف حسابك'); await C.db().query('DELETE FROM users WHERE id=?', [id]); await C.audit(u, 'delete', 'user', id); return { ok: true }; }
  }
  if (head === 'audit') { needAdmin(u); return Q('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500'); }
  if (SIMPLE[head]) return simple(req, u, head, id, body, q);
  if (head === 'receipts') return receiptsApi(req, u, id, body);
  if (head === 'rolls') return rollsApi(q);
  if (head === 'cuts') return cutsApi(req, u, id, body);
  if (head === 'prod') return prodApi(req, u, id, body, q);
  if (head === 'deliveries') return deliveriesApi(req, u, id, body);
  if (head === 'invoices') return invoicesApi(req, u, id, body);
  if (head === 'unbilled') return unbilled(+q.client_id);
  if (head === 'reports') return reports(parts[1], q);
  throw new HttpError(404, 'مسار غير موجود');
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Max-Age': '86400' };
let ready = false, startErr = null;
const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/api/health') return send(200, { ok: true, ready, error: startErr ? String(startErr.message || startErr) : undefined });
  if (!ready) return send(503, { error: startErr ? 'تعذر الاتصال بقاعدة البيانات' : 'الخادم يبدأ التشغيل، حاول بعد لحظات' });
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on('end', async () => {
    try {
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch (e) { throw bad('بيانات غير صالحة'); } }
      const out = await route(req, url, body);
      send(200, out === undefined ? { ok: true } : out);
    } catch (e) {
      if (e instanceof HttpError) return send(e.code, { error: e.message });
      if (e && e.code === 'ER_DUP_ENTRY') return send(400, { error: 'قيمة مكررة: يوجد سجل بنفس الكود أو الاسم' });
      if (e && e.code === 'ER_DATA_TOO_LONG') return send(400, { error: 'قيمة أطول من المسموح في أحد الحقول' });
      if (e && (e.code === 'ER_TRUNCATED_WRONG_VALUE' || e.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || e.code === 'ER_WARN_DATA_OUT_OF_RANGE' || e.code === 'ER_WRONG_VALUE_FOR_TYPE')) return send(400, { error: 'قيمة غير صالحة في أحد الحقول' });
      console.error(e);
      send(500, { error: 'خطأ في الخادم' });
    }
  });
});
server.listen(process.env.PORT || 8080, () => console.log('listening'));
C.initDb().then((n) => { ready = true; console.log('db ready', n); }).catch((e) => { startErr = e; console.error('db init failed', e.message); });
