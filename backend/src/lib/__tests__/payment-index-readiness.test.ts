import { describe, expect, it, vi } from 'vitest'

vi.mock('@/models/Payment', () => ({
  Payment: {
    collection: {
      indexes: vi.fn(),
    },
  },
}))

describe('ensureActivePaymentIndex', () => {
  it('succeeds when required index present', async () => {
    const { Payment } = await import('@/models/Payment')
    ;(Payment.collection.indexes as any).mockResolvedValue([
      { unique: true, key: { rentChargeId: 1 }, partialFilterExpression: { status: { $in: ['pending', 'paid'] } } },
    ])
    const { ensureActivePaymentIndex } = await import('@/lib/payment-index-readiness')
    await expect(ensureActivePaymentIndex()).resolves.toBeUndefined()
  })

  it('fails closed when index missing', async () => {
    const { Payment } = await import('@/models/Payment')
    ;(Payment.collection.indexes as any).mockResolvedValue([])
    const { ensureActivePaymentIndex } = await import('@/lib/payment-index-readiness')
    await expect(ensureActivePaymentIndex()).rejects.toThrow(/index not available/i)
  })

  it('fails closed when metadata query throws', async () => {
    const { Payment } = await import('@/models/Payment')
    ;(Payment.collection.indexes as any).mockRejectedValue(new Error('boom'))
    const { ensureActivePaymentIndex } = await import('@/lib/payment-index-readiness')
    await expect(ensureActivePaymentIndex()).rejects.toThrow()
  })
})
