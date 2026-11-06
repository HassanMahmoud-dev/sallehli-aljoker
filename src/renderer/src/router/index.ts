import { createRouter, createWebHashHistory } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import LoginView from '@renderer/views/LoginView.vue'
import DashboardView from '@renderer/views/DashboardView.vue'
import TicketsView from '@renderer/views/TicketsView.vue'
import CustomersView from '@renderer/views/CustomersView.vue'
import ProductsView from '@renderer/views/ProductsView.vue'
import SuppliersView from '@renderer/views/SuppliersView.vue'
import PurchasesView from '@renderer/views/PurchasesView.vue'
import SalesView from '@renderer/views/SalesView.vue'
import FollowupsView from '@renderer/views/FollowupsView.vue'
import TechniciansView from '@renderer/views/TechniciansView.vue'
import InventoryView from '@renderer/views/InventoryView.vue'
import TreasuryView from '@renderer/views/TreasuryView.vue'
import ReportsView from '@renderer/views/ReportsView.vue'
import SettingsView from '@renderer/views/SettingsView.vue'
import SuperAdminView from '@renderer/views/SuperAdminView.vue'
import SystemControlView from '@renderer/views/SystemControlView.vue'
import ProgramSettingsView from '@renderer/views/ProgramSettingsView.vue'

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
      meta: { requiresAuth: true, module: 'dashboard' }
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: TicketsView,
      meta: { requiresAuth: true, module: 'tickets' }
    },
    {
      path: '/customers',
      name: 'customers',
      component: CustomersView,
      meta: { requiresAuth: true, module: 'customers' }
    },
    {
      path: '/followups',
      name: 'followups',
      component: FollowupsView,
      meta: { requiresAuth: true, module: 'followups' }
    },
    {
      path: '/products',
      name: 'products',
      component: ProductsView,
      meta: { requiresAuth: true, module: 'products' }
    },
    {
      path: '/sales',
      name: 'sales',
      component: SalesView,
      meta: { requiresAuth: true, module: 'sales' }
    },
    {
      path: '/purchases',
      name: 'purchases',
      component: PurchasesView,
      meta: { requiresAuth: true, module: 'purchases' }
    },
    {
      path: '/suppliers',
      name: 'suppliers',
      component: SuppliersView,
      meta: { requiresAuth: true, module: 'suppliers' }
    },
    {
      path: '/technicians',
      name: 'technicians',
      component: TechniciansView,
      meta: { requiresAuth: true, module: 'technicians' }
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: InventoryView,
      meta: { requiresAuth: true, module: 'inventory' }
    },
    {
      path: '/treasury',
      name: 'treasury',
      component: TreasuryView,
      meta: { requiresAuth: true, requiresFinancials: true, module: 'treasury' }
    },
    {
      path: '/reports',
      name: 'reports',
      component: ReportsView,
      meta: { requiresAuth: true, requiresFinancials: true, module: 'reports' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { requiresAuth: true, requiresManager: true, module: 'settings' }
    },
    {
      path: '/program-settings',
      name: 'program-settings',
      component: ProgramSettingsView,
      meta: { requiresAuth: true, requiresSuperAdmin: true }
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
    if (appStore.isSuperAdmin && (appStore.isBusinessLocked || appStore.needsBusinessSetup)) {
      return { name: 'program-settings' }
    }
    return { name: 'dashboard' }
  }
  if (
    appStore.isAuthenticated &&
    (appStore.isBusinessLocked || appStore.needsBusinessSetup) &&
    appStore.isSuperAdmin &&
    to.name !== 'program-settings'
  ) {
    return { name: 'program-settings' }
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
  if (to.meta.module && appStore.businessProfile) {
    if (!appStore.businessProfile.modules.includes(to.meta.module as string)) {
      return { name: 'dashboard' }
    }
  }
  return true
})

export default router
