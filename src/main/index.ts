import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getMachineId } from './vendorLicense'
import {
  initDatabase,
  loginUser,
  verifySession,
  listUsers,
  saveUser,
  deleteUser,
  listCustomers,
  findCustomerByPhone,
  saveCustomer,
  deleteCustomer,
  getCustomerAppliances,
  saveCustomerAppliance,
  deleteCustomerAppliance,
  listTechnicians,
  saveTechnician,
  deleteTechnician,
  listSpareParts,
  saveSparePart,
  deleteSparePart,
  recordInventoryMovement,
  listInventoryMovements,
  listTickets,
  saveTicket,
  updateTicketImages,
  deleteTicket,
  listTreasuryTransactions,
  getTreasuryBalances,
  addTreasuryTransaction,
  transferTreasuryFunds,
  collectTicketReceivable,
  deleteTreasuryTransaction,
  getFinancialReport,
  getDashboardStats,
  getSettings,
  saveSettings,
  createBackupToFile,
  restoreBackupFromFile,
  runAutoBackup,
  getDatabasePath,
  resolveSession,
  logoutUser,
  getBusinessState,
  getEffectiveModules,
  setInitialBusinessType,
  switchBusinessType,
  isBusinessDataEmpty,
  listLookupItems,
  saveLookupItem,
  deleteLookupItem,
  reorderLookupItems,
  listCustomFieldDefs,
  saveCustomFieldDef,
  deleteCustomFieldDef,
  reorderCustomFieldDefs,
  listProducts,
  getProductByBarcode,
  saveProduct,
  deleteProduct,
  listProductSerials,
  addProductSerials,
  updateProductSerialStatus,
  deleteProductSerial,
  adjustProductStock,
  listSuppliers,
  saveSupplier,
  deleteSupplier,
  getSupplierStatement,
  paySupplier,
  listPurchaseInvoices,
  savePurchaseInvoice,
  deletePurchaseInvoice,
  listSalesInvoices,
  saveSalesInvoice,
  collectSalesInstallment,
  deleteSalesInvoice,
  listInvoiceReturns,
  createSalesReturn,
  createPurchaseReturn,
  listProductExchanges,
  processProductExchange,
  lookupSerialOrInvoiceForTicket,
  returnTicketLoaner,
  getPatientProfileBundle,
  listHearingTests,
  saveHearingTest,
  deleteHearingTest,
  getLatestHearingTestSummary,
  listFollowups,
  saveFollowup,
  completeFollowup,
  deleteFollowup,
  listEarmoldOrders,
  saveEarmoldOrder,
  updateEarmoldOrderStatus,
  remakeEarmoldOrder,
  deleteEarmoldOrder,
  listImplants,
  saveImplant,
  deleteImplant,
  saveImplantSession,
  deleteImplantSession,
  listPatientAttachments,
  savePatientAttachment,
  openOrReadPatientAttachment,
  deletePatientAttachment,
  resetDatabase,
  seedDemoData,
  removeDemoData,
  getDemoDataStatus,
  setDemoDataHidden
} from './db'
import {
  checkForOnlineUpdate,
  downloadAndInstallOnlineUpdate,
  startOnlineUpdateDownload,
  pauseOnlineUpdateDownload,
  cancelOnlineUpdateDownload,
  applyDownloadedUpdate,
  getUpdateDownloadStatus,
  installUpdateFromLocalFile,
  startAutoUpdateScheduler,
  getLastAutoUpdateResult
} from './updater'
import {
  registerRpcHandlers,
  startLanServer,
  stopLanServer,
  getSystemControlStatus
} from './lanServer'
import { checkChannelAccess } from './channelPolicy'
import { createBackupTicket, type SessionInfo } from './session'
import { getBusinessProfile } from '../shared/businessProfiles'
import type { BusinessType } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function resolveSectorIcon(type: BusinessType): string | undefined {
  const candidates =
    type === 'hearing_aids'
      ? ['icon-hearing_aids.ico', 'icon-hearing_aids.png', 'icon.ico']
      : ['icon.ico', 'icon.png']
  for (const name of candidates) {
    const unpacked = join(__dirname, '../../resources', name).replace('app.asar', 'app.asar.unpacked')
    if (existsSync(unpacked)) return unpacked
    const full = join(__dirname, '../../resources', name)
    if (existsSync(full)) return full
  }
  return undefined
}

