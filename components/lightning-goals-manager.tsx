'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, Wallet, CheckCircle, AlertTriangle, TrendingUp, Copy, QrCode } from 'lucide-react'
import QRCode from 'qrcode'

interface LightningGoalsManagerProps {
  userPubkey: string
  authData: any
  currentWordCount?: number
  onWordCountProcessed?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
}

interface StakeData {
  stakeId: string
  dailyWordGoal: number
  dailyRewardSats: number
  currentBalance: number
  lightningAddress: string
  createdAt: string
  isActive: boolean
}

export function LightningGoalsManager({ 
  userPubkey, 
  authData, 
  currentWordCount,
  onWordCountProcessed,
  onSetupStatusChange 
}: LightningGoalsManagerProps) {
  // Core state
  const [stake, setStake] = useState<StakeData | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Setup state
  const [setupSettings, setSetupSettings] = useState({
    dailyWordGoal: 500,
    dailyRewardSats: 500,
    lightningAddress: '',
    stakeAmount: 1000
  })
  
  // Payment state
  const [paymentStep, setPaymentStep] = useState<'setup' | 'invoice' | 'tracking'>('setup')
  const [invoice, setInvoice] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'error'>('pending')
  
  // Progress state
  const [todayProgress, setTodayProgress] = useState(0)
  const [hasMetGoalToday, setHasMetGoalToday] = useState(false)
  const [rewardSent, setRewardSent] = useState(false)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  // Load current stake on mount
  useEffect(() => {
    loadCurrentStake()
  }, [userPubkey])

  // Check for goal completion when word count changes
  useEffect(() => {
    if (stake && currentWordCount && currentWordCount > 0) {
      checkGoalCompletion(currentWordCount)
    }
  }, [stake, currentWordCount])

  const loadCurrentStake = async () => {
    try {
      setLoading(true)
      const { getCurrentStake } = await import('@/lib/incentive-nostr')
      const currentStake = await getCurrentStake(userPubkey)
      
      if (currentStake && currentStake.isActive) {
        setStake(currentStake)
        setPaymentStep('tracking')
        loadTodayProgress(currentStake.stakeId)
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

  const loadTodayProgress = async (stakeId: string) => {
    try {
      const { getCurrentStake } = await import('@/lib/incentive-nostr')
      const currentStake = await getCurrentStake(userPubkey)
      if (currentStake) {
        setTodayProgress(0) // Will be updated when word count is processed
        setHasMetGoalToday(false)
        setRewardSent(false)
      }
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
      const { createStake } = await import('@/lib/incentive-nostr')
      const stakeId = await createStake(userPubkey, {
        dailyWordGoal: setupSettings.dailyWordGoal,
        dailyRewardSats: setupSettings.dailyRewardSats,
        initialStakeSats: setupSettings.stakeAmount,
        lightningAddress: setupSettings.lightningAddress,
        paymentHash: paymentHash
      }, authData)

      console.log('[LightningGoals] ✅ Stake created:', stakeId)
      
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

  const checkGoalCompletion = async (wordCount: number) => {
    if (!stake || wordCount < stake.dailyWordGoal) return
    
    // Check if goal was already met today
    if (hasMetGoalToday) return
    
    try {
      console.log('[LightningGoals] 🎯 Goal reached! Sending reward...')
      
      // Record progress
      const { recordDailyProgress } = await import('@/lib/incentive-nostr')
      await recordDailyProgress(
        userPubkey,
        stake.stakeId,
        new Date().toISOString().split('T')[0],
        wordCount,
        true, // goal met
        false, // reward not claimed yet
        undefined,
        authData
      )
      
      // Send reward
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          authData
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        
        // Update balance
        const { updateStakeBalance } = await import('@/lib/incentive-nostr')
        await updateStakeBalance(
          userPubkey,
          stake.stakeId,
          stake.currentBalance,
          stake.currentBalance - stake.dailyRewardSats,
          'reward_sent',
          new Date().toISOString().split('T')[0],
          result.paymentHash,
          authData
        )
        
        // Update progress record with payment hash
        await recordDailyProgress(
          userPubkey,
          stake.stakeId,
          new Date().toISOString().split('T')[0],
          wordCount,
          true,
          true,
          result.paymentHash,
          authData
        )
        
        setHasMetGoalToday(true)
        setRewardSent(true)
        setTodayProgress(wordCount)
        
        // Reload stake to get updated balance
        await loadCurrentStake()
        
        // Notify parent that word count was processed
        if (onWordCountProcessed) {
          onWordCountProcessed()
        }
        
        console.log('[LightningGoals] ✅ Reward sent successfully!')
      } else {
        console.error('[LightningGoals] Failed to send reward')
      }
    } catch (error) {
      console.error('[LightningGoals] Error processing goal completion:', error)
    }
  }

  const cancelStake = async () => {
    if (!stake) return
    
    try {
      setLoading(true)
      
      // Send refund (remaining balance)
      const refundResponse = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          authData,
          isRefund: true,
          refundAmount: stake.currentBalance
        })
      })
      
      if (refundResponse.ok) {
        const refundResult = await refundResponse.json()
        
        // Cancel stake
        const { cancelStake: cancelStakeEvent } = await import('@/lib/incentive-nostr')
        await cancelStakeEvent(
          userPubkey,
          stake.stakeId,
          stake.currentBalance,
          refundResult.paymentHash,
          'user_cancelled',
          authData
        )
        
        // Reset state
        setStake(null)
        setPaymentStep('setup')
        setTodayProgress(0)
        setHasMetGoalToday(false)
        setRewardSent(false)
        
        if (onSetupStatusChange) onSetupStatusChange(false)
        
        console.log('[LightningGoals] ✅ Stake cancelled and refunded')
      }
    } catch (error) {
      console.error('[LightningGoals] Error cancelling stake:', error)
    } finally {
      setLoading(false)
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
                value={setupSettings.dailyRewardSats}
                onChange={(e) => setSetupSettings({
                  ...setupSettings,
                  dailyRewardSats: parseInt(e.target.value) || 0
                })}
                placeholder="500"
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
              <p className="text-xs text-gray-500 mt-1">Where daily rewards will be sent</p>
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

  // Tracking Screen
  if (paymentStep === 'tracking' && stake) {
    const progress = Math.min((todayProgress / stake.dailyWordGoal) * 100, 100)
    const daysUntilEmpty = Math.floor(stake.currentBalance / stake.dailyRewardSats)
    
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
                  <span>Progress: {todayProgress} / {stake.dailyWordGoal} words</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              {hasMetGoalToday && rewardSent && (
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
                <p className="font-medium">{stake.dailyRewardSats} sats</p>
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
              onClick={cancelStake}
              variant="destructive"
              disabled={loading}
              className="w-full"
            >
              Cancel Stake & Reset
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
