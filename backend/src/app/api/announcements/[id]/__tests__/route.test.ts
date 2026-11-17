import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/announcements/[id]/route'
import { signToken } from '@/lib/jwt'
import { Announcement } from '@/models/Announcement'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/Announcement', () => ({ Announcement: { findByIdAndDelete: vi.fn() } }))

function adminRequest() {
  const token = signToken({ sub: 'admin-1', role: 'admin' })
  return new NextRequest('http://localhost/api/announcements/notice-1', {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('DELETE /announcements/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes an existing announcement', async () => {
    vi.mocked(Announcement.findByIdAndDelete).mockResolvedValue({ _id: 'notice-1' } as never)
    const response = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'notice-1' }) })
    expect(response.status).toBe(200)
  })

  it('returns 404 when no announcement exists', async () => {
    vi.mocked(Announcement.findByIdAndDelete).mockResolvedValue(null as never)
    const response = await DELETE(adminRequest(), { params: Promise.resolve({ id: 'notice-1' }) })
    expect(response.status).toBe(404)
  })
})
