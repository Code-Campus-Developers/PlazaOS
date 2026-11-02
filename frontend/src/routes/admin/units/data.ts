import { api } from '../../../lib/api'
import { mockUnits } from '../data/mockData'
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

function compareUnits(a: Unit, b: Unit, sortBy: UnitSortField): number {
  switch (sortBy) {
    case 'sizeSqft':
      return a.sizeSqft - b.sizeSqft
    case 'monthlyRent':
      return a.monthlyRent - b.monthlyRent
    case 'floor':
      return a.floor.localeCompare(b.floor, undefined, { numeric: true })
    case 'status':
      return a.status.localeCompare(b.status)
    case 'unitNumber':
    default:
      return a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
  }
}

// Mirrors GET /units's own in-memory filter/sort/paginate logic — used only
// as a DEV-mode fallback (see getUnits()) when the backend isn't reachable.
function mockGetUnits(params: GetUnitsParams): GetUnitsResult {
  const { search = '', status = 'all', floor = 'all', sortBy = 'unitNumber', sortDir = 'asc', page = 1, pageSize = 20 } = params

  let filtered = mockUnits
  const query = search.trim().toLowerCase()
  if (query) filtered = filtered.filter((unit) => unit.unitNumber.toLowerCase().includes(query))
  if (status !== 'all') filtered = filtered.filter((unit) => unit.status === status)
  if (floor !== 'all') filtered = filtered.filter((unit) => unit.floor === floor)

  const sorted = [...filtered].sort((a, b) => {
    const comparison = compareUnits(a, b, sortBy)
    return sortDir === 'asc' ? comparison : -comparison
  })

  const total = sorted.length
  const start = (page - 1) * pageSize
  return { data: sorted.slice(start, start + pageSize), total, page, pageSize }
}

/**
 * The only function that reads/searches/filters/sorts/paginates the units
 * collection — every other file gets units through this. Calls
 * `GET /units?search=&status=&floor=&sortBy=&sortDir=&page=&pageSize=`; if the
 * backend isn't reachable in dev, falls back to the mock dataset so the UI
 * stays usable offline.
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

  try {
    return await api.get<GetUnitsResult>(`/units?${query.toString()}`)
  } catch (err) {
    if (!import.meta.env.DEV) throw err
    return mockGetUnits(params)
  }
}

/** All distinct floor values currently in the collection, for the floor filter. */
export async function getAvailableFloors(): Promise<string[]> {
  const { data } = await getUnits({ pageSize: 1000 })
  const floors = new Set(data.map((unit) => unit.floor))
  return Array.from(floors).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** `GET /units/:unitId` — falls back to the mock dataset in dev if unreachable. */
export async function getUnit(unitId: string): Promise<Unit | undefined> {
  try {
    return await api.get<Unit>(`/units/${unitId}`)
  } catch (err) {
    if (!import.meta.env.DEV) throw err
    return mockUnits.find((unit) => unit.id === unitId)
  }
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
  try {
    const result = await api.post<{ success: boolean; id: string }>('/units', input)
    return { id: result.id, ...input }
  } catch (err) {
    if (!import.meta.env.DEV) throw err
    const newUnit: Unit = { id: `unit-${Date.now()}`, ...input }
    mockUnits.push(newUnit)
    return newUnit
  }
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
  try {
    return await api.patch<Unit>(`/units/${unitId}`, updates)
  } catch (err) {
    if (!import.meta.env.DEV) throw err
    const unit = mockUnits.find((existing) => existing.id === unitId)
    if (!unit) return undefined
    Object.assign(unit, updates)
    return unit
  }
}

export async function deleteUnit(unitId: string): Promise<void> {
  await api.delete(`/units/${unitId}`)
}

