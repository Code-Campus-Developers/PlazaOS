import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { Unit } from '@/models/Unit'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

export const DELETE = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  await dbConnect()
  const unit = await Unit.findById(id).catch(() => null)
  if (!unit) throw new ApiError('Unit not found', 404)
  if (unit.tenantId) throw new ApiError('Cannot delete an occupied unit; unassign the tenant first', 409)
  const { Lease } = await import('@/models/Lease')
  const leases = await Lease.countDocuments({ unitId: unit._id })
  if (leases) throw new ApiError('Cannot delete unit with linked leases', 409)
  await Unit.deleteOne({ _id: unit._id })
  return NextResponse.json({ success: true })
})

function toPublicUnit(doc: any) {
  return {
    id: doc._id.toString(),
    unitNumber: doc.unitNumber,
    floor: doc.floor,
    sizeSqft: doc.sizeSqft,
    monthlyRent: doc.monthlyRent,
    status: doc.status,
    tenantId: doc.tenantId ? doc.tenantId.toString() : undefined,
    tenantName: doc.tenantName ?? undefined,
  }
}

export const GET = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  await dbConnect()
  const doc = await Unit.findById(id).catch(() => null)
  if (!doc) throw new ApiError('Unit not found', 404)
  return NextResponse.json(toPublicUnit(doc))
})

// `tenantId`/`tenantName` may only be explicitly cleared (set to `null`) here —
// assigning a *new* tenant to a unit must go through the atomic `POST /tenants`
// transaction (unit + user + lease together), never this generic PATCH, so a
// unit can never end up "occupied" without a matching Lease. See
// BACKEND_BUILD_PLAN.md §5 ("a unit cannot be reassigned without an explicit
// unassign step").
const updateUnitSchema = z
  .object({
    floor: z.string().min(1).optional(),
    sizeSqft: z.number().positive().optional(),
    monthlyRent: z.number().positive().optional(),
    status: z.enum(['occupied', 'vacant', 'maintenance']).optional(),
    tenantId: z.null().optional(),
    tenantName: z.null().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update' })

export const PATCH = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = updateUnitSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('Invalid unit update', 400)

  await dbConnect()
  const unit = await Unit.findById(id).catch(() => null)
  if (!unit) throw new ApiError('Unit not found', 404)

  const nextStatus = parsed.data.status ?? unit.status
  const clearingTenant = 'tenantId' in parsed.data // explicitly sent as `null`
  if (unit.tenantId && nextStatus !== 'occupied' && !clearingTenant) {
    throw new ApiError('Unassign the tenant before changing this unit to vacant or maintenance', 409)
  }

  if (parsed.data.floor !== undefined) unit.floor = parsed.data.floor
  if (parsed.data.sizeSqft !== undefined) unit.sizeSqft = parsed.data.sizeSqft
  if (parsed.data.monthlyRent !== undefined) unit.monthlyRent = parsed.data.monthlyRent
  if (parsed.data.status !== undefined) unit.status = parsed.data.status
  if (clearingTenant) {
    unit.tenantId = undefined
    unit.tenantName = undefined
  }
  await unit.save()

  return NextResponse.json(toPublicUnit(unit))
})
