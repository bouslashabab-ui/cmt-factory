'use strict';
/* Shell: login, first-run setup, menus, toolbar */
const LOGO = '<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#9aa8ff"/><path d="M20 14l24 36M44 14L20 50" stroke="#0f1437" stroke-width="4.5" stroke-linecap="round"/><circle cx="19" cy="49" r="6" stroke="#0f1437" stroke-width="3.5"/><circle cx="45" cy="49" r="6" stroke="#0f1437" stroke-width="3.5"/></svg>';
const APP_NAME = 'إدارة مصنع الملابس';
const MENUS = [
  ['الفواتير', [['🧾', 'فواتير المبيعات', 'sinv_list'], ['➕', 'فاتورة جديدة', 'sinv_new'], ['🏬', 'الفروع', 'branches']]],
  ['الملفات', [['👥', 'العملاء (أصحاب القماش)', 'clients'], ['👕', 'الموديلات وسعر التصنيع', 'models'], ['👷', 'الموظفون', 'employees']]],
  ['القماش والقص', [['📥', 'مخزن استلام القماش', 'store'], ['✂', 'أمر القص التفصيلي', 'orders'], ['🖨', 'تتبع الخارج والراجع (طباعة)', 'outs']]],
  ['الحسابات', [['💰', 'سجل مقبوضات العملاء', 'payments'], ['📒', 'حسابات العملاء المجمعة', 'accounts'], ['📑', 'كشف حساب العميل', 'acctstmt']]],
  ['المخزون', [['📦', 'رصيد المخزون', 'inv_stock'], ['🏷', 'الأصناف والمخازن', 'inv_items'], ['🧾', 'حركات المخزون', 'inv_moves'], ['📇', 'كارت الصنف', 'inv_card'], ['📋', 'جرد المخزون', 'inv_count']]],
  ['المحاسبة (الدورة المحاسبية)', [['📚', 'دليل الحسابات', 'gl_accounts'], ['📒', 'قيود اليومية', 'gl_journal'], ['📖', 'دفتر الأستاذ', 'gl_ledger'], ['👥', 'أستاذ مساعد العملاء', 'gl_subledger'], ['🏭', 'الموردون', 'gl_suppliers'], ['📑', 'أستاذ مساعد الموردين', 'gl_supledger'], ['🧮', 'كشف مورد تفصيلي', 'supplier_statement'], ['⚖', 'ميزان المراجعة', 'gl_trial'], ['📊', 'القوائم المالية', 'gl_statements'], ['💧', 'قائمة التدفقات النقدية', 'cash_flow'], ['🏦', 'التسوية البنكية', 'bank_rec'], ['🏗️', 'الأصول الثابتة', 'assets'], ['📆', 'الاستحقاقات والمقدمات', 'accruals'], ['🧾', 'ضريبة القيمة المضافة', 'vat'], ['🔒', 'إقفال الفترة', 'gl_close']]],
  ['المساعد والتحليل', [['🤖', 'المساعد الذكي', 'assistant'], ['🧾', 'الإقفال اليومي', 'daily_close'], ['🏭', 'لوحة مراحل الإنتاج', 'stages_board'], ['💸', 'المصروفات', 'expenses'], ['📈', 'ربحية أوامر القص', 'profit'], ['⏳', 'أعمار الديون', 'aging']]],
  ['العمال', [['🗓', 'حضور وانصراف العمال', 'attendance'], ['💵', 'المرتبات', 'payroll']]],
  ['النظام', [['⚙', 'الإعدادات', 'settings', 'admin'], ['👤', 'المستخدمون', 'users', 'admin'], ['🕵', 'سجل المراجعة', 'audit', 'admin']]]
];
const TOOLBAR = [['🏠', 'الرئيسية', 'home'], ['🧾', 'الفواتير', 'sinv_list'], ['📥', 'مخزن القماش', 'store'], ['✂', 'أمر القص', 'orders'], ['🖨', 'الخارج والراجع', 'outs'], ['💰', 'المقبوضات', 'payments'], ['📒', 'حسابات العملاء', 'accounts'], ['🗓', 'الحضور', 'attendance'], ['💵', 'المرتبات', 'payroll']];
const TITLES = {}; MENUS.forEach(m => m[1].forEach(i => { TITLES[i[2]] = i[1]; })); TITLES.home = 'الرئيسية';

async function openPage(key) {
  const f = MZ.pages[key]; if (!f && !String(key).startsWith('sinv_view_') && !String(key).startsWith('sinv_edit_')) return toast('الشاشة غير متاحة', 'err');
  try { history.replaceState(null, '', '#p=' + key); } catch (e) {}
  openWin(key, TITLES[key] || key, async () => { const r = f(); return await r; }, { refresh: true });
}
function logout() { SND.play('logout'); sessionStorage.removeItem('cmt_tok'); setTimeout(() => location.reload(), 650); }
function muteBtn() { const b = h('button', { class: 'mute', title: 'كتم / تشغيل الأصوات', onclick: () => { const m = SND.toggle(); b.textContent = m ? '🔇' : '🔊'; } }, SND.muted ? '🔇' : '🔊'); return b; }
const ROLE_AR = { admin: 'مدير النظام', staff: 'موظف', viewer: 'عرض فقط' };

