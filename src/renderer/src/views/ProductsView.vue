<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { useAppStore } from '@renderer/stores/appStore'
import { compressImageFile } from '@renderer/utils/imageHelper'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import type {
  Product,
  ProductType,
  ProductVariant,
  ProductSerial,
  SerialStatus,
  SerialCondition
} from '@shared/types'
import {
  Package,
  PlusCircle,
  Search,
  Edit3,
  Trash2,
  Hash,
  Layers,
  BatteryCharging,
  Sparkles,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle2,
  Barcode,
  Upload,
  X
} from 'lucide-vue-next'

const appStore = useAppStore()

const products = ref<Product[]>([])
const allSerials = ref<ProductSerial[]>([])
const searchQuery = ref('')
const activeTab = ref<
  'all' | 'hearing_aid' | 'cochlear' | 'battery' | 'accessory' | 'service' | 'serials'
>('all')
const serialStatusFilter = ref<string>('all')

const productModalOpen = ref(false)
const serialsModalOpen = ref(false)
const stockModalOpen = ref(false)

const selectedProductForSerials = ref<Product | null>(null)
const productSerialsList = ref<ProductSerial[]>([])
const newSerialsInput = ref('')
const newSerialCondition = ref<SerialCondition>('new')
const newSerialEarSide = ref('')
const newSerialWarrantyStart = ref('')
const newSerialWarrantyEnd = ref('')
const newSerialNotes = ref('')
const newSerialRecordInTreasury = ref(false)
const newSerialPaymentMethod = ref('cash')

const selectedProductForStock = ref<Product | null>(null)
const editingProduct = ref<Product | null>(null)
const stockForm = ref<{
  product_id: number
  variant_id: number | null
  unit: 'piece' | 'pack'
  quantity: number
  movement_type: 'in' | 'damaged'
  notes: string
  recordInTreasury: boolean
  payment_method: string
}>({
  product_id: 0,
  variant_id: null,
  unit: 'pack',
  quantity: 1,
  movement_type: 'in',
  notes: '',
  recordInTreasury: false,
  payment_method: 'cash'
})

const PRODUCT_TYPE_LABELS: Record<
  ProductType,
  { label: string; badge: string; defaultSerial: number; defaultVariants: number }
> = {
  hearing_aid: {
    label: 'سماعة طبية',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
    defaultSerial: 1,
    defaultVariants: 0
  },
  cochlear_processor: {
    label: 'معالج قوقعة إلكترونية',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
    defaultSerial: 1,
    defaultVariants: 0
  },
  cochlear_part: {
    label: 'قطع ومستلزمات قوقعة',
    badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
    defaultSerial: 0,
    defaultVariants: 0
  },
  battery: {
    label: 'بطاريات سماعات / قوقعة',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    defaultSerial: 0,
    defaultVariants: 1
  },
  accessory: {
    label: 'إكسسوارات وملحقات وقطع',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    defaultSerial: 0,
    defaultVariants: 0
  },
  earmold: {
    label: 'قوالب أذن (Earmolds)',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
    defaultSerial: 0,
    defaultVariants: 0
  },
  service: {
    label: 'خدمة (برمجة / قالب / فحص / تنظيف)',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    defaultSerial: 0,
    defaultVariants: 0
  }
}

const SERIAL_STATUS_LABELS: Record<SerialStatus, { label: string; badge: string }> = {
  in_stock: {
    label: 'متاح بالمخزون',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
  },
  sold: {
    label: 'مباع لعميل',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
  },
  loaned: {
    label: 'سماعة بديلة معارة (Loaner)',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
  },
  external_repair: {
    label: 'مُرسلة للشركة (صيانة خارجية)',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
  },
  returned: {
    label: 'مرتجع للمورد',
    badge: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
  },
  defective: {
    label: 'معيب / تالف',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
  }
}

const form = ref<{
  id?: number
  code: string
  barcode: string
  name: string
  type: ProductType
  sub_category: string
  brand: string
  model: string
  compatible_with: string
  track_serial: number
  has_variants: number
  unit_name: string
  pack_name: string
  pack_size: number
  cost_price: number
  sale_price: number
  pack_cost_price: number
  pack_sale_price: number
  qty: number
  min_stock: number
  warranty_months: number
  image_base64: string
  notes: string
  is_active: number
  variants: ProductVariant[]
  initial_serials_text: string
}>({
  code: '',
  barcode: '',
  name: '',
  type: 'hearing_aid',
  sub_category: '',
  brand: '',
  model: '',
  compatible_with: '',
  track_serial: 1,
  has_variants: 0,
  unit_name: 'قطعة',
  pack_name: 'عبوة',
  pack_size: 1,
  cost_price: 0,
  sale_price: 0,
  pack_cost_price: 0,
  pack_sale_price: 0,
  qty: 0,
  min_stock: 2,
  warranty_months: 12,
  image_base64: '',
  notes: '',
  is_active: 1,
  variants: [],
  initial_serials_text: ''
})

const subCategoryOptions = computed(() => {
  const t = form.value.type
  if (t === 'hearing_aid') return appStore.deviceTypes
  if (t === 'cochlear_processor' || t === 'cochlear_part') return appStore.implantParts
  if (t === 'battery') return appStore.batterySizes
  if (t === 'accessory') return appStore.accessoryTypes
  if (t === 'earmold') return appStore.earmoldTypes
  return []
})

const filteredProducts = computed(() => {
  return products.value.filter((p) => {
    if (activeTab.value === 'all' || activeTab.value === 'serials') return true
    if (activeTab.value === 'cochlear') {
      return p.type === 'cochlear_processor' || p.type === 'cochlear_part'
    }
    if (activeTab.value === 'accessory') {
      return p.type === 'accessory' || p.type === 'earmold'
    }
    return p.type === activeTab.value
  })
})

const lowStockAlertsCount = computed(() => {
  let cnt = 0
  for (const p of products.value) {
    if (p.type === 'service' || !p.is_active) continue
    if (p.has_variants && p.variants?.length) {
      for (const v of p.variants) {
        if (v.is_active && v.qty <= v.min_stock) cnt++
      }
    } else if (p.qty <= p.min_stock) {
      cnt++
    }
  }
  return cnt
})

function formatDualStock(qty: number, packSize: number, unitName = 'قطعة', packName = 'عبوة'): string {
  if (!packSize || packSize <= 1) {
    return `${qty} ${unitName}`
  }
  const packs = Math.floor(qty / packSize)
  const rem = qty % packSize
  if (packs > 0 && rem > 0) {
    return `${qty} ${unitName} (${packs} ${packName} + ${rem} ${unitName})`
  }
  if (packs > 0) {
    return `${qty} ${unitName} (${packs} ${packName})`
  }
  return `${qty} ${unitName}`
}

