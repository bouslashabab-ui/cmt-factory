'use strict';
/* Shell: login, first-run setup, menus, toolbar */
const LOGO = '<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#c6f36a"/><path d="M20 14l24 36M44 14L20 50" stroke="#172b2a" stroke-width="4.5" stroke-linecap="round"/><circle cx="19" cy="49" r="6" stroke="#172b2a" stroke-width="3.5"/><circle cx="45" cy="49" r="6" stroke="#172b2a" stroke-width="3.5"/></svg>';
const APP_NAME = 'إدارة مصنع الملابس';
const MENUS = [
  ['الملفات', [['👥', 'العملاء (أصحاب القماش)', 'clients'], ['👕', 'الموديلات وسعر التصنيع', 'models'], ['👷', 'الموظفون', 'employees']]],
  ['القماش والقص', [['📥', 'مخزن استلام القماش', 'store'], ['✂', 'أمر القص التفصيلي', 'orders'], ['🖨', 'تتبع الخارج والراجع (طباعة)', 'outs']]],
  ['الحسابات', [['💰', 'سجل مقبوضات العملاء', 'payments'], ['📒', 'حسابات العملاء المجمعة', 'accounts'], ['📑', 'كشف حساب العميل', 'acctstmt']]],
  ['المساعد والتحليل', [['🤖', 'المساعد الذكي', 'assistant'], ['🧾', 'الإقفال اليومي', 'daily_close'], ['🏭', 'لوحة مراحل الإنتاج', 'stages_board'], ['💸', 'المصروفات', 'expenses'], ['📈', 'ربحية أوامر القص', 'profit'], ['⏳', 'أعمار الديون', 'aging']]],
  ['العمال', [['🗓', 'حضور وانصراف العمال', 'attendance'], ['💵', 'المرتبات', 'payroll']]],
  ['النظام', [['⚙', 'الإعدادات', 'settings', 'admin'], ['👤', 'المستخدمون', 'users', 'admin'], ['🕵', 'سجل المراجعة', 'audit', 'admin']]]
];
const TOOLBAR = [['🏠', 'الرئيسية', 'home'], ['📥', 'مخزن القماش', 'store'], ['✂', 'أمر القص', 'orders'], ['🖨', 'الخارج والراجع', 'outs'], ['💰', 'المقبوضات', 'payments'], ['📒', 'حسابات العملاء', 'accounts'], ['🗓', 'الحضور', 'attendance'], ['💵', 'المرتبات', 'payroll']];
const TITLES = {}; MENUS.forEach(m => m[1].forEach(i => { TITLES[i[2]] = i[1]; })); TITLES.home = 'الرئيسية';

async function openPage(key) {
  const f = MZ.pages[key]; if (!f) return toast('الشاشة غير متاحة', 'err');
  openWin(key, TITLES[key] || key, async () => { const r = f(); return await r; }, { refresh: true });
}
function logout() { SND.play('logout'); sessionStorage.removeItem('cmt_tok'); setTimeout(() => location.reload(), 650); }
function muteBtn() { const b = h('button', { class: 'mute', title: 'كتم / تشغيل الأصوات', onclick: () => { const m = SND.toggle(); b.textContent = m ? '🔇' : '🔊'; } }, SND.muted ? '🔇' : '🔊'); return b; }
const ROLE_AR = { admin: 'مدير النظام', staff: 'موظف', viewer: 'عرض فقط' };

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
      h('button', { class: 'tbn', onclick: () => printPage() }, '🖨 طباعة'), h('button', { class: 'tbn', onclick: () => exportChooser() }, '⬇ تصدير'), h('div', { class: 'today' }, new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))),
    h('div', { id: 'desk' }));
  app.append(side, main);
  const sync = () => document.querySelectorAll('.nv').forEach(n => n.classList.toggle('on', n.getAttribute('data-k') === MZ.active));
  new MutationObserver(sync).observe($('#tabs'), { subtree: true, childList: true, attributes: true });
  openWin('home', 'الرئيسية', () => MZ.pages.home());
  sync(); setTimeout(() => assistCount(), 1500);
}

