'use client'

import { useState, useEffect } from 'react'
import { getLightningGoals, createStake, addToStake, cancelStake, updateLightningAddress, confirmPayment } from '@/lib/lightning-goals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, QrCode, Clock, CheckCircle } from 'lucide-react'
import QRCode from 'qrcode'

interface Props {
  userPubkey: string
  authData: any
  userLightningAddress: string
  currentWordCount?: number  // NEW: Add this prop (optional)
  onWordCountProcessed?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
  onStakeActivated?: () => void
}

export function LightningGoalsManager({ 
  userPubkey, 
  authData, 
  userLightningAddress,
  currentWordCount,  // NEW
  onWordCountProcessed,
  onSetupStatusChange,
  onStakeActivated 
}: Props) {
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
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const [paymentCheckInterval, setPaymentCheckInterval] = useState<NodeJS.Timeout | null>(null)
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false)
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false)
  const [showCancelSuccess, setShowCancelSuccess] = useState(false)
  const [forfeitedAmount, setForfeitedAmount] = useState(0)
  
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
          console.log('[Manager] ⏳ Pending payment found, but no invoice data - clearing and going to setup')
          // Clear the pending payment goal so user can start fresh
          try {
            await cancelStake(userPubkey, authData)
            console.log('[Manager] ✅ Cleared pending payment goal')
          } catch (error) {
            console.error('[Manager] Error clearing pending goal:', error)
          }
          setGoals(null)
          setScreen('setup')
        } else {
          console.log('[Manager] 📝 No goals found, showing setup screen')
          setScreen('setup')
        }
        
        // Pre-fill Lightning address from prop or master event
        const addressFromEvent = g?.lightningAddress
        const addressToUse = userLightningAddress || addressFromEvent || ''
        console.log('[Manager] ⚡ Lightning address sources:', {
          fromProp: userLightningAddress,
          fromEvent: addressFromEvent,
          using: addressToUse
        })
        setLightningAddress(addressToUse)
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
  
  // Auto-check payment when on invoice screen
  useEffect(() => {
    if (screen === 'invoice' && invoiceData && paymentStatus === 'pending') {
      console.log('[Manager] Starting automatic payment checking...')
      const interval = setInterval(() => {
        handlePaymentVerification(true) // Pass true for automatic checks
      }, 1000) // Check every 1 second
      
      setPaymentCheckInterval(interval)
      
      // Cleanup interval after 5 minutes
      setTimeout(() => {
        if (interval) {
          clearInterval(interval)
          setPaymentCheckInterval(null)
          console.log('[Manager] Stopped automatic payment checking after 5 minutes')
        }
      }, 300000)
      
      return () => {
        if (interval) {
          clearInterval(interval)
          setPaymentCheckInterval(null)
        }
      }
    }
  }, [screen, invoiceData, paymentStatus])
  
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
        lightningAddress: lightningAddress.trim(),
        currentWordCount: currentWordCount || 0  // NEW: Pass current count as baseline (default to 0)
      }, authData)
      
      // Generate Lightning invoice
      console.log('[Manager] Generating Lightning invoice...')
      console.log('[Manager] Current window location:', window.location.href)
      console.log('[Manager] API URL will be:', window.location.origin + '/api/incentive/create-invoice')
      
      const invoiceResponse = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: userPubkey,
          amountSats: parseInt(depositAmount),
          timestamp: Date.now(),
          requestId: Math.random().toString(36).substring(7)
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
      
      // Store payment hash and invoice string for verification (like working system)
      localStorage.setItem(`payment-hash-${userPubkey}`, invoiceResult.paymentHash)
      localStorage.setItem(`invoice-string-${userPubkey}`, invoiceResult.invoice)
      
      setInvoiceData(invoiceResult)
      setScreen('invoice')
      
      // Generate QR code for the invoice
      if (invoiceResult.invoice) {
        QRCode.toDataURL(invoiceResult.invoice, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        }).then(setQrCodeDataUrl).catch(console.error)
      }
      
    } catch (error) {
      console.error('[Manager] Error creating stake:', error)
      // TODO: Show error in UI instead of alert
      console.error('Error creating stake:', error.message)
    } finally {
      setLoading(false)
    }
  }
  
  async function handlePaymentVerification(isAutoCheck: boolean = false) {
    if (!invoiceData) return
    
    try {
      setPaymentStatus('checking')
      
      // Check payment status using working API
      const paymentHash = localStorage.getItem(`payment-hash-${userPubkey}`)
      const invoiceString = localStorage.getItem(`invoice-string-${userPubkey}`)
      
      if (!paymentHash) {
        throw new Error('No payment hash found for verification')
      }
      
      const checkResponse = await fetch('/api/incentive/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentHash,
          ...(invoiceString && { invoiceString })
        })
      })
      
      const checkResult = await checkResponse.json()
      
      if (checkResult.success && checkResult.paid) {
        // Payment confirmed, activate stake using working system
        console.log('[Manager] ✅ Payment confirmed! Amount:', checkResult.amountSats, 'sats')
        
        // Set loading state for balance update
        setIsUpdatingBalance(true)
        
        // Confirm payment and activate existing stake
        await confirmPayment(userPubkey, paymentHash, authData)
        
        console.log('[Manager] ✅ Payment confirmed and stake activated')
        
        // Clear payment hash since payment is confirmed
        localStorage.removeItem(`payment-hash-${userPubkey}`)
        localStorage.removeItem(`invoice-string-${userPubkey}`)
        
        // Clear invoice data and reset payment status
        setInvoiceData(null)
        setPaymentStatus('pending')
        setQrCodeDataUrl('')
        
        // Stop payment checking interval
        if (paymentCheckInterval) {
          clearInterval(paymentCheckInterval)
          setPaymentCheckInterval(null)
        }
        
        // Switch to tracking screen immediately
        setScreen('tracking')
        
        // Notify parent component that stake is now active
        if (onStakeActivated) {
          onStakeActivated()
        }
        
        // Reload goals in background and clear loading state
        setTimeout(async () => {
          const g = await getLightningGoals(userPubkey)
          setGoals(g)
          setIsUpdatingBalance(false)
        }, 1000) // Give a moment for the event to propagate
        
        // No popup - user will see the tracking screen directly
      } else {
        setPaymentStatus('pending')
        // Don't show alert for automatic checks - just log silently
        if (!isAutoCheck) {
          alert('Payment not yet received. Please try again.')
        }
      }
      
    } catch (error) {
      console.error('[Manager] Error verifying payment:', error)
      setPaymentStatus('pending')
      // Don't show alert for automatic checks - just log silently
      if (!isAutoCheck) {
        // TODO: Show error in UI instead of alert
        console.error('Error verifying payment:', error.message)
      }
    }
  }
  
  async function handleCancelStake() {
    if (!goals) return
    
    setShowCancelConfirmation(true)
  }
  
  async function confirmCancelStake() {
    if (!goals) return
    
    setIsCancelling(true)
    setShowCancelConfirmation(false)
    
    try {
      console.log('[Manager] Cancelling stake...')
      
      const { forfeited } = await cancelStake(userPubkey, authData)
      
      console.log('[Manager] ✅ Stake cancelled')
      console.log('[Manager] 💸 Forfeited:', forfeited, 'sats')
      
      // Show success message
      setForfeitedAmount(forfeited)
      setShowCancelSuccess(true)
      
      // Reset UI after a delay
      setTimeout(() => {
        setGoals(null)
        setScreen('setup')
        setShowCancelSuccess(false)
        setForfeitedAmount(0)
      }, 3000)
      
    } catch (error) {
      console.error('[Manager] ❌ Error:', error)
      setShowCancelConfirmation(false)
      // TODO: Show error in UI instead of alert
      alert('Error cancelling stake: ' + error.message)
    } finally {
      setIsCancelling(false)
    }
  }
  
  async function handleUpdateLightningAddress() {
    if (!lightningAddress) {
      // TODO: Show error in UI instead of alert
      console.error('Please enter a Lightning address')
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
                {(() => {
                  // Calculate words since stake
                  const wordsSinceStake = goals.todayWords - (goals.baselineWordCount || 0)
                  const progressPercent = Math.min(100, (wordsSinceStake / goals.dailyWordGoal) * 100)
                  
                  return (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Progress (since stake)</span>
                        <span>{wordsSinceStake} / {goals.dailyWordGoal} words</span>
                      </div>
                      
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className={`h-4 rounded-full transition-all duration-500 ${
                            goals.todayGoalMet ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          style={{
                            width: `${progressPercent}%`
                          }}
                        />
                      </div>
                      
                      {goals.todayRewardSent && (
                        <div className="mt-2 text-green-600 text-sm">
                          ✅ {goals.todayRewardAmount} sats earned today!
                        </div>
                      )}
                    </>
                  )
                })()}
                
                {goals.todayGoalMet && !goals.todayRewardSent && (
                  <div className="text-orange-600 text-sm mt-2">
                    🎯 Goal met! Waiting for reward...
                  </div>
                )}
              </div>
              
              {/* Balance */}
              <div className="mb-4">
                <div className="text-sm text-gray-600">Current Balance</div>
                <div className="text-2xl font-bold">
                  {isUpdatingBalance ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="text-gray-500">Updating...</span>
                    </div>
                  ) : (
                    `${goals.currentBalance} sats`
                  )}
                </div>
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
                {/* QR Code Display */}
                {qrCodeDataUrl && (
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 rounded-xl border border-amber-200 dark:border-amber-800 mb-4">
                    <div className="flex flex-col items-center space-y-4">
                      {/* QR Code Container */}
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-amber-200 dark:border-amber-700">
                        <img 
                          src={qrCodeDataUrl} 
                          alt="Lightning Invoice QR Code"
                          className="w-48 h-48 rounded-lg"
                        />
                      </div>
                      
                      {/* QR Code Description */}
                      <div className="text-center">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                          Scan with Lightning Wallet
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Use any Lightning wallet to pay this invoice
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Invoice Text */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-amber-200 dark:border-amber-700 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Lightning Invoice</span>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border font-mono text-xs break-all text-gray-700 dark:text-gray-300">
                    {invoiceData.invoice}
                  </div>
                </div>
                
                {/* Copy Button */}
                <Button
                  onClick={() => navigator.clipboard.writeText(invoiceData.invoice)}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border-0"
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Copy Invoice
                </Button>
                
                {/* Payment Status Indicator */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin">
                      <Clock className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Waiting for payment... (checking automatically every second)
                    </span>
                  </div>
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
                        // TODO: Show error in UI instead of alert
                        console.error('Error cancelling pending stake:', error.message)
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
      
      {/* Cancel Confirmation Modal */}
      {showCancelConfirmation && goals && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Cancel Stake?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium mb-2">⚠️ WARNING</p>
                <p className="text-red-700 text-sm">
                  Your remaining balance of <strong>{goals.currentBalance} sats</strong> will be <strong>FORFEITED</strong> (not refunded).
                </p>
                <p className="text-red-600 text-xs mt-2">
                  This action cannot be undone.
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowCancelConfirmation(false)}
                  variant="outline"
                  className="flex-1"
                  disabled={isCancelling}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmCancelStake}
                  variant="destructive"
                  className="flex-1"
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Forfeiting...
                    </div>
                  ) : (
                    'Forfeit Stake'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Cancel Success Modal */}
      {showCancelSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                Stake Cancelled
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium mb-2">✅ Complete</p>
                <p className="text-green-700 text-sm">
                  <strong>{forfeitedAmount} sats</strong> forfeited.
                </p>
                <p className="text-green-600 text-xs mt-2">
                  You can create a new stake anytime.
                </p>
              </div>
              
              <Button
                onClick={() => {
                  setShowCancelSuccess(false)
                  setGoals(null)
                  setScreen('setup')
                }}
                className="w-full"
              >
                Create New Stake
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}