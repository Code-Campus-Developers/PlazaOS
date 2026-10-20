import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/tenant/payments/verify/route'
import { signToken } from '@/lib/jwt'
import { Payment } from '@/models/Payment'
import { verifyTransaction } from '@/lib/paystack'
import { settlePaymentByReference } from '@/lib/settle-payment'
import { rateLimit } from '@/lib/rate-limit'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/Payment', () => ({ Payment: { findOne: vi.fn(), findById: vi.fn() } }))
vi.mock('@/lib/paystack', () => ({ verifyTransaction: vi.fn() }))
vi.mock('@/lib/settle-payment', () => ({ settlePaymentByReference: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), clientIp: vi.fn(() => '203.0.113.5') }))

function tenantRequest(url: string, sub = 'tenant-1') {
  const token = signToken({ sub, role: 'tenant' })
  return new NextRequest(url, { headers: { authorization: `Bearer ${token}` } })
}

describe('GET /tenant/payments/verify', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a request with no reference with 400', async () => {
    const response = await GET(tenantRequest('http://localhost/api/tenant/payments/verify'), undefined as never)
    expect(response.status).toBe(400)
  })

  it("returns 404 when the payment doesn't exist or belong to this tenant", async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(null as never)
    const response = await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1'), undefined as never)
    expect(response.status).toBe(404)
  })

  it('returns 404 when the payment belongs to a different tenant', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-1', tenantId: 'other-tenant', status: 'pending' } as never)
    const response = await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1', 'tenant-1'), undefined as never)
    expect(response.status).toBe(404)
  })

  it('re-verifies via Paystack and settles when the payment is still pending', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-1', tenantId: 'tenant-1', status: 'pending' } as never)
    vi.mocked(verifyTransaction).mockResolvedValue({ status: 'success', reference: 'ref-1', amount: 120000, currency: 'NGN', id: 1 } as never)
    vi.mocked(Payment.findById).mockResolvedValue({ _id: 'payment-1', status: 'paid' } as never)

    const response = await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1'), undefined as never)
    const json = await response.json()

    expect(verifyTransaction).toHaveBeenCalledWith('ref-1')
    expect(settlePaymentByReference).toHaveBeenCalledWith('ref-1', 'paid', {
      amountSubunit: 120000,
      currency: 'NGN',
      status: 'success',
    })
    expect(json).toEqual({ id: 'payment-1', status: 'paid' })
  })

  it('settles as failed when Paystack reports a non-success status', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-1', tenantId: 'tenant-1', status: 'pending' } as never)
    vi.mocked(verifyTransaction).mockResolvedValue({ status: 'failed', reference: 'ref-1', amount: 120000, currency: 'NGN', id: 1 } as never)
    vi.mocked(Payment.findById).mockResolvedValue({ _id: 'payment-1', status: 'failed' } as never)

    await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1'), undefined as never)

    expect(settlePaymentByReference).toHaveBeenCalledWith('ref-1', 'failed', expect.anything())
  })

  it('settles an abandoned transaction as failed so the charge can be retried', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-1', tenantId: 'tenant-1', status: 'pending' } as never)
    vi.mocked(verifyTransaction).mockResolvedValue({ status: 'abandoned', reference: 'ref-1', amount: 120000, currency: 'NGN', id: 1 } as never)
    vi.mocked(Payment.findById).mockResolvedValue({ _id: 'payment-1', status: 'failed' } as never)

    await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1'), undefined as never)

    expect(settlePaymentByReference).toHaveBeenCalledWith('ref-1', 'failed', expect.anything())
  })

  it('does NOT settle a transaction Paystack still reports as pending', async () => {
    // 'pending' is not terminal: the charge can still succeed, and a later
    // `charge.success` webhook is what settles it. Settling it as failed here
    // would make that webhook a no-op — the money would be captured but never
    // applied to the rent charge, and the tenant could be charged twice.
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-1', tenantId: 'tenant-1', status: 'pending' } as never)
    vi.mocked(verifyTransaction).mockResolvedValue({ status: 'pending', reference: 'ref-1', amount: 120000, currency: 'NGN', id: 1 } as never)
    vi.mocked(Payment.findById).mockResolvedValue({ _id: 'payment-1', status: 'pending' } as never)

    const response = await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1'), undefined as never)
    const json = await response.json()

    expect(settlePaymentByReference).not.toHaveBeenCalled()
    expect(json.status).toBe('pending')
  })

  it('rate-limits the outbound gateway call per tenant and per source IP', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-1', tenantId: 'tenant-1', status: 'paid' } as never)
    vi.mocked(Payment.findById).mockResolvedValue({ _id: 'payment-1', status: 'paid' } as never)

    await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1'), undefined as never)

    expect(rateLimit).toHaveBeenCalledWith('verify-payment:tenant-1', 30, 15 * 60_000)
    expect(rateLimit).toHaveBeenCalledWith('verify-payment:ip:203.0.113.5', 60, 15 * 60_000)
  })

  it('does not re-verify a payment that is already settled', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-1', tenantId: 'tenant-1', status: 'paid' } as never)
    vi.mocked(Payment.findById).mockResolvedValue({ _id: 'payment-1', status: 'paid' } as never)

    await GET(tenantRequest('http://localhost/api/tenant/payments/verify?reference=ref-1'), undefined as never)

    expect(verifyTransaction).not.toHaveBeenCalled()
    expect(settlePaymentByReference).not.toHaveBeenCalled()
  })

  it('rejects an admin-role token with 403', async () => {
    const token = signToken({ sub: 'admin-1', role: 'admin' })
    const response = await GET(
      new NextRequest('http://localhost/api/tenant/payments/verify?reference=ref-1', { headers: { authorization: `Bearer ${token}` } }),
      undefined as never,
    )
    expect(response.status).toBe(403)
  })
})
