<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalWarning, swalConfirm } from '@renderer/utils/swal'
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import DynamicFields from '@renderer/components/DynamicFields.vue'
import AudiogramChart from '@renderer/components/AudiogramChart.vue'
import { compressImageFile } from '@renderer/utils/imageHelper'
import {
  APPLIANCE_TYPES,
  APPLIANCE_BRANDS,
  TICKET_STATUS_MAP,
  PAYMENT_METHODS
} from '@renderer/constants/appliances'
import type {
  MaintenanceTicket,
  Technician,
  SparePart,
  TicketPartItem,
  Customer,
  CustomerAppliance,
  Product,
  ProductSerial,
  HearingTest
} from '@shared/types'
import {
  PlusCircle,
  Search,
  Printer,
  MessageCircle,
  Edit3,
  Trash2,
  ShieldAlert,
  Wrench,
  Home,
  Building2,
  PackagePlus,
  Camera,
  ShieldCheck,
  Users,
  CheckCircle2,
  Barcode,
  Truck,
  Headphones,
  RotateCcw,
  X,
  Activity,
  Eye
} from 'lucide-vue-next'

const route = useRoute()
const appStore = useAppStore()
const { t } = useTerms()

const availableDeviceTypes = computed(() => {
  const base = appStore.deviceTypes.length ? appStore.deviceTypes : APPLIANCE_TYPES
  const cur = form.value.appliance_type
  if (cur && !base.includes(cur)) {
    return [cur, ...base]
  }
  return base
})

const availableBrands = computed(() => {
  const base = appStore.brands.length ? appStore.brands : APPLIANCE_BRANDS
  const cur = form.value.brand
  if (cur && !base.includes(cur)) {
    return [cur, ...base]
  }
  return base
})

const tickets = ref<MaintenanceTicket[]>([])
const technicians = ref<Technician[]>([])
const spareParts = ref<SparePart[]>([])
const products = ref<Product[]>([])
const availableLoanerSerials = ref<ProductSerial[]>([])
const allCustomers = ref<Customer[]>([])
const customerSearchInput = ref('')
const showCustomerSuggestions = ref(false)
const activeCustomerField = ref<'search' | 'phone' | 'name' | null>(null)
const serialOrInvoiceQuery = ref('')

const searchQuery = ref('')
const statusFilter = ref('all')
const serviceTypeFilter = ref('all')

const modalOpen = ref(false)
const errorMsg = ref('')

// Auto customer lookup state
const existingAppliances = ref<CustomerAppliance[]>([])
const previousTickets = ref<MaintenanceTicket[]>([])
const activeWarrantyAlert = ref<{
  ticket_number: string
  appliance_type: string
  brand: string
  warranty_end_date: string
} | null>(null)

const hearingSummary = ref<{
  latestTest: HearingTest | null
  implantsCount: number
  latestFollowup: any
} | null>(null)
const previewAudiogramOpen = ref(false)

async function loadHearingSummary(customerId: number): Promise<void> {
  if (!appStore.isHearingAidsProfile) return
  try {
    hearingSummary.value = await window.api.getLatestHearingTestSummary(customerId)
  } catch {
    hearingSummary.value = null
  }
}

// Selected spare part / product for adding to ticket
const selectedPartId = ref<number | null>(null)
const selectedPartQty = ref<number>(1)
const selectedProductId = ref<number | null>(null)
const selectedProductQty = ref<number>(1)

const form = ref<{
  id?: number
  ticket_number?: string
  customer_id?: number
  customer_name: string
  customer_phone: string
  customer_phone2: string
  customer_area: string
  customer_address: string
  appliance_type: string
  brand: string
  model: string
  serial_number: string
  service_type: 'home_visit' | 'workshop'
  status: MaintenanceTicket['status']
  priority: MaintenanceTicket['priority']
  complaint: string
  diagnosis: string
  technician_id: number | null
  scheduled_date: string
  inspection_fee: number
  labor_cost: number
  discount: number
  paid_amount: number
  payment_method: MaintenanceTicket['payment_method']
  warranty_months: number
  is_under_previous_warranty: number
  previous_ticket_number: string | null
  sales_invoice_id: number | null
  product_serial_id: number | null
  is_external_repair: number
  external_vendor: string
  external_sent_date: string | null
  external_expected_date: string | null
  external_returned_date: string | null
  external_cost: number
  external_tracking_no: string
  loaner_serial_id: number | null
  loaner_serial_no: string
  loaner_product_name: string
  loaner_handed_at: string | null
  loaner_returned_at: string | null
  warranty_image: string
  fault_images: string[]
  extra_data: Record<string, any>
  notes: string
  parts: TicketPartItem[]
}>({
  customer_name: '',
  customer_phone: '',
  customer_phone2: '',
  customer_area: '',
  customer_address: '',
  appliance_type: '',
  brand: '',
  model: '',
  serial_number: '',
  service_type: 'home_visit',
  status: 'new',
  priority: 'normal',
  complaint: '',
  diagnosis: '',
  technician_id: null,
  scheduled_date: new Date().toISOString().slice(0, 10),
  inspection_fee: 150,
  labor_cost: 0,
  discount: 0,
  paid_amount: 0,
  payment_method: 'cash',
  warranty_months: 6,
  is_under_previous_warranty: 0,
  previous_ticket_number: null,
  sales_invoice_id: null,
  product_serial_id: null,
  is_external_repair: 0,
  external_vendor: '',
  external_sent_date: null,
  external_expected_date: null,
  external_returned_date: null,
  external_cost: 0,
  external_tracking_no: '',
  loaner_serial_id: null,
  loaner_serial_no: '',
  loaner_product_name: '',
  loaner_handed_at: null,
  loaner_returned_at: null,
  warranty_image: '',
  fault_images: [],
  extra_data: {},
  notes: '',
  parts: []
})

const computedPartsTotal = computed(() =>
  form.value.parts
    .filter((p) => Number(p.is_restored || 0) !== 1)
    .reduce(
      (sum, p) =>
        sum + Math.max(0, Number(p.quantity || 0)) * Math.max(0, Number(p.unit_price || 0)),
      0
    )
)

const activeFormPartsCount = computed(
  () => form.value.parts.filter((p) => Number(p.is_restored || 0) !== 1).length
)

const restoredFormPartsCount = computed(
  () => form.value.parts.filter((p) => Number(p.is_restored || 0) === 1).length
)

const hasUnreturnedLoaner = computed(() =>
  Boolean(form.value.loaner_serial_id && !form.value.loaner_returned_at)
)

const originalActivePartQty = ref<Record<number, number>>({})
const originalActiveProductQty = ref<Record<string, number>>({})

function resetOriginalTicketParts(parts: TicketPartItem[] = []): void {
  const partMap: Record<number, number> = {}
  const prodMap: Record<string, number> = {}
  for (const p of parts) {
    if (Number(p.is_restored || 0) === 1) continue
    const qty = Math.max(0, Number(p.quantity || 0))
    if (p.product_id) {
      const key = `${p.product_id}:${p.variant_id || 0}`
      prodMap[key] = (prodMap[key] || 0) + qty * Math.max(1, Number(p.pack_size || 1))
    } else if (p.part_id) {
      partMap[p.part_id] = (partMap[p.part_id] || 0) + qty
    }
  }
  originalActivePartQty.value = partMap
  originalActiveProductQty.value = prodMap
}

function getMaxTicketPartQty(partId: number): number {
  const part = spareParts.value.find((p) => p.id === partId)
  const stockLeft = Math.max(0, Number(part?.quantity || 0))
  const savedOnTicket = originalActivePartQty.value[partId] || 0
  return stockLeft + savedOnTicket
}

function getUsedFormPartQty(partId: number, excludeIndex = -1): number {
  return form.value.parts.reduce((sum, p, idx) => {
    if (idx === excludeIndex || Number(p.is_restored || 0) === 1 || p.part_id !== partId) {
      return sum
    }
    return sum + Math.max(0, Number(p.quantity || 0))
  }, 0)
}

function getMaxTicketProductPieces(productId: number, variantId: number | null): number | null {
  const prod = products.value.find((p) => p.id === productId)
  if (!prod || prod.type === 'service') return null
  const variant = variantId ? prod.variants?.find((v) => v.id === variantId) : null
  const stockLeft = Math.max(0, Number(variant ? variant.qty : prod.qty || 0))
  const savedOnTicket = originalActiveProductQty.value[`${productId}:${variantId || 0}`] || 0
  return stockLeft + savedOnTicket
}

function getUsedFormProductPieces(
  productId: number,
  variantId: number | null,
  excludeIndex = -1
): number {
  return form.value.parts.reduce((sum, p, idx) => {
    if (
      idx === excludeIndex ||
      Number(p.is_restored || 0) === 1 ||
      p.product_id !== productId ||
      (p.variant_id || null) !== (variantId || null)
    ) {
      return sum
    }
    return sum + Math.max(0, Number(p.quantity || 0)) * Math.max(1, Number(p.pack_size || 1))
  }, 0)
}

