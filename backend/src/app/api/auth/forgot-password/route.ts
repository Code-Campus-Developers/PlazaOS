import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { PasswordResetToken } from '@/models/PasswordResetToken'
import { hashResetToken } from '@/lib/password'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { sendEmailWithStatus, escapeHtml } from '@/lib/email'
import { publicAppUrl } from '@/lib/app-url'

export { corsOptions as OPTIONS }

const forgotPasswordSchema = z
  .object({
    email: z.string().email(),
  })
  .strict()

const RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Rate limit per source IP to prevent email enumeration/spam
  rateLimit(`forgot-password:ip:${clientIp(request)}`, 5, 15 * 60_000)

  const body = await request.json().catch(() => null)
  const parsed = forgotPasswordSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('Invalid email address', 400)

  const normalizedEmail = parsed.data.email.toLowerCase()
  // A per-target-email bucket as well, so rotating source IPs cannot be used
  // to flood one victim's inbox with reset emails.
  rateLimit(`forgot-password:email:${normalizedEmail}`, 3, 15 * 60_000)

  await dbConnect()

  // Look up user — but always return the same success response to prevent
  // email enumeration attacks (whether the email exists or not).
  const user = await User.findOne({ email: normalizedEmail })

  if (user) {
    // Generate a cryptographically secure token (not Math.random())
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = hashResetToken(rawToken)

    // Store the hashed token with user, expiration, and "not used" flag
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS)

    // Only one reset token per user may be live: supersede any earlier one.
    // Otherwise requesting a reset twice leaves two working links, and the
    // older (possibly already-forwarded) one would still be redeemable.
    await PasswordResetToken.updateMany({ userId: user._id, used: false }, { $set: { used: true } })

    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt,
      used: false,
    })

    // Construct reset link. A misconfigured FRONTEND_URL must not produce a
    // broken link in a real email, so the link is only built when the URL
    // validates — and the failure is reported server-side, never to the
    // caller, so the response stays identical for existing and unknown
    // addresses.
    let resetLink: string
    try {
      resetLink = `${publicAppUrl()}/reset-password?token=${rawToken}`
    } catch (err) {
      console.error('Cannot build the password reset link: FRONTEND_URL is not usable', err)
      return NextResponse.json(
        {
          success: true,
          message: 'If an account exists for that email, we have sent a password reset link. It expires in 30 minutes.',
        },
        { status: 200 },
      )
    }

    // Send reset email. The delivery outcome is inspected and logged rather
    // than swallowed: the response below must stay identical for existing and
    // non-existing accounts (no enumeration), so an undelivered message can
    // only be reported server-side.
    const resetLinkHtml = `<a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a>`
    const delivery = await sendEmailWithStatus({
      to: user.email,
      subject: 'Password Reset Request - PlazaOS',
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
    <h2>Password Reset Request</h2>
    <p>We received a request to reset the password for your PlazaOS account.</p>
    <p>
      <a href="${escapeHtml(resetLink)}" class="button">Reset Password</a>
    </p>
    <p>Or copy and paste this link in your browser:</p>
    <p>${resetLinkHtml}</p>
    <p><strong>This link expires in 30 minutes.</strong></p>
    <p>If you didn't request this, you can safely ignore this email.</p>
    <div class="footer">
      <p>PlazaOS - Property Management System</p>
    </div>
  </div>
</body>
</html>
      `,
    })

    if (delivery.status !== 'sent') {
      // The response below must not reveal whether the account exists, so the
      // undelivered message is reported server-side only.
      console.error('Password reset email was not delivered', {
        status: delivery.status,
        detail: delivery.error,
      })
    }
  }

  // Return the same response regardless of whether the email exists or not
  return NextResponse.json(
    {
      success: true,
      message: 'If an account exists for that email, we have sent a password reset link. It expires in 30 minutes.',
    },
    { status: 200 },
  )
})
