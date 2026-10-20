import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Input, Modal, Select, Table, Text, StatusBadge } from '../../components'
import type { TableColumn } from '../../components'
import type { StatusVariant } from '../../components/StatusBadge'
import { usePayments } from '../../hooks/usePayments'
import { DEFAULT_PAGE_SIZE, paymentService, type Payment, type PaymentStatus } from '../../lib/services/paymentService'
import { formatNaira } from '../../lib/formatNaira'

const statusVariantMap: Record<PaymentStatus, StatusVariant> = {
  paid: 'success',
  pending: 'info',
  failed: 'danger',
  refunded: 'neutral',
}

export function Payments() {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading, isError, refetch } = usePayments(page)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selected, setSelected] = useState<Payment | null>(null)

  // Paystack redirects back here with `?reference=...&trxref=...` — re-check the
  // real outcome rather than assuming success just because the browser returned.
  useEffect(() => {
    const reference = searchParams.get('reference')
    if (!reference) return

    paymentService
      .verify(reference)
      .catch((err) => console.error('Failed to verify payment', err))
      .finally(() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.delete('reference')
          next.delete('trxref')
          return next
        }, { replace: true })
        refetch()
      })
  }, [searchParams, setSearchParams, refetch])

  const columns: TableColumn<Payment>[] = [
    { key: 'date', header: 'Date' },
    { key: 'amount', header: 'Amount' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge variant={statusVariantMap[row.status]} label={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setSelected(row)}>
            View
          </Button>
          {row.receiptUrl ? (
            <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="text-primary">
              Receipt
            </a>
          ) : null}
        </div>
      ),
    },
  ]

  const filtered = useMemo(() => {
    const rows = data?.data ?? []
    return rows.filter((r) => {
      const matchesQuery = query ? String(r.amount).includes(query) || r.date.includes(query) : true
      const matchesStatus = statusFilter ? r.status === statusFilter : true
      return matchesQuery && matchesStatus
    })
  }, [data, query, statusFilter])

  const total = data?.total ?? 0
  const hasMore = page * DEFAULT_PAGE_SIZE < total

  return (
    <div className="px-4 sm:px-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Text variant="h1">Payments</Text>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => navigate('/tenant/payments/new')}>Pay Rent</Button>
        </div>
      </div>

      <Card>
        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input label="Search by date or amount" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'paid', label: 'Paid' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />
        </div>

        {isLoading ? (
          <Text variant="body">Loading…</Text>
        ) : isError ? (
          <div className="flex items-center justify-between">
            <Text variant="bodySmall" className="text-danger">Failed to load payments.</Text>
            <div>
              <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
            </div>
          </div>
        ) : (
          <Table
            columns={columns}
            data={filtered}
            getRowKey={(r) => r.id}
          />
        )}

        {/* Details modal */}
        <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Payment details">
          {selected ? (
            <div className="flex flex-col gap-3">
              <Text variant="body">Date: {selected.date}</Text>
              <Text variant="body">Amount: {formatNaira(selected.amount)}</Text>
              <Text variant="body">Status: {selected.status}</Text>
              {selected.receiptUrl ? (
                <a href={selected.receiptUrl} target="_blank" rel="noreferrer" className="text-primary">
                  Download receipt
                </a>
              ) : (
                <Text variant="bodySmall">Receipt unavailable</Text>
              )}
            </div>
          ) : null}
        </Modal>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </Button>
            <Button onClick={() => setPage((p) => p + 1)} disabled={!hasMore}>              Next
            </Button>
          </div>
          <Text variant="bodySmall">Page {page}</Text>
        </div>
      </Card>
    </div>
  )
}
