import { app, shell } from 'electron'
import { join, extname } from 'path'
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  readFileSync
} from 'fs'
import { scryptSync, createHmac, timingSafeEqual, randomBytes } from 'crypto'
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
  TechnicianStatementItem,
  BusinessType,
  BusinessState,
  LookupItem,
  CustomFieldEntity,
  CustomFieldDef,
  Product,
  ProductType,
  ProductVariant,
  ProductSerial,
  SerialStatus,
  SerialCondition,
  Supplier,
  SupplierPayment,
  SupplierStatement,
  SupplierStatementEntry,
  PurchaseInvoice,
  PurchaseItem,
  SalesInvoice,
  SalesItem,
  SalesPayment,
  InvoiceReturn,
  InvoiceReturnItem,
  ExchangeType,
  ProductExchange,
  AudiogramPoint,
  HearingTest,
  FollowupItem,
  FittingSettings,
  EarmoldOrder,
  EarmoldStatus,
  CochlearImplant,
  ImplantAccessories,
  ImplantSession,
  ImplantThresholds,
  PatientAttachment,
  PatientProfileBundle,
  AttachmentCategory
} from '../shared/types'
import {
  getBusinessProfile,
  APPLIANCES_PROFILE,
  HEARING_AIDS_PROFILE
} from '../shared/businessProfiles'
import {
  createSessionInMemory,
  getSessionFromMemory,
  removeSessionFromMemory,
  type SessionInfo
} from './session'

const requireModule = createRequire(import.meta.url)

const PASSWORD_SALT = 'sallehli_aljoker_salt_v1_2026'
const LICENSE_HMAC_SECRET = 'sallehli_aljoker_license_secret_key_v1'
const BUSINESS_HMAC_SECRET = 'sallehli_aljoker_business_secret_key_v1_2026'
const MODULES_HMAC_SECRET = 'sallehli_aljoker_modules_secret_key_v1_2026'

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

export function signBusinessType(type: string): string {
  return createHmac('sha256', BUSINESS_HMAC_SECRET).update(`biz|${type}`).digest('hex')
}

export function signLicensedModules(modules: string[]): string {
  const sorted = [...modules].filter((m) => typeof m === 'string' && m.trim()).sort().join('|')
  return createHmac('sha256', MODULES_HMAC_SECRET).update(`mods|${sorted}`).digest('hex')
}

export function getLicensedModules(): string[] {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('licensed_modules') as
      | { value: string }
      | undefined
    const sigRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('licensed_modules_sig') as
      | { value: string }
      | undefined
    if (!row || !row.value || !sigRow || !sigRow.value) return []
    const parsed = parseJsonArray(row.value)
    if (!parsed || parsed.length === 0) return []
    const expectedSig = signLicensedModules(parsed)
    if (sigRow.value !== expectedSig) {
      console.warn('Tampered licensed_modules detected in settings; ignoring extra licensed modules.')
      return []
    }
    return parsed
  } catch {
    return []
  }
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

function parseJsonObject(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>
  }
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function stringifyExtraData(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '{}'
  try {
    return JSON.stringify(raw)
  } catch {
    return '{}'
  }
}

export function roundMoney(val: unknown): number {
  const n = Number(val || 0)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
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
  // Disable foreign keys during table recreations to prevent FOREIGN KEY constraint failures on legacy DBs
  db.exec('PRAGMA foreign_keys = OFF;')
  try {
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

  // 2. Ensure new image & custom field extra_data columns across tables
  ensureColumn('spare_parts', 'image_base64', "TEXT DEFAULT ''")
  ensureColumn('technicians', 'avatar_base64', "TEXT DEFAULT ''")
  ensureColumn('customer_appliances', 'warranty_image', "TEXT DEFAULT ''")
  ensureColumn('customer_appliances', 'fault_images', "TEXT DEFAULT '[]'")
  ensureColumn('maintenance_tickets', 'warranty_image', "TEXT DEFAULT ''")
  ensureColumn('maintenance_tickets', 'fault_images', "TEXT DEFAULT '[]'")
  ensureColumn('customers', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn('customer_appliances', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn('maintenance_tickets', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")

  // 2a. Phase 4: Medical Patient Profile columns on customers
  ensureColumn('customers', 'birth_date', 'TEXT DEFAULT NULL')
  ensureColumn('customers', 'gender', "TEXT DEFAULT ''")
  ensureColumn('customers', 'occupation', "TEXT DEFAULT ''")
  ensureColumn('customers', 'referring_doctor', "TEXT DEFAULT ''")
  ensureColumn('customers', 'medical_complaint', "TEXT DEFAULT ''")
  ensureColumn('customers', 'medical_history', "TEXT DEFAULT ''")
  ensureColumn('customers', 'allergies', "TEXT DEFAULT ''")
  ensureColumn('customers', 'doctor_notes', "TEXT DEFAULT ''")

  // 2b. Upgrade inventory_movements so part_id can be NULL when product_id is used
  const invMoveMeta = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory_movements'")
    .get() as { sql?: string } | undefined

  if (invMoveMeta?.sql && invMoveMeta.sql.includes('part_id INTEGER NOT NULL')) {
    runTransaction(() => {
      db.exec(`
        CREATE TABLE inventory_movements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          part_id INTEGER DEFAULT NULL,
          product_id INTEGER DEFAULT NULL,
          variant_id INTEGER DEFAULT NULL,
          serial_no TEXT DEFAULT '',
          ref_type TEXT DEFAULT '',
          ref_id INTEGER DEFAULT NULL,
          technician_id INTEGER DEFAULT NULL,
          ticket_id INTEGER DEFAULT NULL,
          movement_type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_cost REAL NOT NULL DEFAULT 0,
          unit_price REAL NOT NULL DEFAULT 0,
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        INSERT INTO inventory_movements_new (
          id, part_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes, created_at
        )
        SELECT id, part_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes, created_at
        FROM inventory_movements;
        DROP TABLE inventory_movements;
        ALTER TABLE inventory_movements_new RENAME TO inventory_movements;
      `)
    })
  } else {
    ensureColumn('inventory_movements', 'product_id', 'INTEGER DEFAULT NULL')
    ensureColumn('inventory_movements', 'variant_id', 'INTEGER DEFAULT NULL')
    ensureColumn('inventory_movements', 'serial_no', "TEXT DEFAULT ''")
    ensureColumn('inventory_movements', 'ref_type', "TEXT DEFAULT ''")
    ensureColumn('inventory_movements', 'ref_id', 'INTEGER DEFAULT NULL')
  }

  // 2c. Ensure reference columns on treasury_transactions for sales, purchases, suppliers & customers
  ensureColumn('treasury_transactions', 'sales_invoice_id', 'INTEGER DEFAULT NULL')
  ensureColumn('treasury_transactions', 'purchase_invoice_id', 'INTEGER DEFAULT NULL')
  ensureColumn('treasury_transactions', 'supplier_id', 'INTEGER DEFAULT NULL')
  ensureColumn('treasury_transactions', 'customer_id', 'INTEGER DEFAULT NULL')

  // 2d. Ensure Phase 3E maintenance_tickets columns (external repair, loaner, sales link)
  ensureColumn('maintenance_tickets', 'sales_invoice_id', 'INTEGER DEFAULT NULL')
  ensureColumn('maintenance_tickets', 'product_serial_id', 'INTEGER DEFAULT NULL')
  ensureColumn('maintenance_tickets', 'is_external_repair', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('maintenance_tickets', 'external_vendor', "TEXT DEFAULT ''")
  ensureColumn('maintenance_tickets', 'external_sent_date', 'TEXT DEFAULT NULL')
  ensureColumn('maintenance_tickets', 'external_expected_date', 'TEXT DEFAULT NULL')
  ensureColumn('maintenance_tickets', 'external_returned_date', 'TEXT DEFAULT NULL')
  ensureColumn('maintenance_tickets', 'external_cost', 'REAL NOT NULL DEFAULT 0')
  ensureColumn('maintenance_tickets', 'external_tracking_no', "TEXT DEFAULT ''")
  ensureColumn('maintenance_tickets', 'loaner_serial_id', 'INTEGER DEFAULT NULL')
  ensureColumn('maintenance_tickets', 'loaner_serial_no', "TEXT DEFAULT ''")
  ensureColumn('maintenance_tickets', 'loaner_product_name', "TEXT DEFAULT ''")
  ensureColumn('maintenance_tickets', 'loaner_handed_at', 'TEXT DEFAULT NULL')
  ensureColumn('maintenance_tickets', 'loaner_returned_at', 'TEXT DEFAULT NULL')

  // 2e. Upgrade ticket_parts so part_id can be NULL when product_id is consumed in a ticket
  const ticketPartsMeta = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ticket_parts'")
    .get() as { sql?: string } | undefined

  if (ticketPartsMeta?.sql && ticketPartsMeta.sql.includes('part_id INTEGER NOT NULL')) {
    runTransaction(() => {
      db.exec(`
        CREATE TABLE ticket_parts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER NOT NULL,
          part_id INTEGER DEFAULT NULL,
          product_id INTEGER DEFAULT NULL,
          variant_id INTEGER DEFAULT NULL,
          unit TEXT NOT NULL DEFAULT 'piece',
          pack_size INTEGER NOT NULL DEFAULT 1,
          part_name TEXT NOT NULL,
          part_code TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_cost REAL NOT NULL DEFAULT 0,
          unit_price REAL NOT NULL DEFAULT 0,
          total_price REAL NOT NULL DEFAULT 0,
          FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE
        );
        INSERT INTO ticket_parts_new (
          id, ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price
        )
        SELECT id, ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price
        FROM ticket_parts;
        DROP TABLE ticket_parts;
        ALTER TABLE ticket_parts_new RENAME TO ticket_parts;
      `)
    })
  } else {
    ensureColumn('ticket_parts', 'product_id', 'INTEGER DEFAULT NULL')
    ensureColumn('ticket_parts', 'variant_id', 'INTEGER DEFAULT NULL')
    ensureColumn('ticket_parts', 'unit', "TEXT NOT NULL DEFAULT 'piece'")
    ensureColumn('ticket_parts', 'pack_size', 'INTEGER NOT NULL DEFAULT 1')
  }

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
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON;')
    } catch {
      // Ignore if database connection is closing
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
      part_id INTEGER DEFAULT NULL,
      product_id INTEGER DEFAULT NULL,
      variant_id INTEGER DEFAULT NULL,
      unit TEXT NOT NULL DEFAULT 'piece',
      pack_size INTEGER NOT NULL DEFAULT 1,
      part_name TEXT NOT NULL,
      part_code TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER DEFAULT NULL,
      product_id INTEGER DEFAULT NULL,
      variant_id INTEGER DEFAULT NULL,
      serial_no TEXT DEFAULT '',
      ref_type TEXT DEFAULT '',
      ref_id INTEGER DEFAULT NULL,
      technician_id INTEGER DEFAULT NULL,
      ticket_id INTEGER DEFAULT NULL,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS treasury_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income', 'expense', 'tech_commission')),
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      ticket_id INTEGER DEFAULT NULL,
      technician_id INTEGER DEFAULT NULL,
      sales_invoice_id INTEGER DEFAULT NULL,
      purchase_invoice_id INTEGER DEFAULT NULL,
      supplier_id INTEGER DEFAULT NULL,
      customer_id INTEGER DEFAULT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      barcode TEXT DEFAULT '',
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('hearing_aid', 'cochlear_processor', 'cochlear_part', 'battery', 'accessory', 'earmold', 'service')),
      sub_category TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      model TEXT DEFAULT '',
      compatible_with TEXT DEFAULT '',
      track_serial INTEGER NOT NULL DEFAULT 0,
      has_variants INTEGER NOT NULL DEFAULT 0,
      unit_name TEXT NOT NULL DEFAULT 'قطعة',
      pack_name TEXT DEFAULT 'عبوة',
      pack_size INTEGER NOT NULL DEFAULT 1,
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      pack_cost_price REAL NOT NULL DEFAULT 0,
      pack_sale_price REAL NOT NULL DEFAULT 0,
      qty INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 3,
      warranty_months INTEGER NOT NULL DEFAULT 12,
      image_base64 TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      extra_data TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      variant_name TEXT NOT NULL,
      size TEXT DEFAULT '',
      color TEXT DEFAULT '',
      sku TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      cost_price REAL DEFAULT NULL,
      sale_price REAL DEFAULT NULL,
      pack_cost_price REAL DEFAULT NULL,
      pack_sale_price REAL DEFAULT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 6,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      variant_id INTEGER DEFAULT NULL,
      serial_no TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'in_stock'
        CHECK(status IN ('in_stock', 'sold', 'returned', 'defective', 'loaned', 'external_repair')),
      condition TEXT NOT NULL DEFAULT 'new'
        CHECK(condition IN ('new', 'used')),
      purchase_item_id INTEGER DEFAULT NULL,
      sale_item_id INTEGER DEFAULT NULL,
      customer_id INTEGER DEFAULT NULL,
      ear_side TEXT DEFAULT '',
      company_warranty_start TEXT DEFAULT NULL,
      company_warranty_end TEXT DEFAULT NULL,
      customer_warranty_start TEXT DEFAULT NULL,
      customer_warranty_end TEXT DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company_name TEXT DEFAULT '',
      phone TEXT NOT NULL,
      phone2 TEXT DEFAULT '',
      address TEXT DEFAULT '',
      supplier_type TEXT NOT NULL DEFAULT 'company' CHECK(supplier_type IN ('company', 'customer')),
      customer_id INTEGER DEFAULT NULL,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      purchase_invoice_id INTEGER DEFAULT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      treasury_tx_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      purchase_type TEXT NOT NULL DEFAULT 'supplier' CHECK(purchase_type IN ('supplier', 'used_from_customer')),
      supplier_id INTEGER DEFAULT NULL,
      customer_id INTEGER DEFAULT NULL,
      party_name TEXT NOT NULL,
      party_phone TEXT DEFAULT '',
      invoice_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      supplier_ref_no TEXT DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'partial_return', 'returned', 'cancelled')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER DEFAULT NULL,
      product_name TEXT NOT NULL,
      variant_name TEXT DEFAULT '',
      unit TEXT NOT NULL DEFAULT 'piece' CHECK(unit IN ('piece', 'pack')),
      pack_size INTEGER NOT NULL DEFAULT 1,
      quantity INTEGER NOT NULL DEFAULT 1,
      added_pieces_qty INTEGER NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      condition TEXT NOT NULL DEFAULT 'new' CHECK(condition IN ('new', 'used')),
      serials_json TEXT NOT NULL DEFAULT '[]',
      company_warranty_end TEXT DEFAULT NULL,
      returned_qty INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_type TEXT NOT NULL DEFAULT 'regular' CHECK(invoice_type IN ('regular', 'quick_pos', 'exchange')),
      customer_id INTEGER DEFAULT NULL,
      customer_name TEXT NOT NULL DEFAULT 'عميل نقدي (بيع سريع)',
      customer_phone TEXT DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      trade_in_credit REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'partial_return', 'returned', 'cancelled')),
      parent_invoice_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      extra_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sales_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER DEFAULT NULL,
      product_name TEXT NOT NULL,
      variant_name TEXT DEFAULT '',
      item_type TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'piece' CHECK(unit IN ('piece', 'pack')),
      pack_size INTEGER NOT NULL DEFAULT 1,
      quantity INTEGER NOT NULL DEFAULT 1,
      deducted_pieces_qty INTEGER NOT NULL DEFAULT 1,
      serial_id INTEGER DEFAULT NULL,
      serial_no TEXT DEFAULT '',
      condition TEXT DEFAULT 'new',
      ear_side TEXT DEFAULT '',
      unit_cost REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      warranty_months INTEGER NOT NULL DEFAULT 0,
      warranty_start TEXT DEFAULT NULL,
      warranty_end TEXT DEFAULT NULL,
      returned_qty INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS sales_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      customer_id INTEGER DEFAULT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      payment_type TEXT NOT NULL DEFAULT 'initial' CHECK(payment_type IN ('initial', 'installment', 'refund', 'exchange_diff')),
      treasury_tx_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoice_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT NOT NULL UNIQUE,
      return_type TEXT NOT NULL CHECK(return_type IN ('sales_return', 'purchase_return')),
      invoice_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL,
      party_id INTEGER DEFAULT NULL,
      party_name TEXT NOT NULL,
      total_return_amount REAL NOT NULL DEFAULT 0,
      cash_refunded REAL NOT NULL DEFAULT 0,
      balance_adjusted REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS invoice_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      invoice_item_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER DEFAULT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      pieces_qty INTEGER NOT NULL,
      serial_id INTEGER DEFAULT NULL,
      serial_no TEXT DEFAULT '',
      return_condition TEXT NOT NULL DEFAULT 'in_stock' CHECK(return_condition IN ('in_stock', 'defective', 'returned')),
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (return_id) REFERENCES invoice_returns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_exchanges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exchange_number TEXT NOT NULL UNIQUE,
      exchange_type TEXT NOT NULL CHECK(exchange_type IN ('normal_exchange', 'trade_in', 'warranty_exchange')),
      original_invoice_id INTEGER DEFAULT NULL,
      new_invoice_id INTEGER DEFAULT NULL,
      customer_id INTEGER DEFAULT NULL,
      customer_name TEXT NOT NULL,
      returned_product_id INTEGER DEFAULT NULL,
      returned_product_name TEXT DEFAULT '',
      returned_serial_no TEXT DEFAULT '',
      returned_condition TEXT NOT NULL DEFAULT 'in_stock' CHECK(returned_condition IN ('in_stock', 'used', 'defective')),
      returned_value REAL NOT NULL DEFAULT 0,
      new_product_id INTEGER NOT NULL,
      new_product_name TEXT DEFAULT '',
      new_serial_no TEXT DEFAULT '',
      new_value REAL NOT NULL DEFAULT 0,
      price_difference REAL NOT NULL DEFAULT 0,
      paid_difference REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      transferred_warranty_end TEXT DEFAULT NULL,
      external_repair_ticket_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lookup_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      business_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(category, value, business_type)
    );

    CREATE TABLE IF NOT EXISTS business_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT NULL,
      from_type TEXT NOT NULL,
      to_type TEXT NOT NULL,
      had_data INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS custom_field_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_type TEXT NOT NULL,
      entity TEXT NOT NULL CHECK(entity IN ('customer', 'device', 'ticket')),
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text', 'number', 'date', 'select', 'boolean', 'textarea')),
      options TEXT NOT NULL DEFAULT '[]',
      required INTEGER NOT NULL DEFAULT 0,
      show_in_table INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(business_type, entity, key)
    );

    -- Phase 4: Patient Attachments, Hearing Tests, Audiogram Points, Follow-ups, Earmolds & Implants
    CREATE TABLE IF NOT EXISTS patient_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'patient'
        CHECK(entity_type IN ('patient', 'hearing_test', 'implant_session', 'earmold', 'followup')),
      entity_id INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general'
        CHECK(category IN ('external_report', 'audiogram_scan', 'mapping_file', 'prescription', 'id_card', 'general')),
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hearing_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_number TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL,
      test_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      examiner_id INTEGER DEFAULT NULL,
      examiner_name TEXT DEFAULT '',
      test_type TEXT NOT NULL DEFAULT 'pure_tone'
        CHECK(test_type IN ('pure_tone', 'speech', 'tympanometry', 'comprehensive', 'aided', 'free_field')),
      srt_right REAL DEFAULT NULL,
      srt_left REAL DEFAULT NULL,
      sds_right REAL DEFAULT NULL,
      sds_left REAL DEFAULT NULL,
      mcl_right REAL DEFAULT NULL,
      mcl_left REAL DEFAULT NULL,
      ucl_right REAL DEFAULT NULL,
      ucl_left REAL DEFAULT NULL,
      tymp_right TEXT DEFAULT '',
      tymp_left TEXT DEFAULT '',
      pta_right REAL DEFAULT NULL,
      pta_left REAL DEFAULT NULL,
      loss_type_right TEXT DEFAULT '',
      loss_type_left TEXT DEFAULT '',
      loss_degree_right TEXT DEFAULT '',
      loss_degree_left TEXT DEFAULT '',
      recommended_product_id INTEGER DEFAULT NULL,
      recommended_product_name TEXT DEFAULT '',
      recommendation_notes TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (examiner_id) REFERENCES technicians(id) ON DELETE SET NULL,
      FOREIGN KEY (recommended_product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audiogram_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      ear TEXT NOT NULL CHECK(ear IN ('right', 'left')),
      conduction TEXT NOT NULL CHECK(conduction IN ('air', 'bone')),
      frequency INTEGER NOT NULL CHECK(frequency IN (250, 500, 1000, 2000, 4000, 8000)),
      db_value REAL NOT NULL CHECK(db_value >= -10 AND db_value <= 120),
      is_masked INTEGER NOT NULL DEFAULT 0,
      no_response INTEGER NOT NULL DEFAULT 0,
      UNIQUE(test_id, ear, conduction, frequency),
      FOREIGN KEY (test_id) REFERENCES hearing_tests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      device_id INTEGER DEFAULT NULL,
      serial_no TEXT DEFAULT '',
      implant_id INTEGER DEFAULT NULL,
      type TEXT NOT NULL DEFAULT 'fitting'
        CHECK(type IN ('fitting', 'cleaning', 'battery_mold', 'periodic_check', 'rehab', 'mapping')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'completed', 'cancelled')),
      due_date TEXT NOT NULL,
      done_date TEXT DEFAULT NULL,
      technician_id INTEGER DEFAULT NULL,
      fitting_settings_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES customer_appliances(id) ON DELETE SET NULL,
      FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS earmold_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL,
      device_id INTEGER DEFAULT NULL,
      sales_invoice_id INTEGER DEFAULT NULL,
      ear TEXT NOT NULL DEFAULT 'right' CHECK(ear IN ('right', 'left', 'bilateral')),
      mold_type TEXT NOT NULL DEFAULT '',
      material TEXT NOT NULL DEFAULT '',
      color TEXT DEFAULT 'شفاف',
      vent_size TEXT DEFAULT 'بدون تهوية (No Vent)',
      tube_type TEXT DEFAULT 'عادي (Standard #13)',
      impression_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      lab_name TEXT NOT NULL DEFAULT '',
      sent_date TEXT DEFAULT NULL,
      expected_date TEXT DEFAULT NULL,
      received_date TEXT DEFAULT NULL,
      delivered_date TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'impression_taken'
        CHECK(status IN ('impression_taken', 'sent_to_lab', 'received', 'delivered', 'remake')),
      lab_cost REAL NOT NULL DEFAULT 0,
      customer_price REAL NOT NULL DEFAULT 0,
      is_lab_cost_paid INTEGER NOT NULL DEFAULT 0,
      remake_of_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES customer_appliances(id) ON DELETE SET NULL,
      FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (remake_of_id) REFERENCES earmold_orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS implants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      ear TEXT NOT NULL CHECK(ear IN ('right', 'left')),
      brand TEXT NOT NULL,
      internal_model TEXT NOT NULL DEFAULT '',
      internal_serial TEXT NOT NULL DEFAULT '',
      surgery_date TEXT DEFAULT NULL,
      hospital TEXT DEFAULT '',
      surgeon TEXT DEFAULT '',
      activation_date TEXT DEFAULT NULL,
      processor_device_id INTEGER DEFAULT NULL,
      processor_serial_id INTEGER DEFAULT NULL,
      processor_model TEXT DEFAULT '',
      processor_serial_no TEXT DEFAULT '',
      processor_warranty_end TEXT DEFAULT NULL,
      accessories_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (processor_device_id) REFERENCES customer_appliances(id) ON DELETE SET NULL,
      FOREIGN KEY (processor_serial_id) REFERENCES product_serials(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS implant_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      implant_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      session_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      session_type TEXT NOT NULL DEFAULT 'mapping'
        CHECK(session_type IN ('switch_on', 'mapping', 'rehab', 'periodic_check', 'troubleshooting')),
      technician_id INTEGER DEFAULT NULL,
      examiner_name TEXT DEFAULT '',
      program_notes TEXT DEFAULT '',
      thresholds_json TEXT NOT NULL DEFAULT '{}',
      map_attachment_id INTEGER DEFAULT NULL,
      next_due_date TEXT DEFAULT NULL,
      followup_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (implant_id) REFERENCES implants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL,
      FOREIGN KEY (map_attachment_id) REFERENCES patient_attachments(id) ON DELETE SET NULL
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
    center_name: APPLIANCES_PROFILE.centerNameDefault,
    center_subtitle: APPLIANCES_PROFILE.centerSubtitleDefault,
    phone1: '01012345678',
    phone2: '01112345678',
    whatsapp: '201012345678',
    address: 'القاهرة - شارع التحرير الرئيسي - بجوار محطة المترو',
    logo_base64: '',
    default_print_format: 'a4',
    default_inspection_fee: 150,
    default_warranty_months: 6,
    warranty_terms:
      '1. يشمل الضمان القطع المستبدلة والعطل الذي تم إصلاحه فقط خلال فترة الضمان المحددة.\n2. لا يشمل الضمان الأعطال الناتجة عن سوء الاستخدام أو الكسر.\n3. يرجى الاحتفاظ بهذه الفاتورة لتقديمها عند طلب الصيانة بالضمان.',
    receipt_footer: APPLIANCES_PROFILE.receiptFooterDefault,
    update_url: 'HassanMahmoud-dev/sallehli-aljoker',
    auto_backup_enabled: 1,
    auto_backup_dir: getDefaultAutoBackupDir(),
    auto_backup_keep_count: 10
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, String(v ?? ''))
  }

  // 3. Seed default lookup items per business profile & category if that category is empty
  const countCategoryStmt = db.prepare(
    'SELECT COUNT(*) as cnt FROM lookup_items WHERE business_type = ? AND category = ?'
  )
  const insertLookup = db.prepare(
    'INSERT OR IGNORE INTO lookup_items (category, value, sort_order, is_active, business_type) VALUES (?, ?, ?, 1, ?)'
  )

  const seedCategoryIfEmpty = (businessType: BusinessType, category: string, values: string[]): void => {
    const cnt = (countCategoryStmt.get(businessType, category) as { cnt: number }).cnt
    if (cnt === 0) {
      values.forEach((val, idx) => {
        insertLookup.run(category, val, idx, businessType)
      })
    }
  }

  for (const profile of [APPLIANCES_PROFILE, HEARING_AIDS_PROFILE]) {
    seedCategoryIfEmpty(profile.id, 'device_type', profile.defaultDeviceTypes)
    seedCategoryIfEmpty(profile.id, 'brand', profile.defaultBrands)
    seedCategoryIfEmpty(profile.id, 'part_category', profile.defaultPartCategories)
    if (profile.extraLookups) {
      for (const [cat, items] of Object.entries(profile.extraLookups)) {
        if (items && items.length > 0) {
          seedCategoryIfEmpty(profile.id, cat, items)
        }
      }
    }
  }

  // 4. Seed default custom field definitions per business profile
  const countCustomFieldsStmt = db.prepare(
    'SELECT COUNT(*) as cnt FROM custom_field_defs WHERE business_type = ?'
  )
  const insertCustomFieldStmt = db.prepare(
    `INSERT OR IGNORE INTO custom_field_defs (
      business_type, entity, key, label, type, options, required, show_in_table, sort_order, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  )

  for (const profile of [APPLIANCES_PROFILE, HEARING_AIDS_PROFILE]) {
    if (profile.defaultCustomFields && profile.defaultCustomFields.length > 0) {
      const cnt = (countCustomFieldsStmt.get(profile.id) as { cnt: number }).cnt
      if (cnt === 0) {
        profile.defaultCustomFields.forEach((f, idx) => {
          insertCustomFieldStmt.run(
            profile.id,
            f.entity,
            f.key,
            f.label,
            f.type,
            JSON.stringify(f.options || []),
            f.required ? 1 : 0,
            f.show_in_table ? 1 : 0,
            f.sort_order ?? idx + 1
          )
        })
      }
    }
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

  const bState = getBusinessState()
  if (bState.needsSetup && userRow.role !== 'super_admin') {
    return {
      success: false,
      message:
        'لم يتم استكمال الإعداد الأولي لنشاط البرنامج بعد. يرجى الدخول بحساب السوبر أدمن أولاً لتحديد نوع النشاط.'
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
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(
    'INSERT OR REPLACE INTO user_sessions (token, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(token, userRow.id, userRow.role, now.toISOString(), expiresAt)

  createSessionInMemory(safeUser, token)

  return {
    success: true,
    user: safeUser,
    token,
    subscriptionStatus: { isExpired, daysRemaining }
  }
}

export function verifySession(identifier: string | number): AuthResponse {
  if (!identifier) {
    return { success: false, message: 'جلسة غير صالحة' }
  }

  let userId: number | null = null
  let sessionToken: string | null = null

  if (typeof identifier === 'string') {
    const sessionRow = db
      .prepare('SELECT user_id, role, expires_at FROM user_sessions WHERE token = ?')
      .get(identifier) as { user_id: number; role: string; expires_at: string } | undefined

    if (sessionRow) {
      if (new Date(sessionRow.expires_at).getTime() < Date.now()) {
        db.prepare('DELETE FROM user_sessions WHERE token = ?').run(identifier)
        removeSessionFromMemory(identifier)
        return { success: false, message: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' }
      }
      userId = sessionRow.user_id
      sessionToken = identifier
    } else {
      const parsed = Number(identifier)
      if (!isNaN(parsed) && parsed > 0) {
        userId = parsed
      }
    }
  } else if (typeof identifier === 'number') {
    userId = identifier
  }

  if (!userId) {
    return { success: false, message: 'جلسة غير صالحة أو غير مسجلة' }
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

  const bState = getBusinessState()
  if (bState.needsSetup && userRow.role !== 'super_admin') {
    return {
      success: false,
      message:
        'لم يتم استكمال الإعداد الأولي لنشاط البرنامج بعد. يرجى الدخول بحساب السوبر أدمن أولاً لتحديد نوع النشاط.'
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

  if (!sessionToken) {
    sessionToken = randomBytes(32).toString('hex')
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare(
      'INSERT OR REPLACE INTO user_sessions (token, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(sessionToken, userRow.id, userRow.role, now.toISOString(), expiresAt)
  }

  createSessionInMemory(safeUser, sessionToken)

  return {
    success: true,
    user: safeUser,
    token: sessionToken,
    subscriptionStatus: { isExpired, daysRemaining }
  }
}

export function resolveSession(token?: string | null): SessionInfo | null {
  if (!token) return null
  const cached = getSessionFromMemory(token)
  if (cached) return cached

  const row = db
    .prepare('SELECT user_id, role, expires_at FROM user_sessions WHERE token = ?')
    .get(token) as { user_id: number; role: string; expires_at: string } | undefined

  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
    return null
  }

  const user = db
    .prepare('SELECT id, username, full_name, phone, role, is_active FROM users WHERE id = ?')
    .get(row.user_id) as User | undefined

  if (!user || !user.is_active) return null

  createSessionInMemory(user, token)
  return getSessionFromMemory(token)
}

export function logoutUser(token?: string | null): void {
  if (!token) return
  try {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
  } catch {
    // Ignore
  }
  removeSessionFromMemory(token)
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

function normalizeCustomerRow(row: Record<string, unknown>): Customer {
  return {
    ...(row as unknown as Customer),
    extra_data: parseJsonObject(row.extra_data)
  }
}

function normalizeApplianceRow(row: Record<string, unknown>): CustomerAppliance {
  return {
    ...(row as unknown as CustomerAppliance),
    warranty_image: String(row.warranty_image || ''),
    fault_images: parseJsonArray(row.fault_images),
    extra_data: parseJsonObject(row.extra_data)
  }
}

function normalizeTicketRow(row: Record<string, unknown>): MaintenanceTicket {
  return {
    ...(row as unknown as MaintenanceTicket),
    warranty_image: String(row.warranty_image || ''),
    fault_images: parseJsonArray(row.fault_images),
    extra_data: parseJsonObject(row.extra_data)
  }
}

export function listCustomers(search = ''): Customer[] {
  const q = `%${search.trim()}%`
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM maintenance_tickets t WHERE t.customer_id = c.id) as tickets_count,
        (SELECT COUNT(*) FROM hearing_tests ht WHERE ht.patient_id = c.id) as hearing_tests_count
       FROM customers c
       WHERE c.name LIKE ? OR c.phone LIKE ? OR c.phone2 LIKE ? OR c.area LIKE ? OR c.extra_data LIKE ?
          OR EXISTS (
            SELECT 1 FROM customer_appliances ca
            WHERE ca.customer_id = c.id AND (ca.serial_number LIKE ? OR ca.extra_data LIKE ?)
          )
       ORDER BY c.id DESC`
    )
    .all(q, q, q, q, q, q, q) as Record<string, unknown>[]
  return rows.map(normalizeCustomerRow)
}

