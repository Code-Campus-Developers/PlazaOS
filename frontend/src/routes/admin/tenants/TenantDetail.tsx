import { useEffect, useState } from 'react'
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
  const { tenantId } = useParams<{ tenantId: string }>()
  const [tenant, setTenant] = useState<Tenant | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<Payment[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([])

  const [leaseEnd, setLeaseEnd] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingInvitation, setIsSendingInvitation] = useState(false)
  const [invitation, setInvitation] = useState<InvitationResult | null>(null)
  const [invitationError, setInvitationError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    setLoading(true)
    Promise.all([getTenant(tenantId), getPaymentsByTenant(tenantId), getMaintenanceRequestsByTenant(tenantId)])
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
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  if (loading) {
    return (
      <div>
        <BackLink to="/admin/tenants" label="Back to tenants" />
        <Text variant="body">Loading…</Text>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div>
        <BackLink to="/admin/tenants" label="Back to tenants" />
        <Text variant="body">Tenant not found.</Text>
      </div>
    )
  }

  const currentTenant = tenant

  const hasChanges = leaseEnd !== currentTenant.leaseEnd || Number(monthlyRent) !== currentTenant.monthlyRent

  async function handleSave() {
    setIsSaving(true)
    try {
      const updated = await updateTenant(currentTenant.id, {
        leaseEnd,
        monthlyRent: Number(monthlyRent),
      })
      if (updated) setTenant(updated)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSendInvitation() {
    setIsSendingInvitation(true)
    setInvitationError(null)
    try {
      const result = await resetTenantPassword(currentTenant.id)
      setTenant({ ...currentTenant, accountStatus: 'pending', mustChangePassword: true })
      setInvitation(result.invitation)
    } catch (error) {
      setInvitationError(error instanceof Error ? error.message : 'Unable to send the invitation. Please try again.')
    } finally {
      setIsSendingInvitation(false)
    }
  }

  const tenantPayments = payments
  const tenantMaintenance = maintenance


  return (
    <div>
      <BackLink to="/admin/tenants" label="Back to tenants" />
      <PageHeader
        title={currentTenant.name}
        action={<StatusBadge variant={leaseStatusVariant[currentTenant.status]} label={leaseStatusLabel[currentTenant.status]} />}
      />

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
          label="Monthly rent"
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
