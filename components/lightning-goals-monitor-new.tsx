'use client'

import { useEffect, useState, useRef } from 'react'
import { 
  getCurrentStake, 
  getDailyProgress, 
  saveStakeSettings, 
  recordTransaction, 
  recordDailyProgress 
} from '@/lib/incentive-nostr-new'

interface LightningGoalsMonitorProps {
  userPubkey: string
  authData: any
  currentWordCount: number  // From main-app's lastSavedWordCount
  userLightningAddress: string
  onWordCountProcessed?: () => void
}

export function LightningGoalsMonitor({
  userPubkey,
  authData,
  currentWordCount,
  userLightningAddress,
  onWordCountProcessed
}: LightningGoalsMonitorProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const lastProcessedCount = useRef(0)
  
  // Monitor word count changes
  useEffect(() => {
    console.log('[Monitor] 🔍 useEffect triggered - currentWordCount:', currentWordCount, 'lastProcessed:', lastProcessedCount.current, 'isProcessing:', isProcessing)
    
    // Skip if no change or already processing
    if (currentWordCount === lastProcessedCount.current || isProcessing) {
      console.log('[Monitor] ⏭️ Skipping - no change or already processing')
      return
    }
    
    if (currentWordCount === 0 || currentWordCount === null) {
      console.log('[Monitor] ⏭️ Skipping - no words written yet')
      return // Skip if no words written yet
    }
    
    console.log('[Monitor] 🔍 Word count updated:', currentWordCount)
    lastProcessedCount.current = currentWordCount
    
    // Check if goal is met
    checkAndSendReward()
    
  }, [currentWordCount])
  
  async function checkAndSendReward() {
    if (isProcessing) return
    
    setIsProcessing(true)
    
    try {
      console.log('[Monitor] Checking goal completion...')
      
      // Get current stake
      const stake = await getCurrentStake(userPubkey)
      if (!stake || stake.status !== 'active') {
        console.log('[Monitor] No active stake')
        return
      }
      
      console.log('[Monitor] 📊 Current stake:', {
        dailyGoal: stake.dailyWordGoal,
        currentBalance: stake.currentBalance,
        rewardAmount: stake.rewardPerCompletion
      })
      
      // Check if goal is met
      if (currentWordCount < stake.dailyWordGoal) {
        console.log('[Monitor] Goal not met:', currentWordCount, '/', stake.dailyWordGoal)
        return
      }
      
      // Check if reward already sent today
      const today = new Date().toISOString().split('T')[0]
      const todayProgress = await getDailyProgress(userPubkey, today)
      
      if (todayProgress?.rewardSent) {
        console.log('[Monitor] Reward already sent today')
        return
      }
      
      // Check balance
      if (stake.currentBalance < stake.rewardPerCompletion) {
        console.log('[Monitor] ⚠️ Insufficient balance:', stake.currentBalance, 'sats')
        return
      }
      
      // Get current Lightning address (from localStorage or prop)
      const savedAddress = localStorage.getItem(`lightning-address-${userPubkey}`)
      const currentLightningAddress = savedAddress || userLightningAddress
      
      console.log('[Monitor] 🔍 Lightning address lookup:')
      console.log('  - Saved in localStorage:', savedAddress)
      console.log('  - From prop:', userLightningAddress)
      console.log('  - Using:', currentLightningAddress)
      
      if (!currentLightningAddress) {
        console.error('[Monitor] ❌ No Lightning address found for user')
        return
      }
      
      // Send reward
      console.log('[Monitor] 🎯 Sending reward of', stake.rewardPerCompletion, 'sats to', currentLightningAddress)
      
      const rewardResult = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: userPubkey,
          amount: stake.rewardPerCompletion,
          lightningAddress: currentLightningAddress
        })
      }).then(r => r.json())
      
      if (!rewardResult.success) {
        throw new Error('Reward failed: ' + (rewardResult.error || 'Unknown error'))
      }
      
      console.log('[Monitor] ✅ Reward sent! Payment hash:', rewardResult.paymentHash)
      
      // Update balance
      const newBalance = stake.currentBalance - stake.rewardPerCompletion
      
      await saveStakeSettings(userPubkey, {
        ...stake,
        currentBalance: newBalance
      }, authData)
      
      // Record transaction
      await recordTransaction(userPubkey, {
        type: 'reward',
        amount: -stake.rewardPerCompletion,
        paymentHash: rewardResult.paymentHash,
        balanceBefore: stake.currentBalance,
        balanceAfter: newBalance,
        description: `Daily goal reward for ${today}`
      }, authData)
      
      // Record progress
      await recordDailyProgress(
        userPubkey,
        currentWordCount,
        true,  // goalMet
        true,  // rewardSent
        stake.rewardPerCompletion,
        authData
      )
      
      console.log('[Monitor] 🎉 Goal completed and reward sent!')
      console.log('[Monitor] 📈 New balance:', newBalance, 'sats')
      
      // Notify parent that word count was processed
      if (onWordCountProcessed) {
        onWordCountProcessed()
      }
      
    } catch (error) {
      console.error('[Monitor] ❌ Error processing reward:', error)
    } finally {
      setIsProcessing(false)
    }
  }
  
  return null // This is a background monitor, no UI
}
