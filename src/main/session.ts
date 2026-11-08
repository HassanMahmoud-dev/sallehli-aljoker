import { randomBytes } from 'crypto'
import type { User, UserRole } from '../shared/types'

export interface SessionInfo {
  token: string
  userId: number
  username: string
  full_name?: string
  role: UserRole
  createdAt: number
  lastActiveAt: number
}

// In-memory active session cache
const sessions = new Map<string, SessionInfo>()

// Single-use download tickets: ticket -> { expiresAt: number, role: UserRole }
const backupTickets = new Map<string, { expiresAt: number; role: UserRole }>()

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const TICKET_TTL_MS = 60 * 1000 // 1 minute single-use ticket

export function createSessionInMemory(user: User, existingToken?: string): string {
  const token = existingToken || randomBytes(32).toString('hex')
  const now = Date.now()
  sessions.set(token, {
    token,
    userId: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    createdAt: now,
    lastActiveAt: now
  })
  return token
}

export function getSessionFromMemory(token?: string | null): SessionInfo | null {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  const now = Date.now()
  if (now - session.lastActiveAt > SESSION_TTL_MS) {
    sessions.delete(token)
    return null
  }
  session.lastActiveAt = now
  return session
}

export function removeSessionFromMemory(token?: string | null): void {
  if (!token) return
  sessions.delete(token)
}

export function invalidateUserSessionsInMemory(userId: number): void {
  for (const [token, s] of sessions.entries()) {
    if (s.userId === userId) {
      sessions.delete(token)
    }
  }
}

export function createBackupTicket(token?: string | null): string | null {
  const session = getSessionFromMemory(token)
  if (!session || (session.role !== 'super_admin' && session.role !== 'owner' && session.role !== 'tenant')) {
    return null
  }
  const ticket = randomBytes(24).toString('hex')
  backupTickets.set(ticket, {
    expiresAt: Date.now() + TICKET_TTL_MS,
    role: session.role
  })
  return ticket
}

export function consumeBackupTicket(ticket?: string | null): boolean {
  if (!ticket) return false
  const entry = backupTickets.get(ticket)
  if (!entry) return false
  backupTickets.delete(ticket)
  if (Date.now() > entry.expiresAt) return false
  return ['super_admin', 'owner', 'tenant'].includes(entry.role)
}

