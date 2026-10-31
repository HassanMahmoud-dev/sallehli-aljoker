<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { TreasuryTransaction, DashboardStats } from '@shared/types'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import {
  Wallet,
  PlusCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  Trash2,
  X
} from 'lucide-vue-next'

const transactions = ref<TreasuryTransaction[]>([])
const stats = ref<DashboardStats | null>(null)
const modalOpen = ref(false)

const form = ref<Partial<TreasuryTransaction>>({
  transaction_type: 'expense',
  category: 'مصروفات إدارية وانتقالات',
  amount: 0,
  payment_method: 'cash',
  description: ''
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

async function handleSaveTransaction(): Promise<void> {
  if (!form.value.amount || form.value.amount <= 0 || !form.value.description?.trim()) {
    alert('يرجى إدخال المبلغ والبيان')
    return
  }
  await window.api.addTreasuryTransaction(form.value)
  modalOpen.value = false
  await loadData()
}

async function handleDeleteTransaction(id: number): Promise<void> {
  if (!confirm('هل أنت متأكد من حذف هذه الحركة المالية؟')) return
  await window.api.deleteTreasuryTransaction(id)
  await loadData()
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
          الخزينة والحسابات وصافي الأرباح
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          متابعة دقيقة لكل جنيه يدخل أو يخرج من المركز، مع فصل تكلفة قطع الغيار وعمولات الفنيين
        </p>
      </div>

      <div class="flex items-center gap-2.5">
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
          <span>الرصيد النقدي الحالي بالخزينة</span>
          <Wallet class="w-5 h-5 text-blue-600" />
        </div>
        <div class="text-2xl font-black text-blue-600 dark:text-blue-400 mt-2">
          {{ totalTreasuryBalance }} ج.م
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

    <!-- Transactions Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <table class="w-full text-right text-xs">
        <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold">
          <tr>
            <th class="py-3.5 px-4">#</th>
            <th class="py-3.5 px-4">التاريخ والوقت</th>
            <th class="py-3.5 px-4">نوع الحركة</th>
            <th class="py-3.5 px-4">البند / التصنيف</th>
            <th class="py-3.5 px-4">البيان التفصيلي</th>
            <th class="py-3.5 px-4">طريقة الدفع</th>
            <th class="py-3.5 px-4">المبلغ</th>
            <th class="py-3.5 px-4">حذف</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr v-for="tr in transactions" :key="tr.id">
            <td class="py-3 px-4 font-bold">{{ tr.id }}</td>
            <td class="py-3 px-4 font-mono text-slate-500">{{ tr.created_at }}</td>
            <td class="py-3 px-4">
              <span
                :class="[
                  'px-2.5 py-1 rounded-full font-bold text-[11px]',
                  tr.transaction_type === 'income'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : tr.transaction_type === 'tech_commission'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                ]"
              >
                {{
                  tr.transaction_type === 'income'
                    ? 'إيراد (+)'
                    : tr.transaction_type === 'tech_commission'
                      ? 'عمولة فني (-)'
                      : 'مصروف (-)'
                }}
              </span>
            </td>
            <td class="py-3 px-4 font-bold">{{ tr.category }}</td>
            <td class="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
              {{ tr.description }}
            </td>
            <td class="py-3 px-4">{{ PAYMENT_METHODS[tr.payment_method] || tr.payment_method }}</td>
            <td
              :class="[
                'py-3 px-4 font-black text-sm',
                tr.transaction_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
              ]"
            >
              {{ tr.transaction_type === 'income' ? '+' : '-' }}{{ tr.amount }} ج.م
            </td>
            <td class="py-3 px-4">
              <button
                type="button"
                @click="handleDeleteTransaction(tr.id)"
                class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 dark:bg-slate-800 cursor-pointer"
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
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-xs"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">
            {{
              form.transaction_type === 'income'
                ? 'تسجيل إيراد نقدي جديد'
                : 'تسجيل مصروفات من الخزينة'
            }}
          </h3>
          <button @click="modalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleSaveTransaction" class="p-6 space-y-3">
          <div>
            <label class="block font-bold mb-1">التصنيف / البند *</label>
            <input
              v-model="form.category"
              required
              type="text"
              placeholder="مثال: إيجار / كهرباء / انتقالات فنيين / إعلانات ممولة"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
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
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-black text-sm"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">وسيلة الدفع</label>
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
              placeholder="تفاصيل العملية..."
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
              حفظ بالخزينة
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
