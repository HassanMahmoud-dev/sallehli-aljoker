<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { compressImageFile } from '@renderer/utils/imageHelper'
import {
  APPLIANCE_TYPES,
  APPLIANCE_BRANDS,
  TICKET_STATUS_MAP,
  PAYMENT_METHODS
} from '@renderer/constants/appliances'
import type {
  MaintenanceTicket,
  Technician,
  SparePart,
  TicketPartItem,
  Customer,
  CustomerAppliance
} from '@shared/types'
import {
  PlusCircle,
  Search,
  Printer,
  MessageCircle,
  Edit3,
  Trash2,
  ShieldAlert,
  Wrench,
  Home,
  Building2,
  PackagePlus,
  Camera,
  ShieldCheck,
  Users,
  CheckCircle2,
  X
} from 'lucide-vue-next'

const route = useRoute()
const appStore = useAppStore()

const tickets = ref<MaintenanceTicket[]>([])
const technicians = ref<Technician[]>([])
const spareParts = ref<SparePart[]>([])
const allCustomers = ref<Customer[]>([])
const customerSearchInput = ref('')
const showCustomerSuggestions = ref(false)
const activeCustomerField = ref<'search' | 'phone' | 'name' | null>(null)

const searchQuery = ref('')
const statusFilter = ref('all')
const serviceTypeFilter = ref('all')

const modalOpen = ref(false)
const errorMsg = ref('')

// Auto customer lookup state
const existingAppliances = ref<CustomerAppliance[]>([])
const previousTickets = ref<MaintenanceTicket[]>([])
const activeWarrantyAlert = ref<{
  ticket_number: string
  appliance_type: string
  brand: string
  warranty_end_date: string
} | null>(null)

// Selected spare part for adding to ticket
const selectedPartId = ref<number | null>(null)
const selectedPartQty = ref<number>(1)

const form = ref<{
  id?: number
  ticket_number?: string
  customer_id?: number
  customer_name: string
  customer_phone: string
  customer_phone2: string
  customer_area: string
  customer_address: string
  appliance_type: string
  brand: string
  model: string
  serial_number: string
  service_type: 'home_visit' | 'workshop'
  status: MaintenanceTicket['status']
  priority: MaintenanceTicket['priority']
  complaint: string
  diagnosis: string
  technician_id: number | null
  scheduled_date: string
  inspection_fee: number
  labor_cost: number
  discount: number
  paid_amount: number
  payment_method: MaintenanceTicket['payment_method']
  warranty_months: number
  is_under_previous_warranty: number
  previous_ticket_number: string | null
  warranty_image: string
  fault_images: string[]
  notes: string
  parts: TicketPartItem[]
}>({
  customer_name: '',
  customer_phone: '',
  customer_phone2: '',
  customer_area: '',
  customer_address: '',
  appliance_type: APPLIANCE_TYPES[0],
  brand: APPLIANCE_BRANDS[0],
  model: '',
  serial_number: '',
  service_type: 'home_visit',
  status: 'new',
  priority: 'normal',
  complaint: '',
  diagnosis: '',
  technician_id: null,
  scheduled_date: new Date().toISOString().slice(0, 10),
  inspection_fee: 150,
  labor_cost: 0,
  discount: 0,
  paid_amount: 0,
  payment_method: 'cash',
  warranty_months: 6,
  is_under_previous_warranty: 0,
  previous_ticket_number: null,
  warranty_image: '',
  fault_images: [],
  notes: '',
  parts: []
})

const computedPartsTotal = computed(() =>
  form.value.parts.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unit_price), 0)
)

const computedTotalAmount = computed(() =>
  Math.max(
    0,
    Number(form.value.inspection_fee || 0) +
      Number(form.value.labor_cost || 0) +
      computedPartsTotal.value -
      Number(form.value.discount || 0)
  )
)

const computedRemainingAmount = computed(() =>
  Math.max(0, computedTotalAmount.value - Number(form.value.paid_amount || 0))
)

async function loadData(): Promise<void> {
  const [ticketRows, techRows, partRows, custRows] = await Promise.all([
    window.api.listTickets({
      search: searchQuery.value,
      status: statusFilter.value,
      service_type: serviceTypeFilter.value
    }),
    window.api.listTechnicians(),
    window.api.listSpareParts(),
    window.api.listCustomers('')
  ])
  tickets.value = ticketRows
  technicians.value = techRows
  spareParts.value = partRows
  allCustomers.value = custRows
}

