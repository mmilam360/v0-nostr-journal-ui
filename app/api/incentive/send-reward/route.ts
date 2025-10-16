import { NextRequest, NextResponse } from 'next/server'
import { webln } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[SendReward API] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 SEND REWARD REQUEST RECEIVED')
    log('========================================')
    
    const { userPubkey, amount, lightningAddress, isRefund } = await request.json()
    
    log('💰 Amount:', amount, 'sats')
    log('📧 To:', lightningAddress)
    log('🔄 Is refund:', !!isRefund)
    
    // Validate inputs
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount: ' + amount)
    }
    
    if (!lightningAddress || !lightningAddress.includes('@')) {
      throw new Error('Invalid Lightning address: ' + lightningAddress)
    }
    
    // AUDIT POINT 23: Check for NWC_CONNECTION_URL
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL
    
    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      throw new Error('NWC_CONNECTION_URL environment variable not set')
    }
    
    log('✅ NWC URL exists')
    log('🔌 NWC preview:', NWC_CONNECTION_URL.substring(0, 40) + '...')
    
    // AUDIT POINT 24: Connect to NWC
    log('🔌 Creating NWC connection...')
    
    const nwc = new webln.NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })
    
    log('🔌 Enabling NWC...')
    await nwc.enable()
    
    log('✅ NWC connected successfully')
    
    // Verify sendPayment method is available
    try {
      const info = await nwc.getInfo()
      
      if (!info.methods?.includes('sendPayment')) {
        throw new Error('NWC connection does not have sendPayment permission. Please reconfigure your Alby Hub connection.')
      }
      
      log('✅ sendPayment permission verified')
      
    } catch (infoError) {
      log('⚠️ Could not verify permissions:', infoError.message)
    }
    
    // AUDIT POINT 25: Send payment via NWC
    log('💸 Sending payment via NWC...')
    log('💸 From: YOUR WALLET (via NWC)')
    log('💸 To:', lightningAddress)
    log('💸 Amount:', amount, 'sats')
    
    const paymentResult = await nwc.sendPayment({
      destination: lightningAddress,  // Lightning address (user@domain.com)
      amount: amount,                 // Amount in sats
      comment: isRefund ? 'Nostr Journal - Stake refund' : 'Nostr Journal - Writing goal reward'
    })
    
    log('✅ PAYMENT SENT VIA NWC!')
    log('💰 Payment result:', paymentResult)
    
    // Extract payment hash/preimage
    const paymentHash = paymentResult.preimage || 
                       paymentResult.payment_hash || 
                       paymentResult.paymentHash ||
                       'unknown'
    
    log('🔑 Payment hash:', paymentHash)
    log('========================================')
    
    // AUDIT POINT 26: Return success response
    return NextResponse.json({
      success: true,
      paymentHash: paymentHash,
      amountPaid: amount,
      method: 'NWC',
      destination: lightningAddress
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
    
  } catch (error) {
    log('========================================')
    log('❌ ERROR SENDING PAYMENT VIA NWC')
    log('❌ Error type:', error.constructor.name)
    log('❌ Error message:', error.message)
    log('❌ Error stack:', error.stack)
    
    // Provide helpful error messages
    let userMessage = error.message
    
    if (error.message.includes('Insufficient')) {
      userMessage = 'Your wallet has insufficient balance to send this reward'
    } else if (error.message.includes('Invalid destination')) {
      userMessage = 'Invalid Lightning address format'
    } else if (error.message.includes('timeout')) {
      userMessage = 'Payment timed out. Please try again'
    } else if (error.message.includes('sendPayment')) {
      userMessage = 'Your NWC connection does not have sendPayment permission. Please add it in Alby Hub settings'
    }
    
    log('========================================')
    
    return NextResponse.json({
      success: false,
      error: userMessage,
      details: error.stack,
      method: 'NWC'
    }, { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
