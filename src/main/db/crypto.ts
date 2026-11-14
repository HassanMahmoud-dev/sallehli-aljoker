import { randomBytes, scryptSync, createHmac, timingSafeEqual } from 'crypto'
import { getMachineId } from '../vendorLicense'

export const PASSWORD_SALT = 'sallehli_aljoker_salt_v1_2026'
export const LICENSE_HMAC_SECRET = 'sallehli_aljoker_license_secret_key_v1'
export const BUSINESS_HMAC_SECRET = 'sallehli_aljoker_business_secret_key_v1_2026'

/** Returns true when a stored password already uses a supported hash prefix (`scrypt2:` or legacy `scrypt:`). */
export function isHashedPassword(storedHash: string): boolean {
  return (
    typeof storedHash === 'string' &&
    (storedHash.startsWith('scrypt2:') || storedHash.startsWith('scrypt:'))
  )
}

/** Hashes a password with a per-user 16-byte random salt using scrypt (`scrypt2:<salt>:<hash>`). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 32).toString('hex')
  return `scrypt2:${salt}:${derived}`
}

/**
 * Verifies a password against `scrypt2:`, legacy static-salt `scrypt:`, or legacy plaintext.
 * Legacy formats set `needsUpgrade: true` on match so callers re-hash seamlessly on login.
 */
export function verifyPassword(password: string, storedHash: string): { valid: boolean; needsUpgrade: boolean } {
  if (typeof storedHash !== 'string' || typeof password !== 'string') {
    return { valid: false, needsUpgrade: false }
  }

  if (storedHash.startsWith('scrypt2:')) {
    const rest = storedHash.slice('scrypt2:'.length)
    const sepIdx = rest.indexOf(':')
    if (sepIdx <= 0) {
      return { valid: false, needsUpgrade: false }
    }
    const salt = rest.slice(0, sepIdx)
    const expectedHex = rest.slice(sepIdx + 1)
    if (!salt || !expectedHex) {
      return { valid: false, needsUpgrade: false }
    }
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex')
      const actualBuf = scryptSync(password, salt, 32)
      if (expectedBuf.length !== actualBuf.length) {
        return { valid: false, needsUpgrade: false }
      }
      const valid = timingSafeEqual(expectedBuf, actualBuf)
      return { valid, needsUpgrade: false }
    } catch {
      return { valid: false, needsUpgrade: false }
    }
  }

  if (storedHash.startsWith('scrypt:')) {
    const expectedHex = storedHash.slice('scrypt:'.length)
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex')
      const actualBuf = scryptSync(password, PASSWORD_SALT, 32)
      if (expectedBuf.length !== actualBuf.length) {
        return { valid: false, needsUpgrade: false }
      }
      const valid = timingSafeEqual(expectedBuf, actualBuf)
      return { valid, needsUpgrade: valid }
    } catch {
      return { valid: false, needsUpgrade: false }
    }
  }

  const valid = storedHash === password
  return { valid, needsUpgrade: valid }
}

export function signSubscription(username: string, role: string, subscriptionEnd: string | null): string {
  const payload = `${username.trim().toLowerCase()}|${role}|${subscriptionEnd || ''}`
  return createHmac('sha256', LICENSE_HMAC_SECRET).update(payload).digest('hex')
}

export function signBusinessType(type: string): string {
  return createHmac('sha256', BUSINESS_HMAC_SECRET).update(`biz|${type}`).digest('hex')
}

/** Business-type signature bound to this device, so a copied database cannot silently change sector. */
export function signBusinessTypeForMachine(type: string, machineId: string = getMachineId()): string {
  return createHmac('sha256', BUSINESS_HMAC_SECRET).update(`biz|${type}|${machineId}`).digest('hex')
}

