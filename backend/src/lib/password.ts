import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'

const SALT_ROUNDS = 12
// Omits 0/O/1/l/I to avoid ambiguity when an admin reads this aloud or copies it.
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Hash a reset token with SHA-256.
 *
 * Reset tokens are high-entropy random strings, not user-chosen passwords, so
 * bcrypt's adaptive cost is unnecessary overhead. SHA-256 is fast, deterministic,
 * and produces a fixed-length digest that can be looked up directly in MongoDB.
 */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Server-side temp password generation — never trust a client-supplied temp password. */
export function generateTempPassword(length = 10): string {
  let password = ''
  for (let i = 0; i < length; i += 1) {
    password += TEMP_PASSWORD_CHARS[Math.floor(Math.random() * TEMP_PASSWORD_CHARS.length)]
  }
  return password
}
