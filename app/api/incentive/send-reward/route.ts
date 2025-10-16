import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { userPubkey, amount, lightningAddress } = await request.json()
    
    if (!userPubkey || !amount || !lightningAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required parameters' 
      }, { status: 400 })
    }
    
    console.log('[API] Sending reward:', amount, 'sats to', lightningAddress)
    
    // For now, simulate a successful payment
    // In production, this would integrate with a Lightning node
    const mockPaymentHash = Math.random().toString(36).substring(2, 34)
    
    console.log('[API] ✅ Reward sent:', mockPaymentHash)
    
    return NextResponse.json({
      success: true,
      paymentHash: mockPaymentHash,
      amount,
      lightningAddress
    })
    
  } catch (error) {
    console.error('[API] Error sending reward:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to send reward' 
    }, { status: 500 })
  }
}
