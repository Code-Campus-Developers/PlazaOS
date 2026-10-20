import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { POST } from '@/app/api/tenants/[id]/reset-password/route'
import { signToken } from '@/lib/jwt'
import { User } from '@/models/User'
import { AccountInvitation } from '@/models/AccountInvitation'
import { sendEmailWithStatus } from '@/lib/email'
import { rateLimit } from '@/lib/rate-limit'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findOne: vi.fn() } }))
vi.mock('@/models/AccountInvitation', () => ({
  AccountInvitation: { updateMany: vi.fn(), create: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendEmail: vi.fn(), sendEmailWithStatus: vi.fn() }
})
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn() }))
vi.mock('mongoose', () => ({ default: { startSession: vi.fn() } }))

function adminRequest(sub = 'admin-1') {
  const token = signToken({ sub, role: 'admin' })
  return new NextRequest('http://localhost/api/tenants/tenant-1/reset-password', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
}

function makeUser() {
  return {
    _id: 'tenant-1',
    email: 'jane@example.com',
    name: 'Jane Cooper',
    passwordHash: 'old-hash',
    accountStatus: 'active',
    mustChangePassword: false,
    save: vi.fn().mockResolvedValue(undefined),
  }
}

describe('POST /tenants/:id/reset-password', () => {
  let session: { withTransaction: ReturnType<typeof vi.fn>; endSession: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    session = {
      withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
      endSession: vi.fn(),
    }
    vi.mocked(mongoose.startSession).mockResolvedValue(session as never)
    vi.mocked(AccountInvitation.updateMany).mockResolvedValue({} as never)
    vi.mocked(AccountInvitation.create).mockResolvedValue([{ _id: 'invitation-1' }] as never)
    vi.mocked(AccountInvitation.updateOne).mockResolvedValue({} as never)
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'sent' })
  })

  it('returns 404 when the tenant does not exist', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    const response = await POST(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(response.status).toBe(404)
  })

  it('sends an invitation to the tenant and never returns a password to the admin', async () => {
    const user = makeUser()
    vi.mocked(User.findOne).mockResolvedValue(user as never)

    const response = await POST(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.email).toBe('jane@example.com')
    expect(json.invitation.delivered).toBe(true)
    expect(json.invitation.status).toBe('sent')
    // The administrator must never see a password or a token.
    expect(json).not.toHaveProperty('tempPassword')
    expect(json).not.toHaveProperty('token')
    expect(JSON.stringify(json)).not.toContain('tokenHash')
  })

  it('invalidates the old password and forces the tenant back into setup', async () => {
    const user = makeUser()
    vi.mocked(User.findOne).mockResolvedValue(user as never)

    await POST(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })

    expect(user.passwordHash).toBeUndefined()
    expect(user.accountStatus).toBe('pending')
    expect(user.mustChangePassword).toBe(true)
    expect(user.save).toHaveBeenCalledOnce()
  })

  it('emails the setup link to the tenant, not to the administrator', async () => {
    vi.mocked(User.findOne).mockResolvedValue(makeUser() as never)

    await POST(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })

    expect(sendEmailWithStatus).toHaveBeenCalledOnce()
    const [email] = vi.mocked(sendEmailWithStatus).mock.calls[0]
    expect(email.to).toBe('jane@example.com')
    expect(email.subject).toContain('Set up your PlazaOS account')
    expect(email.html).toContain('/tenant/account-setup?token=')
  })

  it('revokes the token and reports an undelivered invitation when email fails', async () => {
    vi.mocked(User.findOne).mockResolvedValue(makeUser() as never)
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'failed', error: 'provider down' })

    const response = await POST(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.invitation.delivered).toBe(false)
    expect(json.invitation.status).toBe('failed')
    // The token nobody received must not stay redeemable.
    expect(AccountInvitation.updateOne).toHaveBeenCalledWith(
      { _id: 'invitation-1', used: false },
      { $set: { used: true } },
    )
  })

  it('treats an unconfigured email provider as an undelivered invitation', async () => {
    vi.mocked(User.findOne).mockResolvedValue(makeUser() as never)
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'not_configured' })

    const response = await POST(adminRequest(), { params: Promise.resolve({ id: 'tenant-1' }) })
    const json = await response.json()

    expect(json.invitation.delivered).toBe(false)
    expect(json.invitation.status).toBe('not_configured')
  })

  it('is rate-limited per acting admin', async () => {
    vi.mocked(User.findOne).mockResolvedValue(makeUser() as never)

    await POST(adminRequest('admin-1'), { params: Promise.resolve({ id: 'tenant-1' }) })

    expect(rateLimit).toHaveBeenCalledWith('reset-password:admin-1', 5, 15 * 60_000)
  })

  it('only matches tenant-role users, not admins', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    await POST(adminRequest(), { params: Promise.resolve({ id: 'some-admin' }) })

    expect(User.findOne).toHaveBeenCalledWith({ _id: 'some-admin', role: 'tenant' })
  })

  it('rejects a tenant-role token with 403', async () => {
    const token = signToken({ sub: 'tenant-1', role: 'tenant' })
    const request = new NextRequest('http://localhost/api/tenants/tenant-1/reset-password', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    const response = await POST(request, { params: Promise.resolve({ id: 'tenant-1' }) })
    expect(response.status).toBe(403)
  })
})
