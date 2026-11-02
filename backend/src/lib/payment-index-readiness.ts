import { ApiError } from '@/lib/api-error'
import { Payment } from '@/models/Payment'

/**
 * Verifies that the unique active-payment index on `Payment.rentChargeId` is
 * actually present on the MongoDB server. Mongoose's `autoIndex` is fire-and-
 * forget at connection time and can silently fail, so payment initiation must
 * not rely on it having succeeded.
 */
export async function ensureActivePaymentIndex(): Promise<void> {
  if (!Payment?.collection) return
  const indexes = await Payment.collection.indexes()
  const hasUniqueActive = indexes.some(
    (idx: any) =>
      idx?.unique === true &&
      idx?.key?.rentChargeId === 1 &&
      Array.isArray(idx?.partialFilterExpression?.status?.$in) &&
      idx.partialFilterExpression.status.$in.includes('pending') &&
      idx.partialFilterExpression.status.$in.includes('paid'),
  )
  if (!hasUniqueActive) {
    throw new ApiError('Payment index not available; refusing to initiate payment', 503)
  }
}
