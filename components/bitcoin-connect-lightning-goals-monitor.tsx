'use client'

import { useEffect, useState } from 'react'
import { ClientOnly } from './client-only'

export function BitcoinConnectLightningGoalsMonitor({ 
  userPubkey, 
  currentWordCount,
  authData 
}: { 
  userPubkey: string
  currentWordCount: number
  authData: any
}) {
  return (
    <ClientOnly fallback={null}>
      <BitcoinConnectLightningGoalsMonitorInner 
        userPubkey={userPubkey} 
        currentWordCount={currentWordCount} 
        authData={authData} 
      />
    </ClientOnly>
  )
}

function BitcoinConnectLightningGoalsMonitorInner({ 
  userPubkey, 
  currentWordCount,
  authData 
}: { 
  userPubkey: string
  currentWordCount: number
  authData: any
}) {
  const [goals, setGoals] = useState<any>(null)
  const [hasCheckedToday, setHasCheckedToday] = useState(false)
  
  // Load goals
  useEffect(() => {
    loadGoals()
  }, [userPubkey])
  
  // Check if goal met
  useEffect(() => {
    if (goals && !hasCheckedToday && goals.status === 'active') {
      const wordsSinceStake = Math.max(0, currentWordCount - (goals.baselineWordCount || 0))
      if (wordsSinceStake >= goals.dailyWordGoal) {
        console.log('[Monitor] 🎯 Goal reached!', { wordsSinceStake, goal: goals.dailyWordGoal })
        checkAndSendReward()
      }
    }
  }, [currentWordCount, goals, hasCheckedToday])
  
  async function loadGoals() {
    try {
      const { getLightningGoals } = await import('@/lib/lightning-goals')
      const data = await getLightningGoals(userPubkey)
      setGoals(data)
    } catch (error) {
      console.error('[Monitor] Error loading goals:', error)
    }
  }
  
  async function checkAndSendReward() {
    console.log('[Monitor] 🎯 Goal reached! Checking eligibility...')
    
    if (!goals) {
      console.log('[Monitor] ⚠️ No goals found')
      return
    }
    
    // Check if reward already sent today
    if (goals.todayRewardSent) {
      console.log('[Monitor] ⚠️ Reward already sent today')
      return
    }
    
    // Check if goal is actually met
    const wordsSinceStake = Math.max(0, currentWordCount - (goals.baselineWordCount || 0))
    if (wordsSinceStake < goals.dailyWordGoal) {
      console.log('[Monitor] ⚠️ Goal not actually met:', { wordsSinceStake, goal: goals.dailyWordGoal })
      return
    }
    
    console.log('[Monitor] ✅ Goal confirmed! Sending reward...')
    
    // Get user's Lightning address from goals
    const lightningAddress = goals.lightningAddress
    
    if (!lightningAddress) {
      console.log('[Monitor] ⚠️ No Lightning address in goals')
      alert('No Lightning address found in your goals. Please update your settings.')
      return
    }
    
    console.log('[Monitor] 💰 Sending reward to:', lightningAddress)
    
    // Use the daily reward amount from goals
    const rewardAmount = goals.dailyReward
    
    try {
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amount: rewardAmount,
          lightningAddress: lightningAddress,
          isRefund: false
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        console.log('[Monitor] ✅ Reward sent!')
        alert(`🎉 Reward sent! ${rewardAmount} sats paid to ${lightningAddress}`)
        setHasCheckedToday(true)
        
        // Update goals event to mark reward claimed
        await updateGoalsAfterReward()
      } else {
        console.error('[Monitor] ❌ Reward failed:', result.error)
        alert('Failed to send reward: ' + result.error)
      }
      
    } catch (error) {
      console.error('[Monitor] ❌ Error sending reward:', error)
      alert('Error sending reward: ' + error.message)
    }
  }
  
  async function updateGoalsAfterReward() {
    try {
      const { updateLightningGoals } = await import('@/lib/lightning-goals')
      
      await updateLightningGoals(userPubkey, {
        ...goals,
        todayRewardSent: true,
        todayRewardAmount: goals.dailyReward,
        todayGoalMet: true,
        totalGoalsMet: (goals.totalGoalsMet || 0) + 1,
        totalRewardsEarned: (goals.totalRewardsEarned || 0) + goals.dailyReward,
        lastRewardDate: new Date().toISOString().split('T')[0],
        currentStreak: (goals.currentStreak || 0) + 1,
        lastUpdated: Date.now()
      }, authData)
      
      await loadGoals()
    } catch (error) {
      console.error('[Monitor] Error updating goals:', error)
    }
  }
  
  // This component only handles the monitoring logic
  // The UI is handled by the Lightning Goals modal
  return null
}
