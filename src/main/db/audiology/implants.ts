import { db, runTransaction } from '../connection'
import { parseJsonObject, stringifyExtraData, getLocalDateString } from '../utils'
import { saveCustomerAppliance } from '../customers'
import { isDemoDataHidden } from '../demo'
import type { CochlearImplant, ImplantSession, ImplantAccessories, ImplantThresholds } from '../../../shared/types'

export function normalizeImplantSessionRow(row: Record<string, unknown>): ImplantSession {
  return {
    ...(row as unknown as ImplantSession),
    thresholds: parseJsonObject(row.thresholds_json) as ImplantThresholds
  }
}

export function normalizeImplantRow(row: Record<string, unknown>): CochlearImplant {
  const id = Number(row.id)
  const rawSessions = db
    .prepare(
      `SELECT ims.*,
              c.name as patient_name,
              imp.brand as implant_brand,
              imp.ear as implant_ear,
              pa.file_name as map_file_name
       FROM implant_sessions ims
       LEFT JOIN customers c ON c.id = ims.patient_id
       LEFT JOIN implants imp ON imp.id = ims.implant_id
       LEFT JOIN patient_attachments pa ON pa.id = ims.map_attachment_id
       WHERE ims.implant_id = ?
       ORDER BY ims.session_date DESC, ims.id DESC`
    )
    .all(id) as Record<string, unknown>[]

  return {
    ...(row as unknown as CochlearImplant),
    accessories: parseJsonObject(row.accessories_json) as ImplantAccessories,
    sessions: rawSessions.map(normalizeImplantSessionRow)
  }
}

