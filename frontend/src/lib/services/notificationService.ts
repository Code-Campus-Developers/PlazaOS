import { api } from '../api'

export type NotificationType = 'payment' | 'maintenance' | 'announcement' | 'appointment'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body?: string
  date: string
  read: boolean
}

export const notificationService = {
  async list(): Promise<NotificationItem[]> {
    return api.get('/tenant/notifications')
  },

  async markRead(id: string) {
    return api.post(`/tenant/notifications/${id}/read`)
  },

  async markAllRead() {
    return api.post(`/tenant/notifications/mark-all-read`)
  },
}
