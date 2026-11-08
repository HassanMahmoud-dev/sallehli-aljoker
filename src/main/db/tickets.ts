import { db, runTransaction } from './connection'
import {
  roundMoney,
  parseJsonObject,
  parseJsonArray,
  stringifyExtraData,
  getLocalDateString,
  getLocalDateTimeString,
  generateNextNumber
} from './utils'
import type { MaintenanceTicket, TicketPartItem, ProductSerial, Product, ProductVariant, SparePart, SalesInvoice, Customer } from '../../shared/types'
import type { SessionInfo } from '../session'
import { normalizeProductRow, syncProductQtyFromChildren } from './products'
import { getSalesInvoiceById } from './sales'
import { normalizeCustomerRow } from './customers'
import { isDemoDataHidden } from './demo'

export function normalizeTicketRow(row: Record<string, unknown>): MaintenanceTicket {
  return {
    ...(row as unknown as MaintenanceTicket),
    warranty_image: String(row.warranty_image || ''),
    fault_images: parseJsonArray(row.fault_images),
    extra_data: parseJsonObject(row.extra_data)
  }
}

export function updateTicketImages(payload: {
  ticketId: number
  warranty_image?: string
  fault_images?: string[]
}): MaintenanceTicket {
  const faultImagesJson = JSON.stringify(
    Array.isArray(payload.fault_images) ? payload.fault_images : []
  )
  const warrantyImg = payload.warranty_image || ''

  db.prepare(
    `UPDATE maintenance_tickets
     SET warranty_image = ?, fault_images = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(warrantyImg, faultImagesJson, payload.ticketId)

  const raw = db
    .prepare(
      `SELECT mt.*, t.name as technician_name
       FROM maintenance_tickets mt
       LEFT JOIN technicians t ON t.id = mt.technician_id
       WHERE mt.id = ?`
    )
    .get(payload.ticketId) as Record<string, unknown>

  const ticket = normalizeTicketRow(raw)

  // Also sync to matching customer_appliances record if present
  if (ticket.customer_id && ticket.appliance_type && ticket.brand) {
    db.prepare(
      `UPDATE customer_appliances
       SET warranty_image = CASE WHEN ? != '' THEN ? ELSE warranty_image END,
           fault_images = CASE WHEN ? != '[]' THEN ? ELSE fault_images END
       WHERE customer_id = ? AND appliance_type = ? AND brand = ?`
    ).run(
      warrantyImg,
      warrantyImg,
      faultImagesJson,
      faultImagesJson,
      ticket.customer_id,
      ticket.appliance_type,
      ticket.brand
    )
  }

  return ticket
}

// ==========================================
// 3. TECHNICIANS
// ==========================================

function generateNextTicketNumber(): string {
  const year = new Date().getFullYear()
  return generateNextNumber(db, 'maintenance_tickets', 'ticket_number', `SJ-${year}-`, 4)
}

export function getTicketById(id: number): MaintenanceTicket | undefined {
  const raw = db
    .prepare(
      `SELECT mt.*, t.name as technician_name
       FROM maintenance_tickets mt
       LEFT JOIN technicians t ON t.id = mt.technician_id
       WHERE mt.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined
  if (!raw) return undefined
  const ticket = normalizeTicketRow(raw)
  ticket.parts = db
    .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
    .all(ticket.id) as TicketPartItem[]
  return ticket
}

export function listTickets(filters?: {
  search?: string
  status?: string
  service_type?: string
  technician_id?: number | null
}): MaintenanceTicket[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT mt.*, t.name as technician_name
    FROM maintenance_tickets mt
    LEFT JOIN technicians t ON t.id = mt.technician_id
    WHERE (
      mt.ticket_number LIKE ? OR
      mt.customer_name LIKE ? OR
      mt.customer_phone LIKE ? OR
      mt.appliance_type LIKE ? OR
      mt.brand LIKE ? OR
      mt.serial_number LIKE ? OR
      mt.extra_data LIKE ?
    )
  `
  const params: unknown[] = [q, q, q, q, q, q, q]

  if (filters?.status && filters.status !== 'all') {
    sql += ' AND mt.status = ?'
    params.push(filters.status)
  }
  if (filters?.service_type && filters.service_type !== 'all') {
    sql += ' AND mt.service_type = ?'
    params.push(filters.service_type)
  }
  if (filters?.technician_id) {
    sql += ' AND mt.technician_id = ?'
    params.push(filters.technician_id)
  }

  if (isDemoDataHidden()) {
    sql += ' AND mt.is_demo = 0'
  }

  sql += ' ORDER BY mt.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const rows = rawRows.map(normalizeTicketRow)

  const getPartsStmt = db.prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
  for (const row of rows) {
    row.parts = getPartsStmt.all(row.id) as TicketPartItem[]
  }
  return rows
}

export function saveTicket(
  data: Partial<MaintenanceTicket> & { parts?: TicketPartItem[]; recordPaymentInTreasury?: boolean },
  callerSession?: SessionInfo | null
): MaintenanceTicket {
  return runTransaction(() => {
    const createdById = callerSession?.userId || null
    const createdByName = callerSession?.full_name || callerSession?.username || ''
    // 1. Ensure Customer exists or update customer
    let customerId = data.customer_id
    if (!customerId) {
      const existingCust = db
        .prepare('SELECT id FROM customers WHERE phone = ? LIMIT 1')
        .get(data.customer_phone?.trim() || '') as { id: number } | undefined

      if (existingCust) {
        customerId = existingCust.id
        db.prepare(
          `UPDATE customers SET
             name = COALESCE(NULLIF(?, ''), name),
             phone2 = COALESCE(NULLIF(?, ''), phone2),
             area = COALESCE(NULLIF(?, ''), area),
             address = COALESCE(NULLIF(?, ''), address)
           WHERE id = ?`
        ).run(
          data.customer_name?.trim() || '',
          data.customer_phone2?.trim() || '',
          data.customer_area?.trim() || '',
          data.customer_address?.trim() || '',
          customerId
        )
      } else {
        const custInfo = db
          .prepare(
            'INSERT INTO customers (name, phone, phone2, area, address) VALUES (?, ?, ?, ?, ?)'
          )
          .run(
            data.customer_name?.trim(),
            data.customer_phone?.trim(),
            data.customer_phone2?.trim() || '',
            data.customer_area?.trim() || '',
            data.customer_address?.trim() || ''
          )
        customerId = Number(custInfo.lastInsertRowid)
      }
    }

    // 2. Calculate Parts Totals
    const parts = data.parts || []
    let partsSellingTotal = 0
    let partsCostTotal = 0
    for (const p of parts) {
      const qty = Number(p.quantity || 1)
      const uPrice = Number(p.unit_price || 0)
      const uCost = Number(p.unit_cost || 0)
      partsSellingTotal += qty * uPrice
      partsCostTotal += qty * uCost
    }

    const inspectionFee = Number(data.inspection_fee ?? 0)
    const laborCost = Number(data.labor_cost ?? 0)
    const discount = Number(data.discount ?? 0)
    const totalAmount = Math.max(0, inspectionFee + laborCost + partsSellingTotal - discount)
    const paidAmount = Number(data.paid_amount ?? 0)
    const remainingAmount = Math.max(0, totalAmount - paidAmount)

    // 3. Calculate Warranty Dates if status is repaired or delivered
    const warrantyMonths = Number(data.warranty_months ?? 0)
    let warrantyStart = data.warranty_start_date || null
    let warrantyEnd = data.warranty_end_date || null

    if ((data.status === 'repaired' || data.status === 'delivered') && warrantyMonths > 0) {
      if (!warrantyStart) {
        warrantyStart = getLocalDateString()
      }
      const d = new Date(`${warrantyStart}T00:00:00`)
      d.setMonth(d.getMonth() + warrantyMonths)
      warrantyEnd = getLocalDateString(d)
    } else if (warrantyMonths === 0) {
      warrantyStart = null
      warrantyEnd = null
    }

    const warrantyImg = data.warranty_image || ''
    const faultImagesJson = JSON.stringify(Array.isArray(data.fault_images) ? data.fault_images : [])
    const extraDataJson = stringifyExtraData(data.extra_data)

    let ticketId = data.id
    let ticketNumber = data.ticket_number || ''
    let previousPaid = 0
    let previousExternalCost = 0
    let previousLoanerSerialId: number | null = null
    let previousProductSerialId: number | null = null

    const salesInvoiceId = data.sales_invoice_id ? Number(data.sales_invoice_id) : null
    const productSerialId = data.product_serial_id ? Number(data.product_serial_id) : null
    const isExternalRepair =
      data.is_external_repair ||
      data.status === 'sent_to_lab' ||
      data.status === 'returned_from_lab'
        ? 1
        : 0
    const externalVendor = data.external_vendor?.trim() || ''
    const externalSentDate =
      data.external_sent_date ||
      (data.status === 'sent_to_lab' ? getLocalDateString() : null)
    const externalExpectedDate = data.external_expected_date || null
    const externalReturnedDate =
      data.external_returned_date ||
      (data.status === 'returned_from_lab' ? getLocalDateString() : null)
    const externalCost = roundMoney(data.external_cost ?? 0)
    const externalTrackingNo = data.external_tracking_no?.trim() || ''

    const loanerSerialId = data.loaner_serial_id ? Number(data.loaner_serial_id) : null
    let loanerSerialNo = data.loaner_serial_no?.trim() || ''
    let loanerProductName = data.loaner_product_name?.trim() || ''
    if (loanerSerialId && (!loanerSerialNo || !loanerProductName)) {
      const lRow = db
        .prepare(
          `SELECT ps.serial_no, p.name as product_name
           FROM product_serials ps
           JOIN products p ON p.id = ps.product_id
           WHERE ps.id = ?`
        )
        .get(loanerSerialId) as { serial_no: string; product_name: string } | undefined
      if (lRow) {
        loanerSerialNo = lRow.serial_no
        loanerProductName = lRow.product_name
      }
    }
    const loanerHandedAt =
      data.loaner_handed_at ||
      (loanerSerialId ? getLocalDateTimeString() : null)
    const loanerReturnedAt = data.loaner_returned_at || null

    if (ticketId) {
      const oldTicket = db
        .prepare(
          'SELECT paid_amount, ticket_number, external_cost, loaner_serial_id, product_serial_id FROM maintenance_tickets WHERE id = ?'
        )
        .get(ticketId) as
        | {
            paid_amount: number
            ticket_number: string
            external_cost?: number
            loaner_serial_id?: number | null
            product_serial_id?: number | null
          }
        | undefined
      previousPaid = oldTicket?.paid_amount ?? 0
      previousExternalCost = Number(oldTicket?.external_cost ?? 0)
      previousLoanerSerialId = oldTicket?.loaner_serial_id ? Number(oldTicket.loaner_serial_id) : null
      previousProductSerialId = oldTicket?.product_serial_id ? Number(oldTicket.product_serial_id) : null
      ticketNumber = oldTicket?.ticket_number || ticketNumber

      // Restore old ticket parts to stock before applying updated parts
      const oldParts = db
        .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
        .all(ticketId) as TicketPartItem[]
      for (const op of oldParts) {
        if (op.product_id) {
          const packSz = Math.max(1, Number(op.pack_size || 1))
          const pieces = op.unit === 'pack' ? Number(op.quantity || 1) * packSz : Number(op.quantity || 1)
          if (op.variant_id) {
            db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
              pieces,
              op.variant_id
            )
            syncProductQtyFromChildren(op.product_id)
          } else {
            db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(pieces, op.product_id)
          }
        } else if (op.part_id) {
          db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(
            op.quantity,
            op.part_id
          )
        }
      }
      db.prepare('DELETE FROM ticket_parts WHERE ticket_id = ?').run(ticketId)

      let commissionRate: number | null = null
      let commissionAmount: number | null = null
      if (data.technician_id && (data.status === 'repaired' || data.status === 'delivered')) {
        const existingComm = db
          .prepare('SELECT commission_rate FROM maintenance_tickets WHERE id = ?')
          .get(ticketId) as { commission_rate?: number | null } | undefined
        if (existingComm?.commission_rate !== null && existingComm?.commission_rate !== undefined) {
          commissionRate = Number(existingComm.commission_rate)
        } else {
          const techRow = db
            .prepare('SELECT commission_rate FROM technicians WHERE id = ?')
            .get(data.technician_id) as { commission_rate: number } | undefined
          if (techRow) {
            commissionRate = Number(techRow.commission_rate ?? 0)
          }
        }
        if (commissionRate !== null) {
          commissionAmount = roundMoney((laborCost + inspectionFee) * (commissionRate / 100.0))
        }
      }

      db.prepare(
        `UPDATE maintenance_tickets SET
          customer_id = ?, customer_name = ?, customer_phone = ?, customer_phone2 = ?,
          customer_area = ?, customer_address = ?, appliance_type = ?, brand = ?, model = ?,
          serial_number = ?, service_type = ?, status = ?, priority = ?, complaint = ?,
          diagnosis = ?, technician_id = ?, scheduled_date = ?, inspection_fee = ?,
          labor_cost = ?, parts_total = ?, parts_cost_total = ?, discount = ?,
          total_amount = ?, paid_amount = ?, remaining_amount = ?, payment_method = ?,
          warranty_months = ?, warranty_start_date = ?, warranty_end_date = ?,
          is_under_previous_warranty = ?, previous_ticket_number = ?,
          warranty_image = ?, fault_images = ?, extra_data = ?, notes = ?,
          sales_invoice_id = ?, product_serial_id = ?, is_external_repair = ?,
          external_vendor = ?, external_sent_date = ?, external_expected_date = ?,
          external_returned_date = ?, external_cost = ?, external_tracking_no = ?,
          loaner_serial_id = ?, loaner_serial_no = ?, loaner_product_name = ?,
          loaner_handed_at = ?, loaner_returned_at = ?,
          commission_rate = COALESCE(?, commission_rate),
          commission_amount = COALESCE(?, commission_amount),
          completed_at = CASE WHEN ? IN ('repaired', 'delivered') AND completed_at IS NULL THEN datetime('now', 'localtime') ELSE completed_at END,
          delivered_at = CASE WHEN ? = 'delivered' AND delivered_at IS NULL THEN datetime('now', 'localtime') ELSE delivered_at END,
          updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).run(
        customerId,
        data.customer_name?.trim(),
        data.customer_phone?.trim(),
        data.customer_phone2?.trim() || '',
        data.customer_area?.trim() || '',
        data.customer_address?.trim() || '',
        data.appliance_type?.trim(),
        data.brand?.trim(),
        data.model?.trim() || '',
        data.serial_number?.trim() || '',
        data.service_type || 'home_visit',
        data.status || 'new',
        data.priority || 'normal',
        data.complaint?.trim() || '',
        data.diagnosis?.trim() || '',
        data.technician_id || null,
        data.scheduled_date || getLocalDateString(),
        inspectionFee,
        laborCost,
        partsSellingTotal,
        partsCostTotal,
        discount,
        totalAmount,
        paidAmount,
        remainingAmount,
        data.payment_method || 'cash',
        warrantyMonths,
        warrantyStart,
        warrantyEnd,
        data.is_under_previous_warranty ? 1 : 0,
        data.previous_ticket_number || null,
        warrantyImg,
        faultImagesJson,
        extraDataJson,
        data.notes?.trim() || '',
        salesInvoiceId,
        productSerialId,
        isExternalRepair,
        externalVendor,
        externalSentDate,
        externalExpectedDate,
        externalReturnedDate,
        externalCost,
        externalTrackingNo,
        loanerSerialId,
        loanerSerialNo,
        loanerProductName,
        loanerHandedAt,
        loanerReturnedAt,
        commissionRate,
        commissionAmount,
        data.status || 'new',
        data.status || 'new',
        ticketId
      )
    } else {
      ticketNumber = generateNextTicketNumber()
      let commissionRate: number | null = null
      let commissionAmount: number | null = null
      if (data.technician_id && (data.status === 'repaired' || data.status === 'delivered')) {
        const techRow = db
          .prepare('SELECT commission_rate FROM technicians WHERE id = ?')
          .get(data.technician_id) as { commission_rate: number } | undefined
        if (techRow) {
          commissionRate = Number(techRow.commission_rate ?? 0)
          commissionAmount = roundMoney((laborCost + inspectionFee) * (commissionRate / 100.0))
        }
      }

      const info = db
        .prepare(
          `INSERT INTO maintenance_tickets (
            ticket_number, customer_id, customer_name, customer_phone, customer_phone2,
            customer_area, customer_address, appliance_type, brand, model, serial_number,
            service_type, status, priority, complaint, diagnosis, technician_id, scheduled_date,
            inspection_fee, labor_cost, parts_total, parts_cost_total, discount, total_amount,
            paid_amount, remaining_amount, payment_method, warranty_months,
            warranty_start_date, warranty_end_date, is_under_previous_warranty, previous_ticket_number,
            warranty_image, fault_images, extra_data, notes,
            sales_invoice_id, product_serial_id, is_external_repair,
            external_vendor, external_sent_date, external_expected_date,
            external_returned_date, external_cost, external_tracking_no,
            loaner_serial_id, loaner_serial_no, loaner_product_name,
            loaner_handed_at, loaner_returned_at,
            commission_rate, commission_amount, created_by_id, created_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ticketNumber,
          customerId,
          data.customer_name?.trim(),
          data.customer_phone?.trim(),
          data.customer_phone2?.trim() || '',
          data.customer_area?.trim() || '',
          data.customer_address?.trim() || '',
          data.appliance_type?.trim(),
          data.brand?.trim(),
          data.model?.trim() || '',
          data.serial_number?.trim() || '',
          data.service_type || 'home_visit',
          data.status || 'new',
          data.priority || 'normal',
          data.complaint?.trim() || '',
          data.diagnosis?.trim() || '',
          data.technician_id || null,
          data.scheduled_date || getLocalDateString(),
          inspectionFee,
          laborCost,
          partsSellingTotal,
          partsCostTotal,
          discount,
          totalAmount,
          paidAmount,
          remainingAmount,
          data.payment_method || 'cash',
          warrantyMonths,
          warrantyStart,
          warrantyEnd,
          data.is_under_previous_warranty ? 1 : 0,
          data.previous_ticket_number || null,
          warrantyImg,
          faultImagesJson,
          extraDataJson,
          data.notes?.trim() || '',
          salesInvoiceId,
          productSerialId,
          isExternalRepair,
          externalVendor,
          externalSentDate,
          externalExpectedDate,
          externalReturnedDate,
          externalCost,
          externalTrackingNo,
          loanerSerialId,
          loanerSerialNo,
          loanerProductName,
          loanerHandedAt,
          loanerReturnedAt,
          commissionRate,
          commissionAmount,
          createdById,
          createdByName
        )
      ticketId = Number(info.lastInsertRowid)
    }

    // 4. Deduct new parts / products from stock & insert into ticket_parts (skip if ticket is cancelled)
    if (data.status !== 'cancelled') {
      for (const p of parts) {
        if (p.product_id) {
          const prodRow = db
            .prepare('SELECT * FROM products WHERE id = ?')
            .get(p.product_id) as Record<string, unknown> | undefined
          if (!prodRow) continue
          const prod = normalizeProductRow(prodRow)
          const qty = Math.max(1, Number(p.quantity || 1))
          const unit = p.unit === 'pack' ? 'pack' : 'piece'
          const packSz = Math.max(1, Number(p.pack_size || prod.pack_size || 1))
          const deductPieces = unit === 'pack' ? qty * packSz : qty

          if (prod.type !== 'service') {
            if (p.variant_id) {
              const vRow = db
                .prepare('SELECT * FROM product_variants WHERE id = ?')
                .get(p.variant_id) as ProductVariant | undefined
              if (!vRow) throw new Error('المقاس / المتغير غير موجود')
              if (vRow.qty < deductPieces) {
                throw new Error(
                  `الكمية المتاحة من (${prod.name} - ${vRow.variant_name}) هي ${vRow.qty} فقط ولا تكفي لصرف ${deductPieces}`
                )
              }
              db.prepare('UPDATE product_variants SET qty = qty - ? WHERE id = ?').run(
                deductPieces,
                vRow.id
              )
              syncProductQtyFromChildren(prod.id)
            } else {
              if (prod.qty < deductPieces) {
                throw new Error(
                  `الكمية المتاحة من الصنف (${prod.name}) هي ${prod.qty} فقط ولا تكفي لصرف ${deductPieces}`
                )
              }
              db.prepare('UPDATE products SET qty = qty - ? WHERE id = ?').run(deductPieces, prod.id)
            }
          }

          const uPrice = roundMoney(
            p.unit_price ?? (unit === 'pack' ? prod.pack_sale_price || prod.sale_price * packSz : prod.sale_price)
          )
          const uCost = roundMoney(
            p.unit_cost ?? (unit === 'pack' ? prod.pack_cost_price || prod.cost_price * packSz : prod.cost_price)
          )

          db.prepare(
            `INSERT INTO ticket_parts (
              ticket_id, part_id, product_id, variant_id, unit, pack_size,
              part_name, part_code, quantity, unit_cost, unit_price, total_price
            ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            ticketId,
            prod.id,
            p.variant_id || null,
            unit,
            packSz,
            p.part_name || prod.name,
            p.part_code || prod.code,
            qty,
            uCost,
            uPrice,
            roundMoney(qty * uPrice)
          )
        } else if (p.part_id) {
          const partRecord = db
            .prepare('SELECT * FROM spare_parts WHERE id = ?')
            .get(p.part_id) as SparePart | undefined
          if (!partRecord) continue

          const qty = Number(p.quantity || 1)
          if (partRecord.quantity < qty) {
            throw new Error(
              `الكمية المتاحة من القطعة (${partRecord.name}) هي ${partRecord.quantity} فقط ولا تكفي لصرف ${qty}`
            )
          }

          db.prepare('UPDATE spare_parts SET quantity = quantity - ? WHERE id = ?').run(
            qty,
            partRecord.id
          )

          const uPrice = Number(p.unit_price || partRecord.selling_price)
          const uCost = Number(p.unit_cost || partRecord.purchase_price)

          db.prepare(
            `INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            ticketId,
            partRecord.id,
            partRecord.name,
            partRecord.code,
            qty,
            uCost,
            uPrice,
            qty * uPrice
          )
        } else if (p.part_name?.trim()) {
          const qty = Math.max(1, Number(p.quantity || 1))
          const uPrice = roundMoney(p.unit_price || 0)
          const uCost = roundMoney(p.unit_cost || 0)

          db.prepare(
            `INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`
          ).run(
            ticketId,
            p.part_name.trim(),
            p.part_code?.trim() || 'MANUAL',
            qty,
            uCost,
            uPrice,
            roundMoney(qty * uPrice)
          )
        }
      }
    }

    // 4b. Manage Loaner Serial & Repair Serial Statuses (Phase 3E)
    if (previousLoanerSerialId && previousLoanerSerialId !== loanerSerialId) {
      const oldL = db
        .prepare('SELECT product_id FROM product_serials WHERE id = ?')
        .get(previousLoanerSerialId) as { product_id: number } | undefined
      db.prepare("UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?").run(
        previousLoanerSerialId
      )
      if (oldL) syncProductQtyFromChildren(oldL.product_id)
    }

    if (loanerSerialId) {
      const newL = db
        .prepare('SELECT product_id FROM product_serials WHERE id = ?')
        .get(loanerSerialId) as { product_id: number } | undefined
      if (loanerReturnedAt || data.status === 'cancelled') {
        db.prepare("UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?").run(
          loanerSerialId
        )
      } else {
        db.prepare("UPDATE product_serials SET status = 'loaned', customer_id = ? WHERE id = ?").run(
          customerId,
          loanerSerialId
        )
      }
      if (newL) syncProductQtyFromChildren(newL.product_id)
    }

    const activeSerialId = productSerialId || previousProductSerialId
    if (activeSerialId) {
      if (data.status === 'sent_to_lab') {
        db.prepare("UPDATE product_serials SET status = 'external_repair' WHERE id = ?").run(
          activeSerialId
        )
      } else if (
        data.status === 'returned_from_lab' ||
        data.status === 'repaired' ||
        data.status === 'delivered' ||
        data.status === 'cancelled'
      ) {
        const sr = db
          .prepare('SELECT sale_item_id, product_id FROM product_serials WHERE id = ?')
          .get(activeSerialId) as { sale_item_id: number | null; product_id: number } | undefined
        if (sr) {
          db.prepare('UPDATE product_serials SET status = ? WHERE id = ?').run(
            sr.sale_item_id ? 'sold' : 'in_stock',
            activeSerialId
          )
          syncProductQtyFromChildren(sr.product_id)
        }
      }
    }

    // Record external repair cost delta in treasury if changed
    const externalCostDelta = roundMoney(externalCost - previousExternalCost)
    if (externalCostDelta > 0 && data.recordPaymentInTreasury !== false) {
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description, created_by_id, created_by_name)
         VALUES ('expense', 'تكلفة صيانة خارجية', ?, ?, ?, ?, ?, ?)`
      ).run(
        externalCostDelta,
        ticketId,
        data.payment_method || 'cash',
        `تكلفة صيانة خارجية (${externalVendor || 'معمل خارجي'}) لطلب ${ticketNumber} - العميل: ${data.customer_name}`,
        createdById,
        createdByName
      )
    } else if (externalCostDelta < 0 && data.recordPaymentInTreasury !== false) {
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description, created_by_id, created_by_name)
         VALUES ('income', 'تسوية تكلفة صيانة خارجية', ?, ?, ?, ?, ?, ?)`
      ).run(
        Math.abs(externalCostDelta),
        ticketId,
        data.payment_method || 'cash',
        `تخفيض / تسوية تكلفة صيانة خارجية لطلب ${ticketNumber} - العميل: ${data.customer_name}`,
        createdById,
        createdByName
      )
    }

    // 5. Upsert Customer Appliance record for history & warranty tracking
    let existingAppliance:
      | { id: number; warranty_image?: string; fault_images?: string; extra_data?: string }
      | undefined
    const cleanSerial = data.serial_number?.trim() || ''
    if (data.appliance_id) {
      existingAppliance = db
        .prepare(
          'SELECT id, warranty_image, fault_images, extra_data FROM customer_appliances WHERE id = ?'
        )
        .get(data.appliance_id) as typeof existingAppliance
    }
    if (!existingAppliance && cleanSerial) {
      existingAppliance = db
        .prepare(
          `SELECT id, warranty_image, fault_images, extra_data FROM customer_appliances
           WHERE customer_id = ? AND serial_number = ? LIMIT 1`
        )
        .get(customerId, cleanSerial) as typeof existingAppliance
    }
    if (!existingAppliance) {
      existingAppliance = db
        .prepare(
          `SELECT id, warranty_image, fault_images, extra_data FROM customer_appliances
           WHERE customer_id = ? AND appliance_type = ? AND brand = ? AND (serial_number = '' OR serial_number IS NULL) LIMIT 1`
        )
        .get(customerId, data.appliance_type?.trim(), data.brand?.trim()) as typeof existingAppliance
    }

    let resolvedApplianceId: number | null = null
    if (existingAppliance) {
      resolvedApplianceId = existingAppliance.id
      const mergedWarrantyImg = warrantyImg || existingAppliance.warranty_image || ''
      const mergedFaultImages =
        faultImagesJson !== '[]' ? faultImagesJson : existingAppliance.fault_images || '[]'
      const mergedExtraObj = {
        ...parseJsonObject(existingAppliance.extra_data),
        ...parseJsonObject(data.extra_data)
      }
      db.prepare(
        `UPDATE customer_appliances
         SET model = ?, serial_number = ?, last_warranty_end = COALESCE(?, last_warranty_end),
             last_ticket_number = ?, warranty_image = ?, fault_images = ?, extra_data = ?
         WHERE id = ?`
      ).run(
        data.model?.trim() || '',
        cleanSerial,
        warrantyEnd,
        ticketNumber,
        mergedWarrantyImg,
        mergedFaultImages,
        stringifyExtraData(mergedExtraObj),
        existingAppliance.id
      )
    } else {
      const appInfo = db
        .prepare(
          `INSERT INTO customer_appliances (
            customer_id, appliance_type, brand, model, serial_number,
            last_warranty_end, last_ticket_number, warranty_image, fault_images, extra_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          customerId,
          data.appliance_type?.trim(),
          data.brand?.trim(),
          data.model?.trim() || '',
          cleanSerial,
          warrantyEnd,
          ticketNumber,
          warrantyImg,
          faultImagesJson,
          extraDataJson
        )
      resolvedApplianceId = Number(appInfo.lastInsertRowid)
    }

    if (resolvedApplianceId) {
      db.prepare('UPDATE maintenance_tickets SET appliance_id = ? WHERE id = ?').run(
        resolvedApplianceId,
        ticketId
      )
    }

    // 6. Automatically record payment difference in Treasury if paidAmount changed
    const paymentDelta = roundMoney(paidAmount - previousPaid)
    if (paymentDelta > 0 && data.recordPaymentInTreasury !== false) {
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description, created_by_id, created_by_name)
         VALUES ('income', 'تحصيل صيانة / كشف', ?, ?, ?, ?, ?, ?)`
      ).run(
        paymentDelta,
        ticketId,
        data.payment_method || 'cash',
        `تحصيل دفعة من طلب صيانة ${ticketNumber} - العميل: ${data.customer_name}`,
        createdById,
        createdByName
      )
    } else if (paymentDelta < 0 && data.recordPaymentInTreasury !== false) {
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description, created_by_id, created_by_name)
         VALUES ('expense', 'تسوية / رد دفعة صيانة', ?, ?, ?, ?, ?, ?)`
      ).run(
        Math.abs(paymentDelta),
        ticketId,
        data.payment_method || 'cash',
        `تسوية تخفيض المبلغ المدفوع في طلب صيانة ${ticketNumber} - العميل: ${data.customer_name}`,
        createdById,
        createdByName
      )
    }

    return getTicketById(ticketId!)!
  })
}

