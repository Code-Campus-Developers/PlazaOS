'use strict'

/**
 * Read-only diagnostic: lists rent charges that have more than one active
 * (pending or paid) Payment record. Run before rolling out the partial unique
 * index on Payment.rentChargeId so any pre-existing duplicates can be reconciled
 * manually. This script NEVER mutates or deletes data.
 *
 * Usage: node scripts/find-duplicate-active-payments.js
 */
const { MongoClient } = require('mongodb')

async function main() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL
  if (!uri) {
    console.error('MONGODB_URI (or DATABASE_URL) is required')
    process.exit(1)
  }
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  const payments = db.collection('payments')
  const duplicates = await payments
    .aggregate([
      { $match: { status: { $in: ['pending', 'paid'] }, rentChargeId: { $exists: true, $ne: null } } },
      { $group: { _id: '$rentChargeId', count: { $sum: 1 }, ids: { $push: '$_id' }, statuses: { $push: '$status' } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray()
  console.log(JSON.stringify(duplicates, null, 2))
  console.log(`Found ${duplicates.length} rent charge(s) with duplicate active payments.`)
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
