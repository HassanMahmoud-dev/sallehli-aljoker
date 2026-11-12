import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  unlinkSync,
  statSync,
  renameSync,
  openSync,
  readSync,
  closeSync,
  readFileSync
} from 'fs'
import https from 'https'
import { spawn, execFile } from 'child_process'
import { createHash, timingSafeEqual } from 'crypto'
import { getSettings, saveSettings, createPreUpdateBackup, closeDatabase } from './db'
import type { UpdateCheckResult, UpdateProgressPayload, UpdateDownloadStatus } from '../shared/types'

const TRUSTED_UPDATE_EXACT_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com'
])

const verifiedChecksumsByUrl = new Map<string, string>()

/** Validates that an update URL uses HTTPS and points only to trusted GitHub hosts. */
export function isTrustedUpdateUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    if (TRUSTED_UPDATE_EXACT_HOSTS.has(host)) return true
    return host.endsWith('.githubusercontent.com')
  } catch {
    return false
  }
}

function normalizeSha256(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const cleaned = raw.trim().replace(/^sha256:/i, '').trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(cleaned) ? cleaned : undefined
}

function extractSha256FromText(text: string, preferredFileName?: string): string | undefined {
  if (!text) return undefined
  const lines = text.split(/\r?\n/)
  if (preferredFileName) {
    const baseName = preferredFileName.toLowerCase()
    for (const line of lines) {
      if (line.toLowerCase().includes(baseName)) {
        const m = line.match(/\b([a-fA-F0-9]{64})\b/)
        if (m) return m[1].toLowerCase()
      }
    }
  }
  const labeledMatch = text.match(/sha-?256(?:\s*checksum)?\s*[:=]\s*([a-fA-F0-9]{64})\b/i)
  if (labeledMatch) return labeledMatch[1].toLowerCase()
  const singleHexLine = text.trim()
  const direct = normalizeSha256(singleHexLine.split(/\s+/)[0])
  return direct
}

function normalizeVersion(ver: string): number[] {
  const cleaned = ver.trim().replace(/^[vV]/, '').split('-')[0]
  return cleaned.split('.').map((n) => parseInt(n, 10) || 0)
}

function compareVersions(v1: string, v2: string): number {
  const a = normalizeVersion(v1)
  const b = normalizeVersion(v2)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const numA = a[i] || 0
    const numB = b[i] || 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }
  return 0
}

function resolveUpdateEndpoint(rawInput: string): {
  type: 'github' | 'json_or_yml'
  url: string
} | null {
  const trimmed = rawInput.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  // Match "owner/repo" shorthand
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    const repo = trimmed.replace(/\.git$/, '')
    return {
      type: 'github',
      url: `https://api.github.com/repos/${repo}/releases/latest`
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  // SEC-01: Only HTTPS URLs targeting trusted GitHub domains are accepted.
  if (!isTrustedUpdateUrl(parsed.toString())) {
    return null
  }

  const host = parsed.hostname.toLowerCase()
  if (host === 'github.com' || host === 'www.github.com') {
    const repoMatch = parsed.pathname.match(
      /^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/releases(?:\/latest)?)?\/?$/
    )
    if (repoMatch) {
      return {
        type: 'github',
        url: `https://api.github.com/repos/${repoMatch[1]}/${repoMatch[2]}/releases/latest`
      }
    }
    return {
      type: 'json_or_yml',
      url: parsed.toString()
    }
  }

  if (host === 'api.github.com') {
    const apiRepoMatch = parsed.pathname.match(/^\/repos\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?$/)
    if (apiRepoMatch) {
      return {
        type: 'github',
        url: `https://api.github.com/repos/${apiRepoMatch[1]}/${apiRepoMatch[2]}/releases/latest`
      }
    }
    if (parsed.pathname.startsWith('/repos/')) {
      return {
        type: 'github',
        url: parsed.toString()
      }
    }
    return null
  }

  return {
    type: 'json_or_yml',
    url: parsed.toString()
  }
}

