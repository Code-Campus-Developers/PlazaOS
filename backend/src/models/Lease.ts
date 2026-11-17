import { Schema, model, models, type InferSchemaType } from 'mongoose'

const leaseSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    // Annual amount; legacy APIs may still call this `monthlyRent`.
    rentAmount: { type: Number, required: true, min: 0.01 },
    // Legacy monthly schedule field; annual charges are due on lease anniversaries.
    rentDueDay: { type: Number, required: true, min: 1, max: 28 },
    status: { type: String, enum: ['active', 'ended'], required: true, default: 'active' },
  },
  { timestamps: true },
)

leaseSchema.index({ tenantId: 1 })
leaseSchema.index({ unitId: 1 })
leaseSchema.index({ status: 1 })

export type LeaseDoc = InferSchemaType<typeof leaseSchema>
export const Lease = models.Lease ?? model('Lease', leaseSchema)
