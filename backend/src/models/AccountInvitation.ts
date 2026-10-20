import { Schema, model, models, type InferSchemaType } from 'mongoose'

/**
 * A single-use, time-limited account-setup invitation.
 *
 * The administrator never sees the invitation token: only its SHA-256 hash is
 * stored here, and the raw token exists solely in the setup link emailed
 * directly to the tenant.
 */
const accountInvitationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // SHA-256 digest of the raw token (see hashResetToken in lib/password.ts).
    // The raw token is never persisted, logged, or returned to an API caller.
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    // Flipped to true the moment the token is redeemed, so a link can never
    // be replayed.
    used: { type: Boolean, required: true, default: false },
    // The admin who issued the invitation.
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Whether the setup email actually went out. 'not_configured' means no
    // email provider is configured, so nothing was delivered.
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'not_configured'],
      required: true,
      default: 'pending',
    },
    deliveredAt: { type: Date },
  },
  { timestamps: true },
)

// TTL index: expired invitations are reaped by MongoDB itself.
accountInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
accountInvitationSchema.index({ userId: 1 })
// Unique: a token hash identifies exactly one invitation, so the same setup
// link can never be redeemed against two different accounts.
accountInvitationSchema.index({ tokenHash: 1 }, { unique: true })

export type AccountInvitationDoc = InferSchemaType<typeof accountInvitationSchema>
export const AccountInvitation = models.AccountInvitation ?? model('AccountInvitation', accountInvitationSchema)
