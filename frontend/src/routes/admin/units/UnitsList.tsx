import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, StatusBadge, Table, Text } from '../../../components'
import type { TableColumn } from '../../../components'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { useAsyncData } from '../components/useAsyncData'
import type { Unit, UnitStatus } from '../data/types'
import { getAvailableFloors, getUnits, type GetUnitsResult, type SortDirection, type UnitSortField } from './data'
import { formatNaira } from '../../../lib/formatNaira'

const PAGE_SIZE = 20

const statusLabel: Record<UnitStatus, string> = {
  occupied: 'Occupied',
  vacant: 'Vacant',
  maintenance: 'Under maintenance',
}

const statusVariant: Record<UnitStatus, 'success' | 'warning' | 'danger'> = {
  occupied: 'success',
  vacant: 'warning',
  maintenance: 'danger',
}

const statusOptions: { value: 'all' | UnitStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'vacant', label: 'Vacant' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Under maintenance' },
]

const sortOptions: { value: UnitSortField; label: string }[] = [
  { value: 'unitNumber', label: 'Unit number' },
  { value: 'floor', label: 'Floor' },
  { value: 'sizeSqft', label: 'Size' },
  { value: 'monthlyRent', label: 'Monthly rent' },
  { value: 'status', label: 'Status' },
]

// NOTE: the shared Table component sorts whatever `data` it's given, purely
// client-side, with its own internal state — it has no way to report a sort
// change back out. That's fine for a single page of rows, but wrong once
// rows are paginated (clicking a header would only reorder the 20 rows
// already on screen, not the full collection, and wouldn't survive a
// refresh). So columns here aren't marked sortable; sorting is driven by the
// "Sort by" control below instead, which flows through getUnits() and the URL.
const columns: TableColumn<Unit>[] = [
  {
    key: 'unitNumber',
    header: 'Unit',
    render: (unit) => (
      <Link to={`/admin/units/${unit.id}`} className="font-medium text-primary hover:text-primary-light">
        {unit.unitNumber}
      </Link>
    ),
  },
  { key: 'floor', header: 'Floor' },
  { key: 'sizeSqft', header: 'Size', render: (unit) => `${unit.sizeSqft} sqft` },
  { key: 'monthlyRent', header: 'Monthly rent', render: (unit) => formatNaira(unit.monthlyRent) },
  { key: 'tenantName', header: 'Tenant', render: (unit) => unit.tenantName ?? '—' },
  {
    key: 'status',
    header: 'Status',
    render: (unit) => <StatusBadge variant={statusVariant[unit.status]} label={statusLabel[unit.status]} />,
  },
]

// Fetches units from GET /units (see getUnits() in ./data.ts).
export function UnitsList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const status = (searchParams.get('status') as 'all' | UnitStatus | null) ?? 'all'
  const floor = searchParams.get('floor') ?? 'all'
  const sortBy = (searchParams.get('sortBy') as UnitSortField | null) ?? 'unitNumber'
  const sortDir = (searchParams.get('sortDir') as SortDirection | null) ?? 'asc'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const { data: result } = useAsyncData<GetUnitsResult>(
    () => getUnits({ search, status, floor, sortBy, sortDir, page, pageSize: PAGE_SIZE }),
    [search, status, floor, sortBy, sortDir, page],
    { data: [], total: 0, page, pageSize: PAGE_SIZE },
  )
  const { data, total, pageSize } = result
  const { data: floors } = useAsyncData<string[]>(() => getAvailableFloors(), [], [])
  const floorOptions = [{ value: 'all', label: 'All floors' }, ...floors.map((f) => ({ value: f, label: `Floor ${f}` }))]

  // Any filter/sort change goes back to page 1; page navigation is handled separately below.
  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    }
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) {
      next.delete('page')
    } else {
      next.set('page', String(nextPage))
    }
    setSearchParams(next, { replace: true })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div>
      <PageHeader
        title="Units"
        description="All plaza units and their occupancy status."
        action={<Button onClick={() => navigate('/admin/units/new')}>Add Unit</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            label="Search"
            placeholder="Search by unit number"
            value={search}
            onChange={(event) => updateParams({ search: event.target.value || null })}
          />
        </div>
        <div className="w-44">
          <Select
            label="Status"
            value={status}
            onChange={(event) => updateParams({ status: event.target.value === 'all' ? null : event.target.value })}
            options={statusOptions}
          />
        </div>
        <div className="w-36">
          <Select
            label="Floor"
            value={floor}
            onChange={(event) => updateParams({ floor: event.target.value === 'all' ? null : event.target.value })}
            options={floorOptions}
          />
        </div>
        <div className="w-44">
          <Select
            label="Sort by"
            value={sortBy}
            onChange={(event) => updateParams({ sortBy: event.target.value === 'unitNumber' ? null : event.target.value })}
            options={sortOptions}
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => updateParams({ sortDir: sortDir === 'asc' ? 'desc' : null })}
        >
          {sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
        </Button>
      </div>

      <Table columns={columns} data={data} getRowKey={(unit) => unit.id} emptyMessage="No units match these filters" />

      <div className="mt-4 flex items-center justify-between">
        <Text variant="bodySmall" className="text-slate-500">
          Showing {rangeStart}–{rangeEnd} of {total} units
        </Text>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
            Previous
          </Button>
          <Text variant="bodySmall" className="text-slate-500">
            Page {page} of {totalPages}
          </Text>
          <Button variant="secondary" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
