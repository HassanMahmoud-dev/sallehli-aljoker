<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { TICKET_STATUS_MAP } from '@renderer/constants/appliances'
import type { DashboardStats } from '@shared/types'

const { t } = useTerms()
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
  ShieldAlert,
  ShoppingCart,
  Boxes,
  Send,
  Headphones,
  CalendarClock,
  Clock,
  PackageCheck
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

function sendWhatsAppReminder(f: any): void {
  if (!f.patient_phone) return
  const clean = f.patient_phone.replace(/\D/g, '')
  const intl = clean.startsWith('0') ? '2' + clean : clean
  const text = encodeURIComponent(
    `السلام عليكم ورحمة الله، مرحباً أستاذ/ة ${f.patient_name || ''}، نود تذكيركم بموعدكم القادم في المركز بتاريخ ${f.due_date}.`
  )
  window.open(`https://wa.me/${intl}?text=${text}`, '_blank')
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
          ملخص فوري لحركة {{ t('tickets') }}، {{ t('devices') }}، {{ t('parts') }}، والخزينة
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <button
          v-if="appStore.businessType === 'hearing_aids'"
          type="button"
          @click="router.push('/sales')"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition cursor-pointer"
        >
          <ShoppingCart class="w-4 h-4" />
          {{ t('salesPage') }} / POS سريع
        </button>
        <button
          type="button"
          @click="router.push('/tickets?new=1')"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          تسجيل {{ t('ticket') }} جديد
        </button>
        <button
          v-if="appStore.businessType === 'hearing_aids' && appStore.canViewInventory"
          type="button"
          @click="router.push('/products')"
          class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
        >
          <Boxes class="w-4 h-4" />
          {{ t('productsPage') }}
        </button>
        <button
          v-if="appStore.canViewInventory"
          type="button"
          @click="router.push('/inventory')"
          class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
        >
          <Package class="w-4 h-4" />
          {{ t('partsStore') }}
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
            + {{ stats.workshopCount }} {{ t('devices') }} داخل المركز
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

    <!-- Hearing Aids Sales, External Repair & Loaner KPIs (Phase 3W) -->
    <div
      v-if="appStore.businessType === 'hearing_aids'"
      class="grid grid-cols-2 md:grid-cols-4 gap-4"
    >
      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">مبيعات السماعات والمنتجات اليوم</p>
          <p class="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {{ stats.todaySalesRevenue || 0 }} <span class="text-xs">ج.م</span>
          </p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">
            عدد الفواتير اليوم: {{ stats.todaySalesCount || 0 }} فاتورة
          </p>
        </div>
        <div
          class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center"
        >
          <ShoppingCart class="w-5 h-5" />
        </div>
      </div>

      <div
        v-if="appStore.isFullManager"
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">صافي ربح المبيعات هذا الشهر</p>
          <p class="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {{ stats.monthSalesProfit || 0 }} <span class="text-xs">ج.م</span>
          </p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">
            فرق البيع عن التكلفة الفعلية
          </p>
        </div>
        <div
          class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center"
        >
          <TrendingUp class="w-5 h-5" />
        </div>
      </div>

      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">صيانة خارجية (معمل / توكيل)</p>
          <p class="text-xl font-black text-fuchsia-600 dark:text-fuchsia-400 mt-1">
            {{ stats.externalRepairOpenCount || 0 }} <span class="text-xs">جهاز</span>
          </p>
          <p
            :class="[
              'text-[11px] font-bold mt-0.5',
              (stats.externalRepairOverdueCount || 0) > 0
                ? 'text-rose-600'
                : 'text-slate-500'
            ]"
          >
            متأخر عن الموعد: {{ stats.externalRepairOverdueCount || 0 }} جهاز
          </p>
        </div>
        <div
          class="w-10 h-10 rounded-xl bg-fuchsia-100 dark:bg-fuchsia-950/60 text-fuchsia-600 flex items-center justify-center"
        >
          <Send class="w-5 h-5" />
        </div>
      </div>

      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">سماعات إعارة مؤقتة (Loaner)</p>
          <p class="text-xl font-black text-sky-600 dark:text-sky-400 mt-1">
            {{ stats.activeLoanersCount || 0 }} <span class="text-xs">سماعة بالخارج</span>
          </p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">
            نواقص المنتجات: {{ stats.lowStockProductsCount || 0 }} صنف
          </p>
        </div>
        <div
          class="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center"
        >
          <Headphones class="w-5 h-5" />
        </div>
      </div>
    </div>

    <!-- Audiology Followups & Earmolds KPIs (Phase 4E) -->
    <div
      v-if="appStore.businessType === 'hearing_aids' && appStore.canViewMedicalRecords"
      class="grid grid-cols-2 md:grid-cols-4 gap-4"
    >
      <div
        @click="router.push('/followups')"
        class="p-4 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer transition-all"
        :class="(stats.dueFollowupsTodayCount || 0) > 0 ? 'bg-amber-500/10 border-amber-300 dark:border-amber-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">متابعات وضبط اليوم</p>
          <p class="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {{ stats.dueFollowupsTodayCount || 0 }} <span class="text-xs">جلسة</span>
          </p>
          <p class="text-[11px] text-slate-400 mt-0.5">مستحقة اليوم بالمركز</p>
        </div>
        <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
          <CalendarClock class="w-5 h-5" />
        </div>
      </div>

      <div
        @click="router.push('/followups')"
        class="p-4 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer transition-all"
        :class="(stats.overdueFollowupsCount || 0) > 0 ? 'bg-rose-500/10 border-rose-300 dark:border-rose-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">متابعات متأخرة</p>
          <p class="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {{ stats.overdueFollowupsCount || 0 }} <span class="text-xs">موعد</span>
          </p>
          <p class="text-[11px] text-slate-400 mt-0.5">تجاوزت تاريخ الاستحقاق</p>
        </div>
        <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
          <AlertTriangle class="w-5 h-5" />
        </div>
      </div>

      <div
        @click="router.push('/followups')"
        class="p-4 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer transition-all"
        :class="(stats.overdueEarmoldsCount || 0) > 0 ? 'bg-orange-500/10 border-orange-300 dark:border-orange-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">قوالب متأخرة بالمعمل</p>
          <p class="text-xl font-black text-orange-600 dark:text-orange-400 mt-1">
            {{ stats.overdueEarmoldsCount || 0 }} <span class="text-xs">قالب</span>
          </p>
          <p class="text-[11px] text-slate-400 mt-0.5">تجاوزت تاريخ التسليم المتوقع</p>
        </div>
        <div class="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 flex items-center justify-center">
          <Clock class="w-5 h-5" />
        </div>
      </div>

      <div
        @click="router.push('/followups')"
        class="p-4 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer transition-all"
        :class="(stats.readyEarmoldsWaitingDeliveryCount || 0) > 0 ? 'bg-emerald-500/10 border-emerald-300 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'"
      >
        <div>
          <p class="text-xs font-bold text-slate-500">قوالب جاهزة للتسليم</p>
          <p class="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {{ stats.readyEarmoldsWaitingDeliveryCount || 0 }} <span class="text-xs">قالب</span>
          </p>
          <p class="text-[11px] text-slate-400 mt-0.5">وصلت من المعمل</p>
        </div>
        <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
          <PackageCheck class="w-5 h-5" />
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
                <th class="py-3 px-4">{{ t('device') }}</th>
                <th class="py-3 px-4">الفني</th>
                <th class="py-3 px-4">الحالة</th>
                <th class="py-3 px-4">الإجمالي</th>
                <th class="py-3 px-4">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
              <tr
                v-for="ticket in stats.recentTickets"
                :key="ticket.id"
                class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <td class="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                  {{ ticket.ticket_number }}
                </td>
                <td class="py-3 px-4">
                  <div class="font-bold text-slate-900 dark:text-white">{{ ticket.customer_name }}</div>
                  <div class="text-[11px] text-slate-500">{{ ticket.customer_phone }}</div>
                </td>
                <td class="py-3 px-4">
                  <div class="font-bold">{{ ticket.appliance_type }}</div>
                  <div class="text-[11px] text-slate-500">{{ ticket.brand }}</div>
                </td>
                <td class="py-3 px-4 font-semibold">
                  {{ ticket.technician_name || 'لم يعين' }}
                </td>
                <td class="py-3 px-4">
                  <span
                    :class="[
                      'px-2.5 py-1 rounded-full text-[11px] font-bold border',
                      TICKET_STATUS_MAP[ticket.status]?.badgeClass
                    ]"
                  >
                    {{ TICKET_STATUS_MAP[ticket.status]?.label }}
                  </span>
                </td>
                <td class="py-3 px-4 font-bold">{{ ticket.total_amount }} ج.م</td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-1.5">
                    <button
                      type="button"
                      @click="appStore.openPrintModal(ticket, 'invoice_warranty')"
                      class="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 transition cursor-pointer"
                      title="طباعة فاتورة وشهادة ضمان (A4 / 80mm)"
                    >
                      <Printer class="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      @click="appStore.sendWhatsAppToCustomer(ticket)"
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
                {{ stats.repairedWaitingDeliveryCount }} {{ t('device') }}
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
              نواقص {{ t('partsStore') }} ({{ stats.lowStockPartsCount }})
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
              جميع {{ t('parts') }} متوفرة بكميات آمنة
            </div>
          </div>
        </div>

        <!-- Low Stock Products Alert (Hearing Aids Mode) -->
        <div
          v-if="appStore.businessType === 'hearing_aids'"
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
        >
          <div
            class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"
          >
            <h3
              class="font-extrabold text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2"
            >
              <Boxes class="w-4 h-4" />
              نواقص المنتجات والبطاريات ({{ stats.lowStockProductsCount || 0 }})
            </h3>
            <button
              type="button"
              @click="router.push('/purchases')"
              class="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              فاتورة شراء ←
            </button>
          </div>

          <div class="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <div
              v-for="prod in stats.lowStockProducts || []"
              :key="prod.id"
              class="px-5 py-3 flex items-center justify-between"
            >
              <div>
                <div class="font-bold text-slate-900 dark:text-white">{{ prod.name }}</div>
                <div class="text-[11px] text-slate-500">
                  كود: {{ prod.code }} | الماركة: {{ prod.brand || '—' }}
                </div>
              </div>
              <span
                class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-black"
              >
                متبقي {{ prod.qty }}
              </span>
            </div>
            <div
              v-if="!stats.lowStockProducts || stats.lowStockProducts.length === 0"
              class="py-6 text-center text-slate-400"
            >
              جميع المنتجات والبطاريات متوفرة بكميات آمنة
            </div>
          </div>
        </div>

        <!-- Upcoming Patient Followups (Hearing Aids Mode) -->
        <div
          v-if="appStore.businessType === 'hearing_aids' && appStore.canViewMedicalRecords && stats.upcomingFollowups && stats.upcomingFollowups.length > 0"
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
        >
          <div
            class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"
          >
            <h3
              class="font-extrabold text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2"
            >
              <CalendarClock class="w-4 h-4" />
              أقرب مواعيد المتابعة والضبط ({{ stats.upcomingFollowups.length }})
            </h3>
            <button
              type="button"
              @click="router.push('/followups')"
              class="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              عرض الكل ←
            </button>
          </div>

          <div class="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <div
              v-for="item in stats.upcomingFollowups"
              :key="item.id"
              class="px-5 py-3 flex items-center justify-between"
            >
              <div>
                <div class="font-bold text-slate-900 dark:text-white">{{ item.patient_name }}</div>
                <div class="text-[11px] text-slate-500">
                  {{ item.type === 'fitting' ? 'جلسة ضبط Fitting' : item.type === 'mapping' ? 'برمجة قوقعة Mapping' : 'متابعة دورية' }} |
                  <span class="font-mono">{{ item.due_date }}</span>
                </div>
              </div>
              <button
                type="button"
                @click="sendWhatsAppReminder(item)"
                class="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
                title="تذكير المريض عبر واتساب"
              >
                <MessageCircle class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
