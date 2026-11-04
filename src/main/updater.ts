import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import https from 'https'
import http from 'http'
import { spawn } from 'child_process'
import { getSettings, saveSettings, createPreUpdateBackup, closeDatabase } from './db'
import type { UpdateCheckResult, UpdateProgressPayload } from '../shared/types'

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

function downloadFileWithProgress(
  url: string,
  destPath: string,
  onProgress: (payload: UpdateProgressPayload) => void,
  maxRedirects = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': `Sallehli-Updater/${app.getVersion()}`
        }
      },
      (res) => {
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
          downloadFileWithProgress(nextUrl, destPath, onProgress, maxRedirects - 1)
            .then(resolve)
            .catch(reject)
          return
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          reject(new Error(`فشل تحميل ملف التحديث (كود الحالة: ${res.statusCode})`))
          return
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
        let transferredBytes = 0

        const fileStream = createWriteStream(destPath)

        res.on('data', (chunk: Buffer) => {
          transferredBytes += chunk.length
          const percent =
            totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0
          onProgress({
            percent,
            transferredBytes,
            totalBytes,
            status: 'downloading'
          })
        })

        res.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close(() => {
            onProgress({
              percent: 100,
              transferredBytes,
              totalBytes: totalBytes || transferredBytes,
              status: 'completed'
            })
            resolve()
          })
        })

        fileStream.on('error', (err) => {
          try {
            if (existsSync(destPath)) unlinkSync(destPath)
          } catch {
            // Ignore cleanup error
          }
          reject(err)
        })
      }
    )

    req.on('error', (err) => {
      try {
        if (existsSync(destPath)) unlinkSync(destPath)
      } catch {
        // Ignore cleanup error
      }
      reject(err)
    })
  })
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

export async function downloadAndInstallOnlineUpdate(
  downloadUrl: string,
  mainWindow: BrowserWindow | null
): Promise<{ success: boolean; message?: string; backupPath?: string }> {
  try {
    const tempFilePath = join(app.getPath('temp'), `Sallehli-Update-${Date.now()}.exe`)

    await downloadFileWithProgress(downloadUrl, tempFilePath, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:progress', progress)
      }
    })

    const backupPath = createPreUpdateBackup()
    launchInstallerAndQuit(tempFilePath)

    return {
      success: true,
      backupPath,
      message: 'تم تحميل التحديث وحفظ نسخة احتياطية من قاعدة البيانات، جاري تشغيل معالج التحديث...'
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'فشل تحميل وتثبيت التحديث.'
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', {
        percent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'error',
        message
      } satisfies UpdateProgressPayload)
    }
    return {
      success: false,
      message
    }
  }
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

