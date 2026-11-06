<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { TICKET_STATUS_MAP, PAYMENT_METHODS } from '@renderer/constants/appliances'
import AudiogramChart from './AudiogramChart.vue'
import { Printer, X, FileText, Receipt, ShieldCheck, Wrench } from 'lucide-vue-next'

const appStore = useAppStore()
const { t } = useTerms()
const ticket = computed(() => appStore.ticketToPrint)
const salesInv = computed(() => appStore.salesInvoiceToPrint)
const hearingTest = computed(() => appStore.hearingTestToPrint)
const earmold = computed(() => appStore.earmoldToPrint)
const settings = computed(() => appStore.settings)
const extraEntries = computed(() =>
  ticket.value ? appStore.formatExtraDataEntries(ticket.value.extra_data) : []
)

const warrantySalesItems = computed(() =>
  (salesInv.value?.items || []).filter((i) => i.warranty_months > 0 || i.serial_no)
)

const FREQUENCIES = [250, 500, 1000, 2000, 4000, 8000]

function getTestPointText(
  ear: 'right' | 'left',
  conduction: 'air' | 'bone',
  freq: number
): string {
  const pt = (hearingTest.value?.points || []).find(
    (p) => p.ear === ear && p.conduction === conduction && Number(p.frequency) === freq
  )
  if (!pt) return '—'
  return `${pt.db_value}${pt.is_masked ? ' (M)' : ''}${pt.no_response ? ' NR' : ''}`
}

function triggerPrint(): void {
  window.print()
}
</script>

