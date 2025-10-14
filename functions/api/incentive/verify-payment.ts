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
      
      // Try direct Alby API first for more reliable verification
      let invoiceStatus = null
      let verificationMethod = ''
      
      try {
        console.log('[Payment Verify] Attempting direct Alby API verification...')
        
        const albyResponse = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
          headers: {
            'Authorization': `Bearer ${context.env.ALBY_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (albyResponse.ok) {
          invoiceStatus = await albyResponse.json()
          verificationMethod = 'Direct Alby API'
          console.log('[Payment Verify] ✅ Direct Alby API successful!')
          console.log('[Payment Verify] Alby response:', JSON.stringify(invoiceStatus, null, 2))
        } else {
          console.log('[Payment Verify] Direct Alby API failed, falling back to NIP-47...')
          throw new Error('Direct Alby API failed')
        }
      } catch (albyError) {
        console.log('[Payment Verify] Direct Alby API error:', albyError.message)
        console.log('[Payment Verify] Falling back to NIP-47 lookupInvoice...')
        
        // Fallback to NIP-47
        let lookupRequest
        if (paymentHash.length === 64 && /^[a-fA-F0-9]{64}$/.test(paymentHash)) {
          // We have a proper payment hash
          lookupRequest = { payment_hash: paymentHash }
          console.log('[Payment Verify] Using payment hash for lookup:', paymentHash)
        } else {
          // We have an invoice string
          lookupRequest = { invoice: paymentHash }
          console.log('[Payment Verify] Using invoice string for lookup:', paymentHash.substring(0, 50) + '...')
        }
        
        invoiceStatus = await nwc.lookupInvoice(lookupRequest)
        verificationMethod = 'NIP-47'
      }
      
      console.log('[Payment Verify] Invoice status (via', verificationMethod, '):', {
        state: invoiceStatus.state,
        settled: invoiceStatus.settled,
        amount: invoiceStatus.amount,
        settled_at: invoiceStatus.settled_at,
        type: invoiceStatus.type
      })
      
      // Check if the payment is settled (handle both Alby API and NIP-47 formats)
      const isSettled = invoiceStatus.state === 'settled' || 
                       invoiceStatus.settled === true ||
                       invoiceStatus.status === 'SETTLED'
      
      if (isSettled) {
        console.log('[Payment Verify] ✅ Payment confirmed!')
        return new Response(
          JSON.stringify({
            success: true,
            paid: true,
            paymentHash: paymentHash,
            amountSats: invoiceStatus.amount || 0,
            settledAt: invoiceStatus.settled_at,
            transactionType: invoiceStatus.type
          }),
          { 
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      } else if (invoiceStatus.state === 'pending' || invoiceStatus.status === 'PENDING') {
        console.log('[Payment Verify] ⏳ Payment pending')
        return new Response(
          JSON.stringify({
            success: true,
            paid: false,
            paymentHash: paymentHash,
            state: 'pending',
            message: 'Payment is pending'
          }),
          { 
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      } else if (invoiceStatus.state === 'failed') {
        console.log('[Payment Verify] ❌ Payment failed')
        return new Response(
          JSON.stringify({
            success: true,
            paid: false,
            paymentHash: paymentHash,
            state: 'failed',
            message: 'Payment failed'
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
        console.log('[Payment Verify] ⏳ Payment not yet received (state:', invoiceStatus.state, ')')
        return new Response(
          JSON.stringify({
            success: true,
            paid: false,
            paymentHash: paymentHash,
            state: invoiceStatus.state,
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
      
    } catch (verificationError) {
      console.error('[Payment Verify] Verification error:', verificationError)
      
      return new Response(
        JSON.stringify({
          success: false,
          paid: false,
          paymentHash: paymentHash,
          error: 'Payment verification failed',
          details: verificationError instanceof Error ? verificationError.message : 'Unknown error'
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
    
    } catch (lookupError) {
      console.error('[Payment Verify] NIP-47 lookup error:', lookupError)
      
      // Check if it's a specific NIP-47 error
      if (lookupError.code) {
        console.log('[Payment Verify] NIP-47 error code:', lookupError.code)
        
        // Handle specific NIP-47 error codes
        if (lookupError.code === 'NOT_FOUND') {
          return new Response(
            JSON.stringify({
              success: true,
              paid: false,
              paymentHash: paymentHash,
              error: 'Invoice not found',
              message: 'Invoice may not exist or may have expired'
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
      }
      
      // Return error response for other errors
      return new Response(
        JSON.stringify({
          success: false,
          paid: false,
          paymentHash: paymentHash,
          error: 'Payment verification failed',
          details: lookupError instanceof Error ? lookupError.message : 'Unknown error',
          code: lookupError.code || 'UNKNOWN_ERROR'
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
