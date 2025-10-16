'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { LightningGoalsManager } from './lightning-goals-manager'

interface IncentiveModalProps {
  isOpen: boolean
  onClose: () => void
  userPubkey: string
  authData: any
  selectedNote?: any
  lastSavedWordCount?: number
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

  useEffect(() => {
    if (isOpen && userPubkey) {
      // The LightningGoalsManager will handle checking setup status
      console.log('[IncentiveModal] Modal opened, checking setup status...')
    }
  }, [isOpen, userPubkey])

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
          <LightningGoalsManager
            userPubkey={userPubkey}
            authData={authData}
            currentWordCount={lastSavedWordCount}
            onWordCountProcessed={onWordCountProcessed}
            onSetupStatusChange={handleSetupStatusChange}
          />
        </CardContent>
      </Card>
    </div>
  )
}