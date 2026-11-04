import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { scryptSync, createHmac, timingSafeEqual } from 'crypto'
import { createRequire } from 'module'
import type {
  User,
  UserRole,
  LoginPayload,
  AuthResponse,
  Customer,
  CustomerAppliance,
  Technician,
  SparePart,
  InventoryMovement,
  MaintenanceTicket,
  TicketPartItem,
  TreasuryTransaction,
  CenterSettings,
  DashboardStats,
  FinancialReportData,
  TechnicianStatementItem
} from '../shared/types'

const requireModule = createRequire(import.meta.url)

const PASSWORD_SALT = 'sallehli_aljoker_salt_v1_2026'
const LICENSE_HMAC_SECRET = 'sallehli_aljoker_license_secret_key_v1'

interface StatementLike {
  run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint }
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown[]
}

interface DatabaseLike {
  exec: (sql: string) => void
  prepare: (sql: string) => StatementLike
  close: () => void
}

let db: DatabaseLike
let dbFilePath = ''

function hashPassword(password: string): string {
  const derived = scryptSync(password, PASSWORD_SALT, 32).toString('hex')
  return `scrypt:${derived}`
}

function verifyPassword(password: string, storedHash: string): { valid: boolean; needsUpgrade: boolean } {
  if (storedHash.startsWith('scrypt:')) {
    const expectedHex = storedHash.slice('scrypt:'.length)
    const actualHex = scryptSync(password, PASSWORD_SALT, 32).toString('hex')
    try {
      const valid = timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'))
      return { valid, needsUpgrade: false }
    } catch {
      return { valid: false, needsUpgrade: false }
    }
  }
  const valid = storedHash === password
  return { valid, needsUpgrade: valid }
}

function signSubscription(username: string, role: string, subscriptionEnd: string | null): string {
  const payload = `${username.trim().toLowerCase()}|${role}|${subscriptionEnd || ''}`
  return createHmac('sha256', LICENSE_HMAC_SECRET).update(payload).digest('hex')
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string')
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => typeof x === 'string')
      }
    } catch {
      return []
    }
  }
  return []
}

function createDatabaseConnection(filePath: string): DatabaseLike {
  try {
    const BetterSqlite3 = requireModule('better-sqlite3')
    const instance = new BetterSqlite3(filePath)
    instance.pragma('journal_mode = WAL')
    instance.pragma('foreign_keys = ON')
    return instance as DatabaseLike
  } catch {
    // Fallback to built-in node:sqlite DatabaseSync in modern Electron/Node
    const { DatabaseSync } = requireModule('node:sqlite')
    const instance = new DatabaseSync(filePath)
    instance.exec('PRAGMA journal_mode = WAL;')
    instance.exec('PRAGMA foreign_keys = ON;')
    return instance as DatabaseLike
  }
}

export function runTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE TRANSACTION;')
  try {
    const result = fn()
    db.exec('COMMIT;')
    return result
  } catch (err) {
    db.exec('ROLLBACK;')
    throw err
  }
}

export function getDatabasePath(): string {
  return dbFilePath
}

export function getDefaultAutoBackupDir(): string {
  const dir = join(app.getPath('userData'), 'backups')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function initDatabase(): void {
  const userDataDir = app.getPath('userData')
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true })
  }
  dbFilePath = join(userDataDir, 'sallehli_aljoker.sqlite')
  db = createDatabaseConnection(dbFilePath)
  createTables()
  runMigrations()
  seedDefaults()
}

