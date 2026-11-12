<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { ref, computed, onMounted } from 'vue'
import type { TreasuryTransaction, DashboardStats, TreasuryBalances } from '@shared/types'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import {
  Wallet,
  PlusCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  ArrowLeftRight,
  Trash2,
  X
} from 'lucide-vue-next'

type TreasuryTransactionRow = TreasuryTransaction & {
  sales_invoice_number?: string | null
  purchase_invoice_number?: string | null
}

const appStore = useAppStore()
const { t: term } = useTerms()
const transactions = ref<TreasuryTransactionRow[]>([])
const stats = ref<DashboardStats | null>(null)
const treasuryBalances = ref<TreasuryBalances>({
  total: 0,
  byMethod: {}
})
const modalOpen = ref(false)
const transferModalOpen = ref(false)
const methodFilter = ref<string>('all')

function extractErrorMessage(err: unknown, fallback = 'حدث خطأ غير متوقع'): string {
  const raw = err instanceof Error ? err.message : String(err || '')
  const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, '').trim()
  return cleaned || fallback
}

function isLinkedTransaction(tx: TreasuryTransactionRow): boolean {
  return Boolean(
    tx.linked_tx_id ||
      tx.sales_invoice_id ||
      tx.purchase_invoice_id ||
      tx.supplier_id ||
      tx.ticket_id
  )
}

const form = ref<Partial<TreasuryTransaction>>({
  transaction_type: 'expense',
  category: 'مصروفات إدارية وانتقالات',
  amount: 0,
  payment_method: 'cash',
  description: ''
})

const transferForm = ref({
  fromMethod: 'cash',
  toMethod: 'vodafone_cash',
  amount: 0,
  notes: ''
})

async function loadData(): Promise<void> {
  const [tList, sData, bData] = await Promise.all([
    window.api.listTreasuryTransactions(),
    window.api.getDashboardStats(),
    window.api.getTreasuryBalances()
  ])
  transactions.value = tList as TreasuryTransactionRow[]
  stats.value = sData
  treasuryBalances.value = bData
}

const totalTreasuryBalance = computed(() => Number(treasuryBalances.value?.total || 0))

const balancesByMethod = computed(() => {
  const map: Record<string, { income: number; expense: number; net: number }> = {}
  for (const k of Object.keys(PAYMENT_METHODS)) {
    map[k] = treasuryBalances.value.byMethod?.[k] ?? { income: 0, expense: 0, net: 0 }
  }
  for (const [k, val] of Object.entries(treasuryBalances.value.byMethod || {})) {
    if (!map[k]) {
      map[k] = val
    }
  }
  return map
})

const filteredTransactions = computed(() => {
  if (methodFilter.value === 'all') return transactions.value
  return transactions.value.filter((t) => t.payment_method === methodFilter.value)
})

function openAddModal(type: 'income' | 'expense'): void {
  form.value = {
    transaction_type: type,
    category: type === 'income' ? 'إيراد صيانة / مبيعات' : 'مصروفات تشغيل وانتقالات',
    amount: 0,
    payment_method: 'cash',
    description: ''
  }
  modalOpen.value = true
}

function openTransferModal(): void {
  transferForm.value = {
    fromMethod: 'cash',
    toMethod: 'vodafone_cash',
    amount: 0,
    notes: ''
  }
  transferModalOpen.value = true
}

async function handleSaveTransaction(): Promise<void> {
  if (!form.value.amount || form.value.amount <= 0 || !form.value.description?.trim()) {
    swalError('بيانات غير مكتملة', 'يرجى إدخال المبلغ والبيان')
    return
  }
  try {
    await appStore.withLoading(async () => {
      await window.api.addTreasuryTransaction(plain(form.value))
      modalOpen.value = false
      await loadData()
    }, 'جاري حفظ الحركة المالية بالخزينة...')
    swalSuccess('تم تسجيل الحركة المالية بالخزينة بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حفظ الحركة المالية', extractErrorMessage(err, 'تعذر حفظ الحركة المالية بالخزينة'))
  }
}

