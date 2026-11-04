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
  subscriptionStatus?: {
    isExpired: boolean
    daysRemaining: number | null
  }
}

export interface Customer {
  id: number
  name: string
  phone: string
  phone2: string
  area: string
  address: string
  notes: string
  created_at: string
  tickets_count?: number
}

export interface CustomerAppliance {
  id: number
  customer_id: number
  appliance_type: string
  brand: string
  model: string
  serial_number: string
  notes: string
  last_warranty_end?: string | null
  last_ticket_number?: string | null
  warranty_image?: string
  fault_images?: string[]
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

export type MovementType = 'in' | 'out_ticket' | 'custody_issue' | 'custody_return' | 'damaged'

export interface InventoryMovement {
  id: number
  part_id: number
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

export type ServiceType = 'home_visit' | 'workshop'
export type TicketStatus =
  | 'new'
  | 'assigned'
  | 'inspecting'
  | 'waiting_parts'
  | 'repaired'
  | 'delivered'
  | 'cancelled'

export type TicketPriority = 'normal' | 'urgent' | 'warranty_return'

export interface TicketPartItem {
  id?: number
  ticket_id?: number
  part_id: number
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
  warranty_image?: string
  fault_images?: string[]
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
  warranty_terms: string
  receipt_footer: string
  update_url?: string
  auto_backup_enabled?: number
  auto_backup_dir?: string
  auto_backup_keep_count?: number
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
  status: 'downloading' | 'completed' | 'error'
  message?: string
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
  topAppliances: Array<{ appliance_type: string; count: number; revenue: number }>
  topBrands: Array<{ brand: string; count: number; revenue: number }>
  transactions: TreasuryTransaction[]
}
