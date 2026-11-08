import { getDb } from '../connection'
import { createAppliancesTables } from '../appliances/tables'
import { createHearingAidsTables } from '../hearing_aids/tables'
import { migrateToActivityTables } from './migrations'
import type { BusinessType } from '../../../shared/types'

/**
 * إنشاء جداول النظام العامة المشتركة بين كافة الأنشطة
 */
export function createSystemTables(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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
      birth_date TEXT DEFAULT NULL,
      gender TEXT DEFAULT '',
      occupation TEXT DEFAULT '',
      referring_doctor TEXT DEFAULT '',
      medical_complaint TEXT DEFAULT '',
      medical_history TEXT DEFAULT '',
      allergies TEXT DEFAULT '',
      doctor_notes TEXT DEFAULT '',
      extra_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
      created_by_id INTEGER DEFAULT NULL,
      created_by_name TEXT DEFAULT '',
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
  `)
}

/**
 * إنشاء الجداول المطلوبة بحسب النشاط المختار (أجهزة كهربائية أو سماعات طبية)
 */
export function createTables(businessType: BusinessType = 'appliances'): void {
  // 1. إنشاء جداول النظام الأساسية المشتركة
  createSystemTables()

  // 1.5 legacy
  migrateToActivityTables(businessType)

  // 2. إنشاء الجداول المتخصصة وفقاً لنشاط المركز مع ضمان وجود جداول النشاطين دائماً
  if (businessType === 'hearing_aids') {
    createAppliancesTables()
    createHearingAidsTables(false)
  } else {
    createHearingAidsTables(true)
    createAppliancesTables()
  }
}
