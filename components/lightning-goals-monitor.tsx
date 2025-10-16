'use client'

import { useEffect, useRef } from 'react'
import { getLightningGoals, updateWordCount, recordRewardSent } from '@/lib/lightning-goals'

interface Props {
  userPubkey: string
  authData: any
  currentWordCount: number
  userLightningAddress: string
}

export function LightningGoalsMonitor({
  userPubkey,
  authData,
  currentWordCount,
  userLightningAddress
}: Props) {
  const isProcessingRef = useRef(false)
  const lastCountRef = useRef(0)
  
  useEffect(() => {
    console.log('[Monitor] 🚀 Mounted')
    console.log('[Monitor] Initial word count:', currentWordCount)
    console.log('[Monitor] ⚡ Initial Lightning address:', userLightningAddress || 'NONE')
    
    return () => console.log('[Monitor] Unmounting')
  }, [])
  
  useEffect(() => {
    if (currentWordCount === lastCountRef.current) return
    if (currentWordCount === 0) return
    if (isProcessingRef.current) return
    
    console.log('[Monitor] 🔍 Word count changed:', lastCountRef.current, '→', currentWordCount)
    console.log('[Monitor] ⚡ Lightning address at trigger:', userLightningAddress || 'NONE')
    
    lastCountRef.current = currentWordCount
    
    checkAndReward()
    
  }, [currentWordCount])
  
  // Debug Lightning address changes
  useEffect(() => {
    console.log('[Monitor] ⚡ Lightning address changed to:', userLightningAddress || 'NONE')
  }, [userLightningAddress])
  
  async function checkAndReward() {
    if (isProcessingRef.current) return
    
    isProcessingRef.current = true
    
    try {
      console.log('[Monitor] ⚡ Checking goal...', {
        userPubkey: userPubkey.substring(0, 8),
        fullUserPubkey: userPubkey,
        currentWordCount,
        hasLightningAddress: !!userLightningAddress,
        lightningAddress: userLightningAddress || 'NONE'
      })
      
      // Update word count and check if reward needed
      const { shouldSendReward, rewardAmount } = await updateWordCount(
        userPubkey,
        currentWordCount,
        authData
      )
      
      console.log('[Monitor] 📊 Goal check result:', {
        shouldSendReward,
        rewardAmount,
        wordCount: currentWordCount
      })
      
      if (!shouldSendReward) {
        console.log('[Monitor] ❌ No reward needed')
        return
      }
      
      if (!userLightningAddress) {
        console.log('[Monitor] ❌ No Lightning address found for user')
        return
      }
      
      console.log('[Monitor] 🎯 SENDING REWARD:', rewardAmount, 'sats to', userLightningAddress)
      
      // Generate invoice using LNURL-pay (same as donation modal)
      const [username, domain] = userLightningAddress.split('@')
      
      console.log('[Monitor] 📡 Fetching LNURL endpoint for:', domain, username)
      
      // Fetch LNURL endpoint
      const lnurlResponse = await fetch(
        `https://${domain}/.well-known/lnurlp/${username}`
      )
      
      if (!lnurlResponse.ok) {
        throw new Error('Failed to fetch Lightning Address info')
      }
      
      const lnurlData = await lnurlResponse.json()
      console.log('[Monitor] 📡 LNURL data:', lnurlData)
      
      // Check if amount is within limits
      const minSats = lnurlData.minSendable / 1000
      const maxSats = lnurlData.maxSendable / 1000
      
      if (rewardAmount < minSats || rewardAmount > maxSats) {
        throw new Error(`Reward amount ${rewardAmount} sats is outside limits (${minSats}-${maxSats})`)
      }
      
      console.log('[Monitor] 📡 Requesting invoice for', rewardAmount, 'sats')
      
      // Request invoice
      const invoiceResponse = await fetch(
        `${lnurlData.callback}?amount=${rewardAmount * 1000}` // Convert to millisats
      )
      
      if (!invoiceResponse.ok) {
        throw new Error('Failed to generate invoice')
      }
      
      const invoiceData = await invoiceResponse.json()
      
      if (invoiceData.status === 'ERROR') {
        throw new Error(invoiceData.reason || 'Invoice generation failed')
      }
      
      const invoice = invoiceData.pr
      
      if (!invoice || !invoice.toLowerCase().startsWith('ln')) {
        throw new Error('Invalid invoice format')
      }
      
      console.log('[Monitor] 📡 Generated invoice:', invoice.substring(0, 50) + '...')
      
      // Send payment using NWC (Nostr Wallet Connect)
      console.log('[Monitor] ⚡ Sending payment via NWC...')
      
      // Import NWC provider
      const { NostrWebLNProvider } = await import('@getalby/sdk')
      
      // Get NWC connection from localStorage (same as other parts of the app)
      const nwcUrl = localStorage.getItem('nwc_connection_url')
      
      if (!nwcUrl) {
        throw new Error('No NWC connection found. Please reconnect your wallet.')
      }
      
      const nwc = new NostrWebLNProvider({
        nostrWalletConnectUrl: nwcUrl
      })
      
      await nwc.enable()
      
      const result = await nwc.sendPayment(invoice)
      
      console.log('[Monitor] ✅ Payment successful! Hash:', result.paymentHash)
      
      // Record it
      await recordRewardSent(userPubkey, rewardAmount, authData)
      
      console.log('[Monitor] 🎉 Complete! Reward recorded in goals')
      
    } catch (error) {
      console.error('[Monitor] ❌ Error sending reward:', error)
      
      if (error instanceof Error) {
        console.error('[Monitor] ❌ Error details:', {
          message: error.message,
          stack: error.stack
        })
      }
    } finally {
      isProcessingRef.current = false
    }
  }
  
  return null
}