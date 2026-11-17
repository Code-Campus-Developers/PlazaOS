import { api } from '../../../lib/api'
import type { Unit, UnitStatus } from '../data/types'

export type UnitSortField = 'unitNumber' | 'floor' | 'sizeSqft' | 'monthlyRent' | 'status'
export type SortDirection = 'asc' | 'desc'

export interface GetUnitsParams {
  search?: string
  status?: 'all' | UnitStatus
  // Unit.floor is stored as a string (mock floors are "1", "2", "3"), so the
  // filter value matches that rather than a number.
  floor?: 'all' | string
  sortBy?: UnitSortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

export interface GetUnitsResult {
  data: Unit[]
  total: number
  page: number
  pageSize: number
}

/**
 * The only function that reads/searches/filters/sorts/paginates the units
 * collection — every other file gets units through this. Calls
 * `GET /units?search=&status=&floor=&sortBy=&sortDir=&page=&pageSize=`.
 */
export async function getUnits(params: GetUnitsParams = {}): Promise<GetUnitsResult> {
  const { search = '', status = 'all', floor = 'all', sortBy = 'unitNumber', sortDir = 'asc', page = 1, pageSize = 20 } = params
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (status !== 'all') query.set('status', status)
  if (floor !== 'all') query.set('floor', floor)
  query.set('sortBy', sortBy)
  query.set('sortDir', sortDir)
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))

  return api.get<GetUnitsResult>(`/units?${query.toString()}`)
}

/** All distinct floor values currently in the collection, for the floor filter. */
export async function getAvailableFloors(): Promise<string[]> {
  return api.get<string[]>('/units/floors')
}

/** `GET /units/:unitId`. */
export async function getUnit(unitId: string): Promise<Unit> {
  return api.get<Unit>(`/units/${unitId}`)
}

/** `DELETE /units/:unitId` — server rejects occupied or historically linked units. */
export async function deleteUnit(unitId: string): Promise<void> {
  await api.delete<{ success: boolean }>(`/units/${unitId}`)
}

export interface AddUnitInput {
  unitNumber: string
  floor: string
  sizeSqft: number
  monthlyRent: number
  status: UnitStatus
}

/** `POST /units`. */
export async function addUnit(input: AddUnitInput): Promise<Unit> {
  const result = await api.post<{ success: boolean; id: string }>('/units', input)
  return { id: result.id, ...input }
}

export interface UpdateUnitInput {
  floor?: string
  sizeSqft?: number
  monthlyRent?: number
  status?: UnitStatus
  // `null` explicitly unassigns the tenant — see PATCH /units/:unitId's
  // "explicit unassign step" rule in BACKEND_BUILD_PLAN.md §5.
  tenantId?: string | null
  tenantName?: string | null
}

/** `PATCH /units/:unitId`. */
export async function updateUnit(unitId: string, updates: UpdateUnitInput): Promise<Unit | undefined> {
  return api.patch<Unit>(`/units/${unitId}`, updates)
}
