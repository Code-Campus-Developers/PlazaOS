import { describe, expect, it, vi } from 'vitest'

vi.mock('@/models/Payment', () => ({
  Payment: {
    collection: {
      indexes: vi.fn(),
      createIndex: vi.fn(),
    },
  },
}))

describe('ensureActivePaymentIndex', () => {
  it('creates the required unique partial index when it is missing', async () => {
    const { Payment } = await import('@/models/Payment')
    const activeIndex = {
      unique: true,
      key: { rentChargeId: 1 },
      partialFilterExpression: { status: { $in: ['pending', 'paid'] } },
    }
    let indexes: typeof activeIndex[] = []
    ;(Payment.collection.indexes as any).mockImplementation(async () => indexes)
    ;(Payment.collection.createIndex as any).mockImplementation(async () => {
      indexes = [activeIndex]
      return 'rentChargeId_1'
    })

    const { ensureActivePaymentIndex } = await import('@/lib/payment-index-readiness')
    await expect(ensureActivePaymentIndex()).resolves.toBeUndefined()
    expect(Payment.collection.createIndex).toHaveBeenCalledWith(
      { rentChargeId: 1 },
      { unique: true, partialFilterExpression: { status: { $in: ['pending', 'paid'] } } },
    )
  })

  it('succeeds when required index present', async () => {
    const { Payment } = await import('@/models/Payment')
    ;(Payment.collection.indexes as any).mockResolvedValue([
      { unique: true, key: { rentChargeId: 1 }, partialFilterExpression: { status: { $in: ['pending', 'paid'] } } },
    ])
    const { ensureActivePaymentIndex } = await import('@/lib/payment-index-readiness')
    await expect(ensureActivePaymentIndex()).resolves.toBeUndefined()
  })

  it('fails closed when duplicate active payments prevent index creation', async () => {
    const { Payment } = await import('@/models/Payment')
    ;(Payment.collection.indexes as any).mockResolvedValue([])
    ;(Payment.collection.createIndex as any).mockRejectedValue({ code: 11000 })
    const { ensureActivePaymentIndex } = await import('@/lib/payment-index-readiness')
    await expect(ensureActivePaymentIndex()).rejects.toThrow(/multiple pending or paid payments/i)
  })

  it('fails closed when metadata query throws', async () => {
    const { Payment } = await import('@/models/Payment')
    ;(Payment.collection.indexes as any).mockRejectedValue(new Error('boom'))
    const { ensureActivePaymentIndex } = await import('@/lib/payment-index-readiness')
    await expect(ensureActivePaymentIndex()).rejects.toThrow()
  })
})
