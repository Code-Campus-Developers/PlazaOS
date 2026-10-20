import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, StatusBadge, Table, Text } from '../../../components'
import type { TableColumn } from '../../../components'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { useAsyncData } from '../components/useAsyncData'
import type { Payment, PaymentMethod, PaymentStatus } from '../data/types'
import { formatNaira } from '../../../lib/formatNaira'
import { getPayments, type GetPaymentsResult, type PaymentSortField, type SortDirection } from './data'

const PAGE_SIZE = 20

const statusLabel: Record<PaymentStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
}

const statusVariant: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'danger',
  refunded: 'neutral',
}

const methodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  check: 'Check',
  gateway: 'Gateway',
}

const statusOptions: { value: 'all' | PaymentStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
]

const methodOptions: { value: 'all' | PaymentMethod; label: string }[] = [
  { value: 'all', label: 'All methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'check', label: 'Check' },
  { value: 'gateway', label: 'Gateway' },
]

const sortOptions: { value: PaymentSortField; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'tenantName', label: 'Tenant' },
  { value: 'amount', label: 'Amount' },
]

// NOTE: same reasoning as Units/Maintenance — the shared Table sorts its
// `data` prop client-side with fully internal state, so it's only correct
// for one page of rows. Columns aren't marked sortable; the "Sort by"
// control below drives getPayments() and the URL instead.
const columns: TableColumn<Payment>[] = [
  {
    key: 'date',
    header: 'Date',
    render: (payment) => (
      <Link to={`/admin/payments/${payment.id}`} className="font-medium text-primary hover:text-primary-light">
        {payment.date}
      </Link>
    ),
  },
  { key: 'tenantName', header: 'Tenant' },
  { key: 'unitNumber', header: 'Unit' },
  { key: 'amount', header: 'Amount', render: (payment) => formatNaira(payment.amount) },
  { key: 'method', header: 'Method', render: (payment) => methodLabel[payment.method] },
  {
    key: 'status',
    header: 'Status',
    render: (payment) => <StatusBadge variant={statusVariant[payment.status]} label={statusLabel[payment.status]} />,
  },
]

// Fetches payments from GET /payments (see getPayments() in ./data.ts).
export function PaymentsList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const status = (searchParams.get('status') as 'all' | PaymentStatus | null) ?? 'all'
  const method = (searchParams.get('method') as 'all' | PaymentMethod | null) ?? 'all'
  const sortBy = (searchParams.get('sortBy') as PaymentSortField | null) ?? 'date'
  const sortDir = (searchParams.get('sortDir') as SortDirection | null) ?? 'asc'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const { data: result } = useAsyncData<GetPaymentsResult>(
    () => getPayments({ search, status, method, sortBy, sortDir, page, pageSize: PAGE_SIZE }),
    [search, status, method, sortBy, sortDir, page],
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
        title="Payments"
        description="Rent payments across the plaza, including manually recorded offline payments."
        action={<Button onClick={() => navigate('/admin/payments/new')}>Record payment</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            label="Search"
            placeholder="Search by tenant or unit"
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
        <div className="w-44">
          <Select
            label="Method"
            value={method}
            onChange={(event) => updateParams({ method: event.target.value === 'all' ? null : event.target.value })}
            options={methodOptions}
          />
        </div>
        <div className="w-44">
          <Select
            label="Sort by"
            value={sortBy}
            onChange={(event) => updateParams({ sortBy: event.target.value === 'date' ? null : event.target.value })}
            options={sortOptions}
          />
        </div>
        <Button variant="secondary" onClick={() => updateParams({ sortDir: sortDir === 'asc' ? 'desc' : null })}>
          {sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
        </Button>
      </div>

      <Table columns={columns} data={data} getRowKey={(payment) => payment.id} emptyMessage="No payments match these filters" />

      <div className="mt-4 flex items-center justify-between">
        <Text variant="bodySmall" className="text-slate-500">
          Showing {rangeStart}–{rangeEnd} of {total} payments
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
