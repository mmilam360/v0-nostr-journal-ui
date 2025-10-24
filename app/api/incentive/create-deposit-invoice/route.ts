import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  console.log('[API] create-deposit-invoice POST request received')
  
  try {
    const body = await request.json()
    console.log('[API] Request body:', body)
    const { userPubkey, amountSats, dailyReward, lightningAddress } = body
    
    if (!userPubkey || !amountSats || !dailyReward) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 })
    }
    
    console.log('[API] Creating deposit invoice for:', amountSats, 'sats')
    
    // For now, create a mock invoice
    // In production, this would integrate with a Lightning node
    const mockInvoice = `lnbc${amountSats}u1p${Math.random().toString(36).substring(2)}...`
    const mockPaymentHash = Math.random().toString(36).substring(2, 34)
    
    // Store the invoice data (in production, use a database)
    if (typeof global !== 'undefined') {
      global.pendingSetups = global.pendingSetups || {}
      global.pendingSetups[mockPaymentHash] = {
        userPubkey,
        amountSats,
        dailyReward,
        lightningAddress,
        invoice: mockInvoice,
        paymentHash: mockPaymentHash,
        status: 'pending',
        createdAt: Date.now()
      }
    }
    
    console.log('[API] ✅ Deposit invoice created:', mockPaymentHash)
    
    return NextResponse.json({
      success: true,
      invoice: mockInvoice,
      paymentHash: mockPaymentHash,
      amount: amountSats
    })
    
  } catch (error) {
    console.error('[API] Error creating deposit invoice:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create deposit invoice'
    }, { status: 500 })
  }
}