export function findCustomerByPhone(phone: string): {
  customer: Customer | null
  appliances: CustomerAppliance[]
  previousTickets: MaintenanceTicket[]
} {
  const clean = phone.trim()
  if (!clean) return { customer: null, appliances: [], previousTickets: [] }
  const rawCustomer = db
    .prepare('SELECT * FROM customers WHERE phone = ? OR phone2 = ? LIMIT 1')
    .get(clean, clean) as Record<string, unknown> | undefined

  if (!rawCustomer) return { customer: null, appliances: [], previousTickets: [] }
  const customer = normalizeCustomerRow(rawCustomer)

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
  const extraDataJson = stringifyExtraData(data.extra_data)
  if (data.id) {
    db.prepare(
      `UPDATE customers
       SET name = ?, phone = ?, phone2 = ?, area = ?, address = ?, notes = ?,
           birth_date = ?, gender = ?, occupation = ?, referring_doctor = ?,
           medical_complaint = ?, medical_history = ?, allergies = ?, doctor_notes = ?,
           extra_data = ?
       WHERE id = ?`
    ).run(
      data.name?.trim(),
      data.phone?.trim(),
      data.phone2?.trim() || '',
      data.area?.trim() || '',
      data.address?.trim() || '',
      data.notes?.trim() || '',
      data.birth_date || null,
      data.gender?.trim() || '',
      data.occupation?.trim() || '',
      data.referring_doctor?.trim() || '',
      data.medical_complaint?.trim() || '',
      data.medical_history?.trim() || '',
      data.allergies?.trim() || '',
      data.doctor_notes?.trim() || '',
      extraDataJson,
      data.id
    )
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(data.id) as Record<
      string,
      unknown
    >
    return normalizeCustomerRow(row)
  } else {
    const info = db
      .prepare(
        `INSERT INTO customers (
          name, phone, phone2, area, address, notes,
          birth_date, gender, occupation, referring_doctor,
          medical_complaint, medical_history, allergies, doctor_notes, extra_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name?.trim(),
        data.phone?.trim(),
        data.phone2?.trim() || '',
        data.area?.trim() || '',
        data.address?.trim() || '',
        data.notes?.trim() || '',
        data.birth_date || null,
        data.gender?.trim() || '',
        data.occupation?.trim() || '',
        data.referring_doctor?.trim() || '',
        data.medical_complaint?.trim() || '',
        data.medical_history?.trim() || '',
        data.allergies?.trim() || '',
        data.doctor_notes?.trim() || '',
        extraDataJson
      )
    const row = db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>
    return normalizeCustomerRow(row)
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
  const extraDataJson = stringifyExtraData(data.extra_data)

  if (data.id) {
    db.prepare(
      `UPDATE customer_appliances
       SET appliance_type = ?, brand = ?, model = ?, serial_number = ?, notes = ?,
           last_warranty_end = ?, last_ticket_number = ?, warranty_image = ?, fault_images = ?, extra_data = ?
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
      extraDataJson,
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
          last_warranty_end, last_ticket_number, warranty_image, fault_images, extra_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        faultImagesJson,
        extraDataJson
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
      `SELECT im.*,
              COALESCE(
                sp.name,
                CASE WHEN pv.variant_name IS NOT NULL AND pv.variant_name != ''
                     THEN p.name || ' (' || pv.variant_name || ')'
                     ELSE p.name END
              ) as part_name,
              COALESCE(sp.code, p.code) as part_code,
              t.name as technician_name, mt.ticket_number
       FROM inventory_movements im
       LEFT JOIN spare_parts sp ON sp.id = im.part_id
       LEFT JOIN products p ON p.id = im.product_id
       LEFT JOIN product_variants pv ON pv.id = im.variant_id
       LEFT JOIN technicians t ON t.id = im.technician_id
       LEFT JOIN maintenance_tickets mt ON mt.id = im.ticket_id
       ORDER BY im.id DESC LIMIT 200`
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
      mt.serial_number LIKE ? OR
      mt.extra_data LIKE ?
    )
  `
  const params: unknown[] = [q, q, q, q, q, q, q]

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
    const extraDataJson = stringifyExtraData(data.extra_data)

    let ticketId = data.id
    let ticketNumber = data.ticket_number || ''
    let previousPaid = 0
    let previousExternalCost = 0
    let previousLoanerSerialId: number | null = null
    let previousProductSerialId: number | null = null

    const salesInvoiceId = data.sales_invoice_id ? Number(data.sales_invoice_id) : null
    const productSerialId = data.product_serial_id ? Number(data.product_serial_id) : null
    const isExternalRepair =
      data.is_external_repair ||
      data.status === 'sent_to_lab' ||
      data.status === 'returned_from_lab'
        ? 1
        : 0
    const externalVendor = data.external_vendor?.trim() || ''
    const externalSentDate =
      data.external_sent_date ||
      (data.status === 'sent_to_lab' ? new Date().toISOString().slice(0, 10) : null)
    const externalExpectedDate = data.external_expected_date || null
    const externalReturnedDate =
      data.external_returned_date ||
      (data.status === 'returned_from_lab' ? new Date().toISOString().slice(0, 10) : null)
    const externalCost = roundMoney(data.external_cost ?? 0)
    const externalTrackingNo = data.external_tracking_no?.trim() || ''

    const loanerSerialId = data.loaner_serial_id ? Number(data.loaner_serial_id) : null
    let loanerSerialNo = data.loaner_serial_no?.trim() || ''
    let loanerProductName = data.loaner_product_name?.trim() || ''
    if (loanerSerialId && (!loanerSerialNo || !loanerProductName)) {
      const lRow = db
        .prepare(
          `SELECT ps.serial_no, p.name as product_name
           FROM product_serials ps
           JOIN products p ON p.id = ps.product_id
           WHERE ps.id = ?`
        )
        .get(loanerSerialId) as { serial_no: string; product_name: string } | undefined
      if (lRow) {
        loanerSerialNo = lRow.serial_no
        loanerProductName = lRow.product_name
      }
    }
    const loanerHandedAt =
      data.loaner_handed_at ||
      (loanerSerialId ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null)
    const loanerReturnedAt = data.loaner_returned_at || null

    if (ticketId) {
      const oldTicket = db
        .prepare(
          'SELECT paid_amount, ticket_number, external_cost, loaner_serial_id, product_serial_id FROM maintenance_tickets WHERE id = ?'
        )
        .get(ticketId) as
        | {
            paid_amount: number
            ticket_number: string
            external_cost?: number
            loaner_serial_id?: number | null
            product_serial_id?: number | null
          }
        | undefined
      previousPaid = oldTicket?.paid_amount ?? 0
      previousExternalCost = Number(oldTicket?.external_cost ?? 0)
      previousLoanerSerialId = oldTicket?.loaner_serial_id ? Number(oldTicket.loaner_serial_id) : null
      previousProductSerialId = oldTicket?.product_serial_id ? Number(oldTicket.product_serial_id) : null
      ticketNumber = oldTicket?.ticket_number || ticketNumber

      // Restore old ticket parts to stock before applying updated parts
      const oldParts = db
        .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
        .all(ticketId) as TicketPartItem[]
      for (const op of oldParts) {
        if (op.product_id) {
          const packSz = Math.max(1, Number(op.pack_size || 1))
          const pieces = op.unit === 'pack' ? Number(op.quantity || 1) * packSz : Number(op.quantity || 1)
          if (op.variant_id) {
            db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
              pieces,
              op.variant_id
            )
            syncProductQtyFromChildren(op.product_id)
          } else {
            db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(pieces, op.product_id)
          }
        } else if (op.part_id) {
          db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(
            op.quantity,
            op.part_id
          )
        }
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
          warranty_image = ?, fault_images = ?, extra_data = ?, notes = ?,
          sales_invoice_id = ?, product_serial_id = ?, is_external_repair = ?,
          external_vendor = ?, external_sent_date = ?, external_expected_date = ?,
          external_returned_date = ?, external_cost = ?, external_tracking_no = ?,
          loaner_serial_id = ?, loaner_serial_no = ?, loaner_product_name = ?,
          loaner_handed_at = ?, loaner_returned_at = ?,
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
        extraDataJson,
        data.notes?.trim() || '',
        salesInvoiceId,
        productSerialId,
        isExternalRepair,
        externalVendor,
        externalSentDate,
        externalExpectedDate,
        externalReturnedDate,
        externalCost,
        externalTrackingNo,
        loanerSerialId,
        loanerSerialNo,
        loanerProductName,
        loanerHandedAt,
        loanerReturnedAt,
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
            warranty_image, fault_images, extra_data, notes,
            sales_invoice_id, product_serial_id, is_external_repair,
            external_vendor, external_sent_date, external_expected_date,
            external_returned_date, external_cost, external_tracking_no,
            loaner_serial_id, loaner_serial_no, loaner_product_name,
            loaner_handed_at, loaner_returned_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          extraDataJson,
          data.notes?.trim() || '',
          salesInvoiceId,
          productSerialId,
          isExternalRepair,
          externalVendor,
          externalSentDate,
          externalExpectedDate,
          externalReturnedDate,
          externalCost,
          externalTrackingNo,
          loanerSerialId,
          loanerSerialNo,
          loanerProductName,
          loanerHandedAt,
          loanerReturnedAt
        )
      ticketId = Number(info.lastInsertRowid)
    }

    // 4. Deduct new parts / products from stock & insert into ticket_parts
    for (const p of parts) {
      if (p.product_id) {
        const prodRow = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(p.product_id) as Record<string, unknown> | undefined
        if (!prodRow) continue
        const prod = normalizeProductRow(prodRow)
        const qty = Math.max(1, Number(p.quantity || 1))
        const unit = p.unit === 'pack' ? 'pack' : 'piece'
        const packSz = Math.max(1, Number(p.pack_size || prod.pack_size || 1))
        const deductPieces = unit === 'pack' ? qty * packSz : qty

        if (prod.type !== 'service') {
          if (p.variant_id) {
            const vRow = db
              .prepare('SELECT * FROM product_variants WHERE id = ?')
              .get(p.variant_id) as ProductVariant | undefined
            if (!vRow) throw new Error('المقاس / المتغير غير موجود')
            if (vRow.qty < deductPieces) {
              throw new Error(
                `الكمية المتاحة من (${prod.name} - ${vRow.variant_name}) هي ${vRow.qty} فقط ولا تكفي لصرف ${deductPieces}`
              )
            }
            db.prepare('UPDATE product_variants SET qty = qty - ? WHERE id = ?').run(
              deductPieces,
              vRow.id
            )
            syncProductQtyFromChildren(prod.id)
          } else {
            if (prod.qty < deductPieces) {
              throw new Error(
                `الكمية المتاحة من الصنف (${prod.name}) هي ${prod.qty} فقط ولا تكفي لصرف ${deductPieces}`
              )
            }
            db.prepare('UPDATE products SET qty = qty - ? WHERE id = ?').run(deductPieces, prod.id)
          }
        }

        const uPrice = roundMoney(
          p.unit_price ?? (unit === 'pack' ? prod.pack_sale_price || prod.sale_price * packSz : prod.sale_price)
        )
        const uCost = roundMoney(
          p.unit_cost ?? (unit === 'pack' ? prod.pack_cost_price || prod.cost_price * packSz : prod.cost_price)
        )

        db.prepare(
          `INSERT INTO ticket_parts (
            ticket_id, part_id, product_id, variant_id, unit, pack_size,
            part_name, part_code, quantity, unit_cost, unit_price, total_price
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          ticketId,
          prod.id,
          p.variant_id || null,
          unit,
          packSz,
          p.part_name || prod.name,
          p.part_code || prod.code,
          qty,
          uCost,
          uPrice,
          roundMoney(qty * uPrice)
        )
      } else if (p.part_id) {
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
    }

    // 4b. Manage Loaner Serial & Repair Serial Statuses (Phase 3E)
    if (previousLoanerSerialId && previousLoanerSerialId !== loanerSerialId) {
      const oldL = db
        .prepare('SELECT product_id FROM product_serials WHERE id = ?')
        .get(previousLoanerSerialId) as { product_id: number } | undefined
      db.prepare("UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?").run(
        previousLoanerSerialId
      )
      if (oldL) syncProductQtyFromChildren(oldL.product_id)
    }

    if (loanerSerialId) {
      const newL = db
        .prepare('SELECT product_id FROM product_serials WHERE id = ?')
        .get(loanerSerialId) as { product_id: number } | undefined
      if (loanerReturnedAt) {
        db.prepare("UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?").run(
          loanerSerialId
        )
      } else {
        db.prepare("UPDATE product_serials SET status = 'loaned', customer_id = ? WHERE id = ?").run(
          customerId,
          loanerSerialId
        )
      }
      if (newL) syncProductQtyFromChildren(newL.product_id)
    }

    const activeSerialId = productSerialId || previousProductSerialId
    if (activeSerialId) {
      if (data.status === 'sent_to_lab') {
        db.prepare("UPDATE product_serials SET status = 'external_repair' WHERE id = ?").run(
          activeSerialId
        )
      } else if (
        data.status === 'returned_from_lab' ||
        data.status === 'repaired' ||
        data.status === 'delivered'
      ) {
        const sr = db
          .prepare('SELECT sale_item_id, product_id FROM product_serials WHERE id = ?')
          .get(activeSerialId) as { sale_item_id: number | null; product_id: number } | undefined
        if (sr) {
          db.prepare('UPDATE product_serials SET status = ? WHERE id = ?').run(
            sr.sale_item_id ? 'sold' : 'in_stock',
            activeSerialId
          )
          syncProductQtyFromChildren(sr.product_id)
        }
      }
    }

    // Record external repair cost delta in treasury if increased
    const externalCostDelta = roundMoney(externalCost - previousExternalCost)
    if (externalCostDelta > 0 && data.recordPaymentInTreasury !== false) {
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description)
         VALUES ('expense', 'تكلفة صيانة خارجية', ?, ?, ?, ?)`
      ).run(
        externalCostDelta,
        ticketId,
        data.payment_method || 'cash',
        `تكلفة صيانة خارجية (${externalVendor || 'معمل خارجي'}) لطلب ${ticketNumber} - العميل: ${data.customer_name}`
      )
    }

    // 5. Upsert Customer Appliance record for history & warranty tracking
    const existingAppliance = db
      .prepare(
        `SELECT id, warranty_image, fault_images, extra_data FROM customer_appliances
         WHERE customer_id = ? AND appliance_type = ? AND brand = ? LIMIT 1`
      )
      .get(customerId, data.appliance_type?.trim(), data.brand?.trim()) as
      | { id: number; warranty_image?: string; fault_images?: string; extra_data?: string }
      | undefined

    if (existingAppliance) {
      const mergedWarrantyImg = warrantyImg || existingAppliance.warranty_image || ''
      const mergedFaultImages =
        faultImagesJson !== '[]' ? faultImagesJson : existingAppliance.fault_images || '[]'
      const mergedExtraObj = {
        ...parseJsonObject(existingAppliance.extra_data),
        ...parseJsonObject(data.extra_data)
      }
      db.prepare(
        `UPDATE customer_appliances
         SET model = ?, serial_number = ?, last_warranty_end = COALESCE(?, last_warranty_end),
             last_ticket_number = ?, warranty_image = ?, fault_images = ?, extra_data = ?
         WHERE id = ?`
      ).run(
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        warrantyEnd,
        ticketNumber,
        mergedWarrantyImg,
        mergedFaultImages,
        stringifyExtraData(mergedExtraObj),
        existingAppliance.id
      )
    } else {
      db.prepare(
        `INSERT INTO customer_appliances (
          customer_id, appliance_type, brand, model, serial_number,
          last_warranty_end, last_ticket_number, warranty_image, fault_images, extra_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        customerId,
        data.appliance_type?.trim(),
        data.brand?.trim(),
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        warrantyEnd,
        ticketNumber,
        warrantyImg,
        faultImagesJson,
        extraDataJson
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
    const oldTicket = db
      .prepare('SELECT loaner_serial_id FROM maintenance_tickets WHERE id = ?')
      .get(id) as { loaner_serial_id?: number | null } | undefined
    if (oldTicket?.loaner_serial_id) {
      const l = db
        .prepare('SELECT product_id FROM product_serials WHERE id = ?')
        .get(oldTicket.loaner_serial_id) as { product_id: number } | undefined
      db.prepare("UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?").run(
        oldTicket.loaner_serial_id
      )
      if (l) syncProductQtyFromChildren(l.product_id)
    }

    const oldParts = db
      .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
      .all(id) as TicketPartItem[]
    for (const op of oldParts) {
      if (op.product_id) {
        const packSz = Math.max(1, Number(op.pack_size || 1))
        const pieces =
          op.unit === 'pack' ? Number(op.quantity || 1) * packSz : Number(op.quantity || 1)
        if (op.variant_id) {
          db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
            pieces,
            op.variant_id
          )
          syncProductQtyFromChildren(op.product_id)
        } else {
          db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(pieces, op.product_id)
        }
      } else if (op.part_id) {
        db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(
          op.quantity,
          op.part_id
        )
      }
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
      `SELECT tt.*, mt.ticket_number, tech.name as technician_name, s.name as supplier_name,
              si.invoice_number as sales_invoice_number, pi.invoice_number as purchase_invoice_number
       FROM treasury_transactions tt
       LEFT JOIN maintenance_tickets mt ON mt.id = tt.ticket_id
       LEFT JOIN technicians tech ON tech.id = tt.technician_id
       LEFT JOIN suppliers s ON s.id = tt.supplier_id
       LEFT JOIN sales_invoices si ON si.id = tt.sales_invoice_id
       LEFT JOIN purchase_invoices pi ON pi.id = tt.purchase_invoice_id
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
      `SELECT tt.*, mt.ticket_number, tech.name as technician_name, s.name as supplier_name,
              si.invoice_number as sales_invoice_number, pi.invoice_number as purchase_invoice_number
       FROM treasury_transactions tt
       LEFT JOIN maintenance_tickets mt ON mt.id = tt.ticket_id
       LEFT JOIN technicians tech ON tech.id = tt.technician_id
       LEFT JOIN suppliers s ON s.id = tt.supplier_id
       LEFT JOIN sales_invoices si ON si.id = tt.sales_invoice_id
       LEFT JOIN purchase_invoices pi ON pi.id = tt.purchase_invoice_id
       WHERE date(tt.created_at) BETWEEN ? AND ?
       ORDER BY tt.id DESC`
    )
    .all(from, to) as TreasuryTransaction[]

  // 6. Phase 3W: Sales, Purchases, Suppliers & Inventory Valuation metrics
  const salesAgg = db
    .prepare(
      `SELECT
        COUNT(DISTINCT si.id) as salesInvoicesCount,
        COALESCE(SUM(CASE WHEN si.status != 'cancelled' THEN (sitem.quantity - sitem.returned_qty) * sitem.unit_price - sitem.discount ELSE 0 END), 0) as totalSalesRevenue,
        COALESCE(SUM(CASE WHEN si.status != 'cancelled' THEN (sitem.quantity - sitem.returned_qty) * sitem.unit_cost ELSE 0 END), 0) as totalSalesCost
       FROM sales_invoices si
       LEFT JOIN sales_items sitem ON sitem.invoice_id = si.id
       WHERE si.status != 'cancelled' AND date(si.created_at) BETWEEN ? AND ?`
    )
    .get(from, to) as {
    salesInvoicesCount: number
    totalSalesRevenue: number
    totalSalesCost: number
  }

  const totalSalesRevenue = roundMoney(salesAgg?.totalSalesRevenue || 0)
  const totalSalesCost = roundMoney(salesAgg?.totalSalesCost || 0)
  const totalSalesProfit = roundMoney(totalSalesRevenue - totalSalesCost)

  const totalSalesReturns = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(total_return_amount), 0) as total FROM invoice_returns
           WHERE return_type = 'sales_return' AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const totalPurchasesAmount = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(total_amount), 0) as total FROM purchase_invoices
           WHERE status != 'cancelled' AND date(invoice_date) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const totalExternalRepairCost = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(external_cost), 0) as total FROM maintenance_tickets
           WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const rawSalesReceivables = db
    .prepare(
      `SELECT * FROM sales_invoices
       WHERE remaining_amount > 0 AND status != 'cancelled'
       ORDER BY remaining_amount DESC`
    )
    .all() as Record<string, unknown>[]
  const salesReceivables: SalesInvoice[] = rawSalesReceivables.map((r) => ({
    ...(r as unknown as SalesInvoice),
    subtotal: roundMoney(r.subtotal),
    discount: roundMoney(r.discount),
    trade_in_credit: roundMoney(r.trade_in_credit),
    total_amount: roundMoney(r.total_amount),
    paid_amount: roundMoney(r.paid_amount),
    remaining_amount: roundMoney(r.remaining_amount),
    extra_data: parseJsonObject(r.extra_data)
  }))
  const totalSalesReceivables = roundMoney(
    salesReceivables.reduce((sum, inv) => sum + inv.remaining_amount, 0)
  )

  const supplierBalances = listSuppliers().filter((s) => Math.abs(s.balance) > 0.009)
  const totalSuppliersBalance = roundMoney(
    supplierBalances.reduce((sum, s) => sum + (s.balance > 0 ? s.balance : 0), 0)
  )

  // Inventory valuation (products + spare_parts)
  const prodVal = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type != 'service' THEN qty * cost_price ELSE 0 END), 0) as costVal,
        COALESCE(SUM(CASE WHEN type != 'service' THEN qty * sale_price ELSE 0 END), 0) as saleVal
       FROM products WHERE is_active = 1`
    )
    .get() as { costVal: number; saleVal: number }

  const partsVal = db
    .prepare(
      `SELECT
        COALESCE(SUM(quantity * purchase_price), 0) as costVal,
        COALESCE(SUM(quantity * selling_price), 0) as saleVal
       FROM spare_parts`
    )
    .get() as { costVal: number; saleVal: number }

  const inventoryCostValue = roundMoney((prodVal?.costVal || 0) + (partsVal?.costVal || 0))
  const inventorySaleValue = roundMoney((prodVal?.saleVal || 0) + (partsVal?.saleVal || 0))

  const topProducts = db
    .prepare(
      `SELECT
        sitem.product_name,
        sitem.item_type,
        COALESCE(SUM(sitem.quantity - sitem.returned_qty), 0) as qty,
        COALESCE(SUM((sitem.quantity - sitem.returned_qty) * sitem.unit_price - sitem.discount), 0) as revenue,
        COALESCE(SUM(((sitem.quantity - sitem.returned_qty) * sitem.unit_price - sitem.discount) - ((sitem.quantity - sitem.returned_qty) * sitem.unit_cost)), 0) as profit
       FROM sales_items sitem
       JOIN sales_invoices si ON si.id = sitem.invoice_id
       WHERE si.status != 'cancelled' AND (sitem.quantity - sitem.returned_qty) > 0
         AND date(si.created_at) BETWEEN ? AND ?
       GROUP BY sitem.product_id, sitem.product_name, sitem.item_type
       ORDER BY revenue DESC LIMIT 10`
    )
    .all(from, to) as Array<{
    product_name: string
    item_type: string
    qty: number
    revenue: number
    profit: number
  }>

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
      totalReceivables,
      salesInvoicesCount: salesAgg?.salesInvoicesCount || 0,
      totalSalesRevenue,
      totalSalesCost,
      totalSalesProfit,
      totalSalesReturns,
      totalPurchasesAmount,
      totalSuppliersBalance,
      totalSalesReceivables,
      totalExternalRepairCost,
      inventoryCostValue,
      inventorySaleValue
    },
    balancesByMethod,
    periodBalancesByMethod,
    technicianStatements: statementsWithBalance,
    customerReceivables,
    salesReceivables,
    supplierBalances,
    topAppliances,
    topBrands,
    topProducts,
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

  // Phase 3W Dashboard metrics
  const todaySalesAgg = db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as rev
       FROM sales_invoices
       WHERE status != 'cancelled' AND date(created_at) = ?`
    )
    .get(today) as { cnt: number; rev: number }

  const monthSalesAgg = db
    .prepare(
      `SELECT
        COUNT(DISTINCT si.id) as cnt,
        COALESCE(SUM((sitem.quantity - sitem.returned_qty) * sitem.unit_price - sitem.discount), 0) as rev,
        COALESCE(SUM((sitem.quantity - sitem.returned_qty) * sitem.unit_cost), 0) as cost
       FROM sales_invoices si
       LEFT JOIN sales_items sitem ON sitem.invoice_id = si.id
       WHERE si.status != 'cancelled' AND strftime('%Y-%m', si.created_at) = ?`
    )
    .get(monthPrefix) as { cnt: number; rev: number; cost: number }

  const lowStockProductsRaw = db
    .prepare(
      `SELECT * FROM products
       WHERE is_active = 1 AND type != 'service' AND qty <= min_stock
       ORDER BY qty ASC LIMIT 8`
    )
    .all() as Record<string, unknown>[]
  const lowStockProducts = lowStockProductsRaw.map(normalizeProductRow)
  const lowStockProductsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM products WHERE is_active = 1 AND type != 'service' AND qty <= min_stock`
      )
      .get() as { cnt: number }
  ).cnt

  const externalRepairOpenCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status = 'sent_to_lab'`)
      .get() as { cnt: number }
  ).cnt

  const externalRepairOverdueCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets
         WHERE status = 'sent_to_lab' AND external_expected_date IS NOT NULL
           AND external_expected_date != '' AND external_expected_date < ?`
      )
      .get(today) as { cnt: number }
  ).cnt

  const activeLoanersCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM product_serials WHERE status = 'loaned'`)
      .get() as { cnt: number }
  ).cnt

  const recentSalesRaw = db
    .prepare(`SELECT * FROM sales_invoices ORDER BY id DESC LIMIT 8`)
    .all() as Record<string, unknown>[]
  const recentSales: SalesInvoice[] = recentSalesRaw.map((r) => ({
    ...(r as unknown as SalesInvoice),
    subtotal: roundMoney(r.subtotal),
    discount: roundMoney(r.discount),
    trade_in_credit: roundMoney(r.trade_in_credit),
    total_amount: roundMoney(r.total_amount),
    paid_amount: roundMoney(r.paid_amount),
    remaining_amount: roundMoney(r.remaining_amount),
    extra_data: parseJsonObject(r.extra_data)
  }))

  const monthSalesRevenue = roundMoney(monthSalesAgg?.rev || 0)
  const monthSalesCost = roundMoney(monthSalesAgg?.cost || 0)
  const monthSalesProfit = roundMoney(monthSalesRevenue - monthSalesCost)

  // Phase 4E: Followups & Earmold Order reminders for Dashboard
  const dueFollowupsTodayCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM followups WHERE status = 'pending' AND due_date = ?`)
      .get(today) as { cnt: number }
  ).cnt

  const overdueFollowupsCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM followups WHERE status = 'pending' AND due_date < ?`)
      .get(today) as { cnt: number }
  ).cnt

  const overdueEarmoldsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM earmold_orders
         WHERE status = 'sent_to_lab' AND expected_date IS NOT NULL
           AND expected_date != '' AND expected_date < ?`
      )
      .get(today) as { cnt: number }
  ).cnt

  const readyEarmoldsWaitingDeliveryCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM earmold_orders WHERE status = 'received'`)
      .get() as { cnt: number }
  ).cnt

  const upcomingFollowups = listFollowups({ status: 'pending' }).slice(0, 6)
  const activeEarmoldAlerts = listEarmoldOrders({}).filter(
    (m) =>
      m.status === 'received' ||
      (m.status === 'sent_to_lab' && m.expected_date && m.expected_date < today)
  ).slice(0, 6)

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
    todaySalesCount: todaySalesAgg?.cnt || 0,
    todaySalesRevenue: roundMoney(todaySalesAgg?.rev || 0),
    monthSalesCount: monthSalesAgg?.cnt || 0,
    monthSalesRevenue,
    monthSalesCost,
    monthSalesProfit,
    lowStockProductsCount,
    lowStockProducts,
    externalRepairOpenCount,
    externalRepairOverdueCount,
    activeLoanersCount,
    recentSales,
    dueFollowupsTodayCount,
    overdueFollowupsCount,
    overdueEarmoldsCount,
    readyEarmoldsWaitingDeliveryCount,
    upcomingFollowups,
    activeEarmoldAlerts,
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
    exchange_policy_days: Number(map.exchange_policy_days ?? 14),
    warranty_terms: map.warranty_terms || '',
    receipt_footer: map.receipt_footer || '',
    update_url: map.update_url || 'HassanMahmoud-dev/sallehli-aljoker',
    auto_backup_enabled: Number(map.auto_backup_enabled ?? 1),
    auto_backup_dir: map.auto_backup_dir || getDefaultAutoBackupDir(),
    auto_backup_keep_count: Number(map.auto_backup_keep_count ?? 10),
    browser_enabled: Number(map.browser_enabled ?? 1),
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

export function getPatientAttachmentsDir(): string {
  const dir = join(app.getPath('userData'), 'patient_attachments')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function copyDirectoryFilesFlat(srcDir: string, destDir: string): void {
  if (!existsSync(srcDir)) return
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }
  const entries = readdirSync(srcDir)
  for (const name of entries) {
    const srcFile = join(srcDir, name)
    const destFile = join(destDir, name)
    try {
      if (statSync(srcFile).isFile()) {
        copyFileSync(srcFile, destFile)
      }
    } catch {
      // Ignore single-file copy errors during backup
    }
  }
}

export function createBackupToFile(destinationPath: string): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    // Ignore if checkpoint not supported
  }
  copyFileSync(dbFilePath, destinationPath)
  try {
    const attachDir = getPatientAttachmentsDir()
    const files = existsSync(attachDir) ? readdirSync(attachDir) : []
    if (files.length > 0) {
      copyDirectoryFilesFlat(attachDir, `${destinationPath}.attachments`)
    }
  } catch {
    // Ignore attachment backup error
  }
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
  try {
    const companionDir = `${sourcePath}.attachments`
    if (existsSync(companionDir)) {
      copyDirectoryFilesFlat(companionDir, getPatientAttachmentsDir())
    }
  } catch {
    // Ignore companion attachment restore error
  }
}

// ==========================================
// BUSINESS PROFILES & DYNAMIC LOOKUPS
// ==========================================

export function createPreSwitchBackup(): string {
  const backupsDir = getDefaultAutoBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = join(backupsDir, `Sallehli-PreSwitch-${timestamp}.sqlite`)
  createBackupToFile(backupPath)
  return backupPath
}

export function isBusinessDataEmpty(): {
  empty: boolean
  counts: Record<string, number>
  total: number
} {
  const tables = [
    'customers',
    'customer_appliances',
    'technicians',
    'spare_parts',
    'products',
    'suppliers',
    'purchase_invoices',
    'sales_invoices',
    'maintenance_tickets',
    'ticket_parts',
    'inventory_movements',
    'treasury_transactions',
    'hearing_tests',
    'followups',
    'earmold_orders',
    'implants',
    'patient_attachments'
  ]

  const counts: Record<string, number> = {}
  let total = 0

  for (const table of tables) {
    try {
      const res = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }
      counts[table] = res?.cnt || 0
      total += counts[table]
    } catch {
      counts[table] = 0
    }
  }

  return {
    empty: total === 0,
    counts,
    total
  }
}

export function getBusinessState(): BusinessState {
  const typeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('business_type') as
    | { value: string }
    | undefined
  const sigRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('business_type_sig') as
    | { value: string }
    | undefined

  const licensedModules = getLicensedModules()

  if (!typeRow || !typeRow.value) {
    const dataCheck = isBusinessDataEmpty()
    const otherUsersCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM users WHERE username != 'admin'").get() as { cnt: number }
    ).cnt

    if (dataCheck.empty && otherUsersCount === 0) {
      return {
        type: 'appliances',
        locked: false,
        needsSetup: true,
        appName: 'صلحلي',
        licensedModules: [],
        effectiveModules: APPLIANCES_PROFILE.modules
      }
    }

    // Existing database from previous versions: backfill to appliances
    const defaultType: BusinessType = 'appliances'
    const sig = signBusinessType(defaultType)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type', defaultType)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type_sig', sig)

    const effectiveModules = Array.from(new Set([...APPLIANCES_PROFILE.modules, ...licensedModules]))

    return {
      type: defaultType,
      locked: false,
      needsSetup: false,
      appName: 'صلحلي',
      licensedModules,
      effectiveModules
    }
  }

  const rawType = typeRow.value
  const isValidType = rawType === 'appliances' || rawType === 'hearing_aids'
  const businessType: BusinessType = isValidType ? (rawType as BusinessType) : 'appliances'
  const expectedSig = signBusinessType(rawType)
  const profile = getBusinessProfile(businessType)

  if (!isValidType || !sigRow || sigRow.value !== expectedSig) {
    return {
      type: businessType,
      locked: true,
      needsSetup: false,
      appName: profile?.appName || 'صلحلي',
      licensedModules: [],
      effectiveModules: []
    }
  }

  const effectiveModules = Array.from(new Set([...(profile?.modules || []), ...licensedModules]))

  return {
    type: businessType,
    locked: false,
    needsSetup: false,
    appName: profile?.appName || 'صلحلي',
    licensedModules,
    effectiveModules
  }
}

export function getEffectiveModules(): string[] {
  const bState = getBusinessState()
  if (bState.locked) return []
  if (bState.effectiveModules && bState.effectiveModules.length > 0) {
    return bState.effectiveModules
  }
  const profile = getBusinessProfile(bState.type)
  const base = profile ? profile.modules : []
  const extra = getLicensedModules()
  return Array.from(new Set([...base, ...extra]))
}

export function setLicensedModules(
  modules: string[],
  sessionUserId = 1
): { success: boolean; modules: string[]; state: BusinessState } {
  const allowedAddons = ['sales', 'purchases', 'products', 'suppliers', 'followups', 'inventory']
  const cleanMods = Array.from(
    new Set(
      modules
        .filter((m) => typeof m === 'string' && allowedAddons.includes(m.trim()))
        .map((m) => m.trim())
    )
  ).sort()

  const sig = signLicensedModules(cleanMods)
  const jsonStr = JSON.stringify(cleanMods)

  runTransaction(() => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('licensed_modules', jsonStr)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('licensed_modules_sig', sig)

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (?, 'modules', 'modules', 0, ?)`
    ).run(sessionUserId, `تحديث الوحدات المرخصة إضافياً: [${cleanMods.join(', ')}]`)
  })

  return {
    success: true,
    modules: cleanMods,
    state: getBusinessState()
  }
}

