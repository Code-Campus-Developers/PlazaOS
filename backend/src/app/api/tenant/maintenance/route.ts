import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'
import { User } from '@/models/User'
import { ApiError } from '@/lib/api-error'
import { saveMaintenanceImages } from '@/lib/uploads'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

function toPublicRequest(doc: any) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    priority: doc.priority,
    category: doc.category,
    status: doc.status,
    createdAt: doc.createdAt.toISOString().slice(0, 10),
    images: (doc.images ?? []).map((image: { url: string }) => image.url),
  }
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'tenant')
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 10))

  await dbConnect()
  const filter = { tenantId: auth.sub }
  const [docs, total] = await Promise.all([
    MaintenanceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    MaintenanceRequest.countDocuments(filter),
  ])

  return NextResponse.json({ data: docs.map((doc) => toPublicRequest(doc)), total })
})

// multipart/form-data — text fields (title/description/priority/category) plus
// zero or more `images` file parts, per BACKEND_BUILD_PLAN.md §6.
const createFieldsSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    category: z.string().optional(),
  })
  .strict()

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = requireRole(request, 'tenant')
  const form = await request.formData().catch(() => null)
  if (!form) throw new ApiError('Expected multipart/form-data', 400)

  const title = form.get('title')
  const description = form.get('description')
  const priority = form.get('priority')
  const category = form.get('category')

  const parsed = createFieldsSchema.safeParse({
    title: typeof title === 'string' ? title : undefined,
    description: typeof description === 'string' ? description : undefined,
    priority: typeof priority === 'string' && priority ? priority : undefined,
    category: typeof category === 'string' && category ? category : undefined,
  })
  if (!parsed.success) throw new ApiError(parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid maintenance request', 400)

  const imageFiles = form.getAll('images').filter((entry): entry is File => entry instanceof File)
  const images = await saveMaintenanceImages(imageFiles)

  await dbConnect()
  const user = await User.findById(auth.sub)
  if (!user) throw new ApiError('Not found', 404)

  const doc = await MaintenanceRequest.create({
    tenantId: user._id,
    tenantName: user.name,
    unitId: user.unitId,
    unitNumber: user.unitNumber ?? 'unassigned',
    title: parsed.data.title,
    description: parsed.data.description,
    priority: parsed.data.priority ?? 'medium',
    category: parsed.data.category,
    images,
  })

  return NextResponse.json({ success: true, id: doc._id.toString() })
})
