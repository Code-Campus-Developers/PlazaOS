import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/forgot-password/route'
import { ApiError } from '@/lib/api-error'
import { User } from '@/models/User'
import { PasswordResetToken } from '@/models/PasswordResetToken'
import { hashResetToken } from '@/lib/password'
import { rateLimit } from '@/lib/rate-limit'
import { sendEmailWithStatus } from '@/lib/email'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findOne: vi.fn() } }))
vi.mock('@/models/PasswordResetToken', () => ({ PasswordResetToken: { create: vi.fn(), updateMany: vi.fn() } }))
vi.mock('@/lib/password', () => ({ hashResetToken: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), clientIp: vi.fn(() => '203.0.113.1') }))
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendEmailWithStatus: vi.fn(async () => ({ status: 'sent' })) }
})

function forgotPasswordRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /auth/forgot-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns success when email matches a user', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'user-1',
      email: 'jane@example.com',
    } as never)
    vi.mocked(hashResetToken).mockReturnValue('hashed-token')
    vi.mocked(PasswordResetToken.create).mockResolvedValue({
      userId: 'user-1',
      tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 30 * 60_000),
      used: false,
    } as never)

    const response = await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.message).toContain('If an account exists')
  })

  it('returns the same success message when email does NOT match any user (no enumeration)', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    const response = await POST(forgotPasswordRequest({ email: 'nobody@example.com' }), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.message).toContain('If an account exists')
  })

  it('creates a PasswordResetToken when user exists', async () => {
    const mockUser = {
      _id: 'user-1',
      email: 'jane@example.com',
    }
    vi.mocked(User.findOne).mockResolvedValue(mockUser as never)
    vi.mocked(hashResetToken).mockReturnValue('hashed-token')
    vi.mocked(PasswordResetToken.create).mockResolvedValue({
      userId: 'user-1',
      tokenHash: 'hashed-token',
      used: false,
    } as never)

    await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)

    expect(PasswordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        tokenHash: 'hashed-token',
        used: false,
        expiresAt: expect.any(Date),
      }),
    )
  })

  it('sends a reset email when user exists', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'user-1',
      email: 'jane@example.com',
    } as never)
    vi.mocked(hashResetToken).mockReturnValue('hashed-token')
    vi.mocked(PasswordResetToken.create).mockResolvedValue({} as never)

    await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)

    expect(sendEmailWithStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        subject: 'Password Reset Request - PlazaOS',
        html: expect.stringContaining('Password Reset'),
      }),
    )
  })

  it('does NOT send an email when user does not exist', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    await POST(forgotPasswordRequest({ email: 'nobody@example.com' }), undefined as never)

    expect(sendEmailWithStatus).not.toHaveBeenCalled()
  })

  it('rejects an invalid email format', async () => {
    const response = await POST(forgotPasswordRequest({ email: 'not-an-email' }), undefined as never)

    expect(response.status).toBe(400)
    expect(User.findOne).not.toHaveBeenCalled()
  })

  it('rejects unknown extra fields (.strict())', async () => {
    const response = await POST(forgotPasswordRequest({ email: 'jane@example.com', extra: 'field' }), undefined as never)

    expect(response.status).toBe(400)
  })

  it('rejects a missing email field', async () => {
    const response = await POST(forgotPasswordRequest({}), undefined as never)

    expect(response.status).toBe(400)
  })

  it('rate-limits per source IP', async () => {
    vi.mocked(rateLimit).mockImplementationOnce(() => {
      throw new ApiError('Too many requests, please try again later', 429)
    })

    const response = await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)

    expect(response.status).toBe(429)
  })

  it('applies rate limiting with correct parameters', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)

    expect(rateLimit).toHaveBeenCalledWith('forgot-password:ip:203.0.113.1', 5, 15 * 60_000)
    // A per-target-email bucket as well, so rotating IPs cannot flood one
    // inbox with reset emails.
    expect(rateLimit).toHaveBeenCalledWith('forgot-password:email:jane@example.com', 3, 15 * 60_000)
  })

  it('supersedes any earlier outstanding reset token for the same user', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'user-1', email: 'jane@example.com' } as never)
    vi.mocked(hashResetToken).mockReturnValue('hashed-token')
    vi.mocked(PasswordResetToken.create).mockResolvedValue({} as never)

    await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)

    // Only one reset token per user may stay live — otherwise an older
    // (possibly already forwarded) link remains redeemable.
    expect(PasswordResetToken.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', used: false },
      { $set: { used: true } },
    )
  })

  it('still returns the generic success response when the email was not delivered', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'user-1', email: 'jane@example.com' } as never)
    vi.mocked(hashResetToken).mockReturnValue('hashed-token')
    vi.mocked(PasswordResetToken.create).mockResolvedValue({} as never)
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'not_configured' } as never)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)
    const json = await response.json()

    // The response must stay identical for existing and non-existing accounts,
    // so an undelivered message is reported server-side only.
    expect(response.status).toBe(200)
    expect(json.message).toContain('If an account exists')
    expect(consoleError).toHaveBeenCalledWith('Password reset email was not delivered', expect.anything())

    consoleError.mockRestore()
  })

  it('hashes the token before storing (never stores raw token)', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'user-1',
      email: 'jane@example.com',
    } as never)
    vi.mocked(hashResetToken).mockReturnValue('hashed-token')
    vi.mocked(PasswordResetToken.create).mockResolvedValue({} as never)

    await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)

    // Verify hashResetToken was called (token gets hashed)
    expect(hashResetToken).toHaveBeenCalled()
    // Verify stored token is hashed, not raw
    const createCall = vi.mocked(PasswordResetToken.create).mock.calls[0]
    expect(createCall[0].tokenHash).toBe('hashed-token')
  })

  it('sets token expiration to 30 minutes from now', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'user-1',
      email: 'jane@example.com',
    } as never)
    vi.mocked(hashResetToken).mockReturnValue('hashed-token')
    vi.mocked(PasswordResetToken.create).mockResolvedValue({} as never)

    const before = Date.now()
    await POST(forgotPasswordRequest({ email: 'jane@example.com' }), undefined as never)
    const after = Date.now()

    const createCall = vi.mocked(PasswordResetToken.create).mock.calls[0]
    const expiresAt = createCall[0].expiresAt.getTime()

    expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * 60_000)
    expect(expiresAt).toBeLessThanOrEqual(after + 30 * 60_000 + 1000)
  })

  it('normalizes email to lowercase before lookup', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    await POST(forgotPasswordRequest({ email: 'JANE@EXAMPLE.COM' }), undefined as never)

    expect(User.findOne).toHaveBeenCalledWith({ email: 'jane@example.com' })
  })
})
