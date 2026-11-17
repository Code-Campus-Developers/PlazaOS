import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/tenant/maintenance/route'
import { signToken } from '@/lib/jwt'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'
import { User } from '@/models/User'
import { saveMaintenanceImages } from '@/lib/uploads'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/MaintenanceRequest', () => ({ MaintenanceRequest: { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn() } }))
vi.mock('@/models/User', () => ({ User: { findById: vi.fn() } }))
vi.mock('@/lib/uploads', () => ({ saveMaintenanceImages: vi.fn() }))

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

function tenantGet(url: string, sub = 'tenant-1') {
  const token = signToken({ sub, role: 'tenant' })
  return new NextRequest(url, { headers: { authorization: `Bearer ${token}` } })
}

function tenantFormPost(form: FormData, sub = 'tenant-1') {
  const token = signToken({ sub, role: 'tenant' })
  return new NextRequest('http://localhost/api/tenant/maintenance', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  })
}

describe('GET /tenant/maintenance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes the query to the authenticated tenant only', async () => {
    const query = mockQuery([])
    vi.mocked(MaintenanceRequest.find).mockReturnValue(query as never)
    vi.mocked(MaintenanceRequest.countDocuments).mockResolvedValue(0 as never)

    await GET(tenantGet('http://localhost/api/tenant/maintenance', 'tenant-1'), undefined as never)

    expect(MaintenanceRequest.find).toHaveBeenCalledWith({ tenantId: 'tenant-1' })
  })

  it('returns a paginated own-requests list', async () => {
    const doc = {
      _id: 'req-1',
      title: 'Leaky faucet',
      description: 'drips',
      priority: 'medium',
      category: undefined,
      status: 'open',
      createdAt: new Date('2026-08-01'),
      images: [],
    }
    vi.mocked(MaintenanceRequest.find).mockReturnValue(mockQuery([doc]) as never)
    vi.mocked(MaintenanceRequest.countDocuments).mockResolvedValue(1 as never)

    const response = await GET(tenantGet('http://localhost/api/tenant/maintenance'), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.total).toBe(1)
    expect(json.data[0]).toMatchObject({ id: 'req-1', title: 'Leaky faucet' })
  })

  it('rejects an admin-role token with 403', async () => {
    const token = signToken({ sub: 'admin-1', role: 'admin' })
    const response = await GET(
      new NextRequest('http://localhost/api/tenant/maintenance', { headers: { authorization: `Bearer ${token}` } }),
      undefined as never,
    )
    expect(response.status).toBe(403)
  })
})

describe('POST /tenant/maintenance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a non-multipart body with 400', async () => {
    const token = signToken({ sub: 'tenant-1', role: 'tenant' })
    const request = new NextRequest('http://localhost/api/tenant/maintenance', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    })
    const response = await POST(request, undefined as never)
    expect(response.status).toBe(400)
  })

  it('rejects a missing title/description with 400', async () => {
    const form = new FormData()
    form.set('title', '')
    const response = await POST(tenantFormPost(form), undefined as never)
    expect(response.status).toBe(400)
    expect(saveMaintenanceImages).not.toHaveBeenCalled()
  })

  it('creates a maintenance request, deriving tenantId/unitId server-side (never client-supplied)', async () => {
    const form = new FormData()
    form.set('title', 'Leaky faucet')
    form.set('description', 'Kitchen sink drips')
    vi.mocked(saveMaintenanceImages).mockResolvedValue([])
    vi.mocked(User.findById).mockResolvedValue({ _id: 'tenant-1', name: 'Jane Cooper', unitId: 'unit-1', unitNumber: 'A-101' } as never)
    vi.mocked(MaintenanceRequest.create).mockResolvedValue({ _id: 'req-1' } as never)

    const response = await POST(tenantFormPost(form), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, id: 'req-1' })
    expect(MaintenanceRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', unitId: 'unit-1', priority: 'medium' }),
    )
  })

  it('propagates a validation error from saveMaintenanceImages (e.g. too many/oversized/wrong-type images)', async () => {
    const form = new FormData()
    form.set('title', 'Leaky faucet')
    form.set('description', 'Kitchen sink drips')
    const { ApiError } = await import('@/lib/api-error')
    vi.mocked(saveMaintenanceImages).mockRejectedValue(new ApiError('Too many images', 400))

    const response = await POST(tenantFormPost(form), undefined as never)
    expect(response.status).toBe(400)
    expect(MaintenanceRequest.create).not.toHaveBeenCalled()
  })

  it('reports an image storage rejection as a clear upstream error instead of an internal server error', async () => {
    const form = new FormData()
    form.set('title', 'Leaky faucet')
    form.set('description', 'Kitchen sink drips')
    const { ApiError } = await import('@/lib/api-error')
    vi.mocked(saveMaintenanceImages).mockRejectedValue(
      new ApiError(
        'Cloudinary denied the image upload (403). The API credentials authenticate, but the Cloudinary account or upload restrictions are blocking uploads. Check the account status and upload permissions.',
        502,
      ),
    )

    const response = await POST(tenantFormPost(form), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(502)
    expect(json.message).toMatch(/Cloudinary denied the image upload \(403\)/)
    expect(MaintenanceRequest.create).not.toHaveBeenCalled()
  })
})
