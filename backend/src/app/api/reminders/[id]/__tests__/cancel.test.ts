import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/reminders/[id]/route'
import { signToken } from '@/lib/jwt'
import { Reminder } from '@/models/Reminder'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/Reminder', () => ({ Reminder: { findById: vi.fn(), findOneAndUpdate: vi.fn() } }))

function adminRequest(body: unknown) {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/reminders/rem-1', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /reminders/:id cancellation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cancels a scheduled reminder without deleting it', async () => {
    vi.mocked(Reminder.findOneAndUpdate).mockResolvedValue({
      _id: 'rem-1',
      title: 'Rent due',
      message: 'Rent is due',
      type: 'automatic',
      target: 'tenant',
      targetLabel: 'Tenant',
      scheduledFor: '2026-11-20',
      status: 'cancelled',
    } as never)

    const response = await PATCH(adminRequest({ status: 'cancelled' }), { params: Promise.resolve({ id: 'rem-1' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe('cancelled')
  })

  it('preserves reminders that are already sent', async () => {
    vi.mocked(Reminder.findOneAndUpdate).mockResolvedValue(null as never)
    vi.mocked(Reminder.findById).mockResolvedValue({ status: 'sent' } as never)

    const response = await PATCH(adminRequest({ status: 'cancelled' }), { params: Promise.resolve({ id: 'rem-1' }) })
    expect(response.status).toBe(409)
  })
})
