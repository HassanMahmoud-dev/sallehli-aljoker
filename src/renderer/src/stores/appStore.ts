import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, CenterSettings, MaintenanceTicket } from '@shared/types'

export const useAppStore = defineStore('app', () => {
  const currentUser = ref<User | null>(null)
  const subscriptionDaysRemaining = ref<number | null>(null)
  const isDark = ref<boolean>(localStorage.getItem('sallehli_theme') === 'dark')
  const appVersion = ref<string>('v1.0.0')

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
    update_url: 'HassanMahmoud-dev/sallehli-aljoker'
  })

  // Print Modal State
  const printModalOpen = ref(false)
  const ticketToPrint = ref<MaintenanceTicket | null>(null)
  const activePrintFormat = ref<'a4' | 'thermal80'>('a4')
  const activePrintDocType = ref<'invoice_warranty' | 'reception_receipt'>('invoice_warranty')

  // Update Modal State
  const updateModalOpen = ref(false)

  const isAuthenticated = computed(() => !!currentUser.value)
  const isSuperAdmin = computed(() => currentUser.value?.role === 'super_admin')
  const isOwner = computed(() => currentUser.value?.role === 'owner')
  const isTenant = computed(() => currentUser.value?.role === 'tenant')

  function applyTheme(): void {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('sallehli_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('sallehli_theme', 'light')
    }
  }

  function toggleTheme(): void {
    isDark.value = !isDark.value
    applyTheme()
  }

  async function loadSettings(): Promise<void> {
    try {
      const data = await window.api.getSettings()
      settings.value = data
      activePrintFormat.value = data.default_print_format || 'a4'
      if (window.api.getAppVersion) {
        const ver = await window.api.getAppVersion()
        if (ver) appVersion.value = ver.startsWith('v') ? ver : `v${ver}`
      }
    } catch (e) {
      console.error('Failed to load settings', e)
    }
  }

  function setSession(user: User, daysRemaining: number | null): void {
    currentUser.value = user
    subscriptionDaysRemaining.value = daysRemaining
  }

  function logout(): void {
    currentUser.value = null
    subscriptionDaysRemaining.value = null
  }

  function openPrintModal(
    ticket: MaintenanceTicket,
    docType: 'invoice_warranty' | 'reception_receipt' = 'invoice_warranty',
    format?: 'a4' | 'thermal80'
  ): void {
    ticketToPrint.value = ticket
    activePrintDocType.value = docType
    activePrintFormat.value = format || settings.value.default_print_format || 'a4'
    printModalOpen.value = true
  }

  function closePrintModal(): void {
    printModalOpen.value = false
    ticketToPrint.value = null
  }

  function openUpdateModal(): void {
    updateModalOpen.value = true
  }

  function closeUpdateModal(): void {
    updateModalOpen.value = false
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

    const message =
      `مرحباً بك أ/ ${ticket.customer_name} من *${settings.value.center_name}* 🔧\n` +
      `📋 رقم طلب الصيانة: *${ticket.ticket_number}*\n` +
      `🔌 الجهاز: ${ticket.appliance_type} (${ticket.brand})\n` +
      `📌 الإجمالي: ${ticket.total_amount} ج.م | المدفوع: ${ticket.paid_amount} ج.م | المتبقي: ${ticket.remaining_amount} ج.م` +
      warrantyLine +
      `\n📞 للاستفسار: ${settings.value.phone1}`

    const url = `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`
    window.api.openExternal(url)
  }

  return {
    currentUser,
    subscriptionDaysRemaining,
    isDark,
    appVersion,
    settings,
    printModalOpen,
    ticketToPrint,
    activePrintFormat,
    activePrintDocType,
    updateModalOpen,
    isAuthenticated,
    isSuperAdmin,
    isOwner,
    isTenant,
    applyTheme,
    toggleTheme,
    loadSettings,
    setSession,
    logout,
    openPrintModal,
    closePrintModal,
    openUpdateModal,
    closeUpdateModal,
    sendWhatsAppToCustomer
  }
})
