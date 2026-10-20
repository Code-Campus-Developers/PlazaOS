import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { GET, POST } from '@/app/api/payments/route'
import { signToken } from '@/lib/jwt'
import { Payment } from '@/models/Payment'
import { RentCharge } from '@/models/RentCharge'
import { User } from '@/models/User'
import { notifyPaymentOutcome } from '@/lib/notify-payment'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/Payment', () => ({ Payment: { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn(), findOne: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { findById: vi.fn() } }))
vi.mock('@/models/User', () => ({ User: { find: vi.fn(), findOne: vi.fn() } }))
vi.mock('@/lib/notify-payment', () => ({ notifyPaymentOutcome: vi.fn() }))
vi.mock('mongoose', () => ({ default: { startSession: vi.fn() } }))

function adminGet(url: string) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest(url, { headers: { authorization: `Bearer ${token}` } })
}

function adminPost(body: unknown) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/payments', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockQuery(docs: unknown[]) {
  const query: { sort: ReturnType<typeof vi.fn>; skip: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> } = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
  }
  query.sort.mockReturnValue(query)
  query.skip.mockReturnValue(query)
  query.limit.mockResolvedValue(docs)
  return query
}

describe('GET /payments (admin)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a paginated list with recordedBy admin names resolved', async () => {
    const doc = {
      _id: 'payment-1',
      tenantId: 'tenant-1',
      tenantName: 'Jane Cooper',
      unitNumber: 'A-101',
      amount: 1200,
      method: 'cash',
      status: 'paid',
      date: '2026-08-01',
      note: undefined,
      recordedBy: 'admin-1',
    }
    vi.mocked(Payment.find).mockReturnValue(mockQuery([doc]) as never)
    vi.mocked(Payment.countDocuments).mockResolvedValue(1 as never)
    vi.mocked(User.find).mockResolvedValue([{ _id: 'admin-1', name: 'Admin User' }] as never)

    const response = await GET(adminGet('http://localhost/api/payments'), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data[0].recordedBy).toBe('Admin User')
  })

  it('rejects an unrecognized sortBy with 400', async () => {
    const response = await GET(adminGet('http://localhost/api/payments?sortBy=notAField'), undefined as never)
    expect(response.status).toBe(400)
  })

  it('filters by status and method', async () => {
    const query = mockQuery([])
    vi.mocked(Payment.find).mockReturnValue(query as never)
    vi.mocked(Payment.countDocuments).mockResolvedValue(0 as never)

    await GET(adminGet('http://localhost/api/payments?status=paid&method=cash'), undefined as never)

    expect(Payment.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', method: 'cash' }))
  })
})

