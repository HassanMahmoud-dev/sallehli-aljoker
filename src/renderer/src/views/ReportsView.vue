<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { swalSuccess, swalError } from '@renderer/utils/swal'
import type { FinancialReportData, MaintenanceTicket, SalesInvoice } from '@shared/types'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import {
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Wallet,
  Users,
  UserCog,
  PieChart,
  Calendar,
  MessageCircle,
  CheckCircle2,
  X,
  ShoppingCart,
  Boxes,
  Truck
} from 'lucide-vue-next'

const appStore = useAppStore()
const { t } = useTerms()

const today = new Date().toISOString().slice(0, 10)
const firstOfMonth = `${today.slice(0, 8)}01`

const dateFrom = ref(firstOfMonth)
const dateTo = ref(today)
const activeTab = ref<'profit' | 'technicians' | 'receivables' | 'analytics'>('profit')
const loading = ref(false)

const report = ref<FinancialReportData | null>(null)

// Quick Collect Receivable Modal
const collectModalOpen = ref(false)
const ticketToCollect = ref<MaintenanceTicket | null>(null)
const salesInvoiceToCollect = ref<SalesInvoice | null>(null)
const collectAmount = ref(0)
const collectMethod = ref<'cash' | 'vodafone_cash' | 'instapay' | 'bank'>('cash')
const collectNotes = ref('')

async function loadReport(): Promise<void> {
  loading.value = true
  try {
    report.value = await window.api.getFinancialReport({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value
    })
  } finally {
    loading.value = false
  }
}

function setQuickRange(range: 'today' | 'week' | 'month' | 'year'): void {
  const now = new Date()
  const endStr = now.toISOString().slice(0, 10)
  dateTo.value = endStr

  if (range === 'today') {
    dateFrom.value = endStr
  } else if (range === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    dateFrom.value = d.toISOString().slice(0, 10)
  } else if (range === 'month') {
    dateFrom.value = `${endStr.slice(0, 8)}01`
  } else if (range === 'year') {
    dateFrom.value = `${now.getFullYear()}-01-01`
  }
  loadReport()
}

function openCollectModal(ticket: MaintenanceTicket): void {
  ticketToCollect.value = ticket
  salesInvoiceToCollect.value = null
  collectAmount.value = ticket.remaining_amount
  collectMethod.value = ticket.payment_method || 'cash'
  collectNotes.value = `تحصيل متبقي طلب صيانة ${ticket.ticket_number} - ${ticket.customer_name}`
  collectModalOpen.value = true
}

function openSalesCollectModal(invoice: SalesInvoice): void {
  salesInvoiceToCollect.value = invoice
  ticketToCollect.value = null
  collectAmount.value = invoice.remaining_amount
  collectMethod.value = (invoice.payment_method as typeof collectMethod.value) || 'cash'
  collectNotes.value = `تحصيل قسط فاتورة بيع ${invoice.invoice_number} - ${invoice.customer_name || ''}`
  collectModalOpen.value = true
}

async function handleConfirmCollect(): Promise<void> {
  if ((!ticketToCollect.value && !salesInvoiceToCollect.value) || collectAmount.value <= 0) return
  try {
    await appStore.withLoading(async () => {
      if (salesInvoiceToCollect.value) {
        await window.api.collectSalesInstallment({
          invoice_id: salesInvoiceToCollect.value.id,
          amount: collectAmount.value,
          payment_method: collectMethod.value,
          notes: collectNotes.value
        })
      } else if (ticketToCollect.value) {
        await window.api.collectTicketReceivable({
          ticketId: ticketToCollect.value.id,
          amount: collectAmount.value,
          paymentMethod: collectMethod.value,
          notes: collectNotes.value
        })
      }
      collectModalOpen.value = false
      await loadReport()
    }, 'جاري تسجيل التحصيل وإضافته للخزينة...')
    swalSuccess('تم تسجيل التحصيل وإضافته للخزينة بنجاح')
  } catch (err: unknown) {
    swalError('تعذر تسجيل التحصيل', err instanceof Error ? err.message : '')
  }
}

