import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Input, Text } from '../../../components'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { getUnits } from '../units/data'
import { InvitationNotice } from './InvitationNotice'
import { addTenant, type InvitationResult } from './data'
import { formatNaira } from '../../../lib/formatNaira'
import type { Tenant, Unit } from '../data/types'

interface CreatedTenant {
  tenant: Tenant
  invitation: InvitationResult
}

// Submits to POST /tenants — see addTenant() in ./data.ts. The backend
// creates the tenant, assigns the unit, and creates the lease atomically, so
// no separate updateUnit() call is needed here.
export function TenantNew() {
  // Large pageSize so this dropdown always has every vacant unit, not just
  // page 1 — this is a UI convenience read, not the paginated list view.
  const [vacantUnits, setVacantUnits] = useState<Unit[]>([])
  const [unitsLoaded, setUnitsLoaded] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [leaseStart, setLeaseStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [leaseEnd, setLeaseEnd] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedTenant | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getUnits({ status: 'vacant', pageSize: 1000 }).then((result) => {
      if (cancelled) return
      setVacantUnits(result.data)
      setUnitsLoaded(true)
      if (result.data[0]) {
        setSelectedUnitId(result.data[0].id)
        setMonthlyRent(String(result.data[0].monthlyRent))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  function handleUnitChange(unitId: string) {
    setSelectedUnitId(unitId)
    const unit = vacantUnits.find((candidate) => candidate.id === unitId)
    if (unit) {
      setMonthlyRent(String(unit.monthlyRent))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selectedUnit = vacantUnits.find((unit) => unit.id === selectedUnitId)
    if (!selectedUnit) return

    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const result = await addTenant({
        name,
        email,
        phone,
        unitId: selectedUnit.id,
        unitNumber: selectedUnit.unitNumber,
        leaseStart,
        leaseEnd,
        monthlyRent: Number(monthlyRent),
      })
      setCreated(result)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to create the tenant. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (created) {
    return (
      <div>
        <PageHeader
          title="Tenant created"
          description={`${created.tenant.name} has been added to unit ${created.tenant.unitNumber}.`}
        />
        <InvitationNotice email={created.tenant.email} invitation={created.invitation} />
        <Link
          to={`/admin/tenants/${created.tenant.id}`}
          className="mt-4 inline-flex min-h-[44px] items-center text-[15px] font-medium text-primary hover:text-primary-light"
        >
          View tenant →
        </Link>
      </div>
    )
  }

  if (unitsLoaded && vacantUnits.length === 0) {
    return (
      <div>
        <BackLink to="/admin/tenants" label="Back to tenants" />
        <PageHeader title="Add tenant" />
        <Text variant="body" className="text-slate-500">
          There are no vacant units to assign right now.{' '}
          <Link to="/admin/units/new" className="text-primary hover:text-primary-light">
            Add a unit
          </Link>{' '}
          first.
        </Text>
      </div>
    )
  }


  return (
    <div>
      <BackLink to="/admin/tenants" label="Back to tenants" />
      <PageHeader title="Add tenant" description="Create a tenant account and assign them to a vacant unit." />
      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          <Select
            label="Unit"
            value={selectedUnitId}
            onChange={(event) => handleUnitChange(event.target.value)}
            options={vacantUnits.map((unit) => ({ value: unit.id, label: `${unit.unitNumber} — ${formatNaira(unit.monthlyRent)}/mo` }))}
          />
          <Input label="Lease start" type="date" value={leaseStart} onChange={(event) => setLeaseStart(event.target.value)} required />
          <Input label="Lease end" type="date" value={leaseEnd} onChange={(event) => setLeaseEnd(event.target.value)} required />
          <Input
            label="Monthly rent"
            type="number"
            min="0"
            step="0.01"
            value={monthlyRent}
            onChange={(event) => setMonthlyRent(event.target.value)}
            helperText="Auto-filled from the selected unit — editable."
            required
          />
          {submitError ? <Text variant="bodySmall" className="text-danger">{submitError}</Text> : null}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Creating…' : 'Create tenant'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
