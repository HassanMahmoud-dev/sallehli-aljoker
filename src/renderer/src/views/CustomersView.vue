<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type {
  Customer,
  CustomerAppliance,
  MaintenanceTicket,
  HearingTest,
  AudiogramPoint,
  PatientProfileBundle,
  PatientAttachment,
  FollowupItem,
  EarmoldOrder,
  CochlearImplant,
  Product,
  Technician
} from '@shared/types'
import { APPLIANCE_TYPES, APPLIANCE_BRANDS } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import DynamicFields from '@renderer/components/DynamicFields.vue'
import AudiogramChart from '@renderer/components/AudiogramChart.vue'
import HearingTestForm from '@renderer/components/HearingTestForm.vue'
import { compressImageFile } from '@renderer/utils/imageHelper'
import {
  Users,
  UserPlus,
  Search,
  Edit3,
  Trash2,
  History,
  MessageCircle,
  Printer,
  ShieldCheck,
  Camera,
  PlusCircle,
  Upload,
  X,
  Stethoscope,
  Activity,
  FileText,
  Layers,
  Cpu,
  CalendarClock,
  Paperclip,
  AlertTriangle,
  HeartPulse,
  Eye,
  SplitSquareVertical,
  Download,
  ExternalLink,
  Sparkles,
  Check,
  RotateCcw
} from 'lucide-vue-next'

const router = useRouter()
const appStore = useAppStore()
const { t } = useTerms()
const customers = ref<Customer[]>([])
const searchQuery = ref('')

const modalOpen = ref(false)
const historyModalOpen = ref(false)
const applianceModalOpen = ref(false)

const selectedCustomer = ref<Customer | null>(null)
const customerAppliances = ref<CustomerAppliance[]>([])
const customerTickets = ref<MaintenanceTicket[]>([])

const availableDeviceTypes = computed(() => {
  const base = appStore.deviceTypes.length ? appStore.deviceTypes : APPLIANCE_TYPES
  const cur = applianceForm.value.appliance_type
  if (cur && !base.includes(cur)) {
    return [cur, ...base]
  }
  return base
})

const availableBrands = computed(() => {
  const base = appStore.brands.length ? appStore.brands : APPLIANCE_BRANDS
  const cur = applianceForm.value.brand
  if (cur && !base.includes(cur)) {
    return [cur, ...base]
  }
  return base
})

const customerTableFields = computed(() => appStore.getTableCustomFields('customer'))

const form = ref<Partial<Customer>>({
  name: '',
  phone: '',
  phone2: '',
  area: '',
  address: '',
  notes: '',
  extra_data: {}
})

const applianceForm = ref<Partial<CustomerAppliance>>({
  customer_id: 0,
  appliance_type: '',
  brand: '',
  model: '',
  serial_number: '',
  last_warranty_end: '',
  notes: '',
  warranty_image: '',
  fault_images: [],
  extra_data: {}
})

async function loadCustomers(): Promise<void> {
  customers.value = await window.api.listCustomers(searchQuery.value)
}

watch(searchQuery, () => {
  loadCustomers()
})

// Patient Medical Profile State (Phase 4)
const patientBundle = ref<PatientProfileBundle | null>(null)
const activePatientTab = ref<'medical' | 'audiology' | 'devices' | 'financial' | 'followups' | 'attachments'>('medical')
const hearingTestModalOpen = ref(false)
const selectedHearingTest = ref<Partial<HearingTest> | null>(null)
const previewTestModalOpen = ref(false)
const testToPreview = ref<HearingTest | null>(null)
const compareModalOpen = ref(false)
const testToCompare = ref<HearingTest | null>(null)
const uploadAttachmentModalOpen = ref(false)
const newAttachmentTitle = ref('')
const newAttachmentCategory = ref<'external_report' | 'audiogram_scan' | 'mapping_file' | 'prescription' | 'id_card' | 'general'>('external_report')
const newAttachmentNotes = ref('')
const technicians = ref<Technician[]>([])
const products = ref<Product[]>([])

function calculateAge(birthDate?: string | null): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (isNaN(b.getTime())) return null
  const diff = Date.now() - b.getTime()
  const ageDate = new Date(diff)
  return Math.abs(ageDate.getUTCFullYear() - 1970)
}

async function refreshPatientBundle(): Promise<void> {
  if (!selectedCustomer.value) return
  try {
    patientBundle.value = await window.api.getPatientProfileBundle(selectedCustomer.value.id)
    customerAppliances.value = patientBundle.value.appliances
    customerTickets.value = patientBundle.value.tickets
  } catch (err) {
    console.error('Error refreshing patient bundle:', err)
  }
}

function openCreateModal(): void {
  form.value = {
    name: '',
    phone: '',
    phone2: '',
    area: '',
    address: '',
    notes: '',
    extra_data: {},
    birth_date: '',
    gender: '',
    occupation: '',
    referring_doctor: '',
    medical_complaint: '',
    medical_history: '',
    allergies: '',
    doctor_notes: ''
  }
  modalOpen.value = true
}

function openEditModal(c: Customer): void {
  form.value = {
    ...c,
    birth_date: c.birth_date || '',
    gender: c.gender || '',
    occupation: c.occupation || '',
    referring_doctor: c.referring_doctor || '',
    medical_complaint: c.medical_complaint || '',
    medical_history: c.medical_history || '',
    allergies: c.allergies || '',
    doctor_notes: c.doctor_notes || '',
    extra_data: c.extra_data ? { ...c.extra_data } : {}
  }
  modalOpen.value = true
}

async function refreshCustomerHistory(): Promise<void> {
  if (!selectedCustomer.value) return
  const res = await window.api.findCustomerByPhone(selectedCustomer.value.phone)
  customerAppliances.value = res.appliances
  customerTickets.value = res.previousTickets
}

async function openHistoryModal(c: Customer): Promise<void> {
  selectedCustomer.value = c
  if (appStore.isHearingAidsProfile && appStore.canViewMedicalRecords) {
    await refreshPatientBundle()
    activePatientTab.value = 'medical'
  } else {
    await refreshCustomerHistory()
  }
  historyModalOpen.value = true
}

function openNewHearingTest(): void {
  selectedHearingTest.value = null
  hearingTestModalOpen.value = true
}

function openEditHearingTest(test: HearingTest): void {
  selectedHearingTest.value = { ...test }
  hearingTestModalOpen.value = true
}

function openPreviewAudiogram(test: HearingTest): void {
  testToPreview.value = test
  testToCompare.value = null
  previewTestModalOpen.value = true
}

async function handleSaveHearingTest(payload: Partial<HearingTest> & { points: AudiogramPoint[] }): Promise<void> {
  try {
    await window.api.saveHearingTest(plain(payload))
    hearingTestModalOpen.value = false
    selectedHearingTest.value = null
    await refreshPatientBundle()
    swalSuccess('تم حفظ فحص السمع ونتائج الأوديوجرام بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حفظ الفحص السمعي', err instanceof Error ? err.message : '')
  }
}

async function handleDeleteHearingTest(id: number): Promise<void> {
  const confirmed = await swalConfirm('حذف فحص السمع', 'هل أنت متأكد من رغبتك في حذف هذا الفحص السمعي؟')
  if (!confirmed) return
  try {
    await window.api.deleteHearingTest(id)
    await refreshPatientBundle()
    swalSuccess('تم حذف فحص السمع بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حذف فحص السمع', err instanceof Error ? err.message : '')
  }
}

function handleConvertToSale(payload: { patientId: number; productId: number | null; notes: string }): void {
  hearingTestModalOpen.value = false
  historyModalOpen.value = false
  router.push({
    path: '/sales',
    query: {
      patientId: payload.patientId,
      recommendedProductId: payload.productId ? String(payload.productId) : undefined
    }
  })
}

