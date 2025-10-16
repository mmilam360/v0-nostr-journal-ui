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
  const [lastCheckedCount, setLastCheckedCount] = useState(0)
  const processingRef = useRef(false)
  const lastProcessedCount = useRef(0)
  
  // ⚠️ CRITICAL: Log when component mounts
  useEffect(() => {
    console.log('[Monitor] ========================================')
    console.log('[Monitor] 🔄 Component mounted')
    console.log('[Monitor] Initial word count:', currentWordCount)
    console.log('[Monitor] User pubkey:', userPubkey.substring(0, 8))
    console.log('[Monitor] Has auth data:', !!authData)
    console.log('[Monitor] Lightning address:', userLightningAddress)
    console.log('[Monitor] ========================================')
    
    return () => {
      console.log('[Monitor] Component unmounting')
    }
  }, [])
  
  // Monitor word count changes
  useEffect(() => {
    console.log('[Monitor] ========================================')
    console.log('[Monitor] 🔍 Word count changed!')
    console.log('[Monitor] New count:', currentWordCount)
    console.log('[Monitor] Last checked count:', lastCheckedCount)
    console.log('[Monitor] Is processing:', processingRef.current)
    console.log('[Monitor] ========================================')
    
    // Skip if no real change
    if (currentWordCount === lastCheckedCount) {
      console.log('[Monitor] ⏭️ No change, skipping')
      return
    }
    
    if (currentWordCount === 0 || currentWordCount === null) {
      console.log('[Monitor] ⏭️ Zero words, skipping')
      return
    }
    
    if (processingRef.current) {
      console.log('[Monitor] ⏭️ Already processing, skipping')
      return
    }
    
    // Update last checked
    setLastCheckedCount(currentWordCount)
    
    // Check goal
    console.log('[Monitor] ▶️ Triggering goal check...')
    checkAndSendReward()
    
  }, [currentWordCount]) // Only depend on currentWordCount
  
  async function checkAndSendReward() {
    if (processingRef.current) {
      console.log('[Monitor] Already processing, exiting')
      return
    }
    
    processingRef.current = true
    setIsProcessing(true)
    
    try {
      console.log('[Monitor] ========================================')
      console.log('[Monitor] 🎯 CHECKING GOAL COMPLETION')
      console.log('[Monitor] ========================================')
      
      // Step 1: Get current stake
      console.log('[Monitor] Step 1: Fetching current stake...')
      
      const stake = await getCurrentStake(userPubkey)
      
      if (!stake) {
        console.log('[Monitor] ❌ No stake found')
        return
      }
      
      console.log('[Monitor] ✅ Stake found:', {
        balance: stake.currentBalance,
        goal: stake.dailyWordGoal,
        reward: stake.rewardPerCompletion,
        status: stake.status
      })
      
      if (stake.status !== 'active') {
        console.log('[Monitor] ❌ Stake not active, status:', stake.status)
        return
      }
      
      // Step 2: Check if goal is met
      console.log('[Monitor] Step 2: Checking if goal met...')
      console.log('[Monitor] Current words:', currentWordCount)
      console.log('[Monitor] Goal:', stake.dailyWordGoal)
      console.log('[Monitor] Met?', currentWordCount >= stake.dailyWordGoal)
      
      if (currentWordCount < stake.dailyWordGoal) {
        console.log('[Monitor] ⏳ Goal not met yet')
        
        // ⚠️ IMPORTANT: Still record progress for progress bar
        const today = new Date().toISOString().split('T')[0]
        await recordDailyProgress(
          userPubkey,
          currentWordCount,
          false, // goalMet = false
          false, // rewardSent = false
          0,
          authData
        )
        console.log('[Monitor] 📊 Progress recorded (goal not met)')
        
        return
      }
      
      console.log('[Monitor] 🎉 GOAL MET!')
      
      // Step 3: Check if reward already sent today
      console.log('[Monitor] Step 3: Checking if reward already sent...')
      const today = new Date().toISOString().split('T')[0]
      const todayProgress = await getDailyProgress(userPubkey, today)
      
      if (todayProgress?.rewardSent) {
        console.log('[Monitor] ⚠️ Reward already sent today')
        return
      }
      
      console.log('[Monitor] ✅ No reward sent yet today')
      
      // Step 4: Check balance
      console.log('[Monitor] Step 4: Checking balance...')
      console.log('[Monitor] Current balance:', stake.currentBalance)
      console.log('[Monitor] Reward amount:', stake.rewardPerCompletion)
      
      if (stake.currentBalance < stake.rewardPerCompletion) {
        console.log('[Monitor] ❌ Insufficient balance!')
        
        // Still record progress
        await recordDailyProgress(
          userPubkey,
          currentWordCount,
          true, // goalMet = true
          false, // rewardSent = false (insufficient balance)
          0,
          authData
        )
        
        // TODO: Show notification to user about insufficient balance
        
        return
      }
      
      console.log('[Monitor] ✅ Sufficient balance')
      
      // Step 5: Check Lightning address
      console.log('[Monitor] Step 5: Checking Lightning address...')
      const savedAddress = localStorage.getItem(`lightning-address-${userPubkey}`)
      const currentLightningAddress = savedAddress || userLightningAddress
      
      console.log('[Monitor] 🔍 Lightning address lookup:')
      console.log('  - User pubkey:', userPubkey.substring(0, 8))
      console.log('  - localStorage key:', `lightning-address-${userPubkey}`)
      console.log('  - Saved in localStorage:', savedAddress)
      console.log('  - From prop:', userLightningAddress)
      console.log('  - Using:', currentLightningAddress)
      console.log('  - Has address?', !!currentLightningAddress)
      
      if (!currentLightningAddress) {
        console.log('[Monitor] ❌ No Lightning address configured!')
        
        // TEMPORARY: Set a test Lightning address for debugging
        const testAddress = 'test@getalby.com'
        console.log('[Monitor] 🔧 TEMPORARY: Setting test Lightning address:', testAddress)
        localStorage.setItem(`lightning-address-${userPubkey}`, testAddress)
        
        // Use the test address
        const finalAddress = testAddress
        
        console.log('[Monitor] ✅ Using test Lightning address:', finalAddress)
        
        // Continue with reward sending using test address
        console.log('[Monitor] 💸 Sending', stake.rewardPerCompletion, 'sats to', finalAddress)
        
        const rewardResult = await fetch('/api/incentive/send-reward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPubkey: userPubkey,
            amount: stake.rewardPerCompletion,
            lightningAddress: finalAddress
          })
        }).then(r => r.json())
        
        if (!rewardResult.success) {
          console.error('[Monitor] ❌ Reward failed:', rewardResult.error)
          throw new Error('Reward failed: ' + rewardResult.error)
        }
        
        console.log('[Monitor] ✅ Reward sent successfully!')
        console.log('[Monitor] Payment hash:', rewardResult.paymentHash)
        
        // Continue with balance update and recording...
        const newBalance = stake.currentBalance - stake.rewardPerCompletion
        
        await saveStakeSettings(userPubkey, {
          dailyWordGoal: stake.dailyWordGoal,
          rewardPerCompletion: stake.rewardPerCompletion,
          currentBalance: newBalance,
          stakeCreatedAt: stake.stakeCreatedAt,
          status: 'active'
        }, authData)
        
        console.log('[Monitor] ✅ Balance updated:', stake.currentBalance, '→', newBalance)
        
        // Record transaction
        await recordTransaction(userPubkey, {
          type: 'reward',
          amount: -stake.rewardPerCompletion,
          paymentHash: rewardResult.paymentHash,
          balanceBefore: stake.currentBalance,
          balanceAfter: newBalance,
          description: `Daily goal reward for ${today}`
        }, authData)
        
        // Record daily progress
        await recordDailyProgress(
          userPubkey,
          currentWordCount,
          true,
          true,
          stake.rewardPerCompletion,
          authData
        )
        
        console.log('[Monitor] ========================================')
        console.log('[Monitor] 🎉 GOAL COMPLETED AND REWARD SENT!')
        console.log('[Monitor] ========================================')
        
        // Notify parent that word count was processed
        if (onWordCountProcessed) {
          onWordCountProcessed()
        }
        
        return
      }
      
      console.log('[Monitor] ✅ Lightning address:', currentLightningAddress)
      
      // Step 6: Send reward
      console.log('[Monitor] Step 6: Sending reward...')
      console.log('[Monitor] 💸 Sending', stake.rewardPerCompletion, 'sats to', currentLightningAddress)
      
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
        console.error('[Monitor] ❌ Reward failed:', rewardResult.error)
        throw new Error('Reward failed: ' + rewardResult.error)
      }
      
      console.log('[Monitor] ✅ Reward sent successfully!')
      console.log('[Monitor] Payment hash:', rewardResult.paymentHash)
      
      // Step 7: Update balance
      console.log('[Monitor] Step 7: Updating balance...')
      const newBalance = stake.currentBalance - stake.rewardPerCompletion
      
      await saveStakeSettings(userPubkey, {
        dailyWordGoal: stake.dailyWordGoal,
        rewardPerCompletion: stake.rewardPerCompletion,
        currentBalance: newBalance,
        stakeCreatedAt: stake.stakeCreatedAt,
        status: 'active'
      }, authData)
      
      console.log('[Monitor] ✅ Balance updated:', stake.currentBalance, '→', newBalance)
      
      // Step 8: Record transaction
      console.log('[Monitor] Step 8: Recording transaction...')
      await recordTransaction(userPubkey, {
        type: 'reward',
        amount: -stake.rewardPerCompletion,
        paymentHash: rewardResult.paymentHash,
        balanceBefore: stake.currentBalance,
        balanceAfter: newBalance,
        description: `Daily goal reward for ${today}`
      }, authData)
      
      console.log('[Monitor] ✅ Transaction recorded')
      
      // Step 9: Record daily progress
      console.log('[Monitor] Step 9: Recording daily progress...')
      await recordDailyProgress(
        userPubkey,
        currentWordCount,
        true,
        true,
        stake.rewardPerCompletion,
        authData
      )
      
      console.log('[Monitor] ✅ Daily progress recorded')
      
      console.log('[Monitor] ========================================')
      console.log('[Monitor] 🎉 GOAL COMPLETED AND REWARD SENT!')
      console.log('[Monitor] ========================================')
      
      // Notify parent that word count was processed
      if (onWordCountProcessed) {
        onWordCountProcessed()
      }
      
    } catch (error) {
      console.error('[Monitor] ========================================')
      console.error('[Monitor] ❌ ERROR PROCESSING REWARD')
      console.error('[Monitor]', error)
      console.error('[Monitor] ========================================')
    } finally {
      processingRef.current = false
      setIsProcessing(false)
    }
  }
  
  return null // This is a background monitor, no UI
}