export function setInitialBusinessType(type: BusinessType): BusinessState {
  const current = getBusinessState()
  if (!current.needsSetup) {
    throw new Error('تم ضبط نشاط البرنامج مسبقاً، لا يمكن استخدام الإعداد الأولي مرة أخرى.')
  }

  const validTypes: BusinessType[] = ['appliances', 'hearing_aids']
  if (!validTypes.includes(type)) {
    throw new Error('نوع النشاط المحدد غير صالح.')
  }

  const sig = signBusinessType(type)
  runTransaction(() => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type', type)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type_sig', sig)

    if (type === 'hearing_aids') {
      const hearingProfile = HEARING_AIDS_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        hearingProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        hearingProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        hearingProfile.receiptFooterDefault
      )
    }

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (1, 'none', ?, 0, 'التعيين الأولي للنشاط عند أول تشغيل')`
    ).run(type)
  })

  return getBusinessState()
}

const switchRateLimits = new Map<number, { count: number; lockedUntil: number }>()

export function switchBusinessType(
  payload: { type: BusinessType; password?: string },
  sessionUserId: number
): BusinessState {
  const current = getBusinessState()
  if (current.type === payload.type && !current.locked) {
    return current
  }

  const validTypes: BusinessType[] = ['appliances', 'hearing_aids']
  if (!validTypes.includes(payload.type)) {
    throw new Error('نوع النشاط المطلوب غير صالح.')
  }

  const dataCheck = isBusinessDataEmpty()

  if (!dataCheck.empty || current.locked) {
    const now = Date.now()
    const rate = switchRateLimits.get(sessionUserId)
    if (rate && rate.lockedUntil > now) {
      const waitSec = Math.ceil((rate.lockedUntil - now) / 1000)
      throw new Error(`تم إيقاف المحاولات مؤقتاً بسبب تكرار كلمة المرور الخاطئة. يرجى الانتظار ${waitSec} ثانية.`)
    }

    if (!payload.password) {
      throw new Error('يلزم إدخال كلمة مرور السوبر أدمن لتأكيد العملية.')
    }

    const userRow = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(sessionUserId) as { password_hash: string } | undefined

    if (!userRow) {
      throw new Error('مستخدم السوبر أدمن غير موجود.')
    }

    const { valid } = verifyPassword(payload.password, userRow.password_hash)
    if (!valid) {
      const curCount = (rate?.count || 0) + 1
      if (curCount >= 3) {
        switchRateLimits.set(sessionUserId, { count: 0, lockedUntil: now + 60 * 1000 })
        throw new Error('كلمة المرور غير صحيحة. تم قفل المحاولات لمدة دقيقة واحدة.')
      } else {
        switchRateLimits.set(sessionUserId, { count: curCount, lockedUntil: 0 })
        throw new Error(`كلمة مرور السوبر أدمن غير صحيحة. المحاولة (${curCount} من 3).`)
      }
    }

    switchRateLimits.delete(sessionUserId)

    if (!dataCheck.empty) {
      const backupPath = createPreSwitchBackup()
      if (!backupPath || !existsSync(backupPath)) {
        throw new Error('تعذر إنشاء نسخة احتياطية تلقائية قبل التبديل. تم إيقاف العملية للحفاظ على أمان البيانات.')
      }
    }
  }

  const sig = signBusinessType(payload.type)
  const fromType = current.type
  const toType = payload.type

  runTransaction(() => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type', toType)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type_sig', sig)

    const curName = (
      db.prepare('SELECT value FROM settings WHERE key = ?').get('center_name') as { value: string }
    )?.value

    if (toType === 'hearing_aids' && (!curName || curName === APPLIANCES_PROFILE.centerNameDefault)) {
      const hearingProfile = HEARING_AIDS_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        hearingProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        hearingProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        hearingProfile.receiptFooterDefault
      )
    } else if (toType === 'appliances' && (!curName || curName === HEARING_AIDS_PROFILE.centerNameDefault)) {
      const appProfile = APPLIANCES_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        appProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        appProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        appProfile.receiptFooterDefault
      )
    }

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      sessionUserId,
      fromType,
      toType,
      dataCheck.empty ? 0 : 1,
      dataCheck.empty ? 'تبديل النشاط (قاعدة بيانات فارغة)' : 'تبديل النشاط بعد تأكيد كلمة المرور وأخذ نسخة احتياطية'
    )
  })

  return getBusinessState()
}

export function listLookupItems(category?: string, businessType?: BusinessType): LookupItem[] {
  const activeType = businessType || getBusinessState().type
  let query = 'SELECT * FROM lookup_items WHERE business_type = ?'
  const params: unknown[] = [activeType]

  if (category) {
    query += ' AND category = ?'
    params.push(category)
  }

  query += ' ORDER BY sort_order ASC, value ASC'
  return db.prepare(query).all(...params) as LookupItem[]
}

export function saveLookupItem(data: Partial<LookupItem>): LookupItem {
  const activeType = data.business_type || getBusinessState().type
  if (!data.category || !data.value?.trim()) {
    throw new Error('بيانات القائمة غير مكتملة.')
  }

  const category = data.category
  const value = data.value.trim()
  const sortOrder = Number(data.sort_order || 0)
  const isActive = data.is_active !== undefined ? Number(data.is_active) : 1

  if (data.id) {
    db.prepare(
      `UPDATE lookup_items
       SET category = ?, value = ?, sort_order = ?, is_active = ?, business_type = ?
       WHERE id = ?`
    ).run(category, value, sortOrder, isActive, activeType, data.id)
    return db.prepare('SELECT * FROM lookup_items WHERE id = ?').get(data.id) as LookupItem
  } else {
    db.prepare(
      `INSERT INTO lookup_items (category, value, sort_order, is_active, business_type)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(category, value, business_type) DO UPDATE SET
         is_active = excluded.is_active,
         sort_order = excluded.sort_order`
    ).run(category, value, sortOrder, isActive, activeType)
    return db
      .prepare('SELECT * FROM lookup_items WHERE category = ? AND value = ? AND business_type = ?')
      .get(category, value, activeType) as LookupItem
  }
}

export function deleteLookupItem(id: number): void {
  db.prepare('DELETE FROM lookup_items WHERE id = ?').run(id)
}

export function reorderLookupItems(items: Array<{ id: number; sort_order: number }>): void {
  runTransaction(() => {
    const stmt = db.prepare('UPDATE lookup_items SET sort_order = ? WHERE id = ?')
    for (const item of items) {
      stmt.run(item.sort_order, item.id)
    }
  })
}

function normalizeCustomFieldRow(row: Record<string, unknown>): CustomFieldDef {
  return {
    ...(row as unknown as CustomFieldDef),
    options: parseJsonArray(row.options),
    required: Number(row.required || 0),
    show_in_table: Number(row.show_in_table || 0),
    sort_order: Number(row.sort_order || 0),
    is_active: Number(row.is_active ?? 1)
  }
}

export function listCustomFieldDefs(
  entity?: CustomFieldEntity,
  businessType?: BusinessType
): CustomFieldDef[] {
  const activeType = businessType || getBusinessState().type
  let query = 'SELECT * FROM custom_field_defs WHERE business_type = ?'
  const params: unknown[] = [activeType]

  if (entity) {
    query += ' AND entity = ?'
    params.push(entity)
  }

  query += ' ORDER BY sort_order ASC, id ASC'
  const rows = db.prepare(query).all(...params) as Record<string, unknown>[]
  return rows.map(normalizeCustomFieldRow)
}

export function saveCustomFieldDef(data: Partial<CustomFieldDef>): CustomFieldDef {
  const activeType = data.business_type || getBusinessState().type
  if (!data.entity || !data.label?.trim()) {
    throw new Error('يرجى إدخال اسم الحقل والكيان التابع له.')
  }

  const entity = data.entity
  const label = data.label.trim()
  const type = data.type || 'text'
  const optionsJson = JSON.stringify(Array.isArray(data.options) ? data.options : [])
  const required = data.required ? 1 : 0
  const showInTable = data.show_in_table ? 1 : 0
  const sortOrder = Number(data.sort_order || 0)
  const isActive = data.is_active !== undefined ? Number(data.is_active) : 1
  const cleanKey =
    data.key?.trim().replace(/[^a-zA-Z0-9_]/g, '_') || `cf_${Date.now().toString(36)}`

  if (data.id) {
    db.prepare(
      `UPDATE custom_field_defs
       SET entity = ?, label = ?, type = ?, options = ?, required = ?, show_in_table = ?, sort_order = ?, is_active = ?
       WHERE id = ?`
    ).run(entity, label, type, optionsJson, required, showInTable, sortOrder, isActive, data.id)

    const row = db
      .prepare('SELECT * FROM custom_field_defs WHERE id = ?')
      .get(data.id) as Record<string, unknown>
    return normalizeCustomFieldRow(row)
  } else {
    const info = db
      .prepare(
        `INSERT INTO custom_field_defs (
          business_type, entity, key, label, type, options, required, show_in_table, sort_order, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_type, entity, key) DO UPDATE SET
          label = excluded.label,
          type = excluded.type,
          options = excluded.options,
          required = excluded.required,
          show_in_table = excluded.show_in_table,
          sort_order = excluded.sort_order,
          is_active = excluded.is_active`
      )
      .run(
        activeType,
        entity,
        cleanKey,
        label,
        type,
        optionsJson,
        required,
        showInTable,
        sortOrder,
        isActive
      )

    const row = db
      .prepare(
        'SELECT * FROM custom_field_defs WHERE id = ? OR (business_type = ? AND entity = ? AND key = ?) LIMIT 1'
      )
      .get(Number(info.lastInsertRowid), activeType, entity, cleanKey) as Record<string, unknown>
    return normalizeCustomFieldRow(row)
  }
}

export function deleteCustomFieldDef(id: number): void {
  db.prepare('DELETE FROM custom_field_defs WHERE id = ?').run(id)
}

export function reorderCustomFieldDefs(items: Array<{ id: number; sort_order: number }>): void {
  runTransaction(() => {
    const stmt = db.prepare('UPDATE custom_field_defs SET sort_order = ? WHERE id = ?')
    for (const item of items) {
      stmt.run(item.sort_order, item.id)
    }
  })
}

// ==========================================
// 8. PHASE 3A: PRODUCTS, VARIANTS, SERIALS & SUPPLIERS (HEARING AIDS)
// ==========================================

function normalizeProductRow(row: Record<string, unknown>): Product {
  return {
    ...(row as unknown as Product),
    track_serial: Number(row.track_serial || 0),
    has_variants: Number(row.has_variants || 0),
    pack_size: Math.max(1, Number(row.pack_size || 1)),
    cost_price: roundMoney(row.cost_price),
    sale_price: roundMoney(row.sale_price),
    pack_cost_price: roundMoney(row.pack_cost_price),
    pack_sale_price: roundMoney(row.pack_sale_price),
    qty: Number(row.qty || 0),
    min_stock: Number(row.min_stock ?? 3),
    warranty_months: Number(row.warranty_months ?? 12),
    is_active: Number(row.is_active ?? 1),
    extra_data: parseJsonObject(row.extra_data)
  }
}

export function listProducts(filters?: {
  search?: string
  type?: string
  activeOnly?: boolean
}): Product[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM product_serials ps WHERE ps.product_id = p.id AND ps.status = 'in_stock') as available_serials_count,
      (SELECT COUNT(*) FROM product_serials ps WHERE ps.product_id = p.id) as total_serials_count
    FROM products p
    WHERE (
      p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR p.brand LIKE ? OR
      p.model LIKE ? OR p.compatible_with LIKE ? OR p.sub_category LIKE ? OR
      EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p.id AND (pv.variant_name LIKE ? OR pv.barcode LIKE ? OR pv.sku LIKE ?)
      ) OR
      EXISTS (
        SELECT 1 FROM product_serials ps
        WHERE ps.product_id = p.id AND ps.serial_no LIKE ?
      )
    )
  `
  const params: unknown[] = [q, q, q, q, q, q, q, q, q, q, q]

  if (filters?.type && filters.type !== 'all') {
    sql += ' AND p.type = ?'
    params.push(filters.type)
  }
  if (filters?.activeOnly) {
    sql += ' AND p.is_active = 1'
  }

  sql += ' ORDER BY p.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const products = rawRows.map(normalizeProductRow)

  const getVariantsStmt = db.prepare(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC'
  )
  for (const prod of products) {
    prod.variants = getVariantsStmt.all(prod.id) as ProductVariant[]
  }

  return products
}

export function getProductByBarcode(barcode: string): {
  product: Product
  variant?: ProductVariant
  serial?: ProductSerial
} | null {
  const clean = barcode.trim()
  if (!clean) return null

  // 1. Check serial numbers first
  const serialRow = db
    .prepare('SELECT * FROM product_serials WHERE serial_no = ? LIMIT 1')
    .get(clean) as ProductSerial | undefined
  if (serialRow) {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(serialRow.product_id) as Record<string, unknown> | undefined
    if (rawProd) {
      const product = normalizeProductRow(rawProd)
      product.variants = db
        .prepare('SELECT * FROM product_variants WHERE product_id = ?')
        .all(product.id) as ProductVariant[]
      return { product, serial: serialRow }
    }
  }

  // 2. Check variant barcode or SKU
  const variantRow = db
    .prepare('SELECT * FROM product_variants WHERE barcode = ? OR sku = ? LIMIT 1')
    .get(clean, clean) as ProductVariant | undefined
  if (variantRow && variantRow.product_id) {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(variantRow.product_id) as Record<string, unknown> | undefined
    if (rawProd) {
      const product = normalizeProductRow(rawProd)
      product.variants = db
        .prepare('SELECT * FROM product_variants WHERE product_id = ?')
        .all(product.id) as ProductVariant[]
      return { product, variant: variantRow }
    }
  }

  // 3. Check product barcode or code
  const rawProd = db
    .prepare('SELECT * FROM products WHERE barcode = ? OR code = ? LIMIT 1')
    .get(clean, clean) as Record<string, unknown> | undefined
  if (rawProd) {
    const product = normalizeProductRow(rawProd)
    product.variants = db
      .prepare('SELECT * FROM product_variants WHERE product_id = ?')
      .all(product.id) as ProductVariant[]
    return { product }
  }

  return null
}

