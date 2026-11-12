import { db, runTransaction } from '../connection'
import { roundMoney, parseJsonObject, stringifyExtraData, getLocalDateString, generateNextNumber } from '../utils'
import { saveProduct } from '../products'
import { saveSalesInvoice } from '../sales'
import { isDemoDataHidden } from '../demo'
import type { EarmoldOrder, EarmoldStatus } from '../../../shared/types'

function generateNextEarmoldNumber(): string {
  return generateNextNumber(db, 'earmold_orders', 'order_number', 'MLD-', 4)
}


export function normalizeEarmoldRow(row: Record<string, unknown>): EarmoldOrder {
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
  const today = getLocalDateString()
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
  if (isDemoDataHidden()) {
    clauses.push('eo.is_demo = 0')
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
    const today = getLocalDateString()
    const paymentMethod = data.payment_method || 'cash'

    const existing = data.id
      ? (db
          .prepare(
            'SELECT id, order_number, sales_invoice_id, is_lab_cost_paid FROM earmold_orders WHERE id = ?'
          )
          .get(data.id) as
          | {
              id: number
              order_number: string
              sales_invoice_id: number | null
              is_lab_cost_paid: number
            }
          | undefined)
      : undefined
    if (data.id && !existing) {
      throw new Error('طلب القالب غير موجود')
    }

    const orderNumber = existing?.order_number || data.order_number?.trim() || generateNextEarmoldNumber()
    let salesInvoiceId =
      data.sales_invoice_id !== undefined
        ? data.sales_invoice_id || null
        : existing?.sales_invoice_id || null
    let isLabCostPaid = Number(
      data.is_lab_cost_paid !== undefined
        ? data.is_lab_cost_paid
        : existing?.is_lab_cost_paid || 0
    )

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
            quantity: 1,
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
        `تكلفة معمل قوالب ${orderNumber} (${data.lab_name || 'المعمل'}) للمريض: ${cust.name} - ${data.mold_type || ''}`
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
    const dateVal = payload.date || getLocalDateString()

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

    const today = getLocalDateString()
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
  runTransaction(() => {
    const order = db
      .prepare(
        'SELECT id, order_number, sales_invoice_id, is_lab_cost_paid FROM earmold_orders WHERE id = ?'
      )
      .get(id) as
      | {
          id: number
          order_number: string
          sales_invoice_id: number | null
          is_lab_cost_paid: number
        }
      | undefined

    if (!order) {
      throw new Error('طلب القالب غير موجود')
    }

    // [FIN-16] Protect earmold orders that are billed via sales invoice or have treasury lab cost recorded
    if (order.sales_invoice_id) {
      throw new Error('لا يمكن حذف طلب القالب لارتباطه بفاتورة مبيعات')
    }

    if (Number(order.is_lab_cost_paid || 0) === 1) {
      throw new Error('لا يمكن حذف طلب القالب بعد تسجيل سداد تكلفة المعمل في الخزينة')
    }

    const cleanOrderNumber = (order.order_number || '').trim()
    if (cleanOrderNumber) {
      const linkedTx = db
        .prepare(
          `SELECT id FROM treasury_transactions
           WHERE category = 'مصروفات معمل قوالب'
             AND description LIKE ?
           LIMIT 1`
        )
        .get(`%${cleanOrderNumber}%`) as { id: number } | undefined
      if (linkedTx) {
        throw new Error('لا يمكن حذف طلب القالب لوجود قيد خزينة مرتبط به')
      }
    }

    db.prepare('DELETE FROM earmold_orders WHERE id = ?').run(id)
  })
}

// ==========================================
// COCHLEAR IMPLANTS & MAPPING SESSIONS (4.3.2)
// ==========================================
