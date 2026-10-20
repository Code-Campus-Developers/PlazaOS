import { Schema, model, models, type InferSchemaType } from 'mongoose'

// Stores hashed password reset tokens with expiration and single-use tracking
const passwordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
)

// TTL index: automatically delete expired tokens after 30 minutes
// Using expiresAt ensures we clean up even if a token is never used
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// Supports superseding a user's earlier outstanding tokens when a new reset
// is requested, without a collection scan.
passwordResetTokenSchema.index({ userId: 1 })
// Unique: a token hash identifies exactly one reset token, so the same link
// can never be redeemed against two different accounts.
passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true })

export type PasswordResetTokenDoc = InferSchemaType<typeof passwordResetTokenSchema>
export const PasswordResetToken = models.PasswordResetToken ?? model('PasswordResetToken', passwordResetTokenSchema)
