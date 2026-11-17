import { api } from '../api'

export const DEFAULT_PAGE_SIZE = 10

export interface Announcement {
  id: string
  title: string
  body: string
  important?: boolean
  createdAt: string
}

export const announcementService = {
  async list(page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<{ data: Announcement[]; total: number }> {
    return api.get(`/tenant/announcements?page=${page}&pageSize=${pageSize}`)
  },
}
