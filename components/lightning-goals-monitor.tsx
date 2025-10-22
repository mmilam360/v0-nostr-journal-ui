'use client'

import { useEffect, useRef } from 'react'
import { getLightningGoals, updateWordCount, recordRewardSent } from '@/lib/lightning-goals'

interface Props {
  userPubkey: string
  authData: any
  currentWordCount: number
  userLightningAddress: string
  onGoalCompleted?: () => void
}

export function LightningGoalsMonitor({
  userPubkey,
  authData,
  currentWordCount,
  userLightningAddress,
  onGoalCompleted
}: Props) {
  const isProcessingRef = useRef(false)
  const lastCountRef = useRef(0)
  
  useEffect(() => {
    console.log('[Monitor] 🚀 Mounted')
    console.log('[Monitor] Initial word count:', currentWordCount)
    console.log('[Monitor] ⚡ Initial Lightning address:', userLightningAddress || 'NONE')
    
    return () => console.log('[Monitor] Unmounting')
  }, [])
  
  useEffect(() => {
    if (currentWordCount === lastCountRef.current) return
    if (currentWordCount === 0) return
    if (isProcessingRef.current) return
    
    console.log('[Monitor] 🔍 Word count changed:', lastCountRef.current, '→', currentWordCount)
    console.log('[Monitor] ⚡ Lightning address at trigger:', userLightningAddress || 'NONE')
    
    lastCountRef.current = currentWordCount
    
    checkAndReward()
    
  }, [currentWordCount])
  
  // Debug Lightning address changes
  useEffect(() => {
    console.log('[Monitor] ⚡ Lightning address changed to:', userLightningAddress || 'NONE')
  }, [userLightningAddress])
  
  async function checkAndReward() {
    if (isProcessingRef.current) return
    
    isProcessingRef.current = true
    
    try {
      console.log('[Monitor] ⚡ Checking goal...', {
        userPubkey: userPubkey.substring(0, 8),
        fullUserPubkey: userPubkey,
        currentWordCount,
        hasLightningAddress: !!userLightningAddress,
        lightningAddress: userLightningAddress || 'NONE'
      })
      
      // Update word count and check if reward needed
      const { shouldSendReward, rewardAmount } = await updateWordCount(
        userPubkey,
        currentWordCount,
        authData
      )
      
      console.log('[Monitor] 📊 Goal check result:', {
        shouldSendReward,
        rewardAmount,
        wordCount: currentWordCount
      })
      
      if (!shouldSendReward) {
        console.log('[Monitor] ❌ No reward needed')
        return
      }
      
      if (!userLightningAddress) {
        console.log('[Monitor] ❌ No Lightning address found for user')
        return
      }
      
      console.log('[Monitor] 🎯 SENDING REWARD:', rewardAmount, 'sats to', userLightningAddress)
      
      // ⚠️ CRITICAL: Call SERVER API (don't try to use NWC directly)
      console.log('[Monitor] 📡 Calling server API...')
      
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userPubkey: userPubkey,
          amount: rewardAmount,
          lightningAddress: userLightningAddress
        })
      })
      
      console.log('[Monitor] 📡 API response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.log('[Monitor] ❌ API error:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }
      
      const apiResult = await response.json()
      
      console.log('[Monitor] 📡 API result:', apiResult)
      
      if (!apiResult.success) {
        throw new Error(apiResult.error || 'Payment failed')
      }
      
      console.log('[Monitor] ✅ REWARD SENT!')
      console.log('[Monitor] 💰 Payment hash:', apiResult.paymentHash)
      
      // Record it
      await recordRewardSent(userPubkey, rewardAmount, authData)

      console.log('[Monitor] 🎉 Complete! Reward recorded in goals')

      // Trigger goal completion animation
      if (onGoalCompleted) {
        console.log('[Monitor] ⚡ Triggering goal completion animation')
        onGoalCompleted()
      }
      
    } catch (error) {
      console.error('[Monitor] ❌ Error sending reward:', error)
      
      if (error instanceof Error) {
        console.error('[Monitor] ❌ Error details:', {
          message: error.message,
          stack: error.stack
        })
      }
    } finally {
      isProcessingRef.current = false
    }
  }
  
  return null
}