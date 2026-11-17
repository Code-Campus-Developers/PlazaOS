import { useMemo, useState } from 'react'
import { Button, Card, Input, Select, StatusBadge, Table, Text } from '../../components'
import type { TableColumn } from '../../components'
import { useMaintenance } from '../../hooks/useMaintenance'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_PAGE_SIZE, type MaintenanceRequest, type MaintenanceStatus } from '../../lib/services/maintenanceService'

const statusVariantMap: Record<MaintenanceStatus, 'info' | 'warning' | 'success'> = {
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
}

const columns: TableColumn<MaintenanceRequest>[] = [
  { key: 'title', header: 'Title' },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge variant={statusVariantMap[row.status]} label={row.status} /> },
]

export function Maintenance() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useMaintenance(page)
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | ''>('')

  const requestColumns: TableColumn<MaintenanceRequest>[] = [
    ...columns,
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button variant="secondary" onClick={() => navigate(`/tenant/maintenance/${row.id}`)}>
          Details
        </Button>
      ),
    },
  ]

  const filtered = useMemo(() => {
    const rows: MaintenanceRequest[] = data?.data ?? []
    return rows.filter((r) => {
      const matchesQuery = query
        ? r.title.toLowerCase().includes(query.toLowerCase()) || (r.description || '').toLowerCase().includes(query.toLowerCase())
        : true
      const matchesStatus = statusFilter ? r.status === statusFilter : true
      return matchesQuery && matchesStatus
    })
  }, [data, query, statusFilter])

  const total = data?.total ?? 0
  const hasMore = page * DEFAULT_PAGE_SIZE < total

  return (
    <div className="px-4 sm:px-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Text variant="h1">Maintenance</Text>
        <Button variant="secondary" onClick={() => navigate('/tenant/maintenance/new')}>
          New request
        </Button>
      </div>

      <Card>
        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input label="Search maintenance requests" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MaintenanceStatus | '')}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
        </div>

        {isLoading ? (
          <Text variant="body">Loading…</Text>
        ) : isError ? (
          <div className="flex items-center justify-between">
            <Text variant="bodySmall" className="text-danger">Failed to load maintenance requests.</Text>
            <div>
              <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
            </div>
          </div>
        ) : (
          <Table columns={requestColumns} data={filtered} getRowKey={(r) => r.id} />
        )}
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </Button>
            <Button onClick={() => setPage((p) => p + 1)} disabled={!hasMore}>
              Next
            </Button>
          </div>
          <Text variant="bodySmall">Page {page}</Text>
        </div>
      </Card>
    </div>
  )
}
