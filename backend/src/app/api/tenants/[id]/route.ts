import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { Lease } from '@/models/Lease'
import { RentCharge } from '@/models/RentCharge'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

function deriveRentStatus(charges: { status: string }[]): 'paid' | 'due' | 'overdue' {
  if (charges.some((charge) => charge.status === 'overdue')) return 'overdue'
  if (charges.some((charge) => charge.status === 'due')) return 'due'
  return 'paid'
}

function toPublicTenant(user: any, lease: any, rentStatus: 'paid' | 'due' | 'overdue') {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    unitId: user.unitId ? user.unitId.toString() : undefined,
    unitNumber: user.unitNumber,
    leaseStart: lease?.startDate,
    leaseEnd: lease?.endDate,
    monthlyRent: lease?.rentAmount,
    rentStatus,
    status: user.status,
    accountStatus: user.accountStatus,
    mustChangePassword: user.mustChangePassword,
  }
}

async function loadTenant(id: string) {
  const user = await User.findOne({ _id: id, role: 'tenant' }).catch(() => null)
  if (!user) return null
  const [lease, charges] = await Promise.all([
    Lease.findOne({ tenantId: user._id, status: 'active' }).sort({ startDate: -1 }),
    RentCharge.find({ tenantId: user._id, status: { $in: ['due', 'overdue'] } }),
  ])
  return { user, lease, rentStatus: deriveRentStatus(charges.map((charge) => ({ status: charge.status }))) }
}

export const GET = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  await dbConnect()
  const found = await loadTenant(id)
  if (!found) throw new ApiError('Tenant not found', 404)
  return NextResponse.json(toPublicTenant(found.user, found.lease, found.rentStatus))
})

// `rentStatus` is intentionally NOT accepted here: it's derived from the
// tenant's real `RentCharge` records (see GET above), so it can only change
// as a side effect of an actual settled `Payment` (see `POST /payments`) —
// never a raw admin field edit. This is a deliberate deviation from
// BACKEND_BUILD_PLAN.md §3.2's original table (which listed `rentStatus` as
// tenant-PATCHable) to preserve the "a payment marks only its linked rent
// charge paid" invariant established for `POST /payments`. `leaseEnd`/
// `monthlyRent` update the tenant's current active `Lease`, not `User`
// (which has no lease fields at all).
const updateTenantSchema = z
  .object({
    leaseEnd: z.string().min(1).optional(),
    monthlyRent: z.number().positive().optional(),
    accountStatus: z.enum(['temporary', 'active']).optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update' })

export const PATCH = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = updateTenantSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('Invalid tenant update', 400)

  await dbConnect()
  const found = await loadTenant(id)
  if (!found) throw new ApiError('Tenant not found', 404)

  if (parsed.data.accountStatus !== undefined) {
    // An account with no password can only ever be waiting for setup: the
    // login route rejects accounts without a passwordHash, and an invitation
    // can only be redeemed while the account is 'pending'. Marking such an
    // account 'active' or 'temporary' would leave the tenant unable to sign
    // in *and* their outstanding invitation unredeemable — a one-way door
    // with no way back for the tenant.
    if (!found.user.passwordHash) {
      throw new ApiError(
        'This tenant has not set up a password yet. Send a setup invitation first.',
        409,
      )
    }
    found.user.accountStatus = parsed.data.accountStatus
  }
  if (parsed.data.mustChangePassword !== undefined) found.user.mustChangePassword = parsed.data.mustChangePassword
  await found.user.save()

  if (parsed.data.leaseEnd !== undefined || parsed.data.monthlyRent !== undefined) {
    if (!found.lease) throw new ApiError('This tenant has no active lease to update', 409)
    if (parsed.data.leaseEnd !== undefined) found.lease.endDate = parsed.data.leaseEnd
    if (parsed.data.monthlyRent !== undefined) found.lease.rentAmount = parsed.data.monthlyRent
    await found.lease.save()
  }

  return NextResponse.json(toPublicTenant(found.user, found.lease, found.rentStatus))
})
