import { getDb } from '../connection'
import { isDemoDataHidden } from '../demo'
import type { SparePart } from '../../../shared/types'

export function listMedicalSpareParts(search = ''): SparePart[] {
  const db = getDb()
  const q = `%${search.trim()}%`
  const demoFilter = isDemoDataHidden() ? ' AND is_demo = 0' : ''
  return db
    .prepare(
      `SELECT * FROM medicalmain_spare_parts
       WHERE (name LIKE ? OR code LIKE ? OR category LIKE ? OR brand LIKE ?)${demoFilter}
       ORDER BY id DESC`
    )
    .all(q, q, q, q) as SparePart[]
}

export function saveMedicalSparePart(data: Partial<SparePart>): SparePart {
  const db = getDb()
  if (data.id) {
    db.prepare(
      `UPDATE medicalmain_spare_parts
       SET code = ?, name = ?, category = ?, brand = ?, purchase_price = ?, selling_price = ?,
           quantity = ?, min_quantity = ?, location = ?, notes = ?, image_base64 = ?
       WHERE id = ?`
    ).run(
      data.code?.trim(),
      data.name?.trim(),
      data.category?.trim() || 'عام',
      data.brand?.trim() || 'عام',
      Number(data.purchase_price ?? 0),
      Number(data.selling_price ?? 0),
      Number(data.quantity ?? 0),
      Number(data.min_quantity ?? 3),
      data.location?.trim() || '',
      data.notes?.trim() || '',
      data.image_base64 || '',
      data.id
    )
    return db.prepare('SELECT * FROM medicalmain_spare_parts WHERE id = ?').get(data.id) as SparePart
  } else {
    const code = data.code?.trim() || `MED-PT-${Date.now().toString().slice(-5)}`
    const info = db
      .prepare(
        `INSERT INTO medicalmain_spare_parts (code, name, category, brand, purchase_price, selling_price, quantity, min_quantity, location, notes, image_base64)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        data.name?.trim(),
        data.category?.trim() || 'عام',
        data.brand?.trim() || 'عام',
        Number(data.purchase_price ?? 0),
        Number(data.selling_price ?? 0),
        Number(data.quantity ?? 0),
        Number(data.min_quantity ?? 3),
        data.location?.trim() || '',
        data.notes?.trim() || '',
        data.image_base64 || ''
      )
    return db
      .prepare('SELECT * FROM medicalmain_spare_parts WHERE id = ?')
      .get(info.lastInsertRowid) as SparePart
  }
}

export function deleteMedicalSparePart(id: number): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM medicalmain_spare_parts WHERE id = ?').run(id)
  return info.changes > 0
}

