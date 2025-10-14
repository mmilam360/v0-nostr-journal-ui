import { NostrWebLNProvider } from '@getalby/sdk'

export async function onRequestPost(context: any) {
  console.log('[Payment Verify] Function called')
  
  try {
    const body = await context.request.json()
    const { paymentHash } = body
    
    console.log('[Payment Verify] Request:', { paymentHash })
    
    if (!paymentHash) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required field: paymentHash' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }
    
    // Get Alby Hub connection from environment
    const albyUrl = context.env.APP_LIGHTNING_NODE_URL
    
    if (!albyUrl) {
      console.error('[Payment Verify] Missing APP_LIGHTNING_NODE_URL environment variable')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Server configuration error: Missing Lightning node connection' 
        }),
        { 
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }
    
    console.log('[Payment Verify] Connecting to Alby Hub...')
    
    // Connect to Alby Hub
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: albyUrl
    })
    
    await nwc.enable()
    
    console.log('[Payment Verify] Checking payment status for hash:', paymentHash)
    
    // Check if the invoice has been paid
    // Note: We'll try multiple approaches for payment verification
    try {
      console.log('[Payment Verify] Attempting to verify payment...')
      
      // Approach 1: Try NIP-47 lookup_invoice if available
      let paymentStatus = null
      try {
        if (typeof nwc.lookupInvoice === 'function') {
          paymentStatus = await nwc.lookupInvoice(paymentHash)
          console.log('[Payment Verify] NIP-47 lookup_invoice result:', paymentStatus)
        } else {
          console.log('[Payment Verify] lookup_invoice method not available')
        }
      } catch (nip47Error) {
        console.log('[Payment Verify] NIP-47 lookup failed:', nip47Error.message)
      }
      
      // Approach 2: Try alternative verification methods
      if (!paymentStatus) {
        try {
          // Try to get payment info using other methods
          if (typeof nwc.getInfo === 'function') {
            const info = await nwc.getInfo()
            console.log('[Payment Verify] NWC info:', info)
          }
          
          // For now, we'll implement a simple timeout-based verification
          // In a real implementation, you'd want to check your Lightning node directly
          console.log('[Payment Verify] Using fallback verification method')
          
          // TODO: Implement proper Lightning node payment verification
          // This is a temporary fallback - in production you'd want to:
          // 1. Connect directly to your Lightning node
          // 2. Check the invoice status using your node's API
          // 3. Verify the payment hash against your node's payment history
          
          return new Response(
            JSON.stringify({
              success: true,
              paid: false,
              paymentHash: paymentHash,
              error: 'Payment verification method not yet implemented - using fallback',
              message: 'Please contact support to verify your payment manually'
            }),
            { 
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            }
          )
          
        } catch (fallbackError) {
          console.error('[Payment Verify] Fallback verification error:', fallbackError)
        }
      }
      
      // If we got a payment status from NIP-47
      if (paymentStatus && paymentStatus.paid) {
        console.log('[Payment Verify] ✅ Payment confirmed!')
        return new Response(
          JSON.stringify({
            success: true,
            paid: true,
            paymentHash: paymentHash,
            amountSats: paymentStatus.amount || 0,
            paidAt: paymentStatus.paid_at || Date.now()
          }),
          { 
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      } else {
        console.log('[Payment Verify] ⏳ Payment not yet received')
        return new Response(
          JSON.stringify({
            success: true,
            paid: false,
            paymentHash: paymentHash,
            message: 'Payment verification in progress...'
          }),
          { 
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      }
    } catch (lookupError) {
      console.error('[Payment Verify] Verification error:', lookupError)
      
      // Return error response
      return new Response(
        JSON.stringify({
          success: false,
          paid: false,
          paymentHash: paymentHash,
          error: 'Payment verification failed',
          details: lookupError instanceof Error ? lookupError.message : 'Unknown error'
        }),
        { 
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }
    
  } catch (error) {
    console.error('[Payment Verify] ❌ Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify payment',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
}

// Handle OPTIONS for CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
