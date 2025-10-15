import { onRequestPost } from 'wrangler'

export const onRequestPost: onRequestPost = async (context) => {
  try {
    console.log('[Webhook] 📨 Received payment webhook')
    
    // Parse the webhook payload
    const body = await context.request.text()
    console.log('[Webhook] 📄 Raw payload:', body)
    
    let webhookData
    try {
      webhookData = JSON.parse(body)
    } catch (parseError) {
      console.error('[Webhook] ❌ Failed to parse JSON:', parseError)
      return new Response('Invalid JSON', { status: 400 })
    }
    
    console.log('[Webhook] 📋 Parsed webhook data:', JSON.stringify(webhookData, null, 2))
    
    // Extract payment information
    const paymentHash = webhookData.payment_hash || 
                       webhookData.paymentHash || 
                       webhookData.paymentRequest?.match(/lnbc\d+[a-z0-9]+/)?.[0] // Extract from invoice
    
    const amount = webhookData.amount || 
                   webhookData.value || 
                   webhookData.amt_msat ? webhookData.amt_msat / 1000 : null
    
    const settled = webhookData.settled || 
                    webhookData.state === 'SETTLED' || 
                    webhookData.status === 'SETTLED' ||
                    webhookData.paid === true
    
    const settledAt = webhookData.settled_at || 
                      webhookData.settledAt || 
                      webhookData.timestamp
    
    console.log('[Webhook] 🔍 Extracted payment info:', {
      paymentHash,
      amount,
      settled,
      settledAt,
      hasPaymentHash: !!paymentHash,
      hasAmount: !!amount,
      isSettled: settled
    })
    
    if (!paymentHash) {
      console.error('[Webhook] ❌ No payment hash found in webhook data')
      return new Response('No payment hash found', { status: 400 })
    }
    
    // Store payment data for verification API to use
    const paymentInfo = {
      paymentHash,
      amount,
      settled,
      settledAt,
      state: webhookData.state || webhookData.status || 'SETTLED',
      timestamp: new Date().toISOString(),
      source: 'Alby Webhook',
      rawData: webhookData
    }
    
    console.log('[Webhook] 💾 Storing payment info:', paymentInfo)
    
    // Store in Cloudflare KV for verification API
    await context.env.PAYMENT_WEBHOOK_DATA.put(paymentHash, JSON.stringify(paymentInfo))
    
    console.log('[Webhook] ✅ Payment data stored successfully')
    
    // Return success response
    return new Response(JSON.stringify({
      success: true,
      message: 'Payment webhook processed successfully',
      paymentHash,
      amount,
      settled
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
    
  } catch (error) {
    console.error('[Webhook] ❌ Error processing webhook:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

// Also handle GET requests for webhook testing
export const onRequestGet = async (context) => {
  return new Response(JSON.stringify({
    message: 'Payment webhook endpoint is active',
    endpoint: '/api/incentive/payment-webhook',
    methods: ['POST'],
    instructions: 'Configure this URL in your Alby webhook settings'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}
