import { db } from './connection'
import { roundMoney, parseJsonObject, getLocalDateString } from './utils'
import { normalizeTicketRow } from './tickets'
import { normalizeProductRow } from './products'
import { listFollowups, listEarmoldOrders } from './audiology'
import { getBusinessState } from './business'
import { isDemoDataHidden } from './demo'
import type { DashboardStats, SparePart, SalesInvoice } from '../../shared/types'

export function getDashboardStats(): DashboardStats {
  const today = getLocalDateString()
  const monthPrefix = today.slice(0, 7) // YYYY-MM
  const bType = getBusinessState().type
  const dFilter = isDemoDataHidden()
    ? ' AND is_demo = 0'
    : ` AND (is_demo = 0 OR business_type = '${bType}' OR business_type IS NULL OR business_type = '')`
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
      .prepare(`SELECT COUNT(*) as cnt FROM spare_parts WHERE quantity <= min_quantity${dFilter}`)
      .get() as { cnt: number }
  ).cnt

  const todayIncome = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن' AND date(created_at) = ?${dFilter}`
      )
      .get(today) as { total: number }
  ).total

  const todayExpense = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type IN ('expense', 'tech_commission') AND category != 'تحويل بين الخزائن' AND date(created_at) = ?${dFilter}`
      )
      .get(today) as { total: number }
  ).total

  const monthIncome = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'income' AND category != 'تحويل بين الخزائن' AND strftime('%Y-%m', created_at) = ?${dFilter}`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthExpense = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'expense' AND category != 'تحويل بين الخزائن' AND strftime('%Y-%m', created_at) = ?${dFilter}`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthTechCommissions = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM treasury_transactions WHERE transaction_type = 'tech_commission' AND strftime('%Y-%m', created_at) = ?${dFilter}`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthPartsCost = (
    db
      .prepare(
        `SELECT COALESCE(SUM(parts_cost_total), 0) as total FROM maintenance_tickets WHERE status IN ('repaired', 'delivered') AND strftime('%Y-%m', created_at) = ?${dFilter}`
      )
      .get(monthPrefix) as { total: number }
  ).total

  const monthNetProfit = roundMoney(monthIncome - monthExpense - monthTechCommissions)

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
  const getPartsStmt = db.prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
  const recentTickets = rawRecentTickets.map((r) => {
    const t = normalizeTicketRow(r)
    t.parts = getPartsStmt.all(t.id) as any[]
    return t
  })
  const lowStockParts = db
    .prepare(`SELECT * FROM spare_parts WHERE quantity <= min_quantity${dFilter} ORDER BY quantity ASC LIMIT 8`)
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
      const todaySalesAgg = db
        .prepare(
          `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as rev
           FROM sales_invoices
           WHERE status != 'cancelled' AND date(created_at) = ?`
        )
        .get(today) as { cnt: number; rev: number }
      todaySalesCount = todaySalesAgg?.cnt || 0
      todaySalesRevenue = roundMoney(todaySalesAgg?.rev || 0)

      const monthSalesAgg = db
        .prepare(
          `SELECT
            COUNT(DISTINCT si.id) as cnt,
            COALESCE(SUM(CASE WHEN sitem.quantity > 0 THEN (sitem.quantity - sitem.returned_qty) * (sitem.unit_price - (sitem.discount / sitem.quantity)) ELSE 0 END), 0) as rev,
            COALESCE(SUM((sitem.quantity - sitem.returned_qty) * sitem.unit_cost), 0) as cost
           FROM sales_invoices si
           LEFT JOIN sales_items sitem ON sitem.invoice_id = si.id
           WHERE si.status != 'cancelled' AND strftime('%Y-%m', si.created_at) = ?`
        )
        .get(monthPrefix) as { cnt: number; rev: number; cost: number }
      const monthInvoiceDiscounts = (
        db
          .prepare(
            `SELECT COALESCE(SUM(discount), 0) as disc
             FROM sales_invoices
             WHERE status != 'cancelled' AND strftime('%Y-%m', created_at) = ?`
          )
          .get(monthPrefix) as { disc: number }
      )?.disc || 0
      monthSalesCount = monthSalesAgg?.cnt || 0
      monthSalesRevenue = roundMoney(Math.max(0, (monthSalesAgg?.rev || 0) - monthInvoiceDiscounts))
      monthSalesCost = roundMoney(monthSalesAgg?.cost || 0)
      monthSalesProfit = roundMoney(monthSalesRevenue - monthSalesCost)

      const lowStockProductsRaw = db
        .prepare(
          `SELECT * FROM products
           WHERE is_active = 1 AND type != 'service' AND qty <= min_stock
           ORDER BY qty ASC LIMIT 8`
        )
        .all() as Record<string, unknown>[]
      lowStockProducts = lowStockProductsRaw.map(normalizeProductRow)

      lowStockProductsCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM products WHERE is_active = 1 AND type != 'service' AND qty <= min_stock`
          )
          .get() as { cnt: number }
      ).cnt

      activeLoanersCount = (
        db
          .prepare(`SELECT COUNT(*) as cnt FROM product_serials WHERE status = 'loaned'`)
          .get() as { cnt: number }
      ).cnt

      const recentSalesRaw = db
        .prepare(`SELECT * FROM sales_invoices ORDER BY id DESC LIMIT 8`)
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
          .prepare(`SELECT COUNT(*) as cnt FROM followups WHERE status = 'pending' AND due_date = ?`)
          .get(today) as { cnt: number }
      ).cnt

      overdueFollowupsCount = (
        db
          .prepare(`SELECT COUNT(*) as cnt FROM followups WHERE status = 'pending' AND due_date < ?`)
          .get(today) as { cnt: number }
      ).cnt

      overdueEarmoldsCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM earmold_orders
             WHERE status = 'sent_to_lab' AND expected_date IS NOT NULL
               AND expected_date != '' AND expected_date < ?`
          )
          .get(today) as { cnt: number }
      ).cnt

      readyEarmoldsWaitingDeliveryCount = (
        db
          .prepare(`SELECT COUNT(*) as cnt FROM earmold_orders WHERE status = 'received'`)
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
    recentTickets,
    lowStockParts
  }
}
