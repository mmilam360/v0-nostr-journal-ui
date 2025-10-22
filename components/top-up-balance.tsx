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
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)
  const [paymentVerified, setPaymentVerified] = useState(false)

  const checkPaymentStatus = async (invoice: string, paymentHash: string) => {
    try {
      console.log('[TopUp] Checking payment status...')

      const response = await fetch('/api/incentive/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceString: invoice,
          paymentHash: paymentHash
        })
      })

      const data = await response.json()

      console.log('[TopUp] Payment verification response:', data)

      return data.paid === true
    } catch (err: any) {
      console.error('[TopUp] Error checking payment:', err)
      return false
    }
  }

  const startPaymentPolling = async (invoice: string, paymentHash: string, amount: number) => {
    console.log('[TopUp] Starting payment polling...')
    setIsCheckingPayment(true)

    const maxAttempts = 60 // Poll for up to 5 minutes (60 * 5 seconds)
    let attempts = 0

    const pollInterval = setInterval(async () => {
      attempts++
      console.log('[TopUp] Polling attempt', attempts, 'of', maxAttempts)

      const isPaid = await checkPaymentStatus(invoice, paymentHash)

      if (isPaid) {
        console.log('[TopUp] Payment verified!')
        clearInterval(pollInterval)
        setIsCheckingPayment(false)
        setPaymentVerified(true)

        // Process the confirmed payment
        await handlePaymentConfirmed(paymentHash)
      } else if (attempts >= maxAttempts) {
        console.log('[TopUp] Payment polling timed out')
        clearInterval(pollInterval)
        setIsCheckingPayment(false)
        setError('Payment verification timed out. Please contact support if you have paid.')
      }
    }, 5000) // Check every 5 seconds
  }

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

      // Start polling for payment
      startPaymentPolling(data.invoice, data.paymentHash, data.amount)
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
            {paymentVerified ? 'Payment Confirmed!' : isCheckingPayment ? 'Waiting for payment...' : 'Scan QR code or copy invoice to pay'}
          </p>
        </div>

        {/* Payment Status */}
        {paymentVerified ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center mb-4">
            <CheckCircle className="w-16 h-16 mx-auto mb-3 text-green-600 dark:text-green-400" />
            <p className="text-lg font-semibold text-green-900 dark:text-green-100 mb-1">
              Payment Verified!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Your balance has been updated
            </p>
          </div>
        ) : (
          <>
            {/* QR Code */}
            {qrCodeDataUrl && (
              <div className="flex justify-center mb-4">
                <img src={qrCodeDataUrl} alt="Payment QR Code" className="w-64 h-64 rounded-lg" />
              </div>
            )}

            {/* Checking Status */}
            {isCheckingPayment && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-sm text-blue-700 dark:text-blue-300 mb-4 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking for payment...
              </div>
            )}

            {/* Copy Invoice */}
            <div className="space-y-3">
              <Button
                onClick={handleCopyInvoice}
                variant="outline"
                className="w-full"
                disabled={paymentVerified}
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
                  setIsCheckingPayment(false)
                  setPaymentVerified(false)
                }}
                variant="outline"
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </>
        )}
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
  const [isVerifying, setIsVerifying] = useState(false)

  const handlePayWithWebLN = async () => {
    setIsPaying(true)
    setError('')

    try {
      // Create invoice
      console.log('[TopUp] Creating invoice for Bitcoin Connect payment...')
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

      console.log('[TopUp] Invoice created, requesting WebLN payment...')

      // Pay with WebLN
      if (window.webln) {
        await window.webln.enable()
        const result = await window.webln.sendPayment(data.invoice)

        console.log('[TopUp] WebLN payment successful:', result)

        // CRITICAL: Verify the payment on the backend before confirming
        setIsPaying(false)
        setIsVerifying(true)
        console.log('[TopUp] Verifying payment on backend...')

        const verifyResponse = await fetch('/api/incentive/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceString: data.invoice,
            paymentHash: data.paymentHash
          })
        })

        const verifyData = await verifyResponse.json()

        console.log('[TopUp] Verification response:', verifyData)
        console.log('[TopUp] Success:', verifyData.success)
        console.log('[TopUp] Paid:', verifyData.paid)
        console.log('[TopUp] Full response:', JSON.stringify(verifyData, null, 2))

        if (!verifyData.success) {
          throw new Error(`Verification failed: ${verifyData.error || 'Unknown error'}`)
        }

        if (!verifyData.paid) {
          throw new Error(`Payment not confirmed yet. Status: ${verifyData.state || 'unknown'}. Please wait a moment and try again.`)
        }

        console.log('[TopUp] Payment verified on backend!')
        onPaymentConfirmed(data.paymentHash)
      } else {
        throw new Error('WebLN not available')
      }
    } catch (err: any) {
      console.error('[TopUp] Payment error:', err)
      setError(err.message || 'Payment failed')
      setIsVerifying(false)
    } finally {
      setIsPaying(false)
      setIsVerifying(false)
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
          disabled={isPaying || isVerifying}
          className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying Payment...
            </>
          ) : isPaying ? (
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
          disabled={isPaying || isVerifying}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
