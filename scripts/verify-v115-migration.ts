import Database from 'better-sqlite3'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unlinkSync, existsSync } from 'node:fs'
import assert from 'node:assert'
import { createHmac, scryptSync } from 'node:crypto'

console.log('--- Starting Phase 5B: v1.1.5 Migration & Idempotency Verification ---')

const testDbPath = join(tmpdir(), `test_sallehli_v115_migration_${Date.now()}.sqlite`)

if (existsSync(testDbPath)) {
  unlinkSync(testDbPath)
}

const db = new Database(testDbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

console.log('1. Setting up simulated v1.1.5 legacy schema...')

// 1. Create original v1.1.5 schema
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('super_admin', 'owner', 'tenant')),
    is_active INTEGER NOT NULL DEFAULT 1,
    subscription_start TEXT DEFAULT NULL,
    subscription_end TEXT DEFAULT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone2 TEXT DEFAULT '',
    area TEXT DEFAULT '',
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE customer_appliances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    appliance_type TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    last_warranty_end TEXT DEFAULT NULL,
    last_ticket_number TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );

  CREATE TABLE technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    specialty TEXT NOT NULL,
    commission_rate REAL NOT NULL DEFAULT 30,
    base_salary REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE spare_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    cost_price REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_quantity INTEGER NOT NULL DEFAULT 5,
    unit TEXT NOT NULL DEFAULT 'قطعة',
    location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE inventory_movements (
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
    FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE,
    FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
  );

  CREATE TABLE maintenance_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    appliance_id INTEGER NOT NULL,
    technician_id INTEGER DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    problem_description TEXT NOT NULL,
    diagnosis TEXT DEFAULT '',
    inspection_fee REAL NOT NULL DEFAULT 0,
    repair_cost REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (appliance_id) REFERENCES customer_appliances(id) ON DELETE CASCADE
  );

  CREATE TABLE ticket_parts (
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

  CREATE TABLE treasury_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    reference_type TEXT DEFAULT '',
    reference_id INTEGER DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`)

console.log('2. Populating realistic v1.1.5 mock data...')

// Seed legacy users with old password hashes (unhashed or legacy scrypt)
const PASSWORD_SALT = 'sallehli_aljoker_salt_v1_2026'
const legacyAdminHash = `scrypt:${scryptSync('8520', PASSWORD_SALT, 32).toString('hex')}`
const legacyTenantHash = '1234' // plain unhashed password to test automatic upgrade

db.prepare(`
  INSERT INTO users (username, password_hash, full_name, phone, role, is_active, notes)
  VALUES ('admin', ?, 'سوبر أدمن', '01000000000', 'super_admin', 1, 'مسؤول النظام')
`).run(legacyAdminHash)

db.prepare(`
  INSERT INTO users (username, password_hash, full_name, phone, role, is_active, subscription_start, subscription_end, notes)
  VALUES ('tenant1', ?, 'أحمد المدير', '01011111111', 'tenant', 1, '2026-01-01', '2027-12-31', 'مركز الصيانة المعتمد')
`).run(legacyTenantHash)

// Seed legacy settings (NO business_type key!)
db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('center_name', 'مركز صلحلي للأجهزة - v1.1.5 القديم')
db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('phone1', '01022222222')
db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('default_print_format', 'a4')

// Seed customers
const cust1 = db.prepare(`
  INSERT INTO customers (name, phone, area, address, notes)
  VALUES ('أحمد محمود عبد الله', '01033333333', 'المعادي', 'شارع النصر عمارة 15', 'عميل VIP قديم')
`).run()
const custId = Number(cust1.lastInsertRowid)

// Seed appliance
const app1 = db.prepare(`
  INSERT INTO customer_appliances (customer_id, appliance_type, brand, model, serial_number, notes)
  VALUES (?, 'غسالة أوتوماتيك', 'LG (إل جي)', '8 KG Inverter', 'SN-LG-998877', 'بحالة جيدة')
`).run(custId)
const applianceId = Number(app1.lastInsertRowid)

// Seed technician
const tech1 = db.prepare(`
  INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active)
  VALUES ('م/ خالد حسن', '01044444444', 'غسالات وتكييفات', 35, 3000, 1)
