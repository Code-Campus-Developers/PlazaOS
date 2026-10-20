import { createHmac, timingSafeEqual } from 'node:crypto'
import { CURRENCY, minorUnits, toMinorUnits } from './currency'

const PAYSTACK_BASE_URL = 'https://api.paystack.co'

// Every gateway call is bounded so a hung provider cannot hold a serverless
// invocation open indefinitely.
const PAYSTACK_TIMEOUT_MS = 15_000

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured')
  return key
}

/**
 * The currency transactions are created in.
 *
 * PlazaOS is a naira-only application, so the currency is fixed rather than
 * free-form: an unsupported value fails loudly instead of charging an amount
 * the tenant did not agree to.
 */
export function paystackCurrency(): string {
  const configured = process.env.PAYSTACK_CURRENCY?.trim() || CURRENCY
  // Throws for a currency with no known minor-unit factor.
  minorUnits(configured)
  return configured
}

interface InitializeTransactionParams {
  email: string
  amount: number
  reference: string
  callbackUrl: string
  metadata?: Record<string, unknown>
}

interface InitializeTransactionResult {
  authorization_url: string
  access_code: string
  reference: string
}

export interface VerifyTransactionResult {
  status: 'success' | 'failed' | 'abandoned' | 'pending'
  reference: string
  /** Amount in the currency's minor units (kobo for NGN). */
  amount: number
  currency: string
  /** The gateway's own transaction id, used to reconcile and de-duplicate. */
  id: number | string
}

async function paystackFetch(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.status) {
    throw new Error(body?.message ?? 'Paystack request failed')
  }
  return body.data
}

export async function initializeTransaction(params: InitializeTransactionParams): Promise<InitializeTransactionResult> {
  const currency = paystackCurrency()
  return paystackFetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      // Paystack, like most gateways, expects amounts in the currency's
      // smallest subunit (kobo for NGN) — never the major-unit float.
      amount: toMinorUnits(params.amount, currency),
      currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  })
}

// Paystack doesn't reliably send a webhook for a failed/abandoned one-off
// charge, so the tenant-facing return flow re-checks the real status directly
// rather than assuming success just because the browser came back.
export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  return paystackFetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  })
}

// Verifies the `x-paystack-signature` header: HMAC-SHA512 of the raw request
// body, keyed with the secret key — never trust a webhook body without this.
export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', getSecretKey()).update(rawBody).digest('hex')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const signatureBuffer = Buffer.from(signature, 'utf8')
  if (expectedBuffer.length !== signatureBuffer.length) return false
  return timingSafeEqual(expectedBuffer, signatureBuffer)
}
