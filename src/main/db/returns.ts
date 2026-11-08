import { db, runTransaction } from './connection'
import { roundMoney, getLocalDateString, generateNextNumber } from './utils'
import { normalizeProductRow, syncProductQtyFromChildren } from './products'
import { getSalesInvoiceById, saveSalesInvoice } from './sales'
import { getPurchaseInvoiceById } from './suppliers'
import { saveTicket } from './tickets'
import type { InvoiceReturn, InvoiceReturnItem, ProductExchange, ExchangeType, SalesItem, PurchaseItem, ProductSerial } from '../../shared/types'
import type { SessionInfo } from '../session'

function generateNextReturnNumber(prefix: 'SRN' | 'PRN'): string {
  const year = new Date().getFullYear()
  return generateNextNumber(db, 'invoice_returns', 'return_number', `${prefix}-${year}-`, 4)
}

function generateNextExchangeNumber(): string {
  const year = new Date().getFullYear()
  return generateNextNumber(db, 'product_exchanges', 'exchange_number', `EXC-${year}-`, 4)
}

export function listInvoiceReturns(returnType?: 'sales_return' | 'purchase_return'): InvoiceReturn[] {
  let sql = 'SELECT * FROM invoice_returns'
  const params: unknown[] = []
  if (returnType) {
    sql += ' WHERE return_type = ?'
    params.push(returnType)
  }
  sql += ' ORDER BY id DESC'
  const rows = db.prepare(sql).all(...params) as InvoiceReturn[]
  const getItemsStmt = db.prepare('SELECT * FROM invoice_return_items WHERE return_id = ?')
  for (const r of rows) {
    r.total_return_amount = roundMoney(r.total_return_amount)
    r.cash_refunded = roundMoney(r.cash_refunded)
    r.balance_adjusted = roundMoney(r.balance_adjusted)
    r.items = getItemsStmt.all(r.id) as InvoiceReturnItem[]
  }
  return rows
}

