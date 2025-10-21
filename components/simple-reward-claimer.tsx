'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Gift, Target, Zap, CheckCircle } from 'lucide-react'

interface SimpleRewardClaimerProps {
  userPubkey: string
  wordCount: number
  authData: any
}

export function SimpleRewardClaimer({ userPubkey, wordCount, authData }: SimpleRewardClaimerProps) {
  const [settings, setSettings] = useState<any>(null)
  const [todayProgress, setTodayProgress] = useState(0)
  const [hasClaimedToday, setHasClaimedToday] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadSettings()
    loadTodayProgress()
  }, [])

  const loadSettings = () => {
    const existing = localStorage.getItem(`incentive-settings-${userPubkey}`)
    if (existing) {
      setSettings(JSON.parse(existing))
    }
  }

  const loadTodayProgress = () => {
    const today = new Date().toISOString().split('T')[0]
    const progressKey = `daily-progress-${userPubkey}-${today}`
    const progress = localStorage.getItem(progressKey)
    const claimedKey = `claimed-today-${userPubkey}-${today}`
    const claimed = localStorage.getItem(claimedKey)
    
    if (progress) {
      setTodayProgress(parseInt(progress))
    }
    if (claimed) {
      setHasClaimedToday(true)
    }
  }

  const updateProgress = () => {
    const today = new Date().toISOString().split('T')[0]
    const progressKey = `daily-progress-${userPubkey}-${today}`
    
    // Add current note's word count to today's progress
    const newProgress = todayProgress + wordCount
    localStorage.setItem(progressKey, newProgress.toString())
    setTodayProgress(newProgress)
  }

  const handleClaimReward = () => {
    if (!settings) return
    
    setLoading(true)
    try {
      // Check if goal is met
      if (todayProgress < settings.dailyWordGoal) {
        alert(`❌ Goal not met yet!\n\nProgress: ${todayProgress}/${settings.dailyWordGoal} words\nStill need: ${settings.dailyWordGoal - todayProgress} words`)
        setLoading(false)
        return
      }

      // Check if already claimed today
      if (hasClaimedToday) {
        alert('✅ Reward already claimed today! Great job!')
        setLoading(false)
        return
      }

      // Claim reward
      const today = new Date().toISOString().split('T')[0]
      const claimedKey = `claimed-today-${userPubkey}-${today}`
      localStorage.setItem(claimedKey, 'true')
      
      // Update stake balance (simulate)
      const newBalance = settings.stakeBalanceSats + settings.dailyRewardSats
      const updatedSettings = { ...settings, stakeBalanceSats: newBalance }
      localStorage.setItem(`incentive-settings-${userPubkey}`, JSON.stringify(updatedSettings))
      setSettings(updatedSettings)
      setHasClaimedToday(true)
      
      alert(`🎉 Reward claimed!\n\n+${settings.dailyRewardSats} sats added to your balance\nNew balance: ${newBalance} sats`)
      
    } catch (error) {
      console.error('Error claiming reward:', error)
      alert('❌ Error claiming reward. Please try again.')
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">This note:</span>
            <span className="font-medium">{wordCount} words</span>
          </div>
          <Button 
            onClick={updateProgress}
            variant="outline" 
            size="sm" 
            className="w-full mt-2"
          >
            Add to Daily Progress
          </Button>
        </div>

        {/* Reward Status */}
        <div className="text-center">
          {goalMet ? (
            <div className="space-y-3">
              {hasClaimedToday ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Reward claimed today! 🎉</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <Target className="w-5 h-5" />
                    <span className="font-medium">Goal reached! 🎯</span>
                  </div>
                  <Button 
                    onClick={handleClaimReward}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    {loading ? 'Claiming...' : `Claim ${settings.dailyRewardSats} sats`}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">
              <p className="text-sm">
                Keep writing! Need {settings.dailyWordGoal - todayProgress} more words to reach your goal.
              </p>
            </div>
          )}
        </div>

        {/* Balance Info */}
        <div className="border-t pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stake Balance:</span>
            <span className="font-medium">{settings.stakeBalanceSats} sats</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
