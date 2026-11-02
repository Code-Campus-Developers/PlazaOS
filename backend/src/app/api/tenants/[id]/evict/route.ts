import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { Unit } from '@/models/Unit'
import { Lease } from '@/models/Lease'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

const evictSchema = z.object({ reason: z.string().min(1).optional() }).strict()

export const POST = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requireRole(request, 'admin')
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = evictSchema.safeParse(body ?? {})
  if (!parsed.success) throw new ApiError('Invalid eviction request', 400)

  await dbConnect()
  const user = await User.findOne({ _id: id, role: 'tenant' }).catch(() => null)
  if (!user) throw new ApiError('Tenant not found', 404)
  if (user.status === 'inactive') throw new ApiError('Tenant is already evicted/inactive', 409)

  // Unassign from unit if occupied
  if (user.unitId) {
    const unit = await Unit.findById(user.unitId).catch(() => null)
    if (unit) {
      unit.tenantId = undefined
      unit.tenantName = undefined
      unit.status = 'vacant'
      await unit.save()
    }
  }
  // End active lease
  await Lease.updateMany({ tenantId: user._id, status: 'active' }, { $set: { status: 'ended' } })

  user.status = 'inactive'
  user.evictionReason = parsed.data.reason ?? undefined
  user.evictedAt = new Date()
  await user.save()

  return NextResponse.json({ success: true, reason: parsed.data.reason ?? null })
})
