<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { ref, onMounted, watch } from 'vue'
import type { Customer, CustomerAppliance, MaintenanceTicket } from '@shared/types'
import { APPLIANCE_TYPES, APPLIANCE_BRANDS } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
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
  X
} from 'lucide-vue-next'

const appStore = useAppStore()
const customers = ref<Customer[]>([])
const searchQuery = ref('')

const modalOpen = ref(false)
const historyModalOpen = ref(false)
const applianceModalOpen = ref(false)

const selectedCustomer = ref<Customer | null>(null)
const customerAppliances = ref<CustomerAppliance[]>([])
const customerTickets = ref<MaintenanceTicket[]>([])

const form = ref<Partial<Customer>>({
  name: '',
  phone: '',
  phone2: '',
  area: '',
  address: '',
  notes: ''
})

const applianceForm = ref<Partial<CustomerAppliance>>({
  customer_id: 0,
  appliance_type: APPLIANCE_TYPES[0],
  brand: APPLIANCE_BRANDS[0],
  model: '',
  serial_number: '',
  last_warranty_end: '',
  notes: '',
  warranty_image: '',
  fault_images: []
})

async function loadCustomers(): Promise<void> {
  customers.value = await window.api.listCustomers(searchQuery.value)
}

watch(searchQuery, () => {
  loadCustomers()
})

function openCreateModal(): void {
  form.value = { name: '', phone: '', phone2: '', area: '', address: '', notes: '' }
  modalOpen.value = true
}

function openEditModal(c: Customer): void {
  form.value = { ...c }
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
  await refreshCustomerHistory()
  historyModalOpen.value = true
}

function openCreateApplianceModal(): void {
  if (!selectedCustomer.value) return
  applianceForm.value = {
    customer_id: selectedCustomer.value.id,
    appliance_type: APPLIANCE_TYPES[0],
    brand: APPLIANCE_BRANDS[0],
    model: '',
    serial_number: '',
    last_warranty_end: '',
    notes: '',
    warranty_image: '',
    fault_images: []
  }
  applianceModalOpen.value = true
}

