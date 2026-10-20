import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/login/route'
import { ApiError } from '@/lib/api-error'
import { User } from '@/models/User'
import { verifyPassword } from '@/lib/password'
import { rateLimit } from '@/lib/rate-limit'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/models/User', () => ({ User: { findOne: vi.fn() } }))
vi.mock('@/lib/password', () => ({ verifyPassword: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), clientIp: vi.fn(() => '203.0.113.1') }))

function loginRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /auth/login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a token and user on valid credentials', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'user-1',
      name: 'Jane Cooper',
      email: 'jane@example.com',
      role: 'tenant',
      mustChangePassword: false,
      passwordHash: 'hashed',
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true as never)

    const response = await POST(loginRequest({ email: 'jane@example.com', password: 'correct-password' }), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.token).toBeTypeOf('string')
    expect(json.user).toMatchObject({ id: 'user-1', role: 'tenant', mustChangePassword: false })
  })

  it('rejects with the same generic message when the email is unknown', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    const response = await POST(loginRequest({ email: 'nobody@example.com', password: 'whatever' }), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.message).toBe('Invalid email or password')
  })

  it('rejects with the same generic message when the password is wrong', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'user-1', passwordHash: 'hashed' } as never)
    vi.mocked(verifyPassword).mockResolvedValue(false as never)

    const response = await POST(loginRequest({ email: 'jane@example.com', password: 'wrong' }), undefined as never)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.message).toBe('Invalid email or password')
  })

  it('rejects a deactivated account even with the correct password', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'user-1',
      name: 'Jane Cooper',
      email: 'jane@example.com',
      role: 'tenant',
      status: 'inactive',
      mustChangePassword: false,
      passwordHash: 'hashed',
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true as never)

    const response = await POST(loginRequest({ email: 'jane@example.com', password: 'correct-password' }), undefined as never)

    expect(response.status).toBe(403)
    expect((await response.json()).token).toBeUndefined()
  })

  it('rejects a malformed body with 400 before touching the database', async () => {
    const response = await POST(loginRequest({ email: 'not-an-email' }), undefined as never)

    expect(response.status).toBe(400)
    expect(User.findOne).not.toHaveBeenCalled()
  })

  it('rejects unknown extra fields (.strict())', async () => {
    const response = await POST(loginRequest({ email: 'jane@example.com', password: 'x', remember: true }), undefined as never)
    expect(response.status).toBe(400)
  })

  it('rate-limits per source IP and per targeted email', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    await POST(loginRequest({ email: 'jane@example.com', password: 'whatever' }), undefined as never)

    expect(rateLimit).toHaveBeenCalledWith('login:ip:203.0.113.1', 20, 5 * 60_000)
    expect(rateLimit).toHaveBeenCalledWith('login:email:jane@example.com', 5, 5 * 60_000)
  })

  it('propagates a 429 once the rate limiter trips', async () => {
    vi.mocked(rateLimit).mockImplementationOnce(() => {
      throw new ApiError('Too many requests, please try again later', 429)
    })

    const response = await POST(loginRequest({ email: 'jane@example.com', password: 'whatever' }), undefined as never)
    expect(response.status).toBe(429)
  })
})
