import { db, runTransaction } from './connection'
import { roundMoney, parseJsonObject, stringifyExtraData, getLocalDateString, generateNextNumber } from './utils'
import { normalizeProductRow, syncProductQtyFromChildren } from './products'
import { isDemoDataHidden } from './demo'
import { getBusinessState } from './business'
import type { SalesInvoice, SalesItem, SalesPayment, ProductVariant, ProductSerial } from '../../shared/types'
import type { SessionInfo } from '../session'

function generateNextSalesNumber(): string {
  const year = new Date().getFullYear()
  return generateNextNumber(db, 'sales_invoices', 'invoice_number', `INV-${year}-`, 4)
}

export function normalizeSalesInvoiceRow(row: Record<string, unknown>): SalesInvoice {
  return {
    ...(row as unknown as SalesInvoice),
    subtotal: roundMoney(row.subtotal),
    discount: roundMoney(row.discount),
    trade_in_credit: roundMoney(row.trade_in_credit),
    total_amount: roundMoney(row.total_amount),
    paid_amount: roundMoney(row.paid_amount),
    remaining_amount: roundMoney(row.remaining_amount),
    returned_amount: roundMoney(row.returned_amount || 0),
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
  const bType = getBusinessState().type
  if (isDemoDataHidden()) {
    sql += ' AND si.is_demo = 0'
  } else {
    sql += ` AND (si.is_demo = 0 OR si.business_type = '${bType}' OR si.business_type IS NULL OR si.business_type = '')`
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

export function getSalesInvoiceById(id: number): SalesInvoice | undefined {
  const raw = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  if (!raw) return undefined
  const inv = normalizeSalesInvoiceRow(raw)
  const rawItems = db
    .prepare('SELECT * FROM sales_items WHERE invoice_id = ? ORDER BY id ASC')
    .all(inv.id) as Record<string, unknown>[]
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
  inv.payments = db
    .prepare('SELECT * FROM sales_payments WHERE invoice_id = ? ORDER BY id ASC')
    .all(inv.id) as SalesPayment[]
  return inv
}

export function saveSalesInvoice(
  data: Partial<SalesInvoice> & { items: SalesItem[]; recordInTreasury?: boolean },
  callerSession?: SessionInfo | null
): SalesInvoice {
  return runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
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

    const todayStr = getLocalDateString()
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
          payment_method, status, parent_invoice_id, notes, extra_data, created_by_id, created_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`
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
        stringifyExtraData(data.extra_data),
        createdById,
        createdByName
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
        if (sRow.unit_cost !== null && sRow.unit_cost !== undefined) {
          unitCost = roundMoney(sRow.unit_cost)
        }
      }

      const warrantyMonths = Number(it.warranty_months ?? prod.warranty_months ?? 0)
      let warrantyStart: string | null = it.warranty_start || null
      let warrantyEnd: string | null = it.warranty_end || null
      if (warrantyMonths > 0 && !warrantyEnd) {
        warrantyStart = warrantyStart || todayStr
        const d = new Date(`${warrantyStart}T00:00:00`)
        d.setMonth(d.getMonth() + warrantyMonths)
        warrantyEnd = getLocalDateString(d)
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
            payment_method, description, created_by_id, created_by_name
          ) VALUES ('income', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(category, paidAmount, invoiceId, customerId, paymentMethod, desc, createdById, createdByName)
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

    return getSalesInvoiceById(invoiceId)!
  })
}

export function collectSalesInstallment(
  payload: {
    invoice_id: number
    amount: number
    payment_method: string
    notes?: string
  },
  callerSession?: SessionInfo | null
): SalesInvoice {
  return runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
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
    const newRemaining = Math.max(0, roundMoney(inv.total_amount - (inv.returned_amount || 0) - newPaid))
    const paymentMethod = payload.payment_method || 'cash'

    db.prepare(
      `UPDATE sales_invoices
       SET paid_amount = ?, remaining_amount = ?, payment_method = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(newPaid, newRemaining, paymentMethod, inv.id)

    const txInfo = db
      .prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description, created_by_id, created_by_name
        ) VALUES ('income', 'تحصيل أقساط مبيعات', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        collectAmt,
        inv.id,
        inv.customer_id,
        paymentMethod,
        payload.notes?.trim() ||
          `تحصيل قسط من فاتورة مبيعات ${inv.invoice_number} - العميل: ${inv.customer_name}`,
        createdById,
        createdByName
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

    return getSalesInvoiceById(inv.id)!
  })
}

export function deleteSalesInvoice(id: number): void {
  runTransaction(() => {
    const inv = getSalesInvoiceById(id)
    if (!inv) throw new Error('فاتورة المبيعات غير موجودة')

    // Guard against deleting invoices with returns, exchanges, child invoices, earmold links, or unreversed payments
    const returnCount = Number(
      (
        db
          .prepare(
            "SELECT COUNT(*) as cnt FROM invoice_returns WHERE invoice_id = ? AND return_type = 'sales_return'"
          )
          .get(inv.id) as { cnt: number }
      )?.cnt || 0
    )
    const hasReturnedItems = (inv.items || []).some((it) => Number(it.returned_qty || 0) > 0)
    if (returnCount > 0 || Number(inv.returned_amount || 0) > 0 || hasReturnedItems) {
      throw new Error('لا يمكن حذف فاتورة مبيعات تحتوي على مرتجعات مسجلة')
    }

    const exchangeCount = Number(
      (
        db
          .prepare(
            'SELECT COUNT(*) as cnt FROM product_exchanges WHERE original_invoice_id = ? OR new_invoice_id = ?'
          )
          .get(inv.id, inv.id) as { cnt: number }
      )?.cnt || 0
    )
    if (exchangeCount > 0) {
      throw new Error('لا يمكن حذف فاتورة مبيعات مرتبطة بعملية استبدال')
    }

    const childInvoiceCount = Number(
      (
        db
          .prepare('SELECT COUNT(*) as cnt FROM sales_invoices WHERE parent_invoice_id = ? AND id != ?')
          .get(inv.id, inv.id) as { cnt: number }
      )?.cnt || 0
    )
    if (childInvoiceCount > 0) {
      throw new Error('لا يمكن حذف الفاتورة لوجود فاتورة تابعة مرتبطة بها')
    }

    const earmoldTableExists = !!db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'earmold_orders'")
      .get()
    if (earmoldTableExists) {
      const earmoldCount = Number(
        (
          db
            .prepare('SELECT COUNT(*) as cnt FROM earmold_orders WHERE sales_invoice_id = ?')
            .get(inv.id) as { cnt: number }
        )?.cnt || 0
      )
      if (earmoldCount > 0) {
        throw new Error('لا يمكن حذف فاتورة مبيعات مرتبطة بأمر قالب أذن')
      }
    }

    const paymentsCount = Number(
      (
        db
          .prepare('SELECT COUNT(*) as cnt FROM sales_payments WHERE invoice_id = ?')
          .get(inv.id) as { cnt: number }
      )?.cnt || 0
    )
    const treasuryTxCount = Number(
      (
        db
          .prepare('SELECT COUNT(*) as cnt FROM treasury_transactions WHERE sales_invoice_id = ?')
          .get(inv.id) as { cnt: number }
      )?.cnt || 0
    )
    if (inv.paid_amount > 0 || paymentsCount > 0 || treasuryTxCount > 0) {
      throw new Error(
        'لا يمكن حذف فاتورة مبيعات تحتوي على دفعات أو حركات خزينة غير معكوسة؛ يرجى عكس التحصيل من الخزينة أولاً'
      )
    }

    const insertMoveStmt = db.prepare(
      `INSERT INTO inventory_movements (
        product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
        quantity, unit_cost, unit_price, notes
      ) VALUES (?, ?, ?, 'sales_invoice_delete', ?, 'sales_return_in', ?, ?, ?, ?)`
    )

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

      if (it.item_type !== 'service') {
        const restoredQty = netDeducted > 0 ? netDeducted : Math.max(0, it.quantity * it.pack_size)
        if (restoredQty > 0) {
          insertMoveStmt.run(
            it.product_id,
            it.variant_id || null,
            it.serial_no || '',
            inv.id,
            restoredQty,
            it.unit_cost,
            it.unit_price,
            `إرجاع مخزون من حذف فاتورة مبيعات ${inv.invoice_number}`
          )
        }
      }
    }

    db.prepare('DELETE FROM sales_invoices WHERE id = ?').run(inv.id)
  })
}

// ==========================================
// 11. PHASE 3D: RETURNS & EXCHANGES (3 MODES)
// ==========================================