function openEditApplianceModal(app: CustomerAppliance): void {
  applianceForm.value = {
    ...app,
    warranty_image: app.warranty_image || '',
    fault_images: Array.isArray(app.fault_images) ? [...app.fault_images] : []
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
  await window.api.saveCustomerAppliance(plain(applianceForm.value))
  applianceModalOpen.value = false
  await refreshCustomerHistory()
}

async function handleDeleteAppliance(app: CustomerAppliance): Promise<void> {
  if (!confirm(`هل أنت متأكد من حذف الجهاز "${app.appliance_type}" من سجل العميل؟`)) return
  await window.api.deleteCustomerAppliance(app.id)
  await refreshCustomerHistory()
}

// Direct upload of warranty image or fault images on a Ticket inside Customer History
async function handleTicketWarrantyUpload(t: MaintenanceTicket, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const img = await compressImageFile(file, 1100, 1100, 0.84)
  await window.api.updateTicketImages({
    ticketId: t.id,
    warranty_image: img,
    fault_images: Array.isArray(t.fault_images) ? t.fault_images : []
  })
  input.value = ''
  await refreshCustomerHistory()
}

async function handleRemoveTicketWarrantyImage(t: MaintenanceTicket): Promise<void> {
  await window.api.updateTicketImages({
    ticketId: t.id,
    warranty_image: '',
    fault_images: Array.isArray(t.fault_images) ? t.fault_images : []
  })
  await refreshCustomerHistory()
}

async function handleTicketFaultUpload(t: MaintenanceTicket, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
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
}

async function handleRemoveTicketFaultImage(t: MaintenanceTicket, idx: number): Promise<void> {
  const list = Array.isArray(t.fault_images) ? [...t.fault_images] : []
  list.splice(idx, 1)
  await window.api.updateTicketImages({
    ticketId: t.id,
    warranty_image: t.warranty_image || '',
    fault_images: list
  })
  await refreshCustomerHistory()
}

async function handleSaveCustomer(): Promise<void> {
  if (!form.value.name?.trim() || !form.value.phone?.trim()) {
    alert('يرجى إدخال اسم العميل ورقم الهاتف')
    return
  }
  await window.api.saveCustomer(plain(form.value))
  modalOpen.value = false
  await loadCustomers()
}

async function handleDeleteCustomer(c: Customer): Promise<void> {
  if (!confirm(`هل أنت متأكد من حذف ملف العميل "${c.name}"؟`)) return
  try {
    await window.api.deleteCustomer(c.id)
    await loadCustomers()
  } catch {
    alert('لا يمكن حذف عميل مرتبط بطلبات صيانة سابقة حفاظاً على السجل المالي.')
  }
}

function openWhatsAppChat(phone: string, name: string): void {
  let clean = phone.replace(/\D/g, '')
  if (clean.startsWith('01') && clean.length === 11) clean = '2' + clean
  const text = `مرحباً بحضرتك أ/ ${name} من ${appStore.settings.center_name}`
  window.api.openExternal(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`)
}

onMounted(loadCustomers)
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
          سجل العملاء وتاريخ صيانة الأجهزة والضمان
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          ملف شامل لكل عميل، أجهزته المنزلية المسجلة، صور الأعطال، وتاريخ وصور شهادات الضمان السارية
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
            <td class="py-3.5 px-4 font-bold text-slate-900 dark:text-white text-sm">
              {{ c.name }}
            </td>
            <td class="py-3.5 px-4 font-mono">
              <div class="font-bold text-blue-600 dark:text-blue-400">{{ c.phone }}</div>
              <div v-if="c.phone2" class="text-slate-500">{{ c.phone2 }}</div>
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold">{{ c.area || '—' }}</div>
              <div class="text-slate-500">{{ c.address }}</div>
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
                  <History class="w-3.5 h-3.5" />
                  سجل الأجهزة والضمان والصور
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
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">
            {{ form.id ? 'تعديل بيانات العميل' : 'إضافة عميل جديد' }}
          </h3>
          <button @click="modalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>
        <form @submit.prevent="handleSaveCustomer" class="p-6 space-y-3 text-xs">
          <div>
            <label class="block font-bold mb-1">اسم العميل *</label>
            <input
              v-model="form.name"
              required
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
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
            <label class="block font-bold mb-1">ملاحظات</label>
            <input
              v-model="form.notes"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
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
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-xs"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <div>
            <h3 class="font-black text-sm">
              السجل التاريخي لأجهزة وصيانات وضمان العميل: {{ selectedCustomer.name }} ({{
                selectedCustomer.phone
              }})
            </h3>
            <p class="text-[11px] text-slate-500 mt-0.5">
              إرفاق واستعراض صورة شهادة الضمان وصور العطل لكل جهاز وكل بلاغ صيانة
            </p>
          </div>
          <button @click="historyModalOpen = false" class="cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6">
          <!-- Section 1: Customer Appliances & Warranty / Fault Photos -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-black text-blue-600 text-sm">
                🔌 الأجهزة المسجلة باسم العميل وصور الضمان والأعطال
              </h4>
              <button
                type="button"
                @click="openCreateApplianceModal"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
              >
                <PlusCircle class="w-3.5 h-3.5" />
                إضافة جهاز ومرفقات ضمان
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
                لا توجد أجهزة مسجلة بعد — اضغط على "إضافة جهاز ومرفقات ضمان"
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
                v-for="t in customerTickets"
                :key="t.id"
                class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="font-bold text-sm">
                      <span class="font-mono text-blue-600">{{ t.ticket_number }}</span> —
                      {{ t.appliance_type }} ({{ t.brand }})
                      <span class="text-slate-400 font-normal text-xs mr-2">
                        📅 {{ t.scheduled_date }}
                      </span>
                    </div>
                    <div class="text-slate-600 dark:text-slate-300 mt-1">
                      <strong>شكوى العطل:</strong> {{ t.complaint }}
                    </div>
                    <div v-if="t.diagnosis" class="text-emerald-600 font-semibold mt-0.5">
                      <strong>التشخيص والإصلاح:</strong> {{ t.diagnosis }}
                    </div>
                    <div
                      v-if="t.warranty_end_date"
                      class="text-xs text-blue-600 dark:text-blue-400 font-bold mt-0.5"
                    >
                      🛡️ الضمان: {{ t.warranty_months }} شهور (ينتهي في {{ t.warranty_end_date }})
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-black text-sm">{{ t.total_amount }} ج.م</span>
                    <button
                      type="button"
                      @click="appStore.openPrintModal(t, 'invoice_warranty')"
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
                      v-if="t.warranty_image"
                      class="relative w-16 h-16 rounded-xl border-2 border-emerald-500 overflow-hidden bg-white group"
                    >
                      <img
                        :src="t.warranty_image"
                        @click="
                          appStore.openImagePreview(
                            t.warranty_image,
                            `صورة ضمان بلاغ ${t.ticket_number}`
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
                        @click="handleRemoveTicketWarrantyImage(t)"
                        class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        title="حذف صورة الضمان"
                      >
                        ×
                      </button>
                    </div>

                    <!-- Fault Images Thumbnails -->
                    <div
                      v-for="(fImg, fIdx) in t.fault_images"
                      :key="fIdx"
                      class="relative w-16 h-16 rounded-xl border-2 border-amber-500 overflow-hidden bg-white group"
                    >
                      <img
                        :src="fImg"
                        @click="
                          appStore.openImagePreview(
                            fImg,
                            `صورة العطل (${fIdx + 1}) - بلاغ ${t.ticket_number}`
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
                        @click="handleRemoveTicketFaultImage(t, fIdx)"
                        class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        title="حذف صورة العطل"
                      >
                        ×
                      </button>
                    </div>

                    <span
                      v-if="!t.warranty_image && (!t.fault_images || t.fault_images.length === 0)"
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
                      <span>{{ t.warranty_image ? 'تغيير صورة الضمان' : 'إرفاق صورة الضمان' }}</span>
                      <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        @change="(e) => handleTicketWarrantyUpload(t, e)"
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
                        @change="(e) => handleTicketFaultUpload(t, e)"
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
                ? 'تعديل بيانات الجهاز وصور الضمان والعطل'
                : 'إضافة جهاز جديد لسجل العميل'
            }}
          </h3>
          <button @click="applianceModalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleSaveAppliance" class="p-6 overflow-y-auto space-y-3.5">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">نوع الجهاز *</label>
              <select
                v-model="applianceForm.appliance_type"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="t in APPLIANCE_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">الماركة *</label>
              <select
                v-model="applianceForm.brand"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="b in APPLIANCE_BRANDS" :key="b" :value="b">{{ b }}</option>
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
                📷 صور العطل وحالة الجهاز (يمكن إرفاق أكثر من صورة)
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
              حفظ الجهاز والصور
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
