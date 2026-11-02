import { Schema, model, models, type InferSchemaType } from 'mongoose'

const calendarEventSchema = new Schema(
  {
    title: { type: String, required: true },
    type: { type: String, enum: ['rent_due', 'reminder', 'lease_renewal', 'meeting', 'inspection', 'eviction', 'other'], required: true },
    date: { type: String, required: true },
    // Tenant this event concerns — used to scope /tenant/calendar to rent-due dates + reminders that target them.
    tenantId: { type: Schema.Types.ObjectId, ref: 'User' },
    relatedLabel: { type: String },
    // Loose ref back to a Reminder/Payment/lease, depending on `type`.
    relatedId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
)

calendarEventSchema.index({ date: 1 })
calendarEventSchema.index({ type: 1 })
calendarEventSchema.index({ tenantId: 1 })

export type CalendarEventDoc = InferSchemaType<typeof calendarEventSchema>
export const CalendarEvent = models.CalendarEvent ?? model('CalendarEvent', calendarEventSchema)
