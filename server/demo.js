'use strict';
/* Demo mode (DEMO_MODE=1): isolated fake sample data, timed demo sessions, periodic reset.
   Loaded ONLY on the demo deployment. Never enable on the real service:
   seed() truncates every data table in the connected database. */
const C = require('./core');

const DEMO_PASS_HASH = 's1$84da9b994627e465fcb37af27ef4959e$e2a09b8a0f823a9bdb2458cb3d15ca0f4060e02ce26e677317ad98d9d0a74697bdf103c3ef210a954e698f1fb8ba0fad5bcf80dac4f36c03e0a8de7211bbd034'; /* scrypt s1$ hash; plaintext lives only in the user's vault */

const MINUTES = Math.max(2, Math.min(120, +process.env.DEMO_MINUTES || 20));
const RESET_HOURS = Math.max(1, Math.min(72, +process.env.DEMO_RESET_HOURS || 6));
const minutes = () => MINUTES;

const TABLES = ['accruals', 'asset_dep', 'attendance', 'audit_log', 'bank_recs', 'branches', 'clients', 'cut_layers', 'cut_orders', 'cut_sizes', 'cuts', 'deliveries', 'delivery_lines', 'device_tokens', 'employees', 'expenses', 'fixed_assets', 'gl_accounts', 'gl_entries', 'gl_lines', 'inv_items', 'inv_moves', 'inv_wh', 'invoice_lines', 'invoices', 'models', 'outs', 'payments', 'payroll_accruals', 'payroll_inputs', 'prepaid_amort', 'prepaids', 'prod_logs', 'receipts', 'rolls', 'sales_invoice_lines', 'sales_invoices', 'seq', 'settings', 'stages', 'store_items', 'store_transfers', 'suppliers', 'users', 'vat_docs', 'vat_settlements'];

/* Dates relative to "today" in Cairo so the demo always looks fresh */
function dstr(daysAgo) { return new Date(Date.now() - daysAgo * 864e5).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); }
function isFri(ds) { return new Date(ds + 'T12:00:00Z').getUTCDay() === 5; }

