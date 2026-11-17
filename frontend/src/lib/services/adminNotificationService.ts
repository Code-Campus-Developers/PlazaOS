import { api } from '../api'

export type AdminNotificationType = 'payment' | 'maintenance' | 'announcement' | 'reminder'

export interface AdminNotificationItem {
  id: string
  type: AdminNotificationType
  title: string
  body?: string
  date: string
  read: boolean
}

export const adminNotificationService = {
  async list(): Promise<AdminNotificationItem[]> {
    return api.get('/admin/notifications')
  },

  async markRead(id: string) {
    return api.post(`/admin/notifications/${id}/read`)
  },

  async markAllRead() {
    return api.post('/admin/notifications/mark-all-read')
  },
}
