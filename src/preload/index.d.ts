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
  DashboardStats,
  FinancialReportData,
  UpdateCheckResult,
  UpdateProgressPayload,
  SystemControlStatus
} from '../shared/types'

export interface IElectronAPI {
  login: (payload: LoginPayload) => Promise<AuthResponse>
  verifySession: (userId: number) => Promise<AuthResponse>
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
  saveCustomerAppliance: (data: Partial<CustomerAppliance>) => Promise<CustomerAppliance>
  deleteCustomerAppliance: (id: number) => Promise<void>

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
  updateTicketImages: (payload: {
    ticketId: number
    warranty_image?: string
    fault_images?: string[]
  }) => Promise<MaintenanceTicket>
  deleteTicket: (id: number) => Promise<void>

  listTreasuryTransactions: () => Promise<TreasuryTransaction[]>
  addTreasuryTransaction: (data: Partial<TreasuryTransaction>) => Promise<TreasuryTransaction>
  transferTreasuryFunds: (payload: {
    fromMethod: string
    toMethod: string
    amount: number
    notes?: string
  }) => Promise<void>
  collectTicketReceivable: (payload: {
    ticketId: number
    amount: number
    paymentMethod: string
    notes?: string
  }) => Promise<MaintenanceTicket>
  deleteTreasuryTransaction: (id: number) => Promise<void>
  getFinancialReport: (payload?: {
    dateFrom?: string
    dateTo?: string
  }) => Promise<FinancialReportData>

  getAppVersion: () => Promise<string>
  getDashboardStats: () => Promise<DashboardStats>
  getSettings: () => Promise<CenterSettings>
  saveSettings: (settings: Partial<CenterSettings>) => Promise<CenterSettings>
  getDatabasePath: () => Promise<string>
  createBackup: () => Promise<{ success: boolean; filePath?: string }>
  restoreBackup: () => Promise<{ success: boolean; filePath?: string }>
  chooseBackupDir: () => Promise<{ success: boolean; dirPath?: string }>
  runAutoBackupNow: () => Promise<{ success: boolean; filePath?: string }>
  openExternal: (url: string) => Promise<void>

  checkForUpdates: (customUrl?: string) => Promise<UpdateCheckResult>
  downloadAndInstallUpdate: (
    downloadUrl: string
  ) => Promise<{ success: boolean; message?: string; backupPath?: string }>
  installLocalUpdate: () => Promise<{
    success: boolean
    canceled?: boolean
    message?: string
    backupPath?: string
  }>
  getAutoUpdateResult: () => Promise<UpdateCheckResult | null>
  onUpdateProgress: (callback: (payload: UpdateProgressPayload) => void) => () => void
  onUpdateAvailable: (callback: (payload: UpdateCheckResult) => void) => () => void

  getSystemStatus: () => Promise<SystemControlStatus>
  setLanConfig: (payload: { enabled: boolean; port?: number }) => Promise<SystemControlStatus>
  setAutoStartWindows: (enabled: boolean) => Promise<SystemControlStatus>
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