async function boot() {
  const app = $('#app');
  if (!MZ.api) { app.textContent = 'إعداد الخادم غير موجود'; return; }
  if (MZ.token) {
    try { const me = await GET('/me'); MZ.user = me.user; MZ.settings = me.settings; await Promise.all(['clients', 'models', 'stages'].map(n => load(n, true))); shell(); return; }
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
  const title = h('h2', null, 'دخول النظام'), sub = h('div', { class: 'sub' }, 'سجّل الدخول للمتابعة');
  const compBox = h('div', { style: { display: 'none' } }, h('label', null, 'اسم المصنع'), company);
  let setupMode = false;
  const form = h('form', { class: 'lg-card', onsubmit: async (e) => {
    e.preventDefault(); go.disabled = true; msg.className = 'lg-msg info'; msg.textContent = 'جاري التحقق...';
    try {
      if (setupMode) await POST('/setup', { username: user.value, password: pass.value, company: company.value });
      const r = await POST('/login', { username: user.value, password: pass.value });
      MZ.token = r.token; sessionStorage.setItem('cmt_tok', r.token); SND.play('login'); await boot();
    } catch (err) { msg.className = 'lg-msg'; msg.textContent = err.message; go.disabled = false; }
  } }, title, sub, compBox, h('label', { for: 'u' }, 'اسم المستخدم'), user, h('label', { for: 'p' }, 'كلمة المرور'), pass, go, msg, h('div', { class: 'lg-foot' }, APP_NAME + ' © التصنيع للغير'));
  const ART = '<svg viewBox="0 0 520 300" fill="none"><g class="float"><rect x="20" y="170" width="190" height="64" rx="32" fill="#397d73"/><ellipse cx="52" cy="202" rx="22" ry="22" fill="#172b2a"/><ellipse cx="52" cy="202" rx="9" ry="9" fill="#f5f3ec"/><rect x="40" y="120" width="190" height="60" rx="30" fill="#c6f36a" stroke="#172b2a" stroke-width="2"/><ellipse cx="72" cy="150" rx="20" ry="20" fill="#172b2a"/><ellipse cx="72" cy="150" rx="8" ry="8" fill="#f5f3ec"/></g><path class="draw" d="M300 60l40-22 30 14 30-14 40 22-22 36-22-10v118h-92V86l-22 10z" fill="#fff" stroke="#172b2a" stroke-width="3" stroke-linejoin="round"/><path class="cut" d="M262 20C300 140 420 150 500 270" stroke="#e47b65" stroke-width="3" stroke-linecap="round"/><circle cx="262" cy="20" r="6" fill="#e47b65"/><path d="M330 120h70M330 140h70M330 160h50" stroke="#c6f36a" stroke-width="5" stroke-linecap="round"/><g transform="translate(250 262)"><path d="M0 0h260" stroke="#172b2a" stroke-width="2" stroke-dasharray="3 6"/><text x="0" y="-8" font-size="12" fill="#84918a" font-family="Tahoma">cut · sew · deliver</text></g></svg>';
  app.append(h('div', { class: 'land' },
    h('div', { class: 'land-l' }, h('span', { class: 'tagline' }, 'نظام التصنيع للغير'),
      h('h1', { html: 'من القماش...<br><em>لقطعة جاهزة.</em>' }),
      h('p', { class: 'lead' }, 'استلام القماش بالأتواب والكيلو، أمر القص بالمقاسات، الخارج والراجع، مقبوضات العملاء وحساباتهم، وحضور العمال ومرتباتهم. كل مراحل الإنتاج في مكان واحد.'),
      h('div', { class: 'stages' }, h('div', { class: 'stg' }, h('small', null, '01'), h('b', null, 'قص')), h('span', { class: 'stg-ar' }, '←'), h('div', { class: 'stg' }, h('small', null, '02'), h('b', null, 'تشغيل')), h('span', { class: 'stg-ar' }, '←'), h('div', { class: 'stg' }, h('small', null, '03'), h('b', null, 'تسليم'))),
      h('div', { class: 'art', html: ART })),
    h('div', { class: 'land-r' }, form),
    h('div', { class: 'land-f' }, h('span', null, APP_NAME), h('span', null, 'القماش ملك العميل، والمصنع يقدّم الخدمة'))));
  const ping = async (n = 0) => {
    try {
      const st = await GET('/status'); go.disabled = false; msg.textContent = '';
      if (st.setup_needed) { setupMode = true; title.textContent = 'إعداد النظام لأول مرة'; sub.textContent = 'أنشئ حساب مدير النظام'; compBox.style.display = 'block'; go.textContent = 'إنشاء الحساب والدخول'; }
    } catch (e) { msg.textContent = n < 2 ? 'جاري الاتصال بالخادم...' : 'الخادم يستيقظ، قد يستغرق ذلك حتى دقيقة...'; setTimeout(() => ping(n + 1), 4000); }
  };
  ping(); user.focus();
}
boot();
