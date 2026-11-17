import { Schema, model, models, type InferSchemaType } from 'mongoose'

// A single rent obligation for one tenant/unit/period — distinct from `Payment`
// (an actual transaction attempt) and `Lease` (the ongoing agreement it's billed
// under). A `'failed'` Payment must never imply `'overdue'` here — this only
// moves to `'overdue'` once its `dueDate` passes still unpaid, and to `'paid'`
// only once a real Payment settles successfully.
const rentChargeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    leaseId: { type: Schema.Types.ObjectId, ref: 'Lease', required: true },
    // Annual lease-year range, e.g. "2026-08-01 to 2027-07-31".
    period: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    dueDate: { type: String, required: true },
    status: { type: String, enum: ['upcoming', 'due', 'overdue', 'paid'], required: true, default: 'upcoming' },
  },
  { timestamps: true },
)

rentChargeSchema.index({ tenantId: 1 })
rentChargeSchema.index({ status: 1 })
rentChargeSchema.index({ dueDate: 1 })
rentChargeSchema.index({ tenantId: 1, period: 1 }, { unique: true })

export type RentChargeDoc = InferSchemaType<typeof rentChargeSchema>
export const RentCharge = models.RentCharge ?? model('RentCharge', rentChargeSchema)
