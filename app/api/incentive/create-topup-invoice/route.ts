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
    
    // For now, create a mock invoice
    // In production, this would integrate with a Lightning node
    const mockInvoice = `lnbc${amountSats}u1p${Math.random().toString(36).substring(2)}...`
    const mockPaymentHash = Math.random().toString(36).substring(2, 34)
    
    // Store the invoice data (in production, use a database)
    if (typeof global !== 'undefined') {
      global.topUpInvoices = global.topUpInvoices || {}
      global.topUpInvoices[mockPaymentHash] = {
        userPubkey,
        amountSats,
        invoice: mockInvoice,
        paymentHash: mockPaymentHash,
        paid: false,
        createdAt: Date.now()
      }
    }
    
    console.log('[CreateTopUpInvoice] ✅ Top-up invoice created:', mockPaymentHash)
    
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
