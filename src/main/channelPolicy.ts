import type { UserRole } from '../shared/types'
import type { SessionInfo } from './session'

export type ChannelPermission =
  | 'public'
  | 'authenticated'
  | 'medical'
  | 'manager'
  | 'financial'
  | 'inventory'
  | 'sales_ops'
  | 'super_admin'

export const CHANNEL_PERMISSIONS: Record<string, ChannelPermission> = {
  // Public
  'auth:login': 'public',
  'auth:verifySession': 'public',
  'app:version': 'public',
  'settings:get': 'public',
  'business:getPublic': 'public',

  // Authenticated (All logged-in staff)
  'shell:openExternal': 'authenticated',
  'auth:logout': 'authenticated',
  'dashboard:stats': 'authenticated',
  'customers:list': 'authenticated',
  'customers:findByPhone': 'authenticated',
  'customers:appliances': 'authenticated',
  'customers:save': 'authenticated',
  'customers:saveAppliance': 'authenticated',
  'technicians:list': 'authenticated',
  'parts:list': 'authenticated',
  'tickets:list': 'authenticated',
  'tickets:save': 'authenticated',
  'tickets:updateImages': 'authenticated',
  'inventory:list': 'authenticated',
  'lookups:list': 'authenticated',
  'customFields:list': 'authenticated',
  'products:list': 'authenticated',
  'products:getByBarcode': 'authenticated',
  'products:serials:list': 'authenticated',
  'suppliers:list': 'authenticated',
  'sales:list': 'authenticated',
  'returns:list': 'authenticated',
  'exchanges:list': 'authenticated',
  'tickets:lookupSerialOrInvoice': 'authenticated',
  'tickets:returnLoaner': 'authenticated',

  // Medical (super_admin, owner - Sensitive Audiology & Patient Medical Data)
  'patients:profile': 'medical',
  'hearingTests:list': 'medical',
  'hearingTests:save': 'medical',
  'hearingTests:latestSummary': 'medical',
  'followups:list': 'medical',
  'followups:save': 'medical',
  'followups:complete': 'medical',
  'earmolds:list': 'medical',
  'earmolds:save': 'medical',
  'earmolds:updateStatus': 'medical',
  'earmolds:remake': 'medical',
  'implants:list': 'medical',
  'implants:save': 'medical',
  'implants:sessions:save': 'medical',
  'attachments:list': 'medical',
  'attachments:upload': 'medical',
  'attachments:open': 'medical',

  // Managers (super_admin, owner)
  'tickets:delete': 'manager',
  'hearingTests:delete': 'manager',
  'followups:delete': 'manager',
  'earmolds:delete': 'manager',
  'implants:delete': 'manager',
  'implants:sessions:delete': 'manager',
  'attachments:delete': 'manager',
  'customers:delete': 'manager',
  'customers:deleteAppliance': 'manager',
  'parts:delete': 'manager',
  'products:delete': 'manager',
  'products:serials:delete': 'manager',
  'suppliers:delete': 'manager',
  'purchases:delete': 'manager',
  'sales:delete': 'manager',
  'technicians:save': 'manager',
  'technicians:delete': 'manager',
  'treasury:delete': 'manager',
  'settings:save': 'manager',
  'users:list': 'manager',
  'users:save': 'manager',
  'users:delete': 'manager',
  'lookups:save': 'manager',
  'lookups:delete': 'manager',
  'lookups:reorder': 'manager',
  'customFields:save': 'manager',
  'customFields:delete': 'manager',
  'customFields:reorder': 'manager',
  'backup:create': 'manager',
  'backup:autoNow': 'manager',
  'backup:chooseDir': 'manager',
  'backup:createTicket': 'manager',
  'db:path': 'manager',

  // Financial (super_admin, owner)
  'treasury:list': 'financial',
  'treasury:add': 'financial',
  'treasury:transfer': 'financial',
  'treasury:collectReceivable': 'financial',
  'reports:financial': 'financial',
  'suppliers:statement': 'financial',
  'sales:collectInstallment': 'financial',

  // Sales Operations (super_admin, owner)
  'sales:save': 'sales_ops',

  // Inventory (super_admin, owner)
  'purchases:list': 'inventory',
  'parts:save': 'inventory',
  'inventory:movement': 'inventory',
  'products:save': 'inventory',
  'products:serials:add': 'inventory',
  'products:serials:updateStatus': 'inventory',
  'products:adjustStock': 'inventory',
  'suppliers:save': 'inventory',
  'suppliers:pay': 'financial',
  'purchases:save': 'inventory',
  'returns:sales:create': 'inventory',
  'returns:purchases:create': 'inventory',
  'exchanges:process': 'inventory',

  // Super Admin Only
  'backup:restore': 'super_admin',
  'update:check': 'super_admin',
  'update:downloadAndInstall': 'super_admin',
  'update:startDownload': 'super_admin',
  'update:pauseDownload': 'super_admin',
  'update:cancelDownload': 'super_admin',
  'update:applyDownloaded': 'super_admin',
  'update:getDownloadStatus': 'super_admin',
  'update:installLocal': 'super_admin',
  'update:getAutoResult': 'super_admin',
  'system:status': 'super_admin',
  'system:setBrowserConfig': 'super_admin',
  'system:setLanConfig': 'super_admin',
  'system:setAutoStart': 'super_admin',
  'db:reset': 'super_admin',

  // Business Profile & Demo Data Management (super_admin, owner)
  'business:get': 'manager',
  'business:setInitial': 'manager',
  'business:checkSwitch': 'manager',
  'business:switch': 'manager',
  'demo:seed': 'manager',
  'demo:remove': 'manager',
  'demo:status': 'manager',
  'demo:setHidden': 'manager'
}