async function handleFileSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !selectedCustomer.value) return

  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const dataUrl = reader.result as string
      await window.api.uploadPatientAttachment({
        patient_id: selectedCustomer.value!.id,
        entity_type: 'patient',
        title: newAttachmentTitle.value.trim() || file.name,
        category: newAttachmentCategory.value,
        file_name: file.name,
        file_data: dataUrl,
        notes: newAttachmentNotes.value.trim()
      })
      uploadAttachmentModalOpen.value = false
      newAttachmentTitle.value = ''
      newAttachmentNotes.value = ''
      target.value = ''
      await refreshPatientBundle()
      swalSuccess('تم رفع المرفق الطبي بنجاح')
    } catch (err: unknown) {
      swalError('تعذر رفع المرفق الطبي', err instanceof Error ? err.message : '')
    }
  }
  reader.readAsDataURL(file)
}

async function handleOpenAttachment(att: PatientAttachment): Promise<void> {
  try {
    const res = await window.api.openPatientAttachment({ id: att.id, openExternal: true })
    if (res.dataUrl) {
      if (res.mimeType.startsWith('image/')) {
        appStore.openImagePreview(res.dataUrl, att.title)
      } else {
        const w = window.open('')
        if (w) {
          w.document.write(`<iframe src="${res.dataUrl}" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`)
        }
      }
    }
  } catch (err: unknown) {
    swalError('تعذر فتح المرفق', err instanceof Error ? err.message : '')
  }
}

async function handleDeleteAttachment(id: number): Promise<void> {
  const confirmed = await swalConfirm('حذف المرفق الطبي', 'هل أنت متأكد من حذف هذا المرفق نهائياً؟')
  if (!confirmed) return
  try {
    await window.api.deletePatientAttachment(id)
    await refreshPatientBundle()
    swalSuccess('تم حذف المرفق بنجاح')
  } catch (err: unknown) {
    swalError('تعذر الحذف', err instanceof Error ? err.message : '')
  }
}

function openCreateApplianceModal(): void {
  if (!selectedCustomer.value) return
  applianceForm.value = {
    customer_id: selectedCustomer.value.id,
    appliance_type: availableDeviceTypes.value[0] || '',
    brand: availableBrands.value[0] || '',
    model: '',
    serial_number: '',
    last_warranty_end: '',
    notes: '',
    warranty_image: '',
    fault_images: [],
    extra_data: {}
  }
  applianceModalOpen.value = true
}

function openEditApplianceModal(app: CustomerAppliance): void {
  applianceForm.value = {
    ...app,
    warranty_image: app.warranty_image || '',
    fault_images: Array.isArray(app.fault_images) ? [...app.fault_images] : [],
    extra_data: app.extra_data ? { ...app.extra_data } : {}
  }
  applianceModalOpen.value = true
}

async function handleApplianceWarrantyImageUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  applianceForm.value.warranty_image = await compressImageFile(file, 1100, 1100, 0.84)
  input.value = ''
}

async function handleApplianceFaultImagesUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  const list = Array.isArray(applianceForm.value.fault_images)
    ? [...applianceForm.value.fault_images]
    : []
  for (const file of Array.from(files)) {
    const compressed = await compressImageFile(file, 1000, 1000, 0.82)
    list.push(compressed)
  }
  applianceForm.value.fault_images = list
  input.value = ''
}

function removeApplianceFaultImage(idx: number): void {
  if (!Array.isArray(applianceForm.value.fault_images)) return
  applianceForm.value.fault_images.splice(idx, 1)
}

async function handleSaveAppliance(): Promise<void> {
  const check = appStore.validateCustomFields('device', applianceForm.value.extra_data)
  if (!check.valid) {
    swalError('بيانات إضافية مطلوبة', `يرجى استكمال الحقل الإلزامي: ${check.missingLabel}`)
    return
  }

  const isEdit = Boolean(applianceForm.value.id)
  try {
    await appStore.withLoading(async () => {
      await window.api.saveCustomerAppliance(plain(applianceForm.value))
      applianceModalOpen.value = false
      await refreshCustomerHistory()
    }, isEdit ? `جاري حفظ تعديلات ${t('device')}...` : `جاري إضافة ${t('device')} لسجل العميل...`)
    swalSuccess(isEdit ? `تم تحديث بيانات ${t('device')} بنجاح` : `تمت إضافة ${t('device')} لسجل العميل بنجاح`)
  } catch (err: unknown) {
    swalError(`تعذر حفظ بيانات ${t('device')}`, err instanceof Error ? err.message : '')
  }
}

async function handleDeleteAppliance(app: CustomerAppliance): Promise<void> {
  const confirmed = await swalConfirm(
    `حذف ${t('device')} (${app.appliance_type})؟`,
    `هل أنت متأكد من حذف هذا ${t('device')} من سجل العميل؟`
  )
  if (!confirmed) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteCustomerAppliance(app.id)
      await refreshCustomerHistory()
    }, `جاري حذف ${t('device')} من سجل العميل...`)
    swalSuccess(`تم حذف ${t('device')} من سجل العميل بنجاح`)
  } catch (err: unknown) {
    swalError(`تعذر حذف ${t('device')}`, err instanceof Error ? err.message : '')
  }
}

// Direct upload of warranty image or fault images on a Ticket inside Customer History
async function handleTicketWarrantyUpload(t: MaintenanceTicket, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await appStore.withLoading(async () => {
    const img = await compressImageFile(file, 1100, 1100, 0.84)
    await window.api.updateTicketImages({
      ticketId: t.id,
      warranty_image: img,
      fault_images: Array.isArray(t.fault_images) ? t.fault_images : []
    })
    input.value = ''
    await refreshCustomerHistory()
  }, 'جاري حفظ صورة شهادة الضمان...')
  swalSuccess('تم حفظ صورة شهادة الضمان بنجاح')
}

async function handleRemoveTicketWarrantyImage(t: MaintenanceTicket): Promise<void> {
  await appStore.withLoading(async () => {
    await window.api.updateTicketImages({
      ticketId: t.id,
      warranty_image: '',
      fault_images: Array.isArray(t.fault_images) ? t.fault_images : []
    })
    await refreshCustomerHistory()
  }, 'جاري حذف صورة شهادة الضمان...')
  swalSuccess('تم حذف صورة شهادة الضمان')
}

async function handleTicketFaultUpload(t: MaintenanceTicket, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  await appStore.withLoading(async () => {
    const list = Array.isArray(t.fault_images) ? [...t.fault_images] : []
    for (const file of Array.from(files)) {
      const compressed = await compressImageFile(file, 1000, 1000, 0.82)
      list.push(compressed)
    }
    await window.api.updateTicketImages({
      ticketId: t.id,
      warranty_image: t.warranty_image || '',
      fault_images: list
    })
    input.value = ''
    await refreshCustomerHistory()
  }, 'جاري حفظ صور العطل...')
  swalSuccess('تم حفظ صور العطل بنجاح')
}

async function handleRemoveTicketFaultImage(t: MaintenanceTicket, idx: number): Promise<void> {
  await appStore.withLoading(async () => {
    const list = Array.isArray(t.fault_images) ? [...t.fault_images] : []
    list.splice(idx, 1)
    await window.api.updateTicketImages({
      ticketId: t.id,
      warranty_image: t.warranty_image || '',
      fault_images: list
    })
    await refreshCustomerHistory()
  }, 'جاري حذف صورة العطل...')
  swalSuccess('تم حذف صورة العطل')
}

async function handleSaveCustomer(): Promise<void> {
  if (!form.value.name?.trim() || !form.value.phone?.trim()) {
    swalError('بيانات غير مكتملة', 'يرجى إدخال اسم العميل ورقم الهاتف')
    return
  }
  const check = appStore.validateCustomFields('customer', form.value.extra_data)
  if (!check.valid) {
    swalError('بيانات إضافية مطلوبة', `يرجى استكمال الحقل الإلزامي: ${check.missingLabel}`)
    return
  }
  const isEdit = Boolean(form.value.id)
  try {
    await appStore.withLoading(async () => {
      await window.api.saveCustomer(plain(form.value))
      modalOpen.value = false
      await loadCustomers()
    }, isEdit ? 'جاري حفظ تعديلات العميل...' : 'جاري إضافة العميل الجديد...')
    swalSuccess(isEdit ? 'تم حفظ تعديلات بيانات العميل بنجاح' : 'تمت إضافة العميل الجديد بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حفظ بيانات العميل', err instanceof Error ? err.message : '')
  }
}

