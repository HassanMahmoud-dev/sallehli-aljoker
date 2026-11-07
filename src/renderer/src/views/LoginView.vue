<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { swalSuccess, swalError } from '@renderer/utils/swal'
import jokerTechLogo from '@renderer/assets/joker-tech-logo.png'
import {
  Lock,
  User as UserIcon,
  Sun,
  Moon,
  Monitor,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Globe,
  Eye,
  EyeOff,
  ShieldCheck
} from 'lucide-vue-next'

const router = useRouter()
const appStore = useAppStore()

const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const showPassword = ref(false)
const errorMessage = ref('')
const loading = ref(false)

const primaryLanUrl = computed(() => {
  const st = appStore.systemStatus
  if (!st || !st.lanEnabled || !st.lanRunning) return ''
  return st.urls[0] || st.localUrl
})

async function handleLogin(): Promise<void> {
  errorMessage.value = ''
  if (!username.value.trim() || !password.value.trim()) {
    errorMessage.value = 'يرجى إدخال اسم المستخدم وكلمة المرور'
    return
  }

  loading.value = true
  try {
    await appStore.withLoading(async () => {
      const res = await window.api.login({
        username: username.value.trim(),
        password: password.value.trim()
      })

      if (!res.success || !res.user) {
        errorMessage.value = res.message || 'فشل تسجيل الدخول'
        swalError('فشل تسجيل الدخول', errorMessage.value)
        return
      }

      appStore.setSession(
        res.user,
        res.subscriptionStatus?.daysRemaining ?? null,
        rememberMe.value,
        res.token
      )
      await appStore.loadSettings()
      swalSuccess(`مرحباً بك، ${res.user.full_name}`)
      router.push('/dashboard')
    }, 'جاري تسجيل الدخول والتحقق من الصلاحية...')
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await appStore.loadBusiness()
  appStore.fetchVersion()
  appStore.fetchSystemStatus()
})
</script>