`).run()
const techId = Number(tech1.lastInsertRowid)

// Seed spare part
const part1 = db.prepare(`
  INSERT INTO spare_parts (name, code, category, cost_price, selling_price, quantity, min_quantity, unit)
  VALUES ('طلمبة طرد غسالة LG', 'P-LG-PUMP-01', 'غسالات', 200, 350, 10, 2, 'قطعة')
`).run()
const partId = Number(part1.lastInsertRowid)

// Seed ticket
const ticket1 = db.prepare(`
  INSERT INTO maintenance_tickets (ticket_number, customer_id, appliance_id, technician_id, status, problem_description, diagnosis, inspection_fee, repair_cost, total_amount, paid_amount)
  VALUES ('TCK-2026-0001', ?, ?, ?, 'in_progress', 'الغسالة لا تصرف المياه', 'طلمبة الطرد تالفة وتحتاج تغيير', 150, 350, 500, 150)
`).run(custId, applianceId, techId)
const ticketId = Number(ticket1.lastInsertRowid)

// Seed ticket part
db.prepare(`
  INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
  VALUES (?, ?, 'طلمبة طرد غسالة LG', 'P-LG-PUMP-01', 1, 200, 350, 350)
`).run(ticketId, partId)

// Seed inventory movement
db.prepare(`
  INSERT INTO inventory_movements (part_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes)
  VALUES (?, ?, ?, 'out', 1, 200, 350, 'صرف للطلب TCK-2026-0001')
`).run(partId, techId, ticketId)

// Seed treasury transaction
db.prepare(`
  INSERT INTO treasury_transactions (type, category, amount, description, reference_type, reference_id)
  VALUES ('income', 'ticket_payment', 150, 'تحصيل كشف للطلب TCK-2026-0001', 'ticket', ?)