const filteredCustomersForSelection = computed(() => {
  let q = ''
  if (activeCustomerField.value === 'search') {
    q = customerSearchInput.value.trim().toLowerCase()
  } else if (activeCustomerField.value === 'phone') {
    q = form.value.customer_phone.trim().toLowerCase()
  } else if (activeCustomerField.value === 'name') {
    q = form.value.customer_name.trim().toLowerCase()
  } else {
    q = customerSearchInput.value.trim().toLowerCase()
  }

  if (!q) {
    return allCustomers.value.slice(0, 10)
  }

  return allCustomers.value
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.phone2 && c.phone2.toLowerCase().includes(q)) ||
        (c.area && c.area.toLowerCase().includes(q))
    )
    .slice(0, 12)
})

async function selectCustomerFromSuggestion(c: Customer): Promise<void> {
  form.value.customer_id = c.id
  form.value.customer_name = c.name
  form.value.customer_phone = c.phone
  form.value.customer_phone2 = c.phone2 || ''
  form.value.customer_area = c.area || ''
  form.value.customer_address = c.address || ''
  customerSearchInput.value = `${c.name} — ${c.phone}`
  showCustomerSuggestions.value = false
  activeCustomerField.value = null
  await handlePhoneLookup()
}

function hideCustomerSuggestionsDelayed(): void {
  setTimeout(() => {
    showCustomerSuggestions.value = false
    activeCustomerField.value = null
  }, 180)
}

watch([searchQuery, statusFilter, serviceTypeFilter], () => {
  loadData()
})

async function handlePhoneLookup(): Promise<void> {
  const phone = form.value.customer_phone.trim()
  if (phone.length < 8) {
    existingAppliances.value = []
    previousTickets.value = []
    activeWarrantyAlert.value = null
    return
  }

  const res = await window.api.findCustomerByPhone(phone)
  if (res.customer) {
    if (!form.value.id) {
      form.value.customer_id = res.customer.id
      form.value.customer_name = res.customer.name
      form.value.customer_phone2 = res.customer.phone2 || ''
      form.value.customer_area = res.customer.area || ''
      form.value.customer_address = res.customer.address || ''
    }
    existingAppliances.value = res.appliances
    previousTickets.value = res.previousTickets

    // Check if any previous ticket has active warranty today
    const today = new Date().toISOString().slice(0, 10)
    const underWarrantyTicket = res.previousTickets.find(
      (t) => t.warranty_end_date && t.warranty_end_date >= today
    )
    if (underWarrantyTicket) {
      activeWarrantyAlert.value = {
        ticket_number: underWarrantyTicket.ticket_number,
        appliance_type: underWarrantyTicket.appliance_type,
        brand: underWarrantyTicket.brand,
        warranty_end_date: underWarrantyTicket.warranty_end_date!
      }
    } else {
      activeWarrantyAlert.value = null
    }
  } else {
    existingAppliances.value = []
    previousTickets.value = []
    activeWarrantyAlert.value = null
  }
}

function applyWarrantyReturnMode(): void {
  if (!activeWarrantyAlert.value) return
  form.value.priority = 'warranty_return'
  form.value.is_under_previous_warranty = 1
  form.value.previous_ticket_number = activeWarrantyAlert.value.ticket_number
  form.value.appliance_type = activeWarrantyAlert.value.appliance_type
  form.value.brand = activeWarrantyAlert.value.brand
  form.value.inspection_fee = 0
}

function selectExistingAppliance(app: CustomerAppliance): void {
  form.value.appliance_type = app.appliance_type
  form.value.brand = app.brand
  form.value.model = app.model || ''
  form.value.serial_number = app.serial_number || ''
}

function addPartToTicket(): void {
  if (!selectedPartId.value) return
  const part = spareParts.value.find((p) => p.id === selectedPartId.value)
  if (!part) return

  const qty = Math.max(1, Number(selectedPartQty.value || 1))
  const existing = form.value.parts.find((p) => p.part_id === part.id)
  if (existing) {
    existing.quantity += qty
    existing.total_price = existing.quantity * existing.unit_price
  } else {
    form.value.parts.push({
      part_id: part.id,
      part_name: part.name,
      part_code: part.code,
      quantity: qty,
      unit_cost: part.purchase_price,
      unit_price: part.selling_price,
      total_price: qty * part.selling_price
    })
  }
  selectedPartId.value = null
  selectedPartQty.value = 1
}

function removePartFromTicket(index: number): void {
  form.value.parts.splice(index, 1)
}

async function handleWarrantyImageUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  form.value.warranty_image = await compressImageFile(file, 1100, 1100, 0.84)
  input.value = ''
}

