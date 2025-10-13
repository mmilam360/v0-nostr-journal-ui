import { NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { pubkey, amount, dailyReward, wordGoal, lightningAddress } = await request.json()
    
    if (!pubkey || !amount || !dailyReward || !wordGoal) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Connect to YOUR Alby Hub
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: process.env.APP_LIGHTNING_NODE_URL!
    })
    
    await nwc.enable()
    
    // Create invoice for deposit
    const invoice = await nwc.makeInvoice({
      amount: amount,
      memo: `Nostr Journal Stake - ${amount} sats (Goal: ${wordGoal} words, Reward: ${dailyReward} sats)`
    })
    
    // Store pending setup (would typically be in database)
    const setupData = {
      pubkey,
      amount,
      dailyReward,
      wordGoal,
      lightningAddress,
      invoice: invoice.paymentRequest,
      status: 'pending',
      createdAt: new Date().toISOString()
    }

    // In a real implementation, store this in a database
    // For now, we'll use a simple in-memory store
    global.pendingSetups = global.pendingSetups || {}
    global.pendingSetups[invoice.paymentHash] = setupData
    
    console.log('[Deposit] Created invoice:', invoice.paymentHash)
    
    return NextResponse.json({
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash
    })
    
  } catch (error) {
    console.error('[Deposit] Error creating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to create deposit invoice' },
      { status: 500 }
    )
  }
}
