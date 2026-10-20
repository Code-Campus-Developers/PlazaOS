import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AccountInvitation } from '@/models/AccountInvitation'
import {
  buildInvitationUrl,
  deliverInvitationEmail,
  invalidateOutstandingInvitations,
  issueAccountInvitation,
} from '@/lib/account-invitation'
import { sendEmailWithStatus } from '@/lib/email'

vi.mock('@/models/AccountInvitation', () => ({
  AccountInvitation: { updateMany: vi.fn(), create: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendEmailWithStatus: vi.fn() }
})

describe('buildInvitationUrl', () => {
  it('points at the account-setup page with the token as a query parameter', () => {
    process.env.FRONTEND_URL = 'https://app.plazaos.ng'
    expect(buildInvitationUrl('abc123')).toBe('https://app.plazaos.ng/tenant/account-setup?token=abc123')
  })

  it('encodes the token so it cannot break out of the query string', () => {
    process.env.FRONTEND_URL = 'https://app.plazaos.ng'
    expect(buildInvitationUrl('a b&c=d')).toBe('https://app.plazaos.ng/tenant/account-setup?token=a%20b%26c%3Dd')
  })
})

describe('issueAccountInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AccountInvitation.updateMany).mockResolvedValue({} as never)
    vi.mocked(AccountInvitation.create).mockResolvedValue([{ _id: 'invitation-1' }] as never)
  })

  it('marks the previous invitations used before creating the new one', async () => {
    await issueAccountInvitation('user-1', 'admin-1')

    expect(AccountInvitation.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', used: false },
      { $set: { used: true } },
      {},
    )
    expect(AccountInvitation.create).toHaveBeenCalledWith(
      [expect.objectContaining({ userId: 'user-1', used: false, invitedBy: 'admin-1' })],
      {},
    )
  })

  it('never returns or stores the raw token', async () => {
    const invitation = await issueAccountInvitation('user-1', 'admin-1')

    expect(invitation.rawToken).toMatch(/^[0-9a-f]{64}$/)
    const [createArg] = vi.mocked(AccountInvitation.create).mock.calls[0]
    expect(createArg[0].tokenHash).not.toBe(invitation.rawToken)
    expect(createArg[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('passes the session through so the supersede and the create commit together', async () => {
    const session = { id: 'session-1' } as never
    await issueAccountInvitation('user-1', 'admin-1', session)

    expect(AccountInvitation.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', used: false },
      { $set: { used: true } },
      { session },
    )
    expect(AccountInvitation.create).toHaveBeenCalledWith(expect.any(Array), { session })
  })
})

describe('invalidateOutstandingInvitations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks every outstanding invitation for the user as used', async () => {
    await invalidateOutstandingInvitations('user-1')

    expect(AccountInvitation.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', used: false },
      { $set: { used: true } },
      {},
    )
  })
})

describe('deliverInvitationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'sent' })
    process.env.FRONTEND_URL = 'https://app.plazaos.ng'
  })

  it('escapes an administrator-supplied name so it cannot inject markup', async () => {
    await deliverInvitationEmail({
      to: 'jane@example.com',
      name: '<script>alert(1)</script>',
      rawToken: 'token-1',
    })

    const html = vi.mocked(sendEmailWithStatus).mock.calls[0][0].html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('sends the setup link to the tenant', async () => {
    await deliverInvitationEmail({ to: 'jane@example.com', name: 'Jane Cooper', rawToken: 'token-1' })

    expect(sendEmailWithStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        html: expect.stringContaining('https://app.plazaos.ng/tenant/account-setup?token=token-1'),
      }),
    )
  })

  it('reports the delivery outcome instead of swallowing it', async () => {
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'not_configured' })

    const result = await deliverInvitationEmail({ to: 'jane@example.com', name: 'Jane Cooper', rawToken: 'token-1' })

    expect(result).toEqual({ status: 'not_configured' })
  })
})