/** Updates window title and window/taskbar icon to match the active business sector. */
function applyWindowBranding(type: BusinessType): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const p = getBusinessProfile(type)
  mainWindow.setTitle(`${p.appName} v${app.getVersion()} - ${p.windowTitle}`)
  const iconPath = resolveSectorIcon(type)
  if (iconPath) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) mainWindow.setIcon(img)
  }
}

/** Validates that a frame/navigation URL belongs strictly to this app's trusted renderer origin. */
function isTrustedRendererUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  try {
    const parsed = new URL(rawUrl)
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      return parsed.origin === new URL(process.env['ELECTRON_RENDERER_URL']).origin
    }
    if (parsed.protocol !== 'file:') return false
    const expectedPath = resolve(join(__dirname, '../renderer/index.html'))
    const actualPath = resolve(fileURLToPath(parsed))
    return process.platform === 'win32'
      ? actualPath.toLowerCase() === expectedPath.toLowerCase()
      : actualPath === expectedPath
  } catch {
    return false
  }
}

function isTrustedIpcSender(event: Electron.IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (!frame || frame.parent !== null) return false
  return isTrustedRendererUrl(frame.url)
}

function createWindow(): void {
  const bState = getBusinessState()
  const iconFile = resolveSectorIcon(bState.type)
  const profile = getBusinessProfile(bState.type)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    icon: iconFile,
    title: `${profile.appName} v${app.getVersion()} - ${profile.windowTitle}`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: existsSync(join(__dirname, '../preload/index.mjs'))
        ? join(__dirname, '../preload/index.mjs')
        : join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        void shell.openExternal(parsed.toString())
      }
    } catch {
      // Block invalid or non-HTTP(S) schemes (e.g. file:, ms-msdt:, smb:)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedRendererUrl(navigationUrl)) {
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  const handlers: Record<string, (...args: any[]) => any> = {
    // Auth & Users
    'auth:login': (_ctx, payload) => loginUser(payload),
    'auth:verifySession': (_ctx, sessionToken: string | number) => verifySession(sessionToken),
    'users:list': () => listUsers(),
    'users:save': (ctx, data) => saveUser(data, ctx.session),
    'users:delete': (ctx, id: number) => deleteUser(id, ctx.session),

    // Customers & Appliances
    'customers:list': (ctx, search?: string) => {
      const list = listCustomers(search)
      const canSeeMedical = ['super_admin', 'owner'].includes(ctx.session?.role || '')
      if (canSeeMedical) return list
      return list.map((c) => ({
        ...c,
        birth_date: null,
        referring_doctor: '',
        medical_complaint: '',
        medical_history: '',
        allergies: '',
        doctor_notes: ''
      }))
    },
    'customers:findByPhone': (ctx, phone: string) => {
      const c = findCustomerByPhone(phone)
      if (!c) return null
      const canSeeMedical = ['super_admin', 'owner'].includes(ctx.session?.role || '')
      if (canSeeMedical) return c
      return {
        ...c,
        birth_date: null,
        referring_doctor: '',
        medical_complaint: '',
        medical_history: '',
        allergies: '',
        doctor_notes: ''
      }
    },
    'customers:save': (_ctx, data) => saveCustomer(data),
    'customers:delete': (_ctx, id: number) => deleteCustomer(id),
    'customers:appliances': (_ctx, customerId: number) => getCustomerAppliances(customerId),
    'customers:saveAppliance': (_ctx, data) => saveCustomerAppliance(data),
    'customers:deleteAppliance': (_ctx, id: number) => deleteCustomerAppliance(id),

    // Technicians
    'technicians:list': () => listTechnicians(),
    'technicians:save': (_ctx, data) => saveTechnician(data),
    'technicians:delete': (_ctx, id: number) => deleteTechnician(id),

    // Spare Parts & Inventory
    'parts:list': (_ctx, search?: string) => listSpareParts(search),
    'parts:save': (_ctx, data) => saveSparePart(data),
    'parts:delete': (_ctx, id: number) => deleteSparePart(id),
    'inventory:movement': (_ctx, payload) => recordInventoryMovement(payload),
    'inventory:list': () => listInventoryMovements(),

    // Phase 3A: Products, Variants, Serials & Suppliers
    'products:list': (ctx, filters) => {
      const list = listProducts(filters)
      const canSeeCost = ['super_admin', 'owner'].includes(ctx.session?.role || '')
      if (canSeeCost) return list
      return list.map((p) => ({
        ...p,
        cost_price: 0
      }))
    },
    'products:getByBarcode': (_ctx, barcode: string) => getProductByBarcode(barcode),
    'products:save': (_ctx, data) => saveProduct(data),
    'products:delete': (_ctx, id: number) => deleteProduct(id),
    'products:serials:list': (_ctx, filters) => listProductSerials(filters),
    'products:serials:add': (_ctx, payload) => addProductSerials(payload),
    'products:serials:updateStatus': (_ctx, payload) => updateProductSerialStatus(payload),
    'products:serials:delete': (_ctx, id: number) => deleteProductSerial(id),
    'products:adjustStock': (_ctx, payload) => adjustProductStock(payload),
    'suppliers:list': (_ctx, search?: string) => listSuppliers(search),
    'suppliers:save': (_ctx, data) => saveSupplier(data),
    'suppliers:delete': (_ctx, id: number) => deleteSupplier(id),
    'suppliers:statement': (_ctx, supplierId: number) => getSupplierStatement(supplierId),
    'suppliers:pay': (ctx, payload) => paySupplier(payload, ctx.session),

    // Phase 3B, 3C, 3D & 3E: Purchases, Sales, Returns, Exchanges & Ticket Lookups
    'purchases:list': (_ctx, filters) => listPurchaseInvoices(filters),
    'purchases:save': (ctx, data) => savePurchaseInvoice(data, ctx.session),
    'purchases:delete': (_ctx, id: number) => deletePurchaseInvoice(id),
    'sales:list': (_ctx, filters) => listSalesInvoices(filters),
    'sales:save': (ctx, data) => saveSalesInvoice(data, ctx.session),
    'sales:collectInstallment': (ctx, payload) => collectSalesInstallment(payload, ctx.session),
    'sales:delete': (_ctx, id: number) => deleteSalesInvoice(id),
    'returns:list': (_ctx, returnType) => listInvoiceReturns(returnType),
    'returns:sales:create': (ctx, payload) => createSalesReturn(payload, ctx.session),
    'returns:purchases:create': (ctx, payload) => createPurchaseReturn(payload, ctx.session),
    'exchanges:list': () => listProductExchanges(),
    'exchanges:process': (ctx, payload) => processProductExchange(payload, ctx.session),
    'tickets:lookupSerialOrInvoice': (_ctx, query: string) =>
      lookupSerialOrInvoiceForTicket(query),
    'tickets:returnLoaner': (_ctx, ticketId: number) => returnTicketLoaner(ticketId),

    // Phase 4: Patient Medical Profile, Hearing Tests, Followups, Earmolds, Implants & Attachments
    'patients:profile': (_ctx, patientId: number) => getPatientProfileBundle(patientId),
    'hearingTests:list': (_ctx, filters) => listHearingTests(filters),
    'hearingTests:save': (_ctx, data) => saveHearingTest(data),
    'hearingTests:delete': (_ctx, id: number) => deleteHearingTest(id),
    'hearingTests:latestSummary': (_ctx, patientId: number) =>
      getLatestHearingTestSummary(patientId),
    'followups:list': (_ctx, filters) => listFollowups(filters),
    'followups:save': (_ctx, data) => saveFollowup(data),
    'followups:complete': (_ctx, payload) => completeFollowup(payload),
    'followups:delete': (_ctx, id: number) => deleteFollowup(id),
    'earmolds:list': (_ctx, filters) => listEarmoldOrders(filters),
    'earmolds:save': (_ctx, data) => saveEarmoldOrder(data),
    'earmolds:updateStatus': (_ctx, payload) => updateEarmoldOrderStatus(payload),
    'earmolds:remake': (_ctx, payload) => remakeEarmoldOrder(payload),
    'earmolds:delete': (_ctx, id: number) => deleteEarmoldOrder(id),
    'implants:list': (_ctx, filters) => listImplants(filters),
    'implants:save': (_ctx, data) => saveImplant(data),
    'implants:delete': (_ctx, id: number) => deleteImplant(id),
    'implants:sessions:save': (_ctx, data) => saveImplantSession(data),
    'implants:sessions:delete': (_ctx, id: number) => deleteImplantSession(id),
    'attachments:list': (_ctx, payload: { patientId: number; entityType?: string; entityId?: number }) =>
      listPatientAttachments(payload.patientId, payload.entityType, payload.entityId),
    'attachments:upload': (_ctx, payload) => savePatientAttachment(payload),
    'attachments:open': (_ctx, payload: { id: number; openExternal?: boolean }) =>
      openOrReadPatientAttachment(payload.id, payload.openExternal),
    'attachments:delete': (_ctx, id: number) => deletePatientAttachment(id),

    // Maintenance Tickets
    'tickets:list': (_ctx, filters) => listTickets(filters),
    'tickets:save': (ctx, data) => saveTicket(data, ctx.session),
    'tickets:updateImages': (_ctx, payload) => updateTicketImages(payload),
    'tickets:delete': (_ctx, id: number) => deleteTicket(id),

    // Treasury & Reports
    'treasury:list': () => listTreasuryTransactions(),
    'treasury:balances': () => getTreasuryBalances(),
    'treasury:add': (ctx, data) => addTreasuryTransaction(data, ctx.session),
    'treasury:transfer': (ctx, payload) => transferTreasuryFunds(payload, ctx.session),
    'treasury:collectReceivable': (_ctx, payload) => collectTicketReceivable(payload),
    'treasury:delete': (_ctx, id: number) => deleteTreasuryTransaction(id),
    'reports:financial': (_ctx, payload?: { dateFrom?: string; dateTo?: string }) =>
      getFinancialReport(payload?.dateFrom, payload?.dateTo),

    // Dashboard & Settings
    'app:version': () => app.getVersion(),
    'dashboard:stats': () => getDashboardStats(),
    'settings:get': () => getSettings(),
    'settings:save': (ctx, settings) => saveSettings(settings, ctx.session ?? null),
    'db:path': () => getDatabasePath(),

    // Backup & Restore & Auto-Backup
    'backup:create': async () => {
      if (!mainWindow) return { success: false }
      const dateStr = new Date().toISOString().slice(0, 10)
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'حفظ نسخة احتياطية من قاعدة البيانات',
        defaultPath: `Sallehli-Backup-${dateStr}.sqlite`,
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
      })
      if (canceled || !filePath) return { success: false }
      createBackupToFile(filePath)
      return { success: true, filePath }
    },
    'backup:restore': async () => {
      if (!mainWindow) return { success: false }
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'استعادة نسخة احتياطية لقاعدة البيانات',
        properties: ['openFile'],
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
      })
      if (canceled || filePaths.length === 0) return { success: false }
      restoreBackupFromFile(filePaths[0])
      applyWindowBranding(getBusinessState().type)
      return { success: true, filePath: filePaths[0] }
    },
    'backup:chooseDir': async () => {
      if (!mainWindow) return { success: false }
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر مجلد حفظ النسخ الاحتياطية التلقائية',
        properties: ['openDirectory', 'createDirectory']
      })
      if (canceled || filePaths.length === 0) return { success: false }
      return { success: true, dirPath: filePaths[0] }
    },
    'backup:autoNow': () => runAutoBackup(),

    // External Links (e.g. WhatsApp / Browser)
    'shell:openExternal': async (_ctx, url: string) => {
      const cleanUrl = String(url || '').trim()
      let parsed: URL
      try {
        parsed = new URL(cleanUrl)
      } catch {
        throw new Error('الرابط غير صالح؛ يسمح فقط بروابط http و https')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('الرابط غير صالح؛ يسمح فقط بروابط http و https')
      }
      await shell.openExternal(parsed.toString())
    },

    // Application Updates (Online & Offline & 24h Auto Check)
    'update:check': async (_ctx, customUrl?: string) => checkForOnlineUpdate(customUrl),
    'update:downloadAndInstall': async (_ctx, downloadUrl: string) =>
      downloadAndInstallOnlineUpdate(downloadUrl, mainWindow),
    'update:startDownload': async (_ctx, downloadUrl: string, targetVersion?: string) =>
      startOnlineUpdateDownload(downloadUrl, targetVersion, mainWindow),
    'update:pauseDownload': () => pauseOnlineUpdateDownload(mainWindow),
    'update:cancelDownload': () => cancelOnlineUpdateDownload(mainWindow),
    'update:applyDownloaded': () => applyDownloadedUpdate(),
    'update:getDownloadStatus': () => getUpdateDownloadStatus(),
    'update:installLocal': async () => installUpdateFromLocalFile(mainWindow),
    'update:getAutoResult': () => getLastAutoUpdateResult(),

    // Super Admin System Control (LAN & Browser Server + Windows Startup)
    'system:status': () => getSystemControlStatus(),
    'system:setBrowserConfig': async (_ctx, enabled: boolean) => {
      const updated = saveSettings({ browser_enabled: enabled ? 1 : 0 })
      const shouldRun = Boolean(updated.browser_enabled ?? 1) || Boolean(updated.lan_enabled ?? 1)
      if (shouldRun) {
        await startLanServer(updated.lan_port || 4545)
      } else {
        await stopLanServer()
      }
      return getSystemControlStatus()
    },
    'system:setLanConfig': async (_ctx, payload: { enabled: boolean; port?: number }) => {
      const cleanPort = Math.max(1024, Math.min(65535, Number(payload.port || 4545)))
      const updated = saveSettings({
        lan_enabled: payload.enabled ? 1 : 0,
        lan_port: cleanPort
      })
      const shouldRun = Boolean(updated.browser_enabled ?? 1) || Boolean(updated.lan_enabled ?? 1)
      if (shouldRun) {
        await startLanServer(cleanPort)
      } else {
        await stopLanServer()
      }
      return getSystemControlStatus()
    },
    'system:setAutoStart': (_ctx, enabled: boolean) => {
      saveSettings({ auto_start_windows: enabled ? 1 : 0 })
      try {
        app.setLoginItemSettings({
          openAtLogin: Boolean(enabled),
          path: process.execPath
        })
      } catch {
        // Ignore in dev environment if unsupported
      }
      return getSystemControlStatus()
    },

    // Auth Session Management
    'auth:logout': (ctx: { token: string | null }) => logoutUser(ctx.token),

    // Business Profile & System Setup (Super Admin)
    'business:getPublic': () => getBusinessState(),
    'business:get': () => getBusinessState(),
    'business:setInitial': (_ctx: unknown, type: BusinessType) => {
      const res = setInitialBusinessType(type)
      applyWindowBranding(res.type)
      return res
    },
    'business:checkSwitch': () => isBusinessDataEmpty(),
    'business:switch': (
      ctx: { session: SessionInfo | null },
      payload: { type: BusinessType; password?: string }
    ) => {
      const res = switchBusinessType(payload, ctx.session?.userId || 1)
      applyWindowBranding(res.type)
      return res
    },

    // Dynamic Lookups (Types & Brands)
    'lookups:list': (_ctx: unknown, category?: string) => listLookupItems(category),
    'lookups:save': (_ctx: unknown, data: any) => saveLookupItem(data),
    'lookups:delete': (_ctx: unknown, id: number) => deleteLookupItem(id),
    'lookups:reorder': (_ctx: unknown, items: Array<{ id: number; sort_order: number }>) =>
      reorderLookupItems(items),

    // Custom Fields Definitions
    'customFields:list': (_ctx: unknown, entity?: any) => listCustomFieldDefs(entity),
    'customFields:save': (_ctx: unknown, data: any) => saveCustomFieldDef(data),
    'customFields:delete': (_ctx: unknown, id: number) => deleteCustomFieldDef(id),
    'customFields:reorder': (_ctx: unknown, items: Array<{ id: number; sort_order: number }>) =>
      reorderCustomFieldDefs(items),

    // Backup Download Ticket
    'backup:createTicket': (ctx: { token: string | null }) => createBackupTicket(ctx.token),

    // Database Reset & Demo Data Management
    'db:reset': () => resetDatabase(),
    'demo:seed': (_ctx: unknown, targetType?: BusinessType) => seedDemoData(targetType),
    'demo:remove': () => removeDemoData(),
    'demo:status': () => getDemoDataStatus(),
    'demo:setHidden': (_ctx: unknown, hidden: boolean) => setDemoDataHidden(hidden)
  }

  const wrappedHandlers: Record<string, (...args: any[]) => any> = {}

  for (const [channel, fn] of Object.entries(handlers)) {
    const wrapped = async (...rawArgs: any[]) => {
      let token: string | null = null
      let actualArgs = rawArgs

      if (
        rawArgs.length > 0 &&
        typeof rawArgs[0] === 'object' &&
        rawArgs[0] !== null &&
        '_token' in rawArgs[0]
      ) {
        token = rawArgs[0]._token || null
        actualArgs = rawArgs.slice(1)
      }

      const session = token ? resolveSession(token) : null
      const effectiveModules = getEffectiveModules()
      const access = checkChannelAccess(channel, session, effectiveModules)
      if (!access.allowed) {
        throw new Error(access.reason || 'غير مصرح بتنفيذ هذه العملية')
      }

      const bState = getBusinessState()
      if (bState.locked) {
        const allowedWhenLocked = new Set([
          'auth:login',
          'auth:verifySession',
          'auth:logout',
          'app:version',
          'settings:get',
          'business:getPublic',
          'shell:openExternal',
          'business:get',
          'business:setInitial',
          'business:checkSwitch',
          'business:switch',
          'backup:create',
          'backup:restore',
          'backup:createTicket',
          'db:path',
          'db:reset',
          'lookups:list',
          'customFields:list',
          'system:status',
          'users:list'
        ])
        if (!allowedWhenLocked.has(channel)) {
          throw new Error(
            'BUSINESS_LOCKED: تم قفل النظام بسبب اكتشاف تلاعب غير مصرح به في إعداد النشاط. يرجى مراجعة السوبر أدمن.'
          )
        }
      }

      return fn({ session, token }, ...actualArgs)
    }

    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrustedIpcSender(e)) {
        throw new Error('تم رفض الطلب: مصدر الإطار غير موثوق.')
      }
      return wrapped(...args)
    })
    wrappedHandlers[channel] = wrapped
  }

  registerRpcHandlers(wrappedHandlers)
}