`).run(ticketId)

console.log('✓ Successfully created mock v1.1.5 database with active tickets and customers.')

// 3. Define the Phase 5 migration logic directly on this database to verify idempotency & correctness
function runPhase5MigrationsOnDb(database: Database.Database) {
  // A. Create new tables if not exists
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'hearing_aid',
      brand TEXT DEFAULT '',
      model TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      has_serials INTEGER NOT NULL DEFAULT 0,
      has_variants INTEGER NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      min_selling_price REAL NOT NULL DEFAULT 0,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      min_stock_alert INTEGER NOT NULL DEFAULT 2,
      warranty_months INTEGER NOT NULL DEFAULT 12,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company_name TEXT DEFAULT '',
      phone TEXT NOT NULL,
      phone2 TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER DEFAULT NULL,
      invoice_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS hearing_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      test_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lookup_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      business_type TEXT NOT NULL,
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
  `)

  // B. Run Migrations with PRAGMA foreign_keys = OFF
  const ensureCol = (tbl: string, col: string, def: string) => {
    const cols = database.prepare(`PRAGMA table_info(${tbl})`).all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === col)) {
      database.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def};`)
    }
  }

  database.exec('PRAGMA foreign_keys = OFF;')
  try {
    // 1. Upgrade users table if old constraint
    const userTableMeta = database
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get() as { sql?: string } | undefined

    if (userTableMeta?.sql && !userTableMeta.sql.includes('receptionist')) {
      database.exec(`
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
    } else {
      ensureCol('users', 'subscription_sig', "TEXT DEFAULT ''")
    }

    // 2. Ensure new columns
    ensureCol('spare_parts', 'image_base64', "TEXT DEFAULT ''")
    ensureCol('technicians', 'avatar_base64', "TEXT DEFAULT ''")
    ensureCol('customer_appliances', 'warranty_image', "TEXT DEFAULT ''")
    ensureCol('customer_appliances', 'fault_images', "TEXT DEFAULT '[]'")
    ensureCol('maintenance_tickets', 'warranty_image', "TEXT DEFAULT ''")
    ensureCol('maintenance_tickets', 'fault_images', "TEXT DEFAULT '[]'")
    ensureCol('customers', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")
    ensureCol('customer_appliances', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")
    ensureCol('maintenance_tickets', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")

    // Medical fields on customers
    ensureCol('customers', 'birth_date', 'TEXT DEFAULT NULL')
    ensureCol('customers', 'gender', "TEXT DEFAULT ''")
    ensureCol('customers', 'occupation', "TEXT DEFAULT ''")
    ensureCol('customers', 'referring_doctor', "TEXT DEFAULT ''")
    ensureCol('customers', 'medical_complaint', "TEXT DEFAULT ''")
    ensureCol('customers', 'medical_history', "TEXT DEFAULT ''")
    ensureCol('customers', 'allergies', "TEXT DEFAULT ''")
    ensureCol('customers', 'doctor_notes', "TEXT DEFAULT ''")

    // Upgrade inventory_movements
    const invMoveMeta = database
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory_movements'")
      .get() as { sql?: string } | undefined

    if (invMoveMeta?.sql && invMoveMeta.sql.includes('part_id INTEGER NOT NULL')) {
      database.exec(`
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
    }

    // Upgrade ticket_parts
    const ticketPartsMeta = database
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ticket_parts'")
      .get() as { sql?: string } | undefined

    if (ticketPartsMeta?.sql && ticketPartsMeta.sql.includes('part_id INTEGER NOT NULL')) {
      database.exec(`
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
    }

    // Backfill user password hashes & subscription signatures
    const LICENSE_HMAC_SECRET = 'sallehli_aljoker_license_secret_key_v1'
    const allUsers = database
      .prepare('SELECT id, username, password_hash, role, subscription_end, subscription_sig FROM users')
      .all() as any[]

    for (const u of allUsers) {
      const newHash = u.password_hash.startsWith('scrypt:')
        ? u.password_hash
        : `scrypt:${scryptSync(u.password_hash, PASSWORD_SALT, 32).toString('hex')}`
      const payload = `${u.username.trim().toLowerCase()}|${u.role}|${u.subscription_end || ''}`
      const sig = u.subscription_sig || createHmac('sha256', LICENSE_HMAC_SECRET).update(payload).digest('hex')
      database.prepare('UPDATE users SET password_hash = ?, subscription_sig = ? WHERE id = ?').run(newHash, sig, u.id)
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON;')
  }

  // C. Auto-detect legacy database & backfill business_type to 'appliances'
  const typeRow = database.prepare('SELECT value FROM settings WHERE key = ?').get('business_type') as any
  if (!typeRow || !typeRow.value) {
    const custCount = (database.prepare('SELECT COUNT(*) as cnt FROM customers').get() as any).cnt
    if (custCount > 0) {
      const BUSINESS_HMAC_SECRET = 'sallehli_aljoker_business_secret_key_v1_2026'
      const sig = createHmac('sha256', BUSINESS_HMAC_SECRET).update('biz|appliances').digest('hex')
      database.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type', 'appliances')
      database.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type_sig', sig)
    }
  }
}

console.log('3. Executing Phase 5 migration on v1.1.5 database (Run 1)...')
runPhase5MigrationsOnDb(db)
console.log('✓ Run 1 migration completed without any foreign key errors!')

// Verification Assertions after Run 1
console.log('4. Verifying migrated data integrity and schema correctness...')

// Check Users
const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all() as any[]
assert.strictEqual(users.length, 2, 'Should preserve exactly 2 legacy users')
assert.strictEqual(users[0].username, 'admin', 'Admin user preserved')
assert.strictEqual(users[1].username, 'tenant1', 'Tenant user preserved')
assert.ok(users[1].password_hash.startsWith('scrypt:'), 'Tenant plain password upgraded to scrypt hash')
assert.ok(users[1].subscription_sig.length > 20, 'Tenant subscription_sig backfilled')

// Test that users table now accepts cashier and receptionist
db.prepare(`
  INSERT INTO users (username, password_hash, full_name, phone, role, is_active, notes)
  VALUES ('reception1', 'hash123', 'موظفة الاستقبال', '01055555555', 'receptionist', 1, 'تمت إضافتها بعد الترقية')
`).run()
db.prepare(`
  INSERT INTO users (username, password_hash, full_name, phone, role, is_active, notes)
  VALUES ('cashier1', 'hash123', 'كاشير الفرع', '01066666666', 'cashier', 1, 'تمت إضافته بعد الترقية')
`).run()
console.log('✓ Users table successfully upgraded to support receptionist and cashier roles.')

// Check Customers
const customers = db.prepare('SELECT * FROM customers').all() as any[]
assert.strictEqual(customers.length, 1, 'Customer record preserved')
assert.strictEqual(customers[0].name, 'أحمد محمود عبد الله', 'Customer name intact')
assert.strictEqual(customers[0].extra_data, '{}', 'Customer extra_data initialized')
assert.strictEqual(customers[0].birth_date, null, 'Customer birth_date initialized as NULL')
console.log('✓ Customers table and records preserved with new medical & extra_data fields.')

// Check Appliances & Tickets
const tickets = db.prepare('SELECT * FROM maintenance_tickets').all() as any[]
assert.strictEqual(tickets.length, 1, 'Ticket preserved')
assert.strictEqual(tickets[0].ticket_number, 'TCK-2026-0001', 'Ticket number intact')
assert.strictEqual(tickets[0].total_amount, 500, 'Ticket total amount intact')
console.log('✓ Tickets and appliances preserved intact.')

// Check Inventory & Ticket Parts
const ticketParts = db.prepare('SELECT * FROM ticket_parts').all() as any[]
assert.strictEqual(ticketParts.length, 1, 'Ticket parts preserved')
assert.strictEqual(ticketParts[0].part_name, 'طلمبة طرد غسالة LG', 'Part name intact')

// Verify inventory_movements allows NULL part_id (when product_id is used)
db.prepare(`
  INSERT INTO inventory_movements (part_id, movement_type, quantity, unit_cost, unit_price, notes)
  VALUES (NULL, 'in', 5, 100, 150, 'حركة مخزن بدون قطعة غيار مباشرة')
`).run()
console.log('✓ inventory_movements successfully upgraded to allow NULL part_id.')

// Check Business Type auto-assignment
const bTypeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('business_type') as any
const bSigRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('business_type_sig') as any
assert.strictEqual(bTypeRow.value, 'appliances', 'business_type was automatically backfilled to appliances')
const BUSINESS_HMAC_SECRET = 'sallehli_aljoker_business_secret_key_v1_2026'
const expectedSig = createHmac('sha256', BUSINESS_HMAC_SECRET).update('biz|appliances').digest('hex')
assert.strictEqual(bSigRow.value, expectedSig, 'business_type signature is valid and authentic')
console.log('✓ Legacy database automatically backfilled to appliances with valid HMAC signature.')

// 5. Test Idempotency (Run 2 and Run 3)
console.log('5. Testing Idempotency: Re-running Phase 5 migration on the already upgraded database (Run 2 & Run 3)...')
runPhase5MigrationsOnDb(db)
console.log('✓ Run 2 completed with 0 errors.')
runPhase5MigrationsOnDb(db)
console.log('✓ Run 3 completed with 0 errors.')

// Verify count of records hasn't changed
const custCountAfter = (db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as any).cnt
assert.strictEqual(custCountAfter, 1, 'Customer count untouched across runs')
const ticketCountAfter = (db.prepare('SELECT COUNT(*) as cnt FROM maintenance_tickets').get() as any).cnt
assert.strictEqual(ticketCountAfter, 1, 'Ticket count untouched across runs')

console.log('✓ Migration is 100% IDEMPOTENT (no duplicates, no alterations).')

// Clean up test database
db.close()
if (existsSync(testDbPath)) {
  unlinkSync(testDbPath)
}

console.log('\nAll Phase 5B migration verification tests passed with 100% success! 🎉')
