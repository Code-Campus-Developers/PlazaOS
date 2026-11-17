import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Login } from './Login'
import { useAuth } from '../context/useAuth'
import type { AuthUser } from '../context/AuthContext'

vi.mock('../context/useAuth', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)

describe('Login', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      user: null,
      token: null,
      role: null,
      isAuthenticated: false,
      login: vi.fn(),
      completePasswordSetup: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('shows progress and disables repeat submission while sign-in is pending', async () => {
    const login = vi.fn(() => new Promise<AuthUser>(() => {}))
    mockedUseAuth.mockReturnValue({
      user: null,
      token: null,
      role: null,
      isAuthenticated: false,
      login,
      completePasswordSetup: vi.fn(),
      logout: vi.fn(),
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'admin@plaza.test')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Signing in…')
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
    expect(login).toHaveBeenCalledTimes(1)
  })
})