async function seed() {
  const db = C.db();
  const WB = require('./wb');
  const admin = { id: 1, username: 'demo', role: 'admin', perms: ['*'] };
  /* lazily-created module schemas must exist before we wipe/fill them (fresh database) */
  try { await WB.wbApi('gl', { method: 'GET' }, admin, null, {}, {}, ['gl', 'accounts']); } catch (e) { console.error('demo ensure gl', e.message); }
  try { await WB.wbApi('inv', { method: 'GET' }, admin, null, {}, {}, ['inv', 'items']); } catch (e) { console.error('demo ensure inv', e.message); }
  try { await WB.wbApi('sinv', { method: 'GET' }, admin, null, {}, {}, ['sinv', 'meta']); } catch (e) { console.error('demo ensure sinv', e.message); }
  try { await db.query('ALTER TABLE inv_moves ADD COLUMN supplier_id INT NULL'); } catch (e) { /* exists */ }

  await db.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of TABLES) { try { await db.query('TRUNCATE TABLE `' + t + '`'); } catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; } }
  await db.query('SET FOREIGN_KEY_CHECKS=1');
  const ins = (t, cols, rows) => db.query('INSERT INTO `' + t + '`(' + cols.join(',') + ') VALUES ' + rows.map(() => '(' + cols.map(() => '?').join(',') + ')').join(','), rows.flat());

  /* settings + stages */
  await ins('settings', ['k', 'v'], [
    ['company_name', 'مصنع الهدى للملابس الجاهزة'],
    ['currency', 'ج.م'],
    ['invoice_footer', 'نسخة تجريبية للعرض فقط - جميع البيانات وهمية'],
    ['address', 'المنطقة الصناعية الثالثة - العاشر من رمضان'],
    ['phone', '01000000000']
  ]);
  /* chart of accounts (mirrors acct.js CHART + sinv.js EXTRA_ACC; re-inserted every reseed) */
  await ins('gl_accounts', ['code', 'name', 'type'], [
    ['1100', 'الصندوق (نقدية)', 'asset'], ['1110', 'البنك', 'asset'], ['1200', 'العملاء (مدينون)', 'asset'], ['1300', 'مخزون مستلزمات', 'asset'], ['1450', 'ضريبة القيمة المضافة - مدخلات', 'asset'], ['1500', 'الأصول الثابتة (ماكينات)', 'asset'], ['1590', 'مجمع الإهلاك', 'asset'],
    ['2100', 'الموردون (دائنون)', 'liability'], ['2200', 'مصروفات مستحقة', 'liability'], ['2300', 'رواتب مستحقة', 'liability'], ['2400', 'سلف وأمانات عملاء', 'liability'], ['2500', 'ضريبة القيمة المضافة - مخرجات', 'liability'],
    ['3100', 'رأس المال', 'equity'], ['3200', 'جاري المالك (مسحوبات)', 'equity'], ['3300', 'أرباح مرحّلة', 'equity'],
    ['4100', 'إيراد خدمة التصنيع', 'revenue'], ['4200', 'إيرادات أخرى', 'revenue'],
    ['5100', 'أجور مباشرة', 'expense'], ['5200', 'مصروفات تشغيل عامة', 'expense'], ['5300', 'إيجار', 'expense'], ['5400', 'كهرباء ومياه', 'expense'], ['5500', 'صيانة', 'expense'], ['5600', 'مصروف إهلاك', 'expense'], ['5900', 'مصروفات متنوعة', 'expense']
  ]);
  await ins('stages', ['name', 'seq'], [['خياطة', 1], ['كي', 2], ['فحص وتشطيب', 3], ['تعبئة', 4]]);

  /* demo users: full-access demo account + read-only visitor */
  await ins('users', ['username', 'name', 'pass_hash', 'role'], [
    ['demo', 'حساب العرض التجريبي', DEMO_PASS_HASH, 'admin'],
    ['view', 'زائر (عرض فقط)', DEMO_PASS_HASH, 'viewer']
  ]);

  /* clients, models, suppliers, employees */
  await ins('clients', ['code', 'name', 'phone', 'address', 'notes'], [
    ['C001', 'شركة الأناقة للملابس الجاهزة', '01001234567', 'مدينة نصر - القاهرة', 'عميل تصنيع شهري'],
    ['C002', 'محلات ستايل ستور', '01112345678', 'شارع عباس العقاد - مدينة نصر', null],
    ['C003', 'محمد عبد العزيز (تاجر جملة)', '01223456789', 'العتبة - القاهرة', 'يتعامل نقدي'],
    ['C004', 'شركة النيل للتصدير', '01034567890', 'برج العرب - الإسكندرية', 'تصدير خليجي'],
    ['C005', 'بوتيك ليالينا', '01145678901', 'التجمع الخامس', null],
    ['C006', 'ورشة السلام للتطريز', '01256789012', 'شبرا الخيمة', 'شريك خارجي']
  ]);
  await ins('models', ['code', 'name', 'client_id', 'description', 'price'], [
    ['M101', 'تيشيرت رجالي قطن', 1, 'قطن سنجل 30/1 - مقاسات M حتى 2XL', 45],
    ['M102', 'قميص كلاسيك رجالي', 1, 'قماش قطن مخلوط', 65],
    ['M103', 'بنطلون جينز', 2, 'جينز 12 أونصة', 95],
    ['M104', 'فستان سواريه', 5, 'ساتان مبطن', 220],
    ['M105', 'جاكيت شتوي مبطن', 4, 'قطن ليكرا 240 جرام', 180],
    ['M106', 'بيجاما أطفال', 3, 'قطن ممشط - سن 4-12', 38],
    ['M107', 'شورت رياضي', 2, 'ميلتون', 30],
    ['M108', 'عباية خليجي', 4, 'كريب أسود', 150]
  ]);
  await ins('suppliers', ['code', 'name', 'phone', 'notes'], [
    ['S01', 'الشركة المتحدة للغزل والنسيج', '0223456789', 'خيوط وأقمشة'],
    ['S02', 'مكتب النصر للأقمشة', '01005556677', null],
    ['S03', 'الذهبية لمستلزمات الإنتاج', '01158889900', 'كباسين وسحابات وتعبئة']
  ]);
  await ins('employees', ['code', 'name', 'job', 'salary'], [
    ['E01', 'محمود سعيد', 'عامل قص', 5200],
    ['E02', 'أحمد فتحي', 'خياط', 4800],
    ['E03', 'مصطفى كامل', 'خياط', 4800],
    ['E04', 'سعاد محمود', 'كيّاية', 4500],
    ['E05', 'منى رزق', 'فحص وتشطيب', 4500],
    ['E06', 'كريم عادل', 'مشرف إنتاج', 7500]
  ]);

  /* attendance: last 14 days (Fridays off), deterministic absences */
  const att = [];
  for (let ago = 1; ago <= 14; ago++) {
    const ds = dstr(ago);
    if (isFri(ds)) continue;
    for (let emp = 1; emp <= 6; emp++) att.push([emp, ds, (emp * 7 + ago) % 13 === 0 ? 'غياب' : 'حضور']);
  }
  await ins('attendance', ['emp_id', 'date', 'status'], att);
  const ym = dstr(0).slice(0, 7);
  await ins('payroll_inputs', ['emp_id', 'ym', 'ot_hours', 'fridays', 'advances', 'deduction'], [
    [1, ym, 6, 1, 0, 0], [2, ym, 10, 2, 0, 0], [3, ym, 4, 0, 500, 0],
    [4, ym, 2, 0, 0, 0], [5, ym, 0, 0, 300, 50], [6, ym, 8, 2, 0, 0]
  ]);

  /* fabric receipts and rolls (detailed track) */
  await ins('receipts', ['number', 'client_id', 'date', 'ref_no', 'notes'], [
    ['REC-1001', 1, dstr(21), 'بوليصة 771', 'استلام قطن سنجل'],
    ['REC-1002', 2, dstr(18), null, 'استلام جينز'],
    ['REC-1003', 4, dstr(15), 'إذن 204', null]
  ]);
  await ins('rolls', ['receipt_id', 'client_id', 'roll_no', 'fabric_type', 'color', 'length_m', 'weight_kg', 'used_m'], [
    [1, 1, 'A-101', 'قطن سنجل 30/1', 'أبيض', 480, 121.5, 320],
    [1, 1, 'A-102', 'قطن سنجل 30/1', 'أسود', 500, 126.0, 0],
    [2, 2, 'B-201', 'جينز 12 أونصة', 'كحلي', 380, 192.4, 150],
    [2, 2, 'B-202', 'جينز 12 أونصة', 'أسود', 350, 177.1, 0],
    [3, 4, 'C-301', 'قطن ليكرا 240 جرام', 'رمادي ميلانج', 420, 108.9, 0]
  ]);

  /* cuts with layers, sizes, production, deliveries, factory invoice, payments */
  await ins('cuts', ['number', 'client_id', 'model_id', 'date', 'marker_len', 'total_layers', 'pieces_cut', 'damaged_pcs', 'fabric_used_m', 'waste_m', 'notes'], [
    ['CUT-2201', 1, 1, dstr(14), 6.48, 120, 720, 6, 777.6, 14.2, 'تيشيرت أبيض'],
    ['CUT-2202', 2, 3, dstr(9), 7.20, 90, 405, 0, 648.0, 9.5, null],
    ['CUT-2203', 4, 5, dstr(5), 8.10, 60, 250, 2, 486.0, 6.8, 'دفعة تصدير']
  ]);
  await ins('cut_layers', ['cut_id', 'roll_id', 'layers', 'end_waste_m', 'used_m'], [
    [1, 1, 120, 2.1, 777.6], [2, 3, 90, 1.6, 648.0], [3, 5, 60, 1.2, 486.0]
  ]);
  await ins('cut_sizes', ['cut_id', 'size', 'ratio', 'pieces'], [
    [1, 'M', 2, 240], [1, 'L', 2, 240], [1, 'XL', 1, 120], [1, '2XL', 1, 120],
    [2, 'S', 1, 45], [2, 'M', 2, 90], [2, 'L', 3, 135], [2, 'XL', 2, 90], [2, '2XL', 1, 45],
    [3, 'M', 1, 50], [3, 'L', 2, 100], [3, 'XL', 1, 50], [3, '2XL', 1, 50]
  ]);
  await ins('prod_logs', ['cut_id', 'stage_id', 'date', 'qty_ok', 'qty_defect', 'line_name'], [
    [1, 1, dstr(13), 718, 4, 'خط 1'],
    [1, 2, dstr(12), 710, 2, 'خط 1'],
    [1, 3, dstr(11), 700, 6, 'خط 1'],
    [1, 4, dstr(10), 698, 0, 'خط 1'],
    [2, 1, dstr(8), 400, 5, 'خط 2'],
    [3, 1, dstr(4), 248, 2, 'خط 1'],
    [3, 2, dstr(3), 240, 1, 'خط 1']
  ]);
  await ins('deliveries', ['number', 'client_id', 'date', 'driver', 'notes'], [
    ['DL-3301', 1, dstr(7), 'محمد (نقل داخلي)', null],
    ['DL-3302', 1, dstr(4), 'محمد (نقل داخلي)', 'استكمال التسليم']
  ]);
  await ins('invoices', ['number', 'client_id', 'date', 'notes', 'total'], [
    ['INV-8801', 1, dstr(3), 'تصنيع تيشيرت CUT-2201', 33504]
  ]);
  await ins('delivery_lines', ['delivery_id', 'cut_id', 'qty', 'invoice_id'], [
    [1, 1, 400, 1],
    [2, 1, 298, 1]
  ]);
  await ins('invoice_lines', ['invoice_id', 'delivery_line_id', 'description', 'qty', 'price', 'amount'], [
    [1, 1, 'تصنيع تيشيرت رجالي M101', 400, 45, 18000],
    [1, 2, 'تصنيع تيشيرت رجالي M101', 298, 45, 13410],
    [1, null, 'طباعة شعار الصدر (خدمة إضافية)', 698, 3, 2094]
  ]);
  await ins('payments', ['client_id', 'date', 'amount', 'method', 'notes', 'doc_no'], [
    [1, dstr(2), 20000, 'نقدي', 'دفعة تحت الحساب', 'RC-501'],
    [2, dstr(6), 15000, 'تحويل بنكي', null, 'RC-502'],
    [4, dstr(1), 10000, 'نقدي', 'دفعة أولى تصدير', 'RC-503']
  ]);

  /* workbook track: cut orders, fabric store, outside printing/embroidery, expenses */
  await ins('cut_orders', ['code', 'client_id', 'fabric', 'model_name', 'color', 'weight_used', 'marker_len', 'marker_width', 'marker_weight', 'layers', 'sizes_in_marker', 'pcs_in_marker', 's_2xl', 's_xl', 's_l', 's_m', 's_s', 's_xs', 'total_pcs', 'unit_cost', 'cut_status', 'delivered', 'date', 'notes'], [
    ['CO-2401', 1, 'قطن سنجل', 'تيشيرت رجالي', 'أبيض', 118.6, 6.48, 180, 0.85, 118, 3, 6, 0, 2, 2, 2, 0, 0, 708, 45, 'تم القص', 708, dstr(16), null],
    ['CO-2402', 2, 'جينز 12 أونصة', 'بنطلون جينز', 'كحلي', 96.2, 7.10, 160, 1.90, 86, 4, 6, 1, 2, 2, 1, 0, 0, 516, 95, 'جاري القص', 0, dstr(10), 'أولوية هذا الأسبوع'],
    ['CO-2403', 3, 'قطن ممشط', 'بيجاما أطفال', 'ألوان', 74.5, 5.90, 150, 0.62, 120, 3, 6, 0, 0, 2, 2, 2, 0, 720, 38, 'تم القص', 300, dstr(12), null],
    ['CO-2404', 4, 'قطن ليكرا', 'جاكيت شتوي مبطن', 'رمادي', 88.0, 8.00, 170, 1.60, 58, 4, 5, 1, 1, 2, 1, 0, 0, 290, 180, 'تم القص', 0, dstr(6), 'تصدير'],
    ['CO-2405', 5, 'ساتان', 'فستان سواريه', 'عنابي', 41.3, 9.20, 160, 1.10, 40, 4, 4, 1, 1, 1, 1, 0, 0, 160, 220, 'جاري القص', 0, dstr(2), null]
  ]);
  await ins('store_items', ['date', 'client_id', 'item_code', 'fabric', 'qty', 'unit', 'weight', 'color', 'notes'], [
    [dstr(20), 1, 'ST-11', 'قطن سنجل 30/1', 4, 'توب', 486.4, 'أبيض', null],
    [dstr(18), 2, 'ST-12', 'جينز 12 أونصة', 3, 'توب', 577.3, 'كحلي', null],
    [dstr(15), 4, 'ST-13', 'قطن ليكرا 240 جرام', 2, 'توب', 217.8, 'رمادي ميلانج', null],
    [dstr(9), 3, 'ST-14', 'قطن ممشط', 3, 'توب', 298.2, 'ألوان', null],
    [dstr(2), 5, 'ST-15', 'ساتان', 2, 'توب', 120.5, 'عنابي', null]
  ]);
  await ins('store_transfers', ['store_id', 'date', 'cut_code', 'qty', 'weight', 'model_name'], [
    [1, dstr(16), 'CO-2401', 2, 243.2, 'تيشيرت رجالي'],
    [2, dstr(10), 'CO-2402', 1, 192.4, 'بنطلون جينز']
  ]);
  await ins('outs', ['date', 'cut_code', 'part', 'party', 'sent', 'received', 'notes'], [
    [dstr(15), 'CO-2401', 'طباعة شعار الصدر', 'مطابع الهلال', 708, 700, null],
    [dstr(11), 'CO-2403', 'تطريز صدر', 'ورشة السلام للتطريز', 720, 720, null],
    [dstr(1), 'CO-2404', 'طباعة ظهر', 'مطابع الهلال', 290, 0, 'في الانتظار']
  ]);
  await ins('expenses', ['date', 'cut_code', 'category', 'amount', 'notes'], [
    [dstr(13), null, 'كهرباء', 1840, 'فاتورة شهرية'],
    [dstr(12), null, 'صيانة ماكينات', 650, 'تغيير إبر وزيت'],
    [dstr(10), 'CO-2402', 'مستلزمات قص', 320, null],
    [dstr(8), null, 'إيجار', 6000, 'إيجار شهري'],
    [dstr(6), null, 'نقل ومواصلات', 430, null],
    [dstr(5), 'CO-2401', 'أحبار طباعة', 520, null],
    [dstr(3), null, 'مياه', 210, null],
    [dstr(1), null, 'مستلزمات نظافة', 150, null]
  ]);

  /* sales/purchase invoices, branches, warehouses, supplies inventory */
  await ins('branches', ['code', 'name', 'address', 'phone'], [
    ['BR01', 'المعرض الرئيسي', 'المنطقة الصناعية - العاشر من رمضان', '01000000000'],
    ['BR02', 'فرع التجمع', 'التجمع الخامس - القاهرة الجديدة', '01000000001']
  ]);
  await ins('inv_wh', ['name'], [['المخزن الرئيسي'], ['مخزن المعرض']]);
  await ins('inv_items', ['code', 'name', 'unit', 'min_qty', 'sell_price'], [
    ['IT01', 'خيط خياطة', 'بكرة', 50, 5],
    ['IT02', 'كباسين بلاستيك', 'جروس', 20, 120],
    ['IT03', 'سحابات 20 سم', 'قطعة', 100, 1.5],
    ['IT04', 'استيك 2 سم', 'لفة', 30, 60],
    ['IT05', 'كرتونة تعبئة كبيرة', 'كرتونة', 40, 40],
    ['IT06', 'شنطة بلاستيك مطبوعة', 'شنطة', 200, 1.25],
    ['IT07', 'قماش بطانة', 'متر', 60, 32],
    ['IT08', 'زراير معدن', 'جروس', 15, 150]
  ]);
  await ins('inv_moves', ['date', 'item_id', 'wh_id', 'kind', 'qty', 'unit_cost', 'ref', 'notes', 'supplier_id'], [
    [dstr(19), 1, 1, 'in', 500, 3.5, 'PUR-00001', null, 1],
    [dstr(19), 2, 1, 'in', 40, 85, 'PUR-00001', null, 1],
    [dstr(18), 3, 1, 'in', 800, 0.9, null, null, 3],
    [dstr(18), 4, 1, 'in', 60, 42, null, null, 3],
    [dstr(17), 5, 1, 'in', 120, 28, 'PUR-00002', null, 3],
    [dstr(17), 6, 1, 'in', 2000, 0.65, 'PUR-00002', null, 3],
    [dstr(16), 7, 1, 'in', 150, 22, null, null, 2],
    [dstr(16), 8, 1, 'in', 25, 110, null, null, 3],
    [dstr(14), 1, 1, 'out', 120, 0, 'CUT-2201', 'خيوط تشغيل', null],
    [dstr(13), 3, 1, 'out', 300, 0, 'CUT-2202', null, null],
    [dstr(9), 5, 1, 'out', 60, 0, 'CO-2401', 'تعبئة', null],
    [dstr(8), 1, 1, 'out', 90, 0, 'CUT-2202', null, null],
    [dstr(4), 6, 1, 'out', 400, 0, 'CO-2404', 'تعبئة تصدير', null]
  ]);
  await ins('sales_invoices', ['no', 'type', 'date', 'client_id', 'supplier_id', 'branch_id', 'settle', 'wh_id', 'status', 'base', 'discount', 'vat_rate', 'vat', 'total', 'notes'], [
    ['CSH-00001', 'cash', dstr(11), 1, null, 1, 'cash', 2, 'posted', 13900, 0, 14, 1946, 15846, 'بيع معرض'],
    ['CRD-00001', 'credit', dstr(8), 2, null, 1, 'credit', 2, 'posted', 9000, 0, 14, 1260, 10260, null],
    ['CSH-00002', 'cash', dstr(5), 5, null, 2, 'cash', 2, 'posted', 6400, 400, 14, 840, 6840, 'خصم خاص'],
    ['PUR-00001', 'purchase', dstr(19), null, 1, null, 'credit', 1, 'posted', 5150, 0, 14, 721, 5871, 'خيوط وكباسين'],
    ['PUR-00002', 'purchase', dstr(17), null, 3, null, 'cash', 1, 'posted', 4660, 0, 14, 652.4, 5312.4, 'تعبئة وتغليف'],
    ['QT-00001', 'quote', dstr(1), 3, null, 1, 'cash', null, 'open', 26000, 0, 0, 0, 26000, 'عرض سعر 500 تيشيرت']
  ]);
  await ins('sales_invoice_lines', ['invoice_id', 'item_id', 'description', 'qty', 'price', 'disc', 'total'], [
    [1, null, 'تيشيرت رجالي (مبيعات معرض)', 100, 75, 0, 7500],
    [1, null, 'بنطلون جينز', 40, 160, 0, 6400],
    [2, null, 'بيجاما أطفال', 150, 60, 0, 9000],
    [3, null, 'فستان سواريه', 20, 320, 0, 6400],
    [4, 1, 'خيط خياطة', 500, 3.5, 0, 1750],
    [4, 2, 'كباسين بلاستيك', 40, 85, 0, 3400],
    [5, 6, 'شنطة بلاستيك مطبوعة', 2000, 0.65, 0, 1300],
    [5, 5, 'كرتونة تعبئة كبيرة', 120, 28, 0, 3360],
    [6, null, 'تيشيرت قطن (عرض سعر)', 500, 52, 0, 26000]
  ]);

  /* post the manufacturing entries into the general ledger via the app's own autopost */
  try {
    await WB.wbApi('gl', { method: 'POST' }, admin, null, {}, {}, ['gl', 'autopost']);
  } catch (e) { console.error('demo autopost skipped:', e.message); }

  await db.query('INSERT INTO settings(k,v) VALUES("demo_seeded_at",?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [String(Date.now())]);
  await C.audit({ id: 1, username: 'demo' }, 'demo-seed', 'system', 0, 'demo data reseeded');
  return Date.now();
}

async function needsSeed() {
  const s = await C.getSettings();
  const last = +s.demo_seeded_at || 0;
  return Date.now() - last > RESET_HOURS * 3600e3;
}

async function start() {
  try { if (await needsSeed()) { await seed(); console.log('demo data seeded'); } }
  catch (e) { console.error('demo seed failed', e.message); }
  const t = setInterval(async () => {
    try { if (await needsSeed()) { await seed(); console.log('demo data re-seeded (periodic)'); } }
    catch (e) { console.error('demo reseed failed', e.message); }
  }, 30 * 60e3);
  if (t.unref) t.unref();
}

let lastManual = 0;
async function api(m, sub) {
  if (sub === 'info' && m === 'GET') return { demo: true, minutes: MINUTES, reset_hours: RESET_HOURS };
  if (sub === 'reset' && m === 'POST') {
    const now = Date.now();
    if (now - lastManual < 60000) return { ok: true, throttled: true };
    lastManual = now;
    await seed();
    return { ok: true, seeded_at: now };
  }
  throw new C.HttpError(404, 'مسار غير موجود');
}

module.exports = { start, api, minutes };
