'use client'

import { useState, useEffect } from 'react'
import { getLightningGoals, createStake, addToStake, cancelStake, updateLightningAddress, confirmPayment } from '@/lib/lightning-goals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, QrCode } from 'lucide-react'

export function LightningGoalsManager({ userPubkey, authData, userLightningAddress }: any) {
  const [goals, setGoals] = useState<any>(null)
  const [screen, setScreen] = useState<'setup' | 'invoice' | 'tracking'>('setup')
  const [loading, setLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  
  // Setup form state
  const [dailyWordGoal, setDailyWordGoal] = useState('')
  const [dailyReward, setDailyReward] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [lightningAddress, setLightningAddress] = useState('')
  
  // Payment flow state
  const [invoiceData, setInvoiceData] = useState<any>(null)
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'checking' | 'confirmed'>('pending')
  
  // Input validation
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({})
  const [isFormValid, setIsFormValid] = useState(false)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
  
  // Load goals
  useEffect(() => {
    async function load() {
      console.log('[Manager] 🔍 Loading goals for user:', userPubkey?.substring(0, 8))
      setLoading(true)
      try {
        const g = await getLightningGoals(userPubkey)
        console.log('[Manager] 📊 Loaded goals:', g)
        
        if (g && g.status === 'active') {
          console.log('[Manager] ✅ Active goals found, showing tracking screen')
          setGoals(g)
          setScreen('tracking')
        } else if (g && g.status === 'pending_payment') {
          console.log('[Manager] ⏳ Pending payment found, showing invoice screen')
          setGoals(g)
          setScreen('invoice')
        } else {
          console.log('[Manager] 📝 No goals found, showing setup screen')
          setScreen('setup')
        }
        
        // Pre-fill Lightning address
        setLightningAddress(userLightningAddress || '')
      } catch (error) {
        console.error('[Manager] ❌ Error loading goals:', error)
        console.log('[Manager] 📝 Error occurred, showing setup screen')
        setScreen('setup')
      } finally {
        console.log('[Manager] ✅ Loading complete, screen set to:', screen)
        setLoading(false)
      }
    }
    
    if (userPubkey) {
      load()
    }
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
  
  // Validate inputs whenever form values change
  useEffect(() => {
    validateInputs()
    
    // Reset attempted submit flag when user starts typing
    if (hasAttemptedSubmit) {
      setHasAttemptedSubmit(false)
      setValidationErrors({})
    }
  }, [dailyWordGoal, dailyReward, depositAmount, lightningAddress])
  
  // Input validation
  function validateInputs(showErrors: boolean = false) {
    const errors: {[key: string]: string} = {}
    
    if (!dailyWordGoal || dailyWordGoal.trim() === '') {
      if (showErrors) errors.dailyWordGoal = 'Daily word goal is required'
    } else if (parseInt(dailyWordGoal) <= 0) {
      if (showErrors) errors.dailyWordGoal = 'Daily word goal must be greater than 0'
    }
    
    if (!dailyReward || dailyReward.trim() === '') {
      if (showErrors) errors.dailyReward = 'Daily reward is required'
    } else if (parseInt(dailyReward) <= 0) {
      if (showErrors) errors.dailyReward = 'Daily reward must be greater than 0'
    }
    
    if (!depositAmount || depositAmount.trim() === '') {
      if (showErrors) errors.depositAmount = 'Deposit amount is required'
    } else if (parseInt(depositAmount) <= 0) {
      if (showErrors) errors.depositAmount = 'Deposit amount must be greater than 0'
    }
    
    if (!lightningAddress || lightningAddress.trim() === '') {
      if (showErrors) errors.lightningAddress = 'Lightning address is required'
    }
    
    // Check if deposit is sufficient for daily reward
    if (dailyReward && depositAmount && parseInt(depositAmount) < parseInt(dailyReward)) {
      if (showErrors) errors.depositAmount = 'Deposit must be at least as much as the daily reward'
    }
    
    if (showErrors) {
      setValidationErrors(errors)
    }
    
    const isValid = Object.keys(errors).length === 0
    setIsFormValid(isValid)
    return isValid
  }
  
  async function handleCreateStake() {
    setHasAttemptedSubmit(true)
    
    if (!validateInputs(true)) {
      return
    }
    
    try {
      setLoading(true)
      
      // Create stake with pending payment status
      await createStake(userPubkey, {
        dailyWordGoal: parseInt(dailyWordGoal),
        dailyReward: parseInt(dailyReward),
        depositAmount: parseInt(depositAmount),
        lightningAddress: lightningAddress.trim()
      }, authData)
      
      // Generate Lightning invoice
      console.log('[Manager] Generating Lightning invoice...')
      
      const invoiceResponse = await fetch('/api/incentive/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseInt(depositAmount),
          description: `Lightning Goals stake - ${dailyWordGoal} words/day for ${dailyReward} sats`
        })
      })
      
      console.log('[Manager] Invoice response status:', invoiceResponse.status)
      console.log('[Manager] Invoice response headers:', invoiceResponse.headers.get('content-type'))
      
      if (!invoiceResponse.ok) {
        const errorText = await invoiceResponse.text()
        console.error('[Manager] API error response:', errorText)
        throw new Error(`API error: ${invoiceResponse.status} - ${errorText}`)
      }
      
      const responseText = await invoiceResponse.text()
      console.log('[Manager] Raw response:', responseText)
      
      let invoiceResult
      try {
        invoiceResult = JSON.parse(responseText)
      } catch (parseError) {
        console.error('[Manager] JSON parse error:', parseError)
        console.error('[Manager] Raw response was:', responseText)
        throw new Error('Invalid JSON response from API')
      }
      
      if (!invoiceResult.success) {
        throw new Error(invoiceResult.error)
      }
      
      setInvoiceData(invoiceResult)
      setScreen('invoice')
      
    } catch (error) {
      console.error('[Manager] Error creating stake:', error)
      alert('Error creating stake: ' + error.message)
    } finally {
      setLoading(false)
    }
  }
  
  async function handlePaymentVerification() {
    if (!invoiceData) return
    
    try {
      setPaymentStatus('checking')
      
      // Check payment status
      const checkResponse = await fetch('/api/incentive/check-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentHash: invoiceData.paymentHash
        })
      })
      
      const checkResult = await checkResponse.json()
      
      if (checkResult.success && checkResult.paid) {
        // Payment confirmed, activate stake
        await confirmPayment(userPubkey, invoiceData.paymentHash, authData)
        
        // Reload goals
        const g = await getLightningGoals(userPubkey)
        setGoals(g)
        setScreen('tracking')
        
        alert('Payment confirmed! Your stake is now active.')
      } else {
        setPaymentStatus('pending')
        alert('Payment not yet received. Please try again.')
      }
      
    } catch (error) {
      console.error('[Manager] Error verifying payment:', error)
      setPaymentStatus('pending')
      alert('Error verifying payment: ' + error.message)
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
  
  console.log('[Manager] 🎨 Rendering with state:', { loading, screen, hasGoals: !!goals })
  
  if (loading) {
    console.log('[Manager] 🔄 Showing loading screen')
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
                onChange={(e) => setDailyWordGoal(e.target.value)}
                placeholder="500"
                className={hasAttemptedSubmit && validationErrors.dailyWordGoal ? 'border-red-500' : ''}
              />
              {hasAttemptedSubmit && validationErrors.dailyWordGoal && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.dailyWordGoal}</p>
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Daily Reward (sats)</label>
              <Input
                type="number"
                value={dailyReward}
                onChange={(e) => setDailyReward(e.target.value)}
                placeholder="100"
                className={hasAttemptedSubmit && validationErrors.dailyReward ? 'border-red-500' : ''}
              />
              {hasAttemptedSubmit && validationErrors.dailyReward && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.dailyReward}</p>
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Initial Deposit (sats)</label>
              <Input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="1000"
                className={hasAttemptedSubmit && validationErrors.depositAmount ? 'border-red-500' : ''}
              />
              {hasAttemptedSubmit && validationErrors.depositAmount && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.depositAmount}</p>
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Lightning Address</label>
              <Input
                type="text"
                value={lightningAddress}
                onChange={(e) => setLightningAddress(e.target.value)}
                placeholder="your@lightning.address"
                className={hasAttemptedSubmit && validationErrors.lightningAddress ? 'border-red-500' : ''}
              />
              {hasAttemptedSubmit && validationErrors.lightningAddress && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.lightningAddress}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Where daily rewards will be sent
              </p>
            </div>
            
            <Button
              onClick={handleCreateStake}
              disabled={loading || !isFormValid}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Generate Lightning Invoice'}
            </Button>
            
            <div className="text-xs text-gray-500">
              <p>• You'll earn {dailyReward || 'X'} sats each day you write {dailyWordGoal || 'X'}+ words</p>
              <p>• Your deposit of {depositAmount || 'X'} sats will be used to pay rewards</p>
              <p>• Cancelling forfeits your remaining balance</p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {screen === 'invoice' && (
        <div className="space-y-4">
          {invoiceData ? (
            <Card>
              <CardHeader>
                <CardTitle>Complete Your Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl font-bold mb-2">{invoiceData.amount} sats</div>
                  <div className="text-sm text-gray-600 mb-4">
                    Pay this amount to activate your Lightning Goals stake
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-xs font-mono break-all">
                    {invoiceData.invoice}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={() => navigator.clipboard.writeText(invoiceData.invoice)}
                    variant="outline"
                    className="flex-1"
                  >
                    Copy Invoice
                  </Button>
                  <Button
                    onClick={handlePaymentVerification}
                    disabled={paymentStatus === 'checking'}
                    className="flex-1"
                  >
                    {paymentStatus === 'checking' ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Checking...
                      </div>
                    ) : (
                      'Check Payment'
                    )}
                  </Button>
                </div>
                
                <div className="text-xs text-gray-500 text-center">
                  <p>1. Copy the invoice above</p>
                  <p>2. Pay it with your Lightning wallet</p>
                  <p>3. Click "Check Payment" to verify</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Payment Required</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-lg font-semibold mb-2">Pending Payment</div>
                  <div className="text-sm text-gray-600 mb-4">
                    You have a pending Lightning Goals stake that requires payment to activate.
                  </div>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="text-sm text-orange-700">
                    <p className="font-medium">⚠️ Incomplete Setup</p>
                    <p className="mt-1">
                      Your stake was created but payment was not completed. 
                      The invoice data is missing.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      try {
                        // Cancel the pending stake and start over
                        if (goals) {
                          await cancelStake(userPubkey, authData)
                          setGoals(null)
                          setScreen('setup')
                        }
                      } catch (error) {
                        console.error('Error cancelling pending stake:', error)
                        alert('Error cancelling pending stake: ' + error.message)
                      }
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel & Start Over
                  </Button>
                  <Button
                    onClick={() => setScreen('setup')}
                    className="flex-1"
                  >
                    Try Again
                  </Button>
                </div>
                
                <div className="text-xs text-gray-500 text-center">
                  <p>• Cancel to start fresh with new settings</p>
                  <p>• Try Again to return to setup</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      
      {/* Fallback - should never reach here */}
      {screen !== 'setup' && screen !== 'tracking' && screen !== 'invoice' && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-red-500">Unknown screen state: {screen}</p>
              <Button onClick={() => setScreen('setup')} className="mt-2">
                Go to Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}