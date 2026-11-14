<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { TICKET_STATUS_MAP } from '@renderer/constants/appliances'
import type {
  MaintenanceTicket,
  Technician,
  SparePart,
  TicketPartItem
} from '@shared/types'
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  RotateCcw,
  Wrench,
  CheckCircle2,
  Clock,
  Printer,
  Edit3,
  Trash2,
  X,
  Plus,
  Phone,
  Calendar,
  UserCheck
} from 'lucide-vue-next'

const appStore = useAppStore()
const { t } = useTerms()

const loading = ref(false)
const activeTab = ref<'returns' | 'active_warranties'>('returns')

const returnTickets = ref<MaintenanceTicket[]>([])
const activeWarrantyTickets = ref<MaintenanceTicket[]>([])
const technicians = ref<Technician[]>([])
const spareParts = ref<SparePart[]>([])

// Filters
const searchQuery = ref('')
const statusFilter = ref('all')

// Quick Warranty Lookup
const quickLookupQuery = ref('')
const quickLookupLoading = ref(false)
const quickLookupSerialResult = ref<{
  label: string
  customer_id: number | null
  customer_name: string
  customer_phone: string
  customer_address: string
  appliance_type: string
  brand: string
  model: string
  serial_number: string
  product_serial_id: number | null
  sales_invoice_id: number | null
  previous_ticket_number: string
  warranty_end_date: string
} | null>(null)

// Modal state
const modalOpen = ref(false)
const saving = ref(false)
const isFreeWarranty = ref(true)
const selectedPartId = ref<number | ''>('')
const selectedPartQty = ref(1)

const form = ref({
  id: 0,
  ticket_number: '',
  customer_id: null as number | null,
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  appliance_type: '',
  brand: '',
  model: '',
  serial_number: '',
  service_type: 'in_center' as 'in_center' | 'home_visit',
  priority: 'warranty_return' as 'normal' | 'urgent' | 'warranty_return',
  status: 'pending' as MaintenanceTicket['status'],
  technician_id: null as number | null,
  fault_description: '',
  diagnosis_notes: '',
  inspection_fee: 0,
  labor_cost: 0,
  discount: 0,
  paid_amount: 0,
  payment_method: 'cash' as MaintenanceTicket['payment_method'],
  warranty_months: 0,
  is_under_previous_warranty: 1,
  previous_ticket_number: '',
  product_serial_id: null as number | null,
  sales_invoice_id: null as number | null,
  parts: [] as TicketPartItem[],
  notes: ''
})

const originalWarrantyEnd = ref('')

const canDelete = computed(() => ['super_admin', 'owner'].includes(appStore.currentUser?.role || ''))

function daysRemaining(endDate?: string | null): number {
  if (!endDate) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate + 'T00:00:00')
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

const kpis = computed(() => {
  const total = returnTickets.value.length
  const open = returnTickets.value.filter(
    (tk) => !['delivered', 'completed', 'cancelled'].includes(tk.status)
  ).length
  const completed = returnTickets.value.filter((tk) =>
    ['completed', 'delivered'].includes(tk.status)
  ).length
  const activeCount = activeWarrantyTickets.value.length
  return { total, open, completed, activeCount }
})

const quickLookupMatches = computed(() => {
  const q = quickLookupQuery.value.trim().toLowerCase()
  if (!q) return activeWarrantyTickets.value.slice(0, 6)
  return activeWarrantyTickets.value
    .filter(
      (tk) =>
        tk.ticket_number.toLowerCase().includes(q) ||
        tk.customer_name.toLowerCase().includes(q) ||
        tk.customer_phone.toLowerCase().includes(q) ||
        tk.appliance_type.toLowerCase().includes(q) ||
        tk.brand.toLowerCase().includes(q) ||
        (tk.serial_number || '').toLowerCase().includes(q)
    )
    .slice(0, 12)
})

const filteredReturns = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return returnTickets.value.filter((tk) => {
    if (statusFilter.value !== 'all' && tk.status !== statusFilter.value) return false
    if (!q) return true
    return (
      tk.ticket_number.toLowerCase().includes(q) ||
      (tk.previous_ticket_number || '').toLowerCase().includes(q) ||
      tk.customer_name.toLowerCase().includes(q) ||
      tk.customer_phone.toLowerCase().includes(q) ||
      tk.appliance_type.toLowerCase().includes(q) ||
      tk.brand.toLowerCase().includes(q) ||
      (tk.serial_number || '').toLowerCase().includes(q)
    )
  })
})