export function createSalesReturn(
  payload: {
    invoice_id: number
    payment_method: string
    reason?: string
    items: Array<{
      invoice_item_id: number
      quantity: number
      return_condition?: 'in_stock' | 'defective'
    }>
  },
  callerSession?: SessionInfo | null
): InvoiceReturn {
  return runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
    const inv = getSalesInvoiceById(payload.invoice_id)
    if (!inv) throw new Error('فاتورة المبيعات غير موجودة')

    const reqItems = (payload.items || []).filter((x) => Number(x.quantity || 0) > 0)
    if (reqItems.length === 0) {
      throw new Error('يرجى تحديد صنف واحد على الأقل للاسترجاع')
    }

    const returnNumber = generateNextReturnNumber('SRN')
    let totalReturnAmount = 0

    const preparedItems: Array<{
      saleItem: SalesItem
      qty: number
      piecesQty: number
      cond: 'in_stock' | 'defective'
      amount: number
    }> = []

    const invoiceRatio = inv.subtotal > 0 ? inv.total_amount / inv.subtotal : 1

    for (const req of reqItems) {
      const sItem = (inv.items || []).find((x) => x.id === req.invoice_item_id)
      if (!sItem) throw new Error('بند الفاتورة غير موجود')
      const maxReturnable = sItem.quantity - (sItem.returned_qty || 0)
      const qty = Math.min(Number(req.quantity), maxReturnable)
      if (qty <= 0) {
        throw new Error(`الكمية المتاحة للاسترجاع من (${sItem.product_name}) هي ${maxReturnable}`)
      }
      const piecesQty = sItem.unit === 'pack' ? qty * sItem.pack_size : qty
      const lineEffectiveTotal = roundMoney(sItem.total_price * invoiceRatio)
      const netUnitPrice = roundMoney(lineEffectiveTotal / sItem.quantity)
      const amount = roundMoney(qty * netUnitPrice)
      totalReturnAmount = roundMoney(totalReturnAmount + amount)
      preparedItems.push({
        saleItem: sItem,
        qty,
        piecesQty,
        cond: req.return_condition === 'defective' ? 'defective' : 'in_stock',
        amount
      })
    }

    // First reduce any remaining_amount on the invoice, then refund cash for the rest
    const balanceAdjusted = roundMoney(Math.min(inv.remaining_amount, totalReturnAmount))
    const cashRefunded = roundMoney(Math.max(0, totalReturnAmount - balanceAdjusted))
    const paymentMethod = payload.payment_method || inv.payment_method || 'cash'

    const retInfo = db
      .prepare(
        `INSERT INTO invoice_returns (
          return_number, return_type, invoice_id, invoice_number, party_id, party_name,
          total_return_amount, cash_refunded, balance_adjusted, payment_method, reason, created_by_id, created_by_name
        ) VALUES (?, 'sales_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        returnNumber,
        inv.id,
        inv.invoice_number,
        inv.customer_id,
        inv.customer_name,
        totalReturnAmount,
        cashRefunded,
        balanceAdjusted,
        paymentMethod,
        payload.reason?.trim() || 'مرتجع مبيعات',
        createdById,
        createdByName
      )
    const returnId = Number(retInfo.lastInsertRowid)

    for (const pi of preparedItems) {
      const sItem = pi.saleItem
      db.prepare('UPDATE sales_items SET returned_qty = returned_qty + ? WHERE id = ?').run(
        pi.qty,
        sItem.id
      )

      db.prepare(
        `INSERT INTO invoice_return_items (
          return_id, invoice_item_id, product_id, variant_id, product_name,
          quantity, pieces_qty, serial_id, serial_no, return_condition, amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        returnId,
        sItem.id!,
        sItem.product_id,
        sItem.variant_id || null,
        sItem.product_name,
        pi.qty,
        pi.piecesQty,
        sItem.serial_id || null,
        sItem.serial_no || '',
        pi.cond,
        pi.amount
      )

      if (sItem.serial_id) {
        db.prepare(
          `UPDATE product_serials
           SET status = ?, sale_item_id = NULL, customer_id = NULL,
               customer_warranty_start = NULL, customer_warranty_end = NULL
           WHERE id = ?`
        ).run(pi.cond, sItem.serial_id)
        syncProductQtyFromChildren(sItem.product_id)
      } else if (sItem.item_type !== 'service' && pi.cond === 'in_stock') {
        if (sItem.variant_id) {
          db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
            pi.piecesQty,
            sItem.variant_id
          )
          syncProductQtyFromChildren(sItem.product_id)
        } else {
          db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(
            pi.piecesQty,
            sItem.product_id
          )
        }
      }

      db.prepare(
        `INSERT INTO inventory_movements (
          product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
          quantity, unit_cost, unit_price, notes
        ) VALUES (?, ?, ?, 'sales_return', ?, 'in', ?, ?, ?, ?)`
      ).run(
        sItem.product_id,
        sItem.variant_id || null,
        sItem.serial_no || '',
        returnId,
        pi.piecesQty,
        sItem.unit_cost,
        sItem.unit_price,
        `مرتجع مبيعات ${returnNumber} من فاتورة ${inv.invoice_number}`
      )
    }

    // Check if all items are returned
    const updatedItems = db
      .prepare('SELECT quantity, returned_qty FROM sales_items WHERE invoice_id = ?')
      .all(inv.id) as Array<{ quantity: number; returned_qty: number }>
    const allReturned = updatedItems.every((x) => x.returned_qty >= x.quantity)
    const newStatus = allReturned ? 'returned' : 'partial_return'
    const newRemaining = Math.max(0, roundMoney(inv.remaining_amount - balanceAdjusted))
    const newPaid = Math.max(0, roundMoney(inv.paid_amount - cashRefunded))

    db.prepare(
      `UPDATE sales_invoices
       SET status = ?, paid_amount = ?, remaining_amount = ?, returned_amount = COALESCE(returned_amount, 0) + ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(newStatus, newPaid, newRemaining, totalReturnAmount, inv.id)

    if (cashRefunded > 0) {
      const txInfo = db
        .prepare(
          `INSERT INTO treasury_transactions (
            transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description, created_by_id, created_by_name
          ) VALUES ('expense', 'مرتجع مبيعات', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          cashRefunded,
          inv.id,
          inv.customer_id,
          paymentMethod,
          `رد نقدية مرتجع مبيعات ${returnNumber} عن الفاتورة ${inv.invoice_number} - ${inv.customer_name}`,
          createdById,
          createdByName
        )
      const txId = Number(txInfo.lastInsertRowid)

      db.prepare(
        `INSERT INTO sales_payments (
          invoice_id, customer_id, amount, payment_method, payment_type, treasury_tx_id, notes
        ) VALUES (?, ?, ?, ?, 'refund', ?, ?)`
      ).run(
        inv.id,
        inv.customer_id,
        -cashRefunded,
        paymentMethod,
        txId,
        `رد نقدية مرتجع ${returnNumber}`
      )
    }

    return listInvoiceReturns('sales_return').find((r) => r.id === returnId)!
  })
}

