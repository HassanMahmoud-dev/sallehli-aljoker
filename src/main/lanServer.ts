import http from 'http'
import os from 'os'
import { app } from 'electron'
import { join, extname, normalize } from 'path'
import { existsSync, createReadStream, statSync, unlinkSync, rmSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { getSettings, createBackupToFile } from './db'
import { consumeBackupTicket } from './session'
import type { SystemControlStatus } from '../shared/types'

let server: http.Server | null = null
let activePort = 4545
let isRunning = false
let rpcHandlers: Record<string, (...args: any[]) => any> = {}

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

function readJsonBody(req: http.IncomingMessage, maxBytes = 50 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        req.destroy()
        reject(new Error('حجم الطلب كبير جداً'))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })

    req.on('error', reject)
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
        proxyRes.pipe(res)
      }
    )
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('تعذر الاتصال بخادم التطوير المحلي')
    })
    req.pipe(proxyReq)
  } catch {
    res.writeHead(500)
    res.end()
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

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

      const result = await handler(...args)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, result }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ في خادم الشبكة المحلية'
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: message }))
    }
    return
  }

  // 2. Direct Backup Download for Browser Clients (Protected with single-use ticket)
  if (req.method === 'GET' && reqUrl === '/api/backup/download') {
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
      const tempPath = join(app.getPath('temp'), `Sallehli-Backup-${Date.now()}.sqlite`)
      createBackupToFile(tempPath)
      const stat = statSync(tempPath)

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="Sallehli-Backup-${dateStr}.sqlite"`,
        'Content-Length': stat.size
      })

      const stream = createReadStream(tempPath)
      stream.pipe(res)
      stream.on('close', () => {
        try {
          if (existsSync(tempPath)) unlinkSync(tempPath)
        } catch {
          // Ignore
        }
        try {
          const companionDir = `${tempPath}.attachments`
          if (existsSync(companionDir)) {
            rmSync(companionDir, { recursive: true, force: true })
          }
        } catch {
          // Ignore companion cleanup error
        }
      })
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(err instanceof Error ? err.message : 'فشل إنشاء النسخة الاحتياطية')
    }
    return
  }

  // 3. Static Renderer Files (or Dev Proxy)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    handleDevProxy(req, res, process.env['ELECTRON_RENDERER_URL'])
    return
  }

  const rendererRoot = join(__dirname, '../renderer')
  const safeRelPath = normalize(decodeURIComponent(reqUrl)).replace(/^(\.\.(\/|\\|$))+/, '')
  let filePath = join(rendererRoot, safeRelPath === '/' || safeRelPath === '\\' ? 'index.html' : safeRelPath)

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(rendererRoot, 'index.html')
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('ملف الواجهة غير موجود')
    return
  }

  const ext = extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': contentType })
  createReadStream(filePath).pipe(res)
}

export async function startLanServer(
  preferredPort?: number
): Promise<{ running: boolean; port: number; error?: string }> {
  await stopLanServer()

  const settings = getSettings()
  const basePort = Number(preferredPort || settings.lan_port || 4545)

  for (let attempt = 0; attempt < 5; attempt++) {
    const portToTry = basePort + attempt
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const srv = http.createServer((req, res) => {
        handleRequest(req, res)
      })

      srv.once('error', (err: NodeJS.ErrnoException) => {
        try {
          srv.close()
        } catch {
          // Ignore
        }
        resolve({ ok: false, error: err.message })
      })

      srv.listen(portToTry, '0.0.0.0', () => {
        server = srv
        activePort = portToTry
        isRunning = true
        resolve({ ok: true })
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
