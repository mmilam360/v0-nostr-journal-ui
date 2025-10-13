'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Gift, Target, Zap, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react'

interface AutomatedRewardTrackerProps {
  userPubkey: string
  authData: any
  currentWordCount: number // Pass from parent
}

export function AutomatedRewardTracker({ userPubkey, authData, currentWordCount }: AutomatedRewardTrackerProps) {
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
      const userAccount = localStorage.getItem(`user-account-${userPubkey}`)
      if (userAccount) {
        const data = JSON.parse(userAccount)
        setSettings(data.settings)
        setBalance(data.balance)
        setStreak(data.streak)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const loadTodayProgress = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const progress = localStorage.getItem(`daily-progress-${userPubkey}-${today}`)
      if (progress) {
        const data = JSON.parse(progress)
        setTodayProgress(data.wordCount || 0)
        setHasMetGoalToday(data.goalMet || false)
        setRewardSent(data.rewardSent || false)
      }
    } catch (error) {
      console.error('Error loading progress:', error)
    }
  }

  const checkDailyStatus = async () => {
    try {
      // For demo purposes, we'll skip penalty checking
      // In production, this would check for missed days and apply penalties
      console.log('Daily status check skipped for demo')
    } catch (error) {
      console.error('Error checking daily status:', error)
    }
  }

  const checkGoalStatus = async () => {
    if (!settings) return
    
    const goalReached = currentWordCount >= settings.dailyWordGoal
    
    // If goal just reached (wasn't met before, now is)
    if (goalReached && !goalMet) {
      console.log('[Tracker] 🎯 Goal reached!')
      setGoalMet(true)
      setShowZapAnimation(true)
      
      // Automatically record progress to Nostr
      await autoRecordProgress(goalReached)
      
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
      
      console.log('[Tracker] Auto-recording daily progress...')
      
      // For now, just update local state
      setTodayProgress(currentWordCount)
      setHasMetGoalToday(goalReached)
      
      console.log('[Tracker] ✅ Progress recorded')
      
    } catch (error) {
      console.error('[Tracker] Failed to record progress:', error)
    }
  }

  const handleClaimReward = async () => {
    setClaiming(true)
    try {
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: userPubkey
        })
      })

      if (response.ok) {
        const data = await response.json()
        setRewardSent(true)
        setHasMetGoalToday(true)
        
        // Show success notification
        alert(`🎉 Goal reached! ${data.amountSats} sats automatically sent to your Lightning address!\n\nPayment Hash: ${data.paymentHash}`)
        
        // Update local balance
        const userAccount = JSON.parse(localStorage.getItem(`user-account-${userPubkey}`) || '{}')
        userAccount.balance = Math.max(0, userAccount.balance - data.amountSats)
        userAccount.streak += 1
        localStorage.setItem(`user-account-${userPubkey}`, JSON.stringify(userAccount))
        
        setBalance(userAccount.balance)
        setStreak(userAccount.streak)
        
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send reward')
      }
      
    } catch (error) {
      console.error('Error claiming reward:', error)
      alert(`❌ Error claiming reward: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setClaiming(false)
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

  const progress = Math.min((currentWordCount / settings.dailyWordGoal) * 100, 100)
  
  return (
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
              {currentWordCount} / {settings.dailyWordGoal} words
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
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-800 mb-2">
              🎯 Goal Achieved!
            </p>
            <p className="text-sm text-green-700 mb-3">
              You've earned {settings.dailyRewardSats} sats today!
            </p>
            <Button
              onClick={handleClaimReward}
              disabled={claiming}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {claiming ? 'Claiming...' : `Claim ${settings.dailyRewardSats} sats ⚡`}
            </Button>
          </div>
        )}
        
        {rewardSent && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 text-center">
              ✅ Today's reward already claimed!
            </p>
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
              <span className="text-sm font-medium">Low Balance Warning</span>
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              Your balance is low. Consider adding more sats to avoid penalties for missed days.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
