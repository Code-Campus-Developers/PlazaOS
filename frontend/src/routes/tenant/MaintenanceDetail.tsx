import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, StatusBadge, Text } from '../../components'
import type { MaintenanceStatus } from '../../lib/types'
import { ApiError } from '../../lib/api'
import { maintenanceService } from '../../lib/services/maintenanceService'

const statusLabel: Record<MaintenanceStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

const statusVariant: Record<MaintenanceStatus, 'info' | 'warning' | 'success'> = {
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
}

export function MaintenanceDetail() {
  const { requestId } = useParams<{ requestId: string }>()
  const requestQuery = useQuery({
    queryKey: ['maintenance', 'detail', requestId],
    queryFn: () => {
      if (!requestId) throw new Error('Maintenance request ID is required')
      return maintenanceService.get(requestId)
    },
    enabled: Boolean(requestId),
  })

  return (
    <div className="page-container">
      <Link
        to="/tenant/maintenance"
        className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary hover:text-primary-light"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to maintenance
      </Link>

      {!requestId ? (
        <Card>
          <Text variant="body">Maintenance request ID is missing.</Text>
        </Card>
      ) : requestQuery.isLoading ? (
        <Card>
          <Text variant="body">Loading maintenance request…</Text>
        </Card>
      ) : requestQuery.isError ? (
        <Card className="flex flex-col items-start gap-3">
          <Text variant="body" className="text-danger">
            {requestQuery.error instanceof ApiError && requestQuery.error.status === 404
              ? 'Maintenance request not found.'
              : 'Unable to load this maintenance request.'}
          </Text>
          <Button variant="secondary" onClick={() => void requestQuery.refetch()}>
            Retry
          </Button>
        </Card>
      ) : requestQuery.data ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Text variant="h1">{requestQuery.data.title}</Text>
            <StatusBadge
              variant={statusVariant[requestQuery.data.status]}
              label={statusLabel[requestQuery.data.status]}
              dot
            />
          </div>

          <Card className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <Text variant="caption" className="uppercase tracking-wide text-slate-500">Submitted</Text>
              <Text variant="body" className="mt-1">{requestQuery.data.createdAt}</Text>
            </div>
            <div>
              <Text variant="caption" className="uppercase tracking-wide text-slate-500">Priority</Text>
              <Text variant="body" className="mt-1">
                {requestQuery.data.priority
                  ? requestQuery.data.priority.charAt(0).toUpperCase() + requestQuery.data.priority.slice(1)
                  : '—'}
              </Text>
            </div>
            <div>
              <Text variant="caption" className="uppercase tracking-wide text-slate-500">Category</Text>
              <Text variant="body" className="mt-1">{requestQuery.data.category || '—'}</Text>
            </div>
            <div className="sm:col-span-2">
              <Text variant="caption" className="uppercase tracking-wide text-slate-500">Description</Text>
              <Text variant="body" className="mt-1 whitespace-pre-wrap">
                {requestQuery.data.description || 'No description provided.'}
              </Text>
            </div>
            <div className="sm:col-span-2">
              <Text variant="caption" className="uppercase tracking-wide text-slate-500">Photos</Text>
              {requestQuery.data.images?.length ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  {requestQuery.data.images.map((image, index) => (
                    <a key={image} href={image} target="_blank" rel="noreferrer">
                      <img
                        src={image}
                        alt={`Photo ${index + 1} for ${requestQuery.data.title}`}
                        className="h-32 w-32 rounded-card border border-slate-200 object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <Text variant="bodySmall" className="mt-1 text-slate-500">No photos attached.</Text>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}
