<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { useAppStore } from '@renderer/stores/appStore'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import type { Supplier, SupplierStatement } from '@shared/types'
import {
  Truck,
  PlusCircle,
  Search,
  Edit3,
  Trash2,
  FileText,
  Wallet,
  Building2,
  Phone,
  Printer,
  X
} from 'lucide-vue-next'

const appStore = useAppStore()

const suppliers = ref<Supplier[]>([])
const searchQuery = ref('')
const modalOpen = ref(false)
const statementModalOpen = ref(false)
const payModalOpen = ref(false)

const activeStatement = ref<SupplierStatement | null>(null)
const supplierToPay = ref<Supplier | null>(null)

const form = ref<Partial<Supplier>>({
  name: '',
  company_name: '',
  phone: '',
  phone2: '',
  address: '',
  supplier_type: 'company',
  balance: 0,
  notes: '',
  is_active: 1
})

const payForm = ref({
  supplier_id: 0,
  amount: 0,
  payment_method: 'cash',
  notes: '',
  recordInTreasury: true
})

const totalSuppliersBalance = computed(() =>
  suppliers.value.reduce((acc, s) => acc + Number(s.balance || 0), 0)
)

async function loadData(): Promise<void> {
  suppliers.value = await window.api.listSuppliers(searchQuery.value)
}

watch(searchQuery, () => {
  loadData()
})

function openCreateModal(): void {
  form.value = {
    name: '',
    company_name: '',
    phone: '',
    phone2: '',
    address: '',
    supplier_type: 'company',
    balance: 0,
    notes: '',
    is_active: 1
  }
  modalOpen.value = true
}

function openEditModal(s: Supplier): void {
  form.value = { ...s }
  modalOpen.value = true
}

async function handleSaveSupplier(): Promise<void> {
  if (!form.value.name?.trim() || !form.value.phone?.trim()) {
    swalError('بيانات ناقصة', 'يرجى إدخال اسم المورد ورقم الهاتف')
    return
  }
  try {
    await appStore.withLoading(async () => {
      await window.api.saveSupplier(plain(form.value))
      modalOpen.value = false
      await loadData()
    }, 'جاري حفظ بيانات المورد...')
    swalSuccess('تم حفظ بيانات المورد بنجاح')
  } catch (err: unknown) {
    swalError('تعذر الحفظ', err instanceof Error ? err.message : '')
  }
}

async function handleDeleteSupplier(s: Supplier): Promise<void> {
  const ok = await swalConfirm('حذف المورد', `هل أنت متأكد من حذف المورد (${s.name})؟`)
  if (!ok) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteSupplier(s.id)
      await loadData()
    }, 'جاري حذف المورد...')
    swalSuccess('تم حذف المورد بنجاح')
  } catch (err: unknown) {
    swalError('تعذر الحذف', err instanceof Error ? err.message : '')
  }
}

async function openStatementModal(s: Supplier): Promise<void> {
  try {
    await appStore.withLoading(async () => {
      activeStatement.value = await window.api.getSupplierStatement(s.id)
      statementModalOpen.value = true
    }, 'جاري تحميل كشف حساب المورد...')
  } catch (err: unknown) {
    swalError('تعذر فتح كشف الحساب', err instanceof Error ? err.message : '')
  }
}

function openPayModal(s: Supplier): void {
  supplierToPay.value = s
  payForm.value = {
    supplier_id: s.id,
    amount: Math.max(0, Number(s.balance || 0)),
    payment_method: 'cash',
    notes: '',
    recordInTreasury: true
  }
  payModalOpen.value = true
}

async function handlePaySupplier(): Promise<void> {
  if (!supplierToPay.value || payForm.value.amount <= 0) {
    swalError('تنبيه', 'يرجى إدخال مبلغ سداد صحيح أكبر من صفر')
    return
  }
  try {
    await appStore.withLoading(async () => {
      await window.api.paySupplier(plain(payForm.value))
      payModalOpen.value = false
      await loadData()
      if (statementModalOpen.value && activeStatement.value?.supplier.id === supplierToPay.value?.id) {
        activeStatement.value = await window.api.getSupplierStatement(supplierToPay.value.id)
      }
    }, 'جاري تسجيل دفعة السداد للمورد...')
    swalSuccess('تم تسجيل دفعة السداد وخصمها من رصيد المورد بنجاح')
  } catch (err: unknown) {
    swalError('تعذر تسجيل الدفعة', err instanceof Error ? err.message : '')
  }
}

