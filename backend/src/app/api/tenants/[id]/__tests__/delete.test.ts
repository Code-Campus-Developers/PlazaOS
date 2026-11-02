import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/tenants/[id]/route'
import { signToken } from '@/lib/jwt'
import { User } from '@/models/User'
import { Lease } from '@/models/Lease'
import { RentCharge } from '@/models/RentCharge'
import { Payment } from '@/models/Payment'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findOne: vi.fn(), deleteOne: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { countDocuments: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { countDocuments: vi.fn() } }))
vi.mock('@/models/Payment', () => ({ Payment: { countDocuments: vi.fn() } }))
vi.mock('@/models/MaintenanceRequest', () => ({ MaintenanceRequest: { countDocuments: vi.fn() } }))
vi.mock('@/models/Payment', () => ({ Payment: { countDocuments: vi.fn() } }))
vi.mock('@/models/MaintenanceRequest', () => ({ MaintenanceRequest: { countDocuments: vi.fn() } }))

function adminRequest(id = 'tenant-1') {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest(`http://localhost/api/tenants/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
}

function tenantRequest(id = 'tenant-1') {
  const token = signToken({ sub: 'tenant-1', role: 'tenant' })
  return new NextRequest(`http://localhost/api/tenants/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
}

describe('DELETE /tenants/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(Lease as any).countDocuments.mockResolvedValue(0 as never)
    ;(RentCharge as any).countDocuments.mockResolvedValue(0 as never)
    ;(Payment as any).countDocuments.mockResolvedValue(0 as never)
    ;(MaintenanceRequest as any).countDocuments.mockResolvedValue(0 as never)
    vi.mocked(User.deleteOne).mockResolvedValue({ deletedCount: 1 } as never)
  })

  it('deletes an eligible tenant for admin', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', role: 'tenant' } as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBe(200)
  })

  it('rejects unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/tenants/tenant-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBe(401)
  })

  it('rejects non-admin', async () => {
    const res = await DELETE(tenantRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 for missing tenant', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 when linked leases exist', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', role: 'tenant' } as never)
    ;(Lease as any).countDocuments.mockResolvedValue(1 as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 409 when linked rent charges exist', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', role: 'tenant' } as never)
    ;(RentCharge as any).countDocuments.mockResolvedValue(1 as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 409 when linked payments exist', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', role: 'tenant' } as never)
    ;(Payment as any).countDocuments.mockResolvedValue(1 as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 409 when linked maintenance exists', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'tenant-1', role: 'tenant' } as never)
    ;(MaintenanceRequest as any).countDocuments.mockResolvedValue(1 as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBe(409)
  })

  it('handles database errors safely', async () => {
    vi.mocked(User.findOne).mockRejectedValue(new Error('db down') as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
