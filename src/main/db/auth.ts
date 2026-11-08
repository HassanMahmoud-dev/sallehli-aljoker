import { randomBytes } from 'crypto'
import { getDb } from './connection'
import { hashPassword, verifyPassword, signSubscription } from './crypto'
import { getBusinessState } from './business'
import {
  createSessionInMemory,
  getSessionFromMemory,
  removeSessionFromMemory,
  invalidateUserSessionsInMemory,
  type SessionInfo
} from '../session'
import type { User, UserRole, LoginPayload, AuthResponse } from '../../shared/types'

export function loginUser(payload: LoginPayload): AuthResponse {
  const db = getDb()
  const userRow = db
    .prepare(
      `SELECT id, username, password_hash, full_name, phone, role, is_active,
              subscription_start, subscription_end, subscription_sig, notes, created_at
       FROM users WHERE username = ?`
    )
    .get(payload.username.trim()) as
    | (User & { password_hash: string; subscription_sig?: string })
    | undefined

  if (!userRow) {
    return {
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    }
  }

  const { valid, needsUpgrade } = verifyPassword(payload.password, userRow.password_hash)
  if (!valid) {
    return {
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    }
  }

  if (needsUpgrade) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(payload.password),
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

  // Verify digital signature of role & subscription_end to prevent SQLite tampering
  const expectedSig = signSubscription(userRow.username, userRow.role, userRow.subscription_end)
  if (userRow.subscription_sig && userRow.subscription_sig !== expectedSig) {
    return {
      success: false,
      message:
        'تم اكتشاف تلاعب غير مصرح به في بيانات الترخيص أو صلاحية الحساب. يرجى مراجعة السوبر أدمن.'
    }
  }

  let isExpired = false
  let daysRemaining: number | null = null

  if (userRow.role === 'tenant') {
    if (!userRow.subscription_end) {
      return {
        success: false,
        message: 'لم يتم تحديد فترة اشتراك لهذا الحساب المستأجر. يرجى مراجعة السوبر أدمن.'
      }
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = new Date(userRow.subscription_end)
    endDate.setHours(23, 59, 59, 999)

    const diffMs = endDate.getTime() - today.getTime()
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
      isExpired = true
      return {
        success: false,
        message: `انتهت فترة اشتراك هذا الحساب بتاريخ (${userRow.subscription_end}). يرجى تجديد الاشتراك مع السوبر أدمن.`,
        subscriptionStatus: { isExpired: true, daysRemaining: 0 }
      }
    }
  }

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
    subscriptionStatus: { isExpired, daysRemaining }
  }
}

