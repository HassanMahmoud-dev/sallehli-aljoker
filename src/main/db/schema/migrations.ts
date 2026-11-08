import { getDb, runTransaction } from '../connection'
import { hashPassword, signSubscription } from '../crypto'

export function ensureColumn(tableName: string, columnName: string, columnDef: string): void {
  const db = getDb()
  const isRealTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName)
  if (!isRealTable) return

  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  const exists = cols.some((c) => c.name === columnName)
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`)
  }
}

/**
 * ترحيل جدول قطع الغيار spare_parts تلقائياً للعملاء الحاليين:
 * elect_spare_parts للأجهزة الكهربائية و medicalmain_spare_parts للسماعات الطبية
 */
export function migrateToActivityTables(forcedType?: 'hearing_aids' | 'appliances'): void {
  const db = getDb()
  const bRow = db.prepare("SELECT value FROM settings WHERE key = 'business_type'").get() as
    | { value: string }
    | undefined
  const businessType = forcedType ?? (bRow?.value === 'hearing_aids' ? 'hearing_aids' : 'appliances')

  const sparePartsMeta = db
    .prepare("SELECT type FROM sqlite_master WHERE name = 'spare_parts'")
    .get() as { type?: string } | undefined

  if (sparePartsMeta && sparePartsMeta.type === 'table') {
    runTransaction(() => {
      if (businessType === 'hearing_aids') {
        db.exec(`
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
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );
          INSERT OR IGNORE INTO medicalmain_spare_parts SELECT * FROM spare_parts;
          DROP TABLE spare_parts;
          CREATE VIEW IF NOT EXISTS spare_parts AS SELECT * FROM medicalmain_spare_parts;

          CREATE TRIGGER IF NOT EXISTS trg_med_spare_parts_insert
          INSTEAD OF INSERT ON spare_parts
          BEGIN
            INSERT INTO medicalmain_spare_parts (
              code, name, category, brand, purchase_price, selling_price,
              quantity, min_quantity, location, notes, image_base64
            ) VALUES (
              NEW.code, NEW.name, NEW.category, COALESCE(NEW.brand, 'عام'),
              COALESCE(NEW.purchase_price, 0), COALESCE(NEW.selling_price, 0),
              COALESCE(NEW.quantity, 0), COALESCE(NEW.min_quantity, 3),
              COALESCE(NEW.location, ''), COALESCE(NEW.notes, ''), COALESCE(NEW.image_base64, '')
            );
          END;

          CREATE TRIGGER IF NOT EXISTS trg_med_spare_parts_update
          INSTEAD OF UPDATE ON spare_parts
          BEGIN
            UPDATE medicalmain_spare_parts
            SET code = NEW.code,
                name = NEW.name,
                category = NEW.category,
                brand = NEW.brand,
                purchase_price = NEW.purchase_price,
                selling_price = NEW.selling_price,
                quantity = NEW.quantity,
                min_quantity = NEW.min_quantity,
                location = NEW.location,
                notes = NEW.notes,
                image_base64 = NEW.image_base64
            WHERE id = OLD.id;
          END;

          CREATE TRIGGER IF NOT EXISTS trg_med_spare_parts_delete
          INSTEAD OF DELETE ON spare_parts
          BEGIN
            DELETE FROM medicalmain_spare_parts WHERE id = OLD.id;
          END;
        `)
      } else {
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
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );
          INSERT OR IGNORE INTO elect_spare_parts SELECT * FROM spare_parts;
          DROP TABLE spare_parts;
          CREATE VIEW IF NOT EXISTS spare_parts AS SELECT * FROM elect_spare_parts;

          CREATE TRIGGER IF NOT EXISTS trg_elect_spare_parts_insert
          INSTEAD OF INSERT ON spare_parts
          BEGIN
            INSERT INTO elect_spare_parts (
              code, name, category, brand, purchase_price, selling_price,
              quantity, min_quantity, location, notes, image_base64
            ) VALUES (
              NEW.code, NEW.name, NEW.category, COALESCE(NEW.brand, 'عام'),
              COALESCE(NEW.purchase_price, 0), COALESCE(NEW.selling_price, 0),
              COALESCE(NEW.quantity, 0), COALESCE(NEW.min_quantity, 3),
              COALESCE(NEW.location, ''), COALESCE(NEW.notes, ''), COALESCE(NEW.image_base64, '')
            );
          END;

          CREATE TRIGGER IF NOT EXISTS trg_elect_spare_parts_update
          INSTEAD OF UPDATE ON spare_parts
          BEGIN
            UPDATE elect_spare_parts
            SET code = NEW.code,
                name = NEW.name,
                category = NEW.category,
                brand = NEW.brand,
                purchase_price = NEW.purchase_price,
                selling_price = NEW.selling_price,
                quantity = NEW.quantity,
                min_quantity = NEW.min_quantity,
                location = NEW.location,
                notes = NEW.notes,
                image_base64 = NEW.image_base64
            WHERE id = OLD.id;
          END;

          CREATE TRIGGER IF NOT EXISTS trg_elect_spare_parts_delete
          INSTEAD OF DELETE ON spare_parts
          BEGIN
            DELETE FROM elect_spare_parts WHERE id = OLD.id;
          END;
        `)
      }
    })
  } else if (sparePartsMeta && sparePartsMeta.type === 'view') {
    try {
      if (businessType === 'hearing_aids') {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_med_spare_parts_insert
          INSTEAD OF INSERT ON spare_parts
          BEGIN
            INSERT INTO medicalmain_spare_parts (
              code, name, category, brand, purchase_price, selling_price,
              quantity, min_quantity, location, notes, image_base64
            ) VALUES (
              NEW.code, NEW.name, NEW.category, COALESCE(NEW.brand, 'عام'),
              COALESCE(NEW.purchase_price, 0), COALESCE(NEW.selling_price, 0),
              COALESCE(NEW.quantity, 0), COALESCE(NEW.min_quantity, 3),
              COALESCE(NEW.location, ''), COALESCE(NEW.notes, ''), COALESCE(NEW.image_base64, '')
            );
          END;
        `)
      } else {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_elect_spare_parts_insert
          INSTEAD OF INSERT ON spare_parts
          BEGIN
            INSERT INTO elect_spare_parts (
              code, name, category, brand, purchase_price, selling_price,
              quantity, min_quantity, location, notes, image_base64
            ) VALUES (
              NEW.code, NEW.name, NEW.category, COALESCE(NEW.brand, 'عام'),
              COALESCE(NEW.purchase_price, 0), COALESCE(NEW.selling_price, 0),
              COALESCE(NEW.quantity, 0), COALESCE(NEW.min_quantity, 3),
              COALESCE(NEW.location, ''), COALESCE(NEW.notes, ''), COALESCE(NEW.image_base64, '')
            );
          END;
        `)
      }
    } catch {
      // Ignore
    }
  }
}

