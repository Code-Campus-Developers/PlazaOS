import { Schema, model, models, type InferSchemaType } from 'mongoose'

const unitSchema = new Schema(
  {
    unitNumber: { type: String, required: true, unique: true },
    // Stored as a string (mock floors are "1"/"2"/"3") so it matches the frontend's own convention.
    floor: { type: String, required: true },
    sizeSqft: { type: Number, required: true },
    // Legacy property name; this value represents yearly rent.
    monthlyRent: { type: Number, required: true },
    status: { type: String, enum: ['occupied', 'vacant', 'maintenance'], required: true, default: 'vacant' },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User' },
    tenantName: { type: String },
  },
  { timestamps: true },
)

unitSchema.index({ status: 1 })
unitSchema.index({ floor: 1 })

export type UnitDoc = InferSchemaType<typeof unitSchema>
export const Unit = models.Unit ?? model('Unit', unitSchema)
