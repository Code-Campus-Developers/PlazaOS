import { api } from '../../../lib/api'
import type { Payment, PaymentMethod, PaymentStatus } from '../data/types'

export type PaymentSortField = 'date' | 'tenantName' | 'amount'
export type SortDirection = 'asc' | 'desc'

export interface GetPaymentsParams {
  search?: string
  status?: 'all' | PaymentStatus
  method?: 'all' | PaymentMethod
  sortBy?: PaymentSortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

export interface GetPaymentsResult {
  data: Payment[]
  total: number
  page: number
  pageSize: number
}

/**
 * The only function that reads/searches/filters/sorts/paginates the payments
 * collection — every other file gets payments through this. Calls
 * `GET /payments?search=&status=&method=&sortBy=&sortDir=&page=&pageSize=`.
 */
export async function getPayments(params: GetPaymentsParams = {}): Promise<GetPaymentsResult> {
  const { search = '', status = 'all', method = 'all', sortBy = 'date', sortDir = 'asc', page = 1, pageSize = 20 } = params
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (status !== 'all') query.set('status', status)
  if (method !== 'all') query.set('method', method)
  query.set('sortBy', sortBy)
  query.set('sortDir', sortDir)
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))

  return api.get<GetPaymentsResult>(`/payments?${query.toString()}`)
}

/** All payments for a single tenant (used by TenantDetail's payment history table). */
export async function getPaymentsByTenant(tenantId: string): Promise<Payment[]> {
  const { data } = await getPayments({ pageSize: 200 })
  return data.filter((payment) => payment.tenantId === tenantId)
}

/** `GET /payments/:paymentId`. */
export async function getPayment(paymentId: string): Promise<Payment> {
  return api.get<Payment>(`/payments/${paymentId}`)
}

/** A tenant's outstanding (non-paid) rent charge — used to build the rent-charge picker in PaymentNew. */
export interface RentCharge {
  id: string
  period?: string
  tenantId?: string
  amount: number
  dueDate: string
  status: 'due' | 'overdue'
}

/**
 * `GET /rent-charges?tenantId=` — admin-only, lists a tenant's outstanding
 * rent charges. The backend wraps the list in a `{ data }` envelope, so it
 * is unwrapped here.
 */
export async function getRentChargesForTenant(tenantId: string): Promise<RentCharge[]> {
  const query = new URLSearchParams({ tenantId })
  const result = await api.get<{ data: RentCharge[] }>(`/rent-charges?${query.toString()}`)
  return result.data ?? []
}

export interface AddPaymentInput {
  rentChargeId: string
  date: string
  method: PaymentMethod
  note?: string
  /** Local-only fields used to build the returned Payment object. */
  tenantId: string
  tenantName: string
  unitNumber: string
  amount: number
}

/**
 * `POST /payments` — records an offline payment and settles the linked rent
 * charge.
 *
 * Only `rentChargeId`, `method`, `date` and `note` are sent: the backend
 * derives the tenant, unit and amount from the rent charge itself, and its
 * schema rejects any extra field.
 */
export async function addPayment(input: AddPaymentInput): Promise<Payment> {
  const { tenantId, tenantName, unitNumber, amount, ...body } = input
  const result = await api.post<{ success: boolean; id: string }>('/payments', body)
  return {
    id: result.id,
    tenantId,
    tenantName,
    unitNumber,
    amount,
    date: body.date,
    method: body.method,
    status: 'paid',
    note: body.note,
    receiptAvailable: true,
  }
}
