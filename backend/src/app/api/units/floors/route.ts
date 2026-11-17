import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Unit } from '@/models/Unit'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

export const GET = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  await dbConnect()
  const floors = await Unit.distinct('floor')
  return NextResponse.json(floors.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })))
})
