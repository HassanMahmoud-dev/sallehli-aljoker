import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
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
  getDatabasePath
} from './db'
import {
  checkForOnlineUpdate,
  downloadAndInstallOnlineUpdate,
  cancelOnlineUpdateDownload,
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

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconFile = existsSync(join(__dirname, '../../resources/icon.ico'))
    ? join(__dirname, '../../resources/icon.ico')
    : undefined

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    icon: iconFile,
    title: `صلحلي v${app.getVersion()} - نظام إدارة مركز صيانة الأجهزة الكهربائية`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: existsSync(join(__dirname, '../preload/index.mjs'))
        ? join(__dirname, '../preload/index.mjs')
        : join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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
    'auth:login': (payload) => loginUser(payload),
    'auth:verifySession': (userId: number) => verifySession(userId),
    'users:list': () => listUsers(),
    'users:save': (data) => saveUser(data),
    'users:delete': (id: number) => deleteUser(id),

    // Customers & Appliances
    'customers:list': (search?: string) => listCustomers(search),
    'customers:findByPhone': (phone: string) => findCustomerByPhone(phone),
    'customers:save': (data) => saveCustomer(data),
    'customers:delete': (id: number) => deleteCustomer(id),
    'customers:appliances': (customerId: number) => getCustomerAppliances(customerId),
    'customers:saveAppliance': (data) => saveCustomerAppliance(data),
    'customers:deleteAppliance': (id: number) => deleteCustomerAppliance(id),

    // Technicians
    'technicians:list': () => listTechnicians(),
    'technicians:save': (data) => saveTechnician(data),
    'technicians:delete': (id: number) => deleteTechnician(id),

    // Spare Parts & Inventory
    'parts:list': (search?: string) => listSpareParts(search),
    'parts:save': (data) => saveSparePart(data),
    'parts:delete': (id: number) => deleteSparePart(id),
    'inventory:movement': (payload) => recordInventoryMovement(payload),
    'inventory:list': () => listInventoryMovements(),

    // Maintenance Tickets
    'tickets:list': (filters) => listTickets(filters),
    'tickets:save': (data) => saveTicket(data),
    'tickets:updateImages': (payload) => updateTicketImages(payload),
    'tickets:delete': (id: number) => deleteTicket(id),

    // Treasury & Reports
    'treasury:list': () => listTreasuryTransactions(),
    'treasury:add': (data) => addTreasuryTransaction(data),
    'treasury:transfer': (payload) => transferTreasuryFunds(payload),
    'treasury:collectReceivable': (payload) => collectTicketReceivable(payload),
    'treasury:delete': (id: number) => deleteTreasuryTransaction(id),
    'reports:financial': (payload?: { dateFrom?: string; dateTo?: string }) =>
      getFinancialReport(payload?.dateFrom, payload?.dateTo),

    // Dashboard & Settings
    'app:version': () => app.getVersion(),
    'dashboard:stats': () => getDashboardStats(),
    'settings:get': () => getSettings(),
    'settings:save': (settings) => saveSettings(settings),
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
    'shell:openExternal': async (url: string) => {
      await shell.openExternal(url)
    },

    // Application Updates (Online & Offline & 24h Auto Check)
    'update:check': async (customUrl?: string) => checkForOnlineUpdate(customUrl),
    'update:downloadAndInstall': async (downloadUrl: string) =>
      downloadAndInstallOnlineUpdate(downloadUrl, mainWindow),
    'update:cancelDownload': () => cancelOnlineUpdateDownload(mainWindow),
    'update:installLocal': async () => installUpdateFromLocalFile(mainWindow),
    'update:getAutoResult': () => getLastAutoUpdateResult(),

    // Super Admin System Control (LAN & Browser Server + Windows Startup)
    'system:status': () => getSystemControlStatus(),
    'system:setBrowserConfig': async (enabled: boolean) => {
      const updated = saveSettings({ browser_enabled: enabled ? 1 : 0 })
      const shouldRun = Boolean(updated.browser_enabled ?? 1) || Boolean(updated.lan_enabled ?? 1)
      if (shouldRun) {
        await startLanServer(updated.lan_port || 4545)
      } else {
        await stopLanServer()
      }
      return getSystemControlStatus()
    },
    'system:setLanConfig': async (payload: { enabled: boolean; port?: number }) => {
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
    'system:setAutoStart': (enabled: boolean) => {
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
    }
  }

  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args) => fn(...args))
  }

  registerRpcHandlers(handlers)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.sallehli.aljoker')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
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
