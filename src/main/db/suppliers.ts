import { db, runTransaction } from './connection'
import { roundMoney, parseJsonArray, parseJsonObject, stringifyExtraData, getLocalDateString, generateNextNumber } from './utils'
import { normalizeProductRow, syncProductQtyFromChildren } from './products'
import { isDemoDataHidden } from './demo'
import { getBusinessState } from './business'
import type { Supplier, SupplierPayment, SupplierStatement, SupplierStatementEntry, PurchaseInvoice, PurchaseItem } from '../../shared/types'
import type { SessionInfo } from '../session'

export function listSuppliers(search = ''): Supplier[] {
  const q = `%${search.trim()}%`
  const hasPurchaseInvoices = Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_invoices'")
      .get()
  )

  const invoicesSubqueries = hasPurchaseInvoices
    ? `,
      (SELECT COUNT(*) FROM purchase_invoices pi WHERE pi.supplier_id = s.id AND pi.status != 'cancelled') as invoices_count,
      COALESCE((SELECT SUM(pi.total_amount) FROM purchase_invoices pi WHERE pi.supplier_id = s.id AND pi.status != 'cancelled'), 0) as total_purchases`
    : `, 0 as invoices_count, 0 as total_purchases`

  const bType = getBusinessState().type
  const demoFilter = isDemoDataHidden()
    ? ' AND s.is_demo = 0'
    : ` AND (s.is_demo = 0 OR s.business_type = '${bType}' OR s.business_type IS NULL OR s.business_type = '')`

  return db
    .prepare(
      `SELECT s.*,
        COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0) as total_paid
        ${invoicesSubqueries}
       FROM suppliers s
       WHERE (s.name LIKE ? OR s.company_name LIKE ? OR s.phone LIKE ? OR s.phone2 LIKE ? OR s.address LIKE ?)${demoFilter}
       ORDER BY s.id DESC`
    )
    .all(q, q, q, q, q) as Supplier[]
}