const filteredActiveWarranties = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return activeWarrantyTickets.value.filter((tk) => {
    if (!q) return true
    return (
      tk.ticket_number.toLowerCase().includes(q) ||
      tk.customer_name.toLowerCase().includes(q) ||
      tk.customer_phone.toLowerCase().includes(q) ||
      tk.appliance_type.toLowerCase().includes(q) ||
      tk.brand.toLowerCase().includes(q) ||
      (tk.serial_number || '').toLowerCase().includes(q)
    )
  })
})

const partsCost = computed(() =>
  form.value.parts.reduce((sum, p) => sum + Number(p.total_price || 0), 0)
)
const totalCost = computed(() => {
  if (isFreeWarranty.value) return 0
  return Math.max(
    0,
    Number(form.value.inspection_fee || 0) +
      Number(form.value.labor_cost || 0) +
      partsCost.value -
      Number(form.value.discount || 0)
  )
})

async function loadData(): Promise<void> {
  loading.value = true
  try {
    const [returnsRes, activeRes, techRes, partsRes] = await Promise.all([
      window.api.listTickets({ warranty_returns_only: true }),
      window.api.listTickets({ active_warranty_only: true }),
      window.api.listTechnicians(),
      window.api.listSpareParts()
    ])
    returnTickets.value = returnsRes
    // Exclude tickets that are already warranty returns without their own new warranty, or keep delivered/completed ones
    activeWarrantyTickets.value = activeRes.filter(
      (tk) => tk.priority !== 'warranty_return' || ['delivered', 'completed'].includes(tk.status)
    )
    technicians.value = techRes.filter((tech) => tech.is_active)
    spareParts.value = partsRes
  } catch (err) {
    console.error(err)
    swalError('تعذر تحميل بيانات مرتجعات الضمان')
  } finally {
    loading.value = false
  }
}

async function runSerialLookup(): Promise<void> {
  const q = quickLookupQuery.value.trim()
  quickLookupSerialResult.value = null
  if (!q || !window.api.lookupSerialOrInvoice) return
  quickLookupLoading.value = true
  try {
    const res = await window.api.lookupSerialOrInvoice(q)
    if (res.found && res.isUnderWarranty) {
      quickLookupSerialResult.value = {
        label: res.invoice?.invoice_number || res.serial?.serial_no || q,
        customer_id: res.customer?.id || null,
        customer_name: res.customer?.name || '',
        customer_phone: res.customer?.phone || '',
        customer_address: res.customer?.address || '',
        appliance_type: res.product?.category || res.product?.name || '',
        brand: res.product?.brand || '',
        model: res.product?.model || res.product?.name || '',
        serial_number: res.serial?.serial_no || '',
        product_serial_id: res.serial?.id || null,
        sales_invoice_id: res.invoice?.id || null,
        previous_ticket_number: res.invoice?.invoice_number || res.serial?.serial_no || '',
        warranty_end_date: res.warrantyEndDate || ''
      }
    }
  } catch {
    // Ignore lookup errors
  } finally {
    quickLookupLoading.value = false
  }
}

function openCreateReturnFromTicket(source: MaintenanceTicket): void {
  isFreeWarranty.value = true
  originalWarrantyEnd.value = source.warranty_end_date || ''
  form.value = {
    id: 0,
    ticket_number: '',
    customer_id: source.customer_id || null,
    customer_name: source.customer_name,
    customer_phone: source.customer_phone,
    customer_address: source.customer_address || '',
    appliance_type: source.appliance_type,
    brand: source.brand,
    model: source.model || '',
    serial_number: source.serial_number || '',
    service_type: source.service_type || 'in_center',
    priority: 'warranty_return',
    status: 'pending',
    technician_id: source.technician_id || null,
    fault_description: '',
    diagnosis_notes: '',
    inspection_fee: 0,
    labor_cost: 0,
    discount: 0,
    paid_amount: 0,
    payment_method: 'cash',
    warranty_months: 0,
    is_under_previous_warranty: 1,
    previous_ticket_number: source.ticket_number,
    product_serial_id: source.product_serial_id || null,
    sales_invoice_id: source.sales_invoice_id || null,
    parts: [],
    notes: ''
  }
  modalOpen.value = true
}