export function verifySession(identifier: string | number): AuthResponse {
  const db = getDb()
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

  if (new Date(sessionRow.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
    removeSessionFromMemory(token)
    return { success: false, message: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' }
  }

  const userId = sessionRow.user_id
  const sessionToken = token

  const userRow = db
    .prepare(
      `SELECT id, username, password_hash, full_name, phone, role, is_active,
              subscription_start, subscription_end, subscription_sig, notes, created_at
       FROM users WHERE id = ?`
    )
    .get(Number(userId)) as
    | (User & { password_hash: string; subscription_sig?: string })
    | undefined

  if (!userRow || !userRow.is_active) {
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

  const expectedSig = signSubscription(userRow.username, userRow.role, userRow.subscription_end)
  if (userRow.subscription_sig && userRow.subscription_sig !== expectedSig) {
    return {
      success: false,
      message: 'تم اكتشاف تلاعب غير مصرح به في بيانات الترخيص أو صلاحية الحساب.'
    }
  }

  let isExpired = false
  let daysRemaining: number | null = null

  if (userRow.role === 'tenant') {
    if (!userRow.subscription_end) {
      return {
        success: false,
        message: 'لم يتم تحديد فترة اشتراك لهذا الحساب المستأجر.'
      }
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = new Date(userRow.subscription_end)
    endDate.setHours(23, 59, 59, 999)

    const diffMs = endDate.getTime() - today.getTime()
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
      isExpired = true
      return {
        success: false,
        message: `انتهت فترة إيجار البرنامج بتاريخ (${userRow.subscription_end}).`,
        subscriptionStatus: { isExpired: true, daysRemaining: 0 }
      }
    }
  }

  const { password_hash: _, subscription_sig: __, ...safeUser } = userRow

  createSessionInMemory(safeUser, sessionToken)

  return {
    success: true,
    user: safeUser,
    token: sessionToken,
    subscriptionStatus: { isExpired, daysRemaining }
  }
}

export function resolveSession(token?: string | null): SessionInfo | null {
  const db = getDb()
  if (!token) return null
  const cached = getSessionFromMemory(token)
  if (cached) return cached

  const row = db
    .prepare('SELECT user_id, role, expires_at FROM user_sessions WHERE token = ?')
    .get(token) as { user_id: number; role: string; expires_at: string } | undefined

  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token)
    return null
  }

  const user = db
    .prepare('SELECT id, username, full_name, phone, role, is_active FROM users WHERE id = ?')
    .get(row.user_id) as User | undefined

  if (!user || !user.is_active) return null

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
      `SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at
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
  let role: UserRole = data.role || 'tenant'
  let subEnd: string | null = null
  let subStart: string | null = null

  if (data.id) {
    const existing = db
      .prepare(
        'SELECT id, username, role, is_active, subscription_start, subscription_end FROM users WHERE id = ?'
      )
      .get(data.id) as
      | {
          id: number
          username: string
          role: UserRole
          is_active: number
          subscription_start: string | null
          subscription_end: string | null
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
      // Non-super admin cannot touch super_admin, owner, or tenant
      if (['super_admin', 'owner', 'tenant'].includes(existing.role)) {
        throw new Error(
          'لا يمكنك تعديل حسابات الإدارة أو التراخيص؛ هذه الصلاحية محصورة بالسوبر أدمن فقط.'
        )
      }
      // Non-super admin cannot escalate any user's role to super_admin, owner, or tenant
      if (['super_admin', 'owner', 'tenant'].includes(role)) {
        throw new Error('غير مصرح لك بترقية المستخدمين إلى أدوار إدارية أو اشتراكات.')
      }
      // Non-super admin cannot modify subscriptions
      subStart = existing.subscription_start
      subEnd = existing.subscription_end
    }

    if (isSuperAdmin) {
      subEnd = role === 'tenant' ? data.subscription_end || null : null
      subStart = role === 'tenant' ? data.subscription_start || null : null
    }

    const sig = signSubscription(username, role, subEnd)
    const hasNewPassword = Boolean(data.password && data.password.trim() !== '')

    if (hasNewPassword) {
      const hashed = hashPassword(data.password!.trim())
      db.prepare(
        `UPDATE users SET username = ?, password_hash = ?, full_name = ?, phone = ?, role = ?,
         is_active = ?, subscription_start = ?, subscription_end = ?, subscription_sig = ?, notes = ?
         WHERE id = ?`
      ).run(
        username,
        hashed,
        data.full_name?.trim(),
        data.phone || '',
        role,
        data.is_active ?? 1,
        subStart,
        subEnd,
        sig,
        data.notes || '',
        data.id
      )
    } else {
      db.prepare(
        `UPDATE users SET username = ?, full_name = ?, phone = ?, role = ?,
         is_active = ?, subscription_start = ?, subscription_end = ?, subscription_sig = ?, notes = ?
         WHERE id = ?`
      ).run(
        username,
        data.full_name?.trim(),
        data.phone || '',
        role,
        data.is_active ?? 1,
        subStart,
        subEnd,
        sig,
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
        'SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at FROM users WHERE id = ?'
      )
      .get(data.id) as User
  } else {
    // New User Creation
    if (!isSuperAdmin && ['super_admin', 'owner', 'tenant'].includes(role)) {
      throw new Error('فقط السوبر أدمن يمكنه إنشاء حسابات مدراء أو تراخيص برمجية جديدة.')
    }

    subEnd = role === 'tenant' ? data.subscription_end || null : null
    subStart = role === 'tenant' ? data.subscription_start || null : null
    const sig = signSubscription(username, role, subEnd)

    const hashed = hashPassword(data.password?.trim() || '1234')
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, full_name, phone, role, is_active, subscription_start, subscription_end, subscription_sig, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        username,
        hashed,
        data.full_name?.trim(),
        data.phone || '',
        role,
        data.is_active ?? 1,
        subStart,
        subEnd,
        sig,
        data.notes || ''
      )
    return db
      .prepare(
        'SELECT id, username, full_name, phone, role, is_active, subscription_start, subscription_end, notes, created_at FROM users WHERE id = ?'
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

