<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore, type FontSizeMode, type ThemeMode } from '@renderer/stores/appStore'
import { USER_ROLE_LABELS } from '@renderer/constants/appliances'
import {
  User,
  Phone,
  AtSign,
  ShieldCheck,
  Building2,
  Calendar,
  KeyRound,
  FileText,
  Type,
  CheckCircle2,
  Sun,
  Moon,
  Monitor
} from 'lucide-vue-next'

const appStore = useAppStore()

const user = computed(() => appStore.currentUser)

const roleInfo = computed(() => {
  const role = user.value?.role || 'owner'
  return USER_ROLE_LABELS[role] || { label: role, badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
})

const userInitials = computed(() => {
  const name = (user.value?.full_name || user.value?.username || 'U').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
})

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'غير محدد'
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return dateStr
  return parsed.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const licenseText = computed(() => {
  if (user.value?.subscription_end) {
    return `ساري حتى ${formatDate(user.value.subscription_end)}`
  }
  if (user.value?.role === 'super_admin') {
    return 'صلاحية إدارة كاملة (سوبر أدمن)'
  }
  return 'ترخيص وصلاحية دائمة'
})

const fontSizeOptions: Array<{
  id: FontSizeMode
  label: string
  px: string
  sampleClass: string
  description: string
}> = [
  {
    id: 'small',
    label: 'صغير',
    px: '14px',
    sampleClass: 'text-sm',
    description: 'عرض مضغوط يظهر بيانات أكثر على الشاشات الصغيرة'
  },
  {
    id: 'medium',
    label: 'متوسط',
    px: '16px',
    sampleClass: 'text-base',
    description: 'الحجم الافتراضي المتوازن لمختلف الشاشات'
  },
  {
    id: 'large',
    label: 'كبير',
    px: '18px',
    sampleClass: 'text-lg',
    description: 'خط أكبر وأوضح لراحة العين والقراءة السريعة'
  }
]

const themeOptions: Array<{
  id: ThemeMode
  label: string
  description: string
  icon: typeof Sun
}> = [
  { id: 'light', label: 'الوضع الفاتح', description: 'إضاءة نهارية مريحة', icon: Sun },
  { id: 'dark', label: 'الوضع الداكن', description: 'مريح للعين في الإضاءة المنخفضة', icon: Moon },
  { id: 'system', label: 'تلقائي (النظام)', description: 'يتبع إعدادات نظام التشغيل', icon: Monitor }
]
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Page Header -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
          <span class="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <User class="w-5 h-5" />
          </span>
          <span>الملف الشخصي</span>
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          بيانات حسابك المسجلة وتخصيص حجم الخط ومظهر البرنامج
        </p>
      </div>
    </div>

    <!-- User Identity & Details Card -->
    <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
      <div class="p-5 sm:p-6 bg-gradient-to-l from-blue-600/10 via-indigo-600/5 to-transparent border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4 min-w-0">
          <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black text-lg sm:text-xl flex items-center justify-center shadow-md shadow-blue-600/25 shrink-0">
            {{ userInitials }}
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate">
                {{ user?.full_name || 'مستخدم النظام' }}
              </h2>
              <span
                :class="[
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold',
                  user?.is_active !== 0
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                ]"
              >
                {{ user?.is_active !== 0 ? 'حساب نشط' : 'حساب معطل' }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span :class="['inline-block px-2.5 py-0.5 rounded-full text-xs font-bold', roleInfo.badge]">
                {{ roleInfo.label }}
              </span>
              <span dir="ltr" class="text-xs font-mono text-slate-500 dark:text-slate-400">
                @{{ user?.username }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <User class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>الاسم الكامل</span>
          </div>
          <div class="font-bold text-sm text-slate-900 dark:text-white break-words">
            {{ user?.full_name || '—' }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <AtSign class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>اسم المستخدم</span>
          </div>
          <div dir="ltr" class="font-mono font-bold text-sm text-slate-900 dark:text-white text-right break-all">
            @{{ user?.username || '—' }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <Phone class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>رقم الهاتف</span>
          </div>
          <div dir="ltr" class="font-mono font-bold text-sm text-slate-900 dark:text-white text-right">
            {{ user?.phone || 'غير مسجل' }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <ShieldCheck class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>الدور والصلاحية</span>
          </div>
          <div class="font-bold text-sm text-slate-900 dark:text-white">
            {{ roleInfo.label }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <Building2 class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>النشاط المسجل</span>
          </div>
          <div class="font-bold text-sm text-slate-900 dark:text-white">
            {{ appStore.businessProfile.appName }} — {{ appStore.businessProfile.loginSubtitle }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <Calendar class="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>تاريخ إنشاء الحساب</span>
          </div>
          <div class="font-bold text-sm text-slate-900 dark:text-white">
            {{ formatDate(user?.created_at) }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1 sm:col-span-2 lg:col-span-3">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <KeyRound class="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>حالة الترخيص والاشتراك</span>
          </div>
          <div class="font-bold text-sm text-slate-900 dark:text-white">
            {{ licenseText }}
          </div>
        </div>

        <div
          v-if="user?.notes"
          class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 space-y-1 sm:col-span-2 lg:col-span-3"
        >
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <FileText class="w-3.5 h-3.5 text-slate-500" />
            <span>ملاحظات الحساب</span>
          </div>
          <div class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {{ user.notes }}
          </div>
        </div>
      </div>
    </section>

    <!-- Font Size Selector Card (3 Sizes) -->
    <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 sm:p-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Type class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>تحديد حجم الخط</span>
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            اختر من بين 3 أحجام للخط ليتم تطبيقه فوراً على كامل البرنامج وحفظه تلقائياً
          </p>
        </div>
        <span class="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 text-xs font-bold">
          الحجم الحالي: {{ fontSizeOptions.find((o) => o.id === appStore.fontSizeMode)?.label }}
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          v-for="option in fontSizeOptions"
          :key="option.id"
          type="button"
          @click="appStore.setFontSizeMode(option.id)"
          :class="[
            'relative text-right p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-3',
            appStore.fontSizeMode === option.id
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-sm shadow-blue-600/10'
              : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 bg-slate-50/60 dark:bg-slate-800/40'
          ]"
        >
          <div class="flex items-center justify-between gap-2 w-full">
            <div class="flex items-center gap-2">
              <span :class="['font-black text-slate-900 dark:text-white', option.sampleClass]">
                أبجد
              </span>
              <span class="font-black text-sm text-slate-900 dark:text-white">
                {{ option.label }}
              </span>
            </div>
            <CheckCircle2
              v-if="appStore.fontSizeMode === option.id"
              class="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0"
            />
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {{ option.description }}
          </p>

          <div class="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
            <span>القياس الأساسي</span>
            <span>{{ option.px }}</span>
          </div>
        </button>
      </div>

      <!-- Live Font Preview -->
      <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 space-y-1.5">
        <div class="text-[11px] font-bold text-slate-400">معاينة مباشرة لحجم الخط الحالي:</div>
        <div class="text-base font-black text-slate-900 dark:text-white">
          مرحباً {{ user?.full_name || 'بك' }} في نظام {{ appStore.businessProfile.appName }}
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          هذا النص يوضح كيف ستظهر القوائم، الجداول، الأزرار، والفواتير بالحجم المختار.
        </p>
      </div>
    </section>

    <!-- Theme Mode Card -->
    <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 sm:p-6 space-y-4">
      <div>
        <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white">
          مظهر البرنامج
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          اختر المظهر المفضل لديك أو اتركه يتبع إعدادات نظام التشغيل
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          v-for="theme in themeOptions"
          :key="theme.id"
          type="button"
          @click="appStore.setThemeMode(theme.id)"
          :class="[
            'p-3.5 rounded-xl border-2 text-right transition cursor-pointer flex items-center gap-3',
            appStore.themeMode === theme.id
              ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40'
              : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800 bg-slate-50/60 dark:bg-slate-800/40'
          ]"
        >
          <div
            :class="[
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
              appStore.themeMode === theme.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            ]"
          >
            <component :is="theme.icon" class="w-4 h-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-sm text-slate-900 dark:text-white">{{ theme.label }}</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">{{ theme.description }}</div>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>
