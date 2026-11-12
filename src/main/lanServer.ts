import http from 'http'
import os from 'os'
import { app } from 'electron'
import { join, extname, normalize, resolve, sep } from 'path'
import { existsSync, createReadStream, statSync, unlinkSync, rmSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { getSettings, createBackupToFile } from './db'
import { consumeBackupTicket } from './session'
import type { SystemControlStatus } from '../shared/types'

let server: http.Server | null = null
let activePort = 4545
let isRunning = false
let rpcHandlers: Record<string, (...args: any[]) => any> = {}

const DEFAULT_RPC_MAX_BYTES = 5 * 1024 * 1024
const LARGE_RPC_MAX_BYTES = 20 * 1024 * 1024
const LARGE_PAYLOAD_CHANNELS = new Set([
  'attachments:upload',
  'tickets:save',
  'tickets:updateImages',
  'settings:save',
  'customers:saveAppliance',
  'products:save',
  'parts:save',
  'technicians:save'
])

const LOGIN_WINDOW_MS = 60 * 1000
const LOGIN_MAX_FAILURES = 10
const LOGIN_BLOCK_MS = 60 * 1000
const loginRateLimits = new Map<
  string,
  { failedCount: number; windowStart: number; blockedUntil: number }
>()

class PayloadTooLargeError extends Error {
  constructor(message = 'حجم الطلب يتجاوز الحد الأقصى المسموح به') {
    super(message)
    this.name = 'PayloadTooLargeError'
  }
}

function normalizeHostname(rawHost: string): string {
  const trimmed = rawHost.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const endBracket = trimmed.indexOf(']')
    return endBracket > 0 ? trimmed.slice(1, endBracket) : trimmed
  }
  const colonCount = (trimmed.match(/:/g) || []).length
  if (colonCount === 1) {
    return trimmed.split(':')[0]
  }
  return trimmed
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1))
  if (octets.some((n) => n < 0 || n > 255)) return false
  const [a, b] = octets
  if (a === 127) return true
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '::1') return true
  const machineHost = os.hostname().toLowerCase()
  if (host === machineHost || host === `${machineHost}.local`) return true
  if (host.startsWith('::ffff:')) {
    return isPrivateIPv4(host.slice('::ffff:'.length))
  }
  return isPrivateIPv4(host)
}

function isAllowedLanOrigin(origin: string, currentPort: number): boolean {
  if (!origin || origin === 'null') return false
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }
  if (!isLocalOrPrivateHostname(parsed.hostname)) {
    return false
  }
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    try {
      if (parsed.origin === new URL(process.env['ELECTRON_RENDERER_URL']).origin) {
        return true
      }
    } catch {
      // Ignore malformed dev URL
    }
  }
  const urlPort = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80
  return urlPort === currentPort
}

function getClientIp(req: http.IncomingMessage): string {
  const raw = req.socket?.remoteAddress || 'unknown'
  return raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw
}

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now()
  if (loginRateLimits.size > 200) {
    for (const [k, v] of loginRateLimits) {
      if (v.blockedUntil <= now && now - v.windowStart > LOGIN_WINDOW_MS) {
        loginRateLimits.delete(k)
      }
    }
  }
  const entry = loginRateLimits.get(ip)
  if (!entry) return { allowed: true }
  if (entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
    }
  }
  if (now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginRateLimits.delete(ip)
  }
  return { allowed: true }
}

function recordLoginAttempt(ip: string, succeeded: boolean): void {
  if (succeeded) {
    loginRateLimits.delete(ip)
    return
  }
  const now = Date.now()
  const existing = loginRateLimits.get(ip)
  if (!existing || now - existing.windowStart > LOGIN_WINDOW_MS) {
    loginRateLimits.set(ip, { failedCount: 1, windowStart: now, blockedUntil: 0 })
    return
  }
  const nextCount = existing.failedCount + 1
  if (nextCount >= LOGIN_MAX_FAILURES) {
    loginRateLimits.set(ip, {
      failedCount: 0,
      windowStart: now,
      blockedUntil: now + LOGIN_BLOCK_MS
    })
  } else {
    existing.failedCount = nextCount
  }
}

function applySecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'same-origin')
}

