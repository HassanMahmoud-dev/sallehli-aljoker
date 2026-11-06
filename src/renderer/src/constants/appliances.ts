import { APPLIANCES_PROFILE } from '@shared/businessProfiles'

export const APPLIANCE_TYPES = APPLIANCES_PROFILE.defaultDeviceTypes
export const APPLIANCE_BRANDS = APPLIANCES_PROFILE.defaultBrands
export const PART_CATEGORIES = APPLIANCES_PROFILE.defaultPartCategories


export const TICKET_STATUS_MAP: Record<
  string,
  { label: string; badgeClass: string }
> = {
  new: {
    label: 'بلاغ جديد',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800'
  },
  assigned: {
    label: 'تم تعيين فني',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
  },
  inspecting: {
    label: 'تحت الفحص والكشف',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  },
  waiting_parts: {
    label: 'بانتظار قطعة غيار / موافقة',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800'
  },
  sent_to_lab: {
    label: 'أُرسلت للشركة / المعمل (صيانة خارجية)',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800'
  },
  returned_from_lab: {
    label: 'عادت من الشركة / المعمل',
    badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
  },
  repaired: {
    label: 'تم الإصلاح (جاهز للتسليم)',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  },
  delivered: {
    label: 'تم التسليم والتحصيل',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800'
  },
  cancelled: {
    label: 'ملغي / مرتجع بدون إصلاح',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800'
  }
}

export const PAYMENT_METHODS: Record<string, string> = {
  cash: 'نقدي (كاش)',
  vodafone_cash: 'محفظة إلكترونية (فودافون كاش)',
  instapay: 'إنستا باي (InstaPay)',
  bank: 'تحويل بنكي / فيزا'
}

export const USER_ROLE_LABELS: Record<string, { label: string; desc: string; badge: string }> = {
  super_admin: {
    label: 'سوبر أدمن (مالك البرنامج بالكامل)',
    desc: 'تحكم كامل بالنظام والتراخيص والمستخدمين',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
  },
  owner: {
    label: 'مالك البرنامج (ترخيص دائم)',
    desc: 'صلاحية دائمة لإدارة مركز الصيانة بالكامل',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  },
  tenant: {
    label: 'مستأجر البرنامج (اشتراك محدد بمدة)',
    desc: 'صلاحية إدارة المركز خلال فترة الإيجار المحددة',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  },
  receptionist: {
    label: 'موظف استقبال وخدمة عملاء',
    desc: 'تسجيل الطلبات والعملاء بدون رؤية الخزينة والأرباح',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
  },
  cashier: {
    label: 'كاشير / محاسب مالي',
    desc: 'إدارة البلاغات والعملاء والخزينة والتقارير المالية',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'
  },
  storekeeper: {
    label: 'أمين / مسؤول المخزن',
    desc: 'إدارة المخزن والمستلزمات وعهدة الفنيين وطلبات الصيانة',
    badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
  }
}
