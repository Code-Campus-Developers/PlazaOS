import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { POST } from '@/app/api/auth/accept-invitation/route'
import { User } from '@/models/User'
import { AccountInvitation } from '@/models/AccountInvitation'
import { hashPassword, hashResetToken } from '@/lib/password'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findById: vi.fn() } }))
vi.mock('@/models/AccountInvitation', () => ({
  AccountInvitation: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateMany: vi.fn() },
}))
vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn(),
  hashResetToken: vi.fn(),
  verifyPassword: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), clientIp: vi.fn(() => '203.0.113.9') }))
vi.mock('mongoose', () => ({ default: { startSession: vi.fn() } }))

function acceptRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/accept-invitation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const RAW_TOKEN = 'raw-invitation-token'
const TOKEN_HASH = 'sha256-of-invitation-token'

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Cooper',
    role: 'tenant',
    status: 'active',
    accountStatus: 'pending',
    mustChangePassword: true,
    passwordHash: undefined,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeInvitation(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'invitation-1',
    userId: 'user-1',
    tokenHash: TOKEN_HASH,
    expiresAt: new Date(Date.now() + 60_000),
    used: false,
    ...overrides,
  }
}

describe('POST /auth/accept-invitation', () => {
  let session: {
    withTransaction: Mock<(fn: () => Promise<void>) => Promise<void>>
    endSession: Mock
    abortTransaction: Mock
  }
  let rolledBack: boolean

  beforeEach(() => {
    vi.clearAllMocks()
    rolledBack = false
    session = {
      withTransaction: vi.fn(async (fn: () => Promise<void>) => {
        try {
          await fn()
        } catch (err) {
          rolledBack = true
          session.abortTransaction()
          throw err
        }
      }),
      endSession: vi.fn(),
      abortTransaction: vi.fn(),
    }
    vi.mocked(mongoose.startSession).mockResolvedValue(session as never)
    vi.mocked(hashResetToken).mockReturnValue(TOKEN_HASH)
    vi.mocked(hashPassword).mockResolvedValue('new-password-hash' as never)
  })

  function mockUserLookup(user: unknown) {
    vi.mocked(User.findById).mockReturnValue({
      session: vi.fn().mockResolvedValue(user),
    } as never)
  }

  /** The cheap pre-check lookup the route runs before hashing the password. */
  function mockPendingLookup(found: unknown) {
    vi.mocked(AccountInvitation.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(found) }),
    } as never)
  }

  function mockValidInvitation(user = makeUser(), invitation = makeInvitation()) {
    mockPendingLookup({ _id: 'invitation-1' })
    vi.mocked(AccountInvitation.findOneAndUpdate).mockResolvedValue(invitation as never)
    mockUserLookup(user)
    return { user, invitation }
  }

  it('accepts a valid invitation and stores the chosen password', async () => {
    const { user } = mockValidInvitation()

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(hashResetToken).toHaveBeenCalledWith(RAW_TOKEN)
    expect(hashPassword).toHaveBeenCalledWith('MyNewPassword123')
    expect(user.passwordHash).toBe('new-password-hash')
    expect(user.accountStatus).toBe('active')
    expect(user.mustChangePassword).toBe(false)
    expect(user.save).toHaveBeenCalledOnce()
  })

  it('invalidates every other outstanding invitation for the account', async () => {
    // The account is set up now, so no second link may stay live — a second
    // outstanding invitation is a second way to take the account over.
    mockValidInvitation()

    await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(AccountInvitation.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', used: false },
      { $set: { used: true } },
      expect.objectContaining({ session: expect.anything() }),
    )
  })

  it('claims the token and stores the password inside a single transaction', async () => {
    mockValidInvitation()

    await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(AccountInvitation.findOneAndUpdate).toHaveBeenCalledWith(
      {
        tokenHash: TOKEN_HASH,
        used: false,
        expiresAt: { $gt: expect.any(Date) },
      },
      { $set: { used: true } },
      expect.objectContaining({ new: false, session: expect.anything() }),
    )
    expect(session.withTransaction).toHaveBeenCalledOnce()
    expect(rolledBack).toBe(false)
  })

  it('rejects an unknown or already-used token', async () => {
    mockPendingLookup(null)
    vi.mocked(AccountInvitation.findOneAndUpdate).mockResolvedValue(null as never)

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(response.status).toBe(400)
    expect((await response.json()).message).toContain('invalid')
    expect(User.findById).not.toHaveBeenCalled()
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('rejects an expired token', async () => {
    mockPendingLookup(null)
    vi.mocked(AccountInvitation.findOneAndUpdate).mockResolvedValue(null as never)

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    // The expiry check lives in the query filter, so an expired token simply
    // never matches and the request is rejected like any invalid token.
    expect(response.status).toBe(400)
    expect(AccountInvitation.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: { $gt: expect.any(Date) } }),
    )
  })

  it('rejects an invitation for an account that is no longer pending', async () => {
    const user = makeUser({ accountStatus: 'active' })
    mockValidInvitation(user)

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(response.status).toBe(400)
    expect(user.save).not.toHaveBeenCalled()
    expect(user.passwordHash).toBeUndefined()
  })

  it('rejects an invitation when the account is inactive', async () => {
    mockValidInvitation(makeUser({ status: 'inactive' }))

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(response.status).toBe(403)
  })

  it('rejects an invitation whose user does not exist', async () => {
    mockPendingLookup({ _id: 'invitation-1' })
    vi.mocked(AccountInvitation.findOneAndUpdate).mockResolvedValue(makeInvitation() as never)
    mockUserLookup(null)

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('rejects an invitation issued for a non-tenant account', async () => {
    mockValidInvitation(makeUser({ role: 'admin' }))

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('rolls the token claim back when saving the user fails', async () => {
    const user = makeUser()
    user.save.mockRejectedValue(new Error('write failed'))
    mockValidInvitation(user)

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )

    expect(response.status).toBe(500)
    // The token must not stay spent when the password was never stored.
    expect(rolledBack).toBe(true)
    expect(session.abortTransaction).toHaveBeenCalled()
  })

  it('rejects a password shorter than eight characters', async () => {
    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'short' }),
      undefined as never,
    )

    expect(response.status).toBe(400)
    expect(AccountInvitation.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('rejects a missing token', async () => {
    const response = await POST(acceptRequest({ password: 'MyNewPassword123' }), undefined as never)
    expect(response.status).toBe(400)
  })

  it('rejects a missing password', async () => {
    const response = await POST(acceptRequest({ token: RAW_TOKEN }), undefined as never)
    expect(response.status).toBe(400)
  })

  it('rejects unexpected request fields', async () => {
    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123', role: 'admin' }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('never echoes the token back to the client', async () => {
    mockValidInvitation()

    const response = await POST(
      acceptRequest({ token: RAW_TOKEN, password: 'MyNewPassword123' }),
      undefined as never,
    )
    const body = await response.text()

    expect(body).not.toContain(RAW_TOKEN)
    expect(body).not.toContain(TOKEN_HASH)
  })
})
