import { getDb } from '../connection'

/**
 * إزالة أي عوارض وهمية (Dummy Views) قبل إنشاء الجداول الحقيقية
 */
function dropCompatibilityViews(): void {
  const db = getDb()
  const viewNames = [
    'hearing_tests',
    'audiogram_points',
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
    'patient_attachments',
    'followups',
    'earmold_orders',
    'implants',
    'implant_sessions'
  ]
  const checkStmt = db.prepare("SELECT type FROM sqlite_master WHERE name = ?")
  for (const name of viewNames) {
    const row = checkStmt.get(name) as { type?: string } | undefined
    if (row?.type === 'view') {
      db.exec(`DROP VIEW IF EXISTS ${name};`)
    }
  }
}

/**
 * إنشاء الجداول الخاصة بنشاط صيانة وبرمجة وتوكيلات السماعات الطبية
 */
export function createHearingAidsTables(preserveSparePartsView = false): void {
  const db = getDb()

  dropCompatibilityViews()

  db.exec(`
    -- 1. جدول قطع غيار وملحقات السماعات الطبية المنفصل
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

  if (!preserveSparePartsView) {
    db.exec(`
      -- عارض متوافق لقطع الغيار مع مشغل التعديل والحذف المباشر
      DROP TRIGGER IF EXISTS trg_elect_spare_parts_update;
      DROP TRIGGER IF EXISTS trg_elect_spare_parts_delete;
      DROP TRIGGER IF EXISTS trg_med_spare_parts_update;
      DROP TRIGGER IF EXISTS trg_med_spare_parts_delete;
      DROP TRIGGER IF EXISTS trg_med_spare_parts_insert;
      DROP VIEW IF EXISTS spare_parts;

      CREATE VIEW IF NOT EXISTS spare_parts AS SELECT * FROM medicalmain_spare_parts;

      CREATE TRIGGER IF NOT EXISTS trg_med_spare_parts_insert
      INSTEAD OF INSERT ON spare_parts
      BEGIN
        INSERT INTO medicalmain_spare_parts (
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
            image_base64 = NEW.image_base64,
            is_demo = COALESCE(NEW.is_demo, OLD.is_demo)
        WHERE id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_med_spare_parts_delete
      INSTEAD OF DELETE ON spare_parts
      BEGIN
        DELETE FROM medicalmain_spare_parts WHERE id = OLD.id;
      END;
    `)
  }

  db.exec(`

    -- 2. جدول المنتجات والسماعات الطبية ومعالجات القوقعة
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

    -- 3. جدول متغيرات ومقاسات المنتجات
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

    -- 4. جدول الأرقام التسلسلية الفردية للسماعات والقواقع
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
      unit_cost REAL DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    -- 5. جدول الموردين والشركات الطبية
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

    -- 6. جدول مدفوعات الموردين
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

    -- 7. جدول فواتير المشتريات
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
      created_by_id INTEGER DEFAULT NULL,
      created_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    -- 8. جدول بنود فواتير المشتريات
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

    -- 9. جدول فواتير المبيعات ونقاط البيع POS
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
      returned_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'partial_return', 'returned', 'cancelled')),
      parent_invoice_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      extra_data TEXT NOT NULL DEFAULT '{}',
      created_by_id INTEGER DEFAULT NULL,
      created_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    -- 10. جدول بنود فواتير المبيعات
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

    -- 11. جدول مدفوعات وأقساط المبيعات
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

    -- 12. جدول مرتجعات الفواتير
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
      created_by_id INTEGER DEFAULT NULL,
      created_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 13. جدول بنود المرتجعات
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

    -- 14. جدول استبدال السماعات والترقية
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

    -- 15. جدول مرفقات المرضى والتقارير الطبية
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

    -- 16. جدول فحوصات السمع
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

    -- 17. جدول نقاط مخطط السمع
    CREATE TABLE IF NOT EXISTS audiogram_points (
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

    -- 18. جدول المتابعات والضبط
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
      FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
    );

    -- 19. جدول طلبيات قوالب الأذن
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
      FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (remake_of_id) REFERENCES earmold_orders(id) ON DELETE SET NULL
    );

    -- 20. جدول زراعة القوقعة الإلكترونية
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
      FOREIGN KEY (processor_serial_id) REFERENCES product_serials(id) ON DELETE SET NULL
    );

    -- 21. جدول جلسات وخرائط برمجة القوقعة
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

    -- 22. جداول تذاكر صيانة وضبط السماعات
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
  `)
}
