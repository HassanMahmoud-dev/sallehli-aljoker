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
  TreasuryBalances,
  CenterSettings,
  DashboardStats,
  FinancialReportData,
  UpdateCheckResult,
  UpdateProgressPayload,
  UpdateDownloadStatus,
  SystemControlStatus,
  BusinessType,
  BusinessState,
  LookupItem,
  CustomFieldEntity,
  CustomFieldDef,
  Product,
  ProductVariant,
  ProductSerial,
  SerialStatus,
  SerialCondition,
  Supplier,
  SupplierStatement,
  PurchaseInvoice,
  PurchaseItem,
  SalesInvoice,
  SalesItem,
  InvoiceReturn,
  ExchangeType,
  ProductExchange,
  AudiogramPoint,
  HearingTest,
  FollowupItem,
  FittingSettings,
  EarmoldOrder,
  EarmoldStatus,
  CochlearImplant,
  ImplantSession,
  AttachmentCategory,
  PatientAttachment,
  PatientProfileBundle,
  DemoDataStatus
} from '../shared/types'

export interface IElectronAPI {
  setSessionToken?: (token: string) => void
  logout?: () => Promise<void>
  login: (payload: LoginPayload) => Promise<AuthResponse>
  verifySession: (identifier: string | number) => Promise<AuthResponse>
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

