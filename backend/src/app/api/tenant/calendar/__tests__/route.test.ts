import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/tenant/calendar/route'
import { signToken } from '@/lib/jwt'
import { CalendarEvent } from '@/models/CalendarEvent'
import { RentCharge } from '@/models/RentCharge'
import { Lease } from '@/models/Lease'
import { Reminder } from '@/models/Reminder'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/CalendarEvent', () => ({ CalendarEvent: { find: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { find: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { find: vi.fn() } }))
vi.mock('@/models/Reminder', () => ({ Reminder: { find: vi.fn() } }))

function tenantRequest(sub = 'tenant-1') {
  const token = signToken({ sub, role: 'tenant' })
  return new NextRequest('http://localhost/api/tenant/calendar', { headers: { authorization: `Bearer ${token}` } })
}

function mockEmpty() {
  vi.mocked(CalendarEvent.find).mockResolvedValue([] as never)
  vi.mocked(RentCharge.find).mockResolvedValue([] as never)
  vi.mocked(Lease.find).mockResolvedValue([] as never)
  vi.mocked(Reminder.find).mockResolvedValue([] as never)
}

describe('GET /tenant/calendar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes CalendarEvent to own-or-broadcast, RentCharge/Lease to own, Reminder to own-or-everyone', async () => {
    mockEmpty()

    await GET(tenantRequest('tenant-1'), undefined as never)

    expect(CalendarEvent.find).toHaveBeenCalledWith({ $or: [{ tenantId: 'tenant-1' }, { tenantId: null }] })
    expect(RentCharge.find).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: { $ne: 'paid' },
      period: { $regex: expect.any(RegExp) },
    })
    expect(Lease.find).toHaveBeenCalledWith({ tenantId: 'tenant-1', status: 'active' })
    expect(Reminder.find).toHaveBeenCalledWith({ status: 'scheduled', $or: [{ target: 'everyone' }, { targetTenantIds: 'tenant-1' }] })
  })

  it('merges and sorts all 4 sources by date', async () => {
    vi.mocked(CalendarEvent.find).mockResolvedValue([{ _id: 'evt-1', title: 'Fire drill', date: '2026-08-15', type: 'other' }] as never)
    vi.mocked(RentCharge.find).mockResolvedValue([{ _id: 'rc-1', period: '2026-08-01 to 2027-07-31', dueDate: '2026-08-05' }] as never)
    vi.mocked(Lease.find).mockResolvedValue([{ _id: 'lease-1', endDate: '2026-08-20' }] as never)
    vi.mocked(Reminder.find).mockResolvedValue([{ _id: 'rem-1', title: 'Reminder', scheduledFor: '2026-08-01' }] as never)

    const response = await GET(tenantRequest(), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toHaveLength(4)
    expect(json.map((item: { date: string }) => item.date)).toEqual(['2026-08-01', '2026-08-05', '2026-08-15', '2026-08-20'])
  })

  it('rejects an admin-role token with 403', async () => {
    const token = signToken({ sub: 'admin-1', role: 'admin' })
    const response = await GET(
      new NextRequest('http://localhost/api/tenant/calendar', { headers: { authorization: `Bearer ${token}` } }),
      undefined as never,
    )
    expect(response.status).toBe(403)
  })
})
