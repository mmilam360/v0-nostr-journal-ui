import { NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'

export async function POST(request: Request) {
  try {
    const { userPubkey, amountSats } = await request.json()
    
    if (!userPubkey || !amountSats) {
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
      amount: amountSats,
      memo: `Journal incentive stake - ${userPubkey.substring(0, 8)}`
    })
    
    console.log('[Deposit] Created invoice:', invoice.paymentHash)
    
    return NextResponse.json({
      invoice: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      amountSats: amountSats
    })
    
  } catch (error) {
    console.error('[Deposit] Error creating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to create deposit invoice' },
      { status: 500 }
    )
  }
}
