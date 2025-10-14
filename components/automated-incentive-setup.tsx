'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, Wallet, CheckCircle, AlertCircle, Clock, Copy } from 'lucide-react'
import { IncentiveSuccessMessage } from './incentive-success-message'
import QRCode from 'qrcode.react'

interface AutomatedIncentiveSetupProps {
  userPubkey: string
  authData: any
}

export function AutomatedIncentiveSetup({ userPubkey, authData }: AutomatedIncentiveSetupProps) {
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
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState(0)
  const [showQuitSuccess, setShowQuitSuccess] = useState(false)
  const [showQuitError, setShowQuitError] = useState(false)
  const [showInvoiceError, setShowInvoiceError] = useState(false)
  const [showPaymentError, setShowPaymentError] = useState(false)
  const [showCopySuccess, setShowCopySuccess] = useState(false)
  const [showCopyError, setShowCopyError] = useState(false)
  const [showQuitConfirmation, setShowQuitConfirmation] = useState(false)
  const [paymentCheckInterval, setPaymentCheckInterval] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    loadExistingSettings()
  }, [userPubkey]) // Only load when userPubkey changes, not on every render

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
  }, [depositInvoice, invoicePaid, checkPaymentStatus])

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
        
        setSettings({
          dailyWordGoal: dailyGoal,
          dailyRewardSats: dailyReward,
          stakeAmount: stakeBalance, // Use existing balance as stake amount
          lightningAddress: lightningAddress
        })
        setBalance(stakeBalance)
        setHasSetup(true)
      }
    } catch (error) {
      console.error('[Setup] Error loading settings:', error)
    }
  }

  const handleCreateStakeInvoice = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: userPubkey,
          amountSats: settings.stakeAmount
        })
      })

      if (response.ok) {
        const data = await response.json()
        setDepositInvoice(data.invoice)
        console.log('[Lightning] Created real invoice:', data.paymentHash)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create invoice')
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      setShowInvoiceError(true)
    } finally {
      setLoading(false)
    }
  }

  const checkPaymentStatus = useCallback(async (isAutoCheck = false) => {
    if (!depositInvoice) return

    // Only show loading state for manual checks, not automatic ones
    if (!isAutoCheck) {
      setLoading(true)
    }
    
    try {
      console.log('[Setup] 🔍 Checking payment status...', isAutoCheck ? '(auto)' : '(manual)')
      
      // For now, simulate payment confirmation after a delay
      // In production, this would check actual Lightning payment status
      await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
      
      // Simulate successful payment
      setInvoicePaid(true)
      setBalance(settings.stakeAmount)
      setHasSetup(true)
      setDepositedAmount(settings.stakeAmount)
      
      // CRITICAL: Save the actual balance to Nostr, not 0!
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
      
      // Show success UI instead of alert
      setShowSuccessMessage(true)
      
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
  }, [depositInvoice, settings.stakeAmount, userPubkey, authData])

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
    // Show confirmation modal instead of browser popup
    setShowQuitConfirmation(true)
  }

  const confirmQuitChallenge = async () => {
    setShowQuitConfirmation(false)
    
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
      
      // Clear the stake balance to 0
      const { updateStakeBalance } = await import('@/lib/incentive-nostr')
      await updateStakeBalance(userPubkey, 0, authData)
      
      // Reset all state to allow new setup
      setHasSetup(false)
      setBalance(0)
      setStreak(0)
      setSettings({
        dailyWordGoal: 500,
        dailyRewardSats: 500,
        lightningAddress: '',
        stakeAmount: 1000
      })
      
      // Show success UI instead of alert
      setShowQuitSuccess(true)
      } catch (error) {
        console.error('Error quitting challenge:', error)
        setShowQuitError(true)
      }
    }

  if (hasSetup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Lightning Goals Active
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Daily Goal:</span>
              <div className="font-medium">{settings.dailyWordGoal} words</div>
            </div>
            <div>
              <span className="text-muted-foreground">Daily Reward:</span>
              <div className="font-medium">{settings.dailyRewardSats} sats</div>
            </div>
            <div>
              <span className="text-muted-foreground">Stake Balance:</span>
              <div className="font-medium">{balance} sats</div>
            </div>
            <div>
              <span className="text-muted-foreground">Current Streak:</span>
              <div className="font-medium">{streak} days</div>
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-medium">Automated System</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Rewards are automatically sent when you reach your daily goal. Missing days deduct from your stake.
            </p>
          </div>
          
          <Button onClick={handleQuitChallenge} variant="destructive" size="sm" className="w-full">
            Quit Challenge (Forfeit Stake)
          </Button>
        </CardContent>
      </Card>
    )
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
              onChange={(e) => setSettings({...settings, dailyWordGoal: parseInt(e.target.value) || 0})}
              placeholder="500"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Daily Reward (sats)</label>
            <Input
              type="number"
              value={settings.dailyRewardSats}
              onChange={(e) => setSettings({...settings, dailyRewardSats: parseInt(e.target.value) || 0})}
              placeholder="500"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Stake Amount (sats)</label>
            <Input
              type="number"
              value={settings.stakeAmount}
              onChange={(e) => setSettings({...settings, stakeAmount: Math.max(parseInt(e.target.value) || 0, 1)})}
              placeholder="1000"
              min="1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Lightning Address</label>
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
              
              {/* QR Code Display - Always visible */}
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-dashed border-yellow-300 mb-4">
                <div className="flex flex-col items-center">
                  <div className="bg-white p-3 rounded-lg shadow-sm">
                    <QRCode 
                      value={depositInvoice}
                      size={160}
                      level="M"
                      includeMargin={true}
                      renderAs="svg"
                    />
                  </div>
                  <p className="text-xs text-center text-gray-600 mt-3 font-medium">
                    Scan with Lightning wallet
                  </p>
                </div>
              </div>
              
              {/* Invoice Text */}
              <div className="bg-white dark:bg-gray-800 p-3 rounded border font-mono text-xs break-all mb-3">
                {depositInvoice}
              </div>
              
              {/* Copy Button */}
              <Button 
                onClick={copyInvoice}
                variant="outline" 
                size="sm"
                className="w-full"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Invoice
              </Button>
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

    {/* Quit Confirmation Modal */}
    {showQuitConfirmation && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Quit Lightning Goals Challenge?
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              This will cancel your daily goals and forfeit your remaining stake balance of <span className="font-semibold text-orange-600">{balance} sats</span>. You will NOT receive a refund.
            </p>
            <div className="flex gap-3">
              <Button 
                onClick={() => setShowQuitConfirmation(false)} 
                variant="outline" 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmQuitChallenge} 
                variant="destructive" 
                className="flex-1"
              >
                Quit Challenge
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Quit Success Modal */}
    {showQuitSuccess && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Challenge Quit Successfully
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Your Lightning Goals challenge has been cancelled. Your stake has been forfeited as agreed.
            </p>
            <Button onClick={() => setShowQuitSuccess(false)} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