function openCreateReturnFromSerial(): void {
  const s = quickLookupSerialResult.value
  if (!s) return
  isFreeWarranty.value = true
  originalWarrantyEnd.value = s.warranty_end_date || ''
  form.value = {
    id: 0,
    ticket_number: '',
    customer_id: s.customer_id,
    customer_name: s.customer_name,
    customer_phone: s.customer_phone,
    customer_address: s.customer_address,
    appliance_type: s.appliance_type,
    brand: s.brand,
    model: s.model,
    serial_number: s.serial_number,
    service_type: 'in_center',
    priority: 'warranty_return',
    status: 'pending',
    technician_id: null,
    fault_description: '',
    diagnosis_notes: '',
    inspection_fee: 0,
    labor_cost: 0,
    discount: 0,
    paid_amount: 0,
    payment_method: 'cash',
    warranty_months: 0,
    is_under_previous_warranty: 1,
    previous_ticket_number: s.previous_ticket_number,
    product_serial_id: s.product_serial_id,
    sales_invoice_id: s.sales_invoice_id,
    parts: [],
    notes: ''
  }
  modalOpen.value = true
}

function openEditReturn(ticket: MaintenanceTicket): void {
  const hasCharges =
    Number(ticket.total_cost || 0) > 0 ||
    Number(ticket.inspection_fee || 0) > 0 ||
    Number(ticket.labor_cost || 0) > 0 ||
    (ticket.parts && ticket.parts.length > 0)
  isFreeWarranty.value = !hasCharges
  originalWarrantyEnd.value = ticket.warranty_end_date || ''
  form.value = {
    id: ticket.id,
    ticket_number: ticket.ticket_number,
    customer_id: ticket.customer_id || null,
    customer_name: ticket.customer_name,
    customer_phone: ticket.customer_phone,
    customer_address: ticket.customer_address || '',
    appliance_type: ticket.appliance_type,
    brand: ticket.brand,
    model: ticket.model || '',
    serial_number: ticket.serial_number || '',
    service_type: ticket.service_type,
    priority: 'warranty_return',
    status: ticket.status,
    technician_id: ticket.technician_id || null,
    fault_description: ticket.fault_description || '',
    diagnosis_notes: ticket.diagnosis_notes || '',
    inspection_fee: Number(ticket.inspection_fee || 0),
    labor_cost: Number(ticket.labor_cost || 0),
    discount: Number(ticket.discount || 0),
    paid_amount: Number(ticket.paid_amount || 0),
    payment_method: ticket.payment_method || 'cash',
    warranty_months: Number(ticket.warranty_months || 0),
    is_under_previous_warranty: 1,
    previous_ticket_number: ticket.previous_ticket_number || '',
    product_serial_id: ticket.product_serial_id || null,
    sales_invoice_id: ticket.sales_invoice_id || null,
    parts: ticket.parts ? ticket.parts.map((p) => ({ ...p })) : [],
    notes: ticket.notes || ''
  }
  modalOpen.value = true
}

function addPartToReturn(): void {
  if (!selectedPartId.value) return
  const part = spareParts.value.find((p) => p.id === selectedPartId.value)
  if (!part) return
  const qty = Math.max(1, Number(selectedPartQty.value) || 1)
  const unitPrice = isFreeWarranty.value ? 0 : Number(part.selling_price || 0)
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
      unit_cost: Number(part.purchase_price || 0),
      unit_price: unitPrice,
      total_price: qty * unitPrice
    })
  }
  selectedPartId.value = ''
  selectedPartQty.value = 1
}

function removePart(idx: number): void {
  form.value.parts.splice(idx, 1)
}

async function handleSave(): Promise<void> {
  if (!form.value.customer_name.trim() || !form.value.fault_description.trim()) {
    swalError('يرجى إدخال سبب المرتجع / الشكوى الجديدة')
    return
  }
  saving.value = true
  try {
    const payload = plain({
      ...form.value,
      priority: 'warranty_return',
      is_under_previous_warranty: 1,
      inspection_fee: isFreeWarranty.value ? 0 : Number(form.value.inspection_fee || 0),
      labor_cost: isFreeWarranty.value ? 0 : Number(form.value.labor_cost || 0),
      discount: isFreeWarranty.value ? 0 : Number(form.value.discount || 0),
      paid_amount: isFreeWarranty.value ? 0 : Number(form.value.paid_amount || 0),
      parts_cost: isFreeWarranty.value ? 0 : partsCost.value,
      total_cost: totalCost.value
    })
    await window.api.saveTicket(payload)
    swalSuccess(form.value.id ? 'تم تحديث بيانات مرتجع الضمان' : 'تم تسجيل مرتجع الضمان بنجاح')
    modalOpen.value = false
    await loadData()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ'
    swalError(msg)
  } finally {
    saving.value = false
  }
}

