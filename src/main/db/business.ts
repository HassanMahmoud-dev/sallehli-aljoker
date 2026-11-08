import { existsSync } from 'fs'
import { getDb, runTransaction } from './connection'
import { readSetting, writeSetting, createPreSwitchBackup } from './settings'
import { createTables } from './schema/tables'
import { runMigrations } from './schema/migrations'
import { seedDefaults } from './schema/seeds'
import { getMachineId, verifyVendorLicense } from '../vendorLicense'
import { parseJsonArray } from './utils'
import {
  signBusinessType,
  signBusinessTypeForMachine,
  signLicensedModules,
  signLicensedModulesForMachine,
  verifyPassword
} from './crypto'
import type { BusinessType, BusinessState } from '../../shared/types'
import {
  getBusinessProfile,
  APPLIANCES_PROFILE,
  HEARING_AIDS_PROFILE
} from '../../shared/businessProfiles'

export {
  signBusinessType,
  signBusinessTypeForMachine,
  signLicensedModules,
  signLicensedModulesForMachine
}

export function writeBusinessSignatures(type: string): void {
  writeSetting('business_type_sig', signBusinessType(type))
  writeSetting('business_type_msig', signBusinessTypeForMachine(type))
}

export function getLicensedModules(): string[] {
  try {
    const rawModules = readSetting('licensed_modules')
    const sig = readSetting('licensed_modules_sig')
    if (!rawModules || !sig) return []
    const parsed = parseJsonArray(rawModules)
    if (!parsed || parsed.length === 0) return []
    if (sig !== signLicensedModules(parsed)) {
      console.warn('Tampered licensed_modules detected in settings; ignoring extra licensed modules.')
      return []
    }

    const msig = readSetting('licensed_modules_msig')
    if (msig) {
      if (msig !== signLicensedModulesForMachine(parsed)) {
        console.warn('licensed_modules belong to another machine; ignoring extra licensed modules.')
        return []
      }
    } else {
      // Databases created before machine binding: bind them to this device on first read.
      writeSetting('licensed_modules_msig', signLicensedModulesForMachine(parsed))
    }

    const vendorToken = readSetting('vendor_license')
    if (vendorToken) {
      try {
        verifyVendorLicense(vendorToken)
      } catch (err) {
        console.warn('Vendor license is no longer valid:', (err as Error).message)
        return []
      }
    }
    return parsed
  } catch {
    return []
  }
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
      return {
        type: 'appliances',
        locked: false,
        needsSetup: true,
        appName: 'صلحلي',
        licensedModules: [],
        effectiveModules: APPLIANCES_PROFILE.modules
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

export function setLicensedModules(
  modules: string[],
  sessionUserId = 1
): { success: boolean; modules: string[]; state: BusinessState } {
  const db = getDb()
  const allowedAddons = ['sales', 'purchases', 'products', 'suppliers', 'followups', 'inventory']
  const cleanMods = Array.from(
    new Set(
      modules
        .filter((m) => typeof m === 'string' && allowedAddons.includes(m.trim()))
        .map((m) => m.trim())
    )
  ).sort()

  const sig = signLicensedModules(cleanMods)
  const msig = signLicensedModulesForMachine(cleanMods)
  const jsonStr = JSON.stringify(cleanMods)

  runTransaction(() => {
    writeSetting('licensed_modules', jsonStr)
    writeSetting('licensed_modules_sig', sig)
    writeSetting('licensed_modules_msig', msig)
    // A manual super-admin selection replaces any previously applied vendor license.
    db.prepare('DELETE FROM settings WHERE key = ?').run('vendor_license')

    if (cleanMods.length > 0) {
      createTables(getBusinessState().type)
      runMigrations()
      seedDefaults()
    }

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (?, 'modules', 'modules', 0, ?)`
    ).run(sessionUserId, `تحديث الوحدات المرخصة إضافياً: [${cleanMods.join(', ')}]`)
  })

  return {
    success: true,
    modules: cleanMods,
    state: getBusinessState()
  }
}

/** Applies an Ed25519-signed vendor license (issued by Al-Joker Tech) granting add-on modules. */
export function applyVendorLicense(
  token: string,
  sessionUserId = 1
): { success: boolean; modules: string[]; issuedTo?: string; state: BusinessState } {
  const db = getDb()
  const payload = verifyVendorLicense(token)
  const allowedAddons = ['sales', 'purchases', 'products', 'suppliers', 'followups', 'inventory']
  const cleanMods = Array.from(
    new Set(
      payload.modules
        .filter((m) => typeof m === 'string' && allowedAddons.includes(m.trim()))
        .map((m) => m.trim())
    )
  ).sort()

  runTransaction(() => {
    writeSetting('licensed_modules', JSON.stringify(cleanMods))
    writeSetting('licensed_modules_sig', signLicensedModules(cleanMods))
    writeSetting('licensed_modules_msig', signLicensedModulesForMachine(cleanMods))
    writeSetting('vendor_license', token.trim())

    if (cleanMods.length > 0) {
      createTables(getBusinessState().type)
      runMigrations()
      seedDefaults()
    }

    db.prepare(
      `INSERT INTO business_audit_log (user_id, from_type, to_type, had_data, notes)
       VALUES (?, 'modules', 'modules', 0, ?)`
    ).run(
      sessionUserId,
      `تفعيل ترخيص الشركة (${payload.issuedTo || 'بدون اسم'}): [${cleanMods.join(', ')}]`
    )
  })

  return { success: true, modules: cleanMods, issuedTo: payload.issuedTo, state: getBusinessState() }
}

export function getDeviceMachineId(): string {
  return getMachineId()
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

    // Super-admin recovery on a new device: re-bind previously licensed (locally signed) modules too.
    const rawMods = readSetting('licensed_modules')
    const modsSig = readSetting('licensed_modules_sig')
    if (rawMods && modsSig) {
      const parsedMods = parseJsonArray(rawMods)
      if (parsedMods.length > 0 && modsSig === signLicensedModules(parsedMods)) {
        writeSetting('licensed_modules_msig', signLicensedModulesForMachine(parsedMods))
      }
    }

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
