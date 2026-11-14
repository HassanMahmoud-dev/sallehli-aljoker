import { db } from './connection'
import { roundMoney, parseJsonObject, getLocalDateString } from './utils'
import { normalizeTicketRow } from './tickets'
import { normalizeProductRow } from './products'
import { listFollowups, listEarmoldOrders } from './audiology'
import { getBusinessState } from './business'
import { isDemoDataHidden } from './demo'
import { getOperatingTreasurySummary } from './treasury'
import type {
  DashboardStats,
  SparePart,
  SalesInvoice,
  UpcomingDeliveryAlert
} from '../../shared/types'

function addDaysToIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function diffDaysIso(todayIso: string, targetIso: string): number {
  const t1 = new Date(todayIso + 'T00:00:00').getTime()
  const t2 = new Date(targetIso + 'T00:00:00').getTime()
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24))
}

export function getUpcomingDeliveries(daysAhead = 2): UpcomingDeliveryAlert[] {
  const today = getLocalDateString()
  const limitDate = addDaysToIso(today, daysAhead)
  const alerts: UpcomingDeliveryAlert[] = []
  const bType = getBusinessState().type
  const dFilter = isDemoDataHidden()
    ? ' AND is_demo = 0'
    : ` AND (is_demo = 0 OR business_type = '${bType}' OR business_type IS NULL OR business_type = '')`
  const simpleDemoFilter = isDemoDataHidden() ? ' AND is_demo = 0' : ''

  // 1. External repairs (sent_to_lab)
  try {
    const extRows = db
      .prepare(
        `SELECT id, ticket_number, customer_name, customer_phone, appliance_type, external_expected_date
         FROM maintenance_tickets
         WHERE status = 'sent_to_lab'
           AND external_expected_date IS NOT NULL
           AND external_expected_date != ''
           AND external_expected_date <= ?${dFilter}
         ORDER BY external_expected_date ASC`
      )
      .all(limitDate) as Array<{
      id: number
      ticket_number: string
      customer_name: string
      customer_phone: string
      appliance_type: string
      external_expected_date: string
    }>
    for (const r of extRows) {
      alerts.push({
        key: `external-${r.id}`,
        kind: 'external_repair',
        kindLabel: 'صيانة خارجية بالمعمل',
        customerName: r.customer_name,
        customerPhone: r.customer_phone || '',
        title: `${r.ticket_number} (${r.appliance_type})`,
        dueDate: r.external_expected_date,
        daysLeft: diffDaysIso(today, r.external_expected_date)
      })
    }
  } catch {
    // Ignore
  }

  // 2. Hearing aids specific: Earmolds, Followups, Sales Invoices expected_delivery_date
  if (bType === 'hearing_aids') {
    try {
      const earmoldRows = db
        .prepare(
          `SELECT eo.id, eo.order_number, eo.ear_side, eo.expected_date, c.name as customer_name, c.phone as customer_phone
           FROM earmold_orders eo
           LEFT JOIN customers c ON c.id = eo.customer_id
           WHERE eo.status = 'sent_to_lab'
             AND eo.expected_date IS NOT NULL
             AND eo.expected_date != ''
             AND eo.expected_date <= ?${isDemoDataHidden() ? ' AND eo.is_demo = 0' : ''}
           ORDER BY eo.expected_date ASC`
        )
        .all(limitDate) as Array<{
        id: number
        order_number: string
        ear_side: string
        expected_date: string
        customer_name: string
        customer_phone: string
      }>
      for (const r of earmoldRows) {
        alerts.push({
          key: `earmold-${r.id}`,
          kind: 'earmold',
          kindLabel: 'قالب أذن بالمعمل',
          customerName: r.customer_name || 'عميل',
          customerPhone: r.customer_phone || '',
          title: `${r.order_number} (${r.ear_side || 'قالب'})`,
          dueDate: r.expected_date,
          daysLeft: diffDaysIso(today, r.expected_date)
        })
      }
    } catch {
      // Ignore
    }

    try {
      const followupRows = db
        .prepare(
          `SELECT f.id, f.title, f.due_date, c.name as customer_name, c.phone as customer_phone
           FROM followups f
           LEFT JOIN customers c ON c.id = f.customer_id
           WHERE f.status = 'pending'
             AND f.due_date IS NOT NULL
             AND f.due_date != ''
             AND f.due_date <= ?${simpleDemoFilter.replace('is_demo', 'f.is_demo')}
           ORDER BY f.due_date ASC`
        )
        .all(limitDate) as Array<{
        id: number
        title: string
        due_date: string
        customer_name: string
        customer_phone: string
      }>
      for (const r of followupRows) {
        alerts.push({
          key: `followup-${r.id}`,
          kind: 'followup',
          kindLabel: 'موعد متابعة / ضبط',
          customerName: r.customer_name || 'عميل',
          customerPhone: r.customer_phone || '',
          title: r.title || 'جلسة متابعة',
          dueDate: r.due_date,
          daysLeft: diffDaysIso(today, r.due_date)
        })
      }
    } catch {
      // Ignore
    }

    try {
      const saleRows = db
        .prepare(
          `SELECT id, invoice_number, customer_name, customer_phone, expected_delivery_date
           FROM sales_invoices
           WHERE status != 'cancelled'
             AND expected_delivery_date IS NOT NULL
             AND expected_delivery_date != ''
             AND expected_delivery_date >= ?
             AND expected_delivery_date <= ?${dFilter}
           ORDER BY expected_delivery_date ASC`
        )
        .all(today, limitDate) as Array<{
        id: number
        invoice_number: string
        customer_name: string
        customer_phone: string
        expected_delivery_date: string
      }>
      for (const r of saleRows) {
        alerts.push({
          key: `sale-${r.id}`,
          kind: 'sale',
          kindLabel: 'تسليم طلبية سماعة',
          customerName: r.customer_name || 'عميل',
          customerPhone: r.customer_phone || '',
          title: `فاتورة ${r.invoice_number}`,
          dueDate: r.expected_delivery_date,
          daysLeft: diffDaysIso(today, r.expected_delivery_date)
        })
      }
    } catch {
      // Ignore
    }
  }

  return alerts.sort((a, b) => a.daysLeft - b.daysLeft)
}

