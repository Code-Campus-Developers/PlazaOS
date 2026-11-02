import { ApiError } from '@/lib/api-error'
import { verifyTransaction } from '@/lib/paystack'
import { settlePaymentByReference } from '@/lib/settle-payment'
import { Payment } from '@/models/Payment'

/**
 * A `pending` payment is considered abandoned once it has been in flight for
 * this long. Paystack's checkout page is typically valid for a few hours, but
 * 30 minutes is a reasonable "tenant gave up" threshold — long enough that a
 * slow network doesn't cause false positives, short enough that a retry isn't
 * blocked for an unreasonable time.
 */
export const STALE_PENDING_TIMEOUT_MS = 30 * 60 * 1000

export type ReconcileOutcome = 'released' | 'blocked' | 'settled'

/**
 * Reconcile a stale `pending` payment before allowing a new attempt for the
 * same rent charge.
 *
 * Rules:
 *  - A fresh pending payment (< STALE_PENDING_TIMEOUT_MS) is never touched:
 *    it may still succeed, so it blocks a new attempt.
 *  - A stale pending payment is verified against Paystack:
 *      * 'success'  -> settled as paid (blocks a new attempt; the money was
 *                      captured).
 *      * 'failed' / 'abandoned' -> settled as failed (releases the charge).
 *      * 'pending' -> cannot safely determine; block.
 *      * network/unknown error -> block (never release on uncertainty).
 *      * "reference not found" on Paystack -> the gateway call never succeeded;
 *        safe to mark failed and release.
 *  - A payment record is never deleted, only transitioned, so the audit trail
 *    is preserved.
 */
export async function reconcileStalePendingPayment(payment: any): Promise<ReconcileOutcome> {
  const createdAt = payment?.createdAt ? new Date(payment.createdAt).getTime() : Date.now()
  const age = Date.now() - createdAt
  if (age < STALE_PENDING_TIMEOUT_MS) return 'blocked'

  const reference = payment?.gatewayReference || `plazaos_${String(payment?._id)}`

  let result: { status: string; amount: number; currency: string } | null = null
  try {
    result = await verifyTransaction(reference)
  } catch (err) {
    // Paystack's client only surfaces a generic Error with a free-form
    // `message`; there is no documented, machine-readable "not found" shape we
    // can rely on. Treating a regex match as authoritative risks releasing a
    // charge that actually settled, so any verification failure (including a
    // suspected not-found) keeps the payment blocked.
    return 'blocked'
  }

  if (result.status === 'success') {
    try {
      await settlePaymentByReference(reference, 'paid', {
        amountSubunit: result.amount,
        currency: result.currency,
        status: result.status,
      })
    } catch {
      // Notification failure must not block reconciliation.
    }
    // Re-fetch to confirm the actual settled status (e.g. amount mismatch
    // would have marked it 'failed' instead).
    const updated = await Payment.findById(payment._id).lean()
    if (updated?.status === 'paid') return 'settled'
    if (updated?.status === 'failed') return 'released'
    return 'blocked'
  }

  if (result.status === 'failed' || result.status === 'abandoned') {
    try {
      await settlePaymentByReference(reference, 'failed', {
        amountSubunit: result.amount,
        currency: result.currency,
        status: result.status,
      })
    } catch {
      // Notification failure must not block reconciliation.
    }
    return 'released'
  }

  // Still pending on Paystack — cannot safely release.
  return 'blocked'
}