export function saveSupplier(data: Partial<Supplier>): Supplier {
  const name = data.name?.trim()
  const phone = data.phone?.trim()
  if (!name || !phone) {
    throw new Error('يرجى إدخال اسم المورد ورقم الهاتف')
  }

  const supplierType = data.supplier_type === 'customer' ? 'customer' : 'company'

  if (data.id) {
    db.prepare(
      `UPDATE suppliers SET
        name = ?, company_name = ?, phone = ?, phone2 = ?, address = ?,
        supplier_type = ?, customer_id = ?, notes = ?, is_active = ?
       WHERE id = ?`
    ).run(
      name,
      data.company_name?.trim() || '',
      phone,
      data.phone2?.trim() || '',
      data.address?.trim() || '',
      supplierType,
      data.customer_id || null,
      data.notes?.trim() || '',
      data.is_active !== undefined ? Number(data.is_active) : 1,
      data.id
    )
    const updated =
      listSuppliers().find((s) => s.id === data.id) ||
      (db.prepare('SELECT * FROM suppliers WHERE id = ?').get(data.id) as Supplier | undefined)
    if (!updated) {
      throw new Error('المورد غير موجود')
    }
    return updated
  } else {
    const openingBalance = roundMoney(data.balance ?? 0)
    const info = db
      .prepare(
        `INSERT INTO suppliers (
          name, company_name, phone, phone2, address, supplier_type, customer_id, balance, notes, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        data.company_name?.trim() || '',
        phone,
        data.phone2?.trim() || '',
        data.address?.trim() || '',
        supplierType,
        data.customer_id || null,
        openingBalance,
        data.notes?.trim() || '',
        data.is_active !== undefined ? Number(data.is_active) : 1
      )
    const newId = Number(info.lastInsertRowid)
    return listSuppliers().find((s) => s.id === newId)!
  }
}

export function deleteSupplier(id: number): void {
  const paymentsCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM supplier_payments WHERE supplier_id = ?')
      .get(id) as { cnt: number }
  ).cnt
  const invoicesCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM purchase_invoices WHERE supplier_id = ?')
      .get(id) as { cnt: number }
  ).cnt
  if (paymentsCount > 0 || invoicesCount > 0) {
    throw new Error('لا يمكن حذف مورد له سجل مدفوعات أو فواتير سابقة')
  }
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(id)
}

export function getSupplierStatement(supplierId: number): SupplierStatement {
  const supplier = listSuppliers().find((s) => s.id === supplierId)
  if (!supplier) {
    throw new Error('المورد غير موجود')
  }

  const payments = db
    .prepare(
      `SELECT sp.*, s.name as supplier_name
       FROM supplier_payments sp
       JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.supplier_id = ?
       ORDER BY sp.id ASC`
    )
    .all(supplierId) as SupplierPayment[]

  const rawEntries: Array<Omit<SupplierStatementEntry, 'running_balance'>> = []

  // Include purchase_invoices if table exists (Phase 3B)
  const hasPurchaseInvoices = Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_invoices'")
      .get()
  )
  let totalPurchases = 0
  if (hasPurchaseInvoices) {
    const invoices = db
      .prepare(
        `SELECT id, invoice_number, total_amount, paid_amount, payment_method, notes, created_at
         FROM purchase_invoices
         WHERE supplier_id = ? AND status != 'cancelled'
         ORDER BY id ASC`
      )
      .all(supplierId) as Array<{
      id: number
      invoice_number: string
      total_amount: number
      paid_amount: number
      payment_method: string
      notes: string
      created_at: string
    }>

    for (const inv of invoices) {
      totalPurchases = roundMoney(totalPurchases + Number(inv.total_amount || 0))
      rawEntries.push({
        id: `inv-${inv.id}`,
        date: inv.created_at,
        type: 'purchase',
        reference: inv.invoice_number,
        description: inv.notes || `فاتورة مشتريات رقم ${inv.invoice_number}`,
        debit: 0,
        credit: roundMoney(inv.total_amount)
      })
    }
  }

  // Include purchase returns if table exists (Phase 3D)
  const hasReturns = Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoice_returns'")
      .get()
  )
  let totalReturns = 0
  if (hasReturns) {
    const returns = db
      .prepare(
        `SELECT id, return_number, total_return_amount, cash_refunded, balance_adjusted, reason, created_at
         FROM invoice_returns
         WHERE return_type = 'purchase_return' AND party_id = ?
         ORDER BY id ASC`
      )
      .all(supplierId) as Array<{
      id: number
      return_number: string
      total_return_amount: number
      cash_refunded: number
      balance_adjusted: number
      reason: string
      created_at: string
    }>

    for (const ret of returns) {
      totalReturns = roundMoney(totalReturns + Number(ret.total_return_amount || 0))
      if (Number(ret.balance_adjusted || 0) > 0) {
        rawEntries.push({
          id: `ret-${ret.id}`,
          date: ret.created_at,
          type: 'return',
          reference: ret.return_number,
          description: ret.reason || `مرتجع مشتريات رقم ${ret.return_number}`,
          debit: roundMoney(ret.balance_adjusted),
          credit: 0
        })
      }
    }
  }

  let totalStandalonePaid = 0
  for (const p of payments) {
    totalStandalonePaid = roundMoney(totalStandalonePaid + Number(p.amount || 0))
    rawEntries.push({
      id: `pay-${p.id}`,
      date: p.created_at,
      type: 'payment',
      reference: `PAY-${p.id}`,
      description: p.notes || 'سداد دفعة نقدية للمورد',
      debit: roundMoney(p.amount),
      credit: 0,
      payment_method: p.payment_method
    })
  }

  rawEntries.sort((a, b) => a.date.localeCompare(b.date))

  const netFromEntries = rawEntries.reduce(
    (acc, e) => roundMoney(acc + e.credit - e.debit),
    0
  )
  const impliedOpening = roundMoney(supplier.balance - netFromEntries)

  const entries: SupplierStatementEntry[] = []
  let running = 0

  if (Math.abs(impliedOpening) >= 0.01) {
    running = impliedOpening
    entries.push({
      id: 'opening-balance',
      date: supplier.created_at,
      type: 'opening',
      reference: 'OPEN',
      description: 'رصيد افتتاحي للمورد',
      debit: impliedOpening < 0 ? Math.abs(impliedOpening) : 0,
      credit: impliedOpening > 0 ? impliedOpening : 0,
      running_balance: running
    })
  }

  for (const e of rawEntries) {
    running = roundMoney(running + e.credit - e.debit)
    entries.push({
      ...e,
      running_balance: running
    })
  }

  const totalPaid = roundMoney(
    entries.filter((e) => e.type === 'payment').reduce((s, e) => s + e.debit, 0)
  )

  return {
    supplier,
    totalPurchases,
    totalPaid,
    totalReturns,
    currentBalance: roundMoney(supplier.balance),
    entries: entries.reverse(),
    payments: [...payments].reverse()
  }
}

export function paySupplier(
  payload: {
    supplier_id: number
    amount: number
    payment_method: string
    notes?: string
    recordInTreasury?: boolean
  },
  callerSession?: SessionInfo | null
): Supplier {
  return runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
    const supplier = db
      .prepare('SELECT * FROM suppliers WHERE id = ?')
      .get(payload.supplier_id) as Supplier | undefined
    if (!supplier) {
      throw new Error('المورد غير موجود')
    }

    const amt = roundMoney(payload.amount)
    if (amt <= 0) {
      throw new Error('يرجى إدخال مبلغ سداد أكبر من صفر')
    }

    const newBalance = roundMoney(supplier.balance - amt)
    db.prepare('UPDATE suppliers SET balance = ? WHERE id = ?').run(newBalance, supplier.id)

    let treasuryTxId: number | null = null
    if (payload.recordInTreasury !== false) {
      const txInfo = db
        .prepare(
          `INSERT INTO treasury_transactions (
            transaction_type, category, amount, supplier_id, payment_method, description, created_by_id, created_by_name
          ) VALUES ('expense', 'سداد موردين', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          amt,
          supplier.id,
          payload.payment_method || 'cash',
          payload.notes?.trim()
            ? `سداد دفعة للمورد (${supplier.name}): ${payload.notes.trim()}`
            : `سداد دفعة من حساب المورد: ${supplier.name}`,
          createdById,
          createdByName
        )
      treasuryTxId = Number(txInfo.lastInsertRowid)
    }

    db.prepare(
      `INSERT INTO supplier_payments (supplier_id, amount, payment_method, treasury_tx_id, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      supplier.id,
      amt,
      payload.payment_method || 'cash',
      treasuryTxId,
      payload.notes?.trim() || 'سداد دفعة للمورد'
    )

    return listSuppliers().find((s) => s.id === supplier.id)!
  })
}

// ==========================================
// 9. PHASE 3B: PURCHASES (SUPPLIERS & USED HEARING AIDS FROM CUSTOMERS)
// ==========================================

function generateNextPurchaseNumber(): string {
  const year = new Date().getFullYear()
  return generateNextNumber(db, 'purchase_invoices', 'invoice_number', `PUR-${year}-`, 4)
}

export function normalizePurchaseInvoiceRow(row: Record<string, unknown>): PurchaseInvoice {
  return {
    ...(row as unknown as PurchaseInvoice),
    subtotal: roundMoney(row.subtotal),
    discount: roundMoney(row.discount),
    total_amount: roundMoney(row.total_amount),
    paid_amount: roundMoney(row.paid_amount),
    remaining_amount: roundMoney(row.remaining_amount)
  }
}

export function listPurchaseInvoices(filters?: {
  search?: string
  purchase_type?: string
  supplier_id?: number | null
}): PurchaseInvoice[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT pi.*
    FROM purchase_invoices pi
    WHERE (
      pi.invoice_number LIKE ? OR
      pi.party_name LIKE ? OR
      pi.party_phone LIKE ? OR
      pi.supplier_ref_no LIKE ? OR
      pi.notes LIKE ? OR
      EXISTS (
        SELECT 1 FROM purchase_items pitem
        WHERE pitem.invoice_id = pi.id AND (pitem.product_name LIKE ? OR pitem.serials_json LIKE ?)
      )
    )
  `
  const params: unknown[] = [q, q, q, q, q, q, q]

  if (filters?.purchase_type && filters.purchase_type !== 'all') {
    sql += ' AND pi.purchase_type = ?'
    params.push(filters.purchase_type)
  }
  if (filters?.supplier_id) {
    sql += ' AND pi.supplier_id = ?'
    params.push(filters.supplier_id)
  }
  if (isDemoDataHidden()) {
    sql += ' AND pi.is_demo = 0'
  }

  sql += ' ORDER BY pi.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const invoices = rawRows.map(normalizePurchaseInvoiceRow)

  const getItemsStmt = db.prepare('SELECT * FROM purchase_items WHERE invoice_id = ? ORDER BY id ASC')
  for (const inv of invoices) {
    const rawItems = getItemsStmt.all(inv.id) as Record<string, unknown>[]
    inv.items = rawItems.map((it) => ({
      ...(it as unknown as PurchaseItem),
      pack_size: Math.max(1, Number(it.pack_size || 1)),
      quantity: Number(it.quantity || 1),
      added_pieces_qty: Number(it.added_pieces_qty || 1),
      unit_cost: roundMoney(it.unit_cost),
      total_cost: roundMoney(it.total_cost),
      serials: parseJsonArray(it.serials_json),
      returned_qty: Number(it.returned_qty || 0)
    }))
  }

  return invoices
}

export function getPurchaseInvoiceById(id: number): PurchaseInvoice | undefined {
  const raw = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  if (!raw) return undefined
  const inv = normalizePurchaseInvoiceRow(raw)
  const rawItems = db
    .prepare('SELECT * FROM purchase_items WHERE invoice_id = ? ORDER BY id ASC')
    .all(inv.id) as Record<string, unknown>[]
  inv.items = rawItems.map((it) => ({
    ...(it as unknown as PurchaseItem),
    pack_size: Math.max(1, Number(it.pack_size || 1)),
    quantity: Number(it.quantity || 1),
    added_pieces_qty: Number(it.added_pieces_qty || 1),
    unit_cost: roundMoney(it.unit_cost),
    total_cost: roundMoney(it.total_cost),
    serials: parseJsonArray(it.serials_json),
    returned_qty: Number(it.returned_qty || 0)
  }))
  return inv
}

export function savePurchaseInvoice(
  data: Partial<PurchaseInvoice> & { items: PurchaseItem[]; recordInTreasury?: boolean },
  callerSession?: SessionInfo | null
): PurchaseInvoice {
  return runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
    const items = Array.isArray(data.items) ? data.items : []
    if (items.length === 0) {
      throw new Error('يرجى إضافة صنف واحد على الأقل في فاتورة المشتريات')
    }

    const purchaseType =
      data.purchase_type === 'used_from_customer' ? 'used_from_customer' : 'supplier'
    let supplierId = data.supplier_id ? Number(data.supplier_id) : null
    let customerId = data.customer_id ? Number(data.customer_id) : null
    let partyName = data.party_name?.trim() || ''
    let partyPhone = data.party_phone?.trim() || ''

    if (purchaseType === 'supplier') {
      if (!supplierId) {
        throw new Error('يرجى اختيار المورد')
      }
      const sup = db
        .prepare('SELECT * FROM suppliers WHERE id = ?')
        .get(supplierId) as Supplier | undefined
      if (!sup) throw new Error('المورد المحدد غير موجود')
      partyName = sup.name
      partyPhone = sup.phone
    } else {
      // Buying used hearing aid from a customer
      if (!partyName) {
        throw new Error('يرجى إدخال اسم العميل البائع للسماعة المستعملة')
      }
      if (!customerId && partyPhone) {
        const existingCust = db
          .prepare('SELECT id, name FROM customers WHERE phone = ? LIMIT 1')
          .get(partyPhone) as { id: number; name: string } | undefined
        if (existingCust) {
          customerId = existingCust.id
        } else {
          const cInfo = db
            .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
            .run(partyName, partyPhone)
          customerId = Number(cInfo.lastInsertRowid)
        }
      }
    }

    let subtotal = 0
    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity || 1))
      const uCost = roundMoney(it.unit_cost)
      subtotal = roundMoney(subtotal + qty * uCost)
    }

    const discount = roundMoney(data.discount ?? 0)
    const totalAmount = Math.max(0, roundMoney(subtotal - discount))
    const paidAmount = roundMoney(data.paid_amount ?? totalAmount)
    const remainingAmount = Math.max(0, roundMoney(totalAmount - paidAmount))
    const invoiceNumber = generateNextPurchaseNumber()
    const invoiceDate = data.invoice_date || getLocalDateString()
    const paymentMethod = data.payment_method || 'cash'

    const invInfo = db
      .prepare(
        `INSERT INTO purchase_invoices (
          invoice_number, purchase_type, supplier_id, customer_id, party_name, party_phone,
          invoice_date, supplier_ref_no, subtotal, discount, total_amount, paid_amount,
          remaining_amount, payment_method, status, notes, created_by_id, created_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`
      )
      .run(
        invoiceNumber,
        purchaseType,
        supplierId,
        customerId,
        partyName,
        partyPhone,
        invoiceDate,
        data.supplier_ref_no?.trim() || '',
        subtotal,
        discount,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentMethod,
        data.notes?.trim() || '',
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
      const addedPieces = unit === 'pack' ? qty * packSize : qty
      const unitCost = roundMoney(it.unit_cost)
      const totalCost = roundMoney(qty * unitCost)
      const condition =
        purchaseType === 'used_from_customer' || it.condition === 'used' ? 'used' : 'new'
      const serials = Array.isArray(it.serials)
        ? it.serials.map((s) => String(s || '').trim()).filter(Boolean)
        : []

      if (prod.track_serial) {
        if (serials.length !== addedPieces) {
          throw new Error(
            `الصنف (${prod.name}) يتطلب إدخال ${addedPieces} سيريال نمبر بالضبط (تم إدخال ${serials.length})`
          )
        }
        // Check duplicate serials
        for (const sn of serials) {
          const dup = db
            .prepare('SELECT id, status FROM product_serials WHERE serial_no = ?')
            .get(sn) as { id: number; status: string } | undefined
          if (dup && dup.status === 'in_stock') {
            throw new Error(`السيريال (${sn}) مسجل بالفعل ومتاح بالمخزن`)
          }
        }
      }

      let variantName = it.variant_name || ''
      if (it.variant_id && !variantName) {
        const v = db
          .prepare('SELECT variant_name FROM product_variants WHERE id = ?')
          .get(it.variant_id) as { variant_name: string } | undefined
        if (v) variantName = v.variant_name
      }

      const itemInfo = db
        .prepare(
          `INSERT INTO purchase_items (
            invoice_id, product_id, variant_id, product_name, variant_name, unit, pack_size,
            quantity, added_pieces_qty, unit_cost, total_cost, condition, serials_json,
            company_warranty_end, returned_qty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          invoiceId,
          prod.id,
          it.variant_id || null,
          prod.name,
          variantName,
          unit,
          packSize,
          qty,
          addedPieces,
          unitCost,
          totalCost,
          condition,
          JSON.stringify(serials),
          it.company_warranty_end || null
        )
      const purchaseItemId = Number(itemInfo.lastInsertRowid)

      const pieceUnitCost = unit === 'pack' ? roundMoney(unitCost / packSize) : unitCost

      if (prod.track_serial) {
        for (const sn of serials) {
          const existingSn = db
            .prepare('SELECT id FROM product_serials WHERE serial_no = ?')
            .get(sn) as { id: number } | undefined
          if (existingSn) {
            db.prepare(
              `UPDATE product_serials SET
                product_id = ?, variant_id = ?, status = 'in_stock', condition = ?,
                purchase_item_id = ?, sale_item_id = NULL, customer_id = NULL,
                company_warranty_start = ?, company_warranty_end = ?, unit_cost = ?
               WHERE id = ?`
            ).run(
              prod.id,
              it.variant_id || null,
              condition,
              purchaseItemId,
              invoiceDate,
              it.company_warranty_end || null,
              pieceUnitCost,
              existingSn.id
            )
          } else {
            db.prepare(
              `INSERT INTO product_serials (
                product_id, variant_id, serial_no, status, condition, purchase_item_id,
                company_warranty_start, company_warranty_end, unit_cost, notes
              ) VALUES (?, ?, ?, 'in_stock', ?, ?, ?, ?, ?, ?)`
            ).run(
              prod.id,
              it.variant_id || null,
              sn,
              condition,
              purchaseItemId,
              invoiceDate,
              it.company_warranty_end || null,
              pieceUnitCost,
              condition === 'used' ? `شراء مستعمل بفاتورة ${invoiceNumber}` : ''
            )
          }
        }
        syncProductQtyFromChildren(prod.id)
      } else if (it.variant_id) {
        db.prepare(
          `UPDATE product_variants
           SET qty = qty + ?,
               cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
               pack_cost_price = CASE WHEN ? = 'pack' AND ? > 0 THEN ? ELSE pack_cost_price END
           WHERE id = ?`
        ).run(
          addedPieces,
          pieceUnitCost,
          pieceUnitCost,
          unit,
          unitCost,
          unitCost,
          it.variant_id
        )
        syncProductQtyFromChildren(prod.id)
      } else {
        db.prepare(
          `UPDATE products
           SET qty = qty + ?,
               cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
               pack_cost_price = CASE WHEN ? = 'pack' AND ? > 0 THEN ? ELSE pack_cost_price END
           WHERE id = ?`
        ).run(addedPieces, pieceUnitCost, pieceUnitCost, unit, unitCost, unitCost, prod.id)
      }

      if (prod.track_serial && pieceUnitCost > 0 && condition === 'new') {
        db.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(pieceUnitCost, prod.id)
      }

      db.prepare(
        `INSERT INTO inventory_movements (
          product_id, variant_id, serial_no, ref_type, ref_id, movement_type,
          quantity, unit_cost, unit_price, notes
        ) VALUES (?, ?, ?, 'purchase_invoice', ?, 'in', ?, ?, ?, ?)`
      ).run(
        prod.id,
        it.variant_id || null,
        serials.join(', '),
        invoiceId,
        addedPieces,
        pieceUnitCost,
        prod.sale_price,
        `توريد مشتريات فاتورة ${invoiceNumber} (${partyName})`
      )
    }

    // Update supplier balance if remaining_amount > 0
    if (purchaseType === 'supplier' && supplierId && remainingAmount > 0) {
      db.prepare('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
        remainingAmount,
        supplierId
      )
    }

    // Record paid amount in treasury & supplier_payments
    let treasuryTxId: number | null = null
    if (paidAmount > 0 && data.recordInTreasury !== false) {
      const category =
        purchaseType === 'used_from_customer' ? 'شراء سماعة مستعملة' : 'مشتريات أصناف وسماعات'
      const desc =
        purchaseType === 'used_from_customer'
          ? `شراء سماعة مستعملة بفاتورة ${invoiceNumber} من العميل: ${partyName}`
          : `سداد فاتورة مشتريات ${invoiceNumber} للمورد: ${partyName}`
      const txInfo = db
        .prepare(
          `INSERT INTO treasury_transactions (
            transaction_type, category, amount, purchase_invoice_id, supplier_id, customer_id,
            payment_method, description, created_by_id, created_by_name
          ) VALUES ('expense', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          category,
          paidAmount,
          invoiceId,
          supplierId,
          customerId,
          paymentMethod,
          desc,
          createdById,
          createdByName
        )
      treasuryTxId = Number(txInfo.lastInsertRowid)
    }

    if (purchaseType === 'supplier' && supplierId && paidAmount > 0) {
      db.prepare(
        `INSERT INTO supplier_payments (
          supplier_id, purchase_invoice_id, amount, payment_method, treasury_tx_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        supplierId,
        invoiceId,
        paidAmount,
        paymentMethod,
        treasuryTxId,
        `دفعة مع فاتورة مشتريات ${invoiceNumber}`
      )
    }

    return getPurchaseInvoiceById(invoiceId)!
  })
}

export function deletePurchaseInvoice(id: number): void {
  runTransaction(() => {
    const inv = getPurchaseInvoiceById(id)
    if (!inv) throw new Error('فاتورة المشتريات غير موجودة')

    // Reverse stock & serials
    for (const it of inv.items || []) {
      const netAdded = Math.max(0, it.added_pieces_qty - (it.returned_qty || 0) * it.pack_size)
      const serials = it.serials || []
      if (serials.length > 0) {
        for (const sn of serials) {
          const sr = db
            .prepare('SELECT id, status FROM product_serials WHERE serial_no = ?')
            .get(sn) as { id: number; status: string } | undefined
          if (sr && sr.status === 'sold') {
            throw new Error(
              `لا يمكن حذف الفاتورة لأن السيريال (${sn}) تم بيعه بالفعل لعميل`
            )
          }
          if (sr) {
            db.prepare('DELETE FROM product_serials WHERE id = ?').run(sr.id)
          }
        }
        syncProductQtyFromChildren(it.product_id)
      } else if (it.variant_id) {
        db.prepare('UPDATE product_variants SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          netAdded,
          it.variant_id
        )
        syncProductQtyFromChildren(it.product_id)
      } else {
        db.prepare('UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?').run(
          netAdded,
          it.product_id
        )
      }
    }

    if (inv.supplier_id && inv.remaining_amount > 0) {
      db.prepare('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
        inv.remaining_amount,
        inv.supplier_id
      )
    }

    db.prepare('DELETE FROM supplier_payments WHERE purchase_invoice_id = ?').run(inv.id)
    db.prepare('DELETE FROM treasury_transactions WHERE purchase_invoice_id = ?').run(inv.id)
    db.prepare('DELETE FROM purchase_invoices WHERE id = ?').run(inv.id)
  })
}

// ==========================================
// 10. PHASE 3C: SALES, QUICK POS & INSTALLMENTS
// ==========================================
