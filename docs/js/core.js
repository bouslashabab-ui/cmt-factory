'use strict';
/* CMT factory - core toolkit: api, dom helpers, windows, forms, tables */
const MZ = { api: (window.MZ_CONFIG || {}).api, token: sessionStorage.getItem('cmt_tok') || (() => { try { return localStorage.getItem('cmt_tok'); } catch (e) { return null; } })(), user: null, settings: {}, modules: {}, L: {}, wins: {}, order: [], active: null, pages: {} };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(9).forEach(c => { if (c === null || c === undefined || c === false) return; e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 2) => { const x = Number(n); return isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : ''; };
const fq = (n) => { const x = Number(n); return isFinite(x) ? (Math.round(x * 10000) / 10000).toLocaleString('en-US', { maximumFractionDigits: 4 }) : ''; };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const monthStart = () => today().slice(0, 8) + '01';
const yearStart = () => today().slice(0, 4) + '-01-01';

async function api(method, path, body) {
  let r;
  try {
    r = await fetch(MZ.api + path, { method, headers: { 'Content-Type': 'application/json', ...(MZ.token ? { Authorization: 'Bearer ' + MZ.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { const ob = document.querySelector('.offline-bar'); if (ob) ob.classList.add('on'); throw new Error('تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مرة أخرى'); }
  { const ob = document.querySelector('.offline-bar'); if (ob) ob.classList.remove('on'); }
  let j = null; try { j = await r.json(); } catch (e) { }
  if (r.status === 401 && MZ.token && path !== '/login') { sessionStorage.removeItem('cmt_tok'); try { localStorage.removeItem('cmt_tok'); } catch (e) {} MZ.token = null; location.reload(); throw new Error('انتهت الجلسة'); }
  if (!r.ok) throw new Error((j && j.error) || 'خطأ غير متوقع (' + r.status + ')');
  return j;
}
const GET = (p) => api('GET', p), POST = (p, b) => api('POST', p, b), PUT = (p, b) => api('PUT', p, b), DEL = (p) => api('DELETE', p);
const qs = (o) => '?' + Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

/* ---------- themes (saved per user) ---------- */
const THEMES = [
  { k: 'atelier', name: 'إنديجو أتيليه', desc: 'الهوية الافتراضية: نيلي ليلي وألباستر وخيط وردي', css: 'css/theme2.css', sw: ['#3547e0', '#f2f4fb', '#f0457a'] },
  { k: 'classic', name: 'كلاسيك المصنع', desc: 'الشريط الداكن الأصلي بلمسات لايم ونيلي', css: '', sw: ['#0f1437', '#9aa8ff', '#a9dc45'] },
  { k: 'oasis', name: 'الواحة الزمردية', desc: 'زمردي عميق ورملي دافئ بلمسات ذهبية', css: 'css/oasis.css', sw: ['#0e5f4b', '#faf6ec', '#d9a441'] },
  { k: 'midnight', name: 'ليل فاخر', desc: 'وضع ليلي كامل: كحلي داكن وخيوط ذهبية', css: 'css/midnight.css', sw: ['#0b1020', '#d9b45c', '#ffe9bd'] },
  { k: 'royal', name: 'البنفسج الملكي', desc: 'بنفسجي عميق وذهبي ملكي بخط أميري كلاسيكي', css: 'css/royal.css', sw: ['#5b2a86', '#f6f2fb', '#c9a227'] },
  { k: 'glass', name: 'زجاج الصباح', desc: 'أبيض زجاجي شفاف بلمسات سماوية مشرقة', css: 'css/glass.css', sw: ['#2273b3', '#e9f3fa', '#2f8fd6'] },
  { k: 'sunset', name: 'غروب دافئ', desc: 'مرجاني وعنبري دافئ على كريمي مسائي', css: 'css/sunset.css', sw: ['#d2543a', '#fdf3ea', '#e8a33d'] },
  { k: 'journal', name: 'دفتر تحريري', desc: 'حبر على ورق بأسلوب الصحف وخيط أحمر', css: 'css/journal.css', sw: ['#1c1a17', '#f4f1e8', '#b3392c'] },
  { k: 'lagoon', name: 'لاجون المحيط', desc: 'أزرق محيطي عميق وأكوا زجاجي منعش', css: 'css/lagoon.css', sw: ['#0e6e8c', '#eaf5f6', '#14b8c4'] },
];
function applyTheme(k) {
  const t = THEMES.find(x => x.k === k) || THEMES[0];
  MZ.theme = t.k;
  try { localStorage.setItem('cmt_theme', t.k); } catch (e) { }
  const link = document.getElementById('themeLink');
  if (link) link.href = t.css ? t.css + '?v=62' : '';
}
applyTheme((() => { try { return localStorage.getItem('cmt_theme'); } catch (e) { return null; } })() || 'atelier');

/* ---------- inner layouts (per device, mirrored to settings) ---------- */
const LAYOUTS = [
  { k: 'classic', name: 'القائمة العلوية (الأصلي)' },
  { k: 'side', name: 'القائمة الجانبية الدائمة' },
  { k: 'compact', name: 'المضغوط السريع' },
];
function applyLayout(k) {
  const lay = LAYOUTS.some(x => x.k === k) ? k : 'classic';
  MZ.layout = lay;
  try { localStorage.setItem('cmt_layout', lay); } catch (e) { }
  if (!document.body) return;
  document.body.classList.toggle('lay-side', lay === 'side');
  document.body.classList.toggle('lay-compact', lay === 'compact');
}
applyLayout((() => { try { return localStorage.getItem('cmt_layout'); } catch (e) { return null; } })() || 'classic');

/* ---------- interface font prefs (per device) ---------- */
const UI_FONTS = [
  ['', 'الافتراضي (خط النظام)'],
  ['Cairo', 'القاهرة (Cairo)'],
  ['Tajawal', 'تجوال (Tajawal)'],
  ['Almarai', 'المراعي (Almarai)'],
  ['IBM Plex Sans Arabic', 'IBM بلكس عربي'],
  ['Alexandria', 'إسكندرية (Alexandria)'],
  ['Tahoma', 'تاهوما']
];
function uiPrefs() { try { return JSON.parse(localStorage.getItem('cmt_ui') || '{}'); } catch (e) { return {}; } }
function applyUi(p) {
  p = p || uiPrefs(); MZ.ui = p;
  const r = document.documentElement.style;
  r.setProperty('--tabfs', (p.tsize || 15) + 'px');
  r.setProperty('--basefs', (p.fsize || 14) + 'px');
  r.setProperty('--tabink', p.tcolor || '');
  if (document.body) document.body.style.fontFamily = p.font ? ('"' + p.font + '",Tahoma,"Segoe UI",sans-serif') : '';
}
applyUi();

/* ---------- lite mode: Electron wrapper / weak hardware gets crisp static rendering ---------- */
const IS_ELECTRON = /Electron/.test(navigator.userAgent);
function liteOn() {
  try { const v = localStorage.getItem('cmt_lite'); if (v === 'on') return true; if (v === 'off') return false; } catch (e) {}
  return IS_ELECTRON || (navigator.hardwareConcurrency || 4) <= 2 || !!(navigator.deviceMemory && navigator.deviceMemory <= 2);
}
window.LITE = liteOn();
if (window.LITE) document.documentElement.classList.add('lite');
function themePicker() {
  const grid = h('div', { class: 'thm-grid' }, THEMES.map(t => h('button', { class: 'thm-card' + (MZ.theme === t.k ? ' on' : ''), type: 'button', onclick: guard(async () => {
    applyTheme(t.k);
    if (MZ.token) await PUT('/theme', { theme: t.k });
    m.close(); toast('تم تطبيق سمة «' + t.name + '»');
  }) },
    h('div', { class: 'thm-sw' }, t.sw.map(c => h('i', { style: { background: c } }))),
    h('b', null, t.name), h('small', null, t.desc))));
  const m = modal('اختر سمة النظام', h('div', null, grid, h('p', { class: 'thm-note' }, 'تُحفظ السمة في حسابك وتطبق على كل أجهزتك.')), null);
}

function toast(msg, kind = 'ok') {
  let box = $('#toasts'); if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, msg); box.append(t); SND.play(kind === 'err' ? 'err' : 'ok'); setTimeout(() => t.remove(), kind === 'err' ? 6000 : 2600);
}
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'err'); } };

function can(perm) { return !!MZ.user; }

/* ---------- lookups ---------- */
const LKP = { clients: '/clients', models: '/models', stages: '/stages' };
async function load(name, force) {
  if (!force && MZ.L[name]) return MZ.L[name];
  try { const r = await GET(LKP[name]); MZ.L[name] = Array.isArray(r) ? r : (r && Array.isArray(r.rows) ? r.rows : []); } catch (e) { delete MZ.L[name]; return []; }
  return MZ.L[name];
}
const byId = (name, id) => (MZ.L[name] || []).find(x => x.id === +id);
const nameOf = (name, id) => { const x = byId(name, id); return x ? x.name : ''; };
const accLabel = (a) => a.code + ' - ' + a.name;

/* ---------- combo (datalist) ---------- */
let comboN = 0;
function combo(opts, value, onchange) {
  // opts: [{v,t}]
  const id = 'dl' + (++comboN);
  const dl = h('datalist', { id });
  const inp = h('input', { class: 'inp', list: id, autocomplete: 'off' });
  let map = {};
  const set = (o) => { map = {}; dl.innerHTML = ''; o.forEach(x => { map[x.t] = x.v; dl.append(h('option', { value: x.t })); }); };
  set(opts);
  const get = () => (inp.value === '' ? null : (map[inp.value] ?? null));
  const setv = (v) => { const f = Object.entries(map).find(([, x]) => String(x) === String(v)); inp.value = f ? f[0] : ''; };
  if (value !== undefined && value !== null) setv(value);
  inp.addEventListener('change', () => { if (inp.value && map[inp.value] === undefined) { inp.value = ''; } onchange && onchange(get()); });
  const el = h('span', { class: 'combo' }, inp, dl);
  return { el, inp, get, set: setv, setOptions: (o) => { const cur = get(); set(o); setv(cur); } };
}
const optsOf = (name, filter, label) => (MZ.L[name] || []).filter(filter || (() => true)).map(x => ({ v: x.id, t: label ? label(x) : (x.code ? x.code + ' - ' : '') + x.name }));

/* ---------- field factory ---------- */
function mkField(f, val) {
  let el, get, set;
  const T = f.type || 'text';
  if (T === 'select') {
    el = h('select', { class: 'inp' }, h('option', { value: '' }, '—'), (f.options || []).map(o => h('option', { value: o.v }, o.t)));
    get = () => el.value === '' ? null : el.value; set = (v) => { el.value = v ?? ''; };
  } else if (T === 'ref') {
    const c = combo(f.ref ? f.ref() : []); el = c.el; get = c.get; set = c.set; el._combo = c;
  } else if (T === 'check') {
    el = h('input', { type: 'checkbox', class: 'chk' }); get = () => el.checked ? 1 : 0; set = (v) => { el.checked = !!+v; };
  } else if (T === 'textarea') {
    el = h('textarea', { class: 'inp', rows: 3 }); get = () => el.value || null; set = (v) => { el.value = v ?? ''; };
  } else {
    el = h('input', { class: 'inp', type: T === 'number' ? 'number' : (T === 'date' ? 'date' : (T === 'password' ? 'password' : 'text')), step: T === 'number' ? 'any' : null, dir: f.dir || null });
    get = () => { if (T === 'number') return el.value === '' ? null : +el.value; return el.value === '' ? null : el.value; }; set = (v) => { el.value = v ?? ''; };
  }
  if (f.readonly) el.setAttribute('disabled', '');
  set(val ?? f.def ?? (T === 'check' ? 0 : ''));
  return { el, get, set, f };
}

/* ---------- modal window ---------- */
function modal(title, body, buttons, opts = {}) {
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); opts.onclose && opts.onclose(); };
  const win = h('div', { class: 'win modal' + (opts.wide ? ' wide' : '') },
    h('div', { class: 'win-title' }, h('span', null, title), h('button', { class: 'win-x', onclick: close, title: 'إغلاق' }, '×')),
    h('div', { class: 'win-body' }, body),
    buttons ? h('div', { class: 'win-foot' }, buttons.map(b => h('button', { class: 'btn ' + (b.kind || ''), onclick: guard(async () => { const r = await b.fn(close); }) }, b.t))) : null);
  back.append(win); document.body.append(back);
  const first = $('input:not([disabled]),select', win); first && first.focus();
  return { close, win };
}
function confirmBox(msg) {
  return new Promise(res => {
    const m = modal('تأكيد', h('p', { class: 'confirm-msg' }, msg), [
      { t: 'نعم', kind: 'pri', fn: (c) => { res(true); c(); } }, { t: 'إلغاء', fn: (c) => { res(false); c(); } }], { onclose: () => res(false) });
  });
}

/* ---------- table ---------- */
function table(cols, rows, opts = {}) {
  if (!Array.isArray(rows)) rows = [];
  const tb = h('table', { class: 'grid' });
  tb.append(h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.cls || '' }, c.t)))));
  const body = h('tbody');
  rows.forEach((r, i) => {
    const tr = h('tr', { class: opts.rowClass ? opts.rowClass(r) : '', onclick: opts.onrow ? () => opts.onrow(r, tr) : null });
    cols.forEach(c => {
      let v = c.f ? c.f(r, i) : r[c.k];
      if (c.num && typeof v === 'number') v = fmt(v);
      tr.append(h('td', { class: (c.num ? 'num ' : '') + (c.cls || '') }, v === null || v === undefined ? '' : v));
    });
    body.append(tr);
  });
  if (!rows.length) body.append(h('tr', null, h('td', { colspan: cols.length, class: 'empty' }, opts.empty || 'لا توجد بيانات')));
  tb.append(body);
  if (opts.foot) tb.append(h('tfoot', null, h('tr', null, opts.foot.map(x => h('td', { class: 'num' }, x === null ? '' : x)))));
  return h('div', { class: 'tbl-wrap' }, tb);
}
function csvOf(cols, rows) {
  if (!Array.isArray(rows)) rows = [];
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '\ufeff' + [cols.map(c => q(c.t)).join(','), ...rows.map((r, i) => cols.map(c => q(c.csv ? c.csv(r, i) : (c.f ? (typeof c.f(r, i) === 'object' ? '' : c.f(r, i)) : r[c.k]))).join(','))].join('\n');
}
function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: name }); document.body.append(a); a.click(); a.remove();
}
function printEl(title, el) {
  const w = window.open('', '_blank');
  if (!w) { toast('اسمح بالنوافذ المنبثقة للطباعة', 'err'); return; }
  w.document.write('<html dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title><link rel="stylesheet" href="' + new URL('css/print.css', location.href).href + '"></head><body>' + el.outerHTML + '</body></html>');
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400);
}

