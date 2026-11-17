import { api } from '../api'
import type { PaymentStatus } from '../types'

export type { PaymentStatus }

export const DEFAULT_PAGE_SIZE = 10

export interface Payment {
  id: string
  amount: number
  date: string
  method?: string
  status: PaymentStatus
  receiptUrl?: string
}

export const paymentService = {
  async list(page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<{ data: Payment[]; total: number }>
  {
    return api.get(`/tenant/payments?page=${page}&pageSize=${pageSize}`)
  },

  async get(id: string): Promise<Payment> {
    return api.get(`/tenant/payments/${id}`)
  },

  async pay(rentChargeId: string): Promise<{ success: boolean; id?: string; checkoutUrl?: string }>
  {
    return api.post('/tenant/payments', { rentChargeId })
  },

  async verify(reference: string): Promise<{ id: string; status: PaymentStatus }> {
    return api.get(`/tenant/payments/verify?reference=${encodeURIComponent(reference)}`)
  },
}
