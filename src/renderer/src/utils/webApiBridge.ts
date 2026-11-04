import type { IElectronAPI } from '../../../preload/index.d'

async function invokeHttp(channel: string, ...args: unknown[]): Promise<any> {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args })
  })
  const data = await res.json()
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `فشل تنفيذ العملية (${channel})`)
  }
  return data.result
}

export function ensureWebApiBridge(): void {
  if (typeof window === 'undefined' || window.api) return

  const webApi: IElectronAPI = {
    login: (payload) => invokeHttp('auth:login', payload),
    verifySession: (userId) => invokeHttp('auth:verifySession', userId),
    listUsers: () => invokeHttp('users:list'),
    saveUser: (data) => invokeHttp('users:save', data),
    deleteUser: (id) => invokeHttp('users:delete', id),

    listCustomers: (search) => invokeHttp('customers:list', search),
    findCustomerByPhone: (phone) => invokeHttp('customers:findByPhone', phone),
    saveCustomer: (data) => invokeHttp('customers:save', data),
    deleteCustomer: (id) => invokeHttp('customers:delete', id),
    getCustomerAppliances: (customerId) => invokeHttp('customers:appliances', customerId),
    saveCustomerAppliance: (data) => invokeHttp('customers:saveAppliance', data),
    deleteCustomerAppliance: (id) => invokeHttp('customers:deleteAppliance', id),

    listTechnicians: () => invokeHttp('technicians:list'),
    saveTechnician: (data) => invokeHttp('technicians:save', data),
    deleteTechnician: (id) => invokeHttp('technicians:delete', id),

    listSpareParts: (search) => invokeHttp('parts:list', search),
    saveSparePart: (data) => invokeHttp('parts:save', data),
    deleteSparePart: (id) => invokeHttp('parts:delete', id),
    recordInventoryMovement: (payload) => invokeHttp('inventory:movement', payload),
    listInventoryMovements: () => invokeHttp('inventory:list'),

    listTickets: (filters) => invokeHttp('tickets:list', filters),
    saveTicket: (data) => invokeHttp('tickets:save', data),
    updateTicketImages: (payload) => invokeHttp('tickets:updateImages', payload),
    deleteTicket: (id) => invokeHttp('tickets:delete', id),

    listTreasuryTransactions: () => invokeHttp('treasury:list'),
    addTreasuryTransaction: (data) => invokeHttp('treasury:add', data),
    transferTreasuryFunds: (payload) => invokeHttp('treasury:transfer', payload),
    collectTicketReceivable: (payload) => invokeHttp('treasury:collectReceivable', payload),
    deleteTreasuryTransaction: (id) => invokeHttp('treasury:delete', id),
    getFinancialReport: (payload) => invokeHttp('reports:financial', payload),

    getAppVersion: () => invokeHttp('app:version'),
    getDashboardStats: () => invokeHttp('dashboard:stats'),
    getSettings: () => invokeHttp('settings:get'),
    saveSettings: (settings) => invokeHttp('settings:save', settings),
    getDatabasePath: () => invokeHttp('db:path'),

    createBackup: async () => {
      window.open('/api/backup/download', '_blank')
      return { success: true, filePath: 'تم بدء تحميل النسخة الاحتياطية في المتصفح' }
    },
    restoreBackup: () => invokeHttp('backup:restore'),
    chooseBackupDir: () => invokeHttp('backup:chooseDir'),
    runAutoBackupNow: () => invokeHttp('backup:autoNow'),
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },

    checkForUpdates: (customUrl) => invokeHttp('update:check', customUrl),
    downloadAndInstallUpdate: (downloadUrl) =>
      invokeHttp('update:downloadAndInstall', downloadUrl),
    cancelUpdateDownload: () => invokeHttp('update:cancelDownload'),
    installLocalUpdate: () => invokeHttp('update:installLocal'),
    getAutoUpdateResult: () => invokeHttp('update:getAutoResult'),
    onUpdateProgress: () => () => {},
    onUpdateAvailable: () => () => {},

    getSystemStatus: () => invokeHttp('system:status'),
    setLanConfig: (payload) => invokeHttp('system:setLanConfig', payload),
    setAutoStartWindows: (enabled) => invokeHttp('system:setAutoStart', enabled)
  }

  window.api = webApi
}
