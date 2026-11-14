import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  User,
  CenterSettings,
  MaintenanceTicket,
  SalesInvoice,
  HearingTest,
  EarmoldOrder,
  UpdateCheckResult,
  UpdateProgressPayload,
  SystemControlStatus,
  BusinessType,
  BusinessState,
  LookupItem,
  CustomFieldEntity,
  CustomFieldDef
} from '@shared/types'
import { getBusinessProfile, type BusinessProfile } from '@shared/businessProfiles'

const REMEMBERED_SESSION_KEY = 'sallehli_remembered_session'

function loadInitialRememberedSession(): {
  user: User | null
  token: string | null
} {
  try {
    const raw = localStorage.getItem(REMEMBERED_SESSION_KEY)
    if (!raw) return { user: null, token: null }
    const parsed = JSON.parse(raw)
    if (parsed && parsed.user && parsed.user.id && parsed.user.username) {
      if (parsed.token && window.api?.setSessionToken) {
        window.api.setSessionToken(parsed.token)
      }
      return {
        user: parsed.user as User,
        token: parsed.token || null
      }
    }
  } catch {
    // Ignore corrupted storage
  }
  return { user: null, token: null }
}

export type ThemeMode = 'light' | 'dark' | 'system'

export const useAppStore = defineStore('app', () => {
  const initialSession = loadInitialRememberedSession()
  const currentUser = ref<User | null>(initialSession.user)
  const sessionToken = ref<string | null>(initialSession.token)
  const usingDefaultAdminPassword = ref<boolean>(false)
  const defaultPasswordBannerDismissed = ref<boolean>(false)

  // 3-Mode Theme (Light / Dark / System)
  const savedThemeMode = (localStorage.getItem('sallehli_theme_mode') as ThemeMode) ||
    (localStorage.getItem('sallehli_theme') === 'dark' ? 'dark' : 'system')
  const themeMode = ref<ThemeMode>(savedThemeMode)
  const isDark = ref<boolean>(false)

  const appVersion = ref<string>('v1.0')

  // Background Update Downloader State
  const updateDownloadState = ref<{
    isDownloading: boolean
    isPaused: boolean
    isReadyToInstall: boolean
    progress: UpdateProgressPayload | null
    version?: string
    notifiedCompletion?: boolean
  }>({
    isDownloading: false,
    isPaused: false,
    isReadyToInstall: false,
    progress: null,
    version: '',
    notifiedCompletion: false
  })

  // Business Profile & System State
  const businessState = ref<BusinessState>({
    type: 'appliances',
    locked: false,
    needsSetup: false,
    appName: 'صلحلي'
  })

  const businessType = computed<BusinessType>(() => businessState.value.type)
  const isHearingAidsProfile = computed(() => businessState.value.type === 'hearing_aids')
  const isBusinessLocked = computed(() => businessState.value.locked)
  const needsBusinessSetup = computed(() => businessState.value.needsSetup)
  const businessProfile = computed<BusinessProfile>(() => {
    const base = getBusinessProfile(businessType.value)
    if (businessState.value.effectiveModules && businessState.value.effectiveModules.length > 0) {
      return {
        ...base,
        modules: businessState.value.effectiveModules
      }
    }
    return base
  })
  const appName = computed<string>(() => businessProfile.value.appName)

  // Cached Dynamic Lookups (Types, Brands, Part Categories & Extra Lookups)
  const lookups = ref<LookupItem[]>([])
  const filterByCategory = (category: string): string[] =>
    lookups.value
      .filter((l) => l.category === category && l.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => l.value)

  const deviceTypes = computed(() => filterByCategory('device_type'))
  const brands = computed(() => filterByCategory('brand'))
  const partCategories = computed(() => {
    const items = filterByCategory('part_category')
    return items.length > 0 ? items : businessProfile.value.defaultPartCategories
  })
  const batterySizes = computed(() => filterByCategory('battery_size'))
  const accessoryTypes = computed(() => filterByCategory('accessory_type'))
  const earmoldTypes = computed(() => filterByCategory('earmold_type'))
  const earmoldMaterials = computed(() => filterByCategory('earmold_material'))
  const implantParts = computed(() => filterByCategory('implant_part'))

  // Cached Dynamic Custom Field Definitions
  const customFieldDefs = ref<CustomFieldDef[]>([])

  function getActiveCustomFields(entity: CustomFieldEntity): CustomFieldDef[] {
    return customFieldDefs.value
      .filter((f) => f.entity === entity && f.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  }

  function getTableCustomFields(entity: CustomFieldEntity): CustomFieldDef[] {
    return customFieldDefs.value
      .filter((f) => f.entity === entity && f.is_active && f.show_in_table)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  }

  function validateCustomFields(
    entity: CustomFieldEntity,
    extraData?: Record<string, any>
  ): { valid: boolean; missingLabel?: string } {
    const active = getActiveCustomFields(entity)
    const data = extraData || {}
    for (const field of active) {
      if (field.required) {
        const val = data[field.key]
        if (val === undefined || val === null || String(val).trim() === '') {
          return { valid: false, missingLabel: field.label }
        }
      }
    }
    return { valid: true }
  }

  function formatExtraDataEntries(
    extraData?: Record<string, any>,
    entities?: CustomFieldEntity[]
  ): Array<{ key: string; label: string; value: string; showInTable: boolean }> {
    if (!extraData || typeof extraData !== 'object') return []
    const allowedEntities = entities ? new Set(entities) : null
    const defs = customFieldDefs.value
      .filter((f) => f.is_active && (!allowedEntities || allowedEntities.has(f.entity)))
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

    const result: Array<{ key: string; label: string; value: string; showInTable: boolean }> = []
    const seenKeys = new Set<string>()

    for (const def of defs) {
      if (seenKeys.has(def.key)) continue
      const rawVal = extraData[def.key]
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue
      seenKeys.add(def.key)
      let displayVal = String(rawVal)
      if (def.type === 'boolean') {
        displayVal = rawVal === true || rawVal === 1 || rawVal === '1' || rawVal === 'true' ? 'نعم' : 'لا'
      }
      result.push({
        key: def.key,
        label: def.label,
        value: displayVal,
        showInTable: Boolean(def.show_in_table)
      })
    }
    return result
  }

  // Global Action Loading State (Save / Edit / Delete / Login)
  const actionLoading = ref<boolean>(false)
  const actionLoadingText = ref<string>('جاري تنفيذ العملية...')

  function startLoading(text = 'جاري تنفيذ العملية...'): void {
    actionLoadingText.value = text
    actionLoading.value = true
  }

  function stopLoading(): void {
    actionLoading.value = false
  }

  async function withLoading<T>(fn: () => Promise<T>, text = 'جاري حفظ البيانات...'): Promise<T> {
    startLoading(text)
    const minWait = new Promise((resolve) => setTimeout(resolve, 260))
    try {
      const [res] = await Promise.all([fn(), minWait])
      return res
    } finally {
      stopLoading()
    }
  }

  const settings = ref<CenterSettings>({
    center_name: 'مركز صلحلي للصيانة المعتمدة',
    center_subtitle: 'صيانة جميع الأجهزة المنزلية والكهربائية',
    phone1: '01012345678',
    phone2: '01112345678',
    whatsapp: '201012345678',
    address: 'القاهرة - شارع التحرير الرئيسي',
    logo_base64: '',
    default_print_format: 'a4',
    default_inspection_fee: 150,
    default_warranty_months: 6,
    warranty_terms: '',
    receipt_footer: '',
    update_url: 'HassanMahmoud-dev/sallehli-aljoker',
    auto_backup_enabled: 1,
    auto_backup_dir: '',
    auto_backup_keep_count: 10,
    lan_enabled: 1,
    lan_port: 4545,
    auto_start_windows: 0
  })

  // Print Modal State
  const printModalOpen = ref(false)
  const ticketToPrint = ref<MaintenanceTicket | null>(null)
  const salesInvoiceToPrint = ref<SalesInvoice | null>(null)
  const hearingTestToPrint = ref<HearingTest | null>(null)
  const earmoldToPrint = ref<EarmoldOrder | null>(null)
  const activePrintFormat = ref<'a4' | 'thermal80'>('a4')
  const activePrintDocType = ref<
    'invoice_warranty' | 'reception_receipt' | 'sales_invoice' | 'hearing_test' | 'earmold_order'
  >('invoice_warranty')

  // Update Modal & Auto-Update State
  const updateModalOpen = ref(false)
  const availableUpdate = ref<UpdateCheckResult | null>(null)
  const updateBannerDismissed = ref(false)

  // System / LAN Status
  const systemStatus = ref<SystemControlStatus | null>(null)

  // Global Image Lightbox Preview State
  const imagePreviewOpen = ref(false)
  const imagePreviewSrc = ref('')
  const imagePreviewTitle = ref('')

  const isAuthenticated = computed(() => !!currentUser.value)
  const isSuperAdmin = computed(() => currentUser.value?.role === 'super_admin')
  const isOwner = computed(() => currentUser.value?.role === 'owner')

  // Role-Based Access Control (RBAC): only super_admin and owner are valid roles with full access
  const hasFullAccess = (): boolean =>
    ['super_admin', 'owner'].includes(currentUser.value?.role || '')
  const isFullManager = computed(hasFullAccess)
  const canManageUsers = computed(() => currentUser.value?.role === 'super_admin')
  const canViewFinancials = computed(hasFullAccess)
  const canViewInventory = computed(hasFullAccess)
  const canViewPurchasePrices = computed(hasFullAccess)
  const canDeleteRecords = computed(hasFullAccess)
  const canViewMedicalRecords = computed(hasFullAccess)

  function resolveIsDark(mode: ThemeMode): boolean {
    if (mode === 'dark') return true
    if (mode === 'light') return false
    return typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  function applyTheme(): void {
    const dark = resolveIsDark(themeMode.value)
    isDark.value = dark
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('sallehli_theme_mode', themeMode.value)
    localStorage.setItem('sallehli_theme', dark ? 'dark' : 'light')
  }

  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode
    applyTheme()
  }

  function toggleTheme(): void {
    // Cycles light -> dark -> system -> light
    if (themeMode.value === 'light') {
      setThemeMode('dark')
    } else if (themeMode.value === 'dark') {
      setThemeMode('system')
    } else {
      setThemeMode('light')
    }
  }

  function cycleTheme(): void {
    toggleTheme()
  }

  // Listen to OS theme changes if system mode is active
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeMode.value === 'system') {
        applyTheme()
      }
    })
  }

  async function syncUpdateDownloadStatus(): Promise<void> {
    try {
      if (window.api?.getUpdateDownloadStatus) {
        const st = await window.api.getUpdateDownloadStatus()
        updateDownloadState.value.isDownloading = st.isDownloading
        updateDownloadState.value.isPaused = st.isPaused
        updateDownloadState.value.isReadyToInstall = st.isReadyToInstall
        if (st.progress) updateDownloadState.value.progress = st.progress
        if (st.version) updateDownloadState.value.version = st.version
      }
    } catch {
      // Ignore
    }
  }

  function setupUpdateListener(): void {
    if (window.api?.onUpdateProgress) {
      window.api.onUpdateProgress((payload) => {
        updateDownloadState.value.progress = payload
        if (payload.version) updateDownloadState.value.version = payload.version

        if (payload.status === 'downloading') {
          updateDownloadState.value.isDownloading = true
          updateDownloadState.value.isPaused = false
          updateDownloadState.value.isReadyToInstall = false
        } else if (payload.status === 'paused') {
          updateDownloadState.value.isDownloading = false
          updateDownloadState.value.isPaused = true
        } else if (payload.status === 'completed') {
          updateDownloadState.value.isDownloading = false
          updateDownloadState.value.isPaused = false
          updateDownloadState.value.isReadyToInstall = true
        } else if (payload.status === 'cancelled' || payload.status === 'error') {
          updateDownloadState.value.isDownloading = false
          updateDownloadState.value.isPaused = false
          updateDownloadState.value.isReadyToInstall = false
        }
      })
    }
  }
  setupUpdateListener()

  async function fetchVersion(): Promise<void> {
    try {
      if (window.api?.getAppVersion) {
        const ver = await window.api.getAppVersion()
        if (ver) {
          appVersion.value = ver === '1.0.0' ? 'v1.0' : (ver.startsWith('v') ? ver : `v${ver}`)
          updateDocumentTitle()
        }
      }
    } catch {
      // Ignore
    }
  }

  function updateDocumentTitle(): void {
    const p = businessProfile.value
    document.title = `${p.appName} ${appVersion.value} - ${p.windowTitle}`
  }

  async function loadBusiness(): Promise<void> {
    try {
      if (window.api?.getBusinessPublic) {
        const state = await window.api.getBusinessPublic()
        businessState.value = state
        updateDocumentTitle()
      }
    } catch (e) {
      console.error('Failed to load business state', e)
    }
  }

  async function fetchLookups(): Promise<void> {
    try {
      if (window.api?.listLookups) {
        lookups.value = await window.api.listLookups()
      }
    } catch (e) {
      console.error('Failed to fetch lookups', e)
    }
  }

  async function fetchCustomFields(): Promise<void> {
    try {
      if (window.api?.listCustomFields) {
        customFieldDefs.value = await window.api.listCustomFields()
      }
    } catch (e) {
      console.error('Failed to fetch custom fields', e)
    }
  }

  async function fetchSystemStatus(): Promise<void> {
    try {
      if (window.api?.getSystemStatus) {
        systemStatus.value = await window.api.getSystemStatus()
      }
    } catch {
      // Ignore
    }
  }

  async function loadSettings(): Promise<void> {
    try {
      const data = await window.api.getSettings()
      settings.value = data
      activePrintFormat.value = data.default_print_format || 'a4'
      await fetchVersion()
      await fetchSystemStatus()
      await loadBusiness()
      await fetchLookups()
      await fetchCustomFields()
    } catch (e) {
      console.error('Failed to load settings', e)
    }
  }

  function setSession(
    user: User,
    _daysRemaining: number | null = null,
    rememberMe = false,
    token?: string | null,
    usingDefaultPassword?: boolean
  ): void {
    currentUser.value = user
    if (typeof usingDefaultPassword === 'boolean') {
      usingDefaultAdminPassword.value = usingDefaultPassword
      if (!usingDefaultPassword) {
        defaultPasswordBannerDismissed.value = false
      }
    } else if (user.username !== 'admin' || user.role !== 'super_admin') {
      usingDefaultAdminPassword.value = false
    }
    if (token) {
      sessionToken.value = token
      window.api?.setSessionToken?.(token)
    }

    if (rememberMe) {
      localStorage.setItem(
        REMEMBERED_SESSION_KEY,
        JSON.stringify({ user, token: sessionToken.value })
      )
    } else {
      localStorage.removeItem(REMEMBERED_SESSION_KEY)
    }
  }

  async function verifyRememberedSession(): Promise<boolean> {
    const ident = sessionToken.value
    if (!ident) {
      logout()
      return false
    }
    try {
      const res = await window.api.verifySession(ident)
      if (!res.success || !res.user) {
        logout()
        return false
      }
      const isRemembered = Boolean(localStorage.getItem(REMEMBERED_SESSION_KEY))
      setSession(
        res.user,
        null,
        isRemembered,
        res.token || sessionToken.value,
        res.usingDefaultPassword
      )
      await loadSettings()
      return true
    } catch {
      return true
    }
  }

  function logout(): void {
    try {
      window.api?.logout?.()
    } catch {
      // Ignore
    }
    currentUser.value = null
    sessionToken.value = null
    usingDefaultAdminPassword.value = false
    defaultPasswordBannerDismissed.value = false
    window.api?.setSessionToken?.('')
    localStorage.removeItem(REMEMBERED_SESSION_KEY)
  }

  function clearDefaultPasswordWarning(): void {
    usingDefaultAdminPassword.value = false
    defaultPasswordBannerDismissed.value = false
  }

  function dismissDefaultPasswordBanner(): void {
    defaultPasswordBannerDismissed.value = true
  }

  function openPrintModal(
    ticket: MaintenanceTicket,
    docType: 'invoice_warranty' | 'reception_receipt' = 'invoice_warranty',
    format?: 'a4' | 'thermal80'
  ): void {
    salesInvoiceToPrint.value = null
    hearingTestToPrint.value = null
    earmoldToPrint.value = null
    ticketToPrint.value = ticket
    activePrintDocType.value = docType
    activePrintFormat.value = format || settings.value.default_print_format || 'a4'
    printModalOpen.value = true
  }

  function openSalesPrintModal(
    invoice: SalesInvoice,
    format?: 'a4' | 'thermal80'
  ): void {
    ticketToPrint.value = null
    hearingTestToPrint.value = null
    earmoldToPrint.value = null
    salesInvoiceToPrint.value = invoice
    activePrintDocType.value = 'sales_invoice'
    activePrintFormat.value = format || settings.value.default_print_format || 'a4'
    printModalOpen.value = true
  }

  function openHearingTestPrintModal(test: HearingTest): void {
    ticketToPrint.value = null
    salesInvoiceToPrint.value = null
    earmoldToPrint.value = null
    hearingTestToPrint.value = test
    activePrintDocType.value = 'hearing_test'
    activePrintFormat.value = 'a4'
    printModalOpen.value = true
  }

  function openEarmoldPrintModal(
    order: EarmoldOrder,
    format?: 'a4' | 'thermal80'
  ): void {
    ticketToPrint.value = null
    salesInvoiceToPrint.value = null
    hearingTestToPrint.value = null
    earmoldToPrint.value = order
    activePrintDocType.value = 'earmold_order'
    activePrintFormat.value = format || settings.value.default_print_format || 'a4'
    printModalOpen.value = true
  }

  function closePrintModal(): void {
    printModalOpen.value = false
    ticketToPrint.value = null
    salesInvoiceToPrint.value = null
    hearingTestToPrint.value = null
    earmoldToPrint.value = null
  }

  function openUpdateModal(): void {
    updateModalOpen.value = true
  }

  function closeUpdateModal(): void {
    updateModalOpen.value = false
  }

  function setAvailableUpdate(res: UpdateCheckResult | null): void {
    availableUpdate.value = res
    if (res?.updateAvailable) {
      updateBannerDismissed.value = false
    }
  }

  function dismissUpdateBanner(): void {
    updateBannerDismissed.value = true
  }

  function openImagePreview(src: string, title = 'معاينة الصورة'): void {
    if (!src) return
    imagePreviewSrc.value = src
    imagePreviewTitle.value = title
    imagePreviewOpen.value = true
  }

  function closeImagePreview(): void {
    imagePreviewOpen.value = false
    imagePreviewSrc.value = ''
    imagePreviewTitle.value = ''
  }

  function sendWhatsAppToCustomer(ticket: MaintenanceTicket): void {
    let rawPhone = (ticket.customer_phone || '').replace(/\D/g, '')
    if (rawPhone.startsWith('01') && rawPhone.length === 11) {
      rawPhone = '2' + rawPhone
    }
    const warrantyLine =
      ticket.warranty_months > 0 && ticket.warranty_end_date
        ? `\n🛡️ الضمان: ${ticket.warranty_months} شهور (ساري حتى ${ticket.warranty_end_date})`
        : ''

    const terms = businessProfile.value.terms
    const message =
      `مرحباً بك أ/ ${ticket.customer_name} من *${settings.value.center_name}* 🔧\n` +
      `📋 رقم ${terms.ticket}: *${ticket.ticket_number}*\n` +
      `🔌 ${terms.device}: ${ticket.appliance_type} (${ticket.brand})\n` +
      `📌 الإجمالي: ${ticket.total_amount} ج.م | المدفوع: ${ticket.paid_amount} ج.م | المتبقي: ${ticket.remaining_amount} ج.م` +
      warrantyLine +
      `\n📞 للاستفسار: ${settings.value.phone1}`

    const url = `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`
    window.api.openExternal(url)
  }

  return {
    currentUser,
    sessionToken,
    usingDefaultAdminPassword,
    defaultPasswordBannerDismissed,
    themeMode,
    isDark,
    appVersion,
    updateDownloadState,
    syncUpdateDownloadStatus,
    businessState,
    businessType,
    isHearingAidsProfile,
    isBusinessLocked,
    needsBusinessSetup,
    businessProfile,
    appName,
    lookups,
    deviceTypes,
    brands,
    partCategories,
    batterySizes,
    accessoryTypes,
    earmoldTypes,
    earmoldMaterials,
    implantParts,
    customFieldDefs,
    getActiveCustomFields,
    getTableCustomFields,
    validateCustomFields,
    formatExtraDataEntries,
    loadBusiness,
    fetchLookups,
    fetchCustomFields,
    actionLoading,
    actionLoadingText,
    settings,
    printModalOpen,
    ticketToPrint,
    salesInvoiceToPrint,
    hearingTestToPrint,
    earmoldToPrint,
    activePrintFormat,
    activePrintDocType,
    updateModalOpen,
    availableUpdate,
    updateBannerDismissed,
    systemStatus,
    imagePreviewOpen,
    imagePreviewSrc,
    imagePreviewTitle,
    isAuthenticated,
    isSuperAdmin,
    isOwner,
    isFullManager,
    canManageUsers,
    canViewFinancials,
    canViewInventory,
    canViewPurchasePrices,
    canDeleteRecords,
    canViewMedicalRecords,
    startLoading,
    stopLoading,
    withLoading,
    applyTheme,
    toggleTheme,
    cycleTheme,
    setThemeMode,
    fetchVersion,
    fetchSystemStatus,
    loadSettings,
    setSession,
    verifyRememberedSession,
    logout,
    clearDefaultPasswordWarning,
    dismissDefaultPasswordBanner,
    openPrintModal,
    openSalesPrintModal,
    openHearingTestPrintModal,
    openEarmoldPrintModal,
    closePrintModal,
    openUpdateModal,
    closeUpdateModal,
    setAvailableUpdate,
    dismissUpdateBanner,
    openImagePreview,
    closeImagePreview,
    sendWhatsAppToCustomer
  }
})
