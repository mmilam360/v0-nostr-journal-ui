'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { fetchIncentiveSettings, saveIncentiveSettings } from '@/lib/incentive-nostr'

export function IncentiveSetup({ userPubkey, authData }: any) {
  const [step, setStep] = useState(1)
  const [settings, setSettings] = useState({
    dailyWordGoal: 500,
    dailyRewardSats: 500,
    lightningAddress: '',
    stakeAmount: 5000
  })
  const [depositInvoice, setDepositInvoice] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadExistingSettings()
  }, [])

  const loadExistingSettings = async () => {
    const existing = await fetchIncentiveSettings(userPubkey)
    if (existing) {
      // User already has settings
      setStep(5) // Skip to complete
    }
  }

  const handleCreateDeposit = async () => {
    setLoading(true)
    try {
      // Save settings first
      await saveIncentiveSettings(
        userPubkey,
        {
          dailyWordGoal: settings.dailyWordGoal,
          dailyRewardSats: settings.dailyRewardSats,
          stakeBalanceSats: 0,
          lightningAddress: settings.lightningAddress,
          createdDate: new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString().split('T')[0]
        },
        authData
      )

      // Create deposit invoice
      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: settings.stakeAmount
        })
      })

      const { invoice } = await response.json()
      setDepositInvoice(invoice)
      setStep(4)
    } catch (error) {
      alert('Failed to create deposit invoice')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Set Up Daily Writing Incentive</h2>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Daily Word Goal
            </label>
            <Input
              type="number"
              value={settings.dailyWordGoal}
              onChange={(e) => setSettings({...settings, dailyWordGoal: parseInt(e.target.value)})}
              placeholder="500"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Words you need to write each day
            </p>
          </div>
          <Button onClick={() => setStep(2)} className="w-full">
            Next
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Daily Reward (sats)
            </label>
            <Input
              type="number"
              value={settings.dailyRewardSats}
              onChange={(e) => setSettings({...settings, dailyRewardSats: parseInt(e.target.value)})}
              placeholder="500"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Sats you'll receive when you hit your goal
            </p>
          </div>
          <Button onClick={() => setStep(3)} className="w-full">
            Next
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Lightning Address
            </label>
            <Input
              type="text"
              value={settings.lightningAddress}
              onChange={(e) => setSettings({...settings, lightningAddress: e.target.value})}
              placeholder="you@getalby.com"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Where you'll receive your rewards
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Initial Stake Amount (sats)
            </label>
            <Input
              type="number"
              value={settings.stakeAmount}
              onChange={(e) => setSettings({...settings, stakeAmount: parseInt(e.target.value)})}
              placeholder="5000"
            />
            <p className="text-sm text-muted-foreground mt-1">
              This gives you {Math.floor(settings.stakeAmount / settings.dailyRewardSats)} days of rewards
            </p>
          </div>

          <Button 
            onClick={handleCreateDeposit} 
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Creating...' : 'Create Deposit Invoice'}
          </Button>
        </div>
      )}

      {step === 4 && depositInvoice && (
        <div className="space-y-4">
          <h3 className="font-semibold">Pay This Invoice to Activate</h3>
          <div className="p-4 bg-gray-100 rounded break-all text-sm font-mono">
            {depositInvoice}
          </div>
          <Button onClick={() => window.location.reload()} className="w-full">
            I've Paid the Invoice
          </Button>
        </div>
      )}
    </Card>
  )
}