function syncProductQtyFromChildren(productId: number): void {
  const prod = db
    .prepare('SELECT type, track_serial, has_variants FROM products WHERE id = ?')
    .get(productId) as { type: string; track_serial: number; has_variants: number } | undefined
  if (!prod) return

  if (prod.type === 'service') {
    db.prepare('UPDATE products SET qty = 0 WHERE id = ?').run(productId)
    return
  }

  if (prod.track_serial) {
    const cnt = (
      db
        .prepare(
          "SELECT COUNT(*) as cnt FROM product_serials WHERE product_id = ? AND status = 'in_stock'"
        )
        .get(productId) as { cnt: number }
    ).cnt
    db.prepare('UPDATE products SET qty = ? WHERE id = ?').run(cnt, productId)
  } else if (prod.has_variants) {
    const totalQty = (
      db
        .prepare(
          'SELECT COALESCE(SUM(qty), 0) as total FROM product_variants WHERE product_id = ? AND is_active = 1'
        )
        .get(productId) as { total: number }
    ).total
    db.prepare('UPDATE products SET qty = ? WHERE id = ?').run(totalQty, productId)
  }
}

export function saveProduct(
  data: Partial<Product> & {
    variants?: Partial<ProductVariant>[]
    initial_serials?: string[]
  }
): Product {
  return runTransaction(() => {
    const name = data.name?.trim()
    if (!name) {
      throw new Error('يرجى إدخال اسم المنتج أو الخدمة')
    }

    const type: ProductType = data.type || 'hearing_aid'
    const isService = type === 'service'
    const trackSerial = isService
      ? 0
      : data.track_serial !== undefined
        ? Number(data.track_serial)
        : type === 'hearing_aid' || type === 'cochlear_processor'
          ? 1
          : 0
    const hasVariants = isService || trackSerial ? 0 : data.has_variants ? 1 : 0
    const packSize = Math.max(1, Math.round(Number(data.pack_size || 1)))
    const costPrice = roundMoney(data.cost_price)
    const salePrice = roundMoney(data.sale_price)
    const packCostPrice = roundMoney(data.pack_cost_price || costPrice * packSize)
    const packSalePrice = roundMoney(data.pack_sale_price || salePrice * packSize)
    const code = data.code?.trim() || `PR-${Date.now().toString().slice(-5)}`
    const extraDataJson = stringifyExtraData(data.extra_data)

    let productId = data.id

    if (productId) {
      db.prepare(
        `UPDATE products SET
          code = ?, barcode = ?, name = ?, type = ?, sub_category = ?, brand = ?, model = ?,
          compatible_with = ?, track_serial = ?, has_variants = ?, unit_name = ?, pack_name = ?,
          pack_size = ?, cost_price = ?, sale_price = ?, pack_cost_price = ?, pack_sale_price = ?,
          qty = ?, min_stock = ?, warranty_months = ?, image_base64 = ?, notes = ?,
          extra_data = ?, is_active = ?
         WHERE id = ?`
      ).run(
        code,
        data.barcode?.trim() || '',
        name,
        type,
        data.sub_category?.trim() || '',
        data.brand?.trim() || '',
        data.model?.trim() || '',
        data.compatible_with?.trim() || '',
        trackSerial,
        hasVariants,
        data.unit_name?.trim() || 'قطعة',
        data.pack_name?.trim() || 'عبوة',
        packSize,
        costPrice,
        salePrice,
        packCostPrice,
        packSalePrice,
        isService ? 0 : Math.max(0, Math.round(Number(data.qty ?? 0))),
        isService ? 0 : Math.max(0, Math.round(Number(data.min_stock ?? 3))),
        Math.max(0, Math.round(Number(data.warranty_months ?? 12))),
        data.image_base64 || '',
        data.notes?.trim() || '',
        extraDataJson,
        data.is_active !== undefined ? Number(data.is_active) : 1,
        productId
      )
    } else {
      const info = db
        .prepare(
          `INSERT INTO products (
            code, barcode, name, type, sub_category, brand, model, compatible_with,
            track_serial, has_variants, unit_name, pack_name, pack_size,
            cost_price, sale_price, pack_cost_price, pack_sale_price,
            qty, min_stock, warranty_months, image_base64, notes, extra_data, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          data.barcode?.trim() || '',
          name,
          type,
          data.sub_category?.trim() || '',
          data.brand?.trim() || '',
          data.model?.trim() || '',
          data.compatible_with?.trim() || '',
          trackSerial,
          hasVariants,
          data.unit_name?.trim() || 'قطعة',
          data.pack_name?.trim() || 'عبوة',
          packSize,
          costPrice,
          salePrice,
          packCostPrice,
          packSalePrice,
          isService ? 0 : Math.max(0, Math.round(Number(data.qty ?? 0))),
          isService ? 0 : Math.max(0, Math.round(Number(data.min_stock ?? 3))),
          Math.max(0, Math.round(Number(data.warranty_months ?? 12))),
          data.image_base64 || '',
          data.notes?.trim() || '',
          extraDataJson,
          data.is_active !== undefined ? Number(data.is_active) : 1
        )
      productId = Number(info.lastInsertRowid)
    }

    // Sync variants if has_variants = 1
    if (hasVariants && Array.isArray(data.variants)) {
      const existingVariants = db
        .prepare('SELECT id FROM product_variants WHERE product_id = ?')
        .all(productId) as Array<{ id: number }>
      const incomingIds = new Set(
        data.variants.map((v) => Number(v.id || 0)).filter((id) => id > 0)
      )

      for (const ev of existingVariants) {
        if (!incomingIds.has(ev.id)) {
          db.prepare('DELETE FROM product_variants WHERE id = ?').run(ev.id)
        }
      }

      for (const v of data.variants) {
        const vName = v.variant_name?.trim() || v.size?.trim() || v.color?.trim()
        if (!vName) continue
        const vQty = Math.max(0, Math.round(Number(v.qty ?? 0)))
        const vMin = Math.max(0, Math.round(Number(v.min_stock ?? 6)))
        const vCost = v.cost_price !== null && v.cost_price !== undefined ? roundMoney(v.cost_price) : null
        const vSale = v.sale_price !== null && v.sale_price !== undefined ? roundMoney(v.sale_price) : null
        const vPackCost =
          v.pack_cost_price !== null && v.pack_cost_price !== undefined
            ? roundMoney(v.pack_cost_price)
            : null
        const vPackSale =
          v.pack_sale_price !== null && v.pack_sale_price !== undefined
            ? roundMoney(v.pack_sale_price)
            : null

        if (v.id && incomingIds.has(Number(v.id))) {
          db.prepare(
            `UPDATE product_variants SET
              variant_name = ?, size = ?, color = ?, sku = ?, barcode = ?,
              cost_price = ?, sale_price = ?, pack_cost_price = ?, pack_sale_price = ?,
              qty = ?, min_stock = ?, is_active = ?
             WHERE id = ? AND product_id = ?`
          ).run(
            vName,
            v.size?.trim() || '',
            v.color?.trim() || '',
            v.sku?.trim() || '',
            v.barcode?.trim() || '',
            vCost,
            vSale,
            vPackCost,
            vPackSale,
            vQty,
            vMin,
            v.is_active !== undefined ? Number(v.is_active) : 1,
            v.id,
            productId
          )
        } else {
          db.prepare(
            `INSERT INTO product_variants (
              product_id, variant_name, size, color, sku, barcode,
              cost_price, sale_price, pack_cost_price, pack_sale_price, qty, min_stock, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            productId,
            vName,
            v.size?.trim() || '',
            v.color?.trim() || '',
            v.sku?.trim() || '',
            v.barcode?.trim() || '',
            vCost,
            vSale,
            vPackCost,
            vPackSale,
            vQty,
            vMin,
            v.is_active !== undefined ? Number(v.is_active) : 1
          )
        }
      }
    }

    // Insert initial serials if provided for track_serial = 1
    if (trackSerial && Array.isArray(data.initial_serials) && data.initial_serials.length > 0) {
      const insertSerialStmt = db.prepare(
        `INSERT OR IGNORE INTO product_serials (product_id, serial_no, status, condition)
         VALUES (?, ?, 'in_stock', 'new')`
      )
      for (const rawSn of data.initial_serials) {
        const sn = String(rawSn || '').trim()
        if (sn) {
          insertSerialStmt.run(productId, sn)
        }
      }
    }

    syncProductQtyFromChildren(productId)

    const savedList = listProducts()
    return savedList.find((p) => p.id === productId) || savedList[0]
  })
}

export function deleteProduct(id: number): void {
  runTransaction(() => {
    const soldSerial = db
      .prepare("SELECT id FROM product_serials WHERE product_id = ? AND status != 'in_stock' LIMIT 1")
      .get(id) as { id: number } | undefined
    if (soldSerial) {
      throw new Error(
        'لا يمكن حذف هذا المنتج لوجود أرقام تسلسلية مباعة أو مرتبطة بعمليات سابقة. يمكنك تعطيل المنتج بدلاً من حذفه.'
      )
    }
    db.prepare('DELETE FROM product_serials WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
  })
}

export function listProductSerials(filters?: {
  product_id?: number
  status?: string
  search?: string
}): ProductSerial[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT ps.*,
      p.name as product_name, p.brand as product_brand, p.model as product_model, p.type as product_type,
      c.name as customer_name
    FROM product_serials ps
    JOIN products p ON p.id = ps.product_id
    LEFT JOIN customers c ON c.id = ps.customer_id
    WHERE (
      ps.serial_no LIKE ? OR p.name LIKE ? OR p.brand LIKE ? OR p.model LIKE ? OR
      COALESCE(c.name, '') LIKE ? OR ps.notes LIKE ?
    )
  `
  const params: unknown[] = [q, q, q, q, q, q]

  if (filters?.product_id) {
    sql += ' AND ps.product_id = ?'
    params.push(filters.product_id)
  }
  if (filters?.status && filters.status !== 'all') {
    sql += ' AND ps.status = ?'
    params.push(filters.status)
  }

  sql += ' ORDER BY ps.id DESC LIMIT 300'
  return db.prepare(sql).all(...params) as ProductSerial[]
}

export function addProductSerials(payload: {
  product_id: number
  variant_id?: number | null
  serials: string[]
  condition?: SerialCondition
  ear_side?: string
  company_warranty_start?: string | null
  company_warranty_end?: string | null
  notes?: string
  recordInTreasury?: boolean
  payment_method?: string
}): ProductSerial[] {
  return runTransaction(() => {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.product_id) as Record<string, unknown> | undefined
    if (!rawProd) {
      throw new Error('المنتج غير موجود')
    }
    const product = normalizeProductRow(rawProd)

    const cleanSerials = Array.from(
      new Set(
        (payload.serials || [])
          .map((s) => String(s || '').trim())
          .filter((s) => s.length > 0)
      )
    )
    if (cleanSerials.length === 0) {
      throw new Error('يرجى إدخال رقم تسلسلي واحد على الأقل')
    }

    const checkExisting = db.prepare('SELECT serial_no FROM product_serials WHERE serial_no = ?')
    for (const sn of cleanSerials) {
      const exists = checkExisting.get(sn) as { serial_no: string } | undefined
      if (exists) {
        throw new Error(`الرقم التسلسلي (${sn}) مسجل مسبقاً في النظام ولا يمكن تكراره`)
      }
    }

    const insertStmt = db.prepare(
      `INSERT INTO product_serials (
        product_id, variant_id, serial_no, status, condition, ear_side,
        company_warranty_start, company_warranty_end, notes
      ) VALUES (?, ?, ?, 'in_stock', ?, ?, ?, ?, ?)`
    )

    const condition: SerialCondition = payload.condition === 'used' ? 'used' : 'new'
    for (const sn of cleanSerials) {
      insertStmt.run(
        product.id,
        payload.variant_id || null,
        sn,
        condition,
        payload.ear_side || '',
        payload.company_warranty_start || null,
        payload.company_warranty_end || null,
        payload.notes?.trim() || ''
      )
    }

    syncProductQtyFromChildren(product.id)

    db.prepare(
      `INSERT INTO inventory_movements (
        product_id, variant_id, serial_no, ref_type, movement_type, quantity, unit_cost, unit_price, notes
      ) VALUES (?, ?, ?, 'manual', 'in', ?, ?, ?, ?)`
    ).run(
      product.id,
      payload.variant_id || null,
      cleanSerials.join(', '),
      cleanSerials.length,
      product.cost_price,
      product.sale_price,
      payload.notes?.trim() || `إضافة أرقام تسلسلية (${cleanSerials.length})`
    )

    if (payload.recordInTreasury && product.cost_price > 0) {
      const totalCost = roundMoney(cleanSerials.length * product.cost_price)
      if (totalCost > 0) {
        db.prepare(
          `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
           VALUES ('expense', 'توريد منتجات وسماعات', ?, ?, ?)`
        ).run(
          totalCost,
          payload.payment_method || 'cash',
          `توريد ${cleanSerials.length} × ${product.name} (سيريال: ${cleanSerials.join(', ')})`
        )
      }
    }

    return listProductSerials({ product_id: product.id })
  })
}

export function updateProductSerialStatus(payload: {
  id: number
  status: SerialStatus
  condition?: SerialCondition
  ear_side?: string
  company_warranty_end?: string | null
  notes?: string
}): ProductSerial {
  return runTransaction(() => {
    const existing = db
      .prepare('SELECT * FROM product_serials WHERE id = ?')
      .get(payload.id) as ProductSerial | undefined
    if (!existing) {
      throw new Error('الرقم التسلسلي غير موجود')
    }

    db.prepare(
      `UPDATE product_serials SET
        status = ?,
        condition = COALESCE(?, condition),
        ear_side = COALESCE(?, ear_side),
        company_warranty_end = COALESCE(?, company_warranty_end),
        notes = COALESCE(?, notes)
       WHERE id = ?`
    ).run(
      payload.status,
      payload.condition || null,
      payload.ear_side !== undefined ? payload.ear_side : null,
      payload.company_warranty_end !== undefined ? payload.company_warranty_end : null,
      payload.notes !== undefined ? payload.notes : null,
      payload.id
    )

    syncProductQtyFromChildren(existing.product_id)

    return listProductSerials({ product_id: existing.product_id }).find(
      (s) => s.id === payload.id
    )!
  })
}

export function deleteProductSerial(id: number): void {
  runTransaction(() => {
    const existing = db
      .prepare('SELECT * FROM product_serials WHERE id = ?')
      .get(id) as ProductSerial | undefined
    if (!existing) return
    if (existing.status !== 'in_stock') {
      throw new Error('لا يمكن حذف رقم تسلسلي مباع أو مرتبط بعملية حالية')
    }
    db.prepare('DELETE FROM product_serials WHERE id = ?').run(id)
    syncProductQtyFromChildren(existing.product_id)
  })
}

export function adjustProductStock(payload: {
  product_id: number
  variant_id?: number | null
  unit: 'piece' | 'pack'
  quantity: number
  movement_type: 'in' | 'damaged'
  notes?: string
  recordInTreasury?: boolean
  payment_method?: string
}): Product {
  return runTransaction(() => {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.product_id) as Record<string, unknown> | undefined
    if (!rawProd) throw new Error('المنتج غير موجود')
    const product = normalizeProductRow(rawProd)

    if (product.type === 'service') {
      throw new Error('الخدمات ليس لها رصيد مخزني')
    }
    if (product.track_serial) {
      throw new Error('هذا المنتج يتتبع الرقم التسلسلي؛ يرجى تعديل الرصيد من نافذة الأرقام التسلسلية')
    }

    const rawQty = Math.abs(Math.round(Number(payload.quantity || 0)))
    if (rawQty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')

    const multiplier = payload.unit === 'pack' ? Math.max(1, product.pack_size) : 1
    const piecesDelta = rawQty * multiplier

    let unitCost = product.cost_price
    let unitPrice = product.sale_price
    let variantLabel = ''

    if (payload.variant_id) {
      const variant = db
        .prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?')
        .get(payload.variant_id, product.id) as ProductVariant | undefined
      if (!variant) throw new Error('المقاس / التنوع المحدد غير موجود')

      variantLabel = ` (${variant.variant_name})`
      if (variant.cost_price !== null && variant.cost_price !== undefined) {
        unitCost = Number(variant.cost_price)
      }
      if (variant.sale_price !== null && variant.sale_price !== undefined) {
        unitPrice = Number(variant.sale_price)
      }

      if (payload.movement_type === 'damaged' && variant.qty < piecesDelta) {
        throw new Error(
          `الكمية المتاحة من (${variant.variant_name}) هي ${variant.qty} ${product.unit_name} فقط ولا تكفي لخصم ${piecesDelta}`
        )
      }

      const signed = payload.movement_type === 'in' ? piecesDelta : -piecesDelta
      db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(signed, variant.id)
      syncProductQtyFromChildren(product.id)
    } else {
      if (payload.movement_type === 'damaged' && product.qty < piecesDelta) {
        throw new Error(
          `الكمية المتاحة من (${product.name}) هي ${product.qty} ${product.unit_name} فقط ولا تكفي لخصم ${piecesDelta}`
        )
      }
      const signed = payload.movement_type === 'in' ? piecesDelta : -piecesDelta
      db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(signed, product.id)
    }

    const unitDesc =
      payload.unit === 'pack'
        ? `${rawQty} ${product.pack_name} (${piecesDelta} ${product.unit_name})`
        : `${piecesDelta} ${product.unit_name}`

    db.prepare(
      `INSERT INTO inventory_movements (
        product_id, variant_id, ref_type, movement_type, quantity, unit_cost, unit_price, notes
      ) VALUES (?, ?, 'manual', ?, ?, ?, ?, ?)`
    ).run(
      product.id,
      payload.variant_id || null,
      payload.movement_type,
      piecesDelta,
      unitCost,
      unitPrice,
      payload.notes?.trim() ? `${unitDesc} — ${payload.notes.trim()}` : unitDesc
    )

    if (payload.movement_type === 'in' && payload.recordInTreasury) {
      const totalCost =
        payload.unit === 'pack' && product.pack_cost_price > 0
          ? roundMoney(rawQty * product.pack_cost_price)
          : roundMoney(piecesDelta * unitCost)
      if (totalCost > 0) {
        db.prepare(
          `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
           VALUES ('expense', 'توريد منتجات وبطاريات', ?, ?, ?)`
        ).run(
          totalCost,
          payload.payment_method || 'cash',
          `توريد مخزني: ${unitDesc} من ${product.name}${variantLabel}`
        )
      }
    }

    return listProducts().find((p) => p.id === product.id)!
  })
}

// ==========================================
// SUPPLIERS MANAGEMENT & STATEMENTS (3A)
// ==========================================

export function listSuppliers(search = ''): Supplier[] {
  const q = `%${search.trim()}%`
  const hasPurchaseInvoices = Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_invoices'")
      .get()
  )

  const invoicesSubqueries = hasPurchaseInvoices
    ? `,
      (SELECT COUNT(*) FROM purchase_invoices pi WHERE pi.supplier_id = s.id AND pi.status != 'cancelled') as invoices_count,
      COALESCE((SELECT SUM(pi.total_amount) FROM purchase_invoices pi WHERE pi.supplier_id = s.id AND pi.status != 'cancelled'), 0) as total_purchases`
    : `, 0 as invoices_count, 0 as total_purchases`

  return db
    .prepare(
      `SELECT s.*,
        COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0) as total_paid
        ${invoicesSubqueries}
       FROM suppliers s
       WHERE (s.name LIKE ? OR s.company_name LIKE ? OR s.phone LIKE ? OR s.phone2 LIKE ? OR s.address LIKE ?)
       ORDER BY s.id DESC`
    )
    .all(q, q, q, q, q) as Supplier[]
}

export function saveSupplier(data: Partial<Supplier>): Supplier {
  const name = data.name?.trim()
  const phone = data.phone?.trim()
  if (!name || !phone) {
    throw new Error('يرجى إدخال اسم المورد ورقم الهاتف')
  }

  const balance = roundMoney(data.balance ?? 0)
  const supplierType = data.supplier_type === 'customer' ? 'customer' : 'company'

  if (data.id) {
    db.prepare(
      `UPDATE suppliers SET
        name = ?, company_name = ?, phone = ?, phone2 = ?, address = ?,
        supplier_type = ?, customer_id = ?, balance = ?, notes = ?, is_active = ?
       WHERE id = ?`
    ).run(
      name,
      data.company_name?.trim() || '',
      phone,
      data.phone2?.trim() || '',
      data.address?.trim() || '',
      supplierType,
      data.customer_id || null,
      balance,
      data.notes?.trim() || '',
      data.is_active !== undefined ? Number(data.is_active) : 1,
      data.id
    )
    return listSuppliers().find((s) => s.id === data.id)!
  } else {
    const info = db
      .prepare(
        `INSERT INTO suppliers (
          name, company_name, phone, phone2, address, supplier_type, customer_id, balance, notes, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        data.company_name?.trim() || '',
        phone,
        data.phone2?.trim() || '',
        data.address?.trim() || '',
        supplierType,
        data.customer_id || null,
        balance,
        data.notes?.trim() || '',
        data.is_active !== undefined ? Number(data.is_active) : 1
      )
    const newId = Number(info.lastInsertRowid)
    return listSuppliers().find((s) => s.id === newId)!
  }
}

export function deleteSupplier(id: number): void {
  const paymentsCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM supplier_payments WHERE supplier_id = ?')
      .get(id) as { cnt: number }
  ).cnt
  if (paymentsCount > 0) {
    throw new Error('لا يمكن حذف مورد له سجل مدفوعات أو فواتير سابقة')
  }
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(id)
}

export function getSupplierStatement(supplierId: number): SupplierStatement {
  const supplier = listSuppliers().find((s) => s.id === supplierId)
  if (!supplier) {
    throw new Error('المورد غير موجود')
  }

  const payments = db
    .prepare(
      `SELECT sp.*, s.name as supplier_name
       FROM supplier_payments sp
       JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.supplier_id = ?
       ORDER BY sp.id ASC`
    )
    .all(supplierId) as SupplierPayment[]

  const rawEntries: Array<Omit<SupplierStatementEntry, 'running_balance'>> = []

  // Include purchase_invoices if table exists (Phase 3B)
  const hasPurchaseInvoices = Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_invoices'")
      .get()
  )
  let totalPurchases = 0
  if (hasPurchaseInvoices) {
    const invoices = db
      .prepare(
        `SELECT id, invoice_number, total_amount, paid_amount, payment_method, notes, created_at
         FROM purchase_invoices
         WHERE supplier_id = ? AND status != 'cancelled'
         ORDER BY id ASC`
      )
      .all(supplierId) as Array<{
      id: number
      invoice_number: string
      total_amount: number
      paid_amount: number
      payment_method: string
      notes: string
      created_at: string
    }>

    for (const inv of invoices) {
      totalPurchases = roundMoney(totalPurchases + Number(inv.total_amount || 0))
      rawEntries.push({
        id: `inv-${inv.id}`,
        date: inv.created_at,
        type: 'purchase',
        reference: inv.invoice_number,
        description: inv.notes || `فاتورة مشتريات رقم ${inv.invoice_number}`,
        debit: 0,
        credit: roundMoney(inv.total_amount)
      })
      if (Number(inv.paid_amount || 0) > 0) {
        rawEntries.push({
          id: `inv-pay-${inv.id}`,
          date: inv.created_at,
          type: 'payment',
          reference: inv.invoice_number,
          description: `دفعة مسددة مع فاتورة المشتريات ${inv.invoice_number}`,
          debit: roundMoney(inv.paid_amount),
          credit: 0,
          payment_method: inv.payment_method
        })
      }
    }
  }

  // Include purchase returns if table exists (Phase 3D)
  const hasReturns = Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoice_returns'")
      .get()
  )
  let totalReturns = 0
  if (hasReturns) {
    const returns = db
      .prepare(
        `SELECT id, return_number, total_return_amount, cash_refunded, balance_adjusted, reason, created_at
         FROM invoice_returns
         WHERE return_type = 'purchase_return' AND party_id = ?
         ORDER BY id ASC`
      )
      .all(supplierId) as Array<{
      id: number
      return_number: string
      total_return_amount: number
      cash_refunded: number
      balance_adjusted: number
      reason: string
      created_at: string
    }>

    for (const ret of returns) {
      totalReturns = roundMoney(totalReturns + Number(ret.total_return_amount || 0))
      if (Number(ret.balance_adjusted || 0) > 0) {
        rawEntries.push({
          id: `ret-${ret.id}`,
          date: ret.created_at,
          type: 'return',
          reference: ret.return_number,
          description: ret.reason || `مرتجع مشتريات رقم ${ret.return_number}`,
          debit: roundMoney(ret.balance_adjusted),
          credit: 0
        })
      }
    }
  }

  let totalStandalonePaid = 0
  for (const p of payments) {
    totalStandalonePaid = roundMoney(totalStandalonePaid + Number(p.amount || 0))
    rawEntries.push({
      id: `pay-${p.id}`,
      date: p.created_at,
      type: 'payment',
      reference: `PAY-${p.id}`,
      description: p.notes || 'سداد دفعة نقدية للمورد',
      debit: roundMoney(p.amount),
      credit: 0,
      payment_method: p.payment_method
    })
  }

  rawEntries.sort((a, b) => a.date.localeCompare(b.date))

  const netFromEntries = rawEntries.reduce(
    (acc, e) => roundMoney(acc + e.credit - e.debit),
    0
  )
  const impliedOpening = roundMoney(supplier.balance - netFromEntries)

  const entries: SupplierStatementEntry[] = []
  let running = 0

  if (Math.abs(impliedOpening) >= 0.01) {
    running = impliedOpening
    entries.push({
      id: 'opening-balance',
      date: supplier.created_at,
      type: 'opening',
      reference: 'OPEN',
      description: 'رصيد افتتاحي للمورد',
      debit: impliedOpening < 0 ? Math.abs(impliedOpening) : 0,
      credit: impliedOpening > 0 ? impliedOpening : 0,
      running_balance: running
    })
  }

  for (const e of rawEntries) {
    running = roundMoney(running + e.credit - e.debit)
    entries.push({
      ...e,
      running_balance: running
    })
  }

  const totalPaid = roundMoney(
    entries.filter((e) => e.type === 'payment').reduce((s, e) => s + e.debit, 0)
  )

  return {
    supplier,
    totalPurchases,
    totalPaid,
    totalReturns,
    currentBalance: roundMoney(supplier.balance),
    entries: entries.reverse(),
    payments: [...payments].reverse()
  }
}

