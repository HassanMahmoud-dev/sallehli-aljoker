/**
 * Vendor-side tool (Al-Joker Tech) — NEVER ship the private key with the app.
 *
 * Usage:
 *   node --experimental-strip-types scripts/issue-license.ts --key <vendor-private.pem> \
 *     --modules sales,purchases,products,suppliers [--machine <machineId>] [--to "Customer name"] [--expires 2027-12-31]
 *
 * Prints a license token to paste into: إعدادات البرنامج ← الوحدات الإضافية المرخصة ← ترخيص الشركة.
 * Generate a fresh keypair with:  --gen-keys <outputDir>  (then replace VENDOR_PUBLIC_KEY_PEM in src/main/vendorLicense.ts).
 */
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const genDir = arg('gen-keys')
if (genDir) {
  mkdirSync(genDir, { recursive: true })
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  writeFileSync(join(genDir, 'vendor-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }))
  console.log('Private key saved to', join(genDir, 'vendor-private.pem'))
  console.log('Embed this PUBLIC key in src/main/vendorLicense.ts:\n')
  console.log(publicKey.export({ type: 'spki', format: 'pem' }))
  process.exit(0)
}

const keyPath = arg('key')
const modules = (arg('modules') || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)
if (!keyPath || modules.length === 0) {
  console.error('Missing --key <private.pem> and/or --modules a,b,c')
  process.exit(1)
}

const payload = {
  v: 1,
  modules,
  machineId: arg('machine'),
  issuedTo: arg('to'),
  issuedAt: new Date().toISOString(),
  expires: arg('expires')
}
const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
const signature = sign(null, Buffer.from(body, 'utf8'), createPrivateKey(readFileSync(keyPath)))
console.log(`${body}.${b64url(signature)}`)