async function handleTransferFunds(): Promise<void> {
  if (!transferForm.value.amount || transferForm.value.amount <= 0) {
    swalError('مبلغ غير صحيح', 'يرجى إدخال مبلغ صحيح للتحويل')
    return
  }
  if (transferForm.value.fromMethod === transferForm.value.toMethod) {
    swalError('خطأ في الاختيار', 'يرجى اختيار خزينة / محفظة مختلفة للتحويل إليها')
    return
  }
  try {
    await appStore.withLoading(async () => {
      await window.api.transferTreasuryFunds(plain({ ...transferForm.value }))
      transferModalOpen.value = false
      await loadData()
    }, 'جاري تحويل الرصيد بين الخزائن...')
    swalSuccess('تم تحويل الرصيد بين الخزائن بنجاح')
  } catch (err: unknown) {
    swalError('فشل التحويل بين الخزائن', extractErrorMessage(err, 'فشل التحويل بين الخزائن'))
  }
}

async function handleDeleteTransaction(tx: TreasuryTransactionRow): Promise<void> {
  const warnings: string[] = []
  if (tx.linked_tx_id) {
    warnings.push(
      `هذا القيد يمثل تحويلاً مزدوجاً بين الخزائن ومرتبط بالقيد (#${tx.linked_tx_id})؛ سيتم حذف كلا طرفي التحويل (الصادر والوارد) معاً.`
    )
  }
  if (tx.sales_invoice_id) {
    const invLabel = tx.sales_invoice_number || `#${tx.sales_invoice_id}`
    warnings.push(
      `القيد مرتبط بفاتورة المبيعات (${invLabel})؛ سيتم عكس أثر الدفعة وتحديث المدفوع والمتبقي على الفاتورة (أو رفض الحذف إذا لم يكن مسجلاً كدفعة).`
    )
  }
  if (tx.purchase_invoice_id) {
    const invLabel = tx.purchase_invoice_number || `#${tx.purchase_invoice_id}`
    if (tx.category === 'استرداد مرتجع مشتريات') {
      warnings.push(
        `القيد مرتبط باسترداد مرتجع مشتريات على الفاتورة (${invLabel})؛ لا يسمح النظام بحذفه مباشرة من الخزينة دون إلغاء المرتجع.`
      )
    } else {
      warnings.push(
        `القيد مرتبط بفاتورة المشتريات (${invLabel})؛ سيتم عكس أثر السداد وتحديث المتبقي ورصيد المورد.`
      )
    }
  } else if (tx.supplier_id) {
    const supLabel = tx.supplier_name || `#${tx.supplier_id}`
    warnings.push(
      `القيد مرتبط بحساب المورد (${supLabel})؛ سيتم عكس أثره المالي وإعادة تعديل رصيد المورد.`
    )
  }
  if (tx.ticket_id) {
    const tLabel = tx.ticket_number || `#${tx.ticket_id}`
    warnings.push(
      `القيد مرتبط بطلب الصيانة (${tLabel})؛ سيتم عكس أثر التحصيل أو التسوية على حساب التذكرة عند انطباقه.`
    )
  }

  const confirmed = await swalConfirm(
    warnings.length > 0 ? 'تحذير: حذف قيد مالي مرتبط؟' : 'حذف الحركة المالية؟',
    warnings.length > 0
      ? `تنبيه (${tx.category} — ${tx.amount} ج.م): ${warnings.join(' | ')} هل تريد تأكيد الحذف؟`
      : 'هل أنت متأكد من حذف هذه الحركة المالية من سجل الخزينة؟',
    warnings.length > 0 ? 'نعم، تأكيد الحذف وعكس الأثر' : 'نعم، تأكيد الحذف'
  )
  if (!confirmed) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteTreasuryTransaction(tx.id)
      await loadData()
    }, 'جاري حذف الحركة المالية...')
    swalSuccess('تم حذف الحركة المالية بنجاح')
  } catch (err: unknown) {
    swalError(
      'تم رفض حذف الحركة',
      extractErrorMessage(err, 'تعذر حذف الحركة المالية من الخزينة')
    )
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4"
    >
      <div>
        <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet class="w-5 h-5 text-emerald-600" />
          الخزينة المتعددة والحسابات وصافي الأرباح
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          فصل أرصدة الكاش عن المحافظ الإلكترونية والبنك، التحويل بينها، ومتابعة تقفيل الوردية اليومية
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          @click="openTransferModal"
          class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md cursor-pointer"
        >
          <ArrowLeftRight class="w-4 h-4" />
          تحويل بين الخزائن / المحافظ
        </button>
        <button
          type="button"
          @click="openAddModal('income')"
          class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          تسجيل إيراد بالخزينة
        </button>
        <button
          type="button"
          @click="openAddModal('expense')"
          class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          تسجيل مصروفات
        </button>
      </div>
    </div>

    <!-- Financial Summary Cards -->
    <div v-if="stats" class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
      >
        <div class="flex items-center justify-between text-xs font-bold text-slate-500">
          <span>إجمالي رصيد جميع الخزائن</span>
          <Wallet class="w-5 h-5 text-blue-600" />
        </div>
        <div class="text-2xl font-black text-blue-600 dark:text-blue-400 mt-2">
          {{ totalTreasuryBalance }} ج.م
        </div>
        <div class="text-[11px] text-slate-500 mt-1">
          وارد اليوم: +{{ stats.todayIncome }} | منصرف اليوم: -{{ stats.todayExpense }} ج.م
        </div>
      </div>

      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
      >
        <div class="flex items-center justify-between text-xs font-bold text-slate-500">
          <span>إجمالي إيرادات الشهر</span>
          <ArrowDownCircle class="w-5 h-5 text-emerald-600" />
        </div>
        <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
          {{ stats.monthIncome }} ج.م
        </div>
      </div>

      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
      >
        <div class="flex items-center justify-between text-xs font-bold text-slate-500">
          <span>مصروفات + عمولات الشهر</span>
          <ArrowUpCircle class="w-5 h-5 text-rose-600" />
        </div>
        <div class="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
          {{ stats.monthExpense + stats.monthTechCommissions }} ج.م
        </div>
        <div class="text-[11px] text-slate-500 mt-1">
          منها عمولات {{ term('technicians') }}: {{ stats.monthTechCommissions }} ج.م
        </div>
      </div>

      <div
        v-if="appStore.isFullManager"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
      >
        <div class="flex items-center justify-between text-xs font-bold text-slate-500">
          <span>صافي ربح المركز هذا الشهر</span>
          <TrendingUp class="w-5 h-5 text-teal-600" />
        </div>
        <div class="text-2xl font-black text-teal-600 dark:text-teal-400 mt-2">
          {{ stats.monthNetProfit }} ج.م
        </div>
        <div class="text-[11px] text-slate-500 mt-1">
          بعد خصم تكلفة شراء {{ term('parts') }} ({{ stats.monthPartsCost }} ج.م)
        </div>
      </div>
    </div>

    <!-- Multi-Treasury Wallets Breakdown Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <button
        type="button"
        v-for="(label, key) in PAYMENT_METHODS"
        :key="key"
        @click="methodFilter = methodFilter === key ? 'all' : key"
        :class="[
          'p-4 rounded-2xl border text-right transition cursor-pointer',
          methodFilter === key
            ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-500 ring-2 ring-blue-500/30'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300'
        ]"
      >
        <div class="font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <span>{{ label }}</span>
          <span
            v-if="methodFilter === key"
            class="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px]"
          >
            مُفلتر
          </span>
        </div>
        <div class="text-xl font-black text-slate-900 dark:text-white mt-1.5">
          {{ balancesByMethod[key]?.net || 0 }} ج.م
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-500 mt-1">
          <span class="text-emerald-600 font-semibold">
            وارد: {{ balancesByMethod[key]?.income || 0 }}
          </span>
          <span class="text-rose-600 font-semibold">
            منصرف: {{ balancesByMethod[key]?.expense || 0 }}
          </span>
        </div>
      </button>
    </div>

    <!-- Transactions Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <div
        v-if="methodFilter !== 'all'"
        class="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex items-center justify-between text-xs"
      >
        <span class="font-bold text-blue-800 dark:text-blue-200">
          عرض حركات: {{ PAYMENT_METHODS[methodFilter] }} فقط
        </span>
        <button
          type="button"
          @click="methodFilter = 'all'"
          class="text-blue-600 hover:underline font-bold cursor-pointer"
        >
          عرض جميع الخزائن
        </button>
      </div>

      <table class="w-full text-right text-xs">
        <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold">
          <tr>
            <th class="py-3.5 px-4">#</th>
            <th class="py-3.5 px-4">التاريخ والوقت</th>
            <th class="py-3.5 px-4">نوع الحركة</th>
            <th class="py-3.5 px-4">البند / التصنيف</th>
            <th class="py-3.5 px-4">البيان التفصيلي</th>
            <th class="py-3.5 px-4">الخزينة / طريقة الدفع</th>
            <th class="py-3.5 px-4">المبلغ</th>
            <th v-if="appStore.canDeleteRecords" class="py-3.5 px-4">حذف</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr
            v-for="tx in filteredTransactions"
            :key="tx.id"
            :class="[
              'hover:bg-slate-50 dark:hover:bg-slate-800/40',
              isLinkedTransaction(tx) ? 'bg-amber-50/25 dark:bg-amber-950/10' : ''
            ]"
          >
            <td class="py-3.5 px-4 font-mono">
              <div class="flex items-center gap-1.5">
                <span>{{ tx.id }}</span>
                <span
                  v-if="isLinkedTransaction(tx)"
                  title="قيد مالي مرتبط بسجل آخر"
                  class="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                ></span>
              </div>
            </td>
            <td class="py-3.5 px-4 text-slate-500 font-mono">{{ tx.created_at }}</td>
            <td class="py-3.5 px-4">
              <span
                :class="[
                  'px-2.5 py-1 rounded-full text-[11px] font-bold',
                  tx.transaction_type === 'income'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : tx.transaction_type === 'tech_commission'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                ]"
              >
                {{
                  tx.transaction_type === 'income'
                    ? 'إيراد وتحصيل (+)'
                    : tx.transaction_type === 'tech_commission'
                      ? `عمولة ${term('technician')} (-)`
                      : 'مصروفات (-)'
                }}
              </span>
            </td>
            <td class="py-3.5 px-4 font-bold">{{ tx.category }}</td>
            <td class="py-3.5 px-4 text-slate-600 dark:text-slate-300">
              <div>{{ tx.description }}</div>
              <div
                v-if="
                  tx.linked_tx_id ||
                  tx.ticket_id ||
                  tx.ticket_number ||
                  tx.sales_invoice_id ||
                  tx.sales_invoice_number ||
                  tx.purchase_invoice_id ||
                  tx.purchase_invoice_number ||
                  tx.supplier_id ||
                  tx.supplier_name ||
                  tx.technician_name
                "
                class="flex flex-wrap items-center gap-1.5 mt-1"
              >
                <span
                  v-if="tx.linked_tx_id"
                  class="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 font-mono text-[10px] font-bold"
                >
                  تحويل مزدوج ↔ #{{ tx.linked_tx_id }}
                </span>
                <span
                  v-if="tx.ticket_id || tx.ticket_number"
                  class="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono text-[10px] font-bold"
                >
                  طلب: {{ tx.ticket_number || `#${tx.ticket_id}` }}
                </span>
                <span
                  v-if="tx.sales_invoice_id || tx.sales_invoice_number"
                  class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-mono text-[10px] font-bold"
                >
                  فاتورة بيع: {{ tx.sales_invoice_number || `#${tx.sales_invoice_id}` }}
                </span>
                <span
                  v-if="tx.purchase_invoice_id || tx.purchase_invoice_number"
                  class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono text-[10px] font-bold"
                >
                  فاتورة شراء: {{ tx.purchase_invoice_number || `#${tx.purchase_invoice_id}` }}
                </span>
                <span
                  v-if="tx.supplier_id || tx.supplier_name"
                  class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-bold"
                >
                  مورد: {{ tx.supplier_name || `#${tx.supplier_id}` }}
                </span>
                <span
                  v-if="tx.technician_name"
                  class="px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[10px] font-bold"
                >
                  {{ term('technician') }}: {{ tx.technician_name }}
                </span>
                <span
                  v-if="tx.purchase_invoice_id && tx.category === 'استرداد مرتجع مشتريات'"
                  class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-bold"
                >
                  قيد مرتجع محمي
                </span>
              </div>
            </td>
            <td class="py-3.5 px-4 font-bold">
              {{ PAYMENT_METHODS[tx.payment_method] || tx.payment_method }}
            </td>
            <td
              :class="[
                'py-3.5 px-4 font-black text-sm',
                tx.transaction_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
              ]"
            >
              {{ tx.transaction_type === 'income' ? '+' : '-' }}{{ tx.amount }} ج.م
            </td>
            <td v-if="appStore.canDeleteRecords" class="py-3.5 px-4">
              <button
                type="button"
                @click="handleDeleteTransaction(tx)"
                :title="
                  tx.linked_tx_id
                    ? `حذف تحويل مزدوج (يحذف القيد #${tx.id} والقيد المرتبط #${tx.linked_tx_id} معاً)`
                    : isLinkedTransaction(tx)
                      ? 'حذف قيد مرتبط (يعكس أثره المالي أو يتحقق منه)'
                      : 'حذف الحركة المالية'
                "
                :class="[
                  'p-1.5 rounded-lg cursor-pointer transition',
                  isLinkedTransaction(tx)
                    ? 'text-amber-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                ]"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add Transaction Modal -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 text-xs"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">
            {{
              form.transaction_type === 'income'
                ? 'تسجيل إيراد جديد بالخزينة'
                : 'تسجيل مصروفات من الخزينة'
            }}
          </h3>
          <button @click="modalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>
        <form @submit.prevent="handleSaveTransaction" class="p-6 space-y-3">
          <div>
            <label class="block font-bold mb-1">البند / التصنيف *</label>
            <input
              v-model="form.category"
              required
              type="text"
              :placeholder="`مثال: إيجار، كهرباء، انتقالات ${term('technicians')}، بيع ${term('part')}...`"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">المبلغ (ج.م) *</label>
              <input
                v-model.number="form.amount"
                required
                type="number"
                min="1"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-black text-base"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">الخزينة / طريقة الدفع</label>
              <select
                v-model="form.payment_method"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="(label, k) in PAYMENT_METHODS" :key="k" :value="k">
                  {{ label }}
                </option>
              </select>
            </div>
          </div>
          <div>
            <label class="block font-bold mb-1">البيان التفصيلي *</label>
            <input
              v-model="form.description"
              required
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
              :class="[
                'px-5 py-2 rounded-xl text-white font-bold cursor-pointer',
                form.transaction_type === 'income' ? 'bg-emerald-600' : 'bg-rose-600'
              ]"
            >
              حفظ الحركة المالية
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Transfer Between Wallets Modal -->
    <div
      v-if="transferModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 text-xs"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-black text-sm flex items-center gap-1.5">
            <ArrowLeftRight class="w-4 h-4 text-indigo-600" />
            تحويل رصيد بين الخزائن والمحافظ الإلكترونية
          </h3>
          <button @click="transferModalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>
        <form @submit.prevent="handleTransferFunds" class="p-6 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">سحب من خزينة / محفظة *</label>
              <select
                v-model="transferForm.fromMethod"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="(label, k) in PAYMENT_METHODS" :key="k" :value="k">
                  {{ label }} ({{ balancesByMethod[k]?.net || 0 }} ج.م)
                </option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">إيداع في خزينة / محفظة *</label>
              <select
                v-model="transferForm.toMethod"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="(label, k) in PAYMENT_METHODS" :key="k" :value="k">
                  {{ label }} ({{ balancesByMethod[k]?.net || 0 }} ج.م)
                </option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900 text-[11px]">
            <div>
              <span class="text-slate-500">الرصيد الفعلي للمصدر: </span>
              <span class="font-black text-indigo-700 dark:text-indigo-300">
                {{ balancesByMethod[transferForm.fromMethod]?.net || 0 }} ج.م
              </span>
            </div>
            <div>
              <span class="text-slate-500">الرصيد الفعلي للمستلم: </span>
              <span class="font-black text-emerald-700 dark:text-emerald-300">
                {{ balancesByMethod[transferForm.toMethod]?.net || 0 }} ج.م
              </span>
            </div>
          </div>
          <div>
            <label class="block font-bold mb-1">المبلغ المراد تحويله (ج.م) *</label>
            <input
              v-model.number="transferForm.amount"
              required
              type="number"
              min="1"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-black text-base"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">ملاحظات التحويل</label>
            <input
              v-model="transferForm.notes"
              type="text"
              placeholder="مثال: إيداع نقدية في فودافون كاش أو الحساب البنكي..."
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div class="flex justify-end gap-2 pt-3">
            <button
              type="button"
              @click="transferModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
            >
              تنفيذ التحويل
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
