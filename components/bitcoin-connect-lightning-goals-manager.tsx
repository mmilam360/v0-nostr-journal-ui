'use client'

import { useState, useEffect } from 'react'
import { WalletConnect } from './wallet-connect'
import { ClientOnly } from './client-only'

interface InvoiceData {
  invoice: string
  paymentHash: string
  amount: number
}

export function BitcoinConnectLightningGoalsManager({ 
  userPubkey, 
  authData 
}: { 
  userPubkey: string
  authData: any 
}) {
  return (
    <ClientOnly fallback={<div className="p-8 text-center">Loading payment system...</div>}>
      <BitcoinConnectLightningGoalsManagerInner userPubkey={userPubkey} authData={authData} />
    </ClientOnly>
  )
}

function BitcoinConnectLightningGoalsManagerInner({ 
  userPubkey, 
  authData 
}: { 
  userPubkey: string
  authData: any 
}) {
  const [isConnected, setIsConnected] = useState(false)
  
  const [screen, setScreen] = useState<'setup' | 'invoice' | 'active'>('setup')
  const [goalWords, setGoalWords] = useState(500)
  const [stakeAmount, setStakeAmount] = useState(100)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Check connection state
  useEffect(() => {
    if (typeof window !== 'undefined' && window.webln) {
      const checkConnection = () => {
        setIsConnected(window.webln?.enabled || false)
      }
      
      checkConnection()
      
      // Listen for connection events
      const handleConnected = () => setIsConnected(true)
      const handleDisconnected = () => setIsConnected(false)
      
      document.addEventListener('bc:connected', handleConnected)
      document.addEventListener('bc:disconnected', handleDisconnected)
      
      return () => {
        document.removeEventListener('bc:connected', handleConnected)
        document.removeEventListener('bc:disconnected', handleDisconnected)
      }
    }
  }, [])
  
  // ============================================
  // STEP 1: CREATE DEPOSIT INVOICE (Backend)
  // ============================================
  
  async function createDepositInvoice() {
    if (!isConnected || !provider) {
      alert('Please connect your wallet first')
      return
    }
    
    setLoading(true)
    console.log('[Manager] Creating deposit invoice...')
    
    try {
      // Call backend to create invoice via YOUR NWC
      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: stakeAmount,
          timestamp: Date.now()
        })
      })
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create invoice')
      }
      
      console.log('[Manager] ✅ Invoice created:', {
        invoice: data.invoice.substring(0, 50) + '...',
        paymentHash: data.paymentHash,
        amount: data.amount
      })
      
      setInvoiceData({
        invoice: data.invoice,
        paymentHash: data.paymentHash,
        amount: data.amount
      })
      
      setScreen('invoice')
      
      // Start checking for payment
      startPaymentVerification(data.paymentHash, data.invoice)
      
    } catch (error) {
      console.error('[Manager] ❌ Error:', error)
      alert('Failed to create invoice: ' + error.message)
    } finally {
      setLoading(false)
    }
  }
  
  // ============================================
  // STEP 2: USER PAYS INVOICE (Bitcoin Connect)
  // ============================================
  
  async function payInvoice() {
    if (!invoiceData || !window.webln) return
    
    setLoading(true)
    console.log('[Manager] 💸 Paying invoice...')
    
    try {
      // Use Bitcoin Connect to send payment from user's wallet
      const paymentResult = await window.webln.sendPayment(invoiceData.invoice)
      
      console.log('[Manager] ✅ Payment sent!', paymentResult)
      console.log('[Manager] Waiting for confirmation...')
      
      // Payment verification will pick this up automatically
      
    } catch (error) {
      console.error('[Manager] ❌ Payment failed:', error)
      alert('Payment failed: ' + error.message)
      setLoading(false)
    }
  }
  
  // ============================================
  // STEP 3: VERIFY PAYMENT (Backend Polling)
  // ============================================
  
  function startPaymentVerification(paymentHash: string, invoice: string) {
    console.log('[Manager] Starting payment verification...')
    
    let attempts = 0
    const maxAttempts = 60 // 3 minutes (60 * 3 seconds)
    
    const interval = setInterval(async () => {
      attempts++
      
      try {
        console.log(`[Manager] Checking payment (attempt ${attempts}/${maxAttempts})...`)
        
        const response = await fetch('/api/incentive/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentHash,
            invoiceString: invoice
          })
        })
        
        const result = await response.json()
        
        if (result.paid) {
          console.log('[Manager] 🎉 PAYMENT CONFIRMED!')
          clearInterval(interval)
          
          // Credit user's balance
          await handlePaymentConfirmed(result.amount)
          
          setLoading(false)
          setScreen('active')
          
        } else if (attempts >= maxAttempts) {
          console.log('[Manager] ⏰ Verification timeout')
          clearInterval(interval)
          alert('Payment verification timed out. Please contact support if you paid.')
          setLoading(false)
        }
        
      } catch (error) {
        console.error('[Manager] ❌ Verification error:', error)
        
        if (attempts >= maxAttempts) {
          clearInterval(interval)
          setLoading(false)
        }
      }
    }, 3000) // Check every 3 seconds
  }
  
  // ============================================
  // STEP 4: CREDIT BALANCE (Update Nostr Event)
  // ============================================
  
  async function handlePaymentConfirmed(amount: number) {
    console.log('[Manager] 💰 Crediting balance:', amount, 'sats')
    
    try {
      // Update Lightning Goals event with new balance
      const { updateLightningGoals } = await import('@/lib/lightning-goals')
      
      await updateLightningGoals(userPubkey, authData, {
        balance: amount,
        goal: goalWords,
        status: 'active',
        stakePerWord: Math.floor(amount / goalWords)
      })
      
      console.log('[Manager] ✅ Balance credited')
      
    } catch (error) {
      console.error('[Manager] ❌ Failed to credit balance:', error)
      alert('Payment received but failed to update balance. Please refresh.')
    }
  }
  
  // ============================================
  // RENDER
  // ============================================
  
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      {/* Wallet Connection */}
      <div className="mb-6">
        <WalletConnect />
      </div>
      
      {/* Setup Screen */}
      {screen === 'setup' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Create Your Writing Goal</h2>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Daily Word Goal
            </label>
            <input
              type="number"
              value={goalWords}
              onChange={(e) => setGoalWords(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded"
              min="100"
              step="50"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Stake Amount (sats)
            </label>
            <input
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded"
              min="10"
              step="10"
            />
            <p className="text-xs text-gray-500 mt-1">
              ≈ {(stakeAmount / goalWords).toFixed(2)} sats per word
            </p>
          </div>
          
          <button
            onClick={createDepositInvoice}
            disabled={!isConnected || loading}
            className="w-full py-3 bg-orange-500 text-white rounded font-medium
                     hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Invoice...' : 'Create Stake Invoice'}
          </button>
        </div>
      )}
      
      {/* Invoice Screen */}
      {screen === 'invoice' && invoiceData && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Pay Stake Invoice</h2>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-2">Amount:</p>
            <p className="text-2xl font-bold">{invoiceData.amount} sats</p>
          </div>
          
          <div className="bg-gray-50 p-3 rounded break-all text-xs">
            {invoiceData.invoice}
          </div>
          
          <button
            onClick={payInvoice}
            disabled={loading}
            className="w-full py-3 bg-green-500 text-white rounded font-medium
                     hover:bg-green-600 disabled:bg-gray-300"
          >
            {loading ? 'Processing Payment...' : 'Pay with Connected Wallet'}
          </button>
          
          <p className="text-xs text-center text-gray-500">
            Or copy the invoice and pay from any Lightning wallet
          </p>
        </div>
      )}
      
      {/* Active Screen */}
      {screen === 'active' && (
        <div className="text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-xl font-bold">Stake Active!</h2>
          <p className="text-gray-600">
            Write {goalWords} words today to earn your reward
          </p>
        </div>
      )}
    </div>
  )
}
