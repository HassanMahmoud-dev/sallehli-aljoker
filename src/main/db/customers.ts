import { getDb, runTransaction } from './connection'
import { parseJsonObject, parseJsonArray, stringifyExtraData } from './utils'
import type { Customer, CustomerAppliance, MaintenanceTicket } from '../../shared/types'
import { normalizeTicketRow } from './tickets'
import { isDemoDataHidden } from './demo'
import { getBusinessState } from './business'

export function normalizeCustomerRow(row: Record<string, unknown>): Customer {
  return {
    ...(row as unknown as Customer),
    extra_data: parseJsonObject(row.extra_data)
  }
}

export function normalizeApplianceRow(row: Record<string, unknown>): CustomerAppliance {
  return {
    ...(row as unknown as CustomerAppliance),
    purchase_date: row.purchase_date ? String(row.purchase_date) : null,
    warranty_image: String(row.warranty_image || ''),
    fault_images: parseJsonArray(row.fault_images),
    extra_data: parseJsonObject(row.extra_data)
  }
}

export function listCustomers(search = ''): Customer[] {
  const db = getDb()
  const q = `%${search.trim()}%`
  const bType = getBusinessState().type
  const demoFilter = isDemoDataHidden()
    ? ' AND c.is_demo = 0'
    : ` AND (c.is_demo = 0 OR c.business_type = '${bType}' OR c.business_type IS NULL OR c.business_type = '')`
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM maintenance_tickets t WHERE t.customer_id = c.id) as tickets_count,
        (SELECT COUNT(*) FROM hearing_tests ht WHERE ht.patient_id = c.id) as hearing_tests_count
       FROM customers c
       WHERE (c.name LIKE ? OR c.phone LIKE ? OR c.phone2 LIKE ? OR c.area LIKE ? OR c.extra_data LIKE ?
          OR EXISTS (
            SELECT 1 FROM customer_appliances ca
            WHERE ca.customer_id = c.id AND (ca.serial_number LIKE ? OR ca.extra_data LIKE ?)
          ))${demoFilter}
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
  const db = getDb()
  const clean = phone.trim()
  if (!clean) return { customer: null, appliances: [], previousTickets: [] }
  const bType = getBusinessState().type
  const demoFilter = isDemoDataHidden()
    ? ' AND is_demo = 0'
    : ` AND (is_demo = 0 OR business_type = '${bType}' OR business_type IS NULL OR business_type = '')`
  const rawCustomer = db
    .prepare(`SELECT * FROM customers WHERE (phone = ? OR phone2 = ?)${demoFilter} LIMIT 1`)
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
  const db = getDb()
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
  runTransaction(() => {
    const db = getDb()
    const referenceChecks: Array<{ sql: string; label: string }> = [
      {
        sql: 'SELECT 1 FROM maintenance_tickets WHERE customer_id = ? LIMIT 1',
        label: 'تذاكر صيانة'
      },
      {
        sql: 'SELECT 1 FROM sales_invoices WHERE customer_id = ? LIMIT 1',
        label: 'فواتير مبيعات'
      },
      {
        sql: 'SELECT 1 FROM customer_appliances WHERE customer_id = ? LIMIT 1',
        label: 'أجهزة مسجلة'
      },
      {
        sql: 'SELECT 1 FROM hearing_tests WHERE patient_id = ? LIMIT 1',
        label: 'فحوصات سمع'
      },
      {
        sql: 'SELECT 1 FROM implants WHERE patient_id = ? LIMIT 1',
        label: 'ملفات زراعة قوقعة'
      },
      {
        sql: 'SELECT 1 FROM earmold_orders WHERE patient_id = ? LIMIT 1',
        label: 'طلبيات قوالب أذن'
      },
      {
        sql: 'SELECT 1 FROM purchase_invoices WHERE customer_id = ? LIMIT 1',
        label: 'فواتير شراء مستعمل'
      }
    ]

    const linkedRefs = referenceChecks
      .filter((check) => Boolean(db.prepare(check.sql).get(id)))
      .map((check) => check.label)

    if (linkedRefs.length > 0) {
      throw new Error(
        `لا يمكن حذف هذا العميل لارتباطه بسجلات سابقة (${linkedRefs.join('، ')}) حفاظاً على السجل المالي والطبي.`
      )
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  })
}

export function getCustomerAppliances(customerId: number): CustomerAppliance[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM customer_appliances WHERE customer_id = ? ORDER BY id DESC')
    .all(customerId) as Record<string, unknown>[]
  return rows.map(normalizeApplianceRow)
}

export function saveCustomerAppliance(data: Partial<CustomerAppliance>): CustomerAppliance {
  const db = getDb()
  const faultImagesJson = JSON.stringify(Array.isArray(data.fault_images) ? data.fault_images : [])
  const warrantyImg = data.warranty_image || ''
  const extraDataJson = stringifyExtraData(data.extra_data)

  if (data.id) {
    db.prepare(
      `UPDATE customer_appliances
       SET appliance_type = ?, brand = ?, model = ?, serial_number = ?, notes = ?,
           purchase_date = COALESCE(?, purchase_date),
           last_warranty_end = ?, last_ticket_number = ?, warranty_image = ?, fault_images = ?, extra_data = ?
       WHERE id = ?`
    ).run(
      data.appliance_type?.trim() || '',
      data.brand?.trim() || '',
      data.model?.trim() || '',
      data.serial_number?.trim() || '',
      data.notes?.trim() || '',
      data.purchase_date || null,
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
          purchase_date, last_warranty_end, last_ticket_number, warranty_image, fault_images, extra_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.customer_id,
        data.appliance_type?.trim() || '',
        data.brand?.trim() || '',
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        data.notes?.trim() || '',
        data.purchase_date || null,
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
  const db = getDb()
  db.prepare('DELETE FROM customer_appliances WHERE id = ?').run(id)
}

