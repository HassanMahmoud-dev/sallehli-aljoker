<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import { TICKET_STATUS_MAP, PAYMENT_METHODS } from '@renderer/constants/appliances'
import { Printer, X, FileText, Receipt, ShieldCheck, Wrench } from 'lucide-vue-next'

const appStore = useAppStore()
const ticket = computed(() => appStore.ticketToPrint)
const settings = computed(() => appStore.settings)

function triggerPrint(): void {
  window.print()
}
</script>

<template>
  <div
    v-if="appStore.printModalOpen && ticket"
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
          <h3 class="font-bold text-lg text-slate-900 dark:text-white">
            معاينة الطباعة - طلب رقم {{ ticket.ticket_number }}
          </h3>
        </div>

        <!-- Template & Document Type Switchers -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Document Type -->
          <div class="flex rounded-xl bg-slate-200 dark:bg-slate-900 p-1 text-xs font-semibold">
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
        <!-- TEMPLATE 1: A4 / A5 OFFICIAL INVOICE & WARRANTY SHEET   -->
        <!-- ======================================================= -->
        <div
          v-if="appStore.activePrintFormat === 'a4'"
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
                🔌 بيانات الجهاز الكهربائي
              </h4>
              <div class="space-y-1 text-xs">
                <div>
                  <span class="font-bold">نوع الجهاز:</span> {{ ticket.appliance_type }}
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
                  <th class="py-2 px-3">كود القطعة</th>
                  <th class="py-2 px-3">بيان قطعة الغيار المستبدلة</th>
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
                <span class="text-slate-600">إجمالي قطع الغيار:</span>
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
          v-else
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
              <span class="font-bold">الجهاز:</span> {{ ticket.appliance_type }} ({{
                ticket.brand
              }})
            </div>
            <div v-if="ticket.model">
              <span class="font-bold">الموديل:</span> {{ ticket.model }}
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
            <div class="font-bold text-[11px] mb-1">قطع الغيار:</div>
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
              <span>قطع الغيار:</span>
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
      </div>
    </div>
  </div>
</template>
