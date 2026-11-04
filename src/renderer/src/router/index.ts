import { createRouter, createWebHashHistory } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import LoginView from '@renderer/views/LoginView.vue'
import DashboardView from '@renderer/views/DashboardView.vue'
import TicketsView from '@renderer/views/TicketsView.vue'
import CustomersView from '@renderer/views/CustomersView.vue'
import TechniciansView from '@renderer/views/TechniciansView.vue'
import InventoryView from '@renderer/views/InventoryView.vue'
import TreasuryView from '@renderer/views/TreasuryView.vue'
import ReportsView from '@renderer/views/ReportsView.vue'
import SettingsView from '@renderer/views/SettingsView.vue'
import SuperAdminView from '@renderer/views/SuperAdminView.vue'
import SystemControlView from '@renderer/views/SystemControlView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/',
      redirect: '/dashboard'
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true }
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: TicketsView,
      meta: { requiresAuth: true }
    },
    {
      path: '/customers',
      name: 'customers',
      component: CustomersView,
      meta: { requiresAuth: true }
    },
    {
      path: '/technicians',
      name: 'technicians',
      component: TechniciansView,
      meta: { requiresAuth: true }
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: InventoryView,
      meta: { requiresAuth: true }
    },
    {
      path: '/treasury',
      name: 'treasury',
      component: TreasuryView,
      meta: { requiresAuth: true, requiresFinancials: true }
    },
    {
      path: '/reports',
      name: 'reports',
      component: ReportsView,
      meta: { requiresAuth: true, requiresFinancials: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { requiresAuth: true, requiresManager: true }
    },
    {
      path: '/super-admin',
      name: 'super-admin',
      component: SuperAdminView,
      meta: { requiresAuth: true, requiresManageUsers: true }
    },
    {
      path: '/system-control',
      name: 'system-control',
      component: SystemControlView,
      meta: { requiresAuth: true, requiresSuperAdmin: true }
    }
  ]
})

router.beforeEach((to) => {
  const appStore = useAppStore()
  if (to.meta.requiresAuth && !appStore.isAuthenticated) {
    return { name: 'login' }
  }
  if (to.name === 'login' && appStore.isAuthenticated) {
    return { name: 'dashboard' }
  }
  if (to.meta.requiresSuperAdmin && !appStore.isSuperAdmin) {
    return { name: 'dashboard' }
  }
  if (to.meta.requiresFinancials && !appStore.canViewFinancials) {
    return { name: 'dashboard' }
  }
  if (to.meta.requiresManager && !appStore.isFullManager) {
    return { name: 'dashboard' }
  }
  if (to.meta.requiresManageUsers && !appStore.canManageUsers) {
    return { name: 'dashboard' }
  }
  return true
})

export default router
