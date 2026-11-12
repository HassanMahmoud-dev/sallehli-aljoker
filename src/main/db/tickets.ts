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
import type {
  MaintenanceTicket,
  TicketPartItem,
  ProductSerial,
  Product,
  ProductVariant,
  SparePart,
  SalesInvoice,
  Customer,
  TicketStatus
} from '../../shared/types'
import type { SessionInfo } from '../session'
import { normalizeProductRow, syncProductQtyFromChildren } from './products'
import { getSalesInvoiceById } from './sales'
import { normalizeCustomerRow } from './customers'
import { isDemoDataHidden } from './demo'
import { getBusinessState } from './business'

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

interface ExistingTicketRow {
  id: number
  ticket_number: string
  customer_id: number
  customer_name: string
  customer_phone: string
  customer_phone2: string
  customer_area: string
  customer_address: string
  appliance_id: number | null
  appliance_type: string
  brand: string
  model: string
  serial_number: string
  service_type: MaintenanceTicket['service_type']
  status: TicketStatus
  priority: MaintenanceTicket['priority']
  complaint: string
  diagnosis: string
  technician_id: number | null
  scheduled_date: string
  inspection_fee: number
  labor_cost: number
  discount: number
  paid_amount: number
  payment_method: MaintenanceTicket['payment_method']
  warranty_months: number
  warranty_start_date: string | null
  warranty_end_date: string | null
  is_under_previous_warranty: number
  previous_ticket_number: string | null
  warranty_image: string
  fault_images: string
  extra_data: string
  notes: string
  sales_invoice_id: number | null
  product_serial_id: number | null
  is_external_repair: number
  external_vendor: string
  external_sent_date: string | null
  external_expected_date: string | null
  external_returned_date: string | null
  external_cost: number
  external_tracking_no: string
  loaner_serial_id: number | null
  loaner_serial_no: string
  loaner_product_name: string
  loaner_handed_at: string | null
  loaner_returned_at: string | null
  commission_rate: number | null
}

interface ResolvedTicketPart {
  part_id: number | null
  product_id: number | null
  variant_id: number | null
  unit: 'piece' | 'pack'
  pack_size: number
  part_name: string
  part_code: string
  quantity: number
  pieces: number
  is_service: boolean
  unit_cost: number
  unit_price: number
  total_price: number
  unit_cost_per_piece: number
  unit_price_per_piece: number
}

interface InventoryDeltaEntry {
  key: string
  partId: number | null
  productId: number | null
  variantId: number | null
  pieces: number
  unitCostPerPiece: number
  unitPricePerPiece: number
  partName: string
}

function getActiveTicketParts(ticketId: number): TicketPartItem[] {
  return db
    .prepare(
      `SELECT *, COALESCE(is_restored, 0) as is_restored
       FROM ticket_parts
       WHERE ticket_id = ? AND COALESCE(is_restored, 0) = 0
       ORDER BY id ASC`
    )
    .all(ticketId) as TicketPartItem[]
}

