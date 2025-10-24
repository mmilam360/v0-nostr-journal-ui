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
      
      {/* Amount */}
      <div className="text-center py-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
        <p className="text-sm text-orange-700 dark:text-orange-300 uppercase tracking-wide">
          Amount
        </p>
        <p className="text-4xl font-bold text-orange-600 dark:text-orange-400 mt-1">
          {amount} sats
        </p>
      </div>
    </div>
  )
}
