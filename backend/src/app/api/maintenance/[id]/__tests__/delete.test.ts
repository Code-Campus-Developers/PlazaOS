import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/maintenance/[id]/route'
import { signToken } from '@/lib/jwt'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/MaintenanceRequest', () => ({ MaintenanceRequest: { findById: vi.fn() } }))

function adminRequest() {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/maintenance/request-1', {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('DELETE /maintenance/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes mistaken open requests', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined)
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue({
      status: 'open',
      tenantId: 'tenant-1',
      createdAt: new Date('2026-11-01'),
      images: [],
      deleteOne,
    } as never)
    const response = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'request-1' }) })
    expect(response.status).toBe(200)
    expect(deleteOne).toHaveBeenCalledOnce()
  })

  it('preserves in-progress requests', async () => {
    vi.mocked(MaintenanceRequest.findById).mockResolvedValue({ status: 'in_progress' } as never)
    const response = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'request-1' }) })
    expect(response.status).toBe(409)
  })
})
