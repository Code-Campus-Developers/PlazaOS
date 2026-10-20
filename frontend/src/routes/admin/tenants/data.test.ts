import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api } from '../../../lib/api'
import { addTenant, type AddTenantInput } from './data'

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const input: AddTenantInput = {
  name: 'Jane Cooper',
  email: 'jane.cooper@example.com',
  phone: '+1 (555) 010-1234',
  unitId: 'unit-1',
  unitNumber: 'A-101',
  leaseStart: '2026-08-01',
  leaseEnd: '2027-07-31',
  monthlyRent: 1200,
}

describe('addTenant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts only the fields the backend accepts, stripping the local-only unitNumber', async () => {
    vi.mocked(api.post).mockResolvedValue({
      success: true,
      id: 'tenant-1',
      invitation: { delivered: true, status: 'sent' },
    } as never)

    const result = await addTenant(input)

    // The backend derives the unit number from the assigned unit and its
    // schema is strict, so sending it would fail the whole request with 400.
    expect(api.post).toHaveBeenCalledWith('/tenants', {
      name: input.name,
      email: input.email,
      phone: input.phone,
      unitId: input.unitId,
      leaseStart: input.leaseStart,
      leaseEnd: input.leaseEnd,
      monthlyRent: input.monthlyRent,
    })
    // The locally-built tenant still carries the unit number for the UI.
    expect(result.tenant.unitNumber).toBe('A-101')
  })
})
