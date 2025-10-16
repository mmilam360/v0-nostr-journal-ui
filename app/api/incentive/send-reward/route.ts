import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('[API] Next.js send-reward endpoint called')
    const { userPubkey, amount, lightningAddress } = await request.json()
    
    console.log('[API] Request body:', { userPubkey: userPubkey?.substring(0, 8), amount, lightningAddress })
    
    if (!userPubkey || !amount || !lightningAddress) {
      console.log('[API] Missing parameters')
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
