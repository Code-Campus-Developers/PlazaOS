import { api } from '../api'

export type RentChargeStatus = 'upcoming' | 'due' | 'overdue' | 'paid'

export interface RentCharge {
  id: string
  period: string
  amount: number
  dueDate: string
  status: RentChargeStatus
}

export const rentChargeService = {
  async list(): Promise<{ data: RentCharge[] }> {
    return api.get('/tenant/rent-charges')
  },
}
