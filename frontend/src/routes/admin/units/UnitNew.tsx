import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input } from '../../../components'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import type { UnitStatus } from '../data/types'
import { addUnit } from './data'

const statusOptions: { value: UnitStatus; label: string }[] = [
  { value: 'vacant', label: 'Vacant' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Under maintenance' },
]

// Submits to POST /units — see addUnit() in ./data.ts.
export function UnitNew() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [unitNumber, setUnitNumber] = useState('')
  const [floor, setFloor] = useState('')
  const [sizeSqft, setSizeSqft] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [status, setStatus] = useState<UnitStatus>('vacant')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const newUnit = await addUnit({
        unitNumber,
        floor,
        sizeSqft: Number(sizeSqft),
        monthlyRent: Number(monthlyRent),
        status,
      })
      queryClient.setQueryData(['admin-unit', newUnit.id], newUnit)
      void queryClient.invalidateQueries({ queryKey: ['admin-page', 'units'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-page', 'unit-floors'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-reference-vacant-units'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] })
      navigate(`/admin/units/${newUnit.id}`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to add this unit. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <BackLink to="/admin/units" label="Back to units" />
      <PageHeader title="Add unit" description="Register a new plaza unit." />
      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Unit number" placeholder="e.g. D-401" value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} required />
          <Input label="Floor" placeholder="e.g. 4" value={floor} onChange={(event) => setFloor(event.target.value)} required />
          <Input
            label="Size (sqft)"
            type="number"
            min="0"
            value={sizeSqft}
            onChange={(event) => setSizeSqft(event.target.value)}
            required
          />
          <Input
            label="Monthly rent"
            type="number"
            min="0"
            step="0.01"
            value={monthlyRent}
            onChange={(event) => setMonthlyRent(event.target.value)}
            required
          />
          <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value as UnitStatus)} options={statusOptions} />
          {submitError ? <p role="alert" className="text-[13px] text-danger">{submitError}</p> : null}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Saving…' : 'Add unit'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
