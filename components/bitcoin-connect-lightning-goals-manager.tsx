'use client'

import { useState, useEffect } from 'react'
import { WalletConnect } from './wallet-connect'
import { ClientOnly } from './client-only'
import { LightningInvoiceQR } from './lightning-invoice-qr'
import * as bolt11 from 'bolt11'

interface InvoiceData {
  invoice: string
  paymentHash: string
  amount: number
}

export function BitcoinConnectLightningGoalsManager({ 
  userPubkey,
  authData,
  currentWordCount = 0
}: { 
  userPubkey: string
  authData: any
  currentWordCount?: number
}) {
  return (
    <ClientOnly fallback={<div className="p-8 text-center">Loading payment system...</div>}>
      <BitcoinConnectLightningGoalsManagerInner 
        userPubkey={userPubkey} 
        authData={authData} 
        currentWordCount={currentWordCount}
      />
    </ClientOnly>
  )
}

function BitcoinConnectLightningGoalsManagerInner({ 
  userPubkey, 
  authData,
  currentWordCount = 0
}: { 
  userPubkey: string
  authData: any
  currentWordCount?: number
}) {
  const [isConnected, setIsConnected] = useState(false)
  
  const [screen, setScreen] = useState<'setup' | 'invoice' | 'active'>('setup')
  const [goalWords, setGoalWords] = useState(500)
  const [stakeAmount, setStakeAmount] = useState(100)
  const [dailyReward, setDailyReward] = useState(100)
  const [lightningAddress, setLightningAddress] = useState('')
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'connect' | 'invoice' | null>(null)
  const [verificationStarted, setVerificationStarted] = useState(false)
  
  // Start payment verification for QR code payments
  useEffect(() => {
    if (screen === 'invoice' && paymentMethod === 'invoice' && invoiceData && !loading && !verificationStarted) {
      console.log('[Manager] 🔍 Starting payment verification for QR code payment...')
      setVerificationStarted(true)
      startPaymentVerification(invoiceData.paymentHash, invoiceData.invoice)
    }
  }, [screen, paymentMethod, invoiceData, loading, verificationStarted])
  
  // Check connection state and load user data
  useEffect(() => {
    const checkConnection = async () => {
      if (!window.webln) {
        console.log('[Manager] 🔍 No WebLN provider available')
        setIsConnected(false)
        return
      }
      
      try {
        // Try to get wallet info to test if it's actually connected
        const info = await window.webln.getInfo()
        console.log('[Manager] 🔍 WebLN provider is connected:', { 
          hasInfo: !!info, 
          webln: !!window.webln,
          enabled: window.webln.enabled,
          provider: window.webln
        })
        setIsConnected(true)
      } catch (error) {
        console.log('[Manager] 🔍 WebLN provider not connected:', error.message)
        setIsConnected(false)
      }
    }
    
    // Check initial state
    checkConnection()
    
    // Listen for connection events
    const handleConnected = () => {
      console.log('[Manager] ✅ Wallet connected event received')
      setIsConnected(true)
    }
    
    const handleDisconnected = () => {
      console.log('[Manager] ❌ Wallet disconnected event received')
      setIsConnected(false)
    }
    
    // Listen for both Bitcoin Connect events and WebLN changes
    document.addEventListener('bc:connected', handleConnected)
    document.addEventListener('bc:disconnected', handleDisconnected)
    
    // Also listen for window.webln changes
    const interval = setInterval(checkConnection, 2000) // Check every 2 seconds
    
    return () => {
      document.removeEventListener('bc:connected', handleConnected)
      document.removeEventListener('bc:disconnected', handleDisconnected)
      clearInterval(interval)
    }
  }, [])
  
  // Load user's lightning address from profile when wallet connects
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!isConnected) return // Only load when wallet is connected
      
      console.log('[Manager] 🔍 Loading user profile, isConnected:', isConnected)
      
      try {
        // Try to get lightning address from window.webln first
        if (window.webln?.getInfo) {
          const info = await window.webln.getInfo()
          console.log('[Manager] 📊 Wallet info received:', info)
          
          if (info.lightningAddress) {
            setLightningAddress(info.lightningAddress)
            console.log('[Manager] ⚡ Lightning address from wallet:', info.lightningAddress)
            
            // Save to localStorage for future use
            localStorage.setItem(`lightning-address-${userPubkey}`, info.lightningAddress)
            return
          } else {
            console.log('[Manager] ⚠️ No lightning address in wallet info')
          }
        } else {
          console.log('[Manager] ⚠️ window.webln.getInfo not available')
        }
        
        // Fallback: try to get from localStorage
        const savedAddress = localStorage.getItem(`lightning-address-${userPubkey}`)
        if (savedAddress) {
          setLightningAddress(savedAddress)
          console.log('[Manager] ⚡ Lightning address from localStorage:', savedAddress)
        } else {
          console.log('[Manager] ⚠️ No saved lightning address found')
          
          // Additional fallback: try to get from Nostr profile
          try {
            const { SimplePool } = await import('nostr-tools')
            const pool = new SimplePool()
            
            // Query for user's profile event (kind 0)
            const profileEvents = await pool.querySync(['wss://relay.damus.io'], {
              kinds: [0],
              authors: [userPubkey],
              limit: 1
            })
            
            if (profileEvents.length > 0) {
              const profile = JSON.parse(profileEvents[0].content)
              if (profile.lud16 || profile.lightning_address) {
                const address = profile.lud16 || profile.lightning_address
                setLightningAddress(address)
                console.log('[Manager] ⚡ Lightning address from Nostr profile:', address)
                
                // Save to localStorage for future use
                localStorage.setItem(`lightning-address-${userPubkey}`, address)
              }
            }
            
            pool.close()
          } catch (profileError) {
            console.log('[Manager] ⚠️ Could not load from Nostr profile:', profileError)
          }
        }
      } catch (error) {
        console.log('[Manager] ⚠️ Could not load lightning address:', error)
      }
    }
    
    loadUserProfile()
  }, [isConnected, userPubkey])
  
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
    
    // Wallet connection is already handled by UI - this function only runs when connected
    
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
    setVerificationStarted(false) // Reset verification flag
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
      
      // Extract real payment hash from BOLT11 invoice
      let realPaymentHash = data.paymentHash
      try {
        console.log('[Manager] 🔍 Decoding BOLT11 invoice to extract real payment hash...')
        const decoded = bolt11.decode(data.invoice)
        console.log('[Manager] 📋 Decoded invoice:', decoded)
        console.log('[Manager] 📋 Available fields:', Object.keys(decoded))
        
        // Try different possible field names for payment hash
        if (decoded.paymentHash) {
          realPaymentHash = decoded.paymentHash
          console.log('[Manager] ✅ Real payment hash extracted from paymentHash field:', realPaymentHash)
        } else if (decoded.payment_hash) {
          realPaymentHash = decoded.payment_hash
          console.log('[Manager] ✅ Real payment hash extracted from payment_hash field:', realPaymentHash)
        } else if (decoded.tags) {
          // Look for payment hash in tags
          const paymentHashTag = decoded.tags.find(tag => tag.tagName === 'payment_hash' || tag.tagName === 'h')
          if (paymentHashTag && paymentHashTag.data) {
            realPaymentHash = paymentHashTag.data
            console.log('[Manager] ✅ Real payment hash extracted from tags:', realPaymentHash)
          } else {
            console.log('[Manager] ⚠️ No payment hash found in tags, using API response hash')
            console.log('[Manager] 📋 Available tags:', decoded.tags.map(tag => ({ name: tag.tagName, data: tag.data?.toString().substring(0, 16) + '...' })))
          }
        } else {
          console.log('[Manager] ⚠️ No payment hash found in decoded invoice, using API response hash')
        }
      } catch (error) {
        console.log('[Manager] ⚠️ Failed to decode BOLT11 invoice:', error.message)
        console.log('[Manager] ⚠️ Using API response payment hash as fallback')
      }
      
      setInvoiceData({
        invoice: data.invoice,
        paymentHash: realPaymentHash,
        amount: data.amount
      })
      
      setScreen('invoice')
      
      // Note: Payment verification is handled by Bitcoin Connect directly
      // No need to poll backend since we get immediate confirmation
      
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
      console.log('[Manager] Payment confirmed by Bitcoin Connect, proceeding...')
      
      // Since Bitcoin Connect payment was successful, we can immediately proceed
      // No need to verify through backend - the payment is confirmed
      await handlePaymentConfirmed(invoiceData.amount)
      
      setLoading(false)
      setScreen('active')
      
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
    console.log('[Manager] 🔍 Starting payment verification...')
    console.log('[Manager] 📋 Verification details:', {
      paymentHash: paymentHash.substring(0, 16) + '...',
      invoicePreview: invoice.substring(0, 50) + '...',
      paymentMethod: paymentMethod
    })
    
    let attempts = 0
    const maxAttempts = 60 // 3 minutes (60 * 3 seconds)
    
    const interval = setInterval(async () => {
      attempts++
      
      try {
        console.log(`[Manager] 🔍 Checking payment (attempt ${attempts}/${maxAttempts})...`)
        console.log('[Manager] 📋 Sending to API:', {
          paymentHash: paymentHash.substring(0, 16) + '...',
          invoicePreview: invoice.substring(0, 50) + '...'
        })
        
        const response = await fetch('/api/incentive/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentHash,
            invoiceString: invoice
          })
        })
        
        const result = await response.json()
        console.log('[Manager] 📡 API response:', result)
        
        if (result.paid) {
          console.log('[Manager] 🎉 PAYMENT CONFIRMED!')
          clearInterval(interval)
          
          // Credit user's balance
          await handlePaymentConfirmed(result.amount)
          
          setLoading(false)
          setScreen('active')
          
        } else if (attempts >= maxAttempts) {
          console.log('[Manager] ⏰ Verification timeout after', maxAttempts, 'attempts')
          clearInterval(interval)
          setLoading(false)
          alert('Payment verification timed out. Please check your wallet or try again.')
          
        } else {
          console.log('[Manager] ⏳ Payment not confirmed yet, waiting... (attempt', attempts, 'of', maxAttempts, ')')
        }
        
      } catch (error) {
        console.error('[Manager] ❌ Verification error:', error)
        console.error('[Manager] ❌ Error details:', {
          message: error.message,
          attempts: attempts,
          maxAttempts: maxAttempts
        })
        
        if (attempts >= maxAttempts) {
          clearInterval(interval)
          setLoading(false)
          alert('Payment verification failed after maximum attempts. Please try again.')
        }
      }
    }, 3000) // Check every 3 seconds
  }
  
  // ============================================
  // STEP 4: CREDIT BALANCE (Update Nostr Event)
  // ============================================
  // NOTE: Rewards are sent via NWC (Nostr Wallet Connect) backend service
  // This is separate from Bitcoin Connect which is used for user wallet connection
  // Bitcoin Connect = User deposits | NWC = Automated reward payouts
  
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
        baselineWordCount: currentWordCount, // Set baseline to current word count at stake creation
        totalWordCountAtLastUpdate: currentWordCount, // Track current word count for incremental updates
        todayGoalMet: false,
        todayRewardSent: false,
        todayRewardAmount: 0,
        history: [],
        currentStreak: 0,
        totalGoalsMet: 0,
        totalRewardsEarned: 0,
        lastRewardDate: '',
        missedDays: 0,
        lastMissedDate: '',
        stakeCreatedAt: Date.now() // Track when this stake was created
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
  
  // Debug logging
  console.log('[Manager] 🎨 Rendering with state:', { 
    isConnected, 
    screen, 
    loading,
    lightningAddress: lightningAddress ? 'set' : 'not set'
  })
  
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      {/* Show setup screen directly */}
      {screen === 'setup' && (
        <div className="space-y-4">
          {/* Optional wallet connection status */}
          {isConnected && (
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-green-600 font-medium">Wallet Connected</span>
            </div>
          )}
          <h2 className="text-xl font-bold">Create Your Writing Goal</h2>
          
          {/* Optional wallet connection */}
          {!isConnected && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                Optional: Connect a wallet for 1-click payments
              </p>
              <WalletConnect />
            </div>
          )}
          
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
              Where rewards will be sent (auto-filled from your wallet or profile)
            </p>
            {!lightningAddress && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ No Lightning address found in wallet. Please enter one manually.
              </p>
            )}
          </div>
          
          {/* Payment Method Choice Section */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium mb-3 text-center">
              How would you like to pay?
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Option 1: Connect Wallet (Bitcoin Connect) */}
              <button
                onClick={async () => {
                  if (!isConnected) {
                    alert('Please connect your wallet using the button at the top of the page first')
                    return
                  }
                  setPaymentMethod('connect')
                  await createDepositInvoice()
                }}
                disabled={loading || !lightningAddress || dailyReward <= 0 || stakeAmount <= 0}
                className="relative flex flex-col items-center gap-3 p-6 border-2 rounded-lg transition-all
                         border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600
                         bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-green-200"
              >
                <div className="text-4xl">⚡</div>
                <div className="text-center">
                  <p className="font-semibold text-green-700 dark:text-green-300">
                    Connect Wallet
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Pay with 1-click using Bitcoin Connect
                  </p>
                </div>
                {isConnected && (
                  <div className="absolute top-2 right-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                )}
              </button>
              
              {/* Option 2: Generate Invoice (QR Code) */}
              <button
                onClick={async () => {
                  setPaymentMethod('invoice')
                  await createDepositInvoice()
                }}
                disabled={loading || !lightningAddress || dailyReward <= 0 || stakeAmount <= 0}
                className="flex flex-col items-center gap-3 p-6 border-2 rounded-lg transition-all
                         border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600
                         bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-blue-200"
              >
                <div className="text-4xl">📱</div>
                <div className="text-center">
                  <p className="font-semibold text-blue-700 dark:text-blue-300">
                    Generate Invoice
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Get QR code to pay with any wallet
                  </p>
                </div>
              </button>
            </div>
            
            {/* Validation Message */}
            {(!lightningAddress || dailyReward <= 0 || stakeAmount <= 0) && (
              <p className="text-xs text-red-500 text-center mt-3">
                Please fill in all fields with valid values
              </p>
            )}
            
            {/* Info Text */}
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
              Both methods work the same way - choose whichever is most convenient for you
            </p>
          </div>
        </div>
      )}
      
      {/* Show invoice screen if screen is invoice */}
      {screen === 'invoice' && invoiceData && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">Pay Your Stake</h2>
          
          {/* Show different UI based on payment method chosen */}
          {paymentMethod === 'connect' ? (
            // CONNECT WALLET FLOW: Show 1-click payment prominently
            <>
              {/* Primary: 1-Click Payment */}
              <div className="border-2 border-green-200 dark:border-green-800 rounded-lg p-6 bg-green-50 dark:bg-green-900/20">
                <div className="text-center mb-4">
                  <div className="text-5xl mb-3">⚡</div>
                  <h3 className="text-lg font-semibold text-green-700 dark:text-green-300 mb-2">
                    Pay with Connected Wallet
                  </h3>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-3">
                    {invoiceData.amount} sats
                  </p>
                </div>
                
                <button
                  onClick={payInvoice}
                  disabled={loading}
                  className="w-full py-4 bg-green-500 text-white rounded-lg font-medium text-lg
                           hover:bg-green-600 disabled:bg-gray-300 transition-colors"
                >
                  {loading ? 'Processing Payment...' : '⚡ Pay Now'}
                </button>
                
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-3 text-center">
                  Instant 1-click payment from your connected wallet
                </p>
              </div>
              
              {/* Secondary: QR Code Alternative */}
              <details className="border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <summary className="p-4 cursor-pointer text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200">
                  Or scan QR code with another wallet
                </summary>
                <div className="p-4 border-t border-blue-200 dark:border-blue-800">
                  <LightningInvoiceQR 
                    invoice={invoiceData.invoice}
                    amount={invoiceData.amount}
                  />
                </div>
              </details>
            </>
          ) : (
            // GENERATE INVOICE FLOW: Show QR code prominently
            <>
              {/* Primary: QR Code */}
              <div className="border-2 border-blue-200 dark:border-blue-800 rounded-lg p-6 bg-blue-50 dark:bg-blue-900/20">
                <div className="text-center mb-4">
                  <div className="text-5xl mb-3">📱</div>
                  <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-2">
                    Scan QR Code to Pay
                  </h3>
                </div>
                
                <LightningInvoiceQR 
                  invoice={invoiceData.invoice}
                  amount={invoiceData.amount}
                />
                
                {/* Payment verification for QR code payments */}
                {paymentMethod === 'invoice' && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600 dark:border-yellow-400 mx-auto mb-2"></div>
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        ⏳ Waiting for payment confirmation...
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        This usually takes 5-30 seconds
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Secondary: Connect Wallet Alternative */}
              <details className="border-2 border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-900/20">
                <summary className="p-4 cursor-pointer text-sm font-medium text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200">
                  Or connect a wallet for 1-click payment
                </summary>
                <div className="p-4 border-t border-green-200 dark:border-green-800 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Connect a WebLN-compatible wallet to pay instantly
                  </p>
                  <WalletConnect />
                  <button
                    onClick={payInvoice}
                    disabled={loading || !isConnected}
                    className="w-full mt-3 py-3 bg-green-500 text-white rounded-lg font-medium
                             hover:bg-green-600 disabled:bg-gray-300 transition-colors"
                  >
                    {loading ? 'Processing...' : 'Pay with Connected Wallet'}
                  </button>
                </div>
              </details>
            </>
          )}
          
          {/* Payment Status (shown for both methods) */}
          {loading && (
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600 dark:border-yellow-400 mx-auto mb-2"></div>
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                ⏳ Waiting for payment confirmation...
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                This usually takes 5-30 seconds
              </p>
            </div>
          )}
          
          {/* Back Button */}
          <button
            onClick={() => {
              setScreen('setup')
              setPaymentMethod(null)
              setInvoiceData(null)
              setVerificationStarted(false)
            }}
            className="w-full py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            ← Back to setup
          </button>
        </div>
      )}
      
      {/* Show active screen if connected and screen is active */}
      {isConnected && screen === 'active' && (
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
