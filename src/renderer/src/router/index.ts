import { createRouter, createWebHashHistory } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import LoginView from '@renderer/views/LoginView.vue'

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
      component: () => import('@renderer/views/DashboardView.vue'),
      meta: { requiresAuth: true, module: 'dashboard' }
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: () => import('@renderer/views/TicketsView.vue'),
      meta: { requiresAuth: true, module: 'tickets' }
    },
    {
      path: '/customers',
      name: 'customers',
      component: () => import('@renderer/views/CustomersView.vue'),
      meta: { requiresAuth: true, module: 'customers' }
    },
    {
      path: '/followups',
      name: 'followups',
      component: () => import('@renderer/views/FollowupsView.vue'),
      meta: { requiresAuth: true, module: 'followups' }
    },
    {
      path: '/products',
      name: 'products',
      component: () => import('@renderer/views/ProductsView.vue'),
      meta: { requiresAuth: true, module: 'products' }
    },
    {
      path: '/sales',
      name: 'sales',
      component: () => import('@renderer/views/SalesView.vue'),
      meta: { requiresAuth: true, module: 'sales' }
    },
    {
      path: '/purchases',
      name: 'purchases',
      component: () => import('@renderer/views/PurchasesView.vue'),
      meta: { requiresAuth: true, module: 'purchases' }
    },
    {
      path: '/suppliers',
      name: 'suppliers',
      component: () => import('@renderer/views/SuppliersView.vue'),
      meta: { requiresAuth: true, module: 'suppliers' }
    },
    {
      path: '/technicians',
      name: 'technicians',
      component: () => import('@renderer/views/TechniciansView.vue'),
      meta: { requiresAuth: true, module: 'technicians' }
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@renderer/views/InventoryView.vue'),
      meta: { requiresAuth: true, module: 'inventory' }
    },
    {
      path: '/treasury',
      name: 'treasury',
      component: () => import('@renderer/views/TreasuryView.vue'),
      meta: { requiresAuth: true, requiresFinancials: true, module: 'treasury' }
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('@renderer/views/ReportsView.vue'),
      meta: { requiresAuth: true, requiresFinancials: true, module: 'reports' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@renderer/views/SettingsView.vue'),
      meta: { requiresAuth: true, requiresManager: true, module: 'settings' }
    },
    {
      path: '/program-settings',
      name: 'program-settings',
      component: () => import('@renderer/views/ProgramSettingsView.vue'),
      meta: { requiresAuth: true, requiresSuperAdmin: true }
    },
    {
      path: '/super-admin',
      name: 'super-admin',
      component: () => import('@renderer/views/SuperAdminView.vue'),
      meta: { requiresAuth: true, requiresManageUsers: true }
    },
    {
      path: '/system-control',
      name: 'system-control',
      component: () => import('@renderer/views/SystemControlView.vue'),
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
