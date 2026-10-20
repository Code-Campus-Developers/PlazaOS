import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { POST } from '@/app/api/tenants/route'
import { signToken } from '@/lib/jwt'
import { Unit } from '@/models/Unit'
import { User } from '@/models/User'
import { Lease } from '@/models/Lease'
import { AccountInvitation } from '@/models/AccountInvitation'
import { sendEmailWithStatus } from '@/lib/email'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/Unit', () => ({ Unit: { findById: vi.fn() } }))
vi.mock('@/models/User', () => ({ User: { findOne: vi.fn(), create: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { create: vi.fn(), findOne: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { find: vi.fn() } }))
vi.mock('@/models/AccountInvitation', () => ({
  AccountInvitation: { updateMany: vi.fn(), create: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendEmail: vi.fn(), sendEmailWithStatus: vi.fn() }
})
vi.mock('mongoose', () => ({ default: { startSession: vi.fn() } }))

function adminRequest(body: unknown) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/tenants', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  name: 'Jane Cooper',
  email: 'jane.cooper@example.com',
  phone: '+1 (555) 010-1234',
  unitId: 'unit-1',
  leaseStart: '2026-08-01',
  leaseEnd: '2027-07-31',
  monthlyRent: 1200,
}

function mockSessionQuery(resolvedValue: unknown) {
  return vi.fn(() => ({ session: vi.fn().mockResolvedValue(resolvedValue) }))
}

describe('POST /tenants', () => {
  let session: { withTransaction: ReturnType<typeof vi.fn>; endSession: ReturnType<typeof vi.fn>; abortTransaction: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    session = {
      withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
      endSession: vi.fn(),
      abortTransaction: vi.fn(),
    }
    vi.mocked(mongoose.startSession).mockResolvedValue(session as never)
    vi.mocked(AccountInvitation.updateMany).mockResolvedValue({} as never)
    vi.mocked(AccountInvitation.create).mockResolvedValue([{ _id: 'invitation-1' }] as never)
    vi.mocked(AccountInvitation.updateOne).mockResolvedValue({} as never)
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'sent' })
  })

  it('rejects assigning a tenant to a unit that is not vacant', async () => {
    Unit.findById = mockSessionQuery({ _id: 'unit-1', status: 'occupied', unitNumber: 'A-101' }) as never

    const response = await POST(adminRequest(validBody), undefined as never)

    expect(response.status).toBe(409)
    expect(User.create).not.toHaveBeenCalled()
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  it('rejects a body that carries a client-supplied unitNumber', async () => {
    // The unit number is derived from the assigned unit, and the schema is
    // strict, so a client that sends it gets a 400 rather than a silently
    // ignored field. The frontend strips it before posting.
    const response = await POST(adminRequest({ ...validBody, unitNumber: 'A-101' }), undefined as never)

    expect(response.status).toBe(400)
    expect(User.create).not.toHaveBeenCalled()
  })

  it('rolls back (creates nothing) when the lease step fails mid-transaction', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn().mockResolvedValue(undefined) }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery(null) as never
    vi.mocked(User.create).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)
    vi.mocked(Lease.create).mockRejectedValue(new Error('lease write failed'))

    const response = await POST(adminRequest(validBody), undefined as never)

    // withTransaction's callback threw, so the route's `created` var was
    // never assigned and nothing is reported as successfully created.
    expect(response.status).toBe(500)
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  it('creates the tenant, occupies the unit, and creates a lease atomically on success', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn().mockResolvedValue(undefined) }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery(null) as never
    vi.mocked(User.create).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)
    vi.mocked(Lease.create).mockResolvedValue([{ _id: 'lease-1' }] as never)

    const response = await POST(adminRequest(validBody), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.id).toBe('tenant-1')
    expect(unitDoc.status).toBe('occupied')
    expect(unitDoc.save).toHaveBeenCalledOnce()
  })

  it('creates the tenant WITHOUT a password and in the pending-setup state', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn().mockResolvedValue(undefined) }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery(null) as never
    vi.mocked(User.create).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)
    vi.mocked(Lease.create).mockResolvedValue([{ _id: 'lease-1' }] as never)

    await POST(adminRequest(validBody), undefined as never)

    const [newUser] = vi.mocked(User.create).mock.calls[0][0] as Record<string, unknown>[]
    expect(newUser.passwordHash).toBeUndefined()
    expect(newUser.accountStatus).toBe('pending')
    expect(newUser.mustChangePassword).toBe(true)
  })

  it('never returns a password, temp password, or token to the administrator', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn().mockResolvedValue(undefined) }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery(null) as never
    vi.mocked(User.create).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)
    vi.mocked(Lease.create).mockResolvedValue([{ _id: 'lease-1' }] as never)

    const response = await POST(adminRequest(validBody), undefined as never)
    const json = await response.json()

    expect(json).not.toHaveProperty('tempPassword')
    expect(json).not.toHaveProperty('token')
    expect(json).not.toHaveProperty('password')
    expect(json.invitation.delivered).toBe(true)
  })

  it('emails the setup link to the tenant', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn().mockResolvedValue(undefined) }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery(null) as never
    vi.mocked(User.create).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)
    vi.mocked(Lease.create).mockResolvedValue([{ _id: 'lease-1' }] as never)

    await POST(adminRequest(validBody), undefined as never)

    expect(sendEmailWithStatus).toHaveBeenCalledOnce()
    const [email] = vi.mocked(sendEmailWithStatus).mock.calls[0]
    expect(email.to).toBe('jane.cooper@example.com')
    expect(email.html).toContain('/tenant/account-setup?token=')
  })

  it('stores only a hash of the invitation token, never the raw token', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn().mockResolvedValue(undefined) }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery(null) as never
    vi.mocked(User.create).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)
    vi.mocked(Lease.create).mockResolvedValue([{ _id: 'lease-1' }] as never)

    await POST(adminRequest(validBody), undefined as never)

    const [invitation] = vi.mocked(AccountInvitation.create).mock.calls[0][0] as Record<string, unknown>[]
    expect(invitation.tokenHash).toEqual(expect.any(String))
    expect(invitation.tokenHash).toHaveLength(64) // sha256 hex digest
    expect(invitation).not.toHaveProperty('token')
  })

  it('revokes the token and reports an undelivered invitation when email fails', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn().mockResolvedValue(undefined) }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery(null) as never
    vi.mocked(User.create).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)
    vi.mocked(Lease.create).mockResolvedValue([{ _id: 'lease-1' }] as never)
    vi.mocked(sendEmailWithStatus).mockResolvedValue({ status: 'failed', error: 'provider down' })

    const response = await POST(adminRequest(validBody), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.invitation.delivered).toBe(false)
    expect(json.invitation.status).toBe('failed')
    expect(AccountInvitation.updateOne).toHaveBeenCalledWith(
      { _id: 'invitation-1', used: false },
      { $set: { used: true } },
    )
  })

  it('rejects creating a tenant with an email that already exists', async () => {
    const unitDoc = { _id: 'unit-1', status: 'vacant', unitNumber: 'A-101', save: vi.fn() }
    Unit.findById = mockSessionQuery(unitDoc) as never
    User.findOne = mockSessionQuery({ _id: 'existing-user' }) as never

    const response = await POST(adminRequest(validBody), undefined as never)

    expect(response.status).toBe(409)
    expect(User.create).not.toHaveBeenCalled()
  })
})
