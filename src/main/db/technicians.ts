import { getDb } from './connection'
import { isDemoDataHidden } from './demo'
import { getBusinessState } from './business'
import type { Technician } from '../../shared/types'

export function listTechnicians(): Technician[] {
  const db = getDb()
  const bType = getBusinessState().type
  const demoFilter = isDemoDataHidden()
    ? ' WHERE tech.is_demo = 0'
    : ` WHERE (tech.is_demo = 0 OR tech.business_type = '${bType}' OR tech.business_type IS NULL OR tech.business_type = '')`
  return db
    .prepare(
      `SELECT tech.*,
        (SELECT COUNT(*) FROM maintenance_tickets mt
         WHERE mt.technician_id = tech.id AND mt.status NOT IN ('delivered', 'cancelled')) as active_tickets_count,
        COALESCE((SELECT SUM(
            CASE WHEN im.movement_type = 'custody_issue' THEN im.quantity
                 WHEN im.movement_type = 'custody_return' THEN -im.quantity
                 ELSE 0 END
          ) FROM inventory_movements im WHERE im.technician_id = tech.id), 0) as custody_parts_count,
        COALESCE((SELECT SUM(COALESCE(mt.commission_amount, MAX(0, (mt.labor_cost + mt.inspection_fee - COALESCE(mt.discount, 0))) * (COALESCE(mt.commission_rate, tech.commission_rate) / 100.0)))
          FROM maintenance_tickets mt
          WHERE mt.technician_id = tech.id AND mt.status IN ('repaired', 'delivered')), 0) as total_earned_commission,
        COALESCE((SELECT SUM(tt.amount) FROM treasury_transactions tt
          WHERE tt.technician_id = tech.id AND tt.transaction_type = 'tech_commission'), 0) as total_paid_commission
       FROM technicians tech
       ${demoFilter}
       ORDER BY tech.id DESC`
    )
    .all() as Technician[]
}

export function saveTechnician(data: Partial<Technician>): Technician {
  const db = getDb()
  if (data.id) {
    db.prepare(
      `UPDATE technicians
       SET name = ?, phone = ?, specialty = ?, commission_rate = ?, base_salary = ?, is_active = ?, notes = ?, avatar_base64 = ?
       WHERE id = ?`
    ).run(
      data.name?.trim(),
      data.phone?.trim(),
      data.specialty?.trim() || 'شامل',
      Number(data.commission_rate ?? 30),
      Number(data.base_salary ?? 0),
      data.is_active ?? 1,
      data.notes?.trim() || '',
      data.avatar_base64 || '',
      data.id
    )
    return db.prepare('SELECT * FROM technicians WHERE id = ?').get(data.id) as Technician
  } else {
    const info = db
      .prepare(
        `INSERT INTO technicians (name, phone, specialty, commission_rate, base_salary, is_active, notes, avatar_base64)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name?.trim(),
        data.phone?.trim(),
        data.specialty?.trim() || 'شامل',
        Number(data.commission_rate ?? 30),
        Number(data.base_salary ?? 0),
        data.is_active ?? 1,
        data.notes?.trim() || '',
        data.avatar_base64 || ''
      )
    return db
      .prepare('SELECT * FROM technicians WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Technician
  }
}

export function deleteTechnician(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM technicians WHERE id = ?').run(id)
}

