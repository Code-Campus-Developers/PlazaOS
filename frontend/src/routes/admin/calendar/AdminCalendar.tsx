import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, StatusBadge, Table, Text } from '../../../components'
import type { TableColumn } from '../../../components'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { useAsyncData } from '../components/useAsyncData'
import type { CalendarEvent, CalendarEventType } from '../data/types'
import { getCalendarEvents, type GetCalendarEventsResult, type SortDirection } from './data'

const PAGE_SIZE = 20

const typeLabel: Record<CalendarEventType, string> = {
  lease_renewal: 'Lease renewal',
  reminder: 'Reminder',
  rent_due: 'Rent due',
  meeting: 'Meeting',
  inspection: 'Inspection',
  eviction: 'Eviction',
  other: 'Other',
}

const typeVariant: Record<CalendarEventType, 'info' | 'warning' | 'success' | 'danger'> = {
  lease_renewal: 'info',
  reminder: 'warning',
  rent_due: 'danger',
  meeting: 'info',
  inspection: 'warning',
  eviction: 'danger',
  other: 'success',
}

const typeOptions: { value: 'all' | CalendarEventType; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'lease_renewal', label: 'Lease renewal' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'rent_due', label: 'Rent due' },
]

// NOTE: same reasoning as Units/Tenants/Maintenance — the shared Table
// sorts its `data` prop client-side with fully internal state, so it's
// only correct for one page of rows. Columns aren't marked sortable; the
// sort-direction control below drives getCalendarEvents() and the URL
// instead. There's only one sortable field (date), so there's no separate
// "Sort by" field picker here — just the direction toggle.
const columns: TableColumn<CalendarEvent>[] = [
  { key: 'date', header: 'Date' },
  { key: 'title', header: 'Event' },
  { key: 'relatedLabel', header: 'Related to', render: (event) => event.relatedLabel ?? '—' },
  {
    key: 'type',
    header: 'Type',
    render: (event) => <StatusBadge variant={typeVariant[event.type]} label={typeLabel[event.type]} />,
  },
]

// Fetches events from GET /calendar (see getCalendarEvents() in ./data.ts).
export function AdminCalendar() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const type = (searchParams.get('type') as 'all' | CalendarEventType | null) ?? 'all'
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo = searchParams.get('dateTo') ?? ''
  const sortDir = (searchParams.get('sortDir') as SortDirection | null) ?? 'asc'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const { data: result } = useAsyncData<GetCalendarEventsResult>(
    () => getCalendarEvents({ search, type, dateFrom, dateTo, sortDir, page, pageSize: PAGE_SIZE }),
    [search, type, dateFrom, dateTo, sortDir, page],
    { data: [], total: 0, page, pageSize: PAGE_SIZE },
  )
  const { data, total, pageSize } = result

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
        title="Calendar"
        description="Lease renewals, reminders, and other plaza events."
        action={<Button onClick={() => navigate('/admin/calendar/new')}>Add Event</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            label="Search"
            placeholder="Search by event title"
            value={search}
            onChange={(event) => updateParams({ search: event.target.value || null })}
          />
        </div>
        <div className="w-44">
          <Select
            label="Type"
            value={type}
            onChange={(event) => updateParams({ type: event.target.value === 'all' ? null : event.target.value })}
            options={typeOptions}
          />
        </div>
        <div className="w-40">
          <Input
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => updateParams({ dateFrom: event.target.value || null })}
          />
        </div>
        <div className="w-40">
          <Input label="To" type="date" value={dateTo} onChange={(event) => updateParams({ dateTo: event.target.value || null })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-slate-900">Sort by date</span>
          <Button variant="secondary" onClick={() => updateParams({ sortDir: sortDir === 'asc' ? 'desc' : null })}>
            {sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
          </Button>
        </div>
      </div>

      <Table columns={columns} data={data} getRowKey={(event) => event.id} emptyMessage="No events match these filters" />

      <div className="mt-4 flex items-center justify-between">
        <Text variant="bodySmall" className="text-slate-500">
          Showing {rangeStart}–{rangeEnd} of {total} events
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
