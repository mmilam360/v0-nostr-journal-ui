'use client'

import { useEffect, useRef } from 'react'
import { getLightningGoals, updateWordCount, recordRewardSent } from '@/lib/lightning-goals'

interface Props {
  userPubkey: string
  authData: any
  currentWordCount: number
  userLightningAddress: string
}

export function LightningGoalsMonitor({
  userPubkey,
  authData,
  currentWordCount,
  userLightningAddress
}: Props) {
  const isProcessingRef = useRef(false)
  const lastCountRef = useRef(0)
  
  useEffect(() => {
    console.log('[Monitor] 🚀 Mounted')
    console.log('[Monitor] Initial word count:', currentWordCount)
    
    return () => console.log('[Monitor] Unmounting')
  }, [])
  
  useEffect(() => {
    if (currentWordCount === lastCountRef.current) return
    if (currentWordCount === 0) return
    if (isProcessingRef.current) return
    
    console.log('[Monitor] 🔍 Word count changed:', lastCountRef.current, '→', currentWordCount)
    
    lastCountRef.current = currentWordCount
    
    checkAndReward()
    
  }, [currentWordCount])
  
  async function checkAndReward() {
    if (isProcessingRef.current) return
    
    isProcessingRef.current = true
    
    try {
      console.log('[Monitor] ⚡ Checking goal...')
      
      // Update word count and check if reward needed
      const { shouldSendReward, rewardAmount } = await updateWordCount(
        userPubkey,
        currentWordCount,
        authData
      )
      
      if (!shouldSendReward) {
        console.log('[Monitor] No reward needed')
        return
      }
      
      console.log('[Monitor] 🎯 SENDING REWARD:', rewardAmount, 'sats')
      
      // Send reward
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amount: rewardAmount,
          lightningAddress: userLightningAddress
        })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      console.log('[Monitor] ✅ Reward sent!')
      
      // Record it
      await recordRewardSent(userPubkey, rewardAmount, authData)
      
      console.log('[Monitor] 🎉 Complete!')
      
    } catch (error) {
      console.error('[Monitor] ❌ Error:', error)
    } finally {
      isProcessingRef.current = false
    }
  }
  
  return null
}