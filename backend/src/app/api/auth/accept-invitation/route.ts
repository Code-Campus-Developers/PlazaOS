import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { AccountInvitation } from '@/models/AccountInvitation'
import { hashPassword, hashResetToken } from '@/lib/password'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { invalidateOutstandingInvitations } from '@/lib/account-invitation'

export { corsOptions as OPTIONS }

const acceptInvitationSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8),
  })
  .strict()

const INVALID_INVITATION_MESSAGE =
  'This invitation is invalid, has expired, or has already been used. Please ask your administrator to send a new one.'

/**
 * Public (unauthenticated) endpoint where a tenant redeems their invitation
 * and chooses their own password.
 *
 * The administrator never sees or handles the token or the password — the
 * token arrives by email and the password is chosen here, by the tenant.
 *
 * Redeeming the token and storing the password happen in a single MongoDB
 * transaction: either the token is consumed *and* the password is stored, or
 * neither happens. Without this, a failure after the token was claimed would
 * leave the tenant locked out with a spent invitation.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null)
  const parsed = acceptInvitationSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('Invalid request', 400)

  // Bound both how fast one source IP can try tokens and how fast a single
  // token can be brute-forced.
  rateLimit(`accept-invitation:ip:${clientIp(request)}`, 10, 15 * 60_000)
  rateLimit(`accept-invitation:token:${hashResetToken(parsed.data.token)}`, 10, 15 * 60_000)

  await dbConnect()

  const tokenHash = hashResetToken(parsed.data.token)

  // Cheap pre-check so a bcrypt hash is never spent on an invalid token.
  // The authoritative, race-free claim happens inside the transaction below.
  const pending = await AccountInvitation.findOne({
    tokenHash,
    used: false,
    expiresAt: { $gt: new Date() },
  })
    .select('_id')
    .lean()
  if (!pending) throw new ApiError(INVALID_INVITATION_MESSAGE, 400)

  // Hash the password before opening the transaction: bcrypt is deliberately
  // slow, and a long-running transaction holds locks and a connection slot.
  const passwordHash = await hashPassword(parsed.data.password)

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      // Atomically claim the token. `used: false` + the expiry check mean only
      // one concurrent request can ever redeem a given invitation, and a
      // replay finds nothing.
      const invitation = await AccountInvitation.findOneAndUpdate(
        { tokenHash, used: false, expiresAt: { $gt: new Date() } },
        { $set: { used: true } },
        { new: false, session },
      )
      if (!invitation) throw new ApiError(INVALID_INVITATION_MESSAGE, 400)

      const user = await User.findById(invitation.userId).session(session)
      if (!user || user.role !== 'tenant') throw new ApiError(INVALID_INVITATION_MESSAGE, 400)
      if (user.status !== 'active') {
        throw new ApiError('This account is not active. Please contact your administrator.', 403)
      }
      // An invitation is only ever redeemable by an account that is still
      // waiting for setup — this is what stops a token from being used to
      // take over an account that has already been set up.
      if (user.accountStatus !== 'pending') throw new ApiError(INVALID_INVITATION_MESSAGE, 400)

      user.passwordHash = passwordHash
      user.accountStatus = 'active'
      user.mustChangePassword = false
      await user.save({ session })

      // The account is set up now, so no other invitation for it may stay
      // live: a second outstanding link would be a second way to take the
      // account over.
      await invalidateOutstandingInvitations(user._id, session)
    })
  } finally {
    await session.endSession()
  }

  // The tenant signs in normally from here on.
  return NextResponse.json({ success: true })
})
