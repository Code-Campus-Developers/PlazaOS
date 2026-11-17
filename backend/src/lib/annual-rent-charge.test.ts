import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RentCharge } from '@/models/RentCharge'
import {
  isAnnualRentChargePeriod,
  ensureAnnualRentChargeForLease,
  getAnnualRentChargeDetails,
} from '@/lib/annual-rent-charge'

vi.mock('@/models/RentCharge', () => ({
  RentCharge: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

const lease = {
  _id: 'lease-1',
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  startDate: '2025-08-01',
  endDate: '2027-07-31',
  rentAmount: 1200,
}

describe('annual rent charges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recognizes annual lease-year periods and rejects legacy monthly periods', () => {
    expect(isAnnualRentChargePeriod('2026-08-01 to 2027-07-31')).toBe(true)
    expect(isAnnualRentChargePeriod('2026-08')).toBe(false)
  })

  it('creates the charge for the active lease year at its yearly amount', () => {
    expect(getAnnualRentChargeDetails(lease, new Date('2026-11-15T12:00:00Z'))).toEqual({
      tenantId: 'tenant-1',
      unitId: 'unit-1',
      leaseId: lease._id,
      period: '2026-08-01 to 2027-07-31',
      amount: 1200,
      dueDate: '2026-08-01',
      status: 'overdue',
    })
  })

  it('marks a future lease-year charge as upcoming', () => {
    const futureLease = { ...lease, startDate: '2027-01-15', endDate: '2028-01-14' }
    expect(getAnnualRentChargeDetails(futureLease, new Date('2026-11-15T12:00:00Z'))).toMatchObject({
      period: '2027-01-15 to 2028-01-14',
      dueDate: '2027-01-15',
      status: 'upcoming',
    })
  })

  it('does not treat an old monthly charge as a replacement for the annual charge', async () => {
    vi.mocked(RentCharge.findOne).mockResolvedValue(null)
    vi.mocked(RentCharge.findOneAndUpdate).mockResolvedValue({ _id: 'annual-charge' } as never)

    await ensureAnnualRentChargeForLease(lease, new Date('2026-11-15T12:00:00Z'))

    expect(RentCharge.findOne).toHaveBeenCalledOnce()
    expect(RentCharge.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', period: '2026-08-01 to 2027-07-31' },
      { $setOnInsert: expect.objectContaining({ amount: 1200, dueDate: '2026-08-01' }) },
      { upsert: true, new: true },
    )
  })

  it('upserts the current annual charge when a lease has no charge history in that year', async () => {
    vi.mocked(RentCharge.findOne).mockResolvedValue(null)
    vi.mocked(RentCharge.findOneAndUpdate).mockResolvedValue({ _id: 'new-charge' } as never)

    await ensureAnnualRentChargeForLease(lease, new Date('2026-11-15T12:00:00Z'))

    expect(RentCharge.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', period: '2026-08-01 to 2027-07-31' },
      { $setOnInsert: expect.objectContaining({ amount: 1200, dueDate: '2026-08-01' }) },
      { upsert: true, new: true },
    )
  })
})
