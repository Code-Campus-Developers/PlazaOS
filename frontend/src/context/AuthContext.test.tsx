import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import { api } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})

const mockedPost = vi.mocked(api.post)

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

beforeEach(() => {
  localStorage.clear()
  mockedPost.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AuthContext', () => {
  it('stores the token and user on successful login', async () => {
    mockedPost.mockResolvedValueOnce({
      token: 'tok-123',
      user: { id: '1', name: 'Admin User', email: 'admin@plaza.test', role: 'admin' },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('admin@plaza.test', 'secret')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.role).toBe('admin')
    expect(localStorage.getItem('plaza_os_token')).toBe('tok-123')
  })

  it('falls back to the dev mock account when the API is unreachable', async () => {
    mockedPost.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('tenant@plaza.test', 'password123')
    })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(result.current.role).toBe('tenant')
  })

  it('rethrows the original error when mock fallback credentials do not match', async () => {
    mockedPost.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.login('unknown@plaza.test', 'wrong-password')
      }),
    ).rejects.toThrow('Failed to fetch')

    expect(result.current.isAuthenticated).toBe(false)
  })

  it('logout clears the user and token', async () => {
    mockedPost.mockResolvedValueOnce({
      token: 'tok-tenant',
      user: { id: '2', name: 'Tenant User', email: 'tenant@plaza.test', role: 'tenant' },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('tenant@plaza.test', 'secret')
    })
    expect(result.current.isAuthenticated).toBe(true)

    act(() => {
      result.current.logout()
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('plaza_os_token')).toBeNull()
  })
})