async function handleFaultImagesUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  const list = [...form.value.fault_images]
  for (const file of Array.from(files)) {
    const compressed = await compressImageFile(file, 1000, 1000, 0.82)
    list.push(compressed)
  }
  form.value.fault_images = list
  input.value = ''
}

function removeFaultImage(index: number): void {
  form.value.fault_images.splice(index, 1)
}

function openCreateModal(): void {
  errorMsg.value = ''
  existingAppliances.value = []
  previousTickets.value = []
  activeWarrantyAlert.value = null
  customerSearchInput.value = ''
  showCustomerSuggestions.value = false
  form.value = {
    customer_name: '',
    customer_phone: '',
    customer_phone2: '',
    customer_area: '',
    customer_address: '',
    appliance_type: APPLIANCE_TYPES[0],
    brand: APPLIANCE_BRANDS[0],
    model: '',
    serial_number: '',
    service_type: 'home_visit',
    status: 'new',
    priority: 'normal',
    complaint: '',
    diagnosis: '',
    technician_id: technicians.value[0]?.id || null,
    scheduled_date: new Date().toISOString().slice(0, 10),
    inspection_fee: appStore.settings.default_inspection_fee || 150,
    labor_cost: 0,
    discount: 0,
    paid_amount: 0,
    payment_method: 'cash',
    warranty_months: appStore.settings.default_warranty_months || 6,
    is_under_previous_warranty: 0,
    previous_ticket_number: null,
    warranty_image: '',
    fault_images: [],
    notes: '',
    parts: []
  }
  modalOpen.value = true
}

function openEditModal(t: MaintenanceTicket): void {
  errorMsg.value = ''
  existingAppliances.value = []
  previousTickets.value = []
  activeWarrantyAlert.value = null
  customerSearchInput.value = `${t.customer_name} — ${t.customer_phone}`
  showCustomerSuggestions.value = false
  form.value = {
    id: t.id,
    ticket_number: t.ticket_number,
    customer_id: t.customer_id,
    customer_name: t.customer_name,
    customer_phone: t.customer_phone,
    customer_phone2: t.customer_phone2 || '',
    customer_area: t.customer_area || '',
    customer_address: t.customer_address || '',
    appliance_type: t.appliance_type,
    brand: t.brand,
    model: t.model || '',
    serial_number: t.serial_number || '',
    service_type: t.service_type,
    status: t.status,
    priority: t.priority,
    complaint: t.complaint,
    diagnosis: t.diagnosis || '',
    technician_id: t.technician_id,
    scheduled_date: t.scheduled_date,
    inspection_fee: t.inspection_fee,
    labor_cost: t.labor_cost,
    discount: t.discount,
    paid_amount: t.paid_amount,
    payment_method: t.payment_method,
    warranty_months: t.warranty_months,
    is_under_previous_warranty: t.is_under_previous_warranty,
    previous_ticket_number: t.previous_ticket_number,
    warranty_image: t.warranty_image || '',
    fault_images: Array.isArray(t.fault_images) ? [...t.fault_images] : [],
    notes: t.notes || '',
    parts: t.parts ? t.parts.map((p) => ({ ...p })) : []
  }
  modalOpen.value = true
}

