<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { useAppStore } from '@renderer/stores/appStore'
import { PAYMENT_METHODS } from '@renderer/constants/appliances'
import type {
  Product,
  ProductVariant,
  ProductSerial,
  Supplier,
  PurchaseInvoice,
  PurchaseItem,
  InvoiceReturn
} from '@shared/types'
import {
  ShoppingBag,
  PlusCircle,
  Search,
  Trash2,
  Eye,
  RotateCcw,
  Truck,
  UserCheck,
  Barcode,
  X,
  CheckCircle2
} from 'lucide-vue-next'

const appStore = useAppStore()

const activeTab = ref<'new_supplier' | 'new_used' | 'list' | 'returns'>('new_supplier')
const products = ref<Product[]>([])
const suppliers = ref<Supplier[]>([])
const invoices = ref<PurchaseInvoice[]>([])
const purchaseReturns = ref<InvoiceReturn[]>([])

const searchQuery = ref('')
const filterType = ref<'all' | 'supplier' | 'used_from_customer'>('all')

const detailsModalOpen = ref(false)
const selectedInvoice = ref<PurchaseInvoice | null>(null)

interface PurchaseReturnFormItem {
  invoice_item_id: number
  product_id: number
  variant_id: number | null
  product_name: string
  unit: 'piece' | 'pack'
  pack_size: number
  track_serial: boolean
  max_qty: number
  quantity: number
  unit_cost: number
  available_serials: Array<{ serial_no: string; status: string }>
  unavailable_serials: Array<{ serial_no: string; status: string }>
  selected_serials: string[]
  used_fallback: boolean
}

const returnModalOpen = ref(false)
const returnInvoice = ref<PurchaseInvoice | null>(null)
const returnForm = ref<{
  payment_method: string
  reason: string
  items: PurchaseReturnFormItem[]
}>({
  payment_method: 'cash',
  reason: '',
  items: []
})

function extractErrorMessage(err: unknown, fallback = ''): string {
  const raw = err instanceof Error ? err.message : String(err || '')
  const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim()
  return cleaned || fallback
}

function requiredReturnSerialsCount(item: Pick<PurchaseReturnFormItem, 'unit' | 'pack_size' | 'quantity'>): number {
  const qty = Math.max(0, Number(item.quantity || 0))
  return item.unit === 'pack' ? qty * Math.max(1, Number(item.pack_size || 1)) : qty
}

function serialStatusLabel(status: string): string {
  switch (status) {
    case 'in_stock':
      return 'متاح بالمخزن'
    case 'sold':
      return 'مباع'
    case 'returned':
      return 'مرتجع مسبقاً'
    case 'defective':
      return 'تالف'
    default:
      return 'غير متاح بالمخزن'
  }
}

// Purchase Form
const form = ref<{
  purchase_type: 'supplier' | 'used_from_customer'
  supplier_id: number | null
  party_name: string
  party_phone: string
  invoice_date: string
  supplier_ref_no: string
  discount: number
  paid_amount: number
  payment_method: string
  notes: string
  recordInTreasury: boolean
  items: Array<
    PurchaseItem & {
      track_serial?: number
      has_variants?: number
      available_variants?: ProductVariant[]
      serials_text?: string
    }
  >
}>({
  purchase_type: 'supplier',
  supplier_id: null,
  party_name: '',
  party_phone: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  supplier_ref_no: '',
  discount: 0,
  paid_amount: 0,
  payment_method: 'cash',
  notes: '',
  recordInTreasury: true,
  items: []
})

const selectedProductId = ref<number | null>(null)

const nonServiceProducts = computed(() =>
  products.value.filter((p) => p.type !== 'service' && p.is_active)
)

const hearingAidProducts = computed(() =>
  products.value.filter(
    (p) => (p.type === 'hearing_aid' || p.type === 'cochlear_processor') && p.is_active
  )
)

const subtotal = computed(() =>
  form.value.items.reduce(
    (sum, it) => sum + Number(it.quantity || 1) * Number(it.unit_cost || 0),
    0
  )
)

const totalAmount = computed(() =>
  Math.max(0, subtotal.value - Number(form.value.discount || 0))
)

const remainingAmount = computed(() =>
  Math.max(0, totalAmount.value - Number(form.value.paid_amount || 0))
)

const paidAmountManuallyEdited = ref(false)

watch(totalAmount, (newTotal) => {
  if (!paidAmountManuallyEdited.value) {
    form.value.paid_amount = newTotal
  }
})

function onPaidAmountInput(): void {
  paidAmountManuallyEdited.value = true
  if (typeof form.value.paid_amount === 'number' && form.value.paid_amount < 0) {
    form.value.paid_amount = 0
  }
}

function resetPaidAmountSync(): void {
  paidAmountManuallyEdited.value = false
  form.value.paid_amount = totalAmount.value
}

function onDiscountInput(): void {
  if (typeof form.value.discount === 'number' && form.value.discount < 0) {
    form.value.discount = 0
  }
}

watch(activeTab, (tab) => {
  if (tab === 'new_supplier') {
    resetForm('supplier')
  } else if (tab === 'new_used') {
    resetForm('used_from_customer')
  } else if (tab === 'list') {
    loadInvoices()
  } else if (tab === 'returns') {
    loadReturns()
  }
})