function fetchTextWithRedirects(url: string, maxRedirects = 5): Promise<string> {
  if (!isTrustedUpdateUrl(url)) {
    return Promise.reject(
      new Error('رابط التحديث غير موثوق؛ يُسمح فقط بروابط HTTPS من GitHub الرسمية.')
    )
  }

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': `Sallehli-Updater/${app.getVersion()}`,
          Accept: 'application/vnd.github+json, application/json, text/plain, */*'
        },
        timeout: 15000
      },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          if (maxRedirects <= 0) {
            res.resume()
            reject(new Error('عدد كبير من عمليات إعادة التوجيه (Redirects).'))
            return
          }
          const nextUrl = new URL(res.headers.location, url).toString()
          res.resume()
          if (!isTrustedUpdateUrl(nextUrl)) {
            reject(new Error('تم رفض إعادة التوجيه إلى نطاق غير موثوق أو غير مشفر.'))
            return
          }
          fetchTextWithRedirects(nextUrl, maxRedirects - 1)
            .then(resolve)
            .catch(reject)
          return
        }

        if (res.statusCode === 404) {
          res.resume()
          reject(
            new Error(
              'لم يتم العثور على إصدارات منشورة (Releases) في هذا الرابط أو أن المستودع خاص (Private).'
            )
          )
          return
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          reject(new Error(`فشل الاتصال بخادم التحديثات (كود الحالة: ${res.statusCode})`))
          return
        }

        let rawData = ''
        let totalBytes = 0
        const maxMetadataBytes = 2 * 1024 * 1024
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          totalBytes += Buffer.byteLength(chunk, 'utf8')
          if (totalBytes > maxMetadataBytes) {
            res.destroy()
            reject(new Error('استجابة بيانات التحديث أكبر من الحد المسموح.'))
            return
          }
          rawData += chunk
        })
        res.on('end', () => {
          resolve(rawData)
        })
      }
    )

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('انتهت مهلة الاتصال بالخادم، يرجى التأكد من اتصال الإنترنت.'))
    })

    req.on('error', (err) => {
      reject(new Error(`تعذر الاتصال بالإنترنت: ${err.message}`))
    })
  })
}

