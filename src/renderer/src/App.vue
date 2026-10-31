<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { USER_ROLE_LABELS } from '@renderer/constants/appliances'
import PrintModal from '@renderer/components/PrintModal.vue'
import UpdateModal from '@renderer/components/UpdateModal.vue'
import jokerTechLogo from '@renderer/assets/joker-tech-logo.png'
import {
  LayoutDashboard,
  Wrench,
  Users,
  UserCog,
  Package,
  Wallet,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  RefreshCw
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()

const navItems = computed(() => {
  const items = [
    { name: 'dashboard', path: '/dashboard', label: 'لوحة التحكم اليومية', icon: LayoutDashboard },
    { name: 'tickets', path: '/tickets', label: 'بلاغات وطلبات الصيانة', icon: Wrench },
    { name: 'customers', path: '/customers', label: 'العملاء وسجل الأجهزة', icon: Users },
    { name: 'technicians', path: '/technicians', label: 'الفنيين والعمولات', icon: UserCog },
    { name: 'inventory', path: '/inventory', label: 'المخزن وقطع الغيار', icon: Package },
    { name: 'treasury', path: '/treasury', label: 'الخزينة والحسابات', icon: Wallet },
    { name: 'settings', path: '/settings', label: 'إعدادات المركز والطباعة', icon: Settings }
  ]

  if (appStore.isSuperAdmin) {
    items.push({
      name: 'super-admin',
      path: '/super-admin',
      label: 'لوحة السوبر أدمن والتراخيص',
      icon: ShieldCheck
    })
  }
  return items
})

function handleLogout(): void {
  appStore.logout()
  router.push('/login')
}

onMounted(() => {
  appStore.applyTheme()
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
              <img :src="jokerTechLogo" alt="الجوكر تك" class="w-full h-full object-contain" />
            </div>
            <div class="overflow-hidden">
              <div class="flex items-center gap-1.5">
                <h2 class="font-black text-base text-slate-900 dark:text-white truncate">
                  صلحلي
                </h2>
                <span
                  class="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono text-[10px] font-bold shrink-0"
                >
                  {{ appStore.appVersion }}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                إدارة صيانة الأجهزة الكهربائية
              </p>
            </div>
          </div>

          <!-- Navigation Links -->
          <nav class="p-3 space-y-1.5">
            <router-link
              v-for="item in navItems"
              :key="item.name"
              :to="item.path"
              :class="[
                'flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition',
                route.path.startsWith(item.path)
                  ? item.name === 'super-admin'
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
        <div class="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 space-y-1">
            <div class="font-black text-xs text-slate-900 dark:text-white truncate">
              {{ appStore.currentUser?.full_name }}
            </div>
            <div class="flex items-center justify-between">
              <span
                :class="[
                  'inline-block px-2 py-0.5 rounded-full text-[10px] font-bold',
                  USER_ROLE_LABELS[appStore.currentUser?.role || 'tenant']?.badge
                ]"
              >
                {{
                  appStore.currentUser?.role === 'super_admin'
                    ? 'سوبر أدمن'
                    : appStore.currentUser?.role === 'owner'
                      ? 'مالك البرنامج'
                      : 'مستأجر البرنامج'
                }}
              </span>
              <span class="text-[11px] font-mono text-slate-400">
                @{{ appStore.currentUser?.username }}
              </span>
            </div>
          </div>

          <!-- Quick Update Button -->
          <button
            type="button"
            @click="appStore.openUpdateModal"
            class="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/70 text-xs font-bold transition cursor-pointer"
          >
            <span class="flex items-center gap-1.5">
              <RefreshCw class="w-3.5 h-3.5" />
              <span>تحديث البرنامج</span>
            </span>
            <span class="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900">
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

          <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <div class="flex items-center gap-1.5">
              <img :src="jokerTechLogo" alt="الجوكر تك" class="w-4 h-4 object-contain bg-white rounded-xs p-0.5" />
              <span class="font-bold text-slate-600 dark:text-slate-400">تطوير: الجوكر تك</span>
            </div>
            <span class="font-mono font-bold">{{ appStore.appVersion }}</span>
          </div>
        </div>
      </aside>

      <!-- Main Viewport -->
      <main class="flex-1 overflow-y-auto p-6">
        <router-view />
      </main>
    </div>

    <!-- Global Dual Print Engine Modal (A4 / 80mm Thermal) -->
    <PrintModal />

    <!-- Global Program Update Modal (Online & Offline) -->
    <UpdateModal />
  </div>
</template>
