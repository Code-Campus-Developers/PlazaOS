import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, StatusBadge, Text } from '../../components'
import type { PaymentStatus } from '../../lib/types'
import { formatNaira } from '../../lib/formatNaira'
import { ApiError } from '../../lib/api'
import { paymentService } from '../../lib/services/paymentService'

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

function formatMethod(method?: string): string {
  if (!method) return '—'
  return method.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function PaymentDetail() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const paymentQuery = useQuery({
    queryKey: ['payments', 'detail', paymentId],
    queryFn: () => {
      if (!paymentId) throw new Error('Payment ID is required')
      return paymentService.get(paymentId)
    },
    enabled: Boolean(paymentId),
  })

  return (
    <div className="page-container">
      <Link
        to="/tenant/payments"
        className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary hover:text-primary-light"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to payments
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Text variant="h1">Payment details</Text>
        {paymentQuery.data ? (
          <StatusBadge
            variant={statusVariant[paymentQuery.data.status]}
            label={statusLabel[paymentQuery.data.status]}
            dot
          />
        ) : null}
      </div>

      {!paymentId ? (
        <Card>
          <Text variant="body">Payment ID is missing.</Text>
        </Card>
      ) : paymentQuery.isLoading ? (
        <Card>
          <Text variant="body">Loading payment…</Text>
        </Card>
      ) : paymentQuery.isError ? (
        <Card className="flex flex-col items-start gap-3">
          <Text variant="body" className="text-danger">
            {paymentQuery.error instanceof ApiError && paymentQuery.error.status === 404
              ? 'Payment not found.'
              : 'Unable to load this payment.'}
          </Text>
          <Button variant="secondary" onClick={() => void paymentQuery.refetch()}>
            Retry
          </Button>
        </Card>
      ) : paymentQuery.data ? (
        <Card className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <Text variant="caption" className="uppercase tracking-wide text-slate-500">Amount</Text>
            <Text variant="body" className="mt-1 font-semibold">{formatNaira(paymentQuery.data.amount)}</Text>
          </div>
          <div>
            <Text variant="caption" className="uppercase tracking-wide text-slate-500">Date</Text>
            <Text variant="body" className="mt-1">{paymentQuery.data.date}</Text>
          </div>
          <div>
            <Text variant="caption" className="uppercase tracking-wide text-slate-500">Payment method</Text>
            <Text variant="body" className="mt-1">{formatMethod(paymentQuery.data.method)}</Text>
          </div>
          <div>
            <Text variant="caption" className="uppercase tracking-wide text-slate-500">Status</Text>
            <div className="mt-1">
              <StatusBadge
                variant={statusVariant[paymentQuery.data.status]}
                label={statusLabel[paymentQuery.data.status]}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Text variant="caption" className="uppercase tracking-wide text-slate-500">Receipt</Text>
            {paymentQuery.data.receiptUrl ? (
              <a
                href={paymentQuery.data.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block min-h-[44px] py-3 font-medium text-primary hover:text-primary-light"
              >
                Download receipt
              </a>
            ) : (
              <Text variant="bodySmall" className="mt-1 text-slate-500">Receipt is unavailable for this payment.</Text>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