/* ---------- unsaved-changes guard ---------- */
MZ.dirty = {};
MZ.regDirty = (id, o) => { MZ.dirty[id] = o; };
MZ.clearDirty = (id) => { delete MZ.dirty[id]; };
function confirmDialog(title, msg, buttons) {
  return new Promise(res => {
    const ov = h('div', { class: 'mzc-ov' });
    const close = (k) => { ov.remove(); res(k); };
    ov.append(h('div', { class: 'mzc-box' },
      h('div', { class: 'mzc-t' }, title),
      msg ? h('div', { class: 'mzc-m' }, msg) : null,
      h('div', { class: 'mzc-b' }, buttons.map(b => h('button', { class: 'btn ' + (b.kind || ''), onclick: () => close(b.k) }, b.t)))));
    document.body.append(ov);
  });
}
function isWinDirty(id) { const d = (MZ.dirty || {})[id]; if (!d) return false; try { return !!(d.isDirty && d.isDirty()); } catch (e) { return false; } }
async function dirtyGuard(winId, proceed) {
  const d = (MZ.dirty || {})[winId];
  let isD = false; try { isD = !!(d && d.isDirty && d.isDirty()); } catch (e) {}
  if (!isD) { proceed(); return; }
  const k = await confirmDialog('تغييرات غير محفوظة', 'لديك تعديلات لم تُحفظ في هذه الشاشة. ماذا تريد أن تفعل؟', [
    { k: 'save', t: '💾 حفظ', kind: 'pri' }, { k: 'discard', t: '🗑 تجاهل التغييرات' }, { k: 'stay', t: 'البقاء' }]);
  if (k === 'stay') { try { history.replaceState(null, '', '#p=' + MZ.active); } catch (e) {} return; }
  if (k === 'save') { try { const ok = await d.save(); if (ok === false) return; } catch (e) { return; } }
  MZ.clearDirty(winId); proceed();
}
window.confirmDialog = confirmDialog;

