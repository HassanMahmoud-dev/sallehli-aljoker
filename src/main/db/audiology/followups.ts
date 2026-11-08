import { db, runTransaction } from '../connection'
import { roundMoney, parseJsonObject, stringifyExtraData, getLocalDateString } from '../utils'
import { isDemoDataHidden } from '../demo'
import type { FollowupItem, FittingSettings } from '../../../shared/types'

export function normalizeFollowupRow(row: Record<string, unknown>): FollowupItem {
  return {
    ...(row as unknown as FollowupItem),
    fitting_settings: parseJsonObject(row.fitting_settings_json) as FittingSettings
  }
}

export function listFollowups(filters?: {
  patient_id?: number
  status?: string
  filter_mode?: 'all' | 'today' | 'overdue' | 'upcoming' | 'completed'
  type?: string
  search?: string
}): FollowupItem[] {
  const today = getLocalDateString()
  const clauses: string[] = ['1=1']
  const params: unknown[] = []

  if (filters?.patient_id) {
    clauses.push('f.patient_id = ?')
    params.push(Number(filters.patient_id))
  }
  if (filters?.status && filters.status !== 'all') {
    clauses.push('f.status = ?')
    params.push(filters.status)
  }
  if (filters?.type && filters.type !== 'all') {
    clauses.push('f.type = ?')
    params.push(filters.type)
  }
  if (filters?.filter_mode === 'today') {
    clauses.push("f.status = 'pending' AND f.due_date = ?")
    params.push(today)
  } else if (filters?.filter_mode === 'overdue') {
    clauses.push("f.status = 'pending' AND f.due_date < ?")
    params.push(today)
  } else if (filters?.filter_mode === 'upcoming') {
    clauses.push("f.status = 'pending' AND f.due_date >= ?")
    params.push(today)
  } else if (filters?.filter_mode === 'completed') {
    clauses.push("f.status = 'completed'")
  }

  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.push('(c.name LIKE ? OR c.phone LIKE ? OR f.serial_no LIKE ? OR f.notes LIKE ?)')
    params.push(q, q, q, q)
  }

  if (isDemoDataHidden()) {
    clauses.push('f.is_demo = 0')
  }

  const rows = db
    .prepare(
      `SELECT f.*,
              c.name as patient_name,
              c.phone as patient_phone,
              CASE WHEN ca.id IS NOT NULL
                   THEN ca.appliance_type || ' - ' || ca.brand || ' ' || ca.model
                   ELSE '' END as device_name,
              t.name as technician_name
       FROM followups f
       LEFT JOIN customers c ON c.id = f.patient_id
       LEFT JOIN customer_appliances ca ON ca.id = f.device_id
       LEFT JOIN technicians t ON t.id = f.technician_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY CASE WHEN f.status = 'pending' THEN 0 ELSE 1 END ASC, f.due_date ASC, f.id DESC`
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(normalizeFollowupRow)
}

export function saveFollowup(data: Partial<FollowupItem>): FollowupItem {
  if (!data.patient_id) throw new Error('يجب تحديد المريض لحفظ المتابعة')
  const fittingJson = stringifyExtraData(data.fitting_settings)
  const dueDate = data.due_date || getLocalDateString()
  const status = data.status || 'pending'
  const doneDate =
    status === 'completed'
      ? data.done_date || getLocalDateString()
      : data.done_date || null

  if (data.id) {
    db.prepare(
      `UPDATE followups SET
        device_id = ?, serial_no = ?, implant_id = ?, type = ?, status = ?,
        due_date = ?, done_date = ?, technician_id = ?, fitting_settings_json = ?, notes = ?
       WHERE id = ?`
    ).run(
      data.device_id || null,
      data.serial_no?.trim() || '',
      data.implant_id || null,
      data.type || 'fitting',
      status,
      dueDate,
      doneDate,
      data.technician_id || null,
      fittingJson,
      data.notes?.trim() || '',
      data.id
    )
    return listFollowups({ patient_id: Number(data.patient_id) }).find((f) => f.id === data.id)!
  } else {
    const info = db
      .prepare(
        `INSERT INTO followups (
          patient_id, device_id, serial_no, implant_id, type, status,
          due_date, done_date, technician_id, fitting_settings_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(data.patient_id),
        data.device_id || null,
        data.serial_no?.trim() || '',
        data.implant_id || null,
        data.type || 'fitting',
        status,
        dueDate,
        doneDate,
        data.technician_id || null,
        fittingJson,
        data.notes?.trim() || ''
      )
    const newId = Number(info.lastInsertRowid)
    return listFollowups({ patient_id: Number(data.patient_id) }).find((f) => f.id === newId)!
  }
}

export function completeFollowup(payload: {
  id: number
  notes?: string
  fitting_settings?: FittingSettings
  schedule_next_date?: string | null
  next_type?: FollowupItem['type']
}): FollowupItem {
  return runTransaction(() => {
    const existingRaw = db
      .prepare('SELECT * FROM followups WHERE id = ?')
      .get(payload.id) as Record<string, unknown> | undefined
    if (!existingRaw) throw new Error('سجل المتابعة غير موجود')
    const existing = normalizeFollowupRow(existingRaw)

    const today = getLocalDateString()
    const mergedFitting = {
      ...(existing.fitting_settings || {}),
      ...(payload.fitting_settings || {})
    }
    const mergedNotes = payload.notes?.trim() || existing.notes

    db.prepare(
      `UPDATE followups SET
        status = 'completed', done_date = ?, fitting_settings_json = ?, notes = ?
       WHERE id = ?`
    ).run(today, stringifyExtraData(mergedFitting), mergedNotes, payload.id)

    if (payload.schedule_next_date) {
      db.prepare(
        `INSERT INTO followups (
          patient_id, device_id, serial_no, implant_id, type, status,
          due_date, technician_id, fitting_settings_json, notes
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, '{}', ?)`
      ).run(
        existing.patient_id,
        existing.device_id,
        existing.serial_no,
        existing.implant_id,
        payload.next_type || existing.type,
        payload.schedule_next_date,
        existing.technician_id,
        `موعد متابعة تالٍ مجدول تلقائياً بعد جلسة ${today}`
      )
    }

    return listFollowups({ patient_id: existing.patient_id }).find((f) => f.id === payload.id)!
  })
}

export function deleteFollowup(id: number): void {
  db.prepare('DELETE FROM followups WHERE id = ?').run(id)
}

// ==========================================
// EARMOLD ORDERS (4.3.1)
// ==========================================