export async function checkForOnlineUpdate(customUrl?: string): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const settings = getSettings()
  const targetInput = (
    customUrl !== undefined
      ? customUrl
      : settings.update_url || 'HassanMahmoud-dev/sallehli-aljoker'
  ).trim()

  if (customUrl !== undefined && customUrl.trim() !== settings.update_url) {
    saveSettings({ update_url: customUrl.trim() })
  }

  const resolved = resolveUpdateEndpoint(targetInput)
  if (!resolved) {
    return {
      success: false,
      updateAvailable: false,
      currentVersion,
      message:
        'يرجى إدخال اسم مستودع GitHub صالح (مثال: username/sallehli-aljoker) أو رابط HTTPS موثوق من GitHub.'
    }
  }

  try {
    const bodyText = await fetchTextWithRedirects(resolved.url)

    let latestVersion = ''
    let downloadUrl = ''
    let releaseNotes = ''
    let publishedAt = ''
    let expectedSha256: string | undefined

    if (resolved.type === 'github') {
      const release = JSON.parse(bodyText)
      latestVersion = String(release.tag_name || release.name || '').replace(/^[vV]/, '')
      releaseNotes = String(release.body || '')
      publishedAt = String(release.published_at || '')

      if (Array.isArray(release.assets)) {
        const exeAsset = release.assets.find(
          (a: { name?: string; browser_download_url?: string; digest?: string }) =>
            typeof a.name === 'string' && a.name.toLowerCase().endsWith('.exe')
        )
        if (exeAsset?.browser_download_url) {
          downloadUrl = String(exeAsset.browser_download_url)
          expectedSha256 = normalizeSha256(exeAsset.digest)
        }

        if (!expectedSha256 && exeAsset?.name) {
          const exeNameLower = String(exeAsset.name).toLowerCase()
          const checksumAsset = release.assets.find((a: { name?: string; browser_download_url?: string }) => {
            if (typeof a.name !== 'string' || typeof a.browser_download_url !== 'string') return false
            const lower = a.name.toLowerCase()
            return (
              lower === `${exeNameLower}.sha256` ||
              lower === `${exeNameLower}.sha256sum` ||
              lower === 'sha256sums.txt' ||
              lower === 'checksums.txt' ||
              lower.endsWith('.sha256')
            )
          })
          if (checksumAsset?.browser_download_url && isTrustedUpdateUrl(checksumAsset.browser_download_url)) {
            try {
              const checksumText = await fetchTextWithRedirects(checksumAsset.browser_download_url)
              expectedSha256 = extractSha256FromText(checksumText, exeAsset.name)
            } catch {
              // Fall through to release notes / Authenticode verification
            }
          }
        }

        if (!expectedSha256 && releaseNotes) {
          expectedSha256 = extractSha256FromText(releaseNotes, exeAsset?.name)
        }
      }
    } else {
      // Try parsing as JSON first, otherwise parse as electron-builder latest.yml
      try {
        const json = JSON.parse(bodyText)
        latestVersion = String(json.version || json.tag_name || '').replace(/^[vV]/, '')
        downloadUrl = String(json.url || json.downloadUrl || '')
        releaseNotes = String(json.notes || json.releaseNotes || json.body || '')
        publishedAt = String(json.publishedAt || json.releaseDate || '')
        expectedSha256 = normalizeSha256(json.sha256 || json.sha256Hex || json.digest)
      } catch {
        // Parse latest.yml format from electron-builder
        const versionMatch = bodyText.match(/^version:\s*['"]?([^\r\n'"]+)['"]?/m)
        const pathMatch = bodyText.match(/^path:\s*['"]?([^\r\n'"]+)['"]?/m)
        const dateMatch = bodyText.match(/^releaseDate:\s*['"]?([^\r\n'"]+)['"]?/m)
        const sha256Match = bodyText.match(/^sha256:\s*['"]?([a-fA-F0-9]{64})['"]?/m)
        if (versionMatch) {
          latestVersion = versionMatch[1].trim().replace(/^[vV]/, '')
        }
        if (pathMatch) {
          const fileName = pathMatch[1].trim()
          downloadUrl = fileName.startsWith('http')
            ? fileName
            : new URL(fileName, resolved.url).toString()
        }
        if (dateMatch) {
          publishedAt = dateMatch[1].trim()
        }
        if (sha256Match) {
          expectedSha256 = normalizeSha256(sha256Match[1])
        }
      }
    }

    if (!latestVersion) {
      return {
        success: false,
        updateAvailable: false,
        currentVersion,
        message: 'لم يتم العثور على رقم إصدار صالح في استجابة الخادم.'
      }
    }

    const isNewer = compareVersions(latestVersion, currentVersion) > 0

    try {
      saveSettings({ last_update_check_at: String(Date.now()) })
    } catch {
      // Ignore settings write error
    }

    if (!isNewer) {
      return {
        success: true,
        updateAvailable: false,
        currentVersion,
        latestVersion,
        releaseNotes,
        publishedAt,
        message: `أنت تستخدم أحدث إصدار من البرنامج حالياً (v${currentVersion}).`
      }
    }

    if (!downloadUrl) {
      return {
        success: false,
        updateAvailable: true,
        currentVersion,
        latestVersion,
        releaseNotes,
        publishedAt,
        message: `يوجد إصدار جديد (v${latestVersion}) ولكن لم يتم العثور على ملف التثبيت (.exe) مرفقاً داخل الإصدار على GitHub Releases.`
      }
    }

    if (!isTrustedUpdateUrl(downloadUrl)) {
      return {
        success: false,
        updateAvailable: false,
        currentVersion,
        message: 'تم رفض رابط تحميل التحديث لأنه لا يبدأ بـ https:// أو لا ينتمي إلى نطاق GitHub الموثوق.'
      }
    }

    if (expectedSha256) {
      verifiedChecksumsByUrl.set(downloadUrl, expectedSha256)
    }

    return {
      success: true,
      updateAvailable: true,
      currentVersion,
      latestVersion,
      downloadUrl,
      sha256: expectedSha256,
      releaseNotes,
      publishedAt,
      message: `يتوفر تحديث جديد للبرنامج: الإصدار v${latestVersion}`
    }
  } catch (err) {
    return {
      success: false,
      updateAvailable: false,
      currentVersion,
      message: err instanceof Error ? err.message : 'حدث خطأ أثناء التحقق من التحديثات.'
    }
  }
}

interface DownloadState {
  url: string
  version?: string
  expectedSha256?: string
  isDownloading: boolean
  isPaused: boolean
  isReadyToInstall: boolean
  lastProgress: UpdateProgressPayload | null
}

const downloadState: DownloadState = {
  url: '',
  version: '',
  expectedSha256: undefined,
  isDownloading: false,
  isPaused: false,
  isReadyToInstall: false,
  lastProgress: null
}

let activeAbortFn: (() => void) | null = null

function getPartFilePath(): string {
  return join(app.getPath('temp'), 'sallehli-update.part')
}

function getReadyInstallerPath(): string {
  return join(app.getPath('temp'), 'sallehli-update-ready.exe')
}

export function getUpdateDownloadStatus(): UpdateDownloadStatus {
  const readyPath = getReadyInstallerPath()
  const fileReady = existsSync(readyPath)
  return {
    isDownloading: downloadState.isDownloading,
    isPaused: downloadState.isPaused,
    isReadyToInstall: downloadState.isReadyToInstall && fileReady,
    progress: downloadState.lastProgress,
    installerPath: fileReady ? readyPath : undefined,
    version: downloadState.version
  }
}

export function cancelOnlineUpdateDownload(
  mainWindow: BrowserWindow | null
): { success: boolean; message: string } {
  if (activeAbortFn) {
    activeAbortFn()
    activeAbortFn = null
  }

  downloadState.isDownloading = false
  downloadState.isPaused = false
  downloadState.isReadyToInstall = false
  downloadState.lastProgress = null

  const partPath = getPartFilePath()
  const readyPath = getReadyInstallerPath()
  try {
    if (existsSync(partPath)) unlinkSync(partPath)
  } catch {
    // Ignore
  }
  try {
    if (existsSync(readyPath)) unlinkSync(readyPath)
  } catch {
    // Ignore
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:progress', {
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      speedBytesPerSec: 0,
      remainingSeconds: null,
      status: 'cancelled',
      message: 'تم إلغاء تحميل التحديث وحذف الملفات المؤقتة.'
    } satisfies UpdateProgressPayload)
  }

  return {
    success: true,
    message: 'تم إلغاء تحميل التحديث بنجاح.'
  }
}

