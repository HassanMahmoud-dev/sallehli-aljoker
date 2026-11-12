import { createRequire } from 'module'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, readFileSync, rmSync } from 'fs'
import {
  getDb,
  setDb,
  getDatabasePath,
  setDatabasePath,
  createDatabaseConnection,
  getDefaultAutoBackupDir,
  runTransaction
} from './connection'
import { createTables } from './schema/tables'
import { runMigrations } from './schema/migrations'
import { seedDefaults } from './schema/seeds'
import { signBusinessType, signBusinessTypeForMachine } from './crypto'
import type { SessionInfo } from '../session'
import type { BusinessType, CenterSettings } from '../../shared/types'

const requireModule = createRequire(import.meta.url)

export function readSetting(key: string): string | undefined {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function writeSetting(key: string, value: string): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getPatientAttachmentsDir(): string {
  const dir = join(app.getPath('userData'), 'patient_attachments')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function copyDirectoryFilesFlat(srcDir: string, destDir: string): void {
  if (!existsSync(srcDir)) return
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }
  const entries = readdirSync(srcDir)
  for (const name of entries) {
    const srcFile = join(srcDir, name)
    const destFile = join(destDir, name)
    try {
      if (statSync(srcFile).isFile()) {
        copyFileSync(srcFile, destFile)
      }
    } catch {
      // Ignore single-file copy errors during backup
    }
  }
}

export function getSettings(): CenterSettings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const map: Record<string, string> = {}
  for (const r of rows) {
    map[r.key] = r.value
  }
  return {
    center_name: map.center_name || 'مركز صلحلي للصيانة المعتمدة',
    center_subtitle: map.center_subtitle || '',
    phone1: map.phone1 || '',
    phone2: map.phone2 || '',
    whatsapp: map.whatsapp || '',
    address: map.address || '',
    logo_base64: map.logo_base64 || '',
    default_print_format: (map.default_print_format as 'a4' | 'thermal80') || 'a4',
    default_inspection_fee: Number(map.default_inspection_fee ?? 150),
    default_warranty_months: Number(map.default_warranty_months ?? 6),
    exchange_policy_days: Number(map.exchange_policy_days ?? 14),
    warranty_terms: map.warranty_terms || '',
    receipt_footer: map.receipt_footer || '',
    update_url: map.update_url || 'HassanMahmoud-dev/sallehli-aljoker',
    auto_backup_enabled: Number(map.auto_backup_enabled ?? 1),
    auto_backup_dir: map.auto_backup_dir || getDefaultAutoBackupDir(),
    auto_backup_keep_count: Number(map.auto_backup_keep_count ?? 10),
    browser_enabled: Number(map.browser_enabled ?? 1),
    lan_enabled: Number(map.lan_enabled ?? 1),
    lan_port: Number(map.lan_port || 4545),
    auto_start_windows: Number(map.auto_start_windows ?? 0),
    last_update_check_at: map.last_update_check_at || ''
  }
}

const CENTER_SETTINGS_KEYS = new Set<keyof CenterSettings>([
  'center_name',
  'center_subtitle',
  'phone1',
  'phone2',
  'whatsapp',
  'address',
  'logo_base64',
  'default_print_format',
  'default_inspection_fee',
  'default_warranty_months',
  'exchange_policy_days',
  'warranty_terms',
  'receipt_footer'
])

const SYSTEM_SENSITIVE_SETTINGS_KEYS = new Set<keyof CenterSettings>([
  'update_url',
  'lan_port',
  'browser_enabled',
  'lan_enabled',
  'auto_backup_enabled',
  'auto_backup_dir',
  'auto_backup_keep_count',
  'auto_start_windows'
])

/**
 * Persists center settings with role-based enforcement for sensitive system keys.
 * When `callerSession` is provided (IPC/HTTP requests), non-super_admin users may only
 * update center/printing preferences; any attempt to modify system keys throws an error,
 * while unchanged system values sent by a full-form UI save are safely ignored.
 */