watch([searchQuery, filterType], () => {
  if (activeTab.value === 'list') {
    loadInvoices()
  }
})

function resetForm(type: 'supplier' | 'used_from_customer'): void {
  paidAmountManuallyEdited.value = false
  form.value = {
    purchase_type: type,
    supplier_id: suppliers.value[0]?.id || null,
    party_name: '',
    party_phone: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    supplier_ref_no: '',
    discount: 0,
    paid_amount: 0,
    payment_method: 'cash',
    notes: '',
    recordInTreasury: true,
    items: []
  }
  selectedProductId.value = null
}

async function loadInitial(): Promise<void> {
  const [prods, sups, invs, rets] = await Promise.all([
    window.api.listProducts({ activeOnly: false }),
    window.api.listSuppliers(''),
    window.api.listPurchaseInvoices({}),
    window.api.listInvoiceReturns('purchase_return')
  ])
  products.value = prods
  suppliers.value = sups
  invoices.value = invs
  purchaseReturns.value = rets
  if (!form.value.supplier_id && sups.length > 0) {
    form.value.supplier_id = sups[0].id
  }
}

async function loadInvoices(): Promise<void> {
  invoices.value = await window.api.listPurchaseInvoices({
    search: searchQuery.value,
    purchase_type: filterType.value
  })
}

async function loadReturns(): Promise<void> {
  purchaseReturns.value = await window.api.listInvoiceReturns('purchase_return')
}

function addItemToForm(): void {
  if (!selectedProductId.value) return
  const prod = products.value.find((p) => p.id === selectedProductId.value)
  if (!prod) return

  const isUsedMode = form.value.purchase_type === 'used_from_customer'
  const firstVariant = prod.variants && prod.variants.length > 0 ? prod.variants[0] : null
  const defaultUnit: 'piece' | 'pack' = prod.pack_size > 1 && !prod.track_serial ? 'pack' : 'piece'
  const unitCost =
    defaultUnit === 'pack'
      ? Number(firstVariant?.pack_cost_price ?? prod.pack_cost_price ?? prod.cost_price * prod.pack_size)
      : Number(firstVariant?.cost_price ?? prod.cost_price ?? 0)

  const defaultCompanyWarranty = new Date()
  defaultCompanyWarranty.setFullYear(defaultCompanyWarranty.getFullYear() + 1)

  form.value.items.push({
    product_id: prod.id,
    variant_id: firstVariant ? firstVariant.id || null : null,
    product_name: prod.name,
    variant_name: firstVariant ? firstVariant.variant_name : '',
    unit: defaultUnit,
    pack_size: prod.pack_size || 1,
    quantity: 1,
    added_pieces_qty: defaultUnit === 'pack' ? prod.pack_size || 1 : 1,
    unit_cost: unitCost,
    total_cost: unitCost,
    condition: isUsedMode ? 'used' : 'new',
    serials: [],
    serials_text: '',
    company_warranty_end: prod.track_serial
      ? defaultCompanyWarranty.toISOString().slice(0, 10)
      : null,
    returned_qty: 0,
    track_serial: prod.track_serial,
    has_variants: prod.has_variants,
    available_variants: prod.variants || []
  })
  selectedProductId.value = null
}

function onItemUnitOrQtyChange(index: number): void {
  const item = form.value.items[index]
  if (!item) return
  if (typeof item.quantity === 'number' && item.quantity < 1) {
    item.quantity = 1
  }
  const prod = products.value.find((p) => p.id === item.product_id)
  const packSz = prod?.pack_size || item.pack_size || 1
  item.pack_size = packSz
  item.added_pieces_qty = item.unit === 'pack' ? Number(item.quantity || 1) * packSz : Number(item.quantity || 1)
  if (prod) {
    if (item.unit === 'pack') {
      item.unit_cost = Number(prod.pack_cost_price || prod.cost_price * packSz)
    } else {
      item.unit_cost = Number(prod.cost_price || 0)
    }
  }
  item.total_cost = Number(item.quantity || 1) * Number(item.unit_cost || 0)
}

function onItemCostInput(index: number): void {
  const item = form.value.items[index]
  if (!item) return
  if (typeof item.unit_cost === 'number' && item.unit_cost < 0) {
    item.unit_cost = 0
  }
  item.total_cost = Number(item.quantity || 1) * Number(item.unit_cost || 0)
}

function removeItem(index: number): void {
  form.value.items.splice(index, 1)
}