export function runMigrations(): void {
  const db = getDb()
  db.exec('PRAGMA foreign_keys = OFF;')
  try {
    // 0. ترحيل جدول قطع الغيار بحسب النشاط
    migrateToActivityTables()

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
            role TEXT NOT NULL CHECK(role IN ('super_admin', 'owner')),
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
    ensureColumn('elect_spare_parts', 'image_base64', "TEXT DEFAULT ''")
    ensureColumn('medicalmain_spare_parts', 'image_base64', "TEXT DEFAULT ''")
    ensureColumn('technicians', 'avatar_base64', "TEXT DEFAULT ''")
    ensureColumn('customer_appliances', 'warranty_image', "TEXT DEFAULT ''")
    ensureColumn('customer_appliances', 'fault_images', "TEXT DEFAULT '[]'")
    ensureColumn('customer_appliances', 'purchase_date', 'TEXT DEFAULT NULL')
    ensureColumn('maintenance_tickets', 'warranty_image', "TEXT DEFAULT ''")
    ensureColumn('maintenance_tickets', 'fault_images', "TEXT DEFAULT '[]'")
    ensureColumn('customers', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")
    ensureColumn('customer_appliances', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")
    ensureColumn('maintenance_tickets', 'extra_data', "TEXT NOT NULL DEFAULT '{}'")

    // 2a. Medical Patient Profile columns on customers
    ensureColumn('customers', 'birth_date', 'TEXT DEFAULT NULL')
    ensureColumn('customers', 'gender', "TEXT DEFAULT ''")
    ensureColumn('customers', 'occupation', "TEXT DEFAULT ''")
    ensureColumn('customers', 'referring_doctor', "TEXT DEFAULT ''")
    ensureColumn('customers', 'medical_complaint', "TEXT DEFAULT ''")
    ensureColumn('customers', 'medical_history', "TEXT DEFAULT ''")
    ensureColumn('customers', 'allergies', "TEXT DEFAULT ''")
    ensureColumn('customers', 'doctor_notes', "TEXT DEFAULT ''")

    // 2c. Ensure reference columns on treasury_transactions
    ensureColumn('treasury_transactions', 'sales_invoice_id', 'INTEGER DEFAULT NULL')
    ensureColumn('treasury_transactions', 'purchase_invoice_id', 'INTEGER DEFAULT NULL')
    ensureColumn('treasury_transactions', 'supplier_id', 'INTEGER DEFAULT NULL')
    ensureColumn('treasury_transactions', 'customer_id', 'INTEGER DEFAULT NULL')
    ensureColumn('treasury_transactions', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('treasury_transactions', 'created_by_name', "TEXT DEFAULT ''")

    // 2d. Audit trail and accounting columns across invoices, tickets & returns
    ensureColumn('sales_invoices', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('sales_invoices', 'created_by_name', "TEXT DEFAULT ''")
    ensureColumn('sales_invoices', 'returned_amount', 'REAL NOT NULL DEFAULT 0')

    ensureColumn('purchase_invoices', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('purchase_invoices', 'created_by_name', "TEXT DEFAULT ''")

    ensureColumn('maintenance_tickets', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('maintenance_tickets', 'created_by_name', "TEXT DEFAULT ''")
    ensureColumn('maintenance_tickets', 'commission_rate', 'REAL DEFAULT NULL')
    ensureColumn('maintenance_tickets', 'commission_amount', 'REAL DEFAULT NULL')

    ensureColumn('invoice_returns', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('invoice_returns', 'created_by_name', "TEXT DEFAULT ''")

    ensureColumn('product_serials', 'unit_cost', 'REAL DEFAULT NULL')

    // Ensure physical spare parts tables exist for both activities
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

    // 2f. Demo Data flags (is_demo INTEGER NOT NULL DEFAULT 0) & business_type partitioning
    const tablesWithDemo = [
      'customers',
      'customer_appliances',
      'technicians',
      'elect_spare_parts',
      'medicalmain_spare_parts',
      'maintenance_tickets',
      'ticket_parts',
      'inventory_movements',
      'treasury_transactions',
      'products',
      'product_variants',
      'product_serials',
      'suppliers',
      'supplier_payments',
      'purchase_invoices',
      'purchase_items',
      'sales_invoices',
      'sales_items',
      'sales_payments',
      'invoice_returns',
      'invoice_return_items',
      'product_exchanges',
      'hearing_tests',
      'audiogram_points',
      'followups',
      'earmold_orders',
      'implants',
      'implant_sessions',
      'patient_attachments'
    ]
    for (const t of tablesWithDemo) {
      ensureColumn(t, 'is_demo', 'INTEGER NOT NULL DEFAULT 0')
    }

    // Activity separation columns for shared tables
    ensureColumn('customers', 'business_type', "TEXT DEFAULT 'appliances'")
    ensureColumn('maintenance_tickets', 'business_type', "TEXT DEFAULT 'appliances'")
    ensureColumn('technicians', 'business_type', "TEXT DEFAULT 'appliances'")
    ensureColumn('products', 'business_type', "TEXT DEFAULT 'hearing_aids'")
    ensureColumn('suppliers', 'business_type', "TEXT DEFAULT 'hearing_aids'")
    ensureColumn('sales_invoices', 'business_type', "TEXT DEFAULT 'hearing_aids'")
    ensureColumn('purchase_invoices', 'business_type', "TEXT DEFAULT 'hearing_aids'")
    ensureColumn('treasury_transactions', 'business_type', "TEXT DEFAULT 'appliances'")

    // 2g. Migrate users table to strict super_admin & owner roles only
    try {
      db.exec("UPDATE users SET role = 'owner' WHERE role NOT IN ('super_admin', 'owner');")
      const usersMeta = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
        .get() as { sql?: string } | undefined
      if (usersMeta?.sql && usersMeta.sql.includes('tenant')) {
        runTransaction(() => {
          db.exec(`
            CREATE TABLE users_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              full_name TEXT NOT NULL,
              phone TEXT DEFAULT '',
              role TEXT NOT NULL CHECK(role IN ('super_admin', 'owner')),
              is_active INTEGER NOT NULL DEFAULT 1,
              subscription_start TEXT DEFAULT NULL,
              subscription_end TEXT DEFAULT NULL,
              subscription_sig TEXT DEFAULT '',
              notes TEXT DEFAULT '',
              created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            INSERT INTO users_new (id, username, password_hash, full_name, phone, role, is_active, subscription_start, subscription_end, subscription_sig, notes, created_at)
            SELECT id, username, password_hash, full_name, phone, CASE WHEN role = 'super_admin' THEN 'super_admin' ELSE 'owner' END, is_active, subscription_start, subscription_end, subscription_sig, notes, created_at FROM users;
            DROP TABLE users;
            ALTER TABLE users_new RENAME TO users;
          `)
        })
      }
    } catch {
      // Ignore if table schema is already updated
    }

    // 2e. Upgrade audiogram_points frequency CHECK constraint to support clinical intermediate frequencies
    const audiogramMeta = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audiogram_points'")
      .get() as { sql?: string } | undefined

    if (audiogramMeta?.sql && !audiogramMeta.sql.includes('750')) {
      runTransaction(() => {
        db.exec(`
          CREATE TABLE audiogram_points_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER NOT NULL,
            ear TEXT NOT NULL CHECK(ear IN ('right', 'left')),
            conduction TEXT NOT NULL CHECK(conduction IN ('air', 'bone')),
            frequency INTEGER NOT NULL CHECK(frequency IN (125, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000)),
            db_value REAL NOT NULL CHECK(db_value >= -10 AND db_value <= 120),
            is_masked INTEGER NOT NULL DEFAULT 0,
            no_response INTEGER NOT NULL DEFAULT 0,
            UNIQUE(test_id, ear, conduction, frequency),
            FOREIGN KEY (test_id) REFERENCES hearing_tests(id) ON DELETE CASCADE
          );
          INSERT INTO audiogram_points_new (id, test_id, ear, conduction, frequency, db_value, is_masked, no_response)
          SELECT id, test_id, ear, conduction, frequency, db_value, is_masked, no_response FROM audiogram_points;
          DROP TABLE audiogram_points;
          ALTER TABLE audiogram_points_new RENAME TO audiogram_points;
        `)
      })
    }

    // 2h. Clean inventory_movements foreign keys (remove invalid view reference to spare_parts)
    try {
      const imMeta = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory_movements'")
        .get() as { sql?: string } | undefined
      if (imMeta?.sql && imMeta.sql.includes('spare_parts')) {
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
              is_demo INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE SET NULL
            );
            INSERT INTO inventory_movements_new (id, part_id, product_id, variant_id, serial_no, ref_type, ref_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes, created_at, is_demo)
            SELECT id, part_id, product_id, variant_id, serial_no, ref_type, ref_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes, created_at, COALESCE(is_demo, 0) FROM inventory_movements;
            DROP TABLE inventory_movements;
            ALTER TABLE inventory_movements_new RENAME TO inventory_movements;
          `)
        })
      }
    } catch {
      // Ignore if table schema is already updated
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