function exportActiveReportToExcel(): void {
  if (!report.value) return
  let csvRows: string[][] = []
  let fileName = `Sallehli-Report-${dateFrom.value}-to-${dateTo.value}.csv`

  if (activeTab.value === 'profit') {
    fileName = `Sallehli-Profit-Report-${dateFrom.value}-to-${dateTo.value}.csv`
    csvRows = [
      ['تقرير الأرباح الصافية والخزينة', `من ${dateFrom.value}`, `إلى ${dateTo.value}`],
      [],
      ['البند المالي', 'القيمة (ج.م)'],
      ['إجمالي المقبوضات والإيرادات بالخزينة', String(report.value.summary.totalIncome)],
      ['إيرادات الكشف والمصنعية', String(report.value.summary.totalInspectionAndLabor)],
      [`مبيعات ${t('parts')} للعملاء`, String(report.value.summary.totalPartsRevenue)],
      [`تكلفة شراء ${t('parts')} المستهلكة`, String(report.value.summary.totalPartsCost)],
      [`ربح ${t('parts')} الصافي`, String(report.value.summary.totalPartsProfit)],
      ['عمولات الفنيين المنصرفة', String(report.value.summary.totalTechCommissions)],
      ['المصروفات الإدارية والتشغيلية', String(report.value.summary.totalExpense)],
      ['صافي الربح النهائي للمركز', String(report.value.summary.netProfit)],
      ['إجمالي مديونيات العملاء المتبقية بالخارج', String(report.value.summary.totalReceivables)],
      ...(appStore.businessType === 'hearing_aids'
        ? [
            ['إجمالي مبيعات السماعات والمنتجات بالفترة', String(report.value.summary.totalSalesRevenue || 0)],
            ['تكلفة البضاعة المباعة بالفترة', String(report.value.summary.totalSalesCost || 0)],
            ['صافي ربح المبيعات بالفترة', String(report.value.summary.totalSalesProfit || 0)],
            ['مرتجعات المبيعات بالفترة', String(report.value.summary.totalSalesReturns || 0)],
            ['مشتريات الموردين والأجهزة المستعملة بالفترة', String(report.value.summary.totalPurchasesAmount || 0)],
            ['تكلفة الصيانة الخارجية (معامل/توكيلات)', String(report.value.summary.totalExternalRepairCost || 0)],
            ['تقييم المخزن الحالي بسعر التكلفة', String(report.value.summary.inventoryCostValue || 0)],
            ['تقييم المخزن الحالي بسعر البيع', String(report.value.summary.inventorySaleValue || 0)]
          ]
        : []),
      [],
      ['طريقة الدفع / الخزينة', 'وارد الفترة', 'منصرف الفترة', 'صافي الفترة', 'الرصيد الكلي الحالي']
    ]
    for (const [key, label] of Object.entries(PAYMENT_METHODS)) {
      const p = report.value.periodBalancesByMethod[key] || { income: 0, expense: 0, net: 0 }
      const all = report.value.balancesByMethod[key] || { income: 0, expense: 0, net: 0 }
      csvRows.push([label, String(p.income), String(p.expense), String(p.net), String(all.net)])
    }
  } else if (activeTab.value === 'technicians') {
    fileName = `Sallehli-Technicians-Statement-${dateFrom.value}-to-${dateTo.value}.csv`
    csvRows = [
      [
        'اسم ' + t('technician'),
        'الهاتف',
        'التخصص',
        'نسبة العمولة %',
        'الراتب الأساسي',
        'طلبات منجزة بالفترة',
        'إجمالي مصنعية وكشف الفترة',
        'عمولة مكتسبة بالفترة',
        'عمولة منصرفة بالفترة',
        'إجمالي الرصيد المتبقي للفني'
      ]
    ]
    for (const t of report.value.technicianStatements) {
      csvRows.push([
        t.name,
        t.phone,
        t.specialty,
        String(t.commission_rate),
        String(t.base_salary),
        String(t.completed_tickets_count),
        String(Math.round(t.period_labor_and_inspection)),
        String(Math.round(t.period_earned_commission)),
        String(Math.round(t.period_paid_commission)),
        String(t.remaining_balance)
      ])
    }
  } else if (activeTab.value === 'receivables') {
    fileName = `Sallehli-Customer-Receivables-${today}.csv`
    csvRows = [
      [
        'رقم الطلب',
        'التاريخ',
        'اسم العميل',
        'رقم الهاتف',
        'المنطقة',
        t('device'),
        'الإجمالي',
        'المدفوع',
        'المتبقي على العميل'
      ]
    ]
    for (const r of report.value.customerReceivables) {
      csvRows.push([
        r.ticket_number,
        r.scheduled_date,
        r.customer_name,
        r.customer_phone,
        r.customer_area || '',
        `${r.appliance_type} (${r.brand})`,
        String(r.total_amount),
        String(r.paid_amount),
        String(r.remaining_amount)
      ])
    }
  } else {
    fileName = `${appStore.appName}-Analytics-${dateFrom.value}-to-${dateTo.value}.csv`
    csvRows = [[t('deviceType'), 'عدد البلاغات', 'إجمالي الإيرادات (ج.م)']]
    for (const a of report.value.topAppliances) {
      csvRows.push([a.appliance_type, String(a.count), String(a.revenue)])
    }
    csvRows.push([])
    csvRows.push([t('brand'), 'عدد البلاغات', 'إجمالي الإيرادات (ج.م)'])
    for (const b of report.value.topBrands) {
      csvRows.push([b.brand, String(b.count), String(b.revenue)])
    }
  }

  const csvContent =
    '\uFEFF' +
    csvRows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function handlePrintReport(): void {
  window.print()
}

onMounted(loadReport)
</script>

<template>
  <div class="space-y-5">
    <!-- Top Header & Actions -->
    <div
      class="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs space-y-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <PieChart class="w-5 h-5 text-blue-600" />
            التقارير المالية والمحاسبية المتقدمة
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تقرير صافي الأرباح، كشف حساب {{ t('technicians') }}، مديونيات {{ t('customers') }}، وتحليل {{ t('devices') }} مع التصدير إلى Excel و PDF
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 text-xs">
          <button
            type="button"
            @click="exportActiveReportToExcel"
            class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md cursor-pointer"
          >
            <FileSpreadsheet class="w-4 h-4" />
            تصدير إلى Excel (CSV)
          </button>
          <button
            type="button"
            @click="handlePrintReport"
            class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md cursor-pointer"
          >
            <Printer class="w-4 h-4" />
            طباعة التقرير / PDF
          </button>
        </div>
      </div>

      <!-- Date Filters Bar -->
      <div
        class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-bold text-slate-500 flex items-center gap-1">
            <Calendar class="w-4 h-4 text-blue-600" />
            الفترة الزمنية:
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-slate-500">من:</span>
            <input
              v-model="dateFrom"
              @change="loadReport"
              type="date"
              class="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-slate-500">إلى:</span>
            <input
              v-model="dateTo"
              @change="loadReport"
              type="date"
              class="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            @click="setQuickRange('today')"
            class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold cursor-pointer"
          >
            اليوم
          </button>
          <button
            type="button"
            @click="setQuickRange('week')"
            class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold cursor-pointer"
          >
            آخر 7 أيام
          </button>
          <button
            type="button"
            @click="setQuickRange('month')"
            class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold cursor-pointer"
          >
            هذا الشهر
          </button>
          <button
            type="button"
            @click="setQuickRange('year')"
            class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold cursor-pointer"
          >
            هذا العام
          </button>
        </div>
      </div>

      <!-- Report Tabs -->
      <div class="flex flex-wrap gap-2 pt-2 text-xs font-bold">
        <button
          type="button"
          @click="activeTab = 'profit'"
          :class="[
            'flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition cursor-pointer',
            activeTab === 'profit'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          ]"
        >
          <TrendingUp class="w-4 h-4" />
          الأرباح الصافية وأرصدة الخزائن
        </button>

        <button
          type="button"
          @click="activeTab = 'technicians'"
          :class="[
            'flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition cursor-pointer',
            activeTab === 'technicians'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          ]"
        >
          <UserCog class="w-4 h-4" />
          كشف حساب الفنيين والعمولات
        </button>

        <button
          type="button"
          @click="activeTab = 'receivables'"
          :class="[
            'flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition cursor-pointer',
            activeTab === 'receivables'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          ]"
        >
          <Users class="w-4 h-4" />
          مديونيات العملاء ({{ report?.customerReceivables.length || 0 }})
        </button>

        <button
          type="button"
          @click="activeTab = 'analytics'"
          :class="[
            'flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition cursor-pointer',
            activeTab === 'analytics'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          ]"
        >
          <PieChart class="w-4 h-4" />
          إحصائيات {{ t('devices') }} و{{ t('brand') }}
        </button>
      </div>
    </div>

    <!-- Print Header (Visible only when printing) -->
    <div class="hidden print:block p-4 border-b-2 border-slate-800 mb-4 text-right">
      <h2 class="text-lg font-black">{{ appStore.settings.center_name }} — تقرير مالي ومحاسبي</h2>
      <p class="text-xs">الفترة من {{ dateFrom }} إلى {{ dateTo }}</p>
    </div>

    <div v-if="report" class="space-y-5">
      <!-- ===================================================== -->
      <!-- TAB 1: NET PROFIT & MULTI-WALLET BALANCES             -->
      <!-- ===================================================== -->
      <div v-if="activeTab === 'profit'" class="space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <span class="text-xs font-bold text-slate-500">إجمالي إيرادات الفترة</span>
            <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {{ report.summary.totalIncome }} ج.م
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              من {{ report.summary.ticketsCount }} بلاغ ({{ report.summary.completedTicketsCount }}
              مكتمل)
            </div>
          </div>

          <div
            class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <span class="text-xs font-bold text-slate-500">صافي ربح {{ t('parts') }}</span>
            <div class="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {{ report.summary.totalPartsProfit }} ج.م
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              بيع: {{ report.summary.totalPartsRevenue }} — تكلفة:
              {{ report.summary.totalPartsCost }} ج.م
            </div>
          </div>

          <div
            class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <span class="text-xs font-bold text-slate-500">عمولات الفنيين + المصروفات</span>
            <div class="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {{ report.summary.totalExpense + report.summary.totalTechCommissions }} ج.م
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              عمولات: {{ report.summary.totalTechCommissions }} | مصروفات:
              {{ report.summary.totalExpense }} ج.م
            </div>
          </div>

          <div
            class="p-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border-2 border-emerald-500/60 shadow-xs"
          >
            <span class="text-xs font-black text-emerald-800 dark:text-emerald-300">
              صافي ربح المركز في الفترة
            </span>
            <div class="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
              {{ report.summary.netProfit }} ج.م
            </div>
            <div class="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-1">
              مديونيات بالخارج: {{ report.summary.totalReceivables }} ج.م
            </div>
          </div>
        </div>

        <!-- Hearing Aids Sales, Purchases & Inventory Valuation Summary (Phase 3W) -->
        <div
          v-if="appStore.businessType === 'hearing_aids'"
          class="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <div
            class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <span class="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <ShoppingCart class="w-3.5 h-3.5 text-indigo-600" />
              مبيعات السماعات والمنتجات بالفترة
            </span>
            <div class="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {{ report.summary.totalSalesRevenue || 0 }} ج.م
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              مرتجعات بيع: {{ report.summary.totalSalesReturns || 0 }} ج.م
            </div>
          </div>

          <div
            class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <span class="text-xs font-bold text-slate-500">صافي ربح المبيعات بالفترة</span>
            <div class="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {{ report.summary.totalSalesProfit || 0 }} ج.م
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              تكلفة البضاعة المباعة: {{ report.summary.totalSalesCost || 0 }} ج.م
            </div>
          </div>

          <div
            class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <span class="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Truck class="w-3.5 h-3.5 text-amber-600" />
              المشتريات والصيانة الخارجية
            </span>
            <div class="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {{ report.summary.totalPurchasesAmount || 0 }} ج.م
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              معامل صيانة خارجية: {{ report.summary.totalExternalRepairCost || 0 }} ج.م
            </div>
          </div>

          <div
            class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <span class="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Boxes class="w-3.5 h-3.5 text-teal-600" />
              تقييم المخزن الحالي (بالتكلفة)
            </span>
            <div class="text-xl font-black text-teal-600 dark:text-teal-400 mt-1">
              {{ report.summary.inventoryCostValue || 0 }} ج.م
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              القيمة البيعية التقديرية: {{ report.summary.inventorySaleValue || 0 }} ج.م
            </div>
          </div>
        </div>

        <!-- Multi-Wallet Balances Breakdown -->
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <h3 class="font-black text-sm flex items-center gap-2">
            <Wallet class="w-4 h-4 text-blue-600" />
            أرصدة الخزائن والمحافظ الإلكترونية والحسابات البنكية
          </h3>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
                <tr>
                  <th class="py-3 px-4">الوعاء المالي / طريقة الدفع</th>
                  <th class="py-3 px-4">وارد خلال الفترة</th>
                  <th class="py-3 px-4">منصرف خلال الفترة</th>
                  <th class="py-3 px-4">صافي حركة الفترة</th>
                  <th class="py-3 px-4">الرصيد الفعلي المتاح حالياً</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                <tr v-for="(label, key) in PAYMENT_METHODS" :key="key">
                  <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">{{ label }}</td>
                  <td class="py-3 px-4 text-emerald-600 font-bold">
                    +{{ report.periodBalancesByMethod[key]?.income || 0 }} ج.م
                  </td>
                  <td class="py-3 px-4 text-rose-600 font-bold">
                    -{{ report.periodBalancesByMethod[key]?.expense || 0 }} ج.م
                  </td>
                  <td class="py-3 px-4 font-bold">
                    {{ report.periodBalancesByMethod[key]?.net || 0 }} ج.م
                  </td>
                  <td class="py-3 px-4 font-black text-sm text-blue-600 dark:text-blue-400">
                    {{ report.balancesByMethod[key]?.net || 0 }} ج.م
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ===================================================== -->
      <!-- TAB 2: TECHNICIAN STATEMENTS                          -->
      <!-- ===================================================== -->
      <div
        v-if="activeTab === 'technicians'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
      >
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr>
                <th class="py-3.5 px-4">الفني</th>
                <th class="py-3.5 px-4">التخصص</th>
                <th class="py-3.5 px-4">نسبة العمولة</th>
                <th class="py-3.5 px-4">الراتب الثابت</th>
                <th class="py-3.5 px-4">طلبات منجزة بالفترة</th>
                <th class="py-3.5 px-4">إجمالي مصنعية الفترة</th>
                <th class="py-3.5 px-4">عمولة الفترة</th>
                <th class="py-3.5 px-4">منصرف بالفترة</th>
                <th class="py-3.5 px-4">الرصيد المتبقي للفني</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
              <tr v-for="stmt in report.technicianStatements" :key="stmt.id">
                <td class="py-3.5 px-4">
                  <div class="flex items-center gap-2.5">
                    <img
                      v-if="stmt.avatar_base64"
                      :src="stmt.avatar_base64"
                      class="w-9 h-9 rounded-full object-cover border border-slate-300 cursor-pointer"
                      @click="appStore.openImagePreview(stmt.avatar_base64, stmt.name)"
                    />
                    <div
                      v-else
                      class="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center font-black"
                    >
                      {{ stmt.name.slice(0, 1) }}
                    </div>
                    <div>
                      <div class="font-bold text-slate-900 dark:text-white">{{ stmt.name }}</div>
                      <div class="font-mono text-[11px] text-slate-500">{{ stmt.phone }}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3.5 px-4">{{ stmt.specialty }}</td>
                <td class="py-3.5 px-4 font-bold">{{ stmt.commission_rate }}%</td>
                <td class="py-3.5 px-4 font-bold">{{ stmt.base_salary }} ج.م</td>
                <td class="py-3.5 px-4 font-bold text-indigo-600">
                  {{ stmt.completed_tickets_count }} طلب
                </td>
                <td class="py-3.5 px-4 font-bold">
                  {{ Math.round(stmt.period_labor_and_inspection) }} ج.م
                </td>
                <td class="py-3.5 px-4 font-bold text-emerald-600">
                  {{ Math.round(stmt.period_earned_commission) }} ج.م
                </td>
                <td class="py-3.5 px-4 font-bold text-rose-600">
                  {{ Math.round(stmt.period_paid_commission) }} ج.م
                </td>
                <td class="py-3.5 px-4 font-black text-sm text-blue-600 dark:text-blue-400">
                  {{ stmt.remaining_balance }} ج.م
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ===================================================== -->
      <!-- TAB 3: CUSTOMER RECEIVABLES (DEBT COLLECTION)         -->
      <!-- ===================================================== -->
      <div v-if="activeTab === 'receivables'" class="space-y-5">
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
        >
          <div
            class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-black text-xs text-slate-800 dark:text-slate-200"
          >
            مديونيات طلبات الصيانة ({{ report.customerReceivables.length }})
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
                <tr>
                  <th class="py-3.5 px-4">رقم الطلب</th>
                  <th class="py-3.5 px-4">{{ t('customer') }}</th>
                  <th class="py-3.5 px-4">{{ t('device') }}</th>
                  <th class="py-3.5 px-4">الإجمالي</th>
                  <th class="py-3.5 px-4">المدفوع</th>
                  <th class="py-3.5 px-4">المتبقي على العميل</th>
                  <th class="py-3.5 px-4 no-print">تحصيل / تواصل</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                <tr v-for="r in report.customerReceivables" :key="r.id">
                  <td class="py-3.5 px-4 font-mono font-bold text-blue-600">
                    {{ r.ticket_number }}
                    <div class="text-[10px] text-slate-400">{{ r.scheduled_date }}</div>
                  </td>
                  <td class="py-3.5 px-4">
                    <div class="font-bold">{{ r.customer_name }}</div>
                    <div class="font-mono text-slate-500">{{ r.customer_phone }}</div>
                  </td>
                  <td class="py-3.5 px-4">{{ r.appliance_type }} ({{ r.brand }})</td>
                  <td class="py-3.5 px-4 font-bold">{{ r.total_amount }} ج.م</td>
                  <td class="py-3.5 px-4 text-emerald-600 font-bold">{{ r.paid_amount }} ج.م</td>
                  <td class="py-3.5 px-4 font-black text-sm text-rose-600">
                    {{ r.remaining_amount }} ج.م
                  </td>
                  <td class="py-3.5 px-4 no-print">
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        @click="openCollectModal(r)"
                        class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 class="w-3.5 h-3.5" />
                        تحصيل المتبقي
                      </button>
                      <button
                        type="button"
                        @click="appStore.sendWhatsAppToCustomer(r)"
                        class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-pointer"
                        title="إرسال مطالبة عبر واتساب"
                      >
                        <MessageCircle class="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="report.customerReceivables.length === 0">
                  <td colspan="7" class="py-8 text-center text-slate-400">
                    لا توجد مديونيات متأخرة على طلبات الصيانة حالياً
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sales Installments Receivables (Hearing Aids Mode) -->
        <div
          v-if="appStore.businessType === 'hearing_aids'"
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
        >
          <div
            class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-black text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2"
          >
            <ShoppingCart class="w-4 h-4" />
            أقساط ومديونيات فواتير المبيعات ({{ report.salesReceivables?.length || 0 }})
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
                <tr>
                  <th class="py-3 px-4">رقم الفاتورة</th>
                  <th class="py-3 px-4">{{ t('customer') }}</th>
                  <th class="py-3 px-4">صافي الفاتورة</th>
                  <th class="py-3 px-4">المدفوع</th>
                  <th class="py-3 px-4">المتبقي على العميل</th>
                  <th class="py-3 px-4 no-print">تحصيل القسط</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                <tr v-for="inv in report.salesReceivables || []" :key="inv.id">
                  <td class="py-3 px-4 font-mono font-bold text-indigo-600">
                    {{ inv.invoice_number }}
                    <div class="text-[10px] text-slate-400">{{ inv.created_at }}</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="font-bold">{{ inv.customer_name || 'عميل' }}</div>
                    <div class="font-mono text-slate-500">{{ inv.customer_phone }}</div>
                  </td>
                  <td class="py-3 px-4 font-bold">{{ inv.total_amount }} ج.م</td>
                  <td class="py-3 px-4 text-emerald-600 font-bold">{{ inv.paid_amount }} ج.م</td>
                  <td class="py-3 px-4 font-black text-sm text-rose-600">
                    {{ inv.remaining_amount }} ج.م
                  </td>
                  <td class="py-3 px-4 no-print">
                    <button
                      type="button"
                      @click="openSalesCollectModal(inv)"
                      class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 class="w-3.5 h-3.5" />
                      تحصيل دفعة / قسط
                    </button>
                  </td>
                </tr>
                <tr v-if="!report.salesReceivables || report.salesReceivables.length === 0">
                  <td colspan="6" class="py-8 text-center text-slate-400">
                    لا توجد أقساط مبيعات مستحقة حالياً
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Supplier Balances (Hearing Aids Mode) -->
        <div
          v-if="appStore.businessType === 'hearing_aids'"
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
        >
          <div
            class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-black text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2"
          >
            <Truck class="w-4 h-4" />
            أرصدة الموردين والتوكيلات ({{ report.supplierBalances?.length || 0 }})
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
                <tr>
                  <th class="py-3 px-4">اسم المورد</th>
                  <th class="py-3 px-4">الشركة</th>
                  <th class="py-3 px-4">الهاتف</th>
                  <th class="py-3 px-4">الرصيد الحالي للمورد</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                <tr v-for="sup in report.supplierBalances || []" :key="sup.id">
                  <td class="py-3 px-4 font-bold">{{ sup.name }}</td>
                  <td class="py-3 px-4">{{ sup.company_name || '—' }}</td>
                  <td class="py-3 px-4 font-mono">{{ sup.phone || '—' }}</td>
                  <td
                    :class="[
                      'py-3 px-4 font-black text-sm',
                      sup.balance > 0 ? 'text-rose-600' : 'text-emerald-600'
                    ]"
                  >
                    {{ sup.balance }} ج.م
                  </td>
                </tr>
                <tr v-if="!report.supplierBalances || report.supplierBalances.length === 0">
                  <td colspan="4" class="py-8 text-center text-slate-400">
                    لا توجد أرصدة معلقة للموردين حالياً
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ===================================================== -->
      <!-- TAB 4: APPLIANCES & BRANDS ANALYTICS                  -->
      <!-- ===================================================== -->
      <div v-if="activeTab === 'analytics'" class="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <h3 class="font-black text-sm text-blue-600">
            📊 أكثر {{ t('devices') }} صيانة في الفترة
          </h3>
          <div class="space-y-2.5">
            <div
              v-for="item in report.topAppliances"
              :key="item.appliance_type"
              class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between"
            >
              <div>
                <div class="font-bold text-slate-900 dark:text-white">
                  {{ item.appliance_type }}
                </div>
                <div class="text-slate-500">عدد البلاغات: {{ item.count }}</div>
              </div>
              <div class="font-black text-emerald-600">{{ item.revenue }} ج.م</div>
            </div>
            <div v-if="report.topAppliances.length === 0" class="text-slate-400 py-6 text-center">
              لا توجد بيانات في هذه الفترة
            </div>
          </div>
        </div>

        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <h3 class="font-black text-sm text-indigo-600">🏷️ أكثر الماركات التجارية تكراراً</h3>
          <div class="space-y-2.5">
            <div
              v-for="item in report.topBrands"
              :key="item.brand"
              class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between"
            >
              <div>
                <div class="font-bold text-slate-900 dark:text-white">{{ item.brand }}</div>
                <div class="text-slate-500">عدد البلاغات: {{ item.count }}</div>
              </div>
              <div class="font-black text-indigo-600">{{ item.revenue }} ج.م</div>
            </div>
            <div v-if="report.topBrands.length === 0" class="text-slate-400 py-6 text-center">
              لا توجد بيانات في هذه الفترة
            </div>
          </div>
        </div>

        <div
          v-if="appStore.businessType === 'hearing_aids'"
          class="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <h3 class="font-black text-sm text-emerald-600">
            🛒 أكثر السماعات والبطاريات والمنتجات مبيعاً وربحية في الفترة
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="prod in report.topProducts || []"
              :key="prod.product_name"
              class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between"
            >
              <div>
                <div class="font-bold text-slate-900 dark:text-white">{{ prod.product_name }}</div>
                <div class="text-slate-500">الكمية المباعة: {{ prod.qty }}</div>
              </div>
              <div class="text-left">
                <div class="font-black text-indigo-600">مبيعات: {{ prod.revenue }} ج.م</div>
                <div class="text-[11px] font-bold text-emerald-600">
                  الربح الصافي: {{ prod.profit }} ج.م
                </div>
              </div>
            </div>
            <div
              v-if="!report.topProducts || report.topProducts.length === 0"
              class="md:col-span-2 text-slate-400 py-6 text-center"
            >
              لا توجد مبيعات مسجلة في هذه الفترة
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collect Receivable Modal -->
    <div
      v-if="collectModalOpen && (ticketToCollect || salesInvoiceToCollect)"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 text-xs"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-black text-sm">
            تحصيل مديونية العميل:
            {{
              ticketToCollect
                ? ticketToCollect.customer_name
                : salesInvoiceToCollect?.customer_name || 'عميل'
            }}
          </h3>
          <button @click="collectModalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>
        <form @submit.prevent="handleConfirmCollect" class="p-6 space-y-4">
          <div>
            <label class="block font-bold mb-1">
              المبلغ المحصل الآن (المتبقي:
              {{
                ticketToCollect
                  ? ticketToCollect.remaining_amount
                  : salesInvoiceToCollect?.remaining_amount || 0
              }}
              ج.م) *
            </label>
            <input
              v-model.number="collectAmount"
              type="number"
              min="1"
              :max="
                ticketToCollect
                  ? ticketToCollect.remaining_amount
                  : salesInvoiceToCollect?.remaining_amount || 0
              "
              required
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-black text-base"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">الخزينة / طريقة الدفع</label>
            <select
              v-model="collectMethod"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            >
              <option v-for="(label, k) in PAYMENT_METHODS" :key="k" :value="k">
                {{ label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block font-bold mb-1">ملاحظات البيان بالخزينة</label>
            <input
              v-model="collectNotes"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              @click="collectModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer"
            >
              تأكيد التحصيل وإضافته للخزينة
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
