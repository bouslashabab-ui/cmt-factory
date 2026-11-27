'use strict';
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const SCHEMA = require('./schema');

const cfg = {
  host: process.env.DB_HOST, port: +(process.env.DB_PORT || 4000),
  user: process.env.DB_USER, password: process.env.DB_PASS,
  db: process.env.DB_NAME || 'cmt'
};
const SECRET = process.env.APP_SECRET || crypto.createHash('sha256').update('cmt|' + (cfg.password || '')).digest('hex');
let pool = null;

async function initDb() {
  const base = { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
    ssl: process.env.DB_NOSSL ? undefined : { minVersion: 'TLSv1.2', rejectUnauthorized: true }, dateStrings: true, decimalNumbers: true, timezone: '+00:00' };
  let dbName = cfg.db;
  const c = await mysql.createConnection(base);
  try { await c.query('CREATE DATABASE IF NOT EXISTS `' + dbName + '`'); }
  catch (e) { dbName = 'test'; }
  await c.end();
  pool = mysql.createPool({ ...base, database: dbName, connectionLimit: 6, waitForConnections: true });
  for (const s of SCHEMA) await pool.query(s);
  return dbName;
}
const db = () => pool;

// ---------- auth ----------
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return 's1$' + salt + '$' + h;
}
function checkPw(pw, stored) {
  const p = String(stored).split('$');
  if (p[0] !== 's1') return false;
  const h = crypto.scryptSync(pw, p[1], 64);
  const b = Buffer.from(p[2], 'hex');
  return b.length === h.length && crypto.timingSafeEqual(h, b);
}
function sign(payload) {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  return b + '.' + s;
}
function verify(tok) {
  if (!tok) return null;
  const [b, s] = tok.split('.');
  if (!b || !s) return null;
  const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
function can(user, perm) {
  if (!user) return false;
  const p = user.perms;
  if (p.includes('*')) return true;
  return p.includes(perm) || (perm.endsWith(':view') && p.includes(perm.split(':')[0] + ':edit'));
}

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (m) => new HttpError(400, m);
const money = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const num = (n) => { const x = Number(n); return isFinite(x) ? x : 0; };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

async function audit(user, action, entity, id, detail, conn) {
  try {
    await (conn || pool).query('INSERT INTO audit_log(user_id,username,action,entity,entity_id,detail) VALUES(?,?,?,?,?,?)',
      [user && user.id || null, user && user.username || null, action, entity, String(id ?? ''), detail ? String(detail).slice(0, 2000) : null]);
  } catch (e) { /* never block */ }
}

async function getSettings(conn) {
  const [rows] = await (conn || pool).query('SELECT k,v FROM settings');
  const o = {}; rows.forEach(r => o[r.k] = r.v); return o;
}
async function nextSeq(conn, name) {
  await conn.query('INSERT INTO seq(name,n) VALUES(?,0) ON DUPLICATE KEY UPDATE n=n', [name]);
  const [r] = await conn.query('SELECT n FROM seq WHERE name=? FOR UPDATE', [name]);
  const n = (r[0] ? r[0].n : 0) + 1;
  await conn.query('UPDATE seq SET n=? WHERE name=?', [n, name]);
  return n;
}
const pad = (n, w = 6) => String(n).padStart(w, '0');

async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) { try { await conn.rollback(); } catch (_) {} throw e; }
  finally { conn.release(); }
}

module.exports = { initDb, db, hashPw, checkPw, sign, verify, can, HttpError, bad, money, num, isDate, audit, getSettings, nextSeq, pad, tx };
