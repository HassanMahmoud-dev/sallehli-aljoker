<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import type {
  FollowupItem,
  FollowupType,
  FollowupStatus,
  EarmoldOrder,
  EarmoldStatus,
  CochlearImplant,
  ImplantSession,
  Customer,
  Technician
} from '@shared/types'
import {
  CalendarClock,
  Clock,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Search,
  MessageCircle,
  Printer,
  RotateCcw,
  Trash2,
  User,
  Activity,
  Layers,
  Filter,
  Check,
  X,
  Send,
  Calendar,
  Sparkles,
  Cpu,
  PackageCheck
} from 'lucide-vue-next'

const appStore = useAppStore()
const { t } = useTerms()

// Active Tab: 'followups' | 'earmolds' | 'implants'
const activeTab = ref<'followups' | 'earmolds' | 'implants'>('followups')

// Data collections
const followups = ref<FollowupItem[]>([])
const earmolds = ref<EarmoldOrder[]>([])
const implants = ref<CochlearImplant[]>([])
const customers = ref<Customer[]>([])
const technicians = ref<Technician[]>([])

// Loading states
const loading = ref(false)

// Filters - Followups
const followupFilter = ref<'all' | 'today' | 'overdue' | 'upcoming' | 'completed'>('all')
const followupTypeFilter = ref<string>('all')
const followupSearch = ref('')

// Filters - Earmolds
const earmoldStatusFilter = ref<string>('all')
const earmoldSearch = ref('')

// Modals
const followupModalOpen = ref(false)
const completeFollowupModalOpen = ref(false)
const earmoldModalOpen = ref(false)
const earmoldStatusModalOpen = ref(false)
const implantModalOpen = ref(false)
const implantSessionModalOpen = ref(false)

// Selected items
const selectedFollowup = ref<FollowupItem | null>(null)
const selectedEarmold = ref<EarmoldOrder | null>(null)
const selectedImplant = ref<CochlearImplant | null>(null)

// Forms
const followupForm = ref<{
  id?: number
  patient_id: number
  device_id: number | null
  implant_id: number | null
  serial_no: string
  type: FollowupType
  due_date: string
  technician_id: number | null
  notes: string
  fitting_settings_json: string
}>({
  patient_id: 0,
  device_id: null,
  implant_id: null,
  serial_no: '',
  type: 'fitting',
  due_date: new Date().toISOString().slice(0, 10),
  technician_id: null,
  notes: '',
  fitting_settings_json: '{}'
})

const completeForm = ref<{
  id: number
  notes: string
  scheduleNext: boolean
  next_due_date: string
  next_type: FollowupType
}>({
  id: 0,
  notes: '',
  scheduleNext: false,
  next_due_date: '',
  next_type: 'periodic_check'
})

const earmoldForm = ref<{
  id?: number
  patient_id: number
  device_id: number | null
  ear: 'right' | 'left' | 'bilateral'
  mold_type: string
  material: string
  color: string
  vent_size: string
  tube_type: string
  impression_date: string
  lab_name: string
  expected_date: string
  lab_cost: number
  customer_price: number
  notes: string
}>({
  patient_id: 0,
  device_id: null,
  ear: 'right',
  mold_type: 'قالب كامل (Full Shell)',
  material: 'سليكون ناعم (Biopor / Silicone)',
  color: 'شفاف',
  vent_size: 'بدون تهوية (No Vent)',
  tube_type: 'عادي (Standard #13)',
  impression_date: new Date().toISOString().slice(0, 10),
  lab_name: '',
  expected_date: '',
  lab_cost: 0,
  customer_price: 0,
  notes: ''
})

const earmoldStatusForm = ref<{
  id: number
  status: EarmoldStatus
  sent_date: string
  expected_date: string
  received_date: string
  delivered_date: string
  notes: string
}>({
  id: 0,
  status: 'impression_taken',
  sent_date: '',
  expected_date: '',
  received_date: '',
  delivered_date: '',
  notes: ''
})

const implantForm = ref<{
  id?: number
  patient_id: number
  ear: 'right' | 'left'
  brand: string
  internal_model: string
  internal_serial: string
  surgery_date: string
  hospital: string
  surgeon: string
  activation_date: string
  processor_model: string
  processor_serial_no: string
  processor_warranty_end: string
  accessories_json: string
  notes: string
}>({
  patient_id: 0,
  ear: 'right',
  brand: 'Cochlear',
  internal_model: '',
  internal_serial: '',
  surgery_date: '',
  hospital: '',
  surgeon: '',
  activation_date: '',
  processor_model: '',
  processor_serial_no: '',
  processor_warranty_end: '',
  accessories_json: JSON.stringify({ magnet_strength: '2', coil_type: '', cable_length: '8cm', battery_type: 'Rechargeable' }),
  notes: ''
})

const implantSessionForm = ref<{
  id?: number
  implant_id: number
  patient_id: number
  session_date: string
  session_type: string
  technician_id: number | null
  examiner_name: string
  program_notes: string
  strategy: string
  impedance_status: string
  t_levels_summary: string
  c_levels_summary: string
  active_channels: number
  next_due_date: string
}>({
  implant_id: 0,
  patient_id: 0,
  session_date: new Date().toISOString().slice(0, 10),
  session_type: 'mapping',
  technician_id: null,
  examiner_name: '',
  program_notes: '',
  strategy: 'ACE (900 Hz)',
  impedance_status: 'سليمة وطبيعية في جميع القنوات (Normal)',
  t_levels_summary: '',
  c_levels_summary: '',
  active_channels: 22,
  next_due_date: ''
})

// Today string YYYY-MM-DD
const todayStr = new Date().toISOString().slice(0, 10)

