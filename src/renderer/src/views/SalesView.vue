<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { useAppStore } from '@renderer/stores/appStore'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import type {
  Product,
  ProductVariant,
  ProductSerial,
  SalesInvoice,
  SalesItem,
  InvoiceReturn,
  ProductExchange,
  ExchangeType,
  HearingTest
} from '@shared/types'
import {
  ShoppingCart,
  Zap,
  FileText,
  RotateCcw,
  Repeat,
  Barcode,
  Plus,
  Minus,
  Trash2,
  Printer,
  Wrench,
  Wallet,
  BatteryCharging,
  Search,
  CheckCircle2,
  X,
  AlertTriangle,
  Sparkles,
  PlusCircle,
  Activity
} from 'lucide-vue-next'

const appStore = useAppStore()
const router = useRouter()
const route = useRoute()

const activeTab = ref<'quick_pos' | 'detailed' | 'invoices' | 'returns_exchanges'>('quick_pos')

const products = ref<Product[]>([])
const availableSerials = ref<ProductSerial[]>([])
const invoices = ref<SalesInvoice[]>([])
const salesReturns = ref<InvoiceReturn[]>([])
const exchanges = ref<ProductExchange[]>([])

const searchQuery = ref('')
const filterInvoiceType = ref<'all' | 'regular' | 'quick_pos' | 'exchange'>('all')
const onlyWithRemaining = ref(false)

// ==========================================
// 1. QUICK POS STATE
// ==========================================
const posBarcode = ref('')
const posSearch = ref('')
const posPaymentMethod = ref('cash')
const posDiscount = ref(0)
const posCustomerName = ref('')
const posCustomerPhone = ref('')
const posCart = ref<
  Array<{
    key: string
    product_id: number
    variant_id: number | null
    product_name: string
    variant_name: string
    item_type: Product['type']
    unit: 'piece' | 'pack'
    pack_size: number
    quantity: number
    unit_cost: number
    unit_price: number
    max_pieces: number
  }>
>([])

const batteryQuickCards = computed(() => {
  const cards: Array<{
    key: string
    product: Product
    variant?: ProductVariant
    title: string
    sizeBadge: string
    qtyPieces: number
    piecePrice: number
    packPrice: number
    packSize: number
  }> = []

  for (const p of products.value.filter((x) => x.type === 'battery' && x.is_active)) {
    if (p.has_variants && p.variants && p.variants.length > 0) {
      for (const v of p.variants) {
        cards.push({
          key: `b-${p.id}-${v.id}`,
          product: p,
          variant: v,
          title: `${p.name} - ${v.variant_name}`,
          sizeBadge: v.size || v.variant_name,
          qtyPieces: v.qty,
          piecePrice: Number(v.sale_price ?? p.sale_price),
          packPrice: Number(
            v.pack_sale_price ?? p.pack_sale_price ?? (v.sale_price ?? p.sale_price) * p.pack_size
          ),
          packSize: p.pack_size || 6
        })
      }
    } else {
      cards.push({
        key: `b-${p.id}-0`,
        product: p,
        title: p.name,
        sizeBadge: p.sub_category || 'بطارية',
        qtyPieces: p.qty,
        piecePrice: p.sale_price,
        packPrice: p.pack_sale_price || p.sale_price * p.pack_size,
        packSize: p.pack_size || 6
      })
    }
  }
  return cards
})

const filteredQuickCatalog = computed(() => {
  const q = posSearch.value.trim().toLowerCase()
  return products.value
    .filter((p) => p.is_active && !p.track_serial)
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q)
    )
    .slice(0, 18)
})

const posSubtotal = computed(() =>
  posCart.value.reduce((s, it) => s + it.quantity * it.unit_price, 0)
)
const posTotal = computed(() => Math.max(0, posSubtotal.value - Number(posDiscount.value || 0)))

function roundMoney(val: number): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100
}

function extractErrorMessage(err: unknown, fallback = ''): string {
  const raw = err instanceof Error ? err.message : String(err || '')
  const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim()
  return cleaned || fallback
}

function getAvailablePieces(prod: Product, variant?: ProductVariant | null): number {
  if (prod.type === 'service') return Number.POSITIVE_INFINITY
  return Math.max(0, Number(variant ? variant.qty : prod.qty) || 0)
}

function getPosCartUsedPieces(productId: number, variantId: number | null): number {
  return posCart.value
    .filter((c) => c.product_id === productId && (c.variant_id || null) === (variantId || null))
    .reduce((sum, c) => sum + (c.unit === 'pack' ? c.quantity * (c.pack_size || 1) : c.quantity), 0)
}

function onPosDiscountInput(): void {
  if (typeof posDiscount.value === 'number' && posDiscount.value < 0) {
    posDiscount.value = 0
  }
}

function addToPosCart(
  prod: Product,
  variant?: ProductVariant,
  unit: 'piece' | 'pack' = 'pack'
): void {
  const effectiveUnit: 'piece' | 'pack' = prod.pack_size > 1 ? unit : 'piece'
  const key = `${prod.id}-${variant?.id || 0}-${effectiveUnit}`
  const existing = posCart.value.find((c) => c.key === key)

  const packSz = prod.pack_size || 1
  const stepPieces = effectiveUnit === 'pack' ? packSz : 1
  const maxPieces = getAvailablePieces(prod, variant)
  const usedPieces = getPosCartUsedPieces(prod.id, variant?.id || null)

  if (usedPieces + stepPieces > maxPieces) {
    swalError(
      'تجاوز المخزون المتاح',
      `الرصيد المتاح للصنف (${prod.name}${variant?.variant_name ? ' - ' + variant.variant_name : ''}) هو ${maxPieces} قطعة فقط`
    )
    return
  }

  const uPrice =
    effectiveUnit === 'pack'
      ? Number(
          variant?.pack_sale_price ??
            prod.pack_sale_price ??
            (variant?.sale_price ?? prod.sale_price) * packSz
        )
      : Number(variant?.sale_price ?? prod.sale_price)
  const uCost =
    effectiveUnit === 'pack'
      ? Number(
          variant?.pack_cost_price ??
            prod.pack_cost_price ??
            (variant?.cost_price ?? prod.cost_price) * packSz
        )
      : Number(variant?.cost_price ?? prod.cost_price)

  if (existing) {
    existing.quantity += 1
  } else {
    posCart.value.push({
      key,
      product_id: prod.id,
      variant_id: variant?.id || null,
      product_name: prod.name,
      variant_name: variant?.variant_name || '',
      item_type: prod.type,
      unit: effectiveUnit,
      pack_size: packSz,
      quantity: 1,
      unit_cost: uCost,
      unit_price: uPrice,
      max_pieces: maxPieces
    })
  }
}

function incrementPosCartItem(idx: number): void {
  const item = posCart.value[idx]
  if (!item) return
  const stepPieces = item.unit === 'pack' ? item.pack_size || 1 : 1
  const maxPieces =
    item.item_type === 'service' ? Number.POSITIVE_INFINITY : Math.max(0, Number(item.max_pieces || 0))
  const usedPieces = getPosCartUsedPieces(item.product_id, item.variant_id)

  if (usedPieces + stepPieces > maxPieces) {
    swalError(
      'تجاوز المخزون المتاح',
      `لا يمكن زيادة الكمية؛ الرصيد المتاح للصنف (${item.product_name}) هو ${maxPieces} قطعة`
    )
    return
  }
  item.quantity += 1
}

async function handlePosBarcodeScan(): Promise<void> {
  const code = posBarcode.value.trim()
  if (!code) return
  posBarcode.value = ''
  const found = await window.api.getProductByBarcode(code)
  if (!found) {
    swalError('باركود غير معروف', `لم يتم العثور على صنف بالباركود (${code})`)
    return
  }
  if (found.product.track_serial) {
    swalError(
      'صنف يتبع السيريال',
      'السماعات ومعالجات القوقعة تباع من تبويب (فاتورة مبيعات تفصيلية) لتسجيل الضمان والعميل'
    )
    return
  }
  addToPosCart(
    found.product,
    found.variant,
    found.product.pack_size > 1 ? 'pack' : 'piece'
  )
}

async function completeQuickPosSale(shouldPrint = false): Promise<void> {
  if (posCart.value.length === 0) {
    swalError('السلة فارغة', 'أضف بطارية أو مستلزمات للسلة أولاً')
    return
  }

  if (Number(posDiscount.value || 0) < 0) {
    swalError('خصم غير صالح', 'قيمة الخصم لا يمكن أن تكون سالبة')
    return
  }

  for (const c of posCart.value) {
    if (Number(c.quantity || 0) <= 0 || Number(c.unit_price || 0) < 0) {
      swalError('بيانات غير صالحة', `يرجى مراجعة الكمية والسعر للصنف (${c.product_name})`)
      return
    }
    if (c.item_type !== 'service') {
      const usedPieces = getPosCartUsedPieces(c.product_id, c.variant_id)
      if (usedPieces > Number(c.max_pieces || 0)) {
        swalError(
          'تجاوز المخزون المتاح',
          `الكمية المطلوبة للصنف (${c.product_name}) تتجاوز الرصيد المتاح (${c.max_pieces} قطعة)`
        )
        return
      }
    }
  }

  const items: SalesItem[] = posCart.value.map((c) => ({
    product_id: c.product_id,
    variant_id: c.variant_id,
    product_name: c.product_name,
    variant_name: c.variant_name,
    item_type: c.item_type,
    unit: c.unit,
    pack_size: c.pack_size,
    quantity: c.quantity,
    deducted_pieces_qty: c.unit === 'pack' ? c.quantity * c.pack_size : c.quantity,
    unit_cost: c.unit_cost,
    unit_price: roundMoney(c.unit_price),
    discount: 0,
    total_price: roundMoney(c.quantity * c.unit_price),
    warranty_months: 0,
    returned_qty: 0
  }))

  try {
    let savedInvoice: SalesInvoice | null = null
    await appStore.withLoading(async () => {
      savedInvoice = await window.api.saveSalesInvoice(
        plain({
          invoice_type: 'quick_pos',
          customer_name: posCustomerName.value.trim() || 'عميل نقدي (بيع سريع)',
          customer_phone: posCustomerPhone.value.trim(),
          discount: Number(posDiscount.value || 0),
          paid_amount: roundMoney(posTotal.value),
          payment_method: posPaymentMethod.value,
          recordInTreasury: true,
          items
        })
      )
      posCart.value = []
      posDiscount.value = 0
      posCustomerName.value = ''
      posCustomerPhone.value = ''
      await loadAll()
    }, 'جاري إتمام البيع السريع...')

    if (shouldPrint && savedInvoice) {
      appStore.openSalesPrintModal(savedInvoice, 'thermal80')
    } else {
      swalSuccess('تم إتمام البيع السريع وتحصيل النقدية بنجاح')
    }
  } catch (err: unknown) {
    swalError('تعذر إتمام البيع', extractErrorMessage(err))
  }
}

