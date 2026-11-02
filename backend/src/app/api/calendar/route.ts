import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { CalendarEvent } from '@/models/CalendarEvent'
import { RentCharge } from '@/models/RentCharge'
import { Lease } from '@/models/Lease'
import { Reminder } from '@/models/Reminder'
import { Unit } from '@/models/Unit'
import { User } from '@/models/User'
import { ApiError } from '@/lib/api-error'
import { parsePageParams } from '@/lib/list-query'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

interface CalendarItem {
  id: string
  title: string
  type: 'rent_due' | 'lease_renewal' | 'reminder' | 'other'
  date: string
  relatedLabel?: string
}

// Plaza-wide equivalent of `GET /tenant/calendar`: rent-due and lease-renewal
// dates are derived from `RentCharge`/`Lease` rather than duplicated into
// standalone `CalendarEvent` docs (only genuinely standalone events get their
// own doc — see BACKEND_BUILD_PLAN.md §1), but here across every tenant
// rather than just the caller.
export const GET = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim().toLowerCase() ?? ''
  const type = searchParams.get('type')
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo = searchParams.get('dateTo') ?? ''
  const sortDir = searchParams.get('sortDir') === 'desc' ? -1 : 1
  const { page, pageSize } = parsePageParams(searchParams)

  await dbConnect()
  const [events, charges, leases, reminders, units] = await Promise.all([
    CalendarEvent.find({}),
    RentCharge.find({ status: { $ne: 'paid' } }),
    Lease.find({ status: 'active' }),
    Reminder.find({ status: 'scheduled' }),
    Unit.find({}),
  ])

  const unitNumberById = new Map(units.map((unit) => [unit._id.toString(), unit.unitNumber]))
  const tenantIds = Array.from(new Set([...charges, ...leases].map((doc) => doc.tenantId.toString())))
  const tenants = tenantIds.length ? await User.find({ _id: { $in: tenantIds } }) : []
  const tenantById = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant]))

  let items: CalendarItem[] = [
    ...events.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      type: doc.type as CalendarItem['type'],
      date: doc.date,
      relatedLabel: doc.relatedLabel ?? undefined,
    })),
    ...charges.map((doc) => {
      const tenant = tenantById.get(doc.tenantId.toString())
      return {
        id: `rent-charge:${doc._id}`,
        title: tenant ? `Rent due — ${tenant.name}` : 'Rent due',
        type: 'rent_due' as const,
        date: doc.dueDate,
        relatedLabel: unitNumberById.get(doc.unitId.toString()),
      }
    }),
    ...leases.map((doc) => {
      const tenant = tenantById.get(doc.tenantId.toString())
      return {
        id: `lease:${doc._id}`,
        title: tenant ? `${tenant.name} lease renewal` : 'Lease renewal',
        type: 'lease_renewal' as const,
        date: doc.endDate,
        relatedLabel: unitNumberById.get(doc.unitId.toString()),
      }
    }),
    ...reminders.map((doc) => ({
      id: `reminder:${doc._id}`,
      title: doc.title,
      type: 'reminder' as const,
      date: doc.scheduledFor,
      relatedLabel: doc.targetLabel,
    })),
  ]

  if (search) items = items.filter((item) => item.title.toLowerCase().includes(search))
  if (type && type !== 'all') items = items.filter((item) => item.type === type)
  if (dateFrom) items = items.filter((item) => item.date >= dateFrom)
  if (dateTo) items = items.filter((item) => item.date <= dateTo)

  items.sort((a, b) => (sortDir === 1 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))

  const total = items.length
  const start = (page - 1) * pageSize
  return NextResponse.json({ data: items.slice(start, start + pageSize), total, page, pageSize })
})

const createCalendarEventSchema = z
  .object({
    title: z.string().min(1),
    type: z.enum(['rent_due', 'lease_renewal', 'reminder', 'meeting', 'inspection', 'eviction', 'other']),
    date: z.string().min(1),
    relatedLabel: z.string().optional(),
  })
  .strict()

export const POST = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  const body = await request.json().catch(() => null)
  const parsed = createCalendarEventSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('title, type, and date are required', 400)

  await dbConnect()
  const doc = await CalendarEvent.create({
    title: parsed.data.title,
    type: parsed.data.type,
    date: parsed.data.date,
    relatedLabel: parsed.data.relatedLabel,
  })

  return NextResponse.json({ success: true, id: doc._id.toString() })
})
