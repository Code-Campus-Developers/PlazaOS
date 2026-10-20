import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { Unit } from '@/models/Unit'
import { Lease } from '@/models/Lease'
import { RentCharge } from '@/models/RentCharge'
import { ApiError } from '@/lib/api-error'
import { escapeRegex, parsePageParams } from '@/lib/list-query'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'
import {
  deliverInvitationEmail,
  issueAccountInvitation,
  recordInvitationDelivery,
  revokeInvitation,
} from '@/lib/account-invitation'

export { corsOptions as OPTIONS }

// The `User` model has no lease/rent fields of its own (see BACKEND_BUILD_PLAN.md
// §1/§14) — `leaseStart`/`leaseEnd`/`monthlyRent` come from the tenant's most
// recent active `Lease`, and `rentStatus` is derived from their outstanding
// `RentCharge`s (never a stored/directly-settable field — see the tenant
// `[id]` route's PATCH handler for why `rentStatus` is intentionally
// excluded from that endpoint's body).
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

const TENANT_SORT_FIELDS = ['name', 'unitNumber', 'leaseEnd', 'rentStatus'] as const

// §4's list-endpoint contract. Lease/RentCharge data lives in separate
// collections from `User`, so this fetches the (small, per-plaza) matching
// tenant set plus their leases/rent charges and joins/filters/sorts/paginates
// in memory — see BACKEND_BUILD_PLAN.md §4 ("a plaza's data volume doesn't
// need Atlas Search").
export const GET = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const rentStatus = searchParams.get('rentStatus')
  const accountStatus = searchParams.get('accountStatus')
  const sortBy = searchParams.get('sortBy') ?? 'name'
  const sortDir = searchParams.get('sortDir') === 'desc' ? -1 : 1
  const { page, pageSize } = parsePageParams(searchParams)

  if (!TENANT_SORT_FIELDS.includes(sortBy as (typeof TENANT_SORT_FIELDS)[number])) {
    throw new ApiError(`Invalid sortBy: ${sortBy}`, 400)
  }

  await dbConnect()
  const userFilter: Record<string, unknown> = { role: 'tenant' }
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: 'i' }
    userFilter.$or = [{ name: regex }, { email: regex }]
  }
  if (accountStatus && accountStatus !== 'all') userFilter.accountStatus = accountStatus

  const users = await User.find(userFilter)
  const userIds = users.map((user) => user._id)

  const [leases, charges] = await Promise.all([
    Lease.find({ tenantId: { $in: userIds }, status: 'active' }).sort({ startDate: -1 }),
    RentCharge.find({ tenantId: { $in: userIds }, status: { $in: ['due', 'overdue'] } }),
  ])

  const leaseByTenant = new Map<string, any>()
  for (const lease of leases) {
    const key = lease.tenantId.toString()
    if (!leaseByTenant.has(key)) leaseByTenant.set(key, lease)
  }
  const chargesByTenant = new Map<string, { status: string }[]>()
  for (const charge of charges) {
    const key = charge.tenantId.toString()
    const list = chargesByTenant.get(key) ?? []
    list.push({ status: charge.status })
    chargesByTenant.set(key, list)
  }

  let tenants = users.map((user) => {
    const key = user._id.toString()
    const derivedRentStatus = deriveRentStatus(chargesByTenant.get(key) ?? [])
    return toPublicTenant(user, leaseByTenant.get(key), derivedRentStatus)
  })

  if (rentStatus && rentStatus !== 'all') {
    tenants = tenants.filter((tenant) => tenant.rentStatus === rentStatus)
  }

  tenants.sort((a, b) => {
    let comparison = 0
    switch (sortBy) {
      case 'unitNumber':
        comparison = (a.unitNumber ?? '').localeCompare(b.unitNumber ?? '', undefined, { numeric: true })
        break
      case 'leaseEnd':
        comparison = (a.leaseEnd ?? '').localeCompare(b.leaseEnd ?? '')
        break
      case 'rentStatus':
        comparison = a.rentStatus.localeCompare(b.rentStatus)
        break
      default:
        comparison = a.name.localeCompare(b.name)
    }
    return sortDir === 1 ? comparison : -comparison
  })

  const total = tenants.length
  const start = (page - 1) * pageSize
  return NextResponse.json({ data: tenants.slice(start, start + pageSize), total, page, pageSize })
})

const createTenantSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    unitId: z.string().min(1),
    leaseStart: z.string().min(1),
    leaseEnd: z.string().min(1),
    monthlyRent: z.number().positive(),
  })
  .strict()