// ==========================================
// 2. DETAILED SALES INVOICE (HEARING AIDS & SERIALS)
// ==========================================
const detailedForm = ref<{
  customer_id: number | null
  customer_name: string
  customer_phone: string
  discount: number
  paid_amount: number
  payment_method: string
  notes: string
  recordInTreasury: boolean
  items: Array<
    SalesItem & {
      track_serial?: number
      has_variants?: number
      available_variants?: ProductVariant[]
      product_serials?: ProductSerial[]
      available_qty?: number
    }
  >
}>({
  customer_id: null,
  customer_name: '',
  customer_phone: '',
  discount: 0,
  paid_amount: 0,
  payment_method: 'cash',
  notes: '',
  recordInTreasury: true,
  items: []
})

const selectedDetailedProdId = ref<number | null>(null)
const paidAmountManuallyEdited = ref(false)

const detailedSubtotal = computed(() =>
  detailedForm.value.items.reduce(
    (s, it) => s + Math.max(0, Number(it.quantity || 1) * Number(it.unit_price || 0) - Number(it.discount || 0)),
    0
  )
)

const detailedTotal = computed(() =>
  Math.max(0, detailedSubtotal.value - Number(detailedForm.value.discount || 0))
)

const detailedRemaining = computed(() =>
  Math.max(0, detailedTotal.value - Number(detailedForm.value.paid_amount || 0))
)

watch(detailedTotal, (newVal) => {
  if (!paidAmountManuallyEdited.value) {
    detailedForm.value.paid_amount = newVal
  } else if (detailedForm.value.paid_amount > newVal) {
    detailedForm.value.paid_amount = newVal
  }
})

async function lookupCustomerByPhone(): Promise<void> {
  const phone = detailedForm.value.customer_phone.trim()
  if (phone.length < 8) return
  const res = await window.api.findCustomerByPhone(phone)
  if (res.customer) {
    detailedForm.value.customer_id = res.customer.id
    detailedForm.value.customer_name = res.customer.name
  }
}

const patientHearingSummary = ref<{
  latestTest: HearingTest | null
  implantsCount: number
  latestFollowup: any
} | null>(null)

watch(
  () => detailedForm.value.customer_id,
  async (newId) => {
    if (newId && appStore.isHearingAidsProfile) {
      try {
        patientHearingSummary.value = await window.api.getLatestHearingTestSummary(newId)
      } catch {
        patientHearingSummary.value = null
      }
    } else {
      patientHearingSummary.value = null
    }
  }
)

function addRecommendedProductToInvoice(prodId: number): void {
  selectedDetailedProdId.value = prodId
  addDetailedItem()
}

function getDetailedUsedPieces(
  productId: number,
  variantId: number | null,
  excludeIndex = -1
): number {
  return detailedForm.value.items.reduce((sum, it, idx) => {
    if (idx === excludeIndex) return sum
    if (it.product_id !== productId || (it.variant_id || null) !== (variantId || null)) return sum
    const qty = Math.max(0, Number(it.quantity || 0))
    return sum + (it.unit === 'pack' ? qty * (it.pack_size || 1) : qty)
  }, 0)
}

