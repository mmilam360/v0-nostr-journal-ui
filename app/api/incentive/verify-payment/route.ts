import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  console.log('[VerifyPayment] POST request received')
  
  try {
    const body = await request.json()
    console.log('[VerifyPayment] Request body:', body)
    const { paymentHash, invoiceString } = body
    
    if (!paymentHash) {
      return NextResponse.json({
        success: false,
        error: 'Missing payment hash'
      }, { status: 400 })
    }
    
    console.log('[VerifyPayment] Checking payment for hash:', paymentHash)
    
    // For now, simulate payment verification
    // In production, this would check with a Lightning node
    const isPaid = Math.random() > 0.8 // 20% chance of being paid for demo
    
    if (isPaid) {
      console.log('[VerifyPayment] ✅ Payment confirmed')
      return NextResponse.json({
        success: true,
        paid: true,
        amount: 1000, // Mock amount
        state: 'SETTLED'
      })
    } else {
      console.log('[VerifyPayment] ⏳ Payment not yet confirmed')
      return NextResponse.json({
        success: true,
        paid: false,
        state: 'pending'
      })
    }
    
  } catch (error) {
    console.error('[VerifyPayment] Error verifying payment:', error)
    return NextResponse.json({
      success: false,
      paid: false,
      error: 'Failed to verify payment'
    }, { status: 500 })
  }
}
