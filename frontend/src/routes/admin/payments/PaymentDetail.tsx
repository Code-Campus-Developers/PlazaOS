import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, StatusBadge, Text } from '../../../components'
import { BackLink } from '../components/BackLink'
import { DetailField } from '../components/DetailField'
import { PageHeader } from '../components/PageHeader'
import type { Payment, PaymentMethod, PaymentStatus } from '../data/types'
import { formatNaira } from '../../../lib/formatNaira'
import { getPayment } from './data'

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

// Fetches this payment from GET /payments/:paymentId.
export function PaymentDetail() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const [payment, setPayment] = useState<Payment | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!paymentId) return
    let cancelled = false
    setLoading(true)
    getPayment(paymentId)
      .then((found) => {
        if (!cancelled) setPayment(found)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paymentId])

  if (loading) {
    return (
      <div>
        <BackLink to="/admin/payments" label="Back to payments" />
        <Text variant="body">Loading…</Text>
      </div>
    )
  }

  if (!payment) {
    return (
      <div>
        <BackLink to="/admin/payments" label="Back to payments" />
        <Text variant="body">Payment not found.</Text>
      </div>
    )
  }

  return (
    <div>
      <BackLink to="/admin/payments" label="Back to payments" />
      <PageHeader
        title={`Payment · ${payment.tenantName}`}
        action={<StatusBadge variant={statusVariant[payment.status]} label={statusLabel[payment.status]} />}
      />
      <Card className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <DetailField label="Tenant">
          <Link to={`/admin/tenants/${payment.tenantId}`} className="text-primary hover:text-primary-light">
            {payment.tenantName}
          </Link>
        </DetailField>
        <DetailField label="Unit">{payment.unitNumber}</DetailField>
        <DetailField label="Amount">{formatNaira(payment.amount)}</DetailField>
        <DetailField label="Method">{methodLabel[payment.method]}</DetailField>
        <DetailField label="Date">{payment.date}</DetailField>
        <DetailField label="Recorded by">{payment.recordedBy ?? 'Tenant (gateway)'}</DetailField>
        {payment.note ? <DetailField label="Note">{payment.note}</DetailField> : null}
        <DetailField label="Receipt">
          {payment.receiptAvailable ? (
            // TODO: wire up to the real generated-receipt download endpoint.
            <Button variant="secondary">Download receipt</Button>
          ) : (
            'Not available yet'
          )}
        </DetailField>
      </Card>
    </div>
  )
}
