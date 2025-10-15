import { NostrWebLNProvider } from '@getalby/sdk'
import * as bolt11 from 'bolt11'

export async function onRequestPost(context: any) {
  console.log('[Payment Verify] Function called')
  
  try {
    const body = await context.request.json()
    const { paymentHash, invoiceString } = body
    
    console.log('[Payment Verify] Request:', { paymentHash, hasInvoiceString: !!invoiceString })
    console.log('[Payment Verify] Hash format check:', {
      length: paymentHash?.length,
      isNip47Format: paymentHash?.startsWith('nip47-'),
      isHexFormat: /^[a-f0-9]{64}$/.test(paymentHash),
      preview: paymentHash?.substring(0, 20) + '...'
    })
    console.log('[Payment Verify] Invoice string:', invoiceString?.substring(0, 50) + '...')
    
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
    
    // Validate and determine verification method
    let verificationMethod = ''
    let actualPaymentHash = paymentHash
    
    if (paymentHash.startsWith('nip47-')) {
      // Legacy fake hash format - extract real hash from invoice
      console.log('[Payment Verify] 🔍 Detected legacy NIP-47 format hash')
      console.log('[Payment Verify] 🔍 Legacy hash:', paymentHash)
      
      if (!invoiceString) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Legacy format requires invoice string for verification',
            details: 'Missing invoiceString in request body'
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
      
      // Extract real payment hash from invoice
      try {
        const decoded = bolt11.decode(invoiceString)
        const realHash = decoded.tagsObject?.payment_hash
        
        if (!realHash || realHash.length !== 64 || !/^[a-f0-9]{64}$/i.test(realHash)) {
          throw new Error(`Invalid payment hash in invoice: ${realHash}`)
        }
        
        console.log('[Payment Verify] ✅ Extracted real hash from invoice:', realHash)
        verificationMethod = 'BOLT11-decoded Payment Hash'
        actualPaymentHash = realHash
      } catch (decodeError) {
        console.error('[Payment Verify] ❌ Failed to decode invoice:', decodeError)
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to extract payment hash from invoice',
            details: decodeError.message
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
    } else if (/^[a-f0-9]{64}$/.test(paymentHash)) {
      // This is a real 64-char hex payment hash
      console.log('[Payment Verify] ✅ Real 64-char hex payment hash detected')
      verificationMethod = 'Real Payment Hash'
      actualPaymentHash = paymentHash
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid payment hash format',
          details: 'Expected 64-character hex hash (like: 927c15a8dbe64ca9d86d4dfd1c3fd3c0acd9c9a90b2b3df25e1a08f45d6c1e7a)'
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
    console.log('[Payment Verify] Using verification method:', verificationMethod)
    
    let invoiceStatus = null
    
    // Use the real payment hash for verification
    console.log('[Payment Verify] 🔄 Verifying with real payment hash...')
    console.log('[Payment Verify] Real payment hash:', actualPaymentHash)
    
    try {
      // Try to look up invoice by payment hash
      let lookupRequest
      
      if (verificationMethod === 'BOLT11-decoded Payment Hash' || verificationMethod === 'Real Payment Hash') {
        // Use payment_hash for lookup
        lookupRequest = { payment_hash: actualPaymentHash }
        console.log('[Payment Verify] Using payment_hash for lookup:', actualPaymentHash)
      } else {
        // Fallback to invoice string
        lookupRequest = { invoice: actualPaymentHash }
        console.log('[Payment Verify] Using invoice string for lookup:', actualPaymentHash.substring(0, 50) + '...')
      }
      
      invoiceStatus = await nwc.lookupInvoice(lookupRequest)
      console.log('[Payment Verify] ✅ Lookup successful!')
      console.log('[Payment Verify] Response:', JSON.stringify(invoiceStatus, null, 2))
      
    } catch (lookupError) {
      console.error('[Payment Verify] Lookup error:', lookupError)
      
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
    
    if (false) { // Disabled old logic
      // Use Direct Alby API for standard payment hash
      console.log('[Payment Verify] 🔄 Using Direct Alby API with payment hash...')
      
      try {
        const albyResponse = await fetch(`https://api.getalby.com/invoices/${actualPaymentHash}`, {
          headers: {
            'Authorization': `Bearer ${context.env.ALBY_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (albyResponse.ok) {
          invoiceStatus = await albyResponse.json()
          console.log('[Payment Verify] ✅ Direct Alby API successful!')
          console.log('[Payment Verify] Alby response:', JSON.stringify(invoiceStatus, null, 2))
        } else {
          console.log('[Payment Verify] ❌ Direct Alby API failed with status:', albyResponse.status)
          const errorText = await albyResponse.text()
          console.log('[Payment Verify] Alby error response:', errorText)
          throw new Error(`Direct Alby API failed: ${albyResponse.status}`)
        }
      } catch (albyError) {
        console.error('[Payment Verify] Direct Alby API error:', albyError)
        
        return new Response(
          JSON.stringify({
            success: false,
            paid: false,
            paymentHash: paymentHash,
            error: 'Direct Alby API verification failed',
            details: albyError instanceof Error ? albyError.message : 'Unknown error'
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
