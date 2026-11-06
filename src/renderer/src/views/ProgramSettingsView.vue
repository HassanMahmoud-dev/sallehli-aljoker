<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import type { BusinessType } from '@shared/types'
import { BUSINESS_PROFILES } from '@shared/businessProfiles'
import SuperAdminView from './SuperAdminView.vue'
import SystemControlView from './SystemControlView.vue'
import {
  Layers,
  Users,
  Server,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RefreshCw,
  Database,
  ArrowRightLeft,
  Sparkles,
  ShieldAlert,
  Wrench,
  Ear,
  ShoppingBag,
  PackageCheck
} from 'lucide-vue-next'

const route = useRoute()
const appStore = useAppStore()
const { t } = useTerms()

type ActiveTab = 'business' | 'users' | 'system'
const activeTab = ref<ActiveTab>((route.query.tab as ActiveTab) || 'business')

// Business State Form
const selectedBusinessType = ref<BusinessType>('appliances')
const adminPassword = ref('')
const isSwitching = ref(false)
const dataCheck = ref<{ empty: boolean; counts: Record<string, number>; total: number }>({
  empty: true,
  counts: {},
  total: 0
})

const currentProfile = computed(() => appStore.businessProfile)
const availableProfiles = computed(() => Object.values(BUSINESS_PROFILES))

const licensedModulesList = ref<string[]>([])
const isSavingModules = ref(false)

watch(
  () => appStore.businessState.licensedModules,
  (mods) => {
    licensedModulesList.value = mods ? [...mods] : []
  },
  { immediate: true }
)

function toggleAddonModule(modKey: string) {
  if (licensedModulesList.value.includes(modKey)) {
    licensedModulesList.value = licensedModulesList.value.filter((m) => m !== modKey)
  } else {
    licensedModulesList.value.push(modKey)
  }
}

async function handleSaveLicensedModules(): Promise<void> {
  try {
    isSavingModules.value = true
    const res = await window.api.setLicensedModules(licensedModulesList.value)
    appStore.businessState = res.state
    swalSuccess('تم حفظ الوحدات المرخصة بنجاح!', 'تم تحديث الوحدات الفعالة وصلاحيات الوصول فوراً.')
  } catch (err: any) {
    swalError('فشل حفظ الوحدات', err?.message || 'حدث خطأ أثناء حفظ الوحدات المرخصة.')
  } finally {
    isSavingModules.value = false
  }
}

async function refreshBusinessData(): Promise<void> {
  await appStore.loadBusiness()
  selectedBusinessType.value = appStore.businessType
  try {
    const res = await window.api.checkBusinessSwitch()
    dataCheck.value = res
  } catch (err) {
    console.error('Failed to inspect database records', err)
  }
}

async function handleSetInitial(type: BusinessType): Promise<void> {
  const profile = BUSINESS_PROFILES[type]
  const confirmed = await swalConfirm(
    `تأكيد اختيار نشاط (${profile.appName})`,
    `سيتم تهيئة النظام للعمل كـ "${profile.windowTitle}". يمكنك البدء فوراً في إدخال البيانات.`
  )
  if (!confirmed) return

  try {
    await appStore.withLoading(async () => {
      const state = await window.api.setInitialBusiness(type)
      appStore.businessState = state
      await appStore.loadSettings()
    }, 'جاري تهيئة نشاط النظام...')
    swalSuccess('تم ضبط نشاط النظام بنجاح!', 'تم تحديث المصطلحات وإعدادات المركز تلقائياً.')
    await refreshBusinessData()
  } catch (err: any) {
    swalError('فشل ضبط النشاط', err?.message || 'حدث خطأ أثناء ضبط النشاط الأولي.')
  }
}

