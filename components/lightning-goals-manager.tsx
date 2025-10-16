'use client'

import { useState, useEffect } from 'react'
import { getLightningGoals, createStake, addToStake, cancelStake, updateLightningAddress } from '@/lib/lightning-goals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

export function LightningGoalsManager({ userPubkey, authData, userLightningAddress }: any) {
  const [goals, setGoals] = useState<any>(null)
  const [screen, setScreen] = useState<'setup' | 'tracking'>('setup')
  const [loading, setLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  
  // Setup form state
  const [dailyWordGoal, setDailyWordGoal] = useState(500)
  const [dailyReward, setDailyReward] = useState(100)
  const [depositAmount, setDepositAmount] = useState(1000)
  const [lightningAddress, setLightningAddress] = useState('')
  
  // Load goals
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const g = await getLightningGoals(userPubkey)
        
        if (g && g.status === 'active') {
          setGoals(g)
          setScreen('tracking')
        } else {
          setScreen('setup')
        }
        
        // Pre-fill Lightning address
        setLightningAddress(userLightningAddress || '')
      } catch (error) {
        console.error('[Manager] Error loading goals:', error)
        setScreen('setup')
      } finally {
        setLoading(false)
      }
    }
    
    load()
  }, [userPubkey, userLightningAddress])
  
  // Auto-refresh every 10 seconds when on tracking screen
  useEffect(() => {
    if (screen !== 'tracking') return
    
    const interval = setInterval(async () => {
      try {
        const g = await getLightningGoals(userPubkey)
        setGoals(g)
      } catch (error) {
        console.error('[Manager] Error refreshing goals:', error)
      }
    }, 10000)
    
    return () => clearInterval(interval)
  }, [screen, userPubkey])
  
  async function handleCreateStake() {
    if (!lightningAddress) {
      alert('Please enter your Lightning address')
      return
    }
    
    if (depositAmount < dailyReward) {
      alert('Deposit must be at least as much as the daily reward')
      return
    }
    
    try {
      setLoading(true)
      
      await createStake(userPubkey, {
        dailyWordGoal,
        dailyReward,
        depositAmount,
        lightningAddress
      }, authData)
      
      // Reload goals
      const g = await getLightningGoals(userPubkey)
      setGoals(g)
      setScreen('tracking')
      
      alert('Stake created successfully!')
      
    } catch (error) {
      console.error('[Manager] Error creating stake:', error)
      alert('Error creating stake: ' + error.message)
    } finally {
      setLoading(false)
    }
  }
  
  async function handleCancelStake() {
    if (!goals) return
    
    const confirmed = window.confirm(
      `⚠️ WARNING: Cancel your stake?\n\n` +
      `Your remaining balance of ${goals.currentBalance} sats will be FORFEITED (not refunded).\n\n` +
      `This action cannot be undone.\n\n` +
      `Are you sure?`
    )
    
    if (!confirmed) return
    
    // Double confirmation for safety
    const doubleConfirm = window.confirm(
      `Final confirmation:\n\n` +
      `You will LOSE ${goals.currentBalance} sats.\n\n` +
      `Click OK to forfeit your stake.`
    )
    
    if (!doubleConfirm) return
    
    setIsCancelling(true)
    
    try {
      console.log('[Manager] Cancelling stake...')
      
      const { forfeited } = await cancelStake(userPubkey, authData)
      
      console.log('[Manager] ✅ Stake cancelled')
      console.log('[Manager] 💸 Forfeited:', forfeited, 'sats')
      
      // Reset UI
      setGoals(null)
      setScreen('setup')
      
      alert(
        `Stake cancelled.\n\n` +
        `${forfeited} sats forfeited.\n\n` +
        `You can create a new stake anytime.`
      )
      
    } catch (error) {
      console.error('[Manager] ❌ Error:', error)
      alert('Error cancelling stake: ' + error.message)
    } finally {
      setIsCancelling(false)
    }
  }
  
  async function handleUpdateLightningAddress() {
    if (!lightningAddress) {
      alert('Please enter a Lightning address')
      return
    }
    
    try {
      await updateLightningAddress(userPubkey, lightningAddress, authData)
      
      // Update local state
      setGoals({ ...goals, lightningAddress })
      
      alert('Lightning address updated successfully!')
      
    } catch (error) {
      console.error('[Manager] Error updating Lightning address:', error)
      alert('Error updating Lightning address: ' + error.message)
    }
  }
  
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Loading Lightning Goals...</p>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <div className="space-y-4">
      {screen === 'tracking' && goals && (
        <div className="space-y-4">
          {/* Progress Card */}
          <Card>
            <CardHeader>
              <CardTitle>Your Writing Goal</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Today's Progress</span>
                  <span>{goals.todayWords} / {goals.dailyWordGoal} words</span>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all duration-500 ${
                      goals.todayGoalMet ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (goals.todayWords / goals.dailyWordGoal) * 100)}%`
                    }}
                  />
                </div>
                
                {goals.todayRewardSent && (
                  <div className="text-green-600 text-sm mt-2">
                    ✅ {goals.todayRewardAmount} sats earned today!
                  </div>
                )}
                
                {goals.todayGoalMet && !goals.todayRewardSent && (
                  <div className="text-orange-600 text-sm mt-2">
                    🎯 Goal met! Waiting for reward...
                  </div>
                )}
              </div>
              
              {/* Balance */}
              <div className="mb-4">
                <div className="text-sm text-gray-600">Current Balance</div>
                <div className="text-2xl font-bold">{goals.currentBalance} sats</div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Streak</div>
                  <div className="font-bold">{goals.currentStreak} days</div>
                </div>
                <div>
                  <div className="text-gray-600">Total Earned</div>
                  <div className="font-bold">{goals.totalRewardsEarned} sats</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Lightning Address */}
          <Card>
            <CardHeader>
              <CardTitle>Lightning Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={lightningAddress}
                  onChange={(e) => setLightningAddress(e.target.value)}
                  placeholder="your@lightning.address"
                  className="flex-1"
                />
                <Button
                  onClick={handleUpdateLightningAddress}
                  disabled={!lightningAddress || lightningAddress === goals.lightningAddress}
                >
                  Update
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Where daily rewards will be sent
              </p>
            </CardContent>
          </Card>
          
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleCancelStake}
                variant="destructive"
                disabled={isCancelling}
                className="w-full"
              >
                {isCancelling ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Cancelling...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Cancel Stake & Forfeit
                  </div>
                )}
              </Button>
              
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-sm text-red-700">
                  <p className="font-medium">⚠️ Warning</p>
                  <p className="mt-1">
                    Cancelling will forfeit your remaining balance of <strong>{goals.currentBalance} sats</strong>.
                  </p>
                  <p className="mt-1 text-xs">
                    This is your commitment to your writing goal.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {screen === 'setup' && (
        <Card>
          <CardHeader>
            <CardTitle>Set Up Lightning Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Daily Word Goal</label>
              <Input
                type="number"
                value={dailyWordGoal}
                onChange={(e) => setDailyWordGoal(parseInt(e.target.value) || 500)}
                placeholder="500"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Daily Reward (sats)</label>
              <Input
                type="number"
                value={dailyReward}
                onChange={(e) => setDailyReward(parseInt(e.target.value) || 100)}
                placeholder="100"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Initial Deposit (sats)</label>
              <Input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(parseInt(e.target.value) || 1000)}
                placeholder="1000"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Lightning Address</label>
              <Input
                type="text"
                value={lightningAddress}
                onChange={(e) => setLightningAddress(e.target.value)}
                placeholder="your@lightning.address"
              />
              <p className="text-xs text-gray-500 mt-1">
                Where daily rewards will be sent
              </p>
            </div>
            
            <Button
              onClick={handleCreateStake}
              disabled={loading || !lightningAddress || depositAmount < dailyReward}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Create Stake'}
            </Button>
            
            <div className="text-xs text-gray-500">
              <p>• You'll earn {dailyReward} sats each day you write {dailyWordGoal}+ words</p>
              <p>• Your deposit of {depositAmount} sats will be used to pay rewards</p>
              <p>• Cancelling forfeits your remaining balance</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}