import { existsSync } from 'fs'
import { getDb, runTransaction } from './connection'
import {
  readSetting,
  writeSetting,
  createPreSwitchBackup,
  resolveConfiguredBusinessType
} from './settings'
import { createTables } from './schema/tables'
import { runMigrations } from './schema/migrations'
import { seedDefaults } from './schema/seeds'
import {
  signBusinessType,
  signBusinessTypeForMachine,
  verifyPassword
} from './crypto'
import type { BusinessType, BusinessState } from '../../shared/types'
import {
  getBusinessProfile,
  APPLIANCES_PROFILE,
  HEARING_AIDS_PROFILE
} from '../../shared/businessProfiles'

export { signBusinessType, signBusinessTypeForMachine }

export function writeBusinessSignatures(type: string): void {
  writeSetting('business_type_sig', signBusinessType(type))
  writeSetting('business_type_msig', signBusinessTypeForMachine(type))
}

export function getLicensedModules(): string[] {
  return []
}

export function isBusinessDataEmpty(): {
  empty: boolean
  counts: Record<string, number>
  total: number
} {
  const db = getDb()
  const tables = [
    'customers',
    'customer_appliances',
    'technicians',
    'spare_parts',
    'products',
    'suppliers',
    'purchase_invoices',
    'sales_invoices',
    'maintenance_tickets',
    'ticket_parts',
    'inventory_movements',
    'treasury_transactions',
    'hearing_tests',
    'followups',
    'earmold_orders',
    'implants',
    'patient_attachments'
  ]

  const counts: Record<string, number> = {}
  let total = 0

  for (const table of tables) {
    try {
      const res = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }
      counts[table] = res?.cnt || 0
      total += counts[table]
    } catch {
      counts[table] = 0
    }
  }

  return {
    empty: total === 0,
    counts,
    total
  }
}

export function getBusinessState(): BusinessState {
  const db = getDb()
  const typeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('business_type') as
    | { value: string }
    | undefined
  const sigRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('business_type_sig') as
    | { value: string }
    | undefined

  const licensedModules = getLicensedModules()

  if (!typeRow || !typeRow.value) {
    const dataCheck = isBusinessDataEmpty()
    const otherUsersCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM users WHERE username != 'admin'").get() as { cnt: number }
    ).cnt

    if (dataCheck.empty && otherUsersCount === 0) {
      const initialType = resolveConfiguredBusinessType()
      const initialProfile = getBusinessProfile(initialType) || APPLIANCES_PROFILE
      return {
        type: initialType,
        locked: false,
        needsSetup: true,
        appName: initialProfile.appName,
        licensedModules: [],
        effectiveModules: initialProfile.modules
      }
    }

    // Existing database from previous versions: backfill to appliances
    const defaultType: BusinessType = 'appliances'
    writeSetting('business_type', defaultType)
    writeBusinessSignatures(defaultType)

    const effectiveModules = Array.from(new Set([...APPLIANCES_PROFILE.modules, ...licensedModules]))

    return {
      type: defaultType,
      locked: false,
      needsSetup: false,
      appName: 'صلحلي',
      licensedModules,
      effectiveModules
    }
  }

  const rawType = typeRow.value
  const isValidType = rawType === 'appliances' || rawType === 'hearing_aids'
  const businessType: BusinessType = isValidType ? (rawType as BusinessType) : 'appliances'
  const expectedSig = signBusinessType(rawType)
  const profile = getBusinessProfile(businessType)

  let machineBound = true
  if (isValidType && sigRow && sigRow.value === expectedSig) {
    const msig = readSetting('business_type_msig')
    if (msig) {
      machineBound = msig === signBusinessTypeForMachine(rawType)
    } else {
      // Database created before machine binding (v1.2.2 and older): bind it to this device now.
      writeSetting('business_type_msig', signBusinessTypeForMachine(rawType))
    }
  }

  if (!isValidType || !sigRow || sigRow.value !== expectedSig || !machineBound) {
    return {
      type: businessType,
      locked: true,
      needsSetup: false,
      appName: profile?.appName || 'صلحلي',
      licensedModules: [],
      effectiveModules: []
    }
  }

  const effectiveModules = Array.from(new Set([...(profile?.modules || []), ...licensedModules]))

  return {
    type: businessType,
    locked: false,
    needsSetup: false,
    appName: profile?.appName || 'صلحلي',
    licensedModules,
    effectiveModules
  }
}

export function getEffectiveModules(): string[] {
  const bState = getBusinessState()
  if (bState.locked) return []
  if (bState.effectiveModules && bState.effectiveModules.length > 0) {
    return bState.effectiveModules
  }
  const profile = getBusinessProfile(bState.type)
  const base = profile ? profile.modules : []
  const extra = getLicensedModules()
  return Array.from(new Set([...base, ...extra]))
}

export function setInitialBusinessType(type: BusinessType): BusinessState {
  const db = getDb()
  const current = getBusinessState()
  if (!current.needsSetup) {
    throw new Error('تم ضبط نشاط البرنامج مسبقاً، لا يمكن استخدام الإعداد الأولي مرة أخرى.')
  }

  const validTypes: BusinessType[] = ['appliances', 'hearing_aids']
  if (!validTypes.includes(type)) {
    throw new Error('نوع النشاط المحدد غير صالح.')
  }

  runTransaction(() => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type', type)
    writeBusinessSignatures(type)
    createTables(type)
    runMigrations()
    seedDefaults(type)

    if (type === 'hearing_aids') {
      const hearingProfile = HEARING_AIDS_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        hearingProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        hearingProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        hearingProfile.receiptFooterDefault
      )
    }

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (1, 'none', ?, 0, 'التعيين الأولي للنشاط عند أول تشغيل')`
    ).run(type)
  })

  return getBusinessState()
}

const switchRateLimits = new Map<number, { count: number; lockedUntil: number }>()

export function switchBusinessType(
  payload: { type: BusinessType; password?: string },
  sessionUserId: number
): BusinessState {
  const db = getDb()
  const current = getBusinessState()
  if (current.type === payload.type && !current.locked) {
    return current
  }

  const validTypes: BusinessType[] = ['appliances', 'hearing_aids']
  if (!validTypes.includes(payload.type)) {
    throw new Error('نوع النشاط المطلوب غير صالح.')
  }

  const dataCheck = isBusinessDataEmpty()

  if (!dataCheck.empty || current.locked) {
    const now = Date.now()
    const rate = switchRateLimits.get(sessionUserId)
    if (rate && rate.lockedUntil > now) {
      const waitSec = Math.ceil((rate.lockedUntil - now) / 1000)
      throw new Error(`تم إيقاف المحاولات مؤقتاً بسبب تكرار كلمة المرور الخاطئة. يرجى الانتظار ${waitSec} ثانية.`)
    }

    if (!payload.password) {
      throw new Error('يلزم إدخال كلمة مرور السوبر أدمن لتأكيد العملية.')
    }

    const userRow = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(sessionUserId) as { password_hash: string } | undefined

    if (!userRow) {
      throw new Error('مستخدم السوبر أدمن غير موجود.')
    }

    const { valid } = verifyPassword(payload.password, userRow.password_hash)
    if (!valid) {
      const curCount = (rate?.count || 0) + 1
      if (curCount >= 3) {
        switchRateLimits.set(sessionUserId, { count: 0, lockedUntil: now + 60 * 1000 })
        throw new Error('كلمة المرور غير صحيحة. تم قفل المحاولات لمدة دقيقة واحدة.')
      } else {
        switchRateLimits.set(sessionUserId, { count: curCount, lockedUntil: 0 })
        throw new Error(`كلمة مرور السوبر أدمن غير صحيحة. المحاولة (${curCount} من 3).`)
      }
    }

    switchRateLimits.delete(sessionUserId)

    if (!dataCheck.empty) {
      const backupPath = createPreSwitchBackup()
      if (!backupPath || !existsSync(backupPath)) {
        throw new Error('تعذر إنشاء نسخة احتياطية تلقائية قبل التبديل. تم إيقاف العملية للحفاظ على أمان البيانات.')
      }
    }
  }

  const fromType = current.type
  const toType = payload.type

  runTransaction(() => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type', toType)
    writeBusinessSignatures(toType)
    createTables(toType)
    runMigrations()
    seedDefaults(toType)

    const curName = (
      db.prepare('SELECT value FROM settings WHERE key = ?').get('center_name') as { value: string }
    )?.value

    if (toType === 'hearing_aids' && (!curName || curName === APPLIANCES_PROFILE.centerNameDefault)) {
      const hearingProfile = HEARING_AIDS_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        hearingProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        hearingProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        hearingProfile.receiptFooterDefault
      )
    } else if (toType === 'appliances' && (!curName || curName === HEARING_AIDS_PROFILE.centerNameDefault)) {
      const appProfile = APPLIANCES_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        appProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        appProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        appProfile.receiptFooterDefault
      )
    }

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      sessionUserId,
      fromType,
      toType,
      dataCheck.empty ? 0 : 1,
      dataCheck.empty ? 'تبديل النشاط (قاعدة بيانات فارغة)' : 'تبديل النشاط بعد تأكيد كلمة المرور وأخذ نسخة احتياطية'
    )
  })

  return getBusinessState()
}

/**
 * Automatically activates the business activity assigned to an owner user upon login/session verification.
 */
export function activateOwnerBusinessType(type: BusinessType, userId: number): BusinessState {
  const validTypes: BusinessType[] = ['appliances', 'hearing_aids']
  if (!validTypes.includes(type)) {
    return getBusinessState()
  }

  const current = getBusinessState()
  if (current.locked || current.needsSetup || current.type === type) {
    return current
  }

  const db = getDb()
  const fromType = current.type

  runTransaction(() => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('business_type', type)
    writeBusinessSignatures(type)
    createTables(type)
    runMigrations()
    seedDefaults(type)

    const curName = readSetting('center_name')
    if (type === 'hearing_aids' && (!curName || curName === APPLIANCES_PROFILE.centerNameDefault)) {
      const hearingProfile = HEARING_AIDS_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        hearingProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        hearingProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        hearingProfile.receiptFooterDefault
      )
    } else if (type === 'appliances' && (!curName || curName === HEARING_AIDS_PROFILE.centerNameDefault)) {
      const appProfile = APPLIANCES_PROFILE
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_name',
        appProfile.centerNameDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'center_subtitle',
        appProfile.centerSubtitleDefault
      )
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'receipt_footer',
        appProfile.receiptFooterDefault
      )
    }

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (?, ?, ?, 1, 'تفعيل تلقائي للنشاط المخصص لحساب مالك البرنامج عند تسجيل الدخول')`
    ).run(userId, fromType, type)
  })

  return getBusinessState()
}
