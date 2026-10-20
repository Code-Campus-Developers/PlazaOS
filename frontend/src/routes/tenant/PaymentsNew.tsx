import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Select, StatusBadge, Text } from '../../components'
import { usePayments } from '../../hooks/usePayments'
import { useRentCharges } from '../../hooks/useRentCharges'
import type { RentChargeStatus } from '../../lib/services/rentChargeService'
import { formatNaira } from '../../lib/formatNaira'

const statusVariant: Record<RentChargeStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  paid: 'success',
  due: 'warning',
  overdue: 'danger',
  upcoming: 'info',
}

export function PaymentsNew() {
  const { data, isLoading } = useRentCharges()
  const { payMutation } = usePayments()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState('')

  const rentCharges = data?.data ?? []
  const firstChargeId = rentCharges[0]?.id

  useEffect(() => {
    if (!selectedId && firstChargeId) {
      setSelectedId(firstChargeId)
    }
  }, [firstChargeId, selectedId])

  const selected = rentCharges.find((charge) => charge.id === selectedId)

  async function onSubmit() {
    if (!selectedId) return

    try {
      const result = await payMutation.mutateAsync(selectedId)
      if (result.checkoutUrl) {
        // Hand off to Paystack's hosted checkout page — the payment isn't
        // actually confirmed until Paystack redirects back and the webhook
        // fires, so don't navigate to the payments list yet.
        window.location.href = result.checkoutUrl
        return
      }
      navigate('/tenant/payments')
    } catch (err) {
      // mutation exposes error; keep behavior minimal
      console.error(err)
    }
  }

  return (
    <div className="px-4 sm:px-6">
      <Text variant="h1">Pay Rent</Text>
      <Card className="mt-4">
        {isLoading ? (
          <Text variant="bodySmall">Loading outstanding charges…</Text>
        ) : rentCharges.length === 0 ? (
          <Text variant="bodySmall">You have no outstanding rent charges.</Text>
        ) : (
          <div className="flex flex-col gap-4">
            <Select
              label="Rent charge"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              options={rentCharges.map((charge) => ({
                value: charge.id,
                label: `${charge.period} — ${formatNaira(charge.amount)} (due ${charge.dueDate})`,
              }))}
            />
            {selected ? (
              <div className="flex items-center gap-2">
                <Text variant="bodySmall">Status:</Text>
                <StatusBadge variant={statusVariant[selected.status]} label={selected.status} />
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" onClick={onSubmit} disabled={payMutation.status === 'pending' || !selectedId}>
                {payMutation.status === 'pending' ? 'Processing…' : 'Pay'}
              </Button>
            </div>
            {payMutation.status === 'error' ? <Text variant="bodySmall" className="text-danger">Payment failed. Please try again.</Text> : null}
            {payMutation.status === 'success' ? <Text variant="bodySmall" className="text-success">Payment successful.</Text> : null}
          </div>
        )}
      </Card>
    </div>
  )
}

