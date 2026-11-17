import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { Reminder } from '@/models/Reminder'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

export const GET = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  await dbConnect()
  const doc = await Reminder.findById(id).catch(() => null)
  if (!doc) throw new ApiError('Reminder not found', 404)

  return NextResponse.json({
    id: doc._id.toString(),
    title: doc.title,
    message: doc.message,
    type: doc.type,
    target: doc.target,
    targetLabel: doc.targetLabel,
    scheduledFor: doc.scheduledFor,
    status: doc.status,
  })
})

export const PATCH = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  const parsed = z.object({ status: z.literal('cancelled') }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) throw new ApiError('Only cancellation is supported for reminders', 400)
  await dbConnect()

  const reminder = await Reminder.findOneAndUpdate(
    { _id: id, status: 'scheduled' },
    { $set: { status: 'cancelled' } },
    { new: true },
  )
  if (!reminder) {
    const existing = await Reminder.findById(id).catch(() => null)
    if (!existing) throw new ApiError('Reminder not found', 404)
    throw new ApiError('Only scheduled reminders can be cancelled', 409)
  }

  return NextResponse.json({
    id: reminder._id.toString(),
    title: reminder.title,
    message: reminder.message,
    type: reminder.type,
    target: reminder.target,
    targetLabel: reminder.targetLabel,
    scheduledFor: reminder.scheduledFor,
    status: reminder.status,
  })
})
