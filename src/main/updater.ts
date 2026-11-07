import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { createWriteStream, existsSync, unlinkSync, statSync, renameSync } from 'fs'
import https from 'https'
import http from 'http'
import { spawn } from 'child_process'
import { getSettings, saveSettings, createPreUpdateBackup, closeDatabase } from './db'
import type { UpdateCheckResult, UpdateProgressPayload, UpdateDownloadStatus } from '../shared/types'

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

  // Match https://github.com/owner/repo...
  const ghMatch = trimmed.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i)
  if (ghMatch) {
    const owner = ghMatch[1]
    const repo = ghMatch[2].replace(/\.git$/, '')
    return {
      type: 'github',
      url: `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    }
  }

  // Match api.github.com/repos/owner/repo...
  if (trimmed.includes('api.github.com/repos/')) {
    return {
      type: 'github',
      url: trimmed.endsWith('/releases/latest') ? trimmed : `${trimmed}/releases/latest`
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      type: 'json_or_yml',
      url: trimmed
    }
  }

  return null
}

function fetchTextWithRedirects(url: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(
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
            reject(new Error('عدد كبير من عمليات إعادة التوجيه (Redirects).'))
            return
          }
          const nextUrl = new URL(res.headers.location, url).toString()
          res.resume()
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
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
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
        'يرجى إدخال اسم مستودع GitHub (مثال: username/sallehli-aljoker) أو رابط خادم التحديثات أولاً.'
    }
  }

  try {
    const bodyText = await fetchTextWithRedirects(resolved.url)

    let latestVersion = ''
    let downloadUrl = ''
    let releaseNotes = ''
    let publishedAt = ''

    if (resolved.type === 'github') {
      const release = JSON.parse(bodyText)
      latestVersion = String(release.tag_name || release.name || '').replace(/^[vV]/, '')
      releaseNotes = String(release.body || '')
      publishedAt = String(release.published_at || '')

      if (Array.isArray(release.assets)) {
        const exeAsset = release.assets.find(
          (a: { name?: string; browser_download_url?: string }) =>
            typeof a.name === 'string' && a.name.toLowerCase().endsWith('.exe')
        )
        if (exeAsset?.browser_download_url) {
          downloadUrl = exeAsset.browser_download_url
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
      } catch {
        // Parse latest.yml format from electron-builder
        const versionMatch = bodyText.match(/^version:\s*['"]?([^\r\n'"]+)['"]?/m)
        const pathMatch = bodyText.match(/^path:\s*['"]?([^\r\n'"]+)['"]?/m)
        const dateMatch = bodyText.match(/^releaseDate:\s*['"]?([^\r\n'"]+)['"]?/m)
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

    return {
      success: true,
      updateAvailable: true,
      currentVersion,
      latestVersion,
      downloadUrl,
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
  isDownloading: boolean
  isPaused: boolean
  isReadyToInstall: boolean
  lastProgress: UpdateProgressPayload | null
}

const downloadState: DownloadState = {
  url: '',
  version: '',
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

  try {
    const backupPath = createPreUpdateBackup()
    launchInstallerAndQuit(readyPath)
    return {
      success: true,
      backupPath,
      message: 'تم أخذ نسخة احتياطية وجاري بدء تثبيت التحديث...'
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
  return new Promise((resolve, reject) => {
    let isAborted = false
    const existingBytes = existsSync(partPath) ? statSync(partPath).size : 0
    const client = url.startsWith('https') ? https : http

    const headers: Record<string, string> = {
      'User-Agent': `Sallehli-Updater/${app.getVersion()}`
    }

    if (existingBytes > 0) {
      headers['Range'] = `bytes=${existingBytes}-`
    }

    const req = client.get(url, { headers }, (res) => {
      // Handle HTTP redirects
      if (
        res.statusCode &&
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        if (maxRedirects <= 0) {
          reject(new Error('عدد كبير من عمليات إعادة التوجيه أثناء التحميل.'))
          return
        }
        const nextUrl = new URL(res.headers.location, url).toString()
        res.resume()
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

  downloadState.url = downloadUrl
  if (targetVersion) downloadState.version = targetVersion
  downloadState.isDownloading = true
  downloadState.isPaused = false
  downloadState.isReadyToInstall = false

  const partPath = getPartFilePath()
  const readyPath = getReadyInstallerPath()

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

    // Finished successfully! Move .part to .exe
    if (existsSync(partPath)) {
      try {
        if (existsSync(readyPath)) unlinkSync(readyPath)
      } catch {
        // Ignore
      }
      renameSync(partPath, readyPath)
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
      message: 'تم اكتمال تحميل التحديث بنجاح وهو جاهز للتثبيت.',
      installerPath: readyPath,
      version: downloadState.version
    }
    downloadState.lastProgress = finalPayload

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', finalPayload)
    }

    return {
      success: true,
      message: 'تم تحميل التحديث بنجاح وهو جاهز للتثبيت عند موافقتك.'
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

