import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../context/useAuth'
import type { AuthUser, Role } from '../context/AuthContext'

vi.mock('../context/useAuth', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>>) {
  mockedUseAuth.mockReturnValue({
    user: null,
    token: null,
    role: null,
    isAuthenticated: false,
    login: vi.fn(),
    loginAsMock: vi.fn(),
    completePasswordSetup: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  })
}

function renderAt(initialPath: string, requiredRole: Role, protectedPath = initialPath) {
  const accountSetupRoute = (
    <Route
      path="/tenant/account-setup"
      element={
        <ProtectedRoute requiredRole="tenant">
          <div>Account setup page</div>
        </ProtectedRoute>
      }
    />
  )

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/admin" element={<div>Admin dashboard</div>} />
        <Route path="/tenant" element={<div>Tenant dashboard</div>} />
        {accountSetupRoute}
        {protectedPath !== '/tenant/account-setup' ? (
          <Route
            path={protectedPath}
            element={
              <ProtectedRoute requiredRole={requiredRole}>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
        ) : null}
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    mockAuth({ isAuthenticated: false, role: null })
    renderAt('/admin/dashboard', 'admin')

    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('redirects a wrong-role user to their own dashboard', () => {
    const tenantUser: AuthUser = { id: 't1', name: 'Tenant', email: 't@plaza.test', role: 'tenant' }
    mockAuth({ isAuthenticated: true, role: 'tenant', user: tenantUser })
    renderAt('/admin/dashboard', 'admin')

    expect(screen.getByText('Tenant dashboard')).toBeInTheDocument()
  })

  it('redirects a tenant still on a temporary password to /tenant/account-setup', () => {
    const tenantUser: AuthUser = { id: 't1', name: 'Tenant', email: 't@plaza.test', role: 'tenant', mustChangePassword: true }
    mockAuth({ isAuthenticated: true, role: 'tenant', user: tenantUser })
    renderAt('/tenant/dashboard', 'tenant')

    expect(screen.getByText('Account setup page')).toBeInTheDocument()
  })

  it('renders children for a correctly-authenticated, correctly-roled user', () => {
    const adminUser: AuthUser = { id: 'a1', name: 'Admin', email: 'a@plaza.test', role: 'admin' }
    mockAuth({ isAuthenticated: true, role: 'admin', user: adminUser })
    renderAt('/admin/dashboard', 'admin')

    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('renders children for a tenant on a temporary password already at /tenant/account-setup', () => {
    const tenantUser: AuthUser = { id: 't1', name: 'Tenant', email: 't@plaza.test', role: 'tenant', mustChangePassword: true }
    mockAuth({ isAuthenticated: true, role: 'tenant', user: tenantUser })
    renderAt('/tenant/account-setup', 'tenant')

    expect(screen.getByText('Account setup page')).toBeInTheDocument()
  })
})
