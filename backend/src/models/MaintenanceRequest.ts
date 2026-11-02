import { Schema, model, models, type InferSchemaType } from 'mongoose'

const maintenanceRequestSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantName: { type: String, required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit' },
    unitNumber: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], required: true, default: 'open' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], required: true, default: 'medium' },
    // Cloudinary is the storage backend — only the URL/public id lives here, never raw image bytes.
    images: [{ url: { type: String, required: true }, publicId: { type: String, required: true }, _id: false }],
    notes: { type: String, default: '' },
    resolvedAt: { type: String, default: null },
  },
  { timestamps: true },
)

maintenanceRequestSchema.index({ tenantId: 1 })
maintenanceRequestSchema.index({ status: 1 })
maintenanceRequestSchema.index({ priority: 1 })

export type MaintenanceRequestDoc = InferSchemaType<typeof maintenanceRequestSchema>
export const MaintenanceRequest = models.MaintenanceRequest ?? model('MaintenanceRequest', maintenanceRequestSchema)