export function paySupplier(payload: {
  supplier_id: number
  amount: number
  payment_method: string
  notes?: string
  recordInTreasury?: boolean
}): Supplier {
  return runTransaction(() => {
    const supplier = db
      .prepare('SELECT * FROM suppliers WHERE id = ?')
      .get(payload.supplier_id) as Supplier | undefined
    if (!supplier) {
      throw new Error('المورد غير موجود')
    }

    const amt = roundMoney(payload.amount)
    if (amt <= 0) {
      throw new Error('يرجى إدخال مبلغ سداد أكبر من صفر')
    }

    const newBalance = roundMoney(supplier.balance - amt)
    db.prepare('UPDATE suppliers SET balance = ? WHERE id = ?').run(newBalance, supplier.id)

    let treasuryTxId: number | null = null
    if (payload.recordInTreasury !== false) {
      const txInfo = db
        .prepare(
          `INSERT INTO treasury_transactions (
            transaction_type, category, amount, supplier_id, payment_method, description
          ) VALUES ('expense', 'سداد موردين', ?, ?, ?, ?)`
        )
        .run(
          amt,
          supplier.id,
          payload.payment_method || 'cash',
          payload.notes?.trim()
            ? `سداد دفعة للمورد (${supplier.name}): ${payload.notes.trim()}`
            : `سداد دفعة من حساب المورد: ${supplier.name}`
        )
      treasuryTxId = Number(txInfo.lastInsertRowid)
    }

    db.prepare(
      `INSERT INTO supplier_payments (supplier_id, amount, payment_method, treasury_tx_id, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      supplier.id,
      amt,
      payload.payment_method || 'cash',
      treasuryTxId,
      payload.notes?.trim() || 'سداد دفعة للمورد'
    )

    return listSuppliers().find((s) => s.id === supplier.id)!
  })
}

// ==========================================
// 9. PHASE 3B: PURCHASES (SUPPLIERS & USED HEARING AIDS FROM CUSTOMERS)
// ==========================================

function generateNextPurchaseNumber(): string {
  const year = new Date().getFullYear()
  const lastRow = db
    .prepare('SELECT id FROM purchase_invoices ORDER BY id DESC LIMIT 1')
    .get() as { id: number } | undefined
  const nextSeq = (lastRow ? lastRow.id : 0) + 1
  return `PUR-${year}-${String(nextSeq).padStart(4, '0')}`
}

function normalizePurchaseInvoiceRow(row: Record<string, unknown>): PurchaseInvoice {
  return {
    ...(row as unknown as PurchaseInvoice),
    subtotal: roundMoney(row.subtotal),
    discount: roundMoney(row.discount),
    total_amount: roundMoney(row.total_amount),
    paid_amount: roundMoney(row.paid_amount),
    remaining_amount: roundMoney(row.remaining_amount)
  }
}

export function listPurchaseInvoices(filters?: {
  search?: string
  purchase_type?: string
  supplier_id?: number | null
}): PurchaseInvoice[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT pi.*
    FROM purchase_invoices pi
    WHERE (
      pi.invoice_number LIKE ? OR
      pi.party_name LIKE ? OR
      pi.party_phone LIKE ? OR
      pi.supplier_ref_no LIKE ? OR
      pi.notes LIKE ? OR
      EXISTS (
        SELECT 1 FROM purchase_items pitem
        WHERE pitem.invoice_id = pi.id AND (pitem.product_name LIKE ? OR pitem.serials_json LIKE ?)
      )
    )
  `
  const params: unknown[] = [q, q, q, q, q, q, q]

  if (filters?.purchase_type && filters.purchase_type !== 'all') {
    sql += ' AND pi.purchase_type = ?'
    params.push(filters.purchase_type)
  }
  if (filters?.supplier_id) {
    sql += ' AND pi.supplier_id = ?'
    params.push(filters.supplier_id)
  }

  sql += ' ORDER BY pi.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const invoices = rawRows.map(normalizePurchaseInvoiceRow)

  const getItemsStmt = db.prepare('SELECT * FROM purchase_items WHERE invoice_id = ? ORDER BY id ASC')
  for (const inv of invoices) {
    const rawItems = getItemsStmt.all(inv.id) as Record<string, unknown>[]
    inv.items = rawItems.map((it) => ({
      ...(it as unknown as PurchaseItem),
      pack_size: Math.max(1, Number(it.pack_size || 1)),
      quantity: Number(it.quantity || 1),
      added_pieces_qty: Number(it.added_pieces_qty || 1),
      unit_cost: roundMoney(it.unit_cost),
      total_cost: roundMoney(it.total_cost),
      serials: parseJsonArray(it.serials_json),
      returned_qty: Number(it.returned_qty || 0)
    }))
  }

  return invoices
}

export function savePurchaseInvoice(
  data: Partial<PurchaseInvoice> & { items: PurchaseItem[]; recordInTreasury?: boolean }
): PurchaseInvoice {
  return runTransaction(() => {
    const items = Array.isArray(data.items) ? data.items : []
    if (items.length === 0) {
      throw new Error('يرجى إضافة صنف واحد على الأقل في فاتورة المشتريات')
    }

    const purchaseType =
      data.purchase_type === 'used_from_customer' ? 'used_from_customer' : 'supplier'
    let supplierId = data.supplier_id ? Number(data.supplier_id) : null
    let customerId = data.customer_id ? Number(data.customer_id) : null
    let partyName = data.party_name?.trim() || ''
    let partyPhone = data.party_phone?.trim() || ''

    if (purchaseType === 'supplier') {
      if (!supplierId) {
        throw new Error('يرجى اختيار المورد')
      }
      const sup = db
        .prepare('SELECT * FROM suppliers WHERE id = ?')
        .get(supplierId) as Supplier | undefined
      if (!sup) throw new Error('المورد المحدد غير موجود')
      partyName = sup.name
      partyPhone = sup.phone
    } else {
      // Buying used hearing aid from a customer
      if (!partyName) {
        throw new Error('يرجى إدخال اسم العميل البائع للسماعة المستعملة')
      }
      if (!customerId && partyPhone) {
        const existingCust = db
          .prepare('SELECT id, name FROM customers WHERE phone = ? LIMIT 1')
          .get(partyPhone) as { id: number; name: string } | undefined
        if (existingCust) {
          customerId = existingCust.id
        } else {
          const cInfo = db
            .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
            .run(partyName, partyPhone)
          customerId = Number(cInfo.lastInsertRowid)
        }
      }
    }

    let subtotal = 0
    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity || 1))
      const uCost = roundMoney(it.unit_cost)
      subtotal = roundMoney(subtotal + qty * uCost)
    }

    const discount = roundMoney(data.discount ?? 0)
    const totalAmount = Math.max(0, roundMoney(subtotal - discount))
    const paidAmount = roundMoney(data.paid_amount ?? totalAmount)
    const remainingAmount = Math.max(0, roundMoney(totalAmount - paidAmount))
    const invoiceNumber = generateNextPurchaseNumber()
    const invoiceDate = data.invoice_date || new Date().toISOString().slice(0, 10)
    const paymentMethod = data.payment_method || 'cash'

    const invInfo = db
      .prepare(
        `INSERT INTO purchase_invoices (
          invoice_number, purchase_type, supplier_id, customer_id, party_name, party_phone,
          invoice_date, supplier_ref_no, subtotal, discount, total_amount, paid_amount,
          remaining_amount, payment_method, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
      )
      .run(
        invoiceNumber,
        purchaseType,
        supplierId,
        customerId,
        partyName,
        partyPhone,
        invoiceDate,
        data.supplier_ref_no?.trim() || '',
        subtotal,
        discount,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentMethod,
        data.notes?.trim() || ''
      )
    const invoiceId = Number(invInfo.lastInsertRowid)

    for (const it of items) {
      const prodRow = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(it.product_id) as Record<string, unknown> | undefined
      if (!prodRow) throw new Error('أحد الأصناف المحددة غير موجود')
      const prod = normalizeProductRow(prodRow)

      const unit = it.unit === 'pack' ? 'pack' : 'piece'
      const packSize = Math.max(1, Number(it.pack_size || prod.pack_size || 1))
      const qty = Math.max(1, Number(it.quantity || 1))
      const addedPieces = unit === 'pack' ? qty * packSize : qty
      const unitCost = roundMoney(it.unit_cost)
      const totalCost = roundMoney(qty * unitCost)
      const condition =
        purchaseType === 'used_from_customer' || it.condition === 'used' ? 'used' : 'new'
      const serials = Array.isArray(it.serials)
        ? it.serials.map((s) => String(s || '').trim()).filter(Boolean)
        : []

      if (prod.track_serial) {
        if (serials.length !== addedPieces) {
          throw new Error(
            `الصنف (${prod.name}) يتطلب إدخال ${addedPieces} سيريال نمبر بالضبط (تم إدخال ${serials.length})`
          )
        }
        // Check duplicate serials
        for (const sn of serials) {
          const dup = db
            .prepare('SELECT id, status FROM product_serials WHERE serial_no = ?')
            .get(sn) as { id: number; status: string } | undefined
          if (dup && dup.status === 'in_stock') {
            throw new Error(`السيريال (${sn}) مسجل بالفعل ومتاح بالمخزن`)
          }
        }
      }

      let variantName = it.variant_name || ''
      if (it.variant_id && !variantName) {
        const v = db
          .prepare('SELECT variant_name FROM product_variants WHERE id = ?')
          .get(it.variant_id) as { variant_name: string } | undefined
        if (v) variantName = v.variant_name
      }

      const itemInfo = db
        .prepare(
          `INSERT INTO purchase_items (
            invoice_id, product_id, variant_id, product_name, variant_name, unit, pack_size,
            quantity, added_pieces_qty, unit_cost, total_cost, condition, serials_json,
            company_warranty_end, returned_qty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          invoiceId,
          prod.id,
          it.variant_id || null,
          prod.name,
          variantName,
          unit,
          packSize,
          qty,
          addedPieces,
          unitCost,
          totalCost,
          condition,
          JSON.stringify(serials),
          it.company_warranty_end || null
        )
      const purchaseItemId = Number(itemInfo.lastInsertRowid)

      const pieceUnitCost = unit === 'pack' ? roundMoney(unitCost / packSize) : unitCost

      if (prod.track_serial) {
        for (const sn of serials) {
          const existingSn = db
            .prepare('SELECT id FROM product_serials WHERE serial_no = ?')
            .get(sn) as { id: number } | undefined
          if (existingSn) {
            db.prepare(
              `UPDATE product_serials SET
                product_id = ?, variant_id = ?, status = 'in_stock', condition = ?,
                purchase_item_id = ?, sale_item_id = NULL, customer_id = NULL,
                company_warranty_start = ?, company_warranty_end = ?
               WHERE id = ?`
            ).run(
              prod.id,
              it.variant_id || null,
              condition,
              purchaseItemId,
              invoiceDate,
              it.company_warranty_end || null,
              existingSn.id
            )
          } else {
            db.prepare(
              `INSERT INTO product_serials (
                product_id, variant_id, serial_no, status, condition, purchase_item_id,
                company_warranty_start, company_warranty_end, notes
              ) VALUES (?, ?, ?, 'in_stock', ?, ?, ?, ?, ?)`
            ).run(
              prod.id,
              it.variant_id || null,
              sn,
              condition,
              purchaseItemId,
              invoiceDate,
              it.company_warranty_end || null,
              condition === 'used' ? `شراء مستعمل بفاتورة ${invoiceNumber}` : ''
            )
          }
        }
        syncProductQtyFromChildren(prod.id)
      } else if (it.variant_id) {
        db.prepare(
          `UPDATE product_variants
           SET qty = qty + ?,
               cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
               pack_cost_price = CASE WHEN ? = 'pack' AND ? > 0 THEN ? ELSE pack_cost_price END
           WHERE id = ?`
        ).run(
          addedPieces,
          pieceUnitCost,
          pieceUnitCost,
          unit,
          unitCost,
          unitCost,
          it.variant_id
        )
        syncProductQtyFromChildren(prod.id)
      } else {
        db.prepare(
          `UPDATE products
           SET qty = qty + ?,
               cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
               pack_cost_price = CASE WHEN ? = 'pack' AND ? > 0 THEN ? ELSE pack_cost_price END
           WHERE id = ?`
        ).run(addedPieces, pieceUnitCost, pieceUnitCost, unit, unitCost, unitCost, prod.id)
      }

      if (prod.track_serial && pieceUnitCost > 0 && condition === 'new') {
        db.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(pieceUnitCost, prod.id)
      }

      db.prepare(
        `INSERT INTO inventory_movements (
          product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
          quantity, unit_cost, unit_price, notes
        ) VALUES (?, ?, ?, 'purchase_invoice', ?, 'in', ?, ?, ?, ?)`
      ).run(
        prod.id,
        it.variant_id || null,
        serials.join(', '),
        invoiceId,
        addedPieces,
        pieceUnitCost,
        prod.sale_price,
        `توريد مشتريات فاتورة ${invoiceNumber} (${partyName})`
      )
    }

    // Update supplier balance if remaining_amount > 0
    if (purchaseType === 'supplier' && supplierId && remainingAmount > 0) {
      db.prepare('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
        remainingAmount,
        supplierId
      )
    }

    // Record paid amount in treasury & supplier_payments
    let treasuryTxId: number | null = null
    if (paidAmount > 0 && data.recordInTreasury !== false) {
      const category =
        purchaseType === 'used_from_customer' ? 'شراء سماعة مستعملة' : 'مشتريات أصناف وسماعات'
      const desc =
        purchaseType === 'used_from_customer'
          ? `شراء سماعة مستعملة بفاتورة ${invoiceNumber} من العميل: ${partyName}`
          : `سداد فاتورة مشتريات ${invoiceNumber} للمورد: ${partyName}`
      const txInfo = db
        .prepare(
          `INSERT INTO treasury_transactions (
            transaction_type, category, amount, purchase_invoice_id, supplier_id, customer_id,
            payment_method, description
          ) VALUES ('expense', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          category,
          paidAmount,
          invoiceId,
          supplierId,
          customerId,
          paymentMethod,
          desc
        )
      treasuryTxId = Number(txInfo.lastInsertRowid)
    }

    if (purchaseType === 'supplier' && supplierId && paidAmount > 0) {
      db.prepare(
        `INSERT INTO supplier_payments (
          supplier_id, purchase_invoice_id, amount, payment_method, treasury_tx_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        supplierId,
        invoiceId,
        paidAmount,
        paymentMethod,
        treasuryTxId,
        `دفعة مع فاتورة مشتريات ${invoiceNumber}`
      )
    }

    return listPurchaseInvoices().find((i) => i.id === invoiceId)!
  })
}

export function deletePurchaseInvoice(id: number): void {
  runTransaction(() => {
    const inv = listPurchaseInvoices().find((i) => i.id === id)
    if (!inv) throw new Error('فاتورة المشتريات غير موجودة')

    // Reverse stock & serials
    for (const it of inv.items || []) {
      const netAdded = Math.max(0, it.added_pieces_qty - (it.returned_qty || 0) * it.pack_size)
      const serials = it.serials || []
      if (serials.length > 0) {
        for (const sn of serials) {
          const sr = db
            .prepare('SELECT id, status FROM product_serials WHERE serial_no = ?')
            .get(sn) as { id: number; status: string } | undefined
          if (sr && sr.status === 'sold') {
            throw new Error(
              `لا يمكن حذف الفاتورة لأن السيريال (${sn}) تم بيعه بالفعل لعميل`
            )
          }
          if (sr) {
            db.prepare('DELETE FROM product_serials WHERE id = ?').run(sr.id)
          }
        }
        syncProductQtyFromChildren(it.product_id)
      } else if (it.variant_id) {
        db.prepare('UPDATE product_variants SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          netAdded,
          it.variant_id
        )
        syncProductQtyFromChildren(it.product_id)
      } else {
        db.prepare('UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          netAdded,
          it.product_id
        )
      }
    }

    if (inv.supplier_id && inv.remaining_amount > 0) {
      db.prepare('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
        inv.remaining_amount,
        inv.supplier_id
      )
    }

    db.prepare('DELETE FROM supplier_payments WHERE purchase_invoice_id = ?').run(inv.id)
    db.prepare('DELETE FROM treasury_transactions WHERE purchase_invoice_id = ?').run(inv.id)
    db.prepare('DELETE FROM purchase_invoices WHERE id = ?').run(inv.id)
  })
}

// ==========================================
// 10. PHASE 3C: SALES, QUICK POS & INSTALLMENTS
// ==========================================

function generateNextSalesNumber(): string {
  const year = new Date().getFullYear()
  const lastRow = db
    .prepare('SELECT id FROM sales_invoices ORDER BY id DESC LIMIT 1')
    .get() as { id: number } | undefined
  const nextSeq = (lastRow ? lastRow.id : 0) + 1
  return `INV-${year}-${String(nextSeq).padStart(4, '0')}`
}

function normalizeSalesInvoiceRow(row: Record<string, unknown>): SalesInvoice {
  return {
    ...(row as unknown as SalesInvoice),
    subtotal: roundMoney(row.subtotal),
    discount: roundMoney(row.discount),
    trade_in_credit: roundMoney(row.trade_in_credit),
    total_amount: roundMoney(row.total_amount),
    paid_amount: roundMoney(row.paid_amount),
    remaining_amount: roundMoney(row.remaining_amount),
    extra_data: parseJsonObject(row.extra_data)
  }
}

export function listSalesInvoices(filters?: {
  search?: string
  invoice_type?: string
  customer_id?: number | null
  only_with_remaining?: boolean
}): SalesInvoice[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT si.*
    FROM sales_invoices si
    WHERE (
      si.invoice_number LIKE ? OR
      si.customer_name LIKE ? OR
      si.customer_phone LIKE ? OR
      si.notes LIKE ? OR
      EXISTS (
        SELECT 1 FROM sales_items sitem
        WHERE sitem.invoice_id = si.id AND (sitem.product_name LIKE ? OR sitem.serial_no LIKE ?)
      )
    )
  `
  const params: unknown[] = [q, q, q, q, q, q]

  if (filters?.invoice_type && filters.invoice_type !== 'all') {
    sql += ' AND si.invoice_type = ?'
    params.push(filters.invoice_type)
  }
  if (filters?.customer_id) {
    sql += ' AND si.customer_id = ?'
    params.push(filters.customer_id)
  }
  if (filters?.only_with_remaining) {
    sql += " AND si.remaining_amount > 0 AND si.status != 'cancelled'"
  }

  sql += ' ORDER BY si.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const invoices = rawRows.map(normalizeSalesInvoiceRow)

  const getItemsStmt = db.prepare('SELECT * FROM sales_items WHERE invoice_id = ? ORDER BY id ASC')
  const getPaymentsStmt = db.prepare(
    'SELECT * FROM sales_payments WHERE invoice_id = ? ORDER BY id ASC'
  )

  for (const inv of invoices) {
    const rawItems = getItemsStmt.all(inv.id) as Record<string, unknown>[]
    inv.items = rawItems.map((it) => ({
      ...(it as unknown as SalesItem),
      pack_size: Math.max(1, Number(it.pack_size || 1)),
      quantity: Number(it.quantity || 1),
      deducted_pieces_qty: Number(it.deducted_pieces_qty || 1),
      unit_cost: roundMoney(it.unit_cost),
      unit_price: roundMoney(it.unit_price),
      discount: roundMoney(it.discount),
      total_price: roundMoney(it.total_price),
      warranty_months: Number(it.warranty_months || 0),
      returned_qty: Number(it.returned_qty || 0)
    }))
    inv.payments = getPaymentsStmt.all(inv.id) as SalesPayment[]
  }

  return invoices
}

export function saveSalesInvoice(
  data: Partial<SalesInvoice> & { items: SalesItem[]; recordInTreasury?: boolean }
): SalesInvoice {
  return runTransaction(() => {
    const items = Array.isArray(data.items) ? data.items : []
    if (items.length === 0) {
      throw new Error('يرجى إضافة صنف واحد على الأقل في فاتورة المبيعات')
    }

    const invoiceType =
      data.invoice_type === 'quick_pos'
        ? 'quick_pos'
        : data.invoice_type === 'exchange'
          ? 'exchange'
          : 'regular'

    let customerId = data.customer_id ? Number(data.customer_id) : null
    let customerName =
      data.customer_name?.trim() ||
      (invoiceType === 'quick_pos' ? 'عميل نقدي (بيع سريع)' : '')
    const customerPhone = data.customer_phone?.trim() || ''

    // Ensure customer if name + phone provided or if serial items exist
    const hasSerialItem = items.some((i) => i.serial_id || (i.serial_no && i.serial_no.trim()))
    if (!customerId && customerPhone) {
      const existingCust = db
        .prepare('SELECT id, name FROM customers WHERE phone = ? LIMIT 1')
        .get(customerPhone) as { id: number; name: string } | undefined
      if (existingCust) {
        customerId = existingCust.id
        if (!customerName || customerName === 'عميل نقدي (بيع سريع)') {
          customerName = existingCust.name
        }
      } else if (customerName && customerName !== 'عميل نقدي (بيع سريع)') {
        const cInfo = db
          .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
          .run(customerName, customerPhone)
        customerId = Number(cInfo.lastInsertRowid)
      }
    } else if (!customerId && hasSerialItem && customerName && customerName !== 'عميل نقدي (بيع سريع)') {
      const cInfo = db
        .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
        .run(customerName, customerPhone || '00000000000')
      customerId = Number(cInfo.lastInsertRowid)
    }

    if (!customerName) {
      customerName = 'عميل نقدي (بيع سريع)'
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    let subtotal = 0

    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity || 1))
      const uPrice = roundMoney(it.unit_price)
      const itemDisc = roundMoney(it.discount || 0)
      subtotal = roundMoney(subtotal + Math.max(0, qty * uPrice - itemDisc))
    }

    const discount = roundMoney(data.discount ?? 0)
    const tradeInCredit = roundMoney(data.trade_in_credit ?? 0)
    const totalAmount = Math.max(0, roundMoney(subtotal - discount - tradeInCredit))
    const paidAmount = roundMoney(data.paid_amount ?? totalAmount)
    const remainingAmount = Math.max(0, roundMoney(totalAmount - paidAmount))

    if (remainingAmount > 0 && invoiceType === 'quick_pos' && !customerId && !customerPhone) {
      throw new Error('البيع السريع بدون بيانات عميل يجب أن يكون نقدياً بالكامل (بدون متبقي آجل)')
    }

    const invoiceNumber = generateNextSalesNumber()
    const paymentMethod = data.payment_method || 'cash'

    const invInfo = db
      .prepare(
        `INSERT INTO sales_invoices (
          invoice_number, invoice_type, customer_id, customer_name, customer_phone,
          subtotal, discount, trade_in_credit, total_amount, paid_amount, remaining_amount,
          payment_method, status, parent_invoice_id, notes, extra_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`
      )
      .run(
        invoiceNumber,
        invoiceType,
        customerId,
        customerName,
        customerPhone,
        subtotal,
        discount,
        tradeInCredit,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentMethod,
        data.parent_invoice_id || null,
        data.notes?.trim() || '',
        stringifyExtraData(data.extra_data)
      )
    const invoiceId = Number(invInfo.lastInsertRowid)

    for (const it of items) {
      const prodRow = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(it.product_id) as Record<string, unknown> | undefined
      if (!prodRow) throw new Error('أحد الأصناف المحددة غير موجود')
      const prod = normalizeProductRow(prodRow)

      const unit = it.unit === 'pack' ? 'pack' : 'piece'
      const packSize = Math.max(1, Number(it.pack_size || prod.pack_size || 1))
      const qty = Math.max(1, Number(it.quantity || 1))
      const deductPieces = prod.type === 'service' ? 0 : unit === 'pack' ? qty * packSize : qty

      let variantName = it.variant_name || ''
      let unitCost = roundMoney(it.unit_cost)
      if (it.variant_id) {
        const vRow = db
          .prepare('SELECT * FROM product_variants WHERE id = ?')
          .get(it.variant_id) as ProductVariant | undefined
        if (!vRow) throw new Error('المقاس / المتغير غير موجود')
        variantName = vRow.variant_name
        if (!unitCost) {
          unitCost =
            unit === 'pack'
              ? roundMoney(
                  vRow.pack_cost_price ??
                    prod.pack_cost_price ??
                    (vRow.cost_price ?? prod.cost_price) * packSize
                )
              : roundMoney(vRow.cost_price ?? prod.cost_price)
        }
        if (prod.type !== 'service' && !prod.track_serial) {
          if (vRow.qty < deductPieces) {
            throw new Error(
              `الرصيد المتاح من (${prod.name} - ${vRow.variant_name}) هو ${vRow.qty} قطعة ولا يكفي لبيع ${deductPieces}`
            )
          }
          db.prepare('UPDATE product_variants SET qty = qty - ? WHERE id = ?').run(
            deductPieces,
            vRow.id
          )
          syncProductQtyFromChildren(prod.id)
        }
      } else {
        if (!unitCost) {
          unitCost =
            unit === 'pack'
              ? roundMoney(prod.pack_cost_price || prod.cost_price * packSize)
              : roundMoney(prod.cost_price)
        }
        if (prod.type !== 'service' && !prod.track_serial) {
          if (prod.qty < deductPieces) {
            throw new Error(
              `الرصيد المتاح من (${prod.name}) هو ${prod.qty} فقط ولا يكفي لبيع ${deductPieces}`
            )
          }
          db.prepare('UPDATE products SET qty = qty - ? WHERE id = ?').run(deductPieces, prod.id)
        }
      }

      let serialId = it.serial_id ? Number(it.serial_id) : null
      let serialNo = it.serial_no?.trim() || ''
      let condition: 'new' | 'used' = it.condition === 'used' ? 'used' : 'new'

      if (prod.track_serial) {
        if (!serialId && serialNo) {
          const sLookup = db
            .prepare('SELECT * FROM product_serials WHERE serial_no = ? AND product_id = ?')
            .get(serialNo, prod.id) as ProductSerial | undefined
          if (sLookup) serialId = sLookup.id
        }
        if (!serialId) {
          throw new Error(`يرجى اختيار السيريال نمبر للصنف (${prod.name})`)
        }
        const sRow = db
          .prepare('SELECT * FROM product_serials WHERE id = ?')
          .get(serialId) as ProductSerial | undefined
        if (!sRow) throw new Error('السيريال المحدد غير موجود')
        if (sRow.status !== 'in_stock') {
          throw new Error(`السيريال (${sRow.serial_no}) غير متاح للبيع حالياً (حالته: ${sRow.status})`)
        }
        serialNo = sRow.serial_no
        condition = sRow.condition
      }

      const warrantyMonths = Number(it.warranty_months ?? prod.warranty_months ?? 0)
      let warrantyStart: string | null = it.warranty_start || null
      let warrantyEnd: string | null = it.warranty_end || null
      if (warrantyMonths > 0 && !warrantyEnd) {
        warrantyStart = warrantyStart || todayStr
        const d = new Date(warrantyStart)
        d.setMonth(d.getMonth() + warrantyMonths)
        warrantyEnd = d.toISOString().slice(0, 10)
      }

      const unitPrice = roundMoney(it.unit_price)
      const itemDisc = roundMoney(it.discount || 0)
      const totalPrice = Math.max(0, roundMoney(qty * unitPrice - itemDisc))

      const itemInfo = db
        .prepare(
          `INSERT INTO sales_items (
            invoice_id, product_id, variant_id, product_name, variant_name, item_type,
            unit, pack_size, quantity, deducted_pieces_qty, serial_id, serial_no,
            condition, ear_side, unit_cost, unit_price, discount, total_price,
            warranty_months, warranty_start, warranty_end, returned_qty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          invoiceId,
          prod.id,
          it.variant_id || null,
          prod.name,
          variantName,
          prod.type,
          unit,
          packSize,
          qty,
          deductPieces,
          serialId,
          serialNo,
          condition,
          it.ear_side || '',
          unitCost,
          unitPrice,
          itemDisc,
          totalPrice,
          warrantyMonths,
          warrantyStart,
          warrantyEnd
        )
      const saleItemId = Number(itemInfo.lastInsertRowid)

      if (prod.track_serial && serialId) {
        db.prepare(
          `UPDATE product_serials SET
            status = 'sold',
            sale_item_id = ?,
            customer_id = ?,
            ear_side = ?,
            customer_warranty_start = ?,
            customer_warranty_end = ?
           WHERE id = ?`
        ).run(
          saleItemId,
          customerId,
          it.ear_side || '',
          warrantyStart,
          warrantyEnd,
          serialId
        )
        syncProductQtyFromChildren(prod.id)

        // Automatically sync sold hearing aid / processor to customer_appliances
        if (customerId) {
          const applianceTypeLabel =
            prod.type === 'cochlear_processor'
              ? prod.sub_category || 'معالج قوقعة'
              : prod.sub_category || 'سماعة طبية'
          const extraObj = {
            ear_side: it.ear_side || '',
            sales_invoice_number: invoiceNumber,
            sales_invoice_id: invoiceId,
            condition
          }
          const existingApp = db
            .prepare(
              `SELECT id FROM customer_appliances
               WHERE customer_id = ? AND serial_number = ? AND serial_number != '' LIMIT 1`
            )
            .get(customerId, serialNo) as { id: number } | undefined

          if (existingApp) {
            db.prepare(
              `UPDATE customer_appliances SET
                appliance_type = ?, brand = ?, model = ?, last_warranty_end = ?, extra_data = ?
               WHERE id = ?`
            ).run(
              applianceTypeLabel,
              prod.brand || 'عام',
              prod.model || prod.name,
              warrantyEnd,
              stringifyExtraData(extraObj),
              existingApp.id
            )
          } else {
            db.prepare(
              `INSERT INTO customer_appliances (
                customer_id, appliance_type, brand, model, serial_number,
                purchase_date, last_warranty_end, notes, extra_data
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              customerId,
              applianceTypeLabel,
              prod.brand || 'عام',
              prod.model || prod.name,
              serialNo,
              todayStr,
              warrantyEnd,
              `مباعة بفاتورة رقم ${invoiceNumber}${it.ear_side ? ` - الأذن: ${it.ear_side}` : ''}`,
              stringifyExtraData(extraObj)
            )
          }
        }
      }

      if (prod.type !== 'service') {
        db.prepare(
          `INSERT INTO inventory_movements (
            product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
            quantity, unit_cost, unit_price, notes
          ) VALUES (?, ?, ?, 'sales_invoice', ?, 'out', ?, ?, ?, ?)`
        ).run(
          prod.id,
          it.variant_id || null,
          serialNo,
          invoiceId,
          deductPieces,
          unit === 'pack' ? roundMoney(unitCost / packSize) : unitCost,
          unit === 'pack' ? roundMoney(unitPrice / packSize) : unitPrice,
          `بيع بفاتورة ${invoiceNumber} (${customerName})`
        )
      }
    }

    // Record payment in sales_payments & treasury_transactions
    let treasuryTxId: number | null = null
    if (paidAmount > 0 && data.recordInTreasury !== false) {
      const category = invoiceType === 'quick_pos' ? 'بيع مباشر / بطاريات' : 'مبيعات سماعات وأصناف'
      const desc = `تحصيل فاتورة مبيعات ${invoiceNumber} - ${customerName}`
      const txInfo = db
        .prepare(
          `INSERT INTO treasury_transactions (
            transaction_type, category, amount, sales_invoice_id, customer_id,
            payment_method, description
          ) VALUES ('income', ?, ?, ?, ?, ?, ?)`
        )
        .run(category, paidAmount, invoiceId, customerId, paymentMethod, desc)
      treasuryTxId = Number(txInfo.lastInsertRowid)
    }

    if (paidAmount > 0) {
      db.prepare(
        `INSERT INTO sales_payments (
          invoice_id, customer_id, amount, payment_method, payment_type, treasury_tx_id, notes
        ) VALUES (?, ?, ?, ?, 'initial', ?, ?)`
      ).run(
        invoiceId,
        customerId,
        paidAmount,
        paymentMethod,
        treasuryTxId,
        `دفعة عند إصدار الفاتورة ${invoiceNumber}`
      )
    }

    return listSalesInvoices().find((i) => i.id === invoiceId)!
  })
}

export function collectSalesInstallment(payload: {
  invoice_id: number
  amount: number
  payment_method: string
  notes?: string
}): SalesInvoice {
  return runTransaction(() => {
    const raw = db
      .prepare('SELECT * FROM sales_invoices WHERE id = ?')
      .get(payload.invoice_id) as Record<string, unknown> | undefined
    if (!raw) throw new Error('فاتورة المبيعات غير موجودة')

    const inv = normalizeSalesInvoiceRow(raw)
    if (inv.remaining_amount <= 0) {
      throw new Error('هذه الفاتورة مسددة بالكامل بالفعل')
    }

    const collectAmt = roundMoney(Math.min(Number(payload.amount || 0), inv.remaining_amount))
    if (collectAmt <= 0) {
      throw new Error('يرجى إدخال مبلغ تحصيل أكبر من صفر')
    }

    const newPaid = roundMoney(inv.paid_amount + collectAmt)
    const newRemaining = Math.max(0, roundMoney(inv.total_amount - newPaid))
    const paymentMethod = payload.payment_method || 'cash'

    db.prepare(
      `UPDATE sales_invoices
       SET paid_amount = ?, remaining_amount = ?, payment_method = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(newPaid, newRemaining, paymentMethod, inv.id)

    const txInfo = db
      .prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description
        ) VALUES ('income', 'تحصيل أقساط مبيعات', ?, ?, ?, ?, ?)`
      )
      .run(
        collectAmt,
        inv.id,
        inv.customer_id,
        paymentMethod,
        payload.notes?.trim() ||
          `تحصيل قسط من فاتورة مبيعات ${inv.invoice_number} - العميل: ${inv.customer_name}`
      )
    const treasuryTxId = Number(txInfo.lastInsertRowid)

    db.prepare(
      `INSERT INTO sales_payments (
        invoice_id, customer_id, amount, payment_method, payment_type, treasury_tx_id, notes
      ) VALUES (?, ?, ?, ?, 'installment', ?, ?)`
    ).run(
      inv.id,
      inv.customer_id,
      collectAmt,
      paymentMethod,
      treasuryTxId,
      payload.notes?.trim() || `تحصيل دفعة / قسط من الفاتورة ${inv.invoice_number}`
    )

    return listSalesInvoices().find((i) => i.id === inv.id)!
  })
}

export function deleteSalesInvoice(id: number): void {
  runTransaction(() => {
    const inv = listSalesInvoices().find((i) => i.id === id)
    if (!inv) throw new Error('فاتورة المبيعات غير موجودة')

    for (const it of inv.items || []) {
      const netDeducted = Math.max(0, it.deducted_pieces_qty - (it.returned_qty || 0) * it.pack_size)
      if (it.serial_id) {
        db.prepare(
          `UPDATE product_serials
           SET status = 'in_stock', sale_item_id = NULL, customer_id = NULL,
               customer_warranty_start = NULL, customer_warranty_end = NULL
           WHERE id = ?`
        ).run(it.serial_id)
        syncProductQtyFromChildren(it.product_id)
      } else if (it.item_type !== 'service') {
        if (it.variant_id) {
          db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
            netDeducted,
            it.variant_id
          )
          syncProductQtyFromChildren(it.product_id)
        } else {
          db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(
            netDeducted,
            it.product_id
          )
        }
      }
    }

    db.prepare('DELETE FROM treasury_transactions WHERE sales_invoice_id = ?').run(inv.id)
    db.prepare('DELETE FROM sales_invoices WHERE id = ?').run(inv.id)
  })
}

// ==========================================
// 11. PHASE 3D: RETURNS & EXCHANGES (3 MODES)
// ==========================================

function generateNextReturnNumber(prefix: 'SRN' | 'PRN'): string {
  const year = new Date().getFullYear()
  const lastRow = db
    .prepare('SELECT id FROM invoice_returns ORDER BY id DESC LIMIT 1')
    .get() as { id: number } | undefined
  const nextSeq = (lastRow ? lastRow.id : 0) + 1
  return `${prefix}-${year}-${String(nextSeq).padStart(4, '0')}`
}

function generateNextExchangeNumber(): string {
  const year = new Date().getFullYear()
  const lastRow = db
    .prepare('SELECT id FROM product_exchanges ORDER BY id DESC LIMIT 1')
    .get() as { id: number } | undefined
  const nextSeq = (lastRow ? lastRow.id : 0) + 1
  return `EXC-${year}-${String(nextSeq).padStart(4, '0')}`
}

export function listInvoiceReturns(returnType?: 'sales_return' | 'purchase_return'): InvoiceReturn[] {
  let sql = 'SELECT * FROM invoice_returns'
  const params: unknown[] = []
  if (returnType) {
    sql += ' WHERE return_type = ?'
    params.push(returnType)
  }
  sql += ' ORDER BY id DESC'
  const rows = db.prepare(sql).all(...params) as InvoiceReturn[]
  const getItemsStmt = db.prepare('SELECT * FROM invoice_return_items WHERE return_id = ?')
  for (const r of rows) {
    r.total_return_amount = roundMoney(r.total_return_amount)
    r.cash_refunded = roundMoney(r.cash_refunded)
    r.balance_adjusted = roundMoney(r.balance_adjusted)
    r.items = getItemsStmt.all(r.id) as InvoiceReturnItem[]
  }
  return rows
}

export function createSalesReturn(payload: {
  invoice_id: number
  payment_method: string
  reason?: string
  items: Array<{
    invoice_item_id: number
    quantity: number
    return_condition?: 'in_stock' | 'defective'
  }>
}): InvoiceReturn {
  return runTransaction(() => {
    const inv = listSalesInvoices().find((i) => i.id === payload.invoice_id)
    if (!inv) throw new Error('فاتورة المبيعات غير موجودة')

    const reqItems = (payload.items || []).filter((x) => Number(x.quantity || 0) > 0)
    if (reqItems.length === 0) {
      throw new Error('يرجى تحديد صنف واحد على الأقل للاسترجاع')
    }

    const returnNumber = generateNextReturnNumber('SRN')
    let totalReturnAmount = 0

    const preparedItems: Array<{
      saleItem: SalesItem
      qty: number
      piecesQty: number
      cond: 'in_stock' | 'defective'
      amount: number
    }> = []

    for (const req of reqItems) {
      const sItem = (inv.items || []).find((x) => x.id === req.invoice_item_id)
      if (!sItem) throw new Error('بند الفاتورة غير موجود')
      const maxReturnable = sItem.quantity - (sItem.returned_qty || 0)
      const qty = Math.min(Number(req.quantity), maxReturnable)
      if (qty <= 0) {
        throw new Error(`الكمية المتاحة للاسترجاع من (${sItem.product_name}) هي ${maxReturnable}`)
      }
      const piecesQty = sItem.unit === 'pack' ? qty * sItem.pack_size : qty
      const netUnitPrice = roundMoney(sItem.total_price / sItem.quantity)
      const amount = roundMoney(qty * netUnitPrice)
      totalReturnAmount = roundMoney(totalReturnAmount + amount)
      preparedItems.push({
        saleItem: sItem,
        qty,
        piecesQty,
        cond: req.return_condition === 'defective' ? 'defective' : 'in_stock',
        amount
      })
    }

    // First reduce any remaining_amount on the invoice, then refund cash for the rest
    const balanceAdjusted = roundMoney(Math.min(inv.remaining_amount, totalReturnAmount))
    const cashRefunded = roundMoney(Math.max(0, totalReturnAmount - balanceAdjusted))
    const paymentMethod = payload.payment_method || inv.payment_method || 'cash'

    const retInfo = db
      .prepare(
        `INSERT INTO invoice_returns (
          return_number, return_type, invoice_id, invoice_number, party_id, party_name,
          total_return_amount, cash_refunded, balance_adjusted, payment_method, reason
        ) VALUES (?, 'sales_return', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        returnNumber,
        inv.id,
        inv.invoice_number,
        inv.customer_id,
        inv.customer_name,
        totalReturnAmount,
        cashRefunded,
        balanceAdjusted,
        paymentMethod,
        payload.reason?.trim() || 'مرتجع مبيعات'
      )
    const returnId = Number(retInfo.lastInsertRowid)

    for (const pi of preparedItems) {
      const sItem = pi.saleItem
      db.prepare('UPDATE sales_items SET returned_qty = returned_qty + ? WHERE id = ?').run(
        pi.qty,
        sItem.id
      )

      db.prepare(
        `INSERT INTO invoice_return_items (
          return_id, invoice_item_id, product_id, variant_id, product_name,
          quantity, pieces_qty, serial_id, serial_no, return_condition, amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        returnId,
        sItem.id!,
        sItem.product_id,
        sItem.variant_id || null,
        sItem.product_name,
        pi.qty,
        pi.piecesQty,
        sItem.serial_id || null,
        sItem.serial_no || '',
        pi.cond,
        pi.amount
      )

      if (sItem.serial_id) {
        db.prepare(
          `UPDATE product_serials
           SET status = ?, sale_item_id = NULL, customer_id = NULL,
               customer_warranty_start = NULL, customer_warranty_end = NULL
           WHERE id = ?`
        ).run(pi.cond, sItem.serial_id)
        syncProductQtyFromChildren(sItem.product_id)
      } else if (sItem.item_type !== 'service' && pi.cond === 'in_stock') {
        if (sItem.variant_id) {
          db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
            pi.piecesQty,
            sItem.variant_id
          )
          syncProductQtyFromChildren(sItem.product_id)
        } else {
          db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(
            pi.piecesQty,
            sItem.product_id
          )
        }
      }

      db.prepare(
        `INSERT INTO inventory_movements (
          product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
          quantity, unit_cost, unit_price, notes
        ) VALUES (?, ?, ?, 'sales_return', ?, 'in', ?, ?, ?, ?)`
      ).run(
        sItem.product_id,
        sItem.variant_id || null,
        sItem.serial_no || '',
        returnId,
        pi.piecesQty,
        sItem.unit_cost,
        sItem.unit_price,
        `مرتجع مبيعات ${returnNumber} من فاتورة ${inv.invoice_number}`
      )
    }

    // Check if all items are returned
    const updatedItems = db
      .prepare('SELECT quantity, returned_qty FROM sales_items WHERE invoice_id = ?')
      .all(inv.id) as Array<{ quantity: number; returned_qty: number }>
    const allReturned = updatedItems.every((x) => x.returned_qty >= x.quantity)
    const newStatus = allReturned ? 'returned' : 'partial_return'
    const newRemaining = Math.max(0, roundMoney(inv.remaining_amount - balanceAdjusted))
    const newPaid = Math.max(0, roundMoney(inv.paid_amount - cashRefunded))

    db.prepare(
      `UPDATE sales_invoices
       SET status = ?, paid_amount = ?, remaining_amount = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(newStatus, newPaid, newRemaining, inv.id)

    if (cashRefunded > 0) {
      const txInfo = db
        .prepare(
          `INSERT INTO treasury_transactions (
            transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description
          ) VALUES ('expense', 'مرتجع مبيعات', ?, ?, ?, ?, ?)`
        )
        .run(
          cashRefunded,
          inv.id,
          inv.customer_id,
          paymentMethod,
          `رد نقدية مرتجع مبيعات ${returnNumber} عن الفاتورة ${inv.invoice_number} - ${inv.customer_name}`
        )
      const txId = Number(txInfo.lastInsertRowid)

      db.prepare(
        `INSERT INTO sales_payments (
          invoice_id, customer_id, amount, payment_method, payment_type, treasury_tx_id, notes
        ) VALUES (?, ?, ?, ?, 'refund', ?, ?)`
      ).run(
        inv.id,
        inv.customer_id,
        -cashRefunded,
        paymentMethod,
        txId,
        `رد نقدية مرتجع ${returnNumber}`
      )
    }

    return listInvoiceReturns('sales_return').find((r) => r.id === returnId)!
  })
}

export function createPurchaseReturn(payload: {
  invoice_id: number
  payment_method: string
  reason?: string
  items: Array<{
    invoice_item_id: number
    quantity: number
    serials?: string[]
  }>
}): InvoiceReturn {
  return runTransaction(() => {
    const inv = listPurchaseInvoices().find((i) => i.id === payload.invoice_id)
    if (!inv) throw new Error('فاتورة المشتريات غير موجودة')

    const reqItems = (payload.items || []).filter((x) => Number(x.quantity || 0) > 0)
    if (reqItems.length === 0) {
      throw new Error('يرجى تحديد صنف واحد على الأقل لمرتجع المشتريات')
    }

    const returnNumber = generateNextReturnNumber('PRN')
    let totalReturnAmount = 0

    const preparedItems: Array<{
      purItem: PurchaseItem
      qty: number
      piecesQty: number
      serials: string[]
      amount: number
    }> = []

    for (const req of reqItems) {
      const pItem = (inv.items || []).find((x) => x.id === req.invoice_item_id)
      if (!pItem) throw new Error('بند فاتورة المشتريات غير موجود')
      const maxReturnable = pItem.quantity - (pItem.returned_qty || 0)
      const qty = Math.min(Number(req.quantity), maxReturnable)
      if (qty <= 0) {
        throw new Error(`الكمية المتاحة للإرجاع من (${pItem.product_name}) هي ${maxReturnable}`)
      }
      const piecesQty = pItem.unit === 'pack' ? qty * pItem.pack_size : qty
      const amount = roundMoney(qty * pItem.unit_cost)
      totalReturnAmount = roundMoney(totalReturnAmount + amount)
      preparedItems.push({
        purItem: pItem,
        qty,
        piecesQty,
        serials: Array.isArray(req.serials) ? req.serials : [],
        amount
      })
    }

    const balanceAdjusted = roundMoney(Math.min(inv.remaining_amount, totalReturnAmount))
    const cashRefunded = roundMoney(Math.max(0, totalReturnAmount - balanceAdjusted))
    const paymentMethod = payload.payment_method || inv.payment_method || 'cash'

    const retInfo = db
      .prepare(
        `INSERT INTO invoice_returns (
          return_number, return_type, invoice_id, invoice_number, party_id, party_name,
          total_return_amount, cash_refunded, balance_adjusted, payment_method, reason
        ) VALUES (?, 'purchase_return', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        returnNumber,
        inv.id,
        inv.invoice_number,
        inv.supplier_id || inv.customer_id,
        inv.party_name,
        totalReturnAmount,
        cashRefunded,
        balanceAdjusted,
        paymentMethod,
        payload.reason?.trim() || 'مرتجع مشتريات للمورد'
      )
    const returnId = Number(retInfo.lastInsertRowid)

    for (const pi of preparedItems) {
      const pItem = pi.purItem
      db.prepare('UPDATE purchase_items SET returned_qty = returned_qty + ? WHERE id = ?').run(
        pi.qty,
        pItem.id
      )

      const serialsToMark =
        pi.serials.length > 0 ? pi.serials : (pItem.serials || []).slice(0, pi.piecesQty)

      db.prepare(
        `INSERT INTO invoice_return_items (
          return_id, invoice_item_id, product_id, variant_id, product_name,
          quantity, pieces_qty, serial_id, serial_no, return_condition, amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'returned', ?)`
      ).run(
        returnId,
        pItem.id!,
        pItem.product_id,
        pItem.variant_id || null,
        pItem.product_name,
        pi.qty,
        pi.piecesQty,
        serialsToMark.join(', '),
        pi.amount
      )

      if (serialsToMark.length > 0) {
        for (const sn of serialsToMark) {
          db.prepare("UPDATE product_serials SET status = 'returned' WHERE serial_no = ?").run(sn)
        }
        syncProductQtyFromChildren(pItem.product_id)
      } else if (pItem.variant_id) {
        db.prepare('UPDATE product_variants SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          pi.piecesQty,
          pItem.variant_id
        )
        syncProductQtyFromChildren(pItem.product_id)
      } else {
        db.prepare('UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          pi.piecesQty,
          pItem.product_id
        )
      }

      db.prepare(
        `INSERT INTO inventory_movements (
          product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
          quantity, unit_cost, unit_price, notes
        ) VALUES (?, ?, ?, 'purchase_return', ?, 'out', ?, ?, 0, ?)`
      ).run(
        pItem.product_id,
        pItem.variant_id || null,
        serialsToMark.join(', '),
        returnId,
        pi.piecesQty,
        pItem.unit_cost,
        `مرتجع مشتريات ${returnNumber} من فاتورة ${inv.invoice_number}`
      )
    }

    const updatedItems = db
      .prepare('SELECT quantity, returned_qty FROM purchase_items WHERE invoice_id = ?')
      .all(inv.id) as Array<{ quantity: number; returned_qty: number }>
    const allReturned = updatedItems.every((x) => x.returned_qty >= x.quantity)
    const newStatus = allReturned ? 'returned' : 'partial_return'
    const newRemaining = Math.max(0, roundMoney(inv.remaining_amount - balanceAdjusted))
    const newPaid = Math.max(0, roundMoney(inv.paid_amount - cashRefunded))

    db.prepare(
      `UPDATE purchase_invoices
       SET status = ?, paid_amount = ?, remaining_amount = ?
       WHERE id = ?`
    ).run(newStatus, newPaid, newRemaining, inv.id)

    if (inv.supplier_id && balanceAdjusted > 0) {
      db.prepare('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
        balanceAdjusted,
        inv.supplier_id
      )
    }

    if (cashRefunded > 0) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, purchase_invoice_id, supplier_id, payment_method, description
        ) VALUES ('income', 'استرداد مرتجع مشتريات', ?, ?, ?, ?, ?)`
      ).run(
        cashRefunded,
        inv.id,
        inv.supplier_id,
        paymentMethod,
        `استرداد نقدية مرتجع مشتريات ${returnNumber} عن فاتورة ${inv.invoice_number} - ${inv.party_name}`
      )
    }

    return listInvoiceReturns('purchase_return').find((r) => r.id === returnId)!
  })
}

export function listProductExchanges(): ProductExchange[] {
  const rows = db
    .prepare('SELECT * FROM product_exchanges ORDER BY id DESC')
    .all() as ProductExchange[]
  return rows.map((r) => ({
    ...r,
    returned_value: roundMoney(r.returned_value),
    new_value: roundMoney(r.new_value),
    price_difference: roundMoney(r.price_difference),
    paid_difference: roundMoney(r.paid_difference)
  }))
}

export function processProductExchange(payload: {
  exchange_type: ExchangeType
  original_invoice_id?: number | null
  original_sale_item_id?: number | null
  customer_id?: number | null
  customer_name: string
  customer_phone?: string
  returned_product_id: number
  returned_serial_no?: string
  returned_condition?: 'in_stock' | 'used' | 'defective'
  returned_value: number
  new_product_id: number
  new_variant_id?: number | null
  new_serial_id?: number | null
  new_serial_no?: string
  new_ear_side?: string
  new_value: number
  paid_difference: number
  payment_method: string
  create_external_repair_ticket?: boolean
  external_vendor?: string
  notes?: string
}): ProductExchange {
  return runTransaction(() => {
    const exchangeNumber = generateNextExchangeNumber()
    const exType = payload.exchange_type
    const retProdRow = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.returned_product_id) as Record<string, unknown> | undefined
    if (!retProdRow) throw new Error('الصنف المرتجع غير موجود')
    const retProd = normalizeProductRow(retProdRow)

    const newProdRow = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.new_product_id) as Record<string, unknown> | undefined
    if (!newProdRow) throw new Error('الصنف البديل الجديد غير موجود')
    const newProd = normalizeProductRow(newProdRow)

    const returnedValue =
      exType === 'warranty_exchange' ? 0 : roundMoney(payload.returned_value || 0)
    const newValue = exType === 'warranty_exchange' ? 0 : roundMoney(payload.new_value || 0)
    const priceDiff =
      exType === 'warranty_exchange' ? 0 : roundMoney(newValue - returnedValue)
    const paidDiff = exType === 'warranty_exchange' ? 0 : roundMoney(payload.paid_difference || 0)
    const paymentMethod = payload.payment_method || 'cash'
    const retSerialNo = payload.returned_serial_no?.trim() || ''

    let customerId = payload.customer_id ? Number(payload.customer_id) : null
    if (!customerId && payload.customer_phone?.trim()) {
      const c = db
        .prepare('SELECT id FROM customers WHERE phone = ? LIMIT 1')
        .get(payload.customer_phone.trim()) as { id: number } | undefined
      if (c) customerId = c.id
    }

    let transferredWarrantyEnd: string | null = null
    let externalRepairTicketId: number | null = null

    // 1. Handle Returned Product / Serial according to the 3 exchange modes
    const retCond =
      exType === 'warranty_exchange'
        ? 'defective'
        : exType === 'trade_in'
          ? 'used'
          : payload.returned_condition || 'in_stock'

    if (retProd.track_serial && retSerialNo) {
      const existingRetSn = db
        .prepare('SELECT * FROM product_serials WHERE serial_no = ?')
        .get(retSerialNo) as ProductSerial | undefined

      if (existingRetSn) {
        transferredWarrantyEnd = existingRetSn.customer_warranty_end || null
        const targetStatus = retCond === 'defective' ? 'defective' : 'in_stock'
        const targetCondition = exType === 'trade_in' ? 'used' : existingRetSn.condition
        db.prepare(
          `UPDATE product_serials SET
            status = ?, condition = ?, sale_item_id = NULL, customer_id = NULL
           WHERE id = ?`
        ).run(targetStatus, targetCondition, existingRetSn.id)
      } else {
        db.prepare(
          `INSERT INTO product_serials (
            product_id, serial_no, status, condition, notes
          ) VALUES (?, ?, ?, ?, ?)`
        ).run(
          retProd.id,
          retSerialNo,
          retCond === 'defective' ? 'defective' : 'in_stock',
          exType === 'trade_in' ? 'used' : 'new',
          `استلام عبر عملية استبدال ${exchangeNumber}`
        )
      }
      syncProductQtyFromChildren(retProd.id)
    } else if (retCond !== 'defective') {
      db.prepare('UPDATE products SET qty = qty + 1 WHERE id = ?').run(retProd.id)
    }

    if (payload.original_sale_item_id) {
      db.prepare('UPDATE sales_items SET returned_qty = returned_qty + 1 WHERE id = ?').run(
        payload.original_sale_item_id
      )
    }

    // If warranty exchange & requested external repair ticket for defective unit
    if (exType === 'warranty_exchange' && payload.create_external_repair_ticket) {
      const createdTicket = saveTicket({
        customer_id: customerId || undefined,
        customer_name: payload.customer_name || 'عميل استبدال ضمان',
        customer_phone: payload.customer_phone || '00000000000',
        appliance_type: retProd.sub_category || 'سماعة طبية',
        brand: retProd.brand || 'عام',
        model: retProd.model || retProd.name,
        serial_number: retSerialNo,
        service_type: 'workshop',
        status: 'sent_to_lab',
        priority: 'warranty_return',
        is_under_previous_warranty: 1,
        is_external_repair: 1,
        external_vendor: payload.external_vendor || 'الوكيل / الشركة المصنعة',
        external_sent_date: new Date().toISOString().slice(0, 10),
        inspection_fee: 0,
        labor_cost: 0,
        total_amount: 0,
        paid_amount: 0,
        complaint: `وحدة معيبة مستردة باستبدال ضمان رقم ${exchangeNumber}`,
        recordPaymentInTreasury: false
      })
      externalRepairTicketId = createdTicket.id
    }

    // 2. Issue New Product via Sales Invoice (or direct serial replacement in warranty exchange)
    let newSerialNo = payload.new_serial_no?.trim() || ''
    if (payload.new_serial_id && !newSerialNo) {
      const ns = db
        .prepare('SELECT serial_no FROM product_serials WHERE id = ?')
        .get(payload.new_serial_id) as { serial_no: string } | undefined
      if (ns) newSerialNo = ns.serial_no
    }

    const newSaleInvoice = saveSalesInvoice({
      invoice_type: 'exchange',
      customer_id: customerId,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone || '',
      trade_in_credit: exType === 'warranty_exchange' ? 0 : returnedValue,
      discount: 0,
      paid_amount: paidDiff > 0 ? paidDiff : 0,
      payment_method: paymentMethod,
      parent_invoice_id: payload.original_invoice_id || null,
      notes:
        payload.notes?.trim() ||
        `فاتورة ناتجة عن عملية استبدال (${exchangeNumber}) - استلام: ${retProd.name}`,
      recordInTreasury: false, // We handle treasury difference explicitly below
      items: [
        {
          product_id: newProd.id,
          variant_id: payload.new_variant_id || null,
          product_name: newProd.name,
          item_type: newProd.type,
          unit: 'piece',
          pack_size: 1,
          quantity: 1,
          deducted_pieces_qty: 1,
          serial_id: payload.new_serial_id || null,
          serial_no: newSerialNo,
          ear_side: payload.new_ear_side || '',
          unit_cost: newProd.cost_price,
          unit_price: exType === 'warranty_exchange' ? 0 : newValue,
          discount: 0,
          total_price: exType === 'warranty_exchange' ? 0 : newValue,
          warranty_months: newProd.warranty_months,
          warranty_end:
            exType === 'warranty_exchange' && transferredWarrantyEnd
              ? transferredWarrantyEnd
              : null,
          returned_qty: 0
        }
      ]
    })

    // 3. Record Treasury Movement for paid_difference (if any)
    if (paidDiff > 0) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description
        ) VALUES ('income', 'فارق استبدال وترقية', ?, ?, ?, ?, ?)`
      ).run(
        paidDiff,
        newSaleInvoice.id,
        customerId,
        paymentMethod,
        `تحصيل فارق استبدال (${exchangeNumber}): تسليم (${newProd.name}) مقابل (${retProd.name}) - ${payload.customer_name}`
      )
    } else if (paidDiff < 0) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description
        ) VALUES ('expense', 'رد فارق استبدال للعميل', ?, ?, ?, ?, ?)`
      ).run(
        Math.abs(paidDiff),
        newSaleInvoice.id,
        customerId,
        paymentMethod,
        `رد فارق استبدال (${exchangeNumber}) للعميل: ${payload.customer_name}`
      )
    }

    const exInfo = db
      .prepare(
        `INSERT INTO product_exchanges (
          exchange_number, exchange_type, original_invoice_id, new_invoice_id,
          customer_id, customer_name, returned_product_id, returned_product_name,
          returned_serial_no, returned_condition, returned_value,
          new_product_id, new_product_name, new_serial_no, new_value,
          price_difference, paid_difference, payment_method,
          transferred_warranty_end, external_repair_ticket_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        exchangeNumber,
        exType,
        payload.original_invoice_id || null,
        newSaleInvoice.id,
        customerId,
        payload.customer_name,
        retProd.id,
        retProd.name,
        retSerialNo,
        retCond,
        returnedValue,
        newProd.id,
        newProd.name,
        newSerialNo,
        newValue,
        priceDiff,
        paidDiff,
        paymentMethod,
        transferredWarrantyEnd,
        externalRepairTicketId,
        payload.notes?.trim() || ''
      )

    const exchangeId = Number(exInfo.lastInsertRowid)
    return listProductExchanges().find((e) => e.id === exchangeId)!
  })
}

// ==========================================
// 12. PHASE 3E: MAINTENANCE TICKET SERIAL / INVOICE LOOKUP & LOANER RETURN
// ==========================================

export function lookupSerialOrInvoiceForTicket(query: string): {
  found: boolean
  serial?: ProductSerial
  product?: Product
  invoice?: SalesInvoice
  customer?: Customer | null
  isUnderWarranty: boolean
  warrantyEndDate?: string | null
  earSide?: string
} {
  const clean = (query || '').trim()
  if (!clean) return { found: false, isUnderWarranty: false }

  const today = new Date().toISOString().slice(0, 10)

  // 1. Search by Serial Number first
  const serialRow = db
    .prepare('SELECT * FROM product_serials WHERE serial_no = ? LIMIT 1')
    .get(clean) as ProductSerial | undefined

  if (serialRow) {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(serialRow.product_id) as Record<string, unknown> | undefined
    const product = rawProd ? normalizeProductRow(rawProd) : undefined

    let invoice: SalesInvoice | undefined
    if (serialRow.sale_item_id) {
      const sItem = db
        .prepare('SELECT invoice_id FROM sales_items WHERE id = ?')
        .get(serialRow.sale_item_id) as { invoice_id: number } | undefined
      if (sItem) {
        invoice = listSalesInvoices().find((i) => i.id === sItem.invoice_id)
      }
    }

    let customer: Customer | null = null
    const custId = serialRow.customer_id || invoice?.customer_id
    if (custId) {
      const rawCust = db
        .prepare('SELECT * FROM customers WHERE id = ?')
        .get(custId) as Record<string, unknown> | undefined
      if (rawCust) customer = normalizeCustomerRow(rawCust)
    }

    const warrantyEnd = serialRow.customer_warranty_end || null
    const isUnderWarranty = Boolean(warrantyEnd && warrantyEnd >= today)

    return {
      found: true,
      serial: serialRow,
      product,
      invoice,
      customer,
      isUnderWarranty,
      warrantyEndDate: warrantyEnd,
      earSide: serialRow.ear_side || ''
    }
  }

  // 2. Search by Sales Invoice Number or ID
  const invRow = db
    .prepare('SELECT id FROM sales_invoices WHERE invoice_number = ? OR CAST(id AS TEXT) = ? LIMIT 1')
    .get(clean, clean) as { id: number } | undefined

  if (invRow) {
    const invoice = listSalesInvoices().find((i) => i.id === invRow.id)
    if (invoice) {
      let customer: Customer | null = null
      if (invoice.customer_id) {
        const rawCust = db
          .prepare('SELECT * FROM customers WHERE id = ?')
          .get(invoice.customer_id) as Record<string, unknown> | undefined
        if (rawCust) customer = normalizeCustomerRow(rawCust)
      }
      const firstDeviceItem =
        (invoice.items || []).find((x) => x.serial_id || x.serial_no) || (invoice.items || [])[0]
      let product: Product | undefined
      let serial: ProductSerial | undefined
      if (firstDeviceItem) {
        const rawProd = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(firstDeviceItem.product_id) as Record<string, unknown> | undefined
        if (rawProd) product = normalizeProductRow(rawProd)
        if (firstDeviceItem.serial_id) {
          serial = db
            .prepare('SELECT * FROM product_serials WHERE id = ?')
            .get(firstDeviceItem.serial_id) as ProductSerial | undefined
        }
      }
      const warrantyEnd =
        serial?.customer_warranty_end || firstDeviceItem?.warranty_end || null
      const isUnderWarranty = Boolean(warrantyEnd && warrantyEnd >= today)

      return {
        found: true,
        serial,
        product,
        invoice,
        customer,
        isUnderWarranty,
        warrantyEndDate: warrantyEnd,
        earSide: serial?.ear_side || firstDeviceItem?.ear_side || ''
      }
    }
  }

  return { found: false, isUnderWarranty: false }
}

export function returnTicketLoaner(ticketId: number): MaintenanceTicket {
  return runTransaction(() => {
    const raw = db
      .prepare('SELECT * FROM maintenance_tickets WHERE id = ?')
      .get(ticketId) as Record<string, unknown> | undefined
    if (!raw) throw new Error('طلب الصيانة غير موجود')

    const ticket = normalizeTicketRow(raw)
    if (!ticket.loaner_serial_id) {
      throw new Error('لا توجد سماعة بديلة مؤقتة مسجلة على هذا الطلب')
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ')
    db.prepare(
      `UPDATE maintenance_tickets
       SET loaner_returned_at = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(nowStr, ticketId)

    const lRow = db
      .prepare('SELECT product_id FROM product_serials WHERE id = ?')
      .get(ticket.loaner_serial_id) as { product_id: number } | undefined

    db.prepare(
      "UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?"
    ).run(ticket.loaner_serial_id)

    if (lRow) {
      syncProductQtyFromChildren(lRow.product_id)
    }

    return listTickets({}).find((t) => t.id === ticketId)!
  })
}

