import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, StatusBadge, Table, Text } from '../../components'
import type { TableColumn } from '../../components'
import { useProfile } from '../../hooks/useProfile'
import { usePayments } from '../../hooks/usePayments'
import { useMaintenance } from '../../hooks/useMaintenance'
import { useAnnouncements } from '../../hooks/useAnnouncements'
import { useNotifications } from '../../hooks/useNotifications'
import type { Payment } from '../../lib/services/paymentService'
import type { MaintenanceRequest } from '../../lib/services/maintenanceService'
import { formatNaira } from '../../lib/formatNaira'

const paymentColumns: TableColumn<Payment>[] = [
  { key: 'date', header: 'Date' },
  { key: 'amount', header: 'Amount' },
]

const maintenanceColumns: TableColumn<MaintenanceRequest>[] = [
  { key: 'title', header: 'Title' },
  { key: 'status', header: 'Status' },
]

export function TenantHome() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const payments = usePayments()
  const maintenance = useMaintenance()
  const announcements = useAnnouncements()
  const notifications = useNotifications()

  const recentPayments = payments.data?.data.slice(0, 3) ?? []
  const recentMaintenance = maintenance.data?.data.slice(0, 3) ?? []
  const latestAnnouncements = announcements.data?.data.slice(0, 3) ?? []
  const notificationsList = notifications.data ?? []

  const paymentSummary = useMemo(() => {
    const rows = payments.data?.data ?? []
    const summary = { paid: 0, pending: 0, failed: 0, refunded: 0 }
    for (const p of rows) {
      summary[p.status] += 1
    }
    return summary
  }, [payments.data])

  // Next due date and balance are derived from pending/failed payments —
  // there's no dedicated "next due"/"balance" API field yet.
  const nextDue = useMemo(() => {
    const rows = payments.data?.data ?? []
    const pending = rows.filter((p) => p.status === 'pending').sort((a, b) => a.date.localeCompare(b.date))
    return pending[0]?.date
  }, [payments.data])

  const balance = useMemo(() => {
    const rows = payments.data?.data ?? []
    // A refunded payment's amount is owed again — the gateway returned the
    // money and the rent charge went back to being due.
    return rows
      .filter((p) => p.status === 'pending' || p.status === 'failed' || p.status === 'refunded')
      .reduce((sum, p) => sum + p.amount, 0)
  }, [payments.data])

  return (
    <div className="page-container">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Text variant="h1">Welcome back, {profile?.name ?? 'Tenant'}</Text>
          <Text variant="body" className="mt-1 text-slate-500">
            {profile?.unit} · Lease: {profile?.leaseStart ?? '—'} to {profile?.leaseEnd ?? '—'}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => navigate('/tenant/payments')}>Pay Rent</Button>
          <Button variant="secondary" onClick={() => navigate('/tenant/maintenance/new')}>
            Submit Maintenance
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="stat-card stat-primary h-full">
          <Text variant="caption" className="text-slate-500">
            Rent Summary
          </Text>
          <div className="mt-3 flex flex-col gap-2">
            {payments.isError ? (
              <div className="flex items-center justify-between">
                <Text variant="bodySmall" className="text-danger">Failed to load payments summary.</Text>
                <Button variant="secondary" onClick={() => payments.refetch()}>Retry</Button>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <Text variant="body">Monthly rent</Text>
              <Text variant="body" className="font-semibold text-slate-900">
                {profile?.monthlyRent != null ? formatNaira(profile.monthlyRent) : '—'}
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text variant="body">Next due</Text>
              <Text variant="body" className="font-semibold text-slate-900">
                {nextDue ?? '—'}
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text variant="body">Balance</Text>
              <Text variant="body" className="font-semibold text-danger">
                {formatNaira(balance)}
              </Text>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-100 pt-3">
              <div>
                <Text variant="caption">Paid</Text>
                <Text variant="h3" className="text-success">{paymentSummary.paid}</Text>
              </div>
              <div>
                <Text variant="caption">Pending</Text>
                <Text variant="h3" className="text-warning">{paymentSummary.pending}</Text>
              </div>
              <div>
                <Text variant="caption">Failed</Text>
                <Text variant="h3" className="text-danger">{paymentSummary.failed}</Text>
              </div>
              <div>
                <Text variant="caption">Refunded</Text>
                <Text variant="h3" className="text-slate-600">{paymentSummary.refunded}</Text>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <Text variant="h3">Recent payments</Text>
          <div className="mt-3">
            {payments.isError ? (
              <div className="flex items-center justify-between">
                <Text variant="bodySmall" className="text-danger">Failed to load recent payments.</Text>
                <Button variant="secondary" onClick={() => payments.refetch()}>Retry</Button>
              </div>
            ) : (
              <Table
                columns={paymentColumns}
                data={recentPayments}
                getRowKey={(r) => r.id}
              />
            )}
          </div>
        </Card>

        <Card>
          <Text variant="h3">Recent maintenance</Text>
          <div className="mt-3">
            {maintenance.isError ? (
              <div className="flex items-center justify-between">
                <Text variant="bodySmall" className="text-danger">Failed to load maintenance.</Text>
                <Button variant="secondary" onClick={() => maintenance.refetch()}>Retry</Button>
              </div>
            ) : (
              <Table
                columns={maintenanceColumns}
                data={recentMaintenance}
                getRowKey={(r) => r.id}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="h-full">
          <Text variant="h3">Announcements</Text>
          <div className="mt-3 space-y-3">
            {announcements.isError ? (
              <div className="flex items-center justify-between">
                <Text variant="bodySmall" className="text-danger">Failed to load announcements.</Text>
                <Button variant="secondary" onClick={() => announcements.refetch()}>Retry</Button>
              </div>
            ) : (
              latestAnnouncements.map((a) => (
                <div key={a.id} className="flex flex-col gap-3 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Text variant="h3" className="truncate">{a.title}</Text>
                    <Text variant="bodySmall" className="mt-1 text-slate-500">
                      {a.body}
                    </Text>
                  </div>
                  {a.important ? <StatusBadge variant="warning" label="Important" dot /> : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="h-full">
          <Text variant="h3">Notifications</Text>
          <div className="mt-3 space-y-3">
            {notificationsList.slice(0, 5).map((n) => (
              <div key={n.id} className={`flex flex-col gap-2 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between ${n.read ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <Text variant="body" className="truncate">{n.title}</Text>
                  <Text variant="bodySmall" className="text-slate-500">{n.date}</Text>
                </div>
                <div className="text-xs text-slate-500">{n.type}</div>
              </div>
            ))}
            {notificationsList.length === 0 ? (
              <Text variant="bodySmall" className="text-slate-500">No notifications</Text>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  )
}
