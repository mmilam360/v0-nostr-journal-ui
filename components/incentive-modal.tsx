"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { X, Zap, Target, Gift, Wallet } from "lucide-react"
import { AutomatedIncentiveSetup } from "@/components/automated-incentive-setup"
import { AutomatedRewardTracker } from "@/components/automated-reward-tracker"
import type { AuthData } from "@/components/main-app"

interface IncentiveModalProps {
  isOpen: boolean
  onClose: () => void
  userPubkey: string
  authData: AuthData
  selectedNote?: any
  lastSavedWordCount?: number | null
  onWordCountProcessed?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
}

export function IncentiveModal({ 
  isOpen, 
  onClose, 
  userPubkey, 
  authData,
  selectedNote,
  lastSavedWordCount,
  onWordCountProcessed,
  onSetupStatusChange
}: IncentiveModalProps) {
  const [hasSetup, setHasSetup] = useState(false)
  const [paymentInProgress, setPaymentInProgress] = useState(false)

  // Check if user has Lightning Goals setup
  const checkSetup = async () => {
    try {
      console.log('[IncentiveModal] 🔄 Checking setup status...')
      const { getCurrentStake } = await import('@/lib/incentive-nostr')
      const stake = await getCurrentStake(userPubkey)
      const hasSetupValue = !!stake && stake.isActive
      console.log('[IncentiveModal] 🔄 Setup status:', hasSetupValue, stake ? `(Stake ID: ${stake.stakeId})` : '')
      setHasSetup(hasSetupValue)
      
      // Reset payment in progress state
      setPaymentInProgress(false)
      
      // Notify parent component of setup status change
      if (onSetupStatusChange) {
        onSetupStatusChange(hasSetupValue)
      }
    } catch (error) {
      console.error('[IncentiveModal] Error checking setup:', error)
      setHasSetup(false)
    }
  }

  useEffect(() => {
    if (isOpen && userPubkey) {
      checkSetup()
    }
  }, [isOpen, userPubkey])

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
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Lightning Goals
          </CardTitle>
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Setup Section - Only show if user doesn't have setup and payment not in progress */}
          {!hasSetup && !paymentInProgress && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-semibold">Set Up Your Daily Goal</h3>
              </div>
              <AutomatedIncentiveSetup 
                userPubkey={userPubkey}
                authData={authData}
                onPaymentSuccess={() => {
                  // Immediately set payment in progress to prevent flashing
                  setPaymentInProgress(true)
                  // Refresh setup status when payment is successful
                  checkSetup()
                }}
              />
            </div>
          )}

          {/* Reward Section - Show if user has setup OR payment in progress */}
          {(hasSetup || paymentInProgress) && (
            <div>
              <AutomatedRewardTracker
                userPubkey={userPubkey}
                authData={authData}
                currentWordCount={lastSavedWordCount || undefined}
                onWordCountProcessed={onWordCountProcessed}
                onCancelStake={() => {
                  // Refresh the modal state after stake cancellation
                  checkSetup()
                }}
                isNewStake={paymentInProgress}
              />
            </div>
          )}

          {/* Info Section */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <h4 className="font-medium">How it works:</h4>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Set a daily word goal for your journaling</li>
              <li>• Stake Lightning sats as a commitment</li>
              <li>• Earn rewards when you reach your goal</li>
              <li>• Build a consistent writing habit</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
