import { getDb, runTransaction, getDefaultAutoBackupDir } from './connection'
import { readSetting, writeSetting, createBackupToFile } from './settings'
import { getPatientAttachmentsDir } from './audiology/attachments'
import { seedDefaults } from './schema/seeds'
import { writeBusinessSignatures, getBusinessState } from './business'
import { hashPassword, signSubscription } from './crypto'
import { HEARING_AIDS_PROFILE } from '../../shared/businessProfiles'
import type { BusinessType } from '../../shared/types'
import { existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'fs'
import { join, resolve, sep } from 'path'

let isDemoHiddenCache: boolean | null = null

export function isDemoDataHidden(): boolean {
  if (isDemoHiddenCache !== null) return isDemoHiddenCache
  try {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = 'hide_demo_data'")
      .get() as { value?: string } | undefined
    isDemoHiddenCache = row?.value === '1'
    return isDemoHiddenCache
  } catch {
    return false
  }
}

export function setDemoDataHiddenCache(val: boolean): void {
  isDemoHiddenCache = val
}

export function setDemoDataHidden(hidden: boolean): boolean {
  const db = getDb()
  setDemoDataHiddenCache(hidden)
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hide_demo_data', ?)").run(
    hidden ? '1' : '0'
  )
  return hidden
}

export interface DemoDataStatus {
  isDemoHidden: boolean
  hasDemoData: boolean
  counts: {
    customers: number
    tickets: number
    spare_parts: number
    products: number
    suppliers: number
    sales: number
    purchases: number
    hearing_tests: number
    earmold_orders: number
    followups: number
    implants: number
    technicians: number
    treasury: number
    total: number
  }
}

export function getDemoDataStatus(): DemoDataStatus {
  const db = getDb()
  const activeType = getBusinessState().type
  const sparePartsTable = activeType === 'hearing_aids' ? 'medicalmain_spare_parts' : 'elect_spare_parts'

  const tables = {
    customers: 'customers',
    tickets: 'maintenance_tickets',
    spare_parts: sparePartsTable,
    products: 'products',
    suppliers: 'suppliers',
    sales: 'sales_invoices',
    purchases: 'purchase_invoices',
    hearing_tests: 'hearing_tests',
    earmold_orders: 'earmold_orders',
    followups: 'followups',
    implants: 'implants',
    technicians: 'technicians',
    treasury: 'treasury_transactions'
  }

  const counts: Record<string, number> = {
    customers: 0,
    tickets: 0,
    spare_parts: 0,
    products: 0,
    suppliers: 0,
    sales: 0,
    purchases: 0,
    hearing_tests: 0,
    earmold_orders: 0,
    followups: 0,
    implants: 0,
    technicians: 0,
    treasury: 0,
    total: 0
  }

  let total = 0
  let totalOverallDemo = 0

  for (const [key, table] of Object.entries(tables)) {
    try {
      let sql = `SELECT COUNT(*) as cnt FROM ${table} WHERE is_demo = 1`
      if (['customers', 'tickets', 'technicians', 'treasury', 'products', 'suppliers', 'sales', 'purchases'].includes(key)) {
        sql += ` AND (business_type = '${activeType}' OR business_type IS NULL OR business_type = '')`
      } else if (['hearing_tests', 'earmold_orders', 'followups', 'implants'].includes(key)) {
        if (activeType !== 'hearing_aids') {
          counts[key] = 0
          continue
        }
      }

      const row = db.prepare(sql).get() as { cnt: number } | undefined
      const cnt = row?.cnt || 0
      counts[key] = cnt
      total += cnt
    } catch {
      counts[key] = 0
    }
  }

  // Count overall demo data in database to verify existence
  try {
    const custDemo = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE is_demo = 1').get() as { cnt: number })?.cnt || 0
    const partsDemo1 = (db.prepare('SELECT COUNT(*) as cnt FROM elect_spare_parts WHERE is_demo = 1').get() as { cnt: number })?.cnt || 0
    const partsDemo2 = (db.prepare('SELECT COUNT(*) as cnt FROM medicalmain_spare_parts WHERE is_demo = 1').get() as { cnt: number })?.cnt || 0
    totalOverallDemo = custDemo + partsDemo1 + partsDemo2 + total
  } catch {
    totalOverallDemo = total
  }

  counts.total = total

  return {
    isDemoHidden: isDemoDataHidden(),
    hasDemoData: totalOverallDemo > 0,
    counts: counts as DemoDataStatus['counts']
  }
}

/**
 * حذف كافة البيانات الافتراضية (التجريبية) نهائياً مع الإبقاء الكامل على بيانات المستخدم الحقيقية
 */
