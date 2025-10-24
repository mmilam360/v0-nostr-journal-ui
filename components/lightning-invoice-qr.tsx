'use client'

import { QRCodeSVG } from 'qrcode.react'

interface LightningInvoiceQRProps {
  invoice: string
  amount: number
}

export function LightningInvoiceQR({ 
  invoice,
  amount
}: LightningInvoiceQRProps) {
  return (
    <div className="space-y-4">
      {/* QR Code */}
      <QRCodeSVG
        value={invoice}
        size={256}
        level="M"
        includeMargin={true}
        className="mx-auto"
      />
    </div>
  )
}