export const CHANNEL_REQUIRED_MODULE: Record<string, string> = {
  // Sales Module
  'sales:list': 'sales',
  'sales:save': 'sales',
  'sales:collectInstallment': 'sales',
  'sales:delete': 'sales',
  'returns:sales:create': 'sales',
  'exchanges:list': 'sales',
  'exchanges:process': 'sales',

  // Purchases Module
  'purchases:list': 'purchases',
  'purchases:save': 'purchases',
  'purchases:delete': 'purchases',
  'returns:purchases:create': 'purchases',

  // Products & Serials
  'products:list': 'products',
  'products:getByBarcode': 'products',
  'products:save': 'products',
  'products:delete': 'products',
  'products:serials:list': 'products',
  'products:serials:add': 'products',
  'products:serials:updateStatus': 'products',
  'products:serials:delete': 'products',
  'products:adjustStock': 'products',

  // Suppliers
  'suppliers:list': 'suppliers',
  'suppliers:save': 'suppliers',
  'suppliers:delete': 'suppliers',
  'suppliers:statement': 'suppliers',
  'suppliers:pay': 'suppliers',

  // Audiology & Medical Patients Module
  'patients:profile': 'followups',
  'hearingTests:list': 'followups',
  'hearingTests:save': 'followups',
  'hearingTests:delete': 'followups',
  'hearingTests:latestSummary': 'followups',
  'followups:list': 'followups',
  'followups:save': 'followups',
  'followups:complete': 'followups',
  'followups:delete': 'followups',
  'earmolds:list': 'followups',
  'earmolds:save': 'followups',
  'earmolds:updateStatus': 'followups',
  'earmolds:remake': 'followups',
  'earmolds:delete': 'followups',
  'implants:list': 'followups',
  'implants:save': 'followups',
  'implants:delete': 'followups',
  'implants:sessions:save': 'followups',
  'implants:sessions:delete': 'followups',
  'attachments:list': 'followups',
  'attachments:upload': 'followups',
  'attachments:open': 'followups',
  'attachments:delete': 'followups',

  // Core Shared Modules
  'tickets:list': 'tickets',
  'tickets:save': 'tickets',
  'tickets:updateImages': 'tickets',
  'tickets:delete': 'tickets',
  'parts:list': 'inventory',
  'parts:save': 'inventory',
  'parts:delete': 'inventory',
  'inventory:movement': 'inventory',
  'inventory:list': 'inventory',
  'technicians:list': 'technicians',
  'technicians:save': 'technicians',
  'technicians:delete': 'technicians',
  'treasury:list': 'treasury',
  'treasury:add': 'treasury',
  'treasury:transfer': 'treasury',
  'treasury:collectReceivable': 'treasury',
  'treasury:delete': 'treasury',
  'reports:financial': 'reports'
}

export function isRoleAuthorized(role: UserRole, permission: ChannelPermission): boolean {
  if (role === 'super_admin') return true
  if (permission === 'public') return true
  if (permission === 'authenticated') return true
  if (permission === 'super_admin') return false
  return role === 'owner'
}

export function checkChannelAccess(
  channel: string,
  session: SessionInfo | null,
  activeModules?: string[]
): { allowed: boolean; reason?: string } {
  const permission = CHANNEL_PERMISSIONS[channel]
  if (!permission) {
    // Deny by default
    return {
      allowed: false,
      reason: `القناة (${channel}) غير مصرح بالوصول إليها (Deny by default).`
    }
  }

  if (permission === 'public') {
    return { allowed: true }
  }

  if (!session) {
    return {
      allowed: false,
      reason: 'يجب تسجيل الدخول أولاً لتنفيذ هذه العملية.'
    }
  }

  if (!isRoleAuthorized(session.role, permission)) {
    return {
      allowed: false,
      reason: `عفواً، حسابك (${session.role}) لا يمتلك الصلاحيات الكافية لتنفيذ هذه العملية.`
    }
  }

  // Backend Module Enforcement
  if (activeModules && Array.isArray(activeModules)) {
    if (channel === 'returns:list') {
      const hasSalesOrPurchases = activeModules.includes('sales') || activeModules.includes('purchases')
      if (!hasSalesOrPurchases) {
        return {
          allowed: false,
          reason: 'MODULE_NOT_ALLOWED: وحدة المرتجعات غير مفعلة في نشاط البرنامج الحالي.'
        }
      }
    } else {
      const requiredModule = CHANNEL_REQUIRED_MODULE[channel]
      if (requiredModule && !activeModules.includes(requiredModule)) {
        return {
          allowed: false,
          reason: `MODULE_NOT_ALLOWED: الوحدة (${requiredModule}) غير مفعلة في نشاط البرنامج الحالي.`
        }
      }
    }
  }

  return { allowed: true }
}