function ensureColumn(tableName: string, columnName: string, columnDef: string): void {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  const exists = cols.some((c) => c.name === columnName)
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`)
  }
}

function runMigrations(): void {
  // 1. Upgrade users table if old CHECK constraint only allowed 3 roles
  const userTableMeta = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql?: string } | undefined

  if (userTableMeta?.sql && !userTableMeta.sql.includes('receptionist')) {
    runTransaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT DEFAULT '',
          role TEXT NOT NULL CHECK(role IN ('super_admin', 'owner', 'tenant', 'receptionist', 'cashier', 'storekeeper')),
          is_active INTEGER NOT NULL DEFAULT 1,
          subscription_start TEXT DEFAULT NULL,
          subscription_end TEXT DEFAULT NULL,
          subscription_sig TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        INSERT INTO users_new (id, username, password_hash, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at)
        SELECT id, username, password_hash, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `)
    })
  } else {
    ensureColumn('users', 'subscription_sig', "TEXT DEFAULT ''")
  }

  // 2. Ensure new image columns across tables
  ensureColumn('spare_parts', 'image_base64', "TEXT DEFAULT ''")
  ensureColumn('technicians', 'avatar_base64', "TEXT DEFAULT ''")
  ensureColumn('customer_appliances', 'warranty_image', "TEXT DEFAULT ''")
  ensureColumn('customer_appliances', 'fault_images', "TEXT DEFAULT '[]'")
  ensureColumn('maintenance_tickets', 'warranty_image', "TEXT DEFAULT ''")
  ensureColumn('maintenance_tickets', 'fault_images', "TEXT DEFAULT '[]'")

  // 3. Backfill subscription signatures & hash any unhashed passwords
  const allUsers = db
    .prepare(
      'SELECT id, username, password_hash, role, subscription_end, subscription_sig FROM users'
    )
    .all() as Array<{
    id: number
    username: string
    password_hash: string
    role: string
    subscription_end: string | null
    subscription_sig: string | null
  }>

  for (const u of allUsers) {
    const newHash = u.password_hash.startsWith('scrypt:')
      ? u.password_hash
      : hashPassword(u.password_hash)
    const sig = u.subscription_sig || signSubscription(u.username, u.role, u.subscription_end)
    if (newHash !== u.password_hash || sig !== u.subscription_sig) {
      db.prepare('UPDATE users SET password_hash = ?, subscription_sig = ? WHERE id = ?').run(
        newHash,
        sig,
        u.id
      )
    }
  }
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'owner', 'tenant', 'receptionist', 'cashier', 'storekeeper')),
      is_active INTEGER NOT NULL DEFAULT 1,
      subscription_start TEXT DEFAULT NULL,
      subscription_end TEXT DEFAULT NULL,
      subscription_sig TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone2 TEXT DEFAULT '',
      area TEXT DEFAULT '',
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS customer_appliances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      appliance_type TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT DEFAULT '',
      serial_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      last_warranty_end TEXT DEFAULT NULL,
      last_ticket_number TEXT DEFAULT NULL,
      warranty_image TEXT DEFAULT '',
      fault_images TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      specialty TEXT NOT NULL,
      commission_rate REAL NOT NULL DEFAULT 30,
      base_salary REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      avatar_base64 TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS spare_parts (
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
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_phone2 TEXT DEFAULT '',
      customer_area TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      appliance_id INTEGER DEFAULT NULL,
      appliance_type TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT DEFAULT '',
      serial_number TEXT DEFAULT '',
      service_type TEXT NOT NULL CHECK(service_type IN ('home_visit', 'workshop')),
      status TEXT NOT NULL DEFAULT 'new',
      priority TEXT NOT NULL DEFAULT 'normal',
      complaint TEXT NOT NULL,
      diagnosis TEXT DEFAULT '',
      technician_id INTEGER DEFAULT NULL,
      scheduled_date TEXT NOT NULL,
      inspection_fee REAL NOT NULL DEFAULT 150,
      labor_cost REAL NOT NULL DEFAULT 0,
      parts_total REAL NOT NULL DEFAULT 0,
      parts_cost_total REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 150,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 150,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      warranty_months INTEGER NOT NULL DEFAULT 3,
      warranty_start_date TEXT DEFAULT NULL,
      warranty_end_date TEXT DEFAULT NULL,
      is_under_previous_warranty INTEGER NOT NULL DEFAULT 0,
      previous_ticket_number TEXT DEFAULT NULL,
      warranty_image TEXT DEFAULT '',
      fault_images TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      completed_at TEXT DEFAULT NULL,
      delivered_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      part_id INTEGER NOT NULL,
      part_name TEXT NOT NULL,
      part_code TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER NOT NULL,
      technician_id INTEGER DEFAULT NULL,
      ticket_id INTEGER DEFAULT NULL,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS treasury_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income', 'expense', 'tech_commission')),
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      ticket_id INTEGER DEFAULT NULL,
      technician_id INTEGER DEFAULT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `)
}

function seedDefaults(): void {
  // 1. Ensure default Super Admin (admin / 8520) exists
  const existingAdmin = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('admin') as { id: number } | undefined

  if (!existingAdmin) {
    const hashed = hashPassword('8520')
    const sig = signSubscription('admin', 'super_admin', null)
    db.prepare(
      `INSERT INTO users (username, password_hash, full_name, phone, role, is_active, subscription_sig, notes)
       VALUES (?, ?, ?, ?, 'super_admin', 1, ?, ?)`
    ).run(
      'admin',
      hashed,
      'السوبر أدمن (مالك النظام)',
      '01000000000',
      sig,
      'الحساب الرئيسي لمالك البرنامج بالكامل'
    )
  }

  // 2. Ensure default Center Settings exist
  const defaultSettings: CenterSettings = {
    center_name: 'مركز صلحلي للصيانة المعتمدة',
    center_subtitle:
      'صيانة جميع الأجهزة المنزلية والكهربائية (غسالات - ثلاجات - ديب فريزر - تكييفات - بوتاجازات - سخانات)',
    phone1: '01012345678',
    phone2: '01112345678',
    whatsapp: '201012345678',
    address: 'القاهرة - شارع التحرير الرئيسي - بجوار محطة المترو',
    logo_base64: '',
    default_print_format: 'a4',
    default_inspection_fee: 150,
    default_warranty_months: 6,
    warranty_terms:
      '1. يشمل الضمان قطع الغيار المستبدلة والعطل الذي تم إصلاحه فقط خلال فترة الضمان المحددة.\n2. لا يشمل الضمان الأعطال الناتجة عن سوء الاستخدام أو تذبذب التيار الكهربائي أو الكسر.\n3. يرجى الاحتفاظ بهذه الفاتورة لتقديمها عند طلب الصيانة بالضمان.',
    receipt_footer: 'شكراً لثقتكم في مركز صلحلي - خدمتكم شرف لنا على مدار الساعة',
    update_url: 'HassanMahmoud-dev/sallehli-aljoker',
    auto_backup_enabled: 1,
    auto_backup_dir: getDefaultAutoBackupDir(),
    auto_backup_keep_count: 10
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, String(v ?? ''))
  }

  // 3. Seed sample operational data if no technicians or parts exist yet
  const techCount = (db.prepare('SELECT COUNT(*) as cnt FROM technicians').get() as { cnt: number })
    .cnt
  if (techCount === 0) {
    db.prepare(
      `INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active, notes)
       VALUES
       ('م. أحمد الجوكر', '01011223344', 'غسالات أوتوماتيك وفوق أوتوماتيك', 35, 3000, 1, 'فني أول خبرة 12 سنة'),
       ('م. محمود عبد الرحمن', '01122334455', 'ثلاجات وديب فريزر وتكييف', 30, 3500, 1, 'متخصص شحن فريون وكباسات انفرتر'),
       ('م. كريم عادل', '01233445566', 'كروت إلكترونية وبوتاجازات وسخانات', 40, 2500, 1, 'صيانة كروت ديجيتال وانفرتر')`
    ).run()
  }

  const partsCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM spare_parts').get() as { cnt: number }
  ).cnt
  if (partsCount === 0) {
    db.prepare(
      `INSERT INTO spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location)
       VALUES
       ('WM-PMP-01', 'طلمبة طرد غسالة أوتوماتيك أصلية', 'غسالات', 'LG / Samsung', 280, 480, 12, 3, 'رف A1'),
       ('WM-HTR-02', 'هيتر تسخين غسالة أوتوماتيك بالثرموستات', 'غسالات', 'Zanussi / Toshib', 190, 350, 8, 3, 'رف A2'),
       ('RF-CMP-01', 'كباس ثلاجة 1/4 حصان إنفرتر أصلي', 'ثلاجات وديب فريزر', 'LG', 2400, 3300, 4, 2, 'مخزن B1'),
       ('RF-GAS-02', 'شحنة فريون R134a / R600a كاملة بالفلتر', 'ثلاجات وديب فريزر', 'عام', 320, 750, 15, 5, 'قسم التبريد'),
       ('RF-TMR-03', 'تايمر وثرموستات وسخان نوفروست (طقم ديفروست)', 'ثلاجات وديب فريزر', 'Toshiba / Kiriazi', 380, 680, 2, 4, 'رف B2'),
       ('AC-CAP-01', 'كباستور تكييف ثنائي 45/5 ميكروفاراد', 'تكييفات', 'Carrier / Sharp', 160, 350, 10, 3, 'رف C1'),
       ('WM-LCK-04', 'لوك باب غسالة أوتوماتيك كهرباء', 'غسالات', 'Beko / Ariston', 210, 400, 2, 3, 'رف A3')`
    ).run()
  }

  const custCount = (db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as { cnt: number })
    .cnt
  if (custCount === 0) {
    db.prepare(
      `INSERT INTO customers (name, phone, phone2, area, address, notes)
       VALUES
       ('أستاذ محمد عبد السلام', '01099887766', '01299887766', 'مدينة نصر', 'ش عباس العقاد - عمارة 14 - الدور الرابع شقة 8', 'عميل مميز'),
       ('مدام نهى إبراهيم', '01155443322', '', 'المعادي', 'شارع 9 - بجوار مترو المعادي - برج النور الدور 3', 'يفضل الزيارة بعد الساعة 2 ظهراً')`
    ).run()

    db.prepare(
      `INSERT INTO customer_appliances (customer_id, appliance_type, brand, model, serial_number, last_warranty_end, last_ticket_number)
       VALUES
       (1, 'غسالة أوتوماتيك', 'LG', 'Inverter Direct Drive 8KG', 'LG-884120', date('now', '+5 months'), 'SJ-2026-0001'),
       (2, 'ثلاجة نوفروست', 'Toshiba', '16 قدم سيلفر', 'TSH-44109', NULL, 'SJ-2026-0002')`
    ).run()

    const today = new Date().toISOString().slice(0, 10)
    const warrantyEnd = new Date()
    warrantyEnd.setMonth(warrantyEnd.getMonth() + 6)
    const warrantyEndStr = warrantyEnd.toISOString().slice(0, 10)

    db.prepare(
      `INSERT INTO maintenance_tickets (
        ticket_number, customer_id, customer_name, customer_phone, customer_phone2, customer_area, customer_address,
        appliance_id, appliance_type, brand, model, serial_number, service_type, status, priority,
        complaint, diagnosis, technician_id, scheduled_date, inspection_fee, labor_cost, parts_total, parts_cost_total,
        discount, total_amount, paid_amount, remaining_amount, payment_method, warranty_months, warranty_start_date, warranty_end_date
      ) VALUES
      (
        'SJ-2026-0001', 1, 'أستاذ محمد عبد السلام', '01099887766', '01299887766', 'مدينة نصر', 'ش عباس العقاد - عمارة 14 - الدور الرابع شقة 8',
        1, 'غسالة أوتوماتيك', 'LG', 'Inverter Direct Drive 8KG', 'LG-884120', 'home_visit', 'delivered', 'normal',
        'الغسالة لا تصرف المياه وتظهر كود خطأ OE على الشاشة', 'تلف طلمبة الطرد وانسداد الفلتر - تم تغيير طلمبة أصلية وتجربة دورة العصر',
        1, ?, 150, 250, 480, 280, 0, 880, 880, 0, 'cash', 6, ?, ?
      ),
      (
        'SJ-2026-0002', 2, 'مدام نهى إبراهيم', '01155443322', '', 'المعادي', 'شارع 9 - بجوار مترو المعادي - برج النور الدور 3',
        2, 'ثلاجة نوفروست', 'Toshiba', '16 قدم سيلفر', 'TSH-44109', 'home_visit', 'inspecting', 'urgent',
        'الفريزر يعمل لكن الكابينة تحت لا تبرد نهائياً', 'جاري فحص دائرة النوفروست (السخان والتايمر والدمبر)',
        2, ?, 150, 0, 0, 0, 0, 150, 150, 0, 'instapay', 6, NULL, NULL
      )`
    ).run(today, today, warrantyEndStr, today)

    db.prepare(
      `INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
       VALUES (1, 1, 'طلمبة طرد غسالة أوتوماتيك أصلية', 'WM-PMP-01', 1, 280, 480, 480)`
    ).run()

    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description)
       VALUES
       ('income', 'تحصيل فاتورة صيانة', 880, 1, 'cash', 'تحصيل طلب صيانة SJ-2026-0001 - أستاذ محمد عبد السلام'),
       ('income', 'رسوم كشف', 150, 2, 'instapay', 'تحصيل رسوم كشف طلب SJ-2026-0002 - مدام نهى إبراهيم')`
    ).run()
  }
}

