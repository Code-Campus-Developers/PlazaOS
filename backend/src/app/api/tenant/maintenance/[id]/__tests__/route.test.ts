import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/tenant/maintenance/[id]/route'
import { signToken } from '@/lib/jwt'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/MaintenanceRequest', () => ({ MaintenanceRequest: { findOne: vi.fn() } }))

function tenantGet(sub = 'tenant-1') {
  const token = signToken({ sub, role: 'tenant' })
  return new NextRequest('http://localhost/api/tenant/maintenance/request-1', {
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('GET /tenant/maintenance/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the request details for its tenant without admin-only notes', async () => {
    vi.mocked(MaintenanceRequest.findOne).mockResolvedValue({
      _id: { toString: () => 'request-1' },
      title: 'Leaky faucet',
      description: 'Kitchen sink drips',
      priority: 'high',
      category: 'plumbing',
      status: 'in_progress',
      createdAt: new Date('2026-08-01T10:00:00Z'),
      images: [{ url: 'https://images.example/request.jpg', publicId: 'request-image' }],
      notes: 'Internal staff note',
    } as never)

    const response = await GET(tenantGet(), { params: Promise.resolve({ id: 'request-1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(MaintenanceRequest.findOne).toHaveBeenCalledWith({ _id: 'request-1', tenantId: 'tenant-1' })
    expect(json).toEqual({
      id: 'request-1',
      title: 'Leaky faucet',
      description: 'Kitchen sink drips',
      priority: 'high',
      category: 'plumbing',
      status: 'in_progress',
      createdAt: '2026-08-01',
      images: ['https://images.example/request.jpg'],
    })
  })

  it('returns not found when the request belongs to another tenant', async () => {
    vi.mocked(MaintenanceRequest.findOne).mockResolvedValue(null as never)

    const response = await GET(tenantGet('tenant-2'), { params: Promise.resolve({ id: 'request-1' }) })

    expect(response.status).toBe(404)
  })

  it('rejects a non-tenant role', async () => {
    const token = signToken({ sub: 'admin-1', role: 'admin' })
    const request = new NextRequest('http://localhost/api/tenant/maintenance/request-1', {
      headers: { authorization: `Bearer ${token}` },
    })

    const response = await GET(request, { params: Promise.resolve({ id: 'request-1' }) })

    expect(response.status).toBe(403)
    expect(MaintenanceRequest.findOne).not.toHaveBeenCalled()
  })
})
