import { contextBridge, ipcRenderer } from 'electron'
import type {
  LoginPayload,
  User,
  Customer,
  CustomerAppliance,
  Technician,
  SparePart,
  InventoryMovement,
  MaintenanceTicket,
  TicketPartItem,
  TreasuryTransaction,
  CenterSettings,
  UpdateCheckResult,
  UpdateProgressPayload
} from '../shared/types'

// Vue reactive proxies (form.value ...) cannot cross the IPC boundary and made every
// save/add call fail silently. Always send plain JSON-safe copies.
function plain<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function invoke(channel: string, ...args: unknown[]): Promise<any> {
  return ipcRenderer.invoke(channel, ...args.map((a) => plain(a)))
}

const api = {
  // Auth & Users
  login: (payload: LoginPayload) => invoke('auth:login', payload),
  verifySession: (userId: number) => invoke('auth:verifySession', userId),
  listUsers: () => invoke('users:list'),
  saveUser: (data: Partial<User> & { password?: string }) =>
    invoke('users:save', data),
  deleteUser: (id: number) => invoke('users:delete', id),

  // Customers & Appliances
  listCustomers: (search?: string) => invoke('customers:list', search),
  findCustomerByPhone: (phone: string) => invoke('customers:findByPhone', phone),
  saveCustomer: (data: Partial<Customer>) => invoke('customers:save', data),
  deleteCustomer: (id: number) => invoke('customers:delete', id),
  getCustomerAppliances: (customerId: number) =>
    invoke('customers:appliances', customerId),
  saveCustomerAppliance: (data: Partial<CustomerAppliance>) =>
    invoke('customers:saveAppliance', data),
  deleteCustomerAppliance: (id: number) => invoke('customers:deleteAppliance', id),

  // Technicians
  listTechnicians: () => invoke('technicians:list'),
  saveTechnician: (data: Partial<Technician>) => invoke('technicians:save', data),
  deleteTechnician: (id: number) => invoke('technicians:delete', id),

  // Spare Parts & Inventory
  listSpareParts: (search?: string) => invoke('parts:list', search),
  saveSparePart: (data: Partial<SparePart>) => invoke('parts:save', data),
  deleteSparePart: (id: number) => invoke('parts:delete', id),
  recordInventoryMovement: (payload: {
    part_id: number
    technician_id?: number | null
    ticket_id?: number | null
    movement_type: InventoryMovement['movement_type']
    quantity: number
    notes?: string
    recordInTreasury?: boolean
  }) => invoke('inventory:movement', payload),
  listInventoryMovements: () => invoke('inventory:list'),

  // Maintenance Tickets
  listTickets: (filters?: {
    search?: string
    status?: string
    service_type?: string
    technician_id?: number | null
  }) => invoke('tickets:list', filters),
  saveTicket: (
    data: Partial<MaintenanceTicket> & {
      parts?: TicketPartItem[]
      recordPaymentInTreasury?: boolean
    }
  ) => invoke('tickets:save', data),
  updateTicketImages: (payload: {
    ticketId: number
    warranty_image?: string
    fault_images?: string[]
  }) => invoke('tickets:updateImages', payload),
  deleteTicket: (id: number) => invoke('tickets:delete', id),

  // Treasury & Reports
  listTreasuryTransactions: () => invoke('treasury:list'),
  addTreasuryTransaction: (data: Partial<TreasuryTransaction>) =>
    invoke('treasury:add', data),
  transferTreasuryFunds: (payload: {
    fromMethod: string
    toMethod: string
    amount: number
    notes?: string
  }) => invoke('treasury:transfer', payload),
  collectTicketReceivable: (payload: {
    ticketId: number
    amount: number
    paymentMethod: string
    notes?: string
  }) => invoke('treasury:collectReceivable', payload),
  deleteTreasuryTransaction: (id: number) => invoke('treasury:delete', id),
  getFinancialReport: (payload?: { dateFrom?: string; dateTo?: string }) =>
    invoke('reports:financial', payload),

  // Dashboard & Settings & Backup
  getAppVersion: () => invoke('app:version'),
  getDashboardStats: () => invoke('dashboard:stats'),
  getSettings: () => invoke('settings:get'),
  saveSettings: (settings: Partial<CenterSettings>) =>
    invoke('settings:save', settings),
  getDatabasePath: () => invoke('db:path'),
  createBackup: () => invoke('backup:create'),
  restoreBackup: () => invoke('backup:restore'),
  chooseBackupDir: () => invoke('backup:chooseDir'),
  runAutoBackupNow: () => invoke('backup:autoNow'),
  openExternal: (url: string) => invoke('shell:openExternal', url),

  // Application Updates (Online & Offline)
  checkForUpdates: (customUrl?: string) => invoke('update:check', customUrl),
  downloadAndInstallUpdate: (downloadUrl: string) =>
    invoke('update:downloadAndInstall', downloadUrl),
  installLocalUpdate: () => invoke('update:installLocal'),
  getAutoUpdateResult: () => invoke('update:getAutoResult'),
  onUpdateProgress: (callback: (payload: UpdateProgressPayload) => void) => {
    const listener = (_event: unknown, payload: UpdateProgressPayload): void => callback(payload)
    ipcRenderer.on('update:progress', listener)
    return () => {
      ipcRenderer.removeListener('update:progress', listener)
    }
  },
  onUpdateAvailable: (callback: (payload: UpdateCheckResult) => void) => {
    const listener = (_event: unknown, payload: UpdateCheckResult): void => callback(payload)
    ipcRenderer.on('update:available', listener)
    return () => {
      ipcRenderer.removeListener('update:available', listener)
    }
  },

  // Super Admin System Control (LAN & Browser Server + Windows Auto-Start)
  getSystemStatus: () => invoke('system:status'),
  setLanConfig: (payload: { enabled: boolean; port?: number }) =>
    invoke('system:setLanConfig', payload),
  setAutoStartWindows: (enabled: boolean) => invoke('system:setAutoStart', enabled)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
