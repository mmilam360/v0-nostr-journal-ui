'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'

interface LightningInvoiceQRProps {
  invoice: string
  amount: number
}

export function LightningInvoiceQR({ 
  invoice,
  amount
}: LightningInvoiceQRProps) {
  const [copied, setCopied] = useState(false)
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(invoice)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[QR] Failed to copy:', err)
    }
  }
  
  return (
    <div className="space-y-4">
      {/* QR Code */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700">
        <QRCodeSVG
          value={invoice}
          size={256}
          level="M"
          includeMargin={true}
          className="mx-auto"
        />
      </div>
      
      {/* Amount */}
      <div className="text-center py-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
        <p className="text-sm text-orange-700 dark:text-orange-300 uppercase tracking-wide">
          Amount
        </p>
        <p className="text-4xl font-bold text-orange-600 dark:text-orange-400 mt-1">
          {amount} sats
        </p>
      </div>
      
      {/* Invoice String */}
      <details className="bg-gray-50 dark:bg-gray-800 rounded-lg">
        <summary className="px-3 py-2 cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
          Show Invoice String
        </summary>
        <div className="px-3 pb-3">
          <p className="text-xs font-mono break-all text-gray-700 dark:text-gray-300">
            {invoice}
          </p>
        </div>
      </details>
      
      {/* Copy Button */}
      <button
        onClick={copyToClipboard}
        className={`w-full py-3 rounded-lg font-medium transition-all ${
          copied 
            ? 'bg-green-500 text-white' 
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {copied ? '✓ Copied to Clipboard!' : '📋 Copy Invoice'}
      </button>
      
      {/* Instructions */}
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-4">
        <p className="font-medium text-center">How to Pay:</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Open any Lightning wallet on your phone</li>
          <li>Scan this QR code with your wallet</li>
          <li>Confirm the payment</li>
          <li>Wait for confirmation (5-30 seconds)</li>
        </ol>
        <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-3">
          Works with: Phoenix, Wallet of Satoshi, Breez, Zeus, BlueWallet, etc.
        </p>
      </div>
    </div>
  )
}
