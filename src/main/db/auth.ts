import { randomBytes } from 'crypto'
import { getDb } from './connection'
import { hashPassword, verifyPassword } from './crypto'
import { getBusinessState, activateOwnerBusinessType } from './business'
import {
  createSessionInMemory,
  getSessionFromMemory,
  removeSessionFromMemory,
  invalidateUserSessionsInMemory,
  type SessionInfo
} from '../session'
import type { User, UserRole, BusinessType, LoginPayload, AuthResponse } from '../../shared/types'

/** Removes expired persistent sessions from SQLite so stale tokens cannot accumulate. */
export function cleanupExpiredSessions(referenceIso: string = new Date().toISOString()): number {
  const db = getDb()
  const info = db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(referenceIso)
  return Number(info.changes ?? 0)
}

export function loginUser(payload: LoginPayload): AuthResponse {
  const db = getDb()
  cleanupExpiredSessions()

  const username = typeof payload?.username === 'string' ? payload.username.trim() : ''
  const password = typeof payload?.password === 'string' ? payload.password : ''
  if (!username || !password) {
    return {
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    }
  }

  const userRow = db
    .prepare(
      `SELECT id, username, password_hash, full_name, phone, role, business_type, is_active,
              subscription_start, subscription_end, subscription_sig, notes, created_at
       FROM users WHERE username = ?`
    )
    .get(username) as
    | (User & { password_hash: string; subscription_sig?: string })
    | undefined

  if (!userRow) {
    return {
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    }
  }

  const { valid, needsUpgrade } = verifyPassword(password, userRow.password_hash)
  if (!valid) {
    return {
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    }
  }

  if (needsUpgrade) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(password),
      userRow.id
    )
  }

  if (!userRow.is_active) {
    return {
      success: false,
      message: 'هذا الحساب موقوف حالياً. يرجى التواصل مع مالك البرنامج (السوبر أدمن).'
    }
  }

  const bState = getBusinessState()
  if (bState.needsSetup && userRow.role !== 'super_admin') {
    return {
      success: false,
      message:
        'لم يتم استكمال الإعداد الأولي لنشاط البرنامج بعد. يرجى الدخول بحساب السوبر أدمن أولاً لتحديد نوع النشاط.'
    }
  }

  if (
    userRow.role === 'owner' &&
    (userRow.business_type === 'appliances' || userRow.business_type === 'hearing_aids')
  ) {
    activateOwnerBusinessType(userRow.business_type, userRow.id)
  }

  const usingDefaultPassword =
    userRow.username === 'admin' &&
    userRow.role === 'super_admin' &&
    verifyPassword('8520', userRow.password_hash).valid

  const { password_hash: _, subscription_sig: __, ...safeUser } = userRow
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(
    'INSERT OR REPLACE INTO user_sessions (token, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(token, userRow.id, userRow.role, now.toISOString(), expiresAt)

  createSessionInMemory(safeUser, token)

  return {
    success: true,
    user: safeUser,
    token,
    usingDefaultPassword
  }
}

