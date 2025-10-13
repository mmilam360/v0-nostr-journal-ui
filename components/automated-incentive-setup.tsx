'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, Wallet, CheckCircle, AlertCircle, Clock, Copy, QrCode } from 'lucide-react'
import { IncentiveSuccessMessage } from './incentive-success-message'

interface AutomatedIncentiveSetupProps {
  userPubkey: string
  authData: any
}

export function AutomatedIncentiveSetup({ userPubkey, authData }: AutomatedIncentiveSetupProps) {
  const [settings, setSettings] = useState({
    dailyWordGoal: 500,
    dailyRewardSats: 500,
    lightningAddress: '',
    stakeAmount: 1000 // Default 1k sats stake, no minimum
  })
  const [hasSetup, setHasSetup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [depositInvoice, setDepositInvoice] = useState('')
  const [invoicePaid, setInvoicePaid] = useState(false)
  const [balance, setBalance] = useState(0)
  const [streak, setStreak] = useState(0)
  const [showQRCode, setShowQRCode] = useState(false)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState(0)

  useEffect(() => {
    loadExistingSettings()
  }, [])

  const loadExistingSettings = async () => {
    try {
      // Check if user has existing setup in localStorage
      const userAccount = localStorage.getItem(`user-account-${userPubkey}`)
      if (userAccount) {
        const data = JSON.parse(userAccount)
        setSettings(data.settings)
        setBalance(data.balance)
        setStreak(data.streak)
        setHasSetup(true)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const handleCreateStakeInvoice = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: userPubkey,
          amountSats: settings.stakeAmount
        })
      })

      if (response.ok) {
        const data = await response.json()
        setDepositInvoice(data.invoice)
        console.log('[Lightning] Created real invoice:', data.paymentHash)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create invoice')
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert(`❌ Error creating stake invoice: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const checkPaymentStatus = async () => {
    if (!depositInvoice) return

    setLoading(true)
    try {
      console.log('[Setup] 🔍 Checking payment status...')
      
      // For now, simulate payment confirmation after a delay
      // In production, this would check actual Lightning payment status
      await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
      
      // Simulate successful payment
      setInvoicePaid(true)
      setBalance(settings.stakeAmount)
      setHasSetup(true)
      setDepositedAmount(settings.stakeAmount)
      
      // CRITICAL: Save the actual balance to Nostr, not 0!
      console.log('[Setup] 💰 Payment confirmed! Saving balance to Nostr...')
      
      const { saveIncentiveSettings } = await import('@/lib/incentive-nostr')
      
      // Create settings object with ACTUAL deposited amount
      const updatedSettings = {
        dailyWordGoal: settings.dailyWordGoal,
        dailyRewardSats: settings.dailyRewardSats,
        stakeBalanceSats: settings.stakeAmount, // ✅ CRITICAL: Use actual deposit amount, not 0
        lightningAddress: settings.lightningAddress,
        createdDate: new Date().toISOString().split('T')[0],
        lastUpdated: new Date().toISOString().split('T')[0]
      }
      
      console.log('[Setup] Saving settings with balance:', updatedSettings.stakeBalanceSats)
      
      // Save to Nostr
      await saveIncentiveSettings(
        userPubkey,
        updatedSettings,
        authData
      )
      
      console.log('[Setup] ✅ Stake balance saved to Nostr')
      
      // Save user account locally for demo
      const userAccount = {
        pubkey: userPubkey,
        settings: {
          dailyWordGoal: settings.dailyWordGoal,
          dailyRewardSats: settings.dailyRewardSats,
          lightningAddress: settings.lightningAddress
        },
        balance: settings.stakeAmount,
        streak: 0,
        createdAt: new Date().toISOString()
      }
      
      localStorage.setItem(`user-account-${userPubkey}`, JSON.stringify(userAccount))
      
      // Show success UI instead of alert
      setShowSuccessMessage(true)
      
    } catch (error) {
      console.error('[Setup] ❌ Error checking payment:', error)
      alert('❌ Error checking payment status. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const startDailyMonitoring = () => {
    // This would typically be handled server-side
    // For now, we'll simulate it
    console.log('Starting daily monitoring for user:', userPubkey)
  }

  const copyInvoice = async () => {
    try {
      await navigator.clipboard.writeText(depositInvoice)
      alert('Invoice copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy invoice:', error)
      alert('Failed to copy invoice. Please copy manually.')
    }
  }

  const handleQuitChallenge = async () => {
    if (confirm('⚠️ WARNING: Are you sure you want to quit the Lightning Goals challenge?\n\nThis will:\n• Cancel your daily goals\n• FORFEIT your remaining stake balance\n• Reset your progress streak\n\nYou will NOT receive a refund. This action cannot be undone.\n\nAre you absolutely sure?')) {
      try {
        console.log('[Setup] User quitting challenge - forfeiting stake balance')
        
        // Clear local storage (simulate forfeiting stake)
        localStorage.removeItem(`user-account-${userPubkey}`)
        localStorage.removeItem(`daily-progress-${userPubkey}-${new Date().toISOString().split('T')[0]}`)
        
        // In a real implementation, you might want to record this as a forfeit event to Nostr
        // but the stake is gone - no refund
        
        alert('Challenge quit. Your stake has been forfeited. You can start a new challenge anytime.')
        setHasSetup(false)
        setBalance(0)
        setStreak(0)
        setInvoicePaid(false)
        setDepositInvoice('')
      } catch (error) {
        console.error('Error quitting challenge:', error)
        alert('Failed to quit challenge. Please try again.')
      }
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
              <span className="text-muted-foreground">Daily Reward:</span>
              <div className="font-medium">{settings.dailyRewardSats} sats</div>
            </div>
            <div>
              <span className="text-muted-foreground">Stake Balance:</span>
              <div className="font-medium">{balance} sats</div>
            </div>
            <div>
              <span className="text-muted-foreground">Current Streak:</span>
              <div className="font-medium">{streak} days</div>
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-medium">Automated System</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Rewards are automatically sent when you reach your daily goal. Missing days deduct from your stake.
            </p>
          </div>
          
          <Button onClick={handleQuitChallenge} variant="destructive" size="sm" className="w-full">
            Quit Challenge (Forfeit Stake)
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            Set Up Automated Lightning Goals
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
              onChange={(e) => setSettings({...settings, stakeAmount: Math.max(parseInt(e.target.value) || 1000, 1)})}
              placeholder="1000"
              min="1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Lightning Address</label>
            <Input
              type="text"
              value={settings.lightningAddress}
              onChange={(e) => setSettings({...settings, lightningAddress: e.target.value})}
              placeholder="yourname@getalby.com"
            />
          </div>
        </div>
        
        {!depositInvoice ? (
          <Button 
            onClick={handleCreateStakeInvoice} 
            disabled={loading || settings.stakeAmount < 1}
            className="w-full"
          >
            {loading ? 'Creating Invoice...' : `Create ${settings.stakeAmount} sats Stake Invoice`}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Payment Required</span>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                Pay this Lightning invoice to activate your goals:
              </p>
              <div className="bg-white dark:bg-gray-800 p-2 rounded border font-mono text-xs break-all mb-2">
                {depositInvoice}
              </div>
              
              {/* Copy and QR Code Buttons */}
              <div className="flex gap-2">
                <Button 
                  onClick={copyInvoice}
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Invoice
                </Button>
                <Button 
                  onClick={() => setShowQRCode(!showQRCode)}
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  {showQRCode ? 'Hide QR' : 'Show QR'}
                </Button>
              </div>
              
              {/* QR Code Display */}
              {showQRCode && (
                <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border">
                  <div className="flex justify-center">
                    <div className="bg-white p-2 rounded">
                      {/* Simple QR code placeholder - in production you'd use a QR library */}
                      <div className="w-32 h-32 bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500">
                        QR Code
                        <br />
                        {depositInvoice.substring(0, 20)}...
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-center text-gray-600 mt-2">
                    Scan with Lightning wallet
                  </p>
                </div>
              )}
            </div>
            
            <Button 
              onClick={checkPaymentStatus}
              className="w-full"
            >
              <Clock className="w-4 h-4 mr-2" />
              Check Payment Status
            </Button>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4" />
            <span className="font-medium">How it works:</span>
          </div>
          <ul className="space-y-1">
            <li>• Set any stake amount you're comfortable with</li>
            <li>• Write your daily word goal each day</li>
            <li>• Automatically receive rewards when goal is met</li>
            <li>• Missing days deduct from your stake balance</li>
            <li>• <strong>Quitting forfeits your stake</strong> - no refunds</li>
            <li>• Build a consistent writing habit with real commitment</li>
          </ul>
        </div>
      </CardContent>
    </Card>
    
    {/* Success Message Overlay */}
    {showSuccessMessage && (
      <IncentiveSuccessMessage
        amount={depositedAmount}
        dailyReward={settings.dailyRewardSats}
        onClose={() => {
          setShowSuccessMessage(false)
          // Optionally reload or update UI state
          window.location.reload()
        }}
      />
    )}
  </>
  )
}