describe('POST /payments (admin offline payment)', () => {
  let session: { withTransaction: ReturnType<typeof vi.fn>; endSession: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Payment.findOne).mockResolvedValue(null as never)
    session = {
      withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
      endSession: vi.fn(),
    }
    vi.mocked(mongoose.startSession).mockResolvedValue(session as never)
  })

  it('rejects a request missing rentChargeId/method/date', async () => {
    const response = await POST(adminPost({}), undefined as never)
    expect(response.status).toBe(400)
  })

  it('rejects method:"gateway" (offline payments only)', async () => {
    const response = await POST(adminPost({ rentChargeId: 'rc-1', method: 'gateway', date: '2026-08-01' }), undefined as never)
    expect(response.status).toBe(400)
  })

  it('returns 404 when the rent charge does not exist', async () => {
    vi.mocked(RentCharge.findById).mockResolvedValue(null as never)
    const response = await POST(adminPost({ rentChargeId: 'rc-1', method: 'cash', date: '2026-08-01' }), undefined as never)
    expect(response.status).toBe(404)
  })

  it('returns 409 when the rent charge is already paid', async () => {
    vi.mocked(RentCharge.findById).mockResolvedValue({ _id: 'rc-1', status: 'paid' } as never)
    const response = await POST(adminPost({ rentChargeId: 'rc-1', method: 'cash', date: '2026-08-01' }), undefined as never)
    expect(response.status).toBe(409)
  })

  it('creates the payment from the RentCharge amount (never the request body) and marks it paid', async () => {
    const rentCharge = { _id: 'rc-1', status: 'due', amount: 950, tenantId: 'tenant-1', unitId: 'unit-1', save: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(RentCharge.findById).mockResolvedValue(rentCharge as never)
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', name: 'Jane Cooper', unitNumber: 'A-101' } as never)
    vi.mocked(Payment.create).mockResolvedValue([{ _id: 'payment-1' }] as never)

    const response = await POST(
      adminPost({ rentChargeId: 'rc-1', method: 'cash', date: '2026-08-01', note: 'paid in office' }),
      undefined as never,
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, id: 'payment-1' })
    expect(Payment.create).toHaveBeenCalledWith(
      [expect.objectContaining({ amount: 950, status: 'paid', rentChargeId: 'rc-1' })],
      expect.objectContaining({ session: expect.anything() }),
    )
    expect(rentCharge.status).toBe('paid')
    expect(rentCharge.save).toHaveBeenCalledOnce()
    expect(notifyPaymentOutcome).toHaveBeenCalledWith(expect.anything(), 'paid')
  })

  it('writes the payment and the rent charge in one transaction', async () => {
    const rentCharge = { _id: 'rc-1', status: 'due', amount: 950, tenantId: 'tenant-1', unitId: 'unit-1', save: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(RentCharge.findById).mockResolvedValue(rentCharge as never)
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', name: 'Jane Cooper', unitNumber: 'A-101' } as never)
    vi.mocked(Payment.create).mockResolvedValue([{ _id: 'payment-1' }] as never)

    await POST(adminPost({ rentChargeId: 'rc-1', method: 'cash', date: '2026-08-01' }), undefined as never)

    // A crash between the two writes would leave a `paid` payment against a
    // charge that is still outstanding — a tenant billed for rent they
    // already paid, with no way to re-settle it.
    expect(session.withTransaction).toHaveBeenCalledOnce()
    expect(rentCharge.save).toHaveBeenCalledWith(expect.objectContaining({ session: expect.anything() }))
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  it('rejects a tenant-role token with 403', async () => {
    const token = signToken({ sub: 'tenant-1', role: 'tenant' })
    const request = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ rentChargeId: 'rc-1', method: 'cash', date: '2026-08-01' }),
    })
    const response = await POST(request, undefined as never)
    expect(response.status).toBe(403)
  })

  it('refuses to record a second payment for the same rent charge', async () => {
    vi.mocked(RentCharge.findById).mockResolvedValue({ _id: 'rc-1', status: 'due', amount: 950, tenantId: 'tenant-1' } as never)
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', name: 'Jane Cooper' } as never)
    vi.mocked(Payment.findOne).mockResolvedValue({ _id: 'payment-0' } as never)

    const response = await POST(
      adminPost({ rentChargeId: 'rc-1', method: 'cash', date: '2026-08-01' }),
      undefined as never,
    )

    expect(response.status).toBe(409)
    expect(Payment.create).not.toHaveBeenCalled()
  })

  it('does not let a refunded payment block a legitimate new payment for the same charge', async () => {
    // A refunded payment's money came back, so the period can be paid again.
    const rentCharge = { _id: 'rc-1', status: 'due', amount: 950, tenantId: 'tenant-1', unitId: 'unit-1', save: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(RentCharge.findById).mockResolvedValue(rentCharge as never)
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', name: 'Jane Cooper', unitNumber: 'A-101' } as never)
    vi.mocked(Payment.create).mockResolvedValue([{ _id: 'payment-2' }] as never)

    const response = await POST(
      adminPost({ rentChargeId: 'rc-1', method: 'cash', date: '2026-08-01' }),
      undefined as never,
    )

    expect(response.status).toBe(200)
    // The guard only considers payments that still count against the balance.
    expect(Payment.findOne).toHaveBeenCalledWith({
      rentChargeId: 'rc-1',
      status: { $in: ['pending', 'paid'] },
    })
  })
})
