import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/set-password/route'
import { signToken } from '@/lib/jwt'
import { User } from '@/models/User'
import { rateLimit } from '@/lib/rate-limit'
import { invalidateOutstandingInvitations } from '@/lib/account-invitation'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findById: vi.fn() } }))
vi.mock('@/lib/password', () => ({ hashPassword: vi.fn(async () => 'hashed-new-password') }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn() }))
vi.mock('@/lib/account-invitation', () => ({ invalidateOutstandingInvitations: vi.fn() }))

function tenantRequest(body: unknown, headers: Record<string, string> = {}) {
  const token = signToken({ sub: 'tenant-1', role: 'tenant' })
  return new NextRequest('http://localhost/api/auth/set-password', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /auth/set-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when there is no auth token', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/auth/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: 'longenoughpassword' }),
      }),
      undefined as never,
    )
    expect(response.status).toBe(401)
  })

  it('rejects a password shorter than 8 characters', async () => {
    const response = await POST(tenantRequest({ newPassword: 'short' }), undefined as never)
    expect(response.status).toBe(400)
  })

  it('hashes and stores the new password, clearing mustChangePassword', async () => {
    const user = { _id: 'tenant-1', passwordHash: 'old-hash', mustChangePassword: true, save: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(User.findById).mockResolvedValue(user as never)

    const response = await POST(tenantRequest({ newPassword: 'longenoughpassword' }), undefined as never)

    expect(response.status).toBe(200)
    expect(user.passwordHash).toBe('hashed-new-password')
    expect(user.mustChangePassword).toBe(false)
    expect(user.save).toHaveBeenCalledOnce()
  })

  it('activates the account and invalidates any outstanding invitation', async () => {
    const user = {
      _id: 'tenant-1',
      passwordHash: 'old-hash',
      mustChangePassword: true,
      accountStatus: 'pending',
      save: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(User.findById).mockResolvedValue(user as never)

    await POST(tenantRequest({ newPassword: 'longenoughpassword' }), undefined as never)

    // The account has a password of the user's own choosing now, so it is no
    // longer awaiting setup.
    expect(user.accountStatus).toBe('active')
    // A still-live invitation link must not be able to overwrite this password.
    expect(invalidateOutstandingInvitations).toHaveBeenCalledWith('tenant-1')
  })

  it('is rate-limited per authenticated user id', async () => {
    vi.mocked(User.findById).mockResolvedValue({ _id: 'tenant-1', save: vi.fn() } as never)

    await POST(tenantRequest({ newPassword: 'longenoughpassword' }), undefined as never)

    expect(rateLimit).toHaveBeenCalledWith('set-password:tenant-1', 5, 15 * 60_000)
  })
})
