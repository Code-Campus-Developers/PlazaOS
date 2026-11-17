import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/calendar/route'
import { signToken } from '@/lib/jwt'
import { CalendarEvent } from '@/models/CalendarEvent'
import { RentCharge } from '@/models/RentCharge'
import { Lease } from '@/models/Lease'
import { Reminder } from '@/models/Reminder'
import { Unit } from '@/models/Unit'
import { User } from '@/models/User'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/CalendarEvent', () => ({ CalendarEvent: { find: vi.fn(), create: vi.fn() } }))
vi.mock('@/models/RentCharge', () => ({ RentCharge: { find: vi.fn() } }))
vi.mock('@/models/Lease', () => ({ Lease: { find: vi.fn() } }))
vi.mock('@/models/Reminder', () => ({ Reminder: { find: vi.fn() } }))
vi.mock('@/models/Unit', () => ({ Unit: { find: vi.fn() } }))
vi.mock('@/models/User', () => ({ User: { find: vi.fn() } }))

function adminGet(url: string) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest(url, { headers: { authorization: `Bearer ${token}` } })
}

function adminPost(body: unknown) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/calendar', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockEmptySources() {
  vi.mocked(CalendarEvent.find).mockResolvedValue([] as never)
  vi.mocked(RentCharge.find).mockResolvedValue([] as never)
  vi.mocked(Lease.find).mockResolvedValue([] as never)
  vi.mocked(Reminder.find).mockResolvedValue([] as never)
  vi.mocked(Unit.find).mockResolvedValue([] as never)
  vi.mocked(User.find).mockResolvedValue([] as never)
}

describe('GET /calendar (admin, plaza-wide)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('merges standalone events with derived rent-due, lease-renewal, and reminder items', async () => {
    vi.mocked(CalendarEvent.find).mockResolvedValue([{ _id: 'evt-1', title: 'Fire drill', type: 'other', date: '2026-08-10' }] as never)
    vi.mocked(RentCharge.find).mockResolvedValue([{ _id: 'rc-1', period: '2026-08-01 to 2027-07-31', tenantId: 'tenant-1', unitId: 'unit-1', dueDate: '2026-08-05' }] as never)
    vi.mocked(Lease.find).mockResolvedValue([{ _id: 'lease-1', tenantId: 'tenant-1', unitId: 'unit-1', endDate: '2026-09-01' }] as never)
    vi.mocked(Reminder.find).mockResolvedValue([{ _id: 'rem-1', title: 'Rent reminder', scheduledFor: '2026-08-03', targetLabel: 'Everyone' }] as never)
    vi.mocked(Unit.find).mockResolvedValue([{ _id: 'unit-1', unitNumber: 'A-101' }] as never)
    vi.mocked(User.find).mockResolvedValue([{ _id: 'tenant-1', name: 'Jane Cooper' }] as never)

    const response = await GET(adminGet('http://localhost/api/calendar'), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.total).toBe(4)
    const types = json.data.map((item: { type: string }) => item.type).sort()
    expect(types).toEqual(['lease_renewal', 'other', 'reminder', 'rent_due'])
  })

  it('filters by type', async () => {
    mockEmptySources()
    vi.mocked(RentCharge.find).mockResolvedValue([{ _id: 'rc-1', period: '2026-08-01 to 2027-07-31', tenantId: 'tenant-1', unitId: 'unit-1', dueDate: '2026-08-05' }] as never)
    vi.mocked(CalendarEvent.find).mockResolvedValue([{ _id: 'evt-1', title: 'Fire drill', type: 'other', date: '2026-08-10' }] as never)

    const response = await GET(adminGet('http://localhost/api/calendar?type=rent_due'), undefined as never)
    const json = await response.json()

    expect(json.data).toHaveLength(1)
    expect(json.data[0].type).toBe('rent_due')
  })

  it('filters by dateFrom/dateTo', async () => {
    mockEmptySources()
    vi.mocked(CalendarEvent.find).mockResolvedValue([
      { _id: 'evt-1', title: 'Early event', type: 'other', date: '2026-01-01' },
      { _id: 'evt-2', title: 'Mid event', type: 'other', date: '2026-08-10' },
    ] as never)

    const response = await GET(adminGet('http://localhost/api/calendar?dateFrom=2026-06-01&dateTo=2026-12-31'), undefined as never)
    const json = await response.json()

    expect(json.data).toHaveLength(1)
    expect(json.data[0].title).toBe('Mid event')
  })

  it('rejects a tenant-role token with 403', async () => {
    const token = signToken({ sub: 'tenant-1', role: 'tenant' })
    const response = await GET(
      new NextRequest('http://localhost/api/calendar', { headers: { authorization: `Bearer ${token}` } }),
      undefined as never,
    )
    expect(response.status).toBe(403)
  })
})

describe('POST /calendar (admin, standalone event)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a standalone calendar event', async () => {
    vi.mocked(CalendarEvent.create).mockResolvedValue({ _id: 'evt-1' } as never)

    const response = await POST(adminPost({ title: 'Fire drill', type: 'other', date: '2026-08-10' }), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, id: 'evt-1' })
  })

  it('rejects a missing required field with 400', async () => {
    const response = await POST(adminPost({ title: 'Fire drill' }), undefined as never)
    expect(response.status).toBe(400)
    expect(CalendarEvent.create).not.toHaveBeenCalled()
  })
})
