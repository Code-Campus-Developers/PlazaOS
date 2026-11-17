import { api } from '../../../lib/api'
import type { Announcement, AnnouncementAudience } from '../data/types'

export interface GetAnnouncementsParams {
  page?: number
  pageSize?: number
}

export interface GetAnnouncementsResult {
  data: Announcement[]
  total: number
  page: number
  pageSize: number
}

/** `GET /announcements`. */
export async function getAnnouncements(params: GetAnnouncementsParams = {}): Promise<GetAnnouncementsResult> {
  const { page = 1, pageSize = 20 } = params
  const query = new URLSearchParams()
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))

  return api.get<GetAnnouncementsResult>(`/announcements?${query.toString()}`)
}

export interface AddAnnouncementInput {
  title: string
  body: string
  audience: AnnouncementAudience
  audienceTenantIds?: string[]
}

/** `POST /announcements`. */
export async function addAnnouncement(input: AddAnnouncementInput): Promise<Announcement> {
  const result = await api.post<{ success: boolean; id: string; createdAt: string; author: string }>('/announcements', input)
  return {
    id: result.id,
    title: input.title,
    body: input.body,
    audience: input.audience,
    audienceTenantIds: input.audienceTenantIds ?? [],
    createdAt: result.createdAt,
    author: result.author,
  }
}

/** `DELETE /announcements/:announcementId`. */
export async function deleteAnnouncement(announcementId: string): Promise<void> {
  await api.delete<{ success: boolean }>(`/announcements/${announcementId}`)
}
