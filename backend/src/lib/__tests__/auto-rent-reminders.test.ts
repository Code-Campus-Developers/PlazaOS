import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAutomaticRentReminders } from '@/lib/auto-rent-reminders'
import { RentCharge } from '@/models/RentCharge'
import { Reminder } from '@/models/Reminder'
import { User } from '@/models/User'

vi.mock('@/models/RentCharge', () => ({ RentCharge: { find: vi.fn() } }))
vi.mock('@/models/Reminder', () => ({ Reminder: { distinct: vi.fn(), create: vi.fn() } }))
vi.mock('@/models/User', () => ({ User: { findById: vi.fn() } }))

function mockLeanChain(result: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(result) }) }
}

describe('createAutomaticRentReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates one automatic Reminder per due/overdue charge that has none yet', async () => {
    vi.mocked(Reminder.distinct).mockResolvedValue([])
    vi.mocked(RentCharge.find).mockResolvedValue([
      { _id: 'charge-1', tenantId: 'tenant-1', amount: 500, period: '2026-08-01 to 2027-07-31', dueDate: '2026-08-01', status: 'overdue' },
    ] as never)
    vi.mocked(User.findById).mockReturnValue(mockLeanChain({ name: 'Jane Doe' }) as never)

    const result = await createAutomaticRentReminders(new Date('2026-08-13'))

    expect(result.created).toBe(1)
    expect(Reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRentChargeId: 'charge-1',
        targetTenantIds: ['tenant-1'],
        type: 'automatic',
        status: 'scheduled',
      }),
    )
  })

  it('excludes charges that already have an automatic reminder', async () => {
    vi.mocked(Reminder.distinct).mockResolvedValue(['charge-1'])
    vi.mocked(RentCharge.find).mockResolvedValue([] as never)

    const result = await createAutomaticRentReminders(new Date('2026-08-13'))

    expect(RentCharge.find).toHaveBeenCalledWith(expect.objectContaining({ _id: { $nin: ['charge-1'] } }))
    expect(result.created).toBe(0)
    expect(Reminder.create).not.toHaveBeenCalled()
  })

  it('tolerates a duplicate-key race from a concurrent run without throwing', async () => {
    vi.mocked(Reminder.distinct).mockResolvedValue([])
    vi.mocked(RentCharge.find).mockResolvedValue([
      { _id: 'charge-1', tenantId: 'tenant-1', amount: 500, period: '2026-08-01 to 2027-07-31', dueDate: '2026-08-01', status: 'due' },
    ] as never)
    vi.mocked(User.findById).mockReturnValue(mockLeanChain({ name: 'Jane Doe' }) as never)
    vi.mocked(Reminder.create).mockRejectedValue(new Error('E11000 duplicate key error'))

    const result = await createAutomaticRentReminders(new Date('2026-08-13'))

    expect(result.created).toBe(0)
  })
})
