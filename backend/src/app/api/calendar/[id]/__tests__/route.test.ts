import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/calendar/[id]/route'
import { signToken } from '@/lib/jwt'
import { CalendarEvent } from '@/models/CalendarEvent'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/CalendarEvent', () => ({ CalendarEvent: { findById: vi.fn() } }))

function adminRequest() {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/calendar/event-1', {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('DELETE /calendar/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes standalone events', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined)
    vi.mocked(CalendarEvent.findById).mockResolvedValue({ type: 'other', deleteOne } as never)
    const response = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'event-1' }) })
    expect(response.status).toBe(200)
    expect(deleteOne).toHaveBeenCalledOnce()
  })

  it('deletes a standalone calendar document regardless of its legacy type', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined)
    vi.mocked(CalendarEvent.findById).mockResolvedValue({ type: 'reminder', deleteOne } as never)
    const response = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'event-1' }) })
    expect(response.status).toBe(200)
    expect(deleteOne).toHaveBeenCalledOnce()
  })
})