async function handleDelete(ticket: MaintenanceTicket): Promise<void> {
  const ok = await swalConfirm(
    'حذف مرتجع الضمان',
    `هل أنت متأكد من حذف طلب مرتجع الضمان رقم (${ticket.ticket_number})؟`
  )
  if (!ok) return
  try {
    await window.api.deleteTicket(ticket.id)
    swalSuccess('تم الحذف بنجاح')
    await loadData()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'تعذر الحذف'
    swalError(msg)
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck class="w-6 h-6 text-amber-500" />
          مرتجعات الضمان
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          البحث السريع عن الأجهزة المشمولة بالضمان وفتح ومتابعة طلبات إعادة الصيانة بالضمان
        </p>
      </div>
      <button
        @click="loadData"
        class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
      >
        <RotateCcw class="w-4 h-4" />
        تحديث البيانات
      </button>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
      >
        <div class="text-xs text-slate-500 font-bold">إجمالي مرتجعات الضمان</div>
        <div class="text-2xl font-black text-slate-900 dark:text-white mt-1">
          {{ kpis.total }}
        </div>
      </div>
      <div
        class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 shadow-xs"
      >
        <div class="text-xs text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
          <Clock class="w-3.5 h-3.5" />
          قيد الإصلاح بالضمان
        </div>
        <div class="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
          {{ kpis.open }}
        </div>
      </div>
      <div
        class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 shadow-xs"
      >
        <div class="text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
          <CheckCircle2 class="w-3.5 h-3.5" />
          تم الإصلاح / التسليم
        </div>
        <div class="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
          {{ kpis.completed }}
        </div>
      </div>
      <div
        class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 shadow-xs"
      >
        <div class="text-xs text-blue-700 dark:text-blue-400 font-bold flex items-center gap-1">
          <ShieldCheck class="w-3.5 h-3.5" />
          أجهزة بضمان ساري حالياً
        </div>
        <div class="text-2xl font-black text-blue-700 dark:text-blue-300 mt-1">
          {{ kpis.activeCount }}
        </div>
      </div>
    </div>

    <!-- Quick Warranty Lookup Box -->
    <div
      class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 shadow-xs space-y-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert class="w-4 h-4 text-amber-500" />
            فتح مرتجع ضمان جديد (بحث سريع)
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">
            ابحث برقم التذكرة السابقة أو اسم العميل أو رقم الهاتف أو السيريال لإظهار الأجهزة السارية الضمان
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <div class="relative flex-1 min-w-[240px]">
          <Search class="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="quickLookupQuery"
            @keyup.enter="runSerialLookup"
            type="text"
            placeholder="مثال: 01012345678 أو TKT-00012 أو رقم السيريال..."
            class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold"
          />
        </div>
        <button
          @click="runSerialLookup"
          :disabled="quickLookupLoading"
          class="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
        >
          <Search class="w-4 h-4" />
          فحص سيريال / فاتورة مبيعات
        </button>
      </div>

      <!-- Serial / Invoice Warranty Result -->
      <div
        v-if="quickLookupSerialResult"
        class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div>
          <div class="font-black text-amber-900 dark:text-amber-200">
            ضمان مبيعات ساري: {{ quickLookupSerialResult.appliance_type }} {{ quickLookupSerialResult.brand }}
            {{ quickLookupSerialResult.model }}
          </div>
          <div class="text-amber-800 dark:text-amber-300 mt-0.5">
            العميل: <strong>{{ quickLookupSerialResult.customer_name }}</strong> ({{
              quickLookupSerialResult.customer_phone
            }}) — ينتهي الضمان: <strong>{{ quickLookupSerialResult.warranty_end_date }}</strong>
          </div>
        </div>
        <button
          @click="openCreateReturnFromSerial"
          class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus class="w-4 h-4" />
          فتح مرتجع ضمان
        </button>
      </div>

      <!-- Matching Active Warranty Tickets -->
      <div v-if="quickLookupMatches.length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div
          v-for="item in quickLookupMatches"
          :key="item.id"
          class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2.5 text-xs"
        >
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono font-black text-blue-600 dark:text-blue-400">
                {{ item.ticket_number }}
              </span>
              <span
                class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]"
              >
                متبقي {{ daysRemaining(item.warranty_end_date) }} يوم
              </span>
            </div>
            <div class="font-bold text-slate-900 dark:text-white">
              {{ item.customer_name }}
              <span class="text-slate-500 font-mono font-normal">({{ item.customer_phone }})</span>
            </div>
            <div class="text-slate-600 dark:text-slate-300">
              {{ item.appliance_type }} — {{ item.brand }}
              <span v-if="item.model">({{ item.model }})</span>
            </div>
            <div class="text-[11px] text-slate-500 flex items-center justify-between">
              <span>ينتهي الضمان: {{ item.warranty_end_date }}</span>
              <span v-if="item.technician_name">الفني: {{ item.technician_name }}</span>
            </div>
          </div>

          <button
            @click="openCreateReturnFromTicket(item)"
            class="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            فتح مرتجع ضمان لهذا {{ t('device') }}
          </button>
        </div>
      </div>
      <div
        v-else-if="quickLookupQuery.trim() && !quickLookupSerialResult"
        class="text-xs text-slate-500 text-center py-3"
      >
        لا توجد أجهزة سارية الضمان مطابقة لبحثك.
      </div>
    </div>

    <!-- Main Tabs & Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <div
        class="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
      >
        <div class="flex items-center gap-2">
          <button
            @click="activeTab = 'returns'"
            :class="[
              'px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors',
              activeTab === 'returns'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            ]"
          >
            سجل مرتجعات الضمان ({{ returnTickets.length }})
          </button>
          <button
            @click="activeTab = 'active_warranties'"
            :class="[
              'px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors',
              activeTab === 'active_warranties'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            ]"
          >
            الأجهزة السارية الضمان ({{ activeWarrantyTickets.length }})
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="فلترة الجدول..."
              class="pr-8 pl-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
            />
          </div>
          <select
            v-if="activeTab === 'returns'"
            v-model="statusFilter"
            class="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold"
          >
            <option value="all">كل الحالات</option>
            <option v-for="(info, key) in TICKET_STATUS_MAP" :key="key" :value="key">
              {{ info.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- Tab 1: Warranty Returns Table -->
      <div v-if="activeTab === 'returns'" class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold">
            <tr>
              <th class="p-3">رقم المرتجع</th>
              <th class="p-3">التذكرة الأصلية</th>
              <th class="p-3">{{ t('customer') }}</th>
              <th class="p-3">{{ t('device') }}</th>
              <th class="p-3">{{ t('technician') }}</th>
              <th class="p-3">الحالة</th>
              <th class="p-3">التكلفة</th>
              <th class="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-if="loading">
              <td colspan="8" class="p-8 text-center text-slate-400">جاري التحميل...</td>
            </tr>
            <tr v-else-if="filteredReturns.length === 0">
              <td colspan="8" class="p-8 text-center text-slate-400">
                لا توجد طلبات مرتجع ضمان مسجلة حالياً.
              </td>
            </tr>
            <tr
              v-for="tk in filteredReturns"
              :key="tk.id"
              class="hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <td class="p-3">
                <div class="font-mono font-black text-amber-600 dark:text-amber-400">
                  {{ tk.ticket_number }}
                </div>
                <div class="text-[10px] text-slate-400">{{ tk.created_at?.slice(0, 10) }}</div>
              </td>
              <td class="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                {{ tk.previous_ticket_number || '—' }}
              </td>
              <td class="p-3">
                <div class="font-bold">{{ tk.customer_name }}</div>
                <div class="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                  <Phone class="w-3 h-3" /> {{ tk.customer_phone }}
                </div>
              </td>
              <td class="p-3">
                <div class="font-bold">{{ tk.appliance_type }}</div>
                <div class="text-[11px] text-slate-500">{{ tk.brand }} {{ tk.model }}</div>
              </td>
              <td class="p-3">
                <span v-if="tk.technician_name" class="inline-flex items-center gap-1 font-bold">
                  <UserCheck class="w-3.5 h-3.5 text-blue-500" /> {{ tk.technician_name }}
                </span>
                <span v-else class="text-slate-400">غير محدد</span>
              </td>
              <td class="p-3">
                <span
                  :class="[
                    'px-2.5 py-1 rounded-full text-[11px] font-bold inline-block',
                    TICKET_STATUS_MAP[tk.status]?.color || 'bg-slate-100 text-slate-700'
                  ]"
                >
                  {{ TICKET_STATUS_MAP[tk.status]?.label || tk.status }}
                </span>
              </td>
              <td class="p-3">
                <span
                  v-if="Number(tk.total_cost || 0) === 0"
                  class="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]"
                >
                  مشمول بالضمان (0)
                </span>
                <span v-else class="font-bold">{{ tk.total_cost }} ج.م</span>
              </td>
              <td class="p-3">
                <div class="flex items-center justify-center gap-1.5">
                  <button
                    @click="openEditReturn(tk)"
                    title="متابعة / تعديل"
                    class="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 text-blue-600 cursor-pointer"
                  >
                    <Edit3 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="appStore.openPrintModal(tk, 'receipt', 'thermal80')"
                    title="طباعة إيصال"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Printer class="w-3.5 h-3.5" />
                  </button>
                  <button
                    v-if="canDelete"
                    @click="handleDelete(tk)"
                    title="حذف"
                    class="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 cursor-pointer"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tab 2: Active Warranties Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold">
            <tr>
              <th class="p-3">رقم التذكرة</th>
              <th class="p-3">{{ t('customer') }}</th>
              <th class="p-3">{{ t('device') }}</th>
              <th class="p-3">الفني السابق</th>
              <th class="p-3">انتهاء الضمان</th>
              <th class="p-3">المتبقي</th>
              <th class="p-3 text-center">إجراء</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-if="filteredActiveWarranties.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400">
                لا توجد أجهزة بضمان ساري مطابقة.
              </td>
            </tr>
            <tr
              v-for="tk in filteredActiveWarranties"
              :key="tk.id"
              class="hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <td class="p-3 font-mono font-black text-blue-600 dark:text-blue-400">
                {{ tk.ticket_number }}
              </td>
              <td class="p-3">
                <div class="font-bold">{{ tk.customer_name }}</div>
                <div class="text-[11px] text-slate-500 font-mono">{{ tk.customer_phone }}</div>
              </td>
              <td class="p-3">
                <div class="font-bold">{{ tk.appliance_type }}</div>
                <div class="text-[11px] text-slate-500">{{ tk.brand }} {{ tk.model }}</div>
              </td>
              <td class="p-3">{{ tk.technician_name || '—' }}</td>
              <td class="p-3 font-mono font-bold">
                <span class="inline-flex items-center gap-1">
                  <Calendar class="w-3.5 h-3.5 text-slate-400" />
                  {{ tk.warranty_end_date }}
                </span>
              </td>
              <td class="p-3">
                <span
                  class="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]"
                >
                  {{ daysRemaining(tk.warranty_end_date) }} يوم
                </span>
              </td>
              <td class="p-3 text-center">
                <button
                  @click="openCreateReturnFromTicket(tk)"
                  class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                  فتح مرتجع ضمان
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / Edit Warranty Return Modal (No backdrop-blur) -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden text-xs my-auto"
      >
        <div
          class="px-6 py-4 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-center justify-between"
        >
          <h3 class="font-black text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <ShieldCheck class="w-5 h-5 text-amber-600" />
            {{
              form.id
                ? `متابعة مرتجع الضمان (${form.ticket_number})`
                : 'تسجيل طلب مرتجع ضمان جديد'
            }}
          </h3>
          <button @click="modalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleSave" class="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          <!-- Summary Banner -->
          <div
            class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            <div>
              <div class="text-[10px] text-slate-500">التذكرة / الفاتورة الأصلية</div>
              <div class="font-mono font-black text-blue-600 dark:text-blue-400">
                {{ form.previous_ticket_number || '—' }}
              </div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500">{{ t('customer') }}</div>
              <div class="font-bold">{{ form.customer_name }}</div>
              <div class="text-[10px] text-slate-500 font-mono">{{ form.customer_phone }}</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500">{{ t('device') }}</div>
              <div class="font-bold">{{ form.appliance_type }}</div>
              <div class="text-[10px] text-slate-500">{{ form.brand }} {{ form.model }}</div>
            </div>
            <div v-if="originalWarrantyEnd">
              <div class="text-[10px] text-slate-500">الضمان الأصلي ساري حتى</div>
              <div class="font-mono font-bold text-emerald-600">{{ originalWarrantyEnd }}</div>
            </div>
          </div>

          <!-- Fault & Technician -->
          <div>
            <label class="block font-bold mb-1">سبب المرتجع / الشكوى الجديدة *</label>
            <textarea
              v-model="form.fault_description"
              required
              rows="2"
              placeholder="اكتب وصف العطل العائد أثناء الضمان..."
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block font-bold mb-1">{{ t('technician') }}</label>
              <select
                v-model="form.technician_id"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option :value="null">— غير محدد —</option>
                <option v-for="tech in technicians" :key="tech.id" :value="tech.id">
                  {{ tech.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">مكان الخدمة</label>
              <select
                v-model="form.service_type"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option value="in_center">داخل المركز</option>
                <option value="home_visit">صيانة منزلية</option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">حالة الطلب</label>
              <select
                v-model="form.status"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="(info, key) in TICKET_STATUS_MAP" :key="key" :value="key">
                  {{ info.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Warranty Coverage Toggle -->
          <div
            class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3"
          >
            <div class="font-bold flex items-center gap-2">
              <Wrench class="w-4 h-4 text-amber-500" />
              تغطية التكلفة
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                @click="isFreeWarranty = true"
                :class="[
                  'px-3 py-2 rounded-xl font-bold cursor-pointer border',
                  isFreeWarranty
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                ]"
              >
                إصلاح مجاني بالكامل تحت الضمان (0 ج.م)
              </button>
              <button
                type="button"
                @click="isFreeWarranty = false"
                :class="[
                  'px-3 py-2 rounded-xl font-bold cursor-pointer border',
                  !isFreeWarranty
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                ]"
              >
                إضافة تكلفة / قطع غيار خارج تغطية الضمان
              </button>
            </div>

            <div v-if="!isFreeWarranty" class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label class="block font-bold mb-1">تكلفة الكشف</label>
                <input
                  v-model.number="form.inspection_fee"
                  type="number"
                  min="0"
                  class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">المصنعية</label>
                <input
                  v-model.number="form.labor_cost"
                  type="number"
                  min="0"
                  class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">الخصم</label>
                <input
                  v-model.number="form.discount"
                  type="number"
                  min="0"
                  class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">المدفوع</label>
                <input
                  v-model.number="form.paid_amount"
                  type="number"
                  min="0"
                  class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
            </div>

            <!-- Optional Spare Parts -->
            <div class="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
              <div class="font-bold text-[11px] text-slate-600 dark:text-slate-300">
                قطع الغيار المستبدلة (اختياري)
              </div>
              <div class="flex flex-wrap gap-2">
                <select
                  v-model="selectedPartId"
                  class="flex-1 min-w-[180px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                >
                  <option value="">— اختر قطعة غيار من المخزن —</option>
                  <option v-for="p in spareParts" :key="p.id" :value="p.id">
                    {{ p.name }} (المتاح: {{ p.quantity }}) — {{ p.selling_price }} ج.م
                  </option>
                </select>
                <input
                  v-model.number="selectedPartQty"
                  type="number"
                  min="1"
                  class="w-20 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
                <button
                  type="button"
                  @click="addPartToReturn"
                  class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                >
                  إضافة
                </button>
              </div>
              <div v-if="form.parts.length > 0" class="space-y-1">
                <div
                  v-for="(p, idx) in form.parts"
                  :key="idx"
                  class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <span class="font-bold">{{ p.part_name }} × {{ p.quantity }}</span>
                  <div class="flex items-center gap-3">
                    <span>{{ p.total_price }} ج.م</span>
                    <button
                      type="button"
                      @click="removePart(idx)"
                      class="text-rose-600 font-bold cursor-pointer"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">تقرير الفحص / ملاحظات الفني</label>
            <textarea
              v-model="form.diagnosis_notes"
              rows="2"
              placeholder="ما تم فحصه وإصلاحه..."
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
            <div class="font-black text-sm">
              الإجمالي المطلوب:
              <span :class="totalCost === 0 ? 'text-emerald-600' : 'text-amber-600'">
                {{ totalCost === 0 ? '0 ج.م (مشمول بالضمان)' : `${totalCost} ج.م` }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="modalOpen = false"
                class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer disabled:opacity-60"
              >
                {{ saving ? 'جاري الحفظ...' : 'حفظ مرتجع الضمان' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