// ==========================================
// 1. AUTH & LICENSING (Super Admin / Owner / Tenant / Staff Roles)
// ==========================================

export function loginUser(payload: LoginPayload): AuthResponse {
  const userRow = db
    .prepare(
      `SELECT id, username, password_hash, full_name, phone, role, is_active,
              subscription_start, subscription_end, subscription_sig, notes, created_at
       FROM users WHERE username = ?`
    )
    .get(payload.username.trim()) as
    | (User & { password_hash: string; subscription_sig?: string })
    | undefined

  if (!userRow) {
    return {
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    }
  }

  const { valid, needsUpgrade } = verifyPassword(payload.password, userRow.password_hash)
  if (!valid) {
    return {
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    }
  }

  if (needsUpgrade) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(payload.password),
      userRow.id
    )
  }

  if (!userRow.is_active) {
    return {
      success: false,
      message: 'هذا الحساب موقوف حالياً. يرجى التواصل مع مالك البرنامج (السوبر أدمن).'
    }
  }

  // Verify digital signature of role & subscription_end to prevent SQLite tampering
  const expectedSig = signSubscription(userRow.username, userRow.role, userRow.subscription_end)
  if (userRow.subscription_sig && userRow.subscription_sig !== expectedSig) {
    return {
      success: false,
      message:
        'تم اكتشاف تلاعب غير مصرح به في بيانات الترخيص أو صلاحية الحساب. يرجى مراجعة السوبر أدمن.'
    }
  }

  let isExpired = false
  let daysRemaining: number | null = null

  if (userRow.role === 'tenant') {
    if (!userRow.subscription_end) {
      return {
        success: false,
        message: 'لم يتم تحديد فترة اشتراك لهذا الحساب المستأجر. يرجى مراجعة السوبر أدمن.'
      }
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = new Date(userRow.subscription_end)
    endDate.setHours(23, 59, 59, 999)

    const diffMs = endDate.getTime() - today.getTime()
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
      isExpired = true
      return {
        success: false,
        message: `انتهت فترة إيجار البرنامج بتاريخ (${userRow.subscription_end}). يرجى التواصل مع السوبر أدمن لتجديد الاشتراك.`,
        subscriptionStatus: { isExpired: true, daysRemaining: 0 }
      }
    }
  }

  const { password_hash: _, subscription_sig: __, ...safeUser } = userRow
  return {
    success: true,
    user: safeUser,
    subscriptionStatus: { isExpired, daysRemaining }
  }
}

export function verifySession(userId: number): AuthResponse {
  if (!userId) {
    return { success: false, message: 'جلسة غير صالحة' }
  }

  const userRow = db
    .prepare(
      `SELECT id, username, password_hash, full_name, phone, role, is_active,
              subscription_start, subscription_end, subscription_sig, notes, created_at
       FROM users WHERE id = ?`
    )
    .get(Number(userId)) as
    | (User & { password_hash: string; subscription_sig?: string })
    | undefined

  if (!userRow || !userRow.is_active) {
    return {
      success: false,
      message: 'هذا الحساب غير موجود أو موقوف حالياً.'
    }
  }

  const expectedSig = signSubscription(userRow.username, userRow.role, userRow.subscription_end)
  if (userRow.subscription_sig && userRow.subscription_sig !== expectedSig) {
    return {
      success: false,
      message: 'تم اكتشاف تلاعب غير مصرح به في بيانات الترخيص أو صلاحية الحساب.'
    }
  }

  let isExpired = false
  let daysRemaining: number | null = null

  if (userRow.role === 'tenant') {
    if (!userRow.subscription_end) {
      return {
        success: false,
        message: 'لم يتم تحديد فترة اشتراك لهذا الحساب المستأجر.'
      }
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = new Date(userRow.subscription_end)
    endDate.setHours(23, 59, 59, 999)

    const diffMs = endDate.getTime() - today.getTime()
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
      isExpired = true
      return {
        success: false,
        message: `انتهت فترة إيجار البرنامج بتاريخ (${userRow.subscription_end}).`,
        subscriptionStatus: { isExpired: true, daysRemaining: 0 }
      }
    }
  }

  const { password_hash: _, subscription_sig: __, ...safeUser } = userRow
  return {
    success: true,
    user: safeUser,
    subscriptionStatus: { isExpired, daysRemaining }
  }
}

export function listUsers(): User[] {
  return db
    .prepare(
      `SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at
       FROM users ORDER BY id ASC`
    )
    .all() as User[]
}

export function saveUser(data: Partial<User> & { password?: string }): User {
  const username = data.username?.trim() || ''
  const role: UserRole = data.role || 'tenant'
  const subEnd = role === 'tenant' ? data.subscription_end || null : null
  const subStart = role === 'tenant' ? data.subscription_start || null : null
  const sig = signSubscription(username, role, subEnd)

  if (data.id) {
    if (data.password && data.password.trim() !== '') {
      const hashed = hashPassword(data.password.trim())
      db.prepare(
        `UPDATE users SET username = ?, password_hash = ?, full_name = ?, phone = ?, role = ?,
         is_active = ?, subscription_start = ?, subscription_end = ?, subscription_sig = ?, notes = ?
         WHERE id = ?`
      ).run(
        username,
        hashed,
        data.full_name?.trim(),
        data.phone || '',
        role,
        data.is_active ?? 1,
        subStart,
        subEnd,
        sig,
        data.notes || '',
        data.id
      )
    } else {
      db.prepare(
        `UPDATE users SET username = ?, full_name = ?, phone = ?, role = ?,
         is_active = ?, subscription_start = ?, subscription_end = ?, subscription_sig = ?, notes = ?
         WHERE id = ?`
      ).run(
        username,
        data.full_name?.trim(),
        data.phone || '',
        role,
        data.is_active ?? 1,
        subStart,
        subEnd,
        sig,
        data.notes || '',
        data.id
      )
    }
    return db
      .prepare(
        'SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at FROM users WHERE id = ?'
      )
      .get(data.id) as User
  } else {
    const hashed = hashPassword(data.password?.trim() || '1234')
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, full_name, phone, role, is_active, subscription_start, subscription_end, subscription_sig, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        username,
        hashed,
        data.full_name?.trim(),
        data.phone || '',
        role,
        data.is_active ?? 1,
        subStart,
        subEnd,
        sig,
        data.notes || ''
      )
    return db
      .prepare(
        'SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at FROM users WHERE id = ?'
      )
      .get(Number(info.lastInsertRowid)) as User
  }
}

export function deleteUser(id: number): void {
  const target = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as
    | { username: string }
    | undefined
  if (target?.username === 'admin') {
    throw new Error('لا يمكن حذف الحساب الافتراضي للسوبر أدمن (admin)')
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

// ==========================================
// 2. CUSTOMERS & APPLIANCES & IMAGES
// ==========================================

function normalizeApplianceRow(row: Record<string, unknown>): CustomerAppliance {
  return {
    ...(row as unknown as CustomerAppliance),
    warranty_image: String(row.warranty_image || ''),
    fault_images: parseJsonArray(row.fault_images)
  }
}

function normalizeTicketRow(row: Record<string, unknown>): MaintenanceTicket {
  return {
    ...(row as unknown as MaintenanceTicket),
    warranty_image: String(row.warranty_image || ''),
    fault_images: parseJsonArray(row.fault_images)
  }
}

export function listCustomers(search = ''): Customer[] {
  const q = `%${search.trim()}%`
  return db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM maintenance_tickets t WHERE t.customer_id = c.id) as tickets_count
       FROM customers c
       WHERE c.name LIKE ? OR c.phone LIKE ? OR c.phone2 LIKE ? OR c.area LIKE ?
       ORDER BY c.id DESC`
    )
    .all(q, q, q, q) as Customer[]
}

export function findCustomerByPhone(phone: string): {
  customer: Customer | null
  appliances: CustomerAppliance[]
  previousTickets: MaintenanceTicket[]
} {
  const clean = phone.trim()
  if (!clean) return { customer: null, appliances: [], previousTickets: [] }
  const customer = db
    .prepare('SELECT * FROM customers WHERE phone = ? OR phone2 = ? LIMIT 1')
    .get(clean, clean) as Customer | undefined

  if (!customer) return { customer: null, appliances: [], previousTickets: [] }

  const rawAppliances = db
    .prepare('SELECT * FROM customer_appliances WHERE customer_id = ? ORDER BY id DESC')
    .all(customer.id) as Record<string, unknown>[]

  const rawTickets = db
    .prepare('SELECT * FROM maintenance_tickets WHERE customer_id = ? ORDER BY id DESC LIMIT 20')
    .all(customer.id) as Record<string, unknown>[]

  return {
    customer,
    appliances: rawAppliances.map(normalizeApplianceRow),
    previousTickets: rawTickets.map(normalizeTicketRow)
  }
}

export function saveCustomer(data: Partial<Customer>): Customer {
  if (data.id) {
    db.prepare(
      `UPDATE customers SET name = ?, phone = ?, phone2 = ?, area = ?, address = ?, notes = ?
       WHERE id = ?`
    ).run(
      data.name?.trim(),
      data.phone?.trim(),
      data.phone2?.trim() || '',
      data.area?.trim() || '',
      data.address?.trim() || '',
      data.notes?.trim() || '',
      data.id
    )
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(data.id) as Customer
  } else {
    const info = db
      .prepare(
        `INSERT INTO customers (name, phone, phone2, area, address, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name?.trim(),
        data.phone?.trim(),
        data.phone2?.trim() || '',
        data.area?.trim() || '',
        data.address?.trim() || '',
        data.notes?.trim() || ''
      )
    return db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Customer
  }
}