function clampNonNegativeField(
  field: 'inspection_fee' | 'labor_cost' | 'discount' | 'paid_amount' | 'external_cost'
): void {
  const val = Number(form.value[field])
  if (!Number.isFinite(val) || val < 0) {
    form.value[field] = 0
  }
}

function handlePartUnitPriceInput(item: TicketPartItem): void {
  if (Number(item.is_restored || 0) === 1) return
  const price = Number(item.unit_price)
  if (!Number.isFinite(price) || price < 0) {
    item.unit_price = 0
  }
  item.total_price =
    Math.round(Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unit_price || 0)) * 100) /
    100
}

function updateTicketPartQuantity(index: number, rawNewQty: unknown): boolean {
  const item = form.value.parts[index]
  if (!item || Number(item.is_restored || 0) === 1) return false

  const newQty = Number(rawNewQty)
  if (!Number.isFinite(newQty) || newQty <= 0) {
    swalError('كمية غير صالحة', 'يجب أن تكون الكمية أكبر من صفر')
    return false
  }

  if (item.product_id) {
    const maxPieces = getMaxTicketProductPieces(item.product_id, item.variant_id || null)
    const packSz = Math.max(1, Number(item.pack_size || 1))
    if (maxPieces !== null) {
      const otherUsed = getUsedFormProductPieces(item.product_id, item.variant_id || null, index)
      if (otherUsed + newQty * packSz > maxPieces) {
        const maxRemainingQty = Math.max(0, Math.floor((maxPieces - otherUsed) / packSz))
        swalError(
          'الكمية تتجاوز المخزون المتاح',
          `الحد الأقصى المتاح من (${item.part_name}) لهذه التذكرة هو ${maxRemainingQty}`
        )
        return false
      }
    }
  } else if (item.part_id) {
    const maxAllowed = getMaxTicketPartQty(item.part_id)
    const otherUsed = getUsedFormPartQty(item.part_id, index)
    if (otherUsed + newQty > maxAllowed) {
      const maxRemainingQty = Math.max(0, maxAllowed - otherUsed)
      swalError(
        'الكمية تتجاوز المخزون المتاح',
        `الحد الأقصى المتاح من (${item.part_name}) لهذه التذكرة هو ${maxRemainingQty}`
      )
      return false
    }
  }

  item.quantity = newQty
  item.total_price = Math.round(newQty * Math.max(0, Number(item.unit_price || 0)) * 100) / 100
  return true
}

function onPartQtyInputChange(index: number, e: Event): void {
  const input = e.target as HTMLInputElement
  const ok = updateTicketPartQuantity(index, input.value)
  if (!ok && form.value.parts[index]) {
    input.value = String(form.value.parts[index].quantity)
  }
}

function handleStatusChange(): void {
  if (form.value.status === 'delivered' && hasUnreturnedLoaner.value) {
    swalWarning(
      'تنبيه: جهاز الإعارة لم يُسترجع بعد!',
      `العميل لديه سماعة بديلة مؤقتة (${form.value.loaner_product_name || ''} - S/N: ${form.value.loaner_serial_no || ''}). يجب تأكيد استردادها للمخزن قبل تسليم التذكرة.`
    )
  }
}

function markFormLoanerReturnedNow(): void {
  form.value.loaner_returned_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
}

const computedTotalAmount = computed(() =>
  Math.max(
    0,
    Number(form.value.inspection_fee || 0) +
      Number(form.value.labor_cost || 0) +
      computedPartsTotal.value -
      Number(form.value.discount || 0)
  )
)

const computedRemainingAmount = computed(() =>
  Math.max(0, computedTotalAmount.value - Number(form.value.paid_amount || 0))
)

async function loadData(): Promise<void> {
  const [ticketRows, techRows, partRows, custRows, prodRows, serialRows] = await Promise.all([
    window.api.listTickets({
      search: searchQuery.value,
      status: statusFilter.value,
      service_type: serviceTypeFilter.value
    }),
    window.api.listTechnicians(),
    window.api.listSpareParts(),
    window.api.listCustomers(''),
    window.api.listProducts({ activeOnly: true }),
    window.api.listProductSerials({ status: 'in_stock' })
  ])
  tickets.value = ticketRows
  technicians.value = techRows
  spareParts.value = partRows
  allCustomers.value = custRows
  products.value = prodRows
  availableLoanerSerials.value = serialRows
}

const filteredCustomersForSelection = computed(() => {
  let q = ''
  if (activeCustomerField.value === 'search') {
    q = customerSearchInput.value.trim().toLowerCase()
  } else if (activeCustomerField.value === 'phone') {
    q = form.value.customer_phone.trim().toLowerCase()
  } else if (activeCustomerField.value === 'name') {
    q = form.value.customer_name.trim().toLowerCase()
  } else {
    q = customerSearchInput.value.trim().toLowerCase()
  }

  if (!q) {
    return allCustomers.value.slice(0, 10)
  }

  return allCustomers.value
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.phone2 && c.phone2.toLowerCase().includes(q)) ||
        (c.area && c.area.toLowerCase().includes(q))
    )
    .slice(0, 12)
})

async function selectCustomerFromSuggestion(c: Customer): Promise<void> {
  form.value.customer_id = c.id
  form.value.customer_name = c.name
  form.value.customer_phone = c.phone
  form.value.customer_phone2 = c.phone2 || ''
  form.value.customer_area = c.area || ''
  form.value.customer_address = c.address || ''
  customerSearchInput.value = `${c.name} — ${c.phone}`
  showCustomerSuggestions.value = false
  activeCustomerField.value = null
  await handlePhoneLookup()
}

function hideCustomerSuggestionsDelayed(): void {
  setTimeout(() => {
    showCustomerSuggestions.value = false
    activeCustomerField.value = null
  }, 180)
}

watch([searchQuery, statusFilter, serviceTypeFilter], () => {
  loadData()
})

async function handlePhoneLookup(): Promise<void> {
  const phone = form.value.customer_phone.trim()
  if (phone.length < 8) {
    existingAppliances.value = []
    previousTickets.value = []
    activeWarrantyAlert.value = null
    return
  }

  const res = await window.api.findCustomerByPhone(phone)
  if (res.customer) {
    if (!form.value.id) {
      form.value.customer_id = res.customer.id
      form.value.customer_name = res.customer.name
      form.value.customer_phone2 = res.customer.phone2 || ''
      form.value.customer_area = res.customer.area || ''
      form.value.customer_address = res.customer.address || ''
    }
    existingAppliances.value = res.appliances
    previousTickets.value = res.previousTickets
    if (res.customer.id && appStore.isHearingAidsProfile) {
      loadHearingSummary(res.customer.id)
    }

    // Check if any previous ticket has active warranty today
    const today = new Date().toISOString().slice(0, 10)
    const underWarrantyTicket = res.previousTickets.find(
      (t) => t.warranty_end_date && t.warranty_end_date >= today
    )
    if (underWarrantyTicket) {
      activeWarrantyAlert.value = {
        ticket_number: underWarrantyTicket.ticket_number,
        appliance_type: underWarrantyTicket.appliance_type,
        brand: underWarrantyTicket.brand,
        warranty_end_date: underWarrantyTicket.warranty_end_date!
      }
    } else {
      activeWarrantyAlert.value = null
    }
  } else {
    existingAppliances.value = []
    previousTickets.value = []
    activeWarrantyAlert.value = null
  }
}

function applyWarrantyReturnMode(): void {
  if (!activeWarrantyAlert.value) return
  form.value.priority = 'warranty_return'
  form.value.is_under_previous_warranty = 1
  form.value.previous_ticket_number = activeWarrantyAlert.value.ticket_number
  form.value.appliance_type = activeWarrantyAlert.value.appliance_type
  form.value.brand = activeWarrantyAlert.value.brand
  form.value.inspection_fee = 0
}

function selectExistingAppliance(app: CustomerAppliance): void {
  form.value.appliance_type = app.appliance_type
  form.value.brand = app.brand
  form.value.model = app.model || ''
  form.value.serial_number = app.serial_number || ''
  if (app.extra_data && typeof app.extra_data === 'object') {
    form.value.extra_data = { ...form.value.extra_data, ...app.extra_data }
  }
}