export function saveSettings(
  settings: Partial<CenterSettings>,
  callerSession?: SessionInfo | null
): CenterSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('بيانات الإعدادات غير صالحة')
  }

  const enforceRoleBoundary = callerSession !== undefined
  const isSuperAdmin = !enforceRoleBoundary || callerSession?.role === 'super_admin'
  const current = enforceRoleBoundary && !isSuperAdmin ? getSettings() : null

  const entriesToWrite: [string, string][] = []

  for (const [key, rawValue] of Object.entries(settings)) {
    if (rawValue === undefined) continue
    const typedKey = key as keyof CenterSettings

    if (CENTER_SETTINGS_KEYS.has(typedKey)) {
      entriesToWrite.push([key, String(rawValue)])
      continue
    }

    if (SYSTEM_SENSITIVE_SETTINGS_KEYS.has(typedKey)) {
      if (isSuperAdmin) {
        entriesToWrite.push([key, String(rawValue)])
      } else if (current) {
        const incomingStr = String(rawValue)
        const currentStr = String(current[typedKey] ?? '')
        if (incomingStr !== currentStr) {
          throw new Error(
            `صلاحية غير كافية: لا يُسمح بتعديل إعداد النظام الحساس (${key}) إلا لحساب مالك البرنامج (السوبر أدمن).`
          )
        }
      }
      continue
    }

    // `last_update_check_at` is managed internally; ignore stale values from non-super_admin form saves.
    if (key === 'last_update_check_at' && isSuperAdmin) {
      entriesToWrite.push([key, String(rawValue)])
    }
  }

  const db = getDb()
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  runTransaction(() => {
    for (const [k, v] of entriesToWrite) {
      stmt.run(k, v)
    }
  })
  return getSettings()
}

export function createBackupToFile(destinationPath: string): void {
  const db = getDb()
  const dbFilePath = getDatabasePath()
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    // Ignore if checkpoint not supported
  }
  copyFileSync(dbFilePath, destinationPath)
  try {
    const attachDir = getPatientAttachmentsDir()
    const files = existsSync(attachDir) ? readdirSync(attachDir) : []
    if (files.length > 0) {
      copyDirectoryFilesFlat(attachDir, `${destinationPath}.attachments`)
    }
  } catch {
    // Ignore attachment backup error
  }
}

