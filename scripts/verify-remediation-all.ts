import assert from 'node:assert/strict'
import { createHash, scryptSync } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileScript, compileTemplate, parse as parseSfc } from '@vue/compiler-sfc'
import ts from 'typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const testRootDir = mkdtempSync(join(tmpdir(), 'sallehli-remediation-qa-'))
const testUserDataDir = join(testRootDir, 'userData')
const testTempDir = join(testRootDir, 'tmp')
mkdirSync(testUserDataDir, { recursive: true })
mkdirSync(testTempDir, { recursive: true })

declare global {
  var __SALLEHLI_TEST_USERDATA__: string | undefined
  var __SALLEHLI_TEST_TEMP__: string | undefined
  var __SALLEHLI_TEST_IS_PACKAGED__: boolean | undefined
}

globalThis.__SALLEHLI_TEST_USERDATA__ = testUserDataDir
globalThis.__SALLEHLI_TEST_TEMP__ = testTempDir
globalThis.__SALLEHLI_TEST_IS_PACKAGED__ = false

const electronMockUrl =
  'data:text/javascript,' +
  encodeURIComponent(`
export const app = {
  get isPackaged() { return Boolean(globalThis.__SALLEHLI_TEST_IS_PACKAGED__); },
  getVersion: () => '1.1.5',
  getPath: (name) => name === 'temp' ? globalThis.__SALLEHLI_TEST_TEMP__ : globalThis.__SALLEHLI_TEST_USERDATA__,
  setLoginItemSettings: () => {},
  whenReady: () => new Promise(() => {}),
  on: () => {},
  quit: () => {}
};
export const shell = { openExternal: async () => {}, openPath: async () => '' };
export const dialog = {
  showSaveDialog: async () => ({ canceled: true }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showErrorBox: () => {}
};
export const ipcMain = { handle: () => {} };
export const BrowserWindow = class { static getAllWindows() { return []; } };
export const nativeImage = { createFromPath: () => ({ isEmpty: () => true }) };
`)

