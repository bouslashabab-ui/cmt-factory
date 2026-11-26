'use strict';
/* Shell: login, first-run setup, menus, toolbar */
const LOGO = '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="49" r="8"/><circle cx="46" cy="49" r="8"/><path d="M23 42L47 9M41 42L17 9"/></svg>';
const APP_NAME = 'إدارة مصنع الملابس';
const MENUS = [
  ['الملفات', [['👥', 'العملاء (أصحاب القماش)', 'clients'], ['👕', 'الموديلات وسعر التصنيع', 'models'], ['🧵', 'مراحل الإنتاج', 'stages']]],
  ['القماش والقص', [['📥', 'استلام قماش من العميل', 'receipts'], ['🎞', 'أرصدة أتواب العملاء', 'rolls'], ['✂', 'أوامر القص', 'cuts']]],
  ['الإنتاج والتسليم', [['🪡', 'تسجيل الإنتاج بالمراحل', 'prod'], ['📊', 'متابعة أوامر التشغيل', 'track'], ['🚚', 'تسليم بضاعة للعميل', 'deliveries']]],
  ['الحسابات', [['🧾', 'فواتير التصنيع', 'invoices'], ['💰', 'مدفوعات العملاء', 'payments'], ['📑', 'كشف حساب عميل', 'statement']]],
  ['التقارير', [['🏬', 'مخزون العملاء (غير مقيّم)', 'stockrep'], ['♻', 'الهدر والعيوب', 'waste']]],
  ['النظام', [['⚙', 'الإعدادات', 'settings', 'admin'], ['👤', 'المستخدمون', 'users', 'admin'], ['🕵', 'سجل المراجعة', 'audit', 'admin']]]
];
const TOOLBAR = [['🏠', 'الرئيسية', 'home'], ['📥', 'استلام قماش', 'receipts'], ['✂', 'قص', 'cuts'], ['🪡', 'إنتاج', 'prod'], ['🚚', 'تسليم', 'deliveries'], ['🧾', 'فواتير', 'invoices'], ['👥', 'العملاء', 'clients']];
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
  const menu = h('div', { class: 'menubar' }, MENUS.map(([t, items]) => {
    const vis = items.filter(adminOk); if (!vis.length) return null;
    return h('div', { class: 'mi' }, h('span', null, t), h('div', { class: 'dd' }, vis.map(i => h('div', { class: 'it', onclick: () => openPage(i[2]) }, h('span', null, i[0]), i[1]))));
  }));
  const tb = h('div', { class: 'toolbar' }, TOOLBAR.map(t => h('button', { class: 'tb', onclick: () => openPage(t[2]) }, h('i', null, t[0]), t[1])),
    h('button', { class: 'tb', onclick: () => { const w = MZ.wins[MZ.active]; w && w.refresh && w.refresh(); } }, h('i', null, '🔄'), 'تحديث'));
  app.append(
    h('div', { class: 'banner' }, h('div', { class: 'brand', html: LOGO + '<div><h1>' + APP_NAME + '</h1><small>' + esc(MZ.settings.company_name || 'تصنيع للغير') + '</small></div>' }),
      h('div', { class: 'who' }, muteBtn(), h('span', { class: 'chip' }, '👤 ' + (MZ.user.name || MZ.user.username) + ' | ' + (ROLE_AR[MZ.user.role] || '')), h('button', { onclick: logout }, 'تسجيل الخروج'))),
    menu, tb, h('div', { class: 'tabs', id: 'tabs' }), h('div', { id: 'desk' }),
    h('div', { class: 'statusbar' }, h('span', null, APP_NAME), h('span', null, new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))));
  openWin('home', 'الرئيسية', () => MZ.pages.home());
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
  const go = h('button', { class: 'go', type: 'submit', disabled: true }, 'تسجيل الدخول');
  const title = h('h2', null, 'مرحباً بعودتك'), sub = h('div', { class: 'sub' }, 'سجّل الدخول للمتابعة');
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
  app.append(h('div', { class: 'login-page' },
    h('div', { class: 'lg-art' }, h('div', { html: LOGO }), h('h1', null, APP_NAME), h('p', null, 'نظام للمصانع التي تعمل بالتصنيع للغير: القماش ملك العميل، والمصنع يقدّم خدمة القص والخياطة والتسليم.'),
      h('ul', null, ['استلام أتواب القماش من العميل بالطول والوزن واللون', 'أوامر قص بالطبقات والمقاسات وحساب الهدر', 'مراحل الخياطة والتشطيب بالكميات', 'تسليم الإنتاج للعميل وفوترة الخدمة بالقطعة'])),
    h('div', { class: 'lg-form' }, form)));
  const ping = async (n = 0) => {
    try {
      const st = await GET('/status'); go.disabled = false; msg.textContent = '';
      if (st.setup_needed) { setupMode = true; title.textContent = 'إعداد النظام لأول مرة'; sub.textContent = 'أنشئ حساب مدير النظام'; compBox.style.display = 'block'; go.textContent = 'إنشاء الحساب والدخول'; }
    } catch (e) { msg.textContent = n < 2 ? 'جاري الاتصال بالخادم...' : 'الخادم يستيقظ، قد يستغرق ذلك حتى دقيقة...'; setTimeout(() => ping(n + 1), 4000); }
  };
  ping(); user.focus();
}
boot();
