import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button, Card, StatusBadge, Text } from '../../components'
import { PageHeader } from './components/PageHeader'
import { getCalendarEvents } from './calendar/data'
import { getPayments } from './payments/data'
import { getAdminDashboardSummary } from './dashboardData'
import type { CalendarEvent, Payment, PaymentStatus } from './data/types'

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

export function AdminDashboard() {
  const queryClient = useQueryClient()
  const summaryQuery = useQuery({
    queryKey: ['admin-dashboard-summary'],
    queryFn: getAdminDashboardSummary,
    staleTime: 30_000,
    retry: false,
  })
  const paymentsQuery = useQuery({
    queryKey: ['admin-dashboard-payments'],
    queryFn: () => getPayments({ sortBy: 'date', sortDir: 'desc', pageSize: 4 }),
    staleTime: 30_000,
    retry: false,
  })
  const calendarQuery = useQuery({
    queryKey: ['admin-dashboard-calendar'],
    queryFn: () => getCalendarEvents({ dateFrom: new Date().toISOString().slice(0, 10), sortDir: 'asc', pageSize: 4 }),
    staleTime: 30_000,
    retry: false,
  })

  const summary = summaryQuery.data
  const recentPayments: Payment[] = paymentsQuery.data?.data ?? []
  const upcomingEvents: CalendarEvent[] = calendarQuery.data?.data ?? []

  useEffect(() => {
    for (const payment of paymentsQuery.data?.data ?? []) {
      queryClient.setQueryData(['admin-payment', payment.id], payment)
    }
  }, [queryClient, paymentsQuery.data?.data])

  return (
    <div className="page-container">
      <PageHeader title="Dashboard" description="Plaza overview at a glance." />

      {summaryQuery.isError ? (
        <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-danger/20 bg-danger/5 p-4">
          <Text variant="bodySmall" className="text-danger">Unable to load dashboard figures from the server.</Text>
          <Button variant="secondary" onClick={() => void summaryQuery.refetch()}>Retry</Button>
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card stat-primary">
          <Text variant="caption" className="text-slate-500">Units</Text>
          <Text variant="display" className="mt-1 text-slate-900">{summary ? summary.totalUnits : summaryQuery.isLoading ? '…' : '—'}</Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            {summary ? `${summary.occupiedUnits} occupied · ${summary.vacantUnits} vacant` : ' '}
          </Text>
        </Card>
        <Card className="stat-card stat-info">
          <Text variant="caption" className="text-slate-500">Active tenants</Text>
          <Text variant="display" className="mt-1 text-slate-900">{summary ? summary.activeTenants : summaryQuery.isLoading ? '…' : '—'}</Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            {summary ? `of ${summary.totalTenants} total` : ' '}
          </Text>
        </Card>
        <Card className="stat-card stat-danger">
          <Text variant="caption" className="text-slate-500">Rent overdue</Text>
          <Text variant="display" className="mt-1 text-danger">{summary ? summary.overdueTenants : summaryQuery.isLoading ? '…' : '—'}</Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            {summary ? `tenant${summary.overdueTenants === 1 ? '' : 's'} behind on rent` : ' '}
          </Text>
        </Card>
        <Card className="stat-card stat-warning">
          <Text variant="caption" className="text-slate-500">Open maintenance</Text>
          <Text variant="display" className="mt-1 text-slate-900">{summary ? summary.openMaintenance : summaryQuery.isLoading ? '…' : '—'}</Text>
          <Text variant="bodySmall" className="mt-1 text-slate-500">
            {summary ? `request${summary.openMaintenance === 1 ? '' : 's'} awaiting action` : ' '}
          </Text>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          header={
            <>
              <Text variant="h3">Recent payments</Text>
              <Link to="/admin/payments" className="text-[13px] font-medium text-primary hover:text-primary-light">View all</Link>
            </>
          }
        >
          {paymentsQuery.isError ? (
            <div role="alert" className="flex items-center justify-between gap-3">
              <Text variant="bodySmall" className="text-danger">Unable to load recent payments.</Text>
              <Button variant="secondary" size="sm" onClick={() => void paymentsQuery.refetch()}>Retry</Button>
            </div>
          ) : paymentsQuery.isLoading ? (
            <Text variant="bodySmall" className="text-slate-500">Loading payments…</Text>
          ) : (
            <div className="flex flex-col gap-1">
              {recentPayments.map((payment) => (
                <Link
                  key={payment.id}
                  to={`/admin/payments/${payment.id}`}
                  className="flex items-center justify-between rounded-md px-3 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <div>
                    <Text variant="body" className="text-slate-900">{payment.tenantName}</Text>
                    <Text variant="caption" className="text-slate-500">{payment.unitNumber} · {payment.date}</Text>
                  </div>
                  <StatusBadge variant={paymentStatusVariant[payment.status]} label={paymentStatusLabel[payment.status]} dot />
                </Link>
              ))}
              {recentPayments.length === 0 ? <Text variant="bodySmall" className="text-slate-500">No payments found.</Text> : null}
            </div>
          )}
        </Card>

        <Card
          header={
            <>
              <Text variant="h3">Upcoming calendar</Text>
              <Link to="/admin/calendar" className="text-[13px] font-medium text-primary hover:text-primary-light">View calendar</Link>
            </>
          }
        >
          {calendarQuery.isError ? (
            <div role="alert" className="flex items-center justify-between gap-3">
              <Text variant="bodySmall" className="text-danger">Unable to load upcoming events.</Text>
              <Button variant="secondary" size="sm" onClick={() => void calendarQuery.refetch()}>Retry</Button>
            </div>
          ) : calendarQuery.isLoading ? (
            <Text variant="bodySmall" className="text-slate-500">Loading upcoming events…</Text>
          ) : (
            <div className="flex flex-col gap-1">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <Text variant="body" className="text-slate-900">{event.title}</Text>
                    {event.relatedLabel ? <Text variant="caption" className="text-slate-500">{event.relatedLabel}</Text> : null}
                  </div>
                  <Text variant="bodySmall" className="text-slate-500">{event.date}</Text>
                </div>
              ))}
              {upcomingEvents.length === 0 ? <Text variant="bodySmall" className="text-slate-500">No upcoming events.</Text> : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
