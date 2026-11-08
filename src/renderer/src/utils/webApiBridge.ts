import type { IElectronAPI } from '../../../preload/index.d'

let currentSessionToken = ''

async function invokeHttp(channel: string, ...args: unknown[]): Promise<any> {
  const tokenArg = { _token: currentSessionToken }
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, token: currentSessionToken, args: [tokenArg, ...args] })
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
    setSessionToken: (token: string) => {
      currentSessionToken = token
    },
    logout: () => invokeHttp('auth:logout'),
    login: (payload) => invokeHttp('auth:login', payload),
    verifySession: (identifier) => invokeHttp('auth:verifySession', identifier),
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

    listProducts: (filters) => invokeHttp('products:list', filters),
    getProductByBarcode: (barcode) => invokeHttp('products:getByBarcode', barcode),
    saveProduct: (data) => invokeHttp('products:save', data),
    deleteProduct: (id) => invokeHttp('products:delete', id),
    listProductSerials: (filters) => invokeHttp('products:serials:list', filters),
    addProductSerials: (payload) => invokeHttp('products:serials:add', payload),
    updateProductSerialStatus: (payload) => invokeHttp('products:serials:updateStatus', payload),
    deleteProductSerial: (id) => invokeHttp('products:serials:delete', id),
    adjustProductStock: (payload) => invokeHttp('products:adjustStock', payload),
    listSuppliers: (search) => invokeHttp('suppliers:list', search),
    saveSupplier: (data) => invokeHttp('suppliers:save', data),
    deleteSupplier: (id) => invokeHttp('suppliers:delete', id),
    getSupplierStatement: (supplierId) => invokeHttp('suppliers:statement', supplierId),
    paySupplier: (payload) => invokeHttp('suppliers:pay', payload),

    listPurchaseInvoices: (filters) => invokeHttp('purchases:list', filters),
    savePurchaseInvoice: (data) => invokeHttp('purchases:save', data),
    deletePurchaseInvoice: (id) => invokeHttp('purchases:delete', id),

    listSalesInvoices: (filters) => invokeHttp('sales:list', filters),
    saveSalesInvoice: (data) => invokeHttp('sales:save', data),
    collectSalesInstallment: (payload) => invokeHttp('sales:collectInstallment', payload),
    deleteSalesInvoice: (id) => invokeHttp('sales:delete', id),

    listInvoiceReturns: (returnType) => invokeHttp('returns:list', returnType),
    createSalesReturn: (payload) => invokeHttp('returns:sales:create', payload),
    createPurchaseReturn: (payload) => invokeHttp('returns:purchases:create', payload),
    listProductExchanges: () => invokeHttp('exchanges:list'),
    processProductExchange: (payload) => invokeHttp('exchanges:process', payload),

    lookupSerialOrInvoiceForTicket: (query) => invokeHttp('tickets:lookupSerialOrInvoice', query),
    returnTicketLoaner: (ticketId) => invokeHttp('tickets:returnLoaner', ticketId),

    getPatientProfileBundle: (patientId) => invokeHttp('patients:profile', patientId),
    listHearingTests: (filters) => invokeHttp('hearingTests:list', filters),
    saveHearingTest: (data) => invokeHttp('hearingTests:save', data),
    deleteHearingTest: (id) => invokeHttp('hearingTests:delete', id),
    getLatestHearingTestSummary: (patientId) => invokeHttp('hearingTests:latestSummary', patientId),

    listFollowups: (filters) => invokeHttp('followups:list', filters),
    saveFollowup: (data) => invokeHttp('followups:save', data),
    completeFollowup: (payload) => invokeHttp('followups:complete', payload),
    deleteFollowup: (id) => invokeHttp('followups:delete', id),

    listEarmoldOrders: (filters) => invokeHttp('earmolds:list', filters),
    saveEarmoldOrder: (data) => invokeHttp('earmolds:save', data),
    updateEarmoldOrderStatus: (payload) => invokeHttp('earmolds:updateStatus', payload),
    remakeEarmoldOrder: (payload) => invokeHttp('earmolds:remake', payload),
    deleteEarmoldOrder: (id) => invokeHttp('earmolds:delete', id),

    listImplants: (filters) => invokeHttp('implants:list', filters),
    saveImplant: (data) => invokeHttp('implants:save', data),
    deleteImplant: (id) => invokeHttp('implants:delete', id),
    saveImplantSession: (data) => invokeHttp('implants:sessions:save', data),
    deleteImplantSession: (id) => invokeHttp('implants:sessions:delete', id),

    listPatientAttachments: (payload) => invokeHttp('attachments:list', payload),
    uploadPatientAttachment: (payload) => invokeHttp('attachments:upload', payload),
    openPatientAttachment: (payload) => invokeHttp('attachments:open', payload),
    deletePatientAttachment: (id) => invokeHttp('attachments:delete', id),

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
      try {
        const ticket = await invokeHttp('backup:createTicket')
        window.open(`/api/backup/download?ticket=${encodeURIComponent(ticket || '')}`, '_blank')
        return { success: true, filePath: 'تم بدء تحميل النسخة الاحتياطية في المتصفح' }
      } catch (e: any) {
        throw new Error(e?.message || 'فشل طلب تصريح تحميل النسخة الاحتياطية')
      }
    },
    createBackupTicket: () => invokeHttp('backup:createTicket'),
    restoreBackup: () => invokeHttp('backup:restore'),
    chooseBackupDir: () => invokeHttp('backup:chooseDir'),
    runAutoBackupNow: () => invokeHttp('backup:autoNow'),
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },

    checkForUpdates: (customUrl) => invokeHttp('update:check', customUrl),
    startUpdateDownload: (downloadUrl, targetVersion) =>
      invokeHttp('update:startDownload', downloadUrl, targetVersion),
    pauseUpdateDownload: () => invokeHttp('update:pauseDownload'),
    cancelUpdateDownload: () => invokeHttp('update:cancelDownload'),
    applyDownloadedUpdate: () => invokeHttp('update:applyDownloaded'),
    getUpdateDownloadStatus: () => invokeHttp('update:getDownloadStatus'),
    downloadAndInstallUpdate: (downloadUrl) =>
      invokeHttp('update:downloadAndInstall', downloadUrl),
    installLocalUpdate: () => invokeHttp('update:installLocal'),
    getAutoUpdateResult: () => invokeHttp('update:getAutoResult'),
    onUpdateProgress: () => () => {},
    onUpdateAvailable: () => () => {},

    getSystemStatus: () => invokeHttp('system:status'),
    setBrowserConfig: (enabled) => invokeHttp('system:setBrowserConfig', enabled),
    setLanConfig: (payload) => invokeHttp('system:setLanConfig', payload),
    setAutoStartWindows: (enabled) => invokeHttp('system:setAutoStart', enabled),

    // Business Profiles & Dynamic Lookups
    getBusinessPublic: () => invokeHttp('business:getPublic'),
    getBusiness: () => invokeHttp('business:get'),
    setInitialBusiness: (type) => invokeHttp('business:setInitial', type),
    checkBusinessSwitch: () => invokeHttp('business:checkSwitch'),
    switchBusiness: (payload) => invokeHttp('business:switch', payload),
    setLicensedModules: (modules) => invokeHttp('business:setLicensedModules', modules),
  applyVendorLicense: (token) => invokeHttp('business:applyVendorLicense', token),
  getMachineId: () => invokeHttp('business:getMachineId'),
    listLookups: (category) => invokeHttp('lookups:list', category),
    saveLookup: (data) => invokeHttp('lookups:save', data),
    deleteLookup: (id) => invokeHttp('lookups:delete', id),
    reorderLookups: (items) => invokeHttp('lookups:reorder', items),
    listCustomFields: (entity) => invokeHttp('customFields:list', entity),
    saveCustomField: (data) => invokeHttp('customFields:save', data),
    deleteCustomField: (id) => invokeHttp('customFields:delete', id),
    reorderCustomFields: (items) => invokeHttp('customFields:reorder', items),

    // Database Reset & Demo Data Management
    resetDatabase: () => invokeHttp('db:reset'),
    seedDemoData: (targetType) => invokeHttp('demo:seed', targetType),
    removeDemoData: () => invokeHttp('demo:remove'),
    getDemoDataStatus: () => invokeHttp('demo:status'),
    setHideDemoData: (hidden) => invokeHttp('demo:setHidden', hidden)
  }

  window.api = webApi
}