async function loadData(): Promise<void> {
  const [pList, sList] = await Promise.all([
    window.api.listProducts({ search: searchQuery.value }),
    window.api.listProductSerials({
      search: searchQuery.value,
      status: serialStatusFilter.value
    })
  ])
  products.value = pList
  allSerials.value = sList
}

watch([searchQuery, serialStatusFilter], () => {
  loadData()
})

function handleTypeChange(type: ProductType): void {
  const meta = PRODUCT_TYPE_LABELS[type]
  form.value.track_serial = meta.defaultSerial
  form.value.has_variants = meta.defaultVariants

  if (type === 'battery') {
    form.value.unit_name = 'حجر'
    form.value.pack_name = 'شريط (6 حجارة)'
    form.value.pack_size = 6
    form.value.warranty_months = 0
    if (form.value.variants.length === 0) {
      populateStandardBatteryVariants()
    }
  } else if (type === 'service') {
    form.value.unit_name = 'خدمة'
    form.value.pack_size = 1
    form.value.warranty_months = 0
    form.value.qty = 0
    form.value.min_stock = 0
  } else if (type === 'hearing_aid' || type === 'cochlear_processor') {
    form.value.unit_name = 'جهاز'
    form.value.pack_name = 'علبة'
    form.value.pack_size = 1
    form.value.warranty_months = 24
  } else {
    form.value.unit_name = 'قطعة'
    form.value.pack_name = 'عبوة'
    form.value.pack_size = 1
    form.value.warranty_months = 3
  }
}

function syncPackPricesFromUnit(): void {
  const ps = Math.max(1, Number(form.value.pack_size || 1))
  if (ps > 1) {
    form.value.pack_cost_price = Math.round(Number(form.value.cost_price || 0) * ps * 100) / 100
    form.value.pack_sale_price = Math.round(Number(form.value.sale_price || 0) * ps * 100) / 100
  } else {
    form.value.pack_cost_price = form.value.cost_price
    form.value.pack_sale_price = form.value.sale_price
  }
}

function populateStandardBatteryVariants(): void {
  const sizes =
    appStore.batterySizes.length > 0
      ? appStore.batterySizes
      : [
          'مقاس 10 (أصفر)',
          'مقاس 312 (بني)',
          'مقاس 13 (برتقالي)',
          'مقاس 675 (أزرق)',
          'مقاس 675 قوقعة (Implant Plus)'
        ]

  form.value.has_variants = 1
  form.value.variants = sizes.map((sz, i) => ({
    variant_name: sz,
    size: sz,
    color: '',
    sku: `BAT-${i + 1}`,
    barcode: '',
    cost_price: null,
    sale_price: null,
    pack_cost_price: null,
    pack_sale_price: null,
    qty: 30, // 5 شرائط × 6 حجارة
    min_stock: 12, // شريطان
    is_active: 1
  }))
}

function addEmptyVariant(): void {
  form.value.variants.push({
    variant_name: '',
    size: '',
    color: '',
    sku: '',
    barcode: '',
    cost_price: null,
    sale_price: null,
    pack_cost_price: null,
    pack_sale_price: null,
    qty: 6,
    min_stock: 6,
    is_active: 1
  })
}

function removeVariant(idx: number): void {
  form.value.variants.splice(idx, 1)
}

function openCreateModal(presetType: ProductType = 'hearing_aid'): void {
  editingProduct.value = null
  form.value = {
    code: `PR-${Math.floor(1000 + Math.random() * 9000)}`,
    barcode: '',
    name: presetType === 'battery' ? 'بطاريات سماعات طبية زنك-هواء' : '',
    type: presetType,
    sub_category: '',
    brand: appStore.brands[0] || '',
    model: '',
    compatible_with: '',
    track_serial: PRODUCT_TYPE_LABELS[presetType].defaultSerial,
    has_variants: PRODUCT_TYPE_LABELS[presetType].defaultVariants,
    unit_name: presetType === 'battery' ? 'حجر' : 'قطعة',
    pack_name: presetType === 'battery' ? 'شريط' : 'عبوة',
    pack_size: presetType === 'battery' ? 6 : 1,
    cost_price: presetType === 'battery' ? 12 : 0,
    sale_price: presetType === 'battery' ? 20 : 0,
    pack_cost_price: presetType === 'battery' ? 72 : 0,
    pack_sale_price: presetType === 'battery' ? 110 : 0,
    qty: 0,
    min_stock: presetType === 'battery' ? 12 : 2,
    warranty_months: presetType === 'hearing_aid' || presetType === 'cochlear_processor' ? 24 : 0,
    image_base64: '',
    notes: '',
    is_active: 1,
    variants: [],
    initial_serials_text: ''
  }

  if (presetType === 'battery') {
    populateStandardBatteryVariants()
  }

  productModalOpen.value = true
}

function openEditModal(p: Product): void {
  editingProduct.value = p
  form.value = {
    id: p.id,
    code: p.code,
    barcode: p.barcode || '',
    name: p.name,
    type: p.type,
    sub_category: p.sub_category || '',
    brand: p.brand || '',
    model: p.model || '',
    compatible_with: p.compatible_with || '',
    track_serial: p.track_serial,
    has_variants: p.has_variants,
    unit_name: p.unit_name || 'قطعة',
    pack_name: p.pack_name || 'عبوة',
    pack_size: p.pack_size || 1,
    cost_price: p.cost_price,
    sale_price: p.sale_price,
    pack_cost_price: p.pack_cost_price || p.cost_price * (p.pack_size || 1),
    pack_sale_price: p.pack_sale_price || p.sale_price * (p.pack_size || 1),
    qty: p.qty,
    min_stock: p.min_stock,
    warranty_months: p.warranty_months,
    image_base64: p.image_base64 || '',
    notes: p.notes || '',
    is_active: p.is_active,
    variants: (p.variants || []).map((v) => ({ ...v })),
    initial_serials_text: ''
  }
  productModalOpen.value = true
}

function openStockAdjustFromEdit(): void {
  const target =
    products.value.find((x) => x.id === form.value.id) || editingProduct.value
  if (!target) return
  productModalOpen.value = false
  openStockModal(target)
}

async function handleImageUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  form.value.image_base64 = await compressImageFile(file, 800, 800, 0.82)
  input.value = ''
}

