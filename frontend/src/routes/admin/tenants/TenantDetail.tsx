import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, Input, StatusBadge, Table, Text } from '../../../components'
import type { TableColumn } from '../../../components'
import { BackLink } from '../components/BackLink'
import { DetailField } from '../components/DetailField'
import { PageHeader } from '../components/PageHeader'
import { getMaintenanceRequestsByTenant } from '../maintenance/data'
import { getPaymentsByTenant } from '../payments/data'
import type { AccountStatus, MaintenanceRequest, Payment, RentStatus, Tenant, TenantStatus } from '../data/types'
import { getTenant, resetTenantPassword, updateTenant, type InvitationResult } from './data'
import { InvitationNotice } from './InvitationNotice'
import { formatNaira } from '../../../lib/formatNaira'

const rentStatusLabel: Record<RentStatus, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
}

const rentStatusVariant: Record<RentStatus, 'success' | 'warning' | 'danger'> = {
  paid: 'success',
  due: 'warning',
  overdue: 'danger',
}

const leaseStatusLabel: Record<TenantStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
}

const leaseStatusVariant: Record<TenantStatus, 'success' | 'danger'> = {
  active: 'success',
  inactive: 'danger',
}

const accountStatusLabel: Record<AccountStatus, string> = {
  pending: 'Invitation pending',
  temporary: 'Temporary password',
  active: 'Active',
}

const accountStatusVariant: Record<AccountStatus, 'warning' | 'success'> = {
  pending: 'warning',
  temporary: 'warning',
  active: 'success',
}

const paymentColumns: TableColumn<Payment>[] = [
  {
    key: 'date',
    header: 'Date',
    sortable: true,
    render: (payment) => (
      <Link to={`/admin/payments/${payment.id}`} className="font-medium text-primary hover:text-primary-light">
        {payment.date}
      </Link>
    ),
  },
  { key: 'amount', header: 'Amount', render: (payment) => formatNaira(payment.amount) },
  {
    key: 'status',
    header: 'Status',
    render: (payment) => (
      <StatusBadge
        variant={payment.status === 'paid' ? 'success' : payment.status === 'pending' ? 'warning' : 'danger'}
        label={payment.status === 'paid' ? 'Paid' : payment.status === 'pending' ? 'Pending' : 'Failed'}
      />
    ),
  },
]

const maintenanceColumns: TableColumn<MaintenanceRequest>[] = [
  {
    key: 'title',
    header: 'Request',
    render: (request) => (
      <Link to={`/admin/maintenance/${request.id}`} className="font-medium text-primary hover:text-primary-light">
        {request.title}
      </Link>
    ),
  },
  { key: 'createdAt', header: 'Submitted', sortable: true },
  {
    key: 'status',
    header: 'Status',
    render: (request) => (
      <StatusBadge
        variant={request.status === 'resolved' ? 'success' : request.status === 'in_progress' ? 'warning' : 'danger'}
        label={request.status === 'resolved' ? 'Resolved' : request.status === 'in_progress' ? 'In progress' : 'Open'}
      />
    ),
  },
]

