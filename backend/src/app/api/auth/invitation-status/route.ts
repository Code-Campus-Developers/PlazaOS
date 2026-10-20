import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { AccountInvitation } from '@/models/AccountInvitation'
import { User } from '@/models/User'
import { hashResetToken } from '@/lib/password'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export { corsOptions as OPTIONS }

export type InvitationStatusReason = 'invalid' | 'expired' | 'used' | 'ready'

export interface InvitationStatusResponse {
  valid: boolean
  reason: InvitationStatusReason
  /** Masked account email, so the tenant can confirm the right account. */
  email?: string
  expiresAt?: string
}

/**
 * Masks an email so the account owner can recognise it without the response
 * disclosing a full address to anyone who happens to hold a token.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return 'your account'
  const dot = domain.lastIndexOf('.')
  const domainName = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''
  return `${local.slice(0, 1)}***@${domainName.slice(0, 1)}***${tld}`
}

/**
 * Public (unauthenticated) check of whether an invitation link is still
 * usable. This exists purely so the setup page can show an accurate message
 * before the tenant types a password — the authoritative validation always
 * happens server-side in POST /auth/accept-invitation.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) throw new ApiError('A token is required', 400)

  rateLimit(`invitation-status:ip:${clientIp(request)}`, 30, 15 * 60_000)

  await dbConnect()
  const tokenHash = hashResetToken(token)
  const invitation = await AccountInvitation.findOne({ tokenHash }).lean()
  if (!invitation) {
    return NextResponse.json<InvitationStatusResponse>({ valid: false, reason: 'invalid' })
  }
  if (invitation.used) {
    return NextResponse.json<InvitationStatusResponse>({ valid: false, reason: 'used' })
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json<InvitationStatusResponse>({ valid: false, reason: 'expired' })
  }

  const user = await User.findById(invitation.userId).select('email accountStatus status').lean()
  if (!user || user.accountStatus !== 'pending' || user.status !== 'active') {
    return NextResponse.json<InvitationStatusResponse>({ valid: false, reason: 'used' })
  }

  return NextResponse.json<InvitationStatusResponse>({
    valid: true,
    reason: 'ready',
    email: maskEmail(user.email),
    expiresAt: invitation.expiresAt.toISOString(),
  })
})
