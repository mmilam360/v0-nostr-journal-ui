import { NextRequest, NextResponse } from 'next/server'

// Test GET handler to verify route is working
export async function GET(request: NextRequest) {
  console.log('[API] create-invoice GET request received')
  return NextResponse.json({ 
    success: true, 
    message: 'API route is working' 
  })
}

export async function POST(request: NextRequest) {
  console.log('[API] create-invoice POST request received')
  console.log('[API] Request URL:', request.url)
  console.log('[API] Request method:', request.method)
  console.log('[API] Request headers:', Object.fromEntries(request.headers.entries()))
  
  try {
    const body = await request.json()
    console.log('[API] Request body:', body)
    const { amount, description } = body
    
    if (!amount || amount <= 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid amount' 
      }, { status: 400 })
    }
    
    console.log('[API] Creating invoice for:', amount, 'sats')
    
    // For now, create a mock invoice
    // In production, this would integrate with a Lightning node
    const mockInvoice = `lnbc${amount}u1p${Math.random().toString(36).substring(2)}...`
    const mockPaymentHash = Math.random().toString(36).substring(2, 34)
    
    // Store the invoice data (in production, use a database)
    // For now, we'll use a simple in-memory store
    // Note: In serverless environments, this won't persist between requests
    if (typeof global !== 'undefined') {
      global.invoices = global.invoices || {}
      global.invoices[mockPaymentHash] = {
        amount,
        description,
        invoice: mockInvoice,
        paymentHash: mockPaymentHash,
        paid: false,
        createdAt: Date.now()
      }
    }
    
    console.log('[API] ✅ Invoice created:', mockPaymentHash)
    
    return NextResponse.json({
      success: true,
      invoice: mockInvoice,
      paymentHash: mockPaymentHash,
      amount
    })
    
  } catch (error) {
    console.error('[API] Error creating invoice:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create invoice' 
    }, { status: 500 })
  }
}