export function listImplants(filters?: {
  patient_id?: number
  search?: string
}): CochlearImplant[] {
  const clauses: string[] = ['1=1']
  const params: unknown[] = []

  if (filters?.patient_id) {
    clauses.push('imp.patient_id = ?')
    params.push(Number(filters.patient_id))
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.push(
      '(c.name LIKE ? OR c.phone LIKE ? OR imp.brand LIKE ? OR imp.internal_serial LIKE ? OR imp.processor_serial_no LIKE ?)'
    )
    params.push(q, q, q, q, q)
  }
  if (isDemoDataHidden()) {
    clauses.push('imp.is_demo = 0')
  }

  const rows = db
    .prepare(
      `SELECT imp.*,
              c.name as patient_name,
              c.phone as patient_phone
       FROM implants imp
       LEFT JOIN customers c ON c.id = imp.patient_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY imp.id DESC`
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(normalizeImplantRow)
}

export function saveImplant(data: Partial<CochlearImplant>): CochlearImplant {
  return runTransaction(() => {
    if (!data.patient_id) throw new Error('يجب تحديد المريض لحفظ بيانات زراعة القوقعة')
    const accessoriesJson = stringifyExtraData(data.accessories)

    let processorDeviceId = data.processor_device_id || null
    const procSerialNo = data.processor_serial_no?.trim() || ''
    const procModel = data.processor_model?.trim() || ''
    const brand = data.brand?.trim() || 'Cochlear (كوكلير - قوقعة)'

    // Auto-sync external Sound Processor to customer_appliances if provided
    if ((procModel || procSerialNo) && !processorDeviceId) {
      const existingApp = db
        .prepare(
          `SELECT id FROM customer_appliances
           WHERE customer_id = ? AND (serial_number = ? OR (brand = ? AND model = ?))
           LIMIT 1`
        )
        .get(data.patient_id, procSerialNo, brand, procModel) as { id: number } | undefined

      if (existingApp) {
        processorDeviceId = existingApp.id
      } else {
        const earLabel = data.ear === 'left' ? 'يسار (Left)' : 'يمين (Right)'
        const createdApp = saveCustomerAppliance({
          customer_id: Number(data.patient_id),
          appliance_type: 'قوقعة إلكترونية - معالج صوت (Cochlear Implant)',
          brand,
          model: procModel,
          serial_number: procSerialNo,
          last_warranty_end: data.processor_warranty_end || null,
          notes: `معالج قوقعة مرتبط بملف زراعة القوقعة (${earLabel})`,
          extra_data: {
            ear_side: earLabel,
            ...(data.ear === 'left'
              ? { serial_left: procSerialNo }
              : { serial_right: procSerialNo })
          }
        })
        processorDeviceId = createdApp.id
      }
    }

    if (data.id) {
      db.prepare(
        `UPDATE implants SET
          ear = ?, brand = ?, internal_model = ?, internal_serial = ?,
          surgery_date = ?, hospital = ?, surgeon = ?, activation_date = ?,
          processor_device_id = ?, processor_serial_id = ?,
          processor_model = ?, processor_serial_no = ?, processor_warranty_end = ?,
          accessories_json = ?, notes = ?
         WHERE id = ?`
      ).run(
        data.ear === 'left' ? 'left' : 'right',
        brand,
        data.internal_model?.trim() || '',
        data.internal_serial?.trim() || '',
        data.surgery_date || null,
        data.hospital?.trim() || '',
        data.surgeon?.trim() || '',
        data.activation_date || null,
        processorDeviceId,
        data.processor_serial_id || null,
        procModel,
        procSerialNo,
        data.processor_warranty_end || null,
        accessoriesJson,
        data.notes?.trim() || '',
        data.id
      )
      return listImplants({ patient_id: Number(data.patient_id) }).find((i) => i.id === data.id)!
    } else {
      const info = db
        .prepare(
          `INSERT INTO implants (
            patient_id, ear, brand, internal_model, internal_serial,
            surgery_date, hospital, surgeon, activation_date,
            processor_device_id, processor_serial_id,
            processor_model, processor_serial_no, processor_warranty_end,
            accessories_json, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          Number(data.patient_id),
          data.ear === 'left' ? 'left' : 'right',
          brand,
          data.internal_model?.trim() || '',
          data.internal_serial?.trim() || '',
          data.surgery_date || null,
          data.hospital?.trim() || '',
          data.surgeon?.trim() || '',
          data.activation_date || null,
          processorDeviceId,
          data.processor_serial_id || null,
          procModel,
          procSerialNo,
          data.processor_warranty_end || null,
          accessoriesJson,
          data.notes?.trim() || ''
        )
      const newId = Number(info.lastInsertRowid)
      return listImplants({ patient_id: Number(data.patient_id) }).find((i) => i.id === newId)!
    }
  })
}

export function deleteImplant(id: number): void {
  db.prepare('DELETE FROM implants WHERE id = ?').run(id)
}

export function saveImplantSession(data: Partial<ImplantSession>): ImplantSession {
  return runTransaction(() => {
    if (!data.implant_id || !data.patient_id) {
      throw new Error('يجب تحديد سجل القوقعة والمريض لحفظ جلسة البرمجة')
    }
    const thresholdsJson = stringifyExtraData(data.thresholds)
    const sessionDate = data.session_date || getLocalDateString()
    const sessionType = data.session_type || 'mapping'

    let examinerName = data.examiner_name?.trim() || ''
    if (data.technician_id && !examinerName) {
      const tech = db
        .prepare('SELECT name FROM technicians WHERE id = ?')
        .get(data.technician_id) as { name: string } | undefined
      if (tech) examinerName = tech.name
    }

    let followupId = data.followup_id || null
    if (data.next_due_date) {
      const imp = db
        .prepare('SELECT processor_device_id, processor_serial_no, brand, ear FROM implants WHERE id = ?')
        .get(data.implant_id) as
        | {
            processor_device_id: number | null
            processor_serial_no: string
            brand: string
            ear: string
          }
        | undefined

      const fType = sessionType === 'rehab' ? 'rehab' : 'mapping'
      const fNotes = `موعد جلسة ${fType === 'rehab' ? 'تأهيل سمعي ونطقي' : 'برمجة قوقعة (Mapping)'} قادمة (${imp?.brand || 'قوقعة'} - ${imp?.ear === 'left' ? 'يسار' : 'يمين'})`

      if (followupId) {
        db.prepare('UPDATE followups SET due_date = ?, type = ?, notes = ? WHERE id = ?').run(
          data.next_due_date,
          fType,
          fNotes,
          followupId
        )
      } else {
        const fInfo = db
          .prepare(
            `INSERT INTO followups (
              patient_id, device_id, serial_no, implant_id, type, status,
              due_date, technician_id, fitting_settings_json, notes
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, '{}', ?)`
          )
          .run(
            Number(data.patient_id),
            imp?.processor_device_id || null,
            imp?.processor_serial_no || '',
            Number(data.implant_id),
            fType,
            data.next_due_date,
            data.technician_id || null,
            fNotes
          )
        followupId = Number(fInfo.lastInsertRowid)
      }
    }

    let sessionId = Number(data.id || 0)
    if (sessionId > 0) {
      db.prepare(
        `UPDATE implant_sessions SET
          session_date = ?, session_type = ?, technician_id = ?, examiner_name = ?,
          program_notes = ?, thresholds_json = ?, map_attachment_id = ?,
          next_due_date = ?, followup_id = ?
         WHERE id = ?`
      ).run(
        sessionDate,
        sessionType,
        data.technician_id || null,
        examinerName,
        data.program_notes?.trim() || '',
        thresholdsJson,
        data.map_attachment_id || null,
        data.next_due_date || null,
        followupId,
        sessionId
      )
    } else {
      const info = db
        .prepare(
          `INSERT INTO implant_sessions (
            implant_id, patient_id, session_date, session_type,
            technician_id, examiner_name, program_notes, thresholds_json,
            map_attachment_id, next_due_date, followup_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          Number(data.implant_id),
          Number(data.patient_id),
          sessionDate,
          sessionType,
          data.technician_id || null,
          examinerName,
          data.program_notes?.trim() || '',
          thresholdsJson,
          data.map_attachment_id || null,
          data.next_due_date || null,
          followupId
        )
      sessionId = Number(info.lastInsertRowid)
    }

    const updatedImplant = listImplants({ patient_id: Number(data.patient_id) }).find(
      (i) => i.id === Number(data.implant_id)
    )
    return (updatedImplant?.sessions || []).find((s) => s.id === sessionId)!
  })
}

export function deleteImplantSession(id: number): void {
  db.prepare('DELETE FROM implant_sessions WHERE id = ?').run(id)
}

// ==========================================
// PATIENT ATTACHMENTS (4.4) & FULL PROFILE BUNDLE
// ==========================================
