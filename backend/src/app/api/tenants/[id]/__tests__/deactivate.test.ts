import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/tenants/[id]/route'
import { signToken } from '@/lib/jwt'
import { User } from '@/models/User'
import { Lease } from '@/models/Lease'
import { RentCharge } from '@/models/RentCharge'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findOne: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { findOne: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { find: vi.fn() } }))

function adminRequest() {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/tenants/tenant-1', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'inactive' }),
  })
}

describe('PATCH /tenants/:id deactivation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(RentCharge.find).mockResolvedValue([] as never)
    vi.mocked(Lease.findOne).mockReturnValue({ sort: vi.fn().mockResolvedValue(null) } as never)
  })

  it('marks a tenant inactive while preserving their account', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const user = { _id: 'tenant-1', role: 'tenant', status: 'active', save }
    vi.mocked(User.findOne).mockResolvedValue(user as never)
    const response = await PATCH(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(response.status).toBe(200)
    expect(user.status).toBe('inactive')
    expect(save).toHaveBeenCalledOnce()
  })
})
