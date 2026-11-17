import type { ClientSession, Types } from 'mongoose'
import { RentCharge } from '@/models/RentCharge'

type LeaseForRentCharge = {
  _id: Types.ObjectId | string
  tenantId: Types.ObjectId | string
  unitId: Types.ObjectId | string
  startDate: string
  endDate: string
  rentAmount: number
}

type AnnualRentChargeDetails = {
  tenantId: Types.ObjectId | string
  unitId: Types.ObjectId | string
  leaseId: Types.ObjectId | string
  period: string
  amount: number
  dueDate: string
  status: 'upcoming' | 'due' | 'overdue'
}

export const ANNUAL_RENT_PERIOD_REGEX = /^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/

export function isAnnualRentChargePeriod(period: string): boolean {
  return ANNUAL_RENT_PERIOD_REGEX.test(period)
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function anniversary(start: Date, yearOffset: number): Date {
  const year = start.getUTCFullYear() + yearOffset
  const month = start.getUTCMonth()
  const day = start.getUTCDate()
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth)))
}

export function getAnnualRentChargeDetails(
  lease: LeaseForRentCharge,
  now = new Date(),
): AnnualRentChargeDetails | null {
  const leaseStart = parseDate(lease.startDate)
  const leaseEnd = parseDate(lease.endDate)
  if (!leaseStart || !leaseEnd || leaseEnd < leaseStart) {
    throw new Error(`Lease ${lease._id.toString()} has invalid lease dates`)
  }

  const today = dateString(now)
  if (dateString(leaseEnd) < today) return null

  let yearOffset = 0
  let periodStart = anniversary(leaseStart, yearOffset)
  while (dateString(anniversary(leaseStart, yearOffset + 1)) <= today) {
    yearOffset += 1
    periodStart = anniversary(leaseStart, yearOffset)
  }

  const nextPeriodStart = anniversary(leaseStart, yearOffset + 1)
  const periodEnd = new Date(nextPeriodStart.getTime() - 24 * 60 * 60 * 1000)
  const boundedPeriodEnd = periodEnd > leaseEnd ? leaseEnd : periodEnd
  const dueDate = dateString(periodStart)

  return {
    tenantId: lease.tenantId,
    unitId: lease.unitId,
    leaseId: lease._id,
    period: `${dueDate} to ${dateString(boundedPeriodEnd)}`,
    amount: lease.rentAmount,
    dueDate,
    status: dueDate > today ? 'upcoming' : dueDate < today ? 'overdue' : 'due',
  }
}

export async function createAnnualRentChargeForLease(
  lease: LeaseForRentCharge,
  now = new Date(),
  session?: ClientSession,
) {
  const details = getAnnualRentChargeDetails(lease, now)
  if (!details) return null
  const [charge] = await RentCharge.create([details], session ? { session } : undefined)
  return charge
}

export async function ensureAnnualRentChargeForLease(lease: LeaseForRentCharge, now = new Date()) {
  const details = getAnnualRentChargeDetails(lease, now)
  if (!details) return null

  const existingPeriod = await RentCharge.findOne({ tenantId: details.tenantId, period: details.period })
  if (existingPeriod) return existingPeriod

  try {
    return await RentCharge.findOneAndUpdate(
      { tenantId: details.tenantId, period: details.period },
      { $setOnInsert: details },
      { upsert: true, new: true },
    )
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return RentCharge.findOne({ tenantId: details.tenantId, period: details.period })
    }
    throw error
  }
}
