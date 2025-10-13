'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Gift, Target, Zap, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react'

interface AutomatedRewardTrackerProps {
  userPubkey: string
  wordCount: number
  authData: any
}

export function AutomatedRewardTracker({ userPubkey, wordCount, authData }: AutomatedRewardTrackerProps) {
  const [settings, setSettings] = useState<any>(null)
  const [todayProgress, setTodayProgress] = useState(0)
  const [balance, setBalance] = useState(0)
  const [streak, setStreak] = useState(0)
  const [hasMetGoalToday, setHasMetGoalToday] = useState(false)
  const [rewardSent, setRewardSent] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadSettings()
    loadTodayProgress()
    checkDailyStatus()
  }, [])

  useEffect(() => {
    // Auto-check if goal is met when word count changes
    if (settings && wordCount > 0) {
      checkGoalStatus()
    }
  }, [wordCount, settings])

  const loadSettings = async () => {
    try {
      const response = await fetch(`/api/incentive/get-settings?pubkey=${userPubkey}`)
      if (response.ok) {
        const data = await response.json()
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
      const response = await fetch(`/api/incentive/get-progress?pubkey=${userPubkey}&date=${today}`)
      if (response.ok) {
        const data = await response.json()
        setTodayProgress(data.wordCount)
        setHasMetGoalToday(data.goalMet)
        setRewardSent(data.rewardSent)
      }
    } catch (error) {
      console.error('Error loading progress:', error)
    }
  }

  const checkDailyStatus = async () => {
    try {
      // Check if penalties need to be applied for missed days
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
      console.error('Error checking daily status:', error)
    }
  }

  const checkGoalStatus = async () => {
    if (!settings) return

    const totalProgress = todayProgress + wordCount
    const goalMet = totalProgress >= settings.dailyWordGoal

    if (goalMet && !hasMetGoalToday && !rewardSent) {
      // Automatically send reward
      await sendReward(totalProgress)
    }
  }

  const sendReward = async (totalWords: number) => {
    setLoading(true)
    try {
      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: userPubkey,
          wordCount: totalWords,
          goal: settings.dailyWordGoal
        })
      })

      if (response.ok) {
        const data = await response.json()
        setRewardSent(true)
        setHasMetGoalToday(true)
        setBalance(data.newBalance)
        setStreak(data.newStreak)
        
        // Show success notification
        alert(`🎉 Goal reached! ${settings.dailyRewardSats} sats automatically sent to your Lightning address!`)
      } else {
        throw new Error('Failed to send reward')
      }
    } catch (error) {
      console.error('Error sending reward:', error)
      alert('❌ Error sending reward. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const addToProgress = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/incentive/add-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: userPubkey,
          wordCount: wordCount,
          noteContent: 'Note added to daily progress'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setTodayProgress(data.totalProgress)
        setBalance(data.balance)
        setStreak(data.streak)
        
        if (data.goalMet && !rewardSent) {
          setRewardSent(true)
          setHasMetGoalToday(true)
          alert(`🎉 Daily goal reached! ${settings.dailyRewardSats} sats automatically sent!`)
        }
      }
    } catch (error) {
      console.error('Error adding progress:', error)
      alert('❌ Error adding progress. Please try again.')
    } finally {
      setLoading(false)
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

  const goalMet = todayProgress >= settings.dailyWordGoal
  const progressPercent = Math.min((todayProgress / settings.dailyWordGoal) * 100, 100)
  const withCurrentNote = Math.min(((todayProgress + wordCount) / settings.dailyWordGoal) * 100, 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-green-500" />
          Daily Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress: {todayProgress}/{settings.dailyWordGoal} words</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${goalMet ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Current Note Contribution */}
        <div className="bg-muted/50 p-3 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">This note:</span>
            <span className="font-medium">{wordCount} words</span>
          </div>
          
          {wordCount > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>With this note:</span>
                <span>{Math.round(withCurrentNote)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1">
                <div 
                  className={`h-1 rounded-full transition-all ${withCurrentNote >= 100 ? 'bg-green-500' : 'bg-blue-400'}`}
                  style={{ width: `${withCurrentNote}%` }}
                />
              </div>
            </div>
          )}
          
          <Button 
            onClick={addToProgress}
            disabled={loading || wordCount === 0}
            variant="outline" 
            size="sm" 
            className="w-full mt-2"
          >
            {loading ? 'Adding...' : 'Add to Daily Progress'}
          </Button>
        </div>

        {/* Status Display */}
        <div className="text-center">
          {hasMetGoalToday ? (
            <div className="space-y-3">
              {rewardSent ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Reward sent automatically! 🎉</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <Target className="w-5 h-5" />
                  <span className="font-medium">Goal reached! Processing reward...</span>
                </div>
              )}
            </div>
          ) : goalMet ? (
            <div className="flex items-center justify-center gap-2 text-green-600">
              <Target className="w-5 h-5" />
              <span className="font-medium">Goal reached! Add to progress to claim reward</span>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <p className="text-sm">
                Keep writing! Need {settings.dailyWordGoal - todayProgress} more words to reach your goal.
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{balance}</div>
            <div className="text-xs text-muted-foreground">Balance</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{streak}</div>
            <div className="text-xs text-muted-foreground">Streak</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-600">{settings.dailyRewardSats}</div>
            <div className="text-xs text-muted-foreground">Reward</div>
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
