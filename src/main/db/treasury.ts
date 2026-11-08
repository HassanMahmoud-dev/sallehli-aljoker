import { db, runTransaction } from './connection'
import { roundMoney, parseJsonObject, getLocalDateString } from './utils'
import { normalizeTicketRow } from './tickets'
import { listSuppliers } from './suppliers'
import { isDemoDataHidden } from './demo'
import type {
  TreasuryTransaction,
  FinancialReportData,
  TechnicianStatementItem,
  MaintenanceTicket,
  SalesInvoice
} from '../../shared/types'
import type { SessionInfo } from '../session'

export function listTreasuryTransactions(): TreasuryTransaction[] {
  const demoFilter = isDemoDataHidden() ? ' WHERE tt.is_demo = 0' : ''
  return db
    .prepare(
      `SELECT tt.*, mt.ticket_number, tech.name as technician_name, s.name as supplier_name,
              si.invoice_number as sales_invoice_number, pi.invoice_number as purchase_invoice_number
       FROM treasury_transactions tt
       LEFT JOIN maintenance_tickets mt ON mt.id = tt.ticket_id
       LEFT JOIN technicians tech ON tech.id = tt.technician_id
       LEFT JOIN suppliers s ON s.id = tt.supplier_id
       LEFT JOIN sales_invoices si ON si.id = tt.sales_invoice_id
       LEFT JOIN purchase_invoices pi ON pi.id = tt.purchase_invoice_id
       ${demoFilter}
       ORDER BY tt.id DESC LIMIT 300`
    )
    .all() as TreasuryTransaction[]
}

export function addTreasuryTransaction(
  data: Partial<TreasuryTransaction>,
  callerSession?: SessionInfo | null
): TreasuryTransaction {
  const createdById = callerSession?.userId || null
  const createdByName = callerSession?.full_name || callerSession?.username || ''
  const info = db
    .prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, technician_id, payment_method, description, created_by_id, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.transaction_type || 'expense',
      data.category?.trim() || 'مصروفات عامة',
      Number(data.amount ?? 0),
      data.ticket_id || null,
      data.technician_id || null,
      data.payment_method || 'cash',
      data.description?.trim() || '',
      createdById,
      createdByName
    )

  return db
    .prepare('SELECT * FROM treasury_transactions WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as TreasuryTransaction
}

export function transferTreasuryFunds(payload: {
  fromMethod: string
  toMethod: string
  amount: number
  notes?: string
}): void {
  const amt = Number(payload.amount || 0)
  if (amt <= 0) throw new Error('يرجى إدخال مبلغ صحيح للتحويل')
  if (payload.fromMethod === payload.toMethod) {
    throw new Error('لا يمكن التحويل إلى نفس الخزينة / المحفظة')
  }

  runTransaction(() => {
    const desc = payload.notes?.trim()
      ? `تحويل بين الخزائن: ${payload.notes.trim()}`
      : `تحويل رصيد داخلي بمبلغ ${amt} ج.م`

    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
       VALUES ('expense', 'تحويل بين الخزائن', ?, ?, ?)`
    ).run(amt, payload.fromMethod, `${desc} (صادر)`)

    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
       VALUES ('income', 'تحويل بين الخزائن', ?, ?, ?)`
    ).run(amt, payload.toMethod, `${desc} (وارد)`)
  })
}

export function collectTicketReceivable(payload: {
  ticketId: number
  amount: number
  paymentMethod: string
  notes?: string
}): MaintenanceTicket {
  return runTransaction(() => {
    const raw = db
      .prepare('SELECT * FROM maintenance_tickets WHERE id = ?')
      .get(payload.ticketId) as Record<string, unknown> | undefined
    if (!raw) throw new Error('طلب الصيانة غير موجود')

    const ticket = normalizeTicketRow(raw)
    const collectAmt = Math.min(Number(payload.amount || 0), ticket.remaining_amount)
    if (collectAmt <= 0) throw new Error('المبلغ المحصل يجب أن يكون أكبر من صفر')

    const newPaid = ticket.paid_amount + collectAmt
    const newRemaining = Math.max(0, ticket.total_amount - newPaid)

    db.prepare(
      `UPDATE maintenance_tickets
       SET paid_amount = ?, remaining_amount = ?, payment_method = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(newPaid, newRemaining, payload.paymentMethod || 'cash', ticket.id)

    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description)
       VALUES ('income', 'تحصيل مديونية عميل', ?, ?, ?, ?)`
    ).run(
      collectAmt,
      ticket.id,
      payload.paymentMethod || 'cash',
      payload.notes?.trim() ||
        `تحصيل متبقي من طلب صيانة ${ticket.ticket_number} - العميل: ${ticket.customer_name}`
    )

    const updated = db
      .prepare('SELECT * FROM maintenance_tickets WHERE id = ?')
      .get(ticket.id) as Record<string, unknown>
    return normalizeTicketRow(updated)
  })
}

