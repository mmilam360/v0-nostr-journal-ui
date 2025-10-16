'use client'

import { useState, useEffect } from 'react'
import { isIncentiveEnabled } from '@/lib/feature-flags'

interface LightningGoalsMonitorProps {
  userPubkey: string
  authData: any
  currentWordCount?: number
  onWordCountProcessed?: () => void
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

export function LightningGoalsMonitor({ 
  userPubkey, 
  authData, 
  currentWordCount,
  onWordCountProcessed
}: LightningGoalsMonitorProps) {
  const [stake, setStake] = useState<StakeData | null>(null)
  const [hasMetGoalToday, setHasMetGoalToday] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Load current stake on mount
  useEffect(() => {
    if (isIncentiveEnabled() && userPubkey) {
      loadCurrentStake()
    }
  }, [userPubkey])

  // Check for goal completion when word count changes
  useEffect(() => {
    if (stake && currentWordCount && currentWordCount > 0 && !isProcessing) {
      console.log('[LightningGoalsMonitor] 🔍 Word count updated:', currentWordCount)
      checkGoalCompletion(currentWordCount)
    }
  }, [stake, currentWordCount, isProcessing])

  const loadCurrentStake = async () => {
    try {
      const { getCurrentStake } = await import('@/lib/incentive-nostr')
      const currentStake = await getCurrentStake(userPubkey)
      
      if (currentStake && currentStake.isActive) {
        setStake(currentStake)
        console.log('[LightningGoalsMonitor] ✅ Active stake loaded:', currentStake.stakeId)
      } else {
        setStake(null)
        console.log('[LightningGoalsMonitor] ❌ No active stake found')
      }
    } catch (error) {
      console.error('[LightningGoalsMonitor] Error loading stake:', error)
      setStake(null)
    }
  }

  const checkGoalCompletion = async (wordCount: number) => {
    if (!stake || wordCount < stake.dailyWordGoal || hasMetGoalToday || isProcessing) {
      console.log('[LightningGoalsMonitor] 🎯 Goal check skipped:', {
        hasStake: !!stake,
        wordCount,
        dailyWordGoal: stake?.dailyWordGoal,
        hasMetGoalToday,
        isProcessing
      })
      return
    }
    
    console.log('[LightningGoalsMonitor] 🎯 Goal reached! Processing reward...')
    setIsProcessing(true)
    
    try {
      // Record progress first
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
          pubkey: userPubkey,
          wordCount: wordCount,
          goal: stake.dailyWordGoal
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('[LightningGoalsMonitor] ✅ Reward sent successfully:', result)
        
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
        
        // Reload stake to get updated balance
        await loadCurrentStake()
        
        // Notify parent that word count was processed
        if (onWordCountProcessed) {
          onWordCountProcessed()
        }
        
        console.log('[LightningGoalsMonitor] ✅ Goal completed and reward sent!')
      } else {
        console.error('[LightningGoalsMonitor] Failed to send reward:', await response.text())
      }
    } catch (error) {
      console.error('[LightningGoalsMonitor] Error processing goal completion:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // Reset daily goal tracking at midnight
  useEffect(() => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const timeUntilMidnight = tomorrow.getTime() - now.getTime()
    
    const timer = setTimeout(() => {
      setHasMetGoalToday(false)
      console.log('[LightningGoalsMonitor] 🌅 New day - resetting goal tracking')
    }, timeUntilMidnight)
    
    return () => clearTimeout(timer)
  }, [])

  // This component doesn't render anything - it just monitors in the background
  return null
}
