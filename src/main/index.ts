import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  initDatabase,
  loginUser,
  listUsers,
  saveUser,
  deleteUser,
  listCustomers,
  findCustomerByPhone,
  saveCustomer,
  deleteCustomer,
  getCustomerAppliances,
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
  deleteTicket,
  listTreasuryTransactions,
  addTreasuryTransaction,
  deleteTreasuryTransaction,
  getDashboardStats,
  getSettings,
  saveSettings,
  createBackupToFile,
  restoreBackupFromFile,
  getDatabasePath
} from './db'

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
    title: 'صلحلي v1.0.0 - نظام إدارة مركز صيانة الأجهزة الكهربائية',
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
  // Auth & Users
  ipcMain.handle('auth:login', (_e, payload) => loginUser(payload))
  ipcMain.handle('users:list', () => listUsers())
  ipcMain.handle('users:save', (_e, data) => saveUser(data))
  ipcMain.handle('users:delete', (_e, id: number) => deleteUser(id))

  // Customers
  ipcMain.handle('customers:list', (_e, search?: string) => listCustomers(search))
  ipcMain.handle('customers:findByPhone', (_e, phone: string) => findCustomerByPhone(phone))
  ipcMain.handle('customers:save', (_e, data) => saveCustomer(data))
  ipcMain.handle('customers:delete', (_e, id: number) => deleteCustomer(id))
  ipcMain.handle('customers:appliances', (_e, customerId: number) =>
    getCustomerAppliances(customerId)
  )

  // Technicians
  ipcMain.handle('technicians:list', () => listTechnicians())
  ipcMain.handle('technicians:save', (_e, data) => saveTechnician(data))
  ipcMain.handle('technicians:delete', (_e, id: number) => deleteTechnician(id))

  // Spare Parts & Inventory
  ipcMain.handle('parts:list', (_e, search?: string) => listSpareParts(search))
  ipcMain.handle('parts:save', (_e, data) => saveSparePart(data))
  ipcMain.handle('parts:delete', (_e, id: number) => deleteSparePart(id))
  ipcMain.handle('inventory:movement', (_e, payload) => recordInventoryMovement(payload))
  ipcMain.handle('inventory:list', () => listInventoryMovements())

  // Maintenance Tickets
  ipcMain.handle('tickets:list', (_e, filters) => listTickets(filters))
  ipcMain.handle('tickets:save', (_e, data) => saveTicket(data))
  ipcMain.handle('tickets:delete', (_e, id: number) => deleteTicket(id))

  // Treasury
  ipcMain.handle('treasury:list', () => listTreasuryTransactions())
  ipcMain.handle('treasury:add', (_e, data) => addTreasuryTransaction(data))
  ipcMain.handle('treasury:delete', (_e, id: number) => deleteTreasuryTransaction(id))

  // Dashboard & Settings
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('dashboard:stats', () => getDashboardStats())
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, settings) => saveSettings(settings))
  ipcMain.handle('db:path', () => getDatabasePath())

  // Backup & Restore
  ipcMain.handle('backup:create', async () => {
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
  })

  ipcMain.handle('backup:restore', async () => {
    if (!mainWindow) return { success: false }
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'استعادة نسخة احتياطية لقاعدة البيانات',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    })
    if (canceled || filePaths.length === 0) return { success: false }
    restoreBackupFromFile(filePaths[0])
    return { success: true, filePath: filePaths[0] }
  })

  // External Links (e.g. WhatsApp)
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    await shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sallehli.aljoker')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
