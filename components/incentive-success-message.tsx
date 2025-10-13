'use client'

import { Check, X, Zap } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface IncentiveSuccessMessageProps {
  amount: number
  dailyReward: number
  onClose: () => void
}

export function IncentiveSuccessMessage({ 
  amount, 
  dailyReward,
  onClose 
}: IncentiveSuccessMessageProps) {
  const daysOfRewards = Math.floor(amount / dailyReward)
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex flex-col items-center text-center space-y-4">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          
          {/* Title and Amount */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Stake Deposited! ⚡
            </h2>
            <p className="text-gray-600 mt-2">
              Your stake of <span className="font-semibold text-orange-600">{amount} sats</span> has been confirmed.
            </p>
          </div>
          
          {/* Info Card */}
          <div className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-orange-500" />
              <p className="text-sm font-semibold text-gray-800">
                {daysOfRewards} days of rewards ready!
              </p>
            </div>
            <p className="text-xs text-gray-600">
              {dailyReward} sats per day when you hit your goal
            </p>
          </div>
          
          {/* Next Steps */}
          <div className="w-full bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-yellow-900 mb-2">
              📝 How it works:
            </p>
            <ul className="text-sm text-yellow-800 space-y-1 text-left">
              <li>1. Write your journal entry</li>
              <li>2. Hit your word goal (tracked automatically)</li>
              <li>3. Claim your daily reward ⚡</li>
              <li>4. <strong>Remember:</strong> Quitting forfeits your stake!</li>
            </ul>
          </div>
          
          {/* CTA Button */}
          <Button 
            onClick={onClose}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
          >
            Start Writing →
          </Button>
        </div>
      </Card>
    </div>
  )
}
