import { Button, Card, StatusBadge, Table, Text } from '../../components'
import type { TableColumn } from '../../components'
import { useCalendar } from '../../hooks/useCalendar'
import type { CalendarEvent, CalendarEventType } from '../../lib/services/calendarService'

const typeLabel: Record<CalendarEventType, string> = {
  rent_due: 'Rent due',
  reminder: 'Reminder',
  lease_renewal: 'Lease renewal',
  meeting: 'Meeting',
  inspection: 'Inspection',
  eviction: 'Eviction',
  other: 'Other',
}

const typeVariant: Record<CalendarEventType, 'danger' | 'warning' | 'info' | 'success'> = {
  rent_due: 'danger',
  reminder: 'warning',
  lease_renewal: 'info',
  meeting: 'info',
  inspection: 'warning',
  eviction: 'danger',
  other: 'success',
}

const columns: TableColumn<CalendarEvent>[] = [
  { key: 'date', header: 'Date' },
  { key: 'title', header: 'Event' },
  {
    key: 'type',
    header: 'Type',
    render: (event) => <StatusBadge variant={typeVariant[event.type]} label={typeLabel[event.type]} />,
  },
]

export function Calendar() {
  const { data, isLoading, isError, refetch } = useCalendar()

  return (
    <div>
      <Text variant="h1" className="mb-4">
        Calendar
      </Text>
      <Card>
        {isLoading ? (
          <Text variant="body">Loading…</Text>
        ) : isError ? (
          <div className="flex items-center justify-between">
            <Text variant="bodySmall" className="text-danger">
              Failed to load your calendar.
            </Text>
            <Button variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <Table columns={columns} data={data ?? []} getRowKey={(event) => event.id} emptyMessage="No upcoming events" />
        )}
      </Card>
    </div>
  )
}
