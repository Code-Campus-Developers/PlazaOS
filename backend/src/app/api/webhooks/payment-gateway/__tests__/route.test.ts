import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/webhooks/payment-gateway/route'
import { verifyPaystackSignature } from '@/lib/paystack'
import { settlePaymentByReference } from '@/lib/settle-payment'
import { refundPaymentByReference } from '@/lib/refund-payment'
import { Payment } from '@/models/Payment'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/paystack', () => ({ verifyPaystackSignature: vi.fn() }))
vi.mock('@/lib/settle-payment', () => ({ settlePaymentByReference: vi.fn() }))
vi.mock('@/lib/refund-payment', () => ({ refundPaymentByReference: vi.fn() }))
vi.mock('@/models/Payment', () => ({ Payment: { updateOne: vi.fn() } }))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/webhooks/payment-gateway', {
    method: 'POST',
    headers: { 'x-paystack-signature': 'valid-signature' },
    body: JSON.stringify(body),
  }) as never
}

describe('POST /webhooks/payment-gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifyPaystackSignature).mockReturnValue(true)
    vi.mocked(settlePaymentByReference).mockResolvedValue({ settled: true, outcome: 'paid' })
    vi.mocked(refundPaymentByReference).mockResolvedValue({ refunded: true })
    vi.mocked(Payment.updateOne).mockResolvedValue({} as never)
  })

  it('settles the payment on charge.success', async () => {
    const response = await POST(makeRequest({ event: 'charge.success', data: { reference: 'ref-1' } }))
    expect(response.status).toBe(200)
    expect(settlePaymentByReference).toHaveBeenCalledWith('ref-1', 'paid', expect.anything())
  })

  it('passes the gateway amount, currency and status through for verification', async () => {
    await POST(
      makeRequest({
        event: 'charge.success',
        data: { reference: 'ref-1', amount: 120000, currency: 'NGN', status: 'success' },
      }),
    )

    expect(settlePaymentByReference).toHaveBeenCalledWith('ref-1', 'paid', {
      amountSubunit: 120000,
      currency: 'NGN',
      status: 'success',
    })
  })

  it('records the gateway transaction id for reconciliation', async () => {
    await POST(
      makeRequest({ event: 'charge.success', data: { reference: 'ref-1', id: 302961 } }),
    )

    expect(Payment.updateOne).toHaveBeenCalledWith(
      { gatewayReference: 'ref-1' },
      { $set: { gatewayTransactionId: '302961' } },
    )
  })

  it('is harmless when the same event is delivered twice', async () => {
    // settlePaymentByReference is independently idempotent (see settle-payment.test.ts) —
    // this asserts the webhook route itself never rejects/crashes on a re-delivery.
    await POST(makeRequest({ event: 'charge.success', data: { reference: 'ref-1' } }))
    const second = await POST(makeRequest({ event: 'charge.success', data: { reference: 'ref-1' } }))

    expect(second.status).toBe(200)
    expect(settlePaymentByReference).toHaveBeenCalledTimes(2)
    expect(settlePaymentByReference).toHaveBeenNthCalledWith(2, 'ref-1', 'paid', expect.anything())
  })

  it('settles a failed charge so the payment does not stay pending forever', async () => {
    await POST(makeRequest({ event: 'charge.failed', data: { reference: 'ref-2' } }))

    expect(settlePaymentByReference).toHaveBeenCalledWith('ref-2', 'failed')
  })

  it('reverses a refunded charge so the rent is owed again', async () => {
    // Without this, the tenant gets their money back and still keeps a paid
    // rent charge and a receipt for it.
    const response = await POST(
      makeRequest({ event: 'charge.refunded', data: { reference: 'ref-1', amount: 120000 } }),
    )

    expect(response.status).toBe(200)
    expect(refundPaymentByReference).toHaveBeenCalledWith('ref-1', 120000)
  })

  it('reverses a successful refund as well as a refunded charge', async () => {
    await POST(makeRequest({ event: 'refund.succeeded', data: { reference: 'ref-1', amount: 120000 } }))

    expect(refundPaymentByReference).toHaveBeenCalledWith('ref-1', 120000)
  })

  it('falls back to the merchant reference for a refund event', async () => {
    await POST(
      makeRequest({ event: 'refund.succeeded', data: { merchant_reference: 'ref-1', amount: 120000 } }),
    )

    expect(refundPaymentByReference).toHaveBeenCalledWith('ref-1', 120000)
  })

  it('does not settle a refunded charge as paid', async () => {
    await POST(makeRequest({ event: 'charge.refunded', data: { reference: 'ref-1', amount: 120000 } }))

    expect(settlePaymentByReference).not.toHaveBeenCalled()
  })

  it('returns 500 so Paystack retries when refund processing fails', async () => {
    vi.mocked(refundPaymentByReference).mockRejectedValue(new Error('db down'))

    const response = await POST(makeRequest({ event: 'charge.refunded', data: { reference: 'ref-1' } }))

    expect(response.status).toBe(500)
  })

  it('rejects an invalid signature without processing the event', async () => {
    vi.mocked(verifyPaystackSignature).mockReturnValue(false)

    const response = await POST(makeRequest({ event: 'charge.success', data: { reference: 'ref-1' } }))

    expect(response.status).toBe(400)
    expect(settlePaymentByReference).not.toHaveBeenCalled()
  })

  it('rejects a charge.success event with no reference', async () => {
    const response = await POST(makeRequest({ event: 'charge.success', data: {} }))

    expect(response.status).toBe(400)
    expect(settlePaymentByReference).not.toHaveBeenCalled()
  })

  it('returns 500 so Paystack retries when processing fails', async () => {
    vi.mocked(settlePaymentByReference).mockRejectedValue(new Error('db down'))

    const response = await POST(makeRequest({ event: 'charge.success', data: { reference: 'ref-1' } }))

    expect(response.status).toBe(500)
  })
})
