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
    try {
      return await api.get('/admin/notifications')
    } catch (err) {
      if (!import.meta.env.DEV) throw err
      return [
        { id: 'an1', type: 'payment', title: 'Payment received from Jane Cooper', body: '₦1,200.00 paid via gateway.', date: '2026-07-01', read: false },
        { id: 'an2', type: 'maintenance', title: 'New maintenance request', body: 'Wade Warren reported: AC not cooling.', date: '2026-07-25', read: false },
        { id: 'an3', type: 'reminder', title: 'Reminder sent', body: 'Rent due reminder sent to all tenants.', date: '2026-07-29', read: true },
      ]
    }
  },

  async markRead(id: string) {
    try {
      return await api.post(`/admin/notifications/${id}/read`)
    } catch (err) {
      if (!import.meta.env.DEV) throw err
      return { success: true }
    }
  },

  async markAllRead() {
    try {
      return await api.post('/admin/notifications/mark-all-read')
    } catch (err) {
      if (!import.meta.env.DEV) throw err
      return { success: true }
    }
  },
}
