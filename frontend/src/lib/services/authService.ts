import { api } from '../api'

export interface InvitationStatus {
  valid: boolean
  reason: 'invalid' | 'expired' | 'used' | 'ready'
  email?: string
  expiresAt?: string
}

export const authService = {
  async setPassword(newPassword: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>('/auth/set-password', { newPassword })
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    return api.post<{ success: boolean; message: string }>('/auth/forgot-password', { email })
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>('/auth/reset-password', { token, newPassword })
  },

  /**
   * Redeems an account-setup invitation with a password the tenant chose
   * themselves. Public — the tenant is not signed in yet.
   */
  async acceptInvitation(token: string, password: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>('/auth/accept-invitation', { token, password })
  },

  /**
   * Checks whether an invitation link is still usable, so the setup page can
   * show an accurate message before the tenant types a password.
   */
  async getInvitationStatus(token: string): Promise<InvitationStatus> {
    return api.get<InvitationStatus>(`/auth/invitation-status?token=${encodeURIComponent(token)}`)
  },
}
