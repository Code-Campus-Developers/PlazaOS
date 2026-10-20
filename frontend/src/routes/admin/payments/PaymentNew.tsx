import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input, Text } from '../../../components'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { Textarea } from '../components/Textarea'
import { getTenants } from '../tenants/data'
import type { PaymentMethod, Tenant } from '../data/types'
import { formatNaira } from '../../../lib/formatNaira'
import { addPayment, getRentChargesForTenant, type RentCharge } from './data'

const OFFLINE_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'check', label: 'Check' },
]

// Submits to POST /payments — see addPayment() in ./data.ts. Requires
// picking one of the tenant's outstanding rent charges (GET /rent-charges);
// POST /payments settles that specific charge.
export function PaymentNew() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [rentCharges, setRentCharges] = useState<RentCharge[]>([])
  const [rentChargeId, setRentChargeId] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [chargesError, setChargesError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTenants({ pageSize: 1000 }).then((result) => {
      if (cancelled) return
      setTenants(result.data)
      if (result.data[0]) setTenantId(result.data[0].id)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    setRentChargeId('')
    setChargesError(null)
    getRentChargesForTenant(tenantId)
      .then((charges) => {
        if (cancelled) return
        setRentCharges(charges)
        if (charges[0]) setRentChargeId(charges[0].id)
      })
      .catch((error) => {
        if (cancelled) return
        // Surface the failure instead of pretending the tenant has no charges.
        setRentCharges([])
        setChargesError(error instanceof Error ? error.message : 'Unable to load rent charges.')
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId)
  const selectedCharge = rentCharges.find((charge) => charge.id === rentChargeId)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTenant || !selectedCharge) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await addPayment({
        tenantId: selectedTenant.id,
        tenantName: selectedTenant.name,
        unitNumber: selectedTenant.unitNumber,
        rentChargeId: selectedCharge.id,
        amount: selectedCharge.amount,
        date,
        method,
        note: note || undefined,
      })
      navigate('/admin/payments')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to record the payment. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <BackLink to="/admin/payments" label="Back to payments" />
      <PageHeader title="Record payment" description="Log an offline payment made by a tenant." />
      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select
            label="Tenant"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            options={tenants.map((tenant) => ({ value: tenant.id, label: `${tenant.name} (${tenant.unitNumber})` }))}
            required
          />
          {chargesError ? <Text variant="bodySmall" className="text-danger">{chargesError}</Text> : null}
          {rentCharges.length > 0 ? (
            <Select
              label="Rent charge"
              value={rentChargeId}
              onChange={(event) => setRentChargeId(event.target.value)}
              options={rentCharges.map((charge) => ({
                value: charge.id,
                label: `${formatNaira(charge.amount)} due ${charge.dueDate} (${charge.status})`,
              }))}
              required
            />
          ) : (
            <Text variant="bodySmall" className="text-slate-500">
              This tenant has no outstanding rent charges.
            </Text>
          )}
          <Select
            label="Payment method"
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            options={OFFLINE_METHODS}
            required
          />
          <Input label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          <Textarea label="Note" placeholder="Optional context, e.g. paid in person at the office" value={note} onChange={(event) => setNote(event.target.value)} />
          {submitError ? <Text variant="bodySmall" className="text-danger">{submitError}</Text> : null}
          <Button type="submit" disabled={isSubmitting || !selectedCharge} className="w-full">
            {isSubmitting ? 'Saving…' : 'Record payment'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