  listProducts: (filters?: {
    search?: string
    type?: string
    activeOnly?: boolean
  }) => Promise<Product[]>
  getProductByBarcode: (barcode: string) => Promise<{
    product: Product
    variant?: ProductVariant
    serial?: ProductSerial
  } | null>
  saveProduct: (
    data: Partial<Product> & {
      variants?: Partial<ProductVariant>[]
      initial_serials?: string[]
    }
  ) => Promise<Product>
  deleteProduct: (id: number) => Promise<void>
  listProductSerials: (filters?: {
    product_id?: number
    status?: string
    search?: string
  }) => Promise<ProductSerial[]>
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
  }) => Promise<ProductSerial[]>
  updateProductSerialStatus: (payload: {
    id: number
    status: SerialStatus
    condition?: SerialCondition
    ear_side?: string
    company_warranty_end?: string | null
    notes?: string
  }) => Promise<ProductSerial>
  deleteProductSerial: (id: number) => Promise<void>
  adjustProductStock: (payload: {
    product_id: number
    variant_id?: number | null
    unit: 'piece' | 'pack'
    quantity: number
    movement_type: 'in' | 'damaged'
    notes?: string
    recordInTreasury?: boolean
    payment_method?: string
  }) => Promise<Product>
  listSuppliers: (search?: string) => Promise<Supplier[]>
  saveSupplier: (data: Partial<Supplier>) => Promise<Supplier>
  deleteSupplier: (id: number) => Promise<void>
  getSupplierStatement: (supplierId: number) => Promise<SupplierStatement>
  paySupplier: (payload: {
    supplier_id: number
    amount: number
    payment_method: string
    notes?: string
    recordInTreasury?: boolean
    purchase_invoice_id?: number | null
  }) => Promise<Supplier>

  listPurchaseInvoices: (filters?: {
    search?: string
    purchase_type?: string
    supplier_id?: number | null
  }) => Promise<PurchaseInvoice[]>
  savePurchaseInvoice: (
    data: Partial<PurchaseInvoice> & { items: PurchaseItem[]; recordInTreasury?: boolean }
  ) => Promise<PurchaseInvoice>
  deletePurchaseInvoice: (id: number) => Promise<void>

  listSalesInvoices: (filters?: {
    search?: string
    invoice_type?: string
    customer_id?: number | null
    only_with_remaining?: boolean
    limit?: number
  }) => Promise<SalesInvoice[]>
  saveSalesInvoice: (
    data: Partial<SalesInvoice> & { items: SalesItem[]; recordInTreasury?: boolean }
  ) => Promise<SalesInvoice>
  collectSalesInstallment: (payload: {
    invoice_id: number
    amount: number
    payment_method: string
    notes?: string
  }) => Promise<SalesInvoice>
  deleteSalesInvoice: (id: number) => Promise<void>

  listInvoiceReturns: (returnType?: 'sales_return' | 'purchase_return') => Promise<InvoiceReturn[]>
  createSalesReturn: (payload: {
    invoice_id: number
    payment_method: string
    reason?: string
    items: Array<{
      invoice_item_id: number
      quantity: number
      return_condition?: 'in_stock' | 'defective'
    }>
  }) => Promise<InvoiceReturn>
  createPurchaseReturn: (payload: {
    invoice_id: number
    payment_method: string
    reason?: string
    items: Array<{
      invoice_item_id: number
      quantity: number
      serials?: string[]
    }>
  }) => Promise<InvoiceReturn>
  listProductExchanges: () => Promise<ProductExchange[]>
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
  }) => Promise<ProductExchange>

  lookupSerialOrInvoiceForTicket: (query: string) => Promise<{
    found: boolean
    serial?: ProductSerial
    product?: Product
    invoice?: SalesInvoice
    customer?: Customer | null
    isUnderWarranty: boolean
    warrantyEndDate?: string | null
    earSide?: string
  }>
  returnTicketLoaner: (ticketId: number) => Promise<MaintenanceTicket>

  // Phase 4: Patient Medical Profile, Hearing Tests, Followups, Earmolds, Implants & Attachments
  getPatientProfileBundle: (patientId: number) => Promise<PatientProfileBundle>
  listHearingTests: (filters?: {
    patient_id?: number
    search?: string
  }) => Promise<HearingTest[]>
  saveHearingTest: (
    data: Partial<HearingTest> & { points?: AudiogramPoint[] }
  ) => Promise<HearingTest>
  deleteHearingTest: (id: number) => Promise<void>
  getLatestHearingTestSummary: (patientId: number) => Promise<{
    latestTest: HearingTest | null
    allTests: HearingTest[]
    testsCount: number
    implantsCount: number
    latestFollowup: FollowupItem | null
    allergies: string
    medicalComplaint: string
  }>

  listFollowups: (filters?: {
    patient_id?: number
    status?: string
    filter_mode?: 'all' | 'today' | 'overdue' | 'upcoming' | 'completed'
    type?: string
    search?: string
  }) => Promise<FollowupItem[]>
  saveFollowup: (data: Partial<FollowupItem>) => Promise<FollowupItem>
  completeFollowup: (payload: {
    id: number
    notes?: string
    fitting_settings?: FittingSettings
    schedule_next_date?: string | null
    next_type?: FollowupItem['type']
  }) => Promise<FollowupItem>
  deleteFollowup: (id: number) => Promise<void>

  listEarmoldOrders: (filters?: {
    patient_id?: number
    status?: string
    overdue_only?: boolean
    search?: string
  }) => Promise<EarmoldOrder[]>
  saveEarmoldOrder: (
    data: Partial<EarmoldOrder> & {
      recordLabCostInTreasury?: boolean
      payment_method?: string
      createSalesInvoiceForMold?: boolean
    }
  ) => Promise<EarmoldOrder>
  updateEarmoldOrderStatus: (payload: {
    id: number
    status: EarmoldStatus
    date?: string
    lab_cost?: number
    recordLabCostInTreasury?: boolean
    payment_method?: string
    notes?: string
  }) => Promise<EarmoldOrder>
  remakeEarmoldOrder: (payload: {
    id: number
    reason?: string
    lab_name?: string
    expected_date?: string | null
    free_remake?: boolean
  }) => Promise<EarmoldOrder>
  deleteEarmoldOrder: (id: number) => Promise<void>

  listImplants: (filters?: { patient_id?: number; search?: string }) => Promise<CochlearImplant[]>
  saveImplant: (data: Partial<CochlearImplant>) => Promise<CochlearImplant>
  deleteImplant: (id: number) => Promise<void>
  saveImplantSession: (data: Partial<ImplantSession>) => Promise<ImplantSession>
  deleteImplantSession: (id: number) => Promise<void>

  listPatientAttachments: (payload: {
    patientId: number
    entityType?: string
    entityId?: number
  }) => Promise<PatientAttachment[]>
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
  }) => Promise<PatientAttachment>
  openPatientAttachment: (payload: {
    id: number
    openExternal?: boolean
  }) => Promise<{
    attachment: PatientAttachment
    dataUrl?: string
    openedExternal?: boolean
  }>
  deletePatientAttachment: (id: number) => Promise<void>

  listTickets: (filters?: {
    search?: string
    status?: string
    service_type?: string
    technician_id?: number | null
    limit?: number
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
  getTreasuryBalances: () => Promise<TreasuryBalances>
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
  startUpdateDownload: (
    downloadUrl: string,
    targetVersion?: string
  ) => Promise<{ success: boolean; message: string }>
  pauseUpdateDownload: () => Promise<{ success: boolean; message: string }>
  cancelUpdateDownload: () => Promise<{ success: boolean; message: string }>
  applyDownloadedUpdate: () => Promise<{ success: boolean; message: string; backupPath?: string }>
  getUpdateDownloadStatus: () => Promise<UpdateDownloadStatus>
  downloadAndInstallUpdate: (
    downloadUrl: string
  ) => Promise<{ success: boolean; canceled?: boolean; message?: string; backupPath?: string }>
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
  setBrowserConfig: (enabled: boolean) => Promise<SystemControlStatus>
  setLanConfig: (payload: { enabled: boolean; port?: number }) => Promise<SystemControlStatus>
  setAutoStartWindows: (enabled: boolean) => Promise<SystemControlStatus>
  setBackgroundConfig: (enabled: boolean) => Promise<SystemControlStatus>

  // Business Profiles & Dynamic Lookups & Backup Ticket
  createBackupTicket: () => Promise<string | null>
  getBusinessPublic: () => Promise<BusinessState>
  getBusiness: () => Promise<BusinessState>
  setInitialBusiness: (type: BusinessType) => Promise<BusinessState>
  checkBusinessSwitch: () => Promise<{ empty: boolean; counts: Record<string, number>; total: number }>
  switchBusiness: (payload: { type: BusinessType; password?: string }) => Promise<BusinessState>
  listLookups: (category?: string) => Promise<LookupItem[]>
  saveLookup: (data: Partial<LookupItem>) => Promise<LookupItem>
  deleteLookup: (id: number) => Promise<void>
  reorderLookups: (items: Array<{ id: number; sort_order: number }>) => Promise<void>
  listCustomFields: (entity?: CustomFieldEntity) => Promise<CustomFieldDef[]>
  saveCustomField: (data: Partial<CustomFieldDef>) => Promise<CustomFieldDef>
  deleteCustomField: (id: number) => Promise<void>
  reorderCustomFields: (items: Array<{ id: number; sort_order: number }>) => Promise<void>

  // Database Reset & Demo Data Management
  resetDatabase: () => Promise<{ success: boolean; message: string; backupPath?: string }>
  seedDemoData: (targetType?: BusinessType) => Promise<{ success: boolean; message: string; counts: Record<string, number> }>
  removeDemoData: () => Promise<{ success: boolean; deletedCount: number; message: string }>
  getDemoDataStatus: () => Promise<DemoDataStatus>
  setHideDemoData: (hidden: boolean) => Promise<boolean>
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