export function deleteTreasuryTransaction(id: number): void {
  runTransaction(() => {
    const tx = db
      .prepare('SELECT * FROM treasury_transactions WHERE id = ?')
      .get(id) as TreasuryTransaction | undefined
    if (!tx) return

    // 1. Reverse linked supplier_payments if any
    const supPay = db
      .prepare('SELECT * FROM supplier_payments WHERE treasury_tx_id = ?')
      .get(id) as
      | { id: number; supplier_id: number; purchase_invoice_id: number | null; amount: number }
      | undefined
    if (supPay) {
      db.prepare('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
        supPay.amount,
        supPay.supplier_id
      )
      if (supPay.purchase_invoice_id) {
        db.prepare(
          `UPDATE purchase_invoices
           SET paid_amount = MAX(0, ROUND(paid_amount - ?, 2)),
               remaining_amount = ROUND(remaining_amount + ?, 2)
           WHERE id = ?`
        ).run(supPay.amount, supPay.amount, supPay.purchase_invoice_id)
      }
      db.prepare('DELETE FROM supplier_payments WHERE id = ?').run(supPay.id)
    }

    // 2. Reverse linked sales_payments if any
    const salePay = db
      .prepare('SELECT * FROM sales_payments WHERE treasury_tx_id = ?')
      .get(id) as
      | { id: number; invoice_id: number; amount: number; payment_type: string }
      | undefined
    if (salePay) {
      if (salePay.amount > 0) {
        db.prepare(
          `UPDATE sales_invoices
           SET paid_amount = MAX(0, ROUND(paid_amount - ?, 2)),
               remaining_amount = ROUND(remaining_amount + ?, 2),
               updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        ).run(salePay.amount, salePay.amount, salePay.invoice_id)
      }
      db.prepare('DELETE FROM sales_payments WHERE id = ?').run(salePay.id)
    }

    // 3. Reverse linked maintenance ticket payment if applicable
    if (
      tx.ticket_id &&
      tx.transaction_type === 'income' &&
      (tx.category === 'تحصيل صيانة / كشف' || tx.category === 'تحصيل مديونية عميل')
    ) {
      db.prepare(
        `UPDATE maintenance_tickets
         SET paid_amount = MAX(0, ROUND(paid_amount - ?, 2)),
             remaining_amount = ROUND(remaining_amount + ?, 2),
             updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).run(tx.amount, tx.amount, tx.ticket_id)
    }

    db.prepare('DELETE FROM treasury_transactions WHERE id = ?').run(id)
  })
}

export function getFinancialReport(dateFrom?: string, dateTo?: string): FinancialReportData {
  const today = getLocalDateString()
  const firstOfMonth = `${today.slice(0, 8)}01`
  const from = dateFrom?.trim() || firstOfMonth
  const to = dateTo?.trim() || today

  // 1. All-time balances per payment method (including internal transfers)
  const methods = ['cash', 'vodafone_cash', 'instapay', 'bank']
  const balancesByMethod: Record<string, { income: number; expense: number; net: number }> = {}
  const periodBalancesByMethod: Record<string, { income: number; expense: number; net: number }> = {}

  for (const m of methods) {
    balancesByMethod[m] = { income: 0, expense: 0, net: 0 }
    periodBalancesByMethod[m] = { income: 0, expense: 0, net: 0 }
  }

  const allMethodRows = db
    .prepare(
      `SELECT payment_method, transaction_type, SUM(amount) as total
       FROM treasury_transactions
       GROUP BY payment_method, transaction_type`
    )
    .all() as Array<{ payment_method: string; transaction_type: string; total: number }>

  for (const r of allMethodRows) {
    const m = balancesByMethod[r.payment_method] || { income: 0, expense: 0, net: 0 }
    if (r.transaction_type === 'income') {
      m.income += Number(r.total || 0)
    } else {
      m.expense += Number(r.total || 0)
    }
    m.net = m.income - m.expense
    balancesByMethod[r.payment_method] = m
  }

  const periodMethodRows = db
    .prepare(
      `SELECT payment_method, transaction_type, SUM(amount) as total
       FROM treasury_transactions
       WHERE date(created_at) BETWEEN ? AND ?
       GROUP BY payment_method, transaction_type`
    )
    .all(from, to) as Array<{ payment_method: string; transaction_type: string; total: number }>

  for (const r of periodMethodRows) {
    const m = periodBalancesByMethod[r.payment_method] || { income: 0, expense: 0, net: 0 }
    if (r.transaction_type === 'income') {
      m.income += Number(r.total || 0)
    } else {
      m.expense += Number(r.total || 0)
    }
    m.net = m.income - m.expense
    periodBalancesByMethod[r.payment_method] = m
  }

  // 2. Period income / expense / tech commissions (excluding internal transfers from profit calculation)
  const totalIncome = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
         WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن'
         AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { total: number }
  ).total

  const totalExpense = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
         WHERE transaction_type = 'expense' AND category != 'تحويل بين الخزائن'
         AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { total: number }
  ).total

  const totalTechCommissions = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
         WHERE transaction_type = 'tech_commission'
         AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { total: number }
  ).total

  // 3. Tickets metrics in period
  const ticketAgg = db
    .prepare(
      `SELECT
        COUNT(*) as ticketsCount,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN 1 ELSE 0 END), 0) as completedTicketsCount,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN parts_total ELSE 0 END), 0) as totalPartsRevenue,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN parts_cost_total ELSE 0 END), 0) as totalPartsCost,
        COALESCE(SUM(CASE WHEN status IN ('repaired', 'delivered') THEN (inspection_fee + labor_cost - discount) ELSE 0 END), 0) as totalInspectionAndLabor
       FROM maintenance_tickets
       WHERE date(created_at) BETWEEN ? AND ?`
    )
    .get(from, to) as {
    ticketsCount: number
    completedTicketsCount: number
    totalPartsRevenue: number
    totalPartsCost: number
    totalInspectionAndLabor: number
  }

  const rawReceivables = db
    .prepare(
      `SELECT mt.*, t.name as technician_name
       FROM maintenance_tickets mt
       LEFT JOIN technicians t ON t.id = mt.technician_id
       WHERE mt.remaining_amount > 0 AND mt.status != 'cancelled'
       ORDER BY mt.remaining_amount DESC`
    )
    .all() as Record<string, unknown>[]
  const customerReceivables = rawReceivables.map(normalizeTicketRow)
  const totalReceivables = customerReceivables.reduce((sum, t) => sum + t.remaining_amount, 0)

  const periodPartsPurchaseExpense = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
         WHERE transaction_type = 'expense' AND category = 'شراء قطع غيار'
         AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { total: number }
  ).total

  const totalPartsProfit = roundMoney(ticketAgg.totalPartsRevenue - ticketAgg.totalPartsCost)
  const netProfit = roundMoney(totalIncome - totalExpense - totalTechCommissions)

  // 4. Technician Statements
  const technicianStatements = db
    .prepare(
      `SELECT
        tech.id, tech.name, tech.phone, tech.specialty, tech.avatar_base64,
        tech.commission_rate, tech.base_salary,
        COALESCE((SELECT COUNT(*) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as completed_tickets_count,
        COALESCE((SELECT SUM(mt.labor_cost + mt.inspection_fee) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as period_labor_and_inspection,
        COALESCE((SELECT SUM(COALESCE(mt.commission_amount, (mt.labor_cost + mt.inspection_fee) * (COALESCE(mt.commission_rate, tech.commission_rate) / 100.0))) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as period_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'
          AND date(tt.created_at) BETWEEN ? AND ?), 0) as period_paid_commission,
        COALESCE((SELECT SUM(COALESCE(mt.commission_amount, (mt.labor_cost + mt.inspection_fee) * (COALESCE(mt.commission_rate, tech.commission_rate) / 100.0))) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')), 0) as total_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'), 0) as total_paid_commission
       FROM technicians tech
       ORDER BY tech.id ASC`
    )
    .all(from, to, from, to, from, to, from, to) as Array<
    Omit<TechnicianStatementItem, 'remaining_balance'>
  >

  const statementsWithBalance: TechnicianStatementItem[] = technicianStatements.map((s) => ({
    ...s,
    remaining_balance: Math.max(
      0,
      Math.round((s.total_earned_commission || 0) - (s.total_paid_commission || 0))
    )
  }))

  // 5. Top Appliances & Brands
  const topAppliances = db
    .prepare(
      `SELECT appliance_type, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
       FROM maintenance_tickets
       WHERE date(created_at) BETWEEN ? AND ?
       GROUP BY appliance_type
       ORDER BY count DESC LIMIT 10`
    )
    .all(from, to) as Array<{ appliance_type: string; count: number; revenue: number }>

  const topBrands = db
    .prepare(
      `SELECT brand, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
       FROM maintenance_tickets
       WHERE date(created_at) BETWEEN ? AND ?
       GROUP BY brand
       ORDER BY count DESC LIMIT 10`
    )
    .all(from, to) as Array<{ brand: string; count: number; revenue: number }>

  const transactions = db
    .prepare(
      `SELECT tt.*, mt.ticket_number, tech.name as technician_name, s.name as supplier_name,
              si.invoice_number as sales_invoice_number, pi.invoice_number as purchase_invoice_number
       FROM treasury_transactions tt
       LEFT JOIN maintenance_tickets mt ON mt.id = tt.ticket_id
       LEFT JOIN technicians tech ON tech.id = tt.technician_id
       LEFT JOIN suppliers s ON s.id = tt.supplier_id
       LEFT JOIN sales_invoices si ON si.id = tt.sales_invoice_id
       LEFT JOIN purchase_invoices pi ON pi.id = tt.purchase_invoice_id
       WHERE date(tt.created_at) BETWEEN ? AND ?
       ORDER BY tt.id DESC`
    )
    .all(from, to) as TreasuryTransaction[]

  // 6. Phase 3W: Sales, Purchases, Suppliers & Inventory Valuation metrics
  const salesAgg = db
    .prepare(
      `SELECT
        COUNT(DISTINCT si.id) as salesInvoicesCount,
        COALESCE(SUM(CASE WHEN si.status != 'cancelled' AND sitem.quantity > 0 THEN (sitem.quantity - sitem.returned_qty) * (sitem.unit_price - (sitem.discount / sitem.quantity)) ELSE 0 END), 0) as grossSalesRevenue,
        COALESCE(SUM(CASE WHEN si.status != 'cancelled' THEN (sitem.quantity - sitem.returned_qty) * sitem.unit_cost ELSE 0 END), 0) as totalSalesCost
       FROM sales_invoices si
       LEFT JOIN sales_items sitem ON sitem.invoice_id = si.id
       WHERE si.status != 'cancelled' AND date(si.created_at) BETWEEN ? AND ?`
    )
    .get(from, to) as {
    salesInvoicesCount: number
    grossSalesRevenue: number
    totalSalesCost: number
  }

  const invoiceLevelDiscounts = (
    db
      .prepare(
        `SELECT COALESCE(SUM(discount), 0) as totalDisc
         FROM sales_invoices
         WHERE status NOT IN ('cancelled', 'returned') AND date(created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as { totalDisc: number }
  ).totalDisc

  const totalSalesRevenue = Math.max(
    0,
    roundMoney((salesAgg?.grossSalesRevenue || 0) - (invoiceLevelDiscounts || 0))
  )
  const totalSalesCost = roundMoney(salesAgg?.totalSalesCost || 0)
  const totalSalesProfit = roundMoney(totalSalesRevenue - totalSalesCost)

  const totalSalesReturns = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(total_return_amount), 0) as total FROM invoice_returns
           WHERE return_type = 'sales_return' AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const totalPurchasesAmount = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(total_amount), 0) as total FROM purchase_invoices
           WHERE status != 'cancelled' AND date(invoice_date) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const totalExternalRepairCost = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(external_cost), 0) as total FROM maintenance_tickets
           WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const rawSalesReceivables = db
    .prepare(
      `SELECT * FROM sales_invoices
       WHERE remaining_amount > 0 AND status != 'cancelled'
       ORDER BY remaining_amount DESC`
    )
    .all() as Record<string, unknown>[]
  const salesReceivables: SalesInvoice[] = rawSalesReceivables.map((r) => ({
    ...(r as unknown as SalesInvoice),
    subtotal: roundMoney(r.subtotal),
    discount: roundMoney(r.discount),
    trade_in_credit: roundMoney(r.trade_in_credit),
    total_amount: roundMoney(r.total_amount),
    paid_amount: roundMoney(r.paid_amount),
    remaining_amount: roundMoney(r.remaining_amount),
    extra_data: parseJsonObject(r.extra_data)
  }))
  const totalSalesReceivables = roundMoney(
    salesReceivables.reduce((sum, inv) => sum + inv.remaining_amount, 0)
  )

  const supplierBalances = listSuppliers().filter((s) => Math.abs(s.balance) > 0.009)
  const totalSuppliersBalance = roundMoney(
    supplierBalances.reduce((sum, s) => sum + (s.balance > 0 ? s.balance : 0), 0)
  )

  // Inventory valuation (products + spare_parts)
  const prodVal = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type != 'service' THEN qty * cost_price ELSE 0 END), 0) as costVal,
        COALESCE(SUM(CASE WHEN type != 'service' THEN qty * sale_price ELSE 0 END), 0) as saleVal
       FROM products WHERE is_active = 1`
    )
    .get() as { costVal: number; saleVal: number }

  const partsVal = db
    .prepare(
      `SELECT
        COALESCE(SUM(quantity * purchase_price), 0) as costVal,
        COALESCE(SUM(quantity * selling_price), 0) as saleVal
       FROM spare_parts`
    )
    .get() as { costVal: number; saleVal: number }

  const inventoryCostValue = roundMoney((prodVal?.costVal || 0) + (partsVal?.costVal || 0))
  const inventorySaleValue = roundMoney((prodVal?.saleVal || 0) + (partsVal?.saleVal || 0))

  const topProducts = db
    .prepare(
      `SELECT
        sitem.product_name,
        sitem.item_type,
        COALESCE(SUM(sitem.quantity - sitem.returned_qty), 0) as qty,
        COALESCE(SUM((sitem.quantity - sitem.returned_qty) * sitem.unit_price - sitem.discount), 0) as revenue,
        COALESCE(SUM(((sitem.quantity - sitem.returned_qty) * sitem.unit_price - sitem.discount) - ((sitem.quantity - sitem.returned_qty) * sitem.unit_cost)), 0) as profit
       FROM sales_items sitem
       JOIN sales_invoices si ON si.id = sitem.invoice_id
       WHERE si.status != 'cancelled' AND (sitem.quantity - sitem.returned_qty) > 0
         AND date(si.created_at) BETWEEN ? AND ?
       GROUP BY sitem.product_id, sitem.product_name, sitem.item_type
       ORDER BY revenue DESC LIMIT 10`
    )
    .all(from, to) as Array<{
    product_name: string
    item_type: string
    qty: number
    revenue: number
    profit: number
  }>

  return {
    dateFrom: from,
    dateTo: to,
    summary: {
      totalIncome,
      totalExpense,
      totalTechCommissions,
      totalPartsRevenue: ticketAgg.totalPartsRevenue,
      totalPartsCost: ticketAgg.totalPartsCost,
      totalPartsProfit,
      totalInspectionAndLabor: ticketAgg.totalInspectionAndLabor,
      netProfit,
      ticketsCount: ticketAgg.ticketsCount,
      completedTicketsCount: ticketAgg.completedTicketsCount,
      totalReceivables,
      salesInvoicesCount: salesAgg?.salesInvoicesCount || 0,
      totalSalesRevenue,
      totalSalesCost,
      totalSalesProfit,
      totalSalesReturns,
      totalPurchasesAmount,
      totalSuppliersBalance,
      totalSalesReceivables,
      totalExternalRepairCost,
      inventoryCostValue,
      inventorySaleValue
    },
    balancesByMethod,
    periodBalancesByMethod,
    technicianStatements: statementsWithBalance,
    customerReceivables,
    salesReceivables,
    supplierBalances,
    topAppliances,
    topBrands,
    topProducts,
    transactions
  }
}

// ==========================================
// 7. DASHBOARD & SETTINGS & BACKUP
// ==========================================
