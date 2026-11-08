import { shell } from 'electron'
import { join, extname } from 'path'
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { randomBytes } from 'crypto'
import { db, runTransaction } from '../connection'
import { getPatientAttachmentsDir } from '../settings'
import { listHearingTests } from './tests'
import { listFollowups } from './followups'
import { listEarmoldOrders } from './earmolds'
import { listImplants } from './implants'
import { listTickets, normalizeTicketRow } from '../tickets'
import { getCustomerAppliances, normalizeCustomerRow } from '../customers'
import { listSalesInvoices } from '../sales'
import type { PatientAttachment, PatientProfileBundle, AttachmentCategory, MaintenanceTicket } from '../../../shared/types'

export function listPatientAttachments(
  patientId: number,
  entityType?: string,
  entityId?: number
): PatientAttachment[] {
  const clauses = ['patient_id = ?']
  const params: unknown[] = [Number(patientId)]

  if (entityType) {
    clauses.push('entity_type = ?')
    params.push(entityType)
  }
  if (entityId) {
    clauses.push('entity_id = ?')
    params.push(Number(entityId))
  }

  return db
    .prepare(
      `SELECT * FROM patient_attachments
       WHERE ${clauses.join(' AND ')}
       ORDER BY id DESC`
    )
    .all(...params) as PatientAttachment[]
}

export function savePatientAttachment(payload: {
  patient_id: number
  entity_type?: PatientAttachment['entity_type']
  entity_id?: number | null
  title: string
  category?: AttachmentCategory
  file_name: string
  mime_type?: string
  data_base64: string
  notes?: string
}): PatientAttachment {
  if (!payload.patient_id) throw new Error('يجب تحديد المريض لحفظ المرفق')
  if (!payload.data_base64) throw new Error('ملف المرفق فارغ')

  const attachDir = getPatientAttachmentsDir()
  const rawBase64 = payload.data_base64.includes(',')
    ? payload.data_base64.split(',')[1]
    : payload.data_base64
  const buffer = Buffer.from(rawBase64, 'base64')

  const safeExt = extname(payload.file_name || '').slice(0, 12) || '.bin'
  const storedName = `pat_${payload.patient_id}_${Date.now()}_${randomBytes(4).toString('hex')}${safeExt}`
  const fullPath = join(attachDir, storedName)

  writeFileSync(fullPath, buffer)

  const info = db
    .prepare(
      `INSERT INTO patient_attachments (
        patient_id, entity_type, entity_id, title, category,
        file_name, stored_name, mime_type, file_size, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(payload.patient_id),
      payload.entity_type || 'patient',
      payload.entity_id || null,
      payload.title?.trim() || payload.file_name,
      payload.category || 'general',
      payload.file_name,
      storedName,
      payload.mime_type || 'application/octet-stream',
      buffer.byteLength,
      payload.notes?.trim() || ''
    )

  return db
    .prepare('SELECT * FROM patient_attachments WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as PatientAttachment
}

export function openOrReadPatientAttachment(
  id: number,
  openExternalInOs = false
): {
  attachment: PatientAttachment
  dataUrl?: string
  openedExternal?: boolean
} {
  const att = db
    .prepare('SELECT * FROM patient_attachments WHERE id = ?')
    .get(id) as PatientAttachment | undefined
  if (!att) throw new Error('المرفق غير موجود في قاعدة البيانات')

  const fullPath = join(getPatientAttachmentsDir(), att.stored_name)
  if (!existsSync(fullPath)) {
    throw new Error('ملف المرفق غير موجود على القرص المحلي')
  }

  let openedExternal = false
  if (openExternalInOs) {
    try {
      shell.openPath(fullPath)
      openedExternal = true
    } catch {
      // Ignore OS external open error
    }
  }

  const buf = readFileSync(fullPath)
  const mime = att.mime_type || 'application/octet-stream'
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
  return { attachment: att, dataUrl, openedExternal }
}

export function deletePatientAttachment(id: number): void {
  const att = db
    .prepare('SELECT * FROM patient_attachments WHERE id = ?')
    .get(id) as PatientAttachment | undefined
  if (att) {
    const fullPath = join(getPatientAttachmentsDir(), att.stored_name)
    try {
      if (existsSync(fullPath)) unlinkSync(fullPath)
    } catch {
      // Ignore file removal error
    }
    db.prepare('DELETE FROM patient_attachments WHERE id = ?').run(id)
  }
}

export function getPatientProfileBundle(patientId: number): PatientProfileBundle {
  const rawCust = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(patientId) as Record<string, unknown> | undefined
  if (!rawCust) throw new Error('ملف المريض غير موجود')

  const patient = normalizeCustomerRow(rawCust)
  const appliances = getCustomerAppliances(patient.id)
  const rawTickets = db
    .prepare('SELECT * FROM maintenance_tickets WHERE customer_id = ? ORDER BY id DESC')
    .all(patient.id) as Record<string, unknown>[]
  const tickets = rawTickets.map(normalizeTicketRow)
  const salesInvoices = listSalesInvoices({ customer_id: patient.id })
  const hearingTests = listHearingTests({ patient_id: patient.id })
  const followups = listFollowups({ patient_id: patient.id })
  const earmoldOrders = listEarmoldOrders({ patient_id: patient.id })
  const implants = listImplants({ patient_id: patient.id })
  const attachments = listPatientAttachments(patient.id)

  return {
    patient,
    appliances,
    tickets,
    salesInvoices,
    hearingTests,
    followups,
    earmoldOrders,
    implants,
    attachments
  }
}