import PDFDocument from 'pdfkit'
import { formatAmount } from './currency'

interface ReceiptData {
  receiptNumber: string
  tenantName: string
  unitNumber: string
  amount: number
  date: string
  method: string
  currency?: string
}

export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).text('Payment Receipt', { align: 'center' })
    doc.moveDown()
    doc.fontSize(12)
    doc.text(`Receipt #: ${data.receiptNumber}`)
    doc.text(`Date: ${data.date}`)
    doc.moveDown()
    doc.text(`Tenant: ${data.tenantName}`)
    doc.text(`Unit: ${data.unitNumber}`)
    doc.moveDown()
    doc.text(`Amount: ${formatAmount(data.amount, data.currency)}`)
    doc.text(`Method: ${data.method}`)
    doc.moveDown(2)
    doc.fontSize(10).fillColor('#666666').text('This receipt was generated automatically by Plaza OS.', { align: 'center' })

    doc.end()
  })
}
