import { api } from '../../../lib/api'
import type { CalendarEvent, CalendarEventType } from '../data/types'

export type SortDirection = 'asc' | 'desc'

export interface GetCalendarEventsParams {
  search?: string
  type?: 'all' | CalendarEventType
  dateFrom?: string
  dateTo?: string
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

export interface GetCalendarEventsResult {
  data: CalendarEvent[]
  total: number
  page: number
  pageSize: number
}

/**
 * The only function that reads/searches/filters/sorts/paginates the
 * calendar events collection — every other file gets events through this.
 * Calls `GET /calendar?search=&type=&dateFrom=&dateTo=&sortDir=&page=&pageSize=`.
 */
export async function getCalendarEvents(params: GetCalendarEventsParams = {}): Promise<GetCalendarEventsResult> {
  const { search = '', type = 'all', dateFrom = '', dateTo = '', sortDir = 'asc', page = 1, pageSize = 20 } = params
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (type !== 'all') query.set('type', type)
  if (dateFrom) query.set('dateFrom', dateFrom)
  if (dateTo) query.set('dateTo', dateTo)
  query.set('sortDir', sortDir)
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))

  return api.get<GetCalendarEventsResult>(`/calendar?${query.toString()}`)
}

export interface AddCalendarEventInput {
  title: string
  type: 'other'
  date: string
  relatedLabel?: string
}

/** `POST /calendar`. */
export async function addCalendarEvent(input: AddCalendarEventInput): Promise<CalendarEvent> {
  const result = await api.post<{ success: boolean; id: string }>('/calendar', input)
  return { id: result.id, ...input }
}

/** `DELETE /calendar/:eventId` — server permits deletion only for standalone events. */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await api.delete<{ success: boolean }>(`/calendar/${eventId}`)
}
