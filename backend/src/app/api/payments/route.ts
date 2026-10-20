import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { User } from '@/models/User'
import { ApiError } from '@/lib/api-error'
import { notifyPaymentOutcome } from '@/lib/notify-payment'
import { escapeRegex, parsePageParams } from '@/lib/list-query'
import { CURRENCY } from '@/lib/currency'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

function toPublicPayment(doc: any, recordedByName?: string) {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    tenantName: doc.tenantName,
    unitNumber: doc.unitNumber,
    amount: doc.amount,
    method: doc.method,
    status: doc.status,
    date: doc.date,
    note: doc.note,
    recordedBy: recordedByName,
    receiptAvailable: doc.status === 'paid',
  }
}

const PAYMENT_SORT_FIELDS = ['date', 'tenantName', 'amount'] as const

// §4's list-endpoint contract — `tenantName`/`unitNumber` are already
// denormalized onto `Payment`, so this is a plain single-collection query.
export const GET = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const status = searchParams.get('status')
  const method = searchParams.get('method')
  const sortBy = searchParams.get('sortBy') ?? 'date'
  const sortDir = searchParams.get('sortDir') === 'desc' ? -1 : 1
  const { page, pageSize } = parsePageParams(searchParams)

  if (!PAYMENT_SORT_FIELDS.includes(sortBy as (typeof PAYMENT_SORT_FIELDS)[number])) {
    throw new ApiError(`Invalid sortBy: ${sortBy}`, 400)
  }

  await dbConnect()
  const filter: Record<string, unknown> = {}
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: 'i' }
    filter.$or = [{ tenantName: regex }, { unitNumber: regex }]
  }
  if (status && status !== 'all') filter.status = status
  if (method && method !== 'all') filter.method = method

  const [docs, total] = await Promise.all([
    Payment.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    Payment.countDocuments(filter),
  ])

  const recordedByIds = docs.map((doc) => doc.recordedBy).filter((id): id is NonNullable<typeof id> => Boolean(id))
  const admins = recordedByIds.length ? await User.find({ _id: { $in: recordedByIds } }) : []
  const adminNameById = new Map(admins.map((admin) => [admin._id.toString(), admin.name]))

  return NextResponse.json({
    data: docs.map((doc) => toPublicPayment(doc, doc.recordedBy ? adminNameById.get(doc.recordedBy.toString()) : undefined)),
    total,
    page,
    pageSize,
  })
})

const createOfflinePaymentSchema = z
  .object({
    rentChargeId: z.string().min(1),
    method: z.enum(['cash', 'bank_transfer', 'check']),
    date: z.string().min(1),
    note: z.string().optional(),
  })
  .strict()

// Admin-recorded offline payments only (`method` excludes `'gateway'`) — these
// are entered directly as `paid` since the money has already changed hands
// outside the app; see BACKEND_BUILD_PLAN.md §7. The amount always comes from
// the referenced `RentCharge`, never from the request body.
export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'admin')
  const body = await request.json().catch(() => null)
  const parsed = createOfflinePaymentSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('rentChargeId, method, and date are required', 400)

  await dbConnect()
  const rentCharge = await RentCharge.findById(parsed.data.rentChargeId).catch(() => null)
  if (!rentCharge) throw new ApiError('Rent charge not found', 404)
  if (rentCharge.status === 'paid') throw new ApiError('This rent charge has already been paid', 409)

  const tenant = await User.findOne({ _id: rentCharge.tenantId, role: 'tenant' })
  if (!tenant) throw new ApiError('Tenant not found', 404)

  // One *live* payment per rent charge — a second record for the same period
  // would double-count the amount against the tenant's balance. A refunded
  // or failed payment does not count: the money came back (or never
  // arrived), so the period can legitimately be paid again.
  const existing = await Payment.findOne({
    rentChargeId: rentCharge._id,
    status: { $in: ['pending', 'paid'] },
  })
  if (existing) throw new ApiError('A payment for this rent charge already exists', 409)

  // The payment record and the rent charge's status are written in one
  // transaction, so a failure between them can never leave a `paid` payment
  // against a charge that is still outstanding (a tenant billed for rent they
  // already paid, with no way to re-settle it).
  const session = await mongoose.startSession()
  let payment: any
  try {
    await session.withTransaction(async () => {
      const [created] = await Payment.create(
        [
          {
            tenantId: tenant._id,
            tenantName: tenant.name,
            unitId: rentCharge.unitId,
            unitNumber: tenant.unitNumber ?? 'unassigned',
            rentChargeId: rentCharge._id,
            amount: rentCharge.amount,
            currency: CURRENCY,
            method: parsed.data.method,
            status: 'paid',
            date: parsed.data.date,
            note: parsed.data.note,
            recordedBy: auth.sub,
          },
        ],
        { session },
      )
      payment = created

      rentCharge.status = 'paid'
      await rentCharge.save({ session })
    })
  } finally {
    await session.endSession()
  }

  // After the transaction commits — the notification does network I/O, which
  // must never happen inside a transaction, and a notification failure must
  // not undo a payment that was genuinely recorded.
  await notifyPaymentOutcome(payment, 'paid')

  return NextResponse.json({ success: true, id: payment._id.toString() })
})

