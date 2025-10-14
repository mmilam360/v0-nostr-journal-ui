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
    // Note: This uses the NIP-47 lookup_invoice method
    try {
      const paymentStatus = await nwc.lookupInvoice(paymentHash)
      
      console.log('[Payment Verify] Payment status:', paymentStatus)
      
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
            paymentHash: paymentHash
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
      console.error('[Payment Verify] Lookup error:', lookupError)
      
      // If lookup_invoice is not supported, return not paid
      // This is a fallback - in production, you'd want proper error handling
      return new Response(
        JSON.stringify({
          success: true,
          paid: false,
          paymentHash: paymentHash,
          error: 'Payment verification temporarily unavailable'
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
