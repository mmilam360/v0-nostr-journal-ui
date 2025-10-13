'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, Wallet, CheckCircle } from 'lucide-react'

interface SimpleIncentiveSetupProps {
  userPubkey: string
  authData: any
}

export function SimpleIncentiveSetup({ userPubkey, authData }: SimpleIncentiveSetupProps) {
  const [settings, setSettings] = useState({
    dailyWordGoal: 500,
    dailyRewardSats: 500,
    lightningAddress: '',
    stakeAmount: 5000
  })
  const [hasSetup, setHasSetup] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadExistingSettings()
  }, [])

  const loadExistingSettings = () => {
    // Check localStorage for existing settings
    const existing = localStorage.getItem(`incentive-settings-${userPubkey}`)
    if (existing) {
      const parsed = JSON.parse(existing)
      setSettings(parsed)
      setHasSetup(true)
    }
  }

  const handleSaveSettings = () => {
    setLoading(true)
    try {
      // Save to localStorage (simulated)
      const settingsData = {
        ...settings,
        createdDate: new Date().toISOString().split('T')[0],
        lastUpdated: new Date().toISOString().split('T')[0],
        stakeBalanceSats: settings.stakeAmount // Simulate stake
      }
      
      localStorage.setItem(`incentive-settings-${userPubkey}`, JSON.stringify(settingsData))
      setHasSetup(true)
      
      // Show success message
      alert(`✅ Lightning Goals setup complete!\n\nDaily Goal: ${settings.dailyWordGoal} words\nReward: ${settings.dailyRewardSats} sats\nStake: ${settings.stakeAmount} sats`)
      
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('❌ Error saving settings. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (confirm('Are you sure you want to reset your Lightning Goals setup?')) {
      localStorage.removeItem(`incentive-settings-${userPubkey}`)
      setHasSetup(false)
      setSettings({
        dailyWordGoal: 500,
        dailyRewardSats: 500,
        lightningAddress: '',
        stakeAmount: 5000
      })
    }
  }

  if (hasSetup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Lightning Goals Active
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Daily Goal:</span>
              <div className="font-medium">{settings.dailyWordGoal} words</div>
            </div>
            <div>
              <span className="text-muted-foreground">Reward:</span>
              <div className="font-medium">{settings.dailyRewardSats} sats</div>
            </div>
            <div>
              <span className="text-muted-foreground">Stake Balance:</span>
              <div className="font-medium">{settings.stakeAmount} sats</div>
            </div>
            <div>
              <span className="text-muted-foreground">Lightning Address:</span>
              <div className="font-medium font-mono text-xs">{settings.lightningAddress || 'Not set'}</div>
            </div>
          </div>
          
          <Button onClick={handleReset} variant="outline" size="sm" className="w-full">
            Reset Goals
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-500" />
          Set Up Your Daily Goal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Daily Word Goal</label>
            <Input
              type="number"
              value={settings.dailyWordGoal}
              onChange={(e) => setSettings({...settings, dailyWordGoal: parseInt(e.target.value) || 500})}
              placeholder="500"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Daily Reward (sats)</label>
            <Input
              type="number"
              value={settings.dailyRewardSats}
              onChange={(e) => setSettings({...settings, dailyRewardSats: parseInt(e.target.value) || 500})}
              placeholder="500"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Stake Amount (sats)</label>
            <Input
              type="number"
              value={settings.stakeAmount}
              onChange={(e) => setSettings({...settings, stakeAmount: parseInt(e.target.value) || 5000})}
              placeholder="5000"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Lightning Address (optional)</label>
            <Input
              type="text"
              value={settings.lightningAddress}
              onChange={(e) => setSettings({...settings, lightningAddress: e.target.value})}
              placeholder="yourname@getalby.com"
            />
          </div>
        </div>
        
        <Button 
          onClick={handleSaveSettings} 
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Saving...' : 'Save Goals'}
        </Button>
        
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4" />
            <span className="font-medium">How it works:</span>
          </div>
          <ul className="space-y-1">
            <li>• Set your daily writing goal</li>
            <li>• Stake Lightning sats as commitment</li>
            <li>• Earn rewards when you reach your goal</li>
            <li>• Build a consistent journaling habit</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
