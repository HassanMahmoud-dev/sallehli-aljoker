import { getDb, runTransaction } from '../connection'
import { isDemoDataHidden } from '../demo'
import type { SparePart, InventoryMovement } from '../../../shared/types'

export function listElectSpareParts(search = ''): SparePart[] {
  const db = getDb()
  const q = `%${search.trim()}%`
  const demoFilter = isDemoDataHidden() ? ' AND is_demo = 0' : ''
  return db
    .prepare(
      `SELECT * FROM elect_spare_parts
       WHERE (name LIKE ? OR code LIKE ? OR category LIKE ? OR brand LIKE ?)${demoFilter}
       ORDER BY id DESC`
    )
    .all(q, q, q, q) as SparePart[]
}

export function saveElectSparePart(data: Partial<SparePart>): SparePart {
  return runTransaction(() => {
    const db = getDb()
    if (data.id) {
      const existing = db
        .prepare('SELECT * FROM elect_spare_parts WHERE id = ?')
        .get(data.id) as SparePart | undefined
      if (!existing) {
        throw new Error('قطعة الغيار غير موجودة')
      }
      if (data.name !== undefined && !data.name.trim()) {
        throw new Error('يرجى إدخال اسم قطعة الغيار')
      }

      const hasExplicitQuantity =
        data.quantity !== undefined &&
        data.quantity !== null &&
        String(data.quantity).trim() !== '' &&
        Number.isFinite(Number(data.quantity))
      const nextQuantity = hasExplicitQuantity
        ? Math.max(0, Math.round(Number(data.quantity)))
        : existing.quantity

      db.prepare(
        `UPDATE elect_spare_parts
         SET code = ?, name = ?, category = ?, brand = ?, purchase_price = ?, selling_price = ?,
             quantity = ?, min_quantity = ?, location = ?, notes = ?, image_base64 = ?
         WHERE id = ?`
      ).run(
        data.code?.trim() || existing.code,
        data.name?.trim() || existing.name,
        data.category?.trim() || 'عام',
        data.brand?.trim() || 'عام',
        Number(data.purchase_price ?? 0),
        Number(data.selling_price ?? 0),
        nextQuantity,
        Number(data.min_quantity ?? 3),
        data.location?.trim() || '',
        data.notes?.trim() || '',
        data.image_base64 || '',
        data.id
      )
      return db.prepare('SELECT * FROM elect_spare_parts WHERE id = ?').get(data.id) as SparePart
    } else {
      const name = data.name?.trim()
      if (!name) {
        throw new Error('يرجى إدخال اسم قطعة الغيار')
      }
      const code = data.code?.trim() || `PT-${Date.now().toString().slice(-5)}`
      const info = db
        .prepare(
          `INSERT INTO elect_spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location, notes, image_base64)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          name,
          data.category?.trim() || 'عام',
          data.brand?.trim() || 'عام',
          Number(data.purchase_price ?? 0),
          Number(data.selling_price ?? 0),
          Math.max(0, Math.round(Number(data.quantity ?? 0))),
          Number(data.min_quantity ?? 3),
          data.location?.trim() || '',
          data.notes?.trim() || '',
          data.image_base64 || ''
        )
      return db
        .prepare('SELECT * FROM elect_spare_parts WHERE id = ?')
        .get(info.lastInsertRowid) as SparePart
    }
  })
}

export function deleteElectSparePart(id: number): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM elect_spare_parts WHERE id = ?').run(id)
  return info.changes > 0
}

export function recordElectInventoryMovement(payload: {
  part_id?: number | null
  product_id?: number | null
  variant_id?: number | null
  serial_no?: string
  ref_type?: string
  ref_id?: number | null
  technician_id?: number | null
  ticket_id?: number | null
  movement_type: 'in' | 'out' | 'adjust'
  quantity: number
  unit_cost?: number
  unit_price?: number
  notes?: string
}): InventoryMovement {
  return runTransaction(() => {
    const db = getDb()
    const part = payload.part_id
      ? (db.prepare('SELECT * FROM elect_spare_parts WHERE id = ?').get(payload.part_id) as SparePart)
      : null

    const unitCost = payload.unit_cost ?? part?.purchase_price ?? 0
    const unitPrice = payload.unit_price ?? part?.selling_price ?? 0

    const info = db
      .prepare(
        `INSERT INTO inventory_movements (
           part_id, product_id, variant_id, serial_no, ref_type, ref_id,
           technician_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.part_id ?? null,
        payload.product_id ?? null,
        payload.variant_id ?? null,
        payload.serial_no?.trim() || '',
        payload.ref_type?.trim() || '',
        payload.ref_id ?? null,
        payload.technician_id ?? null,
        payload.ticket_id ?? null,
        payload.movement_type,
        payload.quantity,
        unitCost,
        unitPrice,
        payload.notes?.trim() || ''
      )

    if (payload.part_id) {
      if (payload.movement_type === 'in') {
        db.prepare('UPDATE elect_spare_parts SET quantity = quantity + ? WHERE id = ?').run(
          payload.quantity,
          payload.part_id
        )
      } else if (payload.movement_type === 'out') {
        db.prepare('UPDATE elect_spare_parts SET quantity = quantity - ? WHERE id = ?').run(
          payload.quantity,
          payload.part_id
        )
      } else if (payload.movement_type === 'adjust') {
        db.prepare('UPDATE elect_spare_parts SET quantity = ? WHERE id = ?').run(
          payload.quantity,
          payload.part_id
        )
      }
    }

    return db
      .prepare('SELECT * FROM inventory_movements WHERE id = ?')
      .get(info.lastInsertRowid) as InventoryMovement
  })
}

export function listElectInventoryMovements(): InventoryMovement[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT m.*,
              COALESCE(p.name, '') as part_name,
              COALESCE(p.code, '') as part_code,
              COALESCE(t.name, '') as technician_name,
              COALESCE(tk.ticket_number, '') as ticket_number
       FROM inventory_movements m
       LEFT JOIN elect_spare_parts p ON m.part_id = p.id
       LEFT JOIN technicians t ON m.technician_id = t.id
       LEFT JOIN maintenance_tickets tk ON m.ticket_id = tk.id
       ORDER BY m.id DESC LIMIT 200`
    )
    .all() as InventoryMovement[]
}

