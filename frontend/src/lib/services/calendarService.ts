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
    return api.get('/tenant/calendar')
  },
}