function recordTicketInventoryMovement(params: {
  ticketId: number
  ticketNumber: string
  movementType: 'out_ticket' | 'in'
  partId?: number | null
  productId?: number | null
  variantId?: number | null
  technicianId?: number | null
  quantity: number
  unitCost: number
  unitPrice: number
  partName: string
  notesPrefix: string
  createdByName?: string
}): void {
  const qty = Math.abs(Number(params.quantity || 0))
  if (qty <= 0) return

  const actorSuffix = params.createdByName ? ` — بواسطة: ${params.createdByName}` : ''
  const notes = `${params.notesPrefix} (${params.ticketNumber}): ${params.partName}${actorSuffix}`

  db.prepare(
    `INSERT INTO inventory_movements (
      part_id, product_id, variant_id, serial_no, ref_type, ref_id,
      technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes
    ) VALUES (?, ?, ?, '', 'maintenance_ticket', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.partId || null,
    params.productId || null,
    params.variantId || null,
    params.ticketId,
    params.technicianId || null,
    params.ticketId,
    params.movementType,
    qty,
    roundMoney(params.unitCost),
    roundMoney(params.unitPrice),
    notes
  )
}

function restoreTicketInventoryItem(params: {
  ticketId: number
  ticketNumber: string
  technicianId?: number | null
  partId?: number | null
  productId?: number | null
  variantId?: number | null
  pieces: number
  unitCostPerPiece: number
  unitPricePerPiece: number
  partName: string
  notesPrefix: string
  createdByName?: string
}): void {
  const pieces = Math.abs(Number(params.pieces || 0))
  if (pieces <= 0) return

  if (params.productId) {
    const prodRow = db
      .prepare('SELECT id, type, name FROM products WHERE id = ?')
      .get(params.productId) as { id: number; type: string; name: string } | undefined
    if (!prodRow || prodRow.type === 'service') return

    if (params.variantId) {
      db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(
        pieces,
        params.variantId
      )
      syncProductQtyFromChildren(params.productId)
    } else {
      db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(pieces, params.productId)
    }

    recordTicketInventoryMovement({
      ticketId: params.ticketId,
      ticketNumber: params.ticketNumber,
      movementType: 'in',
      productId: params.productId,
      variantId: params.variantId || null,
      technicianId: params.technicianId || null,
      quantity: pieces,
      unitCost: params.unitCostPerPiece,
      unitPrice: params.unitPricePerPiece,
      partName: params.partName || prodRow.name,
      notesPrefix: params.notesPrefix,
      createdByName: params.createdByName
    })
  } else if (params.partId) {
    db.prepare('UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?').run(
      pieces,
      params.partId
    )
    recordTicketInventoryMovement({
      ticketId: params.ticketId,
      ticketNumber: params.ticketNumber,
      movementType: 'in',
      partId: params.partId,
      technicianId: params.technicianId || null,
      quantity: pieces,
      unitCost: params.unitCostPerPiece,
      unitPrice: params.unitPricePerPiece,
      partName: params.partName,
      notesPrefix: params.notesPrefix,
      createdByName: params.createdByName
    })
  }
}

function deductTicketInventoryItem(params: {
  ticketId: number
  ticketNumber: string
  technicianId?: number | null
  partId?: number | null
  productId?: number | null
  variantId?: number | null
  pieces: number
  unitCostPerPiece: number
  unitPricePerPiece: number
  partName: string
  createdByName?: string
}): void {
  const pieces = Math.abs(Number(params.pieces || 0))
  if (pieces <= 0) return

  if (params.productId) {
    const prodRow = db
      .prepare('SELECT id, type, name, qty FROM products WHERE id = ?')
      .get(params.productId) as { id: number; type: string; name: string; qty: number } | undefined
    if (!prodRow || prodRow.type === 'service') return

    if (params.variantId) {
      const vRow = db
        .prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?')
        .get(params.variantId, params.productId) as ProductVariant | undefined
      if (!vRow) throw new Error('المقاس / المتغير غير موجود')
      if (vRow.qty < pieces) {
        throw new Error(
          `الكمية المتاحة من (${prodRow.name} - ${vRow.variant_name}) هي ${vRow.qty} فقط ولا تكفي لصرف ${pieces}`
        )
      }
      db.prepare('UPDATE product_variants SET qty = qty - ? WHERE id = ?').run(pieces, vRow.id)
      syncProductQtyFromChildren(params.productId)
    } else {
      if (prodRow.qty < pieces) {
        throw new Error(
          `الكمية المتاحة من الصنف (${prodRow.name}) هي ${prodRow.qty} فقط ولا تكفي لصرف ${pieces}`
        )
      }
      db.prepare('UPDATE products SET qty = qty - ? WHERE id = ?').run(pieces, params.productId)
    }

    recordTicketInventoryMovement({
      ticketId: params.ticketId,
      ticketNumber: params.ticketNumber,
      movementType: 'out_ticket',
      productId: params.productId,
      variantId: params.variantId || null,
      technicianId: params.technicianId || null,
      quantity: pieces,
      unitCost: params.unitCostPerPiece,
      unitPrice: params.unitPricePerPiece,
      partName: params.partName || prodRow.name,
      notesPrefix: 'صرف لطلب صيانة',
      createdByName: params.createdByName
    })
  } else if (params.partId) {
    const partRecord = db
      .prepare('SELECT * FROM spare_parts WHERE id = ?')
      .get(params.partId) as SparePart | undefined
    if (!partRecord) throw new Error('قطعة الغيار غير موجودة')
    if (partRecord.quantity < pieces) {
      throw new Error(
        `الكمية المتاحة من القطعة (${partRecord.name}) هي ${partRecord.quantity} فقط ولا تكفي لصرف ${pieces}`
      )
    }

    db.prepare('UPDATE spare_parts SET quantity = quantity - ? WHERE id = ?').run(
      pieces,
      partRecord.id
    )

    recordTicketInventoryMovement({
      ticketId: params.ticketId,
      ticketNumber: params.ticketNumber,
      movementType: 'out_ticket',
      partId: partRecord.id,
      technicianId: params.technicianId || null,
      quantity: pieces,
      unitCost: params.unitCostPerPiece,
      unitPrice: params.unitPricePerPiece,
      partName: params.partName || partRecord.name,
      notesPrefix: 'صرف لطلب صيانة',
      createdByName: params.createdByName
    })
  }
}

function buildOldInventoryDeltaMap(oldParts: TicketPartItem[]): Map<string, InventoryDeltaEntry> {
  const map = new Map<string, InventoryDeltaEntry>()
  const productTypeStmt = db.prepare('SELECT type, name FROM products WHERE id = ?')

  for (const op of oldParts) {
    if (op.product_id) {
      const prodMeta = productTypeStmt.get(op.product_id) as
        | { type: string; name: string }
        | undefined
      if (!prodMeta || prodMeta.type === 'service') continue

      const packSz = Math.max(1, Number(op.pack_size || 1))
      const qty = Math.max(1, Number(op.quantity || 1))
      const pieces = op.unit === 'pack' ? qty * packSz : qty
      const key = `prod:${op.product_id}:${op.variant_id || 0}`
      const unitCostPerPiece =
        op.unit === 'pack' ? roundMoney(Number(op.unit_cost || 0) / packSz) : roundMoney(op.unit_cost)
      const unitPricePerPiece =
        op.unit === 'pack'
          ? roundMoney(Number(op.unit_price || 0) / packSz)
          : roundMoney(op.unit_price)

      const existing = map.get(key)
      if (existing) {
        existing.pieces += pieces
      } else {
        map.set(key, {
          key,
          partId: null,
          productId: op.product_id,
          variantId: op.variant_id || null,
          pieces,
          unitCostPerPiece,
          unitPricePerPiece,
          partName: op.part_name || prodMeta.name
        })
      }
    } else if (op.part_id) {
      const qty = Math.max(1, Number(op.quantity || 1))
      const key = `part:${op.part_id}`
      const existing = map.get(key)
      if (existing) {
        existing.pieces += qty
      } else {
        map.set(key, {
          key,
          partId: op.part_id,
          productId: null,
          variantId: null,
          pieces: qty,
          unitCostPerPiece: roundMoney(op.unit_cost),
          unitPricePerPiece: roundMoney(op.unit_price),
          partName: op.part_name
        })
      }
    }
  }

  return map
}

function buildNewInventoryDeltaMap(parts: ResolvedTicketPart[]): Map<string, InventoryDeltaEntry> {
  const map = new Map<string, InventoryDeltaEntry>()

  for (const rp of parts) {
    if (rp.product_id && !rp.is_service) {
      const key = `prod:${rp.product_id}:${rp.variant_id || 0}`
      const existing = map.get(key)
      if (existing) {
        existing.pieces += rp.pieces
      } else {
        map.set(key, {
          key,
          partId: null,
          productId: rp.product_id,
          variantId: rp.variant_id || null,
          pieces: rp.pieces,
          unitCostPerPiece: rp.unit_cost_per_piece,
          unitPricePerPiece: rp.unit_price_per_piece,
          partName: rp.part_name
        })
      }
    } else if (rp.part_id) {
      const key = `part:${rp.part_id}`
      const existing = map.get(key)
      if (existing) {
        existing.pieces += rp.pieces
      } else {
        map.set(key, {
          key,
          partId: rp.part_id,
          productId: null,
          variantId: null,
          pieces: rp.pieces,
          unitCostPerPiece: rp.unit_cost_per_piece,
          unitPricePerPiece: rp.unit_price_per_piece,
          partName: rp.part_name
        })
      }
    }
  }

  return map
}

function resolveInputTicketParts(rawParts: TicketPartItem[]): ResolvedTicketPart[] {
  const resolved: ResolvedTicketPart[] = []

  for (const p of rawParts) {
    if (Number(p.is_restored || 0) === 1) continue

    if (p.product_id) {
      const prodRow = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(p.product_id) as Record<string, unknown> | undefined
      if (!prodRow) continue

      const prod = normalizeProductRow(prodRow)
      const qty = Math.max(1, Number(p.quantity || 1))
      const unit: 'piece' | 'pack' = p.unit === 'pack' ? 'pack' : 'piece'
      const packSz = Math.max(1, Number(p.pack_size || prod.pack_size || 1))
      const pieces = unit === 'pack' ? qty * packSz : qty
      const uPrice = roundMoney(
        p.unit_price !== undefined && p.unit_price !== null
          ? Number(p.unit_price)
          : unit === 'pack'
            ? prod.pack_sale_price || prod.sale_price * packSz
            : prod.sale_price
      )
      const uCost = roundMoney(
        p.unit_cost !== undefined && p.unit_cost !== null
          ? Number(p.unit_cost)
          : unit === 'pack'
            ? prod.pack_cost_price || prod.cost_price * packSz
            : prod.cost_price
      )

      resolved.push({
        part_id: null,
        product_id: prod.id,
        variant_id: p.variant_id || null,
        unit,
        pack_size: packSz,
        part_name: p.part_name || prod.name,
        part_code: p.part_code || prod.code,
        quantity: qty,
        pieces,
        is_service: prod.type === 'service',
        unit_cost: uCost,
        unit_price: uPrice,
        total_price: roundMoney(qty * uPrice),
        unit_cost_per_piece: unit === 'pack' ? roundMoney(uCost / packSz) : uCost,
        unit_price_per_piece: unit === 'pack' ? roundMoney(uPrice / packSz) : uPrice
      })
    } else if (p.part_id) {
      const partRecord = db
        .prepare('SELECT * FROM spare_parts WHERE id = ?')
        .get(p.part_id) as SparePart | undefined
      if (!partRecord) continue

      const qty = Math.max(1, Number(p.quantity || 1))
      const uPrice = roundMoney(
        p.unit_price !== undefined && p.unit_price !== null
          ? Number(p.unit_price)
          : partRecord.selling_price
      )
      const uCost = roundMoney(
        p.unit_cost !== undefined && p.unit_cost !== null
          ? Number(p.unit_cost)
          : partRecord.purchase_price
      )

      resolved.push({
        part_id: partRecord.id,
        product_id: null,
        variant_id: null,
        unit: 'piece',
        pack_size: 1,
        part_name: partRecord.name,
        part_code: partRecord.code,
        quantity: qty,
        pieces: qty,
        is_service: false,
        unit_cost: uCost,
        unit_price: uPrice,
        total_price: roundMoney(qty * uPrice),
        unit_cost_per_piece: uCost,
        unit_price_per_piece: uPrice
      })
    } else if (p.part_name?.trim()) {
      const qty = Math.max(1, Number(p.quantity || 1))
      const uPrice = roundMoney(p.unit_price ?? 0)
      const uCost = roundMoney(p.unit_cost ?? 0)

      resolved.push({
        part_id: null,
        product_id: null,
        variant_id: null,
        unit: 'piece',
        pack_size: 1,
        part_name: p.part_name.trim(),
        part_code: p.part_code?.trim() || 'MANUAL',
        quantity: qty,
        pieces: qty,
        is_service: false,
        unit_cost: uCost,
        unit_price: uPrice,
        total_price: roundMoney(qty * uPrice),
        unit_cost_per_piece: uCost,
        unit_price_per_piece: uPrice
      })
    }
  }

  return resolved
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
    .prepare(
      `SELECT *, COALESCE(is_restored, 0) as is_restored
       FROM ticket_parts
       WHERE ticket_id = ?
       ORDER BY COALESCE(is_restored, 0) ASC, id ASC`
    )
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

  const bType = getBusinessState().type
  if (isDemoDataHidden()) {
    sql += ' AND mt.is_demo = 0'
  } else {
    sql += ` AND (mt.is_demo = 0 OR mt.business_type = '${bType}' OR mt.business_type IS NULL OR mt.business_type = '')`
  }

  sql += ' ORDER BY mt.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const rows = rawRows.map(normalizeTicketRow)

  const getPartsStmt = db.prepare(
    `SELECT *, COALESCE(is_restored, 0) as is_restored
     FROM ticket_parts
     WHERE ticket_id = ?
     ORDER BY COALESCE(is_restored, 0) ASC, id ASC`
  )
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

    const ticketIdArg = data.id ? Number(data.id) : undefined
    let oldTicket: ExistingTicketRow | undefined
    if (ticketIdArg) {
      oldTicket = db
        .prepare('SELECT * FROM maintenance_tickets WHERE id = ?')
        .get(ticketIdArg) as ExistingTicketRow | undefined
      if (!oldTicket) {
        throw new Error('تذكرة الصيانة غير موجودة')
      }
    }

    // 1. Ensure Customer exists or update customer
    let customerId =
      data.customer_id !== undefined ? Number(data.customer_id) : oldTicket?.customer_id

    let customerName =
      data.customer_name !== undefined ? data.customer_name.trim() : oldTicket?.customer_name || ''
    let customerPhone =
      data.customer_phone !== undefined ? data.customer_phone.trim() : oldTicket?.customer_phone || ''
    let customerPhone2 =
      data.customer_phone2 !== undefined
        ? data.customer_phone2.trim()
        : oldTicket?.customer_phone2 || ''
    let customerArea =
      data.customer_area !== undefined ? data.customer_area.trim() : oldTicket?.customer_area || ''
    let customerAddress =
      data.customer_address !== undefined
        ? data.customer_address.trim()
        : oldTicket?.customer_address || ''

    if (!customerId) {
      const existingCust = db
        .prepare('SELECT id, name, phone, phone2, area, address FROM customers WHERE phone = ? LIMIT 1')
        .get(customerPhone) as
        | { id: number; name: string; phone: string; phone2: string; area: string; address: string }
        | undefined

      if (existingCust) {
        customerId = existingCust.id
        db.prepare(
          `UPDATE customers SET
             name = COALESCE(NULLIF(?, ''), name),
             phone2 = COALESCE(NULLIF(?, ''), phone2),
             area = COALESCE(NULLIF(?, ''), area),
             address = COALESCE(NULLIF(?, ''), address)
           WHERE id = ?`
        ).run(customerName, customerPhone2, customerArea, customerAddress, customerId)
        customerName = customerName || existingCust.name
        customerPhone = customerPhone || existingCust.phone
      } else {
        const custInfo = db
          .prepare(
            'INSERT INTO customers (name, phone, phone2, area, address) VALUES (?, ?, ?, ?, ?)'
          )
          .run(customerName, customerPhone, customerPhone2, customerArea, customerAddress)
        customerId = Number(custInfo.lastInsertRowid)
      }
    } else if (!customerName || !customerPhone) {
      const existingCust = db
        .prepare('SELECT name, phone, phone2, area, address FROM customers WHERE id = ?')
        .get(customerId) as
        | { name: string; phone: string; phone2: string; area: string; address: string }
        | undefined
      if (existingCust) {
        customerName = customerName || existingCust.name
        customerPhone = customerPhone || existingCust.phone
        customerPhone2 = customerPhone2 || existingCust.phone2 || ''
        customerArea = customerArea || existingCust.area || ''
        customerAddress = customerAddress || existingCust.address || ''
      }
    }

    // 2. Resolve Ticket Fields & Enforce Business Guards
    const nextStatus = (
      data.status !== undefined ? data.status : oldTicket?.status || 'new'
    ) as TicketStatus
    const applianceType =
      data.appliance_type !== undefined
        ? data.appliance_type.trim()
        : oldTicket?.appliance_type || ''
    const brand = data.brand !== undefined ? data.brand.trim() : oldTicket?.brand || ''
    const model = data.model !== undefined ? data.model.trim() : oldTicket?.model || ''
    const serialNumber =
      data.serial_number !== undefined ? data.serial_number.trim() : oldTicket?.serial_number || ''
    const serviceType =
      data.service_type !== undefined
        ? data.service_type
        : oldTicket?.service_type || 'home_visit'
    const priority =
      data.priority !== undefined ? data.priority : oldTicket?.priority || 'normal'
    const complaint =
      data.complaint !== undefined ? data.complaint.trim() : oldTicket?.complaint || ''
    const diagnosis =
      data.diagnosis !== undefined ? data.diagnosis.trim() : oldTicket?.diagnosis || ''
    const technicianId =
      data.technician_id !== undefined
        ? data.technician_id
          ? Number(data.technician_id)
          : null
        : oldTicket?.technician_id ?? null
    const scheduledDate =
      data.scheduled_date !== undefined
        ? data.scheduled_date || getLocalDateString()
        : oldTicket?.scheduled_date || getLocalDateString()

    const inspectionFee = roundMoney(
      data.inspection_fee !== undefined ? data.inspection_fee : oldTicket?.inspection_fee ?? 0
    )
    const laborCost = roundMoney(
      data.labor_cost !== undefined ? data.labor_cost : oldTicket?.labor_cost ?? 0
    )
    const discount = roundMoney(
      data.discount !== undefined ? data.discount : oldTicket?.discount ?? 0
    )
    const paidAmount = roundMoney(
      data.paid_amount !== undefined ? data.paid_amount : oldTicket?.paid_amount ?? 0
    )
    const paymentMethod =
      data.payment_method !== undefined
        ? data.payment_method
        : oldTicket?.payment_method || 'cash'

    const loanerSerialId =
      data.loaner_serial_id !== undefined
        ? data.loaner_serial_id
          ? Number(data.loaner_serial_id)
          : null
        : oldTicket?.loaner_serial_id ?? null
    const isSameLoaner = Boolean(loanerSerialId && loanerSerialId === oldTicket?.loaner_serial_id)
    let loanerSerialNo =
      data.loaner_serial_no !== undefined
        ? data.loaner_serial_no.trim()
        : isSameLoaner
          ? oldTicket?.loaner_serial_no || ''
          : ''
    let loanerProductName =
      data.loaner_product_name !== undefined
        ? data.loaner_product_name.trim()
        : isSameLoaner
          ? oldTicket?.loaner_product_name || ''
          : ''
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
      data.loaner_handed_at !== undefined
        ? data.loaner_handed_at || (loanerSerialId ? getLocalDateTimeString() : null)
        : isSameLoaner
          ? oldTicket?.loaner_handed_at || getLocalDateTimeString()
          : loanerSerialId
            ? getLocalDateTimeString()
            : null
    const loanerReturnedAt = !loanerSerialId
      ? null
      : isSameLoaner
        ? data.loaner_returned_at || oldTicket?.loaner_returned_at || null
        : data.loaner_returned_at || null

    // [FIN-11] Prevent ticket delivery while a loaner device is still with the customer
    if (nextStatus === 'delivered') {
      const hasUnreturnedNewLoaner = Boolean(loanerSerialId && !loanerReturnedAt)
      const hasUnreturnedExistingLoaner = Boolean(
        oldTicket?.loaner_serial_id && !oldTicket.loaner_returned_at && !data.loaner_returned_at
      )
      if (hasUnreturnedNewLoaner || hasUnreturnedExistingLoaner) {
        throw new Error('لا يمكن تسليم التذكرة قبل استرجاع جهاز الإعارة من العميل')
      }
    }

    // 3. Calculate Parts Totals & Commission
    const activeOldParts = oldTicket ? getActiveTicketParts(oldTicket.id) : []
    const hasPartsPayload = data.parts !== undefined
    const resolvedNewParts =
      nextStatus !== 'cancelled' && hasPartsPayload ? resolveInputTicketParts(data.parts!) : []

    let partsSellingTotal = 0
    let partsCostTotal = 0
    if (nextStatus === 'cancelled') {
      partsSellingTotal = 0
      partsCostTotal = 0
    } else if (hasPartsPayload) {
      for (const rp of resolvedNewParts) {
        partsSellingTotal = roundMoney(partsSellingTotal + rp.total_price)
        partsCostTotal = roundMoney(partsCostTotal + rp.quantity * rp.unit_cost)
      }
    } else {
      for (const op of activeOldParts) {
        const qty = Math.max(1, Number(op.quantity || 1))
        const uPrice = roundMoney(op.unit_price ?? 0)
        const uCost = roundMoney(op.unit_cost ?? 0)
        partsSellingTotal = roundMoney(partsSellingTotal + (op.total_price ?? qty * uPrice))
        partsCostTotal = roundMoney(partsCostTotal + qty * uCost)
      }
    }

    const totalAmount = Math.max(
      0,
      roundMoney(inspectionFee + laborCost + partsSellingTotal - discount)
    )
    const remainingAmount = Math.max(0, roundMoney(totalAmount - paidAmount))

    // [FIN-18, FIN-19] Commission is calculated on net labor + inspection after discount (excluding parts)
    // and refreshes technician commission rate whenever technician changes
    let commissionRate: number | null = null
    let commissionAmount: number | null = null
    const commissionBase = Math.max(0, roundMoney(laborCost + inspectionFee - discount))

    if (technicianId && (nextStatus === 'repaired' || nextStatus === 'delivered')) {
      if (oldTicket) {
        const technicianChanged = technicianId !== (oldTicket.technician_id ?? null)
        if (
          !technicianChanged &&
          oldTicket.commission_rate !== null &&
          oldTicket.commission_rate !== undefined
        ) {
          commissionRate = Number(oldTicket.commission_rate)
        } else {
          const techRow = db
            .prepare('SELECT commission_rate FROM technicians WHERE id = ?')
            .get(technicianId) as { commission_rate: number } | undefined
          if (techRow) {
            commissionRate = Number(techRow.commission_rate ?? 0)
          }
        }
      } else {
        const techRow = db
          .prepare('SELECT commission_rate FROM technicians WHERE id = ?')
          .get(technicianId) as { commission_rate: number } | undefined
        if (techRow) {
          commissionRate = Number(techRow.commission_rate ?? 0)
        }
      }

      if (commissionRate !== null) {
        commissionAmount = roundMoney(commissionBase * (commissionRate / 100.0))
      }
    }

    // 4. Calculate Warranty Dates if status is repaired or delivered
    const warrantyMonths = Number(
      data.warranty_months !== undefined ? data.warranty_months : oldTicket?.warranty_months ?? 0
    )
    let warrantyStart =
      data.warranty_start_date !== undefined
        ? data.warranty_start_date || null
        : oldTicket?.warranty_start_date ?? null
    let warrantyEnd =
      data.warranty_end_date !== undefined
        ? data.warranty_end_date || null
        : oldTicket?.warranty_end_date ?? null

    if ((nextStatus === 'repaired' || nextStatus === 'delivered') && warrantyMonths > 0) {
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

    const isUnderPreviousWarranty =
      data.is_under_previous_warranty !== undefined
        ? data.is_under_previous_warranty
          ? 1
          : 0
        : oldTicket?.is_under_previous_warranty ?? 0
    const previousTicketNumber =
      data.previous_ticket_number !== undefined
        ? data.previous_ticket_number || null
        : oldTicket?.previous_ticket_number ?? null
    const warrantyImg =
      data.warranty_image !== undefined
        ? data.warranty_image || ''
        : oldTicket?.warranty_image || ''
    const faultImagesJson =
      data.fault_images !== undefined
        ? JSON.stringify(Array.isArray(data.fault_images) ? data.fault_images : [])
        : oldTicket?.fault_images || '[]'
    const extraDataJson =
      data.extra_data !== undefined ? stringifyExtraData(data.extra_data) : oldTicket?.extra_data || '{}'
    const notes = data.notes !== undefined ? data.notes.trim() : oldTicket?.notes || ''

    const salesInvoiceId =
      data.sales_invoice_id !== undefined
        ? data.sales_invoice_id
          ? Number(data.sales_invoice_id)
          : null
        : oldTicket?.sales_invoice_id ?? null
    const productSerialId =
      data.product_serial_id !== undefined
        ? data.product_serial_id
          ? Number(data.product_serial_id)
          : null
        : oldTicket?.product_serial_id ?? null
    const isExternalRepair =
      data.is_external_repair !== undefined
        ? data.is_external_repair || nextStatus === 'sent_to_lab' || nextStatus === 'returned_from_lab'
          ? 1
          : 0
        : oldTicket?.is_external_repair ||
            nextStatus === 'sent_to_lab' ||
            nextStatus === 'returned_from_lab'
          ? 1
          : 0
    const externalVendor =
      data.external_vendor !== undefined
        ? data.external_vendor.trim()
        : oldTicket?.external_vendor || ''
    const externalSentDate =
      data.external_sent_date !== undefined
        ? data.external_sent_date || null
        : oldTicket?.external_sent_date ||
          (nextStatus === 'sent_to_lab' ? getLocalDateString() : null)
    const externalExpectedDate =
      data.external_expected_date !== undefined
        ? data.external_expected_date || null
        : oldTicket?.external_expected_date ?? null
    const externalReturnedDate =
      data.external_returned_date !== undefined
        ? data.external_returned_date || null
        : oldTicket?.external_returned_date ||
          (nextStatus === 'returned_from_lab' ? getLocalDateString() : null)
    const externalCost = roundMoney(
      data.external_cost !== undefined ? data.external_cost : oldTicket?.external_cost ?? 0
    )
    const externalTrackingNo =
      data.external_tracking_no !== undefined
        ? data.external_tracking_no.trim()
        : oldTicket?.external_tracking_no || ''

    let ticketId = oldTicket?.id
    let ticketNumber = oldTicket?.ticket_number || data.ticket_number || ''
    const previousPaid = roundMoney(oldTicket?.paid_amount ?? 0)
    const previousExternalCost = roundMoney(oldTicket?.external_cost ?? 0)
    const previousLoanerSerialId = oldTicket?.loaner_serial_id
      ? Number(oldTicket.loaner_serial_id)
      : null
    const previousProductSerialId = oldTicket?.product_serial_id
      ? Number(oldTicket.product_serial_id)
      : null

    if (oldTicket) {
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
          commission_rate = ?,
          commission_amount = ?,
          completed_at = CASE WHEN ? IN ('repaired', 'delivered') AND completed_at IS NULL THEN datetime('now', 'localtime') ELSE completed_at END,
          delivered_at = CASE WHEN ? = 'delivered' AND delivered_at IS NULL THEN datetime('now', 'localtime') ELSE delivered_at END,
          updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).run(
        customerId,
        customerName,
        customerPhone,
        customerPhone2,
        customerArea,
        customerAddress,
        applianceType,
        brand,
        model,
        serialNumber,
        serviceType,
        nextStatus,
        priority,
        complaint,
        diagnosis,
        technicianId,
        scheduledDate,
        inspectionFee,
        laborCost,
        partsSellingTotal,
        partsCostTotal,
        discount,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentMethod,
        warrantyMonths,
        warrantyStart,
        warrantyEnd,
        isUnderPreviousWarranty,
        previousTicketNumber,
        warrantyImg,
        faultImagesJson,
        extraDataJson,
        notes,
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
        nextStatus,
        nextStatus,
        oldTicket.id
      )
      ticketId = oldTicket.id
    } else {
      ticketNumber = generateNextTicketNumber()
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
          customerName,
          customerPhone,
          customerPhone2,
          customerArea,
          customerAddress,
          applianceType,
          brand,
          model,
          serialNumber,
          serviceType,
          nextStatus,
          priority,
          complaint,
          diagnosis,
          technicianId,
          scheduledDate,
          inspectionFee,
          laborCost,
          partsSellingTotal,
          partsCostTotal,
          discount,
          totalAmount,
          paidAmount,
          remainingAmount,
          paymentMethod,
          warrantyMonths,
          warrantyStart,
          warrantyEnd,
          isUnderPreviousWarranty,
          previousTicketNumber,
          warrantyImg,
          faultImagesJson,
          extraDataJson,
          notes,
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

    // 5. [FIN-05, FIN-12] Manage Ticket Parts & Record Inventory Movements
    if (nextStatus === 'cancelled') {
      // Preserve historical ticket_parts rows on cancellation: restore active stock & mark is_restored = 1
      if (activeOldParts.length > 0) {
        const restoreMap = buildOldInventoryDeltaMap(activeOldParts)
        for (const entry of restoreMap.values()) {
          restoreTicketInventoryItem({
            ticketId: ticketId!,
            ticketNumber,
            technicianId: technicianId ?? oldTicket?.technician_id ?? null,
            partId: entry.partId,
            productId: entry.productId,
            variantId: entry.variantId,
            pieces: entry.pieces,
            unitCostPerPiece: entry.unitCostPerPiece,
            unitPricePerPiece: entry.unitPricePerPiece,
            partName: entry.partName,
            notesPrefix: 'استرجاع لإلغاء طلب صيانة',
            createdByName
          })
        }
        db.prepare(
          'UPDATE ticket_parts SET is_restored = 1 WHERE ticket_id = ? AND COALESCE(is_restored, 0) = 0'
        ).run(ticketId)
      }
    } else if (hasPartsPayload) {
      const oldMap = buildOldInventoryDeltaMap(activeOldParts)
      const newMap = buildNewInventoryDeltaMap(resolvedNewParts)

      // Restore decreased / removed parts first ('in')
      for (const [key, oldEntry] of oldMap.entries()) {
        const newEntry = newMap.get(key)
        const restorePieces = oldEntry.pieces - (newEntry ? newEntry.pieces : 0)
        if (restorePieces > 0) {
          restoreTicketInventoryItem({
            ticketId: ticketId!,
            ticketNumber,
            technicianId: technicianId ?? oldTicket?.technician_id ?? null,
            partId: oldEntry.partId,
            productId: oldEntry.productId,
            variantId: oldEntry.variantId,
            pieces: restorePieces,
            unitCostPerPiece: oldEntry.unitCostPerPiece,
            unitPricePerPiece: oldEntry.unitPricePerPiece,
            partName: oldEntry.partName,
            notesPrefix: 'استرجاع من تعديل طلب صيانة',
            createdByName
          })
        }
      }

      // Deduct new / increased parts ('out_ticket')
      for (const [key, newEntry] of newMap.entries()) {
        const oldEntry = oldMap.get(key)
        const deductPieces = newEntry.pieces - (oldEntry ? oldEntry.pieces : 0)
        if (deductPieces > 0) {
          deductTicketInventoryItem({
            ticketId: ticketId!,
            ticketNumber,
            technicianId,
            partId: newEntry.partId,
            productId: newEntry.productId,
            variantId: newEntry.variantId,
            pieces: deductPieces,
            unitCostPerPiece: newEntry.unitCostPerPiece,
            unitPricePerPiece: newEntry.unitPricePerPiece,
            partName: newEntry.partName,
            createdByName
          })
        }
      }

      // Replace only active rows, keeping any prior historical restored records (is_restored = 1)
      db.prepare(
        'DELETE FROM ticket_parts WHERE ticket_id = ? AND COALESCE(is_restored, 0) = 0'
      ).run(ticketId)

      const insertPartStmt = db.prepare(
        `INSERT INTO ticket_parts (
          ticket_id, part_id, product_id, variant_id, unit, pack_size,
          part_name, part_code, quantity, unit_cost, unit_price, total_price, is_restored
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      for (const rp of resolvedNewParts) {
        insertPartStmt.run(
          ticketId,
          rp.part_id,
          rp.product_id,
          rp.variant_id,
          rp.unit,
          rp.pack_size,
          rp.part_name,
          rp.part_code,
          rp.quantity,
          rp.unit_cost,
          rp.unit_price,
          rp.total_price
        )
      }
    }

    // Reconcile stored parts totals strictly from active ticket_parts rows (COALESCE(is_restored, 0) = 0)
    const activeTotals = db
      .prepare(
        `SELECT
           COALESCE(SUM(total_price), 0) as parts_total,
           COALESCE(SUM(quantity * unit_cost), 0) as parts_cost_total
         FROM ticket_parts
         WHERE ticket_id = ? AND COALESCE(is_restored, 0) = 0`
      )
      .get(ticketId) as { parts_total: number; parts_cost_total: number }
    const syncedPartsTotal = roundMoney(activeTotals.parts_total)
    const syncedPartsCostTotal = roundMoney(activeTotals.parts_cost_total)
    const syncedTotalAmount = Math.max(
      0,
      roundMoney(inspectionFee + laborCost + syncedPartsTotal - discount)
    )
    const syncedRemainingAmount = Math.max(0, roundMoney(syncedTotalAmount - paidAmount))
    db.prepare(
      `UPDATE maintenance_tickets
       SET parts_total = ?, parts_cost_total = ?, total_amount = ?, remaining_amount = ?
       WHERE id = ?`
    ).run(syncedPartsTotal, syncedPartsCostTotal, syncedTotalAmount, syncedRemainingAmount, ticketId)

    // 5b. Manage Loaner Serial & Repair Serial Statuses (Phase 3E)
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
      if (loanerReturnedAt || nextStatus === 'cancelled') {
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
      if (nextStatus === 'sent_to_lab') {
        db.prepare("UPDATE product_serials SET status = 'external_repair' WHERE id = ?").run(
          activeSerialId
        )
      } else if (
        nextStatus === 'returned_from_lab' ||
        nextStatus === 'repaired' ||
        nextStatus === 'delivered' ||
        nextStatus === 'cancelled'
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
        paymentMethod,
        `تكلفة صيانة خارجية (${externalVendor || 'معمل خارجي'}) لطلب ${ticketNumber} - العميل: ${customerName}`,
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
        paymentMethod,
        `تخفيض / تسوية تكلفة صيانة خارجية لطلب ${ticketNumber} - العميل: ${customerName}`,
        createdById,
        createdByName
      )
    }

    // 6. Upsert Customer Appliance record for history & warranty tracking
    let existingAppliance:
      | { id: number; warranty_image?: string; fault_images?: string; extra_data?: string }
      | undefined
    const applianceLookupId = data.appliance_id ?? oldTicket?.appliance_id
    if (applianceLookupId) {
      existingAppliance = db
        .prepare(
          'SELECT id, warranty_image, fault_images, extra_data FROM customer_appliances WHERE id = ?'
        )
        .get(applianceLookupId) as typeof existingAppliance
    }
    if (!existingAppliance && serialNumber) {
      existingAppliance = db
        .prepare(
          `SELECT id, warranty_image, fault_images, extra_data FROM customer_appliances
           WHERE customer_id = ? AND serial_number = ? LIMIT 1`
        )
        .get(customerId, serialNumber) as typeof existingAppliance
    }
    if (!existingAppliance) {
      existingAppliance = db
        .prepare(
          `SELECT id, warranty_image, fault_images, extra_data FROM customer_appliances
           WHERE customer_id = ? AND appliance_type = ? AND brand = ? AND (serial_number = '' OR serial_number IS NULL) LIMIT 1`
        )
        .get(customerId, applianceType, brand) as typeof existingAppliance
    }

    let resolvedApplianceId: number | null = null
    if (existingAppliance) {
      resolvedApplianceId = existingAppliance.id
      const mergedWarrantyImg = warrantyImg || existingAppliance.warranty_image || ''
      const mergedFaultImages =
        faultImagesJson !== '[]' ? faultImagesJson : existingAppliance.fault_images || '[]'
      const mergedExtraObj =
        data.extra_data !== undefined
          ? {
              ...parseJsonObject(existingAppliance.extra_data),
              ...parseJsonObject(data.extra_data)
            }
          : parseJsonObject(existingAppliance.extra_data)
      db.prepare(
        `UPDATE customer_appliances
         SET model = ?, serial_number = ?, last_warranty_end = COALESCE(?, last_warranty_end),
             last_ticket_number = ?, warranty_image = ?, fault_images = ?, extra_data = ?
         WHERE id = ?`
      ).run(
        model,
        serialNumber,
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
          applianceType,
          brand,
          model,
          serialNumber,
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

    // 7. Automatically record payment difference in Treasury if paidAmount changed
    const paymentDelta = roundMoney(paidAmount - previousPaid)
    if (paymentDelta > 0 && data.recordPaymentInTreasury !== false) {
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, ticket_id, payment_method, description, created_by_id, created_by_name)
         VALUES ('income', 'تحصيل صيانة / كشف', ?, ?, ?, ?, ?, ?)`
      ).run(
        paymentDelta,
        ticketId,
        paymentMethod,
        `تحصيل دفعة من طلب صيانة ${ticketNumber} - العميل: ${customerName}`,
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
        paymentMethod,
        `تسوية تخفيض المبلغ المدفوع في طلب صيانة ${ticketNumber} - العميل: ${customerName}`,
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
      .prepare(
        `SELECT id, ticket_number, status, technician_id, paid_amount, external_cost,
                loaner_serial_id, loaner_returned_at, product_serial_id
         FROM maintenance_tickets
         WHERE id = ?`
      )
      .get(id) as
      | {
          id: number
          ticket_number: string
          status: TicketStatus
          technician_id: number | null
          paid_amount: number
          external_cost: number
          loaner_serial_id: number | null
          loaner_returned_at: string | null
          product_serial_id: number | null
        }
      | undefined

    if (!oldTicket) {
      throw new Error('تذكرة الصيانة غير موجودة')
    }

    // [FIN-13] Block deletion of repaired/delivered tickets or tickets with unreturned loaners / financial impact
    if (oldTicket.status === 'repaired' || oldTicket.status === 'delivered') {
      throw new Error(
        'لا يمكن حذف تذكرة صيانة منتهية أو مسلّمة، يمكنك إلغاؤها أو إجراء تسوية بدلاً من الحذف'
      )
    }

    if (oldTicket.loaner_serial_id && !oldTicket.loaner_returned_at) {
      throw new Error('لا يمكن حذف تذكرة عليها جهاز إعارة لم يُسترجع من العميل بعد')
    }

    if (roundMoney(oldTicket.paid_amount) > 0 || roundMoney(oldTicket.external_cost) > 0) {
      throw new Error('لا يمكن حذف تذكرة عليها مبالغ مدفوعة أو تكاليف صيانة خارجية مسجلة')
    }

    const treasuryRows = db
      .prepare(
        `SELECT transaction_type, category, amount
         FROM treasury_transactions
         WHERE ticket_id = ?`
      )
      .all(id) as Array<{ transaction_type: string; category: string; amount: number }>

    if (treasuryRows.length > 0) {
      if (treasuryRows.some((tx) => tx.transaction_type === 'tech_commission')) {
        throw new Error('لا يمكن حذف تذكرة صُرِفَت لها عمولة فني في الخزينة')
      }

      let paymentNet = 0
      let externalCostNet = 0
      for (const tx of treasuryRows) {
        const amt = Number(tx.amount || 0)
        if (tx.category === 'تحصيل صيانة / كشف' && tx.transaction_type === 'income') {
          paymentNet += amt
        } else if (tx.category === 'تسوية / رد دفعة صيانة' && tx.transaction_type === 'expense') {
          paymentNet -= amt
        } else if (tx.category === 'تكلفة صيانة خارجية' && tx.transaction_type === 'expense') {
          externalCostNet += amt
        } else if (tx.category === 'تسوية تكلفة صيانة خارجية' && tx.transaction_type === 'income') {
          externalCostNet -= amt
        } else {
          throw new Error('لا يمكن حذف تذكرة مرتبطة بحركات خزينة غير معكوسة')
        }
      }

      if (Math.abs(roundMoney(paymentNet)) > 0 || Math.abs(roundMoney(externalCostNet)) > 0) {
        throw new Error('لا يمكن حذف تذكرة لها حركات خزينة غير معكوسة بالكامل')
      }
    }

    // Release repair serial back to previous state if sent to external repair
    if (oldTicket.product_serial_id) {
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

    // [FIN-05, FIN-13] Restore only active un-restored parts and log 'in' inventory movements before delete
    const activeParts = getActiveTicketParts(id)
    if (activeParts.length > 0) {
      const restoreMap = buildOldInventoryDeltaMap(activeParts)
      for (const entry of restoreMap.values()) {
        restoreTicketInventoryItem({
          ticketId: id,
          ticketNumber: oldTicket.ticket_number,
          technicianId: oldTicket.technician_id,
          partId: entry.partId,
          productId: entry.productId,
          variantId: entry.variantId,
          pieces: entry.pieces,
          unitCostPerPiece: entry.unitCostPerPiece,
          unitPricePerPiece: entry.unitPricePerPiece,
          partName: entry.partName,
          notesPrefix: 'استرجاع لحذف طلب صيانة'
        })
      }
    }

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