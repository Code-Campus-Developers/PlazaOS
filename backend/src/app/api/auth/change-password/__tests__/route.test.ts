import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/change-password/route'
import { signToken } from '@/lib/jwt'
import { User } from '@/models/User'
import { hashPassword, verifyPassword } from '@/lib/password'
import { rateLimit } from '@/lib/rate-limit'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findById: vi.fn() } }))
vi.mock('@/lib/password', () => ({ hashPassword: vi.fn(async () => 'hashed-new-password'), verifyPassword: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn() }))

function tenantRequest(body: unknown) {
  const token = signToken({ sub: 'tenant-1', role: 'tenant' })
  return new NextRequest('http://localhost/api/auth/change-password', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /auth/change-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an incorrect current password without saving', async () => {
    const user = { passwordHash: 'old-hash', save: vi.fn() }
    vi.mocked(User.findById).mockResolvedValue(user as never)
    vi.mocked(verifyPassword).mockResolvedValue(false as never)

    const response = await POST(tenantRequest({ currentPassword: 'wrong-password', newPassword: 'longenoughpassword' }), undefined as never)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.message).toBe('Current password is incorrect')
    expect(user.save).not.toHaveBeenCalled()
  })

  it('hashes and saves a verified new password', async () => {
    const user = { passwordHash: 'old-hash', mustChangePassword: true, save: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(User.findById).mockResolvedValue(user as never)
    vi.mocked(verifyPassword).mockResolvedValue(true as never)

    const response = await POST(tenantRequest({ currentPassword: 'correct-password', newPassword: 'longenoughpassword' }), undefined as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(hashPassword).toHaveBeenCalledWith('longenoughpassword')
    expect(user.passwordHash).toBe('hashed-new-password')
    expect(user.mustChangePassword).toBe(false)
    expect(user.save).toHaveBeenCalledOnce()
    expect(rateLimit).toHaveBeenCalledWith('change-password:tenant-1', 5, 15 * 60_000)
  })

  it('rejects with 400 when the account has no password set yet', async () => {
    // An account created through the invitation flow has no passwordHash, so
    // there is no "current password" to verify — bcrypt must never be handed
    // an undefined hash.
    const user = { passwordHash: undefined, save: vi.fn() }
    vi.mocked(User.findById).mockResolvedValue(user as never)

    const response = await POST(tenantRequest({ currentPassword: 'any-password', newPassword: 'longenoughpassword' }), undefined as never)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.message).toBe('Current password is incorrect')
    expect(verifyPassword).not.toHaveBeenCalled()
    expect(user.save).not.toHaveBeenCalled()
  })
})
