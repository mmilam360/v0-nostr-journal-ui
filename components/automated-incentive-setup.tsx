'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, Wallet, CheckCircle, AlertCircle, Clock, Copy, QrCode, RefreshCw } from 'lucide-react'
import { IncentiveSuccessMessage } from './incentive-success-message'
import QRCode from 'qrcode'

interface AutomatedIncentiveSetupProps {
  userPubkey: string
  authData: any
  onPaymentSuccess?: () => void
}

export function AutomatedIncentiveSetup({ userPubkey, authData, onPaymentSuccess }: AutomatedIncentiveSetupProps) {
  const [settings, setSettings] = useState({
    dailyWordGoal: 500,
    dailyRewardSats: 500,
    lightningAddress: '',
    stakeAmount: 1000 // Default 1k sats stake, no minimum
  })
  const [hasSetup, setHasSetup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [depositInvoice, setDepositInvoice] = useState('')
  const [invoicePaid, setInvoicePaid] = useState(false)
  const [balance, setBalance] = useState(0)
  const [streak, setStreak] = useState(0)
  const [showQRCode, setShowQRCode] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState(0)
  const [showQuitSuccess, setShowQuitSuccess] = useState(false)
  const [showQuitError, setShowQuitError] = useState(false)
  const [showInvoiceError, setShowInvoiceError] = useState(false)
  const [showPaymentError, setShowPaymentError] = useState(false)
  const [showCopySuccess, setShowCopySuccess] = useState(false)
  const [showCopyError, setShowCopyError] = useState(false)
  const [paymentCheckInterval, setPaymentCheckInterval] = useState<NodeJS.Timeout | null>(null)
  const [originalSettings, setOriginalSettings] = useState<any>(null)

  // Check if settings have changed from original
  const settingsHaveChanged = () => {
    if (!originalSettings || !depositInvoice) return false
    
    return (
      settings.dailyWordGoal !== originalSettings.dailyWordGoal ||
      settings.dailyRewardSats !== originalSettings.dailyRewardSats ||
      settings.stakeAmount !== originalSettings.stakeAmount ||
      settings.lightningAddress !== originalSettings.lightningAddress
    )
  }

  useEffect(() => {
    loadExistingSettings()
  }, [])

  // Generate QR code when invoice is created
  useEffect(() => {
    if (depositInvoice) {
      QRCode.toDataURL(depositInvoice, {
        width: 160,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }).then(setQrCodeDataUrl).catch(console.error)
    }
  }, [depositInvoice])

  // Auto-check payment status every 1 second when invoice is created
  useEffect(() => {
    if (depositInvoice && !invoicePaid) {
      console.log('[Setup] Starting automatic payment checking...')
      const interval = setInterval(() => {
        checkPaymentStatus(true) // Pass true for automatic checks
      }, 1000) // Check every 1 second
      
      setPaymentCheckInterval(interval)
      
      // Cleanup interval after 5 minutes (300 seconds) to avoid infinite checking
      setTimeout(() => {
        if (interval) {
          clearInterval(interval)
          setPaymentCheckInterval(null)
          console.log('[Setup] Stopped automatic payment checking after 5 minutes')
        }
      }, 300000)
    } else if (invoicePaid && paymentCheckInterval) {
      // Stop checking if payment is confirmed
      clearInterval(paymentCheckInterval)
      setPaymentCheckInterval(null)
      console.log('[Setup] Payment confirmed, stopped automatic checking')
    }
    
    // Cleanup on unmount or when invoice changes
    return () => {
      if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval)
        setPaymentCheckInterval(null)
      }
    }
  }, [depositInvoice, invoicePaid])

  const loadExistingSettings = async () => {
    try {
      const { fetchIncentiveSettings } = await import('@/lib/incentive-nostr')
      const incentiveSettings = await fetchIncentiveSettings(userPubkey)
      
      if (incentiveSettings) {
        const dailyGoal = parseInt(
          incentiveSettings.tags.find((t: string[]) => t[0] === 'daily_word_goal')?.[1] || '0'
        )
        const dailyReward = parseInt(
          incentiveSettings.tags.find((t: string[]) => t[0] === 'daily_reward_sats')?.[1] || '0'
        )
        const stakeBalance = parseInt(
          incentiveSettings.tags.find((t: string[]) => t[0] === 'stake_balance_sats')?.[1] || '0'
        )
        const lightningAddress = incentiveSettings.tags.find(
          (t: string[]) => t[0] === 'lightning_address'
        )?.[1]
        
        console.log('[Setup] Loaded settings:', {
          dailyGoal,
          dailyReward,
          stakeBalance,
          lightningAddress: lightningAddress ? 'set' : 'not set'
        })
        
        // If stake balance is 0, treat as no active setup
        if (stakeBalance <= 0) {
          console.log('[Setup] Stake balance is 0 - no active setup')
          setHasSetup(false)
          setBalance(0)
          setSettings({
            dailyWordGoal: 500,
            dailyRewardSats: 500,
            lightningAddress: '',
            stakeAmount: 1000
          })
          return
        }
        
        setSettings({
          dailyWordGoal: dailyGoal,
          dailyRewardSats: dailyReward,
          stakeAmount: stakeBalance, // Use existing balance as stake amount
          lightningAddress: lightningAddress || ''
        })
        setBalance(stakeBalance)
        setHasSetup(true)
        console.log('[Setup] ✅ Active setup found with balance:', stakeBalance)
      } else {
        console.log('[Setup] No incentive settings found')
        setHasSetup(false)
      }
    } catch (error) {
      console.error('[Setup] Error loading settings:', error)
      setHasSetup(false)
    }
  }

  const handleCreateStakeInvoice = async () => {
    console.log('[Frontend] 🚀 CREATING NEW INVOICE - Start')
    console.log('[Frontend] Timestamp:', new Date().toISOString())
    console.log('[Frontend] Random ID:', Math.random())
    
    setLoading(true)
    
    // CRITICAL: Clear any existing payment hash and invoice string before creating new invoice
    const oldHash = localStorage.getItem(`payment-hash-${userPubkey}`)
    const oldInvoice = localStorage.getItem(`invoice-string-${userPubkey}`)
    console.log('[Frontend] 🧹 OLD HASH BEFORE CLEARING:', oldHash)
    console.log('[Frontend] 🧹 OLD INVOICE BEFORE CLEARING:', oldInvoice?.substring(0, 50) + '...')
    localStorage.removeItem(`payment-hash-${userPubkey}`)
    localStorage.removeItem(`invoice-string-${userPubkey}`)
    console.log('[Frontend] 🧹 Cleared old payment hash and invoice string before creating new invoice')
    console.log('[Frontend] 🧹 Hash after clearing:', localStorage.getItem(`payment-hash-${userPubkey}`))
    console.log('[Frontend] 🧹 Invoice after clearing:', localStorage.getItem(`invoice-string-${userPubkey}`))
    
    // Clear old state completely
    console.log('[Frontend] 🗑️ Clearing old invoice state')
    setDepositInvoice(null)
    setInvoicePaid(false)
    
    // Small delay to ensure state is cleared
    await new Promise(resolve => setTimeout(resolve, 100))
    
    try {
      // Generate truly unique identifiers
      const uniqueTimestamp = Date.now()
      const uniqueRequestId = Math.random().toString(36).substring(7)
      
      const requestBody = {
        userPubkey: userPubkey,
        amountSats: settings.stakeAmount,
        timestamp: uniqueTimestamp,
        requestId: uniqueRequestId
      }
      
      console.log('[Frontend] 📤 SENDING REQUEST:', JSON.stringify(requestBody, null, 2))
      
      // Nuclear option: Force fresh request with query params and cache busting
      const cacheBuster = `?t=${uniqueTimestamp}&r=${uniqueRequestId}`
      
      const response = await fetch('/api/incentive/create-deposit-invoice' + cacheBuster, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        cache: 'no-store',
        body: JSON.stringify(requestBody)
      })
      
      console.log('[Frontend] 📥 Got response, status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('[Lightning] 📥 RAW API RESPONSE:', JSON.stringify(data, null, 2))
        
        setDepositInvoice(data.invoice)
        
        // Store original settings when invoice is created
        setOriginalSettings({ ...settings })
        
        // CRITICAL: Store payment hash and invoice string for verification
        console.log('[Lightning] 💾 STORING PAYMENT HASH:', data.paymentHash)
        console.log('[Lightning] 💾 STORING INVOICE STRING:', data.invoice?.substring(0, 50) + '...')
        localStorage.setItem(`payment-hash-${userPubkey}`, data.paymentHash)
        localStorage.setItem(`invoice-string-${userPubkey}`, data.invoice)
        
        console.log('[Lightning] 🆕 NEW INVOICE CREATED:')
        console.log('[Lightning] 🆕 Payment hash:', data.paymentHash)
        console.log('[Lightning] 🆕 Invoice string:', data.invoice?.substring(0, 50) + '...')
        console.log('[Lightning] 🆕 Full invoice length:', data.invoice?.length)
        console.log('[Lightning] ✅ Payment hash stored for verification')
        
        // Verify it was actually stored
        const storedHash = localStorage.getItem(`payment-hash-${userPubkey}`)
        console.log('[Lightning] ✅ VERIFICATION - Hash in localStorage:', storedHash)
      } else {
        const errorData = await response.json()
        console.error('[Lightning] ❌ Invoice creation failed:', errorData)
        
        // Log debug information if available
        if (errorData.debug) {
          console.error('[Lightning] Debug info:', errorData.debug)
          console.error('[Lightning] Available fields:', errorData.debug.availableFields)
          console.error('[Lightning] Field values:', errorData.debug.fieldValues)
          console.error('[Lightning] Full response:', errorData.debug.fullResponse)
        }
        
        throw new Error(errorData.error || 'Failed to create invoice')
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      setShowInvoiceError(true)
    } finally {
      setLoading(false)
    }
  }

  const checkPaymentStatus = async (isAutoCheck = false) => {
    if (!depositInvoice) return

    // Only show loading state for manual checks, not automatic ones
    if (!isAutoCheck) {
      setLoading(true)
    }
    
    try {
      console.log('[Setup] 🔍 Checking payment status...', isAutoCheck ? '(auto)' : '(manual)')
      
      // Extract payment hash and invoice string from localStorage
      const paymentHash = localStorage.getItem(`payment-hash-${userPubkey}`)
      const invoiceString = localStorage.getItem(`invoice-string-${userPubkey}`)
      
      if (!paymentHash) {
        console.error('[Setup] ❌ No payment hash found for verification')
        if (!isAutoCheck) {
          setShowPaymentError(true)
        }
        return
      }
      
      console.log('[Setup] 🔍 Using stored payment hash for verification:', paymentHash)
      console.log('[Setup] 🔍 Hash length:', paymentHash.length)
      console.log('[Setup] 🔍 Hash format:', /^[a-f0-9]{64}$/.test(paymentHash) ? 'Valid hex' : 'Invalid format')
      console.log('[Setup] 🔍 Invoice string available:', !!invoiceString)
      console.log('[Setup] 🔍 Invoice preview:', invoiceString?.substring(0, 50) + '...')
      
      // Call the real payment verification API
      const verificationRequest = { 
        paymentHash,
        ...(invoiceString && { invoiceString })
      }
      console.log('[Setup] 📤 Sending verification request:', verificationRequest)
      
      const response = await fetch('/api/incentive/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verificationRequest)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('[Setup] ❌ Payment verification failed:', errorData)
        
        // Provide helpful error messages based on the error type
        if (errorData.details?.note?.includes('very recent')) {
          console.log('[Setup] ⏳ Invoice is very recent, waiting for payment to process...')
        } else if (errorData.details?.note?.includes('processing')) {
          console.log('[Setup] ⏳ Payment may be processing, continuing to check...')
        } else if (errorData.details?.recommendation?.includes('webhook')) {
          console.log('[Setup] 💡 Recommendation: Set up webhook system for better verification')
        } else {
          console.error('[Setup] ❌ Payment verification error:', errorData.error)
        }
        
        // Don't throw error for verification failures - keep checking
        return
      }
      
      const result = await response.json()
      
      if (result.success && result.paid) {
        console.log('[Setup] ✅ Payment confirmed! Amount:', result.amountSats, 'sats')
        
        // Payment is confirmed - now credit the stake
        setInvoicePaid(true)
        setBalance(settings.stakeAmount)
        setHasSetup(true)
        setDepositedAmount(settings.stakeAmount)
        
        // Notify parent component that payment was successful
        if (onPaymentSuccess) {
          onPaymentSuccess()
        }
        
        // CRITICAL: Save the actual balance to Nostr
        console.log('[Setup] 💰 Payment confirmed! Saving balance to Nostr...')
        
        const { saveIncentiveSettings } = await import('@/lib/incentive-nostr')
        
        // Create settings object with ACTUAL deposited amount
        const updatedSettings = {
          dailyWordGoal: settings.dailyWordGoal,
          dailyRewardSats: settings.dailyRewardSats,
          stakeBalanceSats: settings.stakeAmount, // ✅ CRITICAL: Use actual deposit amount, not 0
          lightningAddress: settings.lightningAddress,
          createdDate: new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString().split('T')[0]
        }
        
        console.log('[Setup] Saving settings with balance:', updatedSettings.stakeBalanceSats)
        
        // Save to Nostr
        await saveIncentiveSettings(
          userPubkey,
          updatedSettings,
          authData
        )
        
        console.log('[Setup] ✅ Stake balance saved to Nostr')
        
        // Save user account locally for demo
        const userAccount = {
          pubkey: userPubkey,
          settings: {
            dailyWordGoal: settings.dailyWordGoal,
            dailyRewardSats: settings.dailyRewardSats,
            lightningAddress: settings.lightningAddress
          },
          balance: settings.stakeAmount,
          streak: 0,
          createdAt: new Date().toISOString()
        }
        
        localStorage.setItem(`user-account-${userPubkey}`, JSON.stringify(userAccount))
        
        // Clear the payment hash since payment is confirmed
        localStorage.removeItem(`payment-hash-${userPubkey}`)
        
        // Show success UI
        setShowSuccessMessage(true)
      } else {
        console.log('[Setup] ⏳ Payment not yet received')
        
        // If this is an automatic check and we've been waiting for a while, 
        // show a helpful message about payment verification
        if (isAutoCheck) {
          console.log('[Setup] Payment verification in progress...')
        } else {
          // For manual checks, show more detailed information
          setShowPaymentError(true)
        }
      }
      
    } catch (error) {
      console.error('[Setup] ❌ Error checking payment:', error)
      if (!isAutoCheck) {
        setShowPaymentError(true)
      }
    } finally {
      // Only clear loading state for manual checks
      if (!isAutoCheck) {
        setLoading(false)
      }
    }
  }

  const startDailyMonitoring = () => {
    // This would typically be handled server-side
    // For now, we'll simulate it
    console.log('Starting daily monitoring for user:', userPubkey)
  }

  const copyInvoice = async () => {
    try {
      await navigator.clipboard.writeText(depositInvoice)
      setShowCopySuccess(true)
      setTimeout(() => setShowCopySuccess(false), 3000)
    } catch (error) {
      console.error('Failed to copy invoice:', error)
      setShowCopyError(true)
      setTimeout(() => setShowCopyError(false), 3000)
    }
  }

  const handleQuitChallenge = async () => {
    if (confirm('⚠️ WARNING: Are you sure you want to quit the Lightning Goals challenge?\n\nThis will:\n• Cancel your daily goals\n• FORFEIT your remaining stake balance\n• Reset your progress streak\n\nYou will NOT receive a refund. This action cannot be undone.\n\nAre you absolutely sure?')) {
      try {
        console.log('[Setup] User quitting challenge - forfeiting stake balance')
        
        // Record forfeit event to Nostr
        const { recordTransaction } = await import('@/lib/incentive-nostr')
        await recordTransaction(
          userPubkey,
          'forfeit',
          balance, // Forfeit the entire remaining balance
          'forfeit-' + Date.now(),
          authData
        )
        
        // Clear the stake balance to 0 in Nostr
        const { updateStakeBalance } = await import('@/lib/incentive-nostr')
        await updateStakeBalance(userPubkey, 0, authData)
        
        console.log('[Setup] ✅ Stake balance updated to 0 in Nostr')
        
        // Wait a moment for the Nostr update to propagate
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Reset all UI state
        setHasSetup(false)
        setBalance(0)
        setStreak(0)
        setInvoicePaid(false)
        setDepositInvoice('')
        setQrCodeDataUrl('')
        
        // Reset settings to defaults
        setSettings({
          dailyWordGoal: 500,
          dailyRewardSats: 500,
          lightningAddress: '',
          stakeAmount: 1000
        })
        
        console.log('[Setup] ✅ UI state reset completely')
        
        // Show success UI
        setShowQuitSuccess(true)
        
        // Force reload settings after a delay to ensure Nostr has updated
        setTimeout(() => {
          console.log('[Setup] 🔄 Reloading settings to verify quit was successful')
          loadExistingSettings()
        }, 2000)
        
      } catch (error) {
        console.error('Error quitting challenge:', error)
        setShowQuitError(true)
      }
    }
  }

  // Note: hasSetup case is now handled by AutomatedRewardTracker in IncentiveModal
  if (hasSetup) {
    return null
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            Set Up Automated Lightning Goals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Daily Word Goal</label>
            <Input
              type="number"
              value={settings.dailyWordGoal}
              onChange={(e) => {
                const value = e.target.value
                // Only update if value is a valid number or empty string
                if (value === '' || /^\d+$/.test(value)) {
                  setSettings({...settings, dailyWordGoal: value === '' ? 0 : parseInt(value)})
                }
              }}
              placeholder="500"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Daily Reward (sats)</label>
            <Input
              type="number"
              value={settings.dailyRewardSats}
              onChange={(e) => {
                const value = e.target.value
                // Only update if value is a valid number or empty string
                if (value === '' || /^\d+$/.test(value)) {
                  setSettings({...settings, dailyRewardSats: value === '' ? 0 : parseInt(value)})
                }
              }}
              placeholder="500"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Stake Amount (sats)</label>
            <Input
              type="number"
              value={settings.stakeAmount}
              onChange={(e) => {
                const value = e.target.value
                // Only update if value is a valid number or empty string
                if (value === '' || /^\d+$/.test(value)) {
                  setSettings({...settings, stakeAmount: value === '' ? 0 : Math.max(parseInt(value), 0)})
                }
              }}
              placeholder="1000"
              min="1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Lightning Address</label>
            <p className="text-xs text-gray-500 mb-2">Where your daily rewards will be sent</p>
            <Input
              type="text"
              value={settings.lightningAddress}
              onChange={(e) => setSettings({...settings, lightningAddress: e.target.value})}
              placeholder="yourname@getalby.com"
            />
          </div>
        </div>
        
        {!depositInvoice ? (
          <Button 
            onClick={handleCreateStakeInvoice} 
            disabled={loading || settings.stakeAmount < 1}
            className="w-full"
          >
            {loading ? 'Creating Invoice...' : `Create ${settings.stakeAmount} sats Stake Invoice`}
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Payment Required</span>
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                Pay this Lightning invoice to activate your goals:
              </p>
              
              {/* Modern QR Code Display */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 rounded-xl border border-amber-200 dark:border-amber-800 mb-4">
                <div className="flex flex-col items-center space-y-4">
                  {/* QR Code Container */}
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-amber-200 dark:border-amber-700">
                    {qrCodeDataUrl && (
                      <img 
                        src={qrCodeDataUrl} 
                        alt="Lightning Invoice QR Code"
                        className="w-48 h-48 rounded-lg"
                      />
                    )}
                  </div>
                  
                  {/* QR Code Description */}
                  <div className="text-center">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                      Scan with Lightning Wallet
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Use any Lightning wallet to pay this invoice
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Invoice Text Container */}
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-amber-200 dark:border-amber-700 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Lightning Invoice</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border font-mono text-xs break-all text-gray-700 dark:text-gray-300">
                  {depositInvoice}
                </div>
              </div>
              
              {/* Modern Copy Button */}
              <div className="space-y-2">
                <Button 
                  onClick={copyInvoice}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border-0"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {showCopySuccess ? 'Copied!' : 'Copy Invoice'}
                </Button>
                
                {/* Only show "Generate New Invoice" if settings have changed */}
                {settingsHaveChanged() && (
                  <Button 
                    onClick={() => {
                      setDepositInvoice(null)
                      setInvoicePaid(false)
                      setOriginalSettings(null)
                    }}
                    variant="outline"
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Generate Lightning Invoice (New)
                  </Button>
                )}
              </div>
              
            </div>
            
            {/* Payment Status Indicator */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Waiting for payment... (checking every second)
                </span>
              </div>
            </div>
            
          </div>
        )}
        
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4" />
            <span className="font-medium">How it works:</span>
          </div>
          <ul className="space-y-1">
            <li>• Set any stake amount you're comfortable with</li>
            <li>• Write your daily word goal each day</li>
            <li>• Automatically receive rewards when goal is met</li>
            <li>• <strong>Streak counter</strong> appears in header for active users</li>
            <li>• Missing days deduct from your stake balance</li>
            <li>• <strong>Quitting forfeits your stake</strong> - no refunds</li>
            <li>• Build a consistent writing habit with real commitment</li>
          </ul>
        </div>
      </CardContent>
    </Card>
    
    {/* Success Message Overlay */}
    {showSuccessMessage && (
      <IncentiveSuccessMessage
        amount={depositedAmount}
        dailyReward={settings.dailyRewardSats}
        onClose={() => {
          setShowSuccessMessage(false)
          // Optionally reload or update UI state
          window.location.reload()
        }}
      />
    )}
    
    {/* Quit Success Modal */}
    {showQuitSuccess && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Warning Icon */}
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-orange-600" />
            </div>
            
            {/* Message */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Challenge Quit
              </h2>
              <p className="text-gray-600 mt-2">
                Your stake has been forfeited. You can start a new challenge anytime.
              </p>
            </div>
            
            {/* CTA Button */}
            <Button 
              onClick={() => setShowQuitSuccess(false)}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
            >
              Start New Challenge →
            </Button>
          </div>
        </Card>
      </div>
    )}
    
    {/* Quit Error Modal */}
    {showQuitError && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Error Icon */}
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            
            {/* Error Message */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Error Quitting Challenge
              </h2>
              <p className="text-gray-600 mt-2">
                Failed to quit challenge. Please try again.
              </p>
            </div>
            
            {/* CTA Button */}
            <Button 
              onClick={() => setShowQuitError(false)}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
            >
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    )}
    
    {/* Invoice Error Modal */}
    {showInvoiceError && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Invoice Creation Failed</h2>
              <p className="text-gray-600 mt-2">Failed to create stake invoice. Please try again.</p>
            </div>
            <Button onClick={() => setShowInvoiceError(false)} className="w-full bg-red-600 hover:bg-red-700">
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    )}
    
    {/* Payment Error Modal */}
    {showPaymentError && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Payment Check Failed</h2>
              <p className="text-gray-600 mt-2">Failed to check payment status. Please try again.</p>
            </div>
            <Button onClick={() => setShowPaymentError(false)} className="w-full bg-red-600 hover:bg-red-700">
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    )}
    
    {/* Copy Success Toast */}
    {showCopySuccess && (
      <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg animate-in slide-in-from-right duration-300 z-50">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>Invoice copied to clipboard!</span>
        </div>
      </div>
    )}
    
    {/* Copy Error Toast */}
    {showCopyError && (
      <div className="fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg animate-in slide-in-from-right duration-300 z-50">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>Failed to copy invoice. Please copy manually.</span>
        </div>
      </div>
    )}
  </>
  )
}