export function pauseOnlineUpdateDownload(
  mainWindow: BrowserWindow | null
): { success: boolean; message: string } {
  if (!downloadState.isDownloading) {
    return { success: false, message: 'لا يوجد تحميل نشط لإيقافه.' }
  }

  downloadState.isDownloading = false
  downloadState.isPaused = true

  if (activeAbortFn) {
    activeAbortFn()
    activeAbortFn = null
  }

  if (downloadState.lastProgress) {
    downloadState.lastProgress = {
      ...downloadState.lastProgress,
      status: 'paused',
      speedBytesPerSec: 0,
      remainingSeconds: null,
      message: 'تم إيقاف التحميل مؤقتاً.'
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:progress', {
      percent: downloadState.lastProgress?.percent || 0,
      transferredBytes: downloadState.lastProgress?.transferredBytes || 0,
      totalBytes: downloadState.lastProgress?.totalBytes || 0,
      speedBytesPerSec: 0,
      remainingSeconds: null,
      status: 'paused',
      message: 'تم إيقاف تحميل التحديث مؤقتاً.'
    } satisfies UpdateProgressPayload)
  }

  return {
    success: true,
    message: 'تم إيقاف التحميل مؤقتاً.'
  }
}

function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()))
    stream.on('error', reject)
  })
}

function getWindowsAuthenticodeStatus(targetPath: string): Promise<{ status: string; subject?: string }> {
  return new Promise((resolve) => {
    const script = [
      "$ProgressPreference = 'SilentlyContinue'",
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'try {',
      '  $sig = Get-AuthenticodeSignature -LiteralPath $env:SALLEHLI_INSTALLER_PATH',
      '  $subj = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "" }',
      '  Write-Output ("$($sig.Status)|$subj")',
      '} catch {',
      '  Write-Output ("UnknownError|$($_.Exception.Message)")',
      '}'
    ].join('\n')

    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      {
        env: { ...process.env, SALLEHLI_INSTALLER_PATH: targetPath },
        timeout: 15000,
        windowsHide: true
      },
      (err, stdout) => {
        if (err) {
          resolve({ status: 'UnknownError' })
          return
        }
        const firstLine = String(stdout || '').trim().split(/\r?\n/)[0] || ''
        const [status, subject] = firstLine.split('|')
        resolve({ status: (status || 'UnknownError').trim(), subject: subject?.trim() || undefined })
      }
    )
  })
}

/**
 * Performs pre-execution cryptographic & signature checks on a downloaded or local installer:
 * PE header check, optional SHA-256 verification, and Windows Authenticode signature validation.
 */
