import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { Unit } from '@/models/Unit'
import { ApiError } from '@/lib/api-error'
import { escapeRegex, parsePageParams } from '@/lib/list-query'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

function toPublicUnit(doc: any) {
  return {
    id: doc._id.toString(),
    unitNumber: doc.unitNumber,
    floor: doc.floor,
    sizeSqft: doc.sizeSqft,
    monthlyRent: doc.monthlyRent,
    status: doc.status,
    tenantId: doc.tenantId ? doc.tenantId.toString() : undefined,
    tenantName: doc.tenantName ?? undefined,
  }
}

const SORT_FIELDS = ['unitNumber', 'floor', 'sizeSqft', 'monthlyRent', 'status'] as const

// §4's list-endpoint contract: always `{ data, total, page, pageSize }`, and
// an unrecognized `sortBy` is a 400, never silently ignored.
export const GET = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const status = searchParams.get('status')
  const floor = searchParams.get('floor')
  const sortBy = searchParams.get('sortBy') ?? 'unitNumber'
  const sortDir = searchParams.get('sortDir') === 'desc' ? -1 : 1
  const { page, pageSize } = parsePageParams(searchParams)

  if (!SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])) throw new ApiError(`Invalid sortBy: ${sortBy}`, 400)

  await dbConnect()
  const filter: Record<string, unknown> = {}
  if (search) filter.unitNumber = { $regex: escapeRegex(search), $options: 'i' }
  if (status && status !== 'all') filter.status = status
  if (floor && floor !== 'all') filter.floor = floor

  const [docs, total] = await Promise.all([
    Unit.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    Unit.countDocuments(filter),
  ])

  return NextResponse.json({ data: docs.map(toPublicUnit), total, page, pageSize })
})

const createUnitSchema = z
  .object({
    unitNumber: z.string().min(1),
    floor: z.string().min(1),
    sizeSqft: z.number().positive(),
    monthlyRent: z.number().positive(),
    status: z.enum(['occupied', 'vacant', 'maintenance']).optional(),
  })
  .strict()

export const POST = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  const body = await request.json().catch(() => null)
  const parsed = createUnitSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('unitNumber, floor, sizeSqft, and yearly rent are required', 400)

  await dbConnect()
  const existing = await Unit.findOne({ unitNumber: parsed.data.unitNumber })
  if (existing) throw new ApiError('A unit with this number already exists', 409)

  const doc = await Unit.create({
    unitNumber: parsed.data.unitNumber,
    floor: parsed.data.floor,
    sizeSqft: parsed.data.sizeSqft,
    monthlyRent: parsed.data.monthlyRent,
    status: parsed.data.status ?? 'vacant',
  })

  return NextResponse.json({ success: true, id: doc._id.toString() })
})