function addDetailedItem(): void {
  if (!selectedDetailedProdId.value) return
  const prod = products.value.find((p) => p.id === selectedDetailedProdId.value)
  if (!prod) return

  const prodSerials = availableSerials.value.filter(
    (s) => s.product_id === prod.id && s.status === 'in_stock'
  )
  const firstVariant = prod.variants && prod.variants.length > 0 ? prod.variants[0] : null
  const availPieces = getAvailablePieces(prod, firstVariant)

  if (prod.track_serial) {
    const usedSerialIds = new Set(
      detailedForm.value.items.map((it) => it.serial_id).filter(Boolean)
    )
    const firstUnusedSerial = prodSerials.find((s) => !usedSerialIds.has(s.id)) || null
    if (prodSerials.length === 0 || !firstUnusedSerial) {
      swalError(
        'تجاوز المخزون المتاح',
        `لا توجد وحدات متاحة برقم سيريال في المخزون للصنف (${prod.name})`
      )
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const endD = new Date()
    endD.setMonth(endD.getMonth() + Number(prod.warranty_months || 0))

    detailedForm.value.items.push({
      product_id: prod.id,
      variant_id: firstVariant?.id || null,
      product_name: prod.name,
      variant_name: firstVariant?.variant_name || '',
      item_type: prod.type,
      unit: 'piece',
      pack_size: prod.pack_size || 1,
      quantity: 1,
      deducted_pieces_qty: 1,
      serial_id: firstUnusedSerial.id,
      serial_no: firstUnusedSerial.serial_no,
      condition: firstUnusedSerial.condition,
      ear_side: firstUnusedSerial.ear_side || 'الأذن اليمنى (Right)',
      unit_cost: prod.cost_price,
      unit_price: prod.sale_price,
      discount: 0,
      total_price: prod.sale_price,
      warranty_months: prod.warranty_months || 0,
      warranty_start: prod.warranty_months > 0 ? today : null,
      warranty_end: prod.warranty_months > 0 ? endD.toISOString().slice(0, 10) : null,
      returned_qty: 0,
      track_serial: prod.track_serial,
      has_variants: prod.has_variants,
      available_variants: prod.variants || [],
      product_serials: prodSerials,
      available_qty: prodSerials.length
    })
    selectedDetailedProdId.value = null
    return
  }

  const usedPieces = getDetailedUsedPieces(prod.id, firstVariant?.id || null)
  if (usedPieces + 1 > availPieces) {
    swalError(
      'تجاوز المخزون المتاح',
      `الرصيد المتاح للصنف (${prod.name}) هو ${availPieces} قطعة فقط`
    )
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const endD = new Date()
  endD.setMonth(endD.getMonth() + Number(prod.warranty_months || 0))

  detailedForm.value.items.push({
    product_id: prod.id,
    variant_id: firstVariant?.id || null,
    product_name: prod.name,
    variant_name: firstVariant?.variant_name || '',
    item_type: prod.type,
    unit: 'piece',
    pack_size: prod.pack_size || 1,
    quantity: 1,
    deducted_pieces_qty: 1,
    serial_id: null,
    serial_no: '',
    condition: 'new',
    ear_side: '',
    unit_cost: prod.cost_price,
    unit_price: prod.sale_price,
    discount: 0,
    total_price: prod.sale_price,
    warranty_months: prod.warranty_months || 0,
    warranty_start: prod.warranty_months > 0 ? today : null,
    warranty_end: prod.warranty_months > 0 ? endD.toISOString().slice(0, 10) : null,
    returned_qty: 0,
    track_serial: prod.track_serial,
    has_variants: prod.has_variants,
    available_variants: prod.variants || [],
    product_serials: prodSerials,
    available_qty: availPieces
  })
  selectedDetailedProdId.value = null
}

function onSerialChange(itemIndex: number): void {
  const it = detailedForm.value.items[itemIndex]
  if (!it || !it.serial_id) return
  const duplicate = detailedForm.value.items.some(
    (other, idx) => idx !== itemIndex && other.serial_id === it.serial_id
  )
  if (duplicate) {
    swalError('سيريال مكرر', 'هذا السيريال مختار بالفعل في بند آخر ضمن نفس الفاتورة')
    it.serial_id = null
    it.serial_no = ''
    return
  }
  const sr = it.product_serials?.find((s) => s.id === it.serial_id)
  if (sr) {
    it.serial_no = sr.serial_no
    it.condition = sr.condition
    if (sr.ear_side) it.ear_side = sr.ear_side
  }
}

function onDetailedItemQtyInput(itemIndex: number): void {
  const it = detailedForm.value.items[itemIndex]
  if (!it) return
  if (typeof it.quantity === 'number' && it.quantity < 1) {
    it.quantity = 1
  }
  if (it.item_type === 'service' || it.track_serial) return

  const prod = products.value.find((p) => p.id === it.product_id)
  const variant = prod?.variants?.find((v) => v.id === it.variant_id)
  const availPieces = prod ? getAvailablePieces(prod, variant) : Number(it.available_qty ?? 0)
  const otherPieces = getDetailedUsedPieces(it.product_id, it.variant_id || null, itemIndex)
  const step = it.unit === 'pack' ? it.pack_size || 1 : 1
  const maxAllowedQty = Math.max(0, Math.floor((availPieces - otherPieces) / step))

  if (Number(it.quantity || 0) > maxAllowedQty) {
    it.quantity = Math.max(1, maxAllowedQty)
    swalError(
      'تجاوز المخزون المتاح',
      `الرصيد المتاح للصنف (${it.product_name}) هو ${availPieces} قطعة فقط`
    )
  }
}

function onDetailedItemPriceInput(itemIndex: number): void {
  const it = detailedForm.value.items[itemIndex]
  if (!it) return
  if (typeof it.unit_price === 'number' && it.unit_price < 0) {
    it.unit_price = 0
  }
}

function onDetailedItemDiscountInput(itemIndex: number): void {
  const it = detailedForm.value.items[itemIndex]
  if (!it) return
  if (typeof it.discount === 'number' && it.discount < 0) {
    it.discount = 0
  }
}

function onDetailedDiscountInput(): void {
  if (typeof detailedForm.value.discount === 'number' && detailedForm.value.discount < 0) {
    detailedForm.value.discount = 0
  }
}

function onDetailedPaidAmountInput(): void {
  paidAmountManuallyEdited.value = true
  if (typeof detailedForm.value.paid_amount === 'number' && detailedForm.value.paid_amount < 0) {
    detailedForm.value.paid_amount = 0
  }
}

async function handleSaveDetailedInvoice(shouldPrint = true): Promise<void> {
  if (!detailedForm.value.customer_name.trim()) {
    swalError('بيانات العميل', 'يرجى إدخال اسم العميل')
    return
  }
  if (detailedForm.value.items.length === 0) {
    swalError('لا توجد أصناف', 'يرجى إضافة صنف واحد على الأقل للفاتورة')
    return
  }
  if (
    Number(detailedForm.value.discount || 0) < 0 ||
    Number(detailedForm.value.paid_amount || 0) < 0
  ) {
    swalError('قيمة غير صالحة', 'الخصم والمبلغ المدفوع لا يمكن أن يكونا بقيمة سالبة')
    return
  }

  const seenSerialIds = new Set<number>()
  for (let idx = 0; idx < detailedForm.value.items.length; idx++) {
    const it = detailedForm.value.items[idx]
    const qty = Number(it.quantity || 0)
    const uPrice = Number(it.unit_price || 0)
    const disc = Number(it.discount || 0)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(uPrice) || uPrice < 0 || disc < 0) {
      swalError('بيانات غير صالحة', `يرجى مراجعة الكمية والسعر والخصم للبند (${it.product_name})`)
      return
    }
    if (it.track_serial) {
      if (!it.serial_id) {
        swalError('اختر السيريال', `يرجى تحديد السيريال نمبر للصنف (${it.product_name})`)
        return
      }
      if (seenSerialIds.has(it.serial_id)) {
        swalError('سيريال مكرر', `السيريال (${it.serial_no}) مكرر في أكثر من بند داخل الفاتورة`)
        return
      }
      seenSerialIds.add(it.serial_id)
    } else if (it.item_type !== 'service') {
      const prod = products.value.find((p) => p.id === it.product_id)
      const variant = prod?.variants?.find((v) => v.id === it.variant_id)
      const availPieces = prod ? getAvailablePieces(prod, variant) : Number(it.available_qty ?? 0)
      const totalUsedPieces = getDetailedUsedPieces(it.product_id, it.variant_id || null)
      if (totalUsedPieces > availPieces) {
        swalError(
          'تجاوز المخزون المتاح',
          `إجمالي الكمية المطلوبة للصنف (${it.product_name}) يتجاوز الرصيد المتاح (${availPieces} قطعة)`
        )
        return
      }
    }
  }

  try {
    let saved: SalesInvoice | null = null
    await appStore.withLoading(async () => {
      saved = await window.api.saveSalesInvoice(
        plain({
          invoice_type: 'regular',
          customer_id: detailedForm.value.customer_id,
          customer_name: detailedForm.value.customer_name,
          customer_phone: detailedForm.value.customer_phone,
          discount: Number(detailedForm.value.discount || 0),
          paid_amount: Number(detailedForm.value.paid_amount || 0),
          payment_method: detailedForm.value.payment_method,
          notes: detailedForm.value.notes,
          recordInTreasury: detailedForm.value.recordInTreasury,
          items: detailedForm.value.items.map((it) => ({
            product_id: it.product_id,
            variant_id: it.variant_id || null,
            product_name: it.product_name,
            variant_name: it.variant_name || '',
            item_type: it.item_type,
            unit: it.unit,
            pack_size: it.pack_size || 1,
            quantity: Number(it.quantity || 1),
            deducted_pieces_qty:
              it.unit === 'pack'
                ? Number(it.quantity || 1) * (it.pack_size || 1)
                : Number(it.quantity || 1),
            serial_id: it.serial_id || null,
            serial_no: it.serial_no || '',
            condition: it.condition || 'new',
            ear_side: it.ear_side || '',
            unit_cost: Number(it.unit_cost || 0),
            unit_price: Number(it.unit_price || 0),
            discount: Number(it.discount || 0),
            total_price: Math.max(
              0,
              Number(it.quantity || 1) * Number(it.unit_price || 0) - Number(it.discount || 0)
            ),
            warranty_months: Number(it.warranty_months || 0),
            warranty_start: it.warranty_start || null,
            warranty_end: it.warranty_end || null,
            returned_qty: 0
          }))
        })
      )
      detailedForm.value = {
        customer_id: null,
        customer_name: '',
        customer_phone: '',
        discount: 0,
        paid_amount: 0,
        payment_method: 'cash',
        notes: '',
        recordInTreasury: true,
        items: []
      }
      paidAmountManuallyEdited.value = false
      await loadAll()
      activeTab.value = 'invoices'
    }, 'جاري حفظ الفاتورة وتسجيل الضمان وملف العميل...')

    if (shouldPrint && saved) {
      appStore.openSalesPrintModal(saved, 'a4')
    } else {
      swalSuccess('تم حفظ فاتورة المبيعات وربط السماعة بملف العميل بنجاح')
    }
  } catch (err: unknown) {
    swalError('تعذر حفظ الفاتورة', err instanceof Error ? err.message : '')
  }
}

// ==========================================
// 3. INSTALLMENT COLLECTION, RETURNS & EXCHANGES MODALS
// ==========================================
const installmentModalOpen = ref(false)
const invoiceToCollect = ref<SalesInvoice | null>(null)
const installmentForm = ref({
  amount: 0,
  payment_method: 'cash',
  notes: ''
})

function openInstallmentModal(inv: SalesInvoice): void {
  invoiceToCollect.value = inv
  installmentForm.value = {
    amount: inv.remaining_amount,
    payment_method: inv.payment_method || 'cash',
    notes: ''
  }
  installmentModalOpen.value = true
}

async function handleCollectInstallment(): Promise<void> {
  if (!invoiceToCollect.value) return
  try {
    await appStore.withLoading(async () => {
      await window.api.collectSalesInstallment(
        plain({
          invoice_id: invoiceToCollect.value!.id,
          amount: Number(installmentForm.value.amount || 0),
          payment_method: installmentForm.value.payment_method,
          notes: installmentForm.value.notes
        })
      )
      installmentModalOpen.value = false
      await loadAll()
    }, 'جاري تحصيل القسط...')
    swalSuccess('تم تحصيل القسط وإضافته للخزينة بنجاح')
  } catch (err: unknown) {
    swalError('تعذر التحصيل', err instanceof Error ? err.message : '')
  }
}

// Sales Return Modal
const salesReturnModalOpen = ref(false)
const invoiceToReturn = ref<SalesInvoice | null>(null)
const salesReturnForm = ref<{
  payment_method: string
  reason: string
  items: Array<{
    invoice_item_id: number
    product_name: string
    serial_no: string
    max_qty: number
    quantity: number
    return_condition: 'in_stock' | 'defective'
    gross_unit_price: number
    item_discount_per_unit: number
    effective_unit_before_invoice_discount: number
    invoice_discount_share_per_unit: number
    net_unit_refund: number
  }>
}>({
  payment_method: 'cash',
  reason: '',
  items: []
})

const salesReturnSummary = computed(() => {
  const inv = invoiceToReturn.value
  if (!inv) {
    return {
      invoiceDiscountTotal: 0,
      hasInvoiceDiscount: false,
      totalReturnAmount: 0,
      balanceAdjusted: 0,
      cashRefunded: 0
    }
  }
  const invoiceDiscountTotal = roundMoney(
    Number(inv.discount || 0) + Number(inv.trade_in_credit || 0)
  )
  const totalReturnAmount = roundMoney(
    salesReturnForm.value.items.reduce((sum, item) => {
      const qty = Math.max(0, Number(item.quantity || 0))
      if (qty <= 0) return sum
      return sum + roundMoney(item.net_unit_refund * qty)
    }, 0)
  )
  const balanceAdjusted = roundMoney(
    Math.min(Math.max(0, Number(inv.remaining_amount || 0)), totalReturnAmount)
  )
  const cashRefunded = roundMoney(Math.max(0, totalReturnAmount - balanceAdjusted))
  return {
    invoiceDiscountTotal,
    hasInvoiceDiscount: invoiceDiscountTotal > 0,
    totalReturnAmount,
    balanceAdjusted,
    cashRefunded
  }
})

function onSalesReturnItemQtyInput(item: { quantity: number; max_qty: number }): void {
  if (typeof item.quantity === 'number' && item.quantity < 0) {
    item.quantity = 0
  }
}

function openSalesReturnModal(inv: SalesInvoice): void {
  invoiceToReturn.value = inv
  const subtotal = Number(inv.subtotal || 0)
  const totalAmount = Number(inv.total_amount || 0)
  const invoiceRatio = subtotal > 0 ? totalAmount / subtotal : 1

  salesReturnForm.value = {
    payment_method: inv.payment_method || 'cash',
    reason: '',
    items: (inv.items || [])
      .filter((it) => it.quantity - (it.returned_qty || 0) > 0)
      .map((it) => {
        const origQty = Math.max(1, Number(it.quantity || 1))
        const grossUnit = Number(it.unit_price || 0)
        const lineTotal = Number(
          it.total_price ?? Math.max(0, origQty * grossUnit - Number(it.discount || 0))
        )
        const effectiveUnitBeforeInvDisc = lineTotal / origQty
        const itemDiscountPerUnit = Math.max(0, grossUnit - effectiveUnitBeforeInvDisc)
        const netUnitRefund = effectiveUnitBeforeInvDisc * invoiceRatio
        const invoiceDiscountSharePerUnit = Math.max(0, effectiveUnitBeforeInvDisc - netUnitRefund)

        return {
          invoice_item_id: it.id!,
          product_name: it.product_name,
          serial_no: it.serial_no || '',
          max_qty: it.quantity - (it.returned_qty || 0),
          quantity: 0,
          return_condition: 'in_stock',
          gross_unit_price: roundMoney(grossUnit),
          item_discount_per_unit: roundMoney(itemDiscountPerUnit),
          effective_unit_before_invoice_discount: roundMoney(effectiveUnitBeforeInvDisc),
          invoice_discount_share_per_unit: roundMoney(invoiceDiscountSharePerUnit),
          net_unit_refund: netUnitRefund
        }
      })
  }
  salesReturnModalOpen.value = true
}

async function handleCreateSalesReturn(): Promise<void> {
  if (!invoiceToReturn.value) return
  for (const item of salesReturnForm.value.items) {
    const qty = Number(item.quantity || 0)
    if (!Number.isFinite(qty) || qty < 0) {
      swalError('كمية غير صالحة', `كمية المرتجع للصنف (${item.product_name}) لا يمكن أن تكون سالبة`)
      return
    }
    if (qty > item.max_qty) {
      swalError(
        'تجاوز الحد المتاح',
        `الكمية المرتجعة للصنف (${item.product_name}) تتجاوز المتبقي القابل للإرجاع (${item.max_qty})`
      )
      return
    }
  }

  const selected = salesReturnForm.value.items.filter((x) => Number(x.quantity || 0) > 0)
  if (selected.length === 0) {
    swalError('حدد الأصناف', 'يرجى تحديد الكمية المرتجعة لصنف واحد على الأقل')
    return
  }

  try {
    await appStore.withLoading(async () => {
      await window.api.createSalesReturn(
        plain({
          invoice_id: invoiceToReturn.value!.id,
          payment_method: salesReturnForm.value.payment_method,
          reason: salesReturnForm.value.reason,
          items: selected.map((x) => ({
            invoice_item_id: x.invoice_item_id,
            quantity: Number(x.quantity),
            return_condition: x.return_condition
          }))
        })
      )
      salesReturnModalOpen.value = false
      await loadAll()
    }, 'جاري تسجيل مرتجع المبيعات...')
    swalSuccess('تم تسجيل مرتجع المبيعات وتحديث المخزون والخزينة بنجاح')
  } catch (err: unknown) {
    swalError('تعذر تسجيل المرتجع', extractErrorMessage(err))
  }
}

// 3-Mode Exchange Modal
const exchangeModalOpen = ref(false)
const exchangeInvoice = ref<SalesInvoice | null>(null)
const exchangeDaysRemaining = computed(() => {
  if (!exchangeInvoice.value?.created_at) return null
  const policyDays = Number(appStore.settings.exchange_policy_days ?? 14)
  const created = new Date(exchangeInvoice.value.created_at)
  const diffDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
  return policyDays - diffDays
})

const exchangeForm = ref<{
  exchange_type: ExchangeType
  original_invoice_id: number | null
  original_sale_item_id: number | null
  customer_id: number | null
  customer_name: string
  customer_phone: string
  returned_product_id: number | null
  returned_serial_no: string
  returned_condition: 'in_stock' | 'used' | 'defective'
  returned_value: number
  new_product_id: number | null
  new_serial_id: number | null
  new_ear_side: string
  new_value: number
  difference_direction: 'collect' | 'refund'
  difference_amount: number
  paid_difference: number
  payment_method: string
  create_external_repair_ticket: boolean
  external_vendor: string
  notes: string
}>({
  exchange_type: 'normal_exchange',
  original_invoice_id: null,
  original_sale_item_id: null,
  customer_id: null,
  customer_name: '',
  customer_phone: '',
  returned_product_id: null,
  returned_serial_no: '',
  returned_condition: 'in_stock',
  returned_value: 0,
  new_product_id: null,
  new_serial_id: null,
  new_ear_side: 'الأذن اليمنى (Right)',
  new_value: 0,
  difference_direction: 'collect',
  difference_amount: 0,
  paid_difference: 0,
  payment_method: 'cash',
  create_external_repair_ticket: true,
  external_vendor: 'الوكيل المعتمد',
  notes: ''
})

const exchangeNewSerials = computed(() =>
  availableSerials.value.filter(
    (s) => s.product_id === exchangeForm.value.new_product_id && s.status === 'in_stock'
  )
)

const exchangePriceDiff = computed(() => {
  if (exchangeForm.value.exchange_type === 'warranty_exchange') return 0
  return roundMoney(
    Number(exchangeForm.value.new_value || 0) - Number(exchangeForm.value.returned_value || 0)
  )
})

const signedExchangePaidDifference = computed(() => {
  if (exchangeForm.value.exchange_type === 'warranty_exchange') return 0
  const amt = roundMoney(Math.max(0, Number(exchangeForm.value.difference_amount || 0)))
  if (amt === 0) return 0
  return exchangeForm.value.difference_direction === 'refund' ? -amt : amt
})

watch(exchangePriceDiff, (diff) => {
  exchangeForm.value.difference_direction = diff < 0 ? 'refund' : 'collect'
  exchangeForm.value.difference_amount = roundMoney(Math.abs(diff))
  exchangeForm.value.paid_difference = diff
})

function onExchangeValueInput(): void {
  if (typeof exchangeForm.value.returned_value === 'number' && exchangeForm.value.returned_value < 0) {
    exchangeForm.value.returned_value = 0
  }
  if (typeof exchangeForm.value.new_value === 'number' && exchangeForm.value.new_value < 0) {
    exchangeForm.value.new_value = 0
  }
}

function onExchangeDiffAmountInput(): void {
  if (
    typeof exchangeForm.value.difference_amount === 'number' &&
    exchangeForm.value.difference_amount < 0
  ) {
    exchangeForm.value.difference_amount = 0
  }
  exchangeForm.value.paid_difference = signedExchangePaidDifference.value
}

function setExchangeDirection(dir: 'collect' | 'refund'): void {
  exchangeForm.value.difference_direction = dir
  exchangeForm.value.paid_difference = signedExchangePaidDifference.value
}

function openExchangeModal(inv?: SalesInvoice): void {
  exchangeInvoice.value = inv || null
  const firstItem = inv?.items?.[0]
  const defaultNewProd = hearingAidOrProcessorProducts.value[0]

  exchangeForm.value = {
    exchange_type: inv ? 'normal_exchange' : 'trade_in',
    original_invoice_id: inv?.id || null,
    original_sale_item_id: firstItem?.id || null,
    customer_id: inv?.customer_id || null,
    customer_name: inv?.customer_name || '',
    customer_phone: inv?.customer_phone || '',
    returned_product_id: firstItem?.product_id || defaultNewProd?.id || null,
    returned_serial_no: firstItem?.serial_no || '',
    returned_condition: inv ? 'in_stock' : 'used',
    returned_value: firstItem ? firstItem.unit_price : 0,
    new_product_id: defaultNewProd?.id || null,
    new_serial_id: null,
    new_ear_side: firstItem?.ear_side || 'الأذن اليمنى (Right)',
    new_value: defaultNewProd?.sale_price || 0,
    difference_direction: 'collect',
    difference_amount: 0,
    paid_difference: 0,
    payment_method: inv?.payment_method || 'cash',
    create_external_repair_ticket: true,
    external_vendor: 'الوكيل المعتمد',
    notes: ''
  }
  onExchangeNewProductChange()
  const initialDiff = exchangePriceDiff.value
  exchangeForm.value.difference_direction = initialDiff < 0 ? 'refund' : 'collect'
  exchangeForm.value.difference_amount = roundMoney(Math.abs(initialDiff))
  exchangeForm.value.paid_difference = initialDiff
  exchangeModalOpen.value = true
}

const hearingAidOrProcessorProducts = computed(() =>
  products.value.filter((p) => p.is_active && p.type !== 'service')
)

function onExchangeNewProductChange(): void {
  const prod = products.value.find((p) => p.id === exchangeForm.value.new_product_id)
  if (prod) {
    exchangeForm.value.new_value = prod.sale_price
    const firstSn = availableSerials.value.find(
      (s) => s.product_id === prod.id && s.status === 'in_stock'
    )
    exchangeForm.value.new_serial_id = firstSn ? firstSn.id : null
  }
}

async function handleProcessExchange(): Promise<void> {
  if (!exchangeForm.value.returned_product_id || !exchangeForm.value.new_product_id) {
    swalError('بيانات ناقصة', 'يرجى تحديد الصنف المسترد والصنف البديل الجديد')
    return
  }
  if (!exchangeForm.value.customer_name.trim()) {
    swalError('اسم العميل', 'يرجى إدخال اسم العميل')
    return
  }
  if (
    Number(exchangeForm.value.returned_value || 0) < 0 ||
    Number(exchangeForm.value.new_value || 0) < 0 ||
    Number(exchangeForm.value.difference_amount || 0) < 0
  ) {
    swalError('قيمة غير صالحة', 'لا يمكن إدخال مبالغ سالبة؛ اختر اتجاه الفرق (تحصيل أو رد) وأدخل مبلغاً موجباً')
    return
  }

  try {
    await appStore.withLoading(async () => {
      await window.api.processProductExchange(
        plain({
          exchange_type: exchangeForm.value.exchange_type,
          original_invoice_id: exchangeForm.value.original_invoice_id,
          original_sale_item_id: exchangeForm.value.original_sale_item_id,
          customer_id: exchangeForm.value.customer_id,
          customer_name: exchangeForm.value.customer_name,
          customer_phone: exchangeForm.value.customer_phone,
          returned_product_id: exchangeForm.value.returned_product_id!,
          returned_serial_no: exchangeForm.value.returned_serial_no,
          returned_condition: exchangeForm.value.returned_condition,
          returned_value: Number(exchangeForm.value.returned_value || 0),
          new_product_id: exchangeForm.value.new_product_id!,
          new_serial_id: exchangeForm.value.new_serial_id,
          new_ear_side: exchangeForm.value.new_ear_side,
          new_value: Number(exchangeForm.value.new_value || 0),
          paid_difference: signedExchangePaidDifference.value,
          payment_method: exchangeForm.value.payment_method,
          create_external_repair_ticket: exchangeForm.value.create_external_repair_ticket,
          external_vendor: exchangeForm.value.external_vendor,
          notes: exchangeForm.value.notes
        })
      )
      exchangeModalOpen.value = false
      await loadAll()
    }, 'جاري تنفيذ عملية الاستبدال...')
    swalSuccess('تم تنفيذ عملية الاستبدال وتحديث السيريالات والمخزن بنجاح')
  } catch (err: unknown) {
    swalError('تعذر تنفيذ الاستبدال', extractErrorMessage(err))
  }
}

function openMaintenanceFromInvoice(inv: SalesInvoice): void {
  const firstSerial = inv.items?.find((i) => i.serial_no)?.serial_no
  router.push({
    path: '/tickets',
    query: firstSerial ? { serial: firstSerial } : { invoice_id: String(inv.id) }
  })
}

async function handleDeleteSalesInvoice(inv: SalesInvoice): Promise<void> {
  const ok = await swalConfirm(
    'حذف فاتورة مبيعات',
    `هل أنت متأكد من حذف فاتورة المبيعات (${inv.invoice_number}) وإرجاع أصنافها للمخزن؟`
  )
  if (!ok) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteSalesInvoice(inv.id)
      await loadAll()
    }, 'جاري حذف الفاتورة...')
    swalSuccess('تم حذف الفاتورة بنجاح')
  } catch (err: unknown) {
    swalError('تعذر الحذف', err instanceof Error ? err.message : '')
  }
}

