import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { hashPassword } from '@/lib/password'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, requireAuth, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit } from '@/lib/rate-limit'
import { invalidateOutstandingInvitations } from '@/lib/account-invitation'

export { corsOptions as OPTIONS }

const setPasswordSchema = z
  .object({
    newPassword: z.string().min(8),
  })
  .strict()

// Requires a valid token but not a specific role — an admin or a tenant with
// mustChangePassword: true both call this on first login.
export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = requireAuth(request)
  rateLimit(`set-password:${auth.sub}`, 5, 15 * 60_000)
  const body = await request.json().catch(() => null)
  const parsed = setPasswordSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('Password must be at least 8 characters', 400)

  await dbConnect()
  const user = await User.findById(auth.sub)
  if (!user) throw new ApiError('Unauthorized', 401)

  user.passwordHash = await hashPassword(parsed.data.newPassword)
  user.mustChangePassword = false
  // The account has a password of the user's own choosing now, so it is no
  // longer "awaiting setup" — and any outstanding invitation link that could
  // otherwise overwrite this password is invalidated.
  user.accountStatus = 'active'
  await user.save()
  await invalidateOutstandingInvitations(user._id)

  return NextResponse.json({ success: true })
})
