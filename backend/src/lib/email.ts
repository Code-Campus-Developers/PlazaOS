import { Resend } from 'resend'

let client: Resend | null = null

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  // Unset/placeholder key (no real Resend account in this sandbox) — skip
  // sending rather than throw, so email is never on the critical path for a
  // payment/reminder to succeed (per BACKEND_BUILD_PLAN.md §9).
  if (!apiKey || apiKey === 're_replace_me') return null
  if (!client) client = new Resend(apiKey)
  return client
}

interface SendEmailInput {
  to: string
  subject: string
  html: string
}

/**
 * The outcome of a delivery attempt.
 *
 * - `sent` — the provider accepted the message.
 * - `failed` — the provider was configured but rejected/failed the send.
 * - `not_configured` — no usable provider is configured, so nothing was sent.
 *
 * `not_configured` is deliberately distinct from `sent`: a caller that must
 * know whether a message really went out (e.g. a tenant setup invitation)
 * cannot treat "no provider configured" as success.
 */
export type EmailDeliveryStatus = 'sent' | 'failed' | 'not_configured'

export interface EmailDeliveryResult {
  status: EmailDeliveryStatus
  /** Present only for `failed` — a short, non-sensitive provider message. */
  error?: string
}

/**
 * Sends an email and reports what actually happened.
 *
 * Never throws: a transactional-email-provider outage must never block a
 * payment/reminder/webhook from completing successfully. Callers that must
 * not silently lose a message (e.g. account invitations) inspect `status`.
 */
export async function sendEmailWithStatus({ to, subject, html }: SendEmailInput): Promise<EmailDeliveryResult> {
  const resend = getClient()
  if (!resend) {
    console.log(JSON.stringify({ email: 'skipped (RESEND_API_KEY not configured)', to, subject }))
    return { status: 'not_configured' }
  }

  try {
    // onboarding@resend.dev is Resend's no-verification-required sandbox sender.
    await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev', to, subject, html })
    return { status: 'sent' }
  } catch (err) {
    console.error(JSON.stringify({ email: 'failed', to, subject }), err)
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown email provider error',
    }
  }
}

/**
 * Escapes a value for safe interpolation into an HTML email body.
 *
 * Admin-supplied values (a tenant's name, a unit number) are otherwise
 * injected into the email as raw markup, so anything with a `<` in it is
 * rendered as HTML by the mail client.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Fire-and-forget: never throws. A transactional-email-provider outage must
// never block a payment/reminder/webhook from completing successfully.
export async function sendEmail(input: SendEmailInput): Promise<void> {
  await sendEmailWithStatus(input)
}