export async function verifyDownloadedInstaller(
  filePath: string,
  expectedSha256?: string
): Promise<{
  valid: boolean
  sha256: string
  signed: boolean
  signatureStatus?: string
  reason?: string
}> {
  if (!filePath || !existsSync(filePath)) {
    return { valid: false, sha256: '', signed: false, reason: 'ملف التحديث غير موجود.' }
  }

  let fileSize = 0
  try {
    const st = statSync(filePath)
    if (!st.isFile() || st.size < 1024) {
      return { valid: false, sha256: '', signed: false, reason: 'ملف التحديث غير مكتمل أو تالف.' }
    }
    fileSize = st.size
  } catch {
    return { valid: false, sha256: '', signed: false, reason: 'تعذر قراءة بيانات ملف التحديث.' }
  }

  if (process.platform === 'win32' && fileSize >= 2) {
    let fd: number | null = null
    try {
      fd = openSync(filePath, 'r')
      const header = Buffer.alloc(2)
      readSync(fd, header, 0, 2, 0)
      if (header[0] !== 0x4d || header[1] !== 0x5a) {
        return {
          valid: false,
          sha256: '',
          signed: false,
          reason: 'الملف الذي تم تنزيله ليس ملف تثبيت Windows تنفيذي صالحاً (.exe).'
        }
      }
    } catch {
      return { valid: false, sha256: '', signed: false, reason: 'تعذر فحص رأس ملف التثبيت.' }
    } finally {
      if (fd !== null) {
        try {
          closeSync(fd)
        } catch {
          // Ignore close error
        }
      }
    }
  }

  let actualSha256 = ''
  try {
    actualSha256 = await computeFileSha256(filePath)
  } catch {
    return { valid: false, sha256: '', signed: false, reason: 'فشل حساب بصمة SHA-256 لملف التحديث.' }
  }

  let checksumVerified = false
  if (expectedSha256 !== undefined && expectedSha256 !== '') {
    const normalizedExpected = normalizeSha256(expectedSha256)
    if (!normalizedExpected) {
      return {
        valid: false,
        sha256: actualSha256,
        signed: false,
        reason: 'تنسيق بصمة SHA-256 المتوقعة غير صالح.'
      }
    }
    const actualBuf = Buffer.from(actualSha256, 'hex')
    const expectedBuf = Buffer.from(normalizedExpected, 'hex')
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
      return {
        valid: false,
        sha256: actualSha256,
        signed: false,
        reason: 'فشل التحقق من بصمة SHA-256 لملف التحديث؛ قد يكون الملف تالفاً أو تم تعديله.'
      }
    }
    checksumVerified = true
  }

  if (process.platform === 'win32') {
    const auth = await getWindowsAuthenticodeStatus(filePath)
    if (auth.status === 'Valid') {
      return {
        valid: true,
        sha256: actualSha256,
        signed: true,
        signatureStatus: auth.status
      }
    }

    if (auth.status !== 'NotSigned') {
      return {
        valid: false,
        sha256: actualSha256,
        signed: false,
        signatureStatus: auth.status,
        reason: `تم رفض ملف التحديث لأن التوقيع الرقمي (Authenticode) غير صالح أو غير موثوق (${auth.status}).`
      }
    }

    // Reject unsigned updates if the currently packaged binary itself carries a Valid signature.
    if (app.isPackaged) {
      const currentBinarySig = await getWindowsAuthenticodeStatus(process.execPath)
      if (currentBinarySig.status === 'Valid') {
        return {
          valid: false,
          sha256: actualSha256,
          signed: false,
          signatureStatus: auth.status,
          reason: 'تم رفض ملف التحديث: التطبيق الحالي موقّع رقمياً ولا يُسمح بتثبيت تحديث غير موقّع.'
        }
      }
    }

    if (checksumVerified) {
      console.warn(
        '[Updater] Installer does not carry a Windows Authenticode signature (NotSigned), proceeding after SHA-256 digest verification.'
      )
      return {
        valid: true,
        sha256: actualSha256,
        signed: false,
        signatureStatus: auth.status
      }
    }

    if (app.isPackaged) {
      return {
        valid: false,
        sha256: actualSha256,
        signed: false,
        signatureStatus: auth.status,
        reason:
          'تم حظر تشغيل ملف التحديث: الملف غير موقّع رقمياً (Authenticode) ولا يتوفر له تحقق SHA-256 من الإصدار.'
      }
    }

    console.warn(
      '[Updater] Development environment warning: installer is unsigned and has no SHA-256 digest.'
    )
    return {
      valid: true,
      sha256: actualSha256,
      signed: false,
      signatureStatus: auth.status
    }
  }

  if (app.isPackaged && !checksumVerified) {
    return {
      valid: false,
      sha256: actualSha256,
      signed: false,
      reason: 'تعذر التحقق من بصمة SHA-256 لملف التحديث في البيئة المعبأة.'
    }
  }

  return { valid: true, sha256: actualSha256, signed: false }
}