export function deleteTicket(id: number): void {
  runTransaction(() => {
    const oldTicket = db
      .prepare('SELECT loaner_serial_id, product_serial_id FROM maintenance_tickets WHERE id = ?')
      .get(id) as { loaner_serial_id?: number | null; product_serial_id?: number | null } | undefined
    if (oldTicket?.loaner_serial_id) {
      const l = db
        .prepare('SELECT product_id FROM product_serials WHERE id = ?')
        .get(oldTicket.loaner_serial_id) as { product_id: number } | undefined
      db.prepare("UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?").run(
        oldTicket.loaner_serial_id
      )
      if (l) syncProductQtyFromChildren(l.product_id)
    }
    if (oldTicket?.product_serial_id) {
      const sr = db
        .prepare('SELECT sale_item_id, product_id, status FROM product_serials WHERE id = ?')
        .get(oldTicket.product_serial_id) as
        | { sale_item_id: number | null; product_id: number; status: string }
        | undefined
      if (sr && sr.status === 'external_repair') {
        db.prepare('UPDATE product_serials SET status = ? WHERE id = ?').run(
          sr.sale_item_id ? 'sold' : 'in_stock',
          oldTicket.product_serial_id
        )
        syncProductQtyFromChildren(sr.product_id)
      }
    }

    const oldParts = db
      .prepare('SELECT * FROM ticket_parts WHERE ticket_id = ?')
      .all(id) as TicketPartItem[]
    for (const op of oldParts) {
      if (op.product_id) {
        const packSz = Math.max(1, Number(op.pack_size || 1))
        const pieces =
          op.unit === 'pack' ? Number(op.quantity || 1) * packSz : Number(op.quantity || 1)
        if (op.variant_id) {
          db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
            pieces,
            op.variant_id
          )
          syncProductQtyFromChildren(op.product_id)
        } else {
          db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(pieces, op.product_id)
        }
      } else if (op.part_id) {
        db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(
          op.quantity,
          op.part_id
        )
      }
    }
    db.prepare('DELETE FROM treasury_transactions WHERE ticket_id = ?').run(id)
    db.prepare('DELETE FROM maintenance_tickets WHERE id = ?').run(id)
  })
}

