import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/auth/invitation-status/route'
import { User } from '@/models/User'
import { AccountInvitation } from '@/models/AccountInvitation'
import { hashResetToken } from '@/lib/password'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findById: vi.fn() } }))
vi.mock('@/models/AccountInvitation', () => ({
  AccountInvitation: { findOne: vi.fn() },
}))
vi.mock('@/lib/password', () => ({ hashResetToken: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), clientIp: vi.fn(() => '203.0.113.9') }))

function statusRequest(token?: string) {
  const url = token
    ? `http://localhost/api/auth/invitation-status?token=${encodeURIComponent(token)}`
    : 'http://localhost/api/auth/invitation-status'
  return new NextRequest(url)
}

const RAW_TOKEN = 'raw-invitation-token'
const TOKEN_HASH = 'sha256-of-invitation-token'

describe('GET /auth/invitation-status', () => {
  function mockInvitationLookup(invitation: unknown) {
    vi.mocked(AccountInvitation.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(invitation),
    } as never)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hashResetToken).mockReturnValue(TOKEN_HASH)
  })

  it('reports a valid invitation and masks the account email', async () => {
    mockInvitationLookup({
      userId: 'user-1',
      tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
    })
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          email: 'jane@example.com',
          accountStatus: 'pending',
          status: 'active',
        }),
      }),
    } as never)

    const response = await GET(statusRequest(RAW_TOKEN), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.valid).toBe(true)
    expect(json.reason).toBe('ready')
    expect(json.email).toBe('j***@e***.com')
    expect(json.email).not.toContain('jane@example.com')
  })

  it('reports an unknown token as invalid', async () => {
    mockInvitationLookup(null)

    const response = await GET(statusRequest(RAW_TOKEN), undefined as never)
    const json = await response.json()

    expect(json.valid).toBe(false)
    expect(json.reason).toBe('invalid')
  })

  it('reports a used token as used', async () => {
    mockInvitationLookup({
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      used: true,
    })

    const response = await GET(statusRequest(RAW_TOKEN), undefined as never)
    const json = await response.json()

    expect(json.valid).toBe(false)
    expect(json.reason).toBe('used')
  })

  it('reports an expired token as expired', async () => {
    mockInvitationLookup({
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
      used: false,
    })

    const response = await GET(statusRequest(RAW_TOKEN), undefined as never)
    const json = await response.json()

    expect(json.valid).toBe(false)
    expect(json.reason).toBe('expired')
  })

  it('requires a token', async () => {
    const response = await GET(statusRequest(), undefined as never)
    expect(response.status).toBe(400)
  })
})
