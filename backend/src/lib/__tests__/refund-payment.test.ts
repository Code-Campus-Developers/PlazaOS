import { describe, it, expect, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { refundPaymentByReference } from '@/lib/refund-payment'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { notifyPaymentOutcome } from '@/lib/notify-payment'

vi.mock('@/models/Payment', () => ({ Payment: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { findOne: vi.fn() } }))
vi.mock('@/lib/notify-payment', () => ({ notifyPaymentOutcome: vi.fn() }))
vi.mock('mongoose', () => ({ default: { startSession: vi.fn() } }))

function makePaidPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'payment-1',
    status: 'paid',
    rentChargeId: 'rent-charge-1',
    amount: 1200,
    currency: 'NGN',
    note: undefined,
    ...overrides,
  }
}

function makeCharge(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'rent-charge-1',
    status: 'paid',
    dueDate: '2999-01-01',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/** Mongoose chains `.session(...)` onto the query, so the mock must too. */
function mockChargeLookup(charge: unknown) {
  vi.mocked(RentCharge.findOne).mockReturnValue({
    session: vi.fn().mockResolvedValue(charge),
  } as never)
}

describe('refundPaymentByReference', () => {
  let session: {
    withTransaction: ReturnType<typeof vi.fn>
    endSession: ReturnType<typeof vi.fn>
  }
  let inTransaction: boolean
  let notifiedInsideTransaction: boolean

  beforeEach(() => {
    vi.clearAllMocks()
    inTransaction = false
    notifiedInsideTransaction = false
    session = {
      withTransaction: vi.fn(async (fn: () => Promise<void>) => {
        inTransaction = true
        try {
          await fn()
        } finally {
          inTransaction = false
        }
      }),
      endSession: vi.fn(),
    }
    vi.mocked(mongoose.startSession).mockResolvedValue(session as never)
    vi.mocked(notifyPaymentOutcome).mockImplementation(async () => {
      if (inTransaction) notifiedInsideTransaction = true
    })
  })

  it('does nothing for an unknown gateway reference', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(null as never)

    const result = await refundPaymentByReference('unknown-ref')

    expect(result).toEqual({ refunded: false, reason: 'unknown' })
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    expect(notifyPaymentOutcome).not.toHaveBeenCalled()
  })

  it('does not refund a payment that was never paid', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(makePaidPayment({ status: 'pending' }) as never)

    const result = await refundPaymentByReference('ref-1')

    expect(result).toEqual({ refunded: false, reason: 'not-paid' })
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    expect(RentCharge.findOne).not.toHaveBeenCalled()
  })

  it('reverses a fully refunded payment and puts its rent charge back to owing', async () => {
    // Without this, the tenant gets their money back *and* keeps a paid rent
    // charge and a receipt for it.
    const payment = makePaidPayment()
    const charge = makeCharge()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'refunded' } as never)
    mockChargeLookup(charge)

    const result = await refundPaymentByReference('ref-1', 1200 * 100)

    expect(result).toEqual({ refunded: true })
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'payment-1', status: 'paid' },
      { $set: { status: 'refunded', note: 'Refunded by the payment gateway.' } },
      expect.objectContaining({ new: true, session: expect.anything() }),
    )
    expect(charge.status).toBe('due')
    expect(charge.save).toHaveBeenCalledOnce()
    expect(notifyPaymentOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'refunded' }), 'refunded')
  })

  it('marks an overdue charge overdue again after a refund', async () => {
    const payment = makePaidPayment()
    const charge = makeCharge({ dueDate: '2000-01-01' })
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'refunded' } as never)
    mockChargeLookup(charge)

    await refundPaymentByReference('ref-1', 1200 * 100)

    expect(charge.status).toBe('overdue')
  })

  it('writes the payment and the rent charge in one transaction', async () => {
    const payment = makePaidPayment()
    const charge = makeCharge()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'refunded' } as never)
    mockChargeLookup(charge)

    await refundPaymentByReference('ref-1', 1200 * 100)

    // A crash between the two writes would leave a refunded payment against a
    // charge that still says paid.
    expect(session.withTransaction).toHaveBeenCalledOnce()
    expect(charge.save).toHaveBeenCalledWith(expect.objectContaining({ session: expect.anything() }))
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  it('notifies only after the transaction has committed', async () => {
    const payment = makePaidPayment()
    const charge = makeCharge()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'refunded' } as never)
    mockChargeLookup(charge)

    await refundPaymentByReference('ref-1', 1200 * 100)

    expect(notifiedInsideTransaction).toBe(false)
  })

  it('leaves the rent charge paid for a partial refund', async () => {
    // Only part of the money came back, so the rent is still owed in full.
    const payment = makePaidPayment()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

    const result = await refundPaymentByReference('ref-1', 500 * 100)

    expect(result).toEqual({ refunded: false, reason: 'partial-refund' })
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    expect(RentCharge.findOne).not.toHaveBeenCalled()
    expect(Payment.updateOne).toHaveBeenCalledWith(
      { _id: 'payment-1', status: 'paid' },
      { $set: { note: expect.stringContaining('Partial refund of 500 NGN') } },
    )
    expect(notifyPaymentOutcome).not.toHaveBeenCalled()
  })

  it('keeps an existing note when recording a partial refund', async () => {
    const payment = makePaidPayment({ note: 'Paid in cash at the office.' })
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

    await refundPaymentByReference('ref-1', 500 * 100)

    expect(Payment.updateOne).toHaveBeenCalledWith(
      { _id: 'payment-1', status: 'paid' },
      { $set: { note: expect.stringContaining('Paid in cash at the office.') } },
    )
  })

  it('is a no-op when the refund is replayed', async () => {
    const payment = makePaidPayment({ status: 'refunded' })
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

    const result = await refundPaymentByReference('ref-1', 1200 * 100)

    expect(result).toEqual({ refunded: false, reason: 'already-refunded' })
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    expect(notifyPaymentOutcome).not.toHaveBeenCalled()
  })

  it('is a no-op when another refund already won the transition', async () => {
    const payment = makePaidPayment()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    // The conditional update finds no `paid` payment any more.
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue(null as never)

    const result = await refundPaymentByReference('ref-1', 1200 * 100)

    expect(result).toEqual({ refunded: false, reason: 'already-refunded' })
    expect(RentCharge.findOne).not.toHaveBeenCalled()
    expect(notifyPaymentOutcome).not.toHaveBeenCalled()
  })
})
