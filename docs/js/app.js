'use strict';
/* Shell: login, first-run setup, menus, toolbar */
const LOGO = '<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#9aa8ff"/><path d="M20 14l24 36M44 14L20 50" stroke="#0f1437" stroke-width="4.5" stroke-linecap="round"/><circle cx="19" cy="49" r="6" stroke="#0f1437" stroke-width="3.5"/><circle cx="45" cy="49" r="6" stroke="#0f1437" stroke-width="3.5"/></svg>';
const APP_NAME = 'إدارة مصنع الملابس';
const MENUS = [
  ['الفواتير', [['🧾', 'فواتير المبيعات', 'sinv_list'], ['➕', 'فاتورة جديدة', 'sinv_new'], ['🏬', 'الفروع', 'branches']]],
  ['المشتريات والموردون', [['🧾', 'فواتير المشتريات', 'pinv_list'], ['➕', 'فاتورة شراء جديدة', 'pinv_new'], ['🏭', 'الموردون', 'gl_suppliers'], ['📑', 'أستاذ الموردين', 'gl_supledger'], ['🧮', 'كشف مورد تفصيلي', 'supplier_statement']]],
  ['الملفات', [['👥', 'العملاء (أصحاب القماش)', 'clients'], ['👕', 'الموديلات وسعر التصنيع', 'models'], ['🧵', 'مراحل الإنتاج', 'stages'], ['📊', 'لوحة مراحل الإنتاج', 'stages_board'], ['👷', 'الموظفون', 'employees']]],
  ['القماش والقص', [['📥', 'مخزن استلام القماش', 'store'], ['✂', 'أمر القص التفصيلي', 'orders'], ['🖨', 'تتبع الخارج والراجع (طباعة)', 'outs'], ['📈', 'ربحية أوامر القص', 'profit']]],
  ['الحسابات', [['💰', 'سجل مقبوضات العملاء', 'payments'], ['📒', 'حسابات العملاء المجمعة', 'accounts'], ['📑', 'كشف حساب العميل', 'acctstmt'], ['💸', 'المصروفات', 'expenses'], ['🗓', 'حضور وانصراف العمال', 'attendance'], ['💵', 'المرتبات', 'payroll'], ['⏳', 'أعمار الديون', 'aging'], ['🧾', 'الإقفال اليومي', 'daily_close'], ['📚', 'دليل الحسابات', 'gl_accounts'], ['📒', 'قيود اليومية', 'gl_journal'], ['📖', 'دفتر الأستاذ', 'gl_ledger'], ['👥', 'أستاذ مساعد العملاء', 'gl_subledger'], ['⚖', 'ميزان المراجعة', 'gl_trial'], ['📊', 'القوائم المالية', 'gl_statements'], ['💧', 'قائمة التدفقات النقدية', 'cash_flow'], ['🏦', 'التسوية البنكية', 'bank_rec'], ['🏗️', 'الأصول الثابتة', 'assets'], ['📆', 'الاستحقاقات والمقدمات', 'accruals'], ['🧾', 'ضريبة القيمة المضافة', 'vat'], ['🔒', 'إقفال الفترة', 'gl_close']]],
  ['المخزون', [['📦', 'رصيد المخزون', 'inv_stock'], ['🏷', 'الأصناف والمخازن', 'inv_items'], ['🧾', 'حركات المخزون', 'inv_moves'], ['📇', 'كارت الصنف', 'inv_card'], ['📋', 'جرد المخزون', 'inv_count']]],
  ['المزيد', [['🤖', 'المساعد الذكي', 'assistant'], ['⚙', 'الإعدادات', 'settings', 'admin'], ['👤', 'المستخدمون', 'users', 'admin'], ['🕵', 'سجل المراجعة', 'audit', 'admin']]]
];
const TOOLBAR = [['🏠', 'الرئيسية', 'home'], ['🧾', 'الفواتير', 'sinv_list'], ['📥', 'مخزن القماش', 'store'], ['✂', 'أمر القص', 'orders'], ['🖨', 'الخارج والراجع', 'outs'], ['💰', 'المقبوضات', 'payments'], ['📒', 'حسابات العملاء', 'accounts'], ['🗓', 'الحضور', 'attendance'], ['💵', 'المرتبات', 'payroll']];
const TITLES = {}; MENUS.forEach(m => m[1].forEach(i => { TITLES[i[2]] = i[1]; })); TITLES.home = 'الرئيسية';
const PAGE_PERM = { sinv_list: 'invoices', sinv_new: 'invoices', pinv_list: 'invoices', pinv_new: 'invoices', branches: 'invoices', clients: 'masters', models: 'masters', stages: 'masters', employees: 'hr', store: 'fabric', orders: 'fabric', outs: 'fabric', payments: 'accounts', accounts: 'accounts', acctstmt: 'accounts', inv_stock: 'inventory', inv_items: 'inventory', inv_moves: 'inventory', inv_card: 'inventory', inv_count: 'inventory', gl_accounts: 'accounting', gl_journal: 'accounting', gl_ledger: 'accounting', gl_subledger: 'accounting', gl_suppliers: 'accounting', gl_supledger: 'accounting', supplier_statement: 'accounting', gl_trial: 'accounting', gl_statements: 'accounting', cash_flow: 'accounting', bank_rec: 'accounting', assets: 'accounting', accruals: 'accounting', vat: 'accounting', gl_close: 'accounting', assistant: 'tools', daily_close: 'tools', stages_board: 'tools', expenses: 'tools', profit: 'tools', aging: 'tools', attendance: 'hr', payroll: 'hr', receipts: 'fabric', cuts: 'fabric', prod: 'fabric', deliveries: 'fabric', invoices: 'fabric' };
const canSee = (key) => { const k = PAGE_PERM[key]; if (!k) return true; const ps = (MZ.user && MZ.user.perms) || ['*']; return ps.includes('*') || ps.includes(k); };

