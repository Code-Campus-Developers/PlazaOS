import { api } from '../api'
import type { MaintenanceStatus } from '../types'

export type { MaintenanceStatus }

export const DEFAULT_PAGE_SIZE = 10

export interface MaintenanceRequest {
  id: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  category?: string
  status: MaintenanceStatus
  createdAt: string
  images?: string[]
}

export const maintenanceService = {
  async list(page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<{ data: MaintenanceRequest[]; total: number }> {
    return api.get(`/tenant/maintenance?page=${page}&pageSize=${pageSize}`)
  },

  async get(id: string): Promise<MaintenanceRequest> {
    return api.get<MaintenanceRequest>(`/tenant/maintenance/${encodeURIComponent(id)}`)
  },

  async create(payload: { title: string; description?: string; priority?: string; category?: string; images?: File[] }) {
    const form = new FormData()
    form.append('title', payload.title)
    if (payload.description !== undefined) form.append('description', payload.description)
    if (payload.priority !== undefined) form.append('priority', payload.priority)
    if (payload.category !== undefined) form.append('category', payload.category)
    for (const file of payload.images ?? []) form.append('images', file)

    return api.post('/tenant/maintenance', form)
  },
}
