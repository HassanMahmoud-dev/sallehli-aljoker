<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import jokerTechLogo from '@renderer/assets/joker-tech-logo.png'
import { Wrench, Lock, User as UserIcon, Sun, Moon, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-vue-next'

const router = useRouter()
const appStore = useAppStore()

const username = ref('')
const password = ref('')
const errorMessage = ref('')
const loading = ref(false)

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

      appStore.setSession(res.user, res.subscriptionStatus?.daysRemaining ?? null)
      await appStore.loadSettings()
      router.push('/dashboard')
    }, 'جاري تسجيل الدخول والتحقق من الصلاحية...')
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/40 p-6 relative"
  >
    <!-- Theme Toggle Button -->
    <button
      type="button"
      @click="appStore.toggleTheme"
      class=" fixed top-6 left-6 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-sm hover:shadow-md transition cursor-pointer text-xs font-bold"
    >
      <Sun v-if="appStore.isDark" class="w-4 h-4 text-amber-400" />
      <Moon v-else class="w-4 h-4 text-slate-700" />
      <span>{{ appStore.isDark ? 'الوضع الفاتح' : 'الوضع الداكن' }}</span>
    </button>

    <div
      class="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
    >
      <!-- Top Brand Banner -->
      <div class="bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-700 p-8 text-white text-center relative">
        <div
          class="w-20 h-20 rounded-2xl bg-white border-2 border-white/40 flex items-center justify-center mx-auto mb-3 shadow-lg p-2"
        >
          <img :src="jokerTechLogo" alt="الجوكر تك" class="w-full h-full object-contain" />
        </div>
        <div class="flex items-center justify-center gap-2">
          <h1 class="text-2xl font-black tracking-tight">صلحلي</h1>
          <span
            class="px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white font-mono text-xs font-bold"
          >
            {{ appStore.appVersion }}
          </span>
        </div>
        <p class="text-blue-100 text-xs font-medium mt-1">
          النظام المتكامل لإدارة مراكز صيانة الأجهزة الكهربائية والمنزلية
        </p>
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleLogin" class="p-8 space-y-5">
        <div class="text-center mb-2">
          <h2 class="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            تسجيل الدخول للنظام
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            أدخل بيانات حسابك (سوبر أدمن / مالك البرنامج / مستأجر البرنامج)
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
              type="password"
              placeholder="••••••••"
              class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
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

        <!-- Role Info Footer -->
        <div
          class="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400"
        >
          <div class="flex items-center gap-1.5">
            <img :src="jokerTechLogo" alt="الجوكر تك" class="w-4 h-4 object-contain" />
            <span>تطوير: <strong class="text-slate-700 dark:text-slate-200">شركة الجوكر تك</strong></span>
          </div>
          <span>الإصدار <strong class="font-mono">{{ appStore.appVersion }}</strong></span>
        </div>
      </form>
    </div>
  </div>
</template>