function addPartToTicket(): void {
  if (!selectedPartId.value) return
  const part = spareParts.value.find((p) => p.id === selectedPartId.value)
  if (!part) return

  const qty = Number(selectedPartQty.value)
  if (!Number.isFinite(qty) || qty <= 0) {
    swalError('كمية غير صالحة', 'يجب أن تكون الكمية المضافة أكبر من صفر')
    return
  }

  const maxAllowed = getMaxTicketPartQty(part.id)
  const alreadyUsed = getUsedFormPartQty(part.id)
  if (alreadyUsed + qty > maxAllowed) {
    const remaining = Math.max(0, maxAllowed - alreadyUsed)
    swalError(
      'الكمية تتجاوز المخزون المتاح',
      `المتاح حالياً من (${part.name}) لهذه التذكرة هو ${remaining} فقط`
    )
    return
  }

  const existing = form.value.parts.find(
    (p) => p.part_id === part.id && Number(p.is_restored || 0) !== 1
  )
  if (existing) {
    existing.quantity += qty
    existing.total_price = Math.round(existing.quantity * Math.max(0, existing.unit_price) * 100) / 100
  } else {
    form.value.parts.push({
      part_id: part.id,
      part_name: part.name,
      part_code: part.code,
      quantity: qty,
      unit_cost: part.purchase_price,
      unit_price: part.selling_price,
      total_price: Math.round(qty * Math.max(0, part.selling_price) * 100) / 100,
      is_restored: 0
    })
  }
  selectedPartId.value = null
  selectedPartQty.value = 1
}

function addProductToTicket(): void {
  if (!selectedProductId.value) return
  const prod = products.value.find((p) => p.id === selectedProductId.value)
  if (!prod) return

  const qty = Number(selectedProductQty.value)
  if (!Number.isFinite(qty) || qty <= 0) {
    swalError('كمية غير صالحة', 'يجب أن تكون الكمية المضافة أكبر من صفر')
    return
  }

  const variantId = prod.variants?.[0]?.id || null
  const maxPieces = getMaxTicketProductPieces(prod.id, variantId)
  if (maxPieces !== null) {
    const alreadyUsedPieces = getUsedFormProductPieces(prod.id, variantId)
    if (alreadyUsedPieces + qty > maxPieces) {
      const remaining = Math.max(0, maxPieces - alreadyUsedPieces)
      swalError(
        'الكمية تتجاوز المخزون المتاح',
        `المتاح حالياً من (${prod.name}) لهذه التذكرة هو ${remaining} فقط`
      )
      return
    }
  }

  const existing = form.value.parts.find(
    (p) =>
      p.product_id === prod.id &&
      (p.variant_id || null) === variantId &&
      Number(p.is_restored || 0) !== 1
  )
  if (existing) {
    existing.quantity += qty
    existing.total_price = Math.round(existing.quantity * Math.max(0, existing.unit_price) * 100) / 100
  } else {
    form.value.parts.push({
      part_id: null,
      product_id: prod.id,
      variant_id: variantId,
      unit: 'piece',
      pack_size: 1,
      part_name: prod.name,
      part_code: prod.code,
      quantity: qty,
      unit_cost: prod.cost_price,
      unit_price: prod.sale_price,
      total_price: Math.round(qty * Math.max(0, prod.sale_price) * 100) / 100,
      is_restored: 0
    })
  }
  selectedProductId.value = null
  selectedProductQty.value = 1
}

async function handleLookupSerialOrInvoice(customQuery?: string): Promise<void> {
  const q = (customQuery ?? serialOrInvoiceQuery.value).trim()
  if (!q) return
  const res = await window.api.lookupSerialOrInvoiceForTicket(q)
  if (!res.found) {
    swalError('لم يتم العثور على نتائج', `لا توجد سماعة أو فاتورة مطابقة لـ (${q})`)
    return
  }

  if (res.customer) {
    form.value.customer_id = res.customer.id
    form.value.customer_name = res.customer.name
    form.value.customer_phone = res.customer.phone
    form.value.customer_phone2 = res.customer.phone2 || ''
    form.value.customer_area = res.customer.area || ''
    form.value.customer_address = res.customer.address || ''
    customerSearchInput.value = `${res.customer.name} — ${res.customer.phone}`
  } else if (res.invoice) {
    form.value.customer_name = res.invoice.customer_name
    form.value.customer_phone = res.invoice.customer_phone || ''
  }

  if (res.product) {
    form.value.appliance_type = res.product.sub_category || 'سماعة طبية'
    form.value.brand = res.product.brand || availableBrands.value[0] || 'عام'
    form.value.model = res.product.model || res.product.name
  }

  if (res.serial) {
    form.value.serial_number = res.serial.serial_no
    form.value.product_serial_id = res.serial.id
  }

  if (res.invoice) {
    form.value.sales_invoice_id = res.invoice.id
  }

  if (res.earSide) {
    form.value.extra_data = { ...form.value.extra_data, ear_side: res.earSide }
  }

  if (res.isUnderWarranty) {
    form.value.is_under_previous_warranty = 1
    form.value.priority = 'warranty_return'
    form.value.inspection_fee = 0
    activeWarrantyAlert.value = {
      ticket_number: res.invoice?.invoice_number || res.serial?.serial_no || 'ضمان مبيعات',
      appliance_type: form.value.appliance_type,
      brand: form.value.brand,
      warranty_end_date: res.warrantyEndDate || ''
    }
  }
}

async function handleReturnLoaner(ticket: MaintenanceTicket): Promise<void> {
  const ok = await swalConfirm(
    'استرداد السماعة البديلة المؤقتة',
    `هل تم استلام السماعة البديلة (${ticket.loaner_product_name} - S/N: ${ticket.loaner_serial_no}) من العميل وإعادتها للمخزن؟`
  )
  if (!ok) return
  try {
    await appStore.withLoading(async () => {
      await window.api.returnTicketLoaner(ticket.id)
      await loadData()
      if (form.value.id === ticket.id) {
        form.value.loaner_returned_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    }, 'جاري استرداد السماعة البديلة للمخزن...')
    swalSuccess('تم استرداد السماعة البديلة وإعادتها للمخزن بنجاح')
  } catch (err: unknown) {
    swalError('تعذر الاسترداد', err instanceof Error ? err.message : '')
  }
}

function removePartFromTicket(index: number): void {
  const target = form.value.parts[index]
  if (!target || Number(target.is_restored || 0) === 1) return
  form.value.parts.splice(index, 1)
}

async function handleWarrantyImageUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  form.value.warranty_image = await compressImageFile(file, 1100, 1100, 0.84)
  input.value = ''
}

async function handleFaultImagesUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  const list = [...form.value.fault_images]
  for (const file of Array.from(files)) {
    const compressed = await compressImageFile(file, 1000, 1000, 0.82)
    list.push(compressed)
  }
  form.value.fault_images = list
  input.value = ''
}

function removeFaultImage(index: number): void {
  form.value.fault_images.splice(index, 1)
}

function openCreateModal(): void {
  errorMsg.value = ''
  existingAppliances.value = []
  previousTickets.value = []
  activeWarrantyAlert.value = null
  customerSearchInput.value = ''
  serialOrInvoiceQuery.value = ''
  showCustomerSuggestions.value = false
  form.value = {
    customer_name: '',
    customer_phone: '',
    customer_phone2: '',
    customer_area: '',
    customer_address: '',
    appliance_type: availableDeviceTypes.value[0] || '',
    brand: availableBrands.value[0] || '',
    model: '',
    serial_number: '',
    service_type: appStore.businessType === 'hearing_aids' ? 'workshop' : 'home_visit',
    status: 'new',
    priority: 'normal',
    complaint: '',
    diagnosis: '',
    technician_id: technicians.value[0]?.id || null,
    scheduled_date: new Date().toISOString().slice(0, 10),
    inspection_fee: appStore.settings.default_inspection_fee || 150,
    labor_cost: 0,
    discount: 0,
    paid_amount: 0,
    payment_method: 'cash',
    warranty_months: appStore.settings.default_warranty_months || 6,
    is_under_previous_warranty: 0,
    previous_ticket_number: null,
    sales_invoice_id: null,
    product_serial_id: null,
    is_external_repair: 0,
    external_vendor: '',
    external_sent_date: null,
    external_expected_date: null,
    external_returned_date: null,
    external_cost: 0,
    external_tracking_no: '',
    loaner_serial_id: null,
    loaner_serial_no: '',
    loaner_product_name: '',
    loaner_handed_at: null,
    loaner_returned_at: null,
    warranty_image: '',
    fault_images: [],
    extra_data: {},
    notes: '',
    parts: []
  }
  resetOriginalTicketParts([])
  modalOpen.value = true
}