/* ---------- horizontal top navigation with mega-menu panels (desktop) ---------- */
function buildTopnav(nm) {
  const PAGE2SEC = {}; MENUS.forEach(([t, items]) => items.forEach(i => { PAGE2SEC[i[2]] = t; }));
  const secOf = (k) => PAGE2SEC[k] || (String(k).startsWith('sinv_view_') || String(k).startsWith('sinv_edit_') ? PAGE2SEC.sinv_list : null);
  const adminOk = (i) => i[3] !== 'admin' || MZ.user.role === 'admin';
  const SHORT = { 'المحاسبة (الدورة المحاسبية)': 'المحاسبة' };
  const MORE = 'المزيد';
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
    if (overSecs.length) secsNav.append(mkSecBtn(MORE, [], '⋮ ' + MORE));
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
    h('div', { class: 'tn-me' }, muteBtn(), h('span', { class: 'tn-nm' }, nm), h('button', { class: 'tn-out', onclick: logout }, 'خروج')));
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

function shell() {
  const app = $('#app'); app.innerHTML = '';
  const adminOk = (i) => i[3] !== 'admin' || MZ.user.role === 'admin';
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
      h('button', { class: 'tbn', onclick: themePicker, title: 'سمات النظام' }, '🎨 السمات'), h('button', { class: 'tbn', onclick: () => printPage() }, '🖨 طباعة'), h('button', { class: 'tbn', onclick: () => exportChooser() }, '⬇ تصدير'), h('div', { class: 'today today-plain' }, new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))),
    h('div', { id: 'desk' }));
  app.append(...buildTopnav(nm), side, main);
  requestAnimationFrame(() => window.__tnLayout && window.__tnLayout());
  const sync = () => document.querySelectorAll('.nv').forEach(n => n.classList.toggle('on', n.getAttribute('data-k') === MZ.active));
  new MutationObserver(sync).observe($('#tabs'), { subtree: true, childList: true, attributes: true });
  openWin('home', 'الرئيسية', () => MZ.pages.home());
  sync(); setTimeout(() => assistCount(), 1500);
  const hm = (location.hash || '').match(/^#p=([A-Za-z0-9_]+)/);
  if (hm && hm[1] !== 'home') setTimeout(() => openPage(hm[1]), 400);
  if (!window.__hashBound) { window.__hashBound = true; window.addEventListener('hashchange', () => { const mm = (location.hash || '').match(/^#p=([A-Za-z0-9_]+)/); if (mm) openPage(mm[1]); }); }
}

async function boot() {
  const app = $('#app');
  if (!MZ.api) { app.textContent = 'إعداد الخادم غير موجود'; return; }
  if (MZ.token) {
    try { const me = await GET('/me'); MZ.user = me.user; MZ.settings = me.settings; if (me.user.theme && me.user.theme !== MZ.theme) applyTheme(me.user.theme); await Promise.all(['clients', 'models', 'stages'].map(n => load(n, true))); shell(); return; }
    catch (e) { sessionStorage.removeItem('cmt_tok'); MZ.token = null; }
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
  pass.addEventListener('keyup', (e) => { try { caps.style.display = (e.getModifierState && e.getModifierState('CapsLock')) ? 'block' : 'none'; } catch (x) {} });
  pass.addEventListener('blur', () => { caps.style.display = 'none'; });
  const userFld = h('div', { class: 'fld' }, h('span', { class: 'fld-i' }, '👤'), user);
  const passFld = h('div', { class: 'fld' }, h('span', { class: 'fld-i' }, '🔒'), pass, eye);
  const title = h('h2', null, 'دخول النظام'), sub = h('div', { class: 'sub' }, 'سجّل الدخول للمتابعة');
  const compBox = h('div', { style: { display: 'none' } }, h('label', null, 'اسم المصنع'), company);
  let setupMode = false;
  const form = h('form', { class: 'lg-card', onsubmit: async (e) => {
    e.preventDefault(); go.disabled = true; go.classList.add('busy'); msg.className = 'lg-msg info'; msg.textContent = 'جاري التحقق...';
    try {
      if (setupMode) await POST('/setup', { username: user.value, password: pass.value, company: company.value });
      const r = await POST('/login', { username: user.value, password: pass.value });
      go.classList.remove('busy'); go.classList.add('done'); MZ.token = r.token; sessionStorage.setItem('cmt_tok', r.token); SND.play('login'); await boot();
    } catch (err) { go.classList.remove('busy'); msg.className = 'lg-msg'; msg.textContent = err.message; go.disabled = false; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
  } }, title, sub, compBox, h('label', { for: 'u' }, 'اسم المستخدم'), userFld, h('label', { for: 'p' }, 'كلمة المرور'), passFld, caps, go, msg, h('div', { class: 'lg-foot' }, APP_NAME + ' © التصنيع للغير'));
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
  const lts = h('div', { class: 'lts' }, h('span', null, 'التصميم:'), ...LT_DEF.map(([k, t]) => h('button', { type: 'button', class: k === land.dataset.lt ? 'on' : '', onclick: (ev) => { land.dataset.lt = k; localStorage.setItem('cmt_ltheme', k); lts.querySelectorAll('button').forEach(x => x.classList.remove('on')); ev.currentTarget.classList.add('on'); if (window.matchMedia && matchMedia('(min-width:901px)').matches) { form.style.animation = 'none'; form.style.transform = LT_ROT[k] || ''; } } }, t)));
  app.append(land, lts);
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
