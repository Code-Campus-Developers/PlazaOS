import { Schema, model, models, type InferSchemaType } from 'mongoose'

// Backs both admin and tenant accounts in one collection, discriminated by `role`.
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Optional: a tenant created through the invitation flow has no password
    // at all until they accept their invitation and choose one themselves.
    // Such an account is marked `accountStatus: 'pending'` and can never log
    // in (the login route rejects accounts without a passwordHash).
    passwordHash: { type: String },
    role: { type: String, enum: ['admin', 'tenant'], required: true },

    // Tenant-only fields
    phone: { type: String },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit' },
    unitNumber: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },

    // 'pending'   = invitation sent, tenant has not set a password yet
    // 'temporary' = legacy account still on a system-generated password
    // 'active'    = the tenant has set their own password
    accountStatus: { type: String, enum: ['pending', 'temporary', 'active'], required: true, default: 'active' },
    mustChangePassword: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
)

userSchema.index({ role: 1 })
userSchema.index({ unitId: 1 })

export type UserDoc = InferSchemaType<typeof userSchema>
export const User = models.User ?? model('User', userSchema)
