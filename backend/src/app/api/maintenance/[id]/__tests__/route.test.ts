import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, GET, PATCH } from '@/app/api/maintenance/[id]/route'
import { signToken } from '@/lib/jwt'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/MaintenanceRequest', () => ({ MaintenanceRequest: { findById: vi.fn() } }))

function adminRequest(method: string, body?: unknown) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/maintenance/req-1', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function baseDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'req-1',
    tenantId: 'tenant-1',
    tenantName: 'Jane Cooper',
    unitId: 'unit-1',
    unitNumber: 'A-101',
    title: 'Leaky faucet',
    description: 'Kitchen sink drips',
    status: 'open',
    priority: 'medium',
    images: [],
    notes: '',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('GET /maintenance/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when not found', async () => {
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue(null as never)
    const response = await GET(adminRequest('GET'), { params: Promise.resolve({ id: 'req-1' }) })
    expect(response.status).toBe(404)
  })

  it('returns the maintenance request when found', async () => {
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue(baseDoc() as never)
    const response = await GET(adminRequest('GET'), { params: Promise.resolve({ id: 'req-1' }) })
    expect(response.status).toBe(200)
  })
})

describe('PATCH /maintenance/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when not found', async () => {
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue(null as never)
    const response = await PATCH(adminRequest('PATCH', { status: 'resolved' }), { params: Promise.resolve({ id: 'req-1' }) })
    expect(response.status).toBe(404)
  })

  describe('DELETE /maintenance/:id', () => {
    beforeEach(() => vi.clearAllMocks())

    it('only deletes open requests', async () => {
      const deleteOne = vi.fn().mockResolvedValue(undefined)
      vi.mocked(MaintenanceRequest.findById).mockResolvedValue(baseDoc({ deleteOne }) as never)

      const response = await DELETE(adminRequest('DELETE'), { params: Promise.resolve({ id: 'req-1' }) })

      expect(response.status).toBe(200)
      expect(deleteOne).toHaveBeenCalledOnce()
    })

    it('preserves in-progress requests as history', async () => {
      vi.mocked(MaintenanceRequest.findById).mockResolvedValue(baseDoc({ status: 'in_progress' }) as never)

      const response = await DELETE(adminRequest('DELETE'), { params: Promise.resolve({ id: 'req-1' }) })

      expect(response.status).toBe(409)
    })
  })

  it('rejects an empty update body', async () => {
    const response = await PATCH(adminRequest('PATCH', {}), { params: Promise.resolve({ id: 'req-1' }) })
    expect(response.status).toBe(400)
  })

  it('updates status', async () => {
    const doc = baseDoc()
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue(doc as never)

    const response = await PATCH(adminRequest('PATCH', { status: 'in_progress' }), { params: Promise.resolve({ id: 'req-1' }) })

    expect(response.status).toBe(200)
    expect(doc.status).toBe('in_progress')
    expect(doc.save).toHaveBeenCalledOnce()
  })

  it('auto-sets resolvedAt to today when status becomes resolved with no explicit resolvedAt', async () => {
    const doc = baseDoc()
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue(doc as never)

    await PATCH(adminRequest('PATCH', { status: 'resolved' }), { params: Promise.resolve({ id: 'req-1' }) })

    expect(doc.resolvedAt).toBe(new Date().toISOString().slice(0, 10))
  })

  it('honors an explicit resolvedAt (including clearing it with null)', async () => {
    const doc = baseDoc({ status: 'resolved', resolvedAt: '2026-08-01' })
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue(doc as never)

    await PATCH(adminRequest('PATCH', { resolvedAt: null }), { params: Promise.resolve({ id: 'req-1' }) })

    expect(doc.resolvedAt).toBeNull()
  })

  it('rejects a tenant-role token with 403', async () => {
    const token = signToken({ sub: 'tenant-1', role: 'tenant' })
    const request = new NextRequest('http://localhost/api/maintenance/req-1', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: 'req-1' }) })
    expect(response.status).toBe(403)
  })
})
