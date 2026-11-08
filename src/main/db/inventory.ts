import { getDb, runTransaction } from './connection'
import type { SparePart, InventoryMovement } from '../../shared/types'
import { getBusinessState } from './business'
import {
  listElectSpareParts,
  saveElectSparePart,
  deleteElectSparePart,
  recordElectInventoryMovement,
  listElectInventoryMovements
} from './appliances/inventory'
import {
  listMedicalSpareParts,
  saveMedicalSparePart,
  deleteMedicalSparePart
} from './hearing_aids/inventory'

export function listSpareParts(search = ''): SparePart[] {
  const bState = getBusinessState()
  if (bState.type === 'hearing_aids') {
    return listMedicalSpareParts(search)
  }
  return listElectSpareParts(search)
}

export function saveSparePart(data: Partial<SparePart>): SparePart {
  const bState = getBusinessState()
  if (bState.type === 'hearing_aids') {
    return saveMedicalSparePart(data)
  }
  return saveElectSparePart(data)
}

export function deleteSparePart(id: number): void {
  const bState = getBusinessState()
  if (bState.type === 'hearing_aids') {
    deleteMedicalSparePart(id)
  } else {
    deleteElectSparePart(id)
  }
}

export function recordInventoryMovement(payload: {
  part_id: number
  technician_id?: number | null
  ticket_id?: number | null
  movement_type: InventoryMovement['movement_type']
  quantity: number
  notes?: string
  recordInTreasury?: boolean
}): void {
  const bState = getBusinessState()
  const tableName = bState.type === 'hearing_aids' ? 'medicalmain_spare_parts' : 'elect_spare_parts'

  const db = getDb()
  runTransaction(() => {
    const part = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(payload.part_id) as
      | SparePart
      | undefined
    if (!part) throw new Error('قطعة الغيار غير موجودة')

    const qty = Math.abs(Number(payload.quantity))
    if (qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')

    let delta = 0
    if (payload.movement_type === 'in' || payload.movement_type === 'custody_return') {
      delta = qty
    } else {
      if (part.quantity < qty) {
        throw new Error(`الكمية المتاحة في المخزن (${part.quantity}) غير كافية لصرف (${qty})`)
      }
      delta = -qty
    }

    db.prepare(`UPDATE ${tableName} SET quantity = quantity + ? WHERE id = ?`).run(delta, part.id)

    db.prepare(
      `INSERT INTO inventory_movements (part_id, technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      part.id,
      payload.technician_id || null,
      payload.ticket_id || null,
      payload.movement_type,
      qty,
      part.purchase_price,
      part.selling_price,
      payload.notes || ''
    )

    if (payload.movement_type === 'in' && payload.recordInTreasury) {
      const totalPurchase = qty * part.purchase_price
      if (totalPurchase > 0) {
        db.prepare(
          `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
           VALUES ('expense', 'شراء قطع غيار', ?, 'cash', ?)`
        ).run(totalPurchase, `توريد مخزني: ${qty} × ${part.name} (${part.code})`)
      }
    }
  })
}

export function listInventoryMovements(): InventoryMovement[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT im.*,
              COALESCE(
                sp.name,
                CASE WHEN pv.variant_name IS NOT NULL AND pv.variant_name != ''
                     THEN p.name || ' (' || pv.variant_name || ')'
                     ELSE p.name END,
                ''
              ) as part_name,
              COALESCE(sp.code, p.code, '') as part_code,
              COALESCE(t.name, '') as technician_name,
              COALESCE(mt.ticket_number, '') as ticket_number
       FROM inventory_movements im
       LEFT JOIN spare_parts sp ON sp.id = im.part_id
       LEFT JOIN products p ON p.id = im.product_id
       LEFT JOIN product_variants pv ON pv.id = im.variant_id
       LEFT JOIN technicians t ON t.id = im.technician_id
       LEFT JOIN maintenance_tickets mt ON mt.id = im.ticket_id
       ORDER BY im.id DESC LIMIT 200`
    )
    .all() as InventoryMovement[]
}
