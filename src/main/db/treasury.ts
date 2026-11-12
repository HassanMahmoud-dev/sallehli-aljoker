import { db, runTransaction } from './connection'
import { roundMoney, parseJsonObject, getLocalDateString } from './utils'
import { normalizeTicketRow } from './tickets'
import { listSuppliers } from './suppliers'
import { isDemoDataHidden } from './demo'
import { getBusinessState } from './business'
import type {
  TreasuryTransaction,
  TreasuryBalances,
  FinancialReportData,
  TechnicianStatementItem,
  MaintenanceTicket,
  SalesInvoice
} from '../../shared/types'
import type { SessionInfo } from '../session'

const BASE_TREASURY_METHODS = ['cash', 'vodafone_cash', 'instapay', 'bank', 'check'] as const

export const EXCLUDED_OPERATING_INCOME_CATEGORIES = [
  'تحويل بين الخزائن',
  'استرداد مرتجع مشتريات',
  'مبيعات سماعات وأصناف',
  'بيع مباشر / بطاريات',
  'تحصيل أقساط مبيعات',
  'فارق استبدال وترقية',
  'مبيعات سماعات طبية',
  'تحصيل صيانة / كشف',
  'تحصيل مديونية عميل',
  'صيانة أجهزة منزلية',
  'عربون صيانة شاشة',
  'صيانة سماعات طبية'
] as const

export const EXCLUDED_OPERATING_EXPENSE_CATEGORIES = [
  'تحويل بين الخزائن',
  'سداد موردين',
  'مشتريات أصناف وسماعات',
  'شراء سماعة مستعملة',
  'شراء قطع غيار',
  'توريد منتجات وسماعات',
  'توريد منتجات وبطاريات',
  'مرتجع مبيعات',
  'رد فارق استبدال للعميل',
  'تسوية / رد دفعة صيانة'
] as const

function getDemoCondWithBiz(alias = ''): string {
  const bType = getBusinessState().type
  const p = alias ? `${alias}.` : ''
  return isDemoDataHidden()
    ? `${p}is_demo = 0`
    : `(${p}is_demo = 0 OR ${p}business_type = '${bType}' OR ${p}business_type IS NULL OR ${p}business_type = '')`
}

function getDemoCondSimple(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return isDemoDataHidden() ? `${p}is_demo = 0` : '1 = 1'
}

export function computeTreasuryMethodBalances(dateRange?: {
  from: string
  to: string
}): Record<string, { income: number; expense: number; net: number }> {
  const byMethod: Record<string, { income: number; expense: number; net: number }> = {}
  for (const m of BASE_TREASURY_METHODS) {
    byMethod[m] = { income: 0, expense: 0, net: 0 }
  }

  const demoCond = getDemoCondWithBiz()
  const sql = dateRange
    ? `SELECT payment_method, transaction_type, COALESCE(SUM(amount), 0) as total
       FROM treasury_transactions
       WHERE ${demoCond} AND date(created_at) BETWEEN ? AND ?
       GROUP BY payment_method, transaction_type`
    : `SELECT payment_method, transaction_type, COALESCE(SUM(amount), 0) as total
       FROM treasury_transactions
       WHERE ${demoCond}
       GROUP BY payment_method, transaction_type`

  const rows = (
    dateRange ? db.prepare(sql).all(dateRange.from, dateRange.to) : db.prepare(sql).all()
  ) as Array<{ payment_method: string; transaction_type: string; total: number }>

  for (const r of rows) {
    const key = r.payment_method || 'cash'
    const entry = byMethod[key] || { income: 0, expense: 0, net: 0 }
    const val = roundMoney(r.total || 0)
    if (r.transaction_type === 'income') {
      entry.income = roundMoney(entry.income + val)
    } else {
      entry.expense = roundMoney(entry.expense + val)
    }
    entry.net = roundMoney(entry.income - entry.expense)
    byMethod[key] = entry
  }

  return byMethod
}

export function getTreasuryBalances(): TreasuryBalances {
  const byMethod = computeTreasuryMethodBalances()
  const total = roundMoney(
    Object.values(byMethod).reduce((sum, item) => sum + Number(item.net || 0), 0)
  )
  return { total, byMethod }
}

