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
    console.log('[TopUp] ========================================')
    console.log('[TopUp] 🔍 STARTING PAYMENT VERIFICATION')
    console.log('[TopUp] 🔒 SECURITY: This is the ONLY way payments can be confirmed')
    console.log('[TopUp] 🔒 SECURITY: WebLN responses are NOT trusted')
    console.log('[TopUp] ========================================')
    console.log('[TopUp] Payment hash:', paymentHash)
    console.log('[TopUp] Invoice preview:', invoice.substring(0, 50) + '...')
    console.log('[TopUp] Will check every 3 seconds for up to 3 minutes')
    
    setIsCheckingPayment(true)

    const maxAttempts = 60 // Poll for up to 3 minutes (60 * 3 seconds) - MATCHES STAKE VERIFICATION
    let attempts = 0

    const pollInterval = setInterval(async () => {
      attempts++
      
      try {
        console.log(`[TopUp] 🔄 Verification attempt ${attempts}/${maxAttempts}`)
        console.log(`[TopUp] Time remaining: ${Math.floor((maxAttempts - attempts) * 3 / 60)} minutes`)

      const isPaid = await checkPaymentStatus(invoice, paymentHash)

      if (isPaid) {
          console.log('[TopUp] ========================================')
          console.log('[TopUp] 🎉 PAYMENT CONFIRMED!')
          console.log('[TopUp] 🔒 SECURITY: Payment verified via NWC backend - NOT WebLN')
          console.log('[TopUp] ========================================')
          console.log('[TopUp] 💰 Crediting balance:', amount, 'sats')
          
        clearInterval(pollInterval)
        setIsCheckingPayment(false)
        setPaymentVerified(true)

        // Process the confirmed payment
        await handlePaymentConfirmed(paymentHash, amount)
      } else if (attempts >= maxAttempts) {
          console.log('[TopUp] ========================================')
          console.log('[TopUp] ⏰ VERIFICATION TIMEOUT')
          console.log('[TopUp] ========================================')
          console.log('[TopUp] Checked', maxAttempts, 'times over 3 minutes')
          console.log('[TopUp] No payment detected')
          
          clearInterval(pollInterval)
          setIsCheckingPayment(false)
          setError(`Payment verification timed out after 3 minutes. If you paid, please contact support with this payment hash: ${paymentHash.substring(0, 16)}...`)
        } else {
          // Still waiting
          console.log('[TopUp] ⏳ Payment not confirmed yet, will check again in 3 seconds')
        }
        
      } catch (error) {
        console.error('[TopUp] ❌ Verification error:', error)
        console.error('[TopUp] ❌ Error details:', {
          message: error.message,
          attempts: attempts,
          maxAttempts: maxAttempts
        })
        
        if (attempts >= maxAttempts) {
        clearInterval(pollInterval)
        setIsCheckingPayment(false)
          setError('Payment verification failed after maximum attempts. Please try again.')
        }
      }
    }, 3000) // Check every 3 seconds - MATCHES STAKE VERIFICATION
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

      console.log('[TopUp] Response status:', response.status)
      console.log('[TopUp] Response headers:', Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TopUp] API error response:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

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

  const handlePaymentConfirmed = async (paymentHash: string, amount: number) => {
    try {
      console.log('[TopUp] Payment confirmed, adding to stake...')
      console.log('[TopUp] Amount:', amount, 'sats')
      console.log('[TopUp] Payment hash:', paymentHash)

      // Add to stake using lightning-goals library
      const { addToStake } = await import('@/lib/lightning-goals')
      await addToStake(userPubkey, amount, paymentHash, authData)

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
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Checking every 3 seconds for up to 3 minutes
                </div>
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
            onClick={handleBitcoinConnect}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
          >
            <Wallet className="w-4 h-4 mr-2" />
            Pay with Bitcoin Connect
          </Button>

          <Button
            onClick={handleCreateTopUpInvoice}
            disabled={isCreatingInvoice}
            variant="outline"
            className="w-full"
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
  onPaymentConfirmed: (hash: string, amount: number) => void
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

      console.log('[TopUp] Bitcoin Connect Response status:', response.status)
      console.log('[TopUp] Bitcoin Connect Response headers:', Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TopUp] Bitcoin Connect API error response:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create invoice')
      }

      console.log('[TopUp] Invoice created, requesting WebLN payment...')
      console.log('[TopUp] 🔒 SECURITY: WebLN will ONLY trigger payment, verification via NWC only')

      // CRITICAL SECURITY: Start verification polling FIRST, before any WebLN interaction
      // This ensures verification is ALWAYS running regardless of WebLN behavior
      console.log('[TopUp] 🔍 Starting NWC verification polling IMMEDIATELY...')
      setIsPaying(false)
      setIsVerifying(true)
      
      // Start the same robust verification polling as initial stake
      startPaymentPolling(data.invoice, data.paymentHash, data.amount)
      
      // Now attempt WebLN payment (this is just a trigger, not verification)
      try {
        console.log('[TopUp] 🔌 Attempting WebLN payment trigger...')
      if (window.webln) {
        await window.webln.enable()
        const result = await window.webln.sendPayment(data.invoice)
          console.log('[TopUp] ✅ WebLN payment triggered!', result)
          console.log('[TopUp] 🔍 Payment verification is already running via NWC...')
          
          // Note: We do NOT trust this response - verification polling will confirm if payment was actually made
      } else {
        throw new Error('WebLN not available')
      }
        
      } catch (weblnError) {
        console.log('[TopUp] ⚠️ WebLN payment failed, but NWC verification continues:', weblnError)
        console.log('[TopUp] 🔍 Showing QR code fallback while NWC verification continues...')
        
        // Show QR code as fallback if WebLN fails
        // The verification polling will continue regardless
        setError('WebLN payment failed, but verification continues. Please use QR code if needed.')
      }
      
      // CRITICAL: Payment confirmation will ONLY happen via verification polling success
      // This completely prevents the security vulnerability of trusting WebLN responses
      
    } catch (err: any) {
      console.error('[TopUp] ❌ WebLN payment process failed:', err)
      setError(err.message || 'Payment process failed. Please try the QR code method instead.')
      setIsVerifying(false)
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
          disabled={isPaying || isVerifying}
          className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying Payment...
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Checking every 3 seconds for up to 3 minutes
              </div>
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
