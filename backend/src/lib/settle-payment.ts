import mongoose from 'mongoose'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { notifyPaymentOutcome } from './notify-payment'
import { toMinorUnits } from './currency'

export type SettlementOutcome = 'paid' | 'failed'

export type SettlementResult =
  /** The payment was settled by this call. */
  | { settled: true; outcome: SettlementOutcome }
  /** The gateway reference is not one we recorded. */
  | { settled: false; reason: 'unknown' }
  /** The payment was already settled, so it must not be re-processed. */
  | { settled: false; reason: 'already-settled' }
  /**
   * The gateway reported a successful charge, but it did not match the
   * amount/currency we recorded. The payment is refused (never marked paid)
   * so no incorrect balance deduction can happen.
   */
  | { settled: false; reason: 'amount-mismatch'; detail: string }
  | { settled: false; reason: 'currency-mismatch'; detail: string }
  | { settled: false; reason: 'status-mismatch'; detail: string }

/**
 * The gateway's own view of the transaction, used to confirm that what was
 * charged is what we recorded before marking a payment paid.
 */
export interface GatewayVerification {
  /** Amount in the currency's minor units (kobo for NGN). */
  amountSubunit?: number
  currency?: string
  /** The gateway's status string, e.g. 'success'. */
  status?: string
}

/**
 * Re-asserts that a paid payment's rent charge is also paid.
 *
 * The settlement below writes both inside one transaction, so they cannot
 * drift apart going forward. This repairs the cases that predate it (or that
 * a manual correction produced): a payment marked `paid` whose charge is
 * still unpaid is a tenant who owes rent they have already paid, and it can
 * never be re-settled because the payment is no longer `pending`.
 *
 * The write is conditional and idempotent, so it is safe to run on every
 * settle attempt, including a replayed webhook.
 */
async function ensureChargeIsPaid(payment: any): Promise<void> {
  if (!payment?.rentChargeId) return
  await RentCharge.findOneAndUpdate(
    { _id: payment.rentChargeId, status: { $ne: 'paid' } },
    { status: 'paid' },
  )
}

/**
 * Shared by the webhook and the tenant-facing verify-on-return route, so both
 * paths settle a gateway payment identically and idempotently.
 *
 * The status transition is a single conditional update, so exactly one of any
 * number of concurrent settle attempts can win — a replayed webhook can never
 * double-apply a payment or send duplicate notifications.
 *
 * The payment's status change and the linked rent charge's status change are
 * written in one MongoDB transaction. Without that, a crash between the two
 * writes would leave a `paid` payment against an unpaid rent charge: the
 * tenant would be billed for rent they had already paid, and the payment
 * could never be re-settled because it is no longer `pending`.
 */
export async function settlePaymentByReference(
  gatewayReference: string,
  outcome: SettlementOutcome,
  verification?: GatewayVerification,
): Promise<SettlementResult> {
  const payment = await Payment.findOne({ gatewayReference })
  // Unknown reference — never re-process.
  if (!payment) return { settled: false, reason: 'unknown' }

  if (payment.status !== 'pending') {
    // Already settled. A `paid` payment may still have an unpaid charge (a
    // pre-transaction crash), so repair that here — the idempotent write
    // makes the "paid implies paid charge" invariant converge.
    if (payment.status === 'paid') {
      await ensureChargeIsPaid(payment)
    }
    return { settled: false, reason: 'already-settled' }
  }

  // Confirm the gateway charged what we recorded before recording a success.
  if (outcome === 'paid' && verification) {
    if (verification.status && verification.status !== 'success') {
      const detail = `Gateway status was '${verification.status}', not 'success'.`
      await refuseSettlement(payment, detail)
      return { settled: false, reason: 'status-mismatch', detail }
    }
    if (verification.currency && verification.currency !== payment.currency) {
      const detail = `Gateway charged in ${verification.currency}, expected ${payment.currency}.`
      await refuseSettlement(payment, detail)
      return { settled: false, reason: 'currency-mismatch', detail }
    }
    if (
      verification.amountSubunit !== undefined &&
      verification.amountSubunit !== toMinorUnits(payment.amount, payment.currency)
    ) {
      const detail = `Gateway charged ${verification.amountSubunit} minor units, expected ${toMinorUnits(
        payment.amount,
        payment.currency,
      )}.`
      await refuseSettlement(payment, detail)
      return { settled: false, reason: 'amount-mismatch', detail }
    }
  }
  // Atomic, conditional status transition: only the caller that actually
  // flips `pending` -> terminal wins, so notifications are sent once. The
  // rent charge is moved in the same transaction, so a payment is never
  // recorded as paid against a charge that is still outstanding.
  const session = await mongoose.startSession()
  let settled: any
  try {
    await session.withTransaction(async () => {
      const updated = await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        { $set: { status: outcome } },
        { new: true, session },
      )
      if (!updated) return
      settled = updated

      // A failed payment must never mark its RentCharge paid.
      if (outcome === 'paid' && updated.rentChargeId) {
        await RentCharge.findOneAndUpdate(
          { _id: updated.rentChargeId, status: { $ne: 'paid' } },
          { status: 'paid' },
          { session },
        )
      }
    })
  } finally {
    await session.endSession()
  }

  if (!settled) return { settled: false, reason: 'already-settled' }

  // The notification is sent after the transaction commits: it does network
  // I/O, which must never happen inside a transaction, and a notification
  // failure must not roll back a payment that is genuinely settled.
  await notifyPaymentOutcome(settled, outcome)

  return { settled: true, outcome }
}

/**
 * Records a settlement that was refused because the gateway's figures did not
 * match ours. The payment is left unapplied (its charge is not marked paid)
 * and the reason is stored on the payment so an administrator can see it.
 *
 * The tenant and the administrator are both notified: a charge that was
 * captured but not applied must never be silent, or the money is simply lost
 * and nobody knows to reconcile it.
 */
async function refuseSettlement(payment: any, detail: string): Promise<void> {
  console.error('Refused to settle payment: gateway figures did not match', {
    paymentId: payment._id.toString(),
    gatewayReference: payment.gatewayReference,
    detail,
  })
  await Payment.updateOne(
    { _id: payment._id, status: 'pending' },
    { $set: { status: 'failed', note: `Payment not applied: ${detail}` } },
  )
  await notifyPaymentOutcome(payment, 'failed', `Payment not applied: ${detail}`)
}
