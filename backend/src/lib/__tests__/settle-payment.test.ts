import { describe, it, expect, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { settlePaymentByReference } from '@/lib/settle-payment'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { notifyPaymentOutcome } from '@/lib/notify-payment'

vi.mock('@/models/Payment', () => ({ Payment: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { findOneAndUpdate: vi.fn() } }))
vi.mock('@/lib/notify-payment', () => ({ notifyPaymentOutcome: vi.fn() }))
vi.mock('mongoose', () => ({ default: { startSession: vi.fn() } }))

function makePendingPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'payment-1',
    status: 'pending',
    rentChargeId: 'rent-charge-1',
    amount: 1200,
    currency: 'NGN',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('settlePaymentByReference', () => {
  let session: {
    withTransaction: ReturnType<typeof vi.fn>
    endSession: ReturnType<typeof vi.fn>
    abortTransaction: ReturnType<typeof vi.fn>
  }
  /** True while the simulated transaction's callback is running. */
  let inTransaction: boolean
  /** True if the notification was emitted from inside the transaction. */
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
      abortTransaction: vi.fn(),
    }
    vi.mocked(mongoose.startSession).mockResolvedValue(session as never)
    vi.mocked(notifyPaymentOutcome).mockImplementation(async () => {
      if (inTransaction) notifiedInsideTransaction = true
    })
  })

  it('marks the linked RentCharge paid only when the outcome is paid', async () => {
    const payment = makePendingPayment()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'paid' } as never)

    const result = await settlePaymentByReference('ref-1', 'paid')

    expect(result).toEqual({ settled: true, outcome: 'paid' })
    expect(RentCharge.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'rent-charge-1', status: { $ne: 'paid' } },
      { status: 'paid' },
      expect.objectContaining({ session: expect.anything() }),
    )
    expect(notifyPaymentOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }), 'paid')
  })

  it('writes the payment and the rent charge inside one transaction', async () => {
    const payment = makePendingPayment()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'paid' } as never)

    await settlePaymentByReference('ref-1', 'paid')

    // A crash between the two writes would leave a `paid` payment against an
    // unpaid rent charge — a tenant billed for rent they already paid, with
    // no way to re-settle it. One transaction rules that out.
    expect(session.withTransaction).toHaveBeenCalledOnce()
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'payment-1', status: 'pending' },
      { $set: { status: 'paid' } },
      expect.objectContaining({ new: true, session: expect.anything() }),
    )
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  it('notifies only after the transaction has committed', async () => {
    const payment = makePendingPayment()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'paid' } as never)

    await settlePaymentByReference('ref-1', 'paid')

    // The notification does network I/O, which must never happen inside a
    // transaction.
    expect(notifiedInsideTransaction).toBe(false)
  })

  it('never marks the RentCharge paid on a failed outcome', async () => {
    const payment = makePendingPayment()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'failed' } as never)

    await settlePaymentByReference('ref-1', 'failed')

    expect(RentCharge.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('repairs a paid payment whose rent charge is still unpaid', async () => {
    // A payment marked `paid` against an unpaid charge is a tenant who owes
    // rent they already paid, and it can never be re-settled because the
    // payment is no longer `pending`.
    const payment = makePendingPayment({ status: 'paid' })
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

    const result = await settlePaymentByReference('ref-1', 'paid')

    expect(result).toEqual({ settled: false, reason: 'already-settled' })
    expect(RentCharge.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'rent-charge-1', status: { $ne: 'paid' } },
      { status: 'paid' },
    )
    // The repair is idempotent, so no second notification is sent.
    expect(notifyPaymentOutcome).not.toHaveBeenCalled()
  })

  it('is a no-op (idempotent) once a failed payment is no longer pending', async () => {
    const payment = makePendingPayment({ status: 'failed' })
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

    // Simulates a duplicate/replayed Paystack webhook for an already-settled payment.
    const result = await settlePaymentByReference('ref-1', 'paid')

    expect(result).toEqual({ settled: false, reason: 'already-settled' })
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    expect(RentCharge.findOneAndUpdate).not.toHaveBeenCalled()
    expect(notifyPaymentOutcome).not.toHaveBeenCalled()
  })

  it('is a no-op for an unknown gateway reference', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(null as never)

    const result = await settlePaymentByReference('unknown-ref', 'paid')

    expect(result).toEqual({ settled: false, reason: 'unknown' })
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    expect(RentCharge.findOneAndUpdate).not.toHaveBeenCalled()
    expect(notifyPaymentOutcome).not.toHaveBeenCalled()
  })

  it('only one of several concurrent settles wins the transition', async () => {
    const payment = makePendingPayment()
    vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
    // The second caller loses the conditional update because the payment is
    // no longer 'pending'.
    vi.mocked(Payment.findOneAndUpdate)
      .mockResolvedValueOnce({ ...payment, status: 'paid' } as never)
      .mockResolvedValueOnce(null as never)

    const [first, second] = await Promise.all([
      settlePaymentByReference('ref-1', 'paid'),
      settlePaymentByReference('ref-1', 'paid'),
    ])

    expect(first.settled).toBe(true)
    expect(second.settled).toBe(false)
    expect(notifyPaymentOutcome).toHaveBeenCalledTimes(1)
  })

  describe('gateway verification', () => {
    beforeEach(() => {
      vi.mocked(Payment.updateOne).mockResolvedValue({} as never)
    })

    it('refuses to settle when the gateway amount does not match', async () => {
      const payment = makePendingPayment()
      vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

      const result = await settlePaymentByReference('ref-1', 'paid', { amountSubunit: 999_99 })

      expect(result.settled).toBe(false)
      expect(result).toMatchObject({ reason: 'amount-mismatch' })
      // The payment must not be marked paid, and its charge must not be.
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
      expect(RentCharge.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('notifies the tenant and the administrator about a refused settlement', async () => {
      // A charge that was captured but not applied must never be silent, or
      // the money is simply lost and nobody knows to reconcile it.
      const payment = makePendingPayment()
      vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

      await settlePaymentByReference('ref-1', 'paid', { amountSubunit: 999_99 })

      expect(notifyPaymentOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'payment-1' }),
        'failed',
        expect.stringContaining('Payment not applied'),
      )
    })

    it('refuses to settle when the currency does not match', async () => {
      const payment = makePendingPayment()
      vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

      const result = await settlePaymentByReference('ref-1', 'paid', { currency: 'USD' })

      expect(result).toMatchObject({ settled: false, reason: 'currency-mismatch' })
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('refuses to settle when the gateway status is not a success', async () => {
      const payment = makePendingPayment()
      vi.mocked(Payment.findOne).mockResolvedValue(payment as never)

      const result = await settlePaymentByReference('ref-1', 'paid', { status: 'failed' })

      expect(result).toMatchObject({ settled: false, reason: 'status-mismatch' })
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('settles when the gateway amount and currency match', async () => {
      const payment = makePendingPayment()
      vi.mocked(Payment.findOne).mockResolvedValue(payment as never)
      vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...payment, status: 'paid' } as never)

      const result = await settlePaymentByReference('ref-1', 'paid', {
        amountSubunit: 1200 * 100,
        currency: 'NGN',
        status: 'success',
      })

      expect(result).toEqual({ settled: true, outcome: 'paid' })
      expect(RentCharge.findOneAndUpdate).toHaveBeenCalled()
    })
  })
})
