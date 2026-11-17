import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Announcement } from '@/models/Announcement'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

export const DELETE = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  await dbConnect()
  const announcement = await Announcement.findByIdAndDelete(id).catch(() => null)
  if (!announcement) throw new ApiError('Announcement not found', 404)
  return NextResponse.json({ success: true })
})
