import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Payment } from '@/models/Payment'
import { ApiError } from '@/lib/api-error'
import { verifyTransaction } from '@/lib/paystack'
import { settlePaymentByReference } from '@/lib/settle-payment'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export { corsOptions as OPTIONS }

// Called by the frontend once Paystack redirects the tenant back — a real
// status re-check via Paystack's Verify Transaction API, since Paystack
// doesn't reliably deliver a webhook for a failed/abandoned one-off charge.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'tenant')
  const reference = request.nextUrl.searchParams.get('reference')
  if (!reference) throw new ApiError('A reference is required', 400)

  // Every call makes a live outbound Paystack request, so it is metered per
  // tenant and per source IP.
  rateLimit(`verify-payment:${auth.sub}`, 30, 15 * 60_000)
  rateLimit(`verify-payment:ip:${clientIp(request)}`, 60, 15 * 60_000)

  await dbConnect()
  const payment = await Payment.findOne({ gatewayReference: reference })
  if (!payment || payment.tenantId.toString() !== auth.sub) throw new ApiError('Payment not found', 404)

  if (payment.status === 'pending') {
    const result = await verifyTransaction(reference)

    // Only a *terminal* gateway outcome may close the payment.
    //
    // 'success' settles it as paid; 'failed' and 'abandoned' both mean no
    // money was captured, so they settle as failed and release the rent
    // charge for another attempt.
    //
    // 'pending' is NOT terminal: the charge can still succeed, and a later
    // `charge.success` webhook is what settles it. Settling it as failed here
    // would make that webhook a no-op — the money would be captured but never
    // applied to the rent charge, and the tenant could be charged twice.
    if (result.status === 'success') {
      // The gateway's own amount and currency are checked against what we
      // recorded before the payment is marked paid.
      await settlePaymentByReference(reference, 'paid', {
        amountSubunit: result.amount,
        currency: result.currency,
        status: result.status,
      })
    } else if (result.status === 'failed' || result.status === 'abandoned') {
      await settlePaymentByReference(reference, 'failed', {
        amountSubunit: result.amount,
        currency: result.currency,
        status: result.status,
      })
    }
  }

  const settled = await Payment.findById(payment._id)
  if (!settled) throw new ApiError('Payment not found', 404)
  return NextResponse.json({ id: settled._id.toString(), status: settled.status })
})
