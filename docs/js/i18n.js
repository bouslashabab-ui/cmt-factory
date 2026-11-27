/* i18n: Arabic/English engine — dictionary + automatic DOM translation.
   English mode translates known UI strings (exact text-node matches); user data is never touched. */
(function () {
  const DICT = {
    '© التصنيع للغير': '© Cut-Make-Trim',
    'إدارة مصنع الملابس': 'Garment Factory Management',
    'نظام التصنيع للغير': 'Cut-Make-Trim System',
    'تصنيع للغير': 'Cut-Make-Trim',
    'من القماش...': 'From fabric...',
    'لقطعة جاهزة.': 'to a finished garment.',
    'استلام القماش بالأتواب والكيلو، أمر القص بالمقاسات، الخارج والراجع، مقبوضات العملاء وحساباتهم، وحضور العمال ومرتباتهم. كل مراحل الإنتاج في مكان واحد.': 'Receive fabric by rolls and kilos, cutting orders with measurements, outgoing and returned pieces, customer receipts and balances, and worker attendance and payroll. Every production stage in one place.',
    'القماش ملك العميل، والمصنع يقدّم الخدمة': 'The fabric belongs to the customer; the factory provides the service',
    'كل غرزة متقنة… خطوة أقرب للإتقان.': 'Every careful stitch… one step closer to perfection.',
    'النظام الصح بيوفّر وقتك ويرفع إنتاجك.': 'The right system saves your time and boosts your output.',
    'صنعة النهاردة… سمعة بكرة.': "Today's craft is tomorrow's reputation.",
    'الإنتاج المنظّم = راحة بال وربح أسرع.': 'Organized production = peace of mind and faster profit.',
    'ابدأ يومك بخطة… واختمه بإنجاز.': 'Start your day with a plan… end it with progress.',
    'دخول النظام': 'Sign in',
    'سجّل الدخول للمتابعة': 'Sign in to continue',
    'اسم المستخدم': 'Username',
    'كلمة المرور': 'Password',
    'اسم المصنع': 'Factory name',
    'إظهار/إخفاء كلمة المرور': 'Show/hide password',
    '⚠ تنبيه: زر Caps Lock مفعّل': '⚠ Warning: Caps Lock is on',
    'إعداد النظام لأول مرة': 'First-time system setup',
    'أنشئ حساب مدير النظام': 'Create the admin account',
    'إنشاء الحساب والدخول': 'Create account & sign in',
    'إعداد الخادم غير موجود': 'Server configuration is missing',
    'جاري الاتصال بالخادم...': 'Connecting to the server...',
    'جاري التحقق...': 'Verifying...',
    'جاري التحميل...': 'Loading...',
    'الخادم يستيقظ، قد يستغرق ذلك حتى دقيقة...': 'The server is waking up, this may take up to a minute...',
    'تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مرة أخرى': 'Could not reach the server. Check your internet connection and try again',
    'انتهت الجلسة': 'Session expired',
    'الشاشة غير متاحة': 'This screen is unavailable',
    'خطأ غير متوقع (': 'Unexpected error (',
    'التصميم:': 'Design:',
    'كلاسيك': 'Classic',
    'داكن': 'Dark',
    'زجاجي': 'Glass',
    'زمردي': 'Emerald',
    'غروب': 'Sunset',
    'أحادي': 'Mono',
    'بنفسجي': 'Violet',
    'كلاسيك المصنع': 'Factory Classic',
    'إنديجو أتيليه': 'Indigo Atelier',
    'الواحة الزمردية': 'Emerald Oasis',
    'الشريط الداكن الأصلي بلمسات لايم ونيلي': 'The original dark bar with lime and indigo touches',
    'الهوية الافتراضية: نيلي ليلي وألباستر وخيط وردي': 'The default identity: night indigo, alabaster and pink thread',
    'زمردي عميق ورملي دافئ بلمسات ذهبية': 'Deep emerald and warm sand with gold touches',
    'اختر سمة النظام': 'Choose a system theme',
    'سمات النظام': 'System themes',
    'تم تطبيق سمة «': 'Theme applied: «',
    'تُحفظ السمة في حسابك وتطبق على كل أجهزتك.': 'Your theme is saved to your account and applies on all your devices.',
    '🏠 الرئيسية': '🏠 Home',
    'الرئيسية': 'Home',
    'خروج': 'Log out',
    'الفواتير': 'Invoices',
    'الملفات': 'Files',
    'القماش والقص': 'Fabric & Cutting',
    'الحسابات': 'Accounts',
    'المخزون': 'Inventory',
    'المحاسبة': 'Accounting',
    'المحاسبة (الدورة المحاسبية)': 'Accounting (Accounting Cycle)',
    'المساعد والتحليل': 'Assistant & Analysis',
    'المساعد الذكي': 'Smart Assistant',
    'العمال': 'Workers',
    'النظام': 'System',
    'المزيد': 'More',
    'الأقسام': 'Sections',
    'الإعدادات': 'Settings',
    '⚙ الإعدادات': '⚙ Settings',
    '🎨 السمات': '🎨 Themes',
    '🖨 طباعة': '🖨 Print',
    '⬇ تصدير': '⬇ Export',
    '💾 حفظ': '💾 Save',
    '💾 نسخة احتياطية': '💾 Backup',
    '➕ جديد': '➕ New',
    '🗑 حذف': '🗑 Delete',
    '🗑 تجاهل التغييرات': '🗑 Discard changes',
    'إغلاق': 'Close',
    'إلغاء': 'Cancel',
    'تأكيد': 'Confirm',
    'نعم': 'Yes',
    'البقاء': 'Stay',
    'عرض': 'View',
    'عرض فقط': 'View only',
    'التالي': 'Next',
    'السابق': 'Previous',
    'الأول': 'First',
    'الأخير': 'Last',
    'كتم / تشغيل الأصوات': 'Mute / unmute sounds',
    'اسمح بالنوافذ المنبثقة للطباعة': 'Allow pop-ups to print',
    'تغييرات غير محفوظة': 'Unsaved changes',
    'لديك تعديلات لم تُحفظ في هذه الشاشة. ماذا تريد أن تفعل؟': 'You have unsaved changes on this screen. What would you like to do?',
    'لا توجد بيانات': 'No data',
    'بانتظار الاعتماد': 'Pending approval',
    'مسودة': 'Draft',
    'مرحّلة': 'Posted',
    'محوّلة': 'Transferred',
    'ملغاة': 'Canceled',
    'مرفوضة': 'Rejected',
    'فاتورة جديدة': 'New invoice',
    'فاتورة مبيعات': 'Sales Invoice',
    'فواتير المبيعات': 'Sales Invoices',
    'فاتورة مشتريات': 'Purchase Invoice',
    'مردود مبيعات': 'Sales Return',
    'مردود مشتريات': 'Purchase Return',
    'عرض سعر': 'Quotation',
    'أمر بيع': 'Sales Order',
    'أمر شراء': 'Purchase Order',
    'أمر القص': 'Cutting Order',
    'أمر القص التفصيلي': 'Detailed Cutting Order',
    'الخارج والراجع': 'Outgoing & Returned',
    'تتبع الخارج والراجع (طباعة)': 'Outgoing/Returned Tracking (print)',
    'لوحة مراحل الإنتاج': 'Production Stages Board',
    'قص': 'Cutting',
    'تشغيل': 'Processing',
    'تسليم': 'Delivery',
    'مخزن القماش': 'Fabric Store',
    'مخزن استلام القماش': 'Fabric Receiving Store',
    'حركات المخزون': 'Stock Movements',
    'رصيد المخزون': 'Stock Balance',
    'جرد المخزون': 'Stock Count',
    'كارت الصنف': 'Item Card',
    'الأصناف والمخازن': 'Items & Warehouses',
    'الموديلات وسعر التصنيع': 'Models & Making Prices',
    'العملاء (أصحاب القماش)': 'Customers (fabric owners)',
    'حسابات العملاء': 'Customer Accounts',
    'حسابات العملاء المجمعة': 'Consolidated Customer Accounts',
    'كشف حساب العميل': 'Customer Statement',
    'سجل مقبوضات العملاء': 'Customer Receipts Log',
    'الموردون': 'Suppliers',
    'كشف مورد تفصيلي': 'Detailed Supplier Statement',
    'المقبوضات': 'Receipts',
    'المصروفات': 'Expenses',
    'مصروفات': 'Expenses',
    'إيرادات': 'Revenue',
    'المرتبات': 'Payroll',
    'الحضور': 'Attendance',
    'حضور وانصراف العمال': 'Worker Attendance',
    'الموظفون': 'Employees',
    'موظف': 'Employee',
    'مدير النظام': 'System admin',
    'المستخدمون': 'Users',
    'الفروع': 'Branches',
    'دليل الحسابات': 'Chart of Accounts',
    'قيود اليومية': 'Journal Entries',
    'دفتر الأستاذ': 'General Ledger',
    'أستاذ مساعد العملاء': 'Customers Subsidiary Ledger',
    'أستاذ مساعد الموردين': 'Suppliers Subsidiary Ledger',
    'ميزان المراجعة': 'Trial Balance',
    'القوائم المالية': 'Financial Statements',
    'قائمة التدفقات النقدية': 'Cash Flow Statement',
    'الأصول الثابتة': 'Fixed Assets',
    'أصول': 'Assets',
    'خصوم': 'Liabilities',
    'حقوق ملكية': 'Equity',
    'أعمار الديون': 'Debt Aging',
    'الاستحقاقات والمقدمات': 'Accruals & Advances',
    'الإقفال اليومي': 'Daily Close',
    'إقفال الفترة': 'Period Close',
    'التسوية البنكية': 'Bank Reconciliation',
    'ضريبة القيمة المضافة': 'Value Added Tax',
    'ربحية أوامر القص': 'Cutting Order Profitability',
    'سجل المراجعة': 'Audit Log',
    'اللغة': 'Language',
    'العربية': 'Arabic',
    'لغة واجهة النظام': 'System interface language',
    'اختر لغة الواجهة. تُحفظ وتطبق فورًا على كل الشاشات.': 'Choose the interface language. It is saved and applies instantly to every screen.',
    'إدارة مصنع الملابس © التصنيع للغير': 'Garment Factory Management © Cut-Make-Trim',
    'اضغط للتبديل بين التاريخ الميلادي والهجري': 'Click to switch between Gregorian and Hijri dates',
    'العملة': 'Currency',
    'العنوان': 'Address',
    'الهاتف': 'Phone',
    'ذيل الفاتورة': 'Invoice footer',
    'خصم الغياب في الراتب': 'Absence deduction in payroll',
    'كما في إكسيل أحمد (يُخصم الغياب مرتين)': "As in Ahmed's Excel (absence deducted twice)",
    'مصحّح (الغياب يُخصم مرة واحدة)': 'Corrected (absence deducted once)',
    'قفل ما قبل تاريخ (YYYY-MM-DD) - فارغ = مفتوح': 'Lock before date (YYYY-MM-DD) - empty = open',
    'تنبيه الهالك فوق (%)': 'Waste alert above (%)',
    'تنبيه قماش راكد (يوم)': 'Idle fabric alert (days)',
    'تنبيه خارج متأخر (يوم)': 'Late outgoing alert (days)',
    'تنبيه دين متأخر (يوم)': 'Late debt alert (days)',
    'تنبيه تغيّر التكلفة (%)': 'Cost deviation alert (%)',
    'تنبيه غياب (أيام)': 'Absence alert (days)',
    'تنبيه إضافي (ساعات)': 'Overtime alert (hours)',
    '🔑 تغيير كلمة مروري': '🔑 Change my password',
    'تغيير كلمة مروري': 'Change my password',
    'الحالية': 'Current',
    'الجديدة (8 أحرف)': 'New (8 characters)',
    'تم تغيير كلمة المرور': 'Password changed',
    'تم الحفظ': 'Saved',
    'تم اختيار تصميم شاشة الدخول': 'Login screen design selected',
    '🎨 تصميم شاشة الدخول': '🎨 Login screen design',
    'تصميم شاشة الدخول': 'Login screen design',
    'اختر شكل شاشة الدخول. يمكن أيضًا تبديله مباشرة من شاشة الدخول نفسها (شريط التصميم أسفل الشاشة).': 'Choose the login screen look. You can also switch it right from the login screen itself (the design bar at the bottom).',
    'كلاسيك (الأصلي)': 'Classic (original)',
    'داكن فاخر': 'Premium dark',
    'زجاجي فاتح': 'Light glass',
    'غروب دافئ': 'Warm sunset',
    'أحادي تحريري': 'Editorial mono',
    'بنفسجي ملكي': 'Royal violet',
    '🔎 بحث شامل (كود/عميل/باركود)': '🔎 Global search (code/customer/barcode)'
  };
  const AR_RE = /[؀-ۿ]/;
  let lang = 'ar';
  try { lang = localStorage.getItem('cmt_lang') === 'en' ? 'en' : 'ar'; } catch (e) {}
  const tracked = new Set();
  const trackedAttrs = new Set();

  function trText(s) {
    const t = s.trim();
    if (!t || !AR_RE.test(t)) return null;
    const en = DICT[t];
    if (!en) return null;
    return s.replace(t, en);
  }
  function walkText(root) {
    let it;
    try { it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); } catch (e) { return; }
    const nodes = []; let n;
    while ((n = it.nextNode())) nodes.push(n);
    for (const tn of nodes) {
      if (tn.__i18n_ar !== undefined) continue;
      const p = tn.parentElement;
      if (!p) continue;
      const tag = p.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const r = trText(tn.nodeValue);
      if (r !== null) { tn.__i18n_ar = tn.nodeValue; tn.nodeValue = r; tracked.add(tn); }
      else tn.__i18n_ar = null;
    }
  }
  function walkAttrs(root) {
    let els;
    try { els = root.querySelectorAll('[placeholder],[title]'); } catch (e) { return; }
    els.forEach((el) => {
      if (el.__i18n_attrs) return;
      const bag = {};
      ['placeholder', 'title'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v && AR_RE.test(v) && DICT[v.trim()]) { bag[a] = v; el.setAttribute(a, v.replace(v.trim(), DICT[v.trim()])); }
      });
      if (Object.keys(bag).length) { el.__i18n_attrs = bag; trackedAttrs.add(el); }
    });
  }
  function walkAll() {
    const app = document.getElementById('app');
    walkText(app || document.body);
    walkAttrs(app || document.body);
  }
  function restoreAll() {
    tracked.forEach((tn) => { if (tn.__i18n_ar != null) tn.nodeValue = tn.__i18n_ar; tn.__i18n_ar = undefined; });
    tracked.clear();
    trackedAttrs.forEach((el) => { const bag = el.__i18n_attrs || {}; Object.keys(bag).forEach((a) => el.setAttribute(a, bag[a])); el.__i18n_attrs = null; });
    trackedAttrs.clear();
  }
  function syncButtons() {
    document.querySelectorAll('.lang-btn').forEach((b) => { b.textContent = lang === 'en' ? '🌐 ع' : '🌐 EN'; b.title = lang === 'en' ? 'التبديل إلى العربية' : 'Switch to English'; });
    document.querySelectorAll('.lang-sel').forEach((s) => { s.value = lang; });
  }
  function setLang(l, save) {
    lang = l === 'en' ? 'en' : 'ar';
    if (save !== false) { try { localStorage.setItem('cmt_lang', lang); } catch (e) {} }
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'en') walkAll(); else restoreAll();
    syncButtons();
    try { if (window.CLOCK_REBUILD) CLOCK_REBUILD(); } catch (e) {}
    if (save !== false && window.MZ && MZ.token && typeof PUT === 'function') {
      try { PUT('/settings', { lang }).catch(() => {}); } catch (e) {}
    }
  }
  let obsT = null;
  const obs = new MutationObserver(() => {
    if (lang !== 'en') return;
    clearTimeout(obsT);
    obsT = setTimeout(walkAll, 60);
  });
  function start() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'en') walkAll();
    syncButtons();
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.I18N = { DICT, setLang, get lang() { return lang; }, apply: walkAll };
  window.MZ_LOC = () => (lang === 'en' ? 'en-GB' : 'ar-EG');
  window.I18N_SET = setLang;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
