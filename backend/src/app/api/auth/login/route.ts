import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { verifyPassword } from '@/lib/password'
import { signToken } from '@/lib/jwt'
import { ApiError } from '@/lib/api-error'
import { withErrorHandling, OPTIONS as corsOptions } from '@/lib/route-handler'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export { corsOptions as OPTIONS }

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict()

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('Invalid email or password', 400)

  // Blunt credential-stuffing/brute-force: cap attempts per source IP and,
  // separately, per targeted account so a distributed attack against one
  // email can't hide behind the looser per-IP limit.
  rateLimit(`login:ip:${clientIp(request)}`, 20, 5 * 60_000)
  rateLimit(`login:email:${parsed.data.email.toLowerCase()}`, 5, 5 * 60_000)

  await dbConnect()
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
  if (!user) throw new ApiError('Invalid email or password', 401)

  // An account created through the invitation flow has no password until the
  // tenant accepts their invitation. The generic message is used so the
  // response never reveals which addresses have accounts.
  if (!user.passwordHash) throw new ApiError('Invalid email or password', 401)

  const valid = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!valid) throw new ApiError('Invalid email or password', 401)

  // A deactivated tenant must not be able to sign in, even with the right
  // password. The check runs after the password is verified so it cannot be
  // used to probe which addresses exist.
  if (user.status === 'inactive') {
    throw new ApiError('This account has been deactivated. Please contact the administrator.', 403)
  }

  const token = signToken({ sub: user._id.toString(), role: user.role })

  return NextResponse.json({
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  })
})
