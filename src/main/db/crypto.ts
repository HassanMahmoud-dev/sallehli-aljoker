import { scryptSync, createHmac, timingSafeEqual } from 'crypto'
import { getMachineId } from '../vendorLicense'

export const PASSWORD_SALT = 'sallehli_aljoker_salt_v1_2026'
export const LICENSE_HMAC_SECRET = 'sallehli_aljoker_license_secret_key_v1'
export const BUSINESS_HMAC_SECRET = 'sallehli_aljoker_business_secret_key_v1_2026'
export const MODULES_HMAC_SECRET = 'sallehli_aljoker_modules_secret_key_v1_2026'

export function hashPassword(password: string): string {
  const derived = scryptSync(password, PASSWORD_SALT, 32).toString('hex')
  return `scrypt:${derived}`
}

export function verifyPassword(password: string, storedHash: string): { valid: boolean; needsUpgrade: boolean } {
  if (storedHash.startsWith('scrypt:')) {
    const expectedHex = storedHash.slice('scrypt:'.length)
    const actualHex = scryptSync(password, PASSWORD_SALT, 32).toString('hex')
    try {
      const valid = timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'))
      return { valid, needsUpgrade: false }
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

export function signLicensedModules(modules: string[]): string {
  const sorted = [...modules].filter((m) => typeof m === 'string' && m.trim()).sort().join('|')
  return createHmac('sha256', MODULES_HMAC_SECRET).update(`mods|${sorted}`).digest('hex')
}

export function signLicensedModulesForMachine(
  modules: string[],
  machineId: string = getMachineId()
): string {
  const sorted = [...modules].filter((m) => typeof m === 'string' && m.trim()).sort().join('|')
  return createHmac('sha256', MODULES_HMAC_SECRET).update(`mods|${sorted}|${machineId}`).digest('hex')
}

