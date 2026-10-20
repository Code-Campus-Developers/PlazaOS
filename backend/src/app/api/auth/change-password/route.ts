import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { hashPassword, verifyPassword } from '@/lib/password'
import { ApiError } from '@/lib/api-error'
import {
  withErrorHandling,
  requireAuth,
  OPTIONS as corsOptions,
} from '@/lib/route-handler'
import { rateLimit } from '@/lib/rate-limit'

export { corsOptions as OPTIONS }

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  })
  .strict()

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = requireAuth(request)

  rateLimit(`change-password:${auth.sub}`, 5, 15 * 60_000)

  const body = await request.json().catch(() => null)
  const parsed = changePasswordSchema.safeParse(body)

  if (!parsed.success) {
    throw new ApiError('Password must be at least 8 characters', 400)
  }

  await dbConnect()

  const user = await User.findById(auth.sub)

  if (!user) {
    throw new ApiError('Unauthorized', 401)
  }

  // An account created through the invitation flow has no password yet, so
  // there is no "current password" to verify against. Guard before handing
  // the value to bcrypt, which would otherwise fail on an undefined hash.
  if (!user.passwordHash) {
    throw new ApiError('Current password is incorrect', 400)
  }

  const valid = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  )

  if (!valid) {
    throw new ApiError('Current password is incorrect', 400)
  }

  user.passwordHash = await hashPassword(parsed.data.newPassword)
  user.mustChangePassword = false

  await user.save()

  return NextResponse.json({ success: true })
})
