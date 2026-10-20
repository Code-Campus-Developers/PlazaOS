/**
 * Single source of truth for money in PlazaOS.
 *
 * PlazaOS charges and displays Nigerian naira (NGN). The ISO code is the
 * currency actually sent to the payment gateway and stored alongside each
 * payment, so a record always says which currency it was taken in.
 */

export const CURRENCY = 'NGN'
export const CURRENCY_SYMBOL = '₦'

/**
 * How many minor units (kobo for NGN) make up one major unit.
 *
 * Only currencies with a known minor-unit factor are accepted, so a
 * misconfigured `PAYSTACK_CURRENCY` fails loudly instead of silently
 * charging 100x the intended amount.
 */
const MINOR_UNITS: Record<string, number> = {
  NGN: 100,
  USD: 100,
  EUR: 100,
  GBP: 100,
}

export function minorUnits(currency: string = CURRENCY): number {
  const factor = MINOR_UNITS[currency]
  if (!factor) throw new Error(`Unsupported currency: ${currency}`)
  return factor
}

/** Converts a major-unit amount (e.g. naira) into minor units (kobo). */
export function toMinorUnits(amount: number, currency: string = CURRENCY): number {
  return Math.round(amount * minorUnits(currency))
}

/** Converts minor units (kobo) back into a major-unit amount. */
export function fromMinorUnits(value: number, currency: string = CURRENCY): number {
  return value / minorUnits(currency)
}

/**
 * Formats a major-unit amount for display (receipts, emails, notifications).
 */
export function formatAmount(amount: number, currency: string = CURRENCY): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
