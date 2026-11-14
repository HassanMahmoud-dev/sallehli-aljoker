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
  UpdateProgressPayload,
  BusinessType,
  LookupItem,
  CustomFieldEntity,
  CustomFieldDef,
  Product,
  ProductVariant,
  SerialStatus,
  SerialCondition,
  Supplier,
  PurchaseInvoice,
  PurchaseItem,
  SalesInvoice,
  SalesItem,
  ExchangeType,
  AudiogramPoint,
  HearingTest,
  FollowupItem,
  FittingSettings,
  EarmoldOrder,
  EarmoldStatus,
  CochlearImplant,
  ImplantSession,
  AttachmentCategory,
  PatientAttachment
} from '../shared/types'

let currentSessionToken = ''

// Vue reactive proxies (form.value ...) cannot cross the IPC boundary and made every
// save/add call fail silently. Always send plain JSON-safe copies.
function plain<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function invoke(channel: string, ...args: unknown[]): Promise<any> {
  const tokenArg = { _token: currentSessionToken }
  return ipcRenderer.invoke(channel, tokenArg, ...args.map((a) => plain(a)))
}

const api = {
  // Session Token
  setSessionToken: (token: string) => {
    currentSessionToken = token
  },
  logout: () => invoke('auth:logout'),

  // Auth & Users
  login: (payload: LoginPayload) => invoke('auth:login', payload),
  verifySession: (identifier: string | number) => invoke('auth:verifySession', identifier),
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

  // Phase 3A: Products, Variants, Serials & Suppliers
  listProducts: (filters?: { search?: string; type?: string; activeOnly?: boolean }) =>
    invoke('products:list', filters),
  getProductByBarcode: (barcode: string) => invoke('products:getByBarcode', barcode),
  saveProduct: (
    data: Partial<Product> & {
      variants?: Partial<ProductVariant>[]
      initial_serials?: string[]
    }
  ) => invoke('products:save', data),
  deleteProduct: (id: number) => invoke('products:delete', id),
  listProductSerials: (filters?: { product_id?: number; status?: string; search?: string }) =>
    invoke('products:serials:list', filters),
  addProductSerials: (payload: {
    product_id: number
    variant_id?: number | null
    serials: string[]
    condition?: SerialCondition
    ear_side?: string
    company_warranty_start?: string | null
    company_warranty_end?: string | null
    notes?: string
    recordInTreasury?: boolean
    payment_method?: string
  }) => invoke('products:serials:add', payload),
  updateProductSerialStatus: (payload: {
    id: number
    status: SerialStatus
    condition?: SerialCondition
    ear_side?: string
    company_warranty_end?: string | null
    notes?: string
  }) => invoke('products:serials:updateStatus', payload),
  deleteProductSerial: (id: number) => invoke('products:serials:delete', id),
  adjustProductStock: (payload: {
    product_id: number
    variant_id?: number | null
    unit: 'piece' | 'pack'
    quantity: number
    movement_type: 'in' | 'damaged'
    notes?: string
    recordInTreasury?: boolean
    payment_method?: string
  }) => invoke('products:adjustStock', payload),
  listSuppliers: (search?: string) => invoke('suppliers:list', search),
  saveSupplier: (data: Partial<Supplier>) => invoke('suppliers:save', data),
  deleteSupplier: (id: number) => invoke('suppliers:delete', id),
  getSupplierStatement: (supplierId: number) => invoke('suppliers:statement', supplierId),
  paySupplier: (payload: {
    supplier_id: number
    amount: number
    payment_method: string
    notes?: string
    recordInTreasury?: boolean
    purchase_invoice_id?: number | null
  }) => invoke('suppliers:pay', payload),

  // Phase 3B, 3C, 3D & 3E: Purchases, Sales, Returns, Exchanges & Ticket Lookups
  listPurchaseInvoices: (filters?: {
    search?: string
    purchase_type?: string
    supplier_id?: number | null
  }) => invoke('purchases:list', filters),
  savePurchaseInvoice: (
    data: Partial<PurchaseInvoice> & { items: PurchaseItem[]; recordInTreasury?: boolean }
  ) => invoke('purchases:save', data),
  deletePurchaseInvoice: (id: number) => invoke('purchases:delete', id),

  listSalesInvoices: (filters?: {
    search?: string
    invoice_type?: string
    customer_id?: number | null
    only_with_remaining?: boolean
    limit?: number
  }) => invoke('sales:list', filters),
  saveSalesInvoice: (
    data: Partial<SalesInvoice> & { items: SalesItem[]; recordInTreasury?: boolean }
  ) => invoke('sales:save', data),
  collectSalesInstallment: (payload: {
    invoice_id: number
    amount: number
    payment_method: string
    notes?: string
  }) => invoke('sales:collectInstallment', payload),
  deleteSalesInvoice: (id: number) => invoke('sales:delete', id),

  listInvoiceReturns: (returnType?: 'sales_return' | 'purchase_return') =>
    invoke('returns:list', returnType),
  createSalesReturn: (payload: {
    invoice_id: number
    payment_method: string
    reason?: string
    items: Array<{
      invoice_item_id: number
      quantity: number
      return_condition?: 'in_stock' | 'defective'
    }>
  }) => invoke('returns:sales:create', payload),
  createPurchaseReturn: (payload: {
    invoice_id: number
    payment_method: string
    reason?: string
    items: Array<{
      invoice_item_id: number
      quantity: number
      serials?: string[]
    }>
  }) => invoke('returns:purchases:create', payload),
  listProductExchanges: () => invoke('exchanges:list'),
  processProductExchange: (payload: {
    exchange_type: ExchangeType
    original_invoice_id?: number | null
    original_sale_item_id?: number | null
    customer_id?: number | null
    customer_name: string
    customer_phone?: string
    returned_product_id: number
    returned_serial_no?: string
    returned_condition?: 'in_stock' | 'used' | 'defective'
    returned_value: number
    new_product_id: number
    new_variant_id?: number | null
    new_serial_id?: number | null
    new_serial_no?: string
    new_ear_side?: string
    new_value: number
    paid_difference: number
    payment_method: string
    create_external_repair_ticket?: boolean
    external_vendor?: string
    notes?: string
  }) => invoke('exchanges:process', payload),

  lookupSerialOrInvoiceForTicket: (query: string) =>
    invoke('tickets:lookupSerialOrInvoice', query),
  returnTicketLoaner: (ticketId: number) => invoke('tickets:returnLoaner', ticketId),

  // Phase 4: Patient Medical Profile, Hearing Tests, Followups, Earmolds, Implants & Attachments
  getPatientProfileBundle: (patientId: number) => invoke('patients:profile', patientId),
  listHearingTests: (filters?: { patient_id?: number; search?: string }) =>
    invoke('hearingTests:list', filters),
  saveHearingTest: (data: Partial<HearingTest> & { points?: AudiogramPoint[] }) =>
    invoke('hearingTests:save', data),
  deleteHearingTest: (id: number) => invoke('hearingTests:delete', id),
  getLatestHearingTestSummary: (patientId: number) =>
    invoke('hearingTests:latestSummary', patientId),

  listFollowups: (filters?: {
    patient_id?: number
    status?: string
    filter_mode?: 'all' | 'today' | 'overdue' | 'upcoming' | 'completed'
    type?: string
    search?: string
  }) => invoke('followups:list', filters),
  saveFollowup: (data: Partial<FollowupItem>) => invoke('followups:save', data),
  completeFollowup: (payload: {
    id: number
    notes?: string
    fitting_settings?: FittingSettings
    schedule_next_date?: string | null
    next_type?: FollowupItem['type']
  }) => invoke('followups:complete', payload),
  deleteFollowup: (id: number) => invoke('followups:delete', id),

  listEarmoldOrders: (filters?: {
    patient_id?: number
    status?: string
    overdue_only?: boolean
    search?: string
  }) => invoke('earmolds:list', filters),
  saveEarmoldOrder: (
    data: Partial<EarmoldOrder> & {
      recordLabCostInTreasury?: boolean
      payment_method?: string
      createSalesInvoiceForMold?: boolean
    }
  ) => invoke('earmolds:save', data),
  updateEarmoldOrderStatus: (payload: {
    id: number
    status: EarmoldStatus
    date?: string
    lab_cost?: number
    recordLabCostInTreasury?: boolean
    payment_method?: string
    notes?: string
  }) => invoke('earmolds:updateStatus', payload),
  remakeEarmoldOrder: (payload: {
    id: number
    reason?: string
    lab_name?: string
    expected_date?: string | null
    free_remake?: boolean
  }) => invoke('earmolds:remake', payload),
  deleteEarmoldOrder: (id: number) => invoke('earmolds:delete', id),

  listImplants: (filters?: { patient_id?: number; search?: string }) =>
    invoke('implants:list', filters),
  saveImplant: (data: Partial<CochlearImplant>) => invoke('implants:save', data),
  deleteImplant: (id: number) => invoke('implants:delete', id),
  saveImplantSession: (data: Partial<ImplantSession>) => invoke('implants:sessions:save', data),
  deleteImplantSession: (id: number) => invoke('implants:sessions:delete', id),

  listPatientAttachments: (payload: {
    patientId: number
    entityType?: string
    entityId?: number
  }) => invoke('attachments:list', payload),
  uploadPatientAttachment: (payload: {
    patient_id: number
    entity_type?: PatientAttachment['entity_type']
    entity_id?: number | null
    title: string
    category?: AttachmentCategory
    file_name: string
    mime_type?: string
    data_base64: string
    notes?: string
  }) => invoke('attachments:upload', payload),
  openPatientAttachment: (payload: { id: number; openExternal?: boolean }) =>
    invoke('attachments:open', payload),
  deletePatientAttachment: (id: number) => invoke('attachments:delete', id),

  // Maintenance Tickets
  listTickets: (filters?: {
    search?: string
    status?: string
    service_type?: string
    technician_id?: number | null
    limit?: number
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
  getTreasuryBalances: () => invoke('treasury:balances'),
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
  startUpdateDownload: (downloadUrl: string, targetVersion?: string) =>
    invoke('update:startDownload', downloadUrl, targetVersion),
  pauseUpdateDownload: () => invoke('update:pauseDownload'),
  cancelUpdateDownload: () => invoke('update:cancelDownload'),
  applyDownloadedUpdate: () => invoke('update:applyDownloaded'),
  getUpdateDownloadStatus: () => invoke('update:getDownloadStatus'),
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
  setBrowserConfig: (enabled: boolean) => invoke('system:setBrowserConfig', enabled),
  setLanConfig: (payload: { enabled: boolean; port?: number }) =>
    invoke('system:setLanConfig', payload),
  setAutoStartWindows: (enabled: boolean) => invoke('system:setAutoStart', enabled),

  // Business Profiles & Dynamic Lookups & Backup Ticket
  createBackupTicket: () => invoke('backup:createTicket'),
  getBusinessPublic: () => invoke('business:getPublic'),
  getBusiness: () => invoke('business:get'),
  setInitialBusiness: (type: BusinessType) => invoke('business:setInitial', type),
  checkBusinessSwitch: () => invoke('business:checkSwitch'),
  switchBusiness: (payload: { type: BusinessType; password?: string }) =>
    invoke('business:switch', payload),
  listLookups: (category?: string) => invoke('lookups:list', category),
  saveLookup: (data: Partial<LookupItem>) => invoke('lookups:save', data),
  deleteLookup: (id: number) => invoke('lookups:delete', id),
  reorderLookups: (items: Array<{ id: number; sort_order: number }>) =>
    invoke('lookups:reorder', items),
  listCustomFields: (entity?: CustomFieldEntity) => invoke('customFields:list', entity),
  saveCustomField: (data: Partial<CustomFieldDef>) => invoke('customFields:save', data),
  deleteCustomField: (id: number) => invoke('customFields:delete', id),
  reorderCustomFields: (items: Array<{ id: number; sort_order: number }>) =>
    invoke('customFields:reorder', items),

  // Database Reset & Demo Data Management
  resetDatabase: () => invoke('db:reset'),
  seedDemoData: (targetType?: BusinessType) => invoke('demo:seed', targetType),
  removeDemoData: () => invoke('demo:remove'),
  getDemoDataStatus: () => invoke('demo:status'),
  setHideDemoData: (hidden: boolean) => invoke('demo:setHidden', hidden)
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
