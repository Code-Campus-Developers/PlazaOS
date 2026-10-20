import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, StatusBadge, Text } from '../../components'
import { PageHeader } from './components/PageHeader'
import { getCalendarEvents } from './calendar/data'
import { getMaintenanceRequests } from './maintenance/data'
import { getPayments } from './payments/data'
import { getTenants } from './tenants/data'
import { getUnits } from './units/data'
import type { CalendarEvent, Payment, PaymentStatus, Tenant, Unit } from './data/types'

const paymentStatusLabel: Record<PaymentStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
}

const paymentStatusVariant: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'danger',
  refunded: 'neutral',
}

// Summary stats are computed client-side from the existing list endpoints
// (each fetched with a large pageSize, per §4's small-dataset allowance)
// rather than a dedicated summary endpoint.
export function AdminDashboard() {
  const [units, setUnits] = useState<Unit[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [openMaintenanceCount, setOpenMaintenanceCount] = useState(0)
  const [recentPayments, setRecentPayments] = useState<Payment[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getUnits({ pageSize: 1000 }),
      getTenants({ pageSize: 1000 }),
      getMaintenanceRequests({ status: 'open', pageSize: 1 }),
      getPayments({ sortBy: 'date', sortDir: 'desc', pageSize: 4 }),
      getCalendarEvents({ sortDir: 'asc', pageSize: 4 }),
    ]).then(([unitsResult, tenantsResult, maintenanceResult, paymentsResult, calendarResult]) => {
      if (cancelled) return
      setUnits(unitsResult.data)
      setTenants(tenantsResult.data)
      setOpenMaintenanceCount(maintenanceResult.total)
      setRecentPayments(paymentsResult.data)
      setUpcomingEvents(calendarResult.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const totalUnits = units.length
  const occupiedUnits = units.filter((unit) => unit.status === 'occupied').length
  const vacantUnits = units.filter((unit) => unit.status === 'vacant').length
  const overdueTenants = tenants.filter((tenant) => tenant.rentStatus === 'overdue').length
  const activeTenants = tenants.filter((tenant) => tenant.status === 'active').length

  return (
    <div className="page-container">
      <PageHeader title="Dashboard" description="Plaza overview at a glance." />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card stat-primary">
          <Text variant="caption" className="text-slate-500">
            Units
          </Text>
          <Text variant="display" className="mt-1 text-slate-900">
            {totalUnits}
          </Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            {occupiedUnits} occupied · {vacantUnits} vacant
          </Text>
        </Card>
        <Card className="stat-card stat-info">
          <Text variant="caption" className="text-slate-500">
            Active tenants
          </Text>
          <Text variant="display" className="mt-1 text-slate-900">
            {activeTenants}
          </Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            of {tenants.length} total
          </Text>
        </Card>
        <Card className="stat-card stat-danger">
          <Text variant="caption" className="text-slate-500">
            Rent overdue
          </Text>
          <Text variant="display" className="mt-1 text-danger">
            {overdueTenants}
          </Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            tenant{overdueTenants === 1 ? '' : 's'} behind on rent
          </Text>
        </Card>
        <Card className="stat-card stat-warning">
          <Text variant="caption" className="text-slate-500">
            Open maintenance
          </Text>
          <Text variant="display" className="mt-1 text-slate-900">
            {openMaintenanceCount}
          </Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            request{openMaintenanceCount === 1 ? '' : 's'} awaiting action
          </Text>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          header={
            <>
              <Text variant="h3">Recent payments</Text>
              <Link to="/admin/payments" className="text-[13px] font-medium text-primary hover:text-primary-light">
                View all
              </Link>
            </>
          }
        >
          <div className="flex flex-col gap-1">
            {recentPayments.map((payment) => (
              <Link
                key={payment.id}
                to={`/admin/payments/${payment.id}`}
                className="flex items-center justify-between rounded-md px-3 py-2.5 transition-colors hover:bg-slate-50"
              >
                <div>
                  <Text variant="body" className="text-slate-900">
                    {payment.tenantName}
                  </Text>
                  <Text variant="caption" className="text-slate-500">
                    {payment.unitNumber} · {payment.date}
                  </Text>
                </div>
                <StatusBadge
                  variant={paymentStatusVariant[payment.status]}
                  label={paymentStatusLabel[payment.status]}
                  dot
                />
              </Link>
            ))}
          </div>
        </Card>

        <Card
          header={
            <>
              <Text variant="h3">Upcoming calendar</Text>
              <Link to="/admin/calendar" className="text-[13px] font-medium text-primary hover:text-primary-light">
                View calendar
              </Link>
            </>
          }
        >
          <div className="flex flex-col gap-1">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <Text variant="body" className="text-slate-900">
                    {event.title}
                  </Text>
                  {event.relatedLabel ? (
                    <Text variant="caption" className="text-slate-500">
                      {event.relatedLabel}
                    </Text>
                  ) : null}
                </div>
                <Text variant="bodySmall" className="text-slate-500">
                  {event.date}
                </Text>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
