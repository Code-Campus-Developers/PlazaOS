import { api } from '../../lib/api'

export interface AdminDashboardSummary {
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  totalTenants: number
  activeTenants: number
  overdueTenants: number
  openMaintenance: number
}

export function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  return api.get<AdminDashboardSummary>('/admin/dashboard')
}