async function handleSaveTicket(andPrint = false): Promise<void> {
  errorMsg.value = ''
  if (!form.value.customer_name.trim() || !form.value.customer_phone.trim()) {
    errorMsg.value = 'يرجى إدخال اسم العميل ورقم الهاتف'
    return
  }
  if (!form.value.complaint.trim()) {
    errorMsg.value = 'يرجى كتابة شكوى العميل أو وصف العطل'
    return
  }

  try {
    const isEdit = Boolean(form.value.id)
    const saved = await appStore.withLoading(
      async () => {
        const res = await window.api.saveTicket(plain({ ...form.value }))
        modalOpen.value = false
        await loadData()
        return res
      },
      isEdit ? 'جاري حفظ تعديلات طلب الصيانة...' : 'جاري تسجيل وحفظ بلاغ الصيانة...'
    )
    if (andPrint) {
      appStore.openPrintModal(
        saved,
        saved.status === 'repaired' || saved.status === 'delivered'
          ? 'invoice_warranty'
          : 'reception_receipt'
      )
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الطلب'
  }
}

async function handleDeleteTicket(t: MaintenanceTicket): Promise<void> {
  if (!confirm(`هل أنت متأكد من حذف الطلب رقم ${t.ticket_number}؟ سيتم إرجاع أي قطع غيار للمخزن.`))
    return
  await appStore.withLoading(async () => {
    await window.api.deleteTicket(t.id)
    await loadData()
  }, 'جاري حذف طلب الصيانة...')
}

onMounted(async () => {
  await loadData()
  if (route.query.new === '1') {
    openCreateModal()
  }
})
</script>

<template>
  <div class="space-y-5">
    <!-- Top Header & Filters -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs space-y-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench class="w-5 h-5 text-blue-600" />
            إدارة بلاغات وطلبات الصيانة والضمان
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تسجيل الزيارات المنزلية وأجهزة الورشة، صرف قطع الغيار، وإصدار الفواتير وشهادات الضمان (A4 / 80mm)
          </p>
        </div>

        <button
          type="button"
          @click="openCreateModal"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          تسجيل بلاغ صيانة جديد
        </button>
      </div>

      <!-- Search & Filter Bar -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <div class="md:col-span-2 relative">
          <Search
            class="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="بحث برقم الطلب، اسم العميل، رقم الموبايل، نوع الجهاز، الماركة، أو السيريال..."
            class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
          />
        </div>

        <select
          v-model="statusFilter"
          class="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
        >
          <option value="all">جميع حالات الصيانة</option>
          <option v-for="(info, key) in TICKET_STATUS_MAP" :key="key" :value="key">
            {{ info.label }}
          </option>
        </select>

        <select
          v-model="serviceTypeFilter"
          class="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
        >
          <option value="all">جميع أنواع الخدمة (منزلي + ورشة)</option>
          <option value="home_visit">زيارات منزلية فقط</option>
          <option value="workshop">أجهزة داخل الورشة فقط</option>
        </select>
      </div>
    </div>

    <!-- Tickets Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead
            class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold"
          >
            <tr>
              <th class="py-3.5 px-4">رقم الطلب</th>
              <th class="py-3.5 px-4">العميل والمنطقة</th>
              <th class="py-3.5 px-4">الجهاز والعطل</th>
              <th class="py-3.5 px-4">الخدمة والفني</th>
              <th class="py-3.5 px-4">الحالة</th>
              <th class="py-3.5 px-4">الحساب والمدفوع</th>
              <th class="py-3.5 px-4">الضمان</th>
              <th class="py-3.5 px-4">الطباعة والإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
            <tr
              v-for="t in tickets"
              :key="t.id"
              class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
            >
              <td class="py-3.5 px-4">
                <div class="font-mono font-black text-blue-600 dark:text-blue-400">
                  {{ t.ticket_number }}
                </div>
                <div class="text-[11px] text-slate-500">{{ t.scheduled_date }}</div>
                <span
                  v-if="t.is_under_previous_warranty || t.priority === 'warranty_return'"
                  class="inline-block mt-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-bold"
                >
                  🛡️ إعادة بالضمان
                </span>
              </td>

              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-900 dark:text-white">{{ t.customer_name }}</div>
                <div class="text-slate-500 font-mono">{{ t.customer_phone }}</div>
                <div v-if="t.customer_area" class="text-[11px] text-slate-500">
                  📍 {{ t.customer_area }}
                </div>
              </td>

              <td class="py-3.5 px-4 max-w-xs">
                <div class="font-bold text-slate-900 dark:text-white">
                  {{ t.appliance_type }} — <span class="text-blue-600">{{ t.brand }}</span>
                </div>
                <div class="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  {{ t.complaint }}
                </div>
                <div
                  v-if="t.parts && t.parts.length > 0"
                  class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5"
                >
                  🔧 قطع غيار مركبة: {{ t.parts.length }}
                </div>
              </td>

              <td class="py-3.5 px-4">
                <div class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                  <Home v-if="t.service_type === 'home_visit'" class="w-3.5 h-3.5 text-indigo-500" />
                  <Building2 v-else class="w-3.5 h-3.5 text-amber-500" />
                  <span>{{ t.service_type === 'home_visit' ? 'زيارة منزلية' : 'بالورشة' }}</span>
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  الفني: <strong class="text-slate-800 dark:text-slate-200">{{ t.technician_name || 'لم يعين' }}</strong>
                </div>
              </td>

              <td class="py-3.5 px-4">
                <span
                  :class="[
                    'px-2.5 py-1 rounded-full text-[11px] font-bold border',
                    TICKET_STATUS_MAP[t.status]?.badgeClass
                  ]"
                >
                  {{ TICKET_STATUS_MAP[t.status]?.label }}
                </span>
              </td>

              <td class="py-3.5 px-4">
                <div class="font-black text-slate-900 dark:text-white">
                  الإجمالي: {{ t.total_amount }} ج.م
                </div>
                <div class="text-[11px] text-emerald-600 font-bold">
                  مدفوع: {{ t.paid_amount }} ج.م
                </div>
                <div
                  v-if="t.remaining_amount > 0"
                  class="text-[11px] text-rose-600 font-bold"
                >
                  متبقي: {{ t.remaining_amount }} ج.م
                </div>
              </td>

              <td class="py-3.5 px-4">
                <div v-if="t.warranty_months > 0" class="font-bold text-emerald-700 dark:text-emerald-400">
                  {{ t.warranty_months }} شهور
                </div>
                <div v-else class="text-slate-400">بدون ضمان</div>
                <div v-if="t.warranty_end_date" class="text-[10px] text-slate-500">
                  حتى {{ t.warranty_end_date }}
                </div>
              </td>

              <td class="py-3.5 px-4">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    @click="appStore.openPrintModal(t, 'invoice_warranty', 'a4')"
                    class="px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    title="طباعة فاتورة وشهادة ضمان A4"
                  >
                    <Printer class="w-3.5 h-3.5" />
                    A4
                  </button>
                  <button
                    type="button"
                    @click="appStore.openPrintModal(t, 'reception_receipt', 'thermal80')"
                    class="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    title="طباعة إيصال حراري 80mm"
                  >
                    <Printer class="w-3.5 h-3.5" />
                    80mm
                  </button>
                  <button
                    type="button"
                    @click="appStore.sendWhatsAppToCustomer(t)"
                    class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 transition cursor-pointer"
                    title="إرسال واتساب للعميل"
                  >
                    <MessageCircle class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    @click="openEditModal(t)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                    title="تعديل الطلب"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    @click="handleDeleteTicket(t)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                    title="حذف الطلب"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="tickets.length === 0">
              <td colspan="8" class="py-10 text-center text-slate-400">
                لا توجد طلبات صيانة مطابقة للبحث
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- CREATE / EDIT TICKET MODAL                              -->
    <!-- ======================================================= -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[93vh] flex flex-col overflow-hidden"
      >
        <!-- Modal Header -->
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench class="w-5 h-5 text-blue-600" />
            <span>
              {{
                form.id
                  ? `تعديل طلب الصيانة (${form.ticket_number})`
                  : 'تسجيل بلاغ / طلب صيانة جديد'
              }}
            </span>
          </h3>
          <button
            type="button"
            @click="modalOpen = false"
            class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div
            v-if="errorMsg"
            class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold"
          >
            {{ errorMsg }}
          </div>

          <!-- Automatic Active Warranty Alert if Customer has active warranty -->
          <div
            v-if="activeWarrantyAlert"
            class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 flex flex-wrap items-center justify-between gap-3"
          >
            <div class="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
              <ShieldAlert class="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <div class="font-black text-sm">
                  تنبيه ضمان تلقائي: هذا العميل لديه جهاز داخل فترة الضمان!
                </div>
                <div class="text-xs mt-0.5">
                  طلب رقم <strong>{{ activeWarrantyAlert.ticket_number }}</strong> — جهاز ({{
                    activeWarrantyAlert.appliance_type
                  }}
                  {{ activeWarrantyAlert.brand }}) — الضمان ساري حتى
                  <strong>{{ activeWarrantyAlert.warranty_end_date }}</strong>
                </div>
              </div>
            </div>
            <button
              type="button"
              @click="applyWarrantyReturnMode"
              class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
            >
              تسجيل كإعادة صيانة بالضمان (مجاناً)
            </button>
          </div>

          <!-- Section 1: Customer Details -->
          <div
            class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="font-black text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                <Users class="w-4 h-4 text-blue-600" />
                1. بيانات العميل (اختر عميلاً مسجلاً بالاسم أو رقم الهاتف، أو أدخل عميلاً جديداً)
              </h4>
              <span
                v-if="form.customer_id"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-bold text-[11px]"
              >
                <CheckCircle2 class="w-3.5 h-3.5" />
                عميل مسجل (#{{ form.customer_id }})
              </span>
            </div>

            <!-- Quick Customer Search & Select By Name or Phone -->
            <div class="relative">
              <label class="block font-bold text-blue-700 dark:text-blue-400 mb-1">
                🔍 اختيار سريع لعميل مسجل (ابحث بالاسم أو رقم الهاتف أو المنطقة):
              </label>
              <div class="relative">
                <Search
                  class="w-4 h-4 text-blue-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  v-model="customerSearchInput"
                  @focus="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'search'
                  "
                  @input="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'search'
                  "
                  @blur="hideCustomerSuggestionsDelayed"
                  type="text"
                  placeholder="اكتب اسم العميل أو رقم الموبايل لاختياره تلقائياً مع عنوانه وأجهزته..."
                  class="w-full pr-10 pl-8 py-2 rounded-xl bg-blue-50/70 dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 focus:border-blue-500 focus:outline-none font-bold"
                />
                <button
                  v-if="customerSearchInput"
                  type="button"
                  @click="
                    customerSearchInput = '';
                    showCustomerSuggestions = true;
                    activeCustomerField = 'search'
                  "
                  class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>

              <!-- Customer Suggestions Dropdown -->
              <div
                v-if="showCustomerSuggestions && filteredCustomersForSelection.length > 0"
                class="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800"
              >
                <button
                  v-for="cust in filteredCustomersForSelection"
                  :key="cust.id"
                  type="button"
                  @mousedown.prevent="selectCustomerFromSuggestion(cust)"
                  class="w-full px-4 py-2.5 text-right hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 transition cursor-pointer"
                >
                  <div>
                    <div class="font-black text-slate-900 dark:text-white">
                      {{ cust.name }}
                      <span
                        v-if="cust.area"
                        class="text-[11px] font-normal text-slate-500 mr-1.5"
                      >
                        (📍 {{ cust.area }})
                      </span>
                    </div>
                    <div v-if="cust.address" class="text-[11px] text-slate-500 truncate max-w-md">
                      {{ cust.address }}
                    </div>
                  </div>
                  <div class="text-left shrink-0">
                    <div class="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {{ cust.phone }}
                    </div>
                    <div v-if="cust.phone2" class="font-mono text-[10px] text-slate-400">
                      {{ cust.phone2 }}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold mb-1">رقم الموبايل الأساسي *</label>
                <input
                  v-model="form.customer_phone"
                  @focus="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'phone'
                  "
                  @input="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'phone';
                    handlePhoneLookup()
                  "
                  @blur="hideCustomerSuggestionsDelayed"
                  type="text"
                  placeholder="010xxxxxxxx"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">اسم العميل *</label>
                <input
                  v-model="form.customer_name"
                  @focus="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'name'
                  "
                  @input="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'name'
                  "
                  @blur="hideCustomerSuggestionsDelayed"
                  type="text"
                  placeholder="اسم العميل ثلاثي"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">رقم هاتف إضافي</label>
                <input
                  v-model="form.customer_phone2"
                  type="text"
                  placeholder="011xxxxxxxx"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">المنطقة / الحي</label>
                <input
                  v-model="form.customer_area"
                  type="text"
                  placeholder="مثال: مدينة نصر / المعادي"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>
            <div>
              <label class="block font-bold mb-1">العنوان التفصيلي للزيارة المنزلية</label>
              <input
                v-model="form.customer_address"
                type="text"
                placeholder="اسم الشارع - رقم العمارة - الدور - الشقة - علامة مميزة"
                class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
              />
            </div>

            <!-- Customer Previous Appliances Quick Selector -->
            <div v-if="existingAppliances.length > 0" class="pt-2">
              <span class="font-bold text-blue-600 dark:text-blue-400 ml-2">
                أجهزة العميل المسجلة سابقاً (اضغط للاختيار السريع):
              </span>
              <div class="flex flex-wrap gap-2 mt-1.5">
                <button
                  v-for="app in existingAppliances"
                  :key="app.id"
                  type="button"
                  @click="selectExistingAppliance(app)"
                  class="px-3 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-bold cursor-pointer"
                >
                  🔌 {{ app.appliance_type }} ({{ app.brand }})
                  <span v-if="app.last_warranty_end"> — ضمان حتى {{ app.last_warranty_end }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Section 2: Appliance & Service Details -->
          <div
            class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <h4 class="font-black text-slate-900 dark:text-white text-sm">
              2. بيانات الجهاز الكهربائي وتفاصيل الخدمة
            </h4>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold mb-1">نوع الجهاز *</label>
                <select
                  v-model="form.appliance_type"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option v-for="t in APPLIANCE_TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">الماركة (Brand) *</label>
                <select
                  v-model="form.brand"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option v-for="b in APPLIANCE_BRANDS" :key="b" :value="b">{{ b }}</option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">الموديل / السعة</label>
                <input
                  v-model="form.model"
                  type="text"
                  placeholder="مثال: 8 كيلو انفرتر / 16 قدم"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">رقم السيريال (Serial Number)</label>
                <input
                  v-model="form.serial_number"
                  type="text"
                  placeholder="اختياري"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold mb-1">نوع الخدمة *</label>
                <select
                  v-model="form.service_type"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option value="home_visit">🏠 زيارة منزلية</option>
                  <option value="workshop">🏢 استلام بالورشة</option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">حالة الطلب *</label>
                <select
                  v-model="form.status"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option v-for="(info, k) in TICKET_STATUS_MAP" :key="k" :value="k">
                    {{ info.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">تعيين الفني المسؤول</label>
                <select
                  v-model="form.technician_id"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option :value="null">-- لم يعين بعد --</option>
                  <option v-for="tech in technicians" :key="tech.id" :value="tech.id">
                    {{ tech.name }} ({{ tech.specialty }})
                  </option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">تاريخ الزيارة / الاستلام</label>
                <input
                  v-model="form.scheduled_date"
                  type="date"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold mb-1">شكوى العميل / العطل المبلّغ عنه *</label>
                <textarea
                  v-model="form.complaint"
                  rows="2"
                  placeholder="مثال: الغسالة لا تصرف المياه وتصدر صوت عالي في العصر..."
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                ></textarea>
              </div>
              <div>
                <label class="block font-bold mb-1">التشخيص الفني وما تم عمله</label>
                <textarea
                  v-model="form.diagnosis"
                  rows="2"
                  placeholder="مثال: تم الكشف وتغيير طلمبة الطرد وتنظيف الفلتر وتجربة الجهاز..."
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                ></textarea>
              </div>
            </div>

            <!-- Warranty Image & Fault Images Attachment -->
            <div
              class="pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <!-- Warranty Image -->
              <div
                class="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between gap-3"
              >
                <div class="flex items-center gap-2.5">
                  <img
                    v-if="form.warranty_image"
                    :src="form.warranty_image"
                    @click="appStore.openImagePreview(form.warranty_image, 'صورة الضمان')"
                    class="w-12 h-12 rounded-lg border border-emerald-500 object-cover bg-white cursor-pointer shrink-0"
                  />
                  <div>
                    <div class="font-bold text-emerald-800 dark:text-emerald-300">
                      🛡️ صورة شهادة الضمان
                    </div>
                    <div class="text-[10px] text-slate-500">تُحفظ أيضاً في سجل أجهزة العميل</div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <label
                    class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ShieldCheck class="w-3.5 h-3.5" />
                    <span>{{ form.warranty_image ? 'تغيير' : 'إرفاق صورة' }}</span>
                    <input
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="handleWarrantyImageUpload"
                    />
                  </label>
                  <button
                    v-if="form.warranty_image"
                    type="button"
                    @click="form.warranty_image = ''"
                    class="px-2 py-1.5 rounded-lg bg-rose-100 text-rose-700 font-bold cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </div>

              <!-- Fault Images -->
              <div
                class="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-bold text-amber-900 dark:text-amber-300">
                      📷 صور العطل والجهاز ({{ form.fault_images.length }})
                    </div>
                    <div class="text-[10px] text-slate-500">قبل وبعد الصيانة</div>
                  </div>
                  <label
                    class="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Camera class="w-3.5 h-3.5" />
                    <span>إرفاق صور العطل (+)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      class="hidden"
                      @change="handleFaultImagesUpload"
                    />
                  </label>
                </div>
                <div v-if="form.fault_images.length > 0" class="flex flex-wrap gap-1.5">
                  <div
                    v-for="(img, idx) in form.fault_images"
                    :key="idx"
                    class="relative w-12 h-12 rounded-lg border border-amber-500 overflow-hidden bg-white"
                  >
                    <img
                      :src="img"
                      @click="appStore.openImagePreview(img, `صورة العطل ${idx + 1}`)"
                      class="w-full h-full object-cover cursor-pointer"
                    />
                    <button
                      type="button"
                      @click="removeFaultImage(idx)"
                      class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 3: Spare Parts Used on Ticket -->
          <div
            class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <h4 class="font-black text-slate-900 dark:text-white text-sm">
              3. قطع الغيار المنصرفة للطلب (تُخصم تلقائياً من المخزن وتُضاف للفاتورة)
            </h4>

            <div class="flex flex-wrap items-end gap-2">
              <div class="flex-1 min-w-[240px]">
                <label class="block font-bold mb-1">اختر قطعة غيار من المخزن</label>
                <select
                  v-model="selectedPartId"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                >
                  <option :value="null">-- اختر قطعة غيار لإضافتها --</option>
                  <option
                    v-for="p in spareParts"
                    :key="p.id"
                    :value="p.id"
                    :disabled="p.quantity <= 0"
                  >
                    [{{ p.code }}] {{ p.name }} — سعر البيع: {{ p.selling_price }} ج.م (المتاح:
                    {{ p.quantity }})
                  </option>
                </select>
              </div>

              <div class="w-24">
                <label class="block font-bold mb-1">الكمية</label>
                <input
                  v-model.number="selectedPartQty"
                  type="number"
                  min="1"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-center"
                />
              </div>

              <button
                type="button"
                @click="addPartToTicket"
                class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
              >
                <PackagePlus class="w-4 h-4" />
                إضافة للطلب
              </button>
            </div>

            <div
              v-if="form.parts.length > 0"
              class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900"
            >
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
                  <tr>
                    <th class="py-2 px-3">الكود</th>
                    <th class="py-2 px-3">اسم القطعة</th>
                    <th class="py-2 px-3">الكمية</th>
                    <th class="py-2 px-3">سعر البيع للوحدة</th>
                    <th class="py-2 px-3">الإجمالي</th>
                    <th class="py-2 px-3">حذف</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr v-for="(item, idx) in form.parts" :key="idx">
                    <td class="py-2 px-3 font-mono">{{ item.part_code }}</td>
                    <td class="py-2 px-3 font-bold">{{ item.part_name }}</td>
                    <td class="py-2 px-3">{{ item.quantity }}</td>
                    <td class="py-2 px-3">
                      <input
                        v-model.number="item.unit_price"
                        @input="item.total_price = item.quantity * item.unit_price"
                        type="number"
                        class="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      />
                    </td>
                    <td class="py-2 px-3 font-bold">{{ item.quantity * item.unit_price }} ج.م</td>
                    <td class="py-2 px-3">
                      <button
                        type="button"
                        @click="removePartFromTicket(idx)"
                        class="text-rose-600 hover:underline font-bold cursor-pointer"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Section 4: Financials & Warranty -->
          <div
            class="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-3"
          >
            <h4 class="font-black text-slate-900 dark:text-white text-sm">
              4. الحساب المالي وشهادة الضمان
            </h4>

            <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label class="block font-bold mb-1">رسوم الكشف</label>
                <input
                  v-model.number="form.inspection_fee"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">المصنعية والإصلاح</label>
                <input
                  v-model.number="form.labor_cost"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">إجمالي قطع الغيار</label>
                <input
                  :value="computedPartsTotal"
                  disabled
                  type="number"
                  class="w-full px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">خصم للعميل</label>
                <input
                  v-model.number="form.discount"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1 text-emerald-700 dark:text-emerald-400">
                  المبلغ المدفوع (المحصل)
                </label>
                <input
                  v-model.number="form.paid_amount"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border-2 border-emerald-500 font-black"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">طريقة الدفع</label>
                <select
                  v-model="form.payment_method"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option v-for="(label, k) in PAYMENT_METHODS" :key="k" :value="k">
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-center pt-2">
              <div>
                <label class="block font-bold mb-1">مدة الضمان الممنوحة للعميل</label>
                <select
                  v-model.number="form.warranty_months"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option :value="0">بدون ضمان (كشف فقط)</option>
                  <option :value="1">ضمان شهر واحد</option>
                  <option :value="3">ضمان 3 شهور</option>
                  <option :value="6">ضمان 6 شهور</option>
                  <option :value="12">ضمان سنة كاملة (12 شهر)</option>
                </select>
              </div>

              <div
                class="md:col-span-2 flex items-center justify-around p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700"
              >
                <div class="text-center">
                  <span class="text-slate-500 block">الإجمالي النهائي</span>
                  <span class="text-lg font-black text-blue-600 dark:text-blue-400">
                    {{ computedTotalAmount }} ج.م
                  </span>
                </div>
                <div class="text-center">
                  <span class="text-slate-500 block">المدفوع</span>
                  <span class="text-lg font-black text-emerald-600">
                    {{ form.paid_amount }} ج.م
                  </span>
                </div>
                <div class="text-center">
                  <span class="text-slate-500 block">المتبقي على العميل</span>
                  <span class="text-lg font-black text-rose-600">
                    {{ computedRemainingAmount }} ج.م
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-end gap-3 text-xs"
        >
          <button
            type="button"
            @click="modalOpen = false"
            class="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            @click="handleSaveTicket(false)"
            class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
          >
            حفظ بيانات الطلب
          </button>
          <button
            type="button"
            @click="handleSaveTicket(true)"
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md cursor-pointer"
          >
            <Printer class="w-4 h-4" />
            حفظ وطباعة الإيصال / شهادة الضمان
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