async function handleSavePurchase(): Promise<void> {
  if (form.value.items.length === 0) {
    swalError('لا توجد أصناف', 'يرجى إضافة صنف واحد على الأقل للفاتورة')
    return
  }

  if (form.value.purchase_type === 'supplier' && !form.value.supplier_id) {
    swalError('اختر المورد', 'يرجى تحديد المورد أولاً')
    return
  }

  if (form.value.purchase_type === 'used_from_customer' && !form.value.party_name.trim()) {
    swalError('بيانات العميل البائع', 'يرجى إدخال اسم العميل البائع للسماعة المستعملة')
    return
  }

  if (Number(form.value.discount || 0) < 0 || Number(form.value.paid_amount || 0) < 0) {
    swalError('قيمة غير صالحة', 'الخصم والمبلغ المدفوع لا يمكن أن يكونا بقيمة سالبة')
    return
  }

  if (Number(form.value.paid_amount || 0) > totalAmount.value) {
    swalError('المبلغ المدفوع غير صالح', 'المبلغ المدفوع لا يمكن أن يتجاوز صافي الفاتورة')
    return
  }

  const preparedItems: PurchaseItem[] = []
  for (const it of form.value.items) {
    const qty = Number(it.quantity || 0)
    const unitCost = Number(it.unit_cost || 0)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      swalError('بيانات صنف غير صالحة', `يرجى مراجعة الكمية وسعر التكلفة للصنف (${it.product_name})`)
      return
    }
    const prod = products.value.find((p) => p.id === it.product_id)
    const packSz = prod?.pack_size || it.pack_size || 1
    const addedPieces = it.unit === 'pack' ? qty * packSz : qty
    const parsedSerials = (it.serials_text || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    if (it.track_serial && parsedSerials.length !== addedPieces) {
      swalError(
        'عدد السيريالات غير مطابق',
        `الصنف (${it.product_name}) يتطلب إدخال ${addedPieces} سيريال نمبر (تم إدخال ${parsedSerials.length})`
      )
      return
    }

    const vObj = it.available_variants?.find((v) => v.id === it.variant_id)

    preparedItems.push({
      product_id: it.product_id,
      variant_id: it.variant_id || null,
      product_name: it.product_name,
      variant_name: vObj?.variant_name || it.variant_name || '',
      unit: it.unit,
      pack_size: packSz,
      quantity: qty,
      added_pieces_qty: addedPieces,
      unit_cost: unitCost,
      total_cost: qty * unitCost,
      condition: form.value.purchase_type === 'used_from_customer' ? 'used' : it.condition,
      serials: parsedSerials,
      company_warranty_end: it.company_warranty_end || null,
      returned_qty: 0
    })
  }

  try {
    await appStore.withLoading(async () => {
      await window.api.savePurchaseInvoice(
        plain({
          purchase_type: form.value.purchase_type,
          supplier_id: form.value.supplier_id,
          party_name: form.value.party_name,
          party_phone: form.value.party_phone,
          invoice_date: form.value.invoice_date,
          supplier_ref_no: form.value.supplier_ref_no,
          discount: Number(form.value.discount || 0),
          paid_amount: Number(form.value.paid_amount || 0),
          payment_method: form.value.payment_method,
          notes: form.value.notes,
          recordInTreasury: form.value.recordInTreasury,
          items: preparedItems
        })
      )
      await loadInitial()
      resetForm(form.value.purchase_type)
      activeTab.value = 'list'
    }, 'جاري حفظ فاتورة المشتريات وتحديث المخزون...')
    swalSuccess('تم حفظ فاتورة المشتريات وتوريد الأصناف للمخزن بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حفظ الفاتورة', extractErrorMessage(err))
  }
}

function openDetailsModal(inv: PurchaseInvoice): void {
  selectedInvoice.value = inv
  detailsModalOpen.value = true
}

function onReturnItemQtyInput(rItem: PurchaseReturnFormItem): void {
  if (typeof rItem.quantity === 'number' && rItem.quantity < 0) {
    rItem.quantity = 0
  }
}