function launchInstallerAndQuit(installerPath: string): void {
  closeDatabase()
  const child = spawn(installerPath, [], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  setTimeout(() => {
    app.quit()
  }, 400)
}

export async function applyDownloadedUpdate(): Promise<{
  success: boolean
  message: string
  backupPath?: string
}> {
  const readyPath = getReadyInstallerPath()
  if (!existsSync(readyPath)) {
    return {
      success: false,
      message: 'ملف التحديث غير موجود أو لم يكتمل تحميله بعد.'
    }
  }

  // SEC-01: Mandatory origin + integrity + Authenticode verification right before launching.
  if (!downloadState.url || !isTrustedUpdateUrl(downloadState.url)) {
    downloadState.isReadyToInstall = false
    try {
      unlinkSync(readyPath)
    } catch {
      // Ignore cleanup error
    }
    return {
      success: false,
      message: 'مصدر ملف التحديث غير موثوق أو انتهت صلاحيته؛ يرجى إعادة التحميل عبر HTTPS من GitHub.'
    }
  }

  const expectedSha256 =
    downloadState.expectedSha256 || verifiedChecksumsByUrl.get(downloadState.url)
  const verification = await verifyDownloadedInstaller(readyPath, expectedSha256)
  if (!verification.valid) {
    downloadState.isReadyToInstall = false
    try {
      unlinkSync(readyPath)
    } catch {
      // Ignore cleanup error
    }
    return {
      success: false,
      message: verification.reason || 'فشل التحقق الأمني من ملف التحديث قبل التثبيت.'
    }
  }

  try {
    const backupPath = createPreUpdateBackup()
    launchInstallerAndQuit(readyPath)
    return {
      success: true,
      backupPath,
      message: 'تم التحقق الأمني وأخذ نسخة احتياطية وجاري بدء تثبيت التحديث...'
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'فشل تشغيل ملف التثبيت.'
    }
  }
}

function downloadFileWithResume(
  url: string,
  partPath: string,
  onProgress: (payload: UpdateProgressPayload) => void,
  maxRedirects = 5
): Promise<void> {
  if (!isTrustedUpdateUrl(url)) {
    return Promise.reject(
      new Error('رابط تحميل التحديث غير موثوق؛ يُسمح فقط بروابط HTTPS من GitHub الرسمية.')
    )
  }

  return new Promise((resolve, reject) => {
    let isAborted = false
    const existingBytes = existsSync(partPath) ? statSync(partPath).size : 0

    const headers: Record<string, string> = {
      'User-Agent': `Sallehli-Updater/${app.getVersion()}`
    }

    if (existingBytes > 0) {
      headers['Range'] = `bytes=${existingBytes}-`
    }

    const req = https.get(url, { headers, timeout: 30000 }, (res) => {
      // Handle HTTP redirects strictly within trusted HTTPS hosts
      if (
        res.statusCode &&
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        if (maxRedirects <= 0) {
          res.resume()
          reject(new Error('عدد كبير من عمليات إعادة التوجيه أثناء التحميل.'))
          return
        }
        const nextUrl = new URL(res.headers.location, url).toString()
        res.resume()
        if (!isTrustedUpdateUrl(nextUrl)) {
          reject(new Error('تم رفض إعادة توجيه التحميل إلى نطاق غير موثوق أو غير مشفر.'))
          return
        }
        downloadFileWithResume(nextUrl, partPath, onProgress, maxRedirects - 1)
          .then(resolve)
          .catch(reject)
        return
      }

      // Range not satisfiable (e.g. file modified or already complete)
      if (res.statusCode === 416) {
        res.resume()
        try {
          if (existsSync(partPath)) unlinkSync(partPath)
        } catch {
          // Ignore
        }
        downloadFileWithResume(url, partPath, onProgress, maxRedirects)
          .then(resolve)
          .catch(reject)
        return
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        reject(new Error(`فشل الاتصال بخادم التحميل (كود الحالة: ${res.statusCode})`))
        return
      }

      const isPartial = res.statusCode === 206
      const streamFlags = isPartial ? 'a' : 'w'
      const startBytes = isPartial ? existingBytes : 0
      const chunkTotal = parseInt(res.headers['content-length'] || '0', 10)
      const totalBytes = chunkTotal > 0 ? startBytes + chunkTotal : startBytes

      let transferredBytes = startBytes
      const startTimeMs = Date.now()
      let lastEmitMs = 0
      let lastSampleMs = startTimeMs
      let lastSampleBytes = startBytes
      let smoothedSpeed = 0

      const fileStream = createWriteStream(partPath, { flags: streamFlags })

      activeAbortFn = () => {
        isAborted = true
        try {
          res.destroy()
          req.destroy()
        } catch {
          // Ignore
        }
        try {
          fileStream.close()
        } catch {
          // Ignore
        }
      }

      res.on('data', (chunk: Buffer) => {
        if (isAborted) return
        transferredBytes += chunk.length
        const nowMs = Date.now()
        const sampleDtSec = (nowMs - lastSampleMs) / 1000

        if (sampleDtSec >= 0.25) {
          const instantSpeed = (transferredBytes - lastSampleBytes) / sampleDtSec
          smoothedSpeed =
            smoothedSpeed > 0 ? smoothedSpeed * 0.65 + instantSpeed * 0.35 : instantSpeed
          lastSampleMs = nowMs
          lastSampleBytes = transferredBytes
        } else if (smoothedSpeed === 0) {
          const totalElapsedSec = Math.max(0.1, (nowMs - startTimeMs) / 1000)
          smoothedSpeed = (transferredBytes - startBytes) / totalElapsedSec
        }

        if (nowMs - lastEmitMs >= 150 || (totalBytes > 0 && transferredBytes >= totalBytes)) {
          lastEmitMs = nowMs
          const percent =
            totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0
          const remainingBytes = Math.max(0, totalBytes - transferredBytes)
          const remainingSeconds =
            smoothedSpeed > 0 && totalBytes > 0
              ? Math.max(0, Math.ceil(remainingBytes / smoothedSpeed))
              : null

          onProgress({
            percent,
            transferredBytes,
            totalBytes,
            speedBytesPerSec: Math.round(smoothedSpeed),
            remainingSeconds,
            status: 'downloading'
          })
        }
      })

      res.pipe(fileStream)

      fileStream.on('finish', () => {
        if (isAborted) return
        activeAbortFn = null
        fileStream.close(() => {
          onProgress({
            percent: 100,
            transferredBytes,
            totalBytes: totalBytes || transferredBytes,
            speedBytesPerSec: 0,
            remainingSeconds: 0,
            status: 'completed',
            message: 'اكتمل تحميل التحديث وهو جاهز للتثبيت.'
          })
          resolve()
        })
      })

      fileStream.on('error', (err) => {
        activeAbortFn = null
        if (!isAborted) {
          reject(err)
        }
      })
    })

    activeAbortFn = () => {
      isAborted = true
      try {
        req.destroy()
      } catch {
        // Ignore
      }
    }

    req.on('timeout', () => {
      activeAbortFn = null
      req.destroy()
      if (!isAborted) {
        reject(new Error('انتهت مهلة تحميل التحديث، يمكنك المحاولة مجدداً.'))
      }
    })

    req.on('error', (err) => {
      activeAbortFn = null
      if (!isAborted) {
        reject(err)
      }
    })
  })
}

export async function startOnlineUpdateDownload(
  downloadUrl: string,
  targetVersion: string | undefined,
  mainWindow: BrowserWindow | null
): Promise<{ success: boolean; message: string }> {
  if (downloadState.isDownloading) {
    return { success: true, message: 'التحميل قيد التنفيذ بالفعل في الخلفية.' }
  }

  if (!isTrustedUpdateUrl(downloadUrl)) {
    const msg = 'رابط تحميل التحديث غير موثوق؛ يُسمح فقط بروابط HTTPS من GitHub الرسمية.'
    return { success: false, message: msg }
  }

  const partPath = getPartFilePath()
  const readyPath = getReadyInstallerPath()

  if (downloadState.url && downloadState.url !== downloadUrl) {
    try {
      if (existsSync(partPath)) unlinkSync(partPath)
    } catch {
      // Ignore stale part cleanup error
    }
  }

  downloadState.url = downloadUrl
  downloadState.expectedSha256 = verifiedChecksumsByUrl.get(downloadUrl)
  if (targetVersion) downloadState.version = targetVersion
  downloadState.isDownloading = true
  downloadState.isPaused = false
  downloadState.isReadyToInstall = false

  // Clean previous ready file if fresh download url changed
  try {
    if (existsSync(readyPath)) unlinkSync(readyPath)
  } catch {
    // Ignore
  }

  try {
    await downloadFileWithResume(downloadUrl, partPath, (payload) => {
      downloadState.lastProgress = payload
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:progress', {
          ...payload,
          version: downloadState.version
        })
      }
    })

    // Finished successfully! Move .part to .exe then run security verification
    if (existsSync(partPath)) {
      try {
        if (existsSync(readyPath)) unlinkSync(readyPath)
      } catch {
        // Ignore
      }
      renameSync(partPath, readyPath)
    }

    const verification = await verifyDownloadedInstaller(
      readyPath,
      downloadState.expectedSha256 || verifiedChecksumsByUrl.get(downloadUrl)
    )
    if (!verification.valid) {
      try {
        if (existsSync(readyPath)) unlinkSync(readyPath)
      } catch {
        // Ignore
      }
      downloadState.isDownloading = false
      downloadState.isPaused = false
      downloadState.isReadyToInstall = false
      throw new Error(verification.reason || 'فشل التحقق الأمني من ملف التحديث بعد التحميل.')
    }

    downloadState.isDownloading = false
    downloadState.isPaused = false
    downloadState.isReadyToInstall = true

    const finalPayload: UpdateProgressPayload = {
      percent: 100,
      transferredBytes: downloadState.lastProgress?.totalBytes || 0,
      totalBytes: downloadState.lastProgress?.totalBytes || 0,
      speedBytesPerSec: 0,
      remainingSeconds: 0,
      status: 'completed',
      message: 'تم اكتمال تحميل التحديث والتحقق من سلامته بنجاح وهو جاهز للتثبيت.',
      installerPath: readyPath,
      version: downloadState.version
    }
    downloadState.lastProgress = finalPayload

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', finalPayload)
    }

    return {
      success: true,
      message: 'تم تحميل التحديث والتحقق منه بنجاح وهو جاهز للتثبيت عند موافقتك.'
    }
  } catch (err: unknown) {
    if (downloadState.isPaused) {
      return { success: true, message: 'تم إيقاف التحميل مؤقتاً.' }
    }

    downloadState.isDownloading = false
    const msg = err instanceof Error ? err.message : 'فشل تحميل التحديث.'
    downloadState.lastProgress = {
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      status: 'error',
      message: msg
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', downloadState.lastProgress)
    }

    return {
      success: false,
      message: msg
    }
  }
}

