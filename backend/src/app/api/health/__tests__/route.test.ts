import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/health/route'
import { dbConnect } from '@/lib/db'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('mongoose', () => ({ default: { connection: { readyState: 1 } } }))

describe('GET /api/health', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200/ok when the database is connected', async () => {
    vi.mocked(dbConnect).mockResolvedValue(undefined as never)
    const mongoose = (await import('mongoose')).default as unknown as { connection: { readyState: number } }
    mongoose.connection.readyState = 1

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ status: 'ok', db: 'connected' })
  })

  it('returns 503/degraded when the database is not connected', async () => {
    vi.mocked(dbConnect).mockResolvedValue(undefined as never)
    const mongoose = (await import('mongoose')).default as unknown as { connection: { readyState: number } }
    mongoose.connection.readyState = 0

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json).toEqual({ status: 'degraded', db: 'disconnected' })
  })

  it('returns 503/degraded when dbConnect throws', async () => {
    vi.mocked(dbConnect).mockRejectedValue(new Error('connection refused'))

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json).toEqual({ status: 'degraded', db: 'disconnected' })
  })
})