async function handleDeleteCustomer(c: Customer): Promise<void> {
  const confirmed = await swalConfirm(
    `حذف ملف العميل (${c.name})؟`,
    'هل أنت متأكد من حذف بيانات هذا العميل؟'
  )
  if (!confirmed) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteCustomer(c.id)
      await loadCustomers()
    }, 'جاري حذف ملف العميل...')
    swalSuccess('تم حذف ملف العميل بنجاح')
  } catch {
    swalError('لا يمكن الحذف', 'لا يمكن حذف عميل مرتبط بطلبات صيانة سابقة حفاظاً على السجل المالي.')
  }
}

function openWhatsAppChat(phone: string, name: string): void {
  let clean = phone.replace(/\D/g, '')
  if (clean.startsWith('01') && clean.length === 11) clean = '2' + clean
  const text = `مرحباً بحضرتك أ/ ${name} من ${appStore.settings.center_name}`
  window.api.openExternal(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`)
}

onMounted(async () => {
  await loadCustomers()
  try {
    const [techs, prods] = await Promise.all([
      window.api.listTechnicians(),
      window.api.listProducts()
    ])
    technicians.value = techs
    products.value = prods
  } catch (err) {
    console.error('Error preloading technicians/products:', err)
  }
})
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4"
    >
      <div>
        <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Users class="w-5 h-5 text-blue-600" />
          {{ t('customersPage') }} وتاريخ الضمان
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          ملف شامل لكل عميل، {{ t('devices') }} المسجلة، صور الأعطال، وتاريخ وصور شهادات الضمان السارية
        </p>
      </div>

      <div class="flex items-center gap-3">
        <div class="relative w-72 text-xs">
          <Search
            class="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="بحث بالاسم أو رقم الموبايل أو المنطقة..."
            class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
          />
        </div>

        <button
          type="button"
          @click="openCreateModal"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
        >
          <UserPlus class="w-4 h-4" />
          إضافة عميل جديد
        </button>
      </div>
    </div>

    <!-- Customers Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <table class="w-full text-right text-xs">
        <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold">
          <tr>
            <th class="py-3.5 px-4">#</th>
            <th class="py-3.5 px-4">اسم العميل</th>
            <th class="py-3.5 px-4">أرقام الهاتف</th>
            <th class="py-3.5 px-4">المنطقة والعنوان</th>
            <th v-for="col in customerTableFields" :key="col.id" class="py-3.5 px-4">
              {{ col.label }}
            </th>
            <th class="py-3.5 px-4">عدد طلبات الصيانة</th>
            <th class="py-3.5 px-4">ملاحظات</th>
            <th class="py-3.5 px-4">السجل والإجراءات</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr
            v-for="c in customers"
            :key="c.id"
            class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <td class="py-3.5 px-4 font-bold">{{ c.id }}</td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-900 dark:text-white text-sm">
                {{ c.name }}
              </div>
              <div v-if="appStore.isHearingAidsProfile && (c.gender || c.birth_date)" class="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>{{ c.gender === 'male' ? 'ذكر' : c.gender === 'female' ? 'أنثى' : '' }}</span>
                <span v-if="calculateAge(c.birth_date)">({{ calculateAge(c.birth_date) }} سنة)</span>
              </div>
              <div v-if="appStore.isHearingAidsProfile && c.allergies" class="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 dark:bg-rose-950/60 dark:text-rose-400 px-1.5 py-0.5 rounded-md mt-1">
                <AlertTriangle class="w-3 h-3 text-rose-600" />
                حساسية: {{ c.allergies }}
              </div>
            </td>
            <td class="py-3.5 px-4 font-mono">
              <div class="font-bold text-blue-600 dark:text-blue-400">{{ c.phone }}</div>
              <div v-if="c.phone2" class="text-slate-500">{{ c.phone2 }}</div>
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold">{{ c.area || '—' }}</div>
              <div class="text-slate-500">{{ c.address }}</div>
            </td>
            <td v-for="col in customerTableFields" :key="col.id" class="py-3.5 px-4 font-semibold">
              {{ c.extra_data?.[col.key] || '—' }}
            </td>
            <td class="py-3.5 px-4">
              <span
                class="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-bold"
              >
                {{ c.tickets_count || 0 }} طلبات
              </span>
            </td>
            <td class="py-3.5 px-4 text-slate-500">{{ c.notes || '—' }}</td>
            <td class="py-3.5 px-4">
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  @click="openHistoryModal(c)"
                  class="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Stethoscope v-if="appStore.isHearingAidsProfile && appStore.canViewMedicalRecords" class="w-3.5 h-3.5 text-blue-600" />
                  <History v-else class="w-3.5 h-3.5" />
                  {{ appStore.isHearingAidsProfile && appStore.canViewMedicalRecords ? 'الملف الطبي وفحوصات السمع' : `سجل ${t('devices')} والضمان والصور` }}
                </button>
                <button
                  type="button"
                  @click="openWhatsAppChat(c.phone, c.name)"
                  class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-pointer"
                  title="مراسلة واتساب"
                >
                  <MessageCircle class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  @click="openEditModal(c)"
                  class="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                >
                  <Edit3 class="w-4 h-4" />
                </button>
                <button
                  v-if="appStore.canDeleteRecords"
                  type="button"
                  @click="handleDeleteCustomer(c)"
                  class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create / Edit Customer Modal -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto"
        :class="appStore.isHearingAidsProfile && appStore.canViewMedicalRecords ? 'max-w-2xl' : 'max-w-md'"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">
            {{ form.id ? (appStore.isHearingAidsProfile ? 'تعديل بيانات المريض والملف الطبي' : 'تعديل بيانات العميل') : (appStore.isHearingAidsProfile ? 'إضافة مريض جديد' : 'إضافة عميل جديد') }}
          </h3>
          <button @click="modalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>
        <form @submit.prevent="handleSaveCustomer" class="p-6 space-y-3.5 text-xs">
          <div>
            <label class="block font-bold mb-1">اسم العميل / المريض *</label>
            <input
              v-model="form.name"
              required
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">رقم الهاتف الأساسي *</label>
              <input
                v-model="form.phone"
                required
                type="text"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">رقم هاتف إضافي</label>
              <input
                v-model="form.phone2"
                type="text"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <!-- Medical & Audiology Info for Hearing Aids Patients (Phase 4A) -->
          <div
            v-if="appStore.isHearingAidsProfile && appStore.canViewMedicalRecords"
            class="p-4 bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800/60 space-y-3"
          >
            <div class="font-black text-blue-700 dark:text-blue-400 flex items-center gap-1.5 text-xs">
              <Stethoscope class="w-4 h-4" />
              البيانات الطبية والسجل السمعي للمريض
            </div>

            <div class="grid grid-cols-3 gap-2.5">
              <div>
                <label class="block font-bold mb-1">تاريخ الميلاد</label>
                <input
                  v-model="form.birth_date"
                  type="date"
                  class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs"
                />
                <span v-if="calculateAge(form.birth_date) !== null" class="text-[10px] text-blue-600 font-bold block mt-0.5">
                  العمر: {{ calculateAge(form.birth_date) }} سنة
                </span>
              </div>
              <div>
                <label class="block font-bold mb-1">النوع / الجنس</label>
                <select
                  v-model="form.gender"
                  class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold"
                >
                  <option value="">غير محدد</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">المهنة وبيئة العمل</label>
                <input
                  v-model="form.occupation"
                  type="text"
                  placeholder="مثال: معلم / مهندس"
                  class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block font-bold mb-1">الطبيب أو المركز المُحيل</label>
                <input
                  v-model="form.referring_doctor"
                  type="text"
                  placeholder="د. أحمد مصطفى - أنف وأذن"
                  class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label class="block font-bold mb-1 text-rose-600 dark:text-rose-400">الحساسية (جلدية / دوائية)</label>
                <input
                  v-model="form.allergies"
                  type="text"
                  placeholder="حساسية من الأكريليك / حساسية جلدية..."
                  class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-xs"
                />
              </div>
            </div>

            <div>
              <label class="block font-bold mb-1">الشكوى السمعية الرئيسية</label>
              <textarea
                v-model="form.medical_complaint"
                rows="2"
                placeholder="مثال: طنين في الأذن وصعوبة فهم الكلام في الضوضاء والتجمعات..."
                class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
              ></textarea>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block font-bold mb-1">التاريخ المرضي / العائلي</label>
                <textarea
                  v-model="form.medical_history"
                  rows="2"
                  placeholder="التهابات متكررة، عمليات سابقة..."
                  class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                ></textarea>
              </div>
              <div>
                <label class="block font-bold mb-1">ملاحظات الأخصائي السريرية</label>
                <textarea
                  v-model="form.doctor_notes"
                  rows="2"
                  placeholder="ملاحظات وتوجيهات سريرية..."
                  class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                ></textarea>
              </div>
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">المنطقة</label>
            <input
              v-model="form.area"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">العنوان التفصيلي</label>
            <input
              v-model="form.address"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">ملاحظات عامة</label>
            <input
              v-model="form.notes"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <DynamicFields
            entity="customer"
            v-model="form.extra_data"
            :title="`بيانات إضافية لـ ${t('customer')}`"
          />

          <div class="flex justify-end gap-2 pt-3">
            <button
              type="button"
              @click="modalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
            >
              حفظ العميل
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- Customer History, Appliances, Warranty & Fault Images Modal  -->
    <!-- ============================================================ -->
    <div
      v-if="historyModalOpen && selectedCustomer"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs"
        :class="appStore.isHearingAidsProfile && appStore.canViewMedicalRecords ? 'max-w-6xl' : 'max-w-4xl'"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <div>
            <h3 class="font-black text-sm flex items-center gap-2">
              <Stethoscope v-if="appStore.isHearingAidsProfile && appStore.canViewMedicalRecords" class="w-4 h-4 text-blue-600" />
              <History v-else class="w-4 h-4 text-blue-600" />
              {{
                appStore.isHearingAidsProfile && appStore.canViewMedicalRecords
                  ? `الملف الطبي الشامل للمريض: ${selectedCustomer.name}`
                  : `السجل التاريخي لـ ${t('devices')} وصيانات وضمان العميل: ${selectedCustomer.name}`
              }}
              <span class="font-mono text-xs font-normal text-slate-500">({{ selectedCustomer.phone }})</span>
            </h3>
            <p class="text-[11px] text-slate-500 mt-0.5">
              {{
                appStore.isHearingAidsProfile && appStore.canViewMedicalRecords
                  ? 'فحوصات السمع، الأوديوجرام، السماعات والقواقع، طلبات القوالب، جلسات البرمجة والضبط، والمرفقات الطبية'
                  : `إرفاق واستعراض صورة شهادة الضمان وصور العطل لكل ${t('device')} وكل ${t('ticket')}`
              }}
            </p>
          </div>
          <button @click="historyModalOpen = false" class="cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6 flex-1">
          <!-- HEARING AIDS PROFILE: COMPREHENSIVE 6-TAB MEDICAL PROFILE -->
          <div v-if="appStore.isHearingAidsProfile && appStore.canViewMedicalRecords" class="space-y-4">
            <!-- Patient Top Info & Allergy Banner -->
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center font-black text-sm">
                    {{ selectedCustomer.gender === 'female' ? '👩' : '👨' }}
                  </div>
                  <div>
                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      {{ selectedCustomer.name }}
                      <span v-if="selectedCustomer.gender || selectedCustomer.birth_date" class="text-xs font-normal text-slate-500">
                        ({{ selectedCustomer.gender === 'male' ? 'ذكر' : selectedCustomer.gender === 'female' ? 'أنثى' : '' }}
                        <span v-if="calculateAge(selectedCustomer.birth_date)"> - {{ calculateAge(selectedCustomer.birth_date) }} سنة</span>)
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-500 font-mono">
                      📞 {{ selectedCustomer.phone }} <span v-if="selectedCustomer.phone2">| {{ selectedCustomer.phone2 }}</span>
                      <span v-if="selectedCustomer.area"> | 📍 {{ selectedCustomer.area }}</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    @click="openNewHearingTest"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    <PlusCircle class="w-3.5 h-3.5" />
                    فحص سمع جديد
                  </button>

                  <button
                    type="button"
                    @click="openWhatsAppChat(selectedCustomer.phone, selectedCustomer.name)"
                    class="p-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
                    title="مراسلة واتساب"
                  >
                    <MessageCircle class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Severe Allergy Alert Warning -->
              <div
                v-if="selectedCustomer.allergies"
                class="p-3 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 flex items-center gap-2.5 font-bold text-xs"
              >
                <AlertTriangle class="w-4 h-4 shrink-0 text-rose-600" />
                <div>
                  <span class="font-black">تنبيه سريري هام (الحساسية): </span>
                  {{ selectedCustomer.allergies }}
                </div>
              </div>
            </div>

            <!-- Tab Navigation Bar (6 Tabs) -->
            <div class="flex border-b border-slate-200 dark:border-slate-800 gap-2 pb-0.5 overflow-x-auto text-xs">
              <button
                @click="activePatientTab = 'medical'"
                class="px-4 py-2 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
                :class="activePatientTab === 'medical' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'"
              >
                <Stethoscope class="w-3.5 h-3.5" />
                1. البيانات والسجل الطبي
              </button>

              <button
                @click="activePatientTab = 'audiology'"
                class="px-4 py-2 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
                :class="activePatientTab === 'audiology' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'"
              >
                <Activity class="w-3.5 h-3.5" />
                2. فحوصات السمع والأوديوجرام ({{ patientBundle?.hearingTests.length || 0 }})
              </button>

              <button
                @click="activePatientTab = 'devices'"
                class="px-4 py-2 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
                :class="activePatientTab === 'devices' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'"
              >
                <Layers class="w-3.5 h-3.5" />
                3. السماعات والقواقع والقوالب ({{ (patientBundle?.appliances.length || 0) + (patientBundle?.implants.length || 0) + (patientBundle?.earmoldOrders.length || 0) }})
              </button>

              <button
                @click="activePatientTab = 'financial'"
                class="px-4 py-2 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
                :class="activePatientTab === 'financial' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'"
              >
                <FileText class="w-3.5 h-3.5" />
                4. الفواتير والصيانة ({{ (patientBundle?.salesInvoices.length || 0) + (patientBundle?.tickets.length || 0) }})
              </button>

              <button
                @click="activePatientTab = 'followups'"
                class="px-4 py-2 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
                :class="activePatientTab === 'followups' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'"
              >
                <CalendarClock class="w-3.5 h-3.5" />
                5. المتابعات وجلسات الضبط ({{ patientBundle?.followups.length || 0 }})
              </button>

              <button
                @click="activePatientTab = 'attachments'"
                class="px-4 py-2 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
                :class="activePatientTab === 'attachments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'"
              >
                <Paperclip class="w-3.5 h-3.5" />
                6. المرفقات والتقارير الطبية ({{ patientBundle?.attachments.length || 0 }})
              </button>
            </div>

            <!-- TAB 1: MEDICAL DATA & NOTES -->
            <div v-if="activePatientTab === 'medical'" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <h4 class="font-black text-blue-600 flex items-center gap-1.5">
                    <HeartPulse class="w-4 h-4" />
                    الشكوى السمعية والتاريخ المرضي
                  </h4>
                  <div>
                    <span class="font-bold text-slate-500 block mb-0.5">الشكوى السمعية الرئيسية:</span>
                    <p class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 leading-relaxed font-semibold">
                      {{ selectedCustomer.medical_complaint || 'لا توجد شكوى مسجلة' }}
                    </p>
                  </div>
                  <div>
                    <span class="font-bold text-slate-500 block mb-0.5">التاريخ المرضي والعائلي:</span>
                    <p class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 leading-relaxed">
                      {{ selectedCustomer.medical_history || 'لا يوجد تاريخ مرضي مسجل' }}
                    </p>
                  </div>
                </div>

                <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <h4 class="font-black text-indigo-600 flex items-center gap-1.5">
                    <Stethoscope class="w-4 h-4" />
                    ملاحظات الأخصائي والطبيب المُحيل
                  </h4>
                  <div>
                    <span class="font-bold text-slate-500 block mb-0.5">الطبيب أو المركز المُحيل:</span>
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-white">
                      {{ selectedCustomer.referring_doctor || 'غير محدد' }}
                    </div>
                  </div>
                  <div>
                    <span class="font-bold text-slate-500 block mb-0.5">ملاحظات الطبيب / الأخصائي:</span>
                    <p class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 leading-relaxed font-semibold">
                      {{ selectedCustomer.doctor_notes || 'لا توجد ملاحظات أخصائي مسجلة' }}
                    </p>
                  </div>
                  <div>
                    <span class="font-bold text-slate-500 block mb-0.5">طبيعة المهنة / البيئة الصوتية:</span>
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      {{ selectedCustomer.occupation || 'غير محدد' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 2: AUDIOLOGY & HEARING TESTS -->
            <div v-else-if="activePatientTab === 'audiology'" class="space-y-4">
              <div class="flex items-center justify-between">
                <h4 class="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Activity class="w-4 h-4 text-blue-600" />
                  سجل فحوصات وقياس السمع الرسمية (Audiograms)
                </h4>
                <button
                  type="button"
                  @click="openNewHearingTest"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                >
                  <PlusCircle class="w-3.5 h-3.5" />
                  إجراء فحص سمع جديد
                </button>
              </div>

              <div class="space-y-3">
                <div
                  v-for="test in patientBundle?.hearingTests || []"
                  :key="test.id"
                  class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-black font-mono text-sm text-blue-600">{{ test.test_number }}</span>
                        <span class="text-slate-400">📅 {{ test.test_date }}</span>
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                          {{ test.examiner_name || 'أخصائي السمعيات' }}
                        </span>
                      </div>

                      <div class="grid grid-cols-2 gap-4 mt-2.5">
                        <div class="p-2.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60">
                          <span class="font-bold text-red-700 dark:text-red-400 block text-xs">الأذن اليمنى (Right Ear)</span>
                          <div class="mt-1 font-mono font-black text-sm text-red-900 dark:text-red-300">
                            PTA: {{ test.pta_right ?? '—' }} dB
                          </div>
                          <div class="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                            {{ test.loss_degree_right || 'طبيعي' }} - {{ test.loss_type_right || '—' }}
                          </div>
                          <div v-if="test.srt_right !== null || test.sds_right !== null" class="text-[10px] text-slate-500 mt-1 font-mono">
                            SRT: {{ test.srt_right ?? '—' }} dB | SDS: {{ test.sds_right ?? '—' }}%
                          </div>
                        </div>

                        <div class="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
                          <span class="font-bold text-blue-700 dark:text-blue-400 block text-xs">الأذن اليسرى (Left Ear)</span>
                          <div class="mt-1 font-mono font-black text-sm text-blue-900 dark:text-blue-300">
                            PTA: {{ test.pta_left ?? '—' }} dB
                          </div>
                          <div class="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                            {{ test.loss_degree_left || 'طبيعي' }} - {{ test.loss_type_left || '—' }}
                          </div>
                          <div v-if="test.srt_left !== null || test.sds_left !== null" class="text-[10px] text-slate-500 mt-1 font-mono">
                            SRT: {{ test.srt_left ?? '—' }} dB | SDS: {{ test.sds_left ?? '—' }}%
                          </div>
                        </div>
                      </div>

                      <div v-if="test.recommended_product_name" class="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <Sparkles class="w-3.5 h-3.5" />
                        السماعة الموصى بها: {{ test.recommended_product_name }}
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        @click="openPreviewAudiogram(test)"
                        class="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold flex items-center gap-1 cursor-pointer"
                        title="معاينة المخطط السمعي ومقارنته"
                      >
                        <Eye class="w-3.5 h-3.5" />
                        معاينة الأوديوجرام
                      </button>

                      <button
                        type="button"
                        @click="appStore.openHearingTestPrintModal(test)"
                        class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold flex items-center gap-1 cursor-pointer"
                        title="طباعة التقرير الطبي A4"
                      >
                        <Printer class="w-3.5 h-3.5" />
                        طباعة A4
                      </button>

                      <button
                        v-if="test.recommended_product_id"
                        type="button"
                        @click="handleConvertToSale({ patientId: test.patient_id, productId: test.recommended_product_id, notes: test.recommendation_notes || '' })"
                        class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                        title="إنشاء فاتورة بيع بالسماعة الموصى بها"
                      >
                        فاتورة بالتوصية
                      </button>

                      <button
                        type="button"
                        @click="openEditHearingTest(test)"
                        class="p-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 text-slate-600 dark:bg-slate-800 cursor-pointer"
                      >
                        <Edit3 class="w-3.5 h-3.5" />
                      </button>

                      <button
                        v-if="appStore.canDeleteRecords"
                        type="button"
                        @click="handleDeleteHearingTest(test.id)"
                        class="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 dark:bg-slate-800 cursor-pointer"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="(patientBundle?.hearingTests.length || 0) === 0" class="py-12 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                  لا توجد فحوصات سمع مسجلة للمريض بعد. اضغط «إجراء فحص سمع جديد» للبدء.
                </div>
              </div>
            </div>

            <!-- TAB 3: DEVICES, IMPLANTS & EARMOLDS -->
            <div v-else-if="activePatientTab === 'devices'" class="space-y-6">
              <!-- Sub 1: Registered Hearing Aids & Appliances -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h4 class="font-black text-blue-600 text-sm flex items-center gap-1.5">
                    🔌 السماعات والأجهزة المسجلة
                  </h4>
                  <button
                    type="button"
                    @click="openCreateApplianceModal"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                  >
                    <PlusCircle class="w-3.5 h-3.5" />
                    إضافة سماعة لسجل المريض
                  </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div
                    v-for="app in customerAppliances"
                    :key="app.id"
                    class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="font-black text-sm text-slate-900 dark:text-white">
                          {{ app.appliance_type }} — <span class="text-blue-600">{{ app.brand }}</span>
                        </div>
                        <div class="text-slate-500 mt-0.5">
                          الموديل: {{ app.model || '—' }} | السيريال: {{ app.serial_number || '—' }}
                        </div>
                        <div v-if="app.last_warranty_end" class="mt-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          🛡️ الضمان ساري حتى: {{ app.last_warranty_end }}
                        </div>
                      </div>

                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          @click="openEditApplianceModal(app)"
                          class="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Camera class="w-3.5 h-3.5" />
                          صور الضمان
                        </button>
                        <button
                          v-if="appStore.canDeleteRecords"
                          type="button"
                          @click="handleDeleteAppliance(app)"
                          class="p-1 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-if="customerAppliances.length === 0" class="col-span-full py-6 text-center text-slate-400">
                    لا توجد سماعات مسجلة في هذا القسم
                  </div>
                </div>
              </div>

              <!-- Sub 2: Cochlear Implants -->
              <div class="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="font-black text-purple-600 text-sm flex items-center gap-1.5">
                    <Cpu class="w-4 h-4" />
                    زراعة القوقعة الإلكترونية (Cochlear Implants)
                  </h4>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div
                    v-for="imp in patientBundle?.implants || []"
                    :key="imp.id"
                    class="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-2.5"
                  >
                    <div class="flex items-start justify-between">
                      <div>
                        <span class="font-bold text-xs" :class="imp.ear === 'right' ? 'text-red-600' : 'text-blue-600'">
                          {{ imp.ear === 'right' ? 'الأذن اليمنى (Right)' : 'الأذن اليسرى (Left)' }}
                        </span>
                        <div class="font-black text-sm text-slate-900 dark:text-white mt-0.5">
                          {{ imp.brand }} — {{ imp.internal_model }}
                        </div>
                      </div>
                      <span class="px-2 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 text-[10px] font-bold">
                        معالج: {{ imp.processor_model || '—' }}
                      </span>
                    </div>

                    <div class="text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                      <div>السيريال الداخلي: <span class="font-mono font-bold">{{ imp.internal_serial || '—' }}</span></div>
                      <div>سيريال المعالج: <span class="font-mono font-bold">{{ imp.processor_serial_no || '—' }}</span></div>
                      <div v-if="imp.processor_warranty_end">ضمان المعالج: <span class="font-mono text-emerald-600 font-bold">{{ imp.processor_warranty_end }}</span></div>
                    </div>
                  </div>

                  <div v-if="(patientBundle?.implants.length || 0) === 0" class="col-span-full py-4 text-center text-slate-400">
                    لا توجد عمليات زراعة قوقعة مسجلة للمريض
                  </div>
                </div>
              </div>

              <!-- Sub 3: Earmold Orders -->
              <div class="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="font-black text-amber-600 text-sm flex items-center gap-1.5">
                    <Layers class="w-4 h-4" />
                    طلبات قوالب الأذن (Earmolds)
                  </h4>
                </div>

                <div class="space-y-2.5">
                  <div
                    v-for="order in patientBundle?.earmoldOrders || []"
                    :key="order.id"
                    class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-mono font-black text-blue-600">{{ order.order_number }}</span>
                        <span class="font-bold">{{ order.mold_type }} ({{ order.material }})</span>
                        <span class="font-bold text-[11px]" :class="order.ear === 'right' ? 'text-red-600' : 'text-blue-600'">
                          {{ order.ear === 'right' ? 'يمين' : order.ear === 'left' ? 'يسار' : 'الأذنين' }}
                        </span>
                      </div>
                      <div class="text-[11px] text-slate-500 mt-1">
                        المعمل: {{ order.lab_name || '—' }} | تاريخ المقاس: {{ order.impression_date }}
                        <span v-if="order.expected_date"> | متوقع: {{ order.expected_date }}</span>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-1 rounded-xl text-[11px] font-black border bg-slate-100 dark:bg-slate-800">
                        {{ order.status }}
                      </span>
                      <button
                        type="button"
                        @click="appStore.openEarmoldPrintModal(order)"
                        class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="طباعة إيصال القالب"
                      >
                        <Printer class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div v-if="(patientBundle?.earmoldOrders.length || 0) === 0" class="py-4 text-center text-slate-400">
                    لا توجد طلبات قوالب مسجلة لهذا المريض
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 4: FINANCIAL & TICKETS -->
            <div v-else-if="activePatientTab === 'financial'" class="space-y-6">
              <!-- Sales Invoices -->
              <div>
                <h4 class="font-black text-emerald-600 text-sm mb-3">
                  💰 فواتير المبيعات الخاصة بالمريض
                </h4>
                <div class="space-y-2.5">
                  <div
                    v-for="inv in patientBundle?.salesInvoices || []"
                    :key="inv.id"
                    class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center"
                  >
                    <div>
                      <div class="font-black text-sm font-mono text-emerald-700 dark:text-emerald-400">
                        {{ inv.invoice_number }}
                      </div>
                      <div class="text-[11px] text-slate-500">
                        📅 {{ inv.invoice_date }} | بنود الفاتورة: {{ inv.items?.length || 0 }}
                      </div>
                    </div>

                    <div class="text-left">
                      <div class="font-black font-mono text-sm">{{ inv.total_amount }} ج.م</div>
                      <div class="text-[10px] text-slate-500">
                        مدفوع: {{ inv.paid_amount }} | متبقي: {{ inv.remaining_amount }}
                      </div>
                    </div>
                  </div>

                  <div v-if="(patientBundle?.salesInvoices.length || 0) === 0" class="py-4 text-center text-slate-400">
                    لا توجد فواتير مبيعات سابقة لهذا المريض
                  </div>
                </div>
              </div>

              <!-- Maintenance Tickets -->
              <div class="pt-4 border-t border-slate-200 dark:border-slate-800">
                <h4 class="font-black text-indigo-600 text-sm mb-3">
                  📋 طلبات الصيانة والضبط السابقة
                </h4>
                <div class="space-y-2.5">
                  <div
                    v-for="tkt in patientBundle?.tickets || []"
                    :key="tkt.id"
                    class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center"
                  >
                    <div>
                      <div class="font-black font-mono text-sm text-indigo-700 dark:text-indigo-400">
                        {{ tkt.ticket_number }} — {{ tkt.appliance_type }} ({{ tkt.brand }})
                      </div>
                      <div class="text-[11px] text-slate-500">
                        الشكوى: {{ tkt.complaint }}
                      </div>
                    </div>

                    <div class="text-left">
                      <div class="font-black font-mono text-sm">{{ tkt.total_amount }} ج.م</div>
                      <div class="text-[10px] text-emerald-600 font-bold">{{ tkt.status }}</div>
                    </div>
                  </div>

                  <div v-if="(patientBundle?.tickets.length || 0) === 0" class="py-4 text-center text-slate-400">
                    لا توجد طلبات صيانة مسجلة لهذا المريض
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 5: FOLLOWUPS & FITTING -->
            <div v-else-if="activePatientTab === 'followups'" class="space-y-4">
              <div class="flex items-center justify-between">
                <h4 class="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CalendarClock class="w-4 h-4 text-blue-600" />
                  مواعيد المتابعة وجلسات ضبط وبرمجة السماعة (Fitting)
                </h4>
              </div>

              <div class="space-y-2.5">
                <div
                  v-for="f in patientBundle?.followups || []"
                  :key="f.id"
                  class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center"
                >
                  <div>
                    <div class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{{ f.type === 'fitting' ? 'جلسة ضبط Fitting' : f.type === 'mapping' ? 'برمجة قوقعة Mapping' : 'متابعة دورية' }}</span>
                      <span class="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-bold">
                        تاريخ: {{ f.due_date }}
                      </span>
                    </div>
                    <div v-if="f.notes" class="text-[11px] text-slate-500 mt-1">
                      {{ f.notes }}
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <span
                      class="px-2 py-0.5 rounded-md text-[10px] font-bold"
                      :class="f.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
                    >
                      {{ f.status === 'completed' ? 'مكتملة' : 'قيد الانتظار' }}
                    </span>
                  </div>
                </div>

                <div v-if="(patientBundle?.followups.length || 0) === 0" class="py-6 text-center text-slate-400">
                  لا توجد مواعيد متابعة مسجلة لهذا المريض
                </div>
              </div>
            </div>

            <!-- TAB 6: MEDICAL ATTACHMENTS -->
            <div v-else-if="activePatientTab === 'attachments'" class="space-y-4">
              <div class="flex items-center justify-between">
                <h4 class="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Paperclip class="w-4 h-4 text-blue-600" />
                  التقارير والمرفقات الطبية المحفوظة محلياً
                </h4>
                <button
                  type="button"
                  @click="uploadAttachmentModalOpen = true"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                >
                  <PlusCircle class="w-3.5 h-3.5" />
                  رفع مرفق / تقرير طبي
                </button>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div
                  v-for="att in patientBundle?.attachments || []"
                  :key="att.id"
                  class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-start gap-2"
                >
                  <div class="space-y-1">
                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <FileText class="w-4 h-4 text-blue-600" />
                      {{ att.title }}
                    </div>
                    <div class="text-[11px] text-slate-500">
                      التصنيف: {{ att.category }} | الملف: {{ att.file_name }}
                    </div>
                    <div v-if="att.notes" class="text-[10px] text-slate-400">
                      {{ att.notes }}
                    </div>
                    <div class="text-[10px] font-mono text-slate-400">
                      📅 {{ att.created_at }} ({{ Math.round(att.file_size / 1024) }} KB)
                    </div>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      @click="handleOpenAttachment(att)"
                      class="px-2.5 py-1.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Eye class="w-3.5 h-3.5" />
                      عرض / فتح
                    </button>
                    <button
                      type="button"
                      @click="handleDeleteAttachment(att.id)"
                      class="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div v-if="(patientBundle?.attachments.length || 0) === 0" class="col-span-full py-10 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                  لا توجد مرفقات أو تقارير طبية مرفوعة للمريض بعد. اضغط «رفع مرفق / تقرير طبي» لإضافة صور وتقارير.
                </div>
              </div>
            </div>
          </div>

          <!-- APPLIANCES PROFILE / NON-MEDICAL: EXISTING APPLIANCES + TICKETS SECTIONS -->
          <template v-else>
          <!-- Section 1: Customer Appliances & Warranty / Fault Photos -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-black text-blue-600 text-sm">
                🔌 {{ t('devices') }} المسجلة باسم العميل وصور الضمان والأعطال
              </h4>
              <button
                type="button"
                @click="openCreateApplianceModal"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
              >
                <PlusCircle class="w-3.5 h-3.5" />
                إضافة {{ t('device') }} ومرفقات ضمان
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div
                v-for="app in customerAppliances"
                :key="app.id"
                class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3"
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="font-black text-sm text-slate-900 dark:text-white">
                      {{ app.appliance_type }} — <span class="text-blue-600">{{ app.brand }}</span>
                    </div>
                    <div class="text-slate-500 mt-0.5">
                      الموديل: {{ app.model || '—' }} | السيريال: {{ app.serial_number || '—' }}
                    </div>
                    <div
                      v-if="app.last_warranty_end"
                      class="mt-1 text-emerald-600 dark:text-emerald-400 font-bold"
                    >
                      🛡️ الضمان ساري حتى: {{ app.last_warranty_end }}
                      <span v-if="app.last_ticket_number">({{ app.last_ticket_number }})</span>
                    </div>
                    <!-- Custom Fields Badges on Appliance Card -->
                    <div
                      v-if="appStore.formatExtraDataEntries(app.extra_data, ['device']).length > 0"
                      class="mt-2 flex flex-wrap gap-1.5"
                    >
                      <span
                        v-for="item in appStore.formatExtraDataEntries(app.extra_data, ['device'])"
                        :key="item.key"
                        class="px-2 py-0.5 rounded-lg bg-purple-100/80 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-bold"
                      >
                        {{ item.label }}: {{ item.value }}
                      </span>
                    </div>
                  </div>

                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      @click="openEditApplianceModal(app)"
                      class="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Camera class="w-3.5 h-3.5" />
                      صور الضمان والعطل
                    </button>
                    <button
                      v-if="appStore.canDeleteRecords"
                      type="button"
                      @click="handleDeleteAppliance(app)"
                      class="p-1 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <!-- Attached Warranty Image & Fault Images Preview on Appliance -->
                <div
                  v-if="app.warranty_image || (app.fault_images && app.fault_images.length > 0)"
                  class="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center gap-2"
                >
                  <div
                    v-if="app.warranty_image"
                    @click="
                      appStore.openImagePreview(
                        app.warranty_image,
                        `صورة ضمان: ${app.appliance_type} (${app.brand})`
                      )
                    "
                    class="relative group w-16 h-16 rounded-xl border-2 border-emerald-500 overflow-hidden cursor-pointer bg-white"
                    title="اضغط لمعاينة صورة شهادة الضمان"
                  >
                    <img :src="app.warranty_image" class="w-full h-full object-cover" />
                    <span
                      class="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[9px] font-bold text-center py-0.5"
                    >
                      الضمان
                    </span>
                  </div>

                  <div
                    v-for="(fImg, fIdx) in app.fault_images"
                    :key="fIdx"
                    @click="
                      appStore.openImagePreview(
                        fImg,
                        `صورة العطل (${fIdx + 1}) - ${app.appliance_type}`
                      )
                    "
                    class="relative group w-16 h-16 rounded-xl border-2 border-amber-500 overflow-hidden cursor-pointer bg-white"
                    title="اضغط لمعاينة صورة العطل"
                  >
                    <img :src="fImg" class="w-full h-full object-cover" />
                    <span
                      class="absolute bottom-0 inset-x-0 bg-amber-600/90 text-white text-[9px] font-bold text-center py-0.5"
                    >
                      عطل {{ fIdx + 1 }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="customerAppliances.length === 0" class="text-slate-400">
                لا توجد {{ t('devices') }} مسجلة بعد — اضغط على "إضافة {{ t('device') }} ومرفقات ضمان"
              </div>
            </div>
          </div>

          <!-- Section 2: Maintenance Tickets History with Direct Warranty & Fault Photos Upload -->
          <div>
            <h4 class="font-black text-indigo-600 text-sm mb-3">
              📋 سجل بلاغات الصيانة السابقة وصور الضمان والأعطال
            </h4>
            <div class="space-y-3">
              <div
                v-for="ticket in customerTickets"
                :key="ticket.id"
                class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="font-bold text-sm">
                      <span class="font-mono text-blue-600">{{ ticket.ticket_number }}</span> —
                      {{ ticket.appliance_type }} ({{ ticket.brand }})
                      <span class="text-slate-400 font-normal text-xs mr-2">
                        📅 {{ ticket.scheduled_date }}
                      </span>
                    </div>
                    <div class="text-slate-600 dark:text-slate-300 mt-1">
                      <strong>شكوى العطل:</strong> {{ ticket.complaint }}
                    </div>
                    <div v-if="ticket.diagnosis" class="text-emerald-600 font-semibold mt-0.5">
                      <strong>التشخيص والإصلاح:</strong> {{ ticket.diagnosis }}
                    </div>
                    <div
                      v-if="ticket.warranty_end_date"
                      class="text-xs text-blue-600 dark:text-blue-400 font-bold mt-0.5"
                    >
                      🛡️ الضمان: {{ ticket.warranty_months }} شهور (ينتهي في {{ ticket.warranty_end_date }})
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-black text-sm">{{ ticket.total_amount }} ج.م</span>
                    <button
                      type="button"
                      @click="appStore.openPrintModal(ticket, 'invoice_warranty')"
                      class="px-2.5 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Printer class="w-3.5 h-3.5" /> طباعة الضمان
                    </button>
                  </div>
                </div>

                <!-- Direct Attachment & Gallery Bar for Warranty Image & Fault Images -->
                <div
                  class="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <!-- Warranty Image Thumbnail -->
                    <div
                      v-if="ticket.warranty_image"
                      class="relative w-16 h-16 rounded-xl border-2 border-emerald-500 overflow-hidden bg-white group"
                    >
                      <img
                        :src="ticket.warranty_image"
                        @click="
                          appStore.openImagePreview(
                            ticket.warranty_image,
                            `صورة ضمان بلاغ ${ticket.ticket_number}`
                          )
                        "
                        class="w-full h-full object-cover cursor-pointer"
                      />
                      <span
                        class="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[9px] font-bold text-center py-0.5 pointer-events-none"
                      >
                        صورة الضمان
                      </span>
                      <button
                        type="button"
                        @click="handleRemoveTicketWarrantyImage(ticket)"
                        class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        title="حذف صورة الضمان"
                      >
                        ×
                      </button>
                    </div>

                    <!-- Fault Images Thumbnails -->
                    <div
                      v-for="(fImg, fIdx) in ticket.fault_images"
                      :key="fIdx"
                      class="relative w-16 h-16 rounded-xl border-2 border-amber-500 overflow-hidden bg-white group"
                    >
                      <img
                        :src="fImg"
                        @click="
                          appStore.openImagePreview(
                            fImg,
                            `صورة العطل (${fIdx + 1}) - بلاغ ${ticket.ticket_number}`
                          )
                        "
                        class="w-full h-full object-cover cursor-pointer"
                      />
                      <span
                        class="absolute bottom-0 inset-x-0 bg-amber-600/90 text-white text-[9px] font-bold text-center py-0.5 pointer-events-none"
                      >
                        عطل {{ fIdx + 1 }}
                      </span>
                      <button
                        type="button"
                        @click="handleRemoveTicketFaultImage(ticket, fIdx)"
                        class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        title="حذف صورة العطل"
                      >
                        ×
                      </button>
                    </div>

                    <span
                      v-if="!ticket.warranty_image && (!ticket.fault_images || ticket.fault_images.length === 0)"
                      class="text-slate-400 text-[11px]"
                    >
                      لم يتم إرفاق صور ضمان أو صور عطل لهذا البلاغ بعد
                    </span>
                  </div>

                  <!-- Upload Buttons -->
                  <div class="flex flex-wrap items-center gap-2">
                    <label
                      class="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ShieldCheck class="w-3.5 h-3.5" />
                      <span>{{ ticket.warranty_image ? 'تغيير صورة الضمان' : 'إرفاق صورة الضمان' }}</span>
                      <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        @change="(e) => handleTicketWarrantyUpload(ticket, e)"
                      />
                    </label>

                    <label
                      class="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Camera class="w-3.5 h-3.5" />
                      <span>إرفاق صور العطل (+)</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        class="hidden"
                        @change="(e) => handleTicketFaultUpload(ticket, e)"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div v-if="customerTickets.length === 0" class="text-slate-400">
                لا توجد بلاغات صيانة سابقة لهذا العميل
              </div>
            </div>
          </div>
        </template>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD / EDIT HEARING TEST (HearingTestForm.vue)      -->
    <!-- ======================================================== -->
    <div
      v-if="hearingTestModalOpen && selectedCustomer"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl my-8 overflow-hidden">
        <HearingTestForm
          :initial-test="selectedHearingTest"
          :patient-id="selectedCustomer.id"
          :patient-name="selectedCustomer.name"
          :technicians="technicians"
          :products="products"
          @submit="handleSaveHearingTest"
          @cancel="hearingTestModalOpen = false"
          @convert-to-sale="handleConvertToSale"
        />
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: PREVIEW & COMPARE AUDIOGRAM CHART                 -->
    <!-- ======================================================== -->
    <div
      v-if="previewTestModalOpen && testToPreview"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-3xl p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <Activity class="w-4 h-4 text-blue-600" />
            معاينة مخطط الأوديوجرام — فحص رقم {{ testToPreview.test_number }} ({{ testToPreview.test_date }})
          </h3>
          <button @click="previewTestModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
          <div>
            <span class="font-bold text-red-600">الأذن اليمنى (Right): </span>
            <span class="font-mono font-bold">PTA {{ testToPreview.pta_right ?? '—' }} dB</span> — {{ testToPreview.loss_degree_right || 'طبيعي' }}
          </div>
          <div>
            <span class="font-bold text-blue-600">الأذن اليسرى (Left): </span>
            <span class="font-mono font-bold">PTA {{ testToPreview.pta_left ?? '—' }} dB</span> — {{ testToPreview.loss_degree_left || 'طبيعي' }}
          </div>
        </div>

        <AudiogramChart
          :model-value="testToPreview.points || []"
          :comparison-points="testToCompare ? testToCompare.points : []"
          :comparison-label="testToCompare ? `مقارنة بفحص ${testToCompare.test_date}` : ''"
          readonly
        />

        <div v-if="patientBundle && patientBundle.hearingTests.length > 1" class="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span class="font-bold">مقارنة بصرية مع فحص آخر لنفس المريض:</span>
          <select v-model="testToCompare" class="p-2 rounded-xl border bg-white dark:bg-slate-800 text-xs font-bold">
            <option :value="null">بدون مقارنة (الفحص الحالي فقط)</option>
            <option v-for="t in patientBundle.hearingTests.filter(x => x.id !== testToPreview!.id)" :key="t.id" :value="t">
              {{ t.test_date }} (رقم: {{ t.test_number }})
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: UPLOAD PATIENT ATTACHMENT                         -->
    <!-- ======================================================== -->
    <div
      v-if="uploadAttachmentModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <Paperclip class="w-4 h-4 text-blue-600" />
            رفع مرفق / تقرير طبي محلي
          </h3>
          <button @click="uploadAttachmentModalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <div class="space-y-3.5">
          <div>
            <label class="block font-bold mb-1">عنوان المرفق *</label>
            <input
              v-model="newAttachmentTitle"
              type="text"
              placeholder="مثال: تقرير رنين مغناطيسي / أوديوجرام خارجي..."
              class="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-bold"
            />
          </div>

          <div>
            <label class="block font-bold mb-1">تصنيف المرفق</label>
            <select
              v-model="newAttachmentCategory"
              class="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-bold"
            >
              <option value="external_report">تقرير طبي خارجي (External Report)</option>
              <option value="audiogram_scan">مسح ضوئي لأوديوجرام سابق</option>
              <option value="mapping_file">ملف برمجة قوقعة (Map File)</option>
              <option value="prescription">روشتة أو تحويل طبي</option>
              <option value="id_card">بطاقة هوية / تأمين</option>
              <option value="general">عام / أخرى</option>
            </select>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات إضافية</label>
            <textarea
              v-model="newAttachmentNotes"
              rows="2"
              class="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800"
            ></textarea>
          </div>

          <div>
            <label class="block font-bold mb-1">اختيار الملف (صورة / PDF / ملف برمجة)</label>
            <input
              type="file"
              @change="handleFileSelected"
              class="w-full p-2 rounded-xl border bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          <div class="flex justify-end pt-2">
            <button
              type="button"
              @click="uploadAttachmentModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- Add / Edit Customer Appliance & Warranty/Fault Images Modal  -->
    <!-- ============================================================ -->
    <div
      v-if="applianceModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 text-xs"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-black text-sm">
            {{
              applianceForm.id
                ? `تعديل بيانات ${t('device')} وصور الضمان والعطل`
                : `إضافة ${t('device')} جديد لسجل العميل`
            }}
          </h3>
          <button @click="applianceModalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleSaveAppliance" class="p-6 overflow-y-auto space-y-3.5">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">{{ t('deviceType') }} *</label>
              <select
                v-model="applianceForm.appliance_type"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="tVal in availableDeviceTypes" :key="tVal" :value="tVal">{{ tVal }}</option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">{{ t('brand') }} *</label>
              <select
                v-model="applianceForm.brand"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="bVal in availableBrands" :key="bVal" :value="bVal">{{ bVal }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">الموديل</label>
              <input
                v-model="applianceForm.model"
                type="text"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">رقم السيريال</label>
              <input
                v-model="applianceForm.serial_number"
                type="text"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">تاريخ انتهاء الضمان</label>
            <input
              v-model="applianceForm.last_warranty_end"
              type="date"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <!-- Dynamic Custom Fields for Device / Hearing Aid -->
          <DynamicFields
            entity="device"
            v-model="applianceForm.extra_data"
            :title="`بيانات مخصصة لـ ${t('device')}`"
          />

          <!-- Warranty Image Attachment -->
          <div
            class="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-emerald-800 dark:text-emerald-300">
                🛡️ صورة شهادة الضمان / فاتورة الضمان
              </span>
              <div class="flex items-center gap-1.5">
                <label
                  class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Upload class="w-3.5 h-3.5" />
                  <span>{{ applianceForm.warranty_image ? 'تغيير الصورة' : 'رفع صورة الضمان' }}</span>
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleApplianceWarrantyImageUpload"
                  />
                </label>
                <button
                  v-if="applianceForm.warranty_image"
                  type="button"
                  @click="applianceForm.warranty_image = ''"
                  class="px-2 py-1.5 rounded-lg bg-rose-100 text-rose-700 font-bold cursor-pointer"
                >
                  حذف
                </button>
              </div>
            </div>
            <div v-if="applianceForm.warranty_image" class="pt-1">
              <img
                :src="applianceForm.warranty_image"
                @click="appStore.openImagePreview(applianceForm.warranty_image, 'صورة الضمان')"
                class="h-24 rounded-xl border border-emerald-400 object-contain bg-white cursor-pointer"
              />
            </div>
          </div>

          <!-- Fault Images Attachment -->
          <div
            class="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-amber-900 dark:text-amber-300">
                📷 صور العطل وحالة {{ t('device') }} (يمكن إرفاق أكثر من صورة)
              </span>
              <label
                class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Camera class="w-3.5 h-3.5" />
                <span>إضافة صور العطل (+)</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  @change="handleApplianceFaultImagesUpload"
                />
              </label>
            </div>
            <div
              v-if="applianceForm.fault_images && applianceForm.fault_images.length > 0"
              class="flex flex-wrap gap-2 pt-1"
            >
              <div
                v-for="(img, idx) in applianceForm.fault_images"
                :key="idx"
                class="relative w-20 h-20 rounded-xl border border-amber-400 overflow-hidden bg-white"
              >
                <img
                  :src="img"
                  @click="appStore.openImagePreview(img, `صورة العطل ${idx + 1}`)"
                  class="w-full h-full object-cover cursor-pointer"
                />
                <button
                  type="button"
                  @click="removeApplianceFaultImage(idx)"
                  class="absolute top-1 left-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              @click="applianceModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
            >
              حفظ {{ t('device') }} والصور
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
