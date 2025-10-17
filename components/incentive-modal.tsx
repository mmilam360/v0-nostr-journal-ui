'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { BitcoinConnectLightningGoalsManager } from './bitcoin-connect-lightning-goals-manager'

function LightningGoalsSummary({ 
  goals, 
  currentWordCount, 
  userPubkey, 
  authData, 
  onRefresh,
  onSetupStatusChange,
  onClose
}: { 
  goals: any
  currentWordCount: number
  userPubkey: string
  authData: any
  onRefresh: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
  onClose?: () => void
}) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  
  // Fix negative numbers by properly handling baseline word count
  const wordsSinceStake = Math.max(0, currentWordCount - (goals.baselineWordCount || 0))
  const progressPercentage = Math.min(100, (wordsSinceStake / goals.dailyWordGoal) * 100)
  const wordsToGo = Math.max(0, goals.dailyWordGoal - wordsSinceStake)
  
  const handleCancelStake = async () => {
    try {
      const { updateLightningGoals } = await import('@/lib/lightning-goals')
      await updateLightningGoals(userPubkey, {
        ...goals,
        status: 'cancelled',
        lastUpdated: Date.now()
      }, authData)
      
      console.log('[Summary] ✅ Stake cancelled')
      setShowCancelConfirm(false)
      
      // Reset header status to show "Set Up Daily Goal"
      if (onSetupStatusChange) {
        onSetupStatusChange(false)
      }
      
      // Close the modal after successful cancellation
      if (onClose) {
        onClose()
      }
      
      onRefresh()
    } catch (error) {
      console.error('[Summary] ❌ Error cancelling stake:', error)
      alert('Failed to cancel stake: ' + error.message)
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="text-center">
        <div className="text-4xl mb-2">⚡</div>
        <h2 className="text-2xl font-bold text-green-600">Active Lightning Goal</h2>
        <p className="text-gray-600">Write {goals.dailyWordGoal} words daily to earn rewards</p>
      </div>
      
      {/* Progress Section */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Today's Progress</h3>
          <span className="text-sm text-gray-500">
            {wordsSinceStake} / {goals.dailyWordGoal} words
          </span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
          <div 
            className={`h-3 rounded-full transition-all duration-500 ${
              wordsSinceStake >= goals.dailyWordGoal 
                ? 'bg-gradient-to-r from-green-500 to-green-600' 
                : 'bg-gradient-to-r from-orange-500 to-orange-600'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        {wordsSinceStake >= goals.dailyWordGoal ? (
          <div className="text-center space-y-2">
            <p className="text-green-600 font-medium text-lg">
              {goals.todayRewardSent ? '✅ Reward sent!' : '🎉 Goal complete! Processing reward...'}
            </p>
            {goals.todayRewardSent && (
              <p className="text-green-700 text-sm font-medium">
                Rewards have been paid out today for reaching your goal
              </p>
            )}
          </div>
        ) : (
          <p className="text-center text-gray-600">
            {wordsToGo} words to go
          </p>
        )}
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-600">{goals.dailyReward}</div>
          <div className="text-sm text-gray-600">Daily Reward (sats)</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-600">{goals.currentBalance}</div>
          <div className="text-sm text-gray-600">Current Balance (sats)</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-600">{goals.currentStreak || 0}</div>
          <div className="text-sm text-gray-600">Day Streak</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-orange-600">{goals.totalGoalsMet || 0}</div>
          <div className="text-sm text-gray-600">Goals Met</div>
        </div>
      </div>
      
      {/* History */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-3">Recent History</h3>
        {goals.history && goals.history.length > 0 ? (
          <div className="space-y-3">
            {goals.history.slice(-7).reverse().map((day: any, index: number) => (
              <div key={index} className="flex justify-between items-center text-sm bg-white p-3 rounded-lg border">
                <div className="flex flex-col">
                  <span className="font-medium">{day.date}</span>
                  <span className="text-gray-500 text-xs">
                    {day.words} words written
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <span className={day.goalMet ? 'text-green-600' : 'text-red-600'}>
                        {day.goalMet ? '✅ Goal Met' : '❌ Goal Missed'}
                      </span>
                    </div>
                    {day.rewardSent && (
                      <span className="text-green-600 text-xs font-medium">
                        💰 {goals.dailyReward} sats paid out
                      </span>
                    )}
                    {/* Show transaction history */}
                    {day.transactions && day.transactions.length > 0 && (
                      <div className="flex flex-col items-end gap-1 mt-2">
                        {day.transactions.map((tx: any, txIndex: number) => (
                          <div key={txIndex} className="flex items-center gap-1">
                            {tx.type === 'deposit' && (
                              <span className="text-blue-600 text-xs">
                                💳 +{tx.amount} sats deposit
                              </span>
                            )}
                            {tx.type === 'payout' && (
                              <span className="text-green-600 text-xs">
                                💰 -{tx.amount} sats payout
                              </span>
                            )}
                            {tx.type === 'refund' && (
                              <span className="text-orange-600 text-xs">
                                🔄 +{tx.amount} sats refund
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No history yet</p>
        )}
      </div>
      
      {/* Actions */}
      <div className="flex gap-3">
        <Button 
          onClick={onRefresh}
          variant="outline"
          className="flex-1"
        >
          Refresh
        </Button>
        <Button 
          onClick={() => setShowCancelConfirm(true)}
          variant="destructive"
          className="flex-1"
        >
          Cancel Stake
        </Button>
      </div>
      
      {/* Lightning Address */}
      <div className="text-center text-sm text-gray-500">
        <p>Rewards sent to: <span className="font-mono">{goals.lightningAddress}</span></p>
      </div>

      {/* Cancel Stake Confirmation Popup */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full">
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold mb-2">Cancel Lightning Goal?</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to cancel your current stake? You will not receive a refund of your {goals.currentBalance} sats balance.
              </p>
              <div className="flex gap-3">
                <Button 
                  onClick={() => setShowCancelConfirm(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Keep Goal
                </Button>
                <Button 
                  onClick={handleCancelStake}
                  variant="destructive"
                  className="flex-1"
                >
                  Cancel Stake
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface IncentiveModalProps {
  isOpen: boolean
  onClose: () => void
  userPubkey: string
  authData: any
  selectedNote?: any
  lastSavedWordCount?: number
  userLightningAddress?: string
  onWordCountProcessed?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
  onStakeActivated?: () => void
}

export function IncentiveModal({
  isOpen,
  onClose,
  userPubkey,
  authData,
  selectedNote,
  lastSavedWordCount,
  userLightningAddress,
  onWordCountProcessed,
  onSetupStatusChange,
  onStakeActivated
}: IncentiveModalProps) {
  const [hasSetup, setHasSetup] = useState(false)
  const [goals, setGoals] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen && userPubkey) {
      loadGoals()
    }
  }, [isOpen, userPubkey])

  const loadGoals = async () => {
    try {
      setLoading(true)
      const { getLightningGoals } = await import('@/lib/lightning-goals')
      const data = await getLightningGoals(userPubkey)
      
      console.log('[IncentiveModal] 📊 Loaded goals:', data)
      setGoals(data)
      setHasSetup(data && data.status === 'active')
      
      if (onSetupStatusChange) {
        onSetupStatusChange(data && data.status === 'active')
      }
    } catch (error) {
      console.error('[IncentiveModal] Error loading goals:', error)
      setGoals(null)
      setHasSetup(false)
    } finally {
      setLoading(false)
    }
  }

  const handleSetupStatusChange = (hasSetupValue: boolean) => {
    setHasSetup(hasSetupValue)
    if (onSetupStatusChange) {
      onSetupStatusChange(hasSetupValue)
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            Lightning Goals
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading Lightning Goals...</p>
            </div>
          ) : goals && goals.status === 'active' ? (
            <LightningGoalsSummary
              goals={goals}
              currentWordCount={lastSavedWordCount || 0}
              userPubkey={userPubkey}
              authData={authData}
              onRefresh={loadGoals}
              onSetupStatusChange={onSetupStatusChange}
              onClose={onClose}
            />
                 ) : (
                   <BitcoinConnectLightningGoalsManager
                     userPubkey={userPubkey}
                     authData={authData}
                     currentWordCount={lastSavedWordCount || 0}
                   />
                 )}
        </CardContent>
      </Card>
    </div>
  )
}