import { Notification } from '@/models/Notification'
import { User } from '@/models/User'
import { sendEmail } from './email'
import { formatAmount } from './currency'

interface PaymentSummary {
  tenantId: unknown
  tenantName: string
  unitNumber: string
  amount: number
  currency?: string
}

// Creates the matching tenant + admin Notification documents for a payment
// reaching a terminal state, per BACKEND_BUILD_PLAN.md §7/§9.
//
// `reason` is the admin-facing explanation for a payment that was refused
// (e.g. the gateway charged a different amount). It is included in the admin
// notification so a captured-but-unapplied payment is never silent.
export async function notifyPaymentOutcome(
  payment: PaymentSummary,
  status: 'paid' | 'failed' | 'refunded',
  reason?: string,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10)
  const amount = formatAmount(payment.amount, payment.currency)
  const title =
    status === 'paid' ? 'Payment received' : status === 'refunded' ? 'Payment refunded' : 'Payment failed'
  const tenantBody =
    status === 'paid'
      ? `Your payment of ${amount} was received.`
      : status === 'refunded'
        ? `Your payment of ${amount} was refunded and the rent is due again.`
        : `Your payment of ${amount} could not be processed.`

  await Notification.create([
    {
      audience: 'tenant',
      recipientId: payment.tenantId,
      type: 'payment',
      title,
      body: tenantBody,
      date,
      read: false,
    },
    {
      audience: 'admin',
      type: 'payment',
      title:
        status === 'paid'
          ? `Payment received — ${payment.tenantName}`
          : status === 'refunded'
            ? `Payment refunded — ${payment.tenantName}`
            : `Payment failed — ${payment.tenantName}`,
      body: `Unit ${payment.unitNumber} — ${amount}${reason ? ` — ${reason}` : ''}`,
      date,
      read: false,
    },
  ])

  // Email is decoupled from notification creation — a provider outage must
  // never block a payment from settling (see src/lib/email.ts).
  const tenant = await User.findById(payment.tenantId).select('email').lean()
  if (tenant?.email) {
    await sendEmail({ to: tenant.email, subject: title, html: `<p>${tenantBody}</p>` })
  }
}
