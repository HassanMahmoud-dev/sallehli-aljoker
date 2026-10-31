import type {
  AuthResponse,
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
  DashboardStats
} from '../shared/types'

export interface IElectronAPI {
  login: (payload: LoginPayload) => Promise<AuthResponse>
  listUsers: () => Promise<User[]>
  saveUser: (data: Partial<User> & { password?: string }) => Promise<User>
  deleteUser: (id: number) => Promise<void>

  listCustomers: (search?: string) => Promise<Customer[]>
  findCustomerByPhone: (phone: string) => Promise<{
    customer: Customer | null
    appliances: CustomerAppliance[]
    previousTickets: MaintenanceTicket[]
  }>
  saveCustomer: (data: Partial<Customer>) => Promise<Customer>
  deleteCustomer: (id: number) => Promise<void>
  getCustomerAppliances: (customerId: number) => Promise<CustomerAppliance[]>

  listTechnicians: () => Promise<Technician[]>
  saveTechnician: (data: Partial<Technician>) => Promise<Technician>
  deleteTechnician: (id: number) => Promise<void>

  listSpareParts: (search?: string) => Promise<SparePart[]>
  saveSparePart: (data: Partial<SparePart>) => Promise<SparePart>
  deleteSparePart: (id: number) => Promise<void>
  recordInventoryMovement: (payload: {
    part_id: number
    technician_id?: number | null
    ticket_id?: number | null
    movement_type: InventoryMovement['movement_type']
    quantity: number
    notes?: string
    recordInTreasury?: boolean
  }) => Promise<void>
  listInventoryMovements: () => Promise<InventoryMovement[]>

  listTickets: (filters?: {
    search?: string
    status?: string
    service_type?: string
    technician_id?: number | null
  }) => Promise<MaintenanceTicket[]>
  saveTicket: (
    data: Partial<MaintenanceTicket> & {
      parts?: TicketPartItem[]
      recordPaymentInTreasury?: boolean
    }
  ) => Promise<MaintenanceTicket>
  deleteTicket: (id: number) => Promise<void>

  listTreasuryTransactions: () => Promise<TreasuryTransaction[]>
  addTreasuryTransaction: (data: Partial<TreasuryTransaction>) => Promise<TreasuryTransaction>
  deleteTreasuryTransaction: (id: number) => Promise<void>

  getAppVersion: () => Promise<string>
  getDashboardStats: () => Promise<DashboardStats>
  getSettings: () => Promise<CenterSettings>
  saveSettings: (settings: Partial<CenterSettings>) => Promise<CenterSettings>
  getDatabasePath: () => Promise<string>
  createBackup: () => Promise<{ success: boolean; filePath?: string }>
  restoreBackup: () => Promise<{ success: boolean; filePath?: string }>
  openExternal: (url: string) => Promise<void>
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