export function removeDemoData(): { success: boolean; deletedCount: number; message: string } {
  const db = getDb()
  let deletedCount = 0

  try {
    const demoAttachmentRows = db
      .prepare('SELECT stored_name FROM patient_attachments WHERE is_demo = 1')
      .all() as Array<{ stored_name?: string }>
    const attachDir = resolve(getPatientAttachmentsDir())
    const attachPrefix = attachDir.endsWith(sep) ? attachDir : `${attachDir}${sep}`
    for (const row of demoAttachmentRows) {
      const storedName = String(row?.stored_name || '').trim()
      if (!storedName || storedName.includes('\0')) continue
      const fullPath = resolve(attachDir, storedName)
      if (fullPath.startsWith(attachPrefix) && existsSync(fullPath)) {
        try {
          unlinkSync(fullPath)
        } catch {
          // Ignore single demo attachment file cleanup error
        }
      }
    }
  } catch {
    // patient_attachments may be a view in appliances profile without is_demo column
  }

  runTransaction(() => {
    db.exec('PRAGMA foreign_keys = OFF;')

    const deleteStmts = [
      'DELETE FROM audiogram_points WHERE is_demo = 1 OR test_id IN (SELECT id FROM hearing_tests WHERE is_demo = 1);',
      'DELETE FROM hearing_tests WHERE is_demo = 1;',
      'DELETE FROM earmold_orders WHERE is_demo = 1;',
      'DELETE FROM implant_sessions WHERE is_demo = 1 OR implant_id IN (SELECT id FROM implants WHERE is_demo = 1);',
      'DELETE FROM implants WHERE is_demo = 1;',
      'DELETE FROM followups WHERE is_demo = 1;',
      'DELETE FROM patient_attachments WHERE is_demo = 1;',
      'DELETE FROM sales_payments WHERE is_demo = 1 OR invoice_id IN (SELECT id FROM sales_invoices WHERE is_demo = 1);',
      'DELETE FROM sales_items WHERE is_demo = 1 OR invoice_id IN (SELECT id FROM sales_invoices WHERE is_demo = 1);',
      'DELETE FROM invoice_return_items WHERE is_demo = 1 OR return_id IN (SELECT id FROM invoice_returns WHERE is_demo = 1);',
      'DELETE FROM invoice_returns WHERE is_demo = 1;',
      'DELETE FROM product_exchanges WHERE is_demo = 1;',
      'DELETE FROM sales_invoices WHERE is_demo = 1;',
      'DELETE FROM purchase_items WHERE is_demo = 1 OR invoice_id IN (SELECT id FROM purchase_invoices WHERE is_demo = 1);',
      'DELETE FROM purchase_invoices WHERE is_demo = 1;',
      'DELETE FROM product_serials WHERE is_demo = 1;',
      'DELETE FROM product_variants WHERE is_demo = 1 OR product_id IN (SELECT id FROM products WHERE is_demo = 1);',
      'DELETE FROM products WHERE is_demo = 1;',
      'DELETE FROM supplier_payments WHERE is_demo = 1 OR supplier_id IN (SELECT id FROM suppliers WHERE is_demo = 1);',
      'DELETE FROM suppliers WHERE is_demo = 1;',
      'DELETE FROM ticket_parts WHERE is_demo = 1 OR ticket_id IN (SELECT id FROM maintenance_tickets WHERE is_demo = 1);',
      'DELETE FROM inventory_movements WHERE is_demo = 1;',
      'DELETE FROM maintenance_tickets WHERE is_demo = 1;',
      'DELETE FROM customer_appliances WHERE is_demo = 1;',
      'DELETE FROM elect_spare_parts WHERE is_demo = 1;',
      'DELETE FROM medicalmain_spare_parts WHERE is_demo = 1;',
      'DELETE FROM technicians WHERE is_demo = 1;',
      'DELETE FROM treasury_transactions WHERE is_demo = 1;',
      'DELETE FROM customers WHERE is_demo = 1;'
    ]

    for (const sql of deleteStmts) {
      try {
        const info = db.prepare(sql).run()
        deletedCount += Number(info.changes || 0)
      } catch {
        // Table or view might not exist in current profile
      }
    }

    setDemoDataHidden(false)
    db.exec('PRAGMA foreign_keys = ON;')
  })

  return {
    success: true,
    deletedCount,
    message: `تمت إزالة كافة البيانات الافتراضية بنجاح (${deletedCount} سجل تم تنظيفه).`
  }
}

/**
 * زرع بيانات افتراضية نموذجية غنية لكل من النشاطين (الأجهزة المنزلية والسماعات الطبية)
 */