async function openReturnModal(inv: PurchaseInvoice): Promise<void> {
  const returnableItems = (inv.items || []).filter((it) => it.quantity - (it.returned_qty || 0) > 0)
  const serializedProductIds = Array.from(
    new Set(
      returnableItems
        .filter((it) => {
          const prod = products.value.find((p) => p.id === it.product_id)
          return Boolean(prod?.track_serial) || (Array.isArray(it.serials) && it.serials.length > 0)
        })
        .map((it) => it.product_id)
    )
  )

  const inStockByProduct = new Map<number, ProductSerial[]>()
  const statusMapByProduct = new Map<number, Map<string, string>>()

  try {
    if (serializedProductIds.length > 0) {
      await appStore.withLoading(async () => {
        await Promise.all(
          serializedProductIds.map(async (pid) => {
            const [inStockList, allSerialsList] = await Promise.all([
              window.api.listProductSerials({ product_id: pid, status: 'in_stock' }),
              window.api.listProductSerials({ product_id: pid })
            ])
            inStockByProduct.set(pid, inStockList)
            const statusMap = new Map<string, string>()
            for (const s of allSerialsList) {
              statusMap.set(s.serial_no, s.status)
            }
            for (const s of inStockList) {
              statusMap.set(s.serial_no, 'in_stock')
            }
            statusMapByProduct.set(pid, statusMap)
          })
        )
      }, 'جاري جلب السيريالات المتاحة في المخزون...')
    }
  } catch (err: unknown) {
    swalError('تعذر تحميل السيريالات المتاحة', extractErrorMessage(err))
    return
  }

  returnInvoice.value = inv
  returnForm.value = {
    payment_method: inv.payment_method || 'cash',
    reason: '',
    items: returnableItems.map((it) => {
      const prod = products.value.find((p) => p.id === it.product_id)
      const invoiceSerials = Array.isArray(it.serials)
        ? Array.from(new Set(it.serials.map((s) => String(s || '').trim()).filter(Boolean)))
        : []
      const isSerialized = Boolean(prod?.track_serial) || invoiceSerials.length > 0

      let availableSerials: Array<{ serial_no: string; status: string }> = []
      let unavailableSerials: Array<{ serial_no: string; status: string }> = []
      let usedFallback = false

      if (isSerialized) {
        const inStockList = inStockByProduct.get(it.product_id) || []
        const inStockMap = new Map(inStockList.map((s) => [s.serial_no, s]))
        const statusMap = statusMapByProduct.get(it.product_id) || new Map<string, string>()
        const invoiceLinkedInStock = inStockList.filter(
          (s) =>
            s.purchase_item_id === it.id &&
            (!it.variant_id || s.variant_id === it.variant_id)
        )

        if (invoiceSerials.length > 0) {
          const seenAvailable = new Set<string>()
          for (const sn of invoiceSerials) {
            if (inStockMap.has(sn)) {
              availableSerials.push({ serial_no: sn, status: 'in_stock' })
              seenAvailable.add(sn)
            } else {
              unavailableSerials.push({
                serial_no: sn,
                status: statusMap.get(sn) || 'unavailable'
              })
            }
          }
          for (const s of invoiceLinkedInStock) {
            if (!seenAvailable.has(s.serial_no)) {
              availableSerials.push({ serial_no: s.serial_no, status: 'in_stock' })
              seenAvailable.add(s.serial_no)
            }
          }
        } else if (invoiceLinkedInStock.length > 0) {
          availableSerials = invoiceLinkedInStock.map((s) => ({
            serial_no: s.serial_no,
            status: 'in_stock'
          }))
        } else {
          const fallbackInStock = inStockList.filter(
            (s) => !it.variant_id || s.variant_id === it.variant_id
          )
          availableSerials = fallbackInStock.map((s) => ({
            serial_no: s.serial_no,
            status: 'in_stock'
          }))
          usedFallback = availableSerials.length > 0
        }
      }

      return {
        invoice_item_id: it.id!,
        product_id: it.product_id,
        variant_id: it.variant_id || null,
        product_name: it.product_name + (it.variant_name ? ` (${it.variant_name})` : ''),
        unit: it.unit || 'piece',
        pack_size: prod?.pack_size || it.pack_size || 1,
        track_serial: isSerialized,
        max_qty: it.quantity - (it.returned_qty || 0),
        quantity: 0,
        unit_cost: it.unit_cost,
        available_serials: availableSerials,
        unavailable_serials: unavailableSerials,
        selected_serials: [],
        used_fallback: usedFallback
      }
    })
  }
  returnModalOpen.value = true
}

async function handleCreatePurchaseReturn(): Promise<void> {
  if (!returnInvoice.value) return
  for (const item of returnForm.value.items) {
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

  const selected = returnForm.value.items.filter((x) => Number(x.quantity || 0) > 0)
  if (selected.length === 0) {
    swalError('حدد الأصناف', 'يرجى إدخال الكمية المرتجعة لصنف واحد على الأقل')
    return
  }

  for (const item of selected) {
    if (!item.track_serial) continue
    const qty = Number(item.quantity)
    if (!Number.isInteger(qty)) {
      swalError('كمية غير صحيحة', `كمية الصنف المسلسل (${item.product_name}) يجب أن تكون رقماً صحيحاً`)
      return
    }
    const reqCount = requiredReturnSerialsCount(item)
    if (item.selected_serials.length !== reqCount) {
      swalError(
        'اختيار السيريالات مطلوب',
        `الصنف (${item.product_name}) يتطلب تحديد ${reqCount} سيريال متاح بالمخزون (المختار حالياً: ${item.selected_serials.length})`
      )
      return
    }
    const inStockSet = new Set(item.available_serials.map((s) => s.serial_no))
    if (item.selected_serials.some((sn) => !inStockSet.has(sn))) {
      swalError(
        'سيريالات غير متاحة',
        `يوجد سيريال غير متاح بالمخزن (in_stock) ضمن الاختيارات للصنف (${item.product_name})`
      )
      return
    }
  }

  try {
    await appStore.withLoading(async () => {
      await window.api.createPurchaseReturn(
        plain({
          invoice_id: returnInvoice.value!.id,
          payment_method: returnForm.value.payment_method,
          reason: returnForm.value.reason,
          items: selected.map((x) => ({
            invoice_item_id: x.invoice_item_id,
            quantity: Number(x.quantity),
            serials: x.track_serial ? [...x.selected_serials] : []
          }))
        })
      )
      returnModalOpen.value = false
      await loadInitial()
    }, 'جاري تسجيل مرتجع المشتريات...')
    swalSuccess('تم تسجيل مرتجع المشتريات وتعديل رصيد المورد والمخزن بنجاح')
  } catch (err: unknown) {
    swalError('تعذر تسجيل المرتجع', extractErrorMessage(err))
  }
}

async function handleDeleteInvoice(inv: PurchaseInvoice): Promise<void> {
  const ok = await swalConfirm(
    'حذف فاتورة مشتريات',
    `هل أنت متأكد من حذف فاتورة المشتريات (${inv.invoice_number}) وعكس أثرها المخزني والمالي؟`
  )
  if (!ok) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deletePurchaseInvoice(inv.id)
      await loadInitial()
    }, 'جاري حذف الفاتورة...')
    swalSuccess('تم حذف فاتورة المشتريات بنجاح')
  } catch (err: unknown) {
    swalError('تعذر الحذف', err instanceof Error ? err.message : '')
  }
}

