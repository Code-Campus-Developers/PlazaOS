import { randomBytes } from 'node:crypto'
import type { ClientSession } from 'mongoose'
import { AccountInvitation } from '@/models/AccountInvitation'
import { hashResetToken } from '@/lib/password'
import { sendEmailWithStatus, escapeHtml, type EmailDeliveryResult } from '@/lib/email'
import { publicAppUrl } from '@/lib/app-url'

export { publicAppUrl }

/**
 * How long a setup invitation stays valid. Long enough for a tenant to find
 * the email, short enough that a leaked link is not useful for long.
 */
export const INVITATION_EXPIRY_MS = 48 * 60 * 60 * 1000 // 48 hours

export const SETUP_PATH = '/tenant/account-setup'

/**
 * The tenant-facing setup link. The raw token only ever exists here, in the
 * email body, and in the tenant's browser — it is never stored, logged, or
 * returned to an administrator.
 */
export function buildInvitationUrl(rawToken: string): string {
  return `${publicAppUrl()}${SETUP_PATH}?token=${encodeURIComponent(rawToken)}`
}

/**
 * Invalidates every outstanding (unused) invitation for a user.
 *
 * Called whenever a password is set through a path other than redeeming an
 * invitation (e.g. a password reset, or the signed-in set-password route).
 * Without this, a still-live invitation link could be redeemed afterwards and
 * overwrite the password the user had just chosen.
 */
export async function invalidateOutstandingInvitations(userId: unknown, session?: ClientSession): Promise<void> {
  await AccountInvitation.updateMany({ userId, used: false }, { $set: { used: true } }, session ? { session } : {})
}

/**
 * Creates a fresh invitation for a user, invalidating any outstanding ones.
 *
 * Returns the raw token — the caller must hand it straight to the email
 * body and must not persist, log, or return it to an administrator.
 */
export async function issueAccountInvitation(
  userId: unknown,
  invitedBy?: unknown,
  session?: ClientSession,
): Promise<{ rawToken: string; invitationId: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashResetToken(rawToken)
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS)

  // Only one invitation per user can ever be live: supersede the rest.
  await invalidateOutstandingInvitations(userId, session)

  const [invitation] = await AccountInvitation.create(
    [
      {
        userId,
        tokenHash,
        expiresAt,
        used: false,
        invitedBy,
        deliveryStatus: 'pending',
      },
    ],
    session ? { session } : {},
  )

  return { rawToken, invitationId: invitation._id.toString(), expiresAt }
}

/**
 * Sends the "set up your account" email.
 *
 * The delivery outcome is returned rather than swallowed so the caller can
 * tell the administrator whether the invitation really went out.
 */
export async function deliverInvitationEmail(input: {
  to: string
  name: string
  rawToken: string
}): Promise<EmailDeliveryResult> {
  const setupUrl = buildInvitationUrl(input.rawToken)
  const expiryHours = Math.round(INVITATION_EXPIRY_MS / (60 * 60 * 1000))
  // The name is administrator-supplied and would otherwise be injected into
  // the email as raw markup.
  const safeName = escapeHtml(input.name)
  const safeSetupUrl = escapeHtml(setupUrl)

  return sendEmailWithStatus({
    to: input.to,
    subject: 'Set up your PlazaOS account',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background-color: #3730A3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; }
    .footer { color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Welcome to PlazaOS</h2>
    <p>Hello ${safeName},</p>
    <p>An account has been created for you. Choose your own password to finish setting up your account.</p>
    <p>
      <a href="${safeSetupUrl}" class="button">Set up my account</a>
    </p>
    <p>Or copy and paste this link into your browser:</p>
    <p><a href="${safeSetupUrl}">${safeSetupUrl}</a></p>
    <p><strong>This link expires in ${expiryHours} hours and can only be used once.</strong></p>
    <p>If you were not expecting this, you can safely ignore this email — no account is created until you set a password.</p>
    <div class="footer">
      <p>PlazaOS - Property Management System</p>
    </div>
  </div>
</body>
</html>
    `,
  })
}

/**
 * Records the delivery outcome on the invitation so the administrator can see
 * whether an invitation was actually delivered, and so a failed delivery
 * leaves the account in a safe (non-redeemable) state.
 */
export async function recordInvitationDelivery(
  invitationId: string,
  result: EmailDeliveryResult,
): Promise<void> {
  await AccountInvitation.updateOne(
    { _id: invitationId },
    {
      $set: {
        deliveryStatus: result.status,
        deliveredAt: result.status === 'sent' ? new Date() : undefined,
      },
    },
  )
}

/**
 * Invalidates a token that was created but never delivered (the email
 * provider was unconfigured or failed). Without this the account would sit in
 * a "pending" state holding a live token nobody ever received.
 */
export async function revokeInvitation(invitationId: string): Promise<void> {
  await AccountInvitation.updateOne({ _id: invitationId, used: false }, { $set: { used: true } })
}
