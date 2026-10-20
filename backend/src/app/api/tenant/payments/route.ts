import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { User } from '@/models/User'
import { ApiError } from '@/lib/api-error'
import { buildReceiptUrl } from '@/lib/receipt-token'
import { initializeTransaction, paystackCurrency } from '@/lib/paystack'
import { publicAppUrl } from '@/lib/app-url'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

function toPublicPayment(payment: any, origin: string) {
  return {
    id: payment._id.toString(),
    amount: payment.amount,
    date: payment.date,
    method: payment.method,
    status: payment.status,
    receiptUrl: payment.status === 'paid' ? buildReceiptUrl(origin, payment._id.toString(), payment.tenantId.toString()) : undefined,
  }
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'tenant')
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 10))

  await dbConnect()
  const filter = { tenantId: auth.sub }
  const [docs, total] = await Promise.all([
    Payment.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    Payment.countDocuments(filter),
  ])

  return NextResponse.json({ data: docs.map((doc) => toPublicPayment(doc, request.nextUrl.origin)), total })
})

const createPaymentSchema = z
  .object({
    rentChargeId: z.string().min(1),
  })
  .strict()

// Creates a `pending` Payment for a specific, tenant-owned `RentCharge`, then
// starts a Paystack transaction for it — the amount always comes from the
// RentCharge record, never from the request body (see BACKEND_BUILD_PLAN.md §7).
// We only ever respond `success: true` once the gateway call itself has
// succeeded — the actual `paid`/`failed` transition happens asynchronously via
// the /webhooks/payment-gateway route once Paystack confirms the outcome, never here.
export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'tenant')
  const body = await request.json().catch(() => null)
  const parsed = createPaymentSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('A rentChargeId is required', 400)

  await dbConnect()
  const user = await User.findById(auth.sub)
  if (!user) throw new ApiError('Not found', 404)

  const rentCharge = await RentCharge.findById(parsed.data.rentChargeId).catch(() => null)
  if (!rentCharge || rentCharge.tenantId.toString() !== auth.sub) throw new ApiError('Rent charge not found', 404)
  if (rentCharge.status === 'paid') throw new ApiError('This rent charge has already been paid', 409)
  if (rentCharge.status === 'upcoming') throw new ApiError('This rent charge is not due yet', 400)

  // One payment per rent charge: a second in-flight transaction for the same
  // charge would let the tenant be charged twice for one period.
  const existing = await Payment.findOne({
    rentChargeId: rentCharge._id,
    status: { $in: ['pending', 'paid'] },
  })
  if (existing) {
    throw new ApiError(
      existing.status === 'paid'
        ? 'This rent charge has already been paid'
        : 'A payment for this rent charge is already in progress',
      409,
    )
  }

  // Resolve the callback URL before any record is created: a misconfigured
  // FRONTEND_URL must fail loudly, and it must not leave a `pending` payment
  // behind that would block the tenant from ever retrying this charge.
  const frontendUrl = publicAppUrl()

  const payment = await Payment.create({
    tenantId: user._id,
    tenantName: user.name,
    unitId: user.unitId,
    unitNumber: user.unitNumber ?? 'unassigned',
    rentChargeId: rentCharge._id,
    amount: rentCharge.amount,
    currency: paystackCurrency(),
    method: 'gateway',
    status: 'pending',
    date: new Date().toISOString().slice(0, 10),
  })

  const reference = `plazaos_${payment._id.toString()}`

  try {
    const transaction = await initializeTransaction({
      email: user.email,
      amount: rentCharge.amount,
      reference,
      callbackUrl: `${frontendUrl}/tenant/payments`,
      metadata: { paymentId: payment._id.toString(), rentChargeId: rentCharge._id.toString(), tenantId: user._id.toString() },
    })

    payment.gatewayReference = transaction.reference
    await payment.save()

    return NextResponse.json({ success: true, id: payment._id.toString(), checkoutUrl: transaction.authorization_url })
  } catch (err) {
    // The gateway call failed — don't leave a dangling pending record behind,
    // and don't report success (per §7, success must follow a real gateway success).
    await Payment.findByIdAndDelete(payment._id)
    console.error('Failed to initialize Paystack transaction', err)
    throw new ApiError('Unable to start payment. Please try again.', 502)
  }
})
