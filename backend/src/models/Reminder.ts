import { Schema, model, models, type InferSchemaType } from 'mongoose'

const reminderSchema = new Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['automatic', 'manual'], required: true },
    target: { type: String, enum: ['tenant', 'group', 'everyone'], required: true },
    targetTenantIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    targetLabel: { type: String, required: true },
    scheduledFor: { type: String, required: true },
    status: { type: String, enum: ['scheduled', 'sent', 'failed', 'cancelled'], required: true, default: 'scheduled' },
    // Set only for reminders auto-created from a due/overdue RentCharge (see
    // src/lib/auto-rent-reminders.ts) — the sparse unique index guarantees at
    // most one automatic reminder is ever created per rent charge, no matter
    // how many times the sweep runs.
    sourceRentChargeId: { type: Schema.Types.ObjectId, ref: 'RentCharge' },
  },
  { timestamps: true },
)

reminderSchema.index({ status: 1, scheduledFor: 1 })
reminderSchema.index({ sourceRentChargeId: 1 }, { unique: true, sparse: true })

export type ReminderDoc = InferSchemaType<typeof reminderSchema>
export const Reminder = models.Reminder ?? model('Reminder', reminderSchema)
