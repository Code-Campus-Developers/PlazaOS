import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Input, StatusBadge, Text } from '../../../components'
import { BackLink } from '../components/BackLink'
import { DetailField } from '../components/DetailField'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import type { UnitStatus } from '../data/types'
import { deleteUnit, getUnit, updateUnit } from './data'

const statusLabel: Record<UnitStatus, string> = {
  occupied: 'Occupied',
  vacant: 'Vacant',
  maintenance: 'Under maintenance',
}

const statusVariant: Record<UnitStatus, 'success' | 'warning' | 'danger'> = {
  occupied: 'success',
  vacant: 'warning',
  maintenance: 'danger',
}

const statusOptions: { value: UnitStatus; label: string }[] = [
  { value: 'vacant', label: 'Vacant' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Under maintenance' },
]

// Fetches this unit from GET /units/:unitId and saves via PATCH — see
// getUnit()/updateUnit() in ./data.ts.
export function UnitDetail() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { unitId } = useParams<{ unitId: string }>()
  const unitQuery = useQuery({
    queryKey: ['admin-unit', unitId],
    queryFn: () => getUnit(unitId!),
    enabled: Boolean(unitId),
  })
  const unit = unitQuery.data
  const [initializedUnitId, setInitializedUnitId] = useState<string>()
  const [floor, setFloor] = useState('')
  const [sizeSqft, setSizeSqft] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [status, setStatus] = useState<UnitStatus>('vacant')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!unit || initializedUnitId === unit.id) return
    setFloor(unit.floor)
    setSizeSqft(String(unit.sizeSqft))
    setMonthlyRent(String(unit.monthlyRent))
    setStatus(unit.status)
    setInitializedUnitId(unit.id)
  }, [unit, initializedUnitId])

  if (unitQuery.isLoading) {
    return (
      <div>
        <BackLink to="/admin/units" label="Back to units" />
        <Text variant="body">Loading…</Text>
      </div>
    )
  }

  if (unitQuery.isError || !unit) {
    return (
      <div>
        <BackLink to="/admin/units" label="Back to units" />
        <Text variant="body">{unitQuery.isError ? 'Unable to load this unit from the server.' : 'Unit not found.'}</Text>
      </div>
    )
  }

  const currentUnit = unit

  const hasChanges =
    floor !== currentUnit.floor ||
    Number(sizeSqft) !== currentUnit.sizeSqft ||
    Number(monthlyRent) !== currentUnit.monthlyRent ||
    status !== currentUnit.status

  async function handleSave() {
    setIsSaving(true)
    setSaveError(false)
    try {
      const updated = await updateUnit(currentUnit.id, {
        floor,
        sizeSqft: Number(sizeSqft),
        monthlyRent: Number(monthlyRent),
        status,
      })
      if (updated) {
        queryClient.setQueryData(['admin-unit', currentUnit.id], updated)
        void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] })
        void queryClient.invalidateQueries({ queryKey: ['admin-page', 'units'] })
      }
    } catch {
      setSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Permanently delete unit ${currentUnit.unitNumber}? This is only allowed when it has no tenant or historical records.`)) {
      return
    }
    setIsDeleting(true)
    setDeleteError(false)
    try {
      await deleteUnit(currentUnit.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'units'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'unit-floors'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] }),
      ])
      navigate('/admin/units')
    } catch {
      setDeleteError(true)
    } finally {
      setIsDeleting(false)
    }
  }

  const canDelete = currentUnit.status === 'vacant' && !currentUnit.tenantId


  return (
    <div>
      <BackLink to="/admin/units" label="Back to units" />
      <PageHeader
        title={`Unit ${currentUnit.unitNumber}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge variant={statusVariant[currentUnit.status]} label={statusLabel[currentUnit.status]} />
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || isDeleting || isSaving}
            >
              {isDeleting ? 'Deleting…' : 'Delete unit'}
            </Button>
          </div>
        }
      />
      <Card className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Input label="Floor" value={floor} onChange={(event) => setFloor(event.target.value)} />
        <Input label="Size (sqft)" type="number" min="0" value={sizeSqft} onChange={(event) => setSizeSqft(event.target.value)} />
        <Input
          label="Monthly rent"
          type="number"
          min="0"
          step="0.01"
          value={monthlyRent}
          onChange={(event) => setMonthlyRent(event.target.value)}
        />
        <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value as UnitStatus)} options={statusOptions} />
        <DetailField label="Tenant">
          {currentUnit.tenantId && currentUnit.tenantName ? (
            <Link to={`/admin/tenants/${currentUnit.tenantId}`} className="text-primary hover:text-primary-light">
              {currentUnit.tenantName}
            </Link>
          ) : (
            'Unassigned'
          )}
        </DetailField>
        <div className="flex items-end">
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
        {saveError ? <p role="alert" className="text-[13px] text-danger">Unable to save unit changes. Please try again.</p> : null}
        {deleteError ? <p role="alert" className="text-[13px] text-danger">Unable to delete this unit. It may have linked tenant or historical records.</p> : null}
      </Card>
    </div>
  )
}
