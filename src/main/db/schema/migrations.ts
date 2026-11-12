import { getDb, runTransaction } from '../connection'
import { hashPassword, signSubscription } from '../crypto'

interface TableColumnInfo {
  name: string
  notnull: number
}

function getTableMetaAndCols(tableName: string): {
  sql?: string
  cols: TableColumnInfo[]
  colSet: Set<string>
  hasCol: (col: string) => boolean
} {
  const db = getDb()
  const meta = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { sql?: string } | undefined
  const cols = meta?.sql
    ? (db.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumnInfo[])
    : []
  const colSet = new Set(cols.map((c) => c.name))
  return {
    sql: meta?.sql,
    cols,
    colSet,
    hasCol: (col: string) => colSet.has(col)
  }
}

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
  const targetTable =
    businessType === 'hearing_aids' ? 'medicalmain_spare_parts' : 'elect_spare_parts'
  const trigPrefix = businessType === 'hearing_aids' ? 'trg_med_spare_parts' : 'trg_elect_spare_parts'

  const sparePartsMeta = db
    .prepare("SELECT type FROM sqlite_master WHERE name = 'spare_parts'")
    .get() as { type?: string } | undefined

  const triggersSql = `
    CREATE TRIGGER IF NOT EXISTS ${trigPrefix}_insert
    INSTEAD OF INSERT ON spare_parts
    BEGIN
      INSERT INTO ${targetTable} (
        code, name, category, brand, purchase_price, selling_price,
        quantity, min_quantity, location, notes, image_base64, is_demo
      ) VALUES (
        NEW.code, NEW.name, NEW.category, COALESCE(NEW.brand, 'عام'),
        COALESCE(NEW.purchase_price, 0), COALESCE(NEW.selling_price, 0),
        COALESCE(NEW.quantity, 0), COALESCE(NEW.min_quantity, 3),
        COALESCE(NEW.location, ''), COALESCE(NEW.notes, ''), COALESCE(NEW.image_base64, ''),
        COALESCE(NEW.is_demo, 0)
      );
    END;

    CREATE TRIGGER IF NOT EXISTS ${trigPrefix}_update
    INSTEAD OF UPDATE ON spare_parts
    BEGIN
      UPDATE ${targetTable}
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
          image_base64 = NEW.image_base64,
          is_demo = COALESCE(NEW.is_demo, OLD.is_demo)
      WHERE id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS ${trigPrefix}_delete
    INSTEAD OF DELETE ON spare_parts
    BEGIN
      DELETE FROM ${targetTable} WHERE id = OLD.id;
    END;
  `

  if (sparePartsMeta && sparePartsMeta.type === 'table') {
    const fkRow = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined
    const wasFkOn = Boolean(fkRow?.foreign_keys)
    if (wasFkOn) {
      db.exec('PRAGMA foreign_keys = OFF;')
    }
    try {
      runTransaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${targetTable} (
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
        ensureColumn(targetTable, 'image_base64', "TEXT DEFAULT ''")
        ensureColumn(targetTable, 'is_demo', 'INTEGER NOT NULL DEFAULT 0')

        const spInfo = getTableMetaAndCols('spare_parts')
        const targetInfo = getTableMetaAndCols(targetTable)
        const destCols: string[] = []
        const srcExprs: string[] = []
        for (const col of targetInfo.cols) {
          if (spInfo.hasCol(col.name)) {
            destCols.push(col.name)
            srcExprs.push(col.name)
          } else if (col.name === 'purchase_price' && spInfo.hasCol('cost_price')) {
            destCols.push('purchase_price')
            srcExprs.push('cost_price')
          }
        }
        if (destCols.length > 0) {
          db.exec(
            `INSERT OR IGNORE INTO ${targetTable} (${destCols.join(', ')}) SELECT ${srcExprs.join(', ')} FROM spare_parts;`
          )
        }

        db.exec(`
          DROP TABLE spare_parts;
          CREATE VIEW IF NOT EXISTS spare_parts AS SELECT * FROM ${targetTable};
          ${triggersSql}
        `)
      })
    } finally {
      if (wasFkOn) {
        try {
          db.exec('PRAGMA foreign_keys = ON;')
        } catch {
          // Ignore if connection is closing
        }
      }
    }
  } else if (sparePartsMeta && sparePartsMeta.type === 'view') {
    try {
      ensureColumn(targetTable, 'image_base64', "TEXT DEFAULT ''")
      ensureColumn(targetTable, 'is_demo', 'INTEGER NOT NULL DEFAULT 0')
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS ${trigPrefix}_insert
        INSTEAD OF INSERT ON spare_parts
        BEGIN
          INSERT INTO ${targetTable} (
            code, name, category, brand, purchase_price, selling_price,
            quantity, min_quantity, location, notes, image_base64, is_demo
          ) VALUES (
            NEW.code, NEW.name, NEW.category, COALESCE(NEW.brand, 'عام'),
            COALESCE(NEW.purchase_price, 0), COALESCE(NEW.selling_price, 0),
            COALESCE(NEW.quantity, 0), COALESCE(NEW.min_quantity, 3),
            COALESCE(NEW.location, ''), COALESCE(NEW.notes, ''), COALESCE(NEW.image_base64, ''),
            COALESCE(NEW.is_demo, 0)
          );
        END;
      `)
    } catch {
      // Ignore if target table has not been created yet
    }
  }
}

export function runMigrations(): void {
  const db = getDb()
  db.exec('PRAGMA foreign_keys = OFF;')
  try {
    // 0. ترحيل جدول قطع الغيار بحسب النشاط وضمان أعمدة العرض قبل إعادة بناء أي جدول
    migrateToActivityTables()
    ensureColumn('elect_spare_parts', 'is_demo', 'INTEGER NOT NULL DEFAULT 0')
    ensureColumn('medicalmain_spare_parts', 'is_demo', 'INTEGER NOT NULL DEFAULT 0')

    // 1. Upgrade users table if legacy CHECK constraint allowed removed roles (tenant, receptionist, cashier, storekeeper)
    const usersInfo = getTableMetaAndCols('users')
    if (usersInfo.sql && /\b(tenant|receptionist|cashier|storekeeper)\b/i.test(usersInfo.sql)) {
      const sigSelect = usersInfo.hasCol('subscription_sig')
        ? "COALESCE(subscription_sig, '')"
        : "''"
      runTransaction(() => {
        db.exec(`
          DROP TABLE IF EXISTS users_new;
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
          SELECT id, username, password_hash, full_name, phone, CASE WHEN role = 'super_admin' THEN 'super_admin' ELSE 'owner' END, is_active, subscription_start, subscription_end, ${sigSelect}, notes, created_at FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;
        `)
      })
    } else {
      ensureColumn('users', 'subscription_sig', "TEXT DEFAULT ''")
    }
    if (usersInfo.sql) {
      db.exec("UPDATE users SET role = 'owner' WHERE role NOT IN ('super_admin', 'owner');")
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
    ensureColumn('treasury_transactions', 'linked_tx_id', 'INTEGER DEFAULT NULL')
    ensureColumn('treasury_transactions', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('treasury_transactions', 'created_by_name', "TEXT DEFAULT ''")

    // 2d. Audit trail, external repair, loaner, and accounting columns across invoices, tickets & returns
    ensureColumn('sales_invoices', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('sales_invoices', 'created_by_name', "TEXT DEFAULT ''")
    ensureColumn('sales_invoices', 'returned_amount', 'REAL NOT NULL DEFAULT 0')

    ensureColumn('purchase_invoices', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('purchase_invoices', 'created_by_name', "TEXT DEFAULT ''")

    ensureColumn('maintenance_tickets', 'created_by_id', 'INTEGER DEFAULT NULL')
    ensureColumn('maintenance_tickets', 'created_by_name', "TEXT DEFAULT ''")
    ensureColumn('maintenance_tickets', 'commission_rate', 'REAL DEFAULT NULL')
    ensureColumn('maintenance_tickets', 'commission_amount', 'REAL DEFAULT NULL')
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

    ensureColumn('ticket_parts', 'is_restored', 'INTEGER NOT NULL DEFAULT 0')

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

    // 2e. Upgrade audiogram_points frequency CHECK constraint to support clinical intermediate frequencies
    const audiogramMeta = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audiogram_points'")
      .get() as { sql?: string } | undefined

    if (audiogramMeta?.sql && !audiogramMeta.sql.includes('750')) {
      runTransaction(() => {
        db.exec(`
          DROP TABLE IF EXISTS audiogram_points_new;
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

    // 2h. Clean inventory_movements foreign keys, remove restrictive CHECK on movement_type, and backfill missing columns
    const imInfo = getTableMetaAndCols('inventory_movements')
    if (imInfo.sql) {
      const imPartIdCol = imInfo.cols.find((c) => c.name === 'part_id')
      const requiredImCols = [
        'product_id',
        'variant_id',
        'serial_no',
        'ref_type',
        'ref_id',
        'unit_cost',
        'unit_price',
        'is_demo'
      ]
      const needsImRebuild =
        imInfo.sql.includes('spare_parts') ||
        /CHECK\s*\([^)]*movement_type/i.test(imInfo.sql) ||
        Boolean(imPartIdCol && imPartIdCol.notnull === 1) ||
        requiredImCols.some((c) => !imInfo.hasCol(c))

      if (needsImRebuild) {
        const imSelectExprs = [
          imInfo.hasCol('id') ? 'id' : 'NULL',
          imInfo.hasCol('part_id') ? 'part_id' : 'NULL',
          imInfo.hasCol('product_id') ? 'product_id' : 'NULL',
          imInfo.hasCol('variant_id') ? 'variant_id' : 'NULL',
          imInfo.hasCol('serial_no') ? "COALESCE(serial_no, '')" : "''",
          imInfo.hasCol('ref_type') ? "COALESCE(ref_type, '')" : "''",
          imInfo.hasCol('ref_id') ? 'ref_id' : 'NULL',
          imInfo.hasCol('technician_id') ? 'technician_id' : 'NULL',
          imInfo.hasCol('ticket_id') ? 'ticket_id' : 'NULL',
          imInfo.hasCol('movement_type') ? 'movement_type' : "''",
          imInfo.hasCol('quantity') ? 'COALESCE(quantity, 0)' : '0',
          imInfo.hasCol('unit_cost') ? 'COALESCE(unit_cost, 0)' : '0',
          imInfo.hasCol('unit_price') ? 'COALESCE(unit_price, 0)' : '0',
          imInfo.hasCol('notes') ? "COALESCE(notes, '')" : "''",
          imInfo.hasCol('created_at')
            ? "COALESCE(created_at, datetime('now', 'localtime'))"
            : "datetime('now', 'localtime')",
          imInfo.hasCol('is_demo') ? 'COALESCE(is_demo, 0)' : '0'
        ].join(', ')

        runTransaction(() => {
          db.exec(`
            DROP TABLE IF EXISTS inventory_movements_new;
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
            SELECT ${imSelectExprs} FROM inventory_movements;
            DROP TABLE inventory_movements;
            ALTER TABLE inventory_movements_new RENAME TO inventory_movements;
          `)
        })
      }
    }

    // 2i. Clean legacy ticket_parts foreign keys (spare_parts view) and ensure product/variant/is_restored columns
    const tpInfo = getTableMetaAndCols('ticket_parts')
    if (tpInfo.sql) {
      const tpPartIdCol = tpInfo.cols.find((c) => c.name === 'part_id')
      const requiredTpCols = [
        'product_id',
        'variant_id',
        'unit',
        'pack_size',
        'is_restored',
        'is_demo'
      ]
      const needsTpRebuild =
        tpInfo.sql.includes('spare_parts') ||
        Boolean(tpPartIdCol && tpPartIdCol.notnull === 1) ||
        requiredTpCols.some((c) => !tpInfo.hasCol(c))

      if (needsTpRebuild) {
        const tpSelectExprs = [
          tpInfo.hasCol('id') ? 'id' : 'NULL',
          tpInfo.hasCol('ticket_id') ? 'ticket_id' : '0',
          tpInfo.hasCol('part_id') ? 'part_id' : 'NULL',
          tpInfo.hasCol('product_id') ? 'product_id' : 'NULL',
          tpInfo.hasCol('variant_id') ? 'variant_id' : 'NULL',
          tpInfo.hasCol('unit') ? "COALESCE(unit, 'piece')" : "'piece'",
          tpInfo.hasCol('pack_size') ? 'COALESCE(pack_size, 1)' : '1',
          tpInfo.hasCol('part_name') ? "COALESCE(part_name, '')" : "''",
          tpInfo.hasCol('part_code') ? "COALESCE(part_code, '')" : "''",
          tpInfo.hasCol('quantity') ? 'COALESCE(quantity, 1)' : '1',
          tpInfo.hasCol('unit_cost') ? 'COALESCE(unit_cost, 0)' : '0',
          tpInfo.hasCol('unit_price') ? 'COALESCE(unit_price, 0)' : '0',
          tpInfo.hasCol('total_price') ? 'COALESCE(total_price, 0)' : '0',
          tpInfo.hasCol('is_restored') ? 'COALESCE(is_restored, 0)' : '0',
          tpInfo.hasCol('is_demo') ? 'COALESCE(is_demo, 0)' : '0'
        ].join(', ')

        runTransaction(() => {
          db.exec(`
            DROP TABLE IF EXISTS ticket_parts_new;
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
              is_restored INTEGER NOT NULL DEFAULT 0,
              is_demo INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE
            );
            INSERT INTO ticket_parts_new (id, ticket_id, part_id, product_id, variant_id, unit, pack_size, part_name, part_code, quantity, unit_cost, unit_price, total_price, is_restored, is_demo)
            SELECT ${tpSelectExprs} FROM ticket_parts;
            DROP TABLE ticket_parts;
            ALTER TABLE ticket_parts_new RENAME TO ticket_parts;
          `)
        })
      }
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