function resolveTsFile(basePath: string): string | null {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.js`,
    join(basePath, 'index.ts'),
    join(basePath, 'index.js')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'electron') {
      return { shortCircuit: true, url: electronMockUrl }
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      const parentFile = fileURLToPath(context.parentURL)
      const resolved = resolveTsFile(resolve(dirname(parentFile), specifier))
      if (resolved) {
        return { shortCircuit: true, url: pathToFileURL(resolved).href }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts') && !url.endsWith('.d.ts')) {
      const filePath = fileURLToPath(url)
      if (filePath.startsWith(resolve(ROOT, 'src'))) {
        const source = readFileSync(filePath, 'utf8')
        const transpiled = ts.transpileModule(source, {
          fileName: filePath,
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            esModuleInterop: true,
            resolveJsonModule: true
          }
        })
        return { shortCircuit: true, format: 'module', source: transpiled.outputText }
      }
    }
    return nextLoad(url, context)
  }
})

function modUrl(relPath: string): string {
  return pathToFileURL(resolve(ROOT, relPath)).href
}

// ==========================================
// AST HELPERS FOR IPC & PRELOAD PARITY
// ==========================================

function readTsAst(relPath: string): ts.SourceFile {
  const fullPath = resolve(ROOT, relPath)
  return ts.createSourceFile(fullPath, readFileSync(fullPath, 'utf8'), ts.ScriptTarget.ES2022, true)
}

function getPropertyKeyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return null
}

function extractObjectLiteralKeys(sourceFile: ts.SourceFile, varName: string): Set<string> {
  const keys = new Set<string>()
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === varName &&
      node.initializer
    ) {
      let expr: ts.Expression = node.initializer
      while (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr) || ts.isParenthesizedExpression(expr)) {
        expr = expr.expression
      }
      if (ts.isObjectLiteralExpression(expr)) {
        for (const prop of expr.properties) {
          if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop) || ts.isShorthandPropertyAssignment(prop)) {
            const key = getPropertyKeyName(prop.name)
            if (key) keys.add(key)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return keys
}

function extractCallStringFirstArgs(sourceFile: ts.SourceFile, calleeNames: Set<string>): Set<string> {
  const found = new Set<string>()
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const expr = node.expression
      let matches = false
      if (ts.isIdentifier(expr) && calleeNames.has(expr.text)) {
        matches = true
      } else if (ts.isPropertyAccessExpression(expr) && calleeNames.has(expr.name.text)) {
        matches = true
      }
      if (matches && ts.isStringLiteral(node.arguments[0])) {
        found.add(node.arguments[0].text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function extractInterfaceMemberNames(sourceFile: ts.SourceFile, interfaceName: string): Set<string> {
  const names = new Set<string>()
  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        if ((ts.isPropertySignature(member) || ts.isMethodSignature(member)) && member.name) {
          const key = getPropertyKeyName(member.name)
          if (key) names.add(key)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

function diffSets(a: Set<string>, b: Set<string>): { onlyA: string[]; onlyB: string[] } {
  const onlyA = [...a].filter((x) => !b.has(x)).sort()
  const onlyB = [...b].filter((x) => !a.has(x)).sort()
  return { onlyA, onlyB }
}

// ==========================================
// TEST RUNNER INFRASTRUCTURE
// ==========================================

interface CheckResult {
  id: string
  wave: 'Wave 1' | 'Wave 2' | 'Wave 3'
  title: string
  passed: boolean
  error?: string
}

const results: CheckResult[] = []

async function runCheck(
  id: string,
  wave: 'Wave 1' | 'Wave 2' | 'Wave 3',
  title: string,
  fn: () => Promise<void> | void
): Promise<void> {
  try {
    await fn()
    results.push({ id, wave, title, passed: true })
    console.log(`[PASS] [${id}] ${title}`)
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    results.push({ id, wave, title, passed: false, error: message })
    console.error(`[FAIL] [${id}] ${title} -> ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main(): Promise<void> {
  const connMod = await import(modUrl('src/main/db/connection.ts'))
  const cryptoMod = await import(modUrl('src/main/db/crypto.ts'))
  const tablesMod = await import(modUrl('src/main/db/schema/tables.ts'))
  const migrationsMod = await import(modUrl('src/main/db/schema/migrations.ts'))
  const seedsMod = await import(modUrl('src/main/db/schema/seeds.ts'))
  const policyMod = await import(modUrl('src/main/channelPolicy.ts'))
  const authMod = await import(modUrl('src/main/db/auth.ts'))
  const settingsMod = await import(modUrl('src/main/db/settings.ts'))
  const businessMod = await import(modUrl('src/main/db/business.ts'))
  const demoMod = await import(modUrl('src/main/db/demo.ts'))
  const attachMod = await import(modUrl('src/main/db/audiology/attachments.ts'))
  const earmoldsMod = await import(modUrl('src/main/db/audiology/earmolds.ts'))
  const updaterMod = await import(modUrl('src/main/updater.ts'))
  const suppliersMod = await import(modUrl('src/main/db/suppliers.ts'))
  const productsMod = await import(modUrl('src/main/db/products.ts'))
  const customersMod = await import(modUrl('src/main/db/customers.ts'))
  const electInvMod = await import(modUrl('src/main/db/appliances/inventory.ts'))
  const treasuryMod = await import(modUrl('src/main/db/treasury.ts'))
  const dashboardMod = await import(modUrl('src/main/db/dashboard.ts'))
  const salesMod = await import(modUrl('src/main/db/sales.ts'))
  const returnsMod = await import(modUrl('src/main/db/returns.ts'))
  const ticketsMod = await import(modUrl('src/main/db/tickets.ts'))
  const techsMod = await import(modUrl('src/main/db/technicians.ts'))
  const utilsMod = await import(modUrl('src/main/db/utils.ts'))

  let dbCounter = 0

  function switchFreshDb(businessType: 'appliances' | 'hearing_aids', tag: string): string {
    connMod.closeDatabase()
    dbCounter += 1
    const dbPath = join(testRootDir, `test_${dbCounter}_${tag}.sqlite`)
    const dbInst = connMod.createDatabaseConnection(dbPath)
    connMod.setDb(dbInst)
    connMod.setDatabasePath(dbPath)
    demoMod.setDemoDataHiddenCache(false)
    tablesMod.createSystemTables()
    businessMod.setInitialBusinessType(businessType)
    demoMod.setDemoDataHidden(false)
    return dbPath
  }

  function makeSession(role: 'super_admin' | 'owner', userId = 1) {
    return {
      userId,
      username: role === 'super_admin' ? 'admin' : 'owner_test',
      full_name: role === 'super_admin' ? 'Super Admin' : 'Center Owner',
      role,
      expiresAt: Date.now() + 3600_000
    }
  }

  // =========================================================================
  // WAVE 1 TESTS
  // =========================================================================

  await runCheck('W1-IPC', 'Wave 1', '125 IPC channels & IElectronAPI 100% parity (incl. treasury:balances)', () => {
    const policyAst = readTsAst('src/main/channelPolicy.ts')
    const mainAst = readTsAst('src/main/index.ts')
    const preloadAst = readTsAst('src/preload/index.ts')
    const preloadDtsAst = readTsAst('src/preload/index.d.ts')
    const webBridgeAst = readTsAst('src/renderer/src/utils/webApiBridge.ts')

    const policyChannels = extractObjectLiteralKeys(policyAst, 'CHANNEL_PERMISSIONS')
    const mainHandlers = extractObjectLiteralKeys(mainAst, 'handlers')
    const preloadInvokeChannels = extractCallStringFirstArgs(preloadAst, new Set(['invoke']))
    const webBridgeHttpChannels = extractCallStringFirstArgs(webBridgeAst, new Set(['invokeHttp']))

    assert.equal(policyChannels.size, 125, `Expected 125 channels in CHANNEL_PERMISSIONS, got ${policyChannels.size}`)
    assert.ok(policyChannels.has('treasury:balances'), 'treasury:balances missing from CHANNEL_PERMISSIONS')

    const policyVsMain = diffSets(policyChannels, mainHandlers)
    assert.deepEqual(policyVsMain, { onlyA: [], onlyB: [] }, `Policy vs main handlers mismatch: ${JSON.stringify(policyVsMain)}`)

    const policyVsPreload = diffSets(policyChannels, preloadInvokeChannels)
    assert.deepEqual(policyVsPreload, { onlyA: [], onlyB: [] }, `Policy vs preload invoke mismatch: ${JSON.stringify(policyVsPreload)}`)

    // webApiBridge implements 123 invokeHttp channels + 2 browser equivalents ('shell:openExternal', 'backup:create')
    const bridgeOnly = [...policyChannels].filter((ch) => !webBridgeHttpChannels.has(ch)).sort()
    assert.deepEqual(
      bridgeOnly,
      ['backup:create', 'shell:openExternal'],
      `Expected only backup:create and shell:openExternal outside invokeHttp, got: ${JSON.stringify(bridgeOnly)}`
    )
    assert.equal(webBridgeHttpChannels.size, 123, `Expected 123 invokeHttp channels, got ${webBridgeHttpChannels.size}`)
    assert.ok(webBridgeHttpChannels.has('treasury:balances'), 'treasury:balances missing from webApiBridge')

    // Method parity between IElectronAPI, preload api, and webApi
    const dtsMethods = extractInterfaceMemberNames(preloadDtsAst, 'IElectronAPI')
    const preloadMethods = extractObjectLiteralKeys(preloadAst, 'api')
    const webMethods = extractObjectLiteralKeys(webBridgeAst, 'webApi')

    assert.ok(dtsMethods.has('getTreasuryBalances'), 'getTreasuryBalances missing from IElectronAPI')
    assert.deepEqual(
      diffSets(dtsMethods, preloadMethods),
      { onlyA: [], onlyB: [] },
      'IElectronAPI vs preload api method mismatch'
    )
    assert.deepEqual(
      diffSets(dtsMethods, webMethods),
      { onlyA: [], onlyB: [] },
      'IElectronAPI vs webApi method mismatch'
    )
  })

  await runCheck('W1-RBAC-AUTH', 'Wave 1', 'RBAC roles (super_admin/owner only), scrypt2 per-user random salt, legacy upgrade & expired session cleanup', () => {
    switchFreshDb('appliances', 'w1_rbac')
    const db = connMod.getDb()

    // Role set checks in channelPolicy
    assert.equal(policyMod.isRoleAuthorized('super_admin', 'super_admin'), true)
    assert.equal(policyMod.isRoleAuthorized('owner', 'super_admin'), false)
    assert.equal(policyMod.isRoleAuthorized('owner', 'manager'), true)
    assert.equal(policyMod.isRoleAuthorized('tenant' as unknown as 'owner', 'manager'), false)

    const superSess = makeSession('super_admin', 1)
    const ownerSess = makeSession('owner', 2)
    assert.equal(policyMod.checkChannelAccess('system:setLanConfig', superSess, ['tickets']).allowed, true)
    assert.equal(policyMod.checkChannelAccess('system:setLanConfig', ownerSess, ['tickets']).allowed, false)
    assert.equal(policyMod.checkChannelAccess('backup:restore', ownerSess, ['backups']).allowed, false)
    assert.equal(policyMod.checkChannelAccess('treasury:balances', ownerSess, ['treasury']).allowed, true)
    assert.equal(policyMod.checkChannelAccess('users:delete', ownerSess, ['tickets']).allowed, true)
    assert.equal(
      policyMod.checkChannelAccess('tickets:delete', { userId: 9, username: 'old', full_name: 'Old', role: 'tenant' as unknown as 'owner', expiresAt: Date.now() + 3600_000 }, ['tickets']).allowed,
      false
    )
    assert.equal(
      policyMod.checkChannelAccess('treasury:balances', { userId: 9, username: 'old', full_name: 'Old', role: 'tenant' as unknown as 'owner', expiresAt: Date.now() + 3600_000 }, ['treasury']).allowed,
      false
    )
    // Owner cannot delete super_admin user
    assert.throws(() => authMod.deleteUser(1, ownerSess), /سوبر أدمن|حذف/)

    // DB CHECK constraint rejects deprecated 'tenant' / 'receptionist'
    assert.throws(
      () => db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES ('bad1', '123', 'Bad', 'tenant')").run(),
      /CHECK/i
    )
    assert.throws(
      () => db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES ('bad2', '123', 'Bad', 'receptionist')").run(),
      /CHECK/i
    )

    // scrypt2 random salt per call
    const h1 = cryptoMod.hashPassword('Secret#123')
    const h2 = cryptoMod.hashPassword('Secret#123')
    assert.match(h1, /^scrypt2:[0-9a-f]{32}:[0-9a-f]{64}$/)
    assert.match(h2, /^scrypt2:[0-9a-f]{32}:[0-9a-f]{64}$/)
    assert.notEqual(h1, h2, 'Each password hash must use a random unique salt')
    assert.equal(cryptoMod.verifyPassword('Secret#123', h1).valid, true)
    assert.equal(cryptoMod.verifyPassword('Secret#123', h1).needsUpgrade, false)
    assert.equal(cryptoMod.verifyPassword('wrong', h1).valid, false)

    // Legacy static-salt scrypt: and plaintext auto-upgrade on loginUser
    const legacyScrypt = `scrypt:${scryptSync('LegacyPass99', cryptoMod.PASSWORD_SALT, 32).toString('hex')}`
    db.prepare(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ('legacy_scrypt', ?, 'Legacy Scrypt', 'owner', 1)`
    ).run(legacyScrypt)
    db.prepare(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ('legacy_plain', 'PlainPass77', 'Legacy Plain', 'owner', 1)`
    ).run()

    const rScrypt = authMod.loginUser({ username: 'legacy_scrypt', password: 'LegacyPass99' })
    assert.equal(rScrypt.success, true)
    const rowScryptAfter = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('legacy_scrypt') as { password_hash: string }
    assert.ok(rowScryptAfter.password_hash.startsWith('scrypt2:'), 'Legacy scrypt: hash should upgrade to scrypt2')

    const rPlain = authMod.loginUser({ username: 'legacy_plain', password: 'PlainPass77' })
    assert.equal(rPlain.success, true)
    const rowPlainAfter = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('legacy_plain') as { password_hash: string }
    assert.ok(rowPlainAfter.password_hash.startsWith('scrypt2:'), 'Legacy plaintext should upgrade to scrypt2')

    // Expired sessions cleanup & verifySession rejection (>= 16 char tokens per auth.ts)
    const expTok1 = 'tok-expired-00000001'
    const expTok2 = 'tok-expired-00000002'
    const validTok1 = 'tok-valid-0000000001'
    db.prepare(
      `INSERT INTO user_sessions (token, user_id, role, expires_at) VALUES
       (?, 1, 'super_admin', '2020-01-01T00:00:00.000Z'),
       (?, 1, 'super_admin', '2099-01-01T00:00:00.000Z')`
    ).run(expTok1, validTok1)
    assert.equal(authMod.verifySession(expTok1).success, false, 'Expired token must fail verification')
    assert.equal(authMod.verifySession(validTok1).success, true, 'Future token must verify')
    const remainingExpired = db.prepare('SELECT COUNT(*) as cnt FROM user_sessions WHERE token = ?').get(expTok1) as { cnt: number }
    assert.equal(remainingExpired.cnt, 0, 'Expired session must be cleaned up')

    db.prepare('INSERT INTO user_sessions (token, user_id, role, expires_at) VALUES (?, 1, ?, ?)').run(
      expTok2,
      'super_admin',
      '2021-01-01T00:00:00.000Z'
    )
    const purged = authMod.cleanupExpiredSessions('2026-11-13T00:00:00.000Z')
    assert.ok(purged >= 1, 'cleanupExpiredSessions should remove expired rows')
    const validAfter = db.prepare('SELECT COUNT(*) as cnt FROM user_sessions WHERE token = ?').get(validTok1) as { cnt: number }
    assert.equal(validAfter.cnt, 1, 'Valid future session must remain intact')
  })

  await runCheck('W1-SETTINGS', 'Wave 1', 'saveSettings protects sensitive keys for super_admin only while allowing owner center/print settings', () => {
    switchFreshDb('appliances', 'w1_settings')
    const ownerSession = makeSession('owner', 2)
    const superSession = makeSession('super_admin', 1)

    const updated = settingsMod.saveSettings(
      {
        center_name: 'مركز المالك المعتمد',
        default_print_format: 'thermal',
        receipt_footer: 'شكراً لزيارتكم'
      },
      ownerSession
    )
    assert.equal(updated.center_name, 'مركز المالك المعتمد')
    assert.equal(updated.default_print_format, 'thermal')

    for (const sensitivePatch of [
      { update_url: 'https://evil.example.com/update' },
      { lan_port: 9999 },
      { lan_enabled: true },
      { browser_enabled: true },
      { auto_backup_enabled: false },
      { auto_backup_dir: 'C:\\evil' },
      { auto_backup_keep_count: 99 },
      { auto_start_windows: true }
    ]) {
      assert.throws(
        () => settingsMod.saveSettings(sensitivePatch, ownerSession),
        /السوبر أدمن/,
        `Owner must not be allowed to modify ${Object.keys(sensitivePatch).join(',')}`
      )
    }

    const superUpdated = settingsMod.saveSettings(
      {
        lan_port: 4777,
        auto_backup_keep_count: 14,
        update_url: 'https://updates.example.com/latest.yml'
      },
      superSession
    )
    assert.equal(superUpdated.lan_port, 4777)
    assert.equal(superUpdated.auto_backup_keep_count, 14)
    assert.equal(superUpdated.update_url, 'https://updates.example.com/latest.yml')
  })

  await runCheck('W1-ATTACHMENTS-SEC02', 'Wave 1', '[SEC-02] Patient attachments extension whitelist & path traversal protection', () => {
    switchFreshDb('hearing_aids', 'w1_attachments')
    const cust = customersMod.saveCustomer({ name: 'مريض اختبار', phone: '01012345001' })

    // Disallowed extensions rejected
    for (const badName of ['payload.exe', 'script.bat', 'run.ps1', 'xss.html', 'vec.svg']) {
      assert.throws(
        () =>
          attachMod.savePatientAttachment({
            patient_id: cust.id,
            title: 'مرفق خطر',
            category: 'general',
            file_name: badName,
            data_base64: Buffer.from('test').toString('base64')
          }),
        /امتداد الملف غير مسموح به/,
        `Extension ${badName} must be rejected`
      )
    }

    // Valid extension succeeds
    const validAtt = attachMod.savePatientAttachment({
      patient_id: cust.id,
      title: 'تقرير سمعيات',
      category: 'audiogram_scan',
      file_name: 'report.txt',
      mime_type: 'text/plain',
      data_base64: Buffer.from('Audiogram ok', 'utf8').toString('base64')
    })
    assert.ok(existsSync(join(settingsMod.getPatientAttachmentsDir(), validAtt.stored_name)))
    const openedValid = attachMod.openOrReadPatientAttachment(validAtt.id, false)
    assert.ok(openedValid.dataUrl && openedValid.dataUrl.startsWith('data:text/plain;base64,'))

    // Path traversal blocked
    const db = connMod.getDb()
    const outsideFile = join(testTempDir, 'secret-outside.txt')
    writeFileSync(outsideFile, 'SENSITIVE_OUTSIDE_FILE', 'utf8')
    const travInfo = db
      .prepare(
        `INSERT INTO patient_attachments (patient_id, title, category, file_name, stored_name, mime_type, file_size)
         VALUES (?, 'traversal', 'general', 'outside.txt', ?, 'text/plain', 22)`
      )
      .run(cust.id, outsideFile)
    const relTravInfo = db
      .prepare(
        `INSERT INTO patient_attachments (patient_id, title, category, file_name, stored_name, mime_type, file_size)
         VALUES (?, 'traversal-rel', 'general', 'outside.txt', '../../tmp/secret-outside.txt', 'text/plain', 22)`
      )
      .run(cust.id)

    assert.throws(
      () => attachMod.openOrReadPatientAttachment(Number(travInfo.lastInsertRowid), false),
      /مسار ملف المرفق غير مسموح به/
    )
    assert.throws(
      () => attachMod.openOrReadPatientAttachment(Number(relTravInfo.lastInsertRowid), false),
      /مسار ملف المرفق غير مسموح به/
    )
  })

  await runCheck('W1-UPDATER', 'Wave 1', 'verifyDownloadedInstaller SHA-512 (latest.yml) / SHA-256 verification & unsigned block in packaged mode', async () => {
    // Trusted update URL check
    assert.equal(updaterMod.isTrustedUpdateUrl('https://github.com/org/repo/releases/latest/download/latest.yml'), true)
    assert.equal(updaterMod.isTrustedUpdateUrl('https://objects.githubusercontent.com/file.exe'), true)
    assert.equal(updaterMod.isTrustedUpdateUrl('http://github.com/org/repo/latest.yml'), false)
    assert.equal(updaterMod.isTrustedUpdateUrl('https://evil.example.com/latest.yml'), false)

    // Tiny corrupt file rejected
    const tinyPath = join(testTempDir, 'tiny.exe')
    writeFileSync(tinyPath, Buffer.from('MZshort'))
    const tinyRes = await updaterMod.verifyDownloadedInstaller(tinyPath)
    assert.equal(tinyRes.valid, false)

    // Valid minimal unsigned PE32+ executable (Get-AuthenticodeSignature -> NotSigned)
    const peBuf = Buffer.alloc(2048, 0)
    peBuf.write('MZ', 0, 'ascii')
    peBuf.writeUInt32LE(0x80, 0x3c)
    peBuf.write('PE\0\0', 0x80, 'ascii')
    peBuf.writeUInt16LE(0x8664, 0x84)
    peBuf.writeUInt16LE(0x00f0, 0x94)
    peBuf.writeUInt16LE(0x2022, 0x96)
    peBuf.writeUInt16LE(0x020b, 0x98)
    peBuf.writeUInt32LE(0x0200, 0xd4)
    const pePath = join(testTempDir, 'fake-installer.exe')
    writeFileSync(pePath, peBuf)

    const expectedSha256Hex = createHash('sha256').update(peBuf).digest('hex')
    const expectedSha512Hex = createHash('sha512').update(peBuf).digest('hex')
    const expectedSha512B64 = createHash('sha512').update(peBuf).digest('base64')

    globalThis.__SALLEHLI_TEST_IS_PACKAGED__ = false
    try {
      const okSha512B64 = await updaterMod.verifyDownloadedInstaller(pePath, {
        expectedSha512: expectedSha512B64
      })
      assert.equal(okSha512B64.valid, true, `Base64 sha512 from latest.yml should pass: ${okSha512B64.reason}`)

      const okSha512Hex = await updaterMod.verifyDownloadedInstaller(pePath, {
        expectedSha512: expectedSha512Hex,
        expectedSha256: expectedSha256Hex
      })
      assert.equal(okSha512Hex.valid, true)

      const badSha512 = await updaterMod.verifyDownloadedInstaller(pePath, {
        expectedSha512: '0'.repeat(128)
      })
      assert.equal(badSha512.valid, false, 'Mismatched SHA-512 must be rejected')

      const badSha256 = await updaterMod.verifyDownloadedInstaller(pePath, {
        expectedSha256: 'f'.repeat(64)
      })
      assert.equal(badSha256.valid, false, 'Mismatched SHA-256 must be rejected')

      // Packaged mode: unsigned installer without checksum must ALWAYS be rejected
      globalThis.__SALLEHLI_TEST_IS_PACKAGED__ = true
      const packagedUnsigned = await updaterMod.verifyDownloadedInstaller(pePath, {
        allowUnsignedLocal: false
      })
      assert.equal(packagedUnsigned.valid, false, 'Packaged mode must block unsigned installer with no checksum')
    } finally {
      globalThis.__SALLEHLI_TEST_IS_PACKAGED__ = false
    }
  })

  await runCheck('W1-DATA-INTEGRITY', 'Wave 1', '[FIN-01, FIN-06, FIN-21, FIN-22] saveSupplier balance, saveProduct qty, saveElectSparePart & FK delete guards', () => {
    switchFreshDb('hearing_aids', 'w1_integrity')

    // [FIN-01] saveSupplier preserves balance on edit
    const sup = suppliersMod.saveSupplier({ name: 'مورد السلام', phone: '01090000001' })
    const pProd = productsMod.saveProduct({
      name: 'بطارية سمعية 13',
      type: 'battery',
      cost_price: 20,
      sale_price: 40,
      qty: 0
    })
    suppliersMod.savePurchaseInvoice({
      supplier_id: sup.id,
      items: [{ product_id: pProd.id, product_name: pProd.name, quantity: 5, unit: 'piece', pack_size: 1, unit_cost: 20 }],
      paid_amount: 40,
      recordInTreasury: true
    })
    const supAfterPurchase = suppliersMod.listSuppliers().find((s: { id: number }) => s.id === sup.id)!
    assert.equal(supAfterPurchase.balance, 60)

    const supEdited = suppliersMod.saveSupplier({
      id: sup.id,
      name: 'مورد السلام المعدل',
      phone: '01090000001',
      balance: 0
    })
    assert.equal(supEdited.balance, 60, '[FIN-01] Editing supplier must NOT overwrite balance')

    // [FIN-06] saveProduct preserves qty when editing
    const prod2 = productsMod.saveProduct({
      name: 'سماعة اختبار مخزون',
      type: 'accessory',
      cost_price: 100,
      sale_price: 150,
      qty: 15
    })
    const prod2Edited = productsMod.saveProduct({
      id: prod2.id,
      name: 'سماعة اختبار مخزون - محدث',
      type: 'accessory',
      cost_price: 110,
      sale_price: 160,
      qty: 999
    })
    assert.equal(prod2Edited.qty, 15, '[FIN-06] Editing existing product must NOT overwrite qty')

    // [FIN-21] deleteProduct blocks product referenced in purchase_items / sales_items
    assert.throws(
      () => productsMod.deleteProduct(pProd.id),
      /لا يمكن حذف هذا المنتج|لارتباطه/,
      '[FIN-21] Product with purchase history must not be deleted'
    )

    // [FIN-22] deleteCustomer blocks customer with financial/ticket records
    const cust = customersMod.saveCustomer({ name: 'عميل محمي', phone: '01122334499' })
    salesMod.saveSalesInvoice({
      invoice_type: 'regular',
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone,
      paid_amount: 160,
      recordInTreasury: false,
      items: [
        {
          product_id: prod2.id,
          product_name: prod2.name,
          item_type: 'accessory',
          unit: 'piece',
          pack_size: 1,
          quantity: 1,
          deducted_pieces_qty: 1,
          unit_cost: 110,
          unit_price: 160,
          discount: 0,
          total_price: 160,
          warranty_months: 0,
          returned_qty: 0
        }
      ]
    })
    assert.throws(
      () => customersMod.deleteCustomer(cust.id),
      /لا يمكن حذف هذا العميل|لارتباطه/,
      '[FIN-22] Customer with sales invoice must not be deleted'
    )

    // saveElectSparePart guards & quantity preservation when omitted on edit
    switchFreshDb('appliances', 'w1_elect_part')
    assert.throws(() => electInvMod.saveElectSparePart({ name: '   ' }), /اسم قطعة الغيار/)
    const part = electInvMod.saveElectSparePart({
      code: 'SP-GUARD-1',
      name: 'ثيرموستات ثلاجة',
      category: 'ثلاجات',
      purchase_price: 50,
      selling_price: 90,
      quantity: 12
    })
    const partUpdated = electInvMod.saveElectSparePart({
      id: part.id,
      name: 'ثيرموستات ثلاجة أصلي',
      purchase_price: 55,
      selling_price: 95
    })
    assert.equal(partUpdated.quantity, 12, 'saveElectSparePart must preserve quantity when omitted on update')
    assert.throws(() => electInvMod.saveElectSparePart({ id: 999999, name: 'غير موجود' }), /غير موجودة/)
    assert.throws(
      () => electInvMod.saveElectSparePart({ id: part.id, name: '   ' }),
      /اسم قطعة الغيار/
    )
  })

  // =========================================================================
  // WAVE 2 TESTS
  // =========================================================================

  await runCheck('W2-LEGACY-MIGRATION', 'Wave 2', 'createTables & runMigrations from legacy a0970e5c DB (linked_tx_id, is_restored, inventory_movements & ticket_parts rebuild)', () => {
    connMod.closeDatabase()
    dbCounter += 1
    const legacyDbPath = join(testRootDir, `legacy_a0970e5c_${dbCounter}.sqlite`)
    const db = connMod.createDatabaseConnection(legacyDbPath)
    connMod.setDb(db)
    connMod.setDatabasePath(legacyDbPath)
    demoMod.setDemoDataHiddenCache(false)

    // Exact pre-multi-business legacy a0970e5c schema subset + sample records
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        role TEXT NOT NULL CHECK(role IN ('super_admin', 'owner', 'tenant')),
        is_active INTEGER NOT NULL DEFAULT 1,
        subscription_start TEXT DEFAULT NULL,
        subscription_end TEXT DEFAULT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        phone2 TEXT DEFAULT '',
        area TEXT DEFAULT '',
        address TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE customer_appliances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        appliance_type TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT DEFAULT '',
        serial_number TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        last_warranty_end TEXT DEFAULT NULL,
        last_ticket_number TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
      CREATE TABLE technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        specialty TEXT NOT NULL,
        commission_rate REAL NOT NULL DEFAULT 30,
        base_salary REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE spare_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        brand TEXT DEFAULT 'عام',
        purchase_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_quantity INTEGER NOT NULL DEFAULT 3,
        location TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE maintenance_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_phone2 TEXT DEFAULT '',
        customer_area TEXT DEFAULT '',
        customer_address TEXT DEFAULT '',
        appliance_id INTEGER DEFAULT NULL,
        appliance_type TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT DEFAULT '',
        serial_number TEXT DEFAULT '',
        service_type TEXT NOT NULL CHECK(service_type IN ('home_visit', 'workshop')),
        status TEXT NOT NULL DEFAULT 'new',
        priority TEXT NOT NULL DEFAULT 'normal',
        complaint TEXT NOT NULL,
        diagnosis TEXT DEFAULT '',
        technician_id INTEGER DEFAULT NULL,
        scheduled_date TEXT NOT NULL,
        inspection_fee REAL NOT NULL DEFAULT 150,
        labor_cost REAL NOT NULL DEFAULT 0,
        parts_total REAL NOT NULL DEFAULT 0,
        parts_cost_total REAL NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 150,
        paid_amount REAL NOT NULL DEFAULT 0,
        remaining_amount REAL NOT NULL DEFAULT 150,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        warranty_months INTEGER NOT NULL DEFAULT 3,
        warranty_start_date TEXT DEFAULT NULL,
        warranty_end_date TEXT DEFAULT NULL,
        is_under_previous_warranty INTEGER NOT NULL DEFAULT 0,
        previous_ticket_number TEXT DEFAULT NULL,
        notes TEXT DEFAULT '',
        completed_at TEXT DEFAULT NULL,
        delivered_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
      );
      CREATE TABLE ticket_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        part_id INTEGER NOT NULL,
        part_name TEXT NOT NULL,
        part_code TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_cost REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE RESTRICT
      );
      CREATE TABLE inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_id INTEGER NOT NULL,
        technician_id INTEGER DEFAULT NULL,
        ticket_id INTEGER DEFAULT NULL,
        movement_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE
      );
      CREATE TABLE treasury_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income', 'expense', 'tech_commission')),
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        ticket_id INTEGER DEFAULT NULL,
        technician_id INTEGER DEFAULT NULL,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        description TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      INSERT INTO users (username, password_hash, full_name, role) VALUES ('admin', '8520', 'Admin', 'super_admin');
      INSERT INTO settings (key, value) VALUES ('center_name', 'مركز قديم');
      INSERT INTO customers (name, phone) VALUES ('عميل قديم', '01011112222');
      INSERT INTO technicians (name, phone, specialty, commission_rate) VALUES ('فني قديم', '01022223333', 'غسالات', 35);
      INSERT INTO spare_parts (code, name, category, purchase_price, selling_price, quantity)
        VALUES ('LEG-1', 'طلمبة قديمة', 'غسالات', 200, 350, 7);
      INSERT INTO maintenance_tickets (ticket_number, customer_id, customer_name, customer_phone, appliance_type, brand, service_type, complaint, technician_id, scheduled_date)
        VALUES ('SJ-2025-0001', 1, 'عميل قديم', '01011112222', 'غسالة', 'LG', 'workshop', 'عطل قديم', 1, '2025-05-01');
      INSERT INTO ticket_parts (ticket_id, part_id, part_name, part_code, quantity, unit_cost, unit_price, total_price)
        VALUES (1, 1, 'طلمبة قديمة', 'LEG-1', 1, 200, 350, 350);
      INSERT INTO inventory_movements (part_id, ticket_id, movement_type, quantity, unit_cost, unit_price, notes)
        VALUES (1, 1, 'out_ticket', 1, 200, 350, 'حركة قديمة');
      INSERT INTO treasury_transactions (transaction_type, category, amount, description)
        VALUES ('income', 'تحصيل صيانة / كشف', 150, 'قيد قديم');
    `)

    // Run Wave 2 table creation + full migrations
    tablesMod.createSystemTables()
    tablesMod.createTables('appliances')
    migrationsMod.runMigrations()
    seedsMod.seedDefaults('appliances')

    // Assert rebuilt inventory_movements & ticket_parts schemas & preserved rows
    const invCols = db.prepare('PRAGMA table_info(inventory_movements)').all() as Array<{ name: string; notnull: number }>
    const tpCols = db.prepare('PRAGMA table_info(ticket_parts)').all() as Array<{ name: string; notnull: number }>
    const ttCols = db.prepare('PRAGMA table_info(treasury_transactions)').all() as Array<{ name: string }>
    const mtCols = db.prepare('PRAGMA table_info(maintenance_tickets)').all() as Array<{ name: string }>

    const invMap = new Map(invCols.map((c) => [c.name, c]))
    const tpMap = new Map(tpCols.map((c) => [c.name, c]))
    assert.ok(invMap.has('product_id') && invMap.has('variant_id') && invMap.has('serial_no') && invMap.has('ref_type') && invMap.has('ref_id'))
    assert.equal(invMap.get('part_id')?.notnull, 0, 'inventory_movements.part_id must become nullable after rebuild')
    assert.ok(tpMap.has('product_id') && tpMap.has('variant_id') && tpMap.has('unit') && tpMap.has('pack_size') && tpMap.has('is_restored'))
    assert.equal(tpMap.get('part_id')?.notnull, 0, 'ticket_parts.part_id must become nullable after rebuild')
    assert.ok(ttCols.some((c) => c.name === 'linked_tx_id'), 'treasury_transactions must have linked_tx_id')
    assert.ok(mtCols.some((c) => c.name === 'loaner_serial_id'))
    assert.ok(mtCols.some((c) => c.name === 'commission_amount'))

    const preservedPart = db.prepare('SELECT * FROM elect_spare_parts WHERE id = 1').get() as { code: string } | undefined
    assert.equal(preservedPart?.code, 'LEG-1', 'Legacy spare_parts must migrate cleanly into elect_spare_parts')
    const preservedTp = db.prepare('SELECT is_restored, part_code FROM ticket_parts WHERE id = 1').get() as { is_restored: number; part_code: string } | undefined
    assert.equal(preservedTp?.part_code, 'LEG-1')
    assert.equal(preservedTp?.is_restored, 0)
    const preservedIm = db.prepare('SELECT ticket_id, movement_type FROM inventory_movements WHERE id = 1').get() as { ticket_id: number; movement_type: string } | undefined
    assert.equal(preservedIm?.ticket_id, 1)
    assert.equal(preservedIm?.movement_type, 'out_ticket')

    // Null part_id insert works on rebuilt tables (no NOT NULL constraint leftover)
    db.prepare(
      `INSERT INTO inventory_movements (part_id, product_id, movement_type, quantity, notes)
       VALUES (NULL, 1, 'in', 2, 'nullable part_id ok')`
    ).run()
  })

  await runCheck('W2-FIFO-WAC', 'Wave 2', '[FIN-02, FIN-17] paySupplier FIFO settlement & savePurchaseInvoice WAC (piece, pack, variant & serial)', () => {
    switchFreshDb('hearing_aids', 'w2_fifo_wac')
    const db = connMod.getDb()

    const sup = suppliersMod.saveSupplier({ name: 'مورد الجملة', phone: '01055551111' })

    // 1) Simple piece + pack product WAC tests
    const bat = productsMod.saveProduct({
      name: 'بطارية زنك',
      type: 'battery',
      pack_size: 5,
      cost_price: 0,
      pack_cost_price: 0,
      sale_price: 50,
      qty: 0
    })
    // Also verify zero-stock non-zero stale cost gets replaced cleanly when starting qty <= 0
    db.prepare('UPDATE products SET cost_price = 999 WHERE id = ?').run(bat.id)
    // Purchase #1: 4 pieces @ 100, unpaid 400 (inv1)
    const inv1 = suppliersMod.savePurchaseInvoice({
      supplier_id: sup.id,
      paid_amount: 100, // remaining = 300
      recordInTreasury: true,
      items: [{ product_id: bat.id, product_name: bat.name, unit: 'piece', pack_size: 5, quantity: 4, unit_cost: 100 }]
    })
    let batNow = productsMod.getProductById(bat.id)!
    assert.equal(batNow.qty, 4)
    assert.equal(batNow.cost_price, 100, 'When starting qty <= 0, WAC must equal new purchase unit cost')

    // Purchase #2: 6 pieces @ 200 -> WAC = (4*100 + 6*200) / 10 = 160
    const inv2 = suppliersMod.savePurchaseInvoice({
      supplier_id: sup.id,
      paid_amount: 700, // total 1200 -> remaining = 500
      recordInTreasury: true,
      items: [{ product_id: bat.id, product_name: bat.name, unit: 'piece', pack_size: 5, quantity: 6, unit_cost: 200 }]
    })
    batNow = productsMod.getProductById(bat.id)!
    assert.equal(batNow.qty, 10)
    assert.equal(batNow.cost_price, 160)

    // Purchase #3: 2 packs (=10 pieces) @ 500/pack (=100/piece) -> WAC = (10*160 + 10*100) / 20 = 130, pack_cost = 650
    suppliersMod.savePurchaseInvoice({
      supplier_id: sup.id,
      paid_amount: 1000,
      recordInTreasury: true,
      items: [{ product_id: bat.id, product_name: bat.name, unit: 'pack', pack_size: 5, quantity: 2, unit_cost: 500 }]
    })
    batNow = productsMod.getProductById(bat.id)!
    assert.equal(batNow.qty, 20)
    assert.equal(batNow.cost_price, 130)
    assert.equal(batNow.pack_cost_price, 650)

    // Pack-to-pack weighted average explicitly: existing 2 packs (qty=10) @ pack_cost=800 -> buy 2 packs @ 500 -> (2*800 + 2*500)/4 = 650
    const packProd = productsMod.saveProduct({
      name: 'باكيت اختبار متوسط مرجح',
      type: 'battery',
      pack_size: 5,
      cost_price: 160,
      pack_cost_price: 800,
      sale_price: 250,
      qty: 10
    })
    suppliersMod.savePurchaseInvoice({
      supplier_id: sup.id,
      paid_amount: 1000,
      recordInTreasury: false,
      items: [{ product_id: packProd.id, product_name: packProd.name, unit: 'pack', pack_size: 5, quantity: 2, unit_cost: 500 }]
    })
    const packProdNow = productsMod.getProductById(packProd.id)!
    assert.equal(packProdNow.qty, 20)
    assert.equal(packProdNow.cost_price, 130)
    assert.equal(packProdNow.pack_cost_price, 650)

    // Variant WAC test (with null variant cost_price falling back to parent cost_price=50)
    const dome = productsMod.saveProduct({
      name: 'دوم سليكون',
      type: 'accessory',
      has_variants: 1,
      cost_price: 50,
      sale_price: 100,
      variants: [{ variant_name: 'صغير', qty: 2, cost_price: null as unknown as number }]
    })
    const variantId = dome.variants![0].id!
    suppliersMod.savePurchaseInvoice({
      supplier_id: sup.id,
      paid_amount: 180,
      recordInTreasury: true,
      items: [{ product_id: dome.id, variant_id: variantId, variant_name: 'صغير', product_name: dome.name, unit: 'piece', pack_size: 1, quantity: 2, unit_cost: 90 }]
    })
    const varAfter = db.prepare('SELECT qty, cost_price FROM product_variants WHERE id = ?').get(variantId) as { qty: number; cost_price: number }
    assert.equal(varAfter.qty, 4)
    assert.equal(varAfter.cost_price, 70, 'Variant WAC must fall back to parent cost_price when variant cost is null')

    // Tracked serial WAC test
    const aid = productsMod.saveProduct({
      name: 'سماعة ديجيتال',
      type: 'hearing_aid',
      track_serial: 1,
      cost_price: 1000,
      sale_price: 2500
    })
    db.prepare(
      `INSERT INTO product_serials (product_id, serial_no, status, condition, unit_cost)
       VALUES (?, 'SN-WAC-1', 'in_stock', 'new', 1000)`
    ).run(aid.id)
    productsMod.syncProductQtyFromChildren(aid.id)

    suppliersMod.savePurchaseInvoice({
      supplier_id: sup.id,
      paid_amount: 1400,
      recordInTreasury: true,
      items: [
        {
          product_id: aid.id,
          product_name: aid.name,
          unit: 'piece',
          pack_size: 1,
          quantity: 1,
          unit_cost: 1400,
          serials: [{ serial_no: 'SN-WAC-2', condition: 'new' }]
        }
      ]
    })
    const aidAfter = productsMod.getProductById(aid.id)!
    assert.equal(aidAfter.qty, 2)
    assert.equal(aidAfter.cost_price, 1200, 'Tracked serial WAC must average existing in_stock & newly purchased serial')

    // [FIN-02] FIFO settlement across inv1 (remaining=300) and inv2 (remaining=500)
    const payRes = suppliersMod.paySupplier({
      supplier_id: sup.id,
      amount: 450,
      payment_method: 'cash',
      recordInTreasury: true
    })
    const inv1Mid = suppliersMod.getPurchaseInvoiceById(inv1.id)!
    const inv2Mid = suppliersMod.getPurchaseInvoiceById(inv2.id)!
    assert.equal(inv1Mid.remaining_amount, 0, 'FIFO must fully settle oldest invoice first')
    assert.equal(inv1Mid.paid_amount, 400)
    assert.equal(inv2Mid.remaining_amount, 350, 'FIFO must apply remainder 150 to second invoice')
    assert.equal(inv2Mid.paid_amount, 850)
    assert.equal(payRes.balance, 350)

    const txIdRow = db
      .prepare('SELECT treasury_tx_id FROM supplier_payments WHERE supplier_id = ? AND treasury_tx_id IS NOT NULL ORDER BY id DESC LIMIT 1')
      .get(sup.id) as { treasury_tx_id: number }
    const sharedTreasuryTxId = txIdRow.treasury_tx_id

    const payRows = db
      .prepare('SELECT purchase_invoice_id, amount, treasury_tx_id FROM supplier_payments WHERE treasury_tx_id = ? ORDER BY id ASC')
      .all(sharedTreasuryTxId) as Array<{ purchase_invoice_id: number; amount: number; treasury_tx_id: number }>
    assert.equal(payRows.length, 2, 'FIFO split payment across 2 invoices must log 2 supplier_payments linked to treasury_tx_id')
    assert.equal(payRows[0].amount, 300)
    assert.equal(payRows[1].amount, 150)

    // [FIN-15] Reversing that single treasury tx reverts BOTH invoices and supplier balance atomically
    treasuryMod.deleteTreasuryTransaction(sharedTreasuryTxId)
    const inv1Rev = suppliersMod.getPurchaseInvoiceById(inv1.id)!
    const inv2Rev = suppliersMod.getPurchaseInvoiceById(inv2.id)!
    assert.equal(inv1Rev.remaining_amount, 300)
    assert.equal(inv2Rev.remaining_amount, 500)
    const supRev = suppliersMod.listSuppliers().find((s: { id: number }) => s.id === sup.id)!
    assert.equal(supRev.balance, 800)
    const remainingPayRows = db
      .prepare('SELECT COUNT(*) as cnt FROM supplier_payments WHERE treasury_tx_id = ?')
      .get(sharedTreasuryTxId) as { cnt: number }
    assert.equal(remainingPayRows.cnt, 0)
  })

  await runCheck('W2-TREASURY-PAIRS', 'Wave 2', '[FIN-14, FIN-15] Treasury balances over 300+ rows, demo hiding, linked transfers & paired atomic reversal', () => {
    switchFreshDb('appliances', 'w2_treasury')
    const db = connMod.getDb()

    // Insert 320 real entries across 4 methods + 5 demo entries
    const methods = ['cash', 'vodafone_cash', 'bank_transfer', 'instapay']
    for (let i = 0; i < 320; i++) {
      const m = methods[i % 4]
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description, is_demo)
         VALUES ('income', 'إيرادات متنوعة', 10, ?, ?, 0)`
      ).run(m, `قيد رقم ${i + 1}`)
    }
    db.prepare(
      `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description, is_demo)
       VALUES ('income', 'إيراد تجريبي', 1000, 'cash', 'بيانات ديمو', 1)`
    ).run()

    demoMod.setDemoDataHidden(false)
    const balWithDemo = treasuryMod.getTreasuryBalances()
    assert.equal(balWithDemo.total, 4200, '320*10 + 1000 demo must sum accurately beyond 300 rows')
    assert.equal(balWithDemo.byMethod.cash.net, 1800)
    assert.equal(balWithDemo.byMethod.vodafone_cash.net, 800)
    assert.equal(balWithDemo.byMethod.bank_transfer.net, 800)
    assert.equal(balWithDemo.byMethod.instapay.net, 800)

    demoMod.setDemoDataHidden(true)
    const balNoDemo = treasuryMod.getTreasuryBalances()
    assert.equal(balNoDemo.total, 3200, 'isDemoDataHidden(true) must exclude demo transactions')
    assert.equal(balNoDemo.byMethod.cash.net, 800)

    // [FIN-14] Bidirectional linked_tx_id transfer
    treasuryMod.transferTreasuryFunds({
      fromMethod: 'cash',
      toMethod: 'instapay',
      amount: 250,
      notes: 'تحويل تجربة'
    })
    const balAfterTransfer = treasuryMod.getTreasuryBalances()
    assert.equal(balAfterTransfer.total, 3200, 'Internal transfer must keep total treasury unchanged')
    assert.equal(balAfterTransfer.byMethod.cash.net, 550)
    assert.equal(balAfterTransfer.byMethod.instapay.net, 1050)

    const pairRows = db
      .prepare("SELECT id, transaction_type, linked_tx_id, payment_method FROM treasury_transactions WHERE category = 'تحويل بين الخزائن' ORDER BY id ASC")
      .all() as Array<{ id: number; transaction_type: string; linked_tx_id: number | null; payment_method: string }>
    assert.equal(pairRows.length, 2)
    assert.equal(pairRows[0].linked_tx_id, pairRows[1].id, 'Outgoing transfer must point linked_tx_id to incoming')
    assert.equal(pairRows[1].linked_tx_id, pairRows[0].id, 'Incoming transfer must point linked_tx_id to outgoing')

    // [FIN-15] Deleting either half deletes both halves atomically
    treasuryMod.deleteTreasuryTransaction(pairRows[0].id)
    const countAfterDel = db
      .prepare("SELECT COUNT(*) as cnt FROM treasury_transactions WHERE category = 'تحويل بين الخزائن'")
      .get() as { cnt: number }
    assert.equal(countAfterDel.cnt, 0, 'Deleting one transfer side must atomically delete its linked counterpart')
    const balRestored = treasuryMod.getTreasuryBalances()
    assert.equal(balRestored.byMethod.cash.net, 800)
    assert.equal(balRestored.byMethod.instapay.net, 800)
  })

  await runCheck('W2-REPORT-DASHBOARD-FIN03', 'Wave 2', '[FIN-03] Accrual netProfit vs netCashFlow & getFinancialReport/getDashboardStats parity across activities and demo toggle', () => {
    for (const biz of ['appliances', 'hearing_aids'] as const) {
      switchFreshDb(biz, `w2_report_${biz}`)
      const db = connMod.getDb()
      const tech = techsMod.saveTechnician({ name: `فني تقرير ${biz}`, phone: '01099988877', commission_rate: 20 })
      const cust = customersMod.saveCustomer({ name: `عميل تقرير ${biz}`, phone: '01077766655' })

      if (biz === 'hearing_aids') {
        // Product sale: cost 100, price 250 => sales profit 150, partial paid 100 (receivable 150)
        const prod = productsMod.saveProduct({
          name: `صنف ${biz}`,
          type: 'accessory',
          cost_price: 100,
          sale_price: 250,
          qty: 10
        })
        salesMod.saveSalesInvoice({
          invoice_type: 'regular',
          customer_id: cust.id,
          customer_name: cust.name,
          customer_phone: cust.phone,
          paid_amount: 100,
          payment_method: 'cash',
          recordInTreasury: true,
          items: [
            {
              product_id: prod.id,
              product_name: prod.name,
              item_type: prod.type,
              unit: 'piece',
              pack_size: 1,
              quantity: 1,
              deducted_pieces_qty: 1,
              unit_cost: 100,
              unit_price: 250,
              discount: 0,
              total_price: 250,
              warranty_months: 0,
              returned_qty: 0
            }
          ]
        })

        // Ticket: inspection 50 + labor 150 = 200, no parts, paid 50 (receivable 150)
        ticketsMod.saveTicket({
          customer_id: cust.id,
          customer_name: cust.name,
          customer_phone: cust.phone,
          appliance_type: 'سماعة',
          brand: 'TestBrand',
          service_type: 'workshop',
          status: 'delivered',
          complaint: 'تقرير مالي',
          technician_id: tech.id,
          inspection_fee: 50,
          labor_cost: 150,
          paid_amount: 50,
          recordPaymentInTreasury: true
        })
      } else {
        // Appliances: ticket using spare part (cost 80, sell 230 => partsProfit 150) + inspection 50 + labor 150 = 350 profit, paid 100 (receivable 330)
        const part = electInvMod.saveElectSparePart({
          code: 'FIN03-SP',
          name: 'قطعة تقرير مالي',
          category: 'غسالات',
          purchase_price: 80,
          selling_price: 230,
          quantity: 10
        })
        ticketsMod.saveTicket({
          customer_id: cust.id,
          customer_name: cust.name,
          customer_phone: cust.phone,
          appliance_type: 'غسالة',
          brand: 'TestBrand',
          service_type: 'workshop',
          status: 'delivered',
          complaint: 'تقرير مالي أجهزة',
          technician_id: tech.id,
          inspection_fee: 50,
          labor_cost: 150,
          paid_amount: 100,
          recordPaymentInTreasury: true,
          parts: [
            {
              part_id: part.id,
              part_name: part.name,
              part_code: part.code,
              quantity: 1,
              unit_cost: 80,
              unit_price: 230,
              total_price: 230
            }
          ]
        })
      }

      // Operating income 40, expense 70, tech commission payout 30
      treasuryMod.addTreasuryTransaction({ transaction_type: 'income', category: 'إيرادات أخرى', amount: 40, payment_method: 'cash', description: 'أخرى' })
      treasuryMod.addTreasuryTransaction({ transaction_type: 'expense', category: 'مصاريف تشغيل', amount: 70, payment_method: 'cash', description: 'إيجار' })
      treasuryMod.addTreasuryTransaction({ transaction_type: 'tech_commission', category: 'عمولة فني', amount: 30, technician_id: tech.id, payment_method: 'cash', description: 'صرف عمولة' })

      // Demo records (hidden vs shown), tagged with current business_type
      db.prepare(
        `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description, is_demo, business_type)
         VALUES ('income', 'إيرادات تجريبية', 500, 'cash', 'ديمو', 1, ?)`
      ).run(biz)

      const today = utilsMod.getLocalDateString()
      const monthStart = `${today.slice(0, 7)}-01`

      for (const hideDemo of [false, true]) {
        demoMod.setDemoDataHidden(hideDemo)
        const report = treasuryMod.getFinancialReport(monthStart, today)
        const dash = dashboardMod.getDashboardStats()

        assert.equal(
          dash.monthNetProfit,
          report.summary.netProfit,
          `${biz} (hideDemo=${hideDemo}): Dashboard monthNetProfit (${dash.monthNetProfit}) must match FinancialReport netProfit (${report.summary.netProfit})`
        )
        const expectedNetProfit = utilsMod.roundMoney(150 + 200 + 40 - 70 - 30 + (hideDemo ? 0 : 500))
        assert.equal(report.summary.netProfit, expectedNetProfit, `${biz} accrual netProfit mismatch`)

        const expectedCashFlow = utilsMod.roundMoney(
          report.summary.totalIncome - report.summary.totalExpense - report.summary.totalTechCommissions
        )
        assert.equal(report.summary.netCashFlow, expectedCashFlow)
        assert.notEqual(report.summary.netProfit, report.summary.netCashFlow, 'Accrual netProfit and netCashFlow must reflect receivables vs cash timing difference')
      }
    }
  })

  await runCheck('W2-SALES-RETURNS-EXCHANGE', 'Wave 2', '[FIN-04, FIN-08, FIN-09, FIN-10, FIN-20] Invoice delete guard & sales_return_in, post-mult rounding, damaged return, exchange negative/positive treasury links & sequential numbers', () => {
    switchFreshDb('hearing_aids', 'w2_sales_returns')
    const db = connMod.getDb()
    const cust = customersMod.saveCustomer({ name: 'عميل مبيعات', phone: '01033334444' })
    const p1 = productsMod.saveProduct({ code: 'SR-P1', name: 'بطارية 312', type: 'battery', cost_price: 5, sale_price: 10, qty: 20 })
    const p2 = productsMod.saveProduct({ code: 'SR-P2', name: 'شاحن سماعة', type: 'accessory', cost_price: 200, sale_price: 400, qty: 10 })

    // [FIN-09] 3 units * 10 = 30, discount = 5 -> total = 25 (effective 8.3333.../unit). Returning 3 must equal 25.00 (not 24.99), returning 2 must equal 16.67 (not 16.66)
    const invRound = salesMod.saveSalesInvoice({
      invoice_type: 'regular',
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone,
      discount: 5,
      paid_amount: 25,
      recordInTreasury: true,
      items: [
        {
          product_id: p1.id,
          product_name: p1.name,
          item_type: 'battery',
          unit: 'piece',
          pack_size: 1,
          quantity: 3,
          deducted_pieces_qty: 3,
          unit_cost: 5,
          unit_price: 10,
          discount: 0,
          total_price: 30,
          warranty_months: 0,
          returned_qty: 0
        }
      ]
    })
    assert.equal(invRound.total_amount, 25)

    // [FIN-04] Guard: cannot delete invoice while it has treasury payment or returns
    assert.throws(
      () => salesMod.deleteSalesInvoice(invRound.id),
      /خزينة|حذف/,
      '[FIN-04] Invoice with unreversed treasury payment must not be deleted'
    )

    const partialRet = returnsMod.createSalesReturn({
      invoice_id: invRound.id,
      payment_method: 'cash',
      items: [{ invoice_item_id: invRound.items![0].id!, quantity: 2, return_condition: 'in_stock' }]
    })
    assert.equal(partialRet.total_return_amount, 16.67, '[FIN-09] 2 * (25/3) rounded after multiplication must be 16.67')

    const finalRet = returnsMod.createSalesReturn({
      invoice_id: invRound.id,
      payment_method: 'cash',
      items: [{ invoice_item_id: invRound.items![0].id!, quantity: 1, return_condition: 'in_stock' }]
    })
    assert.equal(finalRet.total_return_amount, 8.33)
    assert.equal(productsMod.getProductById(p1.id)!.qty, 20)

    // Still blocked from deletion because invoice has returns
    assert.throws(() => salesMod.deleteSalesInvoice(invRound.id), /مرتجعات/)

    // [FIN-10] Defective return logs 'damaged' movement & does NOT increase good stock
    const invDef = salesMod.saveSalesInvoice({
      invoice_type: 'regular',
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone,
      paid_amount: 400,
      recordInTreasury: true,
      items: [
        {
          product_id: p2.id,
          product_name: p2.name,
          item_type: 'accessory',
          unit: 'piece',
          pack_size: 1,
          quantity: 1,
          deducted_pieces_qty: 1,
          unit_cost: 200,
          unit_price: 400,
          discount: 0,
          total_price: 400,
          warranty_months: 0,
          returned_qty: 0
        }
      ]
    })
    assert.equal(productsMod.getProductById(p2.id)!.qty, 9)
    const defRet = returnsMod.createSalesReturn({
      invoice_id: invDef.id,
      payment_method: 'cash',
      items: [{ invoice_item_id: invDef.items![0].id!, quantity: 1, return_condition: 'defective' }]
    })
    assert.equal(productsMod.getProductById(p2.id)!.qty, 9, '[FIN-10] Defective return must NOT increase salable qty')
    const defMove = db
      .prepare("SELECT movement_type, quantity FROM inventory_movements WHERE ref_type = 'sales_return' AND ref_id = ?")
      .get(defRet.id) as { movement_type: string; quantity: number } | undefined
    assert.equal(defMove?.movement_type, 'damaged', "[FIN-10] Defective return must log 'damaged' movement")

    // [FIN-04] Clean deleteSalesInvoice restores stock and logs 'sales_return_in'
    const invClean = salesMod.saveSalesInvoice({
      invoice_type: 'regular',
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone,
      paid_amount: 0,
      recordInTreasury: false,
      items: [
        {
          product_id: p1.id,
          product_name: p1.name,
          item_type: 'battery',
          unit: 'piece',
          pack_size: 1,
          quantity: 4,
          deducted_pieces_qty: 4,
          unit_cost: 5,
          unit_price: 10,
          discount: 0,
          total_price: 40,
          warranty_months: 0,
          returned_qty: 0
        }
      ]
    })
    assert.equal(productsMod.getProductById(p1.id)!.qty, 16)

    // [FIN-15] Positive installment sales_payments row reverses via deleteTreasuryTransaction
    const invInst = salesMod.collectSalesInstallment({ invoice_id: invClean.id, amount: 15, payment_method: 'cash' })
    assert.equal(invInst.paid_amount, 15)
    assert.equal(invInst.remaining_amount, 25)
    const instPayRow = db
      .prepare('SELECT treasury_tx_id FROM sales_payments WHERE invoice_id = ? AND amount = 15 LIMIT 1')
      .get(invClean.id) as { treasury_tx_id: number }
    assert.ok(instPayRow?.treasury_tx_id)
    assert.throws(() => salesMod.deleteSalesInvoice(invClean.id), /خزينة/)
    treasuryMod.deleteTreasuryTransaction(instPayRow.treasury_tx_id)
    const invCleanAfterRev = salesMod.getSalesInvoiceById(invClean.id)!
    assert.equal(invCleanAfterRev.paid_amount, 0)
    assert.equal(invCleanAfterRev.remaining_amount, 40)

    salesMod.deleteSalesInvoice(invClean.id)
    assert.equal(productsMod.getProductById(p1.id)!.qty, 20)
    const retInMove = db
      .prepare("SELECT movement_type, quantity FROM inventory_movements WHERE ref_type = 'sales_invoice_delete' AND ref_id = ? AND movement_type = 'sales_return_in'")
      .get(invClean.id) as { movement_type: string; quantity: number } | undefined
    assert.equal(retInMove?.quantity, 4, "[FIN-04] Deleting clean invoice must log 'sales_return_in'")

    // [FIN-08] Product exchange with positive AND negative paid_difference linked to sales_payments.treasury_tx_id
    const exPos = returnsMod.processProductExchange({
      exchange_type: 'normal_exchange',
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone,
      returned_product_id: p1.id,
      returned_value: 100,
      new_product_id: p2.id,
      new_value: 400,
      paid_difference: 300,
      payment_method: 'cash'
    })
    const posPayRow = db
      .prepare('SELECT amount, treasury_tx_id FROM sales_payments WHERE invoice_id = ?')
      .get(exPos.new_invoice_id) as { amount: number; treasury_tx_id: number | null } | undefined
    assert.equal(posPayRow?.amount, 300)
    assert.ok(posPayRow?.treasury_tx_id, 'Positive exchange difference must link sales_payments.treasury_tx_id')

    const exNeg = returnsMod.processProductExchange({
      exchange_type: 'normal_exchange',
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone,
      returned_product_id: p2.id,
      returned_value: 400,
      new_product_id: p1.id,
      new_value: 100,
      paid_difference: -150,
      payment_method: 'cash'
    })
    const negPayRow = db
      .prepare("SELECT amount, payment_type, treasury_tx_id FROM sales_payments WHERE invoice_id = ? AND payment_type = 'refund'")
      .get(exNeg.new_invoice_id) as { amount: number; payment_type: string; treasury_tx_id: number | null } | undefined
    assert.equal(negPayRow?.amount, -150, 'Negative exchange diff must insert refund sales_payments row')
    assert.ok(negPayRow?.treasury_tx_id, 'Negative exchange diff must link treasury_tx_id')

    // [FIN-15] Deleting refund treasury tx reverses negative sales_payments row cleanly
    const txRowsBefore = db.prepare('SELECT id FROM treasury_transactions WHERE id = ?').get(negPayRow!.treasury_tx_id!)
    assert.ok(txRowsBefore)
    treasuryMod.deleteTreasuryTransaction(negPayRow!.treasury_tx_id!)
    const negPayAfterDel = db
      .prepare('SELECT COUNT(*) as cnt FROM sales_payments WHERE treasury_tx_id = ?')
      .get(negPayRow!.treasury_tx_id!) as { cnt: number }
    assert.equal(negPayAfterDel.cnt, 0, '[FIN-15] Deleting refund treasury tx must remove negative sales_payments row')

    // Deleting invoice involved in product exchange must be blocked
    assert.throws(() => salesMod.deleteSalesInvoice(exPos.new_invoice_id!), /استبدال/)

    // [FIN-20] generateNextNumber per prefix & current year isolation
    const yr = new Date().getFullYear()
    db.prepare(
      `INSERT INTO sales_invoices (invoice_number, invoice_type, customer_name, subtotal, total_amount)
       VALUES (?, 'regular', 'A', 10, 10), (?, 'regular', 'B', 10, 10), (?, 'regular', 'C', 10, 10)`
    ).run(`TST-${yr - 1}-0999`, `TST-${yr}-0009`, `OTH-${yr}-0500`)
    assert.equal(
      utilsMod.generateNextNumber(db, 'sales_invoices', 'invoice_number', `TST-${yr}-`, 4),
      `TST-${yr}-0010`,
      '[FIN-20] Sequential number must isolate prefix & year cleanly'
    )
  })

  await runCheck('W2-TICKETS-EARMOLDS', 'Wave 2', '[FIN-05, FIN-11, FIN-12, FIN-13, FIN-16, FIN-18, FIN-19] Ticket inventory delta movements, loaner guard, cancelled is_restored=1, delete guard, commission base & rate freeze, earmold delete guard', () => {
    // Part A: Appliances ticket parts, movements, cancel, delete guard, commission
    switchFreshDb('appliances', 'w2_tickets_app')
    const dbA = connMod.getDb()
    const tech1 = techsMod.saveTechnician({ name: 'فني 1', phone: '01011100001', commission_rate: 40 })
    const tech2 = techsMod.saveTechnician({ name: 'فني 2', phone: '01011100002', commission_rate: 25 })
    const part = electInvMod.saveElectSparePart({
      code: 'TP-1',
      name: 'طلمبة غسالة',
      category: 'غسالات',
      purchase_price: 100,
      selling_price: 200,
      quantity: 10
    })

    // Create ticket consuming qty 2 -> part qty 8, movement 'out_ticket' qty 2
    const t1 = ticketsMod.saveTicket({
      customer_name: 'عميل تذكرة',
      customer_phone: '01044445555',
      appliance_type: 'غسالة',
      brand: 'LG',
      service_type: 'workshop',
      status: 'repaired',
      complaint: 'لا يطرد المياه',
      technician_id: tech1.id,
      inspection_fee: 100,
      labor_cost: 400,
      discount: 50,
      paid_amount: 0,
      recordPaymentInTreasury: false,
      parts: [{ part_id: part.id, part_name: part.name, part_code: part.code, quantity: 2, unit_cost: 100, unit_price: 200, total_price: 400 }]
    })
    assert.equal(dbA.prepare('SELECT quantity FROM elect_spare_parts WHERE id = ?').get(part.id).quantity, 8)
    const outMoves1 = dbA
      .prepare("SELECT SUM(quantity) as qty FROM inventory_movements WHERE ticket_id = ? AND movement_type = 'out_ticket'")
      .get(t1.id) as { qty: number }
    assert.equal(outMoves1.qty, 2, "[FIN-05] Ticket part deduction must log 'out_ticket'")

    // [FIN-18] Commission base = labor(400) + inspection(100) - discount(50) = 450 (excludes parts 400), @40% = 180
    assert.equal(t1.commission_rate, 40)
    assert.equal(t1.commission_amount, 180, '[FIN-18] Commission must be computed on net labor+inspection after discount, excluding parts')

    // [FIN-19] Update tech1 master rate to 60%, re-save ticket without changing tech -> rate freezes at 40; change to tech2 (25%) -> refreshes to 25 (112.5)
    techsMod.saveTechnician({ id: tech1.id, name: tech1.name, phone: tech1.phone, specialty: tech1.specialty, commission_rate: 60 })
    const t1SameTech = ticketsMod.saveTicket({ id: t1.id, diagnosis: 'تحديث تشخيص' })
    assert.equal(t1SameTech.commission_rate, 40, '[FIN-19] Existing ticket keeps frozen commission rate if technician unchanged')

    const t1DiffTech = ticketsMod.saveTicket({ id: t1.id, technician_id: tech2.id })
    assert.equal(t1DiffTech.commission_rate, 25, '[FIN-19] Changing technician refreshes commission rate')
    assert.equal(t1DiffTech.commission_amount, 112.5)

    // Increase qty 2 -> 5 (+3 out_ticket), then reduce 5 -> 1 (+4 in)
    ticketsMod.saveTicket({
      id: t1.id,
      parts: [{ part_id: part.id, part_name: part.name, part_code: part.code, quantity: 5, unit_cost: 100, unit_price: 200, total_price: 1000 }]
    })
    assert.equal(dbA.prepare('SELECT quantity FROM elect_spare_parts WHERE id = ?').get(part.id).quantity, 5)
    ticketsMod.saveTicket({
      id: t1.id,
      parts: [{ part_id: part.id, part_name: part.name, part_code: part.code, quantity: 1, unit_cost: 100, unit_price: 200, total_price: 200 }]
    })
    assert.equal(dbA.prepare('SELECT quantity FROM elect_spare_parts WHERE id = ?').get(part.id).quantity, 9)
    const inMoveAfterReduce = dbA
      .prepare("SELECT SUM(quantity) as qty FROM inventory_movements WHERE ticket_id = ? AND movement_type = 'in'")
      .get(t1.id) as { qty: number }
    assert.equal(inMoveAfterReduce.qty, 4, "[FIN-05] Reducing part qty must log 'in' movement")

    // [FIN-12] Cancelling ticket preserves ticket_parts history with is_restored = 1 & restores stock once
    const t1Cancelled = ticketsMod.saveTicket({ id: t1.id, status: 'cancelled' })
    assert.equal(dbA.prepare('SELECT quantity FROM elect_spare_parts WHERE id = ?').get(part.id).quantity, 10)
    assert.equal(t1Cancelled.parts!.length, 1, '[FIN-12] Cancelled ticket must preserve ticket_parts history rows')
    assert.equal(Number(t1Cancelled.parts![0].is_restored), 1, '[FIN-12] Restored parts on cancel must have is_restored = 1')

    // [FIN-13] deleteTicket skips already-restored parts (qty remains 10), while active un-restored ticket restores on delete, and unreversed treasury blocks delete
    ticketsMod.deleteTicket(t1.id)
    assert.equal(dbA.prepare('SELECT quantity FROM elect_spare_parts WHERE id = ?').get(part.id).quantity, 10, 'Deleting already-cancelled ticket must not double-restore stock')

    const tPaid = ticketsMod.saveTicket({
      customer_name: 'عميل مدفوع',
      customer_phone: '01088887777',
      appliance_type: 'ثلاجة',
      brand: 'Samsung',
      service_type: 'workshop',
      status: 'new',
      complaint: 'كشف',
      inspection_fee: 150,
      paid_amount: 150,
      recordPaymentInTreasury: true,
      parts: [{ part_id: part.id, part_name: part.name, part_code: part.code, quantity: 2, unit_cost: 100, unit_price: 200, total_price: 400 }]
    })
    assert.equal(dbA.prepare('SELECT quantity FROM elect_spare_parts WHERE id = ?').get(part.id).quantity, 8)
    assert.throws(() => ticketsMod.deleteTicket(tPaid.id), /مدفوعة|خزينة/, '[FIN-13] Ticket with unreversed treasury payment cannot be deleted')

    // Reverse treasury tx -> now deleteTicket succeeds and restores part qty back to 10 with 'in' movement
    const txRow = dbA.prepare('SELECT id FROM treasury_transactions WHERE ticket_id = ?').get(tPaid.id) as { id: number }
    treasuryMod.deleteTreasuryTransaction(txRow.id)
    ticketsMod.deleteTicket(tPaid.id)
    assert.equal(dbA.prepare('SELECT quantity FROM elect_spare_parts WHERE id = ?').get(part.id).quantity, 10)

    // Part B: Hearing aids loaner return guard [FIN-11] & earmold delete guard [FIN-16]
    switchFreshDb('hearing_aids', 'w2_tickets_ha')
    const dbH = connMod.getDb()
    const custH = customersMod.saveCustomer({ name: 'مريض سمعيات', phone: '01099001122' })
    const loanerProd = productsMod.saveProduct({
      name: 'سماعة إعارة',
      type: 'hearing_aid',
      track_serial: 1,
      cost_price: 1000,
      sale_price: 2000
    })
    dbH.prepare("INSERT INTO product_serials (product_id, serial_no, status, condition) VALUES (?, 'LOAN-1', 'in_stock', 'used')").run(loanerProd.id)
    const loanerSerial = dbH.prepare("SELECT id FROM product_serials WHERE serial_no = 'LOAN-1'").get() as { id: number }

    const tLoaner = ticketsMod.saveTicket({
      customer_id: custH.id,
      customer_name: custH.name,
      customer_phone: custH.phone,
      appliance_type: 'سماعة طبية',
      brand: 'Phonak',
      service_type: 'workshop',
      status: 'in_repair',
      complaint: 'صيانة مع بديلة',
      loaner_serial_id: loanerSerial.id,
      loaner_serial_no: 'LOAN-1',
      loaner_product_name: 'سماعة إعارة',
      recordPaymentInTreasury: false
    })
    assert.equal(dbH.prepare('SELECT status FROM product_serials WHERE id = ?').get(loanerSerial.id).status, 'loaned')

    assert.throws(
      () => ticketsMod.saveTicket({ id: tLoaner.id, status: 'delivered' }),
      /جهاز الإعارة/,
      '[FIN-11] Delivering ticket before returning loaner device must be blocked'
    )
    const afterReturn = ticketsMod.returnTicketLoaner(tLoaner.id)
    assert.ok(afterReturn.loaner_returned_at)
    assert.equal(dbH.prepare('SELECT status FROM product_serials WHERE id = ?').get(loanerSerial.id).status, 'in_stock')
    const delivered = ticketsMod.saveTicket({ id: tLoaner.id, status: 'delivered' })
    assert.equal(delivered.status, 'delivered')

    // [FIN-16] Earmold delete guards (lab cost paid & billed sales_invoice_id)
    const emPaidLab = earmoldsMod.saveEarmoldOrder({
      patient_id: custH.id,
      patient_name: custH.name,
      patient_phone: custH.phone,
      ear: 'right',
      mold_type: 'full_shell',
      lab_cost: 200,
      customer_price: 450,
      recordLabCostInTreasury: true,
      createSalesInvoiceForMold: false
    })
    assert.throws(
      () => earmoldsMod.deleteEarmoldOrder(emPaidLab.id),
      /تكلفة المعمل|خزينة/,
      '[FIN-16] Earmold order with lab cost recorded in treasury cannot be deleted'
    )

    const emBilled = earmoldsMod.saveEarmoldOrder({
      patient_id: custH.id,
      patient_name: custH.name,
      patient_phone: custH.phone,
      ear: 'left',
      mold_type: 'half_shell',
      lab_cost: 150,
      customer_price: 400,
      recordLabCostInTreasury: false,
      createSalesInvoiceForMold: true,
      paid_amount: 400,
      payment_method: 'cash'
    })
    assert.throws(
      () => earmoldsMod.deleteEarmoldOrder(emBilled.id),
      /فاتورة مبيعات/,
      '[FIN-16] Earmold order linked to sales_invoice_id cannot be deleted'
    )

    const emClean = earmoldsMod.saveEarmoldOrder({
      patient_id: custH.id,
      patient_name: custH.name,
      patient_phone: custH.phone,
      ear: 'bilateral',
      mold_type: 'skeleton',
      lab_cost: 0,
      customer_price: 300,
      recordLabCostInTreasury: false,
      createSalesInvoiceForMold: false
    })
    earmoldsMod.deleteEarmoldOrder(emClean.id)
    assert.equal(dbH.prepare('SELECT COUNT(*) as cnt FROM earmold_orders WHERE id = ?').get(emClean.id).cnt, 0)
  })

  // =========================================================================
  // WAVE 3 TESTS (10 MODIFIED VIEWS + SFC COMPILE + CONTRACT CHECKS)
  // =========================================================================

  await runCheck('W3-VUE-SFC', 'Wave 3', 'All 10 Wave 3 Vue SFC views + DashboardView compile cleanly and implement required UI controls', () => {
    const wave3ViewContracts: Array<{ file: string; mustContain: string[] }> = [
      {
        file: 'src/renderer/src/views/CustomersView.vue',
        mustContain: ['attachmentPreviewModalOpen', 'isInlinePreviewableAttachment', 'triggerAttachmentDownload', '<iframe']
      },
      {
        file: 'src/renderer/src/views/FollowupsView.vue',
        mustContain: ['EARMOLD_PAYMENT_METHODS', 'PAYMENT_METHODS', 'earmoldForm.payment_method', 'deleteEarmoldOrder']
      },
      {
        file: 'src/renderer/src/views/ProductsView.vue',
        mustContain: [':disabled="Boolean(form.id)"', ':readonly="Boolean(form.id)"', 'openStockAdjustFromEdit', 'stockForm.payment_method']
      },
      {
        file: 'src/renderer/src/views/PurchasesView.vue',
        mustContain: ['PAYMENT_METHODS', 'onPaidAmountInput', 'onDiscountInput', 'onItemCostInput', 'requiredReturnSerialsCount', ':max="rItem.max_qty"']
      },
      {
        file: 'src/renderer/src/views/ReportsView.vue',
        mustContain: ['report.summary.netProfit', 'report.summary.netCashFlow', 'PAYMENT_METHODS']
      },
      {
        file: 'src/renderer/src/views/SalesView.vue',
        mustContain: ['getAvailablePieces', 'getPosCartUsedPieces', 'getDetailedUsedPieces', 'handleCreateSalesReturn', 'processProductExchange', 'PAYMENT_METHODS']
      },
      {
        file: 'src/renderer/src/views/SettingsView.vue',
        mustContain: ['appStore.isSuperAdmin', 'compressImageFile', 'handleLogoUpload', 'saveSettings']
      },
      {
        file: 'src/renderer/src/views/TechniciansView.vue',
        mustContain: ['PAYOUT_PAYMENT_METHODS', 'PAYMENT_METHODS', 'payoutPaymentMethod', 'selectedTechDue']
      },
      {
        file: 'src/renderer/src/views/TicketsView.vue',
        mustContain: ['is_restored', 'returnTicketLoaner', 'PAYMENT_METHODS', 'form.payment_method']
      },
      {
        file: 'src/renderer/src/views/TreasuryView.vue',
        mustContain: ['getTreasuryBalances', 'isLinkedTransaction', 'tx.linked_tx_id', 'monthNetProfit', 'PAYMENT_METHODS']
      },
      {
        file: 'src/renderer/src/views/DashboardView.vue',
        mustContain: ['stats.monthNetProfit']
      }
    ]

    for (const spec of wave3ViewContracts) {
      const fullPath = resolve(ROOT, spec.file)
      const content = readFileSync(fullPath, 'utf8')

      // Check contract assertions
      for (const token of spec.mustContain) {
        assert.ok(content.includes(token), `${spec.file} missing expected Wave 3 contract token: ${token}`)
      }

      // Parse & compile SFC script + template
      const parsed = parseSfc(content, { filename: fullPath })
      assert.equal(parsed.errors.length, 0, `${spec.file} SFC parse errors: ${JSON.stringify(parsed.errors)}`)
      const id = `qa_${spec.file.replace(/[^a-zA-Z0-9]/g, '_')}`
      const compiledScript = compileScript(parsed.descriptor, { id })
      assert.ok(compiledScript.content.length > 0, `${spec.file} compiled script is empty`)
      if (parsed.descriptor.template) {
        const compiledTpl = compileTemplate({
          id,
          source: parsed.descriptor.template.content,
          filename: fullPath,
          compilerOptions: { bindingMetadata: compiledScript.bindings }
        })
        assert.equal(
          compiledTpl.errors.length,
          0,
          `${spec.file} template compile errors: ${JSON.stringify(compiledTpl.errors)}`
        )
      }
    }
  })

  // Summary
  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.length - passedCount
  console.log(`\n========================================`)
  console.log(`Remediation QA Summary: ${passedCount}/${results.length} checks passed (${failedCount} failed)`)
  console.log(`========================================`)
  if (failedCount > 0) {
    process.exitCode = 1
  }
}

try {
  await main()
} finally {
  try {
    const connMod = await import(modUrl('src/main/db/connection.ts'))
    connMod.closeDatabase()
  } catch {
    // Ignore close errors during cleanup
  }
  rmSync(testRootDir, { recursive: true, force: true })
}
