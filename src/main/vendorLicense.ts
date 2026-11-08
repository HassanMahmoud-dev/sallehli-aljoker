import { createPublicKey, verify as cryptoVerify } from 'crypto'
import { execFileSync } from 'child_process'
import { hostname, platform, arch } from 'os'

/**
 * Vendor licensing (Al-Joker Tech) uses an asymmetric Ed25519 signature:
 * only the vendor holds the private key (never shipped with the app), while the
 * app embeds the public key and can only VERIFY licenses, never forge them.
 *
 * Local tamper-proofing of the SQLite settings stays HMAC-based (see db.ts) and is
 * bound to the machine id returned by getMachineId().
 */
const VENDOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi342i342t4cL6LPccS1FJsujYjjxjuNPs2oG6LDK1Wc=
-----END PUBLIC KEY-----`

export interface VendorLicensePayload {
  v: number
  /** Add-on modules granted by this license. */
  modules: string[]
  /** Optional machine id the license is bound to. Omitted = valid on any machine. */
  machineId?: string
  issuedTo?: string
  issuedAt?: string
  /** Optional ISO date after which the license is no longer valid. */
  expires?: string
}

let cachedMachineId: string | null = null

/** Stable per-device identifier (Windows MachineGuid, with a hostname-based fallback). */
export function getMachineId(): string {
  if (cachedMachineId) return cachedMachineId
  let id = ''
  if (platform() === 'win32') {
    try {
      const out = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
      )
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{16,})/)
      if (m) id = m[1].toLowerCase()
    } catch {
      id = ''
    }
  }
  if (!id) id = `fallback:${hostname().toLowerCase()}|${platform()}|${arch()}`
  cachedMachineId = id
  return id
}

function fromB64Url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Verifies a vendor license token of the form `<base64url(payload JSON)>.<base64url(signature)>`.
 * Throws an Arabic error message when the token is invalid, bound to another machine, or expired.
 */
export function verifyVendorLicense(
  token: string,
  machineId: string = getMachineId(),
  publicKeyPem: string = VENDOR_PUBLIC_KEY_PEM
): VendorLicensePayload {
  const parts = String(token || '')
    .trim()
    .split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('صيغة ملف الترخيص غير صحيحة.')
  }

  let valid = false
  try {
    valid = cryptoVerify(
      null,
      Buffer.from(parts[0], 'utf8'),
      createPublicKey(publicKeyPem),
      fromB64Url(parts[1])
    )
  } catch {
    valid = false
  }
  if (!valid) throw new Error('توقيع الترخيص غير صالح؛ الترخيص غير صادر من الشركة المطورة.')

  let payload: VendorLicensePayload
  try {
    payload = JSON.parse(fromB64Url(parts[0]).toString('utf8'))
  } catch {
    throw new Error('محتوى ملف الترخيص تالف.')
  }
  if (!payload || payload.v !== 1 || !Array.isArray(payload.modules)) {
    throw new Error('إصدار ملف الترخيص غير مدعوم.')
  }
  if (payload.machineId && payload.machineId !== machineId) {
    throw new Error('هذا الترخيص مرتبط بجهاز آخر ولا يمكن استخدامه على هذا الجهاز.')
  }
  if (payload.expires) {
    const t = Date.parse(payload.expires)
    if (!Number.isFinite(t) || t < Date.now()) throw new Error('انتهت صلاحية هذا الترخيص.')
  }
  return payload
}
