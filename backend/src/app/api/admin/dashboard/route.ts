import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { MaintenanceRequest } from '@/models/MaintenanceRequest'
import { RentCharge } from '@/models/RentCharge'
import { Unit } from '@/models/Unit'
import { User } from '@/models/User'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'

export { corsOptions as OPTIONS }

export const GET = withErrorHandling(async (request: NextRequest) => {
  requireRole(request, 'admin')
  await dbConnect()

  const [totalUnits, occupiedUnits, vacantUnits, totalTenants, activeTenants, overdueTenantIds, openMaintenance] =
    await Promise.all([
      Unit.countDocuments({}),
      Unit.countDocuments({ status: 'occupied' }),
      Unit.countDocuments({ status: 'vacant' }),
      User.countDocuments({ role: 'tenant' }),
      User.countDocuments({ role: 'tenant', status: 'active' }),
      RentCharge.distinct('tenantId', { status: 'overdue' }),
      MaintenanceRequest.countDocuments({ status: 'open' }),
    ])

  return NextResponse.json({
    totalUnits,
    occupiedUnits,
    vacantUnits,
    totalTenants,
    activeTenants,
    overdueTenants: overdueTenantIds.length,
    openMaintenance,
  })
})