export function deleteCustomer(id: number): void {
  db.prepare('DELETE FROM customers WHERE id = ?').run(id)
}

export function getCustomerAppliances(customerId: number): CustomerAppliance[] {
  const rows = db
    .prepare('SELECT * FROM customer_appliances WHERE customer_id = ? ORDER BY id DESC')
    .all(customerId) as Record<string, unknown>[]
  return rows.map(normalizeApplianceRow)
}

export function saveCustomerAppliance(data: Partial<CustomerAppliance>): CustomerAppliance {
  const faultImagesJson = JSON.stringify(Array.isArray(data.fault_images) ? data.fault_images : [])
  const warrantyImg = data.warranty_image || ''

  if (data.id) {
    db.prepare(
      `UPDATE customer_appliances
       SET appliance_type = ?, brand = ?, model = ?, serial_number = ?, notes = ?,
           last_warranty_end = ?, last_ticket_number = ?, warranty_image = ?, fault_images = ?
       WHERE id = ?`
    ).run(
      data.appliance_type?.trim() || '',
      data.brand?.trim() || '',
      data.model?.trim() || '',
      data.serial_number?.trim() || '',
      data.notes?.trim() || '',
      data.last_warranty_end || null,
      data.last_ticket_number || null,
      warrantyImg,
      faultImagesJson,
      data.id
    )
    const row = db.prepare('SELECT * FROM customer_appliances WHERE id = ?').get(data.id) as Record<
      string,
      unknown
    >
    return normalizeApplianceRow(row)
  } else {
    const info = db
      .prepare(
        `INSERT INTO customer_appliances (
          customer_id, appliance_type, brand, model, serial_number, notes,
          last_warranty_end, last_ticket_number, warranty_image, fault_images
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.customer_id,
        data.appliance_type?.trim() || '',
        data.brand?.trim() || '',
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        data.notes?.trim() || '',
        data.last_warranty_end || null,
        data.last_ticket_number || null,
        warrantyImg,
        faultImagesJson
      )
    const row = db
      .prepare('SELECT * FROM customer_appliances WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>
    return normalizeApplianceRow(row)
  }
}

export function deleteCustomerAppliance(id: number): void {
  db.prepare('DELETE FROM customer_appliances WHERE id = ?').run(id)
}

export function updateTicketImages(payload: {
  ticketId: number
  warranty_image?: string
  fault_images?: string[]
}): MaintenanceTicket {
  const faultImagesJson = JSON.stringify(
    Array.isArray(payload.fault_images) ? payload.fault_images : []
  )
  const warrantyImg = payload.warranty_image || ''

  db.prepare(
    `UPDATE maintenance_tickets
     SET warranty_image = ?, fault_images = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(warrantyImg, faultImagesJson, payload.ticketId)

  const raw = db
    .prepare(
      `SELECT mt.*, t.name as technician_name
       FROM maintenance_tickets mt
       LEFT JOIN technicians t ON t.id = mt.technician_id
       WHERE mt.id = ?`
    )
    .get(payload.ticketId) as Record<string, unknown>

  const ticket = normalizeTicketRow(raw)

  // Also sync to matching customer_appliances record if present
  if (ticket.customer_id && ticket.appliance_type && ticket.brand) {
    db.prepare(
      `UPDATE customer_appliances
       SET warranty_image = CASE WHEN ? != '' THEN ? ELSE warranty_image END,
           fault_images = CASE WHEN ? != '[]' THEN ? ELSE fault_images END
       WHERE customer_id = ? AND appliance_type = ? AND brand = ?`
    ).run(
      warrantyImg,
      warrantyImg,
      faultImagesJson,
      faultImagesJson,
      ticket.customer_id,
      ticket.appliance_type,
      ticket.brand
    )
  }

  return ticket
}

// ==========================================
// 3. TECHNICIANS
// ==========================================

export function listTechnicians(): Technician[] {
  return db
    .prepare(
      `SELECT tech.*,
        (SELECT COUNT(*) FROM maintenance_tickets mt
         WHERE mt.technician_id = tech.id AND mt.status NOT IN ('delivered', 'cancelled')) as active_tickets_count,
        COALESCE((SELECT SUM(
            CASE WHEN im.movement_type = 'custody_issue' THEN im.quantity
                 WHEN im.movement_type = 'custody_return' THEN -im.quantity
                 ELSE 0 END
          ) FROM inventory_movements im WHERE im.technician_id = tech.id), 0) as custody_parts_count,
        COALESCE((SELECT SUM((mt.labor_cost + mt.inspection_fee) * (tech.commission_rate / 100.0))
          FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')), 0) as total_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'), 0) as total_paid_commission
       FROM technicians tech
       ORDER BY tech.id DESC`
    )
    .all() as Technician[]
}

export function saveTechnician(data: Partial<Technician>): Technician {
  if (data.id) {
    db.prepare(
      `UPDATE technicians
       SET name = ?, phone = ?, specialty = ?, commission_rate = ?, base_salary = ?, is_active = ?, notes = ?, avatar_base64 = ?
       WHERE id = ?`
    ).run(
      data.name?.trim(),
      data.phone?.trim(),
      data.specialty?.trim() || 'شامل',
      Number(data.commission_rate ?? 30),
      Number(data.base_salary ?? 0),
      data.is_active ?? 1,
      data.notes?.trim() || '',
      data.avatar_base64 || '',
      data.id
    )
    return db.prepare('SELECT * FROM technicians WHERE id = ?').get(data.id) as Technician
  } else {
    const info = db
      .prepare(
        `INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active, notes, avatar_base64)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name?.trim(),
        data.phone?.trim(),
        data.specialty?.trim() || 'شامل',
        Number(data.commission_rate ?? 30),
        Number(data.base_salary ?? 0),
        data.is_active ?? 1,
        data.notes?.trim() || '',
        data.avatar_base64 || ''
      )
    return db
      .prepare('SELECT * FROM technicians WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Technician
  }
}

export function deleteTechnician(id: number): void {
  db.prepare('DELETE FROM technicians WHERE id = ?').run(id)
}

// ==========================================
// 4. SPARE PARTS & INVENTORY
// ==========================================

export function listSpareParts(search = ''): SparePart[] {
  const q = `%${search.trim()}%`
  return db
    .prepare(
      `SELECT * FROM spare_parts
       WHERE name LIKE ? OR code LIKE ? OR category LIKE ? OR brand LIKE ?
       ORDER BY id DESC`
    )
    .all(q, q, q, q) as SparePart[]
}

export function saveSparePart(data: Partial<SparePart>): SparePart {
  if (data.id) {
    db.prepare(
      `UPDATE spare_parts
       SET code = ?, name = ?, category = ?, brand = ?, purchase_price = ?, selling_price = ?,
           quantity = ?, min_quantity = ?, location = ?, notes = ?, image_base64 = ?
       WHERE id = ?`
    ).run(
      data.code?.trim(),
      data.name?.trim(),
      data.category?.trim() || 'عام',
      data.brand?.trim() || 'عام',
      Number(data.purchase_price ?? 0),
      Number(data.selling_price ?? 0),
      Number(data.quantity ?? 0),
      Number(data.min_quantity ?? 3),
      data.location?.trim() || '',
      data.notes?.trim() || '',
      data.image_base64 || '',
      data.id
    )
    return db.prepare('SELECT * FROM spare_parts WHERE id = ?').get(data.id) as SparePart
  } else {
    const code = data.code?.trim() || `PT-${Date.now().toString().slice(-5)}`
    const info = db
      .prepare(
        `INSERT INTO spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location, notes, image_base64)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        data.name?.trim(),
        data.category?.trim() || 'عام',
        data.brand?.trim() || 'عام',
        Number(data.purchase_price ?? 0),
        Number(data.selling_price ?? 0),
        Number(data.quantity ?? 0),
        Number(data.min_quantity ?? 3),
        data.location?.trim() || '',
        data.notes?.trim() || '',
        data.image_base64 || ''
      )
    return db
      .prepare('SELECT * FROM spare_parts WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as SparePart
  }
}

export function deleteSparePart(id: number): void {
  db.prepare('DELETE FROM spare_parts WHERE id = ?').run(id)
}

export function recordInventoryMovement(payload: {
  part_id: number
  technician_id?: number | null
  ticket_id?: number | null
  movement_type: InventoryMovement['movement_type']
  quantity: number
  notes?: string
  recordInTreasury?: boolean
}): void {
  runTransaction(() => {
    const part = db.prepare('SELECT * FROM spare_parts WHERE id = ?').get(payload.part_id) as
      | SparePart
      | undefined
    if (!part) throw new Error('قطعة الغيار غير موجودة')

    const qty = Math.abs(Number(payload.quantity))
    if (qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')

    let delta = 0
    if (payload.movement_type === 'in' || payload.movement_type === 'custody_return') {
      delta = qty
    } else {
      if (part.quantity < qty) {
        throw new Error(`الكمية المتاحة في المخزن (${part.quantity}) غير كافية لصرف (${qty})`)
      }
      delta = -qty
    }

    db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(delta, part.id)

    db.prepare(
      `INSERT INTO inventory_movements (part_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      part.id,
      payload.technician_id || null,
      payload.ticket_id || null,
      payload.movement_type,
      qty,
      part.purchase_price,
      part.selling_price,
      payload.notes || ''
    )

    if (payload.movement_type === 'in' && payload.recordInTreasury) {
      const totalPurchase = qty * part.purchase_price
      if (totalPurchase > 0) {
        db.prepare(
          `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
           VALUES ('expense', 'شراء قطع غيار', ?, 'cash', ?)`
        ).run(totalPurchase, `توريد مخزني: ${qty} × ${part.name} (${part.code})`)
      }
    }
  })
}

export function listInventoryMovements(): InventoryMovement[] {
  return db
    .prepare(
      `SELECT im.*, sp.name as part_name, sp.code as part_code,
              t.name as technician_name, mt.ticket_number
       FROM inventory_movements im
       LEFT JOIN spare_parts sp ON sp.id = im.part_id
       LEFT JOIN technicians t ON t.id = im.technician_id
       LEFT JOIN maintenance_tickets mt ON mt.id = im.ticket_id
       ORDER BY im.id DESC LIMIT 150`
    )
    .all() as InventoryMovement[]
}

// ==========================================
// 5. MAINTENANCE TICKETS & WARRANTY
// ==========================================

function generateNextTicketNumber(): string {
  const year = new Date().getFullYear()
  const lastRow = db
    .prepare('SELECT id FROM maintenance_tickets ORDER BY id DESC LIMIT 1')
    .get() as { id: number } | undefined
  const nextSeq = (lastRow ? lastRow.id : 0) + 1
  return `SJ-${year}-${String(nextSeq).padStart(4, '0')}`
}

export function listTickets(filters?: {
  search?: string
  status?: string
  service_type?: string
  technician_id?: number | null
}): MaintenanceTicket[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT mt.*, t.name as technician_name
    FROM maintenance_tickets mt
    LEFT JOIN technicians t ON t.id = mt.technician_id
    WHERE (
      mt.ticket_number LIKE ? OR
      mt.customer_name LIKE ? OR
      mt.customer_phone LIKE ? OR
      mt.appliance_type LIKE ? OR
      mt.brand LIKE ? OR
      mt.serial_number LIKE ?
    )
  `
  const params: unknown[] = [q, q, q, q, q, q]

  if (filters?.status && filters.status !== 'all') {
    sql += ' AND mt.status = ?'
    params.push(filters.status)
  }
  if (filters?.service_type && filters.service_type !== 'all') {
    sql += ' AND mt.service_type = ?'
    params.push(filters.service_type)
  }
  if (filters?.technician_id) {
    sql += ' AND mt.technician_id = ?'
    params.push(filters.technician_id)
  }

  sql += ' ORDER BY mt.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const rows = rawRows.map(normalizeTicketRow)

  const getPartsStmt = db.prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
  for (const row of rows) {
    row.parts = getPartsStmt.all(row.id) as TicketPartItem[]
  }
  return rows
}

export function saveTicket(
  data: Partial<MaintenanceTicket> & { parts?: TicketPartItem[]; recordPaymentInTreasury?: boolean }
): MaintenanceTicket {
  return runTransaction(() => {
    // 1. Ensure Customer exists or update customer
    let customerId = data.customer_id
    if (!customerId) {
      const existingCust = db
        .prepare('SELECT id FROM customers WHERE phone = ? LIMIT 1')
        .get(data.customer_phone?.trim() || '') as { id: number } | undefined

      if (existingCust) {
        customerId = existingCust.id
        db.prepare(
          'UPDATE customers SET name = ?, phone2 = ?, area = ?, address = ? WHERE id = ?'
        ).run(
          data.customer_name?.trim(),
          data.customer_phone2?.trim() || '',
          data.customer_area?.trim() || '',
          data.customer_address?.trim() || '',
          customerId
        )
      } else {
        const custInfo = db
          .prepare(
            'INSERT INTO customers (name, phone, phone2, area, address) VALUES (?, ?, ?, ?, ?)'
          )
          .run(
            data.customer_name?.trim(),
            data.customer_phone?.trim(),
            data.customer_phone2?.trim() || '',
            data.customer_area?.trim() || '',
            data.customer_address?.trim() || ''
          )
        customerId = Number(custInfo.lastInsertRowid)
      }
    }

    // 2. Calculate Parts Totals
    const parts = data.parts || []
    let partsSellingTotal = 0
    let partsCostTotal = 0
    for (const p of parts) {
      const qty = Number(p.quantity || 1)
      const uPrice = Number(p.unit_price || 0)
      const uCost = Number(p.unit_cost || 0)
      partsSellingTotal += qty * uPrice
      partsCostTotal += qty * uCost
    }

    const inspectionFee = Number(data.inspection_fee ?? 0)
    const laborCost = Number(data.labor_cost ?? 0)
    const discount = Number(data.discount ?? 0)
    const totalAmount = Math.max(0, inspectionFee + laborCost + partsSellingTotal - discount)
    const paidAmount = Number(data.paid_amount ?? 0)
    const remainingAmount = Math.max(0, totalAmount - paidAmount)

    // 3. Calculate Warranty Dates if status is repaired or delivered
    const warrantyMonths = Number(data.warranty_months ?? 0)
    let warrantyStart = data.warranty_start_date || null
    let warrantyEnd = data.warranty_end_date || null

    if ((data.status === 'repaired' || data.status === 'delivered') && warrantyMonths > 0) {
      if (!warrantyStart) {
        warrantyStart = new Date().toISOString().slice(0, 10)
      }
      const d = new Date(warrantyStart)
      d.setMonth(d.getMonth() + warrantyMonths)
      warrantyEnd = d.toISOString().slice(0, 10)
    } else if (warrantyMonths === 0) {
      warrantyStart = null
      warrantyEnd = null
    }

    const warrantyImg = data.warranty_image || ''
    const faultImagesJson = JSON.stringify(Array.isArray(data.fault_images) ? data.fault_images : [])

    let ticketId = data.id
    let ticketNumber = data.ticket_number || ''
    let previousPaid = 0

    if (ticketId) {
      const oldTicket = db
        .prepare('SELECT paid_amount, ticket_number FROM maintenance_tickets WHERE id = ?')
        .get(ticketId) as { paid_amount: number; ticket_number: string } | undefined
      previousPaid = oldTicket?.paid_amount ?? 0
      ticketNumber = oldTicket?.ticket_number || ticketNumber

      // Restore old ticket parts to stock before applying updated parts
      const oldParts = db
        .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
        .all(ticketId) as TicketPartItem[]
      for (const op of oldParts) {
        db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(
          op.quantity,
          op.part_id
        )
      }
      db.prepare('DELETE FROM ticket_parts WHERE ticket_id = ?').run(ticketId)

      db.prepare(
        `UPDATE maintenance_tickets SET
          customer_id = ?, customer_name = ?, customer_phone = ?, customer_phone2 = ?,
          customer_area = ?, customer_address = ?, appliance_type = ?, brand = ?, model = ?,
          serial_number = ?, service_type = ?, status = ?, priority = ?, complaint = ?,
          diagnosis = ?, technician_id = ?, scheduled_date = ?, inspection_fee = ?,
          labor_cost = ?, parts_total = ?, parts_cost_total = ?, discount = ?,
          total_amount = ?, paid_amount = ?, remaining_amount = ?, payment_method = ?,
          warranty_months = ?, warranty_start_date = ?, warranty_end_date = ?,
          is_under_previous_warranty = ?, previous_ticket_number = ?,
          warranty_image = ?, fault_images = ?, notes = ?,
          completed_at = CASE WHEN ? IN ('repaired', 'delivered') AND completed_at IS NULL THEN datetime('now', 'localtime') ELSE completed_at END,
          delivered_at = CASE WHEN ? = 'delivered' AND delivered_at IS NULL THEN datetime('now', 'localtime') ELSE delivered_at END,
          updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).run(
        customerId,
        data.customer_name?.trim(),
        data.customer_phone?.trim(),
        data.customer_phone2?.trim() || '',
        data.customer_area?.trim() || '',
        data.customer_address?.trim() || '',
        data.appliance_type?.trim(),
        data.brand?.trim(),
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        data.service_type || 'home_visit',
        data.status || 'new',
        data.priority || 'normal',
        data.complaint?.trim() || '',
        data.diagnosis?.trim() || '',
        data.technician_id || null,
        data.scheduled_date || new Date().toISOString().slice(0, 10),
        inspectionFee,
        laborCost,
        partsSellingTotal,
        partsCostTotal,
        discount,
        totalAmount,
        paidAmount,
        remainingAmount,
        data.payment_method || 'cash',
        warrantyMonths,
        warrantyStart,
        warrantyEnd,
        data.is_under_previous_warranty ? 1 : 0,
        data.previous_ticket_number || null,
        warrantyImg,
        faultImagesJson,
        data.notes?.trim() || '',
        data.status || 'new',
        data.status || 'new',
        ticketId
      )
    } else {
      ticketNumber = generateNextTicketNumber()
      const info = db
        .prepare(
          `INSERT INTO maintenance_tickets (
            ticket_number, customer_id, customer_name, customer_phone, customer_phone2,
            customer_area, customer_address, appliance_type, brand, model, serial_number,
            service_type, status, priority, complaint, diagnosis, technician_id, scheduled_date,
            inspection_fee, labor_cost, parts_total, parts_cost_total, discount, total_amount,
            paid_amount, remaining_amount, payment_method, warranty_months,
            warranty_start_date, warranty_end_date, is_under_previous_warranty, previous_ticket_number,
            warranty_image, fault_images, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ticketNumber,
          customerId,
          data.customer_name?.trim(),
          data.customer_phone?.trim(),
          data.customer_phone2?.trim() || '',
          data.customer_area?.trim() || '',
          data.customer_address?.trim() || '',
          data.appliance_type?.trim(),
          data.brand?.trim(),
          data.model?.trim() || '',
          data.serial_number?.trim() || '',
          data.service_type || 'home_visit',
          data.status || 'new',
          data.priority || 'normal',
          data.complaint?.trim() || '',
          data.diagnosis?.trim() || '',
          data.technician_id || null,
          data.scheduled_date || new Date().toISOString().slice(0, 10),
          inspectionFee,
          laborCost,
          partsSellingTotal,
          partsCostTotal,
          discount,
          totalAmount,
          paidAmount,
          remainingAmount,
          data.payment_method || 'cash',
          warrantyMonths,
          warrantyStart,
          warrantyEnd,
          data.is_under_previous_warranty ? 1 : 0,
          data.previous_ticket_number || null,
          warrantyImg,
          faultImagesJson,
          data.notes?.trim() || ''
        )
      ticketId = Number(info.lastInsertRowid)
    }

    // 4. Deduct new parts from stock & insert into ticket_parts
    for (const p of parts) {
      const partRecord = db
        .prepare('SELECT * FROM spare_parts WHERE id = ?')
        .get(p.part_id) as SparePart | undefined
      if (!partRecord) continue

      const qty = Number(p.quantity || 1)
      if (partRecord.quantity < qty) {
        throw new Error(
          `الكمية المتاحة من القطعة (${partRecord.name}) هي ${partRecord.quantity} فقط ولا تكفي لصرف ${qty}`
        )
      }

      db.prepare('UPDATE spare_parts SET quantity = quantity - ? WHERE id = ?').run(
        qty,
        partRecord.id
      )

      const uPrice = Number(p.unit_price || partRecord.selling_price)
      const uCost = Number(p.unit_cost || partRecord.purchase_price)

      db.prepare(
        `INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ticketId,
        partRecord.id,
        partRecord.name,
        partRecord.code,
        qty,
        uCost,
        uPrice,
        qty * uPrice
      )
    }

    // 5. Upsert Customer Appliance record for history & warranty tracking
    const existingAppliance = db
      .prepare(
        `SELECT id, warranty_image, fault_images FROM customer_appliances
         WHERE customer_id = ? AND appliance_type = ? AND brand = ? LIMIT 1`
      )
      .get(customerId, data.appliance_type?.trim(), data.brand?.trim()) as
      | { id: number; warranty_image?: string; fault_images?: string }
      | undefined

    if (existingAppliance) {
      const mergedWarrantyImg = warrantyImg || existingAppliance.warranty_image || ''
      const mergedFaultImages =
        faultImagesJson !== '[]' ? faultImagesJson : existingAppliance.fault_images || '[]'
      db.prepare(
        `UPDATE customer_appliances
         SET model = ?, serial_number = ?, last_warranty_end = COALESCE(?, last_warranty_end),
             last_ticket_number = ?, warranty_image = ?, fault_images = ?
         WHERE id = ?`
      ).run(
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        warrantyEnd,
        ticketNumber,
        mergedWarrantyImg,
        mergedFaultImages,
        existingAppliance.id
      )
    } else {
      db.prepare(
        `INSERT INTO customer_appliances (
          customer_id, appliance_type, brand, model, serial_number,
          last_warranty_end, last_ticket_number, warranty_image, fault_images
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        customerId,
        data.appliance_type?.trim(),
        data.brand?.trim(),
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        warrantyEnd,
        ticketNumber,
        warrantyImg,
        faultImagesJson
      )
    }

    // 6. Automatically record payment difference in Treasury if paidAmount increased
    const paymentDelta = paidAmount - previousPaid
    if (paymentDelta > 0 && data.recordPaymentInTreasury !== false) {
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description)
         VALUES ('income', 'تحصيل صيانة / كشف', ?, ?, ?, ?)`
      ).run(
        paymentDelta,
        ticketId,
        data.payment_method || 'cash',
        `تحصيل دفعة من طلب صيانة ${ticketNumber} - العميل: ${data.customer_name}`
      )
    }

    const rawSaved = db
      .prepare(
        `SELECT mt.*, t.name as technician_name
         FROM maintenance_tickets mt
         LEFT JOIN technicians t ON t.id = mt.technician_id
         WHERE mt.id = ?`
      )
      .get(ticketId) as Record<string, unknown>

    const saved = normalizeTicketRow(rawSaved)
    saved.parts = db
      .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
      .all(ticketId) as TicketPartItem[]
    return saved
  })
}

export function deleteTicket(id: number): void {
  runTransaction(() => {
    const oldParts = db
      .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
      .all(id) as TicketPartItem[]
    for (const op of oldParts) {
      db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(
        op.quantity,
        op.part_id
      )
    }
    db.prepare('DELETE FROM maintenance_tickets WHERE id = ?').run(id)
  })
}

// ==========================================
// 6. TREASURY, MULTI-WALLET & ADVANCED REPORTS
// ==========================================

export function listTreasuryTransactions(): TreasuryTransaction[] {
  return db
    .prepare(
      `SELECT tt.*, mt.ticket_number, tech.name as technician_name
       FROM treasury_transactions tt
       LEFT JOIN maintenance_tickets mt ON mt.id = tt.ticket_id
       LEFT JOIN technicians tech ON tech.id = tt.technician_id
       ORDER BY tt.id DESC LIMIT 300`
    )
    .all() as TreasuryTransaction[]
}

export function addTreasuryTransaction(data: Partial<TreasuryTransaction>): TreasuryTransaction {
  const info = db
    .prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, technician_id, payment_method, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.transaction_type || 'expense',
      data.category?.trim() || 'مصروفات عامة',
      Number(data.amount ?? 0),
      data.ticket_id || null,
      data.technician_id || null,
      data.payment_method || 'cash',
      data.description?.trim() || ''
    )

  return db
    .prepare('SELECT * FROM treasury_transactions WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as TreasuryTransaction
}

export function transferTreasuryFunds(payload: {
  fromMethod: string
  toMethod: string
  amount: number
  notes?: string
}): void {
  const amt = Number(payload.amount || 0)
  if (amt <= 0) throw new Error('يرجى إدخال مبلغ صحيح للتحويل')
  if (payload.fromMethod === payload.toMethod) {
    throw new Error('لا يمكن التحويل إلى نفس الخزينة / المحفظة')
  }

  runTransaction(() => {
    const desc = payload.notes?.trim()
      ? `تحويل بين الخزائن: ${payload.notes.trim()}`
      : `تحويل رصيد داخلي بمبلغ ${amt} ج.م`

    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
       VALUES ('expense', 'تحويل بين الخزائن', ?, ?, ?)`
    ).run(amt, payload.fromMethod, `${desc} (صادر)`)

    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
       VALUES ('income', 'تحويل بين الخزائن', ?, ?, ?)`
    ).run(amt, payload.toMethod, `${desc} (وارد)`)
  })
}

export function collectTicketReceivable(payload: {
  ticketId: number
  amount: number
  paymentMethod: string
  notes?: string
}): MaintenanceTicket {
  return runTransaction(() => {
    const raw = db
      .prepare('SELECT * FROM maintenance_tickets WHERE id = ?')
      .get(payload.ticketId) as Record<string, unknown> | undefined
    if (!raw) throw new Error('طلب الصيانة غير موجود')

    const ticket = normalizeTicketRow(raw)
    const collectAmt = Math.min(Number(payload.amount || 0), ticket.remaining_amount)
    if (collectAmt <= 0) throw new Error('المبلغ المحصل يجب أن يكون أكبر من صفر')

    const newPaid = ticket.paid_amount + collectAmt
    const newRemaining = Math.max(0, ticket.total_amount - newPaid)

    db.prepare(
      `UPDATE maintenance_tickets
       SET paid_amount = ?, remaining_amount = ?, payment_method = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(newPaid, newRemaining, payload.paymentMethod || 'cash', ticket.id)

    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description)
       VALUES ('income', 'تحصيل مديونية عميل', ?, ?, ?, ?)`
    ).run(
      collectAmt,
      ticket.id,
      payload.paymentMethod || 'cash',
      payload.notes?.trim() ||
        `تحصيل متبقي من طلب صيانة ${ticket.ticket_number} - العميل: ${ticket.customer_name}`
    )

    const updated = db
      .prepare('SELECT * FROM maintenance_tickets WHERE id = ?')
      .get(ticket.id) as Record<string, unknown>
    return normalizeTicketRow(updated)
  })
}

export function deleteTreasuryTransaction(id: number): void {
  db.prepare('DELETE FROM treasury_transactions WHERE id = ?').run(id)
}

export function getFinancialReport(dateFrom?: string, dateTo?: string): FinancialReportData {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = `${today.slice(0, 8)}01`
  const from = dateFrom?.trim() || firstOfMonth
  const to = dateTo?.trim() || today

  // 1. All-time balances per payment method (including internal transfers)
  const methods = ['cash', 'vodafone_cash', 'instapay', 'bank']
  const balancesByMethod: Record<string, { income: number; expense: number; net: number }> = {}
  const periodBalancesByMethod: Record<string, { income: number; expense: number; net: number }> = {}

  for (const m of methods) {
    balancesByMethod[m] = { income: 0, expense: 0, net: 0 }
    periodBalancesByMethod[m] = { income: 0, expense: 0, net: 0 }
  }

  const allMethodRows = db
    .prepare(
      `SELECT payment_method, transaction_type, SUM(amount) as total
       FROM treasury_transactions
       GROUP BY payment_method, transaction_type`
    )
    .all() as Array<{ payment_method: string; transaction_type: string; total: number }>

  for (const r of allMethodRows) {
    const m = balancesByMethod[r.payment_method] || { income: 0, expense: 0, net: 0 }
    if (r.transaction_type === 'income') {
      m.income += Number(r.total || 0)
    } else {
      m.expense += Number(r.total || 0)
    }
    m.net = m.income - m.expense
    balancesByMethod[r.payment_method] = m
  }

  const periodMethodRows = db
    .prepare(
      `SELECT payment_method, transaction_type, SUM(amount) as total
       FROM treasury_transactions
       WHERE date(created_at) BETWEEN ? AND ?
       GROUP BY payment_method, transaction_type`
    )
    .all(from, to) as Array<{ payment_method: string; transaction_type: string; total: number }>

  for (const r of periodMethodRows) {
    const m = periodBalancesByMethod[r.payment_method] || { income: 0, expense: 0, net: 0 }
    if (r.transaction_type === 'income') {
      m.income += Number(r.total || 0)
    } else {
      m.expense += Number(r.total || 0)
    }
    m.net = m.income - m.expense
    periodBalancesByMethod[r.payment_method] = m
  }

  // 2. Period income / expense / tech commissions (excluding internal transfers from profit calculation)
  const totalIncome = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
         WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن'
         AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { total: number }
  ).total

  const totalExpense = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
         WHERE transaction_type = 'expense' AND category != 'تحويل بين الخزائن'
         AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { total: number }
  ).total

  const totalTechCommissions = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
         WHERE transaction_type = 'tech_commission'
         AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { total: number }
  ).total

  // 3. Tickets metrics in period
  const ticketAgg = db
    .prepare(
      `SELECT
        COUNT(*) as ticketsCount,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN 1 ELSE 0 END), 0) as completedTicketsCount,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN parts_total ELSE 0 END), 0) as totalPartsRevenue,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN parts_cost_total ELSE 0 END), 0) as totalPartsCost,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN (inspection_fee + labor_cost - discount) ELSE 0 END), 0) as totalInspectionAndLabor
       FROM maintenance_tickets
       WHERE date(created_at) BETWEEN ? AND ?`
    )
    .get(from, to) as {
    ticketsCount: number
    completedTicketsCount: number
    totalPartsRevenue: number
    totalPartsCost: number
    totalInspectionAndLabor: number
  }

  const rawReceivables = db
    .prepare(
      `SELECT mt.*, t.name as technician_name
       FROM maintenance_tickets mt
       LEFT JOIN technicians t ON t.id = mt.technician_id
       WHERE mt.remaining_amount > 0 AND mt.status != 'cancelled'
       ORDER BY mt.remaining_amount DESC`
    )
    .all() as Record<string, unknown>[]
  const customerReceivables = rawReceivables.map(normalizeTicketRow)
  const totalReceivables = customerReceivables.reduce((sum, t) => sum + t.remaining_amount, 0)

  const totalPartsProfit = ticketAgg.totalPartsRevenue - ticketAgg.totalPartsCost
  const netProfit = totalIncome - totalExpense - totalTechCommissions - ticketAgg.totalPartsCost

  // 4. Technician Statements
  const technicianStatements = db
    .prepare(
      `SELECT
        tech.id, tech.name, tech.phone, tech.specialty, tech.avatar_base64,
        tech.commission_rate, tech.base_salary,
        COALESCE((SELECT COUNT(*) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as completed_tickets_count,
        COALESCE((SELECT SUM(mt.labor_cost + mt.inspection_fee) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as period_labor_and_inspection,
        COALESCE((SELECT SUM((mt.labor_cost + mt.inspection_fee) * (tech.commission_rate / 100.0)) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as period_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'
          AND date(tt.created_at) BETWEEN ? AND ?), 0) as period_paid_commission,
        COALESCE((SELECT SUM((mt.labor_cost + mt.inspection_fee) * (tech.commission_rate / 100.0)) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')), 0) as total_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'), 0) as total_paid_commission
       FROM technicians tech
       ORDER BY tech.id ASC`
    )
    .all(from, to, from, to, from, to, from, to) as Array<
    Omit<TechnicianStatementItem, 'remaining_balance'>
  >

  const statementsWithBalance: TechnicianStatementItem[] = technicianStatements.map((s) => ({
    ...s,
    remaining_balance: Math.max(
      0,
      Math.round((s.total_earned_commission || 0) - (s.total_paid_commission || 0))
    )
  }))

  // 5. Top Appliances & Brands
  const topAppliances = db
    .prepare(
      `SELECT appliance_type, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
       FROM maintenance_tickets
       WHERE date(created_at) BETWEEN ? AND ?
       GROUP BY appliance_type
       ORDER BY count DESC LIMIT 10`
    )
    .all(from, to) as Array<{ appliance_type: string; count: number; revenue: number }>

  const topBrands = db
    .prepare(
      `SELECT brand, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
       FROM maintenance_tickets
       WHERE date(created_at) BETWEEN ? AND ?
       GROUP BY brand
       ORDER BY count DESC LIMIT 10`
    )
    .all(from, to) as Array<{ brand: string; count: number; revenue: number }>

  const transactions = db
    .prepare(
      `SELECT tt.*, mt.ticket_number, tech.name as technician_name
       FROM treasury_transactions tt
       LEFT JOIN maintenance_tickets mt ON mt.id = tt.ticket_id
       LEFT JOIN technicians tech ON tech.id = tt.technician_id
       WHERE date(tt.created_at) BETWEEN ? AND ?
       ORDER BY tt.id DESC`
    )
    .all(from, to) as TreasuryTransaction[]

  return {
    dateFrom: from,
    dateTo: to,
    summary: {
      totalIncome,
      totalExpense,
      totalTechCommissions,
      totalPartsRevenue: ticketAgg.totalPartsRevenue,
      totalPartsCost: ticketAgg.totalPartsCost,
      totalPartsProfit,
      totalInspectionAndLabor: ticketAgg.totalInspectionAndLabor,
      netProfit,
      ticketsCount: ticketAgg.ticketsCount,
      completedTicketsCount: ticketAgg.completedTicketsCount,
      totalReceivables
    },
    balancesByMethod,
    periodBalancesByMethod,
    technicianStatements: statementsWithBalance,
    customerReceivables,
    topAppliances,
    topBrands,
    transactions
  }
}

// ==========================================
// 7. DASHBOARD & SETTINGS & BACKUP
// ==========================================

export function getDashboardStats(): DashboardStats {
  const today = new Date().toISOString().slice(0, 10)
  const monthPrefix = today.slice(0, 7) // YYYY-MM

  const totalTicketsToday = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE date(created_at) = ?`)
      .get(today) as { cnt: number }
  ).cnt

  const openTicketsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status NOT IN ('delivered', 'cancelled')`
      )
      .get() as { cnt: number }
  ).cnt

  const homeVisitsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE service_type = 'home_visit' AND status NOT IN ('delivered', 'cancelled')`
      )
      .get() as { cnt: number }
  ).cnt

  const workshopCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE service_type = 'workshop' AND status NOT IN ('delivered', 'cancelled')`
      )
      .get() as { cnt: number }
  ).cnt

  const repairedWaitingDeliveryCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status = 'repaired'`)
      .get() as { cnt: number }
  ).cnt

  const activeWarrantyClaimsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE (priority = 'warranty_return' OR is_under_previous_warranty = 1) AND status NOT IN ('delivered', 'cancelled')`
      )
      .get() as { cnt: number }
  ).cnt

  const lowStockPartsCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM spare_parts WHERE quantity <= min_quantity`)
      .get() as { cnt: number }
  ).cnt

  const todayIncome = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن' AND date(created_at) = ?`
      )
      .get(today) as { total: number }
  ).total

  const todayExpense = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type IN ('expense', 'tech_commission') AND category != 'تحويل بين الخزائن' AND date(created_at) = ?`
      )
      .get(today) as { total: number }
  ).total

  const monthIncome = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن' AND strftime('%Y-%m', created_at) = ?`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthExpense = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'expense' AND category != 'تحويل بين الخزائن' AND strftime('%Y-%m', created_at) = ?`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthTechCommissions = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'tech_commission' AND strftime('%Y-%m', created_at) = ?`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthPartsCost = (
    db
      .prepare(
        `SELECT COALESCE(SUM(parts_cost_total), 0) as total FROM maintenance_tickets WHERE status IN ('repaired', 'delivered') AND strftime('%Y-%m', created_at) = ?`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthNetProfit = monthIncome - monthExpense - monthTechCommissions - monthPartsCost

  const recentTickets = listTickets({}).slice(0, 8)
  const lowStockParts = db
    .prepare(`SELECT * FROM spare_parts WHERE quantity <= min_quantity ORDER BY quantity ASC LIMIT 8`)
    .all() as SparePart[]

  return {
    totalTicketsToday,
    openTicketsCount,
    homeVisitsCount,
    workshopCount,
    repairedWaitingDeliveryCount,
    activeWarrantyClaimsCount,
    lowStockPartsCount,
    todayIncome,
    todayExpense,
    monthIncome,
    monthExpense,
    monthPartsCost,
    monthTechCommissions,
    monthNetProfit,
    recentTickets,
    lowStockParts
  }
}

export function getSettings(): CenterSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const map: Record<string, string> = {}
  for (const r of rows) {
    map[r.key] = r.value
  }
  return {
    center_name: map.center_name || 'مركز صلحلي للصيانة المعتمدة',
    center_subtitle: map.center_subtitle || '',
    phone1: map.phone1 || '',
    phone2: map.phone2 || '',
    whatsapp: map.whatsapp || '',
    address: map.address || '',
    logo_base64: map.logo_base64 || '',
    default_print_format: (map.default_print_format as 'a4' | 'thermal80') || 'a4',
    default_inspection_fee: Number(map.default_inspection_fee ?? 150),
    default_warranty_months: Number(map.default_warranty_months ?? 6),
    warranty_terms: map.warranty_terms || '',
    receipt_footer: map.receipt_footer || '',
    update_url: map.update_url || 'HassanMahmoud-dev/sallehli-aljoker',
    auto_backup_enabled: Number(map.auto_backup_enabled ?? 1),
    auto_backup_dir: map.auto_backup_dir || getDefaultAutoBackupDir(),
    auto_backup_keep_count: Number(map.auto_backup_keep_count ?? 10),
    lan_enabled: Number(map.lan_enabled ?? 1),
    lan_port: Number(map.lan_port || 4545),
    auto_start_windows: Number(map.auto_start_windows ?? 0),
    last_update_check_at: map.last_update_check_at || ''
  }
}