export function getOperatingTreasurySummary(
  datePredicateSql: string,
  params: unknown[],
  demoCondSql = getDemoCondWithBiz()
): { otherOperatingIncome: number; operatingExpenses: number } {
  const incomeExcludedPh = EXCLUDED_OPERATING_INCOME_CATEGORIES.map(() => '?').join(', ')
  const expenseExcludedPh = EXCLUDED_OPERATING_EXPENSE_CATEGORIES.map(() => '?').join(', ')

  const otherIncomeRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM treasury_transactions
       WHERE transaction_type = 'income'
         AND sales_invoice_id IS NULL
         AND (ticket_id IS NULL OR category = 'تسوية تكلفة صيانة خارجية')
         AND category NOT IN (${incomeExcludedPh})
         AND ${demoCondSql}
         AND ${datePredicateSql}`
    )
    .get(...EXCLUDED_OPERATING_INCOME_CATEGORIES, ...params) as { total: number }

  const operatingExpRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM treasury_transactions
       WHERE transaction_type = 'expense'
         AND purchase_invoice_id IS NULL
         AND sales_invoice_id IS NULL
         AND category NOT IN (${expenseExcludedPh})
         AND ${demoCondSql}
         AND ${datePredicateSql}`
    )
    .get(...EXCLUDED_OPERATING_EXPENSE_CATEGORIES, ...params) as { total: number }

  return {
    otherOperatingIncome: roundMoney(otherIncomeRow?.total || 0),
    operatingExpenses: roundMoney(operatingExpRow?.total || 0)
  }
}