export function runAutoBackup(): { success: boolean; filePath?: string } {
  try {
    const settings = getSettings()
    if (!settings.auto_backup_enabled) {
      return { success: false }
    }
    const targetDir = settings.auto_backup_dir || getDefaultAutoBackupDir()
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupFile = join(targetDir, `Sallehli-AutoBackup-${timestamp}.sqlite`)
    createBackupToFile(backupFile)

    // Prune older auto-backups exceeding keep count
    const keepCount = Math.max(2, Number(settings.auto_backup_keep_count || 10))
    const files = readdirSync(targetDir)
      .filter((f) => f.startsWith('Sallehli-AutoBackup-') && f.endsWith('.sqlite'))
      .map((f) => {
        const full = join(targetDir, f)
        return { full, mtime: statSync(full).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)

    for (let i = keepCount; i < files.length; i++) {
      try {
        unlinkSync(files[i].full)
      } catch {
        // Ignore cleanup errors
      }
      const companionAttach = `${files[i].full}.attachments`
      if (existsSync(companionAttach)) {
        try {
          rmSync(companionAttach, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    return { success: true, filePath: backupFile }
  } catch {
    return { success: false }
  }
}

export function createPreUpdateBackup(): string {
  const backupsDir = getDefaultAutoBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = join(backupsDir, `Sallehli-PreUpdate-${timestamp}.sqlite`)
  createBackupToFile(backupPath)
  return backupPath
}

export function createPreSwitchBackup(): string {
  const backupsDir = getDefaultAutoBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = join(backupsDir, `Sallehli-PreSwitch-${timestamp}.sqlite`)
  createBackupToFile(backupPath)
  return backupPath
}

export function restoreBackupFromFile(sourcePath: string): void {
  const backupsDir = getDefaultAutoBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safetySnapshot = join(backupsDir, `Sallehli-PreRestore-${timestamp}.sqlite`)
  const dbFilePath = getDatabasePath()
  const currentDb = getDb()

  try {
    currentDb.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    // Ignore
  }
  if (existsSync(dbFilePath)) {
    copyFileSync(dbFilePath, safetySnapshot)
  }

  currentDb.close()
  for (const suffix of ['-wal', '-shm']) {
    try {
      unlinkSync(`${dbFilePath}${suffix}`)
    } catch {
      // Ignore
    }
  }

  copyFileSync(sourcePath, dbFilePath)
  const newDb = createDatabaseConnection(dbFilePath)
  setDb(newDb)
  try {
    let restoredType: BusinessType = 'appliances'
    try {
      const bRow = newDb
        .prepare("SELECT value FROM settings WHERE key = 'business_type'")
        .get() as { value?: string } | undefined
      if (bRow?.value === 'hearing_aids') {
        restoredType = 'hearing_aids'
      }
    } catch {
      // Ignore if settings table not present yet
    }
    createTables(restoredType)
    runMigrations()
    seedDefaults()
    writeSetting('last_run_version', app.getVersion())
  } catch (err) {
    try {
      newDb.close()
    } catch {
      // Ignore
    }
    if (existsSync(safetySnapshot)) {
      for (const suffix of ['-wal', '-shm']) {
        try {
          unlinkSync(`${dbFilePath}${suffix}`)
        } catch {
          // Ignore
        }
      }
      copyFileSync(safetySnapshot, dbFilePath)
      setDb(createDatabaseConnection(dbFilePath))
    }
    throw new Error(`فشلت استعادة النسخة الاحتياطية وتم الرجوع للقاعدة السابقة تلقائياً: ${(err as Error).message}`)
  }

  try {
    const companionDir = `${sourcePath}.attachments`
    if (existsSync(companionDir)) {
      copyDirectoryFilesFlat(companionDir, getPatientAttachmentsDir())
    }
  } catch {
    // Ignore companion attachment restore error
  }
}

function snapshotBeforeMigration(dbFilePath: string): string | null {
  // Only snapshot when the app version changed since the last successful start (i.e. an upgrade).
  if (!existsSync(dbFilePath) || statSync(dbFilePath).size === 0) return null
  let lastVersion = ''
  try {
    const probe = createDatabaseConnection(dbFilePath)
    try {
      const row = probe.prepare('SELECT value FROM settings WHERE key = ?').get('last_run_version') as
        | { value: string }
        | undefined
      lastVersion = row?.value || ''
      try {
        probe.exec('PRAGMA wal_checkpoint(TRUNCATE);')
      } catch {
        // Ignore if checkpoint not supported
      }
    } finally {
      probe.close()
    }
  } catch {
    lastVersion = ''
  }
  if (lastVersion === app.getVersion()) return null

  const backupsDir = getDefaultAutoBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const snapshotPath = join(backupsDir, `Sallehli-PreMigration-${timestamp}.sqlite`)
  copyFileSync(dbFilePath, snapshotPath)
  try {
    const attachDir = getPatientAttachmentsDir()
    if (existsSync(attachDir) && readdirSync(attachDir).length > 0) {
      copyDirectoryFilesFlat(attachDir, `${snapshotPath}.attachments`)
    }
  } catch {
    // Attachment snapshot is best-effort
  }

  // Keep only the 3 most recent pre-migration snapshots
  try {
    const old = readdirSync(backupsDir)
      .filter((f) => f.startsWith('Sallehli-PreMigration-') && f.endsWith('.sqlite'))
      .map((f) => ({ f, m: statSync(join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
      .slice(3)
    for (const o of old) {
      const full = join(backupsDir, o.f)
      try {
        unlinkSync(full)
      } catch {
        // ignore
      }
      const companionAttach = `${full}.attachments`
      if (existsSync(companionAttach)) {
        try {
          rmSync(companionAttach, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return snapshotPath
}

export function resolveConfiguredBusinessType(): BusinessType {
  const db = getDb()
  // 1. أولاً: التحقق مما إذا كان نوع النشاط مسجلاً بالفعل في قاعدة البيانات (في جدول الإعدادات)
  try {
    const hasSettings = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
      .get()
    if (hasSettings) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('business_type') as
        | { value?: string }
        | undefined
      if (row?.value && (row.value === 'appliances' || row.value === 'hearing_aids')) {
        return row.value as BusinessType
      }
    }
  } catch {
    // ignore
  }

  // 2. التحقق من ملف التكوين الأولي initial-activity.json المكتوب بواسطة مثبت البرنامج في مسار بيانات المستخدم
  try {
    const userDataPath = join(app.getPath('userData'), 'initial-activity.json')
    if (existsSync(userDataPath)) {
      const content = JSON.parse(readFileSync(userDataPath, 'utf-8'))
      if (content.business_type === 'appliances' || content.business_type === 'hearing_aids') {
        return content.business_type as BusinessType
      }
    }
  } catch {
    // ignore
  }

  // 3. التحقق من ملف التكوين الأولي بجوار ملفات البرنامج
  try {
    const appDirPath = join(app.getAppPath(), '..', 'initial-activity.json')
    if (existsSync(appDirPath)) {
      const content = JSON.parse(readFileSync(appDirPath, 'utf-8'))
      if (content.business_type === 'appliances' || content.business_type === 'hearing_aids') {
        return content.business_type as BusinessType
      }
    }
  } catch {
    // ignore
  }

  // 4. التحقق من سجل النظام Windows Registry (المكتوب من معالج تثبيت NSIS)
  if (process.platform === 'win32') {
    try {
      const { execSync } = requireModule('child_process')
      const regOutput = execSync('reg query "HKCU\\Software\\Sallehli" /v BusinessType', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
      if (regOutput.includes('hearing_aids')) {
        return 'hearing_aids'
      }
      if (regOutput.includes('appliances')) {
        return 'appliances'
      }
    } catch {
      // ignore
    }
  }

  return 'appliances'
}

export function initDatabase(): void {
  const userDataDir = app.getPath('userData')
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true })
  }
  const dbFilePath = join(userDataDir, 'sallehli_aljoker.sqlite')
  setDatabasePath(dbFilePath)

  const snapshotPath = snapshotBeforeMigration(dbFilePath)
  if (snapshotPath) console.log(`Pre-migration snapshot saved: ${snapshotPath}`)

  const db = createDatabaseConnection(dbFilePath)
  setDb(db)

  try {
    const activeType = resolveConfiguredBusinessType()
    createTables(activeType)

    // إذا كانت قاعدة بيانات جديدة فارغة، لا نسجل النشاط مسبقاً حتى ينطلق معالج الإعداد needsSetup
    const existingType = readSetting('business_type')
    if (!existingType) {
      let isLegacyDbWithData = false
      try {
        const otherUsersCount = (
          db.prepare("SELECT COUNT(*) as cnt FROM users WHERE username != 'admin'").get() as { cnt: number }
        ).cnt
        const ticketsCount = (
          db.prepare("SELECT COUNT(*) as cnt FROM maintenance_tickets").get() as { cnt: number }
        ).cnt
        isLegacyDbWithData = otherUsersCount > 0 || ticketsCount > 0
      } catch {
        // Ignore
      }

      if (isLegacyDbWithData) {
        writeSetting('business_type', activeType)
        writeSetting('business_type_sig', signBusinessType(activeType))
        writeSetting('business_type_msig', signBusinessTypeForMachine(activeType))
      }
    }

    runMigrations()
    seedDefaults()
    writeSetting('last_run_version', app.getVersion())
  } catch (err) {
    // Automatic rollback: restore the pre-upgrade snapshot so no data is lost, then surface the error.
    try {
      db.close()
    } catch {
      // ignore
    }
    if (snapshotPath && existsSync(snapshotPath)) {
      for (const suffix of ['-wal', '-shm']) {
        try {
          unlinkSync(`${dbFilePath}${suffix}`)
        } catch {
          // ignore
        }
      }
      copyFileSync(snapshotPath, dbFilePath)
      console.error(`Migration failed; database restored from ${snapshotPath}`)
    }
    throw new Error(
      `فشلت ترقية قاعدة البيانات${snapshotPath ? ' وتم استرجاع النسخة الاحتياطية تلقائياً' : ''}: ${(err as Error).message}`
    )
  }
}