export function createPurchaseReturn(
  payload: {
    invoice_id: number
    payment_method: string
    reason?: string
    items: Array<{
      invoice_item_id: number
      quantity: number
      serials?: string[]
    }>
  },
  callerSession?: SessionInfo | null
): InvoiceReturn {
  return runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
    const inv = getPurchaseInvoiceById(payload.invoice_id)
    if (!inv) throw new Error('فاتورة المشتريات غير موجودة')

    const reqItems = (payload.items || []).filter((x) => Number(x.quantity || 0) > 0)
    if (reqItems.length === 0) {
      throw new Error('يرجى تحديد صنف واحد على الأقل لمرتجع المشتريات')
    }

    const returnNumber = generateNextReturnNumber('PRN')
    let totalReturnAmount = 0

    const preparedItems: Array<{
      purItem: PurchaseItem
      qty: number
      piecesQty: number
      serials: string[]
      amount: number
    }> = []

    const invoiceRatio = inv.subtotal > 0 ? inv.total_amount / inv.subtotal : 1

    for (const req of reqItems) {
      const pItem = (inv.items || []).find((x) => x.id === req.invoice_item_id)
      if (!pItem) throw new Error('بند فاتورة المشتريات غير موجود')
      const maxReturnable = pItem.quantity - (pItem.returned_qty || 0)
      const qty = Math.min(Number(req.quantity), maxReturnable)
      if (qty <= 0) {
        throw new Error(`الكمية المتاحة للإرجاع من (${pItem.product_name}) هي ${maxReturnable}`)
      }
      const piecesQty = pItem.unit === 'pack' ? qty * pItem.pack_size : qty
      const amount = roundMoney(qty * pItem.unit_cost * invoiceRatio)
      totalReturnAmount = roundMoney(totalReturnAmount + amount)
      preparedItems.push({
        purItem: pItem,
        qty,
        piecesQty,
        serials: Array.isArray(req.serials) ? req.serials : [],
        amount
      })
    }

    const balanceAdjusted = roundMoney(Math.min(inv.remaining_amount, totalReturnAmount))
    const cashRefunded = roundMoney(Math.max(0, totalReturnAmount - balanceAdjusted))
    const paymentMethod = payload.payment_method || inv.payment_method || 'cash'

    const retInfo = db
      .prepare(
        `INSERT INTO invoice_returns (
          return_number, return_type, invoice_id, invoice_number, party_id, party_name,
          total_return_amount, cash_refunded, balance_adjusted, payment_method, reason, created_by_id, created_by_name
        ) VALUES (?, 'purchase_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        returnNumber,
        inv.id,
        inv.invoice_number,
        inv.supplier_id || inv.customer_id,
        inv.party_name,
        totalReturnAmount,
        cashRefunded,
        balanceAdjusted,
        paymentMethod,
        payload.reason?.trim() || 'مرتجع مشتريات للمورد',
        createdById,
        createdByName
      )
    const returnId = Number(retInfo.lastInsertRowid)

    for (const pi of preparedItems) {
      const pItem = pi.purItem
      db.prepare('UPDATE purchase_items SET returned_qty = returned_qty + ? WHERE id = ?').run(
        pi.qty,
        pItem.id
      )

      const serialsToMark =
        pi.serials.length > 0 ? pi.serials : (pItem.serials || []).slice(0, pi.piecesQty)

      db.prepare(
        `INSERT INTO invoice_return_items (
          return_id, invoice_item_id, product_id, variant_id, product_name,
          quantity, pieces_qty, serial_id, serial_no, return_condition, amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'returned', ?)`
      ).run(
        returnId,
        pItem.id!,
        pItem.product_id,
        pItem.variant_id || null,
        pItem.product_name,
        pi.qty,
        pi.piecesQty,
        serialsToMark.join(', '),
        pi.amount
      )

      if (serialsToMark.length > 0) {
        for (const sn of serialsToMark) {
          db.prepare("UPDATE product_serials SET status = 'returned' WHERE serial_no = ?").run(sn)
        }
        syncProductQtyFromChildren(pItem.product_id)
      } else if (pItem.variant_id) {
        db.prepare('UPDATE product_variants SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          pi.piecesQty,
          pItem.variant_id
        )
        syncProductQtyFromChildren(pItem.product_id)
      } else {
        db.prepare('UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          pi.piecesQty,
          pItem.product_id
        )
      }

      db.prepare(
        `INSERT INTO inventory_movements (
          product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
          quantity, unit_cost, unit_price, notes
        ) VALUES (?, ?, ?, 'purchase_return', ?, 'out', ?, ?, 0, ?)`
      ).run(
        pItem.product_id,
        pItem.variant_id || null,
        serialsToMark.join(', '),
        returnId,
        pi.piecesQty,
        pItem.unit_cost,
        `مرتجع مشتريات ${returnNumber} من فاتورة ${inv.invoice_number}`
      )
    }

    const updatedItems = db
      .prepare('SELECT quantity, returned_qty FROM purchase_items WHERE invoice_id = ?')
      .all(inv.id) as Array<{ quantity: number; returned_qty: number }>
    const allReturned = updatedItems.every((x) => x.returned_qty >= x.quantity)
    const newStatus = allReturned ? 'returned' : 'partial_return'
    const newRemaining = Math.max(0, roundMoney(inv.remaining_amount - balanceAdjusted))
    const newPaid = Math.max(0, roundMoney(inv.paid_amount - cashRefunded))

    db.prepare(
      `UPDATE purchase_invoices
       SET status = ?, paid_amount = ?, remaining_amount = ?
       WHERE id = ?`
    ).run(newStatus, newPaid, newRemaining, inv.id)

    if (inv.supplier_id && balanceAdjusted > 0) {
      db.prepare('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
        balanceAdjusted,
        inv.supplier_id
      )
    }

    if (cashRefunded > 0) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, purchase_invoice_id, supplier_id, payment_method, description, created_by_id, created_by_name
        ) VALUES ('income', 'استرداد مرتجع مشتريات', ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        cashRefunded,
        inv.id,
        inv.supplier_id,
        paymentMethod,
        `استرداد نقدية مرتجع مشتريات ${returnNumber} عن فاتورة ${inv.invoice_number} - ${inv.party_name}`,
        createdById,
        createdByName
      )
    }

    return listInvoiceReturns('purchase_return').find((r) => r.id === returnId)!
  })
}

export function listProductExchanges(): ProductExchange[] {
  const rows = db
    .prepare('SELECT * FROM product_exchanges ORDER BY id DESC')
    .all() as ProductExchange[]
  return rows.map((r) => ({
    ...r,
    returned_value: roundMoney(r.returned_value),
    new_value: roundMoney(r.new_value),
    price_difference: roundMoney(r.price_difference),
    paid_difference: roundMoney(r.paid_difference)
  }))
}

export function processProductExchange(payload: {
  exchange_type: ExchangeType
  original_invoice_id?: number | null
  original_sale_item_id?: number | null
  customer_id?: number | null
  customer_name: string
  customer_phone?: string
  returned_product_id: number
  returned_serial_no?: string
  returned_condition?: 'in_stock' | 'used' | 'defective'
  returned_value: number
  new_product_id: number
  new_variant_id?: number | null
  new_serial_id?: number | null
  new_serial_no?: string
  new_ear_side?: string
  new_value: number
  paid_difference: number
  payment_method: string
  create_external_repair_ticket?: boolean
  external_vendor?: string
  notes?: string
}): ProductExchange {
  return runTransaction(() => {
    const exchangeNumber = generateNextExchangeNumber()
    const exType = payload.exchange_type
    const retProdRow = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.returned_product_id) as Record<string, unknown> | undefined
    if (!retProdRow) throw new Error('الصنف المرتجع غير موجود')
    const retProd = normalizeProductRow(retProdRow)

    const newProdRow = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.new_product_id) as Record<string, unknown> | undefined
    if (!newProdRow) throw new Error('الصنف البديل الجديد غير موجود')
    const newProd = normalizeProductRow(newProdRow)

    const returnedValue =
      exType === 'warranty_exchange' ? 0 : roundMoney(payload.returned_value || 0)
    const newValue = exType === 'warranty_exchange' ? 0 : roundMoney(payload.new_value || 0)
    const priceDiff =
      exType === 'warranty_exchange' ? 0 : roundMoney(newValue - returnedValue)
    const paidDiff = exType === 'warranty_exchange' ? 0 : roundMoney(payload.paid_difference || 0)
    const paymentMethod = payload.payment_method || 'cash'
    const retSerialNo = payload.returned_serial_no?.trim() || ''

    let customerId = payload.customer_id ? Number(payload.customer_id) : null
    if (!customerId && payload.customer_phone?.trim()) {
      const c = db
        .prepare('SELECT id FROM customers WHERE phone = ? LIMIT 1')
        .get(payload.customer_phone.trim()) as { id: number } | undefined
      if (c) customerId = c.id
    }

    let transferredWarrantyEnd: string | null = null
    let externalRepairTicketId: number | null = null

    // 1. Handle Returned Product / Serial according to the 3 exchange modes
    const retCond =
      exType === 'warranty_exchange'
        ? 'defective'
        : exType === 'trade_in'
          ? 'used'
          : payload.returned_condition || 'in_stock'

    if (retProd.track_serial && retSerialNo) {
      const existingRetSn = db
        .prepare('SELECT * FROM product_serials WHERE serial_no = ?')
        .get(retSerialNo) as ProductSerial | undefined

      if (existingRetSn) {
        transferredWarrantyEnd = existingRetSn.customer_warranty_end || null
        const targetStatus = retCond === 'defective' ? 'defective' : 'in_stock'
        const targetCondition = exType === 'trade_in' ? 'used' : existingRetSn.condition
        const targetCost = exType === 'trade_in' && returnedValue > 0 ? returnedValue : existingRetSn.unit_cost ?? null
        db.prepare(
          `UPDATE product_serials SET
            status = ?, condition = ?, sale_item_id = NULL, customer_id = NULL, unit_cost = ?
           WHERE id = ?`
        ).run(targetStatus, targetCondition, targetCost, existingRetSn.id)
      } else {
        db.prepare(
          `INSERT INTO product_serials (
            product_id, serial_no, status, condition, unit_cost, notes
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          retProd.id,
          retSerialNo,
          retCond === 'defective' ? 'defective' : 'in_stock',
          exType === 'trade_in' ? 'used' : 'new',
          returnedValue > 0 ? returnedValue : null,
          `استلام عبر عملية استبدال ${exchangeNumber}`
        )
      }
      syncProductQtyFromChildren(retProd.id)
    } else if (retCond !== 'defective') {
      let returnedVariantId: number | null = null
      if (payload.original_sale_item_id) {
        const origItem = db
          .prepare('SELECT variant_id FROM sales_items WHERE id = ?')
          .get(payload.original_sale_item_id) as { variant_id?: number | null } | undefined
        if (origItem?.variant_id) returnedVariantId = origItem.variant_id
      }
      if (returnedVariantId) {
        db.prepare('UPDATE product_variants SET qty = qty + 1 WHERE id = ?').run(returnedVariantId)
        syncProductQtyFromChildren(retProd.id)
      } else {
        db.prepare('UPDATE products SET qty = qty + 1 WHERE id = ?').run(retProd.id)
      }
    }

    if (payload.original_sale_item_id) {
      db.prepare('UPDATE sales_items SET returned_qty = returned_qty + 1 WHERE id = ?').run(
        payload.original_sale_item_id
      )
      if (payload.original_invoice_id) {
        const origItems = db
          .prepare('SELECT quantity, returned_qty FROM sales_items WHERE invoice_id = ?')
          .all(payload.original_invoice_id) as Array<{ quantity: number; returned_qty: number }>
        if (origItems.length > 0) {
          const allRet = origItems.every((x) => x.returned_qty >= x.quantity)
          db.prepare('UPDATE sales_invoices SET status = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(
            allRet ? 'returned' : 'partial_return',
            payload.original_invoice_id
          )
        }
      }
    }

    // If warranty exchange & requested external repair ticket for defective unit
    if (exType === 'warranty_exchange' && payload.create_external_repair_ticket) {
      const createdTicket = saveTicket({
        customer_id: customerId || undefined,
        customer_name: payload.customer_name || 'عميل استبدال ضمان',
        customer_phone: payload.customer_phone || '00000000000',
        appliance_type: retProd.sub_category || 'سماعة طبية',
        brand: retProd.brand || 'عام',
        model: retProd.model || retProd.name,
        serial_number: retSerialNo,
        service_type: 'workshop',
        status: 'sent_to_lab',
        priority: 'warranty_return',
        is_under_previous_warranty: 1,
        is_external_repair: 1,
        external_vendor: payload.external_vendor || 'الوكيل / الشركة المصنعة',
        external_sent_date: getLocalDateString(),
        inspection_fee: 0,
        labor_cost: 0,
        total_amount: 0,
        paid_amount: 0,
        complaint: `وحدة معيبة مستردة باستبدال ضمان رقم ${exchangeNumber}`,
        recordPaymentInTreasury: false
      })
      externalRepairTicketId = createdTicket.id
    }

    // 2. Issue New Product via Sales Invoice (or direct serial replacement in warranty exchange)
    let newSerialNo = payload.new_serial_no?.trim() || ''
    if (payload.new_serial_id && !newSerialNo) {
      const ns = db
        .prepare('SELECT serial_no FROM product_serials WHERE id = ?')
        .get(payload.new_serial_id) as { serial_no: string } | undefined
      if (ns) newSerialNo = ns.serial_no
    }

    const newSaleInvoice = saveSalesInvoice({
      invoice_type: 'exchange',
      customer_id: customerId,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone || '',
      trade_in_credit: exType === 'warranty_exchange' ? 0 : returnedValue,
      discount: 0,
      paid_amount: paidDiff > 0 ? paidDiff : 0,
      payment_method: paymentMethod,
      parent_invoice_id: payload.original_invoice_id || null,
      notes:
        payload.notes?.trim() ||
        `فاتورة ناتجة عن عملية استبدال (${exchangeNumber}) - استلام: ${retProd.name}`,
      recordInTreasury: false, // We handle treasury difference explicitly below
      items: [
        {
          product_id: newProd.id,
          variant_id: payload.new_variant_id || null,
          product_name: newProd.name,
          item_type: newProd.type,
          unit: 'piece',
          pack_size: 1,
          quantity: 1,
          deducted_pieces_qty: 1,
          serial_id: payload.new_serial_id || null,
          serial_no: newSerialNo,
          ear_side: payload.new_ear_side || '',
          unit_cost: newProd.cost_price,
          unit_price: exType === 'warranty_exchange' ? 0 : newValue,
          discount: 0,
          total_price: exType === 'warranty_exchange' ? 0 : newValue,
          warranty_months: newProd.warranty_months,
          warranty_end:
            exType === 'warranty_exchange' && transferredWarrantyEnd
              ? transferredWarrantyEnd
              : null,
          returned_qty: 0
        }
      ]
    })

    // 3. Record Treasury Movement for paid_difference (if any)
    if (paidDiff > 0) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description
        ) VALUES ('income', 'فارق استبدال وترقية', ?, ?, ?, ?, ?)`
      ).run(
        paidDiff,
        newSaleInvoice.id,
        customerId,
        paymentMethod,
        `تحصيل فارق استبدال (${exchangeNumber}): تسليم (${newProd.name}) مقابل (${retProd.name}) - ${payload.customer_name}`
      )
    } else if (paidDiff < 0) {
      db.prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, sales_invoice_id, customer_id, payment_method, description
        ) VALUES ('expense', 'رد فارق استبدال للعميل', ?, ?, ?, ?, ?)`
      ).run(
        Math.abs(paidDiff),
        newSaleInvoice.id,
        customerId,
        paymentMethod,
        `رد فارق استبدال (${exchangeNumber}) للعميل: ${payload.customer_name}`
      )
    }

    const exInfo = db
      .prepare(
        `INSERT INTO product_exchanges (
          exchange_number, exchange_type, original_invoice_id, new_invoice_id,
          customer_id, customer_name, returned_product_id, returned_product_name,
          returned_serial_no, returned_condition, returned_value,
          new_product_id, new_product_name, new_serial_no, new_value,
          price_difference, paid_difference, payment_method,
          transferred_warranty_end, external_repair_ticket_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        exchangeNumber,
        exType,
        payload.original_invoice_id || null,
        newSaleInvoice.id,
        customerId,
        payload.customer_name,
        retProd.id,
        retProd.name,
        retSerialNo,
        retCond,
        returnedValue,
        newProd.id,
        newProd.name,
        newSerialNo,
        newValue,
        priceDiff,
        paidDiff,
        paymentMethod,
        transferredWarrantyEnd,
        externalRepairTicketId,
        payload.notes?.trim() || ''
      )

    const exchangeId = Number(exInfo.lastInsertRowid)
    return listProductExchanges().find((e) => e.id === exchangeId)!
  })
}

// ==========================================
// 12. PHASE 3E: MAINTENANCE TICKET SERIAL / INVOICE LOOKUP & LOANER RETURN
// ==========================================