export function listTreasuryTransactions(): TreasuryTransaction[] {
  const bType = getBusinessState().type
  const demoFilter = isDemoDataHidden()
    ? ' WHERE tt.is_demo = 0'
    : ` WHERE (tt.is_demo = 0 OR tt.business_type = '${bType}' OR tt.business_type IS NULL OR tt.business_type = '')`
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

export function transferTreasuryFunds(
  payload: {
    fromMethod: string
    toMethod: string
    amount: number
    notes?: string
  },
  callerSession?: SessionInfo | null
): void {
  const amt = roundMoney(payload.amount || 0)
  if (amt <= 0) throw new Error('يرجى إدخال مبلغ صحيح للتحويل')
  if (payload.fromMethod === payload.toMethod) {
    throw new Error('لا يمكن التحويل إلى نفس الخزينة / المحفظة')
  }

  runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
    const desc = payload.notes?.trim()
      ? `تحويل بين الخزائن: ${payload.notes.trim()}`
      : `تحويل رصيد داخلي بمبلغ ${amt} ج.م`

    const outInfo = db
      .prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, payment_method, description, created_by_id, created_by_name
        ) VALUES ('expense', 'تحويل بين الخزائن', ?, ?, ?, ?, ?)`
      )
      .run(amt, payload.fromMethod, `${desc} (صادر)`, createdById, createdByName)
    const outTxId = Number(outInfo.lastInsertRowid)

    const inInfo = db
      .prepare(
        `INSERT INTO treasury_transactions (
          transaction_type, category, amount, linked_tx_id, payment_method, description, created_by_id, created_by_name
        ) VALUES ('income', 'تحويل بين الخزائن', ?, ?, ?, ?, ?, ?)`
      )
      .run(amt, outTxId, payload.toMethod, `${desc} (وارد)`, createdById, createdByName)
    const inTxId = Number(inInfo.lastInsertRowid)

    db.prepare('UPDATE treasury_transactions SET linked_tx_id = ? WHERE id = ?').run(inTxId, outTxId)
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

    if (tx.purchase_invoice_id && tx.category === 'استرداد مرتجع مشتريات') {
      throw new Error('لا يمكن حذف قيد استرداد مرتجع مشتريات مباشرة من الخزينة دون إلغاء المرتجع')
    }

    // Collect atomically linked counterpart transaction IDs (e.g. internal transfer pairs)
    const partnerIds = new Set<number>()
    if (tx.linked_tx_id && tx.linked_tx_id !== tx.id) {
      partnerIds.add(tx.linked_tx_id)
    }
    const reverseLinkedRows = db
      .prepare('SELECT id FROM treasury_transactions WHERE linked_tx_id = ? AND id != ?')
      .all(tx.id, tx.id) as Array<{ id: number }>
    for (const r of reverseLinkedRows) {
      partnerIds.add(r.id)
    }

    // 1. Reverse all linked supplier_payments (supports FIFO multi-invoice payments sharing one treasury_tx_id)
    const supPayments = db
      .prepare('SELECT * FROM supplier_payments WHERE treasury_tx_id = ?')
      .all(id) as Array<{
      id: number
      supplier_id: number
      purchase_invoice_id: number | null
      amount: number
    }>
    if (supPayments.length > 0) {
      for (const supPay of supPayments) {
        db.prepare('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
          supPay.amount,
          supPay.supplier_id
        )
        if (supPay.purchase_invoice_id) {
          const pinv = db
            .prepare('SELECT total_amount, paid_amount FROM purchase_invoices WHERE id = ?')
            .get(supPay.purchase_invoice_id) as
            | { total_amount: number; paid_amount: number }
            | undefined
          if (pinv) {
            const newPaid = Math.max(0, roundMoney(pinv.paid_amount - supPay.amount))
            const newRem = Math.max(0, roundMoney(pinv.total_amount - newPaid))
            db.prepare(
              'UPDATE purchase_invoices SET paid_amount = ?, remaining_amount = ? WHERE id = ?'
            ).run(newPaid, newRem, supPay.purchase_invoice_id)
          }
        }
      }
      db.prepare('DELETE FROM supplier_payments WHERE treasury_tx_id = ?').run(id)
    } else if (tx.purchase_invoice_id) {
      const pinv = db
        .prepare('SELECT total_amount, paid_amount, supplier_id FROM purchase_invoices WHERE id = ?')
        .get(tx.purchase_invoice_id) as
        | { total_amount: number; paid_amount: number; supplier_id: number | null }
        | undefined
      if (pinv) {
        const delta = tx.transaction_type === 'expense' ? tx.amount : -tx.amount
        const newPaid = Math.max(0, roundMoney(pinv.paid_amount - delta))
        const newRem = Math.max(0, roundMoney(pinv.total_amount - newPaid))
        db.prepare(
          'UPDATE purchase_invoices SET paid_amount = ?, remaining_amount = ? WHERE id = ?'
        ).run(newPaid, newRem, tx.purchase_invoice_id)
        if (pinv.supplier_id) {
          db.prepare('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
            delta,
            pinv.supplier_id
          )
        }
      }
    } else if (tx.supplier_id) {
      const delta = tx.transaction_type === 'expense' ? tx.amount : -tx.amount
      db.prepare('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
        delta,
        tx.supplier_id
      )
    }

    // 2. Reverse all linked sales_payments (handles both positive receipts > 0 and negative refunds < 0)
    const salePayments = db
      .prepare('SELECT * FROM sales_payments WHERE treasury_tx_id = ?')
      .all(id) as Array<{
      id: number
      invoice_id: number
      amount: number
      payment_type: string
    }>
    if (salePayments.length > 0) {
      for (const salePay of salePayments) {
        const sinv = db
          .prepare(
            'SELECT total_amount, paid_amount, returned_amount FROM sales_invoices WHERE id = ?'
          )
          .get(salePay.invoice_id) as
          | { total_amount: number; paid_amount: number; returned_amount: number | null }
          | undefined
        if (sinv) {
          const newPaid = Math.max(0, roundMoney(sinv.paid_amount - salePay.amount))
          const netDue = Math.max(0, roundMoney(sinv.total_amount - (sinv.returned_amount || 0)))
          const newRemaining = Math.max(0, roundMoney(netDue - newPaid))
          db.prepare(
            `UPDATE sales_invoices
             SET paid_amount = ?, remaining_amount = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`
          ).run(newPaid, newRemaining, salePay.invoice_id)
        }
      }
      db.prepare('DELETE FROM sales_payments WHERE treasury_tx_id = ?').run(id)
    } else if (tx.sales_invoice_id) {
      const sinvExists = db
        .prepare('SELECT 1 FROM sales_invoices WHERE id = ?')
        .get(tx.sales_invoice_id)
      if (sinvExists) {
        throw new Error(
          'لا يمكن حذف حركة خزينة مرتبطة بفاتورة مبيعات دون سجل دفع؛ يرجى التعديل أو الإلغاء من شاشة المبيعات'
        )
      }
    }

    // 3. Reverse linked maintenance ticket payment / refund adjustment if applicable
    if (tx.ticket_id) {
      if (
        tx.transaction_type === 'income' &&
        (tx.category === 'تحصيل صيانة / كشف' || tx.category === 'تحصيل مديونية عميل')
      ) {
        const tRow = db
          .prepare('SELECT total_amount, paid_amount FROM maintenance_tickets WHERE id = ?')
          .get(tx.ticket_id) as { total_amount: number; paid_amount: number } | undefined
        if (tRow) {
          const newPaid = Math.max(0, roundMoney(tRow.paid_amount - tx.amount))
          const newRem = Math.max(0, roundMoney(tRow.total_amount - newPaid))
          db.prepare(
            `UPDATE maintenance_tickets
             SET paid_amount = ?, remaining_amount = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`
          ).run(newPaid, newRem, tx.ticket_id)
        }
      } else if (tx.transaction_type === 'expense' && tx.category === 'تسوية / رد دفعة صيانة') {
        const tRow = db
          .prepare('SELECT total_amount, paid_amount FROM maintenance_tickets WHERE id = ?')
          .get(tx.ticket_id) as { total_amount: number; paid_amount: number } | undefined
        if (tRow) {
          const newPaid = Math.max(0, roundMoney(tRow.paid_amount + tx.amount))
          const newRem = Math.max(0, roundMoney(tRow.total_amount - newPaid))
          db.prepare(
            `UPDATE maintenance_tickets
             SET paid_amount = ?, remaining_amount = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`
          ).run(newPaid, newRem, tx.ticket_id)
        }
      }
    }

    // 4. Delete linked counterpart transactions (e.g. internal transfer pairs) and this transaction atomically
    for (const pid of partnerIds) {
      db.prepare('DELETE FROM treasury_transactions WHERE id = ?').run(pid)
    }
    db.prepare('DELETE FROM treasury_transactions WHERE id = ?').run(id)
  })
}

export function getFinancialReport(dateFrom?: string, dateTo?: string): FinancialReportData {
  const today = getLocalDateString()
  const firstOfMonth = `${today.slice(0, 8)}01`
  const from = dateFrom?.trim() || firstOfMonth
  const to = dateTo?.trim() || today

  const demoTtCond = getDemoCondWithBiz()
  const demoTtAliasCond = getDemoCondWithBiz('tt')
  const demoMtCond = getDemoCondWithBiz()
  const demoMtAliasCond = getDemoCondWithBiz('mt')
  const demoTechCond = getDemoCondWithBiz('tech')

  // 1. All-time and period balances per payment method (SQL SUM across full ledger, demo-filtered)
  const balancesByMethod = computeTreasuryMethodBalances()
  const periodBalancesByMethod = computeTreasuryMethodBalances({ from, to })

  // 2. Period cash flows (excluding internal transfers)
  const totalIncome = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
           WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن'
           AND ${demoTtCond}
           AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const totalExpense = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
           WHERE transaction_type = 'expense' AND category != 'تحويل بين الخزائن'
           AND ${demoTtCond}
           AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const totalTechCommissions = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions
           WHERE transaction_type = 'tech_commission'
           AND ${demoTtCond}
           AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

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
       WHERE ${demoMtCond} AND date(created_at) BETWEEN ? AND ?`
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
       WHERE mt.remaining_amount > 0 AND mt.status != 'cancelled' AND ${demoMtAliasCond}
       ORDER BY mt.remaining_amount DESC`
    )
    .all() as Record<string, unknown>[]
  const customerReceivables = rawReceivables.map(normalizeTicketRow)
  const totalReceivables = roundMoney(
    customerReceivables.reduce((sum, t) => sum + t.remaining_amount, 0)
  )

  const totalPartsProfit = roundMoney(ticketAgg.totalPartsRevenue - ticketAgg.totalPartsCost)
  const netCashFlow = roundMoney(totalIncome - totalExpense - totalTechCommissions)

  // 4. Technician Statements
  const technicianStatements = db
    .prepare(
      `SELECT
        tech.id, tech.name, tech.phone, tech.specialty, tech.avatar_base64,
        tech.commission_rate, tech.base_salary,
        COALESCE((SELECT COUNT(*) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND ${demoMtAliasCond}
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as completed_tickets_count,
        COALESCE((SELECT SUM(mt.labor_cost + mt.inspection_fee) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND ${demoMtAliasCond}
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as period_labor_and_inspection,
        COALESCE((SELECT SUM(COALESCE(mt.commission_amount, (mt.labor_cost + mt.inspection_fee) * (COALESCE(mt.commission_rate, tech.commission_rate) / 100.0))) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND ${demoMtAliasCond}
          AND date(mt.created_at) BETWEEN ? AND ?), 0) as period_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'
          AND ${demoTtAliasCond}
          AND date(tt.created_at) BETWEEN ? AND ?), 0) as period_paid_commission,
        COALESCE((SELECT SUM(COALESCE(mt.commission_amount, (mt.labor_cost + mt.inspection_fee) * (COALESCE(mt.commission_rate, tech.commission_rate) / 100.0))) FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')
          AND ${demoMtAliasCond}), 0) as total_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'
          AND ${demoTtAliasCond}), 0) as total_paid_commission
       FROM technicians tech
       WHERE ${demoTechCond}
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
       WHERE ${demoMtCond} AND date(created_at) BETWEEN ? AND ?
       GROUP BY appliance_type
       ORDER BY count DESC LIMIT 10`
    )
    .all(from, to) as Array<{ appliance_type: string; count: number; revenue: number }>

  const topBrands = db
    .prepare(
      `SELECT brand, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
       FROM maintenance_tickets
       WHERE ${demoMtCond} AND date(created_at) BETWEEN ? AND ?
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
       WHERE ${demoTtAliasCond} AND date(tt.created_at) BETWEEN ? AND ?
       ORDER BY tt.id DESC`
    )
    .all(from, to) as TreasuryTransaction[]

  // 6. Phase 3W: Sales, Purchases, Suppliers & Inventory Valuation metrics
  const hasRealSalesTable = !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sales_invoices'")
    .get()

  let salesInvoicesCount = 0
  let totalSalesRevenue = 0
  let totalSalesCost = 0
  let totalSalesReturns = 0
  let totalPurchasesAmount = 0
  let salesReceivables: SalesInvoice[] = []
  let totalSalesReceivables = 0
  let prodCostVal = 0
  let prodSaleVal = 0
  let topProducts: Array<{
    product_name: string
    item_type: string
    qty: number
    revenue: number
    profit: number
  }> = []

  if (hasRealSalesTable) {
    const demoSiCond = getDemoCondWithBiz('si')
    const demoSiPlainCond = getDemoCondWithBiz()
    const demoPiCond = getDemoCondWithBiz()
    const demoProdCond = getDemoCondWithBiz()
    const demoRetCond = getDemoCondSimple()

    const salesAgg = db
      .prepare(
        `SELECT
          COUNT(DISTINCT si.id) as salesInvoicesCount,
          COALESCE(
            SUM(
              CASE
                WHEN si.status != 'cancelled' AND sitem.quantity > 0
                THEN (sitem.quantity - sitem.returned_qty)
                     * (sitem.unit_price - (sitem.discount * 1.0 / sitem.quantity))
                     * (CASE WHEN si.subtotal > 0 THEN MAX(0, (si.subtotal - si.discount) * 1.0 / si.subtotal) ELSE 1 END)
                ELSE 0
              END
            ),
            0
          ) as netSalesRevenue,
          COALESCE(
            SUM(
              CASE
                WHEN si.status != 'cancelled'
                THEN (sitem.quantity - sitem.returned_qty) * sitem.unit_cost
                ELSE 0
              END
            ),
            0
          ) as totalSalesCost
         FROM sales_invoices si
         LEFT JOIN sales_items sitem ON sitem.invoice_id = si.id
         WHERE si.status != 'cancelled' AND ${demoSiCond} AND date(si.created_at) BETWEEN ? AND ?`
      )
      .get(from, to) as {
      salesInvoicesCount: number
      netSalesRevenue: number
      totalSalesCost: number
    }

    salesInvoicesCount = salesAgg?.salesInvoicesCount || 0
    totalSalesRevenue = Math.max(0, roundMoney(salesAgg?.netSalesRevenue || 0))
    totalSalesCost = roundMoney(salesAgg?.totalSalesCost || 0)

    totalSalesReturns = roundMoney(
      (
        db
          .prepare(
            `SELECT COALESCE(SUM(total_return_amount), 0) as total FROM invoice_returns
             WHERE return_type = 'sales_return' AND ${demoRetCond} AND date(created_at) BETWEEN ? AND ?`
          )
          .get(from, to) as { total: number }
      ).total
    )

    totalPurchasesAmount = roundMoney(
      (
        db
          .prepare(
            `SELECT COALESCE(SUM(total_amount), 0) as total FROM purchase_invoices
             WHERE status != 'cancelled' AND ${demoPiCond} AND date(invoice_date) BETWEEN ? AND ?`
          )
          .get(from, to) as { total: number }
      ).total
    )

    const rawSalesReceivables = db
      .prepare(
        `SELECT * FROM sales_invoices
         WHERE remaining_amount > 0 AND status != 'cancelled' AND ${demoSiPlainCond}
         ORDER BY remaining_amount DESC`
      )
      .all() as Record<string, unknown>[]
    salesReceivables = rawSalesReceivables.map((r) => ({
      ...(r as unknown as SalesInvoice),
      subtotal: roundMoney(r.subtotal),
      discount: roundMoney(r.discount),
      trade_in_credit: roundMoney(r.trade_in_credit),
      total_amount: roundMoney(r.total_amount),
      paid_amount: roundMoney(r.paid_amount),
      remaining_amount: roundMoney(r.remaining_amount),
      returned_amount: roundMoney(r.returned_amount || 0),
      extra_data: parseJsonObject(r.extra_data)
    }))
    totalSalesReceivables = roundMoney(
      salesReceivables.reduce((sum, inv) => sum + inv.remaining_amount, 0)
    )

    const prodVal = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type != 'service' THEN qty * cost_price ELSE 0 END), 0) as costVal,
          COALESCE(SUM(CASE WHEN type != 'service' THEN qty * sale_price ELSE 0 END), 0) as saleVal
         FROM products WHERE is_active = 1 AND ${demoProdCond}`
      )
      .get() as { costVal: number; saleVal: number }
    prodCostVal = prodVal?.costVal || 0
    prodSaleVal = prodVal?.saleVal || 0

    topProducts = db
      .prepare(
        `SELECT
          sitem.product_name,
          sitem.item_type,
          COALESCE(SUM(sitem.quantity - sitem.returned_qty), 0) as qty,
          COALESCE(
            SUM(
              CASE WHEN sitem.quantity > 0
              THEN (sitem.quantity - sitem.returned_qty) * (sitem.unit_price - (sitem.discount * 1.0 / sitem.quantity))
                   * (CASE WHEN si.subtotal > 0 THEN MAX(0, (si.subtotal - si.discount) * 1.0 / si.subtotal) ELSE 1 END)
              ELSE 0 END
            ),
            0
          ) as revenue,
          COALESCE(
            SUM(
              (
                CASE WHEN sitem.quantity > 0
                THEN (sitem.quantity - sitem.returned_qty) * (sitem.unit_price - (sitem.discount * 1.0 / sitem.quantity))
                     * (CASE WHEN si.subtotal > 0 THEN MAX(0, (si.subtotal - si.discount) * 1.0 / si.subtotal) ELSE 1 END)
                ELSE 0 END
              ) - ((sitem.quantity - sitem.returned_qty) * sitem.unit_cost)
            ),
            0
          ) as profit
         FROM sales_items sitem
         JOIN sales_invoices si ON si.id = sitem.invoice_id
         WHERE si.status != 'cancelled' AND ${demoSiCond} AND (sitem.quantity - sitem.returned_qty) > 0
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
  }

  const totalSalesProfit = roundMoney(totalSalesRevenue - totalSalesCost)

  const totalExternalRepairCost = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(external_cost), 0) as total FROM maintenance_tickets
           WHERE status != 'cancelled' AND ${demoMtCond} AND date(created_at) BETWEEN ? AND ?`
        )
        .get(from, to) as { total: number }
    ).total
  )

  const supplierBalances = listSuppliers().filter((s) => Math.abs(s.balance) > 0.009)
  const totalSuppliersBalance = roundMoney(
    supplierBalances.reduce((sum, s) => sum + (s.balance > 0 ? s.balance : 0), 0)
  )

  const demoPartsCond = getDemoCondSimple()
  const partsVal = db
    .prepare(
      `SELECT
        COALESCE(SUM(quantity * purchase_price), 0) as costVal,
        COALESCE(SUM(quantity * selling_price), 0) as saleVal
       FROM spare_parts
       WHERE ${demoPartsCond}`
    )
    .get() as { costVal: number; saleVal: number }

  const inventoryCostValue = roundMoney(prodCostVal + (partsVal?.costVal || 0))
  const inventorySaleValue = roundMoney(prodSaleVal + (partsVal?.saleVal || 0))

  // Accrual Net Profit = Sales Profit + Maintenance Profit + Other Operating Income - Operating Expenses - Tech Commissions
  const { otherOperatingIncome, operatingExpenses } = getOperatingTreasurySummary(
    'date(created_at) BETWEEN ? AND ?',
    [from, to],
    demoTtCond
  )
  const netProfit = roundMoney(
    totalSalesProfit +
      ticketAgg.totalInspectionAndLabor +
      totalPartsProfit +
      otherOperatingIncome -
      operatingExpenses -
      totalTechCommissions
  )

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
      netCashFlow,
      ticketsCount: ticketAgg.ticketsCount,
      completedTicketsCount: ticketAgg.completedTicketsCount,
      totalReceivables,
      salesInvoicesCount,
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