async function handleSaveProduct(): Promise<void> {
  if (!form.value.name.trim()) {
    swalError('بيانات ناقصة', 'يرجى إدخال اسم المنتج أو الخدمة')
    return
  }

  const initialSerials = form.value.initial_serials_text
    .split(/[\n,،]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  try {
    await appStore.withLoading(async () => {
      await window.api.saveProduct(
        plain({
          ...form.value,
          initial_serials: initialSerials
        })
      )
      productModalOpen.value = false
      await loadData()
    }, 'جاري حفظ بيانات المنتج...')
    swalSuccess('تم حفظ بيانات المنتج بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حفظ المنتج', err instanceof Error ? err.message : '')
  }
}

async function handleDeleteProduct(p: Product): Promise<void> {
  const ok = await swalConfirm(
    'تأكيد حذف المنتج',
    `هل أنت متأكد من حذف (${p.name})؟ لا يمكن التراجع عن هذه العملية.`
  )
  if (!ok) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteProduct(p.id)
      await loadData()
    }, 'جاري حذف المنتج...')
    swalSuccess('تم حذف المنتج بنجاح')
  } catch (err: unknown) {
    swalError('تعذر الحذف', err instanceof Error ? err.message : '')
  }
}

async function seedDefaultServices(): Promise<void> {
  const defaults = [
    { code: 'SRV-PROG', name: 'ضبط وبرمجة سماعة طبية بالكمبيوتر', sale_price: 250 },
    { code: 'SRV-MOLD', name: 'عمل قالب أذن طبي مخصص (شامل المقاس)', sale_price: 400 },
    { code: 'SRV-CLEAN', name: 'تنظيف وصيانة دورية وتجفيف للسماعة', sale_price: 150 },
    { code: 'SRV-IMPLANT', name: 'برمجة وفحص معالج قوقعة إلكترونية', sale_price: 350 }
  ]

  try {
    await appStore.withLoading(async () => {
      const existingCodes = new Set(products.value.map((p) => p.code))
      for (const srv of defaults) {
        if (!existingCodes.has(srv.code)) {
          await window.api.saveProduct({
            code: srv.code,
            name: srv.name,
            type: 'service',
            track_serial: 0,
            has_variants: 0,
            unit_name: 'خدمة',
            pack_name: 'خدمة',
            pack_size: 1,
            cost_price: 0,
            sale_price: srv.sale_price,
            pack_cost_price: 0,
            pack_sale_price: srv.sale_price,
            qty: 0,
            min_stock: 0,
            warranty_months: 0,
            is_active: 1
          })
        }
      }
      await loadData()
    }, 'جاري إضافة خدمات المركز الافتراضية...')
    swalSuccess('تم إضافة خدمات المركز (برمجة / قالب / تنظيف) بنجاح')
  } catch (err: unknown) {
    swalError('تعذر إضافة الخدمات', err instanceof Error ? err.message : '')
  }
}

// ==========================================
// SERIALS MANAGEMENT
// ==========================================

async function openSerialsModal(p: Product): Promise<void> {
  selectedProductForSerials.value = p
  newSerialsInput.value = ''
  newSerialCondition.value = 'new'
  newSerialEarSide.value = ''
  newSerialWarrantyStart.value = new Date().toISOString().slice(0, 10)
  const d = new Date()
  d.setMonth(d.getMonth() + (p.warranty_months || 24))
  newSerialWarrantyEnd.value = d.toISOString().slice(0, 10)
  newSerialNotes.value = ''
  newSerialRecordInTreasury.value = false
  productSerialsList.value = await window.api.listProductSerials({ product_id: p.id })
  serialsModalOpen.value = true
}

async function handleAddSerials(): Promise<void> {
  if (!selectedProductForSerials.value) return
  const serials = newSerialsInput.value
    .split(/[\n,،]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (serials.length === 0) {
    swalError('تنبيه', 'يرجى كتابة رقم تسلسلي واحد على الأقل')
    return
  }

  try {
    await appStore.withLoading(async () => {
      productSerialsList.value = await window.api.addProductSerials(
        plain({
          product_id: selectedProductForSerials.value!.id,
          serials,
          condition: newSerialCondition.value,
          ear_side: newSerialEarSide.value,
          company_warranty_start: newSerialWarrantyStart.value || null,
          company_warranty_end: newSerialWarrantyEnd.value || null,
          notes: newSerialNotes.value,
          recordInTreasury: newSerialRecordInTreasury.value,
          payment_method: newSerialPaymentMethod.value
        })
      )
      newSerialsInput.value = ''
      await loadData()
    }, 'جاري إضافة الأرقام التسلسلية وتحديث المخزون...')
    swalSuccess(`تم تسجيل (${serials.length}) رقم تسلسلي في المخزون بنجاح`)
  } catch (err: unknown) {
    swalError('تعذر إضافة الأرقام التسلسلية', err instanceof Error ? err.message : '')
  }
}

async function handleSerialStatusChange(s: ProductSerial, newStatus: SerialStatus): Promise<void> {
  try {
    await appStore.withLoading(async () => {
      await window.api.updateProductSerialStatus({
        id: s.id,
        status: newStatus
      })
      if (selectedProductForSerials.value) {
        productSerialsList.value = await window.api.listProductSerials({
          product_id: selectedProductForSerials.value.id
        })
      }
      await loadData()
    }, 'جاري تحديث حالة الرقم التسلسلي...')
    swalSuccess('تم تحديث حالة الرقم التسلسلي')
  } catch (err: unknown) {
    swalError('خطأ', err instanceof Error ? err.message : '')
  }
}

async function handleDeleteSerial(s: ProductSerial): Promise<void> {
  const ok = await swalConfirm('حذف الرقم التسلسلي', `هل تريد حذف السيريال (${s.serial_no})؟`)
  if (!ok) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteProductSerial(s.id)
      if (selectedProductForSerials.value) {
        productSerialsList.value = await window.api.listProductSerials({
          product_id: selectedProductForSerials.value.id
        })
      }
      await loadData()
    }, 'جاري حذف الرقم التسلسلي...')
    swalSuccess('تم حذف الرقم التسلسلي')
  } catch (err: unknown) {
    swalError('تعذر الحذف', err instanceof Error ? err.message : '')
  }
}

// ==========================================
// STOCK ADJUSTMENT (PACKS / PIECES)
// ==========================================

function openStockModal(p: Product, variant?: ProductVariant): void {
  selectedProductForStock.value = p
  stockForm.value = {
    product_id: p.id,
    variant_id: variant?.id || p.variants?.[0]?.id || null,
    unit: p.pack_size > 1 ? 'pack' : 'piece',
    quantity: 1,
    movement_type: 'in',
    notes: '',
    recordInTreasury: false,
    payment_method: 'cash'
  }
  stockModalOpen.value = true
}

