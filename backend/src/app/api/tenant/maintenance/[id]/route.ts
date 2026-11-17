import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

export const GET = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const auth = requireRole(request, 'tenant')
  const { id } = await params

  await dbConnect()
  const doc = await MaintenanceRequest.findOne({ _id: id, tenantId: auth.sub }).catch(() => null)
  if (!doc) throw new ApiError('Maintenance request not found', 404)

  return NextResponse.json({
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    priority: doc.priority,
    category: doc.category,
    status: doc.status,
    createdAt: doc.createdAt.toISOString().slice(0, 10),
    images: (doc.images ?? []).map((image: { url: string }) => image.url),
  })
})
