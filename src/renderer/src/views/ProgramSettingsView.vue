<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import Swal from 'sweetalert2'
import type { BusinessType, DemoDataStatus } from '@shared/types'
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
  PackageCheck,
  Trash2,
  Eye,
  EyeOff,
  RotateCcw,
  HardDrive
} from 'lucide-vue-next'

const route = useRoute()
const appStore = useAppStore()
const { t } = useTerms()

type ActiveTab = 'business' | 'users' | 'system' | 'database'
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
  () => appStore.businessState?.licensedModules,
  (mods?: string[]) => {
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

const machineId = ref('')
const vendorLicenseToken = ref('')
const isApplyingLicense = ref(false)

async function loadMachineId(): Promise<void> {
  try {
    machineId.value = await window.api.getMachineId()
  } catch {
    machineId.value = ''
  }
}

async function handleApplyVendorLicense(): Promise<void> {
  const token = vendorLicenseToken.value.trim()
  if (!token) {
    swalError('الترخيص مطلوب', 'الصق نص ملف الترخيص الصادر من الشركة أولاً.')
    return
  }
  try {
    isApplyingLicense.value = true
    const res = await window.api.applyVendorLicense(token)
    appStore.businessState = res.state
    vendorLicenseToken.value = ''
    swalSuccess(
      'تم تفعيل الترخيص بنجاح!',
      `الوحدات المفعّلة: ${res.modules.join('، ') || 'لا يوجد'}${res.issuedTo ? ` — صادر إلى: ${res.issuedTo}` : ''}`
    )
  } catch (err: any) {
    swalError('فشل تفعيل الترخيص', err?.message || 'تعذر التحقق من الترخيص.')
  } finally {
    isApplyingLicense.value = false
  }
}

onMounted(loadMachineId)

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


// Demo Data & Database Reset State
const demoStatus = ref<DemoDataStatus>({
  isDemoHidden: false,
  hasDemoData: false,
  counts: {
    customers: 0,
    tickets: 0,
    spare_parts: 0,
    products: 0,
    suppliers: 0,
    sales: 0,
    purchases: 0,
    hearing_tests: 0,
    earmold_orders: 0,
    followups: 0,
    implants: 0,
    technicians: 0,
    treasury: 0,
    total: 0
  }
})
const isLoadingDemo = ref(false)
const isSeedingDemo = ref(false)
const isRemovingDemo = ref(false)
const isResettingDatabase = ref(false)

async function loadDemoStatus(): Promise<void> {
  try {
    isLoadingDemo.value = true
    if (window.api?.getDemoDataStatus) {
      demoStatus.value = await window.api.getDemoDataStatus()
    }
  } catch (err) {
    console.error('Failed to load demo status:', err)
  } finally {
    isLoadingDemo.value = false
  }
}

async function handleToggleHideDemo(val: boolean): Promise<void> {
  try {
    await window.api.setHideDemoData(val)
    demoStatus.value.isDemoHidden = val
    swalSuccess(
      val ? 'تم إخفاء البيانات الافتراضية' : 'تم إظهار البيانات الافتراضية',
      val
        ? 'تم حجب كافة سجلات العرض والتجربة من شاشات وتقارير البرنامج بنجاح.'
        : 'تمت استعادة إظهار السجلات الافتراضية في كافة الشاشات بنجاح.'
    )
    await refreshBusinessData()
  } catch (err: any) {
    swalError('خطأ', err?.message || 'تعذر تعديل حالة إخفاء البيانات الافتراضية.')
  }
}

async function handleSeedDemoData(): Promise<void> {
  const confirmed = await swalConfirm(
    'تأكيد إضافة البيانات الافتراضية للعرض',
    'سيتم توليد وزرع بيانات نموذجية واقعية متكاملة لكل من نشاطي البرنامج (صيانة الأجهزة الكهربائية ومراكز السماعات الطبية: عملاء، بلاغات، منتجات، فحص سمع، فواتير، وخزينة) لتمكينك من تجربة وعرض كافة مزايا النظام. هل تريد الاستمرار؟'
  )
  if (!confirmed) return

  try {
    isSeedingDemo.value = true
    await appStore.withLoading(async () => {
      const res = await window.api.seedDemoData()
      swalSuccess('تمت إضافة البيانات الافتراضية بنجاح!', res.message)
      await loadDemoStatus()
      await refreshBusinessData()
    }, 'جاري توليد وزرع البيانات الافتراضية النموذجية...')
  } catch (err: any) {
    swalError('فشل إضافة البيانات الافتراضية', err?.message || 'حدث خطأ أثناء زرع البيانات.')
  } finally {
    isSeedingDemo.value = false
  }
}

async function handleRemoveDemoData(): Promise<void> {
  const confirmed = await swalConfirm(
    'تأكيد إزالة البيانات الافتراضية نهائياً',
    'سيتم حذف كافة سجلات العرض والتجربة الافتراضية من قاعدة البيانات بالكامل. بياناتك الحقيقية التي أدخلتها بنفسك ستبقى محفوظة بنسبة 100% ولن تتأثر إطلاقاً. هل تريد المتابعة؟'
  )
  if (!confirmed) return

  try {
    isRemovingDemo.value = true
    await appStore.withLoading(async () => {
      const res = await window.api.removeDemoData()
      swalSuccess('تم تنظيف البيانات الافتراضية بنجاح!', res.message)
      await loadDemoStatus()
      await refreshBusinessData()
    }, 'جاري إزالة البيانات الافتراضية من كافة الجداول...')
  } catch (err: any) {
    swalError('فشل حذف البيانات الافتراضية', err?.message || 'حدث خطأ أثناء تنظيف البيانات.')
  } finally {
    isRemovingDemo.value = false
  }
}

async function handleFactoryReset(): Promise<void> {
  const confirmed = await swalConfirm(
    '⚠️ تحذير فائق الأهمية: إعادة ضبط البرنامج بالكامل',
    'سيؤدي هذا الإجراء إلى حذف ومسح كافة بيانات قاعدة البيانات بالكامل (العملاء، الأجهزة، البلاغات، الفواتير، المخزون، الحسابات، الخزينة، والمستخدمين) واستعادة البرنامج لحالته الأولى كأول تشغيل (ضبط المصنع).\n\nسيتم أخذ نسخة احتياطية آمنة تلقائياً في مجلد النسخ الاحتياطية قبل التنفيذ. هل أنت متأكد تماماً من رغبتك في المتابعة؟'
  )
  if (!confirmed) return

  // المرحلة الثانية: تأكيد بكتابة العبارة
  const { value: typedText } = await Swal.fire({
    title: 'تأكيد الحذف الشامل النهائي',
    html: `
      <div class="text-right space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <p>لتأكيد رغبتك في مسح كافة البيانات واستعادة ضبط المصنع، اكتب العبارة التالية بالضبط:</p>
        <p class="font-bold text-rose-600 text-center text-base bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200">
          تأكيد ضبط المصنع
        </p>
      </div>
    `,
    input: 'text',
    inputPlaceholder: 'اكتب: تأكيد ضبط المصنع',
    showCancelButton: true,
    confirmButtonText: 'تنفيذ مسح كافة البيانات وإعادة الضبط',
    cancelButtonText: 'إلغاء وتراجع',
    confirmButtonColor: '#e11d48',
    inputValidator: (val) => {
      if (val !== 'تأكيد ضبط المصنع') {
        return 'العبارة غير مطابقة! يرجى كتابة: تأكيد ضبط المصنع'
      }
      return null
    }
  })

  if (!typedText) return

  try {
    isResettingDatabase.value = true
    await appStore.withLoading(async () => {
      const res = await window.api.resetDatabase()
      localStorage.removeItem('sallehli_remembered_session')
      await Swal.fire({
        icon: 'success',
        title: 'تمت إعادة ضبط البرنامج بنجاح!',
        text: 'تم استعادة ضبط المصنع بالكامل وأخذ نسخة احتياطية آمنة. سيتم إعادة تشغيل البرنامج الآن لتسجيل الدخول بحساب admin الافتراضي (كلمة المرور: 8520).',
        confirmButtonText: 'إعادة تشغيل النظام الآن'
      })
      window.location.reload()
    }, 'جاري أخذ نسخة احتياطية وإعادة ضبط البرنامج واستعادة ضبط المصنع...')
  } catch (err: any) {
    swalError('فشل إعادة ضبط البرنامج', err?.message || 'حدث خطأ أثناء تنفيذ عملية ضبط المصنع.')
  } finally {
    isResettingDatabase.value = false
  }
}

onMounted(async () => {
  await refreshBusinessData()
  await loadDemoStatus()
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
          النشاط الحالي: {{ currentProfile?.appName }}
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
        @click="activeTab = 'database'"
        :class="[
          'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
          activeTab === 'database'
            ? 'bg-purple-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        ]"
      >
        <Database class="w-4 h-4" />
        إدارة البيانات وضبط المصنع
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
                سيتم اعتماد "{{ BUSINESS_PROFILES[selectedBusinessType]?.appName }}" كنظام رئيسي لهذا الجهاز.
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
                النشاط الحالي: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ currentProfile?.appName }}</span>
                | النشاط المختار للتبديل: <span class="font-semibold text-purple-600">{{ BUSINESS_PROFILES[selectedBusinessType]?.appName }}</span>
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

        <div class="rounded-xl border border-dashed border-indigo-300 dark:border-indigo-700 p-4 space-y-2">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            ترخيص الشركة (موقّع رقمياً Ed25519)
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            معرّف هذا الجهاز (أرسله للشركة لإصدار ترخيص مرتبط به):
            <span class="font-mono select-all break-all" dir="ltr">{{ machineId || '—' }}</span>
          </p>
          <textarea
            v-model="vendorLicenseToken"
            rows="3"
            dir="ltr"
            placeholder="الصق نص الترخيص هنا"
            class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-xs font-mono"
          ></textarea>
          <button
            @click="handleApplyVendorLicense"
            :disabled="isApplyingLicense"
            class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
          >
            تفعيل الترخيص
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          <!-- Sales & POS -->
          <div
            @click="toggleAddonModule('sales')"
            :class="[
              'p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none',
              currentProfile?.modules?.includes('sales')
                ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-75 cursor-default'
                : licensedModulesList.includes('sales')
                ? 'bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
            ]"
          >
            <input
              type="checkbox"
              :checked="currentProfile?.modules?.includes('sales') || licensedModulesList.includes('sales')"
              :disabled="currentProfile?.modules?.includes('sales')"
              class="w-4 h-4 mt-0.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
              @click.stop="!currentProfile?.modules?.includes('sales') && toggleAddonModule('sales')"
            />
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShoppingBag class="w-4 h-4 text-emerald-600" />
                المبيعات وفواتير نقاط البيع (POS)
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ currentProfile?.modules?.includes('sales') ? 'مفعلة تلقائياً ضمن نشاط المركز الحالي' : 'إمكانية إصدار فواتير بيع سريع وتقسيط ومرتجعات' }}
              </p>
            </div>
          </div>

          <!-- Purchases & Suppliers -->
          <div
            @click="toggleAddonModule('purchases')"
            :class="[
              'p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none',
              currentProfile?.modules?.includes('purchases')
                ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-75 cursor-default'
                : licensedModulesList.includes('purchases')
                ? 'bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
            ]"
          >
            <input
              type="checkbox"
              :checked="currentProfile?.modules?.includes('purchases') || licensedModulesList.includes('purchases')"
              :disabled="currentProfile?.modules?.includes('purchases')"
              class="w-4 h-4 mt-0.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
              @click.stop="!currentProfile?.modules?.includes('purchases') && toggleAddonModule('purchases')"
            />
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers class="w-4 h-4 text-blue-600" />
                المشتريات والموردين
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ currentProfile?.modules?.includes('purchases') ? 'مفعلة تلقائياً ضمن نشاط المركز الحالي' : 'فواتير المشتريات وحسابات الموردين والأقساط' }}
              </p>
            </div>
          </div>

          <!-- Advanced Products & Barcodes -->
          <div
            @click="toggleAddonModule('products')"
            :class="[
              'p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none',
              currentProfile?.modules?.includes('products')
                ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-75 cursor-default'
                : licensedModulesList.includes('products')
                ? 'bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
            ]"
          >
            <input
              type="checkbox"
              :checked="currentProfile?.modules?.includes('products') || licensedModulesList.includes('products')"
              :disabled="currentProfile?.modules?.includes('products')"
              class="w-4 h-4 mt-0.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
              @click.stop="!currentProfile?.modules?.includes('products') && toggleAddonModule('products')"
            />
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Database class="w-4 h-4 text-purple-600" />
                المنتجات وسيريال الأجهزة
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ currentProfile?.modules?.includes('products') ? 'مفعلة تلقائياً ضمن نشاط المركز الحالي' : 'إدارة المنتجات والأصناف برقم باركود ورقم تسلسلي' }}
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

    <!-- Tab 4: Database Management, Demo Data & Factory Reset -->
    <div v-if="activeTab === 'database'" class="space-y-6">
      <!-- Quick Info Banner -->
      <div class="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-200 dark:border-purple-800/60 rounded-2xl p-6">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-purple-600 text-white rounded-xl shadow-sm shrink-0">
              <HardDrive class="w-6 h-6" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">
                إدارة قاعدة البيانات، بيانات العرض، وإعادة ضبط المصنع
              </h3>
              <p class="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                تحكم في السجلات الافتراضية النموذجية للعرض والتجربة (إضافة، إخفاء، إزالة)، أو أعد ضبط البرنامج بالكامل للحالة الأصلية في حال الرغبة في البدء من الصفر.
              </p>
            </div>
          </div>
          <button
            @click="loadDemoStatus"
            :disabled="isLoadingDemo"
            class="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 shrink-0 self-start md:self-auto"
          >
            <RefreshCw :class="['w-3.5 h-3.5', isLoadingDemo ? 'animate-spin' : '']" />
            تحديث الحالة
          </button>
        </div>
      </div>

      <!-- Section 1: Demo Data (البيانات الافتراضية للعرض) -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-4">
          <div class="flex items-center gap-3">
            <div class="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
              <Sparkles class="w-6 h-6" />
            </div>
            <div>
              <h4 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                البيانات الافتراضية (بيانات العرض والتجربة)
                <span
                  v-if="demoStatus.hasDemoData"
                  class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                >
                  متوفرة ({{ demoStatus.counts.total }} سجل)
                </span>
                <span
                  v-else
                  class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  غير مثبتة
                </span>
              </h4>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تساعدك في استعراض إمكانيات البرنامج وعرضها لعملائك أو الموظفين دون التأثير على إدخالاتك الفعلية.
              </p>
            </div>
          </div>

          <!-- Visibility Badge -->
          <div v-if="demoStatus.hasDemoData">
            <span
              v-if="demoStatus.isDemoHidden"
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-300 border border-slate-300 dark:border-slate-600"
            >
              <EyeOff class="w-3.5 h-3.5 text-slate-500" />
              البيانات الافتراضية مخفية حالياً
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
            >
              <Eye class="w-3.5 h-3.5 text-emerald-600" />
              البيانات الافتراضية ظاهرة في الشاشات
            </span>
          </div>
        </div>

        <!-- Controls: Hide Toggle & Detailed Counts -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <!-- Toggle Card -->
          <div class="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-bold text-slate-900 dark:text-white block">
                  إخفاء البيانات الافتراضية
                </label>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  حجب السجلات الافتراضية مؤقتاً من القوائم
                </p>
              </div>
              <button
                type="button"
                @click="handleToggleHideDemo(!demoStatus.isDemoHidden)"
                :disabled="!demoStatus.hasDemoData"
                :class="[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed',
                  demoStatus.isDemoHidden ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'
                ]"
              >
                <span
                  :class="[
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    demoStatus.isDemoHidden ? '-translate-x-5' : 'translate-x-0'
                  ]"
                />
              </button>
            </div>
            <p class="text-[11px] text-slate-500 leading-relaxed border-t border-slate-200 dark:border-slate-700 pt-2">
              عند التفعيل، لن تظهر أي من البيانات الافتراضية في شاشات البلاغات، العملاء، المنتجات، الفواتير، أو الخزينة كأنها غير موجودة، ويمكنك إعادة إظهارها في أي لحظة.
            </p>
          </div>

          <!-- Counts Summary -->
          <div class="lg:col-span-2">
            <div class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              تفاصيل السجلات الافتراضية المتوفرة:
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div class="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                <span class="text-slate-500 block text-[11px]">العملاء والمرضى</span>
                <span class="text-base font-bold text-slate-900 dark:text-white">{{ demoStatus.counts.customers }}</span>
              </div>
              <div class="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                <span class="text-slate-500 block text-[11px]">طلبات وبلاغات الصيانة</span>
                <span class="text-base font-bold text-slate-900 dark:text-white">{{ demoStatus.counts.tickets }}</span>
              </div>
              <div class="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                <span class="text-slate-500 block text-[11px]">المنتجات والأصناف</span>
                <span class="text-base font-bold text-slate-900 dark:text-white">{{ demoStatus.counts.products + demoStatus.counts.spare_parts }}</span>
              </div>
              <div class="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                <span class="text-slate-500 block text-[11px]">فواتير المبيعات</span>
                <span class="text-base font-bold text-slate-900 dark:text-white">{{ demoStatus.counts.sales }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Demo Action Buttons -->
        <div class="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <button
            @click="handleRemoveDemoData"
            :disabled="isRemovingDemo || !demoStatus.hasDemoData"
            class="px-5 py-2.5 border border-rose-300 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          >
            <RefreshCw v-if="isRemovingDemo" class="w-4 h-4 animate-spin" />
            <Trash2 v-else class="w-4 h-4 text-rose-600" />
            إزالة البيانات الافتراضية
          </button>

          <button
            @click="handleSeedDemoData"
            :disabled="isSeedingDemo"
            class="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
          >
            <RefreshCw v-if="isSeedingDemo" class="w-4 h-4 animate-spin" />
            <Sparkles v-else class="w-4 h-4" />
            {{ demoStatus.hasDemoData ? 'إعادة توليد وتحديث البيانات الافتراضية' : 'إضافة البيانات الافتراضية للعرض' }}
          </button>
        </div>
      </div>

      <!-- Section 2: Complete Factory Reset (إعادة ضبط البرنامج بالكامل) -->
      <div class="bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl p-6 border-2 border-rose-200 dark:border-rose-900/60 shadow-sm space-y-4">
        <div class="flex items-start gap-4">
          <div class="p-3 bg-rose-600 text-white rounded-xl shadow-sm shrink-0">
            <AlertTriangle class="w-7 h-7" />
          </div>
          <div class="space-y-1">
            <h4 class="text-lg font-bold text-rose-900 dark:text-rose-200 flex items-center gap-2">
              إعادة ضبط البرنامج بالكامل (استعادة ضبط المصنع)
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 font-bold">
                حذف شامل لقاعدة البيانات
              </span>
            </h4>
            <p class="text-sm text-rose-700 dark:text-rose-300 leading-relaxed">
              تقوم هذه الخاصية بمسح وحذف كافة البيانات التشغيلية وقاعدة البيانات بالكامل (العملاء، الأجهزة، بلاغات الصيانة، الفواتير، الأصناف، المخزون، الخزينة، والمستخدمين)، وإعادة البرنامج إلى وضعه الأصلي تماماً كأول تشغيل بعد التثبيت.
            </p>
          </div>
        </div>

        <div class="p-4 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/50 space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <div class="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <CheckCircle2 class="w-4 h-4 text-emerald-600" />
            حماية تلقائية مدمجة:
          </div>
          <p class="text-slate-500 leading-relaxed">
            سيقوم النظام تلقائياً بإنشاء نسخة احتياطية كاملة ومؤرخة وحفظها داخل مجلد النسخ الاحتياطية قبل مسح أي بيانات، لضمان عدم حدوث أي فقدان غير مقصود للبيانات.
          </p>
          <p class="text-slate-500">
            بعد إعادة الضبط، سيتم إعادة تشغيل البرنامج ويمكنك الدخول بالحساب الافتراضي الرئيسي: اسم المستخدم <strong class="text-slate-800 dark:text-slate-100">admin</strong> وكلمة المرور <strong class="text-slate-800 dark:text-slate-100">8520</strong>.
          </p>
        </div>

        <div class="flex justify-end pt-2">
          <button
            @click="handleFactoryReset"
            :disabled="isResettingDatabase"
            class="px-6 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2"
          >
            <RefreshCw v-if="isResettingDatabase" class="w-4 h-4 animate-spin" />
            <RotateCcw v-else class="w-4 h-4" />
            إعادة ضبط البرنامج بالكامل (حذف قاعدة البيانات)
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

