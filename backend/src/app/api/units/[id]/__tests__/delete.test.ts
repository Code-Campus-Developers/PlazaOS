import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/units/[id]/route'
import { signToken } from '@/lib/jwt'
import { Unit } from '@/models/Unit'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/Unit', () => ({ Unit: { findById: vi.fn(), deleteOne: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { countDocuments: vi.fn() } }))

function adminRequest(id = 'unit-1') {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest(`http://localhost/api/units/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
}

describe('DELETE /units/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Unit.deleteOne).mockResolvedValue({ deletedCount: 1 } as never)
  })

  it('deletes an eligible vacant unit for admin', async () => {
    vi.mocked(Unit.findById).mockResolvedValue({ _id: 'unit-1', tenantId: undefined } as never)
    const { Lease } = await import('@/models/Lease')
    ;(Lease as any).countDocuments.mockResolvedValue(0 as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(200)
  })

  it('rejects unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/units/unit-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(401)
  })

  it('rejects non-admin', async () => {
    const token = signToken({ sub: 'tenant-1', role: 'tenant' })
    const req = new NextRequest('http://localhost/api/units/unit-1', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 for missing unit', async () => {
    vi.mocked(Unit.findById).mockResolvedValue(null as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 for occupied unit', async () => {
    vi.mocked(Unit.findById).mockResolvedValue({ _id: 'unit-1', tenantId: 'tenant-1' } as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 409 when linked leases exist', async () => {
    vi.mocked(Unit.findById).mockResolvedValue({ _id: 'unit-1', tenantId: undefined } as never)
    const { Lease } = await import('@/models/Lease')
    ;(Lease as any).countDocuments.mockResolvedValue(1 as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(409)
  })

  it('handles database errors safely', async () => {
    vi.mocked(Unit.findById).mockRejectedValue(new Error('db down') as never)
    const res = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