function cleanupBackupArtifacts(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    // Ignore file cleanup error
  }
  try {
    const companionDir = `${filePath}.attachments`
    if (existsSync(companionDir)) {
      rmSync(companionDir, { recursive: true, force: true })
    }
  } catch {
    // Ignore companion cleanup error
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

export function registerRpcHandlers(handlers: Record<string, (...args: any[]) => any>): void {
  rpcHandlers = handlers
}

export function getLocalIPv4Addresses(): string[] {
  const nets = os.networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const netList = nets[name]
    if (!netList) continue
    for (const net of netList) {
      const familyV4 = net.family === 'IPv4' || (net.family as unknown) === 4
      if (familyV4 && !net.internal && net.address) {
        results.push(net.address)
      }
    }
  }

  return Array.from(new Set(results))
}

export function getSystemControlStatus(): SystemControlStatus {
  const settings = getSettings()
  const browserEnabled = Boolean(settings.browser_enabled ?? 1)
  const lanEnabled = Boolean(settings.lan_enabled ?? 1)
  const port = isRunning ? activePort : Number(settings.lan_port || 4545)
  const ips = getLocalIPv4Addresses()
  const urls = ips.map((ip) => `http://${ip}:${port}`)
  const localUrl = `http://localhost:${port}`

  let autoStartWindows = Boolean(settings.auto_start_windows ?? 0)
  try {
    if (app.isPackaged) {
      const loginSettings = app.getLoginItemSettings()
      autoStartWindows = Boolean(loginSettings.openAtLogin)
    }
  } catch {
    // Fallback to DB setting
  }

  return {
    browserEnabled,
    lanEnabled,
    lanRunning: isRunning,
    lanPort: port,
    ips,
    urls,
    localUrl,
    autoStartWindows
  }
}

function extractChannelHint(prefixBuffer: Buffer): string {
  const preview = prefixBuffer.toString('utf8', 0, Math.min(prefixBuffer.length, 2048))
  const match = preview.match(/"channel"\s*:\s*"([^"\\]{1,120})"/)
  return match ? match[1] : ''
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const contentLengthHeader = Number(req.headers['content-length'] || 0)
    if (Number.isFinite(contentLengthHeader) && contentLengthHeader > LARGE_RPC_MAX_BYTES) {
      reject(new PayloadTooLargeError('حجم الطلب يتجاوز الحد الأقصى المسموح به (20 ميجابايت)'))
      return
    }

    const chunks: Buffer[] = []
    let total = 0
    let activeMaxBytes: number | null = null
    let rejected = false

    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (rejected) {
        if (total > LARGE_RPC_MAX_BYTES + 1024 * 1024) {
          req.destroy()
        }
        return
      }

      chunks.push(chunk)

      if (activeMaxBytes === null && total > DEFAULT_RPC_MAX_BYTES) {
        const prefix = Buffer.concat(chunks, Math.min(total, 2048))
        const channelHint = extractChannelHint(prefix)
        activeMaxBytes = LARGE_PAYLOAD_CHANNELS.has(channelHint)
          ? LARGE_RPC_MAX_BYTES
          : DEFAULT_RPC_MAX_BYTES
      }

      const limit = activeMaxBytes ?? DEFAULT_RPC_MAX_BYTES
      if (total > limit) {
        rejected = true
        chunks.length = 0
        const limitMb = Math.round(limit / (1024 * 1024))
        reject(new PayloadTooLargeError(`حجم الطلب يتجاوز الحد الأقصى المسموح به (${limitMb} ميجابايت)`))
      }
    })

    req.on('end', () => {
      if (rejected) return
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        const parsed = raw ? JSON.parse(raw) : {}
        const channel = String(parsed?.channel || '')
        const allowedBytes = LARGE_PAYLOAD_CHANNELS.has(channel)
          ? LARGE_RPC_MAX_BYTES
          : DEFAULT_RPC_MAX_BYTES
        if (total > allowedBytes) {
          const limitMb = Math.round(allowedBytes / (1024 * 1024))
          reject(new PayloadTooLargeError(`حجم الطلب يتجاوز الحد الأقصى للقناة (${limitMb} ميجابايت)`))
          return
        }
        resolve(parsed)
      } catch (err) {
        reject(err)
      }
    })

    req.on('error', (err) => {
      if (!rejected) reject(err)
    })
  })
}

