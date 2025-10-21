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
  
  // Monitor is now passive - main app handles all progress tracking and reward logic
  // This component just loads goals for display purposes
  useEffect(() => {
    console.log('[Monitor] 🔍 Monitor loaded goals:', { 
      hasGoals: !!goals, 
      status: goals?.status,
      todayWords: goals?.todayWords,
      dailyWordGoal: goals?.dailyWordGoal
    })
  }, [goals])
  
  async function loadGoals() {
    try {
      console.log('[Monitor] 🔍 Loading goals for user:', userPubkey.substring(0, 8))
      const { getLightningGoals } = await import('@/lib/lightning-goals')
      const data = await getLightningGoals(userPubkey)
      console.log('[Monitor] 📊 Goals loaded:', data)
      setGoals(data)
    } catch (error) {
      console.error('[Monitor] Error loading goals:', error)
    }
  }
  
  // Monitor no longer handles reward logic - main app handles everything
  
  // This component only handles the monitoring logic
  // The UI is handled by the Lightning Goals modal
  return null
}
