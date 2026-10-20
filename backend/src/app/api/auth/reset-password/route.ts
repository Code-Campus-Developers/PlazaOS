import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { PasswordResetToken } from '@/models/PasswordResetToken'
import { hashPassword, hashResetToken } from '@/lib/password'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { invalidateOutstandingInvitations } from '@/lib/account-invitation'

export { corsOptions as OPTIONS }

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
  })
  .strict()

/**
 * Redeems a password-reset token and sets a new password.
 *
 * Claiming the token and storing the password happen in one MongoDB
 * transaction, so a failure after the token is claimed (user lookup, hashing,
 * or the save itself) rolls the claim back. Without that, a transient
 * failure would leave the token consumed and the password unchanged — the
 * user locked out of their own account with a spent reset link.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null)
  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('Invalid request', 400)

  const { token: rawToken, newPassword } = parsed.data

  // This is an unauthenticated endpoint that hits the database and runs
  // bcrypt, so it is metered per source IP and per submitted token.
  rateLimit(`reset-password:ip:${clientIp(request)}`, 10, 15 * 60_000)

  await dbConnect()

  // Hash the submitted token with SHA-256 so we can look it up directly in
  // MongoDB instead of scanning every outstanding token and comparing hashes.
  const tokenHash = hashResetToken(rawToken)
  rateLimit(`reset-password:token:${tokenHash}`, 10, 15 * 60_000)

  // Cheap pre-check so a bcrypt hash is never spent on an invalid token.
  // The authoritative, race-free claim happens inside the transaction below.
  const pending = await PasswordResetToken.findOne({
    tokenHash,
    used: false,
    expiresAt: { $gt: new Date() },
  })
    .select('_id')
    .lean()
  if (!pending) {
    throw new ApiError('This link is invalid or has expired. Please request a new password reset.', 400)
  }

  // Hash the new password before opening the transaction so the transaction
  // stays short (bcrypt is intentionally slow).
  const passwordHash = await hashPassword(newPassword)

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      // Find a token that is still valid (not expired, not used) and atomically
      // mark it as used in a single operation. This prevents concurrent requests
      // from reusing the same token. The TTL index on expiresAt handles cleanup
      // asynchronously, so we explicitly check expiresAt here as well.
      const validToken = await PasswordResetToken.findOneAndUpdate(
        {
          tokenHash,
          expiresAt: { $gt: new Date() },
          used: false,
        },
        { $set: { used: true } },
        { new: false, session },
      )

      if (!validToken) {
        throw new ApiError('This link is invalid or has expired. Please request a new password reset.', 400)
      }

      // Look up the user associated with this token
      const user = await User.findById(validToken.userId).session(session)
      if (!user) {
        throw new ApiError('This link is invalid or has expired. Please request a new password reset.', 400)
      }

      // Hash and set the new password
      user.passwordHash = passwordHash
      user.mustChangePassword = false
      // The account now has a password of the user's own choosing, so it is
      // no longer "awaiting setup". Leaving it 'pending' would both misreport
      // the account and keep it redeemable via a still-live invitation link.
      user.accountStatus = 'active'
      await user.save({ session })

      // Any outstanding setup invitation for this account is now redundant.
      // It must be invalidated, otherwise the (emailed, forwardable) link
      // could still be redeemed later and overwrite the password just set.
      await invalidateOutstandingInvitations(user._id, session)
    })
  } finally {
    await session.endSession()
  }

  return NextResponse.json({ success: true })
})
