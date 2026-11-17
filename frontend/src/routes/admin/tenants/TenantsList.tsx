import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, StatusBadge, Table, Text } from '../../../components'
import type { TableColumn } from '../../../components'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { useAsyncData } from '../components/useAsyncData'
import type { AccountStatus, RentStatus, Tenant } from '../data/types'
import { getTenants, type GetTenantsResult, type SortDirection, type TenantSortField, updateTenant } from './data'

const PAGE_SIZE = 20

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

const rentStatusOptions: { value: 'all' | RentStatus; label: string }[] = [
  { value: 'all', label: 'All rent statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'due', label: 'Due' },
  { value: 'overdue', label: 'Overdue' },
]

const accountStatusOptions: { value: 'all' | AccountStatus; label: string }[] = [
  { value: 'all', label: 'All accounts' },
  { value: 'temporary', label: 'Temporary password' },
  { value: 'active', label: 'Active' },
]

const sortOptions: { value: TenantSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'unitNumber', label: 'Unit' },
  { value: 'leaseEnd', label: 'Lease ends' },
  { value: 'rentStatus', label: 'Rent status' },
]

// NOTE: same reasoning as UnitsList — the shared Table sorts its `data` prop
// client-side with fully internal state, so it's only correct for one page
// of rows. Columns aren't marked sortable; the "Sort by" control below
// drives getTenants() and the URL instead.
// Fetches tenants from GET /tenants (see getTenants() in ./data.ts).
export function TenantsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [updatingTenantId, setUpdatingTenantId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState(false)

  const search = searchParams.get('search') ?? ''
  const rentStatus = (searchParams.get('rentStatus') as 'all' | RentStatus | null) ?? 'all'
  const accountStatus = (searchParams.get('accountStatus') as 'all' | AccountStatus | null) ?? 'all'
  const sortBy = (searchParams.get('sortBy') as TenantSortField | null) ?? 'name'
  const sortDir = (searchParams.get('sortDir') as SortDirection | null) ?? 'asc'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const { data: result, error, loading, retry } = useAsyncData<GetTenantsResult>(
    () => getTenants({ search, rentStatus, accountStatus, sortBy, sortDir, page, pageSize: PAGE_SIZE }),
    [search, rentStatus, accountStatus, sortBy, sortDir, page],
    { data: [], total: 0, page, pageSize: PAGE_SIZE },
    'tenants',
  )
  const { data, total, pageSize } = result

  useEffect(() => {
    for (const tenant of data) {
      queryClient.setQueryData(['admin-tenant', tenant.id], tenant)
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

  async function handleToggleStatus(tenant: Tenant) {
    const nextStatus = tenant.status === 'active' ? 'inactive' : 'active'
    if (!window.confirm(`${nextStatus === 'inactive' ? 'Deactivate' : 'Reactivate'} ${tenant.name}? Their account and payment history will be kept.`)) return
    setUpdatingTenantId(tenant.id)
    setStatusError(false)
    try {
      await updateTenant(tenant.id, { status: nextStatus })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'tenants'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] }),
      ])
    } catch {
      setStatusError(true)
    } finally {
      setUpdatingTenantId(null)
    }
  }

  const columns: TableColumn<Tenant>[] = [
    {
      key: 'name',
      header: 'Tenant',
      render: (tenant) => (
        <Link to={`/admin/tenants/${tenant.id}`} className="font-medium text-primary hover:text-primary-light">
          {tenant.name}
        </Link>
      ),
    },
    { key: 'unitNumber', header: 'Unit' },
    { key: 'email', header: 'Email' },
    { key: 'leaseEnd', header: 'Lease ends' },
    {
      key: 'rentStatus',
      header: 'Rent status',
      render: (tenant) => <StatusBadge variant={rentStatusVariant[tenant.rentStatus]} label={rentStatusLabel[tenant.rentStatus]} />,
    },
    {
      key: 'accountStatus',
      header: 'Account',
      render: (tenant) => (
        <StatusBadge variant={accountStatusVariant[tenant.accountStatus]} label={accountStatusLabel[tenant.accountStatus]} />
      ),
    },
    {
      key: 'status',
      header: 'Tenant status',
      render: (tenant) => (
        <StatusBadge variant={tenant.status === 'active' ? 'success' : 'neutral'} label={tenant.status === 'active' ? 'Active' : 'Inactive'} />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (tenant) => (
        <Button
          type="button"
          size="sm"
          variant={tenant.status === 'active' ? 'destructive' : 'secondary'}
          onClick={() => handleToggleStatus(tenant)}
          disabled={updatingTenantId !== null}
        >
          {updatingTenantId === tenant.id ? 'Updating…' : tenant.status === 'active' ? 'Deactivate' : 'Reactivate'}
        </Button>
      ),
    },
  ]

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="All tenant accounts and their current rent status."
        action={<Button onClick={() => navigate('/admin/tenants/new')}>Add Tenant</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            label="Search"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => updateParams({ search: event.target.value || null })}
          />
        </div>
        <div className="w-44">
          <Select
            label="Rent status"
            value={rentStatus}
            onChange={(event) => updateParams({ rentStatus: event.target.value === 'all' ? null : event.target.value })}
            options={rentStatusOptions}
          />
        </div>
        <div className="w-48">
          <Select
            label="Account"
            value={accountStatus}
            onChange={(event) => updateParams({ accountStatus: event.target.value === 'all' ? null : event.target.value })}
            options={accountStatusOptions}
          />
        </div>
        <div className="w-40">
          <Select
            label="Sort by"
            value={sortBy}
            onChange={(event) => updateParams({ sortBy: event.target.value === 'name' ? null : event.target.value })}
            options={sortOptions}
          />
        </div>
        <Button variant="secondary" onClick={() => updateParams({ sortDir: sortDir === 'asc' ? 'desc' : null })}>
          {sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-lg border border-danger/20 bg-danger/5 p-4">
          <Text variant="bodySmall" className="text-danger">Unable to load tenants from the server.</Text>
          <Button variant="secondary" onClick={retry}>Retry</Button>
        </div>
      ) : loading ? (
        <Text variant="body">Loading tenants…</Text>
      ) : (
        <Table columns={columns} data={data} getRowKey={(tenant) => tenant.id} emptyMessage="No tenants match these filters" />
      )}
      {statusError ? <p role="alert" className="mt-3 text-[13px] text-danger">Unable to update tenant status. Please try again.</p> : null}

      <div className="mt-4 flex items-center justify-between">
        <Text variant="bodySmall" className="text-slate-500">
          Showing {rangeStart}–{rangeEnd} of {total} tenants
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
