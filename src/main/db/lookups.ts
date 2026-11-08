import { db, runTransaction } from './connection'
import { parseJsonArray, parseJsonObject } from './utils'
import { getBusinessState } from './business'
import type { LookupItem, CustomFieldDef, CustomFieldEntity, BusinessType } from '../../shared/types'

export function listLookupItems(category?: string, businessType?: BusinessType): LookupItem[] {
  const activeType = businessType || getBusinessState().type
  let query = 'SELECT * FROM lookup_items WHERE business_type = ?'
  const params: unknown[] = [activeType]

  if (category) {
    query += ' AND category = ?'
    params.push(category)
  }

  query += ' ORDER BY sort_order ASC, value ASC'
  return db.prepare(query).all(...params) as LookupItem[]
}

export function saveLookupItem(data: Partial<LookupItem>): LookupItem {
  const activeType = data.business_type || getBusinessState().type
  if (!data.category || !data.value?.trim()) {
    throw new Error('بيانات القائمة غير مكتملة.')
  }

  const category = data.category
  const value = data.value.trim()
  const sortOrder = Number(data.sort_order || 0)
  const isActive = data.is_active !== undefined ? Number(data.is_active) : 1

  if (data.id) {
    db.prepare(
      `UPDATE lookup_items
       SET category = ?, value = ?, sort_order = ?, is_active = ?, business_type = ?
       WHERE id = ?`
    ).run(category, value, sortOrder, isActive, activeType, data.id)
    return db.prepare('SELECT * FROM lookup_items WHERE id = ?').get(data.id) as LookupItem
  } else {
    db.prepare(
      `INSERT INTO lookup_items (category, value, sort_order, is_active, business_type)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(category, value, business_type) DO UPDATE SET
         is_active = excluded.is_active,
         sort_order = excluded.sort_order`
    ).run(category, value, sortOrder, isActive, activeType)
    return db
      .prepare('SELECT * FROM lookup_items WHERE category = ? AND value = ? AND business_type = ?')
      .get(category, value, activeType) as LookupItem
  }
}

export function deleteLookupItem(id: number): void {
  db.prepare('DELETE FROM lookup_items WHERE id = ?').run(id)
}

export function reorderLookupItems(items: Array<{ id: number; sort_order: number }>): void {
  runTransaction(() => {
    const stmt = db.prepare('UPDATE lookup_items SET sort_order = ? WHERE id = ?')
    for (const item of items) {
      stmt.run(item.sort_order, item.id)
    }
  })
}

function normalizeCustomFieldRow(row: Record<string, unknown>): CustomFieldDef {
  return {
    ...(row as unknown as CustomFieldDef),
    options: parseJsonArray(row.options),
    required: Number(row.required || 0),
    show_in_table: Number(row.show_in_table || 0),
    sort_order: Number(row.sort_order || 0),
    is_active: Number(row.is_active ?? 1)
  }
}

export function listCustomFieldDefs(
  entity?: CustomFieldEntity,
  businessType?: BusinessType
): CustomFieldDef[] {
  const activeType = businessType || getBusinessState().type
  let query = 'SELECT * FROM custom_field_defs WHERE business_type = ?'
  const params: unknown[] = [activeType]

  if (entity) {
    query += ' AND entity = ?'
    params.push(entity)
  }

  query += ' ORDER BY sort_order ASC, id ASC'
  const rows = db.prepare(query).all(...params) as Record<string, unknown>[]
  return rows.map(normalizeCustomFieldRow)
}

export function saveCustomFieldDef(data: Partial<CustomFieldDef>): CustomFieldDef {
  const activeType = data.business_type || getBusinessState().type
  if (!data.entity || !data.label?.trim()) {
    throw new Error('يرجى إدخال اسم الحقل والكيان التابع له.')
  }

  const entity = data.entity
  const label = data.label.trim()
  const type = data.type || 'text'
  const optionsJson = JSON.stringify(Array.isArray(data.options) ? data.options : [])
  const required = data.required ? 1 : 0
  const showInTable = data.show_in_table ? 1 : 0
  const sortOrder = Number(data.sort_order || 0)
  const isActive = data.is_active !== undefined ? Number(data.is_active) : 1
  const cleanKey =
    data.key?.trim().replace(/[^a-zA-Z0-9_]/g, '_') || `cf_${Date.now().toString(36)}`

  if (data.id) {
    db.prepare(
      `UPDATE custom_field_defs
       SET entity = ?, label = ?, type = ?, options = ?, required = ?, show_in_table = ?, sort_order = ?, is_active = ?
       WHERE id = ?`
    ).run(entity, label, type, optionsJson, required, showInTable, sortOrder, isActive, data.id)

    const row = db
      .prepare('SELECT * FROM custom_field_defs WHERE id = ?')
      .get(data.id) as Record<string, unknown>
    return normalizeCustomFieldRow(row)
  } else {
    const info = db
      .prepare(
        `INSERT INTO custom_field_defs (
          business_type, entity, key, label, type, options, required, show_in_table, sort_order, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_type, entity, key) DO UPDATE SET
          label = excluded.label,
          type = excluded.type,
          options = excluded.options,
          required = excluded.required,
          show_in_table = excluded.show_in_table,
          sort_order = excluded.sort_order,
          is_active = excluded.is_active`
      )
      .run(
        activeType,
        entity,
        cleanKey,
        label,
        type,
        optionsJson,
        required,
        showInTable,
        sortOrder,
        isActive
      )

    const row = db
      .prepare(
        'SELECT * FROM custom_field_defs WHERE id = ? OR (business_type = ? AND entity = ? AND key = ?) LIMIT 1'
      )
      .get(Number(info.lastInsertRowid), activeType, entity, cleanKey) as Record<string, unknown>
    return normalizeCustomFieldRow(row)
  }
}

export function deleteCustomFieldDef(id: number): void {
  db.prepare('DELETE FROM custom_field_defs WHERE id = ?').run(id)
}

export function reorderCustomFieldDefs(items: Array<{ id: number; sort_order: number }>): void {
  runTransaction(() => {
    const stmt = db.prepare('UPDATE custom_field_defs SET sort_order = ? WHERE id = ?')
    for (const item of items) {
      stmt.run(item.sort_order, item.id)
    }
  })
}

// ==========================================
// 8. PHASE 3A: PRODUCTS, VARIANTS, SERIALS & SUPPLIERS (HEARING AIDS)
// ==========================================