// ==========================================
// 13. PHASE 4: PATIENT MEDICAL PROFILE, AUDIOLOGY, FOLLOW-UPS, EARMOLDS & IMPLANTS
// ==========================================

function generateNextTestNumber(): string {
  const row = db.prepare('SELECT id FROM hearing_tests ORDER BY id DESC LIMIT 1').get() as
    | { id: number }
    | undefined
  const next = (row?.id || 0) + 1
  return `AUD-${String(next).padStart(4, '0')}`
}

function generateNextEarmoldNumber(): string {
  const row = db.prepare('SELECT id FROM earmold_orders ORDER BY id DESC LIMIT 1').get() as
    | { id: number }
    | undefined
  const next = (row?.id || 0) + 1
  return `MLD-${String(next).padStart(4, '0')}`
}

export function calculatePtaAndSuggestLoss(points: AudiogramPoint[]): {
  pta_right: number | null
  pta_left: number | null
  loss_degree_right: string
  loss_degree_left: string
  loss_type_right: string
  loss_type_left: string
} {
  const ptaFreqs = new Set([500, 1000, 2000, 4000])

  const computeForEar = (ear: 'right' | 'left') => {
    const airPts = points.filter(
      (p) => p.ear === ear && p.conduction === 'air' && ptaFreqs.has(Number(p.frequency))
    )
    const bonePts = points.filter(
      (p) => p.ear === ear && p.conduction === 'bone' && ptaFreqs.has(Number(p.frequency))
    )

    if (airPts.length === 0) {
      return { pta: null, degree: '', type: '' }
    }

    const airAvg =
      Math.round(
        (airPts.reduce((sum, p) => sum + Number(p.db_value), 0) / airPts.length) * 10
      ) / 10

    let degree = 'طبيعي (Normal)'
    if (airAvg <= 25) degree = 'طبيعي (≤25 dB)'
    else if (airAvg <= 40) degree = 'ضعف خفيف (Mild 26-40 dB)'
    else if (airAvg <= 55) degree = 'ضعف متوسط (Moderate 41-55 dB)'
    else if (airAvg <= 70) degree = 'متوسط الشدة (Mod-Severe 56-70 dB)'
    else if (airAvg <= 90) degree = 'ضعف شديد (Severe 71-90 dB)'
    else degree = 'ضعف عميق (Profound >90 dB)'

    let type = 'سمع طبيعي'
    if (airAvg > 25) {
      if (bonePts.length > 0) {
        const boneAvg =
          bonePts.reduce((sum, p) => sum + Number(p.db_value), 0) / bonePts.length
        const abg = airAvg - boneAvg
        if (boneAvg <= 25 && abg >= 15) {
          type = 'ضعف سمعي توصيلي (Conductive)'
        } else if (boneAvg > 25 && abg < 15) {
          type = 'ضعف سمعي حسي عصبي (Sensorineural)'
        } else {
          type = 'ضعف سمعي مختلط (Mixed)'
        }
      } else {
        type = 'ضعف سمعي حسي عصبي (Sensorineural)'
      }
    }

    return { pta: airAvg, degree, type }
  }

  const r = computeForEar('right')
  const l = computeForEar('left')

  return {
    pta_right: r.pta,
    pta_left: l.pta,
    loss_degree_right: r.degree,
    loss_degree_left: l.degree,
    loss_type_right: r.type,
    loss_type_left: l.type
  }
}