// Fetches this tenant from GET /tenants/:tenantId and saves via PATCH — see
// getTenant()/updateTenant() in ./data.ts. `rentStatus` is read-only here
// (derived server-side from RentCharge state, never client-settable).
export function TenantDetail() {
  const queryClient = useQueryClient()
  const { tenantId } = useParams<{ tenantId: string }>()
  const [tenant, setTenant] = useState<Tenant | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<Payment[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([])
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [statusError, setStatusError] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const [leaseEnd, setLeaseEnd] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingInvitation, setIsSendingInvitation] = useState(false)
  const [invitation, setInvitation] = useState<InvitationResult | null>(null)
  const [invitationError, setInvitationError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    const tenantKey = ['admin-tenant', tenantId]
    const paymentsKey = ['admin-tenant-payments', tenantId]
    const maintenanceKey = ['admin-tenant-maintenance', tenantId]
    const cachedTenant = queryClient.getQueryData<Tenant>(tenantKey)
    const cachedPayments = queryClient.getQueryData<Payment[]>(paymentsKey)
    const cachedMaintenance = queryClient.getQueryData<MaintenanceRequest[]>(maintenanceKey)
    const hasCachedHistory =
      cachedTenant !== undefined && cachedPayments !== undefined && cachedMaintenance !== undefined
    if (cachedTenant) {
      setTenant(cachedTenant)
      setLeaseEnd(cachedTenant.leaseEnd)
      setMonthlyRent(String(cachedTenant.monthlyRent))
    }
    if (cachedPayments) setPayments(cachedPayments)
    if (cachedMaintenance) setMaintenance(cachedMaintenance)
    setLoading(!hasCachedHistory)
    setLoadError(false)
    Promise.all([
      queryClient.fetchQuery({
        queryKey: tenantKey,
        queryFn: () => getTenant(tenantId),
        staleTime: 30_000,
        retry: false,
      }),
      queryClient.fetchQuery({
        queryKey: paymentsKey,
        queryFn: () => getPaymentsByTenant(tenantId),
        staleTime: 30_000,
        retry: false,
      }),
      queryClient.fetchQuery({
        queryKey: maintenanceKey,
        queryFn: () => getMaintenanceRequestsByTenant(tenantId),
        staleTime: 30_000,
        retry: false,
      }),
    ])
      .then(([found, tenantPayments, tenantMaintenance]) => {
        if (cancelled) return
        setTenant(found)
        setPayments(tenantPayments)
        setMaintenance(tenantMaintenance)
        if (found) {
          setLeaseEnd(found.leaseEnd)
          setMonthlyRent(String(found.monthlyRent))
        }
      })
      .catch(() => {
        if (!cancelled && !hasCachedHistory) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled && !hasCachedHistory) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryClient, tenantId])

  useEffect(() => {
    for (const payment of payments) {
      queryClient.setQueryData(['admin-payment', payment.id], payment)
    }
    for (const request of maintenance) {
      queryClient.setQueryData(['admin-maintenance-request', request.id], request)
    }
  }, [maintenance, payments, queryClient])

  if (loading) {
    return (
      <div>
        <BackLink to="/admin/tenants" label="Back to tenants" />
        <Text variant="body">Loading…</Text>
      </div>
    )
  }

  if (loadError || !tenant) {
    return (
      <div>
        <BackLink to="/admin/tenants" label="Back to tenants" />
        <Text variant="body">{loadError ? 'Unable to load this tenant and their history from the server.' : 'Tenant not found.'}</Text>
      </div>
    )
  }

  const currentTenant = tenant

  const hasChanges = leaseEnd !== currentTenant.leaseEnd || Number(monthlyRent) !== currentTenant.monthlyRent

  async function handleSave() {
    setIsSaving(true)
    setSaveError(false)
    try {
      const updated = await updateTenant(currentTenant.id, {
        leaseEnd,
        monthlyRent: Number(monthlyRent),
      })
      if (updated) {
        setTenant(updated)
        queryClient.setQueryData(['admin-tenant', currentTenant.id], updated)
        void queryClient.invalidateQueries({ queryKey: ['admin-page', 'tenants'] })
        void queryClient.invalidateQueries({ queryKey: ['admin-page', 'calendar'] })
        void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] })
      }
    } catch {
      setSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSendInvitation() {
    setIsSendingInvitation(true)
    setInvitationError(null)
    try {
      const result = await resetTenantPassword(currentTenant.id)
      const updated = { ...currentTenant, accountStatus: 'pending' as const, mustChangePassword: true }
      setTenant(updated)
      queryClient.setQueryData(['admin-tenant', currentTenant.id], updated)
      setInvitation(result.invitation)
    } catch (error) {
      setInvitationError(error instanceof Error ? error.message : 'Unable to send the invitation. Please try again.')
    } finally {
      setIsSendingInvitation(false)
    }
  }

  async function handleToggleStatus() {
    const nextStatus: TenantStatus = currentTenant.status === 'active' ? 'inactive' : 'active'
    const action = nextStatus === 'inactive' ? 'deactivate' : 'reactivate'
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${currentTenant.name}'s account? ${action === 'deactivate' ? 'They will no longer be able to sign in, and their lease and history will be kept.' : 'They will be able to sign in again.'}`)) {
      return
    }
    setIsUpdatingStatus(true)
    setStatusError(false)
    try {
      const updated = await updateTenant(currentTenant.id, { status: nextStatus })
      if (updated) {
        setTenant(updated)
        queryClient.setQueryData(['admin-tenant', currentTenant.id], updated)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'tenants'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] }),
      ])
    } catch {
      setStatusError(true)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const tenantPayments = payments
  const tenantMaintenance = maintenance


  return (
    <div>
      <BackLink to="/admin/tenants" label="Back to tenants" />
      <PageHeader
        title={currentTenant.name}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge variant={leaseStatusVariant[currentTenant.status]} label={leaseStatusLabel[currentTenant.status]} />
            <Button
              type="button"
              variant={currentTenant.status === 'active' ? 'destructive' : 'secondary'}
              onClick={handleToggleStatus}
              disabled={isUpdatingStatus || isSaving}
            >
              {isUpdatingStatus ? 'Updating…' : currentTenant.status === 'active' ? 'Deactivate tenant' : 'Reactivate tenant'}
            </Button>
          </div>
        }
      />
      {statusError ? <p role="alert" className="mb-4 text-[13px] text-danger">Unable to update this tenant’s status. Please try again.</p> : null}

      <Card className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <DetailField label="Unit">
          <Link to={`/admin/units/${currentTenant.unitId}`} className="text-primary hover:text-primary-light">
            {currentTenant.unitNumber}
          </Link>
        </DetailField>
        <DetailField label="Email">{currentTenant.email}</DetailField>
        <DetailField label="Phone">{currentTenant.phone}</DetailField>
        <DetailField label="Lease start">{currentTenant.leaseStart}</DetailField>
        <Input label="Lease end" type="date" value={leaseEnd} onChange={(event) => setLeaseEnd(event.target.value)} />
        <Input
          label="Yearly rent"
          type="number"
          min="0"
          step="0.01"
          value={monthlyRent}
          onChange={(event) => setMonthlyRent(event.target.value)}
        />
        <DetailField label="Rent status">
          <StatusBadge variant={rentStatusVariant[currentTenant.rentStatus]} label={rentStatusLabel[currentTenant.rentStatus]} />
        </DetailField>
        <div className="flex items-end">
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
        {saveError ? <p role="alert" className="text-[13px] text-danger">Unable to save tenant changes. Please try again.</p> : null}
      </Card>

      <Card className="mb-6">
        <Text variant="h3" className="mb-3">
          Account
        </Text>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <DetailField label="Status">
            <StatusBadge
              variant={accountStatusVariant[currentTenant.accountStatus]}
              label={accountStatusLabel[currentTenant.accountStatus]}
            />
          </DetailField>
          <Button variant="secondary" onClick={handleSendInvitation} disabled={isSendingInvitation}>
            {isSendingInvitation ? 'Sending…' : 'Send setup invitation'}
          </Button>
        </div>
        {invitationError ? (
          <div className="mt-4">
            <Text variant="bodySmall" className="text-danger">
              {invitationError}
            </Text>
          </div>
        ) : null}
        {invitation ? (
          <div className="mt-4">
            <InvitationNotice email={currentTenant.email} invitation={invitation} resent />
          </div>
        ) : null}
      </Card>

      <div className="mb-6">
        <Text variant="h3" className="mb-3">
          Payment history
        </Text>
        <Table columns={paymentColumns} data={tenantPayments} getRowKey={(payment) => payment.id} emptyMessage="No payments recorded" />
      </div>

      <div>
        <Text variant="h3" className="mb-3">
          Maintenance requests
        </Text>
        <Table
          columns={maintenanceColumns}
          data={tenantMaintenance}
          getRowKey={(request) => request.id}
          emptyMessage="No maintenance requests"
        />
      </div>
    </div>
  )
}