/* ---------- back button ---------- */
const BACK_PARENT = { sinv_new: 'sinv_list' };
function backTargetOf(id) {
  if (BACK_PARENT[id]) return BACK_PARENT[id];
  if (/^sinv_(view|edit)_\d+$/.test(id)) return 'sinv_list';
  return null;
}
function winBackBtn(id) {
  const t = backTargetOf(id); if (!t || !MZ.pages[t]) return null;
  return h('button', { class: 'backbtn', type: 'button', onclick: () => openPage(t) }, '→ رجوع إلى ' + (TITLES[t] || 'القائمة'));
}

/* ---------- window manager (MDI tabs) ---------- */
function openWin(id, title, build, opts = {}) {
  if (MZ.active && MZ.active !== id && isWinDirty(MZ.active)) { dirtyGuard(MZ.active, () => openWin(id, title, build, opts)); return MZ.wins[id]; }
  SND.play("open");
  if (MZ.wins[id]) { activate(id); if (opts.refresh) MZ.wins[id].refresh && MZ.wins[id].refresh(); return MZ.wins[id]; }
  const body = h('div', { class: 'win-content' });
  if (backTargetOf(id)) body.classList.add('subwin');
  const w = { id, title, body, refresh: null };
  MZ.wins[id] = w; MZ.order.push(id);
  $('#desk').append(body);
  const rf = async () => { body.innerHTML = ''; body.append(h('div', { class: 'loading' }, 'جاري التحميل...')); try { const el = await build(w); body.innerHTML = ''; body.append(el); } catch (e) { body.innerHTML = ''; body.append(h('div', { class: 'err-box' }, e.message)); } };
  w.refresh = rf; rf(); activate(id); return w;
}
function activate(id) {
  MZ.active = id;
  $$('#desk > .win-content').forEach(b => b.classList.remove('on'));
  if (MZ.wins[id]) MZ.wins[id].body.classList.add('on');
  renderTabs();
}
function closeWin(id) {
  if (isWinDirty(id)) { dirtyGuard(id, () => closeWin(id)); return; }
  SND.play("close");
  const w = MZ.wins[id]; if (!w) return;
  w.body.remove(); delete MZ.wins[id]; MZ.order = MZ.order.filter(x => x !== id);
  if (MZ.active === id) activate(MZ.order[MZ.order.length - 1] || 'home'); else renderTabs();
}
function renderTabs() {
  const t = $('#tabs'); if (!t) return; t.innerHTML = '';
  MZ.order.forEach(id => { const w = MZ.wins[id]; t.append(h('div', { class: 'tab' + (id === MZ.active ? ' on' : ''), onclick: () => { if (MZ.active !== id && isWinDirty(MZ.active)) dirtyGuard(MZ.active, () => activate(id)); else activate(id); } }, h('span', null, w.title), id !== 'home' ? h('b', { onclick: (e) => { e.stopPropagation(); closeWin(id); } }, '×') : null)); });
  if (window.updateTopnav) try { window.updateTopnav(); } catch (e) {}
}

