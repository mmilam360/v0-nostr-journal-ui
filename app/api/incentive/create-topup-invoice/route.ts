import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  console.log('[CreateTopUpInvoice] POST request received')
  
  try {
    const body = await request.json()
    console.log('[CreateTopUpInvoice] Request body:', body)
    const { userPubkey, amountSats, timestamp } = body
    
    if (!amountSats || amountSats <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid amount'
      }, { status: 400 })
    }
    
    if (!userPubkey) {
      return NextResponse.json({
        success: false,
        error: 'Invalid userPubkey'
      }, { status: 400 })
    }
    
    console.log('[CreateTopUpInvoice] Creating top-up invoice for:', amountSats, 'sats')
    
    // Mock invoice for static export compatibility
    const mockInvoice = `lnbc${amountSats}u1p${Math.random().toString(36).substring(2)}...`
    const mockPaymentHash = `${userPubkey.substring(0, 8)}-topup-${amountSats}-${Date.now()}`
    
    console.log('[CreateTopUpInvoice] ✅ Mock top-up invoice created:', mockPaymentHash)
    
    return NextResponse.json({
      success: true,
      invoice: mockInvoice,
      paymentHash: mockPaymentHash,
      amount: amountSats
    })
    
  } catch (error) {
    console.error('[CreateTopUpInvoice] Error creating invoice:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create top-up invoice'
    }, { status: 500 })
  }
}
