import { getDb } from '../connection'

/**
 * إنشاء الجداول الخاصة بنشاط صيانة الأجهزة الكهربائية والمنزلية
 */
export function createAppliancesTables(): void {
  const db = getDb()

  db.exec(`
    -- 1. جدول قطع غيار الأجهزة الكهربائية المنفصل
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

    -- 2. جدول سجل أجهزة العملاء الكهربائية
    CREATE TABLE IF NOT EXISTS customer_appliances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      appliance_type TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT DEFAULT '',
      serial_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      purchase_date TEXT DEFAULT NULL,
      last_warranty_end TEXT DEFAULT NULL,
      last_ticket_number TEXT DEFAULT NULL,
      warranty_image TEXT DEFAULT '',
      fault_images TEXT DEFAULT '[]',
      extra_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    -- 3. جدول طلبات وبلاغات صيانة الأجهزة الكهربائية
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
      extra_data TEXT NOT NULL DEFAULT '{}',
      completed_at TEXT DEFAULT NULL,
      delivered_at TEXT DEFAULT NULL,
      sales_invoice_id INTEGER DEFAULT NULL,
      product_serial_id INTEGER DEFAULT NULL,
      is_external_repair INTEGER NOT NULL DEFAULT 0,
      external_vendor TEXT DEFAULT '',
      external_sent_date TEXT DEFAULT NULL,
      external_expected_date TEXT DEFAULT NULL,
      external_returned_date TEXT DEFAULT NULL,
      external_cost REAL NOT NULL DEFAULT 0,
      external_tracking_no TEXT DEFAULT '',
      loaner_serial_id INTEGER DEFAULT NULL,
      loaner_serial_no TEXT DEFAULT '',
      loaner_product_name TEXT DEFAULT '',
      loaner_handed_at TEXT DEFAULT NULL,
      loaner_returned_at TEXT DEFAULT NULL,
      commission_rate REAL DEFAULT NULL,
      commission_amount REAL DEFAULT NULL,
      created_by_id INTEGER DEFAULT NULL,
      created_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL,
      FOREIGN KEY (appliance_id) REFERENCES customer_appliances(id) ON DELETE SET NULL
    );

    -- 4. جدول قطع الغيار المستهلكة في تذاكر صيانة الأجهزة الكهربائية
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
      is_restored INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE
    );

    -- 5. جدول حركات المخزون لقطع غيار الأجهزة الكهربائية
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
      FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE SET NULL
    );

    -- عارض متوافق spare_parts مع مشغل INSTEAD OF UPDATE لضمان عمل أي تحديث مباشر
    DROP TRIGGER IF EXISTS trg_med_spare_parts_update;
    DROP TRIGGER IF EXISTS trg_med_spare_parts_delete;
    DROP TRIGGER IF EXISTS trg_elect_spare_parts_update;
    DROP TRIGGER IF EXISTS trg_elect_spare_parts_delete;
    DROP TRIGGER IF EXISTS trg_elect_spare_parts_insert;
    DROP VIEW IF EXISTS spare_parts;

    CREATE VIEW IF NOT EXISTS spare_parts AS SELECT * FROM elect_spare_parts;

    CREATE TRIGGER IF NOT EXISTS trg_elect_spare_parts_insert
    INSTEAD OF INSERT ON spare_parts
    BEGIN
      INSERT INTO elect_spare_parts (
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
          image_base64 = NEW.image_base64,
          is_demo = COALESCE(NEW.is_demo, OLD.is_demo)
      WHERE id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_elect_spare_parts_delete
    INSTEAD OF DELETE ON spare_parts
    BEGIN
      DELETE FROM elect_spare_parts WHERE id = OLD.id;
    END;
  `)

  // إنشاء العوارض التوافقية الفارغة فقط في حال عدم وجود جداول حقيقية بنفس الاسم
  const dummyViews: Record<string, string> = {
    hearing_tests: `SELECT NULL as id, '' as test_number, NULL as patient_id, '' as test_date, NULL as examiner_id,
             '' as examiner_name, '' as test_type, NULL as srt_right, NULL as srt_left, NULL as sds_right,
             NULL as sds_left, NULL as mcl_right, NULL as mcl_left, NULL as ucl_right, NULL as ucl_left,
             '' as tymp_right, '' as tymp_left, NULL as pta_right, NULL as pta_left, '' as loss_type_right,
             '' as loss_type_left, '' as loss_degree_right, '' as loss_degree_left, NULL as recommended_product_id,
             '' as recommended_product_name, '' as recommendation_notes, '' as notes, '' as created_at WHERE 0`,
    audiogram_points: `SELECT NULL as id, NULL as test_id, '' as ear, '' as conduction, 0 as frequency, 0 as db_value, 0 as is_masked, 0 as no_response WHERE 0`,
    products: `SELECT NULL as id, '' as code, '' as barcode, '' as name, '' as type, '' as sub_category,
             '' as brand, '' as model, '' as compatible_with, 0 as track_serial, 0 as has_variants,
             '' as unit_name, '' as pack_name, 1 as pack_size, 0 as cost_price, 0 as sale_price,
             0 as pack_cost_price, 0 as pack_sale_price, 0 as qty, 0 as min_stock, 0 as warranty_months,
             '' as image_base64, '' as notes, '{}' as extra_data, 0 as is_active, '' as created_at WHERE 0`,
    product_variants: `SELECT NULL as id, NULL as product_id, '' as variant_name, '' as size, '' as color, '' as sku,
             '' as barcode, NULL as cost_price, NULL as sale_price, NULL as pack_cost_price,
             NULL as pack_sale_price, 0 as qty, 0 as min_stock, 0 as is_active WHERE 0`,
    product_serials: `SELECT NULL as id, NULL as product_id, NULL as variant_id, '' as serial_no, '' as status,
             '' as condition, NULL as purchase_item_id, NULL as sale_item_id, NULL as customer_id,
             '' as ear_side, NULL as company_warranty_start, NULL as company_warranty_end,
             NULL as customer_warranty_start, NULL as customer_warranty_end, NULL as unit_cost, '' as notes, '' as created_at WHERE 0`,
    suppliers: `SELECT NULL as id, '' as name, '' as company_name, '' as phone, '' as phone2, '' as address,
             '' as supplier_type, NULL as customer_id, 0 as balance, '' as notes, 0 as is_active, '' as created_at WHERE 0`,
    supplier_payments: `SELECT NULL as id, NULL as supplier_id, NULL as purchase_invoice_id, 0 as amount, '' as payment_method,
             NULL as treasury_tx_id, '' as notes, '' as created_at WHERE 0`,
    purchase_invoices: `SELECT NULL as id, '' as invoice_number, '' as purchase_type, NULL as supplier_id, NULL as customer_id,
             '' as party_name, '' as party_phone, '' as invoice_date, '' as supplier_ref_no, 0 as subtotal,
             0 as discount, 0 as total_amount, 0 as paid_amount, 0 as remaining_amount, '' as payment_method,
             '' as status, '' as notes, NULL as created_by_id, '' as created_by_name, '' as created_at WHERE 0`,
    purchase_items: `SELECT NULL as id, NULL as invoice_id, NULL as product_id, NULL as variant_id, '' as product_name,
             '' as variant_name, '' as unit, 1 as pack_size, 0 as quantity, 0 as added_pieces_qty,
             0 as unit_cost, 0 as total_cost, '' as condition, '[]' as serials_json, NULL as company_warranty_end,
             0 as returned_qty WHERE 0`,
    sales_invoices: `SELECT NULL as id, '' as invoice_number, '' as invoice_type, NULL as customer_id, '' as customer_name,
             '' as customer_phone, 0 as subtotal, 0 as discount, 0 as trade_in_credit, 0 as total_amount,
             0 as paid_amount, 0 as remaining_amount, 0 as returned_amount, '' as payment_method, '' as status, NULL as parent_invoice_id,
             '' as notes, '{}' as extra_data, NULL as created_by_id, '' as created_by_name, '' as created_at, '' as updated_at WHERE 0`,
    sales_items: `SELECT NULL as id, NULL as invoice_id, NULL as product_id, NULL as variant_id, '' as product_name,
             '' as variant_name, '' as item_type, '' as unit, 1 as pack_size, 0 as quantity,
             0 as deducted_pieces_qty, NULL as serial_id, '' as serial_no, '' as condition, '' as ear_side,
             0 as unit_cost, 0 as unit_price, 0 as discount, 0 as total_price, 0 as warranty_months,
             NULL as warranty_start, NULL as warranty_end, 0 as returned_qty WHERE 0`,
    sales_payments: `SELECT NULL as id, NULL as invoice_id, NULL as customer_id, 0 as amount, '' as payment_method,
             '' as payment_type, NULL as treasury_tx_id, '' as notes, '' as created_at WHERE 0`,
    invoice_returns: `SELECT NULL as id, '' as return_number, '' as return_type, NULL as invoice_id, '' as invoice_number,
             NULL as party_id, '' as party_name, 0 as total_return_amount, 0 as cash_refunded,
             0 as balance_adjusted, '' as payment_method, '' as reason, NULL as created_by_id, '' as created_by_name, '' as created_at WHERE 0`,
    invoice_return_items: `SELECT NULL as id, NULL as return_id, NULL as invoice_item_id, NULL as product_id, NULL as variant_id,
             '' as product_name, 0 as quantity, 0 as pieces_qty, NULL as serial_id, '' as serial_no,
             '' as return_condition, 0 as amount WHERE 0`,
    product_exchanges: `SELECT NULL as id, '' as exchange_number, '' as exchange_type, NULL as original_invoice_id,
             NULL as new_invoice_id, NULL as customer_id, '' as customer_name, NULL as returned_product_id,
             '' as returned_product_name, '' as returned_serial_no, '' as returned_condition,
             0 as returned_value, NULL as new_product_id, '' as new_product_name, '' as new_serial_no,
             0 as new_value, 0 as price_difference, 0 as paid_difference, '' as payment_method,
             NULL as transferred_warranty_end, NULL as external_repair_ticket_id, '' as notes, '' as created_at WHERE 0`,
    patient_attachments: `SELECT NULL as id, NULL as patient_id, '' as entity_type, NULL as entity_id, '' as title,
             '' as category, '' as file_name, '' as stored_name, '' as mime_type, 0 as file_size,
             '' as notes, '' as created_at WHERE 0`,
    followups: `SELECT NULL as id, NULL as patient_id, NULL as device_id, '' as serial_no, NULL as implant_id,
             '' as type, '' as status, '' as due_date, NULL as done_date, NULL as technician_id,
             '{}' as fitting_settings_json, '' as notes, '' as created_at WHERE 0`,
    earmold_orders: `SELECT NULL as id, '' as order_number, NULL as patient_id, NULL as device_id, NULL as sales_invoice_id,
             '' as ear, '' as mold_type, '' as material, '' as color, '' as vent_size, '' as tube_type,
             '' as impression_date, '' as lab_name, NULL as sent_date, NULL as expected_date,
             NULL as received_date, NULL as delivered_date, '' as status, 0 as lab_cost, 0 as customer_price,
             0 as is_lab_cost_paid, NULL as remake_of_id, '' as notes, '' as created_at WHERE 0`,
    implants: `SELECT NULL as id, NULL as patient_id, '' as ear, '' as brand, '' as internal_model,
             '' as internal_serial, NULL as surgery_date, '' as hospital, '' as surgeon,
             NULL as activation_date, NULL as processor_device_id, NULL as processor_serial_id,
             '' as processor_model, '' as processor_serial_no, NULL as processor_warranty_end,
             '{}' as accessories_json, '' as notes, '' as created_at WHERE 0`,
    implant_sessions: `SELECT NULL as id, NULL as implant_id, NULL as patient_id, '' as session_date, '' as session_type,
             NULL as technician_id, '' as examiner_name, '' as program_notes, '{}' as thresholds_json,
             NULL as map_attachment_id, NULL as next_due_date, NULL as followup_id, '' as created_at WHERE 0`
  }

  const checkObjStmt = db.prepare("SELECT type FROM sqlite_master WHERE name = ?")
  for (const [viewName, selectSql] of Object.entries(dummyViews)) {
    const existing = checkObjStmt.get(viewName) as { type?: string } | undefined
    if (!existing) {
      db.exec(`CREATE VIEW IF NOT EXISTS ${viewName} AS ${selectSql};`)
    }
  }
}