onMounted(() => {
  loadInitial()
})
</script>

<template>
  <div class="space-y-5">
    <!-- Top Header & Tabs -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-12 h-12 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400"
        >
          <ShoppingBag class="w-6 h-6" />
        </div>
        <div>
          <h2 class="text-xl font-black text-slate-900 dark:text-white">
            إدارة المشتريات والتوريد المخزني
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            فواتير شراء الموردين، شراء السماعات المستعملة من العملاء، ومرتجعات المشتريات
          </p>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl text-xs font-bold">
        <button
          type="button"
          @click="activeTab = 'new_supplier'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'new_supplier'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <Truck class="w-4 h-4" />
          فاتورة شراء من مورد
        </button>

        <button
          type="button"
          @click="activeTab = 'new_used'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'new_used'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <UserCheck class="w-4 h-4" />
          شراء سماعة مستعملة من عميل
        </button>

        <button
          type="button"
          @click="activeTab = 'list'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'list'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <ShoppingBag class="w-4 h-4" />
          سجل فواتير المشتريات ({{ invoices.length }})
        </button>

        <button
          type="button"
          @click="activeTab = 'returns'"
          :class="[
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition cursor-pointer',
            activeTab === 'returns'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          ]"
        >
          <RotateCcw class="w-4 h-4" />
          مرتجعات المشتريات ({{ purchaseReturns.length }})
        </button>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- TAB 1 & 2: NEW PURCHASE INVOICE (SUPPLIER OR USED)      -->
    <!-- ======================================================= -->
    <div
      v-if="activeTab === 'new_supplier' || activeTab === 'new_used'"
      class="grid grid-cols-1 lg:grid-cols-3 gap-5"
    >
      <!-- Right 2 Cols: Invoice Header & Items -->
      <div class="lg:col-span-2 space-y-5">
        <!-- Supplier / Seller Customer Card -->
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck v-if="form.purchase_type === 'supplier'" class="w-5 h-5 text-indigo-500" />
              <UserCheck v-else class="w-5 h-5 text-amber-500" />
              {{
                form.purchase_type === 'supplier'
                  ? 'بيانات المورد وفاتورة التوريد'
                  : 'بيانات العميل البائع للسماعة المستعملة'
              }}
            </h3>
            <span
              :class="[
                'px-3 py-1 rounded-full text-xs font-bold',
                form.purchase_type === 'supplier'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              ]"
            >
              {{ form.purchase_type === 'supplier' ? 'توريد من شركة / مورد' : 'شراء مستعمل (Used)' }}
            </span>
          </div>

          <div v-if="form.purchase_type === 'supplier'" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                المورد *
              </label>
              <SearchableSelect
                v-model="form.supplier_id"
                placeholder="-- اختر المورد --"
                :options="
                  suppliers.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.company_name || s.phone}) - رصيد: ${s.balance} ج.م`
                  }))
                "
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رقم فاتورة المورد المرجعي
              </label>
              <input
                v-model="form.supplier_ref_no"
                type="text"
                placeholder="مثال: SUP-9921"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                تاريخ الفاتورة
              </label>
              <input
                v-model="form.invoice_date"
                type="date"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                اسم العميل البائع *
              </label>
              <input
                v-model="form.party_name"
                type="text"
                placeholder="الاسم الثلاثي للعميل"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رقم موبايل العميل
              </label>
              <input
                v-model="form.party_phone"
                type="text"
                placeholder="010xxxxxxxx"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                تاريخ الشراء
              </label>
              <input
                v-model="form.invoice_date"
                type="date"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
          </div>
        </div>

        <!-- Add Product Bar -->
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex-1 min-w-[240px]">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                إضافة صنف للفاتورة
              </label>
              <SearchableSelect
                v-model="selectedProductId"
                placeholder="-- اختر الصنف / الموديل --"
                :options="
                  (form.purchase_type === 'used_from_customer'
                    ? hearingAidProducts
                    : nonServiceProducts
                  ).map((p) => ({
                    value: p.id,
                    label: `[${p.code}] ${p.name} (${p.brand || 'عام'}) — الرصيد: ${p.qty}`
                  }))
                "
              />
            </div>
            <button
              type="button"
              @click="addItemToForm"
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition cursor-pointer"
            >
              <PlusCircle class="w-4 h-4" />
              إدراج بالفاتورة
            </button>
          </div>

          <!-- Items Table -->
          <div v-if="form.items.length === 0" class="text-center py-10 text-slate-400 text-sm">
            لم يتم إدراج أصناف بعد. اختر الصنف من القائمة أعلاه لإضافته للفاتورة.
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="(item, idx) in form.items"
              :key="idx"
              class="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 space-y-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">
                    {{ idx + 1 }}
                  </span>
                  {{ item.product_name }}
                  <span
                    v-if="item.condition === 'used'"
                    class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs"
                  >
                    مستعمل (Used)
                  </span>
                </div>
                <button
                  type="button"
                  @click="removeItem(idx)"
                  class="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <!-- Variant if applicable -->
                <div v-if="item.has_variants && item.available_variants?.length">
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">المقاس / المتغير</label>
                  <select
                    v-model="item.variant_id"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option v-for="v in item.available_variants" :key="v.id" :value="v.id">
                      {{ v.variant_name }} (رصيد: {{ v.qty }})
                    </option>
                  </select>
                </div>

                <!-- Unit (piece / pack) -->
                <div v-if="item.pack_size > 1 && !item.track_serial">
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">وحدة الشراء</label>
                  <select
                    v-model="item.unit"
                    @change="onItemUnitOrQtyChange(idx)"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="pack">عبوة / شريط ({{ item.pack_size }} قطع)</option>
                    <option value="piece">قطعة مفردة</option>
                  </select>
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">الكمية</label>
                  <input
                    v-model.number="item.quantity"
                    @input="onItemUnitOrQtyChange(idx)"
                    type="number"
                    min="1"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">
                    تكلفة الوحدة (ج.م)
                  </label>
                  <input
                    v-model.number="item.unit_cost"
                    @input="onItemCostInput(idx)"
                    type="number"
                    min="0"
                    step="0.01"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">الإجمالي</label>
                  <div class="px-2.5 py-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-950 text-xs font-black text-indigo-600 dark:text-indigo-400">
                    {{ (Number(item.quantity || 1) * Number(item.unit_cost || 0)).toFixed(2) }} ج.م
                  </div>
                </div>
              </div>

              <!-- Serials input if track_serial -->
              <div
                v-if="item.track_serial"
                class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700"
              >
                <div class="md:col-span-2">
                  <label class="block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                    <Barcode class="w-3.5 h-3.5 inline ml-1" />
                    أرقام السيريال (مطلوب {{ item.quantity }} سيريال - افصل بسطر جديد أو فاصلة) *
                  </label>
                  <textarea
                    v-model="item.serials_text"
                    rows="2"
                    placeholder="امسح الباركود أو اكتب السيريال نمبر لكل وحدة..."
                    class="w-full px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">
                    نهاية ضمان الوكيل / المورد
                  </label>
                  <input
                    v-model="item.company_warranty_end"
                    type="date"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Left Col: Financial Summary & Submit -->
      <div class="space-y-5">
        <div
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 sticky top-4"
        >
          <h3 class="font-black text-base text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            ملخص السداد والاعتماد
          </h3>

          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between text-slate-600 dark:text-slate-400">
              <span>إجمالي الأصناف:</span>
              <span class="font-bold">{{ subtotal.toFixed(2) }} ج.م</span>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                خصم مكتسب على الفاتورة (ج.م)
              </label>
              <input
                v-model.number="form.discount"
                @input="onDiscountInput"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
              />
            </div>

            <div
              class="flex justify-between items-center p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200"
            >
              <span class="font-bold">الصافي المطلوب:</span>
              <span class="text-lg font-black">{{ totalAmount.toFixed(2) }} ج.م</span>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  المبلغ المدفوع الآن (ج.م)
                </label>
                <button
                  v-if="paidAmountManuallyEdited"
                  type="button"
                  @click="resetPaidAmountSync"
                  class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  سداد بالكامل
                </button>
              </div>
              <input
                v-model.number="form.paid_amount"
                @input="onPaidAmountInput"
                type="number"
                min="0"
                :max="totalAmount"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black text-emerald-600"
              />
            </div>

            <div
              v-if="remainingAmount > 0 && form.purchase_type === 'supplier'"
              class="flex justify-between items-center p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold"
            >
              <span>متبقي آجل يضاف لحساب المورد:</span>
              <span>{{ remainingAmount.toFixed(2) }} ج.م</span>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                خزينة / طريقة الدفع
              </label>
              <select
                v-model="form.payment_method"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                  {{ label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                ملاحظات الفاتورة
              </label>
              <textarea
                v-model="form.notes"
                rows="2"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              ></textarea>
            </div>

            <label class="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 pt-1 cursor-pointer">
              <input v-model="form.recordInTreasury" type="checkbox" class="rounded text-indigo-600" />
              خصم المبلغ المدفوع من الخزينة تلقائياً
            </label>
          </div>

          <button
            type="button"
            @click="handleSavePurchase"
            class="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition cursor-pointer"
          >
            <CheckCircle2 class="w-5 h-5" />
            حفظ واعتماد فاتورة الشراء
          </button>
        </div>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- TAB 3: PURCHASE INVOICES LIST                           -->
    <!-- ======================================================= -->
    <div
      v-else-if="activeTab === 'list'"
      class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
    >
      <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div class="relative flex-1 min-w-[240px]">
          <Search class="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="بحث برقم الفاتورة، اسم المورد، السيريال، أو الصنف..."
            class="w-full pr-9 pl-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
        </div>
        <select
          v-model="filterType"
          class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
        >
          <option value="all">كل فواتير الشراء</option>
          <option value="supplier">فواتير الموردين والشركات</option>
          <option value="used_from_customer">شراء سماعات مستعملة من عملاء</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-right text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800/70 text-xs font-bold text-slate-600 dark:text-slate-300">
            <tr>
              <th class="py-3 px-4">رقم الفاتورة</th>
              <th class="py-3 px-4">النوع</th>
              <th class="py-3 px-4">المورد / البائع</th>
              <th class="py-3 px-4">التاريخ</th>
              <th class="py-3 px-4">الأصناف</th>
              <th class="py-3 px-4">الإجمالي</th>
              <th class="py-3 px-4">المدفوع</th>
              <th class="py-3 px-4">المتبقي</th>
              <th class="py-3 px-4">إجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <tr v-if="invoices.length === 0">
              <td colspan="9" class="py-10 text-center text-slate-400">لا توجد فواتير مشتريات مسجلة</td>
            </tr>
            <tr
              v-for="inv in invoices"
              :key="inv.id"
              class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
            >
              <td class="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {{ inv.invoice_number }}
                <div v-if="inv.supplier_ref_no" class="text-[10px] text-slate-400">
                  مرجع: {{ inv.supplier_ref_no }}
                </div>
              </td>
              <td class="py-3 px-4">
                <span
                  :class="[
                    'px-2 py-0.5 rounded-full text-[11px] font-bold',
                    inv.purchase_type === 'used_from_customer'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                  ]"
                >
                  {{ inv.purchase_type === 'used_from_customer' ? 'شراء مستعمل' : 'فاتورة مورد' }}
                </span>
              </td>
              <td class="py-3 px-4 font-bold">
                {{ inv.party_name }}
                <div v-if="inv.party_phone" class="text-[11px] font-normal text-slate-500">
                  {{ inv.party_phone }}
                </div>
              </td>
              <td class="py-3 px-4">{{ inv.invoice_date }}</td>
              <td class="py-3 px-4">
                <span class="font-bold">{{ inv.items?.length || 0 }} أصناف</span>
              </td>
              <td class="py-3 px-4 font-black">{{ inv.total_amount }} ج.م</td>
              <td class="py-3 px-4 text-emerald-600 font-bold">{{ inv.paid_amount }} ج.م</td>
              <td class="py-3 px-4">
                <span v-if="inv.remaining_amount > 0" class="text-rose-600 font-black">
                  {{ inv.remaining_amount }} ج.م
                </span>
                <span v-else class="text-emerald-600 font-bold">خالص</span>
              </td>
              <td class="py-3 px-4">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    @click="openDetailsModal(inv)"
                    title="عرض التفاصيل"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 text-blue-600 cursor-pointer"
                  >
                    <Eye class="w-4 h-4" />
                  </button>
                  <button
                    v-if="inv.status !== 'returned'"
                    type="button"
                    @click="openReturnModal(inv)"
                    title="مرتجع مشتريات"
                    class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 text-amber-600 cursor-pointer"
                  >
                    <RotateCcw class="w-4 h-4" />
                  </button>
                  <button
                    v-if="appStore.canDeleteRecords"
                    type="button"
                    @click="handleDeleteInvoice(inv)"
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
    <!-- TAB 4: PURCHASE RETURNS LOG                             -->
    <!-- ======================================================= -->
    <div
      v-else-if="activeTab === 'returns'"
      class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-right text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800/70 text-xs font-bold text-slate-600 dark:text-slate-300">
            <tr>
              <th class="py-3 px-4">رقم المرتجع</th>
              <th class="py-3 px-4">الفاتورة الأصلية</th>
              <th class="py-3 px-4">المورد / الطرف</th>
              <th class="py-3 px-4">إجمالي المرتجع</th>
              <th class="py-3 px-4">خصم من الرصيد الآجل</th>
              <th class="py-3 px-4">نقدية مستردة للخزينة</th>
              <th class="py-3 px-4">السبب والتاريخ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <tr v-if="purchaseReturns.length === 0">
              <td colspan="7" class="py-10 text-center text-slate-400">لا توجد مرتجعات مشتريات مسجلة</td>
            </tr>
            <tr v-for="ret in purchaseReturns" :key="ret.id">
              <td class="py-3 px-4 font-mono font-bold text-rose-600">{{ ret.return_number }}</td>
              <td class="py-3 px-4 font-mono">{{ ret.invoice_number }}</td>
              <td class="py-3 px-4 font-bold">{{ ret.party_name }}</td>
              <td class="py-3 px-4 font-black">{{ ret.total_return_amount }} ج.م</td>
              <td class="py-3 px-4 text-amber-600 font-bold">{{ ret.balance_adjusted }} ج.م</td>
              <td class="py-3 px-4 text-emerald-600 font-bold">{{ ret.cash_refunded }} ج.م</td>
              <td class="py-3 px-4">
                <div>{{ ret.reason }}</div>
                <div class="text-[10px] text-slate-400">{{ ret.created_at }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- MODAL: INVOICE DETAILS                                  -->
    <!-- ======================================================= -->
    <div
      v-if="detailsModalOpen && selectedInvoice"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 class="font-black text-base text-slate-900 dark:text-white">
            تفاصيل فاتورة مشتريات {{ selectedInvoice.invoice_number }}
          </h3>
          <button
            type="button"
            @click="detailsModalOpen = false"
            class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          <div class="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
            <div><span class="font-bold">المورد/البائع:</span> {{ selectedInvoice.party_name }}</div>
            <div><span class="font-bold">التاريخ:</span> {{ selectedInvoice.invoice_date }}</div>
            <div><span class="font-bold">الإجمالي:</span> {{ selectedInvoice.total_amount }} ج.م</div>
            <div>
              <span class="font-bold">المدفوع / المتبقي:</span>
              {{ selectedInvoice.paid_amount }} / {{ selectedInvoice.remaining_amount }} ج.م
            </div>
          </div>

          <table class="w-full text-right border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr>
                <th class="p-2.5">الصنف</th>
                <th class="p-2.5">الكمية</th>
                <th class="p-2.5">التكلفة</th>
                <th class="p-2.5">الإجمالي</th>
                <th class="p-2.5">السيريالات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr v-for="(it, i) in selectedInvoice.items || []" :key="i">
                <td class="p-2.5 font-bold">
                  {{ it.product_name }}
                  <span v-if="it.variant_name">({{ it.variant_name }})</span>
                </td>
                <td class="p-2.5">
                  {{ it.quantity }} {{ it.unit === 'pack' ? 'عبوة' : 'قطعة' }}
                  <span v-if="(it.returned_qty || 0) > 0" class="text-rose-500">
                    (مرتجع: {{ it.returned_qty }})
                  </span>
                </td>
                <td class="p-2.5">{{ it.unit_cost }} ج.م</td>
                <td class="p-2.5 font-bold">{{ it.total_cost }} ج.م</td>
                <td class="p-2.5 font-mono text-[11px]">
                  {{ it.serials && it.serials.length ? it.serials.join(', ') : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- MODAL: CREATE PURCHASE RETURN                           -->
    <!-- ======================================================= -->
    <div
      v-if="returnModalOpen && returnInvoice"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h3 class="font-black text-base text-slate-900 dark:text-white">
            تسجيل مرتجع مشتريات - فاتورة {{ returnInvoice.invoice_number }}
          </h3>
          <button
            type="button"
            @click="returnModalOpen = false"
            class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-5 space-y-4 text-xs overflow-y-auto">
          <div
            v-if="returnForm.items.length === 0"
            class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-center text-slate-500 font-bold"
          >
            لا توجد أصناف متبقية قابلة للإرجاع في هذه الفاتورة
          </div>

          <div
            v-for="(rItem, idx) in returnForm.items"
            :key="idx"
            class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-bold text-slate-900 dark:text-white">{{ rItem.product_name }}</div>
                <div class="text-slate-500">
                  الحد الأقصى للإرجاع: {{ rItem.max_qty }} | تكلفة الوحدة: {{ rItem.unit_cost }} ج.م
                  <span v-if="rItem.track_serial" class="mr-2 font-bold text-indigo-600 dark:text-indigo-400">
                    | متاح بالمخزن (in_stock): {{ rItem.available_serials.length }}
                  </span>
                </div>
              </div>
              <div class="w-28 shrink-0">
                <label class="block text-[10px] font-bold mb-1">الكمية المرتجعة</label>
                <input
                  v-model.number="rItem.quantity"
                  @input="onReturnItemQtyInput(rItem)"
                  type="number"
                  min="0"
                  :max="rItem.max_qty"
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <!-- Serial Selection for Tracked Products -->
            <div
              v-if="rItem.track_serial"
              class="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Barcode class="w-3.5 h-3.5 text-indigo-500" />
                  <span>اختر السيريالات المتاحة في المخزون (in_stock) يدوياً:</span>
                  <span
                    v-if="rItem.used_fallback"
                    class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px]"
                  >
                    عرض سيريالات المخزون المتاحة
                  </span>
                </div>
                <span
                  v-if="Number(rItem.quantity || 0) > 0"
                  class="px-2 py-0.5 rounded-full text-[11px] font-black"
                  :class="
                    rItem.selected_serials.length === requiredReturnSerialsCount(rItem)
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                  "
                >
                  المختار: {{ rItem.selected_serials.length }} / المطلوب:
                  {{ requiredReturnSerialsCount(rItem) }}
                </span>
              </div>

              <div
                v-if="rItem.available_serials.length === 0"
                class="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold"
              >
                لا توجد سيريالات متاحة في المخزن (in_stock) قابلة للإرجاع لهذا الصنف حالياً.
              </div>

              <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1">
                <label
                  v-for="ser in rItem.available_serials"
                  :key="ser.serial_no"
                  class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors"
                  :class="
                    rItem.selected_serials.includes(ser.serial_no)
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-indigo-300'
                  "
                >
                  <input
                    v-model="rItem.selected_serials"
                    type="checkbox"
                    :value="ser.serial_no"
                    class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span class="font-mono font-bold truncate" dir="ltr">{{ ser.serial_no }}</span>
                  <span class="mr-auto text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    متاح
                  </span>
                </label>
              </div>

              <div
                v-if="rItem.unavailable_serials.length > 0"
                class="flex flex-wrap gap-1.5 pt-1 text-[10px] text-slate-500"
              >
                <span class="font-bold">سيريالات غير متاحة للإرجاع:</span>
                <span
                  v-for="uSer in rItem.unavailable_serials"
                  :key="uSer.serial_no"
                  class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 line-through font-mono"
                  dir="ltr"
                >
                  {{ uSer.serial_no }} ({{ serialStatusLabel(uSer.status) }})
                </span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">خزينة استرداد النقدية (إن وجد)</label>
              <select
                v-model="returnForm.payment_method"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option v-for="(label, key) in PAYMENT_METHODS" :key="key" :value="key">
                  {{ label }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">سبب الإرجاع للمورد</label>
              <input
                v-model="returnForm.reason"
                type="text"
                placeholder="عيب صناعة / أصناف زائدة..."
                class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              @click="returnModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              @click="handleCreatePurchaseReturn"
              class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
            >
              تأكيد مرتجع المشتريات
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