<template>
  <div
    class="min-h-screen flex flex-col items-center justify-between bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 md:p-6 text-slate-800 dark:text-slate-100 transition-colors duration-300 relative overflow-hidden"
  >
    <!-- Subtle Background Ambient Lights -->
    <div
      class="w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-600/10 blur-3xl absolute -top-24 -right-24 pointer-events-none"
    ></div>
    <div
      class="w-96 h-96 rounded-full bg-indigo-500/10 dark:bg-indigo-600/10 blur-3xl absolute -bottom-24 -left-24 pointer-events-none"
    ></div>

    <!-- Top Navigation Bar: Theme Mode (3 Options) & LAN URL -->
    <header class="w-full max-w-5xl flex items-center justify-between relative z-10 py-2">
      <!-- LAN Address Badge if active -->
      <div v-if="primaryLanUrl" class="flex items-center gap-2">
        <div
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-emerald-600 dark:text-emerald-400 shadow-xs backdrop-blur-xs"
        >
          <Globe class="w-3.5 h-3.5" />
          <span dir="ltr">{{ primaryLanUrl }}</span>
        </div>
      </div>
      <div v-else></div>

      <!-- 3-Mode Theme Selector (Light / Dark / System) -->
      <div
        class="flex items-center p-1 rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-xs backdrop-blur-xs text-xs font-bold"
      >
        <button
          type="button"
          @click="appStore.setThemeMode('light')"
          :class="[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer',
            appStore.themeMode === 'light'
              ? 'bg-amber-50 text-amber-700 dark:bg-slate-700 dark:text-amber-400 shadow-xs font-black'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
          title="الوضع الفاتح"
        >
          <Sun class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">فاتح</span>
        </button>

        <button
          type="button"
          @click="appStore.setThemeMode('dark')"
          :class="[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer',
            appStore.themeMode === 'dark'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-slate-700 dark:text-indigo-300 shadow-xs font-black'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
          title="الوضع الداكن"
        >
          <Moon class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">داكن</span>
        </button>

        <button
          type="button"
          @click="appStore.setThemeMode('system')"
          :class="[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer',
            appStore.themeMode === 'system'
              ? 'bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-300 shadow-xs font-black'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
          title="تلقائي بحسب نظام التشغيل"
        >
          <Monitor class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">النظام</span>
        </button>
      </div>
    </header>

    <!-- Main Centered Login Card -->
    <main class="w-full max-w-md my-auto relative z-10 py-6">
      <div
        class="bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none p-8 md:p-9 space-y-6 backdrop-blur-md transition-all"
      >
        <!-- Logo & Brand Header -->
        <div class="text-center space-y-3">
          <!-- Logo Container -->
          <div class="inline-flex relative">
            <div
              class="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center p-3.5 shadow-md shadow-blue-500/10 transition-transform hover:scale-105 duration-200"
            >
              <img
                :src="jokerTechLogo"
                alt="لوجو صلحلي"
                class="w-full h-full object-contain filter drop-shadow-xs"
              />
            </div>
          </div>

          <!-- Application Title & Version Badge -->
          <div>
            <div class="flex items-center justify-center gap-2.5">
              <h1 class="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                صلحلي
              </h1>
              <span
                class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 font-mono text-xs font-black border border-blue-200 dark:border-blue-800/60"
              >
                {{ appStore.appVersion }}
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              {{ appStore.businessProfile.loginSubtitle || 'نظام الإدارة المتكامل لمراكز الصيانة والخدمات' }}
            </p>
          </div>
        </div>

        <!-- Error Message Alert -->
        <div
          v-if="errorMessage"
          class="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold animate-shake"
        >
          <ShieldAlert class="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Username Input -->
          <div class="space-y-1.5 text-right">
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
              اسم المستخدم
            </label>
            <div class="relative">
              <UserIcon
                class="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                v-model="username"
                type="text"
                autofocus
                placeholder="أدخل اسم المستخدم (مثال: admin)"
                class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
              />
            </div>
          </div>

          <!-- Password Input -->
          <div class="space-y-1.5 text-right">
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
              كلمة المرور
            </label>
            <div class="relative">
              <Lock
                class="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••"
                class="w-full pr-10 pl-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                tabindex="-1"
                title="إظهار / إخفاء كلمة المرور"
              >
                <EyeOff v-if="showPassword" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Remember Me Checkbox -->
          <div class="flex items-center justify-between pt-1">
            <label
              for="rememberMeCheckbox"
              class="flex items-center gap-2.5 cursor-pointer select-none text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            >
              <input
                id="rememberMeCheckbox"
                v-model="rememberMe"
                type="checkbox"
                class="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>تذكرني على هذا الجهاز</span>
            </label>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-sm shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
            <CheckCircle2 v-else class="w-4 h-4" />
            <span>{{ loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول' }}</span>
          </button>
        </form>

        <!-- Card Mini Footer: Security Badge -->
        <div
          class="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium"
        >
          <ShieldCheck class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>قاعدة بيانات محلية آمنة • نسخ احتياطي تلقائي</span>
        </div>
      </div>
    </main>

    <!-- Bottom Page Footer: Company Copyright -->
    <footer
      class="w-full max-w-5xl flex items-center justify-center py-2 relative z-10 text-[11px] text-slate-500 dark:text-slate-400 font-medium"
    >
      <div class="flex items-center gap-2">
        <img :src="jokerTechLogo" alt="الجوكر تك" class="w-4 h-4 object-contain opacity-80" />
        <span>
          تطوير: <strong class="text-slate-700 dark:text-slate-300 font-bold">شركة الجوكر تك (Al-Joker Tech)</strong>
        </span>
        <span class="text-slate-300 dark:text-slate-700">•</span>
        <span>جميع الحقوق محفوظة</span>
      </div>
    </footer>
  </div>
</template>
