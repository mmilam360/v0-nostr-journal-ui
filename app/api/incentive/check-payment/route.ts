import { NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'

export async function POST(request: Request) {
  try {
    const { paymentHash } = await request.json()
    
    // Connect to YOUR Alby Hub
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: process.env.APP_LIGHTNING_NODE_URL!
    })
    
    await nwc.enable()
    
    // Check if invoice was paid
    // Note: This requires NIP-47 lookup_invoice method
    // If not available, you'll need to implement webhook or polling
    
    return NextResponse.json({
      paid: true, // Implement actual check here
      paymentHash
    })
    
  } catch (error) {
    console.error('[Payment Check] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    )
  }
}
