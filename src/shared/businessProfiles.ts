import type { BusinessType, LookupCategory, CustomFieldEntity, CustomFieldType } from './types'

export interface DefaultCustomFieldSeed {
  entity: CustomFieldEntity
  key: string
  label: string
  type: CustomFieldType
  options?: string[]
  required?: number
  show_in_table?: number
  sort_order?: number
}

export interface BusinessProfile {
  id: BusinessType
  appName: string
  windowTitle: string
  loginSubtitle: string
  centerNameDefault: string
  centerSubtitleDefault: string
  receiptFooterDefault: string
  terms: Record<string, string>
  modules: string[]
  defaultDeviceTypes: string[]
  defaultBrands: string[]
  defaultPartCategories: string[]
  extraLookups?: Partial<Record<LookupCategory, string[]>>
  defaultCustomFields?: DefaultCustomFieldSeed[]
}

export const APPLIANCES_PROFILE: BusinessProfile = {
  id: 'appliances',
  appName: 'صلحلي',
  windowTitle: 'صلحلي - نظام إدارة مراكز صيانة الأجهزة المنزلية والكهربائية',
  loginSubtitle: 'نظام إدارة مراكز صيانة الأجهزة المنزلية والكهربائية',
  centerNameDefault: 'مركز صلحلي للصيانة المعتمدة',
  centerSubtitleDefault: 'صيانة جميع الأجهزة المنزلية والكهربائية',
  receiptFooterDefault: 'شكراً لثقتكم في مركز صلحلي - خدمتكم شرف لنا على مدار الساعة',
  terms: {
    device: 'جهاز',
    devices: 'الأجهزة',
    deviceType: 'نوع الجهاز',
    deviceRegistry: 'سجل الأجهزة',
    brand: 'الماركة',
    brandDesc: 'الماركة التجارية أو الشركة المصنعة',
    part: 'قطعة غيار',
    parts: 'قطع الغيار',
    partsStore: 'المخزن وقطع الغيار',
    ticket: 'طلب صيانة',
    tickets: 'طلبات الصيانة',
    ticketsPage: 'بلاغات وطلبات الصيانة',
    customer: 'العميل',
    customers: 'العملاء',
    customersPage: 'العملاء وسجل الأجهزة',
    technician: 'فني الصيانة',
    technicians: 'الفنيين',
    inspectionFee: 'تكلفة الكشف / الفحص',
    warranty: 'ضمان الصيانة',
    battery: 'بطارية',
    accessory: 'ملحق / إكسسوار',
    earmold: 'قالب',
    implant: 'وحدة إلكترونية',
    exchange: 'استبدال',
    loaner: 'جهاز بديل',
    modelPlaceholder: 'مثال: 8 كيلو انفرتر / 16 قدم',
    complaintPlaceholder: 'مثال: الجهاز لا يعمل أو يصدر صوتاً مرتفعاً أثناء التشغيل...',
    diagnosisPlaceholder: 'مثال: تم الكشف وتغيير القطعة التالفة وتجربة الجهاز بالكامل...',
    specialtyDefault: 'صيانة أجهزة منزلية وكهربائية',
    specialtyPlaceholder: 'مثال: صيانة ميكانيكية / تبريد وتكييف / كروت إلكترونية',
    partNamePlaceholder: 'مثال: طلمبة طرد أصلية / حساس حرارة',
    productsPage: 'المنتجات والأصناف',
    suppliersPage: 'الموردون والشركات'
  },
  modules: [
    'dashboard',
    'tickets',
    'customers',
    'technicians',
    'inventory',
    'treasury',
    'reports',
    'settings'
  ],
  defaultDeviceTypes: [
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
  ],
  defaultBrands: [
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
  ],
  defaultPartCategories: [
    'غسالات',
    'ثلاجات وديب فريزر',
    'تكييفات',
    'بوتاجازات وسخانات',
    'كروت إلكترونية وحساسات',
    'مواتير وكباسات',
    'فريون وخامات تبريد',
    'عام'
  ]
}

