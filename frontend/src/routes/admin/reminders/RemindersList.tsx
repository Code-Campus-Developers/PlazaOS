import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, StatusBadge, Table, Text } from '../../../components'
import type { TableColumn } from '../../../components'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { useAsyncData } from '../components/useAsyncData'
import type { Reminder, ReminderStatus, ReminderType } from '../data/types'
import { cancelReminder, getReminders, type GetRemindersResult, type ReminderSortField, type SortDirection } from './data'

const PAGE_SIZE = 20

const statusLabel: Record<ReminderStatus, string> = {
  scheduled: 'Scheduled',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const statusVariant: Record<ReminderStatus, 'info' | 'success' | 'danger' | 'warning'> = {
  scheduled: 'info',
  sent: 'success',
  failed: 'danger',
  cancelled: 'warning',
}

const typeLabel: Record<ReminderType, string> = {
  automatic: 'Automatic',
  manual: 'Manual',
}

const statusOptions: { value: 'all' | ReminderStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const typeOptions: { value: 'all' | ReminderType; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
]

const sortOptions: { value: ReminderSortField; label: string }[] = [
  { value: 'scheduledFor', label: 'Scheduled for' },
  { value: 'title', label: 'Reminder' },
  { value: 'status', label: 'Status' },
]

// NOTE: same reasoning as Units/Maintenance — the shared Table sorts its
// `data` prop client-side with fully internal state, so it's only correct
// for one page of rows. Columns aren't marked sortable; the "Sort by"
// control below drives getReminders() and the URL instead.
// Fetches reminders from GET /reminders (see getReminders() in ./data.ts).
export function RemindersList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState(false)

  const search = searchParams.get('search') ?? ''
  const status = (searchParams.get('status') as 'all' | ReminderStatus | null) ?? 'all'
  const type = (searchParams.get('type') as 'all' | ReminderType | null) ?? 'all'
  const sortBy = (searchParams.get('sortBy') as ReminderSortField | null) ?? 'scheduledFor'
  const sortDir = (searchParams.get('sortDir') as SortDirection | null) ?? 'asc'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const { data: result, error, loading, retry } = useAsyncData<GetRemindersResult>(
    () => getReminders({ search, status, type, sortBy, sortDir, page, pageSize: PAGE_SIZE }),
    [search, status, type, sortBy, sortDir, page],
    { data: [], total: 0, page, pageSize: PAGE_SIZE },
    'reminders',
  )
  const { data, total, pageSize } = result

  useEffect(() => {
    for (const reminder of data) {
      queryClient.setQueryData(['admin-reminder', reminder.id], reminder)
    }
  }, [data, queryClient])

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

  async function handleCancel(reminder: Reminder) {
    if (!window.confirm(`Cancel the scheduled reminder “${reminder.title}”? It will remain in reminder history.`)) return
    setCancellingId(reminder.id)
    setCancelError(false)
    try {
      await cancelReminder(reminder.id)
      if (status !== 'all' && status !== 'cancelled' && data.length === 1 && page > 1) {
        goToPage(page - 1)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'reminders'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-calendar'] }),
      ])
    } catch {
      setCancelError(true)
    } finally {
      setCancellingId(null)
    }
  }

  const columns: TableColumn<Reminder>[] = [
    {
      key: 'title',
      header: 'Reminder',
      render: (reminder) => (
        <Link to={`/admin/reminders/${reminder.id}`} className="font-medium text-primary hover:text-primary-light">
          {reminder.title}
        </Link>
      ),
    },
    { key: 'targetLabel', header: 'Target' },
    { key: 'type', header: 'Type', render: (reminder) => typeLabel[reminder.type] },
    { key: 'scheduledFor', header: 'Scheduled for' },
    {
      key: 'status',
      header: 'Status',
      render: (reminder) => <StatusBadge variant={statusVariant[reminder.status]} label={statusLabel[reminder.status]} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (reminder) =>
        reminder.status === 'scheduled' ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => handleCancel(reminder)}
            disabled={cancellingId !== null}
          >
            {cancellingId === reminder.id ? 'Cancelling…' : 'Cancel'}
          </Button>
        ) : (
          <Text variant="bodySmall" className="text-slate-400">—</Text>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Reminders"
        description="Automatic reminders sent by the backend, plus any manual reminders you've sent."
        action={<Button onClick={() => navigate('/admin/reminders/new')}>New reminder</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            label="Search"
            placeholder="Search by reminder or target"
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
        <div className="w-40">
          <Select
            label="Type"
            value={type}
            onChange={(event) => updateParams({ type: event.target.value === 'all' ? null : event.target.value })}
            options={typeOptions}
          />
        </div>
        <div className="w-44">
          <Select
            label="Sort by"
            value={sortBy}
            onChange={(event) => updateParams({ sortBy: event.target.value === 'scheduledFor' ? null : event.target.value })}
            options={sortOptions}
          />
        </div>
        <Button variant="secondary" onClick={() => updateParams({ sortDir: sortDir === 'asc' ? 'desc' : null })}>
          {sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-lg border border-danger/20 bg-danger/5 p-4">
          <Text variant="bodySmall" className="text-danger">Unable to load reminders from the server.</Text>
          <Button variant="secondary" onClick={retry}>Retry</Button>
        </div>
      ) : loading ? (
        <Text variant="body">Loading reminders…</Text>
      ) : (
        <Table columns={columns} data={data} getRowKey={(reminder) => reminder.id} emptyMessage="No reminders match these filters" />
      )}
      {cancelError ? <p role="alert" className="mt-3 text-[13px] text-danger">Unable to cancel this reminder. It may no longer be scheduled.</p> : null}

      <div className="mt-4 flex items-center justify-between">
        <Text variant="bodySmall" className="text-slate-500">
          Showing {rangeStart}–{rangeEnd} of {total} reminders
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