async function handleAdjustStock(): Promise<void> {
  if (!selectedProductForStock.value || stockForm.value.quantity <= 0) return
  try {
    await appStore.withLoading(async () => {
      await window.api.adjustProductStock(plain(stockForm.value))
      stockModalOpen.value = false
      await loadData()
    }, 'جاري تحديث الرصيد المخزني...')
    swalSuccess('تم تحديث الرصيد المخزني بنجاح')
  } catch (err: unknown) {
    swalError('تعذر تحديث الرصيد', err instanceof Error ? err.message : '')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <!-- Top Header & Quick Actions -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center"
        >
          <Package class="w-6 h-6" />
        </div>
        <div>
          <h1 class="text-xl font-black text-slate-900 dark:text-white">
            المنتجات والسماعات والبطاريات والأرقام التسلسلية
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            إدارة السماعات ومعالجات القوقعة بالسيريال، مقاسات البطاريات بالعبوة والقطعة، الإكسسوارات والخدمات
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          @click="seedDefaultServices"
          class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/70 text-xs font-bold transition cursor-pointer"
        >
          <Sparkles class="w-4 h-4" />
          + إضافة خدمات المركز الافتراضية
        </button>

        <button
          type="button"
          @click="openCreateModal('battery')"
          class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70 text-xs font-bold transition cursor-pointer"
        >
          <BatteryCharging class="w-4 h-4" />
          + بطارية بمقاسات (10 / 312 / 13 / 675)
        </button>

        <button
          type="button"
          @click="openCreateModal('hearing_aid')"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          إضافة منتج / سماعة جديدة
        </button>
      </div>
    </div>

    <!-- Summary KPI Strip -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-[11px] font-bold text-slate-500">إجمالي الأصناف المسجلة</div>
        <div class="text-xl font-black text-slate-900 dark:text-white mt-1">
          {{ products.length }}
        </div>
      </div>
      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-[11px] font-bold text-slate-500">سماعات وقواقع متاحة (بالسيريال)</div>
        <div class="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">
          {{ allSerials.filter((s) => s.status === 'in_stock').length }}
        </div>
      </div>
      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-[11px] font-bold text-slate-500">سماعات مباعة لمرضى</div>
        <div class="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
          {{ allSerials.filter((s) => s.status === 'sold').length }}
        </div>
      </div>
      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-[11px] font-bold text-slate-500">سماعات بديلة معارة / بالصيانة</div>
        <div class="text-xl font-black text-purple-600 dark:text-purple-400 mt-1">
          {{
            allSerials.filter((s) => s.status === 'loaned' || s.status === 'external_repair').length
          }}
        </div>
      </div>
      <div
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="text-[11px] font-bold text-slate-500">تنبيهات نقص المخزون والمقاسات</div>
        <div
          :class="[
            'text-xl font-black mt-1',
            lowStockAlertsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
          ]"
        >
          {{ lowStockAlertsCount }}
        </div>
      </div>
    </div>

    <!-- Tabs & Search Bar -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl"
    >
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="tab in [
            { id: 'all', label: 'الكل' },
            { id: 'hearing_aid', label: 'السماعات الطبية' },
            { id: 'cochlear', label: 'القوقعة الإلكترونية' },
            { id: 'battery', label: 'البطاريات (بالمقاسات)' },
            { id: 'accessory', label: 'الإكسسوارات والقوالب' },
            { id: 'service', label: 'الخدمات' },
            { id: 'serials', label: `سجل الأرقام التسلسلية (${allSerials.length})` }
          ]"
          :key="tab.id"
          type="button"
          @click="activeTab = tab.id as any"
          :class="[
            'px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer',
            activeTab === tab.id
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="flex items-center gap-2 w-full md:w-auto">
        <select
          v-if="activeTab === 'serials'"
          v-model="serialStatusFilter"
          class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
        >
          <option value="all">كل حالات السيريال</option>
          <option value="in_stock">متاح بالمخزون</option>
          <option value="sold">مباع لعميل</option>
          <option value="loaned">سماعة بديلة معارة</option>
          <option value="external_repair">أُرسلت للشركة</option>
          <option value="defective">معيب / تالف</option>
          <option value="returned">مرتجع للمورد</option>
        </select>

        <div class="relative flex-1 md:w-80">
          <Search class="w-4 h-4 text-slate-400 absolute right-3.5 top-2.5" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="بحث بالاسم، الماركة، الباركود، أو الرقم التسلسلي..."
            class="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>
    </div>

    <!-- TAB 1: PRODUCTS LIST -->
    <div
      v-if="activeTab !== 'serials'"
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead
            class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-bold"
          >
            <tr>
              <th class="p-3.5">الكود / الصنف</th>
              <th class="p-3.5">النوع والتصنيف</th>
              <th class="p-3.5">الماركة / التوافق</th>
              <th v-if="appStore.canViewPurchasePrices" class="p-3.5">التكلفة</th>
              <th class="p-3.5">سعر البيع</th>
              <th class="p-3.5">الرصيد والتنوعات / السيريال</th>
              <th class="p-3.5 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200/70 dark:divide-slate-800">
            <tr v-if="filteredProducts.length === 0">
              <td colspan="7" class="p-10 text-center text-slate-400 font-bold">
                لا توجد منتجات مطابقة للبحث الحالي
              </td>
            </tr>
            <tr
              v-for="p in filteredProducts"
              :key="p.id"
              class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
            >
              <!-- Name & Code -->
              <td class="p-3.5">
                <div class="flex items-center gap-2.5">
                  <img
                    v-if="p.image_base64"
                    :src="p.image_base64"
                    class="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 cursor-pointer"
                    @click="appStore.openImagePreview(p.image_base64, p.name)"
                  />
                  <div>
                    <div class="font-black text-slate-900 dark:text-white">{{ p.name }}</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                      <span>{{ p.code }}</span>
                      <span v-if="p.barcode" class="flex items-center gap-0.5">
                        <Barcode class="w-3 h-3" />
                        {{ p.barcode }}
                      </span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- Type & Subcategory -->
              <td class="p-3.5">
                <span
                  :class="[
                    'inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold',
                    PRODUCT_TYPE_LABELS[p.type]?.badge
                  ]"
                >
                  {{ PRODUCT_TYPE_LABELS[p.type]?.label }}
                </span>
                <div v-if="p.sub_category" class="text-[11px] text-slate-500 mt-1">
                  {{ p.sub_category }}
                </div>
              </td>

              <!-- Brand & Compatibility -->
              <td class="p-3.5">
                <div class="font-bold text-slate-800 dark:text-slate-200">
                  {{ p.brand || '—' }}
                  <span v-if="p.model" class="text-slate-500">({{ p.model }})</span>
                </div>
                <div
                  v-if="p.compatible_with"
                  class="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5"
                >
                  متوافق مع: {{ p.compatible_with }}
                </div>
                <div v-if="p.warranty_months > 0" class="text-[10px] text-emerald-600 mt-0.5">
                  ضمان: {{ p.warranty_months }} شهر
                </div>
              </td>

              <!-- Cost Price -->
              <td v-if="appStore.canViewPurchasePrices" class="p-3.5 font-mono">
                <div class="font-bold text-slate-700 dark:text-slate-300">
                  {{ p.cost_price }} ج.م / {{ p.unit_name }}
                </div>
                <div v-if="p.pack_size > 1" class="text-[11px] text-slate-400">
                  {{ p.pack_cost_price }} ج.م / {{ p.pack_name }} ({{ p.pack_size }} {{ p.unit_name }})
                </div>
              </td>

              <!-- Sale Price -->
              <td class="p-3.5 font-mono">
                <div class="font-black text-emerald-700 dark:text-emerald-400">
                  {{ p.sale_price }} ج.م / {{ p.unit_name }}
                </div>
                <div v-if="p.pack_size > 1" class="text-[11px] text-blue-600 dark:text-blue-400 font-bold">
                  {{ p.pack_sale_price }} ج.م / {{ p.pack_name }} ({{ p.pack_size }} {{ p.unit_name }})
                </div>
              </td>

              <!-- Stock / Variants / Serials -->
              <td class="p-3.5">
                <div v-if="p.type === 'service'" class="text-slate-400 font-bold">
                  خدمة فورية (بلا مخزون)
                </div>

                <!-- Serialized Product -->
                <div v-else-if="p.track_serial" class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span
                      :class="[
                        'px-2.5 py-0.5 rounded-lg font-black text-xs',
                        p.qty <= p.min_stock
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      ]"
                    >
                      متاح: {{ p.qty }} بالسيريال
                    </span>
                    <span class="text-[11px] text-slate-400">
                      (إجمالي مسجل: {{ p.total_serials_count || 0 }})
                    </span>
                  </div>
                </div>

                <!-- Variant Product (e.g. Batteries) -->
                <div v-else-if="p.has_variants && p.variants?.length" class="space-y-1">
                  <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    الإجمالي: {{ formatDualStock(p.qty, p.pack_size, p.unit_name, p.pack_name) }}
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="v in p.variants"
                      :key="v.id"
                      @click="openStockModal(p, v)"
                      :class="[
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer',
                        v.qty <= v.min_stock
                          ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300'
                          : 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                      ]"
                      :title="formatDualStock(v.qty, p.pack_size, p.unit_name, p.pack_name)"
                    >
                      <AlertTriangle v-if="v.qty <= v.min_stock" class="w-3 h-3 text-rose-600" />
                      <span>{{ v.variant_name }}:</span>
                      <span class="font-mono">
                        {{
                          p.pack_size > 1
                            ? `${Math.floor(v.qty / p.pack_size)} شريط + ${v.qty % p.pack_size} حجر`
                            : v.qty
                        }}
                      </span>
                    </span>
                  </div>
                </div>

                <!-- Standard Quantity Product -->
                <div v-else class="flex items-center gap-1.5">
                  <span
                    :class="[
                      'px-2.5 py-0.5 rounded-lg font-black text-xs',
                      p.qty <= p.min_stock
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    ]"
                  >
                    {{ formatDualStock(p.qty, p.pack_size, p.unit_name, p.pack_name) }}
                  </span>
                </div>
              </td>

              <!-- Actions -->
              <td class="p-3.5">
                <div class="flex items-center justify-center gap-1.5">
                  <button
                    v-if="p.track_serial"
                    type="button"
                    @click="openSerialsModal(p)"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold text-[11px] cursor-pointer"
                    title="إدارة الأرقام التسلسلية"
                  >
                    <Hash class="w-3.5 h-3.5" />
                    السيريال
                  </button>

                  <button
                    v-else-if="p.type !== 'service'"
                    type="button"
                    @click="openStockModal(p)"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[11px] cursor-pointer"
                    title="توريد أو تسوية الرصيد بالعبوة / القطعة"
                  >
                    <ArrowDownLeft class="w-3.5 h-3.5" />
                    توريد/رصيد
                  </button>

                  <button
                    type="button"
                    @click="openEditModal(p)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                    title="تعديل"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>

                  <button
                    v-if="appStore.canDeleteRecords"
                    type="button"
                    @click="handleDeleteProduct(p)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                    title="حذف"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: GLOBAL SERIAL NUMBERS REGISTRY -->
    <div
      v-else
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead
            class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-bold"
          >
            <tr>
              <th class="p-3.5">الرقم التسلسلي (Serial)</th>
              <th class="p-3.5">السماعة / معالج القوقعة</th>
              <th class="p-3.5">الحالة الفنية</th>
              <th class="p-3.5">حالة التوفر</th>
              <th class="p-3.5">المريض / العميل</th>
              <th class="p-3.5">ضمان الشركة / العميل</th>
              <th class="p-3.5 text-center">إجراء</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200/70 dark:divide-slate-800">
            <tr v-if="allSerials.length === 0">
              <td colspan="7" class="p-10 text-center text-slate-400 font-bold">
                لا توجد أرقام تسلسلية مسجلة تطابق البحث
              </td>
            </tr>
            <tr
              v-for="s in allSerials"
              :key="s.id"
              class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
            >
              <td class="p-3.5 font-mono font-black text-blue-700 dark:text-blue-400">
                {{ s.serial_no }}
                <div v-if="s.ear_side" class="text-[10px] font-sans text-slate-500">
                  {{ s.ear_side }}
                </div>
              </td>
              <td class="p-3.5">
                <div class="font-bold text-slate-900 dark:text-white">{{ s.product_name }}</div>
                <div class="text-[11px] text-slate-500">
                  {{ s.product_brand }} {{ s.product_model }}
                </div>
              </td>
              <td class="p-3.5">
                <span
                  :class="[
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    s.condition === 'used'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  ]"
                >
                  {{ s.condition === 'used' ? 'مستعمل (Used)' : 'جديد (New)' }}
                </span>
              </td>
              <td class="p-3.5">
                <span
                  :class="[
                    'px-2.5 py-0.5 rounded-full text-[11px] font-bold',
                    SERIAL_STATUS_LABELS[s.status]?.badge
                  ]"
                >
                  {{ SERIAL_STATUS_LABELS[s.status]?.label }}
                </span>
              </td>
              <td class="p-3.5 font-bold">
                {{ s.customer_name || '—' }}
              </td>
              <td class="p-3.5 text-[11px]">
                <div v-if="s.company_warranty_end">
                  ضمان الشركة: <span class="font-mono">{{ s.company_warranty_end }}</span>
                </div>
                <div v-if="s.customer_warranty_end" class="text-emerald-600 font-bold">
                  ضمان العميل: <span class="font-mono">{{ s.customer_warranty_end }}</span>
                </div>
                <span v-if="!s.company_warranty_end && !s.customer_warranty_end" class="text-slate-400">
                  —
                </span>
              </td>
              <td class="p-3.5 text-center">
                <select
                  :value="s.status"
                  @change="
                    handleSerialStatusChange(
                      s,
                      ($event.target as HTMLSelectElement).value as SerialStatus
                    )
                  "
                  class="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold"
                >
                  <option value="in_stock">متاح بالمخزون</option>
                  <option value="sold">مباع لعميل</option>
                  <option value="loaned">سماعة بديلة معارة</option>
                  <option value="external_repair">أُرسلت للشركة</option>
                  <option value="defective">معيب / تالف</option>
                  <option value="returned">مرتجع للمورد</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL 1: ADD / EDIT PRODUCT -->
    <div
      v-if="productModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <h3 class="font-black text-base text-slate-900 dark:text-white">
            {{ form.id ? 'تعديل بيانات المنتج / الخدمة' : 'إضافة منتج أو خدمة جديدة' }}
          </h3>
          <button
            type="button"
            @click="productModalOpen = false"
            class="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-5 text-xs">
          <!-- Basic Info Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block font-bold mb-1">نوع الصنف *</label>
              <select
                v-model="form.type"
                @change="handleTypeChange(form.type)"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option
                  v-for="(meta, key) in PRODUCT_TYPE_LABELS"
                  :key="key"
                  :value="key"
                >
                  {{ meta.label }}
                </option>
              </select>
            </div>

            <div class="md:col-span-2">
              <label class="block font-bold mb-1">اسم المنتج / الصنف / الخدمة *</label>
              <input
                v-model="form.name"
                type="text"
                placeholder="مثال: سماعة Phonak Naida P90 UP / بطاريات Rayovac"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">كود الصنف (SKU)</label>
              <input
                v-model="form.code"
                type="text"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label class="block font-bold mb-1">الباركود (Barcode)</label>
              <input
                v-model="form.barcode"
                type="text"
                placeholder="امسح الباركود هنا..."
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div v-if="subCategoryOptions.length > 0">
              <label class="block font-bold mb-1">التصنيف الفرعي</label>
              <select
                v-model="form.sub_category"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="">— اختر التصنيف الفرعي —</option>
                <option v-for="opt in subCategoryOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </div>

            <div v-if="form.type !== 'service'">
              <label class="block font-bold mb-1">الماركة / الشركة المصنعة</label>
              <input
                v-model="form.brand"
                list="product-brands-list"
                type="text"
                placeholder="Phonak / Oticon / Cochlear..."
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <datalist id="product-brands-list">
                <option v-for="b in appStore.brands" :key="b" :value="b" />
              </datalist>
            </div>

            <div v-if="form.type !== 'service'">
              <label class="block font-bold mb-1">الموديل / الطراز</label>
              <input
                v-model="form.model"
                type="text"
                placeholder="مثال: Naida P90 / Nucleus 8"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div
              v-if="['cochlear_part', 'accessory', 'battery', 'earmold'].includes(form.type)"
              class="md:col-span-2"
            >
              <label class="block font-bold mb-1 text-indigo-700 dark:text-indigo-300">
                متوافق مع (ماركات / موديلات السماعات أو القواقع)
              </label>
              <input
                v-model="form.compatible_with"
                type="text"
                placeholder="مثال: متوافق مع معالجات Cochlear Nucleus 7 & 8 وجميع سماعات BTE..."
                class="w-full px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30"
              />
            </div>
          </div>

          <!-- Units & Pricing Box -->
          <div
            class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="font-black text-slate-800 dark:text-slate-200">
                وحدات البيع والتسعير (يدعم البيع بالقطعة أو بالعبوة/الشريط)
              </h4>
              <div v-if="form.type !== 'service'" class="flex items-center gap-4">
                <label class="flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="form.track_serial === 1"
                    @change="
                      form.track_serial = ($event.target as HTMLInputElement).checked ? 1 : 0;
                      if (form.track_serial) form.has_variants = 0
                    "
                    class="rounded text-blue-600"
                  />
                  <span>يتتبع الرقم التسلسلي (Serial Number)</span>
                </label>

                <label
                  v-if="!form.track_serial"
                  class="flex items-center gap-1.5 font-bold cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="form.has_variants === 1"
                    @change="
                      form.has_variants = ($event.target as HTMLInputElement).checked ? 1 : 0
                    "
                    class="rounded text-amber-600"
                  />
                  <span>متعدد المقاسات / التنوعات (Variants)</span>
                </label>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold mb-1">اسم الوحدة الصغرى</label>
                <input
                  v-model="form.unit_name"
                  type="text"
                  placeholder="قطعة / حجر"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div v-if="form.type !== 'service' && !form.track_serial">
                <label class="block font-bold mb-1">اسم العبوة الكبرى</label>
                <input
                  v-model="form.pack_name"
                  type="text"
                  placeholder="شريط / عبوة / باكت"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div v-if="form.type !== 'service' && !form.track_serial">
                <label class="block font-bold mb-1 text-amber-700 dark:text-amber-400">
                  عدد القطع في العبوة
                </label>
                <input
                  v-model.number="form.pack_size"
                  type="number"
                  min="1"
                  @input="syncPackPricesFromUnit"
                  class="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label class="block font-bold mb-1">مدة الضمان للعميل (شهور)</label>
                <input
                  v-model.number="form.warranty_months"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div v-if="form.type !== 'service'">
                <label class="block font-bold mb-1">سعر تكلفة ({{ form.unit_name }})</label>
                <input
                  v-model.number="form.cost_price"
                  type="number"
                  min="0"
                  step="0.5"
                  @input="syncPackPricesFromUnit"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div>
                <label class="block font-bold mb-1 text-emerald-700 dark:text-emerald-400">
                  سعر بيع ({{ form.unit_name }}) *
                </label>
                <input
                  v-model.number="form.sale_price"
                  type="number"
                  min="0"
                  step="0.5"
                  @input="syncPackPricesFromUnit"
                  class="w-full px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 font-mono font-bold"
                />
              </div>

              <div v-if="form.pack_size > 1">
                <label class="block font-bold mb-1">تكلفة ({{ form.pack_name }})</label>
                <input
                  v-model.number="form.pack_cost_price"
                  type="number"
                  min="0"
                  step="0.5"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div v-if="form.pack_size > 1">
                <label class="block font-bold mb-1 text-blue-700 dark:text-blue-400">
                  سعر بيع ({{ form.pack_name }})
                </label>
                <input
                  v-model.number="form.pack_sale_price"
                  type="number"
                  min="0"
                  step="0.5"
                  class="w-full px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 font-mono font-bold"
                />
              </div>

              <div v-if="form.type !== 'service' && !form.track_serial && !form.has_variants">
                <label class="block font-bold mb-1">
                  {{ form.id ? `الرصيد الحالي (للقراءة فقط - بـ ${form.unit_name})` : `الرصيد الافتتاحي (بـ ${form.unit_name})` }}
                </label>
                <input
                  v-model.number="form.qty"
                  type="number"
                  min="0"
                  :disabled="Boolean(form.id)"
                  :readonly="Boolean(form.id)"
                  :class="
                    form.id
                      ? 'bg-slate-100 dark:bg-slate-800/70 text-slate-500 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-900'
                  "
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-mono font-bold"
                />
                <div
                  v-if="form.id"
                  class="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-700 dark:text-amber-400"
                >
                  <span>يُعدّل الرصيد عبر حركة مخزنية رسمية وليس من بطاقة الصنف.</span>
                  <button
                    type="button"
                    @click="openStockAdjustFromEdit"
                    class="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 font-bold border border-amber-500/30 cursor-pointer"
                  >
                    تسوية المخزون (Stock Adjust)
                  </button>
                </div>
              </div>

              <div v-if="form.type !== 'service' && !form.has_variants">
                <label class="block font-bold mb-1">حد التنبيه للنقص</label>
                <input
                  v-model.number="form.min_stock"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
            </div>
          </div>

          <!-- Product Variants Section (Battery Sizes / Accessory Colors & Sizes) -->
          <div
            v-if="form.has_variants"
            class="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/70 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Layers class="w-4 h-4 text-amber-600" />
                <h4 class="font-black text-amber-900 dark:text-amber-300">
                  مقاسات وتنوعات المنتج (تنبيه نقص ورصيد مستقل لكل مقاس)
                </h4>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  @click="populateStandardBatteryVariants"
                  class="px-3 py-1.5 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-900 font-bold text-[11px] cursor-pointer"
                >
                  توليد مقاسات البطاريات (10 / 312 / 13 / 675)
                </button>
                <button
                  type="button"
                  @click="addEmptyVariant"
                  class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] cursor-pointer"
                >
                  + إضافة مقاس / تنوع
                </button>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-right text-[11px]">
                <thead class="bg-amber-100/60 dark:bg-amber-900/30 font-bold">
                  <tr>
                    <th class="p-2">المقاس / الاسم *</th>
                    <th class="p-2">اللون / الرمز</th>
                    <th class="p-2">الباركود</th>
                    <th class="p-2">الرصيد (بـ {{ form.unit_name }})</th>
                    <th class="p-2">يعادل بالعبوة</th>
                    <th class="p-2">حد النقص (بـ {{ form.unit_name }})</th>
                    <th class="p-2 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-amber-200/60 dark:divide-amber-800/40">
                  <tr v-for="(v, idx) in form.variants" :key="idx">
                    <td class="p-1.5">
                      <input
                        v-model="v.variant_name"
                        type="text"
                        placeholder="مثال: مقاس 312 (بني)"
                        class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      />
                    </td>
                    <td class="p-1.5">
                      <input
                        v-model="v.color"
                        type="text"
                        placeholder="بني / أصفر..."
                        class="w-28 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </td>
                    <td class="p-1.5">
                      <input
                        v-model="v.barcode"
                        type="text"
                        placeholder="باركود المقاس"
                        class="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </td>
                    <td class="p-1.5">
                      <input
                        v-model.number="v.qty"
                        type="number"
                        min="0"
                        class="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                      />
                    </td>
                    <td class="p-1.5 font-mono text-slate-600 dark:text-slate-400">
                      {{
                        form.pack_size > 1
                          ? `${Math.floor((v.qty || 0) / form.pack_size)} ${form.pack_name} + ${(v.qty || 0) % form.pack_size}`
                          : `${v.qty || 0}`
                      }}
                    </td>
                    <td class="p-1.5">
                      <input
                        v-model.number="v.min_stock"
                        type="number"
                        min="0"
                        class="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </td>
                    <td class="p-1.5 text-center">
                      <button
                        type="button"
                        @click="removeVariant(idx)"
                        class="p-1 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Initial Serials Input for New Serialized Products -->
          <div
            v-if="form.track_serial && !form.id"
            class="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/70 space-y-2"
          >
            <label class="block font-black text-indigo-900 dark:text-indigo-300">
              إدخال أرقام تسلسلية افتتاحية بالمخزون (اختياري — سطر لكل سيريال أو بالباركود)
            </label>
            <textarea
              v-model="form.initial_serials_text"
              rows="3"
              placeholder="امسح أو اكتب كل رقم تسلسلي في سطر مستقل..."
              class="w-full px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 font-mono"
            ></textarea>
          </div>

          <!-- Image & Notes -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div>
              <label class="block font-bold mb-1">صورة الصنف (اختياري)</label>
              <label
                class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Upload class="w-4 h-4 text-blue-600" />
                <span>اختيار صورة</span>
                <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
              </label>
              <div v-if="form.image_base64" class="mt-2 flex items-center gap-2">
                <img :src="form.image_base64" class="w-14 h-14 rounded-xl object-cover border" />
                <button
                  type="button"
                  @click="form.image_base64 = ''"
                  class="text-rose-600 text-[11px] font-bold cursor-pointer"
                >
                  إزالة الصورة
                </button>
              </div>
            </div>

            <div class="md:col-span-2">
              <label class="block font-bold mb-1">ملاحظات إضافية</label>
              <textarea
                v-model="form.notes"
                rows="2"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              ></textarea>
            </div>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <button
            type="button"
            @click="productModalOpen = false"
            class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold text-xs cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            @click="handleSaveProduct"
            class="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
          >
            حفظ بيانات الصنف
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: MANAGE PRODUCT SERIALS -->
    <div
      v-if="serialsModalOpen && selectedProductForSerials"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <div>
            <h3 class="font-black text-base text-slate-900 dark:text-white">
              الأرقام التسلسلية — {{ selectedProductForSerials.name }}
            </h3>
            <p class="text-[11px] text-slate-500">
              الماركة: {{ selectedProductForSerials.brand || '—' }} | الموديل:
              {{ selectedProductForSerials.model || '—' }}
            </p>
          </div>
          <button
            type="button"
            @click="serialsModalOpen = false"
            class="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-5 text-xs">
          <!-- Add New Serials Box -->
          <div
            class="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/70 space-y-3"
          >
            <h4 class="font-black text-indigo-950 dark:text-indigo-200">
              + إضافة أرقام تسلسلية جديدة للمخزون
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="md:col-span-2">
                <label class="block font-bold mb-1">
                  الأرقام التسلسلية (امسح بالباركود أو اكتب كل رقم في سطر) *
                </label>
                <textarea
                  v-model="newSerialsInput"
                  rows="2"
                  placeholder="مثال: SN-9928172&#10;SN-9928173"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                ></textarea>
              </div>

              <div class="space-y-2">
                <div>
                  <label class="block font-bold mb-1">الحالة الفنية</label>
                  <select
                    v-model="newSerialCondition"
                    class="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                  >
                    <option value="new">جديد (New)</option>
                    <option value="used">مستعمل مفحوص (Used)</option>
                  </select>
                </div>

                <div>
                  <label class="block font-bold mb-1">تاريخ انتهاء ضمان الشركة</label>
                  <input
                    v-model="newSerialWarrantyEnd"
                    type="date"
                    class="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label class="flex items-center gap-2 font-bold cursor-pointer">
                <input
                  v-model="newSerialRecordInTreasury"
                  type="checkbox"
                  class="rounded text-blue-600"
                />
                <span>
                  خصم التكلفة من الخزينة ({{ selectedProductForSerials.cost_price }} ج.م للقطعة)
                </span>
              </label>

              <button
                type="button"
                @click="handleAddSerials"
                class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
              >
                تسجيل الأرقام التسلسلية بالمخزون
              </button>
            </div>
          </div>

          <!-- Existing Serials Table -->
          <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 dark:bg-slate-800 font-bold">
                <tr>
                  <th class="p-3">الرقم التسلسلي</th>
                  <th class="p-3">النوع</th>
                  <th class="p-3">الحالة الحالية</th>
                  <th class="p-3">ضمان الشركة</th>
                  <th class="p-3">المريض / ضمان العميل</th>
                  <th class="p-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                <tr v-if="productSerialsList.length === 0">
                  <td colspan="6" class="p-6 text-center text-slate-400 font-bold">
                    لا توجد أرقام تسلسلية مسجلة لهذا الصنف بعد
                  </td>
                </tr>
                <tr v-for="s in productSerialsList" :key="s.id">
                  <td class="p-3 font-mono font-black text-blue-700 dark:text-blue-400">
                    {{ s.serial_no }}
                  </td>
                  <td class="p-3">
                    {{ s.condition === 'used' ? 'مستعمل' : 'جديد' }}
                  </td>
                  <td class="p-3">
                    <span
                      :class="[
                        'px-2.5 py-0.5 rounded-full text-[11px] font-bold',
                        SERIAL_STATUS_LABELS[s.status]?.badge
                      ]"
                    >
                      {{ SERIAL_STATUS_LABELS[s.status]?.label }}
                    </span>
                  </td>
                  <td class="p-3 font-mono">{{ s.company_warranty_end || '—' }}</td>
                  <td class="p-3">
                    <div v-if="s.customer_name" class="font-bold">{{ s.customer_name }}</div>
                    <div v-if="s.customer_warranty_end" class="text-[11px] text-emerald-600 font-mono">
                      حتى {{ s.customer_warranty_end }}
                    </div>
                    <span v-if="!s.customer_name && !s.customer_warranty_end">—</span>
                  </td>
                  <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-2">
                      <select
                        :value="s.status"
                        @change="
                          handleSerialStatusChange(
                            s,
                            ($event.target as HTMLSelectElement).value as SerialStatus
                          )
                        "
                        class="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                      >
                        <option value="in_stock">متاح بالمخزون</option>
                        <option value="sold">مباع لعميل</option>
                        <option value="loaned">سماعة بديلة معارة</option>
                        <option value="external_repair">أُرسلت للشركة</option>
                        <option value="defective">معيب / تالف</option>
                        <option value="returned">مرتجع للمورد</option>
                      </select>
                      <button
                        v-if="s.status === 'in_stock' && appStore.canDeleteRecords"
                        type="button"
                        @click="handleDeleteSerial(s)"
                        class="p-1 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
                        title="حذف السيريال"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL 3: STOCK ADJUSTMENT (PACKS / PIECES) -->
    <div
      v-if="stockModalOpen && selectedProductForStock"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <h3 class="font-black text-sm text-slate-900 dark:text-white">
            توريد / تسوية رصيد — {{ selectedProductForStock.name }}
          </h3>
          <button
            type="button"
            @click="stockModalOpen = false"
            class="p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-5 space-y-4 text-xs">
          <div
            v-if="selectedProductForStock.has_variants && selectedProductForStock.variants?.length"
          >
            <label class="block font-bold mb-1">اختر المقاس / التنوع *</label>
            <select
              v-model="stockForm.variant_id"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
            >
              <option
                v-for="v in selectedProductForStock.variants"
                :key="v.id"
                :value="v.id"
              >
                {{ v.variant_name }} (المتاح:
                {{
                  formatDualStock(
                    v.qty,
                    selectedProductForStock.pack_size,
                    selectedProductForStock.unit_name,
                    selectedProductForStock.pack_name
                  )
                }})
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">نوع الحركة</label>
              <select
                v-model="stockForm.movement_type"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="in">توريد / إضافة للمخزون (+)</option>
                <option value="damaged">تالف / خصم من المخزون (-)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold mb-1">وحدة الإدخال</label>
              <select
                v-model="stockForm.unit"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option v-if="selectedProductForStock.pack_size > 1" value="pack">
                  {{ selectedProductForStock.pack_name }} ({{ selectedProductForStock.pack_size }}
                  {{ selectedProductForStock.unit_name }})
                </option>
                <option value="piece">{{ selectedProductForStock.unit_name }} منفردة</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">الكمية</label>
            <input
              v-model.number="stockForm.quantity"
              type="number"
              min="1"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-sm"
            />
            <p
              v-if="selectedProductForStock.pack_size > 1 && stockForm.unit === 'pack'"
              class="text-[11px] text-blue-600 dark:text-blue-400 font-bold mt-1"
            >
              سيتم {{ stockForm.movement_type === 'in' ? 'إضافة' : 'خصم' }}
              {{ stockForm.quantity * selectedProductForStock.pack_size }}
              {{ selectedProductForStock.unit_name }} في المخزون تلقائياً.
            </p>
          </div>

          <div v-if="stockForm.movement_type === 'in'" class="space-y-2">
            <label class="flex items-center gap-2 font-bold cursor-pointer">
              <input v-model="stockForm.recordInTreasury" type="checkbox" class="rounded" />
              <span>تسجيل التكلفة كمنصرف في الخزينة</span>
            </label>

            <select
              v-if="stockForm.recordInTreasury"
              v-model="stockForm.payment_method"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            >
              <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات / سبب الحركة</label>
            <input
              v-model="stockForm.notes"
              type="text"
              placeholder="مثال: توريد سريع..."
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
        >
          <button
            type="button"
            @click="stockModalOpen = false"
            class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold text-xs cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            @click="handleAdjustStock"
            class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
          >
            تأكيد وتحديث المخزون
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
