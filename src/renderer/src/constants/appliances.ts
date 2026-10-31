export const APPLIANCE_TYPES = [
  'غسالة أوتوماتيك',
  'غسالة فوق أوتوماتيك',
  'غسالة هاف أوتوماتيك',
  'مجفف ملابس (دراير)',
  'غسالة أطباق',
  'ثلاجة نوفروست',
  'ثلاجة ديفروست',
  'ثلاجة دوبلكس / انفرتر',
  'ديب فريزر رأسي (أدراج)',
  'ديب فريزر أفقي (صندوق)',
  'تكييف سبليت',
  'تكييف شباك / كونسيلد',
  'بوتاجاز غاز / بلت إن',
  'سخان غاز',
  'سخان كهرباء',
  'ميكروويف / فرن كهربائي',
  'مبرد مياه (كولديير)',
  'جهاز كهربائي آخر'
]

export const APPLIANCE_BRANDS = [
  'LG (إل جي)',
  'Samsung (سامسونج)',
  'Toshiba (توشيبا)',
  'Sharp (شارب)',
  'Fresh (فريش)',
  'Kiriazi (كريازي)',
  'Zanussi (زانوسي)',
  'Beko (بيكو)',
  'Tornado (تورنيدو)',
  'Unionaire (يونيون إير)',
  'Carrier (كاريير)',
  'Ariston (أريستون)',
  'Indesit (إنديست)',
  'White Point (وايت بوينت)',
  'White Whale (وايت ويل)',
  'Hoover (هوفر)',
  'Olympic (أوليمبيك)',
  'Universal (يونيفرسال)',
  'Electrostar (إلكتروستار)',
  'Passap (باساب)',
  'أخرى'
]

export const PART_CATEGORIES = [
  'غسالات',
  'ثلاجات وديب فريزر',
  'تكييفات',
  'بوتاجازات وسخانات',
  'كروت إلكترونية وحساسات',
  'مواتير وكباسات',
  'فريون وخامات تبريد',
  'عام'
]

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
  }
}