// ==========================================
// 6. TREASURY, MULTI-WALLET & ADVANCED REPORTS
// ==========================================

export function lookupSerialOrInvoiceForTicket(query: string): {
  found: boolean
  serial?: ProductSerial
  product?: Product
  invoice?: SalesInvoice
  customer?: Customer | null
  isUnderWarranty: boolean
  warrantyEndDate?: string | null
  earSide?: string
} {
  const clean = (query || '').trim()
  if (!clean) return { found: false, isUnderWarranty: false }

  const today = getLocalDateString()

  // 1. Search by Serial Number first
  const serialRow = db
    .prepare('SELECT * FROM product_serials WHERE serial_no = ? LIMIT 1')
    .get(clean) as ProductSerial | undefined

  if (serialRow) {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(serialRow.product_id) as Record<string, unknown> | undefined
    const product = rawProd ? normalizeProductRow(rawProd) : undefined

    let invoice: SalesInvoice | undefined
    if (serialRow.sale_item_id) {
      const sItem = db
        .prepare('SELECT invoice_id FROM sales_items WHERE id = ?')
        .get(serialRow.sale_item_id) as { invoice_id: number } | undefined
      if (sItem) {
        invoice = getSalesInvoiceById(sItem.invoice_id)
      }
    }

    let customer: Customer | null = null
    const custId = serialRow.customer_id || invoice?.customer_id
    if (custId) {
      const rawCust = db
        .prepare('SELECT * FROM customers WHERE id = ?')
        .get(custId) as Record<string, unknown> | undefined
      if (rawCust) customer = normalizeCustomerRow(rawCust)
    }

    const warrantyEnd = serialRow.customer_warranty_end || null
    const isUnderWarranty = Boolean(warrantyEnd && warrantyEnd >= today)

    return {
      found: true,
      serial: serialRow,
      product,
      invoice,
      customer,
      isUnderWarranty,
      warrantyEndDate: warrantyEnd,
      earSide: serialRow.ear_side || ''
    }
  }

  // 2. Search by Sales Invoice Number or ID
  const invRow = db
    .prepare('SELECT id FROM sales_invoices WHERE invoice_number = ? OR CAST(id AS TEXT) = ? LIMIT 1')
    .get(clean, clean) as { id: number } | undefined

  if (invRow) {
    const invoice = getSalesInvoiceById(invRow.id)
    if (invoice) {
      let customer: Customer | null = null
      if (invoice.customer_id) {
        const rawCust = db
          .prepare('SELECT * FROM customers WHERE id = ?')
          .get(invoice.customer_id) as Record<string, unknown> | undefined
        if (rawCust) customer = normalizeCustomerRow(rawCust)
      }
      const firstDeviceItem =
        (invoice.items || []).find((x) => x.serial_id || x.serial_no) || (invoice.items || [])[0]
      let product: Product | undefined
      let serial: ProductSerial | undefined
      if (firstDeviceItem) {
        const rawProd = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(firstDeviceItem.product_id) as Record<string, unknown> | undefined
        if (rawProd) product = normalizeProductRow(rawProd)
        if (firstDeviceItem.serial_id) {
          serial = db
            .prepare('SELECT * FROM product_serials WHERE id = ?')
            .get(firstDeviceItem.serial_id) as ProductSerial | undefined
        }
      }
      const warrantyEnd =
        serial?.customer_warranty_end || firstDeviceItem?.warranty_end || null
      const isUnderWarranty = Boolean(warrantyEnd && warrantyEnd >= today)

      return {
        found: true,
        serial,
        product,
        invoice,
        customer,
        isUnderWarranty,
        warrantyEndDate: warrantyEnd,
        earSide: serial?.ear_side || firstDeviceItem?.ear_side || ''
      }
    }
  }

  return { found: false, isUnderWarranty: false }
}

export function returnTicketLoaner(ticketId: number): MaintenanceTicket {
  return runTransaction(() => {
    const raw = db
      .prepare('SELECT * FROM maintenance_tickets WHERE id = ?')
      .get(ticketId) as Record<string, unknown> | undefined
    if (!raw) throw new Error('طلب الصيانة غير موجود')

    const ticket = normalizeTicketRow(raw)
    if (!ticket.loaner_serial_id) {
      throw new Error('لا توجد سماعة بديلة مؤقتة مسجلة على هذا الطلب')
    }

    const nowStr = getLocalDateTimeString()
    db.prepare(
      `UPDATE maintenance_tickets
       SET loaner_returned_at = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(nowStr, ticketId)

    const lRow = db
      .prepare('SELECT product_id FROM product_serials WHERE id = ?')
      .get(ticket.loaner_serial_id) as { product_id: number } | undefined

    db.prepare(
      "UPDATE product_serials SET status = 'in_stock', customer_id = NULL WHERE id = ?"
    ).run(ticket.loaner_serial_id)

    if (lRow) {
      syncProductQtyFromChildren(lRow.product_id)
    }

    return getTicketById(ticketId)!
  })
}