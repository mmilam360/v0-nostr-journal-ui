import { NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'
import { fetchIncentiveSettings, fetchTodayProgress } from '@/lib/incentive-nostr'

export async function POST(request: Request) {
  try {
    const { userPubkey } = await request.json()
    
    if (!userPubkey) {
      return NextResponse.json(
        { error: 'Missing user pubkey' },
        { status: 400 }
      )
    }
    
    // Get user's settings
    const settings = await fetchIncentiveSettings(userPubkey)
    
    if (!settings) {
      return NextResponse.json(
        { error: 'No incentive settings found' },
        { status: 404 }
      )
    }
    
    // Parse settings
    const rewardAmount = parseInt(
      settings.tags.find((t: string[]) => t[0] === 'daily_reward_sats')[1]
    )
    const stakeBalance = parseInt(
      settings.tags.find((t: string[]) => t[0] === 'stake_balance_sats')[1]
    )
    const lightningAddress = settings.tags.find((t: string[]) => t[0] === 'lightning_address')[1]
    
    // Verify sufficient balance
    if (stakeBalance < rewardAmount) {
      return NextResponse.json(
        { error: 'Insufficient stake balance' },
        { status: 400 }
      )
    }
    
    // Verify goal was met today
    const today = new Date().toISOString().split('T')[0]
    const todayProgress = await fetchTodayProgress(userPubkey, today)
    
    if (!todayProgress) {
      return NextResponse.json(
        { error: 'No progress recorded for today' },
        { status: 400 }
      )
    }
    
    const goalMet = todayProgress.tags.some((t: string[]) => 
      t[0] === 'goal_met' && t[1] === 'true'
    )
    
    if (!goalMet) {
      return NextResponse.json(
        { error: 'Daily goal not met' },
        { status: 400 }
      )
    }
    
    const alreadyClaimed = todayProgress.tags.some((t: string[]) =>
      t[0] === 'reward_claimed' && t[1] === 'true'
    )
    
    if (alreadyClaimed) {
      return NextResponse.json(
        { error: 'Reward already claimed today' },
        { status: 400 }
      )
    }
    
    // Connect to YOUR Alby Hub
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: process.env.APP_LIGHTNING_NODE_URL!
    })
    
    await nwc.enable()
    
    // Send payment FROM your hub TO user's Lightning address
    console.log('[Reward] Sending', rewardAmount, 'sats to', lightningAddress)
    
    // Create invoice first (Lightning address → invoice)
    const invoiceResponse = await fetch(
      `https://${lightningAddress.split('@')[1]}/.well-known/lnurlp/${lightningAddress.split('@')[0]}`
    )
    const lnurlData = await invoiceResponse.json()
    
    const callbackResponse = await fetch(
      `${lnurlData.callback}?amount=${rewardAmount * 1000}` // Amount in msats
    )
    const { pr: invoice } = await callbackResponse.json()
    
    // Pay the invoice
    const result = await nwc.sendPayment(invoice)
    
    console.log('[Reward] ✅ Payment successful:', result.preimage)
    
    return NextResponse.json({
      success: true,
      paymentHash: result.paymentHash,
      preimage: result.preimage,
      amountSats: rewardAmount
    })
    
  } catch (error) {
    console.error('[Reward] Error sending payment:', error)
    return NextResponse.json(
      { error: 'Failed to send reward payment' },
      { status: 500 }
    )
  }
}
