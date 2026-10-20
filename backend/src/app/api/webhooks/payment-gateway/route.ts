import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { verifyPaystackSignature } from '@/lib/paystack'
import { settlePaymentByReference } from '@/lib/settle-payment'
import { refundPaymentByReference } from '@/lib/refund-payment'
import { Payment } from '@/models/Payment'

// Called by Paystack's servers, not the browser — no CORS/Bearer auth here.
// Trust comes entirely from verifying the `x-paystack-signature` header below,
// so never process the body before that check succeeds.
export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-paystack-signature')
  const rawBody = await request.text()

  // Verification can throw (e.g. PAYSTACK_SECRET_KEY is not configured). That
  // is a server misconfiguration, not a forged request, so it is reported as
  // a 500 — the body is still never processed, and Paystack will retry once
  // the deployment is fixed.
  let signatureValid: boolean
  try {
    signatureValid = verifyPaystackSignature(rawBody, signature)
  } catch (err) {
    console.error('Paystack webhook signature verification could not be performed', err)
    return NextResponse.json({ error: 'Webhook verification unavailable' }, { status: 500 })
  }

  if (!signatureValid) {
    console.error('Paystack webhook signature verification failed')
    return new NextResponse('Invalid signature', { status: 400 })
  }

  let event: {
    event: string
    data: {
      reference: string
      // `refund.succeeded` carries the original transaction's reference here
      // and the merchant's own reference in `merchant_reference`.
      merchant_reference?: string
      id?: number | string
      amount?: number
      currency?: string
      status?: string
    }
  }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Invalid payload', { status: 400 })
  }

  try {
    await dbConnect()

    if (event.event === 'charge.success') {
      const reference = event.data?.reference
      if (!reference) return new NextResponse('Invalid payload', { status: 400 })

      // Record the gateway's own transaction id for reconciliation.
      if (event.data.id !== undefined) {
        await Payment.updateOne(
          { gatewayReference: reference },
          { $set: { gatewayTransactionId: String(event.data.id) } },
        )
      }

      // The reference, amount, currency and status are all checked before a
      // payment is recorded as paid — a charge that does not match what we
      // recorded is refused rather than applied.
      const result = await settlePaymentByReference(reference, 'paid', {
        amountSubunit: event.data.amount,
        currency: event.data.currency,
        status: event.data.status,
      })

      if (!result.settled && result.reason !== 'unknown' && result.reason !== 'already-settled') {
        // Every refusal reason is logged, not just an amount mismatch: a
        // currency or status mismatch is equally a charge that was captured
        // but not applied, and an administrator must be able to find it.
        console.error('Paystack webhook charge did not match the recorded payment', {
          reference,
          reason: result.reason,
          detail: result.detail,
        })
      }
    } else if (event.event === 'charge.failed') {
      // Paystack does fire a failed-charge webhook; settling it keeps the
      // payment from sitting in 'pending' forever.
      const reference = event.data?.reference
      if (reference) {
        await settlePaymentByReference(reference, 'failed')
      }
    } else if (event.event === 'charge.refunded' || event.event === 'refund.succeeded') {
      // A refunded charge must be reversed: otherwise the tenant gets their
      // money back and still keeps a paid rent charge and a receipt for it.
      const reference = event.data?.reference || event.data?.merchant_reference
      if (reference) {
        const result = await refundPaymentByReference(reference, event.data.amount)
        if (!result.refunded && result.reason === 'partial-refund') {
          // Only part of the money came back, so the rent is still owed in
          // full. The payment records the refund and the charge stays paid.
          console.error('Paystack refund was partial — the rent charge remains paid', { reference })
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Failed to process Paystack webhook event', event.event, err)
    return new NextResponse('Webhook processing error', { status: 500 })
  }
}