async function loadAll(): Promise<void> {
  const [prods, srs, invs, rets, exs] = await Promise.all([
    window.api.listProducts({ activeOnly: false }),
    window.api.listProductSerials({ status: 'in_stock' }),
    window.api.listSalesInvoices({
      search: searchQuery.value,
      invoice_type: filterInvoiceType.value,
      only_with_remaining: onlyWithRemaining.value
    }),
    window.api.listInvoiceReturns('sales_return'),
    window.api.listProductExchanges()
  ])
  products.value = prods
  availableSerials.value = srs
  invoices.value = invs
  salesReturns.value = rets
  exchanges.value = exs
}

watch([searchQuery, filterInvoiceType, onlyWithRemaining], () => {
  loadAll()
})

onMounted(async () => {
  await loadAll()
  if (route.query.patientId) {
    activeTab.value = 'detailed'
    const pId = Number(route.query.patientId)
    try {
      const custs = await window.api.listCustomers('')
      const c = custs.find((x) => x.id === pId)
      if (c) {
        detailedForm.value.customer_id = c.id
        detailedForm.value.customer_name = c.name
        detailedForm.value.customer_phone = c.phone
      }
      if (route.query.recommendedProductId) {
        const recId = Number(route.query.recommendedProductId)
        selectedDetailedProdId.value = recId
        addDetailedItem()
      }
    } catch (err) {
      console.error('Error prefilling sale from route query:', err)
    }
  }
})
</script>