function normalizeHearingTestRow(row: Record<string, unknown>): HearingTest {
  const id = Number(row.id)
  const points = db
    .prepare(
      `SELECT * FROM audiogram_points
       WHERE test_id = ?
       ORDER BY ear ASC, conduction ASC, frequency ASC`
    )
    .all(id) as AudiogramPoint[]

  return {
    ...(row as unknown as HearingTest),
    srt_right: row.srt_right !== null && row.srt_right !== undefined ? Number(row.srt_right) : null,
    srt_left: row.srt_left !== null && row.srt_left !== undefined ? Number(row.srt_left) : null,
    sds_right: row.sds_right !== null && row.sds_right !== undefined ? Number(row.sds_right) : null,
    sds_left: row.sds_left !== null && row.sds_left !== undefined ? Number(row.sds_left) : null,
    mcl_right: row.mcl_right !== null && row.mcl_right !== undefined ? Number(row.mcl_right) : null,
    mcl_left: row.mcl_left !== null && row.mcl_left !== undefined ? Number(row.mcl_left) : null,
    ucl_right: row.ucl_right !== null && row.ucl_right !== undefined ? Number(row.ucl_right) : null,
    ucl_left: row.ucl_left !== null && row.ucl_left !== undefined ? Number(row.ucl_left) : null,
    pta_right: row.pta_right !== null && row.pta_right !== undefined ? Number(row.pta_right) : null,
    pta_left: row.pta_left !== null && row.pta_left !== undefined ? Number(row.pta_left) : null,
    points
  }
}

