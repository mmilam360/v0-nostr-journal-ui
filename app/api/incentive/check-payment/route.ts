import { NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { pubkey, invoice } = await request.json()
    
    if (!pubkey || !invoice) {
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
    
    // Check if invoice was paid
    // Note: This requires NIP-47 lookup_invoice method
    // For now, we'll simulate the check
    const paid = true // Implement actual check here
    
    if (paid) {
      // Get the setup data from our pending setups
      const pendingSetups = global.pendingSetups || {}
      const setupData = Object.values(pendingSetups).find((setup: any) => 
        setup.pubkey === pubkey && setup.invoice === invoice
      )
      
      if (setupData) {
        // Activate the user's account
        const userAccount = {
          pubkey: setupData.pubkey,
          settings: {
            dailyWordGoal: setupData.wordGoal,
            dailyRewardSats: setupData.dailyReward,
            lightningAddress: setupData.lightningAddress
          },
          balance: setupData.amount,
          streak: 0,
          createdAt: new Date().toISOString()
        }
        
        // Store in global user accounts (would be database in production)
        global.userAccounts = global.userAccounts || {}
        global.userAccounts[pubkey] = userAccount
        
        // Remove from pending
        delete pendingSetups[Object.keys(pendingSetups).find(key => 
          pendingSetups[key] === setupData
        )!]
        
        return NextResponse.json({
          paid: true,
          account: userAccount
        })
      }
    }
    
    return NextResponse.json({
      paid: false
    })
    
  } catch (error) {
    console.error('[Payment Check] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    )
  }
}