// Day-of-month a lease's rent is due, derived from its start date (Lease.rentDueDay
// is capped at 1-28 so it stays valid across every month, per BACKEND_BUILD_PLAN.md §1).
function rentDueDayFrom(leaseStart: string): number {
  const day = Number(leaseStart.slice(8, 10))
  return Number.isFinite(day) && day >= 1 ? Math.min(day, 28) : 1
}

// Tenant creation + unit assignment + lease creation must never partially
// succeed (e.g. a tenant created but the unit left vacant, or a unit marked
// occupied with no lease) — see BACKEND_BUILD_PLAN.md §5/§14. This requires a
// MongoDB deployment that supports transactions (a replica set — the default
// for MongoDB Atlas/Railway-hosted MongoDB, but NOT a bare standalone `mongod`).
export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'admin')
  const body = await request.json().catch(() => null)
  const parsed = createTenantSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('name, email, phone, unitId, leaseStart, leaseEnd, and monthlyRent are required', 400)

  await dbConnect()
  const email = parsed.data.email.toLowerCase()

  const session = await mongoose.startSession()
  let created:
    | {
        tenantId: string
        unitId: string
        unitNumber: string
        leaseId: string
        name: string
        rawToken: string
        invitationId: string
        expiresAt: Date
      }
    | undefined

  try {
    await session.withTransaction(async () => {
      const unit = await Unit.findById(parsed.data.unitId).session(session)
      if (!unit) throw new ApiError('Unit not found', 404)
      if (unit.status !== 'vacant') throw new ApiError('Unit is not vacant', 409)

      const existing = await User.findOne({ email }).session(session)
      if (existing) throw new ApiError('A user with this email already exists', 409)

      // The tenant is created WITHOUT a password: they choose their own via
      // the invitation link. There is no temp password, and no password is
      // ever known to the administrator.
      const [tenant] = await User.create(
        [
          {
            name: parsed.data.name,
            email,
            role: 'tenant',
            phone: parsed.data.phone,
            unitId: unit._id,
            unitNumber: unit.unitNumber,
            status: 'active',
            accountStatus: 'pending',
            mustChangePassword: true,
          },
        ],
        { session },
      )

      unit.status = 'occupied'
      unit.tenantId = tenant._id
      unit.tenantName = tenant.name
      await unit.save({ session })

      // A new Lease is always created, never overwriting a prior one — lease
      // history is preserved per tenant/unit (see BACKEND_BUILD_PLAN.md §14).
      const [lease] = await Lease.create(
        [
          {
            tenantId: tenant._id,
            unitId: unit._id,
            startDate: parsed.data.leaseStart,
            endDate: parsed.data.leaseEnd,
            rentAmount: parsed.data.monthlyRent,
            rentDueDay: rentDueDayFrom(parsed.data.leaseStart),
            status: 'active',
          },
        ],
        { session },
      )

      const invitation = await issueAccountInvitation(tenant._id, auth.sub, session)

      created = {
        tenantId: tenant._id.toString(),
        unitId: unit._id.toString(),
        unitNumber: unit.unitNumber,
        leaseId: lease._id.toString(),
        name: tenant.name,
        rawToken: invitation.rawToken,
        invitationId: invitation.invitationId,
        expiresAt: invitation.expiresAt,
      }
    })
  } finally {
    await session.endSession()
  }

  if (!created) throw new ApiError('Failed to create tenant', 500)

  // The email goes out after the transaction commits — network I/O must never
  // happen inside a transaction. The raw token is used here and then dropped;
  // it is never persisted, logged, or returned to the administrator.
  const delivery = await deliverInvitationEmail({
    to: email,
    name: created.name,
    rawToken: created.rawToken,
  })
  await recordInvitationDelivery(created.invitationId, delivery)

  if (delivery.status !== 'sent') {
    // The email never went out, so nobody holds a working token. Revoke it
    // and leave the account pending: the tenant still cannot log in, and the
    // administrator can send a new invitation. Reporting this honestly is
    // required — claiming "invitation sent" here would strand the tenant.
    await revokeInvitation(created.invitationId)
  }

  return NextResponse.json({
    success: true,
    id: created.tenantId,
    name: created.name,
    email,
    unitId: created.unitId,
    unitNumber: created.unitNumber,
    leaseId: created.leaseId,
    invitation: {
      delivered: delivery.status === 'sent',
      status: delivery.status,
      expiresAt: created.expiresAt.toISOString(),
    },
  })
})
