import { api } from '../api'

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export interface ChangePasswordResponse {
  success: boolean
}

export const passwordService = {
  async changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
    return api.post<ChangePasswordResponse>('/auth/change-password', payload)
  },
}