export async function downloadAndInstallOnlineUpdate(
  downloadUrl: string,
  mainWindow: BrowserWindow | null
): Promise<{ success: boolean; canceled?: boolean; message?: string; backupPath?: string }> {
  return startOnlineUpdateDownload(downloadUrl, undefined, mainWindow)
}

export async function installUpdateFromLocalFile(
  mainWindow: BrowserWindow | null
): Promise<{ success: boolean; canceled?: boolean; message?: string; backupPath?: string }> {
  if (!mainWindow) {
    return { success: false, message: 'النافذة الرئيسية غير متاحة.' }
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'اختر ملف تحديث برنامج صلحلي (Setup.exe)',
    properties: ['openFile'],
    filters: [{ name: 'ملف تثبيت وتحديث صلحلي (*.exe)', extensions: ['exe'] }]
  })

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  const installerPath = filePaths[0]
  if (!existsSync(installerPath)) {
    return { success: false, message: 'الملف المختار غير موجود.' }
  }

  let siblingSha256: string | undefined
  const siblingChecksumFile = `${installerPath}.sha256`
  if (existsSync(siblingChecksumFile)) {
    try {
      siblingSha256 = extractSha256FromText(readFileSync(siblingChecksumFile, 'utf8'))
    } catch {
      // Ignore unreadable optional sibling file
    }
  }

  const verification = await verifyDownloadedInstaller(installerPath, siblingSha256)
  if (!verification.valid) {
    return {
      success: false,
      message: verification.reason || 'فشل التحقق الأمني من ملف التحديث المحلي.'
    }
  }

  try {
    const backupPath = createPreUpdateBackup()
    launchInstallerAndQuit(installerPath)
    return {
      success: true,
      backupPath,
      message: 'تم أخذ نسخة احتياطية تلقائية وجاري تشغيل ملف التحديث الآن...'
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'حدث خطأ أثناء تشغيل ملف التحديث.'
    }
  }
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
let lastAutoUpdateResult: UpdateCheckResult | null = null
let autoUpdateTimer: NodeJS.Timeout | null = null

export function getLastAutoUpdateResult(): UpdateCheckResult | null {
  return lastAutoUpdateResult
}

export function startAutoUpdateScheduler(
  onUpdateAvailable: (result: UpdateCheckResult) => void
): void {
  const runAutoCheck = async (force = false): Promise<void> => {
    try {
      const settings = getSettings()
      const lastCheckMs = Number(settings.last_update_check_at || 0)
      const now = Date.now()

      if (!force && lastCheckMs > 0 && now - lastCheckMs < TWENTY_FOUR_HOURS_MS) {
        return
      }

      const res = await checkForOnlineUpdate()
      if (res.updateAvailable) {
        lastAutoUpdateResult = res
        onUpdateAvailable(res)
      }
    } catch {
      // Silent background check
    }
  }

  // Initial check shortly after startup (checks if 24h passed or never checked; also checks for available update)
  setTimeout(() => {
    runAutoCheck(true)
  }, 6000)

  if (autoUpdateTimer) {
    clearInterval(autoUpdateTimer)
  }

  // Check every hour whether 24 hours have elapsed since last check
  autoUpdateTimer = setInterval(() => {
    runAutoCheck(false)
  }, 60 * 60 * 1000)
}