export function getDashboardStats(): DashboardStats {
  const today = getLocalDateString()
  const monthPrefix = today.slice(0, 7) // YYYY-MM
  const bType = getBusinessState().type
  const dFilter = isDemoDataHidden()
    ? ' AND is_demo = 0'
    : ` AND (is_demo = 0 OR business_type = '${bType}' OR business_type IS NULL OR business_type = '')`
  const spareDemoFilter = isDemoDataHidden() ? ' AND is_demo = 0' : ''
  const simpleDemoFilter = spareDemoFilter
  const dMtWhere = isDemoDataHidden()
    ? ' WHERE mt.is_demo = 0'
    : ` WHERE (mt.is_demo = 0 OR mt.business_type = '${bType}' OR mt.business_type IS NULL OR mt.business_type = '')`

  const totalTicketsToday = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE date(created_at) = ?${dFilter}`)
      .get(today) as { cnt: number }
  ).cnt

  const openTicketsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status NOT IN ('delivered', 'cancelled')${dFilter}`
      )
      .get() as { cnt: number }
  ).cnt

  const homeVisitsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE service_type = 'home_visit' AND status NOT IN ('delivered', 'cancelled')${dFilter}`
      )
      .get() as { cnt: number }
  ).cnt

  const workshopCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE service_type = 'workshop' AND status NOT IN ('delivered', 'cancelled')${dFilter}`
      )
      .get() as { cnt: number }
  ).cnt

  const repairedWaitingDeliveryCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status = 'repaired'${dFilter}`)
      .get() as { cnt: number }
  ).cnt

  const activeWarrantyClaimsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE (priority = 'warranty_return' OR is_under_previous_warranty = 1) AND status NOT IN ('delivered', 'cancelled')${dFilter}`
      )
      .get() as { cnt: number }
  ).cnt

  const lowStockPartsCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM spare_parts WHERE quantity <= min_quantity${spareDemoFilter}`)
      .get() as { cnt: number }
  ).cnt

  const todayIncome = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن' AND date(created_at) = ?${dFilter}`
      )
      .get(today) as { total: number }
  ).total

  const todayExpense = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'expense' AND category != 'تحويل بين الخزائن' AND date(created_at) = ?${dFilter}`
        )
        .get(today) as { total: number }
    ).total
  )

  const monthIncome = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن' AND strftime('%Y-%m', created_at) = ?${dFilter}`
        )
        .get(monthPrefix) as { total: number }
    ).total
  )

  const monthExpense = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'expense' AND category != 'تحويل بين الخزائن' AND strftime('%Y-%m', created_at) = ?${dFilter}`
        )
        .get(monthPrefix) as { total: number }
    ).total
  )

  const monthTechCommissions = roundMoney(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'tech_commission' AND strftime('%Y-%m', created_at) = ?${dFilter}`
        )
        .get(monthPrefix) as { total: number }
    ).total
  )

  const monthTicketAgg = db
    .prepare(
      `SELECT
        COALESCE(SUM(parts_cost_total), 0) as partsCost,
        COALESCE(SUM(inspection_fee + labor_cost + parts_total - discount - parts_cost_total), 0) as ticketProfit
       FROM maintenance_tickets
       WHERE status IN ('repaired', 'delivered') AND strftime('%Y-%m', created_at) = ?${dFilter}`
    )
    .get(monthPrefix) as { partsCost: number; ticketProfit: number }

  const monthPartsCost = roundMoney(monthTicketAgg?.partsCost || 0)
  const monthTicketProfit = roundMoney(monthTicketAgg?.ticketProfit || 0)

  const rawRecentTickets = db
    .prepare(
      `SELECT
         mt.id, mt.ticket_number, mt.customer_id, mt.customer_name, mt.customer_phone,
         mt.customer_phone2, mt.customer_area, mt.customer_address, mt.appliance_id,
         mt.appliance_type, mt.brand, mt.model, mt.serial_number, mt.service_type,
         mt.status, mt.priority, mt.complaint, mt.diagnosis, mt.technician_id,
         mt.scheduled_date, mt.inspection_fee, mt.labor_cost, mt.parts_total,
         mt.parts_cost_total, mt.discount, mt.total_amount, mt.paid_amount,
         mt.remaining_amount, mt.payment_method, mt.warranty_months,
         mt.warranty_start_date, mt.warranty_end_date, mt.is_under_previous_warranty,
         mt.previous_ticket_number, mt.notes, mt.completed_at, mt.delivered_at,
         mt.created_at, mt.updated_at, t.name as technician_name
       FROM maintenance_tickets mt
       LEFT JOIN technicians t ON t.id = mt.technician_id
       ${dMtWhere}
       ORDER BY mt.id DESC LIMIT 8`
    )
    .all() as Record<string, unknown>[]
  const getPartsStmt = db.prepare(
    'SELECT * FROM ticket_parts WHERE ticket_id = ? AND COALESCE(is_restored, 0) = 0 ORDER BY id ASC'
  )
  const recentTickets = rawRecentTickets.map((r) => {
    const t = normalizeTicketRow(r)
    t.parts = getPartsStmt.all(t.id) as any[]
    return t
  })
  const lowStockParts = db
    .prepare(
      `SELECT * FROM spare_parts WHERE quantity <= min_quantity${spareDemoFilter} ORDER BY quantity ASC LIMIT 8`
    )
    .all() as SparePart[]

  const externalRepairOpenCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM maintenance_tickets WHERE status = 'sent_to_lab'${dFilter}`)
      .get() as { cnt: number }
  ).cnt

  const externalRepairOverdueCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM maintenance_tickets
         WHERE status = 'sent_to_lab' AND external_expected_date IS NOT NULL
           AND external_expected_date != '' AND external_expected_date < ?${dFilter}`
      )
      .get(today) as { cnt: number }
  ).cnt

  const isHearingAids = getBusinessState().type === 'hearing_aids'

  // Hearing Aids specific metrics (Sales, Products, Audiology)
  let todaySalesCount = 0
  let todaySalesRevenue = 0
  let monthSalesCount = 0
  let monthSalesRevenue = 0
  let monthSalesCost = 0
  let monthSalesProfit = 0
  let lowStockProducts: any[] = []
  let lowStockProductsCount = 0
  let activeLoanersCount = 0
  let recentSales: SalesInvoice[] = []
  let dueFollowupsTodayCount = 0
  let overdueFollowupsCount = 0
  let overdueEarmoldsCount = 0
  let readyEarmoldsWaitingDeliveryCount = 0
  let upcomingFollowups: any[] = []
  let activeEarmoldAlerts: any[] = []

  if (isHearingAids) {
    try {
      const siFilter = isDemoDataHidden()
        ? ' AND si.is_demo = 0'
        : ` AND (si.is_demo = 0 OR si.business_type = '${bType}' OR si.business_type IS NULL OR si.business_type = '')`

      const todaySalesAgg = db
        .prepare(
          `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as rev
           FROM sales_invoices
           WHERE status != 'cancelled' AND date(created_at) = ?${dFilter}`
        )
        .get(today) as { cnt: number; rev: number }
      todaySalesCount = todaySalesAgg?.cnt || 0
      todaySalesRevenue = roundMoney(todaySalesAgg?.rev || 0)

      const monthSalesAgg = db
        .prepare(
          `SELECT
            COUNT(DISTINCT si.id) as cnt,
            COALESCE(
              SUM(
                CASE
                  WHEN sitem.quantity > 0
                  THEN (sitem.quantity - sitem.returned_qty)
                       * (sitem.unit_price - (sitem.discount * 1.0 / sitem.quantity))
                       * (CASE WHEN si.subtotal > 0 THEN MAX(0, (si.subtotal - si.discount) * 1.0 / si.subtotal) ELSE 1 END)
                  ELSE 0
                END
              ),
              0
            ) as rev,
            COALESCE(SUM((sitem.quantity - sitem.returned_qty) * sitem.unit_cost), 0) as cost
           FROM sales_invoices si
           LEFT JOIN sales_items sitem ON sitem.invoice_id = si.id
           WHERE si.status != 'cancelled' AND strftime('%Y-%m', si.created_at) = ?${siFilter}`
        )
        .get(monthPrefix) as { cnt: number; rev: number; cost: number }
      monthSalesCount = monthSalesAgg?.cnt || 0
      monthSalesRevenue = roundMoney(Math.max(0, monthSalesAgg?.rev || 0))
      monthSalesCost = roundMoney(monthSalesAgg?.cost || 0)
      monthSalesProfit = roundMoney(monthSalesRevenue - monthSalesCost)

      const lowStockProductsRaw = db
        .prepare(
          `SELECT * FROM products
           WHERE is_active = 1 AND type != 'service' AND qty <= min_stock${dFilter}
           ORDER BY qty ASC LIMIT 8`
        )
        .all() as Record<string, unknown>[]
      lowStockProducts = lowStockProductsRaw.map(normalizeProductRow)

      lowStockProductsCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM products WHERE is_active = 1 AND type != 'service' AND qty <= min_stock${dFilter}`
          )
          .get() as { cnt: number }
      ).cnt

      activeLoanersCount = (
        db
          .prepare(`SELECT COUNT(*) as cnt FROM product_serials WHERE status = 'loaned'${simpleDemoFilter}`)
          .get() as { cnt: number }
      ).cnt

      const recentSalesRaw = db
        .prepare(`SELECT * FROM sales_invoices WHERE 1=1${dFilter} ORDER BY id DESC LIMIT 8`)
        .all() as Record<string, unknown>[]
      recentSales = recentSalesRaw.map((r) => ({
        ...(r as unknown as SalesInvoice),
        subtotal: roundMoney(r.subtotal),
        discount: roundMoney(r.discount),
        trade_in_credit: roundMoney(r.trade_in_credit),
        total_amount: roundMoney(r.total_amount),
        paid_amount: roundMoney(r.paid_amount),
        remaining_amount: roundMoney(r.remaining_amount),
        extra_data: parseJsonObject(r.extra_data)
      }))

      dueFollowupsTodayCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM followups WHERE status = 'pending' AND due_date = ?${simpleDemoFilter}`
          )
          .get(today) as { cnt: number }
      ).cnt

      overdueFollowupsCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM followups WHERE status = 'pending' AND due_date < ?${simpleDemoFilter}`
          )
          .get(today) as { cnt: number }
      ).cnt

      overdueEarmoldsCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM earmold_orders
             WHERE status = 'sent_to_lab' AND expected_date IS NOT NULL
               AND expected_date != '' AND expected_date < ?${simpleDemoFilter}`
          )
          .get(today) as { cnt: number }
      ).cnt

      readyEarmoldsWaitingDeliveryCount = (
        db
          .prepare(`SELECT COUNT(*) as cnt FROM earmold_orders WHERE status = 'received'${simpleDemoFilter}`)
          .get() as { cnt: number }
      ).cnt

      upcomingFollowups = listFollowups({ status: 'pending' }).slice(0, 6)
      activeEarmoldAlerts = listEarmoldOrders({}).filter(
        (m) =>
          m.status === 'received' ||
          (m.status === 'sent_to_lab' && m.expected_date && m.expected_date < today)
      ).slice(0, 6)
    } catch {
      // Ignore if hearing aids tables are not present
    }
  }

  const demoTtCond = dFilter.replace(/^\s*AND\s+/i, '')
  const { otherOperatingIncome: monthOtherIncome, operatingExpenses: monthOperatingExpenses } =
    getOperatingTreasurySummary("strftime('%Y-%m', created_at) = ?", [monthPrefix], demoTtCond)
  const monthNetProfit = roundMoney(
    monthSalesProfit +
      monthTicketProfit +
      monthOtherIncome -
      monthOperatingExpenses -
      monthTechCommissions
  )

  const todayDeliveriesAgg = db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total_cost), 0) as total
       FROM maintenance_tickets
       WHERE status = 'delivered' AND date(delivered_at) = ?${dFilter}`
    )
    .get(today) as { cnt: number; total: number }

  const monthWarrantyReturnsAgg = db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(parts_cost_total), 0) as total
       FROM maintenance_tickets
       WHERE (priority = 'warranty_return' OR is_under_previous_warranty = 1)
         AND status != 'cancelled'
         AND strftime('%Y-%m', created_at) = ?${dFilter}`
    )
    .get(monthPrefix) as { cnt: number; total: number }

  let monthSalesReturnsCount = 0
  let monthSalesReturnsTotal = 0
  try {
    const srAgg = db
      .prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(total_refund), 0) as total
         FROM sales_returns
         WHERE strftime('%Y-%m', created_at) = ?${dFilter}`
      )
      .get(monthPrefix) as { cnt: number; total: number }
    monthSalesReturnsCount = Number(srAgg?.cnt || 0)
    monthSalesReturnsTotal = Number(srAgg?.total || 0)
  } catch {
    // Ignore if sales_returns table does not exist in this profile
  }

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
    monthNetProfit,
    todayDeliveriesCount: Number(todayDeliveriesAgg?.cnt || 0),
    todayDeliveriesTotal: roundMoney(Number(todayDeliveriesAgg?.total || 0)),
    monthReturnsCount: Number(monthWarrantyReturnsAgg?.cnt || 0) + monthSalesReturnsCount,
    monthReturnsAmount: roundMoney(
      Number(monthWarrantyReturnsAgg?.total || 0) + monthSalesReturnsTotal
    ),
    todaySalesCount,
    todaySalesRevenue,
    monthSalesCount,
    monthSalesRevenue,
    monthSalesCost,
    monthSalesProfit,
    lowStockProductsCount,
    lowStockProducts,
    externalRepairOpenCount,
    externalRepairOverdueCount,
    activeLoanersCount,
    recentSales,
    dueFollowupsTodayCount,
    overdueFollowupsCount,
    overdueEarmoldsCount,
    readyEarmoldsWaitingDeliveryCount,
    upcomingFollowups,
    activeEarmoldAlerts,
    upcomingDeliveries: getUpcomingDeliveries(2),
    recentTickets,
    lowStockParts
  }
}
