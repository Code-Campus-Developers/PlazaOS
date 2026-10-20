/**
 * The public, user-facing base URL of the frontend.
 *
 * Every user-facing link PlazaOS produces — setup invitations, password
 * reset links, the payment gateway's callback URL — points at the real app,
 * so this must be a validated absolute URL. A typo'd or missing value must
 * fail loudly rather than silently produce a broken (or attacker-controlled)
 * link in an email a tenant is about to trust.
 *
 * Every caller that builds a user-facing link goes through here, so the
 * validation rule is applied consistently instead of per call site.
 */
export function publicAppUrl(): string {
  const configured = process.env.FRONTEND_URL?.trim()
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FRONTEND_URL is not configured')
    }
    return 'http://localhost:5173'
  }

  let parsed: URL
  try {
    parsed = new URL(configured)
  } catch {
    throw new Error('FRONTEND_URL is not a valid absolute URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use http or https')
  }

  // Drop any trailing slash so `${base}${path}` never doubles up.
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}
