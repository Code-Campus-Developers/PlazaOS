import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, PATCH } from '@/app/api/units/[id]/route'
import { signToken } from '@/lib/jwt'
import { Unit } from '@/models/Unit'
import { User } from '@/models/User'
import { Lease } from '@/models/Lease'
import { RentCharge } from '@/models/RentCharge'
import { Payment } from '@/models/Payment'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/Unit', () => ({ Unit: { findById: vi.fn(), deleteOne: vi.fn() } }))
vi.mock('@/models/User', () => ({ User: { countDocuments: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { countDocuments: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { countDocuments: vi.fn() } }))
vi.mock('@/models/Payment', () => ({ Payment: { countDocuments: vi.fn() } }))
vi.mock('@/models/MaintenanceRequest', () => ({ MaintenanceRequest: { countDocuments: vi.fn() } }))

function adminRequest(body: unknown, method = 'PATCH') {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/units/unit-1', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /units/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects moving an occupied unit to vacant without explicitly clearing the tenant', async () => {
    vi.mocked(Unit.findById).mockResolvedValue({
      _id: 'unit-1',
      status: 'occupied',
      tenantId: 'tenant-1',
      tenantName: 'Jane Cooper',
      save: vi.fn(),
    } as never)

    const response = await PATCH(adminRequest({ status: 'vacant' }), { params: Promise.resolve({ id: 'unit-1' }) })

    expect(response.status).toBe(409)
  })

  it('allows moving to vacant when tenantId is explicitly cleared in the same request', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    vi.mocked(Unit.findById).mockResolvedValue({
      _id: 'unit-1',
      unitNumber: 'A-101',
      floor: '1',
      sizeSqft: 500,
      monthlyRent: 1200,
      status: 'occupied',
      tenantId: 'tenant-1',
      tenantName: 'Jane Cooper',
      save,
    } as never)

    const response = await PATCH(adminRequest({ status: 'vacant', tenantId: null, tenantName: null }), {
      params: Promise.resolve({ id: 'unit-1' }),
    })

    expect(response.status).toBe(200)
    expect(save).toHaveBeenCalledOnce()
  })

  it('allows unrelated field updates while a unit is occupied', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    vi.mocked(Unit.findById).mockResolvedValue({
      _id: 'unit-1',
      unitNumber: 'A-101',
      floor: '1',
      sizeSqft: 500,
      monthlyRent: 1200,
      status: 'occupied',
      tenantId: 'tenant-1',
      tenantName: 'Jane Cooper',
      save,
    } as never)

    const response = await PATCH(adminRequest({ monthlyRent: 1300 }), { params: Promise.resolve({ id: 'unit-1' }) })

    expect(response.status).toBe(200)
  })
})

describe('DELETE /units/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(User.countDocuments).mockResolvedValue(0 as never)
    vi.mocked(Lease.countDocuments).mockResolvedValue(0 as never)
    vi.mocked(RentCharge.countDocuments).mockResolvedValue(0 as never)
    vi.mocked(Payment.countDocuments).mockResolvedValue(0 as never)
    vi.mocked(MaintenanceRequest.countDocuments).mockResolvedValue(0 as never)
  })

  it('refuses to delete an occupied unit', async () => {
    vi.mocked(Unit.findById).mockResolvedValue({ status: 'occupied', tenantId: 'tenant-1' } as never)
    const response = await DELETE(adminRequest(undefined, 'DELETE'), { params: Promise.resolve({ id: 'unit-1' }) })
    expect(response.status).toBe(409)
  })

  it('refuses to delete a vacant unit with historical references', async () => {
    vi.mocked(Unit.findById).mockResolvedValue({ _id: 'unit-1', status: 'vacant' } as never)
    vi.mocked(Lease.countDocuments).mockResolvedValue(1 as never)
    const response = await DELETE(adminRequest(undefined, 'DELETE'), { params: Promise.resolve({ id: 'unit-1' }) })
    expect(response.status).toBe(409)
  })

  it('deletes a vacant unit without tenant or historical references', async () => {
    vi.mocked(Unit.findById).mockResolvedValue({ _id: 'unit-1', status: 'vacant' } as never)
    vi.mocked(Unit.deleteOne).mockResolvedValue({ deletedCount: 1 } as never)
    const response = await DELETE(adminRequest(undefined, 'DELETE'), { params: Promise.resolve({ id: 'unit-1' }) })
    expect(response.status).toBe(200)
    expect(Unit.deleteOne).toHaveBeenCalledWith({
      _id: 'unit-1',
      status: 'vacant',
      tenantId: { $in: [null] },
    })
  })
})