<template>
  <div
    v-if="appStore.printModalOpen && (ticket || salesInv || hearingTest || earmold)"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto"
  >
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden"
    >
      <!-- Toolbar (Hidden in Print) -->
      <div
        class="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700"
      >
        <div class="flex items-center gap-2">
          <Printer class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 v-if="ticket" class="font-bold text-lg text-slate-900 dark:text-white">
            معاينة الطباعة - طلب رقم {{ ticket.ticket_number }}
          </h3>
          <h3 v-else-if="salesInv" class="font-bold text-lg text-slate-900 dark:text-white">
            معاينة طباعة فاتورة مبيعات - {{ salesInv.invoice_number }}
          </h3>
          <h3 v-else-if="hearingTest" class="font-bold text-lg text-slate-900 dark:text-white">
            معاينة طباعة تقرير فحص السمع - {{ hearingTest.test_number }}
          </h3>
          <h3 v-else-if="earmold" class="font-bold text-lg text-slate-900 dark:text-white">
            معاينة طباعة طلب قالب أذن - {{ earmold.order_number }}
          </h3>
        </div>

        <!-- Template & Document Type Switchers -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Document Type -->
          <div
            v-if="ticket"
            class="flex rounded-xl bg-slate-200 dark:bg-slate-900 p-1 text-xs font-semibold"
          >
            <button
              type="button"
              @click="appStore.activePrintDocType = 'invoice_warranty'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer',
                appStore.activePrintDocType === 'invoice_warranty'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
              ]"
            >
              <ShieldCheck class="w-4 h-4" />
              فاتورة صيانة + شهادة ضمان
            </button>
            <button
              type="button"
              @click="appStore.activePrintDocType = 'reception_receipt'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer',
                appStore.activePrintDocType === 'reception_receipt'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
              ]"
            >
              <Wrench class="w-4 h-4" />
              إيصال استلام / أمر شغل
            </button>
          </div>

          <!-- Paper Size Format -->
          <div class="flex rounded-xl bg-slate-200 dark:bg-slate-900 p-1 text-xs font-semibold">
            <button
              type="button"
              @click="appStore.activePrintFormat = 'a4'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer',
                appStore.activePrintFormat === 'a4'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
              ]"
            >
              <FileText class="w-4 h-4" />
              قالب A4 / A5 الرسمي
            </button>
            <button
              type="button"
              @click="appStore.activePrintFormat = 'thermal80'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer',
                appStore.activePrintFormat === 'thermal80'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
              ]"
            >
              <Receipt class="w-4 h-4" />
              قالب حراري 80mm
            </button>
          </div>

          <button
            type="button"
            @click="triggerPrint"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
          >
            <Printer class="w-4 h-4" />
            طباعة الآن
          </button>

          <button
            type="button"
            @click="appStore.closePrintModal"
            class="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Printable Preview Container -->
      <div class="flex-1 overflow-y-auto p-6 bg-slate-200/70 dark:bg-slate-950 flex justify-center">
        <!-- ======================================================= -->
        <!-- SALES INVOICE TEMPLATES (A4 & THERMAL 80MM)             -->
        <!-- ======================================================= -->
        <template v-if="salesInv">
          <!-- SALES A4 -->
          <div
            v-if="appStore.activePrintFormat === 'a4'"
            id="printable-area"
            dir="rtl"
            class="bg-white text-slate-900 w-full max-w-[210mm] p-8 rounded-xl shadow-lg border border-slate-300 text-sm"
          >
            <div class="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-5">
              <div class="space-y-1">
                <div class="flex items-center gap-3">
                  <img
                    v-if="settings.logo_base64"
                    :src="settings.logo_base64"
                    alt="Logo"
                    class="w-14 h-14 object-contain rounded-lg border border-slate-200"
                  />
                  <div>
                    <h1 class="text-2xl font-black text-slate-900">{{ settings.center_name }}</h1>
                    <p class="text-xs text-slate-600 font-semibold max-w-md">
                      {{ settings.center_subtitle }}
                    </p>
                  </div>
                </div>
                <p class="text-xs text-slate-700 pt-1">📍 {{ settings.address }}</p>
                <p class="text-xs text-slate-700 font-bold">
                  📞 خدمة العملاء: {{ settings.phone1 }}
                  <span v-if="settings.phone2"> - {{ settings.phone2 }}</span>
                </p>
              </div>

              <div class="text-left bg-slate-100 border border-slate-300 rounded-xl p-3 min-w-[210px]">
                <div class="text-xs font-bold text-slate-500 uppercase">
                  {{
                    salesInv.invoice_type === 'quick_pos'
                      ? 'فاتورة بيع نقدي مباشر'
                      : salesInv.invoice_type === 'exchange'
                        ? 'فاتورة بيع واستبدال'
                        : 'فاتورة مبيعات وشهادة ضمان'
                  }}
                </div>
                <div class="text-lg font-black text-slate-900 mt-0.5 font-mono">
                  {{ salesInv.invoice_number }}
                </div>
                <div class="text-xs text-slate-600 mt-1">
                  التاريخ: {{ salesInv.created_at?.slice(0, 16) }}
                </div>
              </div>
            </div>

            <div class="border border-slate-300 rounded-xl p-3.5 bg-slate-50/60 mb-5 flex flex-wrap justify-between gap-4 text-xs">
              <div>
                <span class="font-bold text-slate-700">العميل: </span>
                <span class="font-black text-slate-900">{{ salesInv.customer_name }}</span>
              </div>
              <div v-if="salesInv.customer_phone">
                <span class="font-bold text-slate-700">الهاتف: </span>
                <span class="font-mono font-bold">{{ salesInv.customer_phone }}</span>
              </div>
              <div>
                <span class="font-bold text-slate-700">طريقة الدفع: </span>
                <span class="font-bold">{{ PAYMENT_METHODS[salesInv.payment_method] || 'كاش' }}</span>
              </div>
            </div>

            <div class="mb-5 border border-slate-300 rounded-xl overflow-hidden">
              <table class="w-full text-right text-xs border-collapse">
                <thead class="bg-slate-800 text-white">
                  <tr>
                    <th class="py-2 px-3">#</th>
                    <th class="py-2 px-3">الصنف / الموديل</th>
                    <th class="py-2 px-3">السيريال والأذن</th>
                    <th class="py-2 px-3">الوحدة والكمية</th>
                    <th class="py-2 px-3">السعر</th>
                    <th class="py-2 px-3">الضمان</th>
                    <th class="py-2 px-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                  <tr v-for="(item, idx) in salesInv.items || []" :key="idx">
                    <td class="py-2 px-3 font-semibold">{{ idx + 1 }}</td>
                    <td class="py-2 px-3 font-bold">
                      {{ item.product_name }}
                      <span v-if="item.variant_name" class="text-slate-600">
                        ({{ item.variant_name }})
                      </span>
                      <span v-if="item.condition === 'used'" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 mr-1">
                        مستعملة
                      </span>
                    </td>
                    <td class="py-2 px-3 font-mono">
                      <span v-if="item.serial_no">S/N: {{ item.serial_no }}</span>
                      <span v-else>—</span>
                      <div v-if="item.ear_side" class="font-sans text-[11px] text-slate-600">
                        الأذن: {{ item.ear_side }}
                      </div>
                    </td>
                    <td class="py-2 px-3">
                      {{ item.quantity }} {{ item.unit === 'pack' ? 'عبوة/باكيت' : 'قطعة' }}
                    </td>
                    <td class="py-2 px-3">{{ item.unit_price }} ج.م</td>
                    <td class="py-2 px-3">
                      <span v-if="item.warranty_months > 0" class="font-bold">
                        {{ item.warranty_months }} شهر
                        <span v-if="item.warranty_end" class="block text-[10px] text-slate-600">
                          حتى {{ item.warranty_end }}
                        </span>
                      </span>
                      <span v-else>—</span>
                    </td>
                    <td class="py-2 px-3 font-bold">{{ item.total_price }} ج.م</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-5">
              <div class="border-2 border-slate-800 rounded-xl p-4 bg-slate-50">
                <div class="flex items-center justify-between border-b border-slate-300 pb-2 mb-2">
                  <h4 class="font-black text-sm text-slate-900">🛡️ شهادة ضمان السماعات والأجهزة</h4>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border border-slate-800">
                    {{ warrantySalesItems.length > 0 ? 'مشمول بالضمان' : 'فاتورة بيع' }}
                  </span>
                </div>
                <div v-if="warrantySalesItems.length > 0" class="space-y-1 text-xs mb-2">
                  <div v-for="(wi, wIdx) in warrantySalesItems" :key="wIdx" class="font-bold text-slate-800">
                    • {{ wi.product_name }}
                    <span v-if="wi.serial_no">(S/N: {{ wi.serial_no }})</span>
                    <span v-if="wi.ear_side">[{{ wi.ear_side }}]</span>:
                    ضمان حتى {{ wi.warranty_end || '—' }}
                  </div>
                </div>
                <p class="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">
                  {{ settings.warranty_terms }}
                </p>
              </div>

              <div class="border border-slate-300 rounded-xl p-4 space-y-1.5 text-xs">
                <div class="flex justify-between">
                  <span class="text-slate-600">إجمالي الأصناف:</span>
                  <span class="font-bold">{{ salesInv.subtotal }} ج.م</span>
                </div>
                <div v-if="salesInv.discount > 0" class="flex justify-between text-emerald-700">
                  <span>خصم خاص:</span>
                  <span class="font-bold">- {{ salesInv.discount }} ج.م</span>
                </div>
                <div v-if="salesInv.trade_in_credit > 0" class="flex justify-between text-blue-700">
                  <span>قيمة سماعة مستبدلة (Trade-In):</span>
                  <span class="font-bold">- {{ salesInv.trade_in_credit }} ج.م</span>
                </div>
                <div class="flex justify-between border-t-2 border-slate-800 pt-2 text-sm font-black text-slate-900">
                  <span>الصافي المطلوب:</span>
                  <span>{{ salesInv.total_amount }} ج.م</span>
                </div>
                <div class="flex justify-between text-slate-700 pt-1">
                  <span>المدفوع ({{ PAYMENT_METHODS[salesInv.payment_method] || 'كاش' }}):</span>
                  <span class="font-bold">{{ salesInv.paid_amount }} ج.م</span>
                </div>
                <div class="flex justify-between font-black text-slate-900">
                  <span>المتبقي / الآجل:</span>
                  <span>{{ salesInv.remaining_amount }} ج.م</span>
                </div>
              </div>
            </div>

            <div v-if="salesInv.notes" class="text-xs border border-slate-200 rounded-lg p-2.5 mb-4 bg-slate-50">
              <span class="font-bold">ملاحظات: </span> {{ salesInv.notes }}
            </div>

            <div class="grid grid-cols-2 gap-4 pt-4 border-t border-slate-300 text-center text-xs">
              <div>
                <p class="font-bold text-slate-700 mb-6">ختم وتوقيع المركز</p>
                <p class="text-slate-400">....................................</p>
              </div>
              <div>
                <p class="font-bold text-slate-700 mb-6">توقيع العميل بالاستلام</p>
                <p class="text-slate-400">....................................</p>
              </div>
            </div>

            <div class="mt-4 pt-2 border-t border-dashed border-slate-300 text-center text-xs font-bold text-slate-600">
              {{ settings.receipt_footer }}
            </div>
          </div>

          <!-- SALES THERMAL 80MM -->
          <div
            v-else
            id="printable-area"
            dir="rtl"
            class="bg-white text-black w-[80mm] p-3.5 rounded-lg shadow-lg border border-slate-300 text-xs font-sans"
          >
            <div class="text-center border-b border-dashed border-black pb-2 mb-2">
              <img
                v-if="settings.logo_base64"
                :src="settings.logo_base64"
                alt="Logo"
                class="w-12 h-12 mx-auto mb-1 object-contain"
              />
              <div class="font-black text-sm">{{ settings.center_name }}</div>
              <div class="text-[10px] text-slate-700">{{ settings.address }}</div>
              <div class="text-[11px] font-bold mt-0.5">
                ت: {{ settings.phone1 }} <span v-if="settings.phone2">/ {{ settings.phone2 }}</span>
              </div>
            </div>

            <div class="text-center bg-slate-100 border border-black rounded py-1 mb-2">
              <div class="text-[10px] font-bold">فاتورة مبيعات</div>
              <div class="font-black text-sm font-mono">{{ salesInv.invoice_number }}</div>
              <div class="text-[10px]">{{ salesInv.created_at?.slice(0, 16) }}</div>
            </div>

            <div class="space-y-0.5 border-b border-dashed border-black pb-2 mb-2 text-[11px]">
              <div><span class="font-bold">العميل:</span> {{ salesInv.customer_name }}</div>
              <div v-if="salesInv.customer_phone">
                <span class="font-bold">الهاتف:</span> {{ salesInv.customer_phone }}
              </div>
            </div>

            <div class="border-b border-dashed border-black pb-2 mb-2">
              <div
                v-for="(it, idx) in salesInv.items || []"
                :key="idx"
                class="py-1 border-b border-dotted border-slate-300 last:border-none text-[10px]"
              >
                <div class="flex justify-between font-bold">
                  <span>
                    {{ it.product_name }}
                    <span v-if="it.variant_name">({{ it.variant_name }})</span>
                    ×{{ it.quantity }}
                  </span>
                  <span>{{ it.total_price }} ج.م</span>
                </div>
                <div v-if="it.serial_no" class="font-mono text-[9px] text-slate-700">
                  S/N: {{ it.serial_no }} <span v-if="it.ear_side">({{ it.ear_side }})</span>
                </div>
                <div v-if="it.warranty_end" class="text-[9px] font-bold">
                  🛡️ ضمان حتى: {{ it.warranty_end }}
                </div>
              </div>
            </div>

            <div class="space-y-1 border-b border-dashed border-black pb-2 mb-2 text-[11px]">
              <div class="flex justify-between">
                <span>الإجمالي الفرعي:</span>
                <span>{{ salesInv.subtotal }} ج.م</span>
              </div>
              <div v-if="salesInv.discount > 0" class="flex justify-between">
                <span>الخصم:</span>
                <span>- {{ salesInv.discount }} ج.م</span>
              </div>
              <div v-if="salesInv.trade_in_credit > 0" class="flex justify-between">
                <span>استبدال (Trade-In):</span>
                <span>- {{ salesInv.trade_in_credit }} ج.م</span>
              </div>
              <div class="flex justify-between font-black text-xs border-t border-black pt-1">
                <span>الصافي:</span>
                <span>{{ salesInv.total_amount }} ج.م</span>
              </div>
              <div class="flex justify-between">
                <span>المدفوع:</span>
                <span class="font-bold">{{ salesInv.paid_amount }} ج.م</span>
              </div>
              <div v-if="salesInv.remaining_amount > 0" class="flex justify-between font-black">
                <span>المتبقي:</span>
                <span>{{ salesInv.remaining_amount }} ج.م</span>
              </div>
            </div>

            <div class="text-center text-[10px] font-bold pt-1">
              {{ settings.receipt_footer }}
            </div>
          </div>
        </template>

        <!-- ======================================================= -->
        <!-- TEMPLATE 1: A4 / A5 OFFICIAL INVOICE & WARRANTY SHEET   -->
        <!-- ======================================================= -->
        <div
          v-else-if="ticket && appStore.activePrintFormat === 'a4'"
          id="printable-area"
          dir="rtl"
          class="bg-white text-slate-900 w-full max-w-[210mm] p-8 rounded-xl shadow-lg border border-slate-300 text-sm"
        >
          <!-- Header -->
          <div class="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-5">
            <div class="space-y-1">
              <div class="flex items-center gap-3">
                <img
                  v-if="settings.logo_base64"
                  :src="settings.logo_base64"
                  alt="Logo"
                  class="w-14 h-14 object-contain rounded-lg border border-slate-200"
                />
                <div>
                  <h1 class="text-2xl font-black text-slate-900">{{ settings.center_name }}</h1>
                  <p class="text-xs text-slate-600 font-semibold max-w-md">
                    {{ settings.center_subtitle }}
                  </p>
                </div>
              </div>
              <p class="text-xs text-slate-700 pt-1">📍 {{ settings.address }}</p>
              <p class="text-xs text-slate-700 font-bold">
                📞 خدمة العملاء: {{ settings.phone1 }}
                <span v-if="settings.phone2"> - {{ settings.phone2 }}</span>
              </p>
            </div>

            <div class="text-left bg-slate-100 border border-slate-300 rounded-xl p-3 min-w-[200px]">
              <div class="text-xs font-bold text-slate-500 uppercase">
                {{
                  appStore.activePrintDocType === 'invoice_warranty'
                    ? 'فاتورة صيانة وشهادة ضمان'
                    : 'إيصال استلام / أمر شغل صيانة'
                }}
              </div>
              <div class="text-lg font-black text-slate-900 mt-0.5">
                {{ ticket.ticket_number }}
              </div>
              <div class="text-xs text-slate-600 mt-1">
                التاريخ: {{ ticket.created_at?.slice(0, 10) || ticket.scheduled_date }}
              </div>
              <div class="text-xs font-bold text-slate-800 mt-0.5">
                نوع الخدمة:
                {{ ticket.service_type === 'home_visit' ? 'زيارة منزلية' : 'صيانة بالورشة' }}
              </div>
            </div>
          </div>

          <!-- Customer & Appliance Info Grid -->
          <div class="grid grid-cols-2 gap-4 mb-5">
            <div class="border border-slate-300 rounded-xl p-3.5 bg-slate-50/60">
              <h4 class="font-bold text-slate-900 border-b border-slate-200 pb-1.5 mb-2 text-xs">
                👤 بيانات العميل
              </h4>
              <div class="space-y-1 text-xs">
                <div><span class="font-bold">الاسم:</span> {{ ticket.customer_name }}</div>
                <div>
                  <span class="font-bold">الهاتف:</span> {{ ticket.customer_phone }}
                  <span v-if="ticket.customer_phone2"> / {{ ticket.customer_phone2 }}</span>
                </div>
                <div><span class="font-bold">المنطقة:</span> {{ ticket.customer_area || '—' }}</div>
                <div>
                  <span class="font-bold">العنوان:</span> {{ ticket.customer_address || '—' }}
                </div>
              </div>
            </div>

            <div class="border border-slate-300 rounded-xl p-3.5 bg-slate-50/60">
              <h4 class="font-bold text-slate-900 border-b border-slate-200 pb-1.5 mb-2 text-xs">
                🔌 بيانات {{ t('device') }}
              </h4>
              <div class="space-y-1 text-xs">
                <div>
                  <span class="font-bold">{{ t('deviceType') }}:</span> {{ ticket.appliance_type }}
                </div>
                <div><span class="font-bold">الماركة:</span> {{ ticket.brand }}</div>
                <div><span class="font-bold">الموديل:</span> {{ ticket.model || '—' }}</div>
                <div>
                  <span class="font-bold">السيريال (S/N):</span> {{ ticket.serial_number || '—' }}
                </div>
                <div>
                  <span class="font-bold">الفني المسؤول:</span>
                  {{ ticket.technician_name || 'لم يحدد' }}
                </div>
                <div
                  v-for="item in extraEntries"
                  :key="item.key"
                  class="text-slate-800"
                >
                  <span class="font-bold">{{ item.label }}:</span> {{ item.value }}
                </div>
              </div>
            </div>
          </div>

          <!-- Complaint & Technical Diagnosis -->
          <div class="border border-slate-300 rounded-xl p-3.5 mb-5 space-y-2 text-xs">
            <div>
              <span class="font-bold text-slate-900">شكوى العميل / العطل المبلّغ عنه: </span>
              <span class="text-slate-700">{{ ticket.complaint }}</span>
            </div>
            <div v-if="ticket.diagnosis" class="pt-1 border-t border-slate-200">
              <span class="font-bold text-slate-900">التقرير الفني والإجراء المتخذ: </span>
              <span class="text-slate-700">{{ ticket.diagnosis }}</span>
            </div>
          </div>

          <!-- Spare Parts Table (Shown if invoice_warranty or if parts exist) -->
          <div
            v-if="ticket.parts && ticket.parts.length > 0"
            class="mb-5 border border-slate-300 rounded-xl overflow-hidden"
          >
            <table class="w-full text-right text-xs border-collapse">
              <thead class="bg-slate-800 text-white">
                <tr>
                  <th class="py-2 px-3">#</th>
                  <th class="py-2 px-3">كود {{ t('part') }}</th>
                  <th class="py-2 px-3">بيان {{ t('part') }}</th>
                  <th class="py-2 px-3">الكمية</th>
                  <th class="py-2 px-3">سعر الوحدة</th>
                  <th class="py-2 px-3">الإجمالي</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                <tr v-for="(item, idx) in ticket.parts" :key="idx">
                  <td class="py-2 px-3 font-semibold">{{ idx + 1 }}</td>
                  <td class="py-2 px-3 font-mono">{{ item.part_code }}</td>
                  <td class="py-2 px-3 font-bold">{{ item.part_name }}</td>
                  <td class="py-2 px-3">{{ item.quantity }}</td>
                  <td class="py-2 px-3">{{ item.unit_price }} ج.م</td>
                  <td class="py-2 px-3 font-bold">{{ item.total_price }} ج.م</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Financial Summary & Warranty Certificate Box -->
          <div class="grid grid-cols-2 gap-4 mb-5">
            <!-- Warranty Certificate Box -->
            <div
              class="border-2 border-slate-800 rounded-xl p-4 bg-slate-50 flex flex-col justify-between"
            >
              <div>
                <div class="flex items-center justify-between border-b border-slate-300 pb-2 mb-2">
                  <h4 class="font-black text-sm text-slate-900">🛡️ شهادة الضمان المعتمدة</h4>
                  <span
                    class="px-2.5 py-0.5 rounded-full text-xs font-bold border border-slate-800"
                  >
                    {{
                      ticket.warranty_months > 0
                        ? `ضمان ${ticket.warranty_months} شهور`
                        : 'بدون ضمان'
                    }}
                  </span>
                </div>
                <div
                  v-if="ticket.warranty_months > 0"
                  class="grid grid-cols-2 gap-2 text-xs font-bold text-slate-800 mb-2"
                >
                  <div>بداية الضمان: {{ ticket.warranty_start_date || 'تاريخ التسليم' }}</div>
                  <div>نهاية الضمان: {{ ticket.warranty_end_date || '—' }}</div>
                </div>
                <p class="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">
                  {{ settings.warranty_terms }}
                </p>
              </div>
            </div>

            <!-- Financial Totals Box -->
            <div class="border border-slate-300 rounded-xl p-4 space-y-1.5 text-xs">
              <div class="flex justify-between">
                <span class="text-slate-600">رسوم الكشف والزيارة:</span>
                <span class="font-bold">{{ ticket.inspection_fee }} ج.م</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-600">تكلفة المصنعية والإصلاح:</span>
                <span class="font-bold">{{ ticket.labor_cost }} ج.م</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-600">إجمالي {{ t('parts') }}:</span>
                <span class="font-bold">{{ ticket.parts_total }} ج.م</span>
              </div>
              <div v-if="ticket.discount > 0" class="flex justify-between text-emerald-700">
                <span>خصم خاص:</span>
                <span class="font-bold">- {{ ticket.discount }} ج.م</span>
              </div>
              <div
                class="flex justify-between border-t-2 border-slate-800 pt-2 text-sm font-black text-slate-900"
              >
                <span>الإجمالي النهائي:</span>
                <span>{{ ticket.total_amount }} ج.م</span>
              </div>
              <div class="flex justify-between text-slate-700 pt-1">
                <span>المبلغ المدفوع ({{ PAYMENT_METHODS[ticket.payment_method] || 'كاش' }}):</span>
                <span class="font-bold">{{ ticket.paid_amount }} ج.م</span>
              </div>
              <div class="flex justify-between font-black text-slate-900">
                <span>المبلغ المتبقي:</span>
                <span>{{ ticket.remaining_amount }} ج.م</span>
              </div>
            </div>
          </div>

          <!-- Signatures & Footer -->
          <div class="grid grid-cols-3 gap-4 pt-4 border-t border-slate-300 text-center text-xs">
            <div>
              <p class="font-bold text-slate-700 mb-6">توقيع الفني المسؤول</p>
              <p class="text-slate-400">....................................</p>
            </div>
            <div>
              <p class="font-bold text-slate-700 mb-6">ختم المركز المعتمد</p>
              <p class="text-slate-400">....................................</p>
            </div>
            <div>
              <p class="font-bold text-slate-700 mb-6">توقيع العميل بالاستلام</p>
              <p class="text-slate-400">....................................</p>
            </div>
          </div>

          <div class="mt-4 pt-2 border-t border-dashed border-slate-300 text-center text-xs font-bold text-slate-600">
            {{ settings.receipt_footer }}
          </div>
        </div>

        <!-- ======================================================= -->
        <!-- TEMPLATE 2: THERMAL 80MM RECEIPT                        -->
        <!-- ======================================================= -->
        <div
          v-else-if="ticket"
          id="printable-area"
          dir="rtl"
          class="bg-white text-black w-[80mm] p-3.5 rounded-lg shadow-lg border border-slate-300 text-xs font-sans"
        >
          <!-- Center Header -->
          <div class="text-center border-b border-dashed border-black pb-2 mb-2">
            <img
              v-if="settings.logo_base64"
              :src="settings.logo_base64"
              alt="Logo"
              class="w-12 h-12 mx-auto mb-1 object-contain"
            />
            <div class="font-black text-sm">{{ settings.center_name }}</div>
            <div class="text-[10px] text-slate-700">{{ settings.address }}</div>
            <div class="text-[11px] font-bold mt-0.5">
              ت: {{ settings.phone1 }} <span v-if="settings.phone2">/ {{ settings.phone2 }}</span>
            </div>
          </div>

          <!-- Ticket Badge -->
          <div class="text-center bg-slate-100 border border-black rounded py-1 mb-2">
            <div class="text-[10px] font-bold">
              {{
                appStore.activePrintDocType === 'invoice_warranty'
                  ? 'فاتورة صيانة وشهادة ضمان'
                  : 'إيصال استلام / أمر شغل'
              }}
            </div>
            <div class="font-black text-sm">{{ ticket.ticket_number }}</div>
            <div class="text-[10px]">
              {{ ticket.created_at?.slice(0, 16) || ticket.scheduled_date }}
            </div>
          </div>

          <!-- Customer & Device Details -->
          <div class="space-y-1 border-b border-dashed border-black pb-2 mb-2 text-[11px]">
            <div><span class="font-bold">العميل:</span> {{ ticket.customer_name }}</div>
            <div><span class="font-bold">الموبايل:</span> {{ ticket.customer_phone }}</div>
            <div v-if="ticket.customer_area">
              <span class="font-bold">المنطقة:</span> {{ ticket.customer_area }} -
              {{ ticket.customer_address }}
            </div>
            <div>
              <span class="font-bold">{{ t('device') }}:</span> {{ ticket.appliance_type }} ({{
                ticket.brand
              }})
            </div>
            <div v-if="ticket.model">
              <span class="font-bold">الموديل:</span> {{ ticket.model }}
            </div>
            <div v-for="item in extraEntries" :key="item.key">
              <span class="font-bold">{{ item.label }}:</span> {{ item.value }}
            </div>
            <div>
              <span class="font-bold">الخدمة:</span>
              {{ ticket.service_type === 'home_visit' ? 'زيارة منزلية' : 'ورشة المركز' }}
            </div>
            <div>
              <span class="font-bold">الحالة:</span>
              {{ TICKET_STATUS_MAP[ticket.status]?.label || ticket.status }}
            </div>
            <div>
              <span class="font-bold">الفني:</span> {{ ticket.technician_name || '—' }}
            </div>
          </div>

          <!-- Complaint & Diagnosis -->
          <div class="space-y-1 border-b border-dashed border-black pb-2 mb-2 text-[11px]">
            <div><span class="font-bold">الشكوى:</span> {{ ticket.complaint }}</div>
            <div v-if="ticket.diagnosis">
              <span class="font-bold">الإصلاح:</span> {{ ticket.diagnosis }}
            </div>
          </div>

          <!-- Parts List -->
          <div
            v-if="ticket.parts && ticket.parts.length > 0"
            class="border-b border-dashed border-black pb-2 mb-2"
          >
            <div class="font-bold text-[11px] mb-1">{{ t('parts') }}:</div>
            <div
              v-for="(p, idx) in ticket.parts"
              :key="idx"
              class="flex justify-between text-[10px] py-0.5"
            >
              <span>{{ p.part_name }} (×{{ p.quantity }})</span>
              <span class="font-bold">{{ p.total_price }} ج.م</span>
            </div>
          </div>

          <!-- Totals -->
          <div class="space-y-1 border-b border-dashed border-black pb-2 mb-2 text-[11px]">
            <div class="flex justify-between">
              <span>رسوم الكشف:</span>
              <span>{{ ticket.inspection_fee }} ج.م</span>
            </div>
            <div class="flex justify-between">
              <span>المصنعية:</span>
              <span>{{ ticket.labor_cost }} ج.م</span>
            </div>
            <div v-if="ticket.parts_total > 0" class="flex justify-between">
              <span>{{ t('parts') }}:</span>
              <span>{{ ticket.parts_total }} ج.م</span>
            </div>
            <div v-if="ticket.discount > 0" class="flex justify-between">
              <span>الخصم:</span>
              <span>- {{ ticket.discount }} ج.م</span>
            </div>
            <div class="flex justify-between font-black text-xs border-t border-black pt-1">
              <span>الإجمالي:</span>
              <span>{{ ticket.total_amount }} ج.م</span>
            </div>
            <div class="flex justify-between">
              <span>المدفوع:</span>
              <span class="font-bold">{{ ticket.paid_amount }} ج.م</span>
            </div>
            <div class="flex justify-between font-black">
              <span>المتبقي:</span>
              <span>{{ ticket.remaining_amount }} ج.م</span>
            </div>
          </div>

          <!-- Warranty Info -->
          <div
            v-if="ticket.warranty_months > 0"
            class="border border-black rounded p-1.5 text-center mb-2 text-[10px]"
          >
            <div class="font-black">🛡️ ضمان معتمد لمدة {{ ticket.warranty_months }} شهور</div>
            <div v-if="ticket.warranty_end_date">ساري حتى: {{ ticket.warranty_end_date }}</div>
          </div>

          <div class="text-center text-[10px] font-bold pt-1">
            {{ settings.receipt_footer }}
          </div>
        </div>

        <!-- ======================================================= -->
        <!-- HEARING TEST & AUDIOGRAM OFFICIAL REPORT (A4)           -->
        <!-- ======================================================= -->
        <template v-else-if="hearingTest">
          <div
            id="printable-area"
            dir="rtl"
            class="bg-white text-slate-900 w-full max-w-[210mm] p-8 rounded-xl shadow-lg border border-slate-300 text-xs space-y-4"
          >
            <!-- Center Header -->
            <div class="flex items-start justify-between border-b-2 border-slate-800 pb-3">
              <div class="space-y-1">
                <div class="flex items-center gap-3">
                  <img
                    v-if="settings.logo_base64"
                    :src="settings.logo_base64"
                    alt="Logo"
                    class="w-14 h-14 object-contain rounded-lg border border-slate-200"
                  />
                  <div>
                    <h1 class="text-2xl font-black text-slate-900">{{ settings.center_name }}</h1>
                    <p class="text-xs text-slate-600 font-semibold max-w-md">
                      {{ settings.center_subtitle }}
                    </p>
                  </div>
                </div>
                <p class="text-[11px] text-slate-700">📍 {{ settings.address }} | 📞 {{ settings.phone1 }}</p>
              </div>

              <div class="text-left bg-slate-100 border border-slate-300 rounded-xl p-3 min-w-[200px]">
                <div class="text-xs font-black text-slate-700">تقرير فحص وقياس السمع (Audiogram)</div>
                <div class="text-base font-black text-slate-900 font-mono mt-0.5">
                  {{ hearingTest.test_number }}
                </div>
                <div class="text-[11px] text-slate-600 mt-0.5">
                  تاريخ الفحص: {{ hearingTest.test_date }}
                </div>
              </div>
            </div>

            <!-- Patient Info Box -->
            <div class="border border-slate-300 rounded-xl p-3 bg-slate-50 grid grid-cols-3 gap-2">
              <div>
                <span class="font-bold text-slate-600">اسم المريض: </span>
                <span class="font-black text-slate-900">{{ hearingTest.patient_name || '—' }}</span>
              </div>
              <div>
                <span class="font-bold text-slate-600">رقم الهاتف: </span>
                <span class="font-mono font-bold">{{ hearingTest.patient_phone || '—' }}</span>
              </div>
              <div>
                <span class="font-bold text-slate-600">الأخصائي الفاحص: </span>
                <span class="font-bold">{{ hearingTest.examiner_name || 'أخصائي السمعيات' }}</span>
              </div>
            </div>

            <!-- Side-by-Side Audiogram Charts (Right Ear & Left Ear) -->
            <div class="grid grid-cols-2 gap-4">
              <div class="border border-red-300 rounded-xl p-2.5">
                <div class="text-center font-black text-red-700 mb-1.5">
                  الأذن اليمنى — Right Ear (O)
                  <span v-if="hearingTest.pta_right !== null" class="font-mono mr-2">
                    [PTA: {{ hearingTest.pta_right }} dB]
                  </span>
                </div>
                <AudiogramChart
                  :model-value="hearingTest.points || []"
                  filter-ear="right"
                  readonly
                  compact
                />
              </div>

              <div class="border border-blue-300 rounded-xl p-2.5">
                <div class="text-center font-black text-blue-700 mb-1.5">
                  الأذن اليسرى — Left Ear (X)
                  <span v-if="hearingTest.pta_left !== null" class="font-mono mr-2">
                    [PTA: {{ hearingTest.pta_left }} dB]
                  </span>
                </div>
                <AudiogramChart
                  :model-value="hearingTest.points || []"
                  filter-ear="left"
                  readonly
                  compact
                />
              </div>
            </div>

            <!-- Thresholds Numeric Table -->
            <div class="border border-slate-300 rounded-xl overflow-hidden">
              <table class="w-full text-center text-[11px] border-collapse">
                <thead class="bg-slate-800 text-white">
                  <tr>
                    <th class="py-1.5 px-2 text-right">الأذن / التوصيل</th>
                    <th v-for="freq in FREQUENCIES" :key="freq" class="py-1.5 px-2 font-mono">
                      {{ freq }} Hz
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                  <tr>
                    <td class="py-1.5 px-2 text-right font-bold text-red-700">يمين — هوائي (Air R)</td>
                    <td v-for="freq in FREQUENCIES" :key="`pr-ra-${freq}`" class="py-1.5 px-2 font-mono font-bold">
                      {{ getTestPointText('right', 'air', freq) }}
                    </td>
                  </tr>
                  <tr class="bg-slate-50">
                    <td class="py-1.5 px-2 text-right font-bold text-red-700">يمين — عظمي (Bone R)</td>
                    <td v-for="freq in FREQUENCIES" :key="`pr-rb-${freq}`" class="py-1.5 px-2 font-mono">
                      {{ getTestPointText('right', 'bone', freq) }}
                    </td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-2 text-right font-bold text-blue-700">يسار — هوائي (Air L)</td>
                    <td v-for="freq in FREQUENCIES" :key="`pr-la-${freq}`" class="py-1.5 px-2 font-mono font-bold">
                      {{ getTestPointText('left', 'air', freq) }}
                    </td>
                  </tr>
                  <tr class="bg-slate-50">
                    <td class="py-1.5 px-2 text-right font-bold text-blue-700">يسار — عظمي (Bone L)</td>
                    <td v-for="freq in FREQUENCIES" :key="`pr-lb-${freq}`" class="py-1.5 px-2 font-mono">
                      {{ getTestPointText('left', 'bone', freq) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Speech Audiometry & Tympanometry & Diagnosis Table -->
            <div class="grid grid-cols-2 gap-4">
              <div class="border border-slate-300 rounded-xl p-3 space-y-1.5">
                <div class="font-black text-red-700 border-b border-slate-200 pb-1">
                  تشخيص ونتائج الأذن اليمنى (Right)
                </div>
                <div class="flex justify-between">
                  <span>متوسط السمع (PTA):</span>
                  <span class="font-mono font-bold">{{ hearingTest.pta_right ?? '—' }} dB</span>
                </div>
                <div class="flex justify-between">
                  <span>عتبة الكلام (SRT) / التمييز (SDS):</span>
                  <span class="font-mono font-bold">
                    {{ hearingTest.srt_right ?? '—' }} dB / {{ hearingTest.sds_right ?? '—' }}%
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>ضغط الأذن الوسطى (Tymp):</span>
                  <span class="font-bold">{{ hearingTest.tymp_right || '—' }}</span>
                </div>
                <div class="flex justify-between">
                  <span>نوع ودرجة الفقد:</span>
                  <span class="font-black">
                    {{ hearingTest.loss_type_right || '—' }} — {{ hearingTest.loss_degree_right || '—' }}
                  </span>
                </div>
              </div>

              <div class="border border-slate-300 rounded-xl p-3 space-y-1.5">
                <div class="font-black text-blue-700 border-b border-slate-200 pb-1">
                  تشخيص ونتائج الأذن اليسرى (Left)
                </div>
                <div class="flex justify-between">
                  <span>متوسط السمع (PTA):</span>
                  <span class="font-mono font-bold">{{ hearingTest.pta_left ?? '—' }} dB</span>
                </div>
                <div class="flex justify-between">
                  <span>عتبة الكلام (SRT) / التمييز (SDS):</span>
                  <span class="font-mono font-bold">
                    {{ hearingTest.srt_left ?? '—' }} dB / {{ hearingTest.sds_left ?? '—' }}%
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>ضغط الأذن الوسطى (Tymp):</span>
                  <span class="font-bold">{{ hearingTest.tymp_left || '—' }}</span>
                </div>
                <div class="flex justify-between">
                  <span>نوع ودرجة الفقد:</span>
                  <span class="font-black">
                    {{ hearingTest.loss_type_left || '—' }} — {{ hearingTest.loss_degree_left || '—' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Recommendation & Clinical Notes -->
            <div
              v-if="hearingTest.recommended_product_name || hearingTest.recommendation_notes || hearingTest.notes"
              class="border border-slate-300 rounded-xl p-3 bg-slate-50 space-y-1"
            >
              <div v-if="hearingTest.recommended_product_name" class="font-black">
                💡 السماعة الموصى بها: {{ hearingTest.recommended_product_name }}
              </div>
              <div v-if="hearingTest.recommendation_notes">
                <strong>تفاصيل التوصية:</strong> {{ hearingTest.recommendation_notes }}
              </div>
              <div v-if="hearingTest.notes">
                <strong>ملاحظات سريرية:</strong> {{ hearingTest.notes }}
              </div>
            </div>

            <!-- Signatures & Footer -->
            <div class="grid grid-cols-2 gap-8 pt-4 border-t border-slate-300 text-center">
              <div>
                <p class="font-bold">توقيع أخصائي السمعيات</p>
                <p class="text-slate-400 mt-5">........................................</p>
              </div>
              <div>
                <p class="font-bold">ختم المركز المعتمد</p>
                <p class="text-slate-400 mt-5">........................................</p>
              </div>
            </div>
          </div>
        </template>

        <!-- ======================================================= -->
        <!-- EARMOLD ORDER / LAB WORK ORDER RECEIPT                  -->
        <!-- ======================================================= -->
        <template v-else-if="earmold">
          <div
            id="printable-area"
            dir="rtl"
            class="bg-white text-slate-900 w-full max-w-[210mm] p-8 rounded-xl shadow-lg border border-slate-300 text-xs space-y-4"
          >
            <div class="flex items-start justify-between border-b-2 border-slate-800 pb-3">
              <div>
                <h1 class="text-xl font-black">{{ settings.center_name }}</h1>
                <p class="text-slate-600">{{ settings.center_subtitle }}</p>
                <p class="text-[11px] mt-1">📞 {{ settings.phone1 }} | 📍 {{ settings.address }}</p>
              </div>
              <div class="text-left bg-slate-100 border border-slate-300 rounded-xl p-3">
                <div class="font-black">أمر شغل / إيصال قالب أذن (Earmold)</div>
                <div class="text-base font-black font-mono mt-0.5">{{ earmold.order_number }}</div>
                <div class="text-[11px] text-slate-600">تاريخ المقاس: {{ earmold.impression_date }}</div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 border border-slate-300 rounded-xl p-3.5 bg-slate-50">
              <div><strong>اسم المريض:</strong> {{ earmold.patient_name || '—' }}</div>
              <div><strong>رقم الهاتف:</strong> <span class="font-mono">{{ earmold.patient_phone || '—' }}</span></div>
              <div>
                <strong>جهة الأذن:</strong>
                {{
                  earmold.ear === 'bilateral'
                    ? 'الأذنين معاً (Bilateral)'
                    : earmold.ear === 'left'
                      ? 'يسار (Left)'
                      : 'يمين (Right)'
                }}
              </div>
              <div><strong>اسم المعمل:</strong> {{ earmold.lab_name || '—' }}</div>
              <div><strong>نوع القالب:</strong> {{ earmold.mold_type || '—' }}</div>
              <div><strong>مادة الصنع:</strong> {{ earmold.material || '—' }}</div>
              <div><strong>اللون:</strong> {{ earmold.color || 'شفاف' }}</div>
              <div><strong>فتحة التهوية (Vent):</strong> {{ earmold.vent_size || 'بدون' }}</div>
              <div><strong>نوع التيوب:</strong> {{ earmold.tube_type || 'عادي' }}</div>
              <div><strong>تاريخ التسليم المتوقع:</strong> {{ earmold.expected_date || '—' }}</div>
            </div>

            <div v-if="earmold.notes" class="border border-slate-300 rounded-xl p-3">
              <strong>ملاحظات فنية للمعمل:</strong> {{ earmold.notes }}
            </div>

            <div class="flex justify-between items-center border-t border-slate-300 pt-3 font-bold">
              <span>قيمة القالب على المريض: {{ earmold.customer_price }} ج.م</span>
              <span>{{ settings.receipt_footer }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
