'use client'

import { useEffect, useState } from 'react'
import { ClientOnly } from './client-only'

export function BitcoinConnectLightningGoalsMonitor({ 
  userPubkey, 
  wordCount,
  authData 
}: { 
  userPubkey: string
  wordCount: number
  authData: any
}) {
  return (
    <ClientOnly fallback={null}>
      <BitcoinConnectLightningGoalsMonitorInner 
        userPubkey={userPubkey} 
        wordCount={wordCount} 
        authData={authData} 
      />
    </ClientOnly>
  )
}

function BitcoinConnectLightningGoalsMonitorInner({ 
  userPubkey, 
  wordCount,
  authData 
}: { 
  userPubkey: string
  wordCount: number
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
    if (goals && !hasCheckedToday && wordCount >= goals.goal) {
      checkAndSendReward()
    }
  }, [wordCount, goals, hasCheckedToday])
  
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
    
    // Get user's Lightning address
    let lightningAddress: string | null = null
    
    try {
      if (window.webln && window.webln.enabled) {
        const info = await window.webln.getInfo()
        lightningAddress = info.lightningAddress || null
        console.log('[Monitor] Lightning address from wallet:', lightningAddress)
      }
    } catch (e) {
      console.log('[Monitor] Could not get Lightning address from wallet:', e.message)
    }
    
    // Fallback: Check if user has it in their Nostr profile
    if (!lightningAddress) {
      try {
        // This would need to be implemented based on your profile system
        console.log('[Monitor] Checking Nostr profile for Lightning address...')
        // lightningAddress = profileEvent.lud16 || null
      } catch (e) {
        console.log('[Monitor] No Lightning address found in profile')
      }
    }
    
    if (!lightningAddress) {
      console.log('[Monitor] ⚠️ No Lightning address available for reward')
      alert('Add a Lightning address to your wallet or profile to receive rewards!')
      return
    }
    
    console.log('[Monitor] 💰 Sending reward to:', lightningAddress)
    
    // Calculate reward amount
    const rewardAmount = goals.stakePerWord * goals.goal
    
    try {
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lightningAddress,
          amount: rewardAmount,
          userPubkey
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
      
      await updateLightningGoals(userPubkey, authData, {
        ...goals,
        lastRewardDate: new Date().toISOString().split('T')[0]
      })
      
      await loadGoals()
    } catch (error) {
      console.error('[Monitor] Error updating goals:', error)
    }
  }
  
  if (!goals || goals.status !== 'active') {
    return null
  }
  
  return (
    <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg max-w-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold">Daily Goal</h3>
        <span className="text-sm text-gray-500">
          {wordCount} / {goals.goal}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className="bg-orange-500 h-2 rounded-full transition-all"
          style={{ width: `${Math.min(100, (wordCount / goals.goal) * 100)}%` }}
        />
      </div>
      
      {wordCount >= goals.goal ? (
        <p className="text-sm text-green-600 font-medium">
          ✅ Goal complete! Reward being processed...
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          {goals.goal - wordCount} words to go
        </p>
      )}
    </div>
  )
}