export function saveSettings(settings: Partial<CenterSettings>): CenterSettings {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  runTransaction(() => {
    for (const [k, v] of Object.entries(settings)) {
      if (v !== undefined) {
        stmt.run(k, String(v))
      }
    }
  })
  return getSettings()
}

export function createBackupToFile(destinationPath: string): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    // Ignore if checkpoint not supported
  }
  copyFileSync(dbFilePath, destinationPath)
}

export function runAutoBackup(): { success: boolean; filePath?: string } {
  try {
    const settings = getSettings()
    if (!settings.auto_backup_enabled) {
      return { success: false }
    }
    const targetDir = settings.auto_backup_dir || getDefaultAutoBackupDir()
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupFile = join(targetDir, `Sallehli-AutoBackup-${timestamp}.sqlite`)
    createBackupToFile(backupFile)

    // Prune older auto-backups exceeding keep count
    const keepCount = Math.max(2, Number(settings.auto_backup_keep_count || 10))
    const files = readdirSync(targetDir)
      .filter((f) => f.startsWith('Sallehli-AutoBackup-') && f.endsWith('.sqlite'))
      .map((f) => {
        const full = join(targetDir, f)
        return { full, mtime: statSync(full).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)

    for (let i = keepCount; i < files.length; i++) {
      try {
        unlinkSync(files[i].full)
      } catch {
        // Ignore cleanup errors
      }
    }

    return { success: true, filePath: backupFile }
  } catch {
    return { success: false }
  }
}

export function createPreUpdateBackup(): string {
  const backupsDir = getDefaultAutoBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = join(backupsDir, `Sallehli-PreUpdate-${timestamp}.sqlite`)
  createBackupToFile(backupPath)
  return backupPath
}

export function closeDatabase(): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    // Ignore
  }
  try {
    db.close()
  } catch {
    // Ignore
  }
}

export function restoreBackupFromFile(sourcePath: string): void {
  db.close()
  copyFileSync(sourcePath, dbFilePath)
  db = createDatabaseConnection(dbFilePath)
  runMigrations()
}
