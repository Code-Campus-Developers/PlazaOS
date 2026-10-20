import { Schema, model, models, type InferSchemaType } from 'mongoose'
import { CURRENCY } from '@/lib/currency'

const paymentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantName: { type: String, required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit' },
    unitNumber: { type: String, required: true },
    // The rent obligation this transaction is for — required for gateway payments
    // (see backend/src/app/api/tenant/payments/route.ts); offline payments don't
    // link one yet (see BACKEND_BUILD_PLAN.md §7's "admin offline payments" item).
    rentChargeId: { type: Schema.Types.ObjectId, ref: 'RentCharge' },
    amount: { type: Number, required: true, min: 0.01 },
    // The ISO code of the currency `amount` is denominated in (PlazaOS charges
    // NGN). Recorded per payment so a record always states its own currency.
    currency: { type: String, required: true, default: CURRENCY },
    method: { type: String, enum: ['cash', 'bank_transfer', 'check', 'gateway'], required: true },
    // 'pending'  = the gateway transaction is in flight
    // 'paid'     = the money was captured and the rent charge was settled
    // 'failed'   = the charge was declined or never completed
    // 'refunded' = the money was returned to the tenant, so the rent charge
    //              is owed again (see lib/refund-payment.ts)
    status: { type: String, enum: ['paid', 'pending', 'failed', 'refunded'], required: true, default: 'pending' },
    date: { type: String, required: true },
    note: { type: String },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Gateway payments only — the gateway's own payment/event id, used to key idempotent webhook updates.
    gatewayReference: { type: String },
    // Gateway payments only — the gateway's own transaction id. Lets a payment
    // be reconciled against Paystack and de-duplicated by event.
    gatewayTransactionId: { type: String },
  },
  { timestamps: true },
)

paymentSchema.index({ tenantId: 1 })
paymentSchema.index({ status: 1 })
paymentSchema.index({ date: 1 })
// Unique: one gateway reference may only ever identify one payment, so a
// replayed or duplicated record can never be settled twice. Sparse, because
// offline payments have no gateway reference at all.
paymentSchema.index({ gatewayReference: 1 }, { unique: true, sparse: true })
paymentSchema.index({ gatewayTransactionId: 1 }, { sparse: true })
paymentSchema.index({ rentChargeId: 1 })

export type PaymentDoc = InferSchemaType<typeof paymentSchema>
export const Payment = models.Payment ?? model('Payment', paymentSchema)
