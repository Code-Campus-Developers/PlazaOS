import mongoose from 'mongoose'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { notifyPaymentOutcome } from './notify-payment'
import { fromMinorUnits, toMinorUnits } from './currency'

export type RefundResult =
  /** The payment was refunded and its rent charge was put back to owing. */
  | { refunded: true }
  /** The reference is not one we recorded. */
  | { refunded: false; reason: 'unknown' }
  /** The payment is not in a refundable state. */
  | { refunded: false; reason: 'not-paid' | 'already-refunded' }
  /**
   * Only part of the charge was returned, so the rent is still owed in full
   * and the charge stays paid.
   */
  | { refunded: false; reason: 'partial-refund' }

/** Today's date as `YYYY-MM-DD`, the format a RentCharge's dueDate uses. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Reverses a settled payment that the gateway refunded.
 *
 * Without this, a refunded payment stays `paid` and its rent charge stays
 * `paid`: the tenant gets their money back *and* keeps a paid rent charge
 * and a receipt for money they no longer paid.
 *
 * The payment's status change and the rent charge's status change are written
 * in one MongoDB transaction, so a crash cannot leave a refunded payment
 * against a charge that is still marked paid.
 *
 * Idempotent: the transition is conditional on the payment still being
 * `paid`, so a replayed refund webhook is a no-op.
 *
 * @param refundedAmountSubunit the amount the gateway says it returned, in
 *   the currency's minor units. A partial refund does not cancel the rent
 *   obligation, so the charge is left paid and only recorded.
 */
export async function refundPaymentByReference(
  gatewayReference: string,
  refundedAmountSubunit?: number,
): Promise<RefundResult> {
  const payment = await Payment.findOne({ gatewayReference })
  if (!payment) return { refunded: false, reason: 'unknown' }
  if (payment.status === 'refunded') return { refunded: false, reason: 'already-refunded' }
  if (payment.status !== 'paid') return { refunded: false, reason: 'not-paid' }

  const chargedSubunit = toMinorUnits(payment.amount, payment.currency)

  if (refundedAmountSubunit !== undefined && refundedAmountSubunit < chargedSubunit) {
    // A partial refund leaves the rent owed in full, so the charge stays
    // paid. The refund is recorded on the payment and an administrator is
    // alerted — the tenant still owes the balance.
    const refunded = fromMinorUnits(refundedAmountSubunit, payment.currency)
    const note = payment.note
      ? `${payment.note} | Partial refund of ${refunded} ${payment.currency} received.`
      : `Partial refund of ${refunded} ${payment.currency} received.`
    await Payment.updateOne({ _id: payment._id, status: 'paid' }, { $set: { note } })
    console.error('Partial refund received — the rent charge remains paid', {
      paymentId: payment._id.toString(),
      gatewayReference,
      refundedAmountSubunit,
      chargedSubunit,
    })
    return { refunded: false, reason: 'partial-refund' }
  }

  const session = await mongoose.startSession()
  let refundedPayment: any
  try {
    await session.withTransaction(async () => {
      const updated = await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'paid' },
        { $set: { status: 'refunded', note: 'Refunded by the payment gateway.' } },
        { new: true, session },
      )
      if (!updated) return
      refundedPayment = updated

      if (!updated.rentChargeId) return

      // The rent is owed again. `dueDate` is a `YYYY-MM-DD` string, so it
      // compares correctly against today's date in the same format.
      const charge = await RentCharge.findOne({ _id: updated.rentChargeId }).session(session)
      if (!charge || charge.status !== 'paid') return
      charge.status = charge.dueDate && charge.dueDate < todayIsoDate() ? 'overdue' : 'due'
      await charge.save({ session })
    })
  } finally {
    await session.endSession()
  }

  if (!refundedPayment) return { refunded: false, reason: 'already-refunded' }

  // Sent after the transaction commits — network I/O must never happen inside
  // a transaction, and a notification failure must not undo a refund that
  // really happened.
  await notifyPaymentOutcome(refundedPayment, 'refunded')

  return { refunded: true }
}