function openEditModal(ticket: MaintenanceTicket): void {
  errorMsg.value = ''
  existingAppliances.value = []
  previousTickets.value = []
  activeWarrantyAlert.value = null
  customerSearchInput.value = `${ticket.customer_name} — ${ticket.customer_phone}`
  serialOrInvoiceQuery.value = ''
  showCustomerSuggestions.value = false
  form.value = {
    id: ticket.id,
    ticket_number: ticket.ticket_number,
    customer_id: ticket.customer_id,
    customer_name: ticket.customer_name,
    customer_phone: ticket.customer_phone,
    customer_phone2: ticket.customer_phone2 || '',
    customer_area: ticket.customer_area || '',
    customer_address: ticket.customer_address || '',
    appliance_type: ticket.appliance_type,
    brand: ticket.brand,
    model: ticket.model || '',
    serial_number: ticket.serial_number || '',
    service_type: ticket.service_type,
    status: ticket.status,
    priority: ticket.priority,
    complaint: ticket.complaint,
    diagnosis: ticket.diagnosis || '',
    technician_id: ticket.technician_id,
    scheduled_date: ticket.scheduled_date,
    inspection_fee: ticket.inspection_fee,
    labor_cost: ticket.labor_cost,
    discount: ticket.discount,
    paid_amount: ticket.paid_amount,
    payment_method: ticket.payment_method,
    warranty_months: ticket.warranty_months,
    is_under_previous_warranty: ticket.is_under_previous_warranty,
    previous_ticket_number: ticket.previous_ticket_number,
    sales_invoice_id: ticket.sales_invoice_id || null,
    product_serial_id: ticket.product_serial_id || null,
    is_external_repair: ticket.is_external_repair || 0,
    external_vendor: ticket.external_vendor || '',
    external_sent_date: ticket.external_sent_date || null,
    external_expected_date: ticket.external_expected_date || null,
    external_returned_date: ticket.external_returned_date || null,
    external_cost: ticket.external_cost || 0,
    external_tracking_no: ticket.external_tracking_no || '',
    loaner_serial_id: ticket.loaner_serial_id || null,
    loaner_serial_no: ticket.loaner_serial_no || '',
    loaner_product_name: ticket.loaner_product_name || '',
    loaner_handed_at: ticket.loaner_handed_at || null,
    loaner_returned_at: ticket.loaner_returned_at || null,
    warranty_image: ticket.warranty_image || '',
    fault_images: Array.isArray(ticket.fault_images) ? [...ticket.fault_images] : [],
    extra_data: ticket.extra_data ? { ...ticket.extra_data } : {},
    notes: ticket.notes || '',
    parts: ticket.parts ? ticket.parts.map((p) => ({ ...p })) : []
  }
  resetOriginalTicketParts(form.value.parts)
  modalOpen.value = true
}

async function handleSaveTicket(andPrint = false): Promise<void> {
  errorMsg.value = ''
  if (!form.value.customer_name.trim() || !form.value.customer_phone.trim()) {
    errorMsg.value = 'يرجى إدخال اسم العميل ورقم الهاتف'
    swalError('بيانات غير مكتملة', errorMsg.value)
    return
  }
  if (!form.value.complaint.trim()) {
    errorMsg.value = 'يرجى كتابة شكوى العميل أو وصف العطل'
    swalError('بيانات غير مكتملة', errorMsg.value)
    return
  }
  const devCheck = appStore.validateCustomFields('device', form.value.extra_data)
  if (!devCheck.valid) {
    errorMsg.value = `يرجى استكمال الحقل الإلزامي: ${devCheck.missingLabel}`
    swalError('بيانات إضافية مطلوبة', errorMsg.value)
    return
  }
  const tktCheck = appStore.validateCustomFields('ticket', form.value.extra_data)
  if (!tktCheck.valid) {
    errorMsg.value = `يرجى استكمال الحقل الإلزامي: ${tktCheck.missingLabel}`
    swalError('بيانات إضافية مطلوبة', errorMsg.value)
    return
  }

  if (
    Number(form.value.inspection_fee || 0) < 0 ||
    Number(form.value.labor_cost || 0) < 0 ||
    Number(form.value.discount || 0) < 0 ||
    Number(form.value.paid_amount || 0) < 0 ||
    Number(form.value.external_cost || 0) < 0
  ) {
    errorMsg.value = 'لا يمكن إدخال قيم سالبة في الأسعار أو المصنعية أو الخصم'
    swalError('قيمة غير صالحة', errorMsg.value)
    return
  }

  for (const p of form.value.parts) {
    if (Number(p.is_restored || 0) === 1) continue
    if (Number(p.quantity || 0) <= 0) {
      errorMsg.value = `الكمية للصنف (${p.part_name}) يجب أن تكون أكبر من صفر`
      swalError('كمية غير صالحة', errorMsg.value)
      return
    }
    if (Number(p.unit_price || 0) < 0) {
      errorMsg.value = `سعر الوحدة للصنف (${p.part_name}) لا يمكن أن يكون سالباً`
      swalError('قيمة غير صالحة', errorMsg.value)
      return
    }
  }

  // Warn if delivering ticket while loaner hearing aid is still not returned
  if (
    form.value.status === 'delivered' &&
    form.value.loaner_serial_id &&
    !form.value.loaner_returned_at
  ) {
    const confirmLoaner = await swalConfirm(
      'تنبيه: سماعة بديلة مؤقتة بعهدة العميل!',
      `العميل لديه سماعة بديلة مؤقتة (${form.value.loaner_product_name || ''} - S/N: ${form.value.loaner_serial_no || ''}) لم يُسجل استردادها بعد. هل تم استردادها الآن مع تسليم الجهاز؟`,
      'نعم، تم استردادها الآن',
      'إلغاء الحفظ'
    )
    if (!confirmLoaner) {
      errorMsg.value = 'لا يمكن تسليم الجهاز قبل استرداد السماعة البديلة المؤقتة من العميل'
      swalWarning('تعذر تسليم الجهاز', errorMsg.value)
      return
    }
    form.value.loaner_returned_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  try {
    const isEdit = Boolean(form.value.id)
    const saved = await appStore.withLoading(
      async () => {
        const res = await window.api.saveTicket(plain({ ...form.value }))
        modalOpen.value = false
        await loadData()
        return res
      },
      isEdit ? 'جاري حفظ تعديلات طلب الصيانة...' : 'جاري تسجيل وحفظ بلاغ الصيانة...'
    )
    swalSuccess(
      isEdit ? 'تم حفظ تعديلات بلاغ الصيانة بنجاح' : `تم تسجيل بلاغ الصيانة رقم ${saved.ticket_number} بنجاح`
    )
    if (andPrint) {
      appStore.openPrintModal(
        saved,
        saved.status === 'repaired' || saved.status === 'delivered'
          ? 'invoice_warranty'
          : 'reception_receipt'
      )
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الطلب'
    swalError('خطأ أثناء حفظ الطلب', errorMsg.value)
  }
}

async function handleDeleteTicket(ticket: MaintenanceTicket): Promise<void> {
  const confirmed = await swalConfirm(
    `حذف بلاغ الصيانة (${ticket.ticket_number})؟`,
    `سيتم حذف الطلب وإرجاع أي ${t('parts')} منصرفة إلى المخزن تلقائياً.`
  )
  if (!confirmed) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteTicket(ticket.id)
      await loadData()
    }, 'جاري حذف طلب الصيانة...')
    swalSuccess(`تم حذف طلب الصيانة رقم ${ticket.ticket_number} بنجاح`)
  } catch (err: unknown) {
    swalError('تعذر حذف الطلب', err instanceof Error ? err.message : '')
  }
}

onMounted(async () => {
  await loadData()
  if (route.query.new === '1') {
    openCreateModal()
  } else if (route.query.serial || route.query.invoice_id) {
    openCreateModal()
    const q = String(route.query.serial || route.query.invoice_id || '')
    serialOrInvoiceQuery.value = q
    await handleLookupSerialOrInvoice(q)
  }
})
</script>

