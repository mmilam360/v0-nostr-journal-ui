import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { paymentHash } = await request.json()
    
    if (!paymentHash) {
      return NextResponse.json({ 
        success: false, 
        error: 'Payment hash required' 
      }, { status: 400 })
    }
    
    console.log('[API] Checking payment for:', paymentHash)
    
    // Check if invoice exists
    const invoices = global.invoices || {}
    const invoice = invoices[paymentHash]
    
    if (!invoice) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invoice not found' 
      }, { status: 404 })
    }
    
    // For testing purposes, mark as paid after 10 seconds
    const timeSinceCreated = Date.now() - invoice.createdAt
    const isPaid = timeSinceCreated > 10000 // 10 seconds
    
    if (isPaid && !invoice.paid) {
      invoice.paid = true
      console.log('[API] ✅ Payment confirmed for:', paymentHash)
    }
    
    return NextResponse.json({
      success: true,
      paid: invoice.paid,
      amount: invoice.amount,
      paymentHash
    })
    
  } catch (error) {
    console.error('[API] Error checking payment:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to check payment' 
    }, { status: 500 })
  }
}