async function openPage(key) {
  if (!canSee(key)) return toast('لا تملك صلاحية الوصول لهذه الشاشة', 'err');
  const f = MZ.pages[key]; if (!f && !String(key).startsWith('sinv_view_') && !String(key).startsWith('sinv_edit_')) return toast('الشاشة غير متاحة', 'err');
  try { history.replaceState(null, '', '#p=' + key); } catch (e) {}
  openWin(key, TITLES[key] || key, async () => { const r = f(); return await r; }, { refresh: true });
}
function logout() { SND.play('logout'); sessionStorage.removeItem('cmt_tok'); try { localStorage.removeItem('cmt_tok'); } catch (e) {} try { history.replaceState(null, '', location.pathname); } catch (e) {} setTimeout(() => location.reload(), 650); }
function muteBtn() { const b = h('button', { class: 'mute', title: 'كتم / تشغيل الأصوات', onclick: () => { const m = SND.toggle(); b.textContent = m ? '🔇' : '🔊'; } }, SND.muted ? '🔇' : '🔊'); return b; }
const ROLE_AR = { admin: 'مدير النظام', staff: 'موظف', viewer: 'عرض فقط' };

/* ---------- horizontal top navigation with mega-menu panels (desktop) ---------- */
function buildTopnav(nm) {
  const PAGE2SEC = {}; MENUS.forEach(([t, items]) => items.forEach(i => { PAGE2SEC[i[2]] = t; }));
  const secOf = (k) => PAGE2SEC[k] || (String(k).startsWith('sinv_view_') || String(k).startsWith('sinv_edit_') ? PAGE2SEC.sinv_list : null);
  const adminOk = (i) => (i[3] !== 'admin' || MZ.user.role === 'admin') && canSee(i[2]);
  const SHORT = { 'المشتريات والموردون': 'المشتريات' };
  const MORE = '__more__';
  let openSec = null;
  const panel = h('div', { class: 'tn-panel', role: 'menu' });
  const allSecs = MENUS.filter(([t, items]) => items.filter(adminOk).length).map(([t, items]) => [t, items.filter(adminOk)]);
  let visSecs = allSecs.slice(), overSecs = [];
  let secBtns = {}; let navBtns = [];
  const homeBtn = h('button', { class: 'tn-sec tn-home', onclick: () => { closePanel(); openPage('home'); } }, '🏠 الرئيسية');
  function closePanel() { openSec = null; panel.classList.remove('open'); Object.values(secBtns).forEach(b => b.setAttribute('aria-expanded', 'false')); }
  const itemBtn = (i) => h('button', { class: 'tn-item', role: 'menuitem', onclick: () => { closePanel(); openPage(i[2]); } }, h('i', null, i[0]), h('span', null, i[1]));
  function openPanel(t, items) {
    panel.innerHTML = '';
    if (t === MORE) {
      panel.append(h('div', { class: 'tn-grid tn-ovgrid' }, overSecs.map(([gt, gitems]) =>
        h('div', { class: 'tn-ovg' }, h('h4', null, gt), h('div', { class: 'tn-ovitems' }, gitems.map(itemBtn))))));
    } else {
      panel.append(h('div', { class: 'tn-grid' }, items.map(itemBtn)));
    }
    panel.classList.add('open'); openSec = t;
    Object.keys(secBtns).forEach(k => secBtns[k].setAttribute('aria-expanded', k === t ? 'true' : 'false'));
  }
  const mkSecBtn = (t, items, label) => {
    const b = h('button', { class: 'tn-sec', 'aria-expanded': 'false', 'aria-haspopup': 'true',
      onclick: (e) => { e.stopPropagation(); if (openSec === t) closePanel(); else openPanel(t, items); },
      onkeydown: (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const i = navBtns.indexOf(b); const n = navBtns[(i + (e.key === 'ArrowLeft' ? 1 : -1) + navBtns.length) % navBtns.length]; n.focus(); }
        else if (e.key === 'Escape') { closePanel(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); if (openSec !== t) openPanel(t, items); const f = panel.querySelector('.tn-item'); if (f) f.focus(); }
      } }, label || t, h('i', { class: 'tn-car' }, '▾'));
    secBtns[t] = b; navBtns.push(b); return b;
  };
  const secsNav = h('nav', { class: 'tn-secs', 'aria-label': 'الأقسام' });
  function renderSecs() {
    secBtns = {}; navBtns = [homeBtn];
    secsNav.innerHTML = '';
    secsNav.append(homeBtn, ...visSecs.map(([t, items]) => mkSecBtn(t, items, SHORT[t] || t)));
    if (overSecs.length) secsNav.append(mkSecBtn(MORE, [], '⋮ المزيد'));
  }
  renderSecs();
  function layout() {
    if (!bar.isConnected) return;
    visSecs = allSecs.slice(); overSecs = []; renderSecs();
    let guard = 0;
    while (secsNav.scrollWidth > secsNav.clientWidth && visSecs.length > 1 && guard++ < 12) {
      overSecs.unshift(visSecs.pop());
      renderSecs();
    }
    if (openSec === MORE && !overSecs.length) closePanel();
  }
  const bar = h('div', { class: 'topnav' },
    h('div', { class: 'brand tn-brand', html: LOGO + '<div><h1>' + APP_NAME + '</h1></div>' }),
    secsNav,
    h('div', { class: 'today' }, ''),
    h('div', { class: 'tn-me' }, h('button', { class: 'tbn lang-btn', type: 'button', onclick: () => I18N_SET(I18N.lang === 'en' ? 'ar' : 'en') }, '🌐 EN'), muteBtn(), h('span', { class: 'tn-nm' }, nm), h('button', { class: 'tn-out', onclick: logout }, 'خروج')));
  document.addEventListener('click', (e) => { if (openSec && !e.target.closest('.topnav') && !e.target.closest('.tn-panel')) closePanel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
  let rzT = null;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(layout, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());
  window.__tnLayout = layout;
  window.updateTopnav = () => {
    const sec = secOf(MZ.active);
    Object.keys(secBtns).forEach(k => secBtns[k].classList.toggle('on', k === sec || (sec && overSecs.some(([gt]) => gt === sec) && k === MORE)));
    homeBtn.classList.toggle('on', MZ.active === 'home');
  };
  return [bar, panel];
}

/* ---------- notifications: assistant alerts + update notice ---------- */
const NOTIF = {
  items: [], updateAvail: false, timer: null, build: null, open: false,
  GOTO: { 'القص': 'orders', 'التسليم': 'orders', 'التكلفة': 'orders', 'المخزن': 'store', 'الخارج': 'outs', 'الحسابات': 'aging', 'الإنتاج': 'stages', 'الرواتب': 'payroll', 'الحضور': 'attendance', 'تكرار': null },
  seen() { try { return JSON.parse(localStorage.getItem('cmt_notif_seen') || '[]'); } catch (e) { return []; } },
  key(x) { return x.level + '|' + x.area + '|' + x.msg; },
  unreadList() { const s = this.seen(); return this.items.filter(x => s.indexOf(this.key(x)) === -1); },
  markAll() { const s = this.seen(); this.items.forEach(x => { const k = this.key(x); if (s.indexOf(k) === -1) s.push(k); }); try { localStorage.setItem('cmt_notif_seen', JSON.stringify(s.slice(-300))); } catch (e) {} this.paint(); this.render(); },
  async poll() {
    let a = null;
    try { a = window.assistCount ? await window.assistCount() : await GET('/assistant'); } catch (e) { a = null; }
    if (a && Array.isArray(a.items)) this.items = a.items;
    try {
      const r = await fetch('build.txt?cb=' + Date.now());
      if (r.ok) { const b = (await r.text()).trim(); if (!this.build) this.build = b; else if (b && b !== this.build) this.updateAvail = true; }
    } catch (e) {}
    this.paint(); if (this.open) this.render();
  },
  paint() {
    const n = this.unreadList().length + (this.updateAvail ? 1 : 0);
    document.querySelectorAll('.ntf-bell .bdg').forEach(e => e.remove());
    const bell = document.querySelector('.ntf-bell');
    if (bell && n) bell.append(h('span', { class: 'bdg' }, n));
    let ban = document.querySelector('.ntf-banner');
    if (this.updateAvail && !ban && bell) {
      ban = h('div', { class: 'ntf-banner' }, h('span', null, '🔄 يتوفر تحديث جديد للبرنامج. أعد تحميل الصفحة للحصول على آخر نسخة.'), btn('إعادة التحميل', () => location.reload(), 'sm pri'));
      const main = document.querySelector('.main'); if (main) main.insertBefore(ban, main.children[1] || null);
    }
  },
  toggle() { this.open = !this.open; const p = document.querySelector('.ntf-panel'); if (p) p.remove(); if (this.open) this.render(); },
  render() {
    document.querySelectorAll('.ntf-panel').forEach(e => e.remove());
    const wrap = document.querySelector('.ntf-wrap'); if (!wrap) return;
    const un = this.unreadList(); const rows = [];
    if (this.updateAvail) rows.push(h('div', { class: 'ntf-row ntf-upd', onclick: () => location.reload() }, h('i', null, '🔄'), h('div', null, h('b', null, 'يتوفر تحديث جديد'), h('small', null, 'اضغط لإعادة التحميل الآن'))));
    if (!this.items.length && !this.updateAvail) rows.push(h('div', { class: 'ntf-empty' }, '✅ لا توجد إشعارات الآن'));
    this.items.slice(0, 40).forEach(x => {
      const seen = un.indexOf(x) === -1;
      rows.push(h('div', { class: 'ntf-row' + (seen ? ' seen' : ''), onclick: () => { const k = NOTIF.GOTO[x.area]; if (k) { openPage(k); NOTIF.toggle(); } } },
        h('span', { class: 'tag ' + ({ err: 'bad', warn: 'warn' }[x.level] || '') }, ({ err: 'خطأ', warn: 'تنبيه' }[x.level] || 'معلومة')),
        h('div', null, h('small', null, x.area), h('div', null, x.msg))));
    });
    const panel = h('div', { class: 'ntf-panel' },
      h('div', { class: 'ntf-head' }, h('b', null, '🔔 الإشعارات'), btn('تحديد الكل كمقروء', () => NOTIF.markAll(), 'sm')),
      h('div', { class: 'ntf-list' }, rows));
    wrap.append(panel);
    if (!this._out) { this._out = true; document.addEventListener('click', (e) => { if (NOTIF.open && !e.target.closest('.ntf-wrap')) NOTIF.toggle(); }); }
  },
  init() { this.poll(); if (!this.timer) this.timer = setInterval(() => this.poll(), 5 * 60 * 1000); },
};
function notifBell() {
  return h('span', { class: 'ntf-wrap' }, h('button', { class: 'tbn ntf-bell', type: 'button', title: 'الإشعارات', onclick: (e) => { e.stopPropagation(); NOTIF.toggle(); } }, '🔔'));
}

function shell() {
  const app = $('#app'); app.innerHTML = '';
  const adminOk = (i) => (i[3] !== 'admin' || MZ.user.role === 'admin') && canSee(i[2]);
  const nav = [h('div', { class: 'navg' }, h('div', { class: 'nv', 'data-k': 'home', onclick: () => openPage('home') }, h('i', null, '🏠'), 'الرئيسية'))];
  MENUS.forEach(([t, items]) => {
    const vis = items.filter(adminOk); if (!vis.length) return;
    nav.push(h('div', { class: 'navg' }, h('b', null, t), vis.map(i => h('div', { class: 'nv', 'data-k': i[2], onclick: () => { openPage(i[2]); $('.side').classList.remove('open'); } }, h('i', null, i[0]), i[1]))));
  });
  const nm = (MZ.user.name || MZ.user.username || '?');
  const side = h('aside', { class: 'side' },
    h('div', { class: 'brand', html: LOGO + '<div><h1>' + APP_NAME + '</h1><small>' + esc(MZ.settings.company_name || 'تصنيع للغير') + '</small></div>' }),
    nav, h('div', { class: 'sp' }),
    h('div', { class: 'me' }, h('div', { class: 'av' }, nm.trim().charAt(0)), h('div', null, nm, h('small', null, ROLE_AR[MZ.user.role] || '')), muteBtn(), h('button', { onclick: logout }, 'خروج')));
  const main = h('div', { class: 'main' },
    h('div', { class: 'topbar' }, h('button', { class: 'burger', onclick: () => side.classList.toggle('open') }, '☰'), h('div', { class: 'tabs', id: 'tabs' }),
      notifBell(), h('button', { class: 'tbn', onclick: themePicker, title: 'سمات النظام' }, '🎨 السمات'), h('button', { class: 'tbn lang-btn', type: 'button', onclick: () => I18N_SET(I18N.lang === 'en' ? 'ar' : 'en') }, '🌐 EN'), h('button', { class: 'tbn', onclick: () => printPage() }, '🖨 طباعة'), h('button', { class: 'tbn', onclick: () => exportChooser() }, '⬇ تصدير'), h('div', { class: 'today today-plain' }, new Date().toLocaleDateString(window.MZ_LOC ? MZ_LOC() : 'ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))),
    h('div', { id: 'desk' }));
  app.append(...buildTopnav(nm), side, main);
  requestAnimationFrame(() => window.__tnLayout && window.__tnLayout());
  const sync = () => document.querySelectorAll('.nv').forEach(n => n.classList.toggle('on', n.getAttribute('data-k') === MZ.active));
  new MutationObserver(sync).observe($('#tabs'), { subtree: true, childList: true, attributes: true });
  openWin('home', 'الرئيسية', () => MZ.pages.home());
  sync(); setTimeout(() => { assistCount(); NOTIF.init(); }, 1500);
  const hm = (location.hash || '').match(/^#p=([A-Za-z0-9_]+)/);
  if (hm && hm[1] !== 'home') setTimeout(() => openPage(hm[1]), 400);
  if (!window.__hashBound) { window.__hashBound = true; window.addEventListener('hashchange', () => { const mm = (location.hash || '').match(/^#p=([A-Za-z0-9_]+)/); if (mm) openPage(mm[1]); }); }
}

async function boot() {
  const app = $('#app');
  if (!MZ.api) { app.textContent = 'إعداد الخادم غير موجود'; return; }
  if (MZ.token) {
    try { const me = await GET('/me'); MZ.user = me.user; MZ.settings = me.settings; if (me.user.theme && me.user.theme !== MZ.theme) applyTheme(me.user.theme); await Promise.all(['clients', 'models', 'stages'].map(n => load(n, true))); shell(); return; }
    catch (e) { sessionStorage.removeItem('cmt_tok'); try { localStorage.removeItem('cmt_tok'); } catch (x) {} MZ.token = null; try { history.replaceState(null, '', location.pathname); } catch (x) {} }
  }
  loginScreen();
}

function loginScreen() {
  const app = $('#app'); app.innerHTML = '';
  const msg = h('div', { class: 'lg-msg info' }, 'جاري الاتصال بالخادم...');
  const user = h('input', { id: 'u', autocomplete: 'username', placeholder: 'اسم المستخدم' }), pass = h('input', { id: 'p', type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
  const company = h('input', { id: 'c', placeholder: 'اسم المصنع' });
  const go = h('button', { class: 'go', type: 'submit', disabled: true }, 'دخول النظام');
  const eye = h('button', { type: 'button', class: 'eye', title: 'إظهار/إخفاء كلمة المرور', onclick: () => { const s = pass.type === 'password'; pass.type = s ? 'text' : 'password'; eye.textContent = s ? '🙈' : '👁'; pass.focus(); } }, '👁');
  const caps = h('div', { class: 'caps-hint', style: { display: 'none' } }, '⚠ تنبيه: زر Caps Lock مفعّل');
  const forgotLink = h('a', { href: '#', class: 'lg-forgot', onclick: async (e) => { e.preventDefault(); if (!user.value.trim()) { msg.className = 'lg-msg'; msg.textContent = 'اكتب اسم المستخدم أولًا ثم اضغط نسيت كلمة المرور'; user.focus(); return; } msg.className = 'lg-msg info'; msg.textContent = 'جاري الإرسال...'; try { const r = await POST('/forgot', { username: user.value }); msg.className = r.ok ? 'lg-msg info' : 'lg-msg'; msg.textContent = r.message || 'تم'; } catch (err) { msg.className = 'lg-msg'; msg.textContent = err.message; } } }, 'نسيت كلمة المرور؟');
  const remIn = h('input', { type: 'checkbox', class: 'chk', checked: true });
  const remRow = h('label', { class: 'lg-remember' }, remIn, h('span', null, 'تذكرني على هذا الجهاز'));
  pass.addEventListener('keyup', (e) => { try { caps.style.display = (e.getModifierState && e.getModifierState('CapsLock')) ? 'block' : 'none'; } catch (x) {} });
  pass.addEventListener('blur', () => { caps.style.display = 'none'; });
  const userFld = h('div', { class: 'fld' }, h('span', { class: 'fld-i' }, '👤'), user);
  const passFld = h('div', { class: 'fld' }, h('span', { class: 'fld-i' }, '🔒'), pass, eye);
  const title = h('h2', null, 'دخول النظام'), sub = h('div', { class: 'sub' }, 'سجّل الدخول للمتابعة');
  const compBox = h('div', { style: { display: 'none' } }, h('label', null, 'اسم المصنع'), company);
  let setupMode = false;
  let devTok = null, devInfo = null;
  try { devTok = localStorage.getItem('cmt_dev'); devInfo = JSON.parse(localStorage.getItem('cmt_dev_user') || 'null'); } catch (x) {}
  const devCard = h('div', { class: 'lg-dev', style: { display: 'none' } });
  if (devTok && devInfo && (devInfo.name || devInfo.username)) {
    const devName = String(devInfo.name || devInfo.username);
    const devBtn = h('button', { type: 'button', class: 'go lg-dev-go' }, 'متابعة');
    const forgetL = h('a', { href: '#', class: 'lg-dev-forget', onclick: async (e) => { e.preventDefault(); try { await POST('/device-forget', { device_token: devTok }); } catch (x) {} try { localStorage.removeItem('cmt_dev'); localStorage.removeItem('cmt_dev_user'); } catch (x) {} devCard.style.display = 'none'; msg.className = 'lg-msg info'; msg.textContent = 'تم نسيان هذا الجهاز، سجل الدخول بكلمة المرور'; user.focus(); } }, 'نسيان هذا الجهاز');
    devBtn.addEventListener('click', async () => {
      devBtn.disabled = true; msg.className = 'lg-msg info'; msg.textContent = 'جاري الدخول...';
      try {
        const r = await POST('/device-login', { device_token: devTok });
        MZ.token = r.token; sessionStorage.setItem('cmt_tok', r.token); try { localStorage.setItem('cmt_tok', r.token); } catch (x) {} SND.play('login'); await boot();
      } catch (err) { devBtn.disabled = false; try { localStorage.removeItem('cmt_dev'); localStorage.removeItem('cmt_dev_user'); } catch (x) {} devCard.style.display = 'none'; msg.className = 'lg-msg'; msg.textContent = err.message; }
    });
    devCard.append(h('div', { class: 'lg-dev-av' }, devName.trim().charAt(0)), h('div', { class: 'lg-dev-tx' }, h('b', null, devName), h('small', null, 'هذا الجهاز محفوظ، ادخل بضغطة واحدة')), devBtn, forgetL);
    devCard.style.display = 'flex';
  }
  const form = h('form', { class: 'lg-card', onsubmit: async (e) => {
    e.preventDefault(); go.disabled = true; go.classList.add('busy'); msg.className = 'lg-msg info'; msg.textContent = 'جاري التحقق...';
    try {
      if (setupMode) await POST('/setup', { username: user.value, password: pass.value, company: company.value });
      const r = await POST('/login', { username: user.value, password: pass.value, remember: remIn.checked });
      go.classList.remove('busy'); go.classList.add('done'); MZ.token = r.token; sessionStorage.setItem('cmt_tok', r.token); try { if (remIn.checked) { localStorage.setItem('cmt_tok', r.token); if (r.device_token) { localStorage.setItem('cmt_dev', r.device_token); localStorage.setItem('cmt_dev_user', JSON.stringify({ username: r.user.username, name: r.user.name })); } } else { localStorage.removeItem('cmt_tok'); localStorage.removeItem('cmt_dev'); localStorage.removeItem('cmt_dev_user'); } } catch (x) {} try { history.replaceState(null, '', location.pathname); } catch (x) {} SND.play('login'); await boot();
    } catch (err) { go.classList.remove('busy'); msg.className = 'lg-msg'; msg.textContent = err.message; go.disabled = false; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
  } }, title, sub, devCard, compBox, h('label', { for: 'u' }, 'اسم المستخدم'), userFld, h('label', { for: 'p' }, 'كلمة المرور'), passFld, caps, remRow, go, forgotLink, msg, h('div', { class: 'lg-foot' }, APP_NAME + ' © التصنيع للغير'));
  const ART = '<svg viewBox="0 0 520 300" fill="none"><g class="float"><rect x="20" y="170" width="190" height="64" rx="32" fill="#3547e0"/><ellipse cx="52" cy="202" rx="22" ry="22" fill="#0f1437"/><ellipse cx="52" cy="202" rx="9" ry="9" fill="#f2f4fb"/><rect x="40" y="120" width="190" height="60" rx="30" fill="#9aa8ff" stroke="#0f1437" stroke-width="2"/><ellipse cx="72" cy="150" rx="20" ry="20" fill="#0f1437"/><ellipse cx="72" cy="150" rx="8" ry="8" fill="#f2f4fb"/></g><path class="draw" d="M300 60l40-22 30 14 30-14 40 22-22 36-22-10v118h-92V86l-22 10z" fill="#fff" stroke="#0f1437" stroke-width="3" stroke-linejoin="round"/><path class="cut" d="M262 20C300 140 420 150 500 270" stroke="#f0457a" stroke-width="3" stroke-linecap="round"/><circle cx="262" cy="20" r="6" fill="#f0457a"/><path d="M330 120h70M330 140h70M330 160h50" stroke="#9aa8ff" stroke-width="5" stroke-linecap="round"/><g transform="translate(250 262)"><path d="M0 0h260" stroke="#0f1437" stroke-width="2" stroke-dasharray="3 6"/><text x="0" y="-8" font-size="12" fill="#7a82a6" font-family="Tahoma">cut · sew · deliver</text></g></svg>';
  const LT_ROT = { classic: 'rotate(-1deg)', dark: '', glass: '', emerald: 'rotate(1deg)', sunset: 'rotate(-1.5deg)', mono: '', violet: 'rotate(-1deg)' };
  const MOTTO = ['كل غرزة متقنة… خطوة أقرب للإتقان.', 'النظام الصح بيوفّر وقتك ويرفع إنتاجك.', 'صنعة النهاردة… سمعة بكرة.', 'الإنتاج المنظّم = راحة بال وربح أسرع.', 'ابدأ يومك بخطة… واختمه بإنجاز.'];
  const mottoT = h('span', { class: 'motto-t' }, MOTTO[0]);
  const land = h('div', { class: 'land' },
    h('div', { class: 'land-l' }, h('span', { class: 'tagline' }, 'نظام التصنيع للغير'),
      h('h1', { html: 'من القماش...<br><em>لقطعة جاهزة.</em>' }),
      h('p', { class: 'lead' }, 'استلام القماش بالأتواب والكيلو، أمر القص بالمقاسات، الخارج والراجع، مقبوضات العملاء وحساباتهم، وحضور العمال ومرتباتهم. كل مراحل الإنتاج في مكان واحد.'),
      h('div', { class: 'motto' }, mottoT),
      h('div', { class: 'stages' }, h('div', { class: 'stg' }, h('small', null, '01'), h('b', null, 'قص')), h('span', { class: 'stg-ar' }, '←'), h('div', { class: 'stg' }, h('small', null, '02'), h('b', null, 'تشغيل')), h('span', { class: 'stg-ar' }, '←'), h('div', { class: 'stg' }, h('small', null, '03'), h('b', null, 'تسليم'))),
      h('div', { class: 'art', html: ART })),
    h('div', { class: 'land-r' }, form),
    h('div', { class: 'land-f' }, h('span', null, APP_NAME), h('span', null, 'القماش ملك العميل، والمصنع يقدّم الخدمة')));
  const LT_DEF = [['classic', 'كلاسيك'], ['dark', 'داكن'], ['glass', 'زجاجي'], ['emerald', 'زمردي'], ['sunset', 'غروب'], ['mono', 'أحادي'], ['violet', 'بنفسجي']];
  const ltSaved = localStorage.getItem('cmt_ltheme');
  land.dataset.lt = LT_DEF.some(x => x[0] === ltSaved) ? ltSaved : 'classic';
  app.append(land);
  const ping = async (n = 0) => {
    try {
      const st = await GET('/status'); go.disabled = false; go.classList.remove('busy'); msg.textContent = '';
      if (st.setup_needed) { setupMode = true; title.textContent = 'إعداد النظام لأول مرة'; sub.textContent = 'أنشئ حساب مدير النظام'; compBox.style.display = 'block'; go.textContent = 'إنشاء الحساب والدخول'; }
    } catch (e) { msg.textContent = n < 2 ? 'جاري الاتصال بالخادم...' : 'الخادم يستيقظ، قد يستغرق ذلك حتى دقيقة...'; setTimeout(() => ping(n + 1), 4000); }
  };
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = window.matchMedia && matchMedia('(min-width:901px)').matches;
  if (desktop) setTimeout(() => { form.style.animation = 'none'; form.style.transform = LT_ROT[land.dataset.lt] || ''; }, 950);
  if (!reduced) {
    let mi = 0;
    setInterval(() => {
      if (!mottoT.isConnected) return;
      mi = (mi + 1) % MOTTO.length;
      mottoT.classList.add('out');
      setTimeout(() => { mottoT.textContent = MOTTO[mi]; mottoT.classList.remove('out'); mottoT.classList.remove('in'); void mottoT.offsetWidth; mottoT.classList.add('in'); }, 400);
    }, 4500);
  }
  if (window.matchMedia && matchMedia('(pointer:fine)').matches && !reduced && desktop) {
    const card = form;
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = 'perspective(900px) rotateY(' + (x * -4) + 'deg) rotateX(' + (y * 4) + 'deg) ' + (LT_ROT[land.dataset.lt] || '') + ' translateY(-2px)';
    });
    card.addEventListener('mouseleave', () => { card.style.transform = LT_ROT[land.dataset.lt] || ''; });
  }
  ping(); user.focus();
}
boot();
