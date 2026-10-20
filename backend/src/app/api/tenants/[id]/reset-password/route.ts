import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireRole, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit } from '@/lib/rate-limit'
import {
  deliverInvitationEmail,
  issueAccountInvitation,
  recordInvitationDelivery,
  revokeInvitation,
} from '@/lib/account-invitation'

export { corsOptions as OPTIONS }

/**
 * Issues a fresh account-setup invitation for a tenant and emails it to them.
 *
 * The administrator never receives a password, a temp password, or a
 * token-bearing URL — only the delivery status of the invitation. Calling
 * this again re-issues the invitation and supersedes any previous one, so it
 * doubles as "resend invitation" after a delivery failure.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const auth = requireRole(request, 'admin')
  const { id } = await params
  // Same per-actor rate-limit class as /auth/set-password — bounds how fast
  // one admin (compromised or scripted) can spam password resets/emails.
  rateLimit(`reset-password:${auth.sub}`, 5, 15 * 60_000)

  await dbConnect()
  const user = await User.findOne({ _id: id, role: 'tenant' }).catch(() => null)
  if (!user) throw new ApiError('Tenant not found', 404)

  // Resetting means the old password must stop working: the account goes back
  // to "awaiting setup" and any existing password hash is discarded.
  //
  // The account change and the new invitation are written in one transaction.
  // Without that, a failure between the two would leave the tenant with no
  // password, no working invitation, and no way in — recoverable only by
  // another administrator request.
  const session = await mongoose.startSession()
  let invitation: { rawToken: string; invitationId: string; expiresAt: Date }
  try {
    await session.withTransaction(async () => {
      user.accountStatus = 'pending'
      user.mustChangePassword = true
      user.passwordHash = undefined
      await user.save({ session })

      invitation = await issueAccountInvitation(user._id, auth.sub, session)
    })
  } finally {
    await session.endSession()
  }

  const delivery = await deliverInvitationEmail({
    to: user.email,
    name: user.name,
    rawToken: invitation!.rawToken,
  })
  await recordInvitationDelivery(invitation!.invitationId, delivery)

  if (delivery.status !== 'sent') {
    // Nothing was delivered, so revoke the token: the account stays in the
    // safe "pending" state and the admin can send another invitation.
    await revokeInvitation(invitation!.invitationId)
  }

  return NextResponse.json({
    success: true,
    email: user.email,
    invitation: {
      delivered: delivery.status === 'sent',
      status: delivery.status,
      expiresAt: invitation!.expiresAt.toISOString(),
    },
  })
})
