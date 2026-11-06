<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { USER_ROLE_LABELS } from '@renderer/constants/appliances'
import PrintModal from '@renderer/components/PrintModal.vue'
import UpdateModal from '@renderer/components/UpdateModal.vue'
import BusinessSetupWizard from '@renderer/components/BusinessSetupWizard.vue'
import jokerTechLogo from '@renderer/assets/joker-tech-logo.png'
import {
  LayoutDashboard,
  Wrench,
  Users,
  CalendarClock,
  UserCog,
  Package,
  Boxes,
  Truck,
  ShoppingCart,
  ShoppingBag,
  Wallet,
  PieChart,
  Settings,
  ShieldCheck,
  Server,
  Globe,
  Sparkles,
  Sun,
  Moon,
  LogOut,
  RefreshCw,
  Loader2,
  X
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const { t } = useTerms()

let unsubscribeUpdateAvailable: (() => void) | null = null

const navItems = computed(() => {
  const role = appStore.currentUser?.role || 'tenant'
  const activeModules = appStore.businessProfile?.modules || []
  const items: Array<{ name: string; path: string; label: string; icon: unknown; module?: string }> = []

  if (!appStore.isBusinessLocked && !appStore.needsBusinessSetup) {
    items.push(
      { name: 'dashboard', path: '/dashboard', label: 'لوحة التحكم اليومية', icon: LayoutDashboard, module: 'dashboard' },
      { name: 'sales', path: '/sales', label: t('salesPage'), icon: ShoppingCart, module: 'sales' },
      { name: 'tickets', path: '/tickets', label: t('ticketsPage'), icon: Wrench, module: 'tickets' },
      { name: 'customers', path: '/customers', label: t('customersPage'), icon: Users, module: 'customers' },
      { name: 'followups', path: '/followups', label: t('followupsPage') || 'المتابعات والقوالب', icon: CalendarClock, module: 'followups' }
    )

    if (['super_admin', 'owner', 'tenant', 'receptionist', 'cashier'].includes(role)) {
      items.push({
        name: 'technicians',
        path: '/technicians',
        label: t('technicians'),
        icon: UserCog,
        module: 'technicians'
      })
    }

    if (appStore.canViewInventory) {
      items.push({
        name: 'products',
        path: '/products',
        label: t('productsPage'),
        icon: Boxes,
        module: 'products'
      })
      items.push({
        name: 'purchases',
        path: '/purchases',
        label: t('purchasesPage'),
        icon: ShoppingBag,
        module: 'purchases'
      })
      items.push({
        name: 'suppliers',
        path: '/suppliers',
        label: t('suppliersPage'),
        icon: Truck,
        module: 'suppliers'
      })
      items.push({
        name: 'inventory',
        path: '/inventory',
        label: t('partsStore'),
        icon: Package,
        module: 'inventory'
      })
    }

    if (appStore.canViewFinancials) {
      items.push({
        name: 'treasury',
        path: '/treasury',
        label: 'الخزينة والحسابات',
        icon: Wallet,
        module: 'treasury'
      })
      items.push({
        name: 'reports',
        path: '/reports',
        label: 'التقارير المالية والمحاسبية',
        icon: PieChart,
        module: 'reports'
      })
    }

    if (appStore.isFullManager) {
      items.push({
        name: 'settings',
        path: '/settings',
        label: 'إعدادات المركز والطباعة',
        icon: Settings,
        module: 'settings'
      })
    }
  }

  if (appStore.isSuperAdmin) {
    items.push({
      name: 'program-settings',
      path: '/program-settings',
      label: 'إعدادات البرنامج (سوبر أدمن)',
      icon: ShieldCheck
    })
  } else if (appStore.canManageUsers && !appStore.isBusinessLocked && !appStore.needsBusinessSetup) {
    items.push({
      name: 'super-admin',
      path: '/super-admin',
      label: 'إدارة الموظفين والصلاحيات',
      icon: ShieldCheck
    })
  }

  return items.filter((item) => !item.module || activeModules.includes(item.module))
})

const primaryBrowserUrl = computed(() => {
  const st = appStore.systemStatus
  if (!st || !st.lanRunning || !st.browserEnabled) return ''
  return st.lanEnabled && st.urls[0] ? st.urls[0] : st.localUrl
})

function openInBrowser(): void {
  if (!primaryBrowserUrl.value) return
  window.api.openExternal(primaryBrowserUrl.value)
}

function handleLogout(): void {
  appStore.logout()
  router.push('/login')
}

onMounted(async () => {
  appStore.applyTheme()
  appStore.fetchVersion()
  appStore.fetchSystemStatus()

  if (appStore.isAuthenticated) {
    const valid = await appStore.verifyRememberedSession()
    if (!valid && route.name !== 'login') {
      router.push('/login')
    }
  }

  if (window.api?.onUpdateAvailable) {
    unsubscribeUpdateAvailable = window.api.onUpdateAvailable((res) => {
      if (res?.updateAvailable) {
        appStore.setAvailableUpdate(res)
      }
    })
  }

  if (window.api?.getAutoUpdateResult) {
    try {
      const autoRes = await window.api.getAutoUpdateResult()
      if (autoRes?.updateAvailable) {
        appStore.setAvailableUpdate(autoRes)
      }
    } catch {
      // Ignore
    }
  }
})

onUnmounted(() => {
  if (unsubscribeUpdateAvailable) {
    unsubscribeUpdateAvailable()
  }
})
</script>

<template>
  <div dir="rtl" class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <!-- Login View (Full Screen without Sidebar) -->
    <router-view v-if="!appStore.isAuthenticated || route.name === 'login'" />

    <!-- Main Authenticated Application Layout -->
    <div v-else class="flex h-screen overflow-hidden">
      <!-- Right Sidebar Navigation -->
      <aside
        class="no-print w-68 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0"
      >
        <div>
          <!-- Brand Header -->
          <div
            class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-gradient-to-l from-blue-600/10 to-transparent"
          >
            <div
              class="w-11 h-11 rounded-2xl bg-white dark:bg-slate-100 border border-blue-200 dark:border-slate-700 flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0 p-1.5"
            >
              <img :src="jokerTechLogo" :alt="appStore.businessProfile.appName" class="w-full h-full object-contain" />
            </div>
            <div class="overflow-hidden">
              <div class="flex items-center gap-1.5">
                <h2 class="font-black text-base text-slate-900 dark:text-white truncate">
                  {{ appStore.businessProfile.appName }}
                </h2>
                <span
                  class="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono text-[10px] font-bold shrink-0"
                >
                  {{ appStore.appVersion }}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {{ appStore.businessProfile.loginSubtitle }}
              </p>
            </div>
          </div>

          <!-- Navigation Links -->
          <nav class="p-3 space-y-1">
            <router-link
              v-for="item in navItems"
              :key="item.name"
              :to="item.path"
              :class="[
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition',
                route.path.startsWith(item.path)
                  ? ['super-admin', 'system-control', 'program-settings'].includes(item.name)
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                    : 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              ]"
            >
              <component :is="item.icon" class="w-4 h-4 shrink-0" />
              <span>{{ item.label }}</span>
            </router-link>
          </nav>
        </div>

        <!-- Bottom User Profile & Logout -->
        <div class="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 space-y-1">
            <div class="font-black text-xs text-slate-900 dark:text-white truncate">
              {{ appStore.currentUser?.full_name }}
            </div>
            <div class="flex items-center justify-between gap-1">
              <span
                :class="[
                  'inline-block px-2 py-0.5 rounded-full text-[10px] font-bold truncate',
                  USER_ROLE_LABELS[appStore.currentUser?.role || 'tenant']?.badge
                ]"
              >
                {{ USER_ROLE_LABELS[appStore.currentUser?.role || 'tenant']?.label }}
              </span>
              <span class="text-[11px] font-mono text-slate-400 shrink-0">
                @{{ appStore.currentUser?.username }}
              </span>
            </div>
          </div>

          <!-- Quick Open in Browser / LAN Link (when LAN is enabled) -->
          <button
            v-if="primaryBrowserUrl"
            type="button"
            @click="openInBrowser"
            class="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/70 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70 text-xs font-bold transition cursor-pointer"
            :title="`فتح على المتصفح: ${primaryBrowserUrl}`"
          >
            <span class="flex items-center gap-1.5">
              <Globe class="w-3.5 h-3.5" />
              <span>فتح على المتصفح</span>
            </span>
            <span
              dir="ltr"
              class="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 truncate max-w-[115px]"
            >
              {{ primaryBrowserUrl.replace('http://', '') }}
            </span>
          </button>

          <!-- Quick Update Button -->
          <button
            type="button"
            @click="appStore.openUpdateModal"
            :class="[
              'w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border',
              appStore.availableUpdate?.updateAvailable
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 dark:text-blue-300 border-blue-200/70 dark:border-blue-800/70'
            ]"
          >
            <span class="flex items-center gap-1.5">
              <RefreshCw class="w-3.5 h-3.5" />
              <span>
                {{
                  appStore.availableUpdate?.updateAvailable
                    ? `تحديث متاح (v${appStore.availableUpdate.latestVersion})`
                    : 'تحديث البرنامج'
                }}
              </span>
            </span>
            <span
              :class="[
                'font-mono text-[10px] px-1.5 py-0.5 rounded-md',
                appStore.availableUpdate?.updateAvailable
                  ? 'bg-white/20 text-white'
                  : 'bg-white dark:bg-slate-900'
              ]"
            >
              {{ appStore.appVersion }}
            </span>
          </button>

          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="appStore.toggleTheme"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <Sun v-if="appStore.isDark" class="w-4 h-4 text-amber-400" />
              <Moon v-else class="w-4 h-4 text-slate-700" />
              <span>{{ appStore.isDark ? 'فاتح' : 'داكن' }}</span>
            </button>

            <button
              type="button"
              @click="handleLogout"
              class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 text-xs font-bold transition cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut class="w-4 h-4" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Viewport -->
      <main class="flex-1 overflow-y-auto p-6 space-y-4">
        <!-- Tampered Signature Alert Banner -->
        <div
          v-if="appStore.isBusinessLocked"
          class="no-print p-3.5 rounded-2xl bg-rose-600 text-white shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div class="flex items-center gap-2.5">
            <ShieldCheck class="w-5 h-5 text-amber-300" />
            <div>
              <span class="font-black">تنبيه أمان: تم رصد عدم تطابق في توقيع نشاط البرنامج!</span>
              <span class="text-rose-100 mr-2">
                تم تقييد بعض العمليات لحماية البيانات. يرجى من السوبر أدمن تأكيد النشاط لإلغاء القفل.
              </span>
            </div>
          </div>
          <router-link
            v-if="appStore.isSuperAdmin"
            to="/program-settings"
            class="px-3.5 py-1.5 rounded-xl bg-white text-rose-900 hover:bg-rose-50 font-black transition cursor-pointer"
          >
            الانتقال لإعدادات البرنامج
          </router-link>
        </div>

        <!-- First Run Initial Business Setup Banner -->
        <div
          v-if="appStore.needsBusinessSetup"
          class="no-print p-3.5 rounded-2xl bg-gradient-to-l from-purple-600 to-indigo-600 text-white shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div class="flex items-center gap-2.5">
            <Sparkles class="w-5 h-5 text-amber-300" />
            <div>
              <span class="font-black">مرحباً بك في أول تشغيل للبرنامج!</span>
              <span class="text-purple-100 mr-2">
                يرجى تحديد نوع النشاط (صيانة الأجهزة أو مركز السماعات الطبية) لتهيئة النظام والقوائم.
              </span>
            </div>
          </div>
          <router-link
            v-if="appStore.isSuperAdmin"
            to="/program-settings"
            class="px-3.5 py-1.5 rounded-xl bg-white text-purple-900 hover:bg-purple-50 font-black transition cursor-pointer"
          >
            تحديد نشاط البرنامج الآن
          </router-link>
        </div>

        <!-- 24-Hour Auto-Update Available Banner -->
        <div
          v-if="appStore.availableUpdate?.updateAvailable && !appStore.updateBannerDismissed"
          class="no-print p-3.5 rounded-2xl bg-gradient-to-l from-indigo-600 via-blue-600 to-indigo-700 text-white shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-white/15">
              <Sparkles class="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <span class="font-black">
                يتوفر إصدار جديد من برنامج {{ appStore.appName }} (v{{ appStore.availableUpdate.latestVersion }})!
              </span>
              <span class="text-blue-100 mr-2">
                تم اكتشاف التحديث تلقائياً — يمكنك التحميل والتثبيت الآن مع حفظ نسخة احتياطية كاملة لبياناتك.
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="appStore.openUpdateModal"
              class="px-3.5 py-1.5 rounded-xl bg-white text-indigo-900 hover:bg-blue-50 font-black transition cursor-pointer"
            >
              عرض وتثبيت التحديث الآن
            </button>
            <button
              type="button"
              @click="appStore.dismissUpdateBanner"
              class="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white cursor-pointer"
              title="إخفاء التنبيه"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          v-if="appStore.isBusinessLocked && !appStore.isSuperAdmin"
          class="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded-2xl p-8 text-center max-w-xl mx-auto my-12 space-y-4 shadow-sm"
        >
          <ShieldCheck class="w-12 h-12 text-rose-600 mx-auto" />
          <h2 class="text-lg font-black text-slate-900 dark:text-white">
            تم قفل النظام مؤقتاً لحماية البيانات
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            تم اكتشاف تعديل غير مصرح به في إعداد نشاط البرنامج بقاعدة البيانات. يرجى تسجيل الدخول بحساب السوبر أدمن لإعادة التحقق من النشاط وفتح القفل.
          </p>
        </div>
        <router-view v-else />
      </main>
    </div>

    <!-- First-Run Business Activity Setup Wizard -->
    <BusinessSetupWizard />

    <!-- Global Dual Print Engine Modal (A4 / 80mm Thermal) -->
    <PrintModal />

    <!-- Global Program Update Modal (Online & Offline) -->
    <UpdateModal />

    <!-- Global Image Lightbox Preview Modal -->
    <div
      v-if="appStore.imagePreviewOpen"
      @click.self="appStore.closeImagePreview"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden"
      >
        <div
          class="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
        >
          <h3 class="font-black text-sm">{{ appStore.imagePreviewTitle }}</h3>
          <button
            type="button"
            @click="appStore.closeImagePreview"
            class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="p-4 flex items-center justify-center bg-slate-950/5 max-h-[80vh] overflow-auto">
          <img
            :src="appStore.imagePreviewSrc"
            :alt="appStore.imagePreviewTitle"
            class="max-h-[72vh] w-auto object-contain rounded-xl shadow-md"
          />
        </div>
      </div>
    </div>

    <!-- Global Action Loading Overlay (Add / Save / Edit / Delete / Login) -->
    <div
      v-if="appStore.actionLoading"
      class="no-print fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 backdrop-blur-xs"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl px-7 py-5 flex items-center gap-4 min-w-[260px]"
      >
        <div
          class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"
        >
          <Loader2 class="w-6 h-6 animate-spin" />
        </div>
        <div>
          <div class="font-black text-sm text-slate-900 dark:text-white">
            {{ appStore.actionLoadingText }}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            يرجى الانتظار لحظات...
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
