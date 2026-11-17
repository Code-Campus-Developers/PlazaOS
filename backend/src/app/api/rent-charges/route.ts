import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { RentCharge } from '@/models/RentCharge'
import { Lease } from '@/models/Lease'
import { ANNUAL_RENT_PERIOD_REGEX, ensureAnnualRentChargeForLease } from '@/lib/annual-rent-charge'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

// Not part of BACKEND_BUILD_PLAN.md §3.2's original route table, but needed
// to wire up admin/payments/PaymentNew.tsx's "record an offline payment"
// form — `POST /payments` requires a `rentChargeId`, and the frontend needs
// a way to look up a tenant's outstanding charges to pick one. Mirrors
// `GET /tenant/rent-charges` (the tenant's own equivalent) but admin-only
// and scoped to a `tenantId` query param instead of the caller's own id.
export const GET = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenantId')
  if (!tenantId) throw new ApiError('tenantId is required', 400)

  await dbConnect()
  const lease = await Lease.findOne({ tenantId, status: 'active' }).sort({ startDate: -1 })
  if (lease) await ensureAnnualRentChargeForLease(lease)
  const docs = await RentCharge.find({
    tenantId,
    status: { $ne: 'paid' },
    period: { $regex: ANNUAL_RENT_PERIOD_REGEX },
  }).sort({ dueDate: 1 })

  return NextResponse.json({
    data: docs.map((doc) => ({
      id: doc._id.toString(),
      period: doc.period,
      amount: doc.amount,
      dueDate: doc.dueDate,
      status: doc.status,
    })),
  })
})
