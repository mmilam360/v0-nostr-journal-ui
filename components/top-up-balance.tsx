'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Zap, Plus, Loader2, Copy, CheckCircle, Wallet } from 'lucide-react'
import { ClientOnly } from './client-only'
import QRCode from 'qrcode'

interface TopUpBalanceProps {
  userPubkey: string
  authData: any
  currentBalance: number
  onTopUpComplete: () => void
}

export function TopUpBalance({ userPubkey, authData, currentBalance, onTopUpComplete }: TopUpBalanceProps) {
  const [topUpAmount, setTopUpAmount] = useState<string>('1000')
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)
  const [invoiceData, setInvoiceData] = useState<{ invoice: string; paymentHash: string; amount: number } | null>(null)
  const [error, setError] = useState<string>('')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'invoice' | 'bitcoin-connect' | null>(null)

  const handleCreateTopUpInvoice = async () => {
    const amount = parseInt(topUpAmount)

    if (!amount || amount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setIsCreatingInvoice(true)
    setError('')

    try {
      console.log('[TopUp] Creating top-up invoice for', amount, 'sats')

      const response = await fetch('/api/incentive/create-topup-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: amount,
          timestamp: Date.now()
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create invoice')
      }

      console.log('[TopUp] Invoice created:', data.invoice.substring(0, 50))

      // Generate QR code
      const qrUrl = await QRCode.toDataURL(data.invoice.toUpperCase(), {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })

      setQrCodeDataUrl(qrUrl)
      setInvoiceData({
        invoice: data.invoice,
        paymentHash: data.paymentHash,
        amount: data.amount
      })
      setPaymentMethod('invoice')
    } catch (err: any) {
      console.error('[TopUp] Error creating invoice:', err)
      setError(err.message || 'Failed to create invoice')
    } finally {
      setIsCreatingInvoice(false)
    }
  }

  const handleBitcoinConnect = () => {
    const amount = parseInt(topUpAmount)

    if (!amount || amount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setPaymentMethod('bitcoin-connect')
  }

  const handleCopyInvoice = async () => {
    if (!invoiceData) return

    try {
      await navigator.clipboard.writeText(invoiceData.invoice)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handlePaymentConfirmed = async (paymentHash: string) => {
    try {
      console.log('[TopUp] Payment confirmed, adding to stake...')

      // Add to stake using lightning-goals library
      const { addToStake } = await import('@/lib/lightning-goals')
      await addToStake(userPubkey, invoiceData!.amount, paymentHash, authData)

      console.log('[TopUp] Stake topped up successfully')

      // Reset state
      setInvoiceData(null)
      setTopUpAmount('1000')
      setPaymentMethod(null)
      setQrCodeDataUrl('')

      // Notify parent to refresh
      onTopUpComplete()
    } catch (err: any) {
      console.error('[TopUp] Error confirming top-up:', err)
      setError(err.message || 'Failed to process top-up')
    }
  }

  // Show QR code payment screen
  if (paymentMethod === 'invoice' && invoiceData) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Top-Up Payment
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Scan QR code or copy invoice to pay
          </p>
        </div>

        {/* QR Code */}
        {qrCodeDataUrl && (
          <div className="flex justify-center mb-4">
            <img src={qrCodeDataUrl} alt="Payment QR Code" className="w-64 h-64 rounded-lg" />
          </div>
        )}

        {/* Copy Invoice */}
        <div className="space-y-3">
          <Button
            onClick={handleCopyInvoice}
            variant="outline"
            className="w-full"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Invoice
              </>
            )}
          </Button>

          <Button
            onClick={() => {
              setInvoiceData(null)
              setPaymentMethod(null)
              setQrCodeDataUrl('')
              setError('')
            }}
            variant="outline"
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  // Show Bitcoin Connect payment screen
  if (paymentMethod === 'bitcoin-connect') {
    return (
      <ClientOnly fallback={<div className="p-6 text-center">Loading payment...</div>}>
        <BitcoinConnectTopUp
          amount={parseInt(topUpAmount)}
          userPubkey={userPubkey}
          authData={authData}
          onPaymentConfirmed={handlePaymentConfirmed}
          onCancel={() => setPaymentMethod(null)}
        />
      </ClientOnly>
    )
  }

  // Show amount input and payment method selection
  return (
    <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Top Up Balance
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Amount to add (sats)
          </label>
          <Input
            type="number"
            min="1"
            step="100"
            value={topUpAmount}
            onChange={(e) => {
              setTopUpAmount(e.target.value)
              setError('')
            }}
            placeholder="Enter amount"
            className="text-lg"
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-400">Current Balance:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{currentBalance} sats</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">New Balance:</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {currentBalance + (parseInt(topUpAmount) || 0)} sats
            </span>
          </div>
        </div>

        {/* Payment Method Buttons */}
        <div className="space-y-2">
          <Button
            onClick={handleCreateTopUpInvoice}
            disabled={isCreatingInvoice}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            {isCreatingInvoice ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Invoice...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Generate Invoice
              </>
            )}
          </Button>

          <Button
            onClick={handleBitcoinConnect}
            variant="outline"
            className="w-full"
          >
            <Wallet className="w-4 h-4 mr-2" />
            Pay with Bitcoin Connect
          </Button>
        </div>
      </div>
    </div>
  )
}

// Bitcoin Connect payment component
function BitcoinConnectTopUp({
  amount,
  userPubkey,
  authData,
  onPaymentConfirmed,
  onCancel
}: {
  amount: number
  userPubkey: string
  authData: any
  onPaymentConfirmed: (hash: string) => void
  onCancel: () => void
}) {
  const [isPaying, setIsPaying] = useState(false)
  const [error, setError] = useState('')

  const handlePayWithWebLN = async () => {
    setIsPaying(true)
    setError('')

    try {
      // Create invoice
      const response = await fetch('/api/incentive/create-topup-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: amount,
          timestamp: Date.now()
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create invoice')
      }

      // Pay with WebLN
      if (window.webln) {
        await window.webln.enable()
        const result = await window.webln.sendPayment(data.invoice)

        console.log('[TopUp] Payment successful:', result)
        onPaymentConfirmed(data.paymentHash)
      } else {
        throw new Error('WebLN not available')
      }
    } catch (err: any) {
      console.error('[TopUp] Payment error:', err)
      setError(err.message || 'Payment failed')
    } finally {
      setIsPaying(false)
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Bitcoin Connect Payment
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Top up {amount} sats
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={handlePayWithWebLN}
          disabled={isPaying}
          className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
        >
          {isPaying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing Payment...
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4 mr-2" />
              Pay with Connected Wallet
            </>
          )}
        </Button>

        <Button
          onClick={onCancel}
          variant="outline"
          className="w-full"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
