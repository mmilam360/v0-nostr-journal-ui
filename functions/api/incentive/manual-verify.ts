import { onRequestPost } from 'wrangler'

export const onRequestPost: onRequestPost = async (context) => {
  try {
    console.log('[Manual Verify] 🔍 Manual payment verification requested')
    
    const body = await context.request.json()
    const { paymentHash, invoiceString, amountSats } = body
    
    console.log('[Manual Verify] 📋 Request data:', {
      paymentHash,
      hasInvoiceString: !!invoiceString,
      amountSats,
      hashLength: paymentHash?.length,
      hashFormat: paymentHash ? (/^[a-f0-9]{64}$/i.test(paymentHash) ? 'Valid hex' : 'Invalid format') : 'No hash'
    })
    
    if (!paymentHash) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Payment hash is required'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Method 1: Check webhook data first
    console.log('[Manual Verify] 🔍 Method 1: Checking webhook data...')
    const webhookData = await context.env.PAYMENT_WEBHOOK_DATA?.get(paymentHash)
    
    if (webhookData) {
      const webhookInfo = JSON.parse(webhookData)
      console.log('[Manual Verify] ✅ Found webhook data:', webhookInfo)
      
      const isPaid = webhookInfo.settled === true || 
                     webhookInfo.state === 'SETTLED' ||
                     webhookInfo.status === 'SETTLED' ||
                     webhookInfo.paid === true
      
      return new Response(JSON.stringify({
        success: true,
        paid: isPaid,
        amount: webhookInfo.amount,
        settledAt: webhookInfo.settledAt,
        state: webhookInfo.state,
        verificationMethod: 'Webhook Data',
        source: 'Manual Verification'
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Method 2: Simulate payment for testing (ONLY for development)
    console.log('[Manual Verify] 🔍 Method 2: Simulating payment for testing...')
    
    if (context.env.ENVIRONMENT === 'development' || context.env.ALLOW_MANUAL_VERIFICATION === 'true') {
      console.log('[Manual Verify] ⚠️ DEVELOPMENT MODE: Simulating payment confirmation')
      
      // Store simulated payment data
      const simulatedPayment = {
        paymentHash,
        amount: amountSats || 100,
        settled: true,
        settledAt: new Date().toISOString(),
        state: 'SETTLED',
        timestamp: new Date().toISOString(),
        source: 'Manual Verification (Simulated)',
        note: 'This is a simulated payment for testing purposes'
      }
      
      // Store in KV for future verification
      await context.env.PAYMENT_WEBHOOK_DATA.put(paymentHash, JSON.stringify(simulatedPayment))
      
      console.log('[Manual Verify] ✅ Payment simulated and stored')
      
      return new Response(JSON.stringify({
        success: true,
        paid: true,
        amount: simulatedPayment.amount,
        settledAt: simulatedPayment.settledAt,
        state: simulatedPayment.state,
        verificationMethod: 'Manual Verification (Simulated)',
        source: 'Development Testing',
        note: 'This is a simulated payment for testing purposes'
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Method 3: Return not found
    console.log('[Manual Verify] ❌ No payment found')
    
    return new Response(JSON.stringify({
      success: false,
      paid: false,
      error: 'Payment not found in webhook data',
      recommendation: 'Make sure to pay the invoice first, or set ALLOW_MANUAL_VERIFICATION=true for testing'
    }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('[Manual Verify] ❌ Error:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Handle GET requests for instructions
export const onRequestGet = async (context) => {
  return new Response(JSON.stringify({
    message: 'Manual payment verification endpoint',
    usage: {
      method: 'POST',
      body: {
        paymentHash: 'string (required)',
        invoiceString: 'string (optional)',
        amountSats: 'number (optional)'
      }
    },
    note: 'This endpoint can simulate payments for testing when ALLOW_MANUAL_VERIFICATION=true'
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