export const HEARING_AIDS_PROFILE: BusinessProfile = {
  id: 'hearing_aids',
  appName: 'أريتون',
  windowTitle: 'أريتون - نظام إدارة مركز السماعات الطبية',
  loginSubtitle: 'نظام إدارة مراكز وتوكيلات السماعات الطبية',
  centerNameDefault: 'مركز أريتون للسماعات الطبية',
  centerSubtitleDefault: 'بيع وصيانة السماعات الطبية وفحوصات السمع وضبط الأجهزة',
  receiptFooterDefault: 'شكراً لثقتكم في مركز أريتون للسماعات الطبية - نتمنى لكم دوام الصحة والعافية',
  terms: {
    device: 'سماعة / قوقعة',
    devices: 'السماعات والقواقع',
    deviceType: 'نوع السماعة / القوقعة',
    deviceRegistry: 'سجل السماعات والقواقع',
    brand: 'الماركة / الشركة',
    brandDesc: 'الشركة المصنعة للسماعة أو القوقعة الطبية',
    part: 'ملحق / بطارية',
    parts: 'الملحقات والبطاريات',
    partsStore: 'المخزن والملحقات',
    ticket: 'طلب صيانة / ضبط',
    tickets: 'طلبات الصيانة والضبط',
    ticketsPage: 'طلبات الصيانة وضبط السماعات',
    customer: 'المريض / العميل',
    customers: 'المرضى والعملاء',
    customersPage: 'المرضى وسجل السماعات',
    technician: 'أخصائي / فني السمعيات',
    technicians: 'أخصائيو وفنيو السمعيات',
    inspectionFee: 'تكلفة الفحص / البرمجة',
    warranty: 'الضمان',
    battery: 'بطارية',
    accessory: 'إكسسوار / ملحق',
    earmold: 'قالب أذن',
    implant: 'قوقعة إلكترونية',
    exchange: 'استبدال',
    loaner: 'سماعة بديلة',
    modelPlaceholder: 'مثال: Naida P90 / More 1 / Nucleus 8',
    complaintPlaceholder: 'مثال: ضعف أو انقطاع في الصوت / تحتاج تغيير تيوب أو فلتر أو إعادة برمجة...',
    diagnosisPlaceholder: 'مثال: تم فحص السماعة وتغيير التيوب وتنظيف الفلتر وضبط البرمجة...',
    specialtyDefault: 'فحوصات وقياس سمع وبرمجة وصيانة سماعات',
    specialtyPlaceholder: 'مثال: أخصائي سمعيات وبرمجة / فني صيانة سماعات وقوالب',
    partNamePlaceholder: 'مثال: بطاريات مقاس 13 / فلتر شمع / كابل ملف قوقعة',
    productsPage: 'المنتجات والسماعات والبطاريات',
    suppliersPage: 'الموردون والشركات',
    purchasesPage: 'فواتير المشتريات والمستعمل',
    salesPage: 'المبيعات والبيع السريع (POS)',
    followupsPage: 'المتابعات والقوالب والقوقعة'
  },
  modules: [
    'dashboard',
    'sales',
    'purchases',
    'tickets',
    'customers',
    'followups',
    'products',
    'suppliers',
    'technicians',
    'inventory',
    'treasury',
    'reports',
    'settings'
  ],
  defaultDeviceTypes: [
    'سماعة خلف الأذن (BTE)',
    'سماعة داخل الأذن (ITE)',
    'سماعة داخل القناة (ITC)',
    'سماعة قناة داخلية بالكامل (CIC)',
    'سماعة غير مرئية في القناة (IIC)',
    'سماعة المستقبل في القناة (RIC / RIE)',
    'قوقعة إلكترونية - معالج صوت (Cochlear Implant)',
    'نظارة سمعية (Bone Conduction)',
    'ملحقات وإكسسوارات سمعية'
  ],
  defaultBrands: [
    'Phonak (فونَاك)',
    'Oticon (أوتيكون)',
    'Signia (سيجنيا / سيمنز)',
    'Resound (ريساوند)',
    'Widex (وايدكس)',
    'Starkey (ستاركي)',
    'Cochlear (كوكلير - قوقعة)',
    'MED-EL (ميد-إل - قوقعة)',
    'Advanced Bionics (أدفانسد بيونيكس - قوقعة)',
    'Unitron (يونترون)',
    'Bernafon (بيرنافون)',
    'Audio Service (أوديو سيرفيس)',
    'ماركة / شركة أخرى'
  ],
  defaultPartCategories: [
    'بطاريات سماعات وقوقعة',
    'قوالب أذن (Earmolds)',
    'فلاتر ومرشحات شمع',
    'خراطيم وقنوات صوت (Tubes & Domes)',
    'قطع غيار ومستقبلات (Receivers & Mics)',
    'قطع ومستلزمات القوقعة الإلكترونية',
    'مجففات ومنظفات وحافظات',
    'أجهزة تحكم وإكسسوارات لاسلكية',
    'عام'
  ],
  extraLookups: {
    battery_size: [
      'مقاس 10 (أصفر)',
      'مقاس 312 (بني)',
      'مقاس 13 (برتقالي)',
      'مقاس 675 (أزرق)',
      'مقاس 675 قوقعة (Implant Plus)',
      'بطارية قابلة للشحن (Rechargeable)'
    ],
    accessory_type: [
      'قناة صوت (Tube)',
      'مجفف سماعات (Dryer)',
      'منظفات وفرش تعقيم',
      'حافظة سماعة (Case)',
      'فلاتر / مرشحات شمع (Wax Guards)',
      'جهاز تحكم عن بعد (Remote Control)',
      'قبب سيليكون (Domes)'
    ],
    earmold_type: [
      'قالب كامل (Full Shell)',
      'نصف قالب (Half Shell)',
      'قالب مفرغ (Skeleton)',
      'قالب قناة (Canal)',
      'قالب سباحة (Swim Plug)',
      'قالب حماية من الضوضاء (Noise Protection)'
    ],
    earmold_material: [
      'أكريليك صلب (Hard Acrylic)',
      'سيليكون طبي مرن (Soft Silicone)',
      'سيليكون مضاد للحساسية (Biopor)'
    ],
    implant_part: [
      'معالج صوت خارجي (Sound Processor)',
      'ملف إرسال (Coil)',
      'كابل ملف إرسال (Coil Cable)',
      'مغناطيس (Magnet)',
      'بطارية قابلة للشحن للقوقعة',
      'شاحن بطاريات قوقعة',
      'حافظة / غطاء حماية (Cover)',
      'خطاف أذن / ميكروفون'
    ]
  },
  defaultCustomFields: [
    {
      entity: 'device',
      key: 'ear_side',
      label: 'جهة الأذن',
      type: 'select',
      options: ['يمين (Right)', 'يسار (Left)', 'الاثنان معاً (Bilateral)'],
      required: 1,
      show_in_table: 1,
      sort_order: 1
    },
    {
      entity: 'device',
      key: 'serial_right',
      label: 'الرقم التسلسلي - أذن يمين (R)',
      type: 'text',
      required: 0,
      show_in_table: 1,
      sort_order: 2
    },
    {
      entity: 'device',
      key: 'serial_left',
      label: 'الرقم التسلسلي - أذن يسار (L)',
      type: 'text',
      required: 0,
      show_in_table: 1,
      sort_order: 3
    },
    {
      entity: 'device',
      key: 'earmold_spec',
      label: 'مقاس / نوع القالب',
      type: 'select',
      options: [
        'بدون قالب (Dome)',
        'قالب كامل (Full Shell)',
        'نصف قالب (Half Shell)',
        'قالب مفرغ (Skeleton)',
        'قالب قناة (Canal)',
        'قالب مخصص'
      ],
      required: 0,
      show_in_table: 0,
      sort_order: 4
    },
    {
      entity: 'device',
      key: 'company_warranty_start',
      label: 'تاريخ بداية ضمان الشركة',
      type: 'date',
      required: 0,
      show_in_table: 0,
      sort_order: 5
    },
    {
      entity: 'device',
      key: 'company_warranty_end',
      label: 'تاريخ انتهاء ضمان الشركة',
      type: 'date',
      required: 0,
      show_in_table: 1,
      sort_order: 6
    },
    {
      entity: 'device',
      key: 'power_level',
      label: 'مستوى القدرة (Power)',
      type: 'select',
      options: [
        'Standard (عادي)',
        'M (متوسط)',
        'P (قوي - Power)',
        'SP (فائق القوة - Super Power)',
        'UP (Ultra Power)'
      ],
      required: 0,
      show_in_table: 0,
      sort_order: 7
    }
  ]
}

export const BUSINESS_PROFILES: Record<BusinessType, BusinessProfile> = {
  appliances: APPLIANCES_PROFILE,
  hearing_aids: HEARING_AIDS_PROFILE
}

export function getBusinessProfile(type: BusinessType = 'appliances'): BusinessProfile {
  return BUSINESS_PROFILES[type] || APPLIANCES_PROFILE
}