export function verifySession(identifier: string | number): AuthResponse {
  const db = getDb()
  cleanupExpiredSessions()

  if (!identifier || typeof identifier !== 'string' || identifier.trim().length < 16) {
    return { success: false, message: 'جلسة غير صالحة أو غير مسجلة' }
  }

  const token = identifier.trim()
  const sessionRow = db
    .prepare('SELECT user_id, role, expires_at FROM user_sessions WHERE token = ?')
    .get(token) as { user_id: number; role: string; expires_at: string } | undefined

  if (!sessionRow) {
    return { success: false, message: 'جلسة غير صالحة أو غير مسجلة' }
  }

  if (new Date(sessionRow.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
    removeSessionFromMemory(token)
    return { success: false, message: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' }
  }

  const userId = sessionRow.user_id
  const sessionToken = token

  const userRow = db
    .prepare(
      `SELECT id, username, password_hash, full_name, phone, role, business_type, is_active,
              subscription_start, subscription_end, subscription_sig, notes, created_at
       FROM users WHERE id = ?`
    )
    .get(Number(userId)) as
    | (User & { password_hash: string; subscription_sig?: string })
    | undefined

  if (!userRow || !userRow.is_active) {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
    removeSessionFromMemory(token)
    return {
      success: false,
      message: 'هذا الحساب غير موجود أو موقوف حالياً.'
    }
  }

  const bState = getBusinessState()
  if (bState.needsSetup && userRow.role !== 'super_admin') {
    return {
      success: false,
      message:
        'لم يتم استكمال الإعداد الأولي لنشاط البرنامج بعد. يرجى الدخول بحساب السوبر أدمن أولاً لتحديد نوع النشاط.'
    }
  }

  if (
    userRow.role === 'owner' &&
    (userRow.business_type === 'appliances' || userRow.business_type === 'hearing_aids')
  ) {
    activateOwnerBusinessType(userRow.business_type, userRow.id)
  }

  const usingDefaultPassword =
    userRow.username === 'admin' &&
    userRow.role === 'super_admin' &&
    verifyPassword('8520', userRow.password_hash).valid

  const { password_hash: _, subscription_sig: __, ...safeUser } = userRow

  createSessionInMemory(safeUser, sessionToken)

  return {
    success: true,
    user: safeUser,
    token: sessionToken,
    usingDefaultPassword
  }
}

export function resolveSession(token?: string | null): SessionInfo | null {
  const db = getDb()
  if (!token) return null
  const cached = getSessionFromMemory(token)
  if (cached) return cached

  cleanupExpiredSessions()

  const row = db
    .prepare('SELECT user_id, role, expires_at FROM user_sessions WHERE token = ?')
    .get(token) as { user_id: number; role: string; expires_at: string } | undefined

  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
    removeSessionFromMemory(token)
    return null
  }

  const user = db
    .prepare('SELECT id, username, full_name, phone, role, business_type, is_active FROM users WHERE id = ?')
    .get(row.user_id) as User | undefined

  if (!user || !user.is_active) {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
    removeSessionFromMemory(token)
    return null
  }

  createSessionInMemory(user, token)
  return getSessionFromMemory(token)
}

export function logoutUser(token?: string | null): void {
  const db = getDb()
  if (!token) return
  try {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
  } catch {
    // Ignore
  }
  removeSessionFromMemory(token)
}

export function listUsers(): User[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, username, full_name, phone, role, business_type, is_active, subscription_start, subscription_end, notes, created_at
       FROM users ORDER BY id ASC`
    )
    .all() as User[]
}

export function saveUser(
  data: Partial<User> & { password?: string },
  callerSession?: SessionInfo | null
): User {
  const db = getDb()
  const isSuperAdmin = callerSession?.role === 'super_admin'

  let username = data.username?.trim() || ''
  let role: UserRole = data.role === 'super_admin' ? 'super_admin' : 'owner'

  if (data.id) {
    const existing = db
      .prepare('SELECT id, username, role, business_type, is_active FROM users WHERE id = ?')
      .get(data.id) as
      | {
          id: number
          username: string
          role: UserRole
          business_type: BusinessType | null
          is_active: number
        }
      | undefined

    if (!existing) {
      throw new Error('المستخدم المطلوب تعديله غير موجود.')
    }

    // Default admin / id: 1 protection
    if (existing.id === 1 || existing.username === 'admin') {
      if (!isSuperAdmin) {
        throw new Error('لا يمكن تعديل الحساب الافتراضي للسوبر أدمن (admin) إلا من خلال السوبر أدمن.')
      }
      username = 'admin'
      role = 'super_admin'
    } else if (!isSuperAdmin) {
      if (callerSession?.userId !== existing.id) {
        throw new Error('غير مصرح لك بتعديل بيانات المستخدمين الآخرين.')
      }
      role = existing.role
    }

    // Owner's assigned business_type cannot be modified after creation
    let resolvedBusinessType: BusinessType | null = null
    if (role === 'owner') {
      if (existing.business_type === 'appliances' || existing.business_type === 'hearing_aids') {
        resolvedBusinessType = existing.business_type
      } else if (data.business_type === 'appliances' || data.business_type === 'hearing_aids') {
        resolvedBusinessType = data.business_type
      } else {
        resolvedBusinessType = getBusinessState().type
      }
    }

    const hasNewPassword = Boolean(data.password && data.password.trim() !== '')

    if (hasNewPassword) {
      const hashed = hashPassword(data.password!.trim())
      db.prepare(
        `UPDATE users SET username = ?, password_hash = ?, full_name = ?, phone = ?, role = ?,
         business_type = ?, is_active = ?, notes = ?
         WHERE id = ?`
      ).run(
        username,
        hashed,
        data.full_name?.trim(),
        data.phone || '',
        role,
        resolvedBusinessType,
        data.is_active ?? 1,
        data.notes || '',
        data.id
      )
    } else {
      db.prepare(
        `UPDATE users SET username = ?, full_name = ?, phone = ?, role = ?,
         business_type = ?, is_active = ?, notes = ?
         WHERE id = ?`
      ).run(
        username,
        data.full_name?.trim(),
        data.phone || '',
        role,
        resolvedBusinessType,
        data.is_active ?? 1,
        data.notes || '',
        data.id
      )
    }

    // Invalidate active sessions if role or status changed, or password was updated
    const statusChanged = (data.is_active ?? 1) !== existing.is_active
    const roleChanged = role !== existing.role
    if (hasNewPassword || statusChanged || roleChanged) {
      try {
        db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(data.id)
      } catch {
        // Ignore
      }
      invalidateUserSessionsInMemory(data.id)
    }

    return db
      .prepare(
        'SELECT id, username, full_name, phone, role, business_type, is_active, notes, created_at FROM users WHERE id = ?'
      )
      .get(data.id) as User
  } else {
    // New User Creation: Super Admin only
    if (!isSuperAdmin) {
      throw new Error('فقط السوبر أدمن يمكنه إنشاء حسابات مستخدمين جديدة.')
    }

    let resolvedBusinessType: BusinessType | null = null
    if (role === 'owner') {
      if (data.business_type !== 'appliances' && data.business_type !== 'hearing_aids') {
        throw new Error('يرجى تحديد نوع النشاط المخصص لمالك البرنامج.')
      }
      resolvedBusinessType = data.business_type
    }

    const hashed = hashPassword(data.password?.trim() || '1234')
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, full_name, phone, role, business_type, is_active, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        username,
        hashed,
        data.full_name?.trim(),
        data.phone || '',
        role,
        resolvedBusinessType,
        data.is_active ?? 1,
        data.notes || ''
      )
    return db
      .prepare(
        'SELECT id, username, full_name, phone, role, business_type, is_active, notes, created_at FROM users WHERE id = ?'
      )
      .get(Number(info.lastInsertRowid)) as User
  }
}

export function deleteUser(id: number, callerSession?: SessionInfo | null): void {
  const db = getDb()
  if (callerSession?.role !== 'super_admin') {
    throw new Error('عفواً، لا يمكن حذف حسابات المستخدمين إلا بواسطة السوبر أدمن.')
  }
  const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) as
    | { id: number; username: string }
    | undefined
  if (!target) return
  if (target.username === 'admin' || target.id === 1) {
    throw new Error('لا يمكن حذف الحساب الافتراضي للسوبر أدمن (admin)')
  }
  try {
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id)
  } catch {
    // Ignore
  }
  invalidateUserSessionsInMemory(id)
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

