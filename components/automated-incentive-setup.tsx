'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, Wallet, CheckCircle, AlertCircle, Clock } from 'lucide-react'

interface AutomatedIncentiveSetupProps {
  userPubkey: string
  authData: any
}

export function AutomatedIncentiveSetup({ userPubkey, authData }: AutomatedIncentiveSetupProps) {
  const [settings, setSettings] = useState({
    dailyWordGoal: 500,
    dailyRewardSats: 500,
    lightningAddress: '',
    stakeAmount: 10000 // Minimum 10k sats stake
  })
  const [hasSetup, setHasSetup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [depositInvoice, setDepositInvoice] = useState('')
  const [invoicePaid, setInvoicePaid] = useState(false)
  const [balance, setBalance] = useState(0)
  const [streak, setStreak] = useState(0)

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
      // For now, simulate creating an invoice
      // In production, this would call the Lightning API
      const mockInvoice = `lnbc${settings.stakeAmount}u1p${Math.random().toString(36).substring(7)}...`
      
      // Store pending setup locally
      const setupData = {
        pubkey: userPubkey,
        amount: settings.stakeAmount,
        dailyReward: settings.dailyRewardSats,
        wordGoal: settings.dailyWordGoal,
        lightningAddress: settings.lightningAddress,
        invoice: mockInvoice,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
      
      localStorage.setItem(`pending-setup-${userPubkey}`, JSON.stringify(setupData))
      setDepositInvoice(mockInvoice)
      
      console.log('[Demo] Created mock invoice:', mockInvoice)
      
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert('❌ Error creating stake invoice. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const checkPaymentStatus = async () => {
    if (!depositInvoice) return

    try {
      // For demo purposes, simulate payment confirmation
      // In production, this would check actual Lightning payment
      const pendingSetup = localStorage.getItem(`pending-setup-${userPubkey}`)
      
      if (pendingSetup) {
        // Simulate successful payment
        setInvoicePaid(true)
        setBalance(settings.stakeAmount)
        setHasSetup(true)
        
        // Save user account
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
        
        alert(`✅ Stake deposit confirmed!\n\n${settings.stakeAmount} sats deposited\nDaily goal: ${settings.dailyWordGoal} words\nReward: ${settings.dailyRewardSats} sats\n\nYour Lightning Goals are now active!`)
      }
    } catch (error) {
      console.error('Error checking payment:', error)
    }
  }

  const startDailyMonitoring = () => {
    // This would typically be handled server-side
    // For now, we'll simulate it
    console.log('Starting daily monitoring for user:', userPubkey)
  }

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset your Lightning Goals? This will cancel your stake and refund any remaining balance.')) {
      try {
        const response = await fetch('/api/incentive/reset-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pubkey: userPubkey })
        })

        if (response.ok) {
          setHasSetup(false)
          setBalance(0)
          setStreak(0)
          setInvoicePaid(false)
          setDepositInvoice('')
        }
      } catch (error) {
        console.error('Error resetting account:', error)
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
          
          <Button onClick={handleReset} variant="outline" size="sm" className="w-full">
            Reset Goals & Refund
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
            <label className="text-sm font-medium">Stake Amount (minimum 10,000 sats)</label>
            <Input
              type="number"
              value={settings.stakeAmount}
              onChange={(e) => setSettings({...settings, stakeAmount: Math.max(parseInt(e.target.value) || 10000, 10000)})}
              placeholder="10000"
              min="10000"
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
            disabled={loading || settings.stakeAmount < 10000}
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
              <div className="bg-white dark:bg-gray-800 p-2 rounded border font-mono text-xs break-all">
                {depositInvoice}
              </div>
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
            <li>• Pay Lightning invoice to stake sats</li>
            <li>• Write your daily word goal each day</li>
            <li>• Automatically receive rewards when goal is met</li>
            <li>• Missing days deduct from your stake balance</li>
            <li>• Build a consistent writing habit with real incentives</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