// Load all data
async function loadData(): Promise<void> {
  loading.value = true
  try {
    const [allFollowups, allEarmolds, allImplants, custs, techs] = await Promise.all([
      window.api.listFollowups(),
      window.api.listEarmoldOrders(),
      window.api.listImplants(),
      window.api.listCustomers(''),
      window.api.listTechnicians()
    ])
    followups.value = allFollowups
    earmolds.value = allEarmolds
    implants.value = allImplants
    customers.value = custs
    technicians.value = techs
  } catch (err: unknown) {
    console.error('Error loading followups/earmolds data:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})

// Filtered followups
const filteredFollowups = computed(() => {
  return followups.value.filter((f) => {
    // Status / Date Filter
    if (followupFilter.value === 'today') {
      if (f.status !== 'pending' || f.due_date !== todayStr) return false
    } else if (followupFilter.value === 'overdue') {
      if (f.status !== 'pending' || f.due_date >= todayStr) return false
    } else if (followupFilter.value === 'upcoming') {
      if (f.status !== 'pending' || f.due_date <= todayStr) return false
    } else if (followupFilter.value === 'completed') {
      if (f.status !== 'completed') return false
    }

    // Type filter
    if (followupTypeFilter.value !== 'all' && f.type !== followupTypeFilter.value) {
      return false
    }

    // Search query
    if (followupSearch.value.trim()) {
      const q = followupSearch.value.trim().toLowerCase()
      const pName = (f.patient_name || '').toLowerCase()
      const pPhone = (f.patient_phone || '').toLowerCase()
      const sNo = (f.serial_no || '').toLowerCase()
      const notes = (f.notes || '').toLowerCase()
      if (!pName.includes(q) && !pPhone.includes(q) && !sNo.includes(q) && !notes.includes(q)) {
        return false
      }
    }

    return true
  })
})

// Counts
const dueTodayCount = computed(
  () => followups.value.filter((f) => f.status === 'pending' && f.due_date === todayStr).length
)
const overdueCount = computed(
  () => followups.value.filter((f) => f.status === 'pending' && f.due_date < todayStr).length
)
const overdueEarmoldsCount = computed(
  () => earmolds.value.filter((e) => e.status === 'sent_to_lab' && e.expected_date && e.expected_date < todayStr).length
)
const readyEarmoldsCount = computed(
  () => earmolds.value.filter((e) => e.status === 'received').length
)

// Filtered Earmolds
const filteredEarmolds = computed(() => {
  return earmolds.value.filter((e) => {
    if (earmoldStatusFilter.value !== 'all') {
      if (earmoldStatusFilter.value === 'overdue_lab') {
        if (e.status !== 'sent_to_lab' || !e.expected_date || e.expected_date >= todayStr) return false
      } else if (e.status !== earmoldStatusFilter.value) {
        return false
      }
    }
    if (earmoldSearch.value.trim()) {
      const q = earmoldSearch.value.trim().toLowerCase()
      const oNum = (e.order_number || '').toLowerCase()
      const pName = (e.patient_name || '').toLowerCase()
      const pPhone = (e.patient_phone || '').toLowerCase()
      const lab = (e.lab_name || '').toLowerCase()
      if (!oNum.includes(q) && !pName.includes(q) && !pPhone.includes(q) && !lab.includes(q)) {
        return false
      }
    }
    return true
  })
})

// Label helpers
function formatFollowupType(type: FollowupType): string {
  switch (type) {
    case 'fitting':
      return 'جلسة ضبط وبرمجة (Fitting)'
    case 'mapping':
      return 'برمجة قوقعة (Mapping)'
    case 'cleaning':
      return 'تنظيف وصيانة دورية'
    case 'battery_mold':
      return 'فحص بطارية / قالب'
    case 'periodic_check':
      return 'فحص ومتابعة دورية'
    case 'rehab':
      return 'جلسة تأهيل سمعي ونطقي'
    default:
      return type
  }
}

function formatEarmoldStatus(status: EarmoldStatus): { label: string; cls: string } {
  switch (status) {
    case 'impression_taken':
      return { label: 'أخذ المقاس', cls: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300' }
    case 'sent_to_lab':
      return { label: 'أُرسل للمعمل', cls: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-300' }
    case 'received':
      return { label: 'وصل من المعمل (جاهز للتسليم)', cls: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300' }
    case 'delivered':
      return { label: 'تم التسليم للمريض', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300' }
    case 'remake':
      return { label: 'إعادة تصنيع (Remake)', cls: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300' }
    default:
      return { label: status, cls: 'bg-slate-100 text-slate-700' }
  }
}

// WhatsApp helpers
function sendWhatsAppReminder(f: FollowupItem): void {
  if (!f.patient_phone) {
    swalError('لا يوجد رقم هاتف مسجل للمريض')
    return
  }
  const cleanPhone = f.patient_phone.replace(/\D/g, '')
  const intlPhone = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone
  const centerName = appStore.settings.center_name || 'مركز السمعيات'
  const text = encodeURIComponent(
    `السلام عليكم ورحمة الله، مرحباً أستاذ/ة ${f.patient_name || ''}، نود تذكيركم بموعدكم القادم (${formatFollowupType(f.type)}) في ${centerName} بتاريخ ${f.due_date}. ونتمنى لكم دوام الصحة والعافية.`
  )
  window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank')
}

function sendEarmoldReadyWhatsApp(order: EarmoldOrder): void {
  if (!order.patient_phone) {
    swalError('لا يوجد رقم هاتف مسجل للمريض')
    return
  }
  const cleanPhone = order.patient_phone.replace(/\D/g, '')
  const intlPhone = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone
  const centerName = appStore.settings.center_name || 'مركز السمعيات'
  const text = encodeURIComponent(
    `السلام عليكم ورحمة الله، أستاذ/ة ${order.patient_name || ''}، نود إعلامكم بأن قالب الأذن الخاص بكم (طلب رقم ${order.order_number}) قد وصل من المعمل وهو جاهز للتسليم والتركيب في ${centerName}. أهلاً ومرحباً بكم.`
  )
  window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank')
}

// Open modals
function openNewFollowupModal(): void {
  followupForm.value = {
    patient_id: customers.value[0]?.id || 0,
    device_id: null,
    implant_id: null,
    serial_no: '',
    type: 'fitting',
    due_date: new Date().toISOString().slice(0, 10),
    technician_id: technicians.value[0]?.id || null,
    notes: '',
    fitting_settings_json: '{}'
  }
  followupModalOpen.value = true
}

function openCompleteModal(f: FollowupItem): void {
  selectedFollowup.value = f
  const nextDate = new Date()
  nextDate.setMonth(nextDate.getMonth() + 3)
  completeForm.value = {
    id: f.id,
    notes: '',
    scheduleNext: true,
    next_due_date: nextDate.toISOString().slice(0, 10),
    next_type: 'periodic_check'
  }
  completeFollowupModalOpen.value = true
}

async function handleCompleteFollowup(): Promise<void> {
  try {
    await window.api.completeFollowup(plain(completeForm.value))
    completeFollowupModalOpen.value = false
    await loadData()
    swalSuccess('تم تسجيل إتمام الموعد وجدولة المتابعة القادمة بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'حدث خطأ أثناء إتمام المتابعة')
  }
}

async function handleSaveFollowup(): Promise<void> {
  if (!followupForm.value.patient_id) {
    swalError('يرجى اختيار المريض')
    return
  }
  if (!followupForm.value.due_date) {
    swalError('يرجى تحديد تاريخ الاستحقاق')
    return
  }
  try {
    await window.api.saveFollowup(plain(followupForm.value))
    followupModalOpen.value = false
    await loadData()
    swalSuccess('تم حفظ موعد المتابعة بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر حفظ المتابعة')
  }
}

async function handleDeleteFollowup(id: number): Promise<void> {
  const confirmed = await swalConfirm('حذف موعد المتابعة', 'هل أنت متأكد من رغبتك في حذف هذا الموعد؟')
  if (!confirmed) return
  try {
    await window.api.deleteFollowup(id)
    await loadData()
    swalSuccess('تم الحذف بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر الحذف')
  }
}

// Earmold Actions
function openNewEarmoldModal(): void {
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 5)
  earmoldForm.value = {
    patient_id: customers.value[0]?.id || 0,
    device_id: null,
    ear: 'right',
    mold_type: 'قالب كامل (Full Shell)',
    material: 'سليكون ناعم (Biopor / Silicone)',
    color: 'شفاف',
    vent_size: 'بدون تهوية (No Vent)',
    tube_type: 'عادي (Standard #13)',
    impression_date: new Date().toISOString().slice(0, 10),
    lab_name: '',
    expected_date: nextWeek.toISOString().slice(0, 10),
    lab_cost: 0,
    customer_price: 0,
    notes: ''
  }
  earmoldModalOpen.value = true
}

async function handleSaveEarmold(): Promise<void> {
  if (!earmoldForm.value.patient_id) {
    swalError('يرجى اختيار المريض')
    return
  }
  try {
    await window.api.saveEarmoldOrder(plain(earmoldForm.value))
    earmoldModalOpen.value = false
    await loadData()
    swalSuccess('تم إنشاء طلب القالب بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر حفظ طلب القالب')
  }
}

function openEarmoldStatusModal(order: EarmoldOrder): void {
  selectedEarmold.value = order
  earmoldStatusForm.value = {
    id: order.id,
    status: order.status,
    sent_date: order.sent_date || todayStr,
    expected_date: order.expected_date || '',
    received_date: order.received_date || todayStr,
    delivered_date: order.delivered_date || todayStr,
    notes: order.notes || ''
  }
  earmoldStatusModalOpen.value = true
}

async function handleUpdateEarmoldStatus(): Promise<void> {
  try {
    await window.api.updateEarmoldOrderStatus(plain(earmoldStatusForm.value))
    earmoldStatusModalOpen.value = false
    await loadData()
    swalSuccess('تم تحديث حالة طلب القالب بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر تحديث الحالة')
  }
}

async function handleRemakeEarmold(order: EarmoldOrder): Promise<void> {
  const confirmed = await swalConfirm(
    'إعادة تصنيع القالب (Remake)',
    `هل تريد تحويل طلب القالب ${order.order_number} إلى إعادة تصنيع وإنشاء طلب بديل مرتبط به تلقائياً؟`
  )
  if (!confirmed) return
  try {
    await window.api.remakeEarmoldOrder({
      id: order.id,
      reason: 'عدم ملاءمة المقاس أو مشاكل Feedback في الصوت',
      notes: 'إعادة تصنيع بناءً على طلب الأخصائي'
    })
    await loadData()
    swalSuccess('تم تسجيل إعادة التصنيع وإنشاء الطلب الجديد بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر إعادة تصنيع القالب')
  }
}

async function handleDeleteEarmold(id: number): Promise<void> {
  const confirmed = await swalConfirm('حذف طلب القالب', 'هل أنت متأكد من حذف هذا الطلب؟')
  if (!confirmed) return
  try {
    await window.api.deleteEarmoldOrder(id)
    await loadData()
    swalSuccess('تم الحذف بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر الحذف')
  }
}

// Implants Actions
function openNewImplantModal(): void {
  implantForm.value = {
    patient_id: customers.value[0]?.id || 0,
    ear: 'right',
    brand: 'Cochlear',
    internal_model: 'Profile Plus (CI622)',
    internal_serial: '',
    surgery_date: '',
    hospital: '',
    surgeon: '',
    activation_date: '',
    processor_model: 'Nucleus 8',
    processor_serial_no: '',
    processor_warranty_end: '',
    accessories_json: JSON.stringify({ magnet_strength: '2', coil_type: 'Slimline', cable_length: '8cm', battery_type: 'Rechargeable Standard' }),
    notes: ''
  }
  implantModalOpen.value = true
}

async function handleSaveImplant(): Promise<void> {
  if (!implantForm.value.patient_id) {
    swalError('يرجى اختيار المريض')
    return
  }
  try {
    await window.api.saveImplant(plain(implantForm.value))
    implantModalOpen.value = false
    await loadData()
    swalSuccess('تم حفظ بيانات زراعة القوقعة بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر حفظ بيانات القوقعة')
  }
}

function openAddSessionModal(imp: CochlearImplant): void {
  selectedImplant.value = imp
  const nextDate = new Date()
  nextDate.setMonth(nextDate.getMonth() + 3)
  implantSessionForm.value = {
    implant_id: imp.id,
    patient_id: imp.patient_id,
    session_date: todayStr,
    session_type: 'mapping',
    technician_id: technicians.value[0]?.id || null,
    examiner_name: '',
    program_notes: '',
    strategy: 'ACE (900 Hz / 8 Maxima)',
    impedance_status: 'سليمة وطبيعية في جميع القنوات (Normal)',
    t_levels_summary: '110 - 135 CL',
    c_levels_summary: '160 - 195 CL',
    active_channels: 22,
    next_due_date: nextDate.toISOString().slice(0, 10)
  }
  implantSessionModalOpen.value = true
}

async function handleSaveImplantSession(): Promise<void> {
  try {
    const payload = {
      implant_id: implantSessionForm.value.implant_id,
      patient_id: implantSessionForm.value.patient_id,
      session_date: implantSessionForm.value.session_date,
      session_type: implantSessionForm.value.session_type,
      technician_id: implantSessionForm.value.technician_id,
      examiner_name: implantSessionForm.value.examiner_name,
      program_notes: implantSessionForm.value.program_notes,
      thresholds: {
        strategy: implantSessionForm.value.strategy,
        impedance_status: implantSessionForm.value.impedance_status,
        t_levels: implantSessionForm.value.t_levels_summary,
        c_levels: implantSessionForm.value.c_levels_summary,
        active_channels: implantSessionForm.value.active_channels
      },
      next_due_date: implantSessionForm.value.next_due_date || undefined
    }
    await window.api.saveImplantSession(plain(payload))
    implantSessionModalOpen.value = false
    await loadData()
    swalSuccess('تم حفظ جلسة البرمجة وجدولة موعد المتابعة القادم تلقائياً')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر حفظ الجلسة')
  }
}

async function handleDeleteImplant(id: number): Promise<void> {
  const confirmed = await swalConfirm('حذف سجل القوقعة', 'هل أنت متأكد من حذف هذا السجل وجلساته؟')
  if (!confirmed) return
  try {
    await window.api.deleteImplant(id)
    await loadData()
    swalSuccess('تم الحذف بنجاح')
  } catch (err: unknown) {
    swalError(err instanceof Error ? err.message : 'تعذر الحذف')
  }
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Page Header & KPI Cards -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
          <CalendarClock class="w-7 h-7 text-blue-600" />
          {{ t('followupsPage') || 'المتابعات والقوالب والقوقعة السمعية' }}
        </h1>
        <p class="text-xs text-slate-500 mt-1">
          إدارة جلسات ضبط وبرمجة السماعات، ومتابعة قوالب الأذن مع المعامل، وسجل زراعة وبرمجة القوقعة
        </p>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex items-center gap-2.5 flex-wrap">
        <button
          v-if="activeTab === 'followups'"
          @click="openNewFollowupModal"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          جدولة موعد متابعة / ضبط
        </button>

        <button
          v-else-if="activeTab === 'earmolds'"
          @click="openNewEarmoldModal"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          طلب قالب أذن جديد
        </button>

        <button
          v-else-if="activeTab === 'implants'"
          @click="openNewImplantModal"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          تسجيل زراعة قوقعة جديدة
        </button>
      </div>
    </div>

    <!-- Alert / Stat Banners -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        @click="activeTab = 'followups'; followupFilter = 'today'"
        class="p-4 rounded-2xl border transition-all cursor-pointer"
        :class="
          dueTodayCount > 0
            ? 'bg-amber-500/10 border-amber-300 dark:border-amber-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        "
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500">مستحقة اليوم</span>
          <Calendar class="w-4 h-4 text-amber-500" />
        </div>
        <div class="text-2xl font-black mt-2 text-slate-900 dark:text-white">{{ dueTodayCount }}</div>
        <p class="text-[11px] text-slate-400 mt-0.5">جلسات ضبط وفحوصات اليوم</p>
      </div>

      <div
        @click="activeTab = 'followups'; followupFilter = 'overdue'"
        class="p-4 rounded-2xl border transition-all cursor-pointer"
        :class="
          overdueCount > 0
            ? 'bg-rose-500/10 border-rose-300 dark:border-rose-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        "
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500">متابعات متأخرة</span>
          <AlertTriangle class="w-4 h-4 text-rose-500" />
        </div>
        <div class="text-2xl font-black mt-2 text-rose-600 dark:text-rose-400">{{ overdueCount }}</div>
        <p class="text-[11px] text-slate-400 mt-0.5">تجاوزت الموعد المحدد</p>
      </div>

      <div
        @click="activeTab = 'earmolds'; earmoldStatusFilter = 'overdue_lab'"
        class="p-4 rounded-2xl border transition-all cursor-pointer"
        :class="
          overdueEarmoldsCount > 0
            ? 'bg-orange-500/10 border-orange-300 dark:border-orange-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        "
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500">قوالب متأخرة بالمعمل</span>
          <Clock class="w-4 h-4 text-orange-500" />
        </div>
        <div class="text-2xl font-black mt-2 text-orange-600 dark:text-orange-400">{{ overdueEarmoldsCount }}</div>
        <p class="text-[11px] text-slate-400 mt-0.5">تجاوزت تاريخ التسليم المتوقع</p>
      </div>

      <div
        @click="activeTab = 'earmolds'; earmoldStatusFilter = 'received'"
        class="p-4 rounded-2xl border transition-all cursor-pointer"
        :class="
          readyEarmoldsCount > 0
            ? 'bg-emerald-500/10 border-emerald-300 dark:border-emerald-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        "
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500">قوالب بانتظار التسليم</span>
          <PackageCheck class="w-4 h-4 text-emerald-500" />
        </div>
        <div class="text-2xl font-black mt-2 text-emerald-600 dark:text-emerald-400">{{ readyEarmoldsCount }}</div>
        <p class="text-[11px] text-slate-400 mt-0.5">وصلت المركز وجاهزة للمريض</p>
      </div>
    </div>

    <!-- Main Navigation Tabs -->
    <div class="flex border-b border-slate-200 dark:border-slate-800 gap-2">
      <button
        @click="activeTab = 'followups'"
        class="flex items-center gap-2 px-5 py-3 font-bold text-xs border-b-2 transition-all cursor-pointer"
        :class="
          activeTab === 'followups'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
        "
      >
        <CalendarClock class="w-4 h-4" />
        مواعيد المتابعة والضبط ({{ followups.length }})
      </button>

      <button
        @click="activeTab = 'earmolds'"
        class="flex items-center gap-2 px-5 py-3 font-bold text-xs border-b-2 transition-all cursor-pointer"
        :class="
          activeTab === 'earmolds'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
        "
      >
        <Layers class="w-4 h-4" />
        طلبات قوالب الأذن ({{ earmolds.length }})
      </button>

      <button
        @click="activeTab = 'implants'"
        class="flex items-center gap-2 px-5 py-3 font-bold text-xs border-b-2 transition-all cursor-pointer"
        :class="
          activeTab === 'implants'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
        "
      >
        <Cpu class="w-4 h-4" />
        زارعو القوقعة وجلسات البرمجة ({{ implants.length }})
      </button>
    </div>

    <!-- TAB 1: FOLLOW-UPS & FITTING SCHEDULE -->
    <div v-if="activeTab === 'followups'" class="space-y-4">
      <!-- Filter Bar -->
      <div class="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
          <button
            v-for="f in [
              { id: 'all', label: 'الكل' },
              { id: 'today', label: 'اليوم' },
              { id: 'overdue', label: 'متأخرة' },
              { id: 'upcoming', label: 'القادمة' },
              { id: 'completed', label: 'المكتملة' }
            ]"
            :key="f.id"
            @click="followupFilter = f.id as any"
            class="px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer"
            :class="
              followupFilter === f.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            "
          >
            {{ f.label }}
          </button>

          <span class="text-slate-300 dark:text-slate-700 mx-1">|</span>

          <select
            v-model="followupTypeFilter"
            class="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs border-none outline-none cursor-pointer"
          >
            <option value="all">كل أنواع المتابعات</option>
            <option value="fitting">جلسة ضبط وبرمجة (Fitting)</option>
            <option value="mapping">برمجة قوقعة (Mapping)</option>
            <option value="periodic_check">فحص ومتابعة دورية</option>
            <option value="cleaning">تنظيف وصيانة دورية</option>
            <option value="rehab">تأهيل سمعي ونطقي</option>
          </select>
        </div>

        <div class="relative w-full md:w-72">
          <Search class="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
          <input
            v-model="followupSearch"
            type="text"
            placeholder="بحث باسم المريض أو الهاتف..."
            class="w-full pr-9 pl-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs border border-transparent focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <!-- Followups Table -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <table class="w-full text-right text-xs border-collapse">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th class="py-3 px-4">المريض / العميل</th>
              <th class="py-3 px-4">نوع الموعد</th>
              <th class="py-3 px-4">تاريخ الاستحقاق</th>
              <th class="py-3 px-4">الأخصائي</th>
              <th class="py-3 px-4">ملاحظات / إعدادات</th>
              <th class="py-3 px-4">الحالة</th>
              <th class="py-3 px-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="item in filteredFollowups"
              :key="item.id"
              class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all"
            >
              <td class="py-3 px-4">
                <div class="font-black text-slate-900 dark:text-white">{{ item.patient_name || '—' }}</div>
                <div class="text-[11px] font-mono text-slate-500">{{ item.patient_phone || '—' }}</div>
              </td>
              <td class="py-3 px-4">
                <span class="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400">
                  {{ formatFollowupType(item.type) }}
                </span>
                <div v-if="item.serial_no" class="text-[10px] text-slate-400 font-mono mt-0.5">
                  سيريال: {{ item.serial_no }}
                </div>
              </td>
              <td class="py-3 px-4">
                <span
                  class="font-mono font-bold px-2 py-0.5 rounded-lg text-xs"
                  :class="
                    item.status === 'completed'
                      ? 'text-slate-500 bg-slate-100 dark:bg-slate-800'
                      : item.due_date < todayStr
                        ? 'text-rose-700 bg-rose-100 dark:bg-rose-950/60 dark:text-rose-400'
                        : item.due_date === todayStr
                          ? 'text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-400'
                          : 'text-slate-700 dark:text-slate-300'
                  "
                >
                  {{ item.due_date }}
                </span>
              </td>
              <td class="py-3 px-4 text-slate-600 dark:text-slate-400">
                {{ item.technician_name || '—' }}
              </td>
              <td class="py-3 px-4 max-w-xs truncate text-slate-500">
                {{ item.notes || '—' }}
              </td>
              <td class="py-3 px-4">
                <span
                  v-if="item.status === 'completed'"
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full"
                >
                  <CheckCircle2 class="w-3.5 h-3.5" />
                  مكتملة
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full"
                >
                  <Clock class="w-3.5 h-3.5" />
                  قيد الانتظار
                </span>
              </td>
              <td class="py-3 px-4 text-center">
                <div class="flex items-center justify-center gap-2">
                  <button
                    v-if="item.status === 'pending'"
                    @click="openCompleteModal(item)"
                    title="تسجيل إتمام الجلسة"
                    class="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 cursor-pointer"
                  >
                    <Check class="w-3.5 h-3.5" />
                  </button>

                  <button
                    @click="sendWhatsAppReminder(item)"
                    title="تذكير المريض عبر واتساب"
                    class="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
                  >
                    <MessageCircle class="w-3.5 h-3.5" />
                  </button>

                  <button
                    @click="handleDeleteFollowup(item.id)"
                    title="حذف"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filteredFollowups.length === 0">
              <td colspan="7" class="py-10 text-center text-slate-400">
                لا توجد مواعيد متابعة مطابقة للبحث أو الفلتر
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: EARMOLDS BOARD -->
    <div v-else-if="activeTab === 'earmolds'" class="space-y-4">
      <!-- Filter Bar -->
      <div class="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
          <button
            v-for="s in [
              { id: 'all', label: 'الكل' },
              { id: 'impression_taken', label: 'أخذ المقاس' },
              { id: 'sent_to_lab', label: 'لدى المعمل' },
              { id: 'overdue_lab', label: 'متأخر بالمعمل' },
              { id: 'received', label: 'وصل المركز' },
              { id: 'delivered', label: 'تم التسليم' },
              { id: 'remake', label: 'إعادة تصنيع' }
            ]"
            :key="s.id"
            @click="earmoldStatusFilter = s.id"
            class="px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer"
            :class="
              earmoldStatusFilter === s.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            "
          >
            {{ s.label }}
          </button>
        </div>

        <div class="relative w-full md:w-72">
          <Search class="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
          <input
            v-model="earmoldSearch"
            type="text"
            placeholder="بحث برقم الطلب أو المريض أو المعمل..."
            class="w-full pr-9 pl-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs border border-transparent focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <!-- Earmolds Table -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <table class="w-full text-right text-xs border-collapse">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th class="py-3 px-4">رقم الطلب</th>
              <th class="py-3 px-4">المريض</th>
              <th class="py-3 px-4">الأذن</th>
              <th class="py-3 px-4">نوع ومادة القالب</th>
              <th class="py-3 px-4">المعمل / التواريخ</th>
              <th class="py-3 px-4">السعر / التكلفة</th>
              <th class="py-3 px-4">الحالة</th>
              <th class="py-3 px-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="order in filteredEarmolds"
              :key="order.id"
              class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all"
            >
              <td class="py-3 px-4 font-mono font-black text-slate-900 dark:text-white">
                {{ order.order_number }}
                <div v-if="order.remake_of_id" class="text-[10px] text-rose-500 font-sans">
                  إعادة تصنيع للطلب #{{ order.remake_of_id }}
                </div>
              </td>
              <td class="py-3 px-4">
                <div class="font-bold text-slate-900 dark:text-white">{{ order.patient_name || '—' }}</div>
                <div class="text-[11px] font-mono text-slate-500">{{ order.patient_phone || '—' }}</div>
              </td>
              <td class="py-3 px-4">
                <span
                  class="font-bold px-2 py-0.5 rounded-lg text-[11px]"
                  :class="
                    order.ear === 'right'
                      ? 'text-red-700 bg-red-100 dark:bg-red-950/60'
                      : order.ear === 'left'
                        ? 'text-blue-700 bg-blue-100 dark:bg-blue-950/60'
                        : 'text-purple-700 bg-purple-100 dark:bg-purple-950/60'
                  "
                >
                  {{
                    order.ear === 'bilateral'
                      ? 'الأذنين'
                      : order.ear === 'left'
                        ? 'يسار (Left)'
                        : 'يمين (Right)'
                  }}
                </span>
              </td>
              <td class="py-3 px-4">
                <div class="font-bold">{{ order.mold_type || 'قالب عادي' }}</div>
                <div class="text-[11px] text-slate-500">{{ order.material || 'سليكون' }} - {{ order.vent_size || 'بدون تهوية' }}</div>
              </td>
              <td class="py-3 px-4">
                <div class="font-bold text-slate-700 dark:text-slate-300">{{ order.lab_name || 'المعمل الداخلي' }}</div>
                <div class="text-[10px] text-slate-400">
                  المقاس: {{ order.impression_date }}
                  <span v-if="order.expected_date" class="mr-1">| متوقع: {{ order.expected_date }}</span>
                </div>
              </td>
              <td class="py-3 px-4 font-mono">
                <div class="font-black text-slate-900 dark:text-white">{{ order.customer_price }} ج.م</div>
                <div class="text-[10px] text-slate-400">تكلفة: {{ order.lab_cost }} ج.م</div>
              </td>
              <td class="py-3 px-4">
                <span
                  class="inline-block px-2.5 py-1 rounded-xl text-[11px] font-black border"
                  :class="formatEarmoldStatus(order.status).cls"
                >
                  {{ formatEarmoldStatus(order.status).label }}
                </span>
              </td>
              <td class="py-3 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button
                    @click="openEarmoldStatusModal(order)"
                    title="تحديث حالة القالب"
                    class="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 hover:bg-blue-200 cursor-pointer"
                  >
                    <RotateCcw class="w-3.5 h-3.5" />
                  </button>

                  <button
                    @click="appStore.openEarmoldPrintModal(order)"
                    title="طباعة أمر الشغل / الإيصال"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                  >
                    <Printer class="w-3.5 h-3.5" />
                  </button>

                  <button
                    v-if="order.status === 'received'"
                    @click="sendEarmoldReadyWhatsApp(order)"
                    title="إشعار المريض بجاهزية القالب عبر واتساب"
                    class="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
                  >
                    <MessageCircle class="w-3.5 h-3.5" />
                  </button>

                  <button
                    v-if="order.status !== 'remake'"
                    @click="handleRemakeEarmold(order)"
                    title="إعادة تصنيع (Remake)"
                    class="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 hover:bg-rose-200 cursor-pointer"
                  >
                    <RotateCcw class="w-3.5 h-3.5 text-rose-600" />
                  </button>

                  <button
                    @click="handleDeleteEarmold(order.id)"
                    title="حذف"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filteredEarmolds.length === 0">
              <td colspan="8" class="py-10 text-center text-slate-400">
                لا توجد طلبات قوالب مطابقة للبحث أو الفلتر
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: COCHLEAR IMPLANTS & MAPPINGS -->
    <div v-else-if="activeTab === 'implants'" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="imp in implants"
          :key="imp.id"
          class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs"
        >
          <div class="flex items-start justify-between">
            <div>
              <span
                class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider"
                :class="
                  imp.ear === 'right'
                    ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400'
                    : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                "
              >
                {{ imp.ear === 'right' ? 'الأذن اليمنى (Right)' : 'الأذن اليسرى (Left)' }}
              </span>
              <h3 class="font-black text-sm text-slate-900 dark:text-white mt-1">
                {{ imp.patient_name || 'مريض غير مسمى' }}
              </h3>
              <p class="text-[11px] font-mono text-slate-500">{{ imp.patient_phone || '—' }}</p>
            </div>

            <div class="text-left font-black text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-xl">
              {{ imp.brand }}
            </div>
          </div>

          <div class="space-y-1.5 text-[11px] bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <div class="flex justify-between">
              <span class="text-slate-500">الموديل الداخلي:</span>
              <span class="font-bold">{{ imp.internal_model || '—' }} ({{ imp.internal_serial || '—' }})</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">معالج الصوت الخارجي:</span>
              <span class="font-bold text-slate-900 dark:text-white">{{ imp.processor_model || '—' }}</span>
            </div>
            <div v-if="imp.processor_serial_no" class="flex justify-between">
              <span class="text-slate-500">سيريال المعالج:</span>
              <span class="font-mono font-bold">{{ imp.processor_serial_no }}</span>
            </div>
            <div v-if="imp.processor_warranty_end" class="flex justify-between">
              <span class="text-slate-500">سريان الضمان:</span>
              <span class="font-mono text-emerald-600 font-bold">{{ imp.processor_warranty_end }}</span>
            </div>
            <div v-if="imp.surgery_date" class="flex justify-between">
              <span class="text-slate-500">تاريخ الجراحة:</span>
              <span>{{ imp.surgery_date }} (د. {{ imp.surgeon || '—' }})</span>
            </div>
          </div>

          <!-- Sessions Summary -->
          <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
            <span class="text-slate-500 font-bold">
              جلسات البرمجة ({{ imp.sessions?.length || 0 }})
            </span>
            <button
              @click="openAddSessionModal(imp)"
              class="flex items-center gap-1 text-blue-600 font-bold hover:underline cursor-pointer"
            >
              <PlusCircle class="w-3.5 h-3.5" />
              جلسة جديدة
            </button>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-[10px] text-slate-400">
              آخر برمجة: {{ imp.sessions?.[0]?.session_date || 'لا يوجد' }}
            </span>
            <button
              @click="handleDeleteImplant(imp.id)"
              class="text-rose-600 hover:text-rose-700 text-xs cursor-pointer"
            >
              حذف
            </button>
          </div>
        </div>

        <div v-if="implants.length === 0" class="col-span-full py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          لا يوجد زارعو قوقعة مسجلون حتى الآن. اضغط «تسجيل زراعة قوقعة جديدة» للبدء.
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD / SCHEDULE FOLLOWUP                           -->
    <!-- ======================================================== -->
    <div
      v-if="followupModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <CalendarClock class="w-4 h-4 text-blue-600" />
            جدولة موعد متابعة / جلسة ضبط وبرمجة
          </h3>
          <button @click="followupModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleSaveFollowup" class="space-y-3.5">
          <div>
            <label class="block font-bold mb-1">المريض *</label>
            <select
              v-model="followupForm.patient_id"
              required
              class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option v-for="c in customers" :key="c.id" :value="c.id">
                {{ c.name }} ({{ c.phone }})
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">نوع المتابعة *</label>
              <select
                v-model="followupForm.type"
                required
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="fitting">جلسة ضبط وبرمجة (Fitting)</option>
                <option value="mapping">برمجة قوقعة (Mapping)</option>
                <option value="periodic_check">فحص ومتابعة دورية</option>
                <option value="cleaning">تنظيف وصيانة دورية</option>
                <option value="battery_mold">فحص بطارية / قالب</option>
                <option value="rehab">تأهيل سمعي ونطقي</option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">تاريخ الاستحقاق *</label>
              <input
                v-model="followupForm.due_date"
                type="date"
                required
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">الأخصائي المشرف</label>
              <select
                v-model="followupForm.technician_id"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option :value="null">بدون تحديد</option>
                <option v-for="t in technicians" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">رقم السيريال (اختياري)</label>
              <input
                v-model="followupForm.serial_no"
                type="text"
                placeholder="سيريال السماعة أو المعالج"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات / تعليمات الجلسة</label>
            <textarea
              v-model="followupForm.notes"
              rows="2"
              placeholder="مثال: زيادة مستوى الـ Gain بنسبة 10%، مراجعة برنامج الضوضاء..."
              class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            ></textarea>
          </div>

          <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              @click="followupModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
            >
              حفظ الموعد
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: COMPLETE FOLLOWUP & SCHEDULE NEXT                 -->
    <!-- ======================================================== -->
    <div
      v-if="completeFollowupModalOpen && selectedFollowup"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2 text-emerald-600">
            <CheckCircle2 class="w-4 h-4" />
            تسجيل إتمام الجلسة للمريض: {{ selectedFollowup.patient_name }}
          </h3>
          <button @click="completeFollowupModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleCompleteFollowup" class="space-y-3.5">
          <div>
            <label class="block font-bold mb-1">ملاحظات ما بعد الجلسة / استجابة المريض</label>
            <textarea
              v-model="completeForm.notes"
              rows="3"
              placeholder="مثال: تم ضبط مستوى الصوت وتمت تجربة السماعة مع المريض بدون أي تشويش..."
              class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            ></textarea>
          </div>

          <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
            <label class="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
              <input type="checkbox" v-model="completeForm.scheduleNext" class="w-4 h-4 text-blue-600 rounded" />
              جدولة موعد المتابعة القادم تلقائياً
            </label>

            <div v-if="completeForm.scheduleNext" class="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label class="block text-[10px] text-slate-500 mb-0.5">تاريخ الموعد القادم</label>
                <input
                  v-model="completeForm.next_due_date"
                  type="date"
                  class="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label class="block text-[10px] text-slate-500 mb-0.5">نوع المتابعة</label>
                <select
                  v-model="completeForm.next_type"
                  class="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <option value="periodic_check">فحص دوري</option>
                  <option value="fitting">جلسة ضبط إضافية</option>
                  <option value="mapping">برمجة قوقعة</option>
                  <option value="cleaning">تنظيف وصيانة</option>
                </select>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              @click="completeFollowupModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
            >
              تأكيد إتمام الجلسة
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD EARMOLD ORDER                                 -->
    <!-- ======================================================== -->
    <div
      v-if="earmoldModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <Layers class="w-4 h-4 text-blue-600" />
            إنشاء طلب قالب أذن جديد (Earmold Order)
          </h3>
          <button @click="earmoldModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleSaveEarmold" class="space-y-3.5">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">المريض *</label>
              <select
                v-model="earmoldForm.patient_id"
                required
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option v-for="c in customers" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.phone }})
                </option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">جهة الأذن *</label>
              <select
                v-model="earmoldForm.ear"
                required
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="right">يمين (Right Ear)</option>
                <option value="left">يسار (Left Ear)</option>
                <option value="bilateral">الأذنين معاً (Bilateral)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">نوع القالب *</label>
              <select
                v-model="earmoldForm.mold_type"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="قالب كامل (Full Shell)">قالب كامل (Full Shell)</option>
                <option value="نصف قالب (Half Shell)">نصف قالب (Half Shell)</option>
                <option value="قالب هيكلي (Skeleton)">قالب هيكلي (Skeleton)</option>
                <option value="قالب قناة (Canal Mold)">قالب قناة (Canal Mold)</option>
                <option value="قالب قناة بقفل (Canal Lock)">قالب قناة بقفل (Canal Lock)</option>
                <option value="قالب مفتوح (Open Fit / Slim Tube)">قالب مفتوح (Open Fit)</option>
                <option value="سدادة أذن للسباحة (Swim Plug)">سدادة أذن للسباحة (Swim Plug)</option>
                <option value="سدادة للضوضاء / الموسيقى">سدادة للضوضاء / الموسيقى</option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">مادة الصنع *</label>
              <select
                v-model="earmoldForm.material"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="سليكون ناعم (Biopor / Silicone)">سليكون ناعم (Biopor / Silicone)</option>
                <option value="أكريليك صلب (Hard Acrylic)">أكريليك صلب (Hard Acrylic)</option>
                <option value="مزدوج (Hard Canal / Soft Body)">مزدوج (Hard/Soft Dual)</option>
                <option value="سليكون طبي مضاد للحساسية">سليكون طبي مضاد للحساسية</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-bold mb-1">فتحة التهوية (Vent)</label>
              <select
                v-model="earmoldForm.vent_size"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="بدون تهوية (No Vent)">بدون تهوية</option>
                <option value="1.0 mm">1.0 mm</option>
                <option value="1.5 mm">1.5 mm</option>
                <option value="2.0 mm">2.0 mm</option>
                <option value="3.0 mm">3.0 mm</option>
                <option value="IROS Vent">IROS Vent</option>
                <option value="Select-A-Vent (SAV)">Select-A-Vent (SAV)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">نوع التيوب</label>
              <input
                v-model="earmoldForm.tube_type"
                type="text"
                placeholder="عادي #13 / سميك"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">اللون</label>
              <input
                v-model="earmoldForm.color"
                type="text"
                placeholder="شفاف / وردي..."
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-bold mb-1">اسم المعمل</label>
              <input
                v-model="earmoldForm.lab_name"
                type="text"
                placeholder="معمل النور / المعمل الداخلي..."
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">تاريخ المقاس</label>
              <input
                v-model="earmoldForm.impression_date"
                type="date"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">التسليم المتوقع</label>
              <input
                v-model="earmoldForm.expected_date"
                type="date"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">سعر البيع على المريض (ج.م)</label>
              <input
                v-model.number="earmoldForm.customer_price"
                type="number"
                min="0"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">تكلفة المعمل (ج.م)</label>
              <input
                v-model.number="earmoldForm.lab_cost"
                type="number"
                min="0"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات فنية للمعمل</label>
            <textarea
              v-model="earmoldForm.notes"
              rows="2"
              placeholder="مثال: قناة الأذن ضيقة، يرجى التخفيف عند المنحنى الثاني..."
              class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            ></textarea>
          </div>

          <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              @click="earmoldModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
            >
              حفظ أمر القالب
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: UPDATE EARMOLD STATUS                             -->
    <!-- ======================================================== -->
    <div
      v-if="earmoldStatusModalOpen && selectedEarmold"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <RotateCcw class="w-4 h-4 text-blue-600" />
            تحديث حالة طلب القالب: {{ selectedEarmold.order_number }}
          </h3>
          <button @click="earmoldStatusModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleUpdateEarmoldStatus" class="space-y-3.5">
          <div>
            <label class="block font-bold mb-1">الحالة الجديدة *</label>
            <select
              v-model="earmoldStatusForm.status"
              required
              class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option value="impression_taken">أخذ المقاس (Impression Taken)</option>
              <option value="sent_to_lab">أُرسل للمعمل (Sent to Lab)</option>
              <option value="received">وصل من المعمل (جاهز للتسليم)</option>
              <option value="delivered">تم التسليم للمريض (Delivered)</option>
              <option value="remake">إعادة تصنيع (Remake)</option>
            </select>
          </div>

          <div v-if="earmoldStatusForm.status === 'sent_to_lab'" class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] text-slate-500 mb-0.5">تاريخ الإرسال</label>
              <input v-model="earmoldStatusForm.sent_date" type="date" class="w-full p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono" />
            </div>
            <div>
              <label class="block text-[10px] text-slate-500 mb-0.5">التسليم المتوقع</label>
              <input v-model="earmoldStatusForm.expected_date" type="date" class="w-full p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono" />
            </div>
          </div>

          <div v-if="earmoldStatusForm.status === 'received'">
            <label class="block text-[10px] text-slate-500 mb-0.5">تاريخ الاستلام من المعمل</label>
            <input v-model="earmoldStatusForm.received_date" type="date" class="w-full p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono" />
          </div>

          <div v-if="earmoldStatusForm.status === 'delivered'">
            <label class="block text-[10px] text-slate-500 mb-0.5">تاريخ التسليم والتركيب للمريض</label>
            <input v-model="earmoldStatusForm.delivered_date" type="date" class="w-full p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono" />
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات التحديث</label>
            <textarea
              v-model="earmoldStatusForm.notes"
              rows="2"
              class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            ></textarea>
          </div>

          <div class="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              @click="earmoldStatusModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
            >
              حفظ التحديث
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD COCHLEAR IMPLANT                              -->
    <!-- ======================================================== -->
    <div
      v-if="implantModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <Cpu class="w-4 h-4 text-blue-600" />
            تسجيل زراعة قوقعة إلكترونية جديدة (Cochlear Implant)
          </h3>
          <button @click="implantModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleSaveImplant" class="space-y-3.5">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">المريض *</label>
              <select
                v-model="implantForm.patient_id"
                required
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option v-for="c in customers" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.phone }})
                </option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">جهة الأذن *</label>
              <select
                v-model="implantForm.ear"
                required
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="right">الأذن اليمنى (Right Ear)</option>
                <option value="left">الأذن اليسرى (Left Ear)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-bold mb-1">الشركة المصنعة *</label>
              <select
                v-model="implantForm.brand"
                required
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="Cochlear">Cochlear (كوكلير)</option>
                <option value="MED-EL">MED-EL (ميد-إل)</option>
                <option value="Advanced Bionics">Advanced Bionics (AB)</option>
                <option value="Oticon Medical">Oticon Medical</option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">الموديل الداخلي</label>
              <input
                v-model="implantForm.internal_model"
                type="text"
                placeholder="CI622 / Synchrony"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">السيريال الداخلي</label>
              <input
                v-model="implantForm.internal_serial"
                type="text"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-bold mb-1">معالج الصوت الخارجي</label>
              <input
                v-model="implantForm.processor_model"
                type="text"
                placeholder="Nucleus 8 / Sonnet 2"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">سيريال المعالج</label>
              <input
                v-model="implantForm.processor_serial_no"
                type="text"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">انتهاء ضمان المعالج</label>
              <input
                v-model="implantForm.processor_warranty_end"
                type="date"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-bold mb-1">تاريخ الجراحة</label>
              <input
                v-model="implantForm.surgery_date"
                type="date"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">المستشفى</label>
              <input
                v-model="implantForm.hospital"
                type="text"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">الجراح المشرف</label>
              <input
                v-model="implantForm.surgeon"
                type="text"
                class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات سريرية</label>
            <textarea
              v-model="implantForm.notes"
              rows="2"
              class="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            ></textarea>
          </div>

          <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              @click="implantModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
            >
              حفظ سجل القوقعة
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD IMPLANT SESSION (MAPPING)                     -->
    <!-- ======================================================== -->
    <div
      v-if="implantSessionModalOpen && selectedImplant"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-purple-600" />
            تسجيل جلسة برمجة قوقعة (Mapping Session)
          </h3>
          <button @click="implantSessionModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleSaveImplantSession" class="space-y-3.5">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">تاريخ الجلسة *</label>
              <input
                v-model="implantSessionForm.session_date"
                type="date"
                required
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono font-bold"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">نوع الجلسة *</label>
              <select
                v-model="implantSessionForm.session_type"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
              >
                <option value="mapping">جلسة برمجة دورية (Mapping)</option>
                <option value="switch_on">التفعيل الأول (Switch-On)</option>
                <option value="rehab">تأهيل وتدريب سمعي ونطقي</option>
                <option value="troubleshooting">فحص أعطال ومشاكل صوتية</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">استراتيجية الترميز (Strategy)</label>
              <input
                v-model="implantSessionForm.strategy"
                type="text"
                placeholder="ACE / FS4 / HiRes 120"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">حالة الممانعة (Telemetry / Impedance)</label>
              <input
                v-model="implantSessionForm.impedance_status"
                type="text"
                placeholder="سليمة في كل القنوات / قناة معطلة"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">ملخص مستويات السمع (T-Levels)</label>
              <input
                v-model="implantSessionForm.t_levels_summary"
                type="text"
                placeholder="مثال: 100 - 130 CL"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">ملخص مستويات الراحة (C / M Levels)</label>
              <input
                v-model="implantSessionForm.c_levels_summary"
                type="text"
                placeholder="مثال: 160 - 190 CL"
                class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono"
              />
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات البرمجة والبرامج المعتمدة</label>
            <textarea
              v-model="implantSessionForm.program_notes"
              rows="2"
              placeholder="برنامج P1 للمحادثة اليومية، برنامج P2 للضوضاء، المريض يستجيب جيداً..."
              class="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            ></textarea>
          </div>

          <div class="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800/60">
            <label class="block font-bold text-purple-900 dark:text-purple-300 mb-1">
              تاريخ الجلسة القادمة (توليد تذكير متابعة تلقائي)
            </label>
            <input
              v-model="implantSessionForm.next_due_date"
              type="date"
              class="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 font-mono font-bold"
            />
          </div>

          <div class="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              @click="implantSessionModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold cursor-pointer"
            >
              حفظ الجلسة
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
