<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import jokerTechLogo from '@renderer/assets/joker-tech-logo.png'
import {
  Wrench,
  Lock,
  User as UserIcon,
  Sun,
  Moon,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Package,
  Wallet,
  Globe,
  Eye,
  EyeOff,
  Sparkles
} from 'lucide-vue-next'

const router = useRouter()
const appStore = useAppStore()

const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const showPassword = ref(false)
const errorMessage = ref('')
const loading = ref(false)

const features = [
  {
    icon: Wrench,
    title: 'إدارة بلاغات الصيانة والضمان',
    desc: 'متابعة دقيقة لطلبات الصيانة بالورشة والزيارات المنزلية، مع طباعة فواتير A4 وإيصالات حرارية 80mm وإرسال إشعارات واتساب للعملاء.'
  },
  {
    icon: Package,
    title: 'المخزن وقطع الغيار وعهدة الفنيين',
    desc: 'رقابة شاملة على أرصدة قطع الغيار، تنبيهات النواقص، صرف واسترداد عهدة الفنيين، وحساب العمولات تلقائياً.'
  },
  {
    icon: Wallet,
    title: 'الخزينة والتقارير المالية المحاسبية',
    desc: 'إدارة متعددة الخزائن (كاش، فودافون كاش، إنستا باي، حساب بنكي) مع تقارير تفصيلية لصافي الأرباح والمصروفات والمديونيات.'
  },
  {
    icon: Globe,
    title: 'العمل عبر المتصفح والشبكة المحلية (LAN)',
    desc: 'إمكانية فتح البرنامج على المتصفح والعمل من عدة أجهزة كمبيوتر أو هواتف داخل نفس الشبكة المحلية عبر عنوان الـ IP.'
  }
]

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
        return
      }

      appStore.setSession(
        res.user,
        res.subscriptionStatus?.daysRemaining ?? null,
        rememberMe.value
      )
      await appStore.loadSettings()
      router.push('/dashboard')
    }, 'جاري تسجيل الدخول والتحقق من الصلاحية...')
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  appStore.fetchVersion()
  appStore.fetchSystemStatus()
})
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/70 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/40 p-4 md:p-8 relative"
  >
    <!-- Theme Toggle Button -->
    <button
      type="button"
      @click="appStore.toggleTheme"
      class="fixed top-5 left-5 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-sm hover:shadow-md transition cursor-pointer text-xs font-bold"
    >
      <Sun v-if="appStore.isDark" class="w-4 h-4 text-amber-400" />
      <Moon v-else class="w-4 h-4 text-slate-700" />
      <span>{{ appStore.isDark ? 'الوضع الفاتح' : 'الوضع الداكن' }}</span>
    </button>

    <!-- Main Split-Screen Container -->
    <div
      class="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12"
    >
      <!-- Right Side (RTL): Program Info & Features Showcase (7 cols) -->
      <div
        class="lg:col-span-7 bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-950 text-white p-7 md:p-9 flex flex-col justify-between relative overflow-hidden"
      >
        <!-- Decorative Background Glows -->
        <div
          class="w-72 h-72 rounded-full bg-blue-500/20 blur-3xl absolute -top-20 -right-20 pointer-events-none"
        ></div>
        <div
          class="w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl absolute -bottom-24 -left-20 pointer-events-none"
        ></div>

        <div class="relative z-10 space-y-6">
          <!-- Brand Header -->
          <div class="flex items-center gap-4">
            <div
              class="w-16 h-16 rounded-2xl bg-white border-2 border-white/30 flex items-center justify-center shadow-xl p-2 shrink-0"
            >
              <img :src="jokerTechLogo" alt="صلحلي" class="w-full h-full object-contain" />
            </div>
            <div>
              <div class="flex items-center gap-2.5">
                <h1 class="text-2xl md:text-3xl font-black tracking-tight">برنامج صلحلي</h1>
                <span
                  class="px-2.5 py-0.5 rounded-full bg-blue-500/30 border border-blue-300/40 text-blue-100 font-mono text-xs font-bold"
                >
                  {{ appStore.appVersion }}
                </span>
              </div>
              <p class="text-blue-200 text-xs md:text-sm font-bold mt-1">
                المنظومة المتكاملة لإدارة مراكز صيانة الأجهزة الكهربائية والمنزلية
              </p>
            </div>
          </div>

          <!-- Brief System Description -->
          <div
            class="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs text-xs leading-relaxed text-blue-50"
          >
            <div class="flex items-center gap-1.5 font-black text-amber-300 mb-1">
              <Sparkles class="w-4 h-4" />
              <span>نبذة مختصرة عن النظام:</span>
            </div>
            صُمم نظام <strong>صلحلي</strong> ليمنح مراكز الصيانة تحكماً كاملاً وسريعاً في دورة العمل اليومية؛ بدءاً من استقبال جهاز العميل وتسجيل الأعطال والضمان، مروراً بمتابعة الفنيين وصرف قطع الغيار من المخزن، وصولاً إلى ضبط الخزينة والتقارير المالية الدقيقة.
          </div>

          <!-- Key Features Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="(item, idx) in features"
              :key="idx"
              class="p-3.5 rounded-2xl bg-white/8 hover:bg-white/12 border border-white/10 transition space-y-1.5"
            >
              <div class="flex items-center gap-2">
                <div
                  class="w-8 h-8 rounded-xl bg-blue-500/25 border border-blue-400/30 flex items-center justify-center text-blue-200 shrink-0"
                >
                  <component :is="item.icon" class="w-4 h-4" />
                </div>
                <h3 class="font-black text-xs text-white">{{ item.title }}</h3>
              </div>
              <p class="text-[11px] text-blue-100/85 leading-relaxed">
                {{ item.desc }}
              </p>
            </div>
          </div>
        </div>

        <!-- Bottom Network / Status Bar -->
        <div
          class="relative z-10 mt-6 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-[11px] text-blue-200"
        >
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>قاعدة بيانات محلية آمنة مع نسخ احتياطي تلقائي</span>
          </div>
          <div
            v-if="primaryLanUrl"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 font-mono text-[11px] text-emerald-300"
          >
            <Globe class="w-3.5 h-3.5" />
            <span dir="ltr">{{ primaryLanUrl }}</span>
          </div>
        </div>
      </div>

      <!-- Left Side (RTL): Login Form (5 cols) -->
      <div class="lg:col-span-5 p-7 md:p-9 flex flex-col justify-center bg-white dark:bg-slate-900">
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <span
              class="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-bold text-[11px] mb-2"
            >
              مرحباً بك مجدداً
            </span>
            <h2 class="text-xl font-black text-slate-900 dark:text-white">
              تسجيل الدخول للنظام
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              أدخل بيانات حسابك للوصول إلى لوحة إدارة المركز
            </p>
          </div>

          <div
            v-if="errorMessage"
            class="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold"
          >
            <ShieldAlert class="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{{ errorMessage }}</span>
          </div>

          <div class="space-y-1.5">
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
                placeholder="مثال: admin"
                class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          <div class="space-y-1.5">
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
                class="w-full pr-10 pl-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                tabindex="-1"
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
              class="flex items-center gap-2.5 cursor-pointer select-none text-xs font-bold text-slate-700 dark:text-slate-300"
            >
              <input
                id="rememberMeCheckbox"
                v-model="rememberMe"
                type="checkbox"
                class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>تذكرني (البقاء متصلاً عند إغلاق البرنامج)</span>
            </label>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
            <CheckCircle2 v-else class="w-4 h-4" />
            <span>{{ loading ? 'جاري تسجيل الدخول...' : 'دخول إلى لوحة الإدارة' }}</span>
          </button>

          <!-- Developer & Version Footer -->
          <div
            class="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400"
          >
            <div class="flex items-center gap-1.5">
              <img :src="jokerTechLogo" alt="الجوكر تك" class="w-4 h-4 object-contain" />
              <span>
                تطوير:
                <strong class="text-slate-700 dark:text-slate-200">شركة الجوكر تك</strong>
              </span>
            </div>
            <span>
              الإصدار <strong class="font-mono">{{ appStore.appVersion }}</strong>
            </span>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
