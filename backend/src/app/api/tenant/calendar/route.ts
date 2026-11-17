import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { CalendarEvent } from '@/models/CalendarEvent'
import { RentCharge } from '@/models/RentCharge'
import { ANNUAL_RENT_PERIOD_REGEX } from '@/lib/annual-rent-charge'
import { Lease } from '@/models/Lease'
import { Reminder } from '@/models/Reminder'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

// Rent-due and lease-renewal dates are derived from `RentCharge`/`Lease` here
// rather than duplicated into standalone `CalendarEvent` documents — only
// genuinely standalone events (no other source of truth) get their own
// `CalendarEvent` doc. See BACKEND_BUILD_PLAN.md §1 (`CalendarEvent` model).
export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'tenant')

  await dbConnect()
  const [events, rentCharges, leases, reminders] = await Promise.all([
    CalendarEvent.find({ $or: [{ tenantId: auth.sub }, { tenantId: null }] }),
    RentCharge.find({
      tenantId: auth.sub,
      status: { $ne: 'paid' },
      period: { $regex: ANNUAL_RENT_PERIOD_REGEX },
    }),
    Lease.find({ tenantId: auth.sub, status: 'active' }),
    Reminder.find({ status: 'scheduled', $or: [{ target: 'everyone' }, { targetTenantIds: auth.sub }] }),
  ])

  const items = [
    ...events.map((doc) => ({ id: doc._id.toString(), title: doc.title, date: doc.date, type: doc.type })),
    ...rentCharges.map((doc) => ({ id: `rent-charge:${doc._id}`, title: 'Rent due', date: doc.dueDate, type: 'rent_due' as const })),
    ...leases.map((doc) => ({ id: `lease:${doc._id}`, title: 'Lease renewal', date: doc.endDate, type: 'lease_renewal' as const })),
    ...reminders.map((doc) => ({ id: `reminder:${doc._id}`, title: doc.title, date: doc.scheduledFor, type: 'reminder' as const })),
  ]
  items.sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json(items)
})
