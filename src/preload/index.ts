import { contextBridge, ipcRenderer } from 'electron'
import type {
  LoginPayload,
  User,
  Customer,
  Technician,
  SparePart,
  InventoryMovement,
  MaintenanceTicket,
  TicketPartItem,
  TreasuryTransaction,
  CenterSettings
} from '../shared/types'

const api = {
  // Auth & Users
  login: (payload: LoginPayload) => ipcRenderer.invoke('auth:login', payload),
  listUsers: () => ipcRenderer.invoke('users:list'),
  saveUser: (data: Partial<User> & { password?: string }) =>
    ipcRenderer.invoke('users:save', data),
  deleteUser: (id: number) => ipcRenderer.invoke('users:delete', id),

  // Customers
  listCustomers: (search?: string) => ipcRenderer.invoke('customers:list', search),
  findCustomerByPhone: (phone: string) => ipcRenderer.invoke('customers:findByPhone', phone),
  saveCustomer: (data: Partial<Customer>) => ipcRenderer.invoke('customers:save', data),
  deleteCustomer: (id: number) => ipcRenderer.invoke('customers:delete', id),
  getCustomerAppliances: (customerId: number) =>
    ipcRenderer.invoke('customers:appliances', customerId),

  // Technicians
  listTechnicians: () => ipcRenderer.invoke('technicians:list'),
  saveTechnician: (data: Partial<Technician>) => ipcRenderer.invoke('technicians:save', data),
  deleteTechnician: (id: number) => ipcRenderer.invoke('technicians:delete', id),

  // Spare Parts & Inventory
  listSpareParts: (search?: string) => ipcRenderer.invoke('parts:list', search),
  saveSparePart: (data: Partial<SparePart>) => ipcRenderer.invoke('parts:save', data),
  deleteSparePart: (id: number) => ipcRenderer.invoke('parts:delete', id),
  recordInventoryMovement: (payload: {
    part_id: number
    technician_id?: number | null
    ticket_id?: number | null
    movement_type: InventoryMovement['movement_type']
    quantity: number
    notes?: string
    recordInTreasury?: boolean
  }) => ipcRenderer.invoke('inventory:movement', payload),
  listInventoryMovements: () => ipcRenderer.invoke('inventory:list'),

  // Maintenance Tickets
  listTickets: (filters?: {
    search?: string
    status?: string
    service_type?: string
    technician_id?: number | null
  }) => ipcRenderer.invoke('tickets:list', filters),
  saveTicket: (
    data: Partial<MaintenanceTicket> & {
      parts?: TicketPartItem[]
      recordPaymentInTreasury?: boolean
    }
  ) => ipcRenderer.invoke('tickets:save', data),
  deleteTicket: (id: number) => ipcRenderer.invoke('tickets:delete', id),

  // Treasury
  listTreasuryTransactions: () => ipcRenderer.invoke('treasury:list'),
  addTreasuryTransaction: (data: Partial<TreasuryTransaction>) =>
    ipcRenderer.invoke('treasury:add', data),
  deleteTreasuryTransaction: (id: number) => ipcRenderer.invoke('treasury:delete', id),

  // Dashboard & Settings & Backup
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getDashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<CenterSettings>) =>
    ipcRenderer.invoke('settings:save', settings),
  getDatabasePath: () => ipcRenderer.invoke('db:path'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
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
