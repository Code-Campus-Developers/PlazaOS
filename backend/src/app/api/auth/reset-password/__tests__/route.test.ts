import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { POST } from '@/app/api/auth/reset-password/route'
import { User } from '@/models/User'
import { PasswordResetToken } from '@/models/PasswordResetToken'
import { hashPassword, hashResetToken } from '@/lib/password'
import { invalidateOutstandingInvitations } from '@/lib/account-invitation'
import { rateLimit } from '@/lib/rate-limit'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({
  User: { findOne: vi.fn(), findById: vi.fn() },
}))
vi.mock('@/models/PasswordResetToken', () => ({
  PasswordResetToken: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}))
vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn(),
  hashResetToken: vi.fn(),
  verifyPassword: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), clientIp: vi.fn(() => '203.0.113.9') }))
vi.mock('@/lib/account-invitation', () => ({ invalidateOutstandingInvitations: vi.fn() }))
vi.mock('mongoose', () => ({ default: { startSession: vi.fn() } }))

function resetPasswordRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user-1',
    email: 'jane@example.com',
    passwordHash: 'old-hash',
    mustChangePassword: true,
    accountStatus: 'pending',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeToken(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'token-1',
    userId: 'user-1',
    tokenHash: 'hashed-raw-token',
    expiresAt: new Date(Date.now() + 60_000),
    used: false,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const SUBMITTED_TOKEN = 'raw-token-value'
const SUBMITTED_TOKEN_HASH = 'sha256-of-raw-token'

describe('POST /auth/reset-password', () => {
  let session: {
    withTransaction: Mock<(fn: () => Promise<void>) => Promise<void>>
    endSession: Mock
    abortTransaction: Mock
  }
  /** True when the simulated transaction aborted, i.e. its writes were rolled back. */
  let rolledBack: boolean

  beforeEach(() => {
    vi.clearAllMocks()
    rolledBack = false
    session = {
      withTransaction: vi.fn(async (fn: () => Promise<void>) => {
        try {
          await fn()
        } catch (err) {
          // A real driver aborts here, discarding every write made inside the
          // transaction — including the token claim.
          rolledBack = true
          session.abortTransaction()
          throw err
        }
      }),
      endSession: vi.fn(),
      abortTransaction: vi.fn(),
    }
    vi.mocked(mongoose.startSession).mockResolvedValue(session as never)
  })

  function mockUserLookup(user: unknown) {
    vi.mocked(User.findById).mockReturnValue({
      session: vi.fn().mockResolvedValue(user),
    } as never)
  }

  /** The cheap pre-check lookup the route runs before hashing the password. */
  function mockPendingLookup(found: unknown) {
    vi.mocked(PasswordResetToken.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(found) }),
    } as never)
  }

  function mockValidReset(user = makeUser(), token = makeToken()) {
    vi.mocked(hashResetToken).mockReturnValue(SUBMITTED_TOKEN_HASH)
    mockPendingLookup({ _id: 'token-1' })
    vi.mocked(PasswordResetToken.findOneAndUpdate).mockResolvedValue(token as never)
    mockUserLookup(user)
    vi.mocked(hashPassword).mockResolvedValue('new-password-hash' as never)
    return { user, token }
  }

  it('resets the password with a valid token', async () => {
    const { user } = mockValidReset()

    const response = await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    const json = await response.json()

    expect(hashResetToken).toHaveBeenCalledWith(SUBMITTED_TOKEN)
    expect(PasswordResetToken.findOneAndUpdate).toHaveBeenCalledWith(
      {
        tokenHash: SUBMITTED_TOKEN_HASH,
        expiresAt: { $gt: expect.any(Date) },
        used: false,
      },
      { $set: { used: true } },
      expect.objectContaining({ new: false, session: expect.anything() }),
    )
    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(hashPassword).toHaveBeenCalledWith('NewPassword123')
    expect(user.passwordHash).toBe('new-password-hash')
    expect(user.save).toHaveBeenCalledOnce()
  })

  it('claims the token and saves the user inside a single transaction', async () => {
    mockValidReset()

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(session.withTransaction).toHaveBeenCalledOnce()
    expect(rolledBack).toBe(false)
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  it('looks up the user by the found token userId', async () => {
    const { user, token } = mockValidReset()

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(User.findById).toHaveBeenCalledWith(token.userId)
    expect(user.save).toHaveBeenCalledOnce()
  })

  it('clears mustChangePassword after a successful reset', async () => {
    const user = makeUser()
    mockValidReset(user)

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(user.mustChangePassword).toBe(false)
  })

  it('activates the account after a successful reset', async () => {
    const user = makeUser({ accountStatus: 'pending' })
    mockValidReset(user)

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    // The account now has a password of the user's own choosing, so it is no
    // longer "awaiting setup".
    expect(user.accountStatus).toBe('active')
  })

  it('invalidates outstanding invitations so a live link cannot overwrite the new password', async () => {
    const user = makeUser({ accountStatus: 'pending' })
    mockValidReset(user)

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    // Without this, a still-live (emailed, forwardable) invitation link could
    // be redeemed afterwards and take over the account.
    expect(invalidateOutstandingInvitations).toHaveBeenCalledWith('user-1', expect.anything())
  })

  it('rate-limits per source IP and per submitted token', async () => {
    mockValidReset()

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(rateLimit).toHaveBeenCalledWith('reset-password:ip:203.0.113.9', 10, 15 * 60_000)
    expect(rateLimit).toHaveBeenCalledWith(`reset-password:token:${SUBMITTED_TOKEN_HASH}`, 10, 15 * 60_000)
  })

  it('returns 400 when the token is invalid (no match found)', async () => {
    vi.mocked(hashResetToken).mockReturnValue(SUBMITTED_TOKEN_HASH)
    mockPendingLookup(null)
    vi.mocked(PasswordResetToken.findOneAndUpdate).mockResolvedValue(null as never)

    const response = await POST(
      resetPasswordRequest({
        token: 'invalid-token',
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(response.status).toBe(400)
    expect((await response.json()).message).toContain(
      'invalid or has expired',
    )
    expect(User.findById).not.toHaveBeenCalled()
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('returns 400 when no eligible tokens are found (expired)', async () => {
    vi.mocked(hashResetToken).mockReturnValue(SUBMITTED_TOKEN_HASH)
    mockPendingLookup(null)
    vi.mocked(PasswordResetToken.findOneAndUpdate).mockResolvedValue(null as never)

    const response = await POST(
      resetPasswordRequest({
        token: 'expired-token',
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when a used token cannot be matched', async () => {
    vi.mocked(hashResetToken).mockReturnValue(SUBMITTED_TOKEN_HASH)
    mockPendingLookup(null)
    vi.mocked(PasswordResetToken.findOneAndUpdate).mockResolvedValue(null as never)

    const response = await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(response.status).toBe(400)
    expect(User.findById).not.toHaveBeenCalled()
  })

  it('returns 400 when the associated user does not exist', async () => {
    vi.mocked(hashResetToken).mockReturnValue(SUBMITTED_TOKEN_HASH)
    mockPendingLookup({ _id: 'token-1' })
    vi.mocked(PasswordResetToken.findOneAndUpdate).mockResolvedValue(makeToken() as never)
    mockUserLookup(null)

    const response = await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(response.status).toBe(400)
    // The token was claimed before the user lookup failed, so the transaction
    // must be rolled back rather than leaving the token spent.
    expect(rolledBack).toBe(true)
  })

  it('rolls the token claim back when the user lookup fails', async () => {
    vi.mocked(hashResetToken).mockReturnValue(SUBMITTED_TOKEN_HASH)
    mockPendingLookup({ _id: 'token-1' })
    vi.mocked(PasswordResetToken.findOneAndUpdate).mockResolvedValue(makeToken() as never)
    mockUserLookup(null)

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    // The token was claimed inside the transaction, so the failure aborts it
    // and the token is released rather than left spent.
    expect(rolledBack).toBe(true)
    expect(session.abortTransaction).toHaveBeenCalled()
  })

  it('rolls the token claim back when saving the user fails', async () => {
    const user = makeUser()
    user.save.mockRejectedValue(new Error('write failed'))
    mockValidReset(user)

    const response = await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(response.status).toBe(500)
    expect(rolledBack).toBe(true)
    expect(session.abortTransaction).toHaveBeenCalled()
  })

  it('rejects a password shorter than eight characters', async () => {
    const response = await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'short',
      }),
      undefined as never,
    )

    expect(response.status).toBe(400)
    expect(PasswordResetToken.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('rejects a missing token', async () => {
    const response = await POST(
      resetPasswordRequest({ newPassword: 'NewPassword123' }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('rejects a missing new password', async () => {
    const response = await POST(
      resetPasswordRequest({ token: SUBMITTED_TOKEN }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('rejects an empty token', async () => {
    const response = await POST(
      resetPasswordRequest({
        token: '',
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('rejects unexpected request fields', async () => {
    const response = await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
        extraField: true,
      }),
      undefined as never,
    )

    expect(response.status).toBe(400)
  })

  it('does not update the password when the token is not found', async () => {
    const user = makeUser()
    vi.mocked(hashResetToken).mockReturnValue(SUBMITTED_TOKEN_HASH)
    mockPendingLookup(null)
    vi.mocked(PasswordResetToken.findOneAndUpdate).mockResolvedValue(null as never)
    mockUserLookup(user)

    await POST(
      resetPasswordRequest({
        token: SUBMITTED_TOKEN,
        newPassword: 'NewPassword123',
      }),
      undefined as never,
    )

    expect(hashPassword).not.toHaveBeenCalled()
    expect(user.save).not.toHaveBeenCalled()
  })
})