export function seedDemoData(targetType?: BusinessType): {
  success: boolean
  message: string
  counts: Record<string, number>
} {
  const db = getDb()

  // First remove any existing demo data to avoid duplicate codes/serials
  removeDemoData()

  const seedAppliances = !targetType || targetType === 'appliances'
  const seedHearingAids = !targetType || targetType === 'hearing_aids'

  const counts: Record<string, number> = {
    appliances: 0,
    hearing_aids: 0
  }

  runTransaction(() => {
    db.exec('PRAGMA foreign_keys = OFF;')

    // Ensure physical spare parts tables exist before inserting
    db.exec(`
      CREATE TABLE IF NOT EXISTS elect_spare_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        brand TEXT DEFAULT 'عام',
        purchase_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_quantity INTEGER NOT NULL DEFAULT 3,
        location TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        image_base64 TEXT DEFAULT '',
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS medicalmain_spare_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        brand TEXT DEFAULT 'عام',
        purchase_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_quantity INTEGER NOT NULL DEFAULT 3,
        location TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        image_base64 TEXT DEFAULT '',
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `)

    // ==========================================
    // 1. نشاط صيانة الأجهزة الكهربائية والمنزلية
    // ==========================================
    if (seedAppliances) {
      // 1.1 فنيين
      const insertTech = db.prepare(`
        INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active, notes, is_demo, business_type)
        VALUES (?, ?, ?, ?, ?, 1, ?, 1, 'appliances')
      `)
      const techApp1 = insertTech.run(
        'م. خالد إبراهيم (افتراضي)',
        '01011112222',
        'صيانة تبريد وتكييف وغسالات',
        35,
        0,
        'فني صيانة معتمد للأجهزة المنزلية الكبيرة'
      ).lastInsertRowid as number

      const techApp2 = insertTech.run(
        'م. كريم علاء (افتراضي)',
        '01222223333',
        'صيانة شاشات وإلكترونيات',
        30,
        0,
        'متخصص في صيانة بوردات الشاشات والأجهزة الدقيقة'
      ).lastInsertRowid as number

      // 1.2 قطع غيار أجهزة كهربائية
      const insertElectPart = db.prepare(`
        INSERT INTO elect_spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location, notes, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `)
      const part1 = insertElectPart.run(
        'DEMO-MOT-01',
        'موتور غسالة أوتوماتيك 1/3 حصان',
        'مواتير ومحركات',
        'إل جي LG',
        1400,
        1850,
        6,
        2,
        'رف أ-1',
        'موتور أصلي كوري نحاس بالكامل'
      ).lastInsertRowid as number

      const part2 = insertElectPart.run(
        'DEMO-PMP-02',
        'طلمبة طرد مياه غسالة يونيفرسال',
        'طلمبات وصمامات',
        'إيطالي',
        210,
        320,
        12,
        3,
        'رف أ-3',
        'طلمبة صرف مياه متوافقة مع أغلب الموديلات'
      ).lastInsertRowid as number

      insertElectPart.run(
        'DEMO-TMR-03',
        'تايمر ديفروست ثلاجة توشيبا',
        'دوائر إذابة الثلج',
        'توشيبا',
        180,
        280,
        10,
        3,
        'رف ب-2',
        'تايمر ياباني 6 ساعات'
      )

      insertElectPart.run(
        'DEMO-PWR-04',
        'بوردة باور شاشة سامسونج 55 بوصة سمارت',
        'بوردات وكروت إلكترونية',
        'سامسونج',
        1100,
        1550,
        4,
        1,
        'خزينة بوردات',
        'بوردة باور وإضاءة أصلية'
      )

      insertElectPart.run(
        'DEMO-CAP-05',
        'مكثف تشغيل كابستور 45 ميكرو فاراد',
        'مكثفات ومقاومات',
        'عام',
        90,
        150,
        20,
        5,
        'درج إلكترونيات 4',
        'كابستور تكييف وغسالات إيطالي'
      )

      insertElectPart.run(
        'DEMO-HTR-06',
        'هيتر سخان غسالة ملابس 2000 وات',
        'سخانات وهيترات',
        'إيطالي',
        240,
        360,
        8,
        2,
        'رف ج-1',
        'هيتر استانلس حراري عالي الجودة'
      )

      // 1.3 عملاء وأجهزة كهربائية
      const insertCust = db.prepare(`
        INSERT INTO customers (name, phone, phone2, area, address, notes, extra_data, is_demo, business_type)
        VALUES (?, ?, ?, ?, ?, ?, '{}', 1, 'appliances')
      `)
      const custApp1 = insertCust.run(
        'م. أحمد مصطفى السعيد (عميل عرض)',
        '01098765432',
        '01198765432',
        'المعادي',
        '14 شارع النصر - أمام جراند مول - الدور الرابع',
        'عميل مميز - صيانة منزلية دورية'
      ).lastInsertRowid as number

      const custApp2 = insertCust.run(
        'أ. محمود عادل إبراهيم (عميل عرض)',
        '01155443322',
        '',
        'مدينة نصر',
        'عمارة 8 حي السفارات - خلف مستشفى المقاولون',
        'طلب تسليم بالورشة'
      ).lastInsertRowid as number

      const custApp3 = insertCust.run(
        'مدام / سارة حسن عبد الله (عميل عرض)',
        '01233445566',
        '',
        'التجمع الخامس',
        'كمبوند المصراوية - فيلا 12 شارع التسعين',
        'ميعاد مسائي بعد الساعة 6'
      ).lastInsertRowid as number

      const insertAppliance = db.prepare(`
        INSERT INTO customer_appliances (customer_id, appliance_type, brand, model, serial_number, notes, extra_data, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, '{}', 1)
      `)
      const appDevice1 = insertAppliance.run(
        custApp1,
        'غسالة ملابس',
        'إل جي LG',
        'Direct Drive 10.5 KG',
        'LG-DD-98214',
        'حالة الجهاز ممتازة - موتور انفرتر مباشر'
      ).lastInsertRowid as number

      const appDevice2 = insertAppliance.run(
        custApp2,
        'شاشة تلفزيون',
        'سامسونج Samsung',
        'Crystal UHD 55 4K',
        'SAM-UHD-77319',
        'شاشة سمارت بالريموت السحري وكابل الباور'
      ).lastInsertRowid as number

      const appDevice3 = insertAppliance.run(
        custApp3,
        'ثلاجة',
        'شارب Sharp',
        '18 قدم نو فروست انفرتر',
        'SH-NF-44102',
        'ثلاجة نوفروست ديجيتال بابين فضي'
      ).lastInsertRowid as number

      // 1.4 بلاغات وتذاكر صيانة
      const insertTicket = db.prepare(`
        INSERT INTO maintenance_tickets (
          ticket_number, customer_id, customer_name, customer_phone, customer_phone2,
          customer_area, customer_address, appliance_id, appliance_type, brand, model, serial_number,
          service_type, status, priority, complaint, diagnosis, technician_id, scheduled_date,
          inspection_fee, labor_cost, parts_total, parts_cost_total, discount, total_amount,
          paid_amount, remaining_amount, payment_method, warranty_months, warranty_start_date,
          warranty_end_date, notes, extra_data, completed_at, delivered_at, commission_rate, commission_amount,
          created_by_id, created_by_name, is_demo, business_type
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, '{}', ?, ?, ?, ?,
          1, 'السوبر أدمن', 1, 'appliances'
        )
      `)

      // تذكرة 1: تم التسليم
      const t1 = insertTicket.run(
        'DEMO-T-2026-0001',
        custApp1,
        'م. أحمد مصطفى السعيد (عميل عرض)',
        '01098765432',
        '01198765432',
        'المعادي',
        '14 شارع النصر - أمام جراند مول - الدور الرابع',
        appDevice1,
        'غسالة ملابس',
        'إل جي LG',
        'Direct Drive 10.5 KG',
        'LG-DD-98214',
        'home_visit',
        'delivered',
        'normal',
        'الغسالة لا تطرد المياه وتتوقف أثناء دورة الشطف وتصدر صوت صفارة خطأ OE',
        'تلف طلمبة طرد المياه الميكانيكية وانسداد مسار الفلتر الداخلي',
        techApp1,
        '2026-11-06',
        150,
        250,
        320,
        210,
        0,
        720,
        720,
        0,
        'cash',
        3,
        '2026-11-06',
        '2027-02-06',
        'تم استبدال طلمبة الطرد واختبار دورة عصر كاملة بنجاح تام وتسليم العميل الضمان المعتمد.',
        '2026-11-06 14:30:00',
        '2026-11-06 15:00:00',
        35,
        140
      ).lastInsertRowid as number

      // بند قطع غيار التذكرة 1
      db.prepare(`
        INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(t1, part2, 'طلمبة طرد مياه غسالة يونيفرسال', 'DEMO-PMP-02', 1, 210, 320, 320)

      // حركة مخزون للتذكرة 1
      db.prepare(`
        INSERT INTO inventory_movements (part_id, ticket_id, technician_id, movement_type, quantity, unit_cost, unit_price, notes, is_demo)
        VALUES (?, ?, ?, 'ticket_consumed', 1, 210, 320, 'صرف قطعة غيار لتذكرة الصيانة DEMO-T-2026-0001', 1)
      `).run(part2, t1, techApp1)

      // تذكرة 2: بالورشة وجاهزة للتسليم
      const t2 = insertTicket.run(
        'DEMO-T-2026-0002',
        custApp2,
        'أ. محمود عادل إبراهيم (عميل عرض)',
        '01155443322',
        '',
        'مدينة نصر',
        'عمارة 8 حي السفارات - خلف مستشفى المقاولون',
        appDevice2,
        'شاشة تلفزيون',
        'سامسونج Samsung',
        'Crystal UHD 55 4K',
        'SAM-UHD-77319',
        'workshop',
        'completed',
        'urgent',
        'فاصلة باور تماماً ولا تضيء لمبة الاستعداد الحمراء بعد انقطاع مفاجئ للتيار',
        'احتراق الفيوز ومكثفات دائرة التنعيم بالباور سبلاي',
        techApp2,
        '2026-11-07',
        150,
        400,
        0,
        0,
        0,
        550,
        200,
        350,
        'vodafone_cash',
        6,
        '2026-11-07',
        '2027-05-07',
        'تم إصلاح دائرة الباور وتغيير المكثفات التالفة والشاشة تعمل بحالة ممتازة في انتظار استلام العميل.',
        '2026-11-07 18:00:00',
        null,
        30,
        165
      ).lastInsertRowid as number

      // تذكرة 3: قيد الفحص
      insertTicket.run(
        'DEMO-T-2026-0003',
        custApp3,
        'مدام / سارة حسن عبد الله (عميل عرض)',
        '01233445566',
        '',
        'التجمع الخامس',
        'كمبوند المصراوية - فيلا 12 شارع التسعين',
        appDevice3,
        'ثلاجة',
        'شارب Sharp',
        '18 قدم نو فروست انفرتر',
        'SH-NF-44102',
        'home_visit',
        'in_progress',
        'normal',
        'تراكم ثلج في الفريزر وضعف شديد في تبريد الكابينة السفلية وتلف المأكولات',
        'الفحص المبدئي: عطل بدائرة إذابة الثلج (تايمر أو حساس ديفروست)',
        techApp1,
        '2026-11-08',
        150,
        0,
        0,
        0,
        0,
        150,
        150,
        0,
        'cash',
        3,
        null,
        null,
        'مجدول زيارة منزلية للفني للفحص النهائي وتبديل القطعة التالفة.',
        null,
        null,
        null,
        null
      )

      // 1.5 حركات خزينة للأجهزة الكهربائية
      const insertTreasury = db.prepare(`
        INSERT INTO treasury_transactions (
          transaction_type, category, amount, ticket_id, technician_id, payment_method,
          description, created_by_id, created_by_name, is_demo, business_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'السوبر أدمن', 1, 'appliances')
      `)

      insertTreasury.run('income', 'صيانة أجهزة منزلية', 720, t1, null, 'cash', 'تحصيل قيمة صيانة تذكرة غسالة DEMO-T-2026-0001 (كشف + مصنعية + قطعة غيار)')
      insertTreasury.run('income', 'عربون صيانة شاشة', 200, t2, null, 'vodafone_cash', 'عربون استلام صيانة شاشة سامسونج بالورشة DEMO-T-2026-0002')
      insertTreasury.run('expense', 'مستلزمات ورشة وضيافة', 180, null, null, 'cash', 'شراء أدوات لحام وقواطع وسوائل تنظيف إلكترونيات للورشة')
      insertTreasury.run('tech_commission', 'عمولات فنيين', 140, t1, techApp1, 'cash', 'صرف عمولة م. خالد إبراهيم عن تذكرة الغسالة DEMO-T-2026-0001')

      counts.appliances = 18
    }

    // ==========================================
    // 2. نشاط مراكز وتوكيلات السماعات الطبية
    // ==========================================
    if (seedHearingAids) {
      // 2.1 أخصائي سمعيات وفني معمل
      const insertTech = db.prepare(`
        INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active, notes, is_demo, business_type)
        VALUES (?, ?, ?, ?, ?, 1, ?, 1, 'hearing_aids')
      `)
      const doc1 = insertTech.run(
        'د. عمر فاروق (أخصائي عرض)',
        '01066554433',
        'استشاري السمعيات والاتزان والتأهيل السمعي',
        30,
        0,
        'دكتوراه السمع والتخاطب - فحص وبرمجة سماعات القوقعة'
      ).lastInsertRowid as number

      const techMed = insertTech.run(
        'م. طارق ناصر (فني عرض)',
        '01188776655',
        'فني صيانة سماعات وتصنيع قوالب الأذن',
        25,
        0,
        'خبير تصنيع القوالب اللينة والصلبة وصيانة دوائر السماعات'
      ).lastInsertRowid as number

      // 2.2 موردين وشركات طبية
      const insertSup = db.prepare(`
        INSERT INTO suppliers (name, company_name, phone, phone2, address, supplier_type, balance, notes, is_active, is_demo, business_type)
        VALUES (?, ?, ?, ?, ?, 'company', 0, ?, 1, 1, 'hearing_aids')
      `)
      const sup1 = insertSup.run(
        'شركة النيل الدولية للسماعات الطبية',
        'النيل ميديكال (وكيل فوناك Phonak)',
        '0225112233',
        '01002233445',
        'القاهرة - المهندسين - شارع جامعة الدول العربية',
        'وكيل حصري للسماعات الطبية والبطاريات السويسرية'
      ).lastInsertRowid as number

      const sup2 = insertSup.run(
        'الشرق الأوسط لحلول السمع والقوقعة',
        'ميدل إيست ميديكال (وكيل Oticon & Cochlear)',
        '01001234500',
        '',
        'الإسكندرية - سموحة - برج الأطباء',
        'تجهيز مراكز السمعيات وقطع غيار القوقعة الإلكترونية'
      ).lastInsertRowid as number

      // 2.3 منتجات طبية (سماعات، بطاريات، فلاتر، معالجات قوقعة)
      const insertProd = db.prepare(`
        INSERT INTO products (
          code, barcode, name, type, sub_category, brand, model, compatible_with,
          track_serial, has_variants, unit_name, pack_name, pack_size, cost_price, sale_price,
          pack_cost_price, pack_sale_price, qty, min_stock, warranty_months, notes, extra_data, is_active, is_demo, business_type
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, '{}', 1, 1, 'hearing_aids'
        )
      `)

      const prodAid1 = insertProd.run(
        'DEMO-PH-M70',
        '6221000101',
        'سماعة طبية فوناك رقمية Phonak Bolero Marvel M70',
        'hearing_aid',
        'سماعات خلف الأذن (BTE)',
        'Phonak',
        'Bolero M70',
        'Android & iPhone بلوتوث مباشر',
        1,
        0,
        'سماعة',
        'سماعة',
        1,
        14000,
        19500,
        14000,
        19500,
        4,
        1,
        24,
        'سماعة طبية رقمية 16 قناة - صوت نقي فائق الجودة متوافقة مع بلوتوث الهواتف'
      ).lastInsertRowid as number

      const prodAid2 = insertProd.run(
        'DEMO-OT-MR1',
        '6221000102',
        'سماعة طبية أوكون داخل الأذن Oticon More 1 ITE',
        'hearing_aid',
        'سماعات داخل الأذن مخصصة (ITE)',
        'Oticon',
        'More 1 Custom',
        'مفصلة على مقاس مجرى الأذن',
        1,
        0,
        'سماعة',
        'سماعة',
        1,
        16500,
        23000,
        16500,
        23000,
        2,
        1,
        24,
        'سماعة مخفية فائقة الصغر بتقنية الشبكة العصبية العميقة Deep Neural Network'
      ).lastInsertRowid as number

      const prodBat13 = insertProd.run(
        'DEMO-BAT-13',
        '6221000103',
        'بطاريات سماعات طبية Rayovac Extra مقاس 13 برتقالي',
        'battery',
        'بطاريات هواء وزنك',
        'Rayovac',
        'Size 13 Orange',
        'جميع السماعات الطبية مقاس 13',
        0,
        0,
        'حبة',
        'شريط (6 حبات)',
        6,
        16,
        25,
        95,
        150,
        60,
        10,
        0,
        'بطاريات بريطانية أصلية تدوم حتى 12-14 يوم للسماعة'
      ).lastInsertRowid as number

      insertProd.run(
        'DEMO-BAT-312',
        '6221000104',
        'بطاريات سماعات طبية Rayovac مقاس 312 بني',
        'battery',
        'بطاريات هواء وزنك',
        'Rayovac',
        'Size 312 Brown',
        'السماعات الدقيقة مقاس 312',
        0,
        0,
        'حبة',
        'شريط (6 حبات)',
        6,
        16,
        25,
        95,
        150,
        48,
        10,
        0,
        'شريط بطاريات 6 حبات للسماعات الصغيرة'
      )

      insertProd.run(
        'DEMO-FLT-01',
        '6221000105',
        'علبة فلاتر حماية من الشمع CeruShield لعلب فوناك',
        'accessory',
        'فلاتر ومستهلكات تنظيف',
        'Phonak',
        'CeruShield Disk (8 Filters)',
        'سماعات Marvel & Paradise',
        0,
        0,
        'قرص (8 فلاتر)',
        'علبة',
        1,
        120,
        200,
        120,
        200,
        25,
        5,
        0,
        'قرص دوار يحتوي على 8 فلاتر شمع لمنع انسداد السماعة'
      )

      const prodCoch = insertProd.run(
        'DEMO-COCH-N7',
        '6221000106',
        'معالج صوتي خارجي لقوقعة كوكليار Cochlear Nucleus 7',
        'cochlear_processor',
        'معالجات زراعة القوقعة',
        'Cochlear',
        'Nucleus CP1000',
        'غرسات Cochlear Profile Series',
        1,
        0,
        'معالج',
        'حقيبة متكاملة',
        1,
        45000,
        58000,
        45000,
        58000,
        1,
        1,
        36,
        'معالج ذكي مقاوم للماء متصل بتطبيق الهاتف الذكي مع كابل ووشيعة'
      ).lastInsertRowid as number

      // 2.4 أرقام تسلسلية للسماعات
      const insertSerial = db.prepare(`
        INSERT INTO product_serials (product_id, serial_no, status, condition, notes, unit_cost, is_demo)
        VALUES (?, ?, ?, 'new', ?, ?, 1)
      `)
      insertSerial.run(prodAid1, 'PH-M70-DEMO-99412', 'sold', 'تم البيع بموجب فاتورة العرض INV-2026-0001', 14000)
      insertSerial.run(prodAid1, 'PH-M70-DEMO-99413', 'in_stock', 'متوفرة بالمخزن الطبي - جاهزة للبرمجة', 14000)
      insertSerial.run(prodAid2, 'OT-MR1-DEMO-55821', 'in_stock', 'متوفرة بالمخزن - تحتاج أخذ مقاس الأذن', 16500)
      insertSerial.run(prodCoch, 'COCH-N7-DEMO-33104', 'sold', 'مسلمة للطفل يوسف كمال لزراعة القوقعة', 45000)

      // 2.5 قطع غيار وملحقات طبية
      const insertMedPart = db.prepare(`
        INSERT INTO medicalmain_spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location, notes, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `)
      insertMedPart.run('MED-HK-01', 'هوك سماعة فوناك قياسي مع فلتر ترشيح', 'ملحقات صوتية', 'Phonak', 50, 90, 20, 5, 'درج ملحقات 1', 'هوك بلاستيكي شفاف عالي التحمل')
      insertMedPart.run('MED-TB-02', 'خرطوم سيليكون طبي لقوالب الأذن مقاس 13', 'خراطيم وقوالب', 'عام', 15, 40, 50, 10, 'بكرة خراطيم', 'خرطوم مرن مقاوم للتصلب والاصفرار')
      insertMedPart.run('MED-CB-03', 'كابل توصيل وشيعة كوكليار Nucleus 7', 'كابلات قوقعة', 'Cochlear', 800, 1200, 4, 1, 'خزينة القوقعة', 'كابل طول 6 سم بلون رمادي فاتح')

      // 2.6 مرضى وعملاء المركز الطبي
      const insertPatient = db.prepare(`
        INSERT INTO customers (
          name, phone, phone2, area, address, notes, birth_date, gender, occupation,
          referring_doctor, medical_complaint, medical_history, allergies, doctor_notes, extra_data, is_demo, business_type
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, '{}', 1, 'hearing_aids'
        )
      `)

      const pat1 = insertPatient.run(
        'الحاج / فتحي عبد الرحمن السيد (مريض عرض)',
        '01012349988',
        '01212349988',
        'مصر الجديدة',
        '28 شارع الأهرام - روكسي',
        'مريض متابع منذ سنتين - مركب سماعة فوناك بالأذن اليمنى',
        '1958-04-12',
        'ذكر',
        'مهندس بالمعاش',
        'أ.د / سمير خليل (استشاري أنف وأذن)',
        'ضعف سمع تدريجي حسي عصبي ثنائي وصعوبة بالغة في تمييز الكلمات أثناء الجلوس في الأماكن المزدحمة',
        'ضغط دم مرتفع منتظم على العلاج - لا توجد جراحات سابقة بالأذن',
        'لا توجد حساسية دوائية معروفة',
        'يوصى بسماعة رقمية خلف الأذن BTE ثنائية مع قالب سيليكون ناعم بفتحة تهوية متوسطة'
      ).lastInsertRowid as number

      const pat2 = insertPatient.run(
        'الطفل / يوسف كمال محمود (مريض عرض)',
        '01144556677',
        '01044556677',
        'الدقي',
        '5 شارع مصدق - الجيزة',
        'ولي الأمر: م. كمال محمود - زراعة قوقعة أذن يمنى مستشفى وادي النيل',
        '2019-09-15',
        'ذكر',
        'طالب بالمرحلة الابتدائية',
        'أ.د / أحمد عبد الباسط (جراح زراعة القوقعة)',
        'صمم حسي عصبي شديد إلى عميق خلقي بالأذنين - تم إجراء زراعة قوقعة ناجحة بالأذن اليمنى',
        'تمت العملية الجراحية بنجاح وجرح الغرسة ملتئم تماماً',
        'لا يوجد',
        'جلسات تأهيل سمعي وتخاطب أسبوعية مع مراجعة خريطة البرمجة كل 3 شهور'
      ).lastInsertRowid as number

      const pat3 = insertPatient.run(
        'أ. منى فاروق الشريف (مريضة عرض)',
        '01228899001',
        '',
        'المهندسين',
        '12 شارع شهاب - الدور الثاني',
        'حضور دوري لصيانة السماعة وتنظيف القالب',
        '1984-01-20',
        'أنثى',
        'معلمة لغة إنجليزية',
        'د. حسام عزمي',
        'طنين مستمر بالأذن اليسرى مع هبوط سمعي بسيط إلى متوسط',
        'لا يوجد أمراض مزمنة',
        'لا يوجد',
        'سماعة Oticon مخفية داخل الأذن مع مولد صوت طنين Tinnitus SoundSupport'
      ).lastInsertRowid as number

      // 2.7 فحص سمع ومخطط السمع Audiogram
      const insertTest = db.prepare(`
        INSERT INTO hearing_tests (
          test_number, patient_id, test_date, examiner_id, examiner_name, test_type,
          srt_right, srt_left, sds_right, sds_left, mcl_right, mcl_left, ucl_right, ucl_left,
          tymp_right, tymp_left, pta_right, pta_left, loss_type_right, loss_type_left,
          loss_degree_right, loss_degree_left, recommended_product_id, recommended_product_name,
          recommendation_notes, notes, is_demo
        ) VALUES (
          ?, ?, '2026-11-04', ?, 'د. عمر فاروق', 'pure_tone',
          45, 50, 88, 84, 70, 75, 95, 100,
          'A (Normal)', 'A (Normal)', 48, 53, 'sensorineural', 'sensorineural',
          'moderate', 'moderate_severe', ?, 'سماعة فوناك Phonak Bolero M70',
          'استجابة ممتازة لتكبير الترددات الحادة وتمييز الكلام تحسن إلى 96% مع السماعة',
          'تم عمل الفحص في الغرفة المعزولة صوتياً بمعايرة دقيقة.', 1
        )
      `)
      const testId = insertTest.run(
        'DEMO-HT-2026-0001',
        pat1,
        doc1,
        prodAid1
      ).lastInsertRowid as number

      // نقاط مخطط السمع للأذنين
      const insertPoint = db.prepare(`
        INSERT INTO audiogram_points (test_id, ear, conduction, frequency, db_value, is_masked, no_response, is_demo)
        VALUES (?, ?, ?, ?, ?, 0, 0, 1)
      `)
      const testFrequencies = [250, 500, 1000, 2000, 4000, 8000]
      const rightValues = [35, 40, 45, 55, 65, 70]
      const leftValues = [40, 45, 50, 60, 70, 75]
      testFrequencies.forEach((freq, idx) => {
        insertPoint.run(testId, 'right', 'air', freq, rightValues[idx])
        insertPoint.run(testId, 'left', 'air', freq, leftValues[idx])
      })

      // 2.8 طلبيات قوالب الأذن Earmold Order
      db.prepare(`
        INSERT INTO earmold_orders (
          order_number, patient_id, ear, mold_type, material, color, vent_size,
          tube_type, impression_date, lab_name, sent_date, expected_date, received_date,
          delivered_date, status, lab_cost, customer_price, is_lab_cost_paid, notes, is_demo
        ) VALUES (
          'DEMO-EM-2026-0001', ?, 'right', 'قالب كامل Full Shell', 'سيليكون طبي ناعم Soft Silicone',
          'شفاف', 'تهوية 1.5 مم (Medium Vent)', 'عادي Standard #13', '2026-11-04', 'معمل النيل التخصصي للقوالب',
          '2026-11-04', '2026-11-06', '2026-11-06', '2026-11-06', 'delivered', 250, 450, 1,
          'قالب متقن ومريح جداً للمريض بدون أي تسريب صوتي أو فيدباك.', 1
        )
      `).run(pat1)

      // 2.9 فواتير مبيعات طبية
      const insertSale = db.prepare(`
        INSERT INTO sales_invoices (
          invoice_number, invoice_type, customer_id, customer_name, customer_phone,
          subtotal, discount, trade_in_credit, total_amount, paid_amount, remaining_amount,
          returned_amount, payment_method, status, notes, extra_data, created_by_id, created_by_name, is_demo, business_type
        ) VALUES (
          'DEMO-INV-2026-0001', 'regular', ?, 'الحاج / فتحي عبد الرحمن السيد (مريض عرض)', '01012349988',
          19800, 0, 0, 19800, 19800, 0,
          0, 'cash', 'completed', 'تسليم سماعة فوناك للأذن اليمنى مع قالب سيليكون وشريطين بطاريات وهدية فلاتر شمع',
          '{}', 1, 'السوبر أدمن', 1, 'hearing_aids'
        )
      `)
      const saleId = insertSale.run(pat1).lastInsertRowid as number

      db.prepare(`
        INSERT INTO sales_items (
          invoice_id, product_id, product_name, item_type, unit, pack_size, quantity,
          deducted_pieces_qty, serial_no, unit_cost, unit_price, discount, total_price,
          warranty_months, warranty_start, warranty_end, is_demo
        ) VALUES (
          ?, ?, 'سماعة طبية فوناك رقمية Phonak Bolero Marvel M70', 'hearing_aid', 'piece', 1, 1,
          1, 'PH-M70-DEMO-99412', 14000, 19500, 0, 19500,
          24, '2026-11-06', '2028-11-06', 1
        )
      `).run(saleId, prodAid1)

      db.prepare(`
        INSERT INTO sales_items (
          invoice_id, product_id, product_name, item_type, unit, pack_size, quantity,
          deducted_pieces_qty, serial_no, unit_cost, unit_price, discount, total_price,
          warranty_months, is_demo
        ) VALUES (
          ?, ?, 'بطاريات سماعات طبية Rayovac Extra مقاس 13 (عبوة 6 حبات)', 'battery', 'pack', 6, 2,
          12, '', 95, 150, 0, 300, 0, 1
        )
      `).run(saleId, prodBat13)

      db.prepare(`
        INSERT INTO sales_payments (invoice_id, customer_id, amount, payment_method, payment_type, notes, is_demo)
        VALUES (?, ?, 19800, 'cash', 'initial', 'سداد نقدي بالكامل عند استلام الفاتورة والسماعة', 1)
      `).run(saleId, pat1)

      // 2.10 متابعة ضبط وبرمجة
      db.prepare(`
        INSERT INTO followups (
          patient_id, serial_no, type, status, due_date, done_date,
          technician_id, fitting_settings_json, notes, is_demo
        ) VALUES (
          ?, 'PH-M70-DEMO-99412', 'fitting', 'pending', '2026-11-20', null,
          ?, '{"gain_db":50,"feedback_cancelled":true,"bluetooth_paired":true}',
          'جلسة المتابعة الأولى بعد أسبوعين لمراجعة راحة القالب وضبط كسب الصوت تدريجياً.', 1
        )
      `).run(pat1, doc1)

      // 2.11 زراعة القوقعة وجلسات البرمجة
      const insertImplant = db.prepare(`
        INSERT INTO implants (
          patient_id, ear, brand, internal_model, internal_serial, surgery_date,
          hospital, surgeon, activation_date, processor_model, processor_serial_no,
          processor_warranty_end, notes, is_demo
        ) VALUES (
          ?, 'right', 'Cochlear', 'Profile Plus CI512', 'CI-512-DEMO-88190', '2024-05-10',
          'مستشفى وادي النيل التخصصي', 'أ.د / أحمد عبد الباسط', '2024-06-15',
          'Cochlear Nucleus 7 CP1000', 'COCH-N7-DEMO-33104', '2027-06-15',
          'الغرسة تعمل بكفاءة 100% مع كافة الأقطاب الـ 22 نشطة.', 1
        )
      `)
      const implantId = insertImplant.run(pat2).lastInsertRowid as number

      db.prepare(`
        INSERT INTO implant_sessions (
          implant_id, patient_id, session_date, session_type, technician_id,
          examiner_name, program_notes, thresholds_json, next_due_date, is_demo
        ) VALUES (
          ?, ?, '2026-10-15', 'mapping', ?, 'د. عمر فاروق',
          'تم تحديث خريطة البرمجة (MAP 4) وتعديل مستويات C-levels لرفع مستوى إدراك الأصوات الخافتة، واستجابة الطفل ممتازة وتفاعل مبهر.',
          '{"t_level":110,"c_level":180,"rate":900}', '2027-01-15', 1
        )
      `).run(implantId, pat2, doc1)

      // 2.12 بلاغ صيانة سماعة طبية
      const insertMedTicket = db.prepare(`
        INSERT INTO maintenance_tickets (
          ticket_number, customer_id, customer_name, customer_phone, customer_phone2,
          customer_area, customer_address, appliance_type, brand, model, serial_number,
          service_type, status, priority, complaint, diagnosis, technician_id, scheduled_date,
          inspection_fee, labor_cost, parts_total, parts_cost_total, discount, total_amount,
          paid_amount, remaining_amount, payment_method, warranty_months, warranty_start_date,
          warranty_end_date, notes, extra_data, completed_at, delivered_at, commission_rate, commission_amount,
          created_by_id, created_by_name, is_demo, business_type
        ) VALUES (
          'DEMO-MT-2026-0001', ?, 'أ. منى فاروق الشريف (مريضة عرض)', '01228899001', '',
          'المهندسين', '12 شارع شهاب - الدور الثاني', 'سماعة طبية داخل الأذن', 'Oticon', 'More 1 ITE', 'OT-DEMO-77112',
          'workshop', 'completed', 'normal', 'انقطاع الصوت وضعف مفاجئ في إخراج السماعة مع وجود صوت صفير متقطع',
          'انسداد فلتر الشمع الداخلي وتراكم ترسبات رطوبة على ميكروفون السماعة',
          ?, '2026-11-05', 100, 250, 0, 0, 0, 350, 350, 0, 'cash', 3,
          '2026-11-05', '2027-02-05', 'تم التنظيف بجهاز الموجات فوق الصوتية والمجفف وتغيير الفلتر وفحص الميكروفون بنجاح.',
          '{}', '2026-11-05 16:00:00', '2026-11-05 17:30:00', 25, 87.5,
          1, 'السوبر أدمن', 1, 'hearing_aids'
        )
      `)
      const medTicketId = insertMedTicket.run(pat3, techMed).lastInsertRowid as number

      // 2.13 حركات خزينة للسماعات الطبية
      const insertMedTreasury = db.prepare(`
        INSERT INTO treasury_transactions (
          transaction_type, category, amount, sales_invoice_id, ticket_id, technician_id,
          payment_method, description, created_by_id, created_by_name, is_demo, business_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'السوبر أدمن', 1, 'hearing_aids')
      `)

      insertMedTreasury.run('income', 'مبيعات سماعات طبية', 19800, saleId, null, null, 'cash', 'تحصيل مبيعات فاتورة DEMO-INV-2026-0001 سماعة فوناك للحاج فتحي عبد الرحمن')
      insertMedTreasury.run('income', 'كشوفات وفحوصات سمع', 300, null, null, null, 'cash', 'تحصيل رسوم فحص سمع ومخطط بياني DEMO-HT-2026-0001')
      insertMedTreasury.run('income', 'صيانة سماعات طبية', 350, null, medTicketId, null, 'cash', 'تحصيل صيانة وتنظيف وتجفيف سماعة أ. منى الشريف DEMO-MT-2026-0001')
      insertMedTreasury.run('expense', 'سداد تكاليف معامل قوالب', 250, null, null, null, 'cash', 'سداد تكلفة تصنيع قالب سيليكون ناعم لمعمل النيل DEMO-EM-2026-0001')
      insertMedTreasury.run('tech_commission', 'عمولات أخصائيين', 1200, null, null, doc1, 'cash', 'صرف عمولة د. عمر فاروق عن فحص وبرمجة سماعة فوناك')

      counts.hearing_aids = 22
    }

    db.exec('PRAGMA foreign_keys = ON;')
  })

  // Ensure demo data is visible after seeding
  setDemoDataHidden(false)

  return {
    success: true,
    message: 'تم إضافة البيانات الافتراضية النموذجية بنجاح للعرض والتجربة.',
    counts
  }
}

/**
 * إعادة ضبط البرنامج بالكامل (حذف قاعدة البيانات واستعادة ضبط المصنع)
 */
export function resetDatabase(): { success: boolean; message: string; backupPath?: string } {
  const db = getDb()
  const currentType: BusinessType = getBusinessState().type || 'appliances'

  // 1. أخذ نسخة احتياطية آمنة مسبقة فوراً قبل الحذف
  const backupDir = getDefaultAutoBackupDir()
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true })
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = join(backupDir, `pre-reset-${timestamp}.sqlite`)
  try {
    createBackupToFile(backupPath)
  } catch (err) {
    console.warn('Pre-reset backup failed:', err)
  }

  // تنظيف ملفات مرفقات المرضى اليتيمة على القرص بعد أخذ النسخة الاحتياطية
  try {
    const attachDir = getPatientAttachmentsDir()
    if (existsSync(attachDir)) {
      for (const entry of readdirSync(attachDir)) {
        try {
          rmSync(join(attachDir, entry), { recursive: true, force: true })
        } catch {
          // Ignore single file cleanup error
        }
      }
    }
  } catch (err) {
    console.warn('Failed to clean patient_attachments directory during reset:', err)
  }

  // 2. تفريغ الجداول التشغيلية بالكامل في معاملة واحدة آمنة
  runTransaction(() => {
    db.exec('PRAGMA foreign_keys = OFF;')

    const tablesToWipe = [
      'audiogram_points',
      'hearing_tests',
      'earmold_orders',
      'implant_sessions',
      'implants',
      'followups',
      'patient_attachments',
      'sales_payments',
      'sales_items',
      'invoice_return_items',
      'invoice_returns',
      'product_exchanges',
      'sales_invoices',
      'purchase_items',
      'purchase_invoices',
      'product_serials',
      'product_variants',
      'products',
      'supplier_payments',
      'suppliers',
      'ticket_parts',
      'inventory_movements',
      'maintenance_tickets',
      'customer_appliances',
      'elect_spare_parts',
      'medicalmain_spare_parts',
      'technicians',
      'treasury_transactions',
      'customers',
      'business_audit_log',
      'user_sessions',
      'custom_field_defs',
      'lookup_items'
    ]

    for (const tbl of tablesToWipe) {
      try {
        db.exec(`DELETE FROM ${tbl};`)
      } catch {
        // Table or view might not exist
      }
    }

    // حذف كافة المستخدمين الإضافيين وإعادة حساب admin الافتراضي لكلمة المرور 8520
    try {
      db.exec("DELETE FROM users WHERE username != 'admin';")
      const hashed = hashPassword('8520')
      const sig = signSubscription('admin', 'super_admin', null)
      const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get()
      if (existingAdmin) {
        db.prepare(
          `UPDATE users SET
            password_hash = ?,
            full_name = 'السوبر أدمن (مالك النظام)',
            phone = '01000000000',
            role = 'super_admin',
            is_active = 1,
            subscription_sig = ?,
            subscription_start = NULL,
            subscription_end = NULL,
            notes = 'الحساب الرئيسي لمالك البرنامج بالكامل'
          WHERE username = 'admin'`
        ).run(hashed, sig)
      } else {
        db.prepare(
          `INSERT INTO users (username, password_hash, full_name, phone, role, is_active, subscription_sig, notes)
           VALUES ('admin', ?, 'السوبر أدمن (مالك النظام)', '01000000000', 'super_admin', 1, ?, 'الحساب الرئيسي لمالك البرنامج بالكامل')`
        ).run(hashed, sig)
      }
    } catch {
      // Ignore
    }

    // تصفير عدادات المعرفات التلقائية (AUTOINCREMENT sequences)
    try {
      db.exec('DELETE FROM sqlite_sequence;')
    } catch {
      // Ignore
    }

    // إعادة ضبط الإعدادات والنشاط مع الحفاظ على نشاط المركز الحالي
    const activeType: BusinessType = currentType
    seedDefaults(activeType)
    writeBusinessSignatures(activeType)
    writeSetting('business_type', activeType)
    if (activeType === 'hearing_aids') {
      writeSetting('center_name', HEARING_AIDS_PROFILE.centerNameDefault)
      writeSetting('center_subtitle', HEARING_AIDS_PROFILE.centerSubtitleDefault)
      writeSetting('receipt_footer', HEARING_AIDS_PROFILE.receiptFooterDefault)
    }
    writeSetting('hide_demo_data', '0')
    setDemoDataHiddenCache(false)

    db.exec('PRAGMA foreign_keys = ON;')
  })

  // ضغط قاعدة البيانات واسترجاع المساحة الحرة
  try {
    db.exec('VACUUM;')
  } catch {
    // Ignore vacuum error
  }

  return {
    success: true,
    message: 'تم إعادة ضبط البرنامج بالكامل واستعادة ضبط المصنع بنجاح.',
    backupPath
  }
}
