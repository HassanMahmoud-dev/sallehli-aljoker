<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { TICKET_STATUS_MAP } from '@renderer/constants/appliances'
import type { DashboardStats } from '@shared/types'
import {
  Wrench,
  Home,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Printer,
  MessageCircle,
  PlusCircle,
  Package,
  ShieldAlert
} from 'lucide-vue-next'

const router = useRouter()
const appStore = useAppStore()

const stats = ref<DashboardStats>({
  totalTicketsToday: 0,
  openTicketsCount: 0,
  homeVisitsCount: 0,
  workshopCount: 0,
  repairedWaitingDeliveryCount: 0,
  activeWarrantyClaimsCount: 0,
  lowStockPartsCount: 0,
  todayIncome: 0,
  todayExpense: 0,
  monthIncome: 0,
  monthExpense: 0,
  monthPartsCost: 0,
  monthTechCommissions: 0,
  monthNetProfit: 0,
  recentTickets: [],
  lowStockParts: []
})

async function loadStats(): Promise<void> {
  stats.value = await window.api.getDashboardStats()
}

onMounted(loadStats)
</script>

<template>
  <div class="space-y-6">
    <!-- Tenant Subscription Alert Banner if applicable -->
    <div
      v-if="appStore.isTenant && appStore.subscriptionDaysRemaining !== null"
      :class="[
        'flex items-center justify-between px-5 py-3 rounded-2xl border text-xs font-bold',
        appStore.subscriptionDaysRemaining <= 7
          ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
          : 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300'
      ]"
    >
      <div class="flex items-center gap-2">
        <ShieldAlert class="w-4 h-4" />
        <span>
          نوع الحساب: مستأجر البرنامج — متبقي في فترة الاشتراك الحالية
          <strong>{{ appStore.subscriptionDaysRemaining }} يوم</strong>
          (تاريخ الانتهاء: {{ appStore.currentUser?.subscription_end }})
        </span>
      </div>
      <span>للتجديد تواصل مع السوبر أدمن</span>
    </div>

    <!-- Top Action Bar -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs"
    >
      <div>
        <h1 class="text-xl font-black text-slate-900 dark:text-white">
          لوحة المتابعة اليومية — {{ appStore.settings.center_name }}
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          ملخص فوري لحركة الصيانة المنزلية، أجهزة الورشة، قطع الغيار، والخزينة
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          @click="router.push('/tickets?new=1')"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          تسجيل بلاغ صيانة جديد
        </button>
        <button
          v-if="appStore.canViewInventory"
          type="button"
          @click="router.push('/inventory')"
          class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
        >
          <Package class="w-4 h-4" />
          مخزن قطع الغيار
        </button>
        <button
          v-if="appStore.canViewFinancials"
          type="button"
          @click="router.push('/treasury')"
          class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer"
        >
          <Wallet class="w-4 h-4" />
          الخزينة والحسابات
        </button>
      </div>
    </div>

    <!-- KPI Cards Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">بلاغات مفتوحة حالياً</p>
          <p class="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {{ stats.openTicketsCount }}
          </p>
          <p class="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
            منها {{ stats.totalTicketsToday }} بلاغ مسجل اليوم
          </p>
        </div>
        <div
          class="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center"
        >
          <Wrench class="w-6 h-6" />
        </div>
      </div>

      <div
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">زيارات منزلية جارية</p>
          <p class="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {{ stats.homeVisitsCount }}
          </p>
          <p class="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
            + {{ stats.workshopCount }} أجهزة داخل الورشة
          </p>
        </div>
        <div
          class="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"
        >
          <Home class="w-6 h-6" />
        </div>
      </div>

      <div
        v-if="appStore.canViewFinancials"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">إيرادات الخزينة اليوم</p>
          <p class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {{ stats.todayIncome }} <span class="text-xs">ج.م</span>
          </p>
          <p class="text-[11px] text-slate-500 font-semibold mt-1">
            مصروفات اليوم: {{ stats.todayExpense }} ج.م
          </p>
        </div>
        <div
          class="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"
        >
          <Wallet class="w-6 h-6" />
        </div>
      </div>

      <div
        v-if="appStore.isFullManager"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">صافي ربح الشهر</p>
          <p class="text-2xl font-black text-teal-600 dark:text-teal-400 mt-1">
            {{ stats.monthNetProfit }} <span class="text-xs">ج.م</span>
          </p>
          <p class="text-[11px] text-slate-500 font-semibold mt-1">
            بعد خصم تكلفة القطع والعمولات
          </p>
        </div>
        <div
          class="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center"
        >
          <TrendingUp class="w-6 h-6" />
        </div>
      </div>
    </div>

    <!-- Main Content: Recent Tickets & Low Stock Alerts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Recent Maintenance Tickets (2 columns) -->
      <div
        class="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
      >
        <div
          class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"
        >
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench class="w-4 h-4 text-blue-600" />
            أحدث بلاغات وطلبات الصيانة
          </h3>
          <button
            type="button"
            @click="router.push('/tickets')"
            class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            عرض كل الطلبات ←
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold">
              <tr>
                <th class="py-3 px-4">رقم الطلب</th>
                <th class="py-3 px-4">العميل</th>
                <th class="py-3 px-4">الجهاز</th>
                <th class="py-3 px-4">الفني</th>
                <th class="py-3 px-4">الحالة</th>
                <th class="py-3 px-4">الإجمالي</th>
                <th class="py-3 px-4">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
              <tr
                v-for="t in stats.recentTickets"
                :key="t.id"
                class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <td class="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                  {{ t.ticket_number }}
                </td>
                <td class="py-3 px-4">
                  <div class="font-bold text-slate-900 dark:text-white">{{ t.customer_name }}</div>
                  <div class="text-[11px] text-slate-500">{{ t.customer_phone }}</div>
                </td>
                <td class="py-3 px-4">
                  <div class="font-bold">{{ t.appliance_type }}</div>
                  <div class="text-[11px] text-slate-500">{{ t.brand }}</div>
                </td>
                <td class="py-3 px-4 font-semibold">
                  {{ t.technician_name || 'لم يعين' }}
                </td>
                <td class="py-3 px-4">
                  <span
                    :class="[
                      'px-2.5 py-1 rounded-full text-[11px] font-bold border',
                      TICKET_STATUS_MAP[t.status]?.badgeClass
                    ]"
                  >
                    {{ TICKET_STATUS_MAP[t.status]?.label }}
                  </span>
                </td>
                <td class="py-3 px-4 font-bold">{{ t.total_amount }} ج.م</td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-1.5">
                    <button
                      type="button"
                      @click="appStore.openPrintModal(t, 'invoice_warranty')"
                      class="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 transition cursor-pointer"
                      title="طباعة فاتورة وشهادة ضمان (A4 / 80mm)"
                    >
                      <Printer class="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      @click="appStore.sendWhatsAppToCustomer(t)"
                      class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 transition cursor-pointer"
                      title="إرسال تفاصيل الطلب والضمان واتساب"
                    >
                      <MessageCircle class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="stats.recentTickets.length === 0">
                <td colspan="7" class="py-8 text-center text-slate-400">
                  لا توجد بلاغات صيانة مسجلة حالياً
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right Column: Low Stock Alerts & Quick Status Summary -->
      <div class="space-y-6">
        <!-- Quick Status Boxes -->
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">
            حالة التشغيل السريعة
          </h3>
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div
              class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900"
            >
              <div class="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                <CheckCircle2 class="w-4 h-4" />
                <span>جاهز للتسليم</span>
              </div>
              <div class="text-xl font-black text-emerald-800 dark:text-emerald-300 mt-1">
                {{ stats.repairedWaitingDeliveryCount }} جهاز
              </div>
            </div>

            <div
              class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
            >
              <div class="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold">
                <Building2 class="w-4 h-4" />
                <span>بلاغات ضمان</span>
              </div>
              <div class="text-xl font-black text-amber-800 dark:text-amber-300 mt-1">
                {{ stats.activeWarrantyClaimsCount }} طلب
              </div>
            </div>
          </div>
        </div>

        <!-- Low Stock Parts Alert -->
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
        >
          <div
            class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"
          >
            <h3
              class="font-extrabold text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2"
            >
              <AlertTriangle class="w-4 h-4" />
              نواقص مخزن قطع الغيار ({{ stats.lowStockPartsCount }})
            </h3>
            <button
              type="button"
              @click="router.push('/inventory')"
              class="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              توريد مخزن
            </button>
          </div>

          <div class="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <div
              v-for="part in stats.lowStockParts"
              :key="part.id"
              class="px-5 py-3 flex items-center justify-between"
            >
              <div>
                <div class="font-bold text-slate-900 dark:text-white">{{ part.name }}</div>
                <div class="text-[11px] text-slate-500">
                  كود: {{ part.code }} | الماركة: {{ part.brand }}
                </div>
              </div>
              <span
                class="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-black"
              >
                متبقي {{ part.quantity }}
              </span>
            </div>
            <div v-if="stats.lowStockParts.length === 0" class="py-6 text-center text-slate-400">
              جميع قطع الغيار متوفرة بكميات آمنة
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