function printStatement(): void {
  window.print()
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <!-- Top Header -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-11 h-11 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"
        >
          <Truck class="w-6 h-6" />
        </div>
        <div>
          <h1 class="text-xl font-black text-slate-900 dark:text-white">
            الموردون والشركات وكشوف الحساب
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            إدارة موردي السماعات والبطاريات وتوكيلات القوقعة، متابعة الأرصدة الدائنة، وسداد الدفعات
          </p>
        </div>
      </div>

      <button
        type="button"
        @click="openCreateModal"
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
      >
        <PlusCircle class="w-4 h-4" />
        إضافة مورد / شركة جديدة
      </button>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-xs font-bold text-slate-500">إجمالي الموردين المسجلين</div>
        <div class="text-2xl font-black text-slate-900 dark:text-white mt-1">
          {{ suppliers.length }}
        </div>
      </div>

      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-xs font-bold text-slate-500">إجمالي المستحقات الدائنة للموردين</div>
        <div class="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
          {{ totalSuppliersBalance.toLocaleString() }} ج.م
        </div>
      </div>

      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-xs font-bold text-slate-500">إجمالي المدفوعات المسددة للموردين</div>
        <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
          {{
            suppliers
              .reduce((acc, s) => acc + Number(s.total_paid || 0), 0)
              .toLocaleString()
          }}
          ج.م
        </div>
      </div>
    </div>

    <!-- Search Bar -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between gap-4"
    >
      <div class="relative w-full md:w-96">
        <Search class="w-4 h-4 text-slate-400 absolute right-3.5 top-2.5" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="بحث باسم المورد، الشركة، رقم الهاتف، أو العنوان..."
          class="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
    </div>

    <!-- Suppliers Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead
            class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-bold"
          >
            <tr>
              <th class="p-3.5">اسم المورد / المندوب</th>
              <th class="p-3.5">الشركة / التوكيل</th>
              <th class="p-3.5">الهاتف والعنوان</th>
              <th class="p-3.5">إجمالي المسدد</th>
              <th class="p-3.5">الرصيد المستحق للمورد</th>
              <th class="p-3.5 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200/70 dark:divide-slate-800">
            <tr v-if="suppliers.length === 0">
              <td colspan="6" class="p-10 text-center text-slate-400 font-bold">
                لا يوجد موردون مسجلون حالياً
              </td>
            </tr>
            <tr
              v-for="s in suppliers"
              :key="s.id"
              class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
            >
              <td class="p-3.5">
                <div class="font-black text-slate-900 dark:text-white">{{ s.name }}</div>
                <div v-if="s.notes" class="text-[11px] text-slate-400 mt-0.5">{{ s.notes }}</div>
              </td>

              <td class="p-3.5">
                <span
                  v-if="s.company_name"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300"
                >
                  <Building2 class="w-3.5 h-3.5 text-indigo-500" />
                  {{ s.company_name }}
                </span>
                <span v-else class="text-slate-400">—</span>
              </td>

              <td class="p-3.5">
                <div class="font-mono font-bold flex items-center gap-1">
                  <Phone class="w-3.5 h-3.5 text-slate-400" />
                  <span>{{ s.phone }}</span>
                  <span v-if="s.phone2" class="text-slate-400">/ {{ s.phone2 }}</span>
                </div>
                <div v-if="s.address" class="text-[11px] text-slate-500 mt-0.5">
                  {{ s.address }}
                </div>
              </td>

              <td class="p-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {{ Number(s.total_paid || 0).toLocaleString() }} ج.م
              </td>

              <td class="p-3.5 font-mono">
                <span
                  :class="[
                    'px-3 py-1 rounded-xl font-black text-xs',
                    s.balance > 0
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  ]"
                >
                  {{ Number(s.balance || 0).toLocaleString() }} ج.م
                </span>
              </td>

              <td class="p-3.5">
                <div class="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    @click="openStatementModal(s)"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold text-[11px] cursor-pointer"
                  >
                    <FileText class="w-3.5 h-3.5" />
                    كشف حساب
                  </button>

                  <button
                    v-if="appStore.canViewFinancials"
                    type="button"
                    @click="openPayModal(s)"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[11px] cursor-pointer"
                  >
                    <Wallet class="w-3.5 h-3.5" />
                    سداد دفعة
                  </button>

                  <button
                    type="button"
                    @click="openEditModal(s)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                    title="تعديل"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>

                  <button
                    v-if="appStore.canDeleteRecords"
                    type="button"
                    @click="handleDeleteSupplier(s)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                    title="حذف"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL 1: ADD / EDIT SUPPLIER -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <h3 class="font-black text-base text-slate-900 dark:text-white">
            {{ form.id ? 'تعديل بيانات المورد' : 'إضافة مورد / توكيل جديد' }}
          </h3>
          <button
            type="button"
            @click="modalOpen = false"
            class="p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-5 space-y-4 text-xs">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">اسم المورد / المسؤول *</label>
              <input
                v-model="form.name"
                type="text"
                placeholder="مثال: أ/ أحمد محمود"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">اسم الشركة / التوكيل</label>
              <input
                v-model="form.company_name"
                type="text"
                placeholder="مثال: توكيل فوناك مصر"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">رقم الهاتف الأساسي *</label>
              <input
                v-model="form.phone"
                type="text"
                placeholder="010xxxxxxxx"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">رقم هاتف إضافي</label>
              <input
                v-model="form.phone2"
                type="text"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div class="md:col-span-2">
              <label class="block font-bold mb-1">العنوان</label>
              <input
                v-model="form.address"
                type="text"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div class="md:col-span-2">
              <label class="block font-bold mb-1">
                الرصيد المستحق للمورد حالياً (ج.م)
              </label>
              <input
                v-model.number="form.balance"
                type="number"
                step="0.5"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
              />
            </div>

            <div class="md:col-span-2">
              <label class="block font-bold mb-1">ملاحظات</label>
              <textarea
                v-model="form.notes"
                rows="2"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              ></textarea>
            </div>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <button
            type="button"
            @click="modalOpen = false"
            class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold text-xs cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            @click="handleSaveSupplier"
            class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
          >
            حفظ المورد
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: PAY SUPPLIER -->
    <div
      v-if="payModalOpen && supplierToPay"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <div>
            <h3 class="font-black text-sm text-slate-900 dark:text-white">
              سداد دفعة للمورد — {{ supplierToPay.name }}
            </h3>
            <p class="text-[11px] text-rose-600 font-bold">
              الرصيد المستحق حالياً: {{ supplierToPay.balance.toLocaleString() }} ج.م
            </p>
          </div>
          <button
            type="button"
            @click="payModalOpen = false"
            class="p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-5 space-y-4 text-xs">
          <div>
            <label class="block font-bold mb-1">المبلغ المسدد (ج.م) *</label>
            <input
              v-model.number="payForm.amount"
              type="number"
              min="1"
              step="0.5"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-black text-base text-emerald-700 dark:text-emerald-400"
            />
          </div>

          <div>
            <label class="block font-bold mb-1">طريقة الدفع / المحفظة</label>
            <select
              v-model="payForm.payment_method"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
            >
              <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block font-bold mb-1">البيان / ملاحظات السداد</label>
            <input
              v-model="payForm.notes"
              type="text"
              placeholder="مثال: دفعة تحت الحساب / سداد فاتورة..."
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>

          <label class="flex items-center gap-2 font-bold cursor-pointer">
            <input v-model="payForm.recordInTreasury" type="checkbox" class="rounded" />
            <span>خصم المبلغ وتسجيله كمنصرف في الخزينة تلقائياً</span>
          </label>
        </div>

        <div
          class="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <button
            type="button"
            @click="payModalOpen = false"
            class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold text-xs cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            @click="handlePaySupplier"
            class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
          >
            تأكيد السداد
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL 3: SUPPLIER STATEMENT -->
    <div
      v-if="statementModalOpen && activeStatement"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div
          class="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <div>
            <h3 class="font-black text-base text-slate-900 dark:text-white">
              كشف حساب مورد — {{ activeStatement.supplier.name }}
              <span v-if="activeStatement.supplier.company_name" class="text-slate-500">
                ({{ activeStatement.supplier.company_name }})
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-mono">
              هاتف: {{ activeStatement.supplier.phone }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="appStore.canViewFinancials"
              type="button"
              @click="openPayModal(activeStatement.supplier)"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
            >
              <Wallet class="w-4 h-4" />
              سداد دفعة
            </button>

            <button
              type="button"
              @click="printStatement"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
            >
              <Printer class="w-4 h-4" />
              طباعة
            </button>

            <button
              type="button"
              @click="statementModalOpen = false"
              class="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <div class="p-6 overflow-y-auto space-y-5 text-xs">
          <!-- Summary Strip -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div class="text-[11px] text-slate-500 font-bold">إجمالي المشتريات</div>
              <div class="text-base font-black font-mono mt-0.5">
                {{ activeStatement.totalPurchases.toLocaleString() }} ج.م
              </div>
            </div>
            <div class="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div class="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">إجمالي المسدد</div>
              <div class="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono mt-0.5">
                {{ activeStatement.totalPaid.toLocaleString() }} ج.م
              </div>
            </div>
            <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div class="text-[11px] text-amber-700 dark:text-amber-300 font-bold">إجمالي المرتجعات</div>
              <div class="text-base font-black text-amber-700 dark:text-amber-300 font-mono mt-0.5">
                {{ activeStatement.totalReturns.toLocaleString() }} ج.م
              </div>
            </div>
            <div class="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
              <div class="text-[11px] text-rose-700 dark:text-rose-300 font-bold">الرصيد المستحق حالياً</div>
              <div class="text-base font-black text-rose-700 dark:text-rose-300 font-mono mt-0.5">
                {{ activeStatement.currentBalance.toLocaleString() }} ج.م
              </div>
            </div>
          </div>

          <!-- Statement Ledger Table -->
          <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
                <tr>
                  <th class="p-3">التاريخ</th>
                  <th class="p-3">المرجع</th>
                  <th class="p-3">البيان</th>
                  <th class="p-3">دائن (مشتريات +)</th>
                  <th class="p-3">مدين (سداد / مرتجع -)</th>
                  <th class="p-3">الرصيد المتحرك</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                <tr v-if="activeStatement.entries.length === 0">
                  <td colspan="6" class="p-6 text-center text-slate-400 font-bold">
                    لا توجد حركات مسجلة لهذا المورد بعد
                  </td>
                </tr>
                <tr v-for="entry in activeStatement.entries" :key="entry.id">
                  <td class="p-3 font-mono text-[11px]">{{ entry.date }}</td>
                  <td class="p-3 font-mono font-bold">{{ entry.reference }}</td>
                  <td class="p-3">
                    <span class="font-bold">{{ entry.description }}</span>
                    <span
                      v-if="entry.payment_method"
                      class="mr-2 text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800"
                    >
                      {{ PAYMENT_METHODS[entry.payment_method] || entry.payment_method }}
                    </span>
                  </td>
                  <td class="p-3 font-mono font-bold text-rose-600">
                    {{ entry.credit > 0 ? `${entry.credit.toLocaleString()} ج.م` : '—' }}
                  </td>
                  <td class="p-3 font-mono font-bold text-emerald-600">
                    {{ entry.debit > 0 ? `${entry.debit.toLocaleString()} ج.م` : '—' }}
                  </td>
                  <td class="p-3 font-mono font-black">
                    {{ entry.running_balance.toLocaleString() }} ج.م
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
