import { RentCharge } from '@/models/RentCharge'
import { Reminder } from '@/models/Reminder'
import { User } from '@/models/User'
import { formatAmount } from './currency'

interface CreateRentRemindersResult {
  created: number
}

// Scans for tenants whose rent is due/overdue and auto-creates a `Reminder`
// for each, per BACKEND_BUILD_PLAN.md §8's "not yet built" sweep. Deliberately
// separate from `processReminders()`: this only *creates* scheduled reminders;
// the existing sweep still does all of the actual sending/notifying.
export async function createAutomaticRentReminders(now: Date = new Date()): Promise<CreateRentRemindersResult> {
  const today = now.toISOString().slice(0, 10)

  // A charge already has an automatic reminder (in any status) once its id
  // shows up here — the sparse unique index on Reminder.sourceRentChargeId is
  // the actual race-safety guarantee, this query is just to avoid redundant work.
  const alreadyReminded = await Reminder.distinct('sourceRentChargeId', { sourceRentChargeId: { $exists: true } })

  const charges = await RentCharge.find({
    status: { $in: ['due', 'overdue'] },
    _id: { $nin: alreadyReminded },
  })

  let created = 0
  for (const charge of charges) {
    const tenant = await User.findById(charge.tenantId).select('name').lean()
    if (!tenant) continue

    try {
      await Reminder.create({
        title: charge.status === 'overdue' ? 'Rent overdue' : 'Rent due',
        message: `Your rent of ${formatAmount(charge.amount)} for period ${charge.period} is ${charge.status} (due ${charge.dueDate}).`,
        type: 'automatic',
        target: 'tenant',
        targetTenantIds: [charge.tenantId],
        targetLabel: tenant.name,
        scheduledFor: today,
        status: 'scheduled',
        sourceRentChargeId: charge._id,
      })
      created++
    } catch (err) {
      // Duplicate-key race (unique sparse index) — another concurrent run
      // already created this charge's reminder; safe to ignore.
      if (!(err instanceof Error) || !err.message.includes('duplicate key')) throw err
    }
  }

  return { created }
}

