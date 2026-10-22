import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AccountSetup } from './AccountSetup'
import { useAuth } from '../../context/useAuth'
import { authService } from '../../lib/services/authService'
import { ApiError } from '../../lib/api'

vi.mock('../../context/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/services/authService', () => ({
  authService: {
    setPassword: vi.fn(),
    acceptInvitation: vi.fn(),
    getInvitationStatus: vi.fn(),
  },
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSetPassword = vi.mocked(authService.setPassword)
const mockedAcceptInvitation = vi.mocked(authService.acceptInvitation)
const mockedGetInvitationStatus = vi.mocked(authService.getInvitationStatus)
const completePasswordSetup = vi.fn()

function renderPage(initialEntries = ['/tenant/account-setup']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AccountSetup />
    </MemoryRouter>,
  )
}

describe('AccountSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'tenant-1', name: 'Tenant', email: 'tenant@example.com', role: 'tenant', mustChangePassword: true },
      token: 'token',
      role: 'tenant',
      isAuthenticated: true,
      login: vi.fn(),
      completePasswordSetup,
      logout: vi.fn(),
    })
    mockedGetInvitationStatus.mockResolvedValue({ valid: true, reason: 'ready' })
  })

  it('uses the first-time set-password API without asking for the temporary password', async () => {
    mockedSetPassword.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    renderPage()

    expect(screen.queryByLabelText(/current|temporary password/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^new password$/i), 'longenoughpassword')
    await user.type(screen.getByLabelText(/confirm new password/i), 'longenoughpassword')
    await user.click(screen.getByRole('button', { name: /secure my account/i }))

    await waitFor(() => expect(mockedSetPassword).toHaveBeenCalledWith('longenoughpassword'))
    expect(completePasswordSetup).toHaveBeenCalledOnce()
  })

  it('does not call the API when the password confirmation differs', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/^new password$/i), 'longenoughpassword')
    await user.type(screen.getByLabelText(/confirm new password/i), 'differentpassword')
    await user.click(screen.getByRole('button', { name: /secure my account/i }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(mockedSetPassword).not.toHaveBeenCalled()
  })

  describe('invitation mode', () => {
    const invitationUrl = '/tenant/account-setup?token=invitation-token-123'

    it('redeems the invitation with the password the tenant chose', async () => {
      mockedAcceptInvitation.mockResolvedValue({ success: true })
      const user = userEvent.setup()
      renderPage([invitationUrl])

      await waitFor(() => expect(mockedGetInvitationStatus).toHaveBeenCalledWith('invitation-token-123'))

      await user.type(screen.getByLabelText(/^new password$/i), 'longenoughpassword')
      await user.type(screen.getByLabelText(/confirm new password/i), 'longenoughpassword')
      await user.click(screen.getByRole('button', { name: /secure my account/i }))

      await waitFor(() =>
        expect(mockedAcceptInvitation).toHaveBeenCalledWith('invitation-token-123', 'longenoughpassword'),
      )
      // The signed-in flow must not run for an invitation.
      expect(mockedSetPassword).not.toHaveBeenCalled()
    })

    it('shows an accurate message when the invitation has expired', async () => {
      mockedGetInvitationStatus.mockResolvedValue({ valid: false, reason: 'expired' })
      renderPage([invitationUrl])

      expect(await screen.findByText(/has expired/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument()
      expect(mockedAcceptInvitation).not.toHaveBeenCalled()
    })

    it('shows an accurate message when the invitation has already been used', async () => {
      mockedGetInvitationStatus.mockResolvedValue({ valid: false, reason: 'used' })
      renderPage([invitationUrl])

      expect(await screen.findByText(/already been used/i)).toBeInTheDocument()
      expect(mockedAcceptInvitation).not.toHaveBeenCalled()
    })

    it('shows an accurate message when the invitation is not valid', async () => {
      mockedGetInvitationStatus.mockResolvedValue({ valid: false, reason: 'invalid' })
      renderPage([invitationUrl])

      expect(await screen.findByText(/not valid/i)).toBeInTheDocument()
    })

    it('surfaces the server error when the invitation cannot be redeemed', async () => {
      mockedAcceptInvitation.mockRejectedValue(
        new ApiError('This invitation is invalid, has expired, or has already been used.', 400),
      )
      const user = userEvent.setup()
      renderPage([invitationUrl])

      await waitFor(() => expect(mockedGetInvitationStatus).toHaveBeenCalled())
      await user.type(screen.getByLabelText(/^new password$/i), 'longenoughpassword')
      await user.type(screen.getByLabelText(/confirm new password/i), 'longenoughpassword')
      await user.click(screen.getByRole('button', { name: /secure my account/i }))

      expect(await screen.findByText(/has already been used/i)).toBeInTheDocument()
    })
  })
})
