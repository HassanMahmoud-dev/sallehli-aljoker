<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { Customer, CustomerAppliance, MaintenanceTicket } from '@shared/types'
import { useAppStore } from '@renderer/stores/appStore'
import {
  Users,
  UserPlus,
  Search,
  Edit3,
  Trash2,
  History,
  MessageCircle,
  Printer,
  X
} from 'lucide-vue-next'

const appStore = useAppStore()
const customers = ref<Customer[]>([])
const searchQuery = ref('')

const modalOpen = ref(false)
const historyModalOpen = ref(false)
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

async function openHistoryModal(c: Customer): Promise<void> {
  selectedCustomer.value = c
  const res = await window.api.findCustomerByPhone(c.phone)
  customerAppliances.value = res.appliances
  customerTickets.value = res.previousTickets
  historyModalOpen.value = true
}

async function handleSaveCustomer(): Promise<void> {
  if (!form.value.name?.trim() || !form.value.phone?.trim()) {
    alert('يرجى إدخال اسم العميل ورقم الهاتف')
    return
  }
  await window.api.saveCustomer(form.value)
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
          ملف شامل لكل عميل، أجهزته المنزلية المسجلة، تاريخ الأعطال السابقة، وشهادات الضمان السارية
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
                  سجل الأجهزة والضمان
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

    <!-- Customer History & Appliances Modal -->
    <div
      v-if="historyModalOpen && selectedCustomer"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden text-xs"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-black text-sm">
            السجل التاريخي لأجهزة وصيانات العميل: {{ selectedCustomer.name }} ({{
              selectedCustomer.phone
            }})
          </h3>
          <button @click="historyModalOpen = false" class="cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-5">
          <div>
            <h4 class="font-black text-blue-600 mb-2">🔌 الأجهزة المسجلة باسم العميل</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="app in customerAppliances"
                :key="app.id"
                class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
              >
                <div class="font-bold text-sm">{{ app.appliance_type }} — {{ app.brand }}</div>
                <div class="text-slate-500 mt-1">
                  الموديل: {{ app.model || '—' }} | السيريال: {{ app.serial_number || '—' }}
                </div>
                <div
                  v-if="app.last_warranty_end"
                  class="mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold"
                >
                  🛡️ آخر ضمان مسجل ينتهي في: {{ app.last_warranty_end }} (طلب
                  {{ app.last_ticket_number }})
                </div>
              </div>
              <div v-if="customerAppliances.length === 0" class="text-slate-400">
                لا توجد أجهزة مسجلة بعد
              </div>
            </div>
          </div>

          <div>
            <h4 class="font-black text-indigo-600 mb-2">📋 سجل بلاغات الصيانة السابقة</h4>
            <div class="space-y-2">
              <div
                v-for="t in customerTickets"
                :key="t.id"
                class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between"
              >
                <div>
                  <div class="font-bold">
                    <span class="font-mono text-blue-600">{{ t.ticket_number }}</span> —
                    {{ t.appliance_type }} ({{ t.brand }})
                  </div>
                  <div class="text-slate-500 mt-0.5">الشكوى: {{ t.complaint }}</div>
                  <div v-if="t.diagnosis" class="text-emerald-600 font-semibold">
                    الإصلاح: {{ t.diagnosis }}
                  </div>
                </div>
                <div class="text-left space-y-1">
                  <div class="font-black">{{ t.total_amount }} ج.م</div>
                  <button
                    type="button"
                    @click="appStore.openPrintModal(t, 'invoice_warranty')"
                    class="px-2.5 py-1 rounded bg-blue-100 text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Printer class="w-3.5 h-3.5" /> طباعة
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
