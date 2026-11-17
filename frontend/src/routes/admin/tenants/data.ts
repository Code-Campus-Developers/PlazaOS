import { api } from '../../../lib/api'
import type { AccountStatus, RentStatus, Tenant } from '../data/types'

export type TenantSortField = 'name' | 'unitNumber' | 'leaseEnd' | 'rentStatus'
export type SortDirection = 'asc' | 'desc'

export interface GetTenantsParams {
  search?: string
  rentStatus?: 'all' | RentStatus
  accountStatus?: 'all' | AccountStatus
  sortBy?: TenantSortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

export interface GetTenantsResult {
  data: Tenant[]
  total: number
  page: number
  pageSize: number
}

/**
 * The only function that reads/searches/filters/sorts/paginates the tenants
 * collection — every other file gets tenants through this. Calls
 * `GET /tenants?search=&rentStatus=&accountStatus=&sortBy=&sortDir=&page=&pageSize=`.
 */
export async function getTenants(params: GetTenantsParams = {}): Promise<GetTenantsResult> {
  const {
    search = '',
    rentStatus = 'all',
    accountStatus = 'all',
    sortBy = 'name',
    sortDir = 'asc',
    page = 1,
    pageSize = 20,
  } = params
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (rentStatus !== 'all') query.set('rentStatus', rentStatus)
  if (accountStatus !== 'all') query.set('accountStatus', accountStatus)
  query.set('sortBy', sortBy)
  query.set('sortDir', sortDir)
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))

  return api.get<GetTenantsResult>(`/tenants?${query.toString()}`)
}

/** `GET /tenants/:tenantId`. */
export async function getTenant(tenantId: string): Promise<Tenant> {
  return api.get<Tenant>(`/tenants/${tenantId}`)
}

export interface AddTenantInput {
  name: string
  email: string
  phone: string
  unitId: string
  unitNumber: string
  leaseStart: string
  leaseEnd: string
  monthlyRent: number
}

/** The delivery outcome of the setup invitation the backend emailed. */
export interface InvitationResult {
  delivered: boolean
  status: 'sent' | 'failed' | 'not_configured' | 'pending'
  expiresAt?: string
}

export interface AddTenantResult {
  tenant: Tenant
  invitation: InvitationResult
}

/**
 * `POST /tenants` — creates the tenant, assigns the unit, and creates the
 * lease atomically server-side (see backend/src/app/api/tenants/route.ts);
 * this never needs a separate `updateUnit()` call afterward.
 *
 * The tenant sets their own password via the emailed setup link, so the
 * response carries only the invitation's delivery status — never a password
 * or a token.
 */
export async function addTenant(input: AddTenantInput): Promise<AddTenantResult> {
  // `unitNumber` is a local-only field: the backend derives it from the
  // assigned unit and its schema rejects any extra field.
  const { unitNumber, ...body } = input
  const result = await api.post<{
    success: boolean
    id: string
    invitation: InvitationResult
  }>('/tenants', body)
  return {
    tenant: {
      id: result.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      unitId: input.unitId,
      unitNumber,
      leaseStart: input.leaseStart,
      leaseEnd: input.leaseEnd,
      monthlyRent: input.monthlyRent,
      rentStatus: 'due',
      status: 'active',
      accountStatus: 'pending',
      mustChangePassword: true,
    },
    invitation: result.invitation,
  }
}

// `rentStatus` is intentionally NOT part of this input — the backend derives
// it read-only from the tenant's real RentCharge state, and only a settled
// Payment (POST /payments) can ever change it. See
// backend/src/app/api/tenants/[id]/route.ts's PATCH handler.
export interface UpdateTenantInput {
  leaseEnd?: string
  monthlyRent?: number
  status?: 'active' | 'inactive'
  accountStatus?: AccountStatus
  mustChangePassword?: boolean
}

/** `PATCH /tenants/:tenantId`. */
export async function updateTenant(tenantId: string, updates: UpdateTenantInput): Promise<Tenant | undefined> {
  return api.patch<Tenant>(`/tenants/${tenantId}`, updates)
}

export interface ResetPasswordResult {
  email: string
  invitation: InvitationResult
}

/**
 * `POST /tenants/:tenantId/reset-password` — issues a fresh setup invitation
 * and emails it to the tenant. The administrator only ever sees the delivery
 * status, never a password or a token. Calling it again re-issues the
 * invitation, so it also covers "resend invitation".
 */
export async function resetTenantPassword(tenantId: string): Promise<ResetPasswordResult> {
  const result = await api.post<{
    success: boolean
    email: string
    invitation: InvitationResult
  }>(`/tenants/${tenantId}/reset-password`)
  return { email: result.email, invitation: result.invitation }
}