/* ---------- common layout pieces ---------- */
const pageHead = (title, ...actions) => {
  const bb = winBackBtn(MZ.active);
  return h('div', { class: 'page-head' + (bb ? ' has-back' : '') }, bb, h('h2', null, title), h('div', { class: 'actions' }, actions));
};
const btn = (t, fn, kind = '') => h('button', { class: 'btn ' + kind, onclick: guard(fn) }, t);
function filterBar(fields, onrun, initial = {}) {
  const fs = fields.map(f => ({ ...mkField(f, initial[f.k]), k: f.k, label: f.t }));
  const bar = h('div', { class: 'filters' }, fs.map(x => h('label', null, h('span', null, x.label), x.el)), btn('عرض', () => onrun(Object.fromEntries(fs.map(x => [x.k, x.get()]))), 'pri'));
  bar.values = () => Object.fromEntries(fs.map(x => [x.k, x.get()]));
  return bar;
}
function recordBar(state) {
  // state: {count,index,go(i),onNew,onSave,onDelete,onPrint}
  const b = (t, fn, title) => h('button', { class: 'rb', title, onclick: guard(fn) }, t);
  return h('div', { class: 'recbar' },
    h('div', { class: 'rb-nav' }, b('⏮', () => state.go(0), 'الأول'), b('◀', () => state.go(state.index() - 1), 'السابق'),
      h('span', { class: 'rb-pos' }, state.label ? state.label() : ''), b('▶', () => state.go(state.index() + 1), 'التالي'), b('⏭', () => state.go(state.count() - 1), 'الأخير')),
    h('div', { class: 'rb-act' }, state.onNew ? b('➕ جديد', state.onNew) : null, state.onSave ? b('💾 حفظ', state.onSave) : null, state.onDelete ? b('🗑 حذف', state.onDelete) : null, state.onPrint ? b('🖨 طباعة', state.onPrint) : null));
}
const TYPE_AR = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
const INV_AR = { sale: 'فاتورة مبيعات', sale_return: 'مردود مبيعات', purchase: 'فاتورة مشتريات', purchase_return: 'مردود مشتريات', quote: 'عرض سعر', sale_order: 'أمر بيع', purchase_order: 'أمر شراء' };
const STATUS_AR = { posted: 'مرحّلة', draft: 'مسودة', pending: 'بانتظار الاعتماد', cancelled: 'ملغاة', rejected: 'مرفوضة', converted: 'محوّلة' };

const mainWh = () => (MZ.L.warehouses || []).slice().sort((a, b) => a.id - b.id)[0];

window.addEventListener('beforeunload', (e) => {
  for (const k of Object.keys(MZ.dirty || {})) {
    const d = MZ.dirty[k];
    try { if (d && d.isDirty && d.isDirty()) { e.preventDefault(); e.returnValue = ''; return; } } catch (x) {}
  }
});
