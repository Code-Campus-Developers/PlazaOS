import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { CalendarEvent } from '@/models/CalendarEvent'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

export const DELETE = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  await dbConnect()
  const event = await CalendarEvent.findById(id).catch(() => null)
  if (!event) throw new ApiError('Calendar event not found', 404)

  await event.deleteOne()
  return NextResponse.json({ success: true })
})
