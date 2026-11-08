export type UserRole =
  | 'super_admin'
  | 'owner'
  | 'tenant'
  | 'receptionist'
  | 'cashier'
  | 'storekeeper'

export interface User {
  id: number
  username: string
  full_name: string
  phone: string
  role: UserRole
  is_active: number // 1 or 0
  subscription_start: string | null
  subscription_end: string | null
  subscription_sig?: string | null
  notes: string
  created_at: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface AuthResponse {
  success: boolean
  message?: string
  user?: User
  token?: string
  subscriptionStatus?: {
    isExpired: boolean
    daysRemaining: number | null
  }
}

export type BusinessType = 'appliances' | 'hearing_aids'

export interface BusinessState {
  type: BusinessType
  locked: boolean
  needsSetup: boolean
  appName?: string
  licensedModules?: string[]
  effectiveModules?: string[]
}

export type LookupCategory =
  | 'device_type'
  | 'brand'
  | 'part_category'
  | 'battery_size'
  | 'accessory_type'
  | 'earmold_type'
  | 'earmold_material'
  | 'implant_part'

export interface LookupItem {
  id: number
  category: LookupCategory
  value: string
  sort_order: number
  is_active: number
  business_type: BusinessType
  created_at?: string
}

export type CustomFieldEntity = 'customer' | 'device' | 'ticket'

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean' | 'textarea'

export interface CustomFieldDef {
  id: number
  business_type: BusinessType
  entity: CustomFieldEntity
  key: string
  label: string
  type: CustomFieldType
  options: string[]
  required: number // 1 or 0
  show_in_table: number // 1 or 0
  sort_order: number
  is_active: number // 1 or 0
  created_at?: string
}

export interface Customer {
  id: number
  name: string
  phone: string
  phone2: string
  area: string
  address: string
  notes: string
  // Phase 4: Patient medical fields (hearing_aids sector)
  birth_date?: string | null
  gender?: 'male' | 'female' | ''
  occupation?: string
  referring_doctor?: string
  medical_complaint?: string
  medical_history?: string
  allergies?: string
  doctor_notes?: string
  extra_data?: Record<string, any>
  created_at: string
  tickets_count?: number
  hearing_tests_count?: number
}

export interface CustomerAppliance {
  id: number
  customer_id: number
  appliance_type: string
  brand: string
  model: string
  serial_number: string
  purchase_date?: string | null
  notes: string
  last_warranty_end?: string | null
  last_ticket_number?: string | null
  warranty_image?: string
  fault_images?: string[]
  extra_data?: Record<string, any>
  created_at: string
}

export interface Technician {
  id: number
  name: string
  phone: string
  specialty: string
  commission_rate: number // Percentage of labor + inspection fee (e.g. 30%)
  base_salary: number
  is_active: number
  notes: string
  avatar_base64?: string
  created_at: string
  active_tickets_count?: number
  custody_parts_count?: number
  total_earned_commission?: number
  total_paid_commission?: number
}

export interface SparePart {
  id: number
  code: string
  name: string
  category: string
  brand: string
  purchase_price: number
  selling_price: number
  quantity: number
  min_quantity: number
  location: string
  notes: string
  image_base64?: string
  created_at: string
}

export type MovementType =
  | 'in'
  | 'out_ticket'
  | 'custody_issue'
  | 'custody_return'
  | 'damaged'
  | 'purchase_in'
  | 'sale_out'
  | 'sales_return_in'
  | 'purchase_return_out'
  | 'exchange_in'
  | 'exchange_out'

export interface InventoryMovement {
  id: number
  part_id: number | null
  product_id?: number | null
  variant_id?: number | null
  serial_no?: string
  ref_type?: string
  ref_id?: number | null
  part_name?: string
  part_code?: string
  technician_id: number | null
  technician_name?: string
  ticket_id: number | null
  ticket_number?: string
  movement_type: MovementType
  quantity: number
  unit_cost: number
  unit_price: number
  notes: string
  created_at: string
}

export type ProductType =
  | 'hearing_aid'
  | 'cochlear_processor'
  | 'cochlear_part'
  | 'battery'
  | 'accessory'
  | 'earmold'
  | 'service'

export type SerialStatus =
  | 'in_stock'
  | 'sold'
  | 'returned'
  | 'defective'
  | 'loaned'
  | 'external_repair'

export type SerialCondition = 'new' | 'used'

export interface ProductVariant {
  id?: number
  product_id?: number
  variant_name: string
  size: string
  color: string
  sku: string
  barcode: string
  cost_price: number | null
  sale_price: number | null
  pack_cost_price: number | null
  pack_sale_price: number | null
  qty: number
  min_stock: number
  is_active: number
}

export interface ProductSerial {
  id: number
  product_id: number
  product_name?: string
  product_brand?: string
  product_model?: string
  product_type?: ProductType
  variant_id: number | null
  serial_no: string
  status: SerialStatus
  condition: SerialCondition
  purchase_item_id: number | null
  sale_item_id: number | null
  customer_id: number | null
  customer_name?: string
  ear_side: string
  company_warranty_start: string | null
  company_warranty_end: string | null
  unit_cost?: number | null
  customer_warranty_start: string | null
  customer_warranty_end: string | null
  notes: string
  created_at: string
}

export interface Product {
  id: number
  code: string
  barcode: string
  name: string
  type: ProductType
  sub_category: string
  brand: string
  model: string
  compatible_with: string
  track_serial: number // 1 or 0
  has_variants: number // 1 or 0
  unit_name: string
  pack_name: string
  pack_size: number
  cost_price: number
  sale_price: number
  pack_cost_price: number
  pack_sale_price: number
  qty: number // total in pieces
  min_stock: number // in pieces
  warranty_months: number
  image_base64?: string
  notes: string
  extra_data?: Record<string, any>
  is_active: number
  created_at: string
  variants?: ProductVariant[]
  available_serials_count?: number
  total_serials_count?: number
}

export interface Supplier {
  id: number
  name: string
  company_name: string
  phone: string
  phone2: string
  address: string
  supplier_type: 'company' | 'customer'
  customer_id: number | null
  balance: number
  notes: string
  is_active: number
  created_at: string
  invoices_count?: number
  total_purchases?: number
  total_paid?: number
}

export interface SupplierPayment {
  id: number
  supplier_id: number
  supplier_name?: string
  purchase_invoice_id: number | null
  amount: number
  payment_method: string
  treasury_tx_id: number | null
  notes: string
  created_at: string
}

export interface SupplierStatementEntry {
  id: string
  date: string
  type: 'purchase' | 'payment' | 'return' | 'opening'
  reference: string
  description: string
  debit: number
  credit: number
  running_balance: number
  payment_method?: string
}

export interface SupplierStatement {
  supplier: Supplier
  totalPurchases: number
  totalPaid: number
  totalReturns: number
  currentBalance: number
  entries: SupplierStatementEntry[]
  payments: SupplierPayment[]
}

export interface PurchaseItem {
  id?: number
  invoice_id?: number
  product_id: number
  variant_id?: number | null
  product_name: string
  variant_name?: string
  unit: 'piece' | 'pack'
  pack_size: number
  quantity: number
  added_pieces_qty: number
  unit_cost: number
  total_cost: number
  condition: SerialCondition
  serials: string[]
  company_warranty_end?: string | null
  returned_qty?: number
}

export interface PurchaseInvoice {
  id: number
  invoice_number: string
  purchase_type: 'supplier' | 'used_from_customer'
  supplier_id: number | null
  customer_id: number | null
  party_name: string
  party_phone: string
  invoice_date: string
  supplier_ref_no: string
  subtotal: number
  discount: number
  total_amount: number
  paid_amount: number
  remaining_amount: number
  payment_method: string
  status: 'completed' | 'partial_return' | 'returned' | 'cancelled'
  notes: string
  created_by_id?: number | null
  created_by_name?: string
  created_at: string
  items?: PurchaseItem[]
}

export interface SalesItem {
  id?: number
  invoice_id?: number
  product_id: number
  variant_id?: number | null
  product_name: string
  variant_name?: string
  item_type: ProductType
  unit: 'piece' | 'pack'
  pack_size: number
  quantity: number
  deducted_pieces_qty: number
  serial_id?: number | null
  serial_no?: string
  condition?: SerialCondition
  ear_side?: string
  unit_cost: number
  unit_price: number
  discount: number
  total_price: number
  warranty_months: number
  warranty_start?: string | null
  warranty_end?: string | null
  returned_qty?: number
}

export interface SalesPayment {
  id: number
  invoice_id: number
  customer_id: number | null
  amount: number
  payment_method: string
  payment_type: 'initial' | 'installment' | 'refund' | 'exchange_diff'
  treasury_tx_id: number | null
  notes: string
  created_at: string
}

export interface SalesInvoice {
  id: number
  invoice_number: string
  invoice_type: 'regular' | 'quick_pos' | 'exchange'
  customer_id: number | null
  customer_name: string
  customer_phone: string
  subtotal: number
  discount: number
  trade_in_credit: number
  total_amount: number
  paid_amount: number
  remaining_amount: number
  payment_method: string
  status: 'completed' | 'partial_return' | 'returned' | 'cancelled'
  parent_invoice_id: number | null
  returned_amount?: number
  created_by_id?: number | null
  created_by_name?: string
  notes: string
  extra_data?: Record<string, any>
  created_at: string
  updated_at: string
  items?: SalesItem[]
  payments?: SalesPayment[]
}

export interface InvoiceReturnItem {
  id?: number
  return_id?: number
  invoice_item_id: number
  product_id: number
  variant_id?: number | null
  product_name: string
  quantity: number
  pieces_qty: number
  serial_id?: number | null
  serial_no?: string
  return_condition: 'in_stock' | 'defective' | 'returned'
  amount: number
}

export interface InvoiceReturn {
  id: number
  return_number: string
  return_type: 'sales_return' | 'purchase_return'
  invoice_id: number
  invoice_number: string
  party_id: number | null
  party_name: string
  total_return_amount: number
  cash_refunded: number
  balance_adjusted: number
  payment_method: string
  reason: string
  created_by_id?: number | null
  created_by_name?: string
  created_at: string
  items?: InvoiceReturnItem[]
}

export type ExchangeType = 'normal_exchange' | 'trade_in' | 'warranty_exchange'

export interface ProductExchange {
  id: number
  exchange_number: string
  exchange_type: ExchangeType
  original_invoice_id: number | null
  original_invoice_number?: string
  new_invoice_id: number | null
  new_invoice_number?: string
  customer_id: number | null
  customer_name: string
  returned_product_id: number | null
  returned_product_name: string
  returned_serial_no: string
  returned_condition: 'in_stock' | 'used' | 'defective'
  returned_value: number
  new_product_id: number
  new_product_name: string
  new_serial_no: string
  new_value: number
  price_difference: number
  paid_difference: number
  payment_method: string
  transferred_warranty_end: string | null
  external_repair_ticket_id: number | null
  notes: string
  created_at: string
}

export type ServiceType = 'home_visit' | 'workshop'
export type TicketStatus =
  | 'new'
  | 'assigned'
  | 'inspecting'
  | 'waiting_parts'
  | 'sent_to_lab'
  | 'returned_from_lab'
  | 'repaired'
  | 'delivered'
  | 'cancelled'

export type TicketPriority = 'normal' | 'urgent' | 'warranty_return'

export interface TicketPartItem {
  id?: number
  ticket_id?: number
  part_id: number | null
  product_id?: number | null
  variant_id?: number | null
  unit?: 'piece' | 'pack'
  pack_size?: number
  part_name: string
  part_code: string
  quantity: number
  unit_cost: number
  unit_price: number
  total_price: number
}

export interface MaintenanceTicket {
  id: number
  ticket_number: string
  customer_id: number
  customer_name: string
  customer_phone: string
  customer_phone2: string
  customer_area: string
  customer_address: string
  appliance_id: number | null
  appliance_type: string
  brand: string
  model: string
  serial_number: string
  service_type: ServiceType
  status: TicketStatus
  priority: TicketPriority
  complaint: string
  diagnosis: string
  technician_id: number | null
  technician_name?: string
  scheduled_date: string
  inspection_fee: number
  labor_cost: number
  parts_total: number
  parts_cost_total: number
  discount: number
  total_amount: number
  paid_amount: number
  remaining_amount: number
  payment_method: 'cash' | 'vodafone_cash' | 'instapay' | 'bank'
  warranty_months: number
  warranty_start_date: string | null
  warranty_end_date: string | null
  is_under_previous_warranty: number
  previous_ticket_number: string | null
  sales_invoice_id?: number | null
  product_serial_id?: number | null
  is_external_repair?: number
  external_vendor?: string
  external_sent_date?: string | null
  external_expected_date?: string | null
  external_returned_date?: string | null
  external_cost?: number
  external_tracking_no?: string
  loaner_serial_id?: number | null
  loaner_serial_no?: string
  loaner_product_name?: string
  loaner_handed_at?: string | null
  loaner_returned_at?: string | null
  warranty_image?: string
  fault_images?: string[]
  extra_data?: Record<string, any>
  commission_rate?: number | null
  commission_amount?: number | null
  created_by_id?: number | null
  created_by_name?: string
  notes: string
  completed_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
  parts?: TicketPartItem[]
}

export type TransactionType = 'income' | 'expense' | 'tech_commission'

export interface TreasuryTransaction {
  id: number
  transaction_type: TransactionType
  category: string
  amount: number
  ticket_id: number | null
  ticket_number?: string
  technician_id: number | null
  technician_name?: string
  sales_invoice_id?: number | null
  purchase_invoice_id?: number | null
  supplier_id?: number | null
  supplier_name?: string
  customer_id?: number | null
  payment_method: string
  description: string
  created_at: string
}

export interface CenterSettings {
  center_name: string
  center_subtitle: string
  phone1: string
  phone2: string
  whatsapp: string
  address: string
  logo_base64: string
  default_print_format: 'a4' | 'thermal80'
  default_inspection_fee: number
  default_warranty_months: number
  exchange_policy_days?: number
  warranty_terms: string
  receipt_footer: string
  update_url?: string
  auto_backup_enabled?: number
  auto_backup_dir?: string
  auto_backup_keep_count?: number
  browser_enabled?: number
  lan_enabled?: number
  lan_port?: number
  auto_start_windows?: number
  last_update_check_at?: string
}

export interface SystemControlStatus {
  browserEnabled: boolean
  lanEnabled: boolean
  lanRunning: boolean
  lanPort: number
  ips: string[]
  urls: string[]
  localUrl: string
  autoStartWindows: boolean
}

export interface UpdateCheckResult {
  success: boolean
  updateAvailable: boolean
  currentVersion: string
  latestVersion?: string
  downloadUrl?: string
  releaseNotes?: string
  publishedAt?: string
  message?: string
}

export interface UpdateProgressPayload {
  percent: number
  transferredBytes: number
  totalBytes: number
  speedBytesPerSec?: number
  remainingSeconds?: number | null
  status: 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error'
  message?: string
  installerPath?: string
  version?: string
}

export interface UpdateDownloadStatus {
  isDownloading: boolean
  isPaused: boolean
  isReadyToInstall: boolean
  progress: UpdateProgressPayload | null
  installerPath?: string
  version?: string
}

export interface DashboardStats {
  totalTicketsToday: number
  openTicketsCount: number
  homeVisitsCount: number
  workshopCount: number
  repairedWaitingDeliveryCount: number
  activeWarrantyClaimsCount: number
  lowStockPartsCount: number
  todayIncome: number
  todayExpense: number
  monthIncome: number
  monthExpense: number
  monthPartsCost: number
  monthTechCommissions: number
  monthNetProfit: number
  recentTickets: MaintenanceTicket[]
  lowStockParts: SparePart[]
  // Phase 3W: Hearing Aids Sales, Products & External Repair stats
  todaySalesCount?: number
  todaySalesRevenue?: number
  monthSalesCount?: number
  monthSalesRevenue?: number
  monthSalesCost?: number
  monthSalesProfit?: number
  lowStockProductsCount?: number
  lowStockProducts?: Array<{
    id: number
    name: string
    variant_name?: string
    qty: number
    min_stock: number
    pack_size: number
    unit_name: string
    pack_name: string
  }>
  externalRepairOpenCount?: number
  externalRepairOverdueCount?: number
  activeLoanersCount?: number
  recentSales?: SalesInvoice[]
  // Phase 4E: Patient Followups, Earmolds & Audiology reminders
  dueFollowupsTodayCount?: number
  overdueFollowupsCount?: number
  overdueEarmoldsCount?: number
  readyEarmoldsWaitingDeliveryCount?: number
  upcomingFollowups?: FollowupItem[]
  activeEarmoldAlerts?: EarmoldOrder[]
}

// ==========================================
// PHASE 4: PATIENT MEDICAL PROFILE, AUDIOLOGY, FOLLOW-UPS, EARMOLDS & IMPLANTS
// ==========================================

export type AudiogramEar = 'right' | 'left'
export type AudiogramConduction = 'air' | 'bone'
export type AudiogramFrequency = 250 | 500 | 1000 | 2000 | 4000 | 8000

export interface AudiogramPoint {
  id?: number
  test_id?: number
  ear: AudiogramEar
  conduction: AudiogramConduction
  frequency: AudiogramFrequency
  db_value: number // -10 to 120
  is_masked: number // 0 or 1
  no_response: number // 0 or 1
}

export type HearingTestType =
  | 'pure_tone'
  | 'speech'
  | 'tympanometry'
  | 'comprehensive'
  | 'aided'
  | 'free_field'

export interface HearingTest {
  id: number
  test_number: string
  patient_id: number
  patient_name?: string
  patient_phone?: string
  patient_birth_date?: string | null
  patient_gender?: string
  test_date: string
  examiner_id: number | null
  examiner_name: string
  test_type: HearingTestType
  srt_right: number | null
  srt_left: number | null
  sds_right: number | null
  sds_left: number | null
  mcl_right: number | null
  mcl_left: number | null
  ucl_right: number | null
  ucl_left: number | null
  tymp_right: string
  tymp_left: string
  pta_right: number | null
  pta_left: number | null
  loss_type_right: string
  loss_type_left: string
  loss_degree_right: string
  loss_degree_left: string
  recommended_product_id: number | null
  recommended_product_name: string
  recommendation_notes: string
  notes: string
  created_at: string
  points: AudiogramPoint[]
}

export type FollowupType =
  | 'fitting'
  | 'cleaning'
  | 'battery_mold'
  | 'periodic_check'
  | 'rehab'
  | 'mapping'

export type FollowupStatus = 'pending' | 'completed' | 'cancelled'

export interface FittingSettings {
  software?: string
  adaptation_step?: string
  gain_level?: string
  programs?: string
  volume_control?: string
  feedback_manager?: string
  patient_feedback?: string
}

export interface FollowupItem {
  id: number
  patient_id: number
  patient_name?: string
  patient_phone?: string
  device_id: number | null
  device_name?: string
  serial_no: string
  implant_id: number | null
  type: FollowupType
  status: FollowupStatus
  due_date: string
  done_date: string | null
  technician_id: number | null
  technician_name?: string
  fitting_settings: FittingSettings
  notes: string
  created_at: string
}

export type EarmoldStatus =
  | 'impression_taken'
  | 'sent_to_lab'
  | 'received'
  | 'delivered'
  | 'remake'

export interface EarmoldOrder {
  id: number
  order_number: string
  patient_id: number
  patient_name?: string
  patient_phone?: string
  device_id: number | null
  device_name?: string
  sales_invoice_id: number | null
  sales_invoice_number?: string
  ear: 'right' | 'left' | 'bilateral'
  mold_type: string
  material: string
  color: string
  vent_size: string
  tube_type: string
  impression_date: string
  lab_name: string
  sent_date: string | null
  expected_date: string | null
  received_date: string | null
  delivered_date: string | null
  status: EarmoldStatus
  lab_cost: number
  customer_price: number
  is_lab_cost_paid: number
  remake_of_id: number | null
  remake_of_number?: string
  notes: string
  created_at: string
}

export interface ImplantAccessories {
  magnet_strength?: string
  magnet_type?: string
  coil_model?: string
  cable_length?: string
  battery_type?: string
  charger_serial?: string
  remote_serial?: string
  dryer_model?: string
}

export interface CochlearImplant {
  id: number
  patient_id: number
  patient_name?: string
  patient_phone?: string
  ear: 'right' | 'left'
  brand: string
  internal_model: string
  internal_serial: string
  surgery_date: string | null
  hospital: string
  surgeon: string
  activation_date: string | null
  processor_device_id: number | null
  processor_serial_id: number | null
  processor_model: string
  processor_serial_no: string
  processor_warranty_end: string | null
  accessories: ImplantAccessories
  notes: string
  created_at: string
  sessions?: ImplantSession[]
}

export interface ImplantThresholds {
  coding_strategy?: string
  stimulation_rate?: string
  pulse_width?: string
  active_channels?: string
  impedance_status?: string
  t_level_summary?: string
  c_level_summary?: string
  active_programs?: string
}

export interface ImplantSession {
  id: number
  implant_id: number
  patient_id: number
  patient_name?: string
  implant_brand?: string
  implant_ear?: 'right' | 'left'
  session_date: string
  session_type: 'switch_on' | 'mapping' | 'rehab' | 'periodic_check' | 'troubleshooting'
  technician_id: number | null
  examiner_name: string
  program_notes: string
  thresholds: ImplantThresholds
  map_attachment_id: number | null
  map_file_name?: string
  next_due_date: string | null
  followup_id: number | null
  created_at: string
}

export type AttachmentCategory =
  | 'external_report'
  | 'audiogram_scan'
  | 'mapping_file'
  | 'prescription'
  | 'id_card'
  | 'general'

export interface PatientAttachment {
  id: number
  patient_id: number
  entity_type: 'patient' | 'hearing_test' | 'implant_session' | 'earmold' | 'followup'
  entity_id: number | null
  title: string
  category: AttachmentCategory
  file_name: string
  stored_name: string
  mime_type: string
  file_size: number
  notes: string
  created_at: string
}

export interface PatientProfileBundle {
  patient: Customer
  appliances: CustomerAppliance[]
  tickets: MaintenanceTicket[]
  salesInvoices: SalesInvoice[]
  hearingTests: HearingTest[]
  followups: FollowupItem[]
  earmoldOrders: EarmoldOrder[]
  implants: CochlearImplant[]
  attachments: PatientAttachment[]
}

export interface TechnicianStatementItem {
  id: number
  name: string
  phone: string
  specialty: string
  avatar_base64?: string
  commission_rate: number
  base_salary: number
  completed_tickets_count: number
  period_labor_and_inspection: number
  period_earned_commission: number
  period_paid_commission: number
  total_earned_commission: number
  total_paid_commission: number
  remaining_balance: number
}

export interface FinancialReportData {
  dateFrom: string
  dateTo: string
  summary: {
    totalIncome: number
    totalExpense: number
    totalTechCommissions: number
    totalPartsRevenue: number
    totalPartsCost: number
    totalPartsProfit: number
    totalInspectionAndLabor: number
    netProfit: number
    ticketsCount: number
    completedTicketsCount: number
    totalReceivables: number
    // Phase 3W Sales & Purchases Metrics
    salesInvoicesCount?: number
    totalSalesRevenue?: number
    totalSalesCost?: number
    totalSalesProfit?: number
    totalSalesReturns?: number
    totalPurchasesAmount?: number
    totalSuppliersBalance?: number
    totalSalesReceivables?: number
    totalExternalRepairCost?: number
    inventoryCostValue?: number
    inventorySaleValue?: number
  }
  balancesByMethod: Record<
    string,
    {
      income: number
      expense: number
      net: number
    }
  >
  periodBalancesByMethod: Record<
    string,
    {
      income: number
      expense: number
      net: number
    }
  >
  technicianStatements: TechnicianStatementItem[]
  customerReceivables: MaintenanceTicket[]
  salesReceivables?: SalesInvoice[]
  supplierBalances?: Supplier[]
  topProducts?: Array<{ product_name: string; qty: number; revenue: number; profit: number }>
  topAppliances: Array<{ appliance_type: string; count: number; revenue: number }>
  topBrands: Array<{ brand: string; count: number; revenue: number }>
  transactions: TreasuryTransaction[]
}

export interface DemoDataStatus {
  isDemoHidden: boolean
  hasDemoData: boolean
  counts: {
    customers: number
    tickets: number
    spare_parts: number
    products: number
    suppliers: number
    sales: number
    purchases: number
    hearing_tests: number
    earmold_orders: number
    followups: number
    implants: number
    technicians: number
    treasury: number
    total: number
  }
}