<template>
  <div class="space-y-5">
    <!-- Top Header & Navigation Tabs -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-12 h-12 rounded-2xl bg-emerald-600/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
        >
          <ShoppingCart class="w-6 h-6" />
        </div>
        <div>
          <h2 class="text-xl font-black text-slate-900 dark:text-white">
            المبيعات ونقطة البيع السريع (POS) والاستبدال
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            بيع البطاريات السريع بضغطة واحدة، فواتير بيع السماعات بالضمان والأقساط، والمرتجعات والاستبدال
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl text-xs font-bold">
        <button
          type="button"
          @click="activeTab = 'quick_pos'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'quick_pos'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <Zap class="w-4 h-4" />
          بيع سريع (POS - بطاريات ومستلزمات)
        </button>

        <button
          type="button"
          @click="activeTab = 'detailed'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'detailed'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <FileText class="w-4 h-4" />
          فاتورة مبيعات سماعة / قوقعة
        </button>

        <button
          type="button"
          @click="activeTab = 'invoices'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'invoices'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <ShoppingCart class="w-4 h-4" />
          سجل الفواتير والأقساط ({{ invoices.length }})
        </button>

        <button
          type="button"
          @click="activeTab = 'returns_exchanges'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'returns_exchanges'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <Repeat class="w-4 h-4" />
          المرتجعات والاستبدال ({{ salesReturns.length + exchanges.length }})
        </button>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- TAB 1: QUICK POS (NO CUSTOMER REQUIRED)                 -->
    <!-- ======================================================= -->
    <div v-if="activeTab === 'quick_pos'" class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- Right 2 Cols: Barcode & Quick Battery Buttons + Catalog -->
      <div class="lg:col-span-2 space-y-5">
        <!-- Barcode Scanner Input -->
        <div
          class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3"
        >
          <div class="relative flex-1 min-w-[220px]">
            <Barcode class="w-5 h-5 text-emerald-600 absolute right-3 top-2.5" />
            <input
              v-model="posBarcode"
              @keyup.enter="handlePosBarcodeScan"
              type="text"
              placeholder="امسح الباركود هنا واضغط Enter للإضافة الفورية..."
              class="w-full pr-10 pl-4 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-slate-800 text-sm font-mono"
            />
          </div>
          <div class="relative flex-1 min-w-[200px]">
            <Search class="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              v-model="posSearch"
              type="text"
              placeholder="بحث سريع في الفلاتر وقطع الغيار..."
              class="w-full pr-9 pl-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        <!-- Quick Battery Sizes Grid (10, 312, 13, 675...) -->
        <div
          v-if="batteryQuickCards.length > 0"
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3"
        >
          <h3 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <BatteryCharging class="w-5 h-5 text-amber-500" />
            البيع السريع للبطاريات (بالباكيت / الشريط أو بالحبة)
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div
              v-for="b in batteryQuickCards"
              :key="b.key"
              class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col justify-between gap-2.5"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="font-black text-xs text-slate-900 dark:text-white">{{ b.title }}</div>
                  <div class="text-[11px] text-slate-500 mt-0.5">
                    المتاح: {{ b.qtyPieces }} حبة ({{ Math.floor(b.qtyPieces / b.packSize) }} شريط)
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded-lg bg-amber-500 text-white font-black text-xs">
                  {{ b.sizeBadge }}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  @click="addToPosCart(b.product, b.variant, 'pack')"
                  class="px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition cursor-pointer"
                >
                  + شريط ({{ b.packPrice }} ج)
                </button>
                <button
                  type="button"
                  @click="addToPosCart(b.product, b.variant, 'piece')"
                  class="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-900 dark:text-white font-bold text-[11px] transition cursor-pointer"
                >
                  + حبة ({{ b.piecePrice }} ج)
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Other Accessories / Parts / Services Quick Grid -->
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3"
        >
          <h3 class="font-bold text-sm text-slate-900 dark:text-white">
            المستلزمات، الفلاتر، القوالب، والخدمات السريعة
          </h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              v-for="p in filteredQuickCatalog"
              :key="p.id"
              type="button"
              @click="addToPosCart(p, p.variants?.[0], 'piece')"
              class="text-right p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-800/40 transition cursor-pointer"
            >
              <div class="font-bold text-xs text-slate-900 dark:text-white truncate">
                {{ p.name }}
              </div>
              <div class="flex items-center justify-between mt-1.5 text-[11px]">
                <span class="font-black text-emerald-600">{{ p.sale_price }} ج.م</span>
                <span v-if="p.type !== 'service'" class="text-slate-400">رصيد: {{ p.qty }}</span>
                <span v-else class="text-indigo-500 font-bold">خدمة</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Left Col: POS Cart -->
      <div class="space-y-4">
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 sticky top-4"
        >
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 class="font-black text-base text-slate-900 dark:text-white">
              سلة البيع السريع (بدون عميل)
            </h3>
            <button
              v-if="posCart.length > 0"
              type="button"
              @click="posCart = []"
              class="text-xs text-rose-500 font-bold cursor-pointer"
            >
              إفراغ السلة
            </button>
          </div>

          <div v-if="posCart.length === 0" class="py-12 text-center text-slate-400 text-xs">
            اضغط على أي بطارية أو صنف لإضافته للسلة الفورية
          </div>

          <div v-else class="space-y-2.5 max-h-[300px] overflow-y-auto">
            <div
              v-for="(item, idx) in posCart"
              :key="item.key"
              class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs"
            >
              <div class="flex-1">
                <div class="font-bold text-slate-900 dark:text-white">
                  {{ item.product_name }}
                  <span v-if="item.variant_name">({{ item.variant_name }})</span>
                </div>
                <div class="text-[11px] text-slate-500">
                  {{ item.unit === 'pack' ? `شريط (${item.pack_size} حبة)` : 'قطعة مفردة' }} ×
                  {{ Number(item.unit_price || 0).toFixed(2) }} ج.م
                </div>
              </div>

              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  @click="item.quantity > 1 ? item.quantity-- : posCart.splice(idx, 1)"
                  class="p-1 rounded bg-slate-200 dark:bg-slate-700 cursor-pointer"
                >
                  <Minus class="w-3.5 h-3.5" />
                </button>
                <span class="font-black w-6 text-center">{{ item.quantity }}</span>
                <button
                  type="button"
                  @click="incrementPosCartItem(idx)"
                  class="p-1 rounded bg-slate-200 dark:bg-slate-700 cursor-pointer"
                >
                  <Plus class="w-3.5 h-3.5" />
                </button>
              </div>

              <div class="font-black text-emerald-600 w-20 text-left">
                {{ (item.quantity * item.unit_price).toFixed(2) }} ج.م
              </div>
            </div>
          </div>

          <div class="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div class="grid grid-cols-2 gap-2">
              <input
                v-model="posCustomerName"
                type="text"
                placeholder="اسم العميل (اختياري)"
                class="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <input
                v-model="posCustomerPhone"
                type="text"
                placeholder="موبايل (اختياري)"
                class="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold mb-1">خصم (ج.م)</label>
                <input
                  v-model.number="posDiscount"
                  @input="onPosDiscountInput"
                  type="number"
                  min="0"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">طريقة الدفع</label>
                <select
                  v-model="posPaymentMethod"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>

            <div
              class="flex justify-between items-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
            >
              <span class="font-bold">الصافي نقداً:</span>
              <span class="text-xl font-black">{{ posTotal.toFixed(2) }} ج.م</span>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                @click="completeQuickPosSale(false)"
                class="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition cursor-pointer"
              >
                <CheckCircle2 class="w-4 h-4" />
                تحصيل سريع فقط
              </button>
              <button
                type="button"
                @click="completeQuickPosSale(true)"
                class="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md transition cursor-pointer"
              >
                <Printer class="w-4 h-4" />
                تحصيل + إيصال
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- TAB 2: DETAILED SALES INVOICE (HEARING AIDS & WARRANTY) -->
    <!-- ======================================================= -->
    <div v-else-if="activeTab === 'detailed'" class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2 space-y-5">
        <!-- Customer Info -->
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <h3 class="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2.5">
            👤 بيانات العميل (تُربط السماعة المباعة بملفه وضمانه تلقائياً)
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رقم موبايل العميل (بحث تلقائي) *
              </label>
              <input
                v-model="detailedForm.customer_phone"
                @blur="lookupCustomerByPhone"
                type="text"
                placeholder="010xxxxxxxx"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                اسم العميل *
              </label>
              <input
                v-model="detailedForm.customer_name"
                type="text"
                placeholder="الاسم الثلاثي للعميل"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
              />
            </div>
          </div>

          <!-- Smart Audiology Summary & Product Recommendation (Phase 4E) -->
          <div
            v-if="patientHearingSummary?.latestTest"
            class="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div class="flex items-center gap-2.5">
              <Sparkles class="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <div class="font-black text-blue-950 dark:text-blue-200">
                  آخر فحص سمعي للمريض ({{ patientHearingSummary.latestTest.test_date }} - رقم {{ patientHearingSummary.latestTest.test_number }}):
                  يمين PTA {{ patientHearingSummary.latestTest.pta_right ?? '—' }} dB ({{ patientHearingSummary.latestTest.loss_degree_right || 'طبيعي' }}) |
                  يسار PTA {{ patientHearingSummary.latestTest.pta_left ?? '—' }} dB ({{ patientHearingSummary.latestTest.loss_degree_left || 'طبيعي' }})
                </div>
                <div v-if="patientHearingSummary.latestTest.recommended_product_name" class="text-emerald-700 dark:text-emerald-400 font-bold mt-1">
                  💡 توصية الأخصائي: {{ patientHearingSummary.latestTest.recommended_product_name }}
                  <span v-if="patientHearingSummary.latestTest.recommendation_notes" class="text-slate-500 font-normal mr-1">
                    ({{ patientHearingSummary.latestTest.recommendation_notes }})
                  </span>
                </div>
              </div>
            </div>

            <button
              v-if="patientHearingSummary.latestTest.recommended_product_id"
              type="button"
              @click="addRecommendedProductToInvoice(patientHearingSummary.latestTest.recommended_product_id)"
              class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <PlusCircle class="w-4 h-4" />
              إضافة السماعة الموصى بها للفاتورة
            </button>
          </div>
        </div>

        <!-- Add Items -->
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex-1 min-w-[240px]">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                اختر السماعة / معالج القوقعة / القالب / الخدمة
              </label>
              <select
                v-model="selectedDetailedProdId"
                class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option :value="null">-- اختر الصنف لإدراجه في الفاتورة --</option>
                <option
                  v-for="p in products.filter((x) => x.is_active)"
                  :key="p.id"
                  :value="p.id"
                >
                  [{{ p.code }}] {{ p.name }} — السعر: {{ p.sale_price }} ج.م (متاح: {{ p.qty }})
                </option>
              </select>
            </div>
            <button
              type="button"
              @click="addDetailedItem"
              class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer"
            >
              + إضافة للفاتورة
            </button>
          </div>

          <div v-if="detailedForm.items.length === 0" class="py-10 text-center text-slate-400 text-sm">
            لم يتم إضافة أصناف بعد.
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="(item, idx) in detailedForm.items"
              :key="idx"
              class="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3"
            >
              <div class="flex items-center justify-between">
                <div class="font-black text-sm text-slate-900 dark:text-white">
                  {{ idx + 1 }}. {{ item.product_name }}
                </div>
                <button
                  type="button"
                  @click="detailedForm.items.splice(idx, 1)"
                  class="text-rose-500 cursor-pointer"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>

              <!-- Serial & Ear Side Selection for Hearing Aids -->
              <div
                v-if="item.track_serial"
                class="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
              >
                <div>
                  <label class="block text-[11px] font-bold text-blue-800 dark:text-blue-300 mb-1">
                    السيريال نمبر المتاح بالمخزن *
                  </label>
                  <select
                    v-model="item.serial_id"
                    @change="onSerialChange(idx)"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  >
                    <option :value="null">-- اختر السيريال --</option>
                    <option v-for="sn in item.product_serials" :key="sn.id" :value="sn.id">
                      {{ sn.serial_no }} ({{ sn.condition === 'used' ? 'مستعملة' : 'جديدة' }})
                    </option>
                  </select>
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-blue-800 dark:text-blue-300 mb-1">
                    الأذن (يمين / يسار)
                  </label>
                  <select
                    v-model="item.ear_side"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="الأذن اليمنى (Right)">الأذن اليمنى (Right)</option>
                    <option value="الأذن اليسرى (Left)">الأذن اليسرى (Left)</option>
                    <option value="الأذنين معاً (Bilateral)">الأذنين معاً (Bilateral)</option>
                  </select>
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-blue-800 dark:text-blue-300 mb-1">
                    الضمان للعميل (بالشهور)
                  </label>
                  <input
                    v-model.number="item.warranty_months"
                    type="number"
                    min="0"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label class="block font-bold text-slate-500 mb-1">
                    الكمية
                    <span
                      v-if="item.item_type !== 'service' && item.available_qty !== undefined"
                      class="text-[10px] text-slate-400 font-normal"
                    >
                      (متاح: {{ item.available_qty }})
                    </span>
                  </label>
                  <input
                    v-model.number="item.quantity"
                    @input="onDetailedItemQtyInput(idx)"
                    :disabled="Boolean(item.track_serial)"
                    type="number"
                    min="1"
                    :max="
                      item.item_type === 'service'
                        ? undefined
                        : item.track_serial
                          ? 1
                          : Math.max(1, Number(item.available_qty || 1))
                    "
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label class="block font-bold text-slate-500 mb-1">سعر البيع (ج.م)</label>
                  <input
                    v-model.number="item.unit_price"
                    @input="onDetailedItemPriceInput(idx)"
                    type="number"
                    min="0"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label class="block font-bold text-slate-500 mb-1">خصم على البند</label>
                  <input
                    v-model.number="item.discount"
                    @input="onDetailedItemDiscountInput(idx)"
                    type="number"
                    min="0"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label class="block font-bold text-slate-500 mb-1">الصافي</label>
                  <div class="px-2.5 py-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-950 font-black text-blue-600">
                    {{
                      Math.max(
                        0,
                        Number(item.quantity || 1) * Number(item.unit_price || 0) -
                          Number(item.discount || 0)
                      ).toFixed(2)
                    }}
                    ج.م
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Left Col: Totals & Installments -->
      <div class="space-y-4">
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 sticky top-4 text-xs"
        >
          <h3 class="font-black text-base text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            الحساب النهائي والدفعات
          </h3>

          <div class="flex justify-between text-sm">
            <span>إجمالي البنود:</span>
            <span class="font-bold">{{ detailedSubtotal.toFixed(2) }} ج.م</span>
          </div>

          <div>
            <label class="block font-bold mb-1">خصم إضافي على الفاتورة (ج.م)</label>
            <input
              v-model.number="detailedForm.discount"
              @input="onDetailedDiscountInput"
              type="number"
              min="0"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
            />
          </div>

          <div
            class="flex justify-between items-center p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200"
          >
            <span class="font-bold text-sm">الصافي المطلوب:</span>
            <span class="text-xl font-black">{{ detailedTotal.toFixed(2) }} ج.م</span>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block font-bold">المبلغ المدفوع مقدماً / الآن (ج.م)</label>
              <button
                v-if="paidAmountManuallyEdited && detailedForm.paid_amount !== detailedTotal"
                type="button"
                @click="
                  paidAmountManuallyEdited = false;
                  detailedForm.paid_amount = detailedTotal
                "
                class="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
              >
                سداد بالكامل
              </button>
            </div>
            <input
              v-model.number="detailedForm.paid_amount"
              @input="onDetailedPaidAmountInput"
              type="number"
              min="0"
              :max="detailedTotal"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black text-emerald-600"
            />
          </div>

          <div
            v-if="detailedRemaining > 0"
            class="flex justify-between items-center p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold"
          >
            <span>متبقي (أقساط / ذمم على العميل):</span>
            <span>{{ detailedRemaining.toFixed(2) }} ج.م</span>
          </div>

          <div>
            <label class="block font-bold mb-1">طريقة الدفع</label>
            <select
              v-model="detailedForm.payment_method"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            >
              <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات الفاتورة وشروط الأقساط</label>
            <textarea
              v-model="detailedForm.notes"
              rows="2"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            ></textarea>
          </div>

          <button
            type="button"
            @click="handleSaveDetailedInvoice(true)"
            class="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md transition cursor-pointer"
          >
            <Printer class="w-4 h-4" />
            حفظ وطباعة الفاتورة وشهادة الضمان
          </button>
        </div>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- TAB 3: SALES INVOICES REGISTRY & INSTALLMENTS           -->
    <!-- ======================================================= -->
    <div
      v-else-if="activeTab === 'invoices'"
      class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
    >
      <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div class="relative flex-1 min-w-[240px]">
          <Search class="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="بحث برقم الفاتورة، اسم العميل، الموبايل، أو السيريال..."
            class="w-full pr-9 pl-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
        </div>

        <div class="flex flex-wrap items-center gap-3 text-xs">
          <label class="flex items-center gap-1.5 font-bold text-amber-600 cursor-pointer">
            <input v-model="onlyWithRemaining" type="checkbox" class="rounded" />
            الفواتير عليها أقساط متبقية فقط
          </label>

          <select
            v-model="filterInvoiceType"
            class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
          >
            <option value="all">كل الفواتير</option>
            <option value="regular">فواتير مبيعات تفصيلية</option>
            <option value="quick_pos">فواتير بيع سريع (POS)</option>
            <option value="exchange">فواتير استبدال وترقية</option>
          </select>

          <button
            type="button"
            @click="openExchangeModal()"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
          >
            <Repeat class="w-4 h-4" />
            عملية استبدال / ترقية جديدة
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-right text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800/70 text-xs font-bold text-slate-600 dark:text-slate-300">
            <tr>
              <th class="py-3 px-4">رقم الفاتورة</th>
              <th class="py-3 px-4">العميل</th>
              <th class="py-3 px-4">الأصناف والسيريال</th>
              <th class="py-3 px-4">الإجمالي</th>
              <th class="py-3 px-4">المرتجع</th>
              <th class="py-3 px-4">المدفوع</th>
              <th class="py-3 px-4">المتبقي</th>
              <th class="py-3 px-4">التاريخ</th>
              <th class="py-3 px-4">إجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <tr v-if="invoices.length === 0">
              <td colspan="9" class="py-10 text-center text-slate-400">لا توجد فواتير مبيعات مطابقة</td>
            </tr>
            <tr
              v-for="inv in invoices"
              :key="inv.id"
              class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
            >
              <td class="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                {{ inv.invoice_number }}
                <div class="text-[10px] text-slate-400">
                  {{
                    inv.invoice_type === 'quick_pos'
                      ? 'بيع سريع POS'
                      : inv.invoice_type === 'exchange'
                        ? 'استبدال'
                        : 'فاتورة تفصيلية'
                  }}
                </div>
              </td>
              <td class="py-3 px-4 font-bold">
                {{ inv.customer_name }}
                <div v-if="inv.customer_phone" class="font-mono text-[11px] text-slate-500">
                  {{ inv.customer_phone }}
                </div>
              </td>
              <td class="py-3 px-4">
                <div v-for="(it, idx) in inv.items || []" :key="idx" class="mb-0.5">
                  <span class="font-bold">{{ it.product_name }}</span>
                  <span v-if="it.serial_no" class="font-mono text-[10px] text-indigo-600 mr-1">
                    [S/N: {{ it.serial_no }}]
                  </span>
                </div>
              </td>
              <td class="py-3 px-4 font-black">{{ inv.total_amount }} ج.م</td>
              <td class="py-3 px-4">
                <span
                  v-if="Number(inv.returned_amount || 0) > 0"
                  class="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-black text-[11px]"
                >
                  {{ Number(inv.returned_amount || 0).toFixed(2) }} ج.م
                </span>
                <span v-else class="text-slate-400">—</span>
              </td>
              <td class="py-3 px-4 text-emerald-600 font-bold">{{ inv.paid_amount }} ج.م</td>
              <td class="py-3 px-4">
                <span v-if="inv.remaining_amount > 0" class="text-rose-600 font-black">
                  {{ inv.remaining_amount }} ج.م
                </span>
                <span v-else class="text-emerald-600 font-bold">خالص</span>
              </td>
              <td class="py-3 px-4 text-[11px] text-slate-500">{{ inv.created_at?.slice(0, 16) }}</td>
              <td class="py-3 px-4">
                <div class="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    @click="appStore.openSalesPrintModal(inv, inv.invoice_type === 'quick_pos' ? 'thermal80' : 'a4')"
                    title="طباعة الفاتورة والضمان"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 text-blue-600 cursor-pointer"
                  >
                    <Printer class="w-4 h-4" />
                  </button>

                  <button
                    v-if="inv.remaining_amount > 0"
                    type="button"
                    @click="openInstallmentModal(inv)"
                    title="تحصيل قسط / متبقي"
                    class="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 cursor-pointer"
                  >
                    <Wallet class="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    @click="openMaintenanceFromInvoice(inv)"
                    title="فتح طلب صيانة لهذه الفاتورة"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 text-indigo-600 cursor-pointer"
                  >
                    <Wrench class="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    @click="openExchangeModal(inv)"
                    title="استبدال أو ترقية"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 text-amber-600 cursor-pointer"
                  >
                    <Repeat class="w-4 h-4" />
                  </button>

                  <button
                    v-if="inv.status !== 'returned'"
                    type="button"
                    @click="openSalesReturnModal(inv)"
                    title="مرتجع مبيعات"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 text-rose-600 cursor-pointer"
                  >
                    <RotateCcw class="w-4 h-4" />
                  </button>

                  <button
                    v-if="appStore.canDeleteRecords"
                    type="button"
                    @click="handleDeleteSalesInvoice(inv)"
                    title="حذف الفاتورة"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 text-rose-600 cursor-pointer"
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

    <!-- ======================================================= -->
    <!-- TAB 4: RETURNS & EXCHANGES LOG                          -->
    <!-- ======================================================= -->
    <div v-else-if="activeTab === 'returns_exchanges'" class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <!-- Sales Returns -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-black text-sm">
          سجل مرتجعات المبيعات ({{ salesReturns.length }})
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800 font-bold">
              <tr>
                <th class="p-3">رقم المرتجع</th>
                <th class="p-3">الفاتورة</th>
                <th class="p-3">العميل</th>
                <th class="p-3">القيمة</th>
                <th class="p-3">النقدية المردودة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-if="salesReturns.length === 0">
                <td colspan="5" class="py-8 text-center text-slate-400">لا توجد مرتجعات مبيعات</td>
              </tr>
              <tr v-for="r in salesReturns" :key="r.id">
                <td class="p-3 font-mono font-bold text-rose-600">{{ r.return_number }}</td>
                <td class="p-3 font-mono">{{ r.invoice_number }}</td>
                <td class="p-3 font-bold">{{ r.party_name }}</td>
                <td class="p-3 font-black">{{ r.total_return_amount }} ج.م</td>
                <td class="p-3 text-rose-600 font-bold">{{ r.cash_refunded }} ج.م</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Product Exchanges -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-black text-sm">
          سجل عمليات الاستبدال والترقية ({{ exchanges.length }})
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800 font-bold">
              <tr>
                <th class="p-3">رقم العملية</th>
                <th class="p-3">النوع</th>
                <th class="p-3">العميل</th>
                <th class="p-3">المسترد ← الجديد</th>
                <th class="p-3">فارق السعر</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-if="exchanges.length === 0">
                <td colspan="5" class="py-8 text-center text-slate-400">لا توجد عمليات استبدال</td>
              </tr>
              <tr v-for="ex in exchanges" :key="ex.id">
                <td class="p-3 font-mono font-bold text-amber-600">{{ ex.exchange_number }}</td>
                <td class="p-3">
                  {{
                    ex.exchange_type === 'trade_in'
                      ? 'ترقية مستعملة'
                      : ex.exchange_type === 'warranty_exchange'
                        ? 'استبدال ضمان'
                        : 'استبدال عادي'
                  }}
                </td>
                <td class="p-3 font-bold">{{ ex.customer_name }}</td>
                <td class="p-3">
                  {{ ex.returned_product_name }} ← <span class="font-bold">{{ ex.new_product_name }}</span>
                </td>
                <td class="p-3 font-black">{{ ex.price_difference }} ج.م</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- MODAL 1: COLLECT INSTALLMENT                            -->
    <!-- ======================================================= -->
    <div
      v-if="installmentModalOpen && invoiceToCollect"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 class="font-black text-base text-slate-900 dark:text-white">
            تحصيل قسط - فاتورة {{ invoiceToCollect.invoice_number }}
          </h3>
          <button type="button" @click="installmentModalOpen = false" class="cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-5 space-y-4 text-xs">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1">
            <div><span class="font-bold">العميل:</span> {{ invoiceToCollect.customer_name }}</div>
            <div>
              <span class="font-bold">المتبقي على الفاتورة:</span>
              <span class="text-rose-600 font-black"> {{ invoiceToCollect.remaining_amount }} ج.م</span>
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">المبلغ المحصل الآن (ج.م) *</label>
            <input
              v-model.number="installmentForm.amount"
              type="number"
              min="1"
              :max="invoiceToCollect.remaining_amount"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black text-emerald-600"
            />
          </div>

          <div>
            <label class="block font-bold mb-1">طريقة الدفع</label>
            <select
              v-model="installmentForm.payment_method"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            >
              <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات الدفعة</label>
            <input
              v-model="installmentForm.notes"
              type="text"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              @click="installmentModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              @click="handleCollectInstallment"
              class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
            >
              تأكيد التحصيل
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- MODAL 2: SALES RETURN                                   -->
    <!-- ======================================================= -->
    <div
      v-if="salesReturnModalOpen && invoiceToReturn"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h3 class="font-black text-base text-slate-900 dark:text-white">
            تسجيل مرتجع مبيعات - فاتورة {{ invoiceToReturn.invoice_number }}
          </h3>
          <button type="button" @click="salesReturnModalOpen = false" class="cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-5 space-y-4 text-xs overflow-y-auto">
          <div
            v-if="salesReturnSummary.hasInvoiceDiscount"
            class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between"
          >
            <span>
              يوجد خصم / استبدال كلي على الفاتورة بقيمة
              <strong>{{ salesReturnSummary.invoiceDiscountTotal.toFixed(2) }} ج.م</strong>
              يُوزّع تناسبياً على صافي استرداد البنود.
            </span>
          </div>

          <div
            v-for="(item, idx) in salesReturnForm.items"
            :key="idx"
            class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="font-bold text-slate-900 dark:text-white">
                  {{ item.product_name }}
                  <span v-if="item.serial_no" class="font-mono text-indigo-600">
                    (S/N: {{ item.serial_no }})
                  </span>
                </div>
                <div class="text-slate-500">الحد الأقصى للاسترجاع: {{ item.max_qty }}</div>
              </div>

              <div class="flex items-center gap-3">
                <div>
                  <label class="block text-[10px] font-bold mb-1">حالة المرتجع</label>
                  <select
                    v-model="item.return_condition"
                    class="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="in_stock">سليم (يعود للمخزن)</option>
                    <option value="defective">معيب / تالف</option>
                  </select>
                </div>
                <div class="w-24">
                  <label class="block text-[10px] font-bold mb-1">الكمية</label>
                  <input
                    v-model.number="item.quantity"
                    @input="onSalesReturnItemQtyInput(item)"
                    type="number"
                    min="0"
                    :max="item.max_qty"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  />
                </div>
              </div>
            </div>

            <!-- Per-Item Net Refund Breakdown -->
            <div
              class="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-[11px]"
            >
              <div>
                <span class="text-slate-500 block">سعر الوحدة بالبند:</span>
                <span class="font-bold">
                  {{ item.effective_unit_before_invoice_discount.toFixed(2) }} ج.م
                </span>
              </div>
              <div>
                <span class="text-slate-500 block">حصة خصم الفاتورة للوحدة:</span>
                <span class="font-bold text-amber-600 dark:text-amber-400">
                  -{{ item.invoice_discount_share_per_unit.toFixed(2) }} ج.م
                </span>
              </div>
              <div>
                <span class="text-slate-500 block">صافي استرداد الوحدة:</span>
                <span class="font-black text-indigo-600 dark:text-indigo-400">
                  {{ roundMoney(item.net_unit_refund).toFixed(2) }} ج.م
                </span>
              </div>
              <div>
                <span class="text-slate-500 block">صافي استرداد البند:</span>
                <span class="font-black text-rose-600 dark:text-rose-400">
                  {{
                    roundMoney(item.net_unit_refund * Math.max(0, Number(item.quantity || 0))).toFixed(2)
                  }}
                  ج.م
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="salesReturnSummary.totalReturnAmount > 0"
            class="grid grid-cols-3 gap-2 p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800"
          >
            <div>
              <div class="text-slate-500 text-[11px]">إجمالي صافي المرتجع:</div>
              <div class="font-black text-sm text-rose-700 dark:text-rose-300">
                {{ salesReturnSummary.totalReturnAmount.toFixed(2) }} ج.م
              </div>
            </div>
            <div>
              <div class="text-slate-500 text-[11px]">يُخصم من المتبقي بالآجل:</div>
              <div class="font-bold text-sm text-amber-700 dark:text-amber-300">
                {{ salesReturnSummary.balanceAdjusted.toFixed(2) }} ج.م
              </div>
            </div>
            <div>
              <div class="text-slate-500 text-[11px]">المسترد نقداً للعميل:</div>
              <div class="font-black text-sm text-emerald-700 dark:text-emerald-300">
                {{ salesReturnSummary.cashRefunded.toFixed(2) }} ج.م
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">خزينة رد النقدية</label>
              <select
                v-model="salesReturnForm.payment_method"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                  {{ label }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">سبب المرتجع</label>
              <input
                v-model="salesReturnForm.reason"
                type="text"
                placeholder="عدم ملائمة المقاس / استرجاع خلال المهلة..."
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              @click="salesReturnModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              @click="handleCreateSalesReturn"
              class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
            >
              تأكيد مرتجع المبيعات
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- MODAL 3: 3-MODE PRODUCT EXCHANGE                        -->
    <!-- ======================================================= -->
    <div
      v-if="exchangeModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 class="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Repeat class="w-5 h-5 text-amber-500" />
            معالج الاستبدال والترقية (3 أنماط استبدال)
          </h3>
          <button type="button" @click="exchangeModalOpen = false" class="cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          <!-- Policy Days Alert -->
          <div
            v-if="exchangeDaysRemaining !== null"
            :class="[
              'p-3 rounded-xl flex items-center gap-2 font-bold',
              exchangeDaysRemaining >= 0
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            ]"
          >
            <AlertTriangle class="w-4 h-4 shrink-0" />
            <span v-if="exchangeDaysRemaining >= 0">
              الفاتورة داخل مهلة الاستبدال المسموحة (متبقي {{ exchangeDaysRemaining }} يوم).
            </span>
            <span v-else>
              تنبيه: الفاتورة تجاوزت مهلة الاستبدال بـ {{ Math.abs(exchangeDaysRemaining) }} يوم (يمكنك المتابعة كترقية Trade-In أو بتجاوز إداري).
            </span>
          </div>

          <!-- 3 Exchange Types Selector -->
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              @click="exchangeForm.exchange_type = 'normal_exchange'"
              :class="[
                'p-3 rounded-xl border text-right transition cursor-pointer',
                exchangeForm.exchange_type === 'normal_exchange'
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 font-black'
                  : 'border-slate-200 dark:border-slate-700'
              ]"
            >
              <div class="text-blue-600 font-black">1. استبدال عادي</div>
              <div class="text-[10px] text-slate-500 mt-0.5">خلال المهلة بموديل آخر مع حساب الفرق</div>
            </button>

            <button
              type="button"
              @click="exchangeForm.exchange_type = 'trade_in'"
              :class="[
                'p-3 rounded-xl border text-right transition cursor-pointer',
                exchangeForm.exchange_type === 'trade_in'
                  ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 font-black'
                  : 'border-slate-200 dark:border-slate-700'
              ]"
            >
              <div class="text-amber-600 font-black">2. ترقية (Trade-In)</div>
              <div class="text-[10px] text-slate-500 mt-0.5">تقييم سماعة العميل كمستعملة وخصمها من الجديدة</div>
            </button>

            <button
              type="button"
              @click="exchangeForm.exchange_type = 'warranty_exchange'"
              :class="[
                'p-3 rounded-xl border text-right transition cursor-pointer',
                exchangeForm.exchange_type === 'warranty_exchange'
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 font-black'
                  : 'border-slate-200 dark:border-slate-700'
              ]"
            >
              <div class="text-emerald-600 font-black">3. استبدال تحت الضمان</div>
              <div class="text-[10px] text-slate-500 mt-0.5">استلام معيبة وتسليم بديلة مجاناً مع نقل الضمان</div>
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">اسم العميل *</label>
              <input
                v-model="exchangeForm.customer_name"
                type="text"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">موبايل العميل</label>
              <input
                v-model="exchangeForm.customer_phone"
                type="text"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
          </div>

          <!-- Returned Item Box -->
          <div class="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 space-y-3">
            <div class="font-black text-rose-700 dark:text-rose-300">
              📥 الصنف / السماعة المستردة من العميل
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block font-bold mb-1">الموديل المسترد *</label>
                <select
                  v-model="exchangeForm.returned_product_id"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option v-for="p in hearingAidOrProcessorProducts" :key="p.id" :value="p.id">
                    {{ p.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">سيريال السماعة المستردة</label>
                <input
                  v-model="exchangeForm.returned_serial_no"
                  type="text"
                  placeholder="S/N..."
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div v-if="exchangeForm.exchange_type !== 'warranty_exchange'">
                <label class="block font-bold mb-1">قيمة التقييم / الاسترداد (ج.م)</label>
                <input
                  v-model.number="exchangeForm.returned_value"
                  @input="onExchangeValueInput"
                  type="number"
                  min="0"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                />
              </div>
            </div>
          </div>

          <!-- New Replacement Item Box -->
          <div class="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
            <div class="font-black text-emerald-700 dark:text-emerald-300">
              📤 الصنف / السماعة البديلة الجديدة المسلمة للعميل
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block font-bold mb-1">الموديل البديل الجديد *</label>
                <select
                  v-model="exchangeForm.new_product_id"
                  @change="onExchangeNewProductChange"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option v-for="p in hearingAidOrProcessorProducts" :key="p.id" :value="p.id">
                    {{ p.name }} (رصيد: {{ p.qty }})
                  </option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">السيريال الجديد المسلم</label>
                <select
                  v-model="exchangeForm.new_serial_id"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                >
                  <option :value="null">-- بدون / اختر سيريال --</option>
                  <option v-for="sn in exchangeNewSerials" :key="sn.id" :value="sn.id">
                    {{ sn.serial_no }}
                  </option>
                </select>
              </div>
              <div v-if="exchangeForm.exchange_type !== 'warranty_exchange'">
                <label class="block font-bold mb-1">سعر الصنف الجديد (ج.م)</label>
                <input
                  v-model.number="exchangeForm.new_value"
                  @input="onExchangeValueInput"
                  type="number"
                  min="0"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                />
              </div>
            </div>
          </div>

          <!-- Warranty Exchange External Repair Option -->
          <div
            v-if="exchangeForm.exchange_type === 'warranty_exchange'"
            class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-2"
          >
            <label class="flex items-center gap-2 font-bold cursor-pointer">
              <input v-model="exchangeForm.create_external_repair_ticket" type="checkbox" class="rounded" />
              فتح تذكرة صيانة خارجية للسماعة المعيبة تلقائياً لإرسالها للوكيل
            </label>
            <input
              v-if="exchangeForm.create_external_repair_ticket"
              v-model="exchangeForm.external_vendor"
              type="text"
              placeholder="اسم الوكيل / المعمل الخارجي..."
              class="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <!-- Price Difference (Explicit Direction: Collect vs Refund) -->
          <div
            v-else
            class="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
              <div>
                <span class="text-slate-500">فارق القيمة الحسابي:</span>
                <span class="text-base font-black text-indigo-600 dark:text-indigo-400 mr-1.5">
                  {{ Math.abs(exchangePriceDiff).toFixed(2) }} ج.م
                </span>
                <span
                  class="mr-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold"
                  :class="
                    exchangePriceDiff > 0
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : exchangePriceDiff < 0
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  "
                >
                  {{
                    exchangePriceDiff > 0
                      ? 'مستحق على العميل لصالح المركز (+)'
                      : exchangePriceDiff < 0
                        ? 'مستحق للعميل يرده المركز (-)'
                        : 'تساوي في القيمة (بدون فرق)'
                  }}
                </span>
              </div>
              <div class="text-[11px] font-black">
                الأثر المالي المرسل للخزينة:
                <span
                  :class="
                    signedExchangePaidDifference > 0
                      ? 'text-emerald-600'
                      : signedExchangePaidDifference < 0
                        ? 'text-rose-600'
                        : 'text-slate-500'
                  "
                  dir="ltr"
                >
                  {{
                    signedExchangePaidDifference > 0
                      ? `+${signedExchangePaidDifference.toFixed(2)}`
                      : signedExchangePaidDifference.toFixed(2)
                  }}
                  ج.م
                </span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label class="block font-bold mb-1">اتجاه الفارق المالي</label>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    @click="setExchangeDirection('collect')"
                    class="px-2.5 py-1.5 rounded-lg border text-[11px] font-black transition cursor-pointer"
                    :class="
                      exchangeForm.difference_direction === 'collect'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                    "
                  >
                    + تحصيل من العميل
                  </button>
                  <button
                    type="button"
                    @click="setExchangeDirection('refund')"
                    class="px-2.5 py-1.5 rounded-lg border text-[11px] font-black transition cursor-pointer"
                    :class="
                      exchangeForm.difference_direction === 'refund'
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                    "
                  >
                    - رد نقدية للعميل
                  </button>
                </div>
              </div>

              <div>
                <label class="block font-bold mb-1">
                  {{
                    exchangeForm.difference_direction === 'refund'
                      ? 'المبلغ المردود للعميل فعلياً (ج.م)'
                      : 'المبلغ المحصل من العميل فعلياً (ج.م)'
                  }}
                </label>
                <input
                  v-model.number="exchangeForm.difference_amount"
                  @input="onExchangeDiffAmountInput"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-black"
                />
              </div>

              <div>
                <label class="block font-bold mb-1">طريقة الدفع / الخزينة</label>
                <select
                  v-model="exchangeForm.payment_method"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              @click="exchangeModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              @click="handleProcessExchange"
              class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
            >
              اعتماد عملية الاستبدال
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
