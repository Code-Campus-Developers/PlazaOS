import { ApiError } from '@/lib/api-error'
import { Payment } from '@/models/Payment'

type PaymentIndexMetadata = {
  unique?: boolean
  key?: Record<string, unknown>
  partialFilterExpression?: { status?: { $in?: string[] } }
}

function isActivePaymentIndex(indexes: unknown[]): boolean {
  return indexes.some((index) => {
    if (typeof index !== 'object' || index === null) return false
    const metadata = index as PaymentIndexMetadata
    const statuses = metadata.partialFilterExpression?.status?.$in
    return (
      metadata.unique === true &&
      metadata.key?.rentChargeId === 1 &&
      Array.isArray(statuses) &&
      statuses.includes('pending') &&
      statuses.includes('paid')
    )
  })
}

/**
 * Ensures the unique active-payment index on `Payment.rentChargeId` exists.
 * Mongoose's `autoIndex` is fire-and-forget at connection time and can silently
 * fail, so payment initiation creates and verifies the index before proceeding.
 */
export async function ensureActivePaymentIndex(): Promise<void> {
  if (!Payment?.collection) return
  let indexes = await Payment.collection.indexes()
  if (isActivePaymentIndex(indexes)) return

  try {
    await Payment.collection.createIndex(
      { rentChargeId: 1 },
      {
        unique: true,
        partialFilterExpression: { status: { $in: ['pending', 'paid'] } },
      },
    )
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new ApiError(
        'Payments are unavailable because multiple pending or paid payments exist for the same rent charge. Resolve the duplicate records before retrying.',
        503,
      )
    }
    throw error
  }

  indexes = await Payment.collection.indexes()
  if (!isActivePaymentIndex(indexes)) {
    throw new ApiError('Required payment safety index could not be created; refusing to initiate payment', 503)
  }
}
