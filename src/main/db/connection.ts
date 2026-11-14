import { createRequire } from 'module'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { DatabaseLike } from './types'

const requireModule = createRequire(import.meta.url)

let dbInstance: DatabaseLike | null = null
let dbFilePath = ''
let transactionDepth = 0

export function createDatabaseConnection(filePath: string): DatabaseLike {
  try {
    const BetterSqlite3 = requireModule('better-sqlite3')
    const instance = new BetterSqlite3(filePath)
    instance.pragma('journal_mode = WAL')
    instance.pragma('synchronous = NORMAL')
    instance.pragma('temp_store = MEMORY')
    instance.pragma('cache_size = -16000')
    instance.pragma('busy_timeout = 5000')
    instance.pragma('foreign_keys = ON')
    return instance as DatabaseLike
  } catch {
    // Fallback to built-in node:sqlite DatabaseSync in modern Electron/Node
    const { DatabaseSync } = requireModule('node:sqlite')
    const instance = new DatabaseSync(filePath)
    instance.exec('PRAGMA journal_mode = WAL;')
    instance.exec('PRAGMA synchronous = NORMAL;')
    instance.exec('PRAGMA temp_store = MEMORY;')
    instance.exec('PRAGMA cache_size = -16000;')
    instance.exec('PRAGMA busy_timeout = 5000;')
    instance.exec('PRAGMA foreign_keys = ON;')
    return instance as DatabaseLike
  }
}

export function getDb(): DatabaseLike {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return dbInstance
}

export const db: DatabaseLike = new Proxy({} as DatabaseLike, {
  get(_target, prop) {
    const instance = getDb()
    const val = (instance as any)[prop]
    return typeof val === 'function' ? val.bind(instance) : val
  }
})

export function setDb(instance: DatabaseLike): void {
  dbInstance = instance
  transactionDepth = 0
}

export function getDatabasePath(): string {
  return dbFilePath
}

export function setDatabasePath(path: string): void {
  dbFilePath = path
}

export function getDefaultAutoBackupDir(): string {
  const base = app?.getPath ? app.getPath('userData') : process.cwd()
  const dir = join(base, 'backups')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function runTransaction<T>(fn: () => T): T {
  const db = getDb()
  const currentDepth = transactionDepth
  const savepointName = `sp_${currentDepth}`

  if (currentDepth === 0) {
    db.exec('BEGIN IMMEDIATE TRANSACTION;')
  } else {
    db.exec(`SAVEPOINT ${savepointName};`)
  }

  transactionDepth++

  try {
    const result = fn()
    if (currentDepth === 0) {
      db.exec('COMMIT;')
    } else {
      db.exec(`RELEASE SAVEPOINT ${savepointName};`)
    }
    return result
  } catch (err) {
    if (currentDepth === 0) {
      try {
        db.exec('ROLLBACK;')
      } catch {
        // Ignore if rollback fails
      }
    } else {
      try {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`)
        db.exec(`RELEASE SAVEPOINT ${savepointName};`)
      } catch {
        // Ignore if rollback fails
      }
    }
    throw err
  } finally {
    transactionDepth = Math.max(0, transactionDepth - 1)
  }
}

export function closeDatabase(): void {
  transactionDepth = 0
  if (!dbInstance) return
  try {
    dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    // Ignore
  }
  try {
    dbInstance.close()
  } catch {
    // Ignore
  }
  dbInstance = null
}