<template>
  <div class="space-y-5">
    <!-- Top Header & Filters -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs space-y-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench class="w-5 h-5 text-blue-600" />
            إدارة {{ t('ticketsPage') }} والضمان
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تسجيل الخدمات، صرف {{ t('parts') }}، وإصدار الفواتير وشهادات الضمان (A4 / 80mm)
          </p>
        </div>

        <button
          type="button"
          @click="openCreateModal"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          تسجيل {{ t('ticket') }} جديد
        </button>
      </div>

      <!-- Search & Filter Bar -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <div class="md:col-span-2 relative">
          <Search
            class="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="`بحث برقم الطلب، اسم العميل، الموبايل، نوع ${t('device')}، الماركة، أو السيريال...`"
            class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
          />
        </div>

        <select
          v-model="statusFilter"
          class="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
        >
          <option value="all">جميع حالات الصيانة</option>
          <option v-for="(info, key) in TICKET_STATUS_MAP" :key="key" :value="key">
            {{ info.label }}
          </option>
        </select>

        <select
          v-model="serviceTypeFilter"
          class="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
        >
          <option value="all">جميع أنواع الخدمة</option>
          <option value="home_visit">زيارات خارجية فقط</option>
          <option value="workshop">{{ t('devices') }} داخل المركز فقط</option>
        </select>
      </div>
    </div>

    <!-- Tickets Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead
            class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold"
          >
            <tr>
              <th class="py-3.5 px-4">رقم الطلب</th>
              <th class="py-3.5 px-4">العميل والمنطقة</th>
              <th class="py-3.5 px-4">{{ t('device') }} والعطل</th>
              <th class="py-3.5 px-4">الخدمة والفني</th>
              <th class="py-3.5 px-4">الحالة</th>
              <th class="py-3.5 px-4">الحساب والمدفوع</th>
              <th class="py-3.5 px-4">الضمان</th>
              <th class="py-3.5 px-4">الطباعة والإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
            <tr
              v-for="ticket in tickets"
              :key="ticket.id"
              class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
            >
              <td class="py-3.5 px-4">
                <div class="font-mono font-black text-blue-600 dark:text-blue-400">
                  {{ ticket.ticket_number }}
                </div>
                <div class="text-[11px] text-slate-500">{{ ticket.scheduled_date }}</div>
                <span
                  v-if="ticket.is_under_previous_warranty || ticket.priority === 'warranty_return'"
                  class="inline-block mt-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-bold"
                >
                  🛡️ إعادة بالضمان
                </span>
              </td>

              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-900 dark:text-white">{{ ticket.customer_name }}</div>
                <div class="text-slate-500 font-mono">{{ ticket.customer_phone }}</div>
                <div v-if="ticket.customer_area" class="text-[11px] text-slate-500">
                  📍 {{ ticket.customer_area }}
                </div>
              </td>

              <td class="py-3.5 px-4 max-w-xs">
                <div class="font-bold text-slate-900 dark:text-white">
                  {{ ticket.appliance_type }} — <span class="text-blue-600">{{ ticket.brand }}</span>
                </div>
                <div class="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  {{ ticket.complaint }}
                </div>
                <!-- Custom Field Badges shown in table -->
                <div
                  v-if="
                    appStore
                      .formatExtraDataEntries(ticket.extra_data, ['device', 'ticket'])
                      .filter((x) => x.showInTable).length > 0
                  "
                  class="mt-1 flex flex-wrap gap-1"
                >
                  <span
                    v-for="cf in appStore
                      .formatExtraDataEntries(ticket.extra_data, ['device', 'ticket'])
                      .filter((x) => x.showInTable)"
                    :key="cf.key"
                    class="px-1.5 py-0.5 rounded bg-purple-100/80 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 text-[10px] font-bold"
                  >
                    {{ cf.label }}: {{ cf.value }}
                  </span>
                </div>
                <div
                  v-if="ticket.parts && ticket.parts.length > 0"
                  class="flex flex-wrap items-center gap-1.5 text-[10px] font-bold mt-0.5"
                >
                  <span
                    v-if="ticket.parts.some((p) => Number(p.is_restored || 0) !== 1)"
                    class="text-emerald-600 dark:text-emerald-400"
                  >
                    🔧 {{ t('parts') }} مركبة:
                    {{ ticket.parts.filter((p) => Number(p.is_restored || 0) !== 1).length }}
                  </span>
                  <span
                    v-if="ticket.parts.some((p) => Number(p.is_restored || 0) === 1)"
                    class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                  >
                    مسترجعة للمخزن:
                    {{ ticket.parts.filter((p) => Number(p.is_restored || 0) === 1).length }}
                  </span>
                </div>
              </td>

              <td class="py-3.5 px-4">
                <div class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                  <Home v-if="ticket.service_type === 'home_visit'" class="w-3.5 h-3.5 text-indigo-500" />
                  <Building2 v-else class="w-3.5 h-3.5 text-amber-500" />
                  <span>{{ ticket.service_type === 'home_visit' ? 'زيارة منزلية' : 'بالورشة' }}</span>
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  {{ t('technician') }}: <strong class="text-slate-800 dark:text-slate-200">{{ ticket.technician_name || 'لم يعين' }}</strong>
                </div>
              </td>

              <td class="py-3.5 px-4">
                <span
                  :class="[
                    'px-2.5 py-1 rounded-full text-[11px] font-bold border',
                    TICKET_STATUS_MAP[ticket.status]?.badgeClass
                  ]"
                >
                  {{ TICKET_STATUS_MAP[ticket.status]?.label }}
                </span>
                <div
                  v-if="ticket.external_vendor"
                  class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1"
                >
                  🏭 المعمل: {{ ticket.external_vendor }}
                  <span v-if="ticket.external_expected_date">
                    (متوقع: {{ ticket.external_expected_date }})
                  </span>
                </div>
                <div
                  v-if="ticket.loaner_serial_id && !ticket.loaner_returned_at"
                  class="mt-1 flex items-center gap-1"
                >
                  <span class="px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] font-bold">
                    🎧 بديلة: {{ ticket.loaner_serial_no }}
                  </span>
                  <button
                    type="button"
                    @click="handleReturnLoaner(ticket)"
                    title="استرداد السماعة البديلة للمخزن"
                    class="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold cursor-pointer"
                  >
                    استرداد
                  </button>
                </div>
              </td>

              <td class="py-3.5 px-4">
                <div class="font-black text-slate-900 dark:text-white">
                  الإجمالي: {{ ticket.total_amount }} ج.م
                </div>
                <div class="text-[11px] text-emerald-600 font-bold">
                  مدفوع: {{ ticket.paid_amount }} ج.م
                </div>
                <div
                  v-if="ticket.remaining_amount > 0"
                  class="text-[11px] text-rose-600 font-bold"
                >
                  متبقي: {{ ticket.remaining_amount }} ج.م
                </div>
              </td>

              <td class="py-3.5 px-4">
                <div v-if="ticket.warranty_months > 0" class="font-bold text-emerald-700 dark:text-emerald-400">
                  {{ ticket.warranty_months }} شهور
                </div>
                <div v-else class="text-slate-400">بدون ضمان</div>
                <div v-if="ticket.warranty_end_date" class="text-[10px] text-slate-500">
                  حتى {{ ticket.warranty_end_date }}
                </div>
              </td>

              <td class="py-3.5 px-4">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    @click="appStore.openPrintModal(ticket, 'invoice_warranty', 'a4')"
                    class="px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    title="طباعة فاتورة وشهادة ضمان A4"
                  >
                    <Printer class="w-3.5 h-3.5" />
                    A4
                  </button>
                  <button
                    type="button"
                    @click="appStore.openPrintModal(ticket, 'reception_receipt', 'thermal80')"
                    class="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    title="طباعة إيصال حراري 80mm"
                  >
                    <Printer class="w-3.5 h-3.5" />
                    80mm
                  </button>
                  <button
                    type="button"
                    @click="appStore.sendWhatsAppToCustomer(ticket)"
                    class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 transition cursor-pointer"
                    title="إرسال واتساب للعميل"
                  >
                    <MessageCircle class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    @click="openEditModal(ticket)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                    title="تعديل الطلب"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    @click="handleDeleteTicket(ticket)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                    title="حذف الطلب"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="tickets.length === 0">
              <td colspan="8" class="py-10 text-center text-slate-400">
                لا توجد طلبات صيانة مطابقة للبحث
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ======================================================= -->
    <!-- CREATE / EDIT TICKET MODAL                              -->
    <!-- ======================================================= -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[93vh] flex flex-col overflow-hidden"
      >
        <!-- Modal Header -->
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench class="w-5 h-5 text-blue-600" />
            <span>
              {{
                form.id
                  ? `تعديل طلب الصيانة (${form.ticket_number})`
                  : 'تسجيل بلاغ / طلب صيانة جديد'
              }}
            </span>
          </h3>
          <button
            type="button"
            @click="modalOpen = false"
            class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div
            v-if="errorMsg"
            class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold"
          >
            {{ errorMsg }}
          </div>

          <!-- Phase 3E: Quick Serial / Sales Invoice Lookup (Hearing Aids) -->
          <div
            v-if="appStore.businessType === 'hearing_aids'"
            class="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-end gap-3"
          >
            <div class="flex-1 min-w-[240px]">
              <label class="block font-bold text-indigo-800 dark:text-indigo-300 mb-1">
                <Barcode class="w-4 h-4 inline ml-1" />
                استعلام سريع بالسيريال نمبر (S/N) أو رقم فاتورة المبيعات (يكتشف الضمان والعميل تلقائياً):
              </label>
              <input
                v-model="serialOrInvoiceQuery"
                @keyup.enter="handleLookupSerialOrInvoice()"
                type="text"
                placeholder="امسح سيريال السماعة أو اكتب رقم فاتورة المبيعات مثل INV-2026-0001..."
                class="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 font-mono font-bold"
              />
            </div>
            <button
              type="button"
              @click="handleLookupSerialOrInvoice()"
              class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
            >
              بحث وجلب البيانات
            </button>
          </div>

          <!-- Automatic Active Warranty Alert if Customer has active warranty -->
          <div
            v-if="activeWarrantyAlert"
            class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 flex flex-wrap items-center justify-between gap-3"
          >
            <div class="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
              <ShieldAlert class="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <div class="font-black text-sm">
                  تنبيه ضمان تلقائي: هذا العميل لديه {{ t('device') }} داخل فترة الضمان!
                </div>
                <div class="text-xs mt-0.5">
                  طلب رقم <strong>{{ activeWarrantyAlert.ticket_number }}</strong> — {{ t('device') }} ({{
                    activeWarrantyAlert.appliance_type
                  }}
                  {{ activeWarrantyAlert.brand }}) — الضمان ساري حتى
                  <strong>{{ activeWarrantyAlert.warranty_end_date }}</strong>
                </div>
              </div>
            </div>
            <button
              type="button"
              @click="applyWarrantyReturnMode"
              class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
            >
              تسجيل كإعادة صيانة بالضمان (مجاناً)
            </button>
          </div>

          <!-- Section 1: Customer Details -->
          <div
            class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="font-black text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                <Users class="w-4 h-4 text-blue-600" />
                1. بيانات العميل (اختر عميلاً مسجلاً بالاسم أو رقم الهاتف، أو أدخل عميلاً جديداً)
              </h4>
              <span
                v-if="form.customer_id"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-bold text-[11px]"
              >
                <CheckCircle2 class="w-3.5 h-3.5" />
                عميل مسجل (#{{ form.customer_id }})
              </span>
            </div>

            <!-- Quick Customer Search & Select By Name or Phone -->
            <div class="relative">
              <label class="block font-bold text-blue-700 dark:text-blue-400 mb-1">
                🔍 اختيار سريع لعميل مسجل (ابحث بالاسم أو رقم الهاتف أو المنطقة):
              </label>
              <div class="relative">
                <Search
                  class="w-4 h-4 text-blue-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  v-model="customerSearchInput"
                  @focus="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'search'
                  "
                  @input="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'search'
                  "
                  @blur="hideCustomerSuggestionsDelayed"
                  type="text"
                  :placeholder="`اكتب اسم العميل أو رقم الموبايل لاختياره تلقائياً مع عنوانه و${t('devices')}...`"
                  class="w-full pr-10 pl-8 py-2 rounded-xl bg-blue-50/70 dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 focus:border-blue-500 focus:outline-none font-bold"
                />
                <button
                  v-if="customerSearchInput"
                  type="button"
                  @click="
                    customerSearchInput = '';
                    showCustomerSuggestions = true;
                    activeCustomerField = 'search'
                  "
                  class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>

              <!-- Customer Suggestions Dropdown -->
              <div
                v-if="showCustomerSuggestions && filteredCustomersForSelection.length > 0"
                class="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800"
              >
                <button
                  v-for="cust in filteredCustomersForSelection"
                  :key="cust.id"
                  type="button"
                  @mousedown.prevent="selectCustomerFromSuggestion(cust)"
                  class="w-full px-4 py-2.5 text-right hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 transition cursor-pointer"
                >
                  <div>
                    <div class="font-black text-slate-900 dark:text-white">
                      {{ cust.name }}
                      <span
                        v-if="cust.area"
                        class="text-[11px] font-normal text-slate-500 mr-1.5"
                      >
                        (📍 {{ cust.area }})
                      </span>
                    </div>
                    <div v-if="cust.address" class="text-[11px] text-slate-500 truncate max-w-md">
                      {{ cust.address }}
                    </div>
                  </div>
                  <div class="text-left shrink-0">
                    <div class="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {{ cust.phone }}
                    </div>
                    <div v-if="cust.phone2" class="font-mono text-[10px] text-slate-400">
                      {{ cust.phone2 }}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold mb-1">رقم الموبايل الأساسي *</label>
                <input
                  v-model="form.customer_phone"
                  @focus="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'phone'
                  "
                  @input="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'phone';
                    handlePhoneLookup()
                  "
                  @blur="hideCustomerSuggestionsDelayed"
                  type="text"
                  placeholder="010xxxxxxxx"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">اسم العميل *</label>
                <input
                  v-model="form.customer_name"
                  @focus="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'name'
                  "
                  @input="
                    showCustomerSuggestions = true;
                    activeCustomerField = 'name'
                  "
                  @blur="hideCustomerSuggestionsDelayed"
                  type="text"
                  placeholder="اسم العميل ثلاثي"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">رقم هاتف إضافي</label>
                <input
                  v-model="form.customer_phone2"
                  type="text"
                  placeholder="011xxxxxxxx"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">المنطقة / الحي</label>
                <input
                  v-model="form.customer_area"
                  type="text"
                  placeholder="مثال: مدينة نصر / المعادي"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>
            <div>
              <label class="block font-bold mb-1">العنوان التفصيلي للزيارة المنزلية</label>
              <input
                v-model="form.customer_address"
                type="text"
                placeholder="اسم الشارع - رقم العمارة - الدور - الشقة - علامة مميزة"
                class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
              />
            </div>

            <!-- Customer Previous Appliances Quick Selector -->
            <div v-if="existingAppliances.length > 0" class="pt-2">
              <span class="font-bold text-blue-600 dark:text-blue-400 ml-2">
                {{ t('devices') }} المسجلة سابقاً للعميل (اضغط للاختيار السريع):
              </span>
              <div class="flex flex-wrap gap-2 mt-1.5">
                <button
                  v-for="app in existingAppliances"
                  :key="app.id"
                  type="button"
                  @click="selectExistingAppliance(app)"
                  class="px-3 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-bold cursor-pointer"
                >
                  🔌 {{ app.appliance_type }} ({{ app.brand }})
                  <span v-if="app.last_warranty_end"> — ضمان حتى {{ app.last_warranty_end }}</span>
                </button>
              </div>
            </div>

            <!-- Hearing Aids Patient Medical & Audiology Summary (Phase 4E) -->
            <div
              v-if="appStore.isHearingAidsProfile && hearingSummary?.latestTest"
              class="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div>
                <div class="font-black text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <Activity class="w-4 h-4 text-blue-600" />
                  آخر فحص سمعي للمريض ({{ hearingSummary.latestTest.test_date }}):
                  يمين PTA {{ hearingSummary.latestTest.pta_right ?? '—' }} dB ({{ hearingSummary.latestTest.loss_degree_right || 'طبيعي' }}) |
                  يسار PTA {{ hearingSummary.latestTest.pta_left ?? '—' }} dB ({{ hearingSummary.latestTest.loss_degree_left || 'طبيعي' }})
                </div>
                <div v-if="hearingSummary.latestTest.recommended_product_name" class="text-slate-600 dark:text-slate-400 mt-0.5">
                  السماعة الموصى بها: {{ hearingSummary.latestTest.recommended_product_name }}
                </div>
              </div>

              <button
                type="button"
                @click="previewAudiogramOpen = true"
                class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Eye class="w-3.5 h-3.5" />
                معاينة الأوديوجرام
              </button>
            </div>
          </div>

          <!-- Section 2: Appliance & Service Details -->
          <div
            class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <h4 class="font-black text-slate-900 dark:text-white text-sm">
              2. بيانات {{ t('device') }} وتفاصيل الخدمة
            </h4>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold mb-1">{{ t('deviceType') }} *</label>
                <SearchableSelect v-model="form.appliance_type" :options="availableDeviceTypes" />
              </div>
              <div>
                <label class="block font-bold mb-1">{{ t('brand') }} *</label>
                <SearchableSelect v-model="form.brand" :options="availableBrands" />
              </div>
              <div>
                <label class="block font-bold mb-1">الموديل / السعة</label>
                <input
                  v-model="form.model"
                  type="text"
                  :placeholder="t('modelPlaceholder')"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">رقم السيريال (Serial Number)</label>
                <input
                  v-model="form.serial_number"
                  type="text"
                  placeholder="اختياري"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold mb-1">نوع الخدمة *</label>
                <select
                  v-model="form.service_type"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option value="home_visit">🏠 زيارة منزلية</option>
                  <option value="workshop">🏢 استلام بالورشة</option>
                </select>
              </div>
              <div>
                <label class="block font-bold mb-1">حالة الطلب *</label>
                <select
                  v-model="form.status"
                  @change="handleStatusChange"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option v-for="(info, k) in TICKET_STATUS_MAP" :key="k" :value="k">
                    {{ info.label }}
                  </option>
                </select>
                <div
                  v-if="form.status === 'delivered' && hasUnreturnedLoaner"
                  class="mt-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-[11px] font-bold flex items-center justify-between gap-2"
                >
                  <span>
                    ⚠️ تنبيه: جهاز الإعارة المؤقت ({{ form.loaner_product_name || 'سماعة بديلة' }} - S/N:
                    {{ form.loaner_serial_no || '' }}) لم يُسترجع بعد!
                  </span>
                  <button
                    type="button"
                    @click="markFormLoanerReturnedNow"
                    class="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black cursor-pointer"
                  >
                    تأكيد الاسترجاع الآن
                  </button>
                </div>
              </div>
              <div>
                <label class="block font-bold mb-1">تعيين الفني المسؤول</label>
                <SearchableSelect
                  v-model="form.technician_id"
                  placeholder="-- لم يعين بعد --"
                  :options="
                    technicians.map((tech) => ({
                      value: tech.id,
                      label: `${tech.name} (${tech.specialty})`
                    }))
                  "
                />
              </div>
              <div>
                <label class="block font-bold mb-1">تاريخ الزيارة / الاستلام</label>
                <input
                  v-model="form.scheduled_date"
                  type="date"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold mb-1">شكوى العميل / العطل المبلّغ عنه *</label>
                <textarea
                  v-model="form.complaint"
                  rows="2"
                  :placeholder="t('complaintPlaceholder')"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                ></textarea>
              </div>
              <div>
                <label class="block font-bold mb-1">التشخيص الفني وما تم عمله</label>
                <textarea
                  v-model="form.diagnosis"
                  rows="2"
                  :placeholder="t('diagnosisPlaceholder')"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                ></textarea>
              </div>
            </div>

            <!-- Dynamic Custom Fields for Device & Ticket -->
            <DynamicFields
              entity="device"
              v-model="form.extra_data"
              :title="`بيانات مخصصة لـ ${t('device')}`"
              :columns="3"
            />
            <DynamicFields
              entity="ticket"
              v-model="form.extra_data"
              :title="`بيانات مخصصة لـ ${t('ticket')}`"
              :columns="3"
            />

            <!-- Warranty Image & Fault Images Attachment -->
            <div
              class="pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <!-- Warranty Image -->
              <div
                class="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between gap-3"
              >
                <div class="flex items-center gap-2.5">
                  <img
                    v-if="form.warranty_image"
                    :src="form.warranty_image"
                    @click="appStore.openImagePreview(form.warranty_image, 'صورة الضمان')"
                    class="w-12 h-12 rounded-lg border border-emerald-500 object-cover bg-white cursor-pointer shrink-0"
                  />
                  <div>
                    <div class="font-bold text-emerald-800 dark:text-emerald-300">
                      🛡️ صورة شهادة الضمان
                    </div>
                    <div class="text-[10px] text-slate-500">تُحفظ أيضاً في سجل {{ t('devices') }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <label
                    class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ShieldCheck class="w-3.5 h-3.5" />
                    <span>{{ form.warranty_image ? 'تغيير' : 'إرفاق صورة' }}</span>
                    <input
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="handleWarrantyImageUpload"
                    />
                  </label>
                  <button
                    v-if="form.warranty_image"
                    type="button"
                    @click="form.warranty_image = ''"
                    class="px-2 py-1.5 rounded-lg bg-rose-100 text-rose-700 font-bold cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </div>

              <!-- Fault Images -->
              <div
                class="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-bold text-amber-900 dark:text-amber-300">
                      📷 صور العطل و{{ t('device') }} ({{ form.fault_images.length }})
                    </div>
                    <div class="text-[10px] text-slate-500">قبل وبعد الصيانة</div>
                  </div>
                  <label
                    class="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Camera class="w-3.5 h-3.5" />
                    <span>إرفاق صور العطل (+)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      class="hidden"
                      @change="handleFaultImagesUpload"
                    />
                  </label>
                </div>
                <div v-if="form.fault_images.length > 0" class="flex flex-wrap gap-1.5">
                  <div
                    v-for="(img, idx) in form.fault_images"
                    :key="idx"
                    class="relative w-12 h-12 rounded-lg border border-amber-500 overflow-hidden bg-white"
                  >
                    <img
                      :src="img"
                      @click="appStore.openImagePreview(img, `صورة العطل ${idx + 1}`)"
                      class="w-full h-full object-cover cursor-pointer"
                    />
                    <button
                      type="button"
                      @click="removeFaultImage(idx)"
                      class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 3: Spare Parts Used on Ticket -->
          <div
            class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <h4 class="font-black text-slate-900 dark:text-white text-sm">
              3. {{ t('parts') }} المنصرفة للطلب (تُخصم تلقائياً من المخزن وتُضاف للفاتورة)
            </h4>

            <div class="flex flex-wrap items-end gap-2">
              <div class="flex-1 min-w-[240px]">
                <label class="block font-bold mb-1">اختر من {{ t('partsStore') }}</label>
                <SearchableSelect
                  v-model="selectedPartId"
                  placeholder="-- اختر صنفاً لإضافته --"
                  :options="
                    spareParts.map((p) => ({
                      value: p.id,
                      label: `[${p.code}] ${p.name} — سعر البيع: ${p.selling_price} ج.م (المتاح: ${p.quantity})`,
                      disabled: p.quantity <= 0
                    }))
                  "
                />
              </div>

              <div class="w-24">
                <label class="block font-bold mb-1">الكمية</label>
                <input
                  v-model.number="selectedPartQty"
                  type="number"
                  min="1"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-center"
                />
              </div>

              <button
                type="button"
                @click="addPartToTicket"
                class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
              >
                <PackagePlus class="w-4 h-4" />
                إضافة للطلب
              </button>
            </div>

            <!-- Phase 3E: Consuming Products / Services from Products Catalog -->
            <div
              v-if="appStore.businessType === 'hearing_aids' && products.length > 0"
              class="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700"
            >
              <div class="flex-1 min-w-[240px]">
                <label class="block font-bold text-indigo-700 dark:text-indigo-400 mb-1">
                  أو اختر من أصناف السماعات والمستلزمات والخدمات:
                </label>
                <select
                  v-model="selectedProductId"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700"
                >
                  <option :value="null">-- اختر صنفاً أو خدمة --</option>
                  <option
                    v-for="pr in products.filter((x) => !x.track_serial)"
                    :key="pr.id"
                    :value="pr.id"
                    :disabled="pr.type !== 'service' && pr.qty <= 0"
                  >
                    [{{ pr.code }}] {{ pr.name }} — السعر: {{ pr.sale_price }} ج.م ({{
                      pr.type === 'service' ? 'خدمة' : `المتاح: ${pr.qty}`
                    }})
                  </option>
                </select>
              </div>
              <div class="w-24">
                <label class="block font-bold mb-1">الكمية</label>
                <input
                  v-model.number="selectedProductQty"
                  type="number"
                  min="1"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-center"
                />
              </div>
              <button
                type="button"
                @click="addProductToTicket"
                class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
              >
                <PackagePlus class="w-4 h-4" />
                إدراج الصنف / الخدمة
              </button>
            </div>

            <div
              v-if="form.parts.length > 0"
              class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900"
            >
              <div
                class="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px]"
              >
                <span class="font-bold text-slate-700 dark:text-slate-300">
                  القطع النشطة المحتسبة: {{ activeFormPartsCount }}
                </span>
                <span
                  v-if="restoredFormPartsCount > 0"
                  class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold"
                >
                  قطع تاريخية مسترجعة للمخزن (غير محتسبة بالإجمالي): {{ restoredFormPartsCount }}
                </span>
              </div>
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-100 dark:bg-slate-800 font-bold">
                  <tr>
                    <th class="py-2 px-3">الكود</th>
                    <th class="py-2 px-3">اسم {{ t('part') }}</th>
                    <th class="py-2 px-3">الكمية</th>
                    <th class="py-2 px-3">سعر البيع للوحدة</th>
                    <th class="py-2 px-3">الإجمالي</th>
                    <th class="py-2 px-3">حذف</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr
                    v-for="(item, idx) in form.parts"
                    :key="idx"
                    :class="
                      Number(item.is_restored || 0) === 1
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 opacity-70'
                        : ''
                    "
                  >
                    <td class="py-2 px-3 font-mono">{{ item.part_code }}</td>
                    <td class="py-2 px-3 font-bold">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span
                          :class="
                            Number(item.is_restored || 0) === 1
                              ? 'line-through text-slate-500'
                              : ''
                          "
                        >
                          {{ item.part_name }}
                        </span>
                        <span
                          v-if="Number(item.is_restored || 0) === 1"
                          class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black"
                        >
                          مسترجعة للمخزن
                        </span>
                      </div>
                    </td>
                    <td class="py-2 px-3">
                      <span
                        v-if="Number(item.is_restored || 0) === 1"
                        class="font-mono text-slate-500 line-through"
                      >
                        {{ item.quantity }}
                      </span>
                      <div v-else class="inline-flex items-center gap-1">
                        <button
                          type="button"
                          @click="updateTicketPartQuantity(idx, Number(item.quantity || 1) - 1)"
                          class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-black cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          :value="item.quantity"
                          @change="onPartQtyInputChange(idx, $event)"
                          type="number"
                          min="1"
                          class="w-14 px-1.5 py-1 text-center rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                        />
                        <button
                          type="button"
                          @click="updateTicketPartQuantity(idx, Number(item.quantity || 0) + 1)"
                          class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-black cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td class="py-2 px-3">
                      <input
                        v-model.number="item.unit_price"
                        @input="handlePartUnitPriceInput(item)"
                        type="number"
                        min="0"
                        step="0.01"
                        :disabled="Number(item.is_restored || 0) === 1"
                        class="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td class="py-2 px-3 font-bold">
                      <span
                        v-if="Number(item.is_restored || 0) === 1"
                        class="text-slate-400 line-through font-mono"
                      >
                        {{ Math.max(0, item.quantity) * Math.max(0, item.unit_price) }} ج.م (مستثناة)
                      </span>
                      <span v-else>
                        {{ Math.max(0, item.quantity) * Math.max(0, item.unit_price) }} ج.م
                      </span>
                    </td>
                    <td class="py-2 px-3">
                      <span
                        v-if="Number(item.is_restored || 0) === 1"
                        class="text-[10px] text-slate-400 font-bold"
                      >
                        سجل تاريخي
                      </span>
                      <button
                        v-else
                        type="button"
                        @click="removePartFromTicket(idx)"
                        class="text-rose-600 hover:underline font-bold cursor-pointer"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Phase 3E: External Lab / Agent Repair & Loaner Hearing Aid (Hearing Aids Mode) -->
          <div
            v-if="appStore.businessType === 'hearing_aids'"
            class="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <!-- External Lab Repair Box -->
            <div
              class="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 space-y-3"
            >
              <div class="flex items-center justify-between">
                <h4 class="font-black text-indigo-900 dark:text-indigo-200 text-sm flex items-center gap-1.5">
                  <Truck class="w-4 h-4 text-indigo-600" />
                  صيانة خارجية (المعمل / الوكيل)
                </h4>
                <label class="flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="Boolean(form.is_external_repair)"
                    @change="
                      form.is_external_repair = ($event.target as HTMLInputElement).checked ? 1 : 0;
                      if (form.is_external_repair && form.status === 'new') form.status = 'sent_to_lab'
                    "
                    class="rounded text-indigo-600"
                  />
                  إرسال لمعمل خارجي
                </label>
              </div>

              <div
                v-if="form.is_external_repair || form.status === 'sent_to_lab' || form.status === 'returned_from_lab'"
                class="grid grid-cols-2 gap-2.5"
              >
                <div class="col-span-2">
                  <label class="block font-bold mb-1">اسم الوكيل / المعمل الخارجي</label>
                  <input
                    v-model="form.external_vendor"
                    type="text"
                    placeholder="مثال: توكيل سيمنس / معمل القوالب..."
                    class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label class="block font-bold mb-1">تاريخ الإرسال</label>
                  <input
                    v-model="form.external_sent_date"
                    type="date"
                    class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label class="block font-bold mb-1">تاريخ العودة المتوقع</label>
                  <input
                    v-model="form.external_expected_date"
                    type="date"
                    class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label class="block font-bold mb-1">تكلفة المعمل على المركز (ج.م)</label>
                  <input
                    v-model.number="form.external_cost"
                    @input="clampNonNegativeField('external_cost')"
                    type="number"
                    min="0"
                    step="0.01"
                    class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label class="block font-bold mb-1">رقم إيصال / تتبع الوكيل</label>
                  <input
                    v-model="form.external_tracking_no"
                    type="text"
                    class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>
            </div>

            <!-- Loaner Hearing Aid Box -->
            <div
              class="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 space-y-3"
            >
              <h4 class="font-black text-purple-900 dark:text-purple-200 text-sm flex items-center gap-1.5">
                <Headphones class="w-4 h-4 text-purple-600" />
                إعارة سماعة بديلة مؤقتة للعميل (Loaner)
              </h4>

              <div>
                <label class="block font-bold mb-1">اختر سماعة بديلة متاحة بالمخزن</label>
                <select
                  v-model="form.loaner_serial_id"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                >
                  <option :value="null">-- بدون سماعة بديلة --</option>
                  <option
                    v-if="form.loaner_serial_id && form.loaner_serial_no"
                    :value="form.loaner_serial_id"
                  >
                    [الحالية] {{ form.loaner_product_name }} — S/N: {{ form.loaner_serial_no }}
                  </option>
                  <option v-for="ls in availableLoanerSerials" :key="ls.id" :value="ls.id">
                    {{ ls.product_name }} — S/N: {{ ls.serial_no }} ({{
                      ls.condition === 'used' ? 'مستعملة' : 'جديدة'
                    }})
                  </option>
                </select>
              </div>

              <div v-if="form.loaner_serial_id" class="flex items-center justify-between pt-1">
                <span
                  v-if="form.loaner_returned_at"
                  class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold"
                >
                  ✅ تم استرداد السماعة البديلة ({{ form.loaner_returned_at.slice(0, 10) }})
                </span>
                <label v-else class="flex items-center gap-2 font-bold text-purple-800 dark:text-purple-300 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="Boolean(form.loaner_returned_at)"
                    @change="
                      form.loaner_returned_at = ($event.target as HTMLInputElement).checked
                        ? new Date().toISOString().slice(0, 19).replace('T', ' ')
                        : null
                    "
                    class="rounded"
                  />
                  تأكيد استرداد السماعة البديلة وإعادتها للمخزن
                </label>
              </div>
            </div>
          </div>

          <!-- Section 4: Financials & Warranty -->
          <div
            class="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-3"
          >
            <h4 class="font-black text-slate-900 dark:text-white text-sm">
              4. الحساب المالي وشهادة الضمان
            </h4>

            <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label class="block font-bold mb-1">رسوم الكشف</label>
                <input
                  v-model.number="form.inspection_fee"
                  @input="clampNonNegativeField('inspection_fee')"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">المصنعية والإصلاح</label>
                <input
                  v-model.number="form.labor_cost"
                  @input="clampNonNegativeField('labor_cost')"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">إجمالي {{ t('parts') }}</label>
                <input
                  :value="computedPartsTotal"
                  disabled
                  type="number"
                  class="w-full px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">خصم للعميل</label>
                <input
                  v-model.number="form.discount"
                  @input="clampNonNegativeField('discount')"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>
              <div>
                <label class="block font-bold mb-1 text-emerald-700 dark:text-emerald-400">
                  المبلغ المدفوع (المحصل)
                </label>
                <input
                  v-model.number="form.paid_amount"
                  @input="clampNonNegativeField('paid_amount')"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border-2 border-emerald-500 font-black"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">طريقة الدفع</label>
                <select
                  v-model="form.payment_method"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option v-for="(label, k) in PAYMENT_METHODS" :key="k" :value="k">
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-center pt-2">
              <div>
                <label class="block font-bold mb-1">مدة الضمان الممنوحة للعميل</label>
                <select
                  v-model.number="form.warranty_months"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                >
                  <option :value="0">بدون ضمان (كشف فقط)</option>
                  <option :value="1">ضمان شهر واحد</option>
                  <option :value="3">ضمان 3 شهور</option>
                  <option :value="6">ضمان 6 شهور</option>
                  <option :value="12">ضمان سنة كاملة (12 شهر)</option>
                </select>
              </div>

              <div
                class="md:col-span-2 flex items-center justify-around p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700"
              >
                <div class="text-center">
                  <span class="text-slate-500 block">الإجمالي النهائي</span>
                  <span class="text-lg font-black text-blue-600 dark:text-blue-400">
                    {{ computedTotalAmount }} ج.م
                  </span>
                </div>
                <div class="text-center">
                  <span class="text-slate-500 block">المدفوع</span>
                  <span class="text-lg font-black text-emerald-600">
                    {{ form.paid_amount }} ج.م
                  </span>
                </div>
                <div class="text-center">
                  <span class="text-slate-500 block">المتبقي على العميل</span>
                  <span class="text-lg font-black text-rose-600">
                    {{ computedRemainingAmount }} ج.م
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-end gap-3 text-xs"
        >
          <button
            type="button"
            @click="modalOpen = false"
            class="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            @click="handleSaveTicket(false)"
            class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
          >
            حفظ بيانات الطلب
          </button>
          <button
            type="button"
            @click="handleSaveTicket(true)"
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md cursor-pointer"
          >
            <Printer class="w-4 h-4" />
            حفظ وطباعة الإيصال / شهادة الضمان
          </button>
        </div>
      </div>
    </div>
    <!-- Audiogram Chart Preview Modal for Ticket (Phase 4E) -->
    <div
      v-if="previewAudiogramOpen && hearingSummary?.latestTest"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
    >
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl p-6 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b pb-3">
          <h3 class="font-black text-sm flex items-center gap-2">
            <Activity class="w-4 h-4 text-blue-600" />
            مخطط الأوديوجرام للمريض — فحص رقم {{ hearingSummary.latestTest.test_number }} ({{ hearingSummary.latestTest.test_date }})
          </h3>
          <button @click="previewAudiogramOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
          <div>
            <span class="font-bold text-red-600">الأذن اليمنى: </span>
            <span class="font-mono font-bold">PTA {{ hearingSummary.latestTest.pta_right ?? '—' }} dB</span> — {{ hearingSummary.latestTest.loss_degree_right || 'طبيعي' }}
          </div>
          <div>
            <span class="font-bold text-blue-600">الأذن اليسرى: </span>
            <span class="font-mono font-bold">PTA {{ hearingSummary.latestTest.pta_left ?? '—' }} dB</span> — {{ hearingSummary.latestTest.loss_degree_left || 'طبيعي' }}
          </div>
        </div>

        <AudiogramChart :model-value="hearingSummary.latestTest.points || []" readonly compact />
      </div>
    </div>
  </div>
</template>
