<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { ref, computed, onMounted } from 'vue'
import type { TreasuryTransaction, DashboardStats } from '@shared/types'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
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

const appStore = useAppStore()
const transactions = ref<TreasuryTransaction[]>([])
const stats = ref<DashboardStats | null>(null)
const modalOpen = ref(false)
const transferModalOpen = ref(false)
const methodFilter = ref<string>('all')

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
  const [tList, sData] = await Promise.all([
    window.api.listTreasuryTransactions(),
    window.api.getDashboardStats()
  ])
  transactions.value = tList
  stats.value = sData
}

const totalTreasuryBalance = computed(() =>
  transactions.value.reduce((acc, row) => {
    if (row.transaction_type === 'income') return acc + row.amount
    return acc - row.amount
  }, 0)
)

const balancesByMethod = computed(() => {
  const map: Record<string, { income: number; expense: number; net: number }> = {}
  for (const k of Object.keys(PAYMENT_METHODS)) {
    map[k] = { income: 0, expense: 0, net: 0 }
  }
  for (const row of transactions.value) {
    const key = row.payment_method || 'cash'
    if (!map[key]) map[key] = { income: 0, expense: 0, net: 0 }
    if (row.transaction_type === 'income') {
      map[key].income += row.amount
    } else {
      map[key].expense += row.amount
    }
    map[key].net = map[key].income - map[key].expense
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
    alert('يرجى إدخال المبلغ والبيان')
    return
  }
  await appStore.withLoading(async () => {
    await window.api.addTreasuryTransaction(plain(form.value))
    modalOpen.value = false
    await loadData()
  }, 'جاري حفظ الحركة المالية بالخزينة...')
}

async function handleTransferFunds(): Promise<void> {
  if (!transferForm.value.amount || transferForm.value.amount <= 0) {
    alert('يرجى إدخال مبلغ صحيح للتحويل')
    return
  }
  if (transferForm.value.fromMethod === transferForm.value.toMethod) {
    alert('يرجى اختيار خزينة / محفظة مختلفة للتحويل إليها')
    return
  }
  try {
    await appStore.withLoading(async () => {
      await window.api.transferTreasuryFunds(plain({ ...transferForm.value }))
      transferModalOpen.value = false
      await loadData()
    }, 'جاري تحويل الرصيد بين الخزائن...')
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : 'فشل التحويل بين الخزائن')
  }
}

async function handleDeleteTransaction(id: number): Promise<void> {
  if (!confirm('هل أنت متأكد من حذف هذه الحركة المالية؟')) return
  await appStore.withLoading(async () => {
    await window.api.deleteTreasuryTransaction(id)
    await loadData()
  }, 'جاري حذف الحركة المالية...')
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
          منها عمولات فنيين: {{ stats.monthTechCommissions }} ج.م
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
          بعد خصم تكلفة شراء القطع ({{ stats.monthPartsCost }} ج.م)
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
            v-for="t in filteredTransactions"
            :key="t.id"
            class="hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            <td class="py-3.5 px-4 font-mono">{{ t.id }}</td>
            <td class="py-3.5 px-4 text-slate-500 font-mono">{{ t.created_at }}</td>
            <td class="py-3.5 px-4">
              <span
                :class="[
                  'px-2.5 py-1 rounded-full text-[11px] font-bold',
                  t.transaction_type === 'income'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : t.transaction_type === 'tech_commission'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                ]"
              >
                {{
                  t.transaction_type === 'income'
                    ? 'إيراد وتحصيل (+)'
                    : t.transaction_type === 'tech_commission'
                      ? 'عمولة فني (-)'
                      : 'مصروفات (-)'
                }}
              </span>
            </td>
            <td class="py-3.5 px-4 font-bold">{{ t.category }}</td>
            <td class="py-3.5 px-4 text-slate-600 dark:text-slate-300">{{ t.description }}</td>
            <td class="py-3.5 px-4 font-bold">
              {{ PAYMENT_METHODS[t.payment_method] || t.payment_method }}
            </td>
            <td
              :class="[
                'py-3.5 px-4 font-black text-sm',
                t.transaction_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
              ]"
            >
              {{ t.transaction_type === 'income' ? '+' : '-' }}{{ t.amount }} ج.م
            </td>
            <td v-if="appStore.canDeleteRecords" class="py-3.5 px-4">
              <button
                type="button"
                @click="handleDeleteTransaction(t.id)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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
              placeholder="مثال: إيجار، كهرباء، انتقالات فنيين، بيع قطعة غيار..."
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
                  {{ label }}
                </option>
              </select>
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