function readRegistryInstallMachine(hive: 'HKCU' | 'HKLM'): string {
  try {
    const out = execFileSync('reg', ['query', `${hive}\\Software\\Sallehli`, '/v', 'InstallMachine'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    })
    const m = out.match(/InstallMachine\s+REG_SZ\s+([0-9a-fA-F-]{16,})/)
    return m ? m[1].trim().toLowerCase() : ''
  } catch {
    return ''
  }
}

function verifyMachineInstallationLock(): boolean {
  if (!app.isPackaged || process.platform !== 'win32') return true

  const currentMachineId = getMachineId().trim().toLowerCase()
  if (!currentMachineId || currentMachineId.startsWith('fallback:')) return false

  const lockPath = join(dirname(process.execPath), '.install-lock')
  if (!existsSync(lockPath)) return false

  try {
    const fileMachineId = readFileSync(lockPath, 'utf8').trim().toLowerCase()
    if (!fileMachineId || fileMachineId !== currentMachineId) return false
  } catch {
    return false
  }

  const hkcuId = readRegistryInstallMachine('HKCU')
  const hklmId = readRegistryInstallMachine('HKLM')
  return hkcuId === currentMachineId || hklmId === currentMachineId
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.sallehli.aljoker')

  if (!verifyMachineInstallationLock()) {
    dialog.showErrorBox(
      'جهاز غير مصرح',
      'لا يمكن تشغيل البرنامج بعد نقل أو نسخ ملفاته إلى جهاز آخر.\nيرجى تثبيت البرنامج على هذا الجهاز باستخدام ملف التثبيت الرسمي.'
    )
    app.quit()
    return
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    initDatabase()
  } catch (err) {
    dialog.showErrorBox('تعذر تشغيل قاعدة البيانات', (err as Error).message)
    app.quit()
    return
  }
  registerIpcHandlers()

  const settings = getSettings()
  if (Boolean(settings.browser_enabled ?? 1) || Boolean(settings.lan_enabled ?? 1)) {
    await startLanServer(settings.lan_port || 4545)
  }

  if (app.isPackaged && settings.auto_start_windows !== undefined) {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(settings.auto_start_windows),
        path: process.execPath
      })
    } catch {
      // Ignore
    }
  }

  createWindow()

  startAutoUpdateScheduler((result) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', result)
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopLanServer()
  runAutoBackup()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