export function listHearingTests(filters?: {
  patient_id?: number
  search?: string
}): HearingTest[] {
  const clauses: string[] = ['1=1']
  const params: unknown[] = []

  if (filters?.patient_id) {
    clauses.push('ht.patient_id = ?')
    params.push(Number(filters.patient_id))
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.push('(ht.test_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR ht.notes LIKE ?)')
    params.push(q, q, q, q)
  }

  const rows = db
    .prepare(
      `SELECT ht.*,
              c.name as patient_name,
              c.phone as patient_phone,
              c.birth_date as patient_birth_date,
              c.gender as patient_gender
       FROM hearing_tests ht
       LEFT JOIN customers c ON c.id = ht.patient_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ht.test_date DESC, ht.id DESC`
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(normalizeHearingTestRow)
}

export function saveHearingTest(
  data: Partial<HearingTest> & { points?: AudiogramPoint[] }
): HearingTest {
  return runTransaction(() => {
    if (!data.patient_id) throw new Error('يجب تحديد المريض لحفظ فحص السمع')
    const pts = Array.isArray(data.points) ? data.points : []
    const autoCalc = calculatePtaAndSuggestLoss(pts)

    const ptaRight =
      data.pta_right !== undefined && data.pta_right !== null
        ? Number(data.pta_right)
        : autoCalc.pta_right
    const ptaLeft =
      data.pta_left !== undefined && data.pta_left !== null
        ? Number(data.pta_left)
        : autoCalc.pta_left
    const lossDegreeRight = data.loss_degree_right?.trim() || autoCalc.loss_degree_right
    const lossDegreeLeft = data.loss_degree_left?.trim() || autoCalc.loss_degree_left
    const lossTypeRight = data.loss_type_right?.trim() || autoCalc.loss_type_right
    const lossTypeLeft = data.loss_type_left?.trim() || autoCalc.loss_type_left

    let examinerName = data.examiner_name?.trim() || ''
    if (data.examiner_id && !examinerName) {
      const tech = db
        .prepare('SELECT name FROM technicians WHERE id = ?')
        .get(data.examiner_id) as { name: string } | undefined
      if (tech) examinerName = tech.name
    }

    let recProdName = data.recommended_product_name?.trim() || ''
    if (data.recommended_product_id && !recProdName) {
      const prod = db
        .prepare('SELECT name, brand, model FROM products WHERE id = ?')
        .get(data.recommended_product_id) as { name: string; brand: string; model: string } | undefined
      if (prod) recProdName = `${prod.name} (${prod.brand} ${prod.model})`.trim()
    }

    let testId = Number(data.id || 0)
    if (testId > 0) {
      db.prepare(
        `UPDATE hearing_tests SET
          test_date = ?, examiner_id = ?, examiner_name = ?, test_type = ?,
          srt_right = ?, srt_left = ?, sds_right = ?, sds_left = ?,
          mcl_right = ?, mcl_left = ?, ucl_right = ?, ucl_left = ?,
          tymp_right = ?, tymp_left = ?,
          pta_right = ?, pta_left = ?,
          loss_type_right = ?, loss_type_left = ?,
          loss_degree_right = ?, loss_degree_left = ?,
          recommended_product_id = ?, recommended_product_name = ?,
          recommendation_notes = ?, notes = ?
         WHERE id = ?`
      ).run(
        data.test_date || new Date().toISOString().slice(0, 10),
        data.examiner_id || null,
        examinerName,
        data.test_type || 'pure_tone',
        data.srt_right !== undefined && data.srt_right !== null && String(data.srt_right) !== ''
          ? Number(data.srt_right)
          : null,
        data.srt_left !== undefined && data.srt_left !== null && String(data.srt_left) !== ''
          ? Number(data.srt_left)
          : null,
        data.sds_right !== undefined && data.sds_right !== null && String(data.sds_right) !== ''
          ? Number(data.sds_right)
          : null,
        data.sds_left !== undefined && data.sds_left !== null && String(data.sds_left) !== ''
          ? Number(data.sds_left)
          : null,
        data.mcl_right !== undefined && data.mcl_right !== null && String(data.mcl_right) !== ''
          ? Number(data.mcl_right)
          : null,
        data.mcl_left !== undefined && data.mcl_left !== null && String(data.mcl_left) !== ''
          ? Number(data.mcl_left)
          : null,
        data.ucl_right !== undefined && data.ucl_right !== null && String(data.ucl_right) !== ''
          ? Number(data.ucl_right)
          : null,
        data.ucl_left !== undefined && data.ucl_left !== null && String(data.ucl_left) !== ''
          ? Number(data.ucl_left)
          : null,
        data.tymp_right?.trim() || '',
        data.tymp_left?.trim() || '',
        ptaRight,
        ptaLeft,
        lossTypeRight,
        lossTypeLeft,
        lossDegreeRight,
        lossDegreeLeft,
        data.recommended_product_id || null,
        recProdName,
        data.recommendation_notes?.trim() || '',
        data.notes?.trim() || '',
        testId
      )
    } else {
      const testNumber = data.test_number?.trim() || generateNextTestNumber()
      const info = db
        .prepare(
          `INSERT INTO hearing_tests (
            test_number, patient_id, test_date, examiner_id, examiner_name, test_type,
            srt_right, srt_left, sds_right, sds_left,
            mcl_right, mcl_left, ucl_right, ucl_left,
            tymp_right, tymp_left,
            pta_right, pta_left,
            loss_type_right, loss_type_left,
            loss_degree_right, loss_degree_left,
            recommended_product_id, recommended_product_name,
            recommendation_notes, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          testNumber,
          Number(data.patient_id),
          data.test_date || new Date().toISOString().slice(0, 10),
          data.examiner_id || null,
          examinerName,
          data.test_type || 'pure_tone',
          data.srt_right !== undefined && data.srt_right !== null && String(data.srt_right) !== ''
            ? Number(data.srt_right)
            : null,
          data.srt_left !== undefined && data.srt_left !== null && String(data.srt_left) !== ''
            ? Number(data.srt_left)
            : null,
          data.sds_right !== undefined && data.sds_right !== null && String(data.sds_right) !== ''
            ? Number(data.sds_right)
            : null,
          data.sds_left !== undefined && data.sds_left !== null && String(data.sds_left) !== ''
            ? Number(data.sds_left)
            : null,
          data.mcl_right !== undefined && data.mcl_right !== null && String(data.mcl_right) !== ''
            ? Number(data.mcl_right)
            : null,
          data.mcl_left !== undefined && data.mcl_left !== null && String(data.mcl_left) !== ''
            ? Number(data.mcl_left)
            : null,
          data.ucl_right !== undefined && data.ucl_right !== null && String(data.ucl_right) !== ''
            ? Number(data.ucl_right)
            : null,
          data.ucl_left !== undefined && data.ucl_left !== null && String(data.ucl_left) !== ''
            ? Number(data.ucl_left)
            : null,
          data.tymp_right?.trim() || '',
          data.tymp_left?.trim() || '',
          ptaRight,
          ptaLeft,
          lossTypeRight,
          lossTypeLeft,
          lossDegreeRight,
          lossDegreeLeft,
          data.recommended_product_id || null,
          recProdName,
          data.recommendation_notes?.trim() || '',
          data.notes?.trim() || ''
        )
      testId = Number(info.lastInsertRowid)
    }

    // Replace audiogram_points
    db.prepare('DELETE FROM audiogram_points WHERE test_id = ?').run(testId)
    const insertPoint = db.prepare(
      `INSERT OR REPLACE INTO audiogram_points (
        test_id, ear, conduction, frequency, db_value, is_masked, no_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    for (const pt of pts) {
      if (pt.db_value === undefined || pt.db_value === null || Number.isNaN(Number(pt.db_value))) {
        continue
      }
      const clampedDb = Math.max(-10, Math.min(120, Number(pt.db_value)))
      insertPoint.run(
        testId,
        pt.ear === 'left' ? 'left' : 'right',
        pt.conduction === 'bone' ? 'bone' : 'air',
        Number(pt.frequency),
        clampedDb,
        pt.is_masked ? 1 : 0,
        pt.no_response ? 1 : 0
      )
    }

    return listHearingTests({ patient_id: Number(data.patient_id) }).find((t) => t.id === testId)!
  })
}

export function deleteHearingTest(id: number): void {
  db.prepare('DELETE FROM hearing_tests WHERE id = ?').run(id)
}

export function getLatestHearingTestSummary(patientId: number): {
  latestTest: HearingTest | null
  allTests: HearingTest[]
  testsCount: number
  implantsCount: number
  latestFollowup: FollowupItem | null
  allergies: string
  medicalComplaint: string
} {
  const tests = listHearingTests({ patient_id: patientId })
  const cust = db
    .prepare('SELECT allergies, medical_complaint FROM customers WHERE id = ?')
    .get(patientId) as { allergies?: string; medical_complaint?: string } | undefined
  const implantsCnt = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM implants WHERE patient_id = ?')
      .get(patientId) as { cnt: number }
  ).cnt
  const followups = listFollowups({ patient_id: patientId })

  return {
    latestTest: tests[0] || null,
    allTests: tests.slice(0, 5),
    testsCount: tests.length,
    implantsCount: implantsCnt || 0,
    latestFollowup: followups[0] || null,
    allergies: cust?.allergies || '',
    medicalComplaint: cust?.medical_complaint || ''
  }
}

// ==========================================
// FOLLOW-UPS & FITTING SESSIONS (4.3)
// ==========================================

function normalizeFollowupRow(row: Record<string, unknown>): FollowupItem {
  return {
    ...(row as unknown as FollowupItem),
    fitting_settings: parseJsonObject(row.fitting_settings_json) as FittingSettings
  }
}

export function listFollowups(filters?: {
  patient_id?: number
  status?: string
  filter_mode?: 'all' | 'today' | 'overdue' | 'upcoming' | 'completed'
  type?: string
  search?: string
}): FollowupItem[] {
  const today = new Date().toISOString().slice(0, 10)
  const clauses: string[] = ['1=1']
  const params: unknown[] = []

  if (filters?.patient_id) {
    clauses.push('f.patient_id = ?')
    params.push(Number(filters.patient_id))
  }
  if (filters?.status && filters.status !== 'all') {
    clauses.push('f.status = ?')
    params.push(filters.status)
  }
  if (filters?.type && filters.type !== 'all') {
    clauses.push('f.type = ?')
    params.push(filters.type)
  }
  if (filters?.filter_mode === 'today') {
    clauses.push("f.status = 'pending' AND f.due_date = ?")
    params.push(today)
  } else if (filters?.filter_mode === 'overdue') {
    clauses.push("f.status = 'pending' AND f.due_date < ?")
    params.push(today)
  } else if (filters?.filter_mode === 'upcoming') {
    clauses.push("f.status = 'pending' AND f.due_date >= ?")
    params.push(today)
  } else if (filters?.filter_mode === 'completed') {
    clauses.push("f.status = 'completed'")
  }

  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.push('(c.name LIKE ? OR c.phone LIKE ? OR f.serial_no LIKE ? OR f.notes LIKE ?)')
    params.push(q, q, q, q)
  }

  const rows = db
    .prepare(
      `SELECT f.*,
              c.name as patient_name,
              c.phone as patient_phone,
              CASE WHEN ca.id IS NOT NULL
                   THEN ca.appliance_type || ' - ' || ca.brand || ' ' || ca.model
                   ELSE '' END as device_name,
              t.name as technician_name
       FROM followups f
       LEFT JOIN customers c ON c.id = f.patient_id
       LEFT JOIN customer_appliances ca ON ca.id = f.device_id
       LEFT JOIN technicians t ON t.id = f.technician_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY CASE WHEN f.status = 'pending' THEN 0 ELSE 1 END ASC, f.due_date ASC, f.id DESC`
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(normalizeFollowupRow)
}

export function saveFollowup(data: Partial<FollowupItem>): FollowupItem {
  if (!data.patient_id) throw new Error('يجب تحديد المريض لحفظ المتابعة')
  const fittingJson = stringifyExtraData(data.fitting_settings)
  const dueDate = data.due_date || new Date().toISOString().slice(0, 10)
  const status = data.status || 'pending'
  const doneDate =
    status === 'completed'
      ? data.done_date || new Date().toISOString().slice(0, 10)
      : data.done_date || null

  if (data.id) {
    db.prepare(
      `UPDATE followups SET
        device_id = ?, serial_no = ?, implant_id = ?, type = ?, status = ?,
        due_date = ?, done_date = ?, technician_id = ?, fitting_settings_json = ?, notes = ?
       WHERE id = ?`
    ).run(
      data.device_id || null,
      data.serial_no?.trim() || '',
      data.implant_id || null,
      data.type || 'fitting',
      status,
      dueDate,
      doneDate,
      data.technician_id || null,
      fittingJson,
      data.notes?.trim() || '',
      data.id
    )
    return listFollowups({ patient_id: Number(data.patient_id) }).find((f) => f.id === data.id)!
  } else {
    const info = db
      .prepare(
        `INSERT INTO followups (
          patient_id, device_id, serial_no, implant_id, type, status,
          due_date, done_date, technician_id, fitting_settings_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(data.patient_id),
        data.device_id || null,
        data.serial_no?.trim() || '',
        data.implant_id || null,
        data.type || 'fitting',
        status,
        dueDate,
        doneDate,
        data.technician_id || null,
        fittingJson,
        data.notes?.trim() || ''
      )
    const newId = Number(info.lastInsertRowid)
    return listFollowups({ patient_id: Number(data.patient_id) }).find((f) => f.id === newId)!
  }
}

export function completeFollowup(payload: {
  id: number
  notes?: string
  fitting_settings?: FittingSettings
  schedule_next_date?: string | null
  next_type?: FollowupItem['type']
}): FollowupItem {
  return runTransaction(() => {
    const existingRaw = db
      .prepare('SELECT * FROM followups WHERE id = ?')
      .get(payload.id) as Record<string, unknown> | undefined
    if (!existingRaw) throw new Error('سجل المتابعة غير موجود')
    const existing = normalizeFollowupRow(existingRaw)

    const today = new Date().toISOString().slice(0, 10)
    const mergedFitting = {
      ...(existing.fitting_settings || {}),
      ...(payload.fitting_settings || {})
    }
    const mergedNotes = payload.notes?.trim() || existing.notes

    db.prepare(
      `UPDATE followups SET
        status = 'completed', done_date = ?, fitting_settings_json = ?, notes = ?
       WHERE id = ?`
    ).run(today, stringifyExtraData(mergedFitting), mergedNotes, payload.id)

    if (payload.schedule_next_date) {
      db.prepare(
        `INSERT INTO followups (
          patient_id, device_id, serial_no, implant_id, type, status,
          due_date, technician_id, fitting_settings_json, notes
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, '{}', ?)`
      ).run(
        existing.patient_id,
        existing.device_id,
        existing.serial_no,
        existing.implant_id,
        payload.next_type || existing.type,
        payload.schedule_next_date,
        existing.technician_id,
        `موعد متابعة تالٍ مجدول تلقائياً بعد جلسة ${today}`
      )
    }

    return listFollowups({ patient_id: existing.patient_id }).find((f) => f.id === payload.id)!
  })
}

export function deleteFollowup(id: number): void {
  db.prepare('DELETE FROM followups WHERE id = ?').run(id)
}

// ==========================================
// EARMOLD ORDERS (4.3.1)
// ==========================================

function normalizeEarmoldRow(row: Record<string, unknown>): EarmoldOrder {
  return {
    ...(row as unknown as EarmoldOrder),
    lab_cost: roundMoney(row.lab_cost),
    customer_price: roundMoney(row.customer_price)
  }
}

export function listEarmoldOrders(filters?: {
  patient_id?: number
  status?: string
  overdue_only?: boolean
  search?: string
}): EarmoldOrder[] {
  const today = new Date().toISOString().slice(0, 10)
  const clauses: string[] = ['1=1']
  const params: unknown[] = []

  if (filters?.patient_id) {
    clauses.push('eo.patient_id = ?')
    params.push(Number(filters.patient_id))
  }
  if (filters?.status && filters.status !== 'all') {
    clauses.push('eo.status = ?')
    params.push(filters.status)
  }
  if (filters?.overdue_only) {
    clauses.push(
      "eo.status = 'sent_to_lab' AND eo.expected_date IS NOT NULL AND eo.expected_date != '' AND eo.expected_date < ?"
    )
    params.push(today)
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.push(
      '(eo.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR eo.lab_name LIKE ? OR eo.mold_type LIKE ?)'
    )
    params.push(q, q, q, q, q)
  }

  const rows = db
    .prepare(
      `SELECT eo.*,
              c.name as patient_name,
              c.phone as patient_phone,
              CASE WHEN ca.id IS NOT NULL
                   THEN ca.appliance_type || ' - ' || ca.brand || ' ' || ca.model
                   ELSE '' END as device_name,
              si.invoice_number as sales_invoice_number,
              orig.order_number as remake_of_number
       FROM earmold_orders eo
       LEFT JOIN customers c ON c.id = eo.patient_id
       LEFT JOIN customer_appliances ca ON ca.id = eo.device_id
       LEFT JOIN sales_invoices si ON si.id = eo.sales_invoice_id
       LEFT JOIN earmold_orders orig ON orig.id = eo.remake_of_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY eo.id DESC`
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(normalizeEarmoldRow)
}

export function saveEarmoldOrder(
  data: Partial<EarmoldOrder> & {
    recordLabCostInTreasury?: boolean
    payment_method?: string
    createSalesInvoiceForMold?: boolean
  }
): EarmoldOrder {
  return runTransaction(() => {
    if (!data.patient_id) throw new Error('يجب تحديد المريض لحفظ طلب القالب')
    const cust = db
      .prepare('SELECT id, name, phone FROM customers WHERE id = ?')
      .get(data.patient_id) as { id: number; name: string; phone: string } | undefined
    if (!cust) throw new Error('ملف المريض غير موجود')

    const labCost = roundMoney(data.lab_cost || 0)
    const custPrice = roundMoney(data.customer_price || 0)
    const status: EarmoldStatus = data.status || 'impression_taken'
    const today = new Date().toISOString().slice(0, 10)
    const paymentMethod = data.payment_method || 'cash'

    let salesInvoiceId = data.sales_invoice_id || null
    let isLabCostPaid = Number(data.is_lab_cost_paid || 0)

    // Optionally create a Sales Invoice for the Earmold service
    if (!salesInvoiceId && data.createSalesInvoiceForMold && custPrice > 0) {
      let moldServiceProduct = db
        .prepare("SELECT * FROM products WHERE type IN ('earmold', 'service') LIMIT 1")
        .get() as Record<string, unknown> | undefined
      if (!moldServiceProduct) {
        const created = saveProduct({
          name: 'تفصيل قالب أذن طبي مخصص',
          type: 'service',
          sub_category: 'قوالب أذن (Earmolds)',
          sale_price: custPrice,
          cost_price: labCost,
          warranty_months: 3
        })
        moldServiceProduct = created as unknown as Record<string, unknown>
      }
      const createdInv = saveSalesInvoice({
        invoice_type: 'regular',
        customer_id: cust.id,
        customer_name: cust.name,
        customer_phone: cust.phone,
        subtotal: custPrice,
        discount: 0,
        total_amount: custPrice,
        paid_amount: custPrice,
        remaining_amount: 0,
        payment_method: paymentMethod,
        notes: `فاتورة طلب قالب أذن (${data.mold_type || 'قالب طبي'} - ${data.ear === 'bilateral' ? 'الأذنين' : data.ear === 'left' ? 'يسار' : 'يمين'})`,
        recordInTreasury: true,
        items: [
          {
            product_id: Number(moldServiceProduct.id),
            product_name: `قالب أذن: ${data.mold_type || 'مخصص'} (${data.material || ''})`,
            item_type: 'service',
            unit: 'piece',
            pack_size: 1,
            quantity: data.ear === 'bilateral' ? 2 : 1,
            deducted_pieces_qty: 0,
            unit_cost: labCost,
            unit_price: custPrice,
            discount: 0,
            total_price: custPrice,
            warranty_months: 3
          }
        ]
      })
      salesInvoiceId = createdInv.id
    }

    if (data.recordLabCostInTreasury && labCost > 0 && !isLabCostPaid) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, customer_id, payment_method, description
        ) VALUES ('expense', 'مصروفات معمل قوالب', ?, ?, ?, ?)`
      ).run(
        labCost,
        cust.id,
        paymentMethod,
        `تكلفة معمل قوالب (${data.lab_name || 'المعمل'}) للمريض: ${cust.name} - ${data.mold_type || ''}`
      )
      isLabCostPaid = 1
    }

    if (data.id) {
      db.prepare(
        `UPDATE earmold_orders SET
          device_id = ?, sales_invoice_id = ?, ear = ?, mold_type = ?, material = ?,
          color = ?, vent_size = ?, tube_type = ?, impression_date = ?,
          lab_name = ?, sent_date = ?, expected_date = ?, received_date = ?, delivered_date = ?,
          status = ?, lab_cost = ?, customer_price = ?, is_lab_cost_paid = ?, notes = ?
         WHERE id = ?`
      ).run(
        data.device_id || null,
        salesInvoiceId,
        data.ear || 'right',
        data.mold_type?.trim() || '',
        data.material?.trim() || '',
        data.color?.trim() || 'شفاف',
        data.vent_size?.trim() || 'بدون تهوية (No Vent)',
        data.tube_type?.trim() || 'عادي (Standard #13)',
        data.impression_date || today,
        data.lab_name?.trim() || '',
        data.sent_date || (status === 'sent_to_lab' ? today : null),
        data.expected_date || null,
        data.received_date || (status === 'received' ? today : null),
        data.delivered_date || (status === 'delivered' ? today : null),
        status,
        labCost,
        custPrice,
        isLabCostPaid,
        data.notes?.trim() || '',
        data.id
      )
      return listEarmoldOrders({ patient_id: cust.id }).find((o) => o.id === data.id)!
    } else {
      const orderNumber = data.order_number?.trim() || generateNextEarmoldNumber()
      const info = db
        .prepare(
          `INSERT INTO earmold_orders (
            order_number, patient_id, device_id, sales_invoice_id, ear,
            mold_type, material, color, vent_size, tube_type, impression_date,
            lab_name, sent_date, expected_date, received_date, delivered_date,
            status, lab_cost, customer_price, is_lab_cost_paid, remake_of_id, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orderNumber,
          cust.id,
          data.device_id || null,
          salesInvoiceId,
          data.ear || 'right',
          data.mold_type?.trim() || '',
          data.material?.trim() || '',
          data.color?.trim() || 'شفاف',
          data.vent_size?.trim() || 'بدون تهوية (No Vent)',
          data.tube_type?.trim() || 'عادي (Standard #13)',
          data.impression_date || today,
          data.lab_name?.trim() || '',
          data.sent_date || (status === 'sent_to_lab' ? today : null),
          data.expected_date || null,
          data.received_date || (status === 'received' ? today : null),
          data.delivered_date || (status === 'delivered' ? today : null),
          status,
          labCost,
          custPrice,
          isLabCostPaid,
          data.remake_of_id || null,
          data.notes?.trim() || ''
        )
      const newId = Number(info.lastInsertRowid)
      return listEarmoldOrders({ patient_id: cust.id }).find((o) => o.id === newId)!
    }
  })
}

export function updateEarmoldOrderStatus(payload: {
  id: number
  status: EarmoldStatus
  date?: string
  lab_cost?: number
  recordLabCostInTreasury?: boolean
  payment_method?: string
  notes?: string
}): EarmoldOrder {
  return runTransaction(() => {
    const existing = listEarmoldOrders().find((o) => o.id === payload.id)
    if (!existing) throw new Error('طلب القالب غير موجود')
    const dateVal = payload.date || new Date().toISOString().slice(0, 10)

    let sentDate = existing.sent_date
    let receivedDate = existing.received_date
    let deliveredDate = existing.delivered_date

    if (payload.status === 'sent_to_lab' && !sentDate) sentDate = dateVal
    if (payload.status === 'received') receivedDate = dateVal
    if (payload.status === 'delivered') deliveredDate = dateVal

    const labCost =
      payload.lab_cost !== undefined ? roundMoney(payload.lab_cost) : existing.lab_cost
    let isLabCostPaid = existing.is_lab_cost_paid

    if (payload.recordLabCostInTreasury && labCost > 0 && !isLabCostPaid) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, customer_id, payment_method, description
        ) VALUES ('expense', 'مصروفات معمل قوالب', ?, ?, ?, ?)`
      ).run(
        labCost,
        existing.patient_id,
        payload.payment_method || 'cash',
        `سداد تكلفة معمل قوالب (${existing.order_number}) - ${existing.lab_name || 'المعمل'} للمريض: ${existing.patient_name || ''}`
      )
      isLabCostPaid = 1
    }

    db.prepare(
      `UPDATE earmold_orders SET
        status = ?, sent_date = ?, received_date = ?, delivered_date = ?,
        lab_cost = ?, is_lab_cost_paid = ?, notes = ?
       WHERE id = ?`
    ).run(
      payload.status,
      sentDate,
      receivedDate,
      deliveredDate,
      labCost,
      isLabCostPaid,
      payload.notes !== undefined ? payload.notes.trim() : existing.notes,
      payload.id
    )

    return listEarmoldOrders({ patient_id: existing.patient_id }).find((o) => o.id === payload.id)!
  })
}

export function remakeEarmoldOrder(payload: {
  id: number
  reason?: string
  lab_name?: string
  expected_date?: string | null
  free_remake?: boolean
}): EarmoldOrder {
  return runTransaction(() => {
    const original = listEarmoldOrders().find((o) => o.id === payload.id)
    if (!original) throw new Error('الطلب الأصلي للقالب غير موجود')

    // Mark original order as remake
    db.prepare("UPDATE earmold_orders SET status = 'remake', notes = ? WHERE id = ?").run(
      `${original.notes ? original.notes + ' | ' : ''}تم طلب إعادة تصنيع: ${payload.reason || 'تعديل مقاس'}`,
      original.id
    )

    const today = new Date().toISOString().slice(0, 10)
    const newOrderNumber = generateNextEarmoldNumber()
    const info = db
      .prepare(
        `INSERT INTO earmold_orders (
          order_number, patient_id, device_id, sales_invoice_id, ear,
          mold_type, material, color, vent_size, tube_type, impression_date,
          lab_name, sent_date, expected_date, status,
          lab_cost, customer_price, is_lab_cost_paid, remake_of_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent_to_lab', 0, ?, 0, ?, ?)`
      )
      .run(
        newOrderNumber,
        original.patient_id,
        original.device_id,
        original.sales_invoice_id,
        original.ear,
        original.mold_type,
        original.material,
        original.color,
        original.vent_size,
        original.tube_type,
        today,
        payload.lab_name?.trim() || original.lab_name,
        today,
        payload.expected_date || null,
        payload.free_remake !== false ? 0 : original.customer_price,
        original.id,
        `إعادة تصنيع للطلب رقم ${original.order_number} — السبب: ${payload.reason || 'إعادة ضبط المقاس'}`
      )

    const newId = Number(info.lastInsertRowid)
    return listEarmoldOrders({ patient_id: original.patient_id }).find((o) => o.id === newId)!
  })
}

export function deleteEarmoldOrder(id: number): void {
  db.prepare('DELETE FROM earmold_orders WHERE id = ?').run(id)
}

// ==========================================
// COCHLEAR IMPLANTS & MAPPING SESSIONS (4.3.2)
// ==========================================

function normalizeImplantSessionRow(row: Record<string, unknown>): ImplantSession {
  return {
    ...(row as unknown as ImplantSession),
    thresholds: parseJsonObject(row.thresholds_json) as ImplantThresholds
  }
}

function normalizeImplantRow(row: Record<string, unknown>): CochlearImplant {
  const id = Number(row.id)
  const rawSessions = db
    .prepare(
      `SELECT ims.*,
              c.name as patient_name,
              imp.brand as implant_brand,
              imp.ear as implant_ear,
              pa.file_name as map_file_name
       FROM implant_sessions ims
       LEFT JOIN customers c ON c.id = ims.patient_id
       LEFT JOIN implants imp ON imp.id = ims.implant_id
       LEFT JOIN patient_attachments pa ON pa.id = ims.map_attachment_id
       WHERE ims.implant_id = ?
       ORDER BY ims.session_date DESC, ims.id DESC`
    )
    .all(id) as Record<string, unknown>[]

  return {
    ...(row as unknown as CochlearImplant),
    accessories: parseJsonObject(row.accessories_json) as ImplantAccessories,
    sessions: rawSessions.map(normalizeImplantSessionRow)
  }
}

export function listImplants(filters?: {
  patient_id?: number
  search?: string
}): CochlearImplant[] {
  const clauses: string[] = ['1=1']
  const params: unknown[] = []

  if (filters?.patient_id) {
    clauses.push('imp.patient_id = ?')
    params.push(Number(filters.patient_id))
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.push(
      '(c.name LIKE ? OR c.phone LIKE ? OR imp.brand LIKE ? OR imp.internal_serial LIKE ? OR imp.processor_serial_no LIKE ?)'
    )
    params.push(q, q, q, q, q)
  }

  const rows = db
    .prepare(
      `SELECT imp.*,
              c.name as patient_name,
              c.phone as patient_phone
       FROM implants imp
       LEFT JOIN customers c ON c.id = imp.patient_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY imp.id DESC`
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(normalizeImplantRow)
}

export function saveImplant(data: Partial<CochlearImplant>): CochlearImplant {
  return runTransaction(() => {
    if (!data.patient_id) throw new Error('يجب تحديد المريض لحفظ بيانات زراعة القوقعة')
    const accessoriesJson = stringifyExtraData(data.accessories)

    let processorDeviceId = data.processor_device_id || null
    const procSerialNo = data.processor_serial_no?.trim() || ''
    const procModel = data.processor_model?.trim() || ''
    const brand = data.brand?.trim() || 'Cochlear (كوكلير - قوقعة)'

    // Auto-sync external Sound Processor to customer_appliances if provided
    if ((procModel || procSerialNo) && !processorDeviceId) {
      const existingApp = db
        .prepare(
          `SELECT id FROM customer_appliances
           WHERE customer_id = ? AND (serial_number = ? OR (brand = ? AND model = ?))
           LIMIT 1`
        )
        .get(data.patient_id, procSerialNo, brand, procModel) as { id: number } | undefined

      if (existingApp) {
        processorDeviceId = existingApp.id
      } else {
        const earLabel = data.ear === 'left' ? 'يسار (Left)' : 'يمين (Right)'
        const createdApp = saveCustomerAppliance({
          customer_id: Number(data.patient_id),
          appliance_type: 'قوقعة إلكترونية - معالج صوت (Cochlear Implant)',
          brand,
          model: procModel,
          serial_number: procSerialNo,
          last_warranty_end: data.processor_warranty_end || null,
          notes: `معالج قوقعة مرتبط بملف زراعة القوقعة (${earLabel})`,
          extra_data: {
            ear_side: earLabel,
            ...(data.ear === 'left'
              ? { serial_left: procSerialNo }
              : { serial_right: procSerialNo })
          }
        })
        processorDeviceId = createdApp.id
      }
    }

    if (data.id) {
      db.prepare(
        `UPDATE implants SET
          ear = ?, brand = ?, internal_model = ?, internal_serial = ?,
          surgery_date = ?, hospital = ?, surgeon = ?, activation_date = ?,
          processor_device_id = ?, processor_serial_id = ?,
          processor_model = ?, processor_serial_no = ?, processor_warranty_end = ?,
          accessories_json = ?, notes = ?
         WHERE id = ?`
      ).run(
        data.ear === 'left' ? 'left' : 'right',
        brand,
        data.internal_model?.trim() || '',
        data.internal_serial?.trim() || '',
        data.surgery_date || null,
        data.hospital?.trim() || '',
        data.surgeon?.trim() || '',
        data.activation_date || null,
        processorDeviceId,
        data.processor_serial_id || null,
        procModel,
        procSerialNo,
        data.processor_warranty_end || null,
        accessoriesJson,
        data.notes?.trim() || '',
        data.id
      )
      return listImplants({ patient_id: Number(data.patient_id) }).find((i) => i.id === data.id)!
    } else {
      const info = db
        .prepare(
          `INSERT INTO implants (
            patient_id, ear, brand, internal_model, internal_serial,
            surgery_date, hospital, surgeon, activation_date,
            processor_device_id, processor_serial_id,
            processor_model, processor_serial_no, processor_warranty_end,
            accessories_json, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          Number(data.patient_id),
          data.ear === 'left' ? 'left' : 'right',
          brand,
          data.internal_model?.trim() || '',
          data.internal_serial?.trim() || '',
          data.surgery_date || null,
          data.hospital?.trim() || '',
          data.surgeon?.trim() || '',
          data.activation_date || null,
          processorDeviceId,
          data.processor_serial_id || null,
          procModel,
          procSerialNo,
          data.processor_warranty_end || null,
          accessoriesJson,
          data.notes?.trim() || ''
        )
      const newId = Number(info.lastInsertRowid)
      return listImplants({ patient_id: Number(data.patient_id) }).find((i) => i.id === newId)!
    }
  })
}

export function deleteImplant(id: number): void {
  db.prepare('DELETE FROM implants WHERE id = ?').run(id)
}

export function saveImplantSession(data: Partial<ImplantSession>): ImplantSession {
  return runTransaction(() => {
    if (!data.implant_id || !data.patient_id) {
      throw new Error('يجب تحديد سجل القوقعة والمريض لحفظ جلسة البرمجة')
    }
    const thresholdsJson = stringifyExtraData(data.thresholds)
    const sessionDate = data.session_date || new Date().toISOString().slice(0, 10)
    const sessionType = data.session_type || 'mapping'

    let examinerName = data.examiner_name?.trim() || ''
    if (data.technician_id && !examinerName) {
      const tech = db
        .prepare('SELECT name FROM technicians WHERE id = ?')
        .get(data.technician_id) as { name: string } | undefined
      if (tech) examinerName = tech.name
    }

    let followupId = data.followup_id || null
    if (data.next_due_date) {
      const imp = db
        .prepare('SELECT processor_device_id, processor_serial_no, brand, ear FROM implants WHERE id = ?')
        .get(data.implant_id) as
        | {
            processor_device_id: number | null
            processor_serial_no: string
            brand: string
            ear: string
          }
        | undefined

      const fType = sessionType === 'rehab' ? 'rehab' : 'mapping'
      const fNotes = `موعد جلسة ${fType === 'rehab' ? 'تأهيل سمعي ونطقي' : 'برمجة قوقعة (Mapping)'} قادمة (${imp?.brand || 'قوقعة'} - ${imp?.ear === 'left' ? 'يسار' : 'يمين'})`

      if (followupId) {
        db.prepare('UPDATE followups SET due_date = ?, type = ?, notes = ? WHERE id = ?').run(
          data.next_due_date,
          fType,
          fNotes,
          followupId
        )
      } else {
        const fInfo = db
          .prepare(
            `INSERT INTO followups (
              patient_id, device_id, serial_no, implant_id, type, status,
              due_date, technician_id, fitting_settings_json, notes
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, '{}', ?)`
          )
          .run(
            Number(data.patient_id),
            imp?.processor_device_id || null,
            imp?.processor_serial_no || '',
            Number(data.implant_id),
            fType,
            data.next_due_date,
            data.technician_id || null,
            fNotes
          )
        followupId = Number(fInfo.lastInsertRowid)
      }
    }

    let sessionId = Number(data.id || 0)
    if (sessionId > 0) {
      db.prepare(
        `UPDATE implant_sessions SET
          session_date = ?, session_type = ?, technician_id = ?, examiner_name = ?,
          program_notes = ?, thresholds_json = ?, map_attachment_id = ?,
          next_due_date = ?, followup_id = ?
         WHERE id = ?`
      ).run(
        sessionDate,
        sessionType,
        data.technician_id || null,
        examinerName,
        data.program_notes?.trim() || '',
        thresholdsJson,
        data.map_attachment_id || null,
        data.next_due_date || null,
        followupId,
        sessionId
      )
    } else {
      const info = db
        .prepare(
          `INSERT INTO implant_sessions (
            implant_id, patient_id, session_date, session_type,
            technician_id, examiner_name, program_notes, thresholds_json,
            map_attachment_id, next_due_date, followup_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          Number(data.implant_id),
          Number(data.patient_id),
          sessionDate,
          sessionType,
          data.technician_id || null,
          examinerName,
          data.program_notes?.trim() || '',
          thresholdsJson,
          data.map_attachment_id || null,
          data.next_due_date || null,
          followupId
        )
      sessionId = Number(info.lastInsertRowid)
    }

    const updatedImplant = listImplants({ patient_id: Number(data.patient_id) }).find(
      (i) => i.id === Number(data.implant_id)
    )
    return (updatedImplant?.sessions || []).find((s) => s.id === sessionId)!
  })
}

export function deleteImplantSession(id: number): void {
  db.prepare('DELETE FROM implant_sessions WHERE id = ?').run(id)
}

// ==========================================
// PATIENT ATTACHMENTS (4.4) & FULL PROFILE BUNDLE
// ==========================================

export function listPatientAttachments(
  patientId: number,
  entityType?: string,
  entityId?: number
): PatientAttachment[] {
  const clauses = ['patient_id = ?']
  const params: unknown[] = [Number(patientId)]

  if (entityType) {
    clauses.push('entity_type = ?')
    params.push(entityType)
  }
  if (entityId) {
    clauses.push('entity_id = ?')
    params.push(Number(entityId))
  }

  return db
    .prepare(
      `SELECT * FROM patient_attachments
       WHERE ${clauses.join(' AND ')}
       ORDER BY id DESC`
    )
    .all(...params) as PatientAttachment[]
}

export function savePatientAttachment(payload: {
  patient_id: number
  entity_type?: PatientAttachment['entity_type']
  entity_id?: number | null
  title: string
  category?: AttachmentCategory
  file_name: string
  mime_type?: string
  data_base64: string
  notes?: string
}): PatientAttachment {
  if (!payload.patient_id) throw new Error('يجب تحديد المريض لحفظ المرفق')
  if (!payload.data_base64) throw new Error('ملف المرفق فارغ')

  const attachDir = getPatientAttachmentsDir()
  const rawBase64 = payload.data_base64.includes(',')
    ? payload.data_base64.split(',')[1]
    : payload.data_base64
  const buffer = Buffer.from(rawBase64, 'base64')

  const safeExt = extname(payload.file_name || '').slice(0, 12) || '.bin'
  const storedName = `pat_${payload.patient_id}_${Date.now()}_${randomBytes(4).toString('hex')}${safeExt}`
  const fullPath = join(attachDir, storedName)

  writeFileSync(fullPath, buffer)

  const info = db
    .prepare(
      `INSERT INTO patient_attachments (
        patient_id, entity_type, entity_id, title, category,
        file_name, stored_name, mime_type, file_size, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(payload.patient_id),
      payload.entity_type || 'patient',
      payload.entity_id || null,
      payload.title?.trim() || payload.file_name,
      payload.category || 'general',
      payload.file_name,
      storedName,
      payload.mime_type || 'application/octet-stream',
      buffer.byteLength,
      payload.notes?.trim() || ''
    )

  return db
    .prepare('SELECT * FROM patient_attachments WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as PatientAttachment
}

export function openOrReadPatientAttachment(
  id: number,
  openExternalInOs = false
): {
  attachment: PatientAttachment
  dataUrl?: string
  openedExternal?: boolean
} {
  const att = db
    .prepare('SELECT * FROM patient_attachments WHERE id = ?')
    .get(id) as PatientAttachment | undefined
  if (!att) throw new Error('المرفق غير موجود في قاعدة البيانات')

  const fullPath = join(getPatientAttachmentsDir(), att.stored_name)
  if (!existsSync(fullPath)) {
    throw new Error('ملف المرفق غير موجود على القرص المحلي')
  }

  let openedExternal = false
  if (openExternalInOs) {
    try {
      shell.openPath(fullPath)
      openedExternal = true
    } catch {
      // Ignore OS external open error
    }
  }

  const buf = readFileSync(fullPath)
  const mime = att.mime_type || 'application/octet-stream'
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
  return { attachment: att, dataUrl, openedExternal }
}

export function deletePatientAttachment(id: number): void {
  const att = db
    .prepare('SELECT * FROM patient_attachments WHERE id = ?')
    .get(id) as PatientAttachment | undefined
  if (att) {
    const fullPath = join(getPatientAttachmentsDir(), att.stored_name)
    try {
      if (existsSync(fullPath)) unlinkSync(fullPath)
    } catch {
      // Ignore file removal error
    }
    db.prepare('DELETE FROM patient_attachments WHERE id = ?').run(id)
  }
}

export function getPatientProfileBundle(patientId: number): PatientProfileBundle {
  const rawCust = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(patientId) as Record<string, unknown> | undefined
  if (!rawCust) throw new Error('ملف المريض غير موجود')

  const patient = normalizeCustomerRow(rawCust)
  const appliances = getCustomerAppliances(patient.id)
  const rawTickets = db
    .prepare('SELECT * FROM maintenance_tickets WHERE customer_id = ? ORDER BY id DESC')
    .all(patient.id) as Record<string, unknown>[]
  const tickets = rawTickets.map(normalizeTicketRow)
  const salesInvoices = listSalesInvoices({ customer_id: patient.id })
  const hearingTests = listHearingTests({ patient_id: patient.id })
  const followups = listFollowups({ patient_id: patient.id })
  const earmoldOrders = listEarmoldOrders({ patient_id: patient.id })
  const implants = listImplants({ patient_id: patient.id })
  const attachments = listPatientAttachments(patient.id)

  return {
    patient,
    appliances,
    tickets,
    salesInvoices,
    hearingTests,
    followups,
    earmoldOrders,
    implants,
    attachments
  }
}
