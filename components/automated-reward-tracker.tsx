'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Gift, Target, Zap, CheckCircle, AlertTriangle, TrendingUp, Copy, ExternalLink } from 'lucide-react'

interface AutomatedRewardTrackerProps {
  userPubkey: string
  authData: any
  currentWordCount?: number // Optional - only passed when note is saved
  onStreakUpdate?: (newStreak: number) => void // Callback to update streak in parent
  onCancelStake?: () => void // Callback to handle stake cancellation
  onWordCountProcessed?: () => void // Callback to clear word count after processing
}

export function AutomatedRewardTracker({ userPubkey, authData, currentWordCount, onStreakUpdate, onCancelStake, onWordCountProcessed }: AutomatedRewardTrackerProps) {
  const [settings, setSettings] = useState<any>(null)
  const [todayProgress, setTodayProgress] = useState(0)
  const [balance, setBalance] = useState(0)
  const [streak, setStreak] = useState(0)
  const [hasMetGoalToday, setHasMetGoalToday] = useState(false)
  const [rewardSent, setRewardSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [goalMet, setGoalMet] = useState(false)
  const [showZapAnimation, setShowZapAnimation] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [showRewardSuccess, setShowRewardSuccess] = useState(false)
  const [showRewardError, setShowRewardError] = useState(false)
  const [paymentResult, setPaymentResult] = useState<any>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    loadSettings()
    loadTodayProgress()
    checkDailyStatus()
  }, [])

  useEffect(() => {
    // Auto-check if goal is met when word count changes
    if (settings && currentWordCount > 0) {
      checkGoalStatus()
    }
  }, [currentWordCount, settings])

  const loadSettings = async () => {
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
          stakeBalanceSats: stakeBalance,
          lightningAddress: lightningAddress
        })
        setBalance(stakeBalance)
      }
    } catch (error) {
      console.error('[Tracker] Error loading settings:', error)
    }
  }

  const loadTodayProgress = async () => {
    try {
      const { fetchTodayProgress } = await import('@/lib/incentive-nostr')
      const today = new Date().toISOString().split('T')[0]
      const progress = await fetchTodayProgress(userPubkey, today)
      
      if (progress) {
        const wordCount = parseInt(
          progress.tags.find((t: string[]) => t[0] === 'word_count')?.[1] || '0'
        )
        const goalMet = progress.tags.some(
          (t: string[]) => t[0] === 'goal_met' && t[1] === 'true'
        )
        const rewardClaimed = progress.tags.some(
          (t: string[]) => t[0] === 'reward_claimed' && t[1] === 'true'
        )
        
        setTodayProgress(wordCount)
        setHasMetGoalToday(goalMet)
        setRewardSent(rewardClaimed)
      }
    } catch (error) {
      console.error('[Tracker] Error loading progress:', error)
    }
  }

  const checkDailyStatus = async () => {
    try {
      const response = await fetch('/api/incentive/check-daily-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey: userPubkey })
      })
      if (response.ok) {
        const data = await response.json()
        setBalance(data.balance)
        setStreak(data.streak)
      }
    } catch (error) {
      console.error('[Tracker] Error checking daily status:', error)
    }
  }

  const checkGoalStatus = async () => {
    if (!settings || !currentWordCount) return
    
    const goalReached = currentWordCount >= settings.dailyWordGoal
    
    // If goal just reached (wasn't met before, now is) AND reward not already claimed today
    if (goalReached && !goalMet && !rewardSent) {
      console.log('[Tracker] 🎯 Goal reached! Auto-claiming reward...')
      setGoalMet(true)
      setShowZapAnimation(true)
      
      // Automatically record progress to Nostr
      await autoRecordProgress(goalReached)
      
      // Automatically claim reward without user action (only if not already claimed)
      if (!rewardSent) {
        await handleClaimReward()
      }
      
      // Notify parent that word count has been processed
      if (onWordCountProcessed) {
        onWordCountProcessed()
      }
      
      // Stop animation after 2 seconds
      setTimeout(() => setShowZapAnimation(false), 2000)
    } else if (!goalReached && goalMet) {
      setGoalMet(false)
    }
  }

  const autoRecordProgress = async (goalReached: boolean) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Check if already recorded today
      if (todayProgress > 0) {
        console.log('[Tracker] Progress already recorded today')
        return
      }
      
      console.log('[Tracker] Auto-recording daily progress to Nostr...')
      
      const { recordDailyProgress } = await import('@/lib/incentive-nostr')
      
      await recordDailyProgress(
        userPubkey,
        today,
        currentWordCount,
        goalReached,
        authData
      )
      
      // Update local state
      setTodayProgress(currentWordCount)
      setHasMetGoalToday(goalReached)
      
      console.log('[Tracker] ✅ Progress recorded to Nostr')
      
    } catch (error) {
      console.error('[Tracker] Failed to record progress:', error)
    }
  }

  const handleClaimReward = async () => {
    // Prevent multiple claims
    if (rewardSent || claiming) {
      console.log('[Tracker] ⚠️ Reward already claimed or currently claiming, skipping...')
      return
    }
    
    setClaiming(true)
    try {
      console.log('[Tracker] 🎉 Claiming reward...')
      
      // Double-check reward hasn't been claimed today
      const today = new Date().toISOString().split('T')[0]
      const { fetchTodayProgress } = await import('@/lib/incentive-nostr')
      const progress = await fetchTodayProgress(userPubkey, today)
      
      if (progress?.tags.some((t: string[]) => t[0] === 'reward_claimed' && t[1] === 'true')) {
        console.log('[Tracker] ⚠️ Reward already claimed today, skipping...')
        setRewardSent(true)
        return
      }
      
      // Call API to send reward
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPubkey })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to claim reward')
      }

      console.log('[Tracker] ✅ Reward claimed!', result.paymentHash)
      
      // Store payment result for UI
      setPaymentResult(result)
      
      // Update progress to mark as claimed
      const { markRewardClaimed, updateStakeBalance } = await import('@/lib/incentive-nostr')
      
      await markRewardClaimed(
        userPubkey,
        today,
        result.paymentHash,
        result.amountSats,
        authData
      )
      
      // Update stake balance (atomic operation)
      const currentBalance = parseInt(settings.stakeBalanceSats)
      const newBalance = currentBalance - result.amountSats
      
      console.log('[Tracker] 💰 Updating balance:', currentBalance, '->', newBalance)
      
      await updateStakeBalance(
        userPubkey,
        newBalance,
        authData
      )
      
      // Update state atomically
      setRewardSent(true)
      setHasMetGoalToday(true)
      setBalance(newBalance)
      
      // Update settings to reflect new balance
      setSettings(prev => ({
        ...prev,
        stakeBalanceSats: newBalance
      }))
      
      // Update streak and notify parent component
      const newStreak = streak + 1
      setStreak(newStreak)
      if (onStreakUpdate) {
        onStreakUpdate(newStreak)
      }
      
      // Show success UI
      setShowRewardSuccess(true)
      
    } catch (error) {
      console.error('[Tracker] ❌ Error claiming reward:', error)
      setShowRewardError(true)
    } finally {
      setClaiming(false)
    }
  }

  const handleCancelStake = async () => {
    setCancelling(true)
    try {
      console.log('[Tracker] 🗑️ Cancelling stake...')
      
      // Call API to cancel stake (reset settings)
      const { resetIncentiveSettings } = await import('@/lib/incentive-nostr')
      
      await resetIncentiveSettings(userPubkey, authData)
      
      // Reset all local state
      setSettings(null)
      setTodayProgress(0)
      setBalance(0)
      setStreak(0)
      setHasMetGoalToday(false)
      setRewardSent(false)
      setGoalMet(false)
      setShowZapAnimation(false)
      setPaymentResult(null)
      
      // Notify parent component
      if (onCancelStake) {
        onCancelStake()
      }
      
      console.log('[Tracker] ✅ Stake cancelled successfully')
      
    } catch (error) {
      console.error('[Tracker] ❌ Error cancelling stake:', error)
      alert('Failed to cancel stake. Please try again.')
    } finally {
      setCancelling(false)
      setShowCancelModal(false)
    }
  }

  const copyPaymentHash = async () => {
    if (paymentResult?.paymentHash) {
      try {
        await navigator.clipboard.writeText(paymentResult.paymentHash)
        alert('Payment hash copied to clipboard!')
      } catch (error) {
        console.error('Failed to copy:', error)
      }
    }
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-center text-muted-foreground">
            <Target className="w-8 h-8 mx-auto mb-2" />
            <p>Set up your Lightning Goals first!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const progress = currentWordCount ? Math.min((currentWordCount / settings.dailyWordGoal) * 100, 100) : 0
  
  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-green-500" />
            Daily Goal
          </CardTitle>
          <div className={`relative ${showZapAnimation ? 'animate-bounce' : ''}`}>
            <Zap 
              className={`w-6 h-6 transition-colors duration-300 ${
                goalMet ? 'text-orange-500 fill-orange-500' : 'text-gray-400'
              }`}
            />
            {showZapAnimation && (
              <>
                {/* Zap animation rings */}
                <div className="absolute inset-0 w-6 h-6 rounded-full bg-orange-500 animate-ping opacity-75" />
                <div className="absolute inset-0 w-6 h-6 rounded-full bg-orange-400 animate-ping opacity-50" style={{ animationDelay: '0.2s' }} />
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Progress</span>
            <span className={`font-medium ${goalMet ? 'text-green-600' : 'text-gray-900'}`}>
              {currentWordCount || todayProgress} / {settings.dailyWordGoal} words
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-500 ${
                goalMet ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Goal Status */}
        {goalMet && !rewardSent && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="animate-pulse">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-blue-800">
                🎯 Goal Achieved! Processing reward...
              </p>
            </div>
            <p className="text-sm text-blue-700">
              {settings.dailyRewardSats} sats will be sent automatically to your Lightning address.
            </p>
          </div>
        )}
        
        {rewardSent && paymentResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm font-semibold text-green-800">
                ✅ Reward Sent Successfully!
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-green-700">
                {settings.dailyRewardSats} sats sent to your Lightning address.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-600 font-mono bg-green-100 px-2 py-1 rounded">
                  {paymentResult.paymentHash}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyPaymentHash}
                  className="h-6 px-2 text-xs"
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`https://amboss.space/payment/${paymentResult.paymentHash}`, '_blank')}
                  className="h-6 px-2 text-xs"
                >
                  View
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Balance */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Stake Balance</span>
            <span className="font-semibold text-orange-600">{balance} sats</span>
          </div>
        </div>

        {/* Warning for low balance */}
        {balance < settings.dailyRewardSats * 3 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">Don't Lose Your Streak!</span>
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              Your balance is low. Add more sats to keep your streak alive and avoid penalties for missed days.
            </p>
          </div>
        )}

        {/* Cancel Stake Button */}
        <div className="pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCancelModal(true)}
            className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
          >
            Cancel Stake & Reset
          </Button>
        </div>
      </CardContent>
    </Card>
    
    {/* Cancel Stake Confirmation Modal */}
    {showCancelModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Warning Icon */}
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            
            {/* Title and Message */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Cancel Stake?
              </h2>
              <p className="text-gray-600 mt-2">
                This will reset your Lightning Goals setup and you'll lose your current streak.
              </p>
            </div>
            
            {/* Balance Info */}
            <div className="w-full bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-yellow-600" />
                <p className="text-sm font-semibold text-yellow-800">
                  Remaining Balance: {balance} sats
                </p>
              </div>
              <p className="text-xs text-yellow-700">
                This balance will be forfeited when you cancel your stake
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3 w-full">
              <Button 
                onClick={() => setShowCancelModal(false)}
                variant="outline"
                className="flex-1"
              >
                Keep Stake
              </Button>
              <Button 
                onClick={handleCancelStake}
                disabled={cancelling}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Stake'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )}
    
    {/* Reward Error Modal */}
    {showRewardError && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Error Icon */}
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            
            {/* Error Message */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Reward Claim Failed
              </h2>
              <p className="text-gray-600 mt-2">
                There was an error claiming your reward. Please try again.
              </p>
            </div>
            
            {/* CTA Button */}
            <Button 
              onClick={() => setShowRewardError(false)}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
            >
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    )}
  </>
  )
}
