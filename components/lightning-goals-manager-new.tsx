'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, Wallet, CheckCircle, AlertTriangle, TrendingUp, Copy, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { 
  getCurrentStake, 
  saveStakeSettings, 
  recordTransaction, 
  getDailyProgress 
} from '@/lib/incentive-nostr-new'

interface LightningGoalsManagerProps {
  userPubkey: string
  authData: any
  userLightningAddress: string
  onSetupStatusChange?: (hasSetup: boolean) => void
}

interface StakeSettings {
  dailyWordGoal: number
  rewardPerCompletion: number
  currentBalance: number
  stakeCreatedAt: number
  status: 'active' | 'cancelled'
  lastUpdated: number
}

export function LightningGoalsManager({ 
  userPubkey, 
  authData, 
  userLightningAddress,
  onSetupStatusChange 
}: LightningGoalsManagerProps) {
  // Core state
  const [stake, setStake] = useState<StakeSettings | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Setup state
  const [setupSettings, setSetupSettings] = useState({
    dailyWordGoal: 500,
    rewardPerCompletion: 100,
    stakeAmount: 1000,
    lightningAddress: userLightningAddress
  })
  
  // Payment state
  const [paymentStep, setPaymentStep] = useState<'setup' | 'invoice' | 'tracking'>('setup')
  const [invoice, setInvoice] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'error'>('pending')
  
  // Progress state
  const [todayProgress, setTodayProgress] = useState<{
    wordCount: number
    goalMet: boolean
    rewardSent: boolean
  } | null>(null)
  
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  
  // Cancel stake state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // Load current stake on mount
  useEffect(() => {
    loadCurrentStake()
  }, [userPubkey])

  // Update setup settings when userLightningAddress changes
  useEffect(() => {
    setSetupSettings(prev => ({
      ...prev,
      lightningAddress: userLightningAddress
    }))
  }, [userLightningAddress])

  const loadCurrentStake = async () => {
    try {
      setLoading(true)
      const currentStake = await getCurrentStake(userPubkey)
      
      if (currentStake && currentStake.status === 'active') {
        setStake(currentStake)
        setPaymentStep('tracking')
        loadTodayProgress()
        if (onSetupStatusChange) onSetupStatusChange(true)
      } else {
        setStake(null)
        setPaymentStep('setup')
        if (onSetupStatusChange) onSetupStatusChange(false)
      }
    } catch (error) {
      console.error('[LightningGoals] Error loading stake:', error)
      setStake(null)
      setPaymentStep('setup')
    } finally {
      setLoading(false)
    }
  }

  const loadTodayProgress = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const progress = await getDailyProgress(userPubkey, today)
      setTodayProgress(progress)
    } catch (error) {
      console.error('[LightningGoals] Error loading progress:', error)
    }
  }

  const createInvoice = async () => {
    try {
      setLoading(true)
      
      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: setupSettings.stakeAmount,
          memo: `Lightning Goals Stake - ${setupSettings.dailyWordGoal} words/day`
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create invoice')
      }

      const data = await response.json()
      setInvoice(data.invoice)
      
      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(data.invoice)
      setQrCode(qrDataUrl)
      
      setPaymentStep('invoice')
      setPaymentStatus('pending')
      
      // Store payment hash for verification
      localStorage.setItem(`payment-hash-${userPubkey}`, data.paymentHash)
      localStorage.setItem(`invoice-string-${userPubkey}`, data.invoice)
      
      // Store Lightning address for future rewards
      if (setupSettings.lightningAddress) {
        localStorage.setItem(`lightning-address-${userPubkey}`, setupSettings.lightningAddress)
        console.log('[LightningGoals] 💾 Lightning address saved:', setupSettings.lightningAddress)
      }
      
      // Start payment checking
      checkPaymentStatus()
    } catch (error) {
      console.error('[LightningGoals] Error creating invoice:', error)
      setPaymentStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const checkPaymentStatus = async () => {
    try {
      const paymentHash = localStorage.getItem(`payment-hash-${userPubkey}`)
      if (!paymentHash) {
        console.error('[LightningGoals] No payment hash found')
        return
      }

      const response = await fetch('/api/incentive/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          paymentHash
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.paid) {
          await handlePaymentSuccess()
        } else {
          // Continue checking
          setTimeout(checkPaymentStatus, 2000)
        }
      } else {
        // Continue checking
        setTimeout(checkPaymentStatus, 2000)
      }
    } catch (error) {
      console.error('[LightningGoals] Error checking payment:', error)
      setTimeout(checkPaymentStatus, 2000)
    }
  }

  const handlePaymentSuccess = async () => {
    try {
      const paymentHash = localStorage.getItem(`payment-hash-${userPubkey}`)
      if (!paymentHash) {
        console.error('[LightningGoals] No payment hash found for stake creation')
        return
      }

      // Create stake using new event system
      await saveStakeSettings(userPubkey, {
        dailyWordGoal: setupSettings.dailyWordGoal,
        rewardPerCompletion: setupSettings.rewardPerCompletion,
        currentBalance: setupSettings.stakeAmount,
        stakeCreatedAt: Date.now(),
        status: 'active',
        lightningAddress: setupSettings.lightningAddress
      }, authData)

      // Record deposit transaction
      await recordTransaction(userPubkey, {
        type: 'deposit',
        amount: setupSettings.stakeAmount,
        paymentHash: paymentHash,
        balanceBefore: 0,
        balanceAfter: setupSettings.stakeAmount,
        description: 'Initial stake deposit'
      }, authData)

      console.log('[LightningGoals] ✅ Stake created successfully!')
      
      // Update state
      setPaymentStatus('paid')
      setShowSuccessMessage(true)
      
      // Reload stake data
      await loadCurrentStake()
      
      // Hide success message after 5 seconds
      setTimeout(() => {
        setShowSuccessMessage(false)
      }, 5000)
      
    } catch (error) {
      console.error('[LightningGoals] Error creating stake:', error)
      setPaymentStatus('error')
    }
  }

  const handleCancelStake = async () => {
    if (!stake) {
      console.log('[LightningGoals] ❌ No stake to cancel')
      return
    }
    
    console.log('[LightningGoals] 🔄 Starting stake forfeiture...')
    console.log('[LightningGoals] Forfeiting balance:', stake.currentBalance, 'sats')
    
    setIsCancelling(true)
    setCancelError('')
    
    try {
      // Delete ALL incentive events (stake, transactions, progress, streak data)
      console.log('[LightningGoals] 🗑️ Deleting all incentive events...')
      
      const { deleteAllIncentiveEvents } = await import('@/lib/incentive-nostr-new')
      await deleteAllIncentiveEvents(userPubkey, authData)
      
      console.log('[LightningGoals] ✅ All incentive events deleted successfully')
      
      // Clear localStorage progress data
      console.log('[LightningGoals] 🧹 Clearing localStorage progress data...')
      localStorage.removeItem(`daily-progress-${userPubkey}`)
      localStorage.removeItem(`lightning-address-${userPubkey}`)
      localStorage.removeItem(`incentive-settings-${userPubkey}`)
      
      // Wait a moment for deletion events to propagate
      console.log('[LightningGoals] ⏳ Waiting for deletion events to propagate...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Close modal and reset state
      setShowCancelModal(false)
      setStake(null)
      setPaymentStep('setup')
      setTodayProgress(null)
      
      if (onSetupStatusChange) onSetupStatusChange(false)
      
      // Show forfeit confirmation
      alert(`Stake cancelled! ${stake.currentBalance} sats forfeited. All progress and transaction history has been deleted.`)
      
    } catch (error) {
      console.error('[LightningGoals] ❌ Error:', error)
      setCancelError(error instanceof Error ? error.message : 'Failed to cancel stake')
    } finally {
      setIsCancelling(false)
    }
  }

  if (loading && !stake) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading Lightning Goals...</div>
        </CardContent>
      </Card>
    )
  }

  // Setup Screen
  if (paymentStep === 'setup') {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              Set Up Your Daily Goal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Daily Word Goal</label>
              <Input
                type="number"
                value={setupSettings.dailyWordGoal}
                onChange={(e) => setSetupSettings({
                  ...setupSettings,
                  dailyWordGoal: parseInt(e.target.value) || 0
                })}
                placeholder="500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Daily Reward (sats)</label>
              <Input
                type="number"
                value={setupSettings.rewardPerCompletion}
                onChange={(e) => setSetupSettings({
                  ...setupSettings,
                  rewardPerCompletion: parseInt(e.target.value) || 0
                })}
                placeholder="100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Lightning Address</label>
              <Input
                type="text"
                value={setupSettings.lightningAddress}
                onChange={(e) => setSetupSettings({
                  ...setupSettings,
                  lightningAddress: e.target.value
                })}
                placeholder="your@lightning.address"
              />
              <p className="text-xs text-gray-500 mt-1">
                Where daily rewards will be sent. 
                {userLightningAddress && (
                  <span className="text-blue-500"> Using saved address from profile.</span>
                )}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Stake Amount (sats)</label>
              <Input
                type="number"
                value={setupSettings.stakeAmount}
                onChange={(e) => setSetupSettings({
                  ...setupSettings,
                  stakeAmount: parseInt(e.target.value) || 0
                })}
                placeholder="1000"
              />
            </div>
            
            <Button 
              onClick={createInvoice}
              disabled={loading || !setupSettings.lightningAddress}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              Generate Lightning Invoice
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Invoice Screen
  if (paymentStep === 'invoice') {
    return (
      <div className="space-y-6">
        {showSuccessMessage && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Payment Successful! Your goal is now active!</span>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              Pay Lightning Invoice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Scan QR code or copy invoice to pay
              </p>
              {qrCode && (
                <img src={qrCode} alt="Payment QR Code" className="mx-auto mb-4" />
              )}
              <div className="bg-gray-100 p-3 rounded-lg">
                <p className="text-xs text-gray-500 break-all">{invoice}</p>
              </div>
              <Button
                onClick={() => navigator.clipboard.writeText(invoice)}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Invoice
              </Button>
            </div>
            
            {paymentStatus === 'error' && (
              <div className="text-center text-red-600 text-sm">
                Error processing payment. Please try again.
              </div>
            )}
            
            <div className="text-center text-sm text-gray-500">
              Payment will be verified automatically...
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Cancel confirmation modal - CHECK FIRST before any other returns
  console.log('[LightningGoals] 🔍 Modal check - showCancelModal:', showCancelModal, 'stake:', !!stake)
  if (showCancelModal && stake) {
    console.log('[LightningGoals] ✅ Rendering cancel modal')
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Cancel Stake Confirmation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Are you sure you want to cancel your commitment and forfeit your stake?
              </p>
              
               <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                 <div className="flex items-start gap-2">
                   <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                   <div className="text-sm text-red-700">
                     <p className="font-medium">This action cannot be undone.</p>
                     <p className="mt-1">
                       Your remaining balance of <strong>{stake.currentBalance} sats</strong> will be 
                       <strong className="text-red-800"> forfeited permanently</strong>.
                     </p>
                     <p className="mt-1">
                       <strong className="text-red-800">ALL DATA WILL BE DELETED:</strong>
                     </p>
                     <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                       <li>Stake settings and balance</li>
                       <li>Daily progress and streak data</li>
                       <li>Transaction history</li>
                       <li>All Lightning Goals records</li>
                     </ul>
                     <p className="mt-1 text-xs text-red-600">
                       This is the commitment you made to your writing goal.
                     </p>
                   </div>
                 </div>
               </div>
              
              {cancelError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{cancelError}</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => setShowCancelModal(false)}
                variant="outline"
                className="flex-1"
                disabled={isCancelling}
              >
                Keep Stake
              </Button>
              <Button
                onClick={handleCancelStake}
                variant="destructive"
                className="flex-1"
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Forfeiting...
                  </div>
                ) : (
                  'Yes, Forfeit Stake'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Tracking Screen
  if (paymentStep === 'tracking' && stake) {
    const progress = todayProgress ? Math.min((todayProgress.wordCount / stake.dailyWordGoal) * 100, 100) : 0
    const daysUntilEmpty = Math.floor(stake.currentBalance / stake.rewardPerCompletion)
    
    return (
      <div className="space-y-6">
        {/* Daily Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              Daily Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress: {todayProgress?.wordCount || 0} / {stake.dailyWordGoal} words</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              {todayProgress?.goalMet && todayProgress.rewardSent && (
                <div className="flex items-center gap-2 text-green-600">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-medium">Goal Complete! Reward Sent</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stake Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-orange-500" />
              Lightning Goals Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Daily Goal:</span>
                <p className="font-medium">{stake.dailyWordGoal} words</p>
              </div>
              <div>
                <span className="text-gray-500">Reward:</span>
                <p className="font-medium">{stake.rewardPerCompletion} sats</p>
              </div>
              <div>
                <span className="text-gray-500">Balance:</span>
                <p className="font-medium">{stake.currentBalance} sats</p>
              </div>
              <div>
                <span className="text-gray-500">Days Left:</span>
                <p className="font-medium">{daysUntilEmpty}</p>
              </div>
            </div>
            
            {daysUntilEmpty <= 3 && (
              <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Don't lose your streak! Only {daysUntilEmpty} days remaining.</span>
              </div>
            )}
            
            <Button
              onClick={() => {
                console.log('[LightningGoals] 🔴 Cancel button clicked!')
                console.log('[LightningGoals] Current showCancelModal:', showCancelModal)
                setShowCancelModal(true)
                console.log('[LightningGoals] Set showCancelModal to true')
              }}
              variant="destructive"
              disabled={loading}
              className="w-full"
            >
              Cancel Stake & Forfeit
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }


  return null
}
