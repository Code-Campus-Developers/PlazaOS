import { api } from '../api'

export type CalendarEventType = 'rent_due' | 'reminder' | 'lease_renewal' | 'meeting' | 'inspection' | 'eviction' | 'other'

export interface CalendarEvent {
  id: string
  title: string
  date: string
  type: CalendarEventType
}

export const calendarService = {
  async list(): Promise<CalendarEvent[]> {
    try {
      return await api.get('/tenant/calendar')
    } catch (err) {
      if (!import.meta.env.DEV) throw err
      return [
        { id: 'c1', title: 'Rent due', date: '2026-08-01', type: 'rent_due' },
        { id: 'c2', title: 'Lease renewal reminder', date: '2026-08-15', type: 'reminder' },
        { id: 'c3', title: 'Lease end date', date: '2027-01-31', type: 'lease_renewal' },
      ]
    }
  },
}