function handleDevProxy(req: http.IncomingMessage, res: http.ServerResponse, devBaseUrl: string): void {
  try {
    const target = new URL(req.url || '/', devBaseUrl)
    const proxyReq = http.request(
      target,
      {
        method: req.method,
        headers: { ...req.headers, host: target.host }
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
        proxyRes.on('error', () => {
          if (!res.destroyed) res.destroy()
        })
        proxyRes.pipe(res)
      }
    )
    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('تعذر الاتصال بخادم التطوير المحلي')
      } else if (!res.destroyed) {
        res.destroy()
      }
    })
    res.on('close', () => {
      if (!proxyReq.destroyed) proxyReq.destroy()
    })
    req.on('error', () => {
      if (!proxyReq.destroyed) proxyReq.destroy()
    })
    req.pipe(proxyReq)
  } catch {
    if (!res.headersSent) {
      res.writeHead(500)
      res.end()
    }
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  applySecurityHeaders(res)
  res.setHeader('Vary', 'Origin')

  const hostHeader = req.headers.host
  if (hostHeader) {
    const reqHostname = normalizeHostname(String(hostHeader))
    if (!isLocalOrPrivateHostname(reqHostname)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'اسم المضيف (Host) غير مصرح به' }))
      return
    }
  }

  const originHeader = req.headers.origin
  if (originHeader !== undefined) {
    const originValue = Array.isArray(originHeader) ? originHeader[0] : originHeader
    if (!isAllowedLanOrigin(originValue, activePort)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'مصدر الطلب (Origin) غير مصرح به عبر CORS' }))
      return
    }
    res.setHeader('Access-Control-Allow-Origin', originValue)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const settings = getSettings()
  const browserEnabled = Boolean(settings.browser_enabled ?? 1)
  const lanEnabled = Boolean(settings.lan_enabled ?? 1)
  const remoteAddr = req.socket?.remoteAddress || ''
  const isLoopback =
    remoteAddr === '127.0.0.1' ||
    remoteAddr === '::1' ||
    remoteAddr === '::ffff:127.0.0.1'

  if (isLoopback && !browserEnabled) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      '<div dir="rtl" style="font-family:sans-serif;text-align:center;padding:60px;"><h2>تشغيل البرنامج عبر المتصفح معطل حالياً من قِبل السوبر أدمن</h2></div>'
    )
    return
  }

  if (!isLoopback && !lanEnabled) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      '<div dir="rtl" style="font-family:sans-serif;text-align:center;padding:60px;"><h2>تشغيل البرنامج على الشبكة المحلية (LAN) معطل حالياً من قِبل السوبر أدمن</h2></div>'
    )
    return
  }

  const reqUrl = (req.url || '/').split('?')[0]

  // 1. RPC API Endpoint
  if (req.method === 'POST' && reqUrl === '/api/rpc') {
    const contentTypeHeader = String(req.headers['content-type'] || '').toLowerCase()
    if (!contentTypeHeader.includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'نوع المحتوى غير مدعوم؛ يُسمح فقط بـ application/json' }))
      return
    }

    try {
      const body = await readJsonBody(req)
      const channel = String(body?.channel || '')
      let args = Array.isArray(body?.args) ? body.args : []

      // If token provided separately in body, ensure args[0] is { _token: token }
      if (body?.token && (!args.length || typeof args[0] !== 'object' || !('_token' in (args[0] || {})))) {
        args = [{ _token: body.token }, ...args]
      }

      const handler = rpcHandlers[channel]
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: `القناة غير موجودة: ${channel}` }))
        return
      }

      const clientIp = getClientIp(req)
      if (channel === 'auth:login') {
        const rateStatus = checkLoginRateLimit(clientIp)
        if (!rateStatus.allowed) {
          res.setHeader('Retry-After', String(rateStatus.retryAfterSec || 60))
          res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(
            JSON.stringify({
              ok: false,
              error: 'تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول الفاشلة. يرجى المحاولة بعد دقيقة.'
            })
          )
          return
        }
      }

      const result = await handler(...args)

      if (channel === 'auth:login') {
        const succeeded = Boolean(result && typeof result === 'object' && result.success === true)
        recordLoginAttempt(clientIp, succeeded)
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, result }))
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        res.writeHead(413, {
          'Content-Type': 'application/json; charset=utf-8',
          Connection: 'close'
        })
        res.end(JSON.stringify({ ok: false, error: err.message }))
        return
      }
      if (err instanceof SyntaxError) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'صيغة JSON غير صالحة في جسم الطلب' }))
        return
      }
      const message = err instanceof Error ? err.message : 'حدث خطأ في خادم الشبكة المحلية'
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: message }))
    }
    return
  }

  // 2. Direct Backup Download for Browser Clients (Protected with single-use ticket)
  if (req.method === 'GET' && reqUrl === '/api/backup/download') {
    let tempPath = ''
    try {
      const fullUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const ticket = fullUrl.searchParams.get('ticket')

      if (!consumeBackupTicket(ticket)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<div dir="rtl" style="font-family:sans-serif;text-align:center;padding:60px;"><h2>غير مصرح بتحميل النسخة الاحتياطية. يلزم صلاحية مدير وتذكرة أمان صالحة.</h2></div>'
        )
        return
      }

      const dateStr = new Date().toISOString().slice(0, 10)
      tempPath = join(app.getPath('temp'), `Sallehli-Backup-${Date.now()}.sqlite`)
      createBackupToFile(tempPath)
      const stat = statSync(tempPath)

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="Sallehli-Backup-${dateStr}.sqlite"`,
        'Content-Length': stat.size
      })

      const stream = createReadStream(tempPath)
      stream.on('error', () => {
        cleanupBackupArtifacts(tempPath)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('تعذر قراءة ملف النسخة الاحتياطية')
        } else if (!res.destroyed) {
          res.destroy()
        }
      })
      stream.on('close', () => {
        cleanupBackupArtifacts(tempPath)
      })
      res.on('close', () => {
        if (!stream.destroyed) stream.destroy()
      })
      stream.pipe(res)
    } catch (err) {
      if (tempPath) cleanupBackupArtifacts(tempPath)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(err instanceof Error ? err.message : 'فشل إنشاء النسخة الاحتياطية')
      } else if (!res.destroyed) {
        res.destroy()
      }
    }
    return
  }

  // 3. Static Renderer Files (or Dev Proxy)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    handleDevProxy(req, res, process.env['ELECTRON_RENDERER_URL'])
    return
  }

  const rendererRoot = resolve(join(__dirname, '../renderer'))
  let decodedPath = '/'
  try {
    decodedPath = decodeURIComponent(reqUrl)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('مسار الطلب غير صالح')
    return
  }

  const normalizedRel = normalize(decodedPath).replace(/^([/\\])+/, '')
  const targetCandidate = resolve(
    rendererRoot,
    normalizedRel === '' || normalizedRel === '.' ? 'index.html' : normalizedRel
  )

  if (targetCandidate !== rendererRoot && !targetCandidate.startsWith(rendererRoot + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('وصول مرفوض')
    return
  }

  let filePath = targetCandidate
  try {
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(rendererRoot, 'index.html')
    }
  } catch {
    filePath = join(rendererRoot, 'index.html')
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('ملف الواجهة غير موجود')
    return
  }

  const ext = extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  if (ext === '.html') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; media-src 'self' data: blob:; frame-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self';"
    )
  }
  res.writeHead(200, { 'Content-Type': contentType })
  const fileStream = createReadStream(filePath)
  fileStream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('تعذر قراءة الملف المطلوب')
    } else if (!res.destroyed) {
      res.destroy()
    }
  })
  res.on('close', () => {
    if (!fileStream.destroyed) fileStream.destroy()
  })
  fileStream.pipe(res)
}

export async function startLanServer(
  preferredPort?: number
): Promise<{ running: boolean; port: number; error?: string }> {
  await stopLanServer()

  const settings = getSettings()
  const basePort = Number(preferredPort || settings.lan_port || 4545)

  for (let attempt = 0; attempt < 5; attempt++) {
    const portToTry = basePort + attempt
    const result = await new Promise<{ ok: boolean; error?: string }>((resolveAttempt) => {
      const srv = http.createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
          console.error('[LAN Server] Unhandled request error:', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: false, error: 'حدث خطأ داخلي في خادم الشبكة المحلية' }))
          } else if (!res.destroyed) {
            res.destroy()
          }
        })
      })

      srv.once('error', (err: NodeJS.ErrnoException) => {
        try {
          srv.close()
        } catch {
          // Ignore
        }
        resolveAttempt({ ok: false, error: err.message })
      })

      srv.listen(portToTry, '0.0.0.0', () => {
        server = srv
        activePort = portToTry
        isRunning = true
        resolveAttempt({ ok: true })
      })
    })

    if (result.ok) {
      return { running: true, port: activePort }
    }
  }

  return {
    running: false,
    port: basePort,
    error: `تعذر تشغيل خادم الشبكة المحلية على المنفذ ${basePort}`
  }
}

export function stopLanServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      isRunning = false
      resolve()
      return
    }
    const current = server
    server = null
    isRunning = false
    try {
      current.close(() => resolve())
    } catch {
      resolve()
    }
  })
}
