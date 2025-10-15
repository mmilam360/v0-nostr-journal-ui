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
}

export function IncentiveModal({ 
  isOpen, 
  onClose, 
  userPubkey, 
  authData, 
  selectedNote,
  lastSavedWordCount,
  onWordCountProcessed
}: IncentiveModalProps) {
  const [hasSetup, setHasSetup] = useState(false)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
          {/* Setup Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold">Set Up Your Daily Goal</h3>
            </div>
            <AutomatedIncentiveSetup 
              userPubkey={userPubkey}
              authData={authData}
            />
          </div>

          {/* Reward Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Gift className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold">Daily Goal Progress</h3>
            </div>
            <AutomatedRewardTracker
              userPubkey={userPubkey}
              authData={authData}
              currentWordCount={lastSavedWordCount || undefined}
              onWordCountProcessed={onWordCountProcessed}
            />
          </div>

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
