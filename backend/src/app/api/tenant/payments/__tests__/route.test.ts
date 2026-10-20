import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/tenant/payments/route'
import { signToken } from '@/lib/jwt'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { User } from '@/models/User'
import { initializeTransaction } from '@/lib/paystack'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/receipt-token', () => ({ buildReceiptUrl: vi.fn(() => 'http://localhost/receipt') }))
vi.mock('@/lib/paystack', () => ({ initializeTransaction: vi.fn(), paystackCurrency: vi.fn(() => 'NGN') }))
vi.mock('@/models/Payment', () => ({ Payment: { create: vi.fn(), findOne: vi.fn(), findByIdAndDelete: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { findById: vi.fn() } }))
vi.mock('@/models/User', () => ({ User: { findById: vi.fn() } }))

const TENANT_ID = '507f1f77bcf86cd799439011'
const OTHER_TENANT_ID = '507f1f77bcf86cd799439099'

function tenantRequest(body: unknown, tenantId = TENANT_ID) {
  const token = signToken({ sub: tenantId, role: 'tenant' })
  return new NextRequest('http://localhost/api/tenant/payments', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /tenant/payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(User.findById).mockResolvedValue({ _id: TENANT_ID, name: 'Jane', email: 'jane@example.com', unitId: 'unit-1', unitNumber: 'A-101' } as never)
    vi.mocked(Payment.findOne).mockResolvedValue(null as never)
  })

  it("rejects a rentChargeId that does not belong to the authenticated tenant", async () => {
    vi.mocked(RentCharge.findById).mockResolvedValue({ _id: 'rc-1', tenantId: OTHER_TENANT_ID, amount: 1200, status: 'due' } as never)

    const response = await POST(tenantRequest({ rentChargeId: 'rc-1' }), undefined as never)

    expect(response.status).toBe(404)
    expect(Payment.create).not.toHaveBeenCalled()
    expect(initializeTransaction).not.toHaveBeenCalled()
  })

  it('rejects a request body that tries to smuggle an amount field', async () => {
    const response = await POST(tenantRequest({ rentChargeId: 'rc-1', amount: 1 }), undefined as never)

    expect(response.status).toBe(400)
    expect(Payment.create).not.toHaveBeenCalled()
  })

  it("always charges the RentCharge's own amount, never a client-supplied value", async () => {
    const rentCharge = { _id: 'rc-1', tenantId: TENANT_ID, amount: 1200, status: 'due' }
    vi.mocked(RentCharge.findById).mockResolvedValue(rentCharge as never)
    vi.mocked(Payment.create).mockResolvedValue({ _id: 'payment-1', save: vi.fn().mockResolvedValue(undefined) } as never)
    vi.mocked(initializeTransaction).mockResolvedValue({ reference: 'plazaos_payment-1', authorization_url: 'https://paystack.test/pay' } as never)

    const response = await POST(tenantRequest({ rentChargeId: 'rc-1' }), undefined as never)

    expect(response.status).toBe(200)
    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 1200 }))
    expect(initializeTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 1200 }))
  })

  it('rejects paying an already-paid RentCharge', async () => {
    vi.mocked(RentCharge.findById).mockResolvedValue({ _id: 'rc-1', tenantId: TENANT_ID, amount: 1200, status: 'paid' } as never)

    const response = await POST(tenantRequest({ rentChargeId: 'rc-1' }), undefined as never)

    expect(response.status).toBe(409)
    expect(Payment.create).not.toHaveBeenCalled()
  })

  it('refuses to start a second payment while one is already in flight for the same charge', async () => {
    vi.mocked(RentCharge.findById).mockResolvedValue({ _id: 'rc-1', tenantId: TENANT_ID, amount: 1200, status: 'due' } as never)
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-0', status: 'pending' } as never)

    const response = await POST(tenantRequest({ rentChargeId: 'rc-1' }), undefined as never)

    expect(response.status).toBe(409)
    expect(Payment.create).not.toHaveBeenCalled()
    expect(initializeTransaction).not.toHaveBeenCalled()
  })

  it('records the currency the payment was taken in', async () => {
    vi.mocked(RentCharge.findById).mockResolvedValue({ _id: 'rc-1', tenantId: TENANT_ID, amount: 1200, status: 'due' } as never)
    vi.mocked(Payment.create).mockResolvedValue({ _id: 'payment-1', save: vi.fn().mockResolvedValue(undefined) } as never)
    vi.mocked(initializeTransaction).mockResolvedValue({ reference: 'plazaos_payment-1', authorization_url: 'https://paystack.test/pay' } as never)

    await POST(tenantRequest({ rentChargeId: 'rc-1' }), undefined as never)

    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({ currency: 'NGN' }))
  })
})
