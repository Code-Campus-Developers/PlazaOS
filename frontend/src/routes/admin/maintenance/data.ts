import { api } from '../../../lib/api'
import type { MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '../data/types'

export type MaintenanceSortField = 'createdAt' | 'priority' | 'status'
export type SortDirection = 'asc' | 'desc'

export interface GetMaintenanceRequestsParams {
  search?: string
  status?: 'all' | MaintenanceStatus
  priority?: 'all' | MaintenancePriority
  sortBy?: MaintenanceSortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

export interface GetMaintenanceRequestsResult {
  data: MaintenanceRequest[]
  total: number
  page: number
  pageSize: number
}

/**
 * The only function that reads/searches/filters/sorts/paginates the
 * maintenance requests collection — every other file gets requests through
 * this. Calls `GET /maintenance?search=&status=&priority=&sortBy=&sortDir=&page=&pageSize=`;
 */
export async function getMaintenanceRequests(params: GetMaintenanceRequestsParams = {}): Promise<GetMaintenanceRequestsResult> {
  const { search = '', status = 'all', priority = 'all', sortBy = 'createdAt', sortDir = 'asc', page = 1, pageSize = 20 } = params
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (status !== 'all') query.set('status', status)
  if (priority !== 'all') query.set('priority', priority)
  query.set('sortBy', sortBy)
  query.set('sortDir', sortDir)
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))

  return api.get<GetMaintenanceRequestsResult>(`/maintenance?${query.toString()}`)
}

/** All requests for a single tenant (used by TenantDetail's request list). */
export async function getMaintenanceRequestsByTenant(tenantId: string): Promise<MaintenanceRequest[]> {
  const { data } = await getMaintenanceRequests({ pageSize: 200 })
  return data.filter((request) => request.tenantId === tenantId)
}

/** `GET /maintenance/:requestId`. */
export async function getMaintenanceRequest(requestId: string): Promise<MaintenanceRequest> {
  return api.get<MaintenanceRequest>(`/maintenance/${requestId}`)
}

export interface UpdateMaintenanceRequestInput {
  status?: MaintenanceStatus
  priority?: MaintenancePriority
  notes?: string
  resolvedAt?: string | null
}

/** `PATCH /maintenance/:requestId`. */
export async function updateMaintenanceRequest(
  requestId: string,
  updates: UpdateMaintenanceRequestInput,
): Promise<MaintenanceRequest | undefined> {
  return api.patch<MaintenanceRequest>(`/maintenance/${requestId}`, updates)
}

/** `DELETE /maintenance/:requestId` — server permits deletion only while open. */
export async function deleteMaintenanceRequest(requestId: string): Promise<void> {
  await api.delete<{ success: boolean }>(`/maintenance/${requestId}`)
}
