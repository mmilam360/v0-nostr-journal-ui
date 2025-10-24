'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check } from 'lucide-react'

interface LightningInvoiceQRProps {
  invoice: string
  amount: number
}

export function LightningInvoiceQR({ 
  invoice,
  amount
}: LightningInvoiceQRProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyInvoice = async () => {
    try {
      await navigator.clipboard.writeText(invoice)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy invoice:', err)
    }
  }

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
      
      {/* Copy Invoice String Button */}
      <button
        onClick={handleCopyInvoice}
        className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy Invoice String
          </>
        )}
      </button>
    </div>
  )
}