async function handleSwitchBusiness(): Promise<void> {
  if (selectedBusinessType.value === appStore.businessType && !appStore.isBusinessLocked) {
    return
  }

  const targetProfile = BUSINESS_PROFILES[selectedBusinessType.value]

  if (dataCheck.value.empty && !appStore.isBusinessLocked) {
    const confirmed = await swalConfirm(
      `تأكيد التبديل إلى (${targetProfile.appName})`,
      `قاعدة البيانات فارغة تماماً من سجلات العملاء والعمليات. هل تريد بالتأكيد التبديل إلى نشاط "${targetProfile.appName} - ${targetProfile.loginSubtitle}"؟`
    )
    if (!confirmed) return

    try {
      await appStore.withLoading(async () => {
        const state = await window.api.switchBusiness({ type: selectedBusinessType.value })
        appStore.businessState = state
        await appStore.loadSettings()
      }, 'جاري تبديل النشاط...')
      swalSuccess('تم تبديل النشاط بنجاح!', 'تم تفعيل النشاط الجديد وتحديث واجهة البرنامج.')
      window.location.reload()
    } catch (err: any) {
      swalError('فشل تبديل النشاط', err?.message || 'حدث خطأ أثناء عملية التبديل.')
    }
    return
  }

  // Database HAS data or system is locked: Require confirmation and SuperAdmin Password
  if (!adminPassword.value.trim()) {
    swalError(
      'كلمة المرور مطلوبة',
      'يلزم كتابة كلمة مرور السوبر أدمن لتأكيد العملية وإعادة توقيع النشاط.'
    )
    return
  }

  const confirmed = await swalConfirm(
    appStore.isBusinessLocked
      ? `تأكيد إعادة توقيع وتفعيل نشاط (${targetProfile.appName})`
      : `تحذير: توجد بيانات سابقة (${dataCheck.value.total} سجل)`,
    appStore.isBusinessLocked
      ? `سيتم التحقق من كلمة المرور وإعادة توقيع نشاط "${targetProfile.appName}" لإلغاء قفل النظام.`
      : `سيتم أخذ نسخة احتياطية تلقائية كاملة فوراً قبل التبديل. سيتم تكييف مصطلحات وعرض البرنامج لنشاط "${targetProfile.appName}". هل أنت متأكد من المتابعة؟`
  )
  if (!confirmed) return

  isSwitching.value = true
  try {
    await appStore.withLoading(async () => {
      const state = await window.api.switchBusiness({
        type: selectedBusinessType.value,
        password: adminPassword.value.trim()
      })
      appStore.businessState = state
      await appStore.loadSettings()
    }, 'جاري أخذ نسخة احتياطية وتبديل نشاط النظام...')

    adminPassword.value = ''
    swalSuccess(
      'تم تبديل النشاط بنجاح!',
      'تم أخذ نسخة احتياطية آمنة، وجاري إعادة تحميل النظام بالنشاط الجديد.'
    )
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  } catch (err: any) {
    swalError('تعذر تبديل النشاط', err?.message || 'فشلت عملية التحقق أو النسخ الاحتياطي.')
  } finally {
    isSwitching.value = false
  }
}

