import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { RentCharge } from '@/models/RentCharge'
import { Lease } from '@/models/Lease'
import { ANNUAL_RENT_PERIOD_REGEX, ensureAnnualRentChargeForLease } from '@/lib/annual-rent-charge'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

// Lets the tenant see which of their own rent charges are payable before
// initiating a gateway payment against one — see BACKEND_BUILD_PLAN.md §7.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'tenant')

  await dbConnect()
  const lease = await Lease.findOne({ tenantId: auth.sub, status: 'active' }).sort({ startDate: -1 })
  if (lease) await ensureAnnualRentChargeForLease(lease)
  const docs = await RentCharge.find({
    tenantId: auth.sub,
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
