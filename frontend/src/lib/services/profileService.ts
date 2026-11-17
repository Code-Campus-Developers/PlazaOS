import { api } from '../api'

export interface Profile {
  id: string
  name: string
  email: string
  phone?: string
  unit?: string
  leaseStart?: string
  leaseEnd?: string
  monthlyRent?: number
}

export interface UpdateProfileInput {
  name?: string
  phone?: string
}

export const profileService = {
  async getProfile(): Promise<Profile> {
    return api.get<Profile>('/tenant/profile')
  },

  async updateProfile(input: UpdateProfileInput): Promise<Profile> {
    return api.patch<Profile>('/tenant/profile', input)
  },
}
