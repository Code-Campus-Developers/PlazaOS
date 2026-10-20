import type { MaintenanceStatus, PaymentStatus } from '../../../lib/types'

export type { PaymentStatus, MaintenanceStatus }

export type UnitStatus = 'occupied' | 'vacant' | 'maintenance'

export interface Unit {
  id: string
  unitNumber: string
  floor: string
  sizeSqft: number
  monthlyRent: number
  status: UnitStatus
  tenantId?: string
  tenantName?: string
}

export type TenantStatus = 'active' | 'inactive'
export type RentStatus = 'paid' | 'due' | 'overdue'
// 'pending'   = a setup invitation was sent; the tenant has not set a
//               password yet (and therefore cannot log in).
// 'temporary' = legacy account still on the system-generated password from
//               account creation (or a reset).
// 'active'    = they've set their own password.
export type AccountStatus = 'pending' | 'temporary' | 'active'

export interface Tenant {
  id: string
  name: string
  email: string
  phone: string
  unitId: string
  unitNumber: string
  leaseStart: string
  leaseEnd: string
  monthlyRent: number
  rentStatus: RentStatus
  status: TenantStatus
  accountStatus: AccountStatus
  mustChangePassword: boolean
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'gateway'

export interface Payment {
  id: string
  tenantId: string
  tenantName: string
  unitNumber: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  date: string
  note?: string
  recordedBy?: string
  receiptAvailable: boolean
}

export type MaintenancePriority = 'low' | 'medium' | 'high'

export interface MaintenanceRequest {
  id: string
  tenantId: string
  tenantName: string
  unitId: string
  unitNumber: string
  title: string
  description: string
  status: MaintenanceStatus
  priority: MaintenancePriority
  images: string[]
  notes: string
  createdAt: string
  resolvedAt: string | null
}

export type AnnouncementAudience = 'all' | 'selected'

export interface Announcement {
  id: string
  title: string
  body: string
  audience: AnnouncementAudience
  audienceTenantIds: string[]
  createdAt: string
  author: string
}

export type ReminderType = 'automatic' | 'manual'
export type ReminderTarget = 'tenant' | 'group' | 'everyone'
export type ReminderStatus = 'scheduled' | 'sent' | 'failed'

export interface Reminder {
  id: string
  title: string
  message: string
  type: ReminderType
  target: ReminderTarget
  targetLabel: string
  scheduledFor: string
  status: ReminderStatus
}

export type CalendarEventType = 'lease_renewal' | 'reminder' | 'rent_due' | 'other'

export interface CalendarEvent {
  id: string
  title: string
  type: CalendarEventType
  date: string
  relatedLabel?: string
}
