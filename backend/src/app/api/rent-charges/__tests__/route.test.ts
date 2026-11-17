import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/rent-charges/route'
import { signToken } from '@/lib/jwt'
import { RentCharge } from '@/models/RentCharge'
import { Lease } from '@/models/Lease'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { findOne: vi.fn() } }))

function adminRequest(url: string) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest(url, { headers: { authorization: `Bearer ${token}` } })
}

describe('GET /rent-charges (admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Lease.findOne).mockReturnValue({ sort: vi.fn().mockResolvedValue(null) } as never)
  })

  it('rejects a request with no tenantId with 400', async () => {
    const response = await GET(adminRequest('http://localhost/api/rent-charges'), undefined as never)
    expect(response.status).toBe(400)
    expect(RentCharge.find).not.toHaveBeenCalled()
  })

  it('returns the tenant\'s non-paid rent charges sorted by dueDate', async () => {
    const sort = vi.fn().mockResolvedValue([
      { _id: 'rc-1', period: '2026-08', amount: 1200, dueDate: '2026-08-01', status: 'due' },
    ])
    vi.mocked(RentCharge.find).mockReturnValue({ sort } as never)

    const response = await GET(adminRequest('http://localhost/api/rent-charges?tenantId=tenant-1'), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(RentCharge.find).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: { $ne: 'paid' },
      period: { $regex: expect.any(RegExp) },
    })
    expect(sort).toHaveBeenCalledWith({ dueDate: 1 })
    expect(json.data[0]).toMatchObject({ id: 'rc-1', period: '2026-08' })
  })

  it('creates a yearly charge for an active legacy lease with no charge history in that lease year', async () => {
    const lease = {
      _id: 'lease-1',
      tenantId: 'tenant-1',
      unitId: 'unit-1',
      startDate: '2025-01-01',
      endDate: '2999-12-31',
      rentAmount: 1200,
    }
    vi.mocked(Lease.findOne).mockReturnValue({ sort: vi.fn().mockResolvedValue(lease) } as never)
    vi.mocked(RentCharge.findOne).mockResolvedValue(null)
    vi.mocked(RentCharge.findOneAndUpdate).mockResolvedValue({ _id: 'new-charge' } as never)
    const sort = vi.fn().mockResolvedValue([
      { _id: 'new-charge', period: '2026-01-01 to 2027-01-01', amount: 1200, dueDate: '2026-01-01', status: 'overdue' },
    ])
    vi.mocked(RentCharge.find).mockReturnValue({ sort } as never)

    const response = await GET(adminRequest('http://localhost/api/rent-charges?tenantId=tenant-1'), undefined as never)

    expect(response.status).toBe(200)
    expect(RentCharge.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', period: expect.stringMatching(/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/) },
      { $setOnInsert: expect.objectContaining({ amount: 1200 }) },
      { upsert: true, new: true },
    )
  })

  it('does not return monthly legacy charges', async () => {
    const sort = vi.fn().mockResolvedValue([])
    vi.mocked(RentCharge.find).mockReturnValue({ sort } as never)

    await GET(adminRequest('http://localhost/api/rent-charges?tenantId=tenant-1'), undefined as never)

    const [filter] = vi.mocked(RentCharge.find).mock.calls[0]
    const periodFilter = Reflect.get(Reflect.get(filter, 'period') ?? {}, '$regex')
    expect(filter).toMatchObject({
      tenantId: 'tenant-1',
      status: { $ne: 'paid' },
      period: { $regex: expect.any(RegExp) },
    })
    expect(periodFilter).toBeInstanceOf(RegExp)
    expect('2026-08'.match(periodFilter)).toBeNull()
  })

  it('rejects a tenant-role token with 403', async () => {
    const token = signToken({ sub: 'tenant-1', role: 'tenant' })
    const response = await GET(
      new NextRequest('http://localhost/api/rent-charges?tenantId=tenant-1', { headers: { authorization: `Bearer ${token}` } }),
      undefined as never,
    )
    expect(response.status).toBe(403)
  })
})
