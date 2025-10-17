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
  const [dailyReward, setDailyReward] = useState(100)
  const [lightningAddress, setLightningAddress] = useState('')
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Check connection state and load user data
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
  
  // Load user's lightning address from profile
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        // Try to get lightning address from window.webln first
        if (window.webln?.getInfo) {
          const info = await window.webln.getInfo()
          if (info.lightningAddress) {
            setLightningAddress(info.lightningAddress)
            console.log('[Manager] ⚡ Lightning address from wallet:', info.lightningAddress)
            return
          }
        }
        
        // Fallback: try to get from localStorage
        const savedAddress = localStorage.getItem(`lightning-address-${userPubkey}`)
        if (savedAddress) {
          setLightningAddress(savedAddress)
          console.log('[Manager] ⚡ Lightning address from localStorage:', savedAddress)
        }
      } catch (error) {
        console.log('[Manager] ⚠️ Could not load lightning address:', error)
      }
    }
    
    loadUserProfile()
  }, [userPubkey])
  
  // ============================================
  // STEP 1: CREATE DEPOSIT INVOICE (Backend)
  // ============================================
  
  async function createDepositInvoice() {
    console.log('[Manager] 🔘 Create Stake Invoice button clicked')
    console.log('[Manager] 🔍 Current state:', { 
      isConnected, 
      goalWords, 
      stakeAmount, 
      dailyReward, 
      lightningAddress,
      loading 
    })
    
    if (!isConnected) {
      console.log('[Manager] ❌ Wallet not connected')
      alert('Please connect your wallet first')
      return
    }
    
    // Validate required fields
    if (!lightningAddress || !lightningAddress.includes('@')) {
      console.log('[Manager] ❌ Invalid lightning address:', lightningAddress)
      alert('Please enter a valid Lightning address (format: user@domain.com)')
      return
    }
    
    if (dailyReward <= 0) {
      console.log('[Manager] ❌ Invalid daily reward:', dailyReward)
      alert('Daily reward must be greater than 0')
      return
    }
    
    if (stakeAmount <= 0) {
      console.log('[Manager] ❌ Invalid stake amount:', stakeAmount)
      alert('Stake amount must be greater than 0')
      return
    }
    
    console.log('[Manager] ✅ All validations passed, creating invoice...')
    setLoading(true)
    console.log('[Manager] Creating deposit invoice...')
    console.log('[Manager] Settings:', { goalWords, stakeAmount, dailyReward, lightningAddress })
    
    try {
      // Call backend to create invoice via YOUR NWC
      console.log('[Manager] 📡 Calling API with data:', {
        userPubkey,
        amountSats: stakeAmount,
        dailyReward: dailyReward,
        lightningAddress: lightningAddress,
        timestamp: Date.now()
      })
      
      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: stakeAmount,
          dailyReward: dailyReward,
          lightningAddress: lightningAddress,
          timestamp: Date.now()
        })
      })
      
      console.log('[Manager] 📡 API response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.log('[Manager] ❌ API error response:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }
      
      const data = await response.json()
      console.log('[Manager] 📡 API response data:', data)
      
      if (!data.success) {
        console.log('[Manager] ❌ API returned success: false:', data.error)
        throw new Error(data.error || 'Failed to create invoice')
      }
      
      console.log('[Manager] ✅ Invoice created successfully:', {
        invoice: data.invoice?.substring(0, 50) + '...',
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
      console.error('[Manager] ❌ Failed to create invoice:', error)
      console.error('[Manager] ❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      alert('Failed to create invoice: ' + error.message)
    } finally {
      console.log('[Manager] 🔄 Setting loading to false')
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
      // Update Lightning Goals event with new balance and settings
      const { updateLightningGoals } = await import('@/lib/lightning-goals')
      
      await updateLightningGoals(userPubkey, {
        dailyWordGoal: goalWords,
        dailyReward: dailyReward,
        currentBalance: amount,
        initialStake: amount,
        totalDeposited: amount,
        status: 'active',
        lightningAddress: lightningAddress,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        todayDate: new Date().toISOString().split('T')[0],
        todayWords: 0,
        todayGoalMet: false,
        todayRewardSent: false,
        todayRewardAmount: 0,
        history: [],
        currentStreak: 0,
        totalGoalsMet: 0,
        totalRewardsEarned: 0,
        lastRewardDate: '',
        missedDays: 0,
        lastMissedDate: ''
      }, authData)
      
      console.log('[Manager] ✅ Balance credited with settings:', {
        goalWords,
        dailyReward,
        lightningAddress
      })
      
      setScreen('active')
      
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
            <p className="text-xs text-gray-500 mt-1">
              How many words you need to write each day
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Daily Reward (sats)
            </label>
            <input
              type="number"
              value={dailyReward}
              onChange={(e) => setDailyReward(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded"
              min="1"
              step="1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Reward you'll earn when you reach your daily goal
            </p>
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
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Lightning Address
            </label>
            <input
              type="text"
              value={lightningAddress}
              onChange={(e) => setLightningAddress(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="your@lightning.address"
            />
            <p className="text-xs text-gray-500 mt-1">
              Where rewards will be sent (auto-filled from your profile)
            </p>
          </div>
          
          <button
            onClick={createDepositInvoice}
            disabled={!isConnected || loading || !lightningAddress || dailyReward <= 0 || stakeAmount <= 0}
            className="w-full py-3 bg-orange-500 text-white rounded font-medium
                     hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Invoice...' : 'Create Stake Invoice'}
          </button>
          
          {!isConnected && (
            <p className="text-xs text-red-500 text-center">
              Please connect your wallet first
            </p>
          )}
          
          {isConnected && (!lightningAddress || dailyReward <= 0 || stakeAmount <= 0) && (
            <p className="text-xs text-red-500 text-center">
              Please fill in all fields with valid values
            </p>
          )}
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
