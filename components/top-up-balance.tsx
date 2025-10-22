'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Zap, Plus, Loader2 } from 'lucide-react'
import { LightningInvoiceQR } from './lightning-invoice-qr'

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

  const handleCreateTopUpInvoice = async () => {
    const amount = parseInt(topUpAmount)

    if (!amount || amount < 100) {
      setError('Minimum top-up is 100 sats')
      return
    }

    if (amount > 1000000) {
      setError('Maximum top-up is 1,000,000 sats')
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

      console.log('[TopUp] ✅ Invoice created:', data.invoice.substring(0, 50))
      setInvoiceData({
        invoice: data.invoice,
        paymentHash: data.paymentHash,
        amount: data.amount
      })
    } catch (err: any) {
      console.error('[TopUp] ❌ Error creating invoice:', err)
      setError(err.message || 'Failed to create invoice')
    } finally {
      setIsCreatingInvoice(false)
    }
  }

  const handlePaymentConfirmed = async (paymentHash: string) => {
    try {
      console.log('[TopUp] Payment confirmed, adding to stake...')

      // Add to stake using lightning-goals library
      const { addToStake } = await import('@/lib/lightning-goals')
      await addToStake(userPubkey, invoiceData!.amount, paymentHash, authData)

      console.log('[TopUp] ✅ Stake topped up successfully')

      // Reset state
      setInvoiceData(null)
      setTopUpAmount('1000')

      // Notify parent to refresh
      onTopUpComplete()
    } catch (err: any) {
      console.error('[TopUp] ❌ Error confirming top-up:', err)
      setError(err.message || 'Failed to process top-up')
    }
  }

  if (invoiceData) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Top-Up Payment
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Pay this invoice to add {invoiceData.amount} sats to your balance
          </p>
        </div>

        <LightningInvoiceQR
          invoice={invoiceData.invoice}
          amountSats={invoiceData.amount}
          paymentHash={invoiceData.paymentHash}
          onPaymentConfirmed={handlePaymentConfirmed}
        />

        <Button
          onClick={() => {
            setInvoiceData(null)
            setError('')
          }}
          variant="outline"
          className="w-full mt-4"
        >
          Cancel
        </Button>
      </div>
    )
  }

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
            min="100"
            max="1000000"
            step="100"
            value={topUpAmount}
            onChange={(e) => {
              setTopUpAmount(e.target.value)
              setError('')
            }}
            placeholder="Enter amount"
            className="text-lg"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Min: 100 sats • Max: 1,000,000 sats
          </p>
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
              Generate Top-Up Invoice
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
