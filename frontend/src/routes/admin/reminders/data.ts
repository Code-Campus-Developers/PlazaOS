import { api } from '../../../lib/api'
import type { Reminder, ReminderStatus, ReminderTarget, ReminderType } from '../data/types'

export type ReminderSortField = 'scheduledFor' | 'title' | 'status'
export type SortDirection = 'asc' | 'desc'

export interface GetRemindersParams {
  search?: string
  status?: 'all' | ReminderStatus
  type?: 'all' | ReminderType
  sortBy?: ReminderSortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

export interface GetRemindersResult {
  data: Reminder[]
  total: number
  page: number
  pageSize: number
}

/**
 * The only function that reads/searches/filters/sorts/paginates the
 * reminders collection — every other file gets reminders through this.
 * Calls `GET /reminders?search=&status=&type=&sortBy=&sortDir=&page=&pageSize=`.
 */
export async function getReminders(params: GetRemindersParams = {}): Promise<GetRemindersResult> {
  const { search = '', status = 'all', type = 'all', sortBy = 'scheduledFor', sortDir = 'asc', page = 1, pageSize = 20 } = params
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (status !== 'all') query.set('status', status)
  if (type !== 'all') query.set('type', type)
  query.set('sortBy', sortBy)
  query.set('sortDir', sortDir)
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))

  return api.get<GetRemindersResult>(`/reminders?${query.toString()}`)
}

/** `GET /reminders/:reminderId`. */
export async function getReminder(reminderId: string): Promise<Reminder> {
  return api.get<Reminder>(`/reminders/${reminderId}`)
}

/** `PATCH /reminders/:reminderId` — scheduled reminders are canceled and retained. */
export async function cancelReminder(reminderId: string): Promise<Reminder> {
  return api.patch<Reminder>(`/reminders/${reminderId}`, { status: 'cancelled' })
}

export interface AddReminderInput {
  title: string
  message: string
  scheduledFor: string
  target: ReminderTarget
  tenantId?: string
  groupTenantIds?: string[]
}

/** `POST /reminders` — always creates a `type: 'manual'` reminder server-side. */
export async function addReminder(input: AddReminderInput): Promise<Reminder> {
  const result = await api.post<{ success: boolean; id: string; targetLabel: string }>('/reminders', input)
  return {
    id: result.id,
    title: input.title,
    message: input.message,
    scheduledFor: input.scheduledFor,
    type: 'manual',
    target: input.target,
    status: 'scheduled',
    targetLabel: result.targetLabel,
  }
}
