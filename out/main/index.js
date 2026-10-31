let electron = require("electron");
let path = require("path");
let fs = require("fs");
let _electron_toolkit_utils = require("@electron-toolkit/utils");
// src/main/db.ts
var requireModule = (0, require("module").createRequire)(require("url").pathToFileURL(__filename).href);
var db;
var dbFilePath = "";
function createDatabaseConnection(filePath) {
	try {
		const instance = new (requireModule("better-sqlite3"))(filePath);
		instance.pragma("journal_mode = WAL");
		instance.pragma("foreign_keys = ON");
		return instance;
	} catch {
		const { DatabaseSync } = requireModule("node:sqlite");
		const instance = new DatabaseSync(filePath);
		instance.exec("PRAGMA journal_mode = WAL;");
		instance.exec("PRAGMA foreign_keys = ON;");
		return instance;
	}
}
function runTransaction(fn) {
	db.exec("BEGIN IMMEDIATE TRANSACTION;");
	try {
		const result = fn();
		db.exec("COMMIT;");
		return result;
	} catch (err) {
		db.exec("ROLLBACK;");
		throw err;
	}
}
function getDatabasePath() {
	return dbFilePath;
}
function initDatabase() {
	const userDataDir = electron.app.getPath("userData");
	if (!(0, fs.existsSync)(userDataDir)) (0, fs.mkdirSync)(userDataDir, { recursive: true });
	dbFilePath = (0, path.join)(userDataDir, "sallehli_aljoker.sqlite");
	db = createDatabaseConnection(dbFilePath);
	createTables();
	seedDefaults();
}
function createTables() {
	db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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
  `);
}
function seedDefaults() {
	if (!db.prepare("SELECT id FROM users WHERE username = ?").get("admin")) db.prepare(`INSERT INTO users (username, password_hash, full_name, phone, role, is_active, notes)
       VALUES (?, ?, ?, ?, 'super_admin', 1, ?)`).run("admin", "8520", "السوبر أدمن (مالك النظام)", "01000000000", "الحساب الرئيسي لمالك البرنامج بالكامل");
	const defaultSettings = {
		center_name: "مركز صلحلي للصيانة المعتمدة",
		center_subtitle: "صيانة جميع الأجهزة المنزلية والكهربائية (غسالات - ثلاجات - ديب فريزر - تكييفات - بوتاجازات - سخانات)",
		phone1: "01012345678",
		phone2: "01112345678",
		whatsapp: "201012345678",
		address: "القاهرة - شارع التحرير الرئيسي - بجوار محطة المترو",
		logo_base64: "",
		default_print_format: "a4",
		default_inspection_fee: 150,
		default_warranty_months: 6,
		warranty_terms: "1. يشمل الضمان قطع الغيار المستبدلة والعطل الذي تم إصلاحه فقط خلال فترة الضمان المحددة.\n2. لا يشمل الضمان الأعطال الناتجة عن سوء الاستخدام أو تذبذب التيار الكهربائي أو الكسر.\n3. يرجى الاحتفاظ بهذه الفاتورة لتقديمها عند طلب الصيانة بالضمان.",
		receipt_footer: "شكراً لثقتكم في مركز صلحلي - خدمتكم شرف لنا على مدار الساعة"
	};
	const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
	for (const [k, v] of Object.entries(defaultSettings)) insertSetting.run(k, String(v));
	if (db.prepare("SELECT COUNT(*) as cnt FROM technicians").get().cnt === 0) db.prepare(`INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active, notes)
       VALUES
       ('م. أحمد الجوكر', '01011223344', 'غسالات أوتوماتيك وفوق أوتوماتيك', 35, 3000, 1, 'فني أول خبرة 12 سنة'),
       ('م. محمود عبد الرحمن', '01122334455', 'ثلاجات وديب فريزر وتكييف', 30, 3500, 1, 'متخصص شحن فريون وكباسات انفرتر'),
       ('م. كريم عادل', '01233445566', 'كروت إلكترونية وبوتاجازات وسخانات', 40, 2500, 1, 'صيانة كروت ديجيتال وانفرتر')`).run();
	if (db.prepare("SELECT COUNT(*) as cnt FROM spare_parts").get().cnt === 0) db.prepare(`INSERT INTO spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location)
       VALUES
       ('WM-PMP-01', 'طلمبة طرد غسالة أوتوماتيك أصلية', 'غسالات', 'LG / Samsung', 280, 480, 12, 3, 'رف A1'),
       ('WM-HTR-02', 'هيتر تسخين غسالة أوتوماتيك بالثرموستات', 'غسالات', 'Zanussi / Toshib', 190, 350, 8, 3, 'رف A2'),
       ('RF-CMP-01', 'كباس ثلاجة 1/4 حصان إنفرتر أصلي', 'ثلاجات وديب فريزر', 'LG', 2400, 3300, 4, 2, 'مخزن B1'),
       ('RF-GAS-02', 'شحنة فريون R134a / R600a كاملة بالفلتر', 'ثلاجات وديب فريزر', 'عام', 320, 750, 15, 5, 'قسم التبريد'),
       ('RF-TMR-03', 'تايمر وثرموستات وسخان نوفروست (طقم ديفروست)', 'ثلاجات وديب فريزر', 'Toshiba / Kiriazi', 380, 680, 2, 4, 'رف B2'),
       ('AC-CAP-01', 'كباستور تكييف ثنائي 45/5 ميكروفاراد', 'تكييفات', 'Carrier / Sharp', 160, 350, 10, 3, 'رف C1'),
       ('WM-LCK-04', 'لوك باب غسالة أوتوماتيك كهرباء', 'غسالات', 'Beko / Ariston', 210, 400, 2, 3, 'رف A3')`).run();
	if (db.prepare("SELECT COUNT(*) as cnt FROM customers").get().cnt === 0) {
		db.prepare(`INSERT INTO customers (name, phone, phone2, area, address, notes)
       VALUES
       ('أستاذ محمد عبد السلام', '01099887766', '01299887766', 'مدينة نصر', 'ش عباس العقاد - عمارة 14 - الدور الرابع شقة 8', 'عميل مميز'),
       ('مدام نهى إبراهيم', '01155443322', '', 'المعادي', 'شارع 9 - بجوار مترو المعادي - برج النور الدور 3', 'يفضل الزيارة بعد الساعة 2 ظهراً')`).run();
		db.prepare(`INSERT INTO customer_appliances (customer_id, appliance_type, brand, model, serial_number, last_warranty_end, last_ticket_number)
       VALUES
       (1, 'غسالة أوتوماتيك', 'LG', 'Inverter Direct Drive 8KG', 'LG-884120', date('now', '+5 months'), 'SJ-2026-0001'),
       (2, 'ثلاجة نوفروست', 'Toshiba', '16 قدم سيلفر', 'TSH-44109', NULL, 'SJ-2026-0002')`).run();
		const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
		const warrantyEnd = /* @__PURE__ */ new Date();
		warrantyEnd.setMonth(warrantyEnd.getMonth() + 6);
		const warrantyEndStr = warrantyEnd.toISOString().slice(0, 10);
		db.prepare(`INSERT INTO maintenance_tickets (
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
      )`).run(today, today, warrantyEndStr, today);
		db.prepare(`INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
       VALUES (1, 1, 'طلمبة طرد غسالة أوتوماتيك أصلية', 'WM-PMP-01', 1, 280, 480, 480)`).run();
		db.prepare(`INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description)
       VALUES
       ('income', 'تحصيل فاتورة صيانة', 880, 1, 'cash', 'تحصيل طلب صيانة SJ-2026-0001 - أستاذ محمد عبد السلام'),
       ('income', 'رسوم كشف', 150, 2, 'instapay', 'تحصيل رسوم كشف طلب SJ-2026-0002 - مدام نهى إبراهيم')`).run();
	}
}
function loginUser(payload) {
	const userRow = db.prepare(`SELECT id, username, password_hash, full_name, phone, role, is_active,
              subscription_start, subscription_end, notes, created_at
       FROM users WHERE username = ?`).get(payload.username.trim());
	if (!userRow || userRow.password_hash !== payload.password) return {
		success: false,
		message: "اسم المستخدم أو كلمة المرور غير صحيحة"
	};
	if (!userRow.is_active) return {
		success: false,
		message: "هذا الحساب موقوف حالياً. يرجى التواصل مع مالك البرنامج (السوبر أدمن)."
	};
	let isExpired = false;
	let daysRemaining = null;
	if (userRow.role === "tenant") {
		if (!userRow.subscription_end) return {
			success: false,
			message: "لم يتم تحديد فترة اشتراك لهذا الحساب المستأجر. يرجى مراجعة السوبر أدمن."
		};
		const today = /* @__PURE__ */ new Date();
		today.setHours(0, 0, 0, 0);
		const endDate = new Date(userRow.subscription_end);
		endDate.setHours(23, 59, 59, 999);
		const diffMs = endDate.getTime() - today.getTime();
		daysRemaining = Math.ceil(diffMs / 864e5);
		if (diffMs < 0) {
			isExpired = true;
			return {
				success: false,
				message: `انتهت فترة إيجار البرنامج بتاريخ (${userRow.subscription_end}). يرجى التواصل مع السوبر أدمن لتجديد الاشتراك.`,
				subscriptionStatus: {
					isExpired: true,
					daysRemaining: 0
				}
			};
		}
	}
	const { password_hash: _, ...safeUser } = userRow;
	return {
		success: true,
		user: safeUser,
		subscriptionStatus: {
			isExpired,
			daysRemaining
		}
	};
}
function listUsers() {
	return db.prepare(`SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at
       FROM users ORDER BY id ASC`).all();
}
function saveUser(data) {
	if (data.id) {
		if (data.password && data.password.trim() !== "") db.prepare(`UPDATE users SET username = ?, password_hash = ?, full_name = ?, phone = ?, role = ?,
         is_active = ?, subscription_start = ?, subscription_end = ?, notes = ?
         WHERE id = ?`).run(data.username?.trim(), data.password.trim(), data.full_name?.trim(), data.phone || "", data.role || "tenant", data.is_active ?? 1, data.subscription_start || null, data.subscription_end || null, data.notes || "", data.id);
		else db.prepare(`UPDATE users SET username = ?, full_name = ?, phone = ?, role = ?,
         is_active = ?, subscription_start = ?, subscription_end = ?, notes = ?
         WHERE id = ?`).run(data.username?.trim(), data.full_name?.trim(), data.phone || "", data.role || "tenant", data.is_active ?? 1, data.subscription_start || null, data.subscription_end || null, data.notes || "", data.id);
		return db.prepare("SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at FROM users WHERE id = ?").get(data.id);
	} else {
		const info = db.prepare(`INSERT INTO users (username, password_hash, full_name, phone, role, is_active, subscription_start, subscription_end, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(data.username?.trim(), data.password?.trim() || "1234", data.full_name?.trim(), data.phone || "", data.role || "tenant", data.is_active ?? 1, data.subscription_start || null, data.subscription_end || null, data.notes || "");
		return db.prepare("SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at FROM users WHERE id = ?").get(Number(info.lastInsertRowid));
	}
}
function deleteUser(id) {
	if (db.prepare("SELECT username FROM users WHERE id = ?").get(id)?.username === "admin") throw new Error("لا يمكن حذف الحساب الافتراضي للسوبر أدمن (admin)");
	db.prepare("DELETE FROM users WHERE id = ?").run(id);
}
function listCustomers(search = "") {
	const q = `%${search.trim()}%`;
	return db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM maintenance_tickets t WHERE t.customer_id = c.id) as tickets_count
       FROM customers c
       WHERE c.name LIKE ? OR c.phone LIKE ? OR c.phone2 LIKE ? OR c.area LIKE ?
       ORDER BY c.id DESC`).all(q, q, q, q);
}
function findCustomerByPhone(phone) {
	const clean = phone.trim();
	if (!clean) return {
		customer: null,
		appliances: [],
		previousTickets: []
	};
	const customer = db.prepare("SELECT * FROM customers WHERE phone = ? OR phone2 = ? LIMIT 1").get(clean, clean);
	if (!customer) return {
		customer: null,
		appliances: [],
		previousTickets: []
	};
	return {
		customer,
		appliances: db.prepare("SELECT * FROM customer_appliances WHERE customer_id = ? ORDER BY id DESC").all(customer.id),
		previousTickets: db.prepare("SELECT * FROM maintenance_tickets WHERE customer_id = ? ORDER BY id DESC LIMIT 10").all(customer.id)
	};
}
function saveCustomer(data) {
	if (data.id) {
		db.prepare(`UPDATE customers SET name = ?, phone = ?, phone2 = ?, area = ?, address = ?, notes = ?
       WHERE id = ?`).run(data.name?.trim(), data.phone?.trim(), data.phone2?.trim() || "", data.area?.trim() || "", data.address?.trim() || "", data.notes?.trim() || "", data.id);
		return db.prepare("SELECT * FROM customers WHERE id = ?").get(data.id);
	} else {
		const info = db.prepare(`INSERT INTO customers (name, phone, phone2, area, address, notes)
         VALUES (?, ?, ?, ?, ?, ?)`).run(data.name?.trim(), data.phone?.trim(), data.phone2?.trim() || "", data.area?.trim() || "", data.address?.trim() || "", data.notes?.trim() || "");
		return db.prepare("SELECT * FROM customers WHERE id = ?").get(Number(info.lastInsertRowid));
	}
}
function deleteCustomer(id) {
	db.prepare("DELETE FROM customers WHERE id = ?").run(id);
}
function getCustomerAppliances(customerId) {
	return db.prepare("SELECT * FROM customer_appliances WHERE customer_id = ? ORDER BY id DESC").all(customerId);
}
function listTechnicians() {
	return db.prepare(`SELECT tech.*,
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
       ORDER BY tech.id DESC`).all();
}
function saveTechnician(data) {
	if (data.id) {
		db.prepare(`UPDATE technicians
       SET name = ?, phone = ?, specialty = ?, commission_rate = ?, base_salary = ?, is_active = ?, notes = ?
       WHERE id = ?`).run(data.name?.trim(), data.phone?.trim(), data.specialty?.trim() || "شامل", Number(data.commission_rate ?? 30), Number(data.base_salary ?? 0), data.is_active ?? 1, data.notes?.trim() || "", data.id);
		return db.prepare("SELECT * FROM technicians WHERE id = ?").get(data.id);
	} else {
		const info = db.prepare(`INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`).run(data.name?.trim(), data.phone?.trim(), data.specialty?.trim() || "شامل", Number(data.commission_rate ?? 30), Number(data.base_salary ?? 0), data.is_active ?? 1, data.notes?.trim() || "");
		return db.prepare("SELECT * FROM technicians WHERE id = ?").get(Number(info.lastInsertRowid));
	}
}
function deleteTechnician(id) {
	db.prepare("DELETE FROM technicians WHERE id = ?").run(id);
}
function listSpareParts(search = "") {
	const q = `%${search.trim()}%`;
	return db.prepare(`SELECT * FROM spare_parts
       WHERE name LIKE ? OR code LIKE ? OR category LIKE ? OR brand LIKE ?
       ORDER BY id DESC`).all(q, q, q, q);
}
function saveSparePart(data) {
	if (data.id) {
		db.prepare(`UPDATE spare_parts
       SET code = ?, name = ?, category = ?, brand = ?, purchase_price = ?, selling_price = ?,
           quantity = ?, min_quantity = ?, location = ?, notes = ?
       WHERE id = ?`).run(data.code?.trim(), data.name?.trim(), data.category?.trim() || "عام", data.brand?.trim() || "عام", Number(data.purchase_price ?? 0), Number(data.selling_price ?? 0), Number(data.quantity ?? 0), Number(data.min_quantity ?? 3), data.location?.trim() || "", data.notes?.trim() || "", data.id);
		return db.prepare("SELECT * FROM spare_parts WHERE id = ?").get(data.id);
	} else {
		const code = data.code?.trim() || `PT-${Date.now().toString().slice(-5)}`;
		const info = db.prepare(`INSERT INTO spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(code, data.name?.trim(), data.category?.trim() || "عام", data.brand?.trim() || "عام", Number(data.purchase_price ?? 0), Number(data.selling_price ?? 0), Number(data.quantity ?? 0), Number(data.min_quantity ?? 3), data.location?.trim() || "", data.notes?.trim() || "");
		return db.prepare("SELECT * FROM spare_parts WHERE id = ?").get(Number(info.lastInsertRowid));
	}
}
function deleteSparePart(id) {
	db.prepare("DELETE FROM spare_parts WHERE id = ?").run(id);
}
function recordInventoryMovement(payload) {
	runTransaction(() => {
		const part = db.prepare("SELECT * FROM spare_parts WHERE id = ?").get(payload.part_id);
		if (!part) throw new Error("قطعة الغيار غير موجودة");
		const qty = Math.abs(Number(payload.quantity));
		if (qty <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");
		let delta = 0;
		if (payload.movement_type === "in" || payload.movement_type === "custody_return") delta = qty;
		else {
			if (part.quantity < qty) throw new Error(`الكمية المتاحة في المخزن (${part.quantity}) غير كافية لصرف (${qty})`);
			delta = -qty;
		}
		db.prepare("UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?").run(delta, part.id);
		db.prepare(`INSERT INTO inventory_movements (part_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(part.id, payload.technician_id || null, payload.ticket_id || null, payload.movement_type, qty, part.purchase_price, part.selling_price, payload.notes || "");
		if (payload.movement_type === "in" && payload.recordInTreasury) {
			const totalPurchase = qty * part.purchase_price;
			if (totalPurchase > 0) db.prepare(`INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
           VALUES ('expense', 'شراء قطع غيار', ?, 'cash', ?)`).run(totalPurchase, `توريد مخزني: ${qty} × ${part.name} (${part.code})`);
		}
	});
}
function listInventoryMovements() {
	return db.prepare(`SELECT im.*, sp.name as part_name, sp.code as part_code,
              t.name as technician_name, mt.ticket_number
       FROM inventory_movements im
       LEFT JOIN spare_parts sp ON sp.id = im.part_id
       LEFT JOIN technicians t ON t.id = im.technician_id
       LEFT JOIN maintenance_tickets mt ON mt.id = im.ticket_id
       ORDER BY im.id DESC LIMIT 150`).all();
}
function generateNextTicketNumber() {
	const year = (/* @__PURE__ */ new Date()).getFullYear();
	const lastRow = db.prepare("SELECT id FROM maintenance_tickets ORDER BY id DESC LIMIT 1").get();
	const nextSeq = (lastRow ? lastRow.id : 0) + 1;
	return `SJ-${year}-${String(nextSeq).padStart(4, "0")}`;
}
function listTickets(filters) {
	const q = `%${(filters?.search || "").trim()}%`;
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
  `;
	const params = [
		q,
		q,
		q,
		q,
		q,
		q
	];
	if (filters?.status && filters.status !== "all") {
		sql += " AND mt.status = ?";
		params.push(filters.status);
	}
	if (filters?.service_type && filters.service_type !== "all") {
		sql += " AND mt.service_type = ?";
		params.push(filters.service_type);
	}
	if (filters?.technician_id) {
		sql += " AND mt.technician_id = ?";
		params.push(filters.technician_id);
	}
	sql += " ORDER BY mt.id DESC";
	const rows = db.prepare(sql).all(...params);
	const getPartsStmt = db.prepare("SELECT * FROM ticket_parts WHERE ticket_id = ?");
	for (const row of rows) row.parts = getPartsStmt.all(row.id);
	return rows;
}
function saveTicket(data) {
	return runTransaction(() => {
		let customerId = data.customer_id;
		if (!customerId) {
			const existingCust = db.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").get(data.customer_phone?.trim() || "");
			if (existingCust) {
				customerId = existingCust.id;
				db.prepare("UPDATE customers SET name = ?, phone2 = ?, area = ?, address = ? WHERE id = ?").run(data.customer_name?.trim(), data.customer_phone2?.trim() || "", data.customer_area?.trim() || "", data.customer_address?.trim() || "", customerId);
			} else {
				const custInfo = db.prepare("INSERT INTO customers (name, phone, phone2, area, address) VALUES (?, ?, ?, ?, ?)").run(data.customer_name?.trim(), data.customer_phone?.trim(), data.customer_phone2?.trim() || "", data.customer_area?.trim() || "", data.customer_address?.trim() || "");
				customerId = Number(custInfo.lastInsertRowid);
			}
		}
		const parts = data.parts || [];
		let partsSellingTotal = 0;
		let partsCostTotal = 0;
		for (const p of parts) {
			const qty = Number(p.quantity || 1);
			const uPrice = Number(p.unit_price || 0);
			const uCost = Number(p.unit_cost || 0);
			partsSellingTotal += qty * uPrice;
			partsCostTotal += qty * uCost;
		}
		const inspectionFee = Number(data.inspection_fee ?? 0);
		const laborCost = Number(data.labor_cost ?? 0);
		const discount = Number(data.discount ?? 0);
		const totalAmount = Math.max(0, inspectionFee + laborCost + partsSellingTotal - discount);
		const paidAmount = Number(data.paid_amount ?? 0);
		const remainingAmount = Math.max(0, totalAmount - paidAmount);
		const warrantyMonths = Number(data.warranty_months ?? 0);
		let warrantyStart = data.warranty_start_date || null;
		let warrantyEnd = data.warranty_end_date || null;
		if ((data.status === "repaired" || data.status === "delivered") && warrantyMonths > 0) {
			if (!warrantyStart) warrantyStart = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
			const d = new Date(warrantyStart);
			d.setMonth(d.getMonth() + warrantyMonths);
			warrantyEnd = d.toISOString().slice(0, 10);
		} else if (warrantyMonths === 0) {
			warrantyStart = null;
			warrantyEnd = null;
		}
		let ticketId = data.id;
		let ticketNumber = data.ticket_number || "";
		let previousPaid = 0;
		if (ticketId) {
			const oldTicket = db.prepare("SELECT paid_amount, ticket_number FROM maintenance_tickets WHERE id = ?").get(ticketId);
			previousPaid = oldTicket?.paid_amount ?? 0;
			ticketNumber = oldTicket?.ticket_number || ticketNumber;
			const oldParts = db.prepare("SELECT * FROM ticket_parts WHERE ticket_id = ?").all(ticketId);
			for (const op of oldParts) db.prepare("UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?").run(op.quantity, op.part_id);
			db.prepare("DELETE FROM ticket_parts WHERE ticket_id = ?").run(ticketId);
			db.prepare(`UPDATE maintenance_tickets SET
          customer_id = ?, customer_name = ?, customer_phone = ?, customer_phone2 = ?,
          customer_area = ?, customer_address = ?, appliance_type = ?, brand = ?, model = ?,
          serial_number = ?, service_type = ?, status = ?, priority = ?, complaint = ?,
          diagnosis = ?, technician_id = ?, scheduled_date = ?, inspection_fee = ?,
          labor_cost = ?, parts_total = ?, parts_cost_total = ?, discount = ?,
          total_amount = ?, paid_amount = ?, remaining_amount = ?, payment_method = ?,
          warranty_months = ?, warranty_start_date = ?, warranty_end_date = ?,
          is_under_previous_warranty = ?, previous_ticket_number = ?, notes = ?,
          completed_at = CASE WHEN ? IN ('repaired', 'delivered') AND completed_at IS NULL THEN datetime('now', 'localtime') ELSE completed_at END,
          delivered_at = CASE WHEN ? = 'delivered' AND delivered_at IS NULL THEN datetime('now', 'localtime') ELSE delivered_at END,
          updated_at = datetime('now', 'localtime')
         WHERE id = ?`).run(customerId, data.customer_name?.trim(), data.customer_phone?.trim(), data.customer_phone2?.trim() || "", data.customer_area?.trim() || "", data.customer_address?.trim() || "", data.appliance_type?.trim(), data.brand?.trim(), data.model?.trim() || "", data.serial_number?.trim() || "", data.service_type || "home_visit", data.status || "new", data.priority || "normal", data.complaint?.trim() || "", data.diagnosis?.trim() || "", data.technician_id || null, data.scheduled_date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), inspectionFee, laborCost, partsSellingTotal, partsCostTotal, discount, totalAmount, paidAmount, remainingAmount, data.payment_method || "cash", warrantyMonths, warrantyStart, warrantyEnd, data.is_under_previous_warranty ? 1 : 0, data.previous_ticket_number || null, data.notes?.trim() || "", data.status || "new", data.status || "new", ticketId);
		} else {
			ticketNumber = generateNextTicketNumber();
			const info = db.prepare(`INSERT INTO maintenance_tickets (
            ticket_number, customer_id, customer_name, customer_phone, customer_phone2,
            customer_area, customer_address, appliance_type, brand, model, serial_number,
            service_type, status, priority, complaint, diagnosis, technician_id, scheduled_date,
            inspection_fee, labor_cost, parts_total, parts_cost_total, discount, total_amount,
            paid_amount, remaining_amount, payment_method, warranty_months,
            warranty_start_date, warranty_end_date, is_under_previous_warranty, previous_ticket_number, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ticketNumber, customerId, data.customer_name?.trim(), data.customer_phone?.trim(), data.customer_phone2?.trim() || "", data.customer_area?.trim() || "", data.customer_address?.trim() || "", data.appliance_type?.trim(), data.brand?.trim(), data.model?.trim() || "", data.serial_number?.trim() || "", data.service_type || "home_visit", data.status || "new", data.priority || "normal", data.complaint?.trim() || "", data.diagnosis?.trim() || "", data.technician_id || null, data.scheduled_date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), inspectionFee, laborCost, partsSellingTotal, partsCostTotal, discount, totalAmount, paidAmount, remainingAmount, data.payment_method || "cash", warrantyMonths, warrantyStart, warrantyEnd, data.is_under_previous_warranty ? 1 : 0, data.previous_ticket_number || null, data.notes?.trim() || "");
			ticketId = Number(info.lastInsertRowid);
		}
		for (const p of parts) {
			const partRecord = db.prepare("SELECT * FROM spare_parts WHERE id = ?").get(p.part_id);
			if (!partRecord) continue;
			const qty = Number(p.quantity || 1);
			if (partRecord.quantity < qty) throw new Error(`الكمية المتاحة من القطعة (${partRecord.name}) هي ${partRecord.quantity} فقط ولا تكفي لصرف ${qty}`);
			db.prepare("UPDATE spare_parts SET quantity = quantity - ? WHERE id = ?").run(qty, partRecord.id);
			const uPrice = Number(p.unit_price || partRecord.selling_price);
			const uCost = Number(p.unit_cost || partRecord.purchase_price);
			db.prepare(`INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(ticketId, partRecord.id, partRecord.name, partRecord.code, qty, uCost, uPrice, qty * uPrice);
		}
		const existingAppliance = db.prepare(`SELECT id FROM customer_appliances
         WHERE customer_id = ? AND appliance_type = ? AND brand = ? LIMIT 1`).get(customerId, data.appliance_type?.trim(), data.brand?.trim());
		if (existingAppliance) db.prepare(`UPDATE customer_appliances
         SET model = ?, serial_number = ?, last_warranty_end = COALESCE(?, last_warranty_end), last_ticket_number = ?
         WHERE id = ?`).run(data.model?.trim() || "", data.serial_number?.trim() || "", warrantyEnd, ticketNumber, existingAppliance.id);
		else db.prepare(`INSERT INTO customer_appliances (customer_id, appliance_type, brand, model, serial_number, last_warranty_end, last_ticket_number)
         VALUES (?, ?, ?, ?, ?, ?, ?)`).run(customerId, data.appliance_type?.trim(), data.brand?.trim(), data.model?.trim() || "", data.serial_number?.trim() || "", warrantyEnd, ticketNumber);
		const paymentDelta = paidAmount - previousPaid;
		if (paymentDelta > 0 && data.recordPaymentInTreasury !== false) db.prepare(`INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description)
         VALUES ('income', 'تحصيل صيانة / كشف', ?, ?, ?, ?)`).run(paymentDelta, ticketId, data.payment_method || "cash", `تحصيل دفعة من طلب صيانة ${ticketNumber} - العميل: ${data.customer_name}`);
		const saved = db.prepare(`SELECT mt.*, t.name as technician_name
         FROM maintenance_tickets mt
         LEFT JOIN technicians t ON t.id = mt.technician_id
         WHERE mt.id = ?`).get(ticketId);
		saved.parts = db.prepare("SELECT * FROM ticket_parts WHERE ticket_id = ?").all(ticketId);
		return saved;
	});
}
function deleteTicket(id) {
	runTransaction(() => {
		const oldParts = db.prepare("SELECT * FROM ticket_parts WHERE ticket_id = ?").all(id);
		for (const op of oldParts) db.prepare("UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?").run(op.quantity, op.part_id);
		db.prepare("DELETE FROM maintenance_tickets WHERE id = ?").run(id);
	});
}
function listTreasuryTransactions() {
	return db.prepare(`SELECT tt.*, mt.ticket_number, tech.name as technician_name
       FROM treasury_transactions tt
       LEFT JOIN maintenance_tickets mt ON mt.id = tt.ticket_id
       LEFT JOIN technicians tech ON tech.id = tt.technician_id
       ORDER BY tt.id DESC LIMIT 250`).all();
}
function addTreasuryTransaction(data) {
	const info = db.prepare(`INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, technician_id, payment_method, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(data.transaction_type || "expense", data.category?.trim() || "مصروفات عامة", Number(data.amount ?? 0), data.ticket_id || null, data.technician_id || null, data.payment_method || "cash", data.description?.trim() || "");
	return db.prepare("SELECT * FROM treasury_transactions WHERE id = ?").get(Number(info.lastInsertRowid));
}
function deleteTreasuryTransaction(id) {
	db.prepare("DELETE FROM treasury_transactions WHERE id = ?").run(id);
}
function getDashboardStats() {
	const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	const monthPrefix = today.slice(0, 7);
	const totalTicketsToday = db.prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE date(created_at) = ?`).get(today).cnt;
	const openTicketsCount = db.prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status NOT IN ('delivered', 'cancelled')`).get().cnt;
	const homeVisitsCount = db.prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE service_type = 'home_visit' AND status NOT IN ('delivered', 'cancelled')`).get().cnt;
	const workshopCount = db.prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE service_type = 'workshop' AND status NOT IN ('delivered', 'cancelled')`).get().cnt;
	const repairedWaitingDeliveryCount = db.prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status = 'repaired'`).get().cnt;
	const activeWarrantyClaimsCount = db.prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE (priority = 'warranty_return' OR is_under_previous_warranty = 1) AND status NOT IN ('delivered', 'cancelled')`).get().cnt;
	const lowStockPartsCount = db.prepare(`SELECT COUNT(*) as cnt FROM spare_parts WHERE quantity <= min_quantity`).get().cnt;
	const todayIncome = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND date(created_at) = ?`).get(today).total;
	const todayExpense = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type IN ('expense', 'tech_commission') AND date(created_at) = ?`).get(today).total;
	const monthIncome = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND strftime('%Y-%m', created_at) = ?`).get(monthPrefix).total;
	const monthExpense = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'expense' AND strftime('%Y-%m', created_at) = ?`).get(monthPrefix).total;
	const monthTechCommissions = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'tech_commission' AND strftime('%Y-%m', created_at) = ?`).get(monthPrefix).total;
	const monthPartsCost = db.prepare(`SELECT COALESCE(SUM(parts_cost_total), 0) as total FROM maintenance_tickets WHERE status IN ('repaired', 'delivered') AND strftime('%Y-%m', created_at) = ?`).get(monthPrefix).total;
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
		monthNetProfit: monthIncome - monthExpense - monthTechCommissions - monthPartsCost,
		recentTickets: listTickets({}).slice(0, 8),
		lowStockParts: db.prepare(`SELECT * FROM spare_parts WHERE quantity <= min_quantity ORDER BY quantity ASC LIMIT 8`).all()
	};
}
function getSettings() {
	const rows = db.prepare("SELECT key, value FROM settings").all();
	const map = {};
	for (const r of rows) map[r.key] = r.value;
	return {
		center_name: map.center_name || "مركز صلحلي للصيانة المعتمدة",
		center_subtitle: map.center_subtitle || "",
		phone1: map.phone1 || "",
		phone2: map.phone2 || "",
		whatsapp: map.whatsapp || "",
		address: map.address || "",
		logo_base64: map.logo_base64 || "",
		default_print_format: map.default_print_format || "a4",
		default_inspection_fee: Number(map.default_inspection_fee ?? 150),
		default_warranty_months: Number(map.default_warranty_months ?? 6),
		warranty_terms: map.warranty_terms || "",
		receipt_footer: map.receipt_footer || ""
	};
}
function saveSettings(settings) {
	const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
	runTransaction(() => {
		for (const [k, v] of Object.entries(settings)) if (v !== void 0) stmt.run(k, String(v));
	});
	return getSettings();
}
function createBackupToFile(destinationPath) {
	(0, fs.copyFileSync)(dbFilePath, destinationPath);
}
function restoreBackupFromFile(sourcePath) {
	db.close();
	(0, fs.copyFileSync)(sourcePath, dbFilePath);
	db = createDatabaseConnection(dbFilePath);
}
// src/main/index.ts
var mainWindow = null;
function createWindow() {
	const iconFile = (0, fs.existsSync)((0, path.join)(__dirname, "../../resources/icon.ico")) ? (0, path.join)(__dirname, "../../resources/icon.ico") : void 0;
	mainWindow = new electron.BrowserWindow({
		width: 1400,
		height: 880,
		minWidth: 1120,
		minHeight: 700,
		show: false,
		icon: iconFile,
		title: "صلحلي v1.0.0 - نظام إدارة مركز صيانة الأجهزة الكهربائية",
		autoHideMenuBar: true,
		webPreferences: {
			preload: (0, fs.existsSync)((0, path.join)(__dirname, "../preload/index.mjs")) ? (0, path.join)(__dirname, "../preload/index.mjs") : (0, path.join)(__dirname, "../preload/index.js"),
			sandbox: false,
			contextIsolation: true
		}
	});
	mainWindow.on("ready-to-show", () => {
		mainWindow?.show();
		mainWindow?.maximize();
	});
	mainWindow.webContents.setWindowOpenHandler((details) => {
		electron.shell.openExternal(details.url);
		return { action: "deny" };
	});
	if (_electron_toolkit_utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	else mainWindow.loadFile((0, path.join)(__dirname, "../renderer/index.html"));
}
function registerIpcHandlers() {
	electron.ipcMain.handle("auth:login", (_e, payload) => loginUser(payload));
	electron.ipcMain.handle("users:list", () => listUsers());
	electron.ipcMain.handle("users:save", (_e, data) => saveUser(data));
	electron.ipcMain.handle("users:delete", (_e, id) => deleteUser(id));
	electron.ipcMain.handle("customers:list", (_e, search) => listCustomers(search));
	electron.ipcMain.handle("customers:findByPhone", (_e, phone) => findCustomerByPhone(phone));
	electron.ipcMain.handle("customers:save", (_e, data) => saveCustomer(data));
	electron.ipcMain.handle("customers:delete", (_e, id) => deleteCustomer(id));
	electron.ipcMain.handle("customers:appliances", (_e, customerId) => getCustomerAppliances(customerId));
	electron.ipcMain.handle("technicians:list", () => listTechnicians());
	electron.ipcMain.handle("technicians:save", (_e, data) => saveTechnician(data));
	electron.ipcMain.handle("technicians:delete", (_e, id) => deleteTechnician(id));
	electron.ipcMain.handle("parts:list", (_e, search) => listSpareParts(search));
	electron.ipcMain.handle("parts:save", (_e, data) => saveSparePart(data));
	electron.ipcMain.handle("parts:delete", (_e, id) => deleteSparePart(id));
	electron.ipcMain.handle("inventory:movement", (_e, payload) => recordInventoryMovement(payload));
	electron.ipcMain.handle("inventory:list", () => listInventoryMovements());
	electron.ipcMain.handle("tickets:list", (_e, filters) => listTickets(filters));
	electron.ipcMain.handle("tickets:save", (_e, data) => saveTicket(data));
	electron.ipcMain.handle("tickets:delete", (_e, id) => deleteTicket(id));
	electron.ipcMain.handle("treasury:list", () => listTreasuryTransactions());
	electron.ipcMain.handle("treasury:add", (_e, data) => addTreasuryTransaction(data));
	electron.ipcMain.handle("treasury:delete", (_e, id) => deleteTreasuryTransaction(id));
	electron.ipcMain.handle("app:version", () => electron.app.getVersion());
	electron.ipcMain.handle("dashboard:stats", () => getDashboardStats());
	electron.ipcMain.handle("settings:get", () => getSettings());
	electron.ipcMain.handle("settings:save", (_e, settings) => saveSettings(settings));
	electron.ipcMain.handle("db:path", () => getDatabasePath());
	electron.ipcMain.handle("backup:create", async () => {
		if (!mainWindow) return { success: false };
		const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
		const { canceled, filePath } = await electron.dialog.showSaveDialog(mainWindow, {
			title: "حفظ نسخة احتياطية من قاعدة البيانات",
			defaultPath: `Sallehli-Backup-${dateStr}.sqlite`,
			filters: [{
				name: "SQLite Database",
				extensions: ["sqlite", "db"]
			}]
		});
		if (canceled || !filePath) return { success: false };
		createBackupToFile(filePath);
		return {
			success: true,
			filePath
		};
	});
	electron.ipcMain.handle("backup:restore", async () => {
		if (!mainWindow) return { success: false };
		const { canceled, filePaths } = await electron.dialog.showOpenDialog(mainWindow, {
			title: "استعادة نسخة احتياطية لقاعدة البيانات",
			properties: ["openFile"],
			filters: [{
				name: "SQLite Database",
				extensions: ["sqlite", "db"]
			}]
		});
		if (canceled || filePaths.length === 0) return { success: false };
		restoreBackupFromFile(filePaths[0]);
		return {
			success: true,
			filePath: filePaths[0]
		};
	});
	electron.ipcMain.handle("shell:openExternal", async (_e, url) => {
		await electron.shell.openExternal(url);
	});
}
electron.app.whenReady().then(() => {
	_electron_toolkit_utils.electronApp.setAppUserModelId("com.sallehli.aljoker");
	electron.app.on("browser-window-created", (_, window) => {
		_electron_toolkit_utils.optimizer.watchWindowShortcuts(window);
	});
	initDatabase();
	registerIpcHandlers();
	createWindow();
	electron.app.on("activate", function() {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") electron.app.quit();
});