onMounted(async () => {
  await refreshBusinessData()
})
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div
      class="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      <div>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-purple-600/10 text-purple-600 dark:text-purple-400 rounded-xl">
            <Layers class="w-7 h-7" />
          </div>
          <div>
            <h1 class="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              إعدادات البرنامج الرئيسية
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 font-semibold">
                خاصة بالسوبر أدمن
              </span>
            </h1>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
              إدارة نوع نشاط البرنامج، التراخيص والمستخدمين، وإعدادات الشبكة المحلية وخادم المتصفح.
            </p>
          </div>
        </div>
      </div>

      <!-- Quick Status Badges -->
      <div class="flex items-center gap-3 flex-wrap">
        <div
          v-if="appStore.isBusinessLocked"
          class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-sm font-semibold"
        >
          <ShieldAlert class="w-4 h-4 text-rose-600" />
          نشاط النظام مقفل للتلاعب
        </div>
        <div
          v-else
          class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-sm font-semibold"
        >
          <CheckCircle2 class="w-4 h-4 text-emerald-600" />
          النشاط الحالي: {{ currentProfile.appName }}
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
      <button
        @click="activeTab = 'business'"
        :class="[
          'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
          activeTab === 'business'
            ? 'bg-purple-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        ]"
      >
        <Layers class="w-4 h-4" />
        نوع النشاط والقطاع
      </button>

      <button
        @click="activeTab = 'users'"
        :class="[
          'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
          activeTab === 'users'
            ? 'bg-purple-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        ]"
      >
        <Users class="w-4 h-4" />
        لوحة السوبر أدمن والتراخيص
      </button>

      <button
        @click="activeTab = 'system'"
        :class="[
          'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
          activeTab === 'system'
            ? 'bg-purple-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        ]"
      >
        <Server class="w-4 h-4" />
        الشبكة والنظام والتشغيل
      </button>
    </div>

    <!-- Tab 1: Business Activity Configuration -->
    <div v-if="activeTab === 'business'" class="space-y-6">
      <!-- Tampered Signature Alert -->
      <div
        v-if="appStore.isBusinessLocked"
        class="p-5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-4"
      >
        <AlertTriangle class="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
        <div class="space-y-1">
          <h3 class="text-base font-bold text-rose-900 dark:text-rose-200">
            تم اكتشاف تلاعب غير مصرح به في توقيع نشاط البرنامج!
          </h3>
          <p class="text-sm text-rose-700 dark:text-rose-300 leading-relaxed">
            تم تعديل قيمة نشاط البرنامج في قاعدة البيانات مباشرة بدون توقيع رقمي صالح. لحماية البيانات تم تعليق بعض العمليات.
            يمكن للسوبر أدمن إعادة اختيار وتأكيد النشاط أدناه مع إدخال كلمة المرور لاستعادة التوقيع الرقمي السليم.
          </p>
        </div>
      </div>

      <!-- Initial Setup Banner if needsSetup -->
      <div
        v-if="appStore.needsBusinessSetup"
        class="p-5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-start gap-4"
      >
        <Sparkles class="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
        <div class="space-y-1">
          <h3 class="text-base font-bold text-amber-900 dark:text-amber-200">
            تثبيت جديد: يرجى تحديد نشاط البرنامج أولاً
          </h3>
          <p class="text-sm text-amber-700 dark:text-amber-300">
            هذا أول تشغيل للبرنامج. اختر النشاط الذي ترغب في اعتماده لهذا الجهاز لتهيئة النظام والقوائم المناسبة.
          </p>
        </div>
      </div>

      <!-- Business Selection Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Option 1: Appliances Maintenance -->
        <div
          @click="selectedBusinessType = 'appliances'"
          :class="[
            'cursor-pointer relative p-6 rounded-2xl border-2 transition-all duration-200 bg-white dark:bg-slate-800 flex flex-col justify-between gap-4 shadow-sm hover:shadow',
            selectedBusinessType === 'appliances'
              ? 'border-purple-600 ring-4 ring-purple-600/10'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
          ]"
        >
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
                <Wrench class="w-6 h-6" />
              </div>
              <span
                v-if="appStore.businessType === 'appliances' && !appStore.needsBusinessSetup"
                class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
              >
                النشاط النشط حالياً
              </span>
            </div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">
              {{ BUSINESS_PROFILES.appliances.appName }} - مراكز صيانة الأجهزة المنزلية والكهربائية
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {{ BUSINESS_PROFILES.appliances.centerSubtitleDefault }} ({{ BUSINESS_PROFILES.appliances.defaultDeviceTypes.slice(0, 4).join('، ') }} وغيرها).
            </p>
          </div>

          <div class="border-t border-slate-100 dark:border-slate-700/60 pt-3 text-xs text-slate-500 space-y-1">
            <div><strong class="text-slate-700 dark:text-slate-300">مصطلح الجهاز:</strong> جهاز / أجهزة</div>
            <div><strong class="text-slate-700 dark:text-slate-300">قطع الغيار:</strong> قطع غيار ومستهلكات صيانة</div>
            <div><strong class="text-slate-700 dark:text-slate-300">الطلبات:</strong> بلاغات وطلبات صيانة منزلية وورشة</div>
          </div>
        </div>

        <!-- Option 2: Hearing Aids Center -->
        <div
          @click="selectedBusinessType = 'hearing_aids'"
          :class="[
            'cursor-pointer relative p-6 rounded-2xl border-2 transition-all duration-200 bg-white dark:bg-slate-800 flex flex-col justify-between gap-4 shadow-sm hover:shadow',
            selectedBusinessType === 'hearing_aids'
              ? 'border-purple-600 ring-4 ring-purple-600/10'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
          ]"
        >
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
                <Ear class="w-6 h-6" />
              </div>
              <span
                v-if="appStore.businessType === 'hearing_aids' && !appStore.needsBusinessSetup"
                class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
              >
                النشاط النشط حالياً
              </span>
            </div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">
              {{ BUSINESS_PROFILES.hearing_aids.appName }} - مراكز وتوكيلات السماعات الطبية
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              مهيأ لمراكز بيع وتجهيز وصيانة السماعات الطبية، بطاريات وملحقات السمع، وفحوصات وضبط السماعات للمرضى.
            </p>
          </div>

          <div class="border-t border-slate-100 dark:border-slate-700/60 pt-3 text-xs text-slate-500 space-y-1">
            <div><strong class="text-slate-700 dark:text-slate-300">مصطلح الجهاز:</strong> سماعة طبية</div>
            <div><strong class="text-slate-700 dark:text-slate-300">الملحقات:</strong> بطاريات، قوالب، فلاتر، ملحقات</div>
            <div><strong class="text-slate-700 dark:text-slate-300">الطلبات:</strong> طلبات صيانة، فحص، وضبط وبرمجة</div>
          </div>
        </div>
      </div>

      <!-- Action Panel for Setup or Switch -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <!-- Initial Setup Action -->
        <div v-if="appStore.needsBusinessSetup">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-bold text-slate-900 dark:text-white">اعتماد النشاط الأولي</h4>
              <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                سيتم اعتماد "{{ BUSINESS_PROFILES[selectedBusinessType].appName }}" كنظام رئيسي لهذا الجهاز.
              </p>
            </div>
            <button
              @click="handleSetInitial(selectedBusinessType)"
              class="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
            >
              <CheckCircle2 class="w-4 h-4" />
              تأكيد وتفعيل النشاط
            </button>
          </div>
        </div>

        <!-- Normal Switch Action -->
        <div v-else>
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft class="w-5 h-5 text-purple-600" />
                تبديل نشاط البرنامج
              </h4>
              <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                النشاط الحالي: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ currentProfile.appName }}</span>
                | النشاط المختار للتبديل: <span class="font-semibold text-purple-600">{{ BUSINESS_PROFILES[selectedBusinessType].appName }}</span>
              </p>
            </div>

            <!-- If Data Empty & Not Locked: Smooth Switch -->
            <button
              v-if="selectedBusinessType !== appStore.businessType && dataCheck.empty && !appStore.isBusinessLocked"
              @click="handleSwitchBusiness"
              :disabled="isSwitching"
              class="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
            >
              <RefreshCw v-if="isSwitching" class="w-4 h-4 animate-spin" />
              <CheckCircle2 v-else class="w-4 h-4" />
              تأكيد التبديل (قاعدة البيانات فارغة)
            </button>
          </div>

          <!-- If Database HAS Data OR System is Locked: Show Password & Backup Warning -->
          <div
            v-if="(selectedBusinessType !== appStore.businessType && !dataCheck.empty) || appStore.isBusinessLocked"
            class="mt-5 p-5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4"
          >
            <div class="flex items-start gap-3">
              <Database class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h5 class="font-bold text-sm text-slate-900 dark:text-white">
                  {{
                    appStore.isBusinessLocked
                      ? 'إعادة توقيع نشاط النظام وإلغاء القفل الأمني'
                      : `توجد بيانات تشغيلية حالية في البرنامج (إجمالي ${dataCheck.total} سجل)`
                  }}
                </h5>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  العملاء: {{ dataCheck.counts.customers || 0 }} | البلاغات: {{ dataCheck.counts.maintenance_tickets || 0 }} | المخزن: {{ dataCheck.counts.spare_parts || 0 }} | الخزينة: {{ dataCheck.counts.treasury_transactions || 0 }}.
                  <br />
                  لحماية البيانات، يلزم إدخال كلمة مرور السوبر أدمن{{ !dataCheck.empty ? ' وسيقوم النظام تلقائياً بإنشاء نسخة احتياطية قبل التنفيذ' : '' }}.
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div class="md:col-span-2 space-y-1">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  إعادة كتابة كلمة مرور السوبر أدمن لتأكيد العملية:
                </label>
                <div class="relative">
                  <input
                    v-model="adminPassword"
                    type="password"
                    placeholder="أدخل كلمة مرور حساب admin الحالي..."
                    class="w-full px-3.5 py-2.5 pl-10 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
                  />
                  <Lock class="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <button
                  @click="handleSwitchBusiness"
                  :disabled="isSwitching || !adminPassword.trim()"
                  class="w-full px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <RefreshCw v-if="isSwitching" class="w-4 h-4 animate-spin" />
                  <Lock v-else class="w-4 h-4" />
                  {{
                    appStore.isBusinessLocked && selectedBusinessType === appStore.businessType
                      ? 'إعادة التوقيع وإلغاء القفل'
                      : 'أخذ نسخة احتياطية وتأكيد التبديل'
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Licensed Add-on Modules (Super Admin Control) -->
      <div
        v-if="!appStore.needsBusinessSetup && !appStore.isBusinessLocked"
        class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4"
      >
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h4 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PackageCheck class="w-5 h-5 text-indigo-600" />
              الوحدات الإضافية المرخصة (Add-on Modules)
            </h4>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              يمكن للسوبر أدمن ترخيص وتفعيل وحدات إضافية لهذا الجهاز بتوقيع رقمي محمي دون الحاجة لتغيير النشاط الأساسي.
            </p>
          </div>
          <button
            @click="handleSaveLicensedModules"
            :disabled="isSavingModules"
            class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2 shrink-0 self-start md:self-auto"
          >
            <RefreshCw v-if="isSavingModules" class="w-4 h-4 animate-spin" />
            <CheckCircle2 v-else class="w-4 h-4" />
            حفظ الوحدات المرخصة
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          <!-- Sales & POS -->
          <div
            @click="toggleAddonModule('sales')"
            :class="[
              'p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none',
              currentProfile.modules.includes('sales')
                ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-75 cursor-default'
                : licensedModulesList.includes('sales')
                ? 'bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
            ]"
          >
            <input
              type="checkbox"
              :checked="currentProfile.modules.includes('sales') || licensedModulesList.includes('sales')"
              :disabled="currentProfile.modules.includes('sales')"
              class="w-4 h-4 mt-0.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
              @click.stop="!currentProfile.modules.includes('sales') && toggleAddonModule('sales')"
            />
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShoppingBag class="w-4 h-4 text-emerald-600" />
                المبيعات وفواتير نقاط البيع (POS)
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ currentProfile.modules.includes('sales') ? 'مفعلة تلقائياً ضمن نشاط المركز الحالي' : 'إمكانية إصدار فواتير بيع سريع وتقسيط ومرتجعات' }}
              </p>
            </div>
          </div>

          <!-- Purchases & Suppliers -->
          <div
            @click="toggleAddonModule('purchases')"
            :class="[
              'p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none',
              currentProfile.modules.includes('purchases')
                ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-75 cursor-default'
                : licensedModulesList.includes('purchases')
                ? 'bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
            ]"
          >
            <input
              type="checkbox"
              :checked="currentProfile.modules.includes('purchases') || licensedModulesList.includes('purchases')"
              :disabled="currentProfile.modules.includes('purchases')"
              class="w-4 h-4 mt-0.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
              @click.stop="!currentProfile.modules.includes('purchases') && toggleAddonModule('purchases')"
            />
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers class="w-4 h-4 text-blue-600" />
                المشتريات والموردين
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ currentProfile.modules.includes('purchases') ? 'مفعلة تلقائياً ضمن نشاط المركز الحالي' : 'فواتير المشتريات وحسابات الموردين والأقساط' }}
              </p>
            </div>
          </div>

          <!-- Advanced Products & Barcodes -->
          <div
            @click="toggleAddonModule('products')"
            :class="[
              'p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none',
              currentProfile.modules.includes('products')
                ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-75 cursor-default'
                : licensedModulesList.includes('products')
                ? 'bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
            ]"
          >
            <input
              type="checkbox"
              :checked="currentProfile.modules.includes('products') || licensedModulesList.includes('products')"
              :disabled="currentProfile.modules.includes('products')"
              class="w-4 h-4 mt-0.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
              @click.stop="!currentProfile.modules.includes('products') && toggleAddonModule('products')"
            />
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Database class="w-4 h-4 text-purple-600" />
                المنتجات وسيريال الأجهزة
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ currentProfile.modules.includes('products') ? 'مفعلة تلقائياً ضمن نشاط المركز الحالي' : 'إدارة المنتجات والأصناف برقم باركود ورقم تسلسلي' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 2: Super Admin & Licenses Management (Embedded) -->
    <div v-if="activeTab === 'users'">
      <SuperAdminView />
    </div>

    <!-- Tab 3: System & LAN Control (Embedded) -->
    <div v-if="activeTab === 'system'">
      <SystemControlView />
    </div>
  </div>
</template>

