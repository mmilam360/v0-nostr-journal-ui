import { NostrWebLNProvider } from '@getalby/sdk'
import { decode } from 'light-bolt11-decoder'

export async function onRequestPost(context: any) {
  console.log('[Payment Verify] ========================================')
  console.log('[Payment Verify] Function called')
  
  try {
    const body = await context.request.json()
    const { paymentHash, invoiceString } = body
    
    console.log('[Payment Verify] Request received:', { 
      paymentHash: paymentHash?.substring(0, 20) + '...', 
      hasInvoiceString: !!invoiceString 
    })
    console.log('[Payment Verify] Hash format check:', {
      length: paymentHash?.length,
      isNip47Format: paymentHash?.startsWith('nip47-'),
      isHexFormat: /^[a-f0-9]{64}$/.test(paymentHash),
      preview: paymentHash?.substring(0, 20) + '...'
    })
    console.log('[Payment Verify] Invoice string preview:', invoiceString?.substring(0, 50) + '...')
    
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
        const decoded = decode(invoiceString)
        const hashSection = decoded.sections?.find(s => s.name === 'payment_hash')
        const realHash = hashSection?.value
        
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
    
    // CRITICAL: Use YOUR app's NWC connection, not user's!
    console.log('[Payment Verify] 🔌 Connecting to APP wallet (not user wallet)...')
    
    const albyUrl = context.env.APP_LIGHTNING_NODE_URL
    console.log('[Payment Verify] NWC URL exists:', !!albyUrl)
    console.log('[Payment Verify] NWC URL preview:', albyUrl?.substring(0, 30) + '...')
    
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
    
    console.log('[Payment Verify] Connecting to YOUR app Alby Hub...')
    
    // Connect to YOUR app Alby Hub (where payments are received)
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: albyUrl // YOUR app NWC connection
    })
    
    console.log('[Payment Verify] 🔌 NWC object created')
    await nwc.enable()
    console.log('[Payment Verify] ✅ Connected to APP wallet')
    
    // Test: Try to get wallet info to verify connection
    try {
      const info = await nwc.getInfo()
      console.log('[Payment Verify] 📱 Wallet info:', info)
    } catch (e) {
      console.log('[Payment Verify] ⚠️ Could not get wallet info:', e.message)
    }
    
    console.log('[Payment Verify] Checking payment status for hash:', paymentHash)
    console.log('[Payment Verify] Using verification method:', verificationMethod)
    
    // Use the real payment hash for verification
    console.log('[Payment Verify] 🔄 Verifying with real payment hash...')
    console.log('[Payment Verify] Real payment hash:', actualPaymentHash)
    
    let invoiceStatus = null
    let lookupMethod = ''
    
    try {
      // Method 1: Try by payment_hash
      console.log('[Payment Verify] 🔍 Trying lookupInvoice with payment_hash...')
      try {
        invoiceStatus = await nwc.lookupInvoice({
          payment_hash: actualPaymentHash
        })
        lookupMethod = 'payment_hash'
        console.log('[Payment Verify] ✅ Found via payment_hash')
      } catch (error) {
        console.log('[Payment Verify] ⚠️ payment_hash lookup failed:', error.message)
        
        // Method 2: Try by invoice string
        if (invoiceString) {
          try {
            console.log('[Payment Verify] 🔍 Trying lookupInvoice with invoice string...')
            invoiceStatus = await nwc.lookupInvoice({
              invoice: invoiceString
            })
            lookupMethod = 'invoice_string'
            console.log('[Payment Verify] ✅ Found via invoice string')
          } catch (error2) {
            console.log('[Payment Verify] ⚠️ invoice string lookup failed:', error2.message)
            throw new Error('Could not find invoice using payment_hash or invoice string')
          }
        } else {
          throw error
        }
      }
      
      console.log('[Payment Verify] 📋 Invoice status:', JSON.stringify(invoiceStatus, null, 2))
      console.log('[Payment Verify] Lookup method:', lookupMethod)
      
      // Check if paid
      const isPaid = invoiceStatus.settled === true || 
                     invoiceStatus.state === 'settled' ||
                     invoiceStatus.status === 'SETTLED' ||
                     invoiceStatus.paid === true
      
      const amount = invoiceStatus.amount || 
                     invoiceStatus.value || 
                     invoiceStatus.amountSats ||
                     (invoiceStatus.amt_msat && invoiceStatus.amt_msat / 1000)
      
      console.log('[Payment Verify] 💰 Amount:', amount)
      console.log('[Payment Verify] ✅ Is Paid:', isPaid)
      console.log('[Payment Verify] 📅 Settled at:', invoiceStatus.settled_at || invoiceStatus.settledAt)
      
      if (isPaid) {
        console.log('[Payment Verify] 🎉 PAYMENT CONFIRMED!')
      } else {
        console.log('[Payment Verify] ⏳ Payment still pending')
      }
      
      return new Response(JSON.stringify({
        success: true,
        paid: isPaid,
        amount: amount,
        settledAt: invoiceStatus.settled_at || invoiceStatus.settledAt,
        state: invoiceStatus.state || invoiceStatus.status,
        lookupMethod: lookupMethod
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        }
      })
      
    } catch (lookupError) {
      console.error('[Payment Verify] ❌ NWC lookup failed:', lookupError)
      console.error('[Payment Verify] Error type:', lookupError.constructor.name)
      console.error('[Payment Verify] Error message:', lookupError.message)
      
      // Fallback: Try multiple verification methods
      console.log('[Payment Verify] 🔄 Trying alternative verification methods...')
      
      // Method 1: Try Direct Alby API
      console.log('[Payment Verify] 🔍 Method 1: Direct Alby API...')
      
      try {
        const albyToken = context.env.ALBY_ACCESS_TOKEN
        console.log('[Payment Verify] Alby token available:', !!albyToken)
        
        if (!albyToken) {
          throw new Error('ALBY_ACCESS_TOKEN not available for fallback')
        }
        
        // Try different Alby API endpoints
        let albyResponse = null
        let albyMethod = ''
        
        // Method 1: Try incoming invoices endpoint
        try {
          console.log('[Payment Verify] 🔍 Trying Alby incoming invoices endpoint...')
          albyResponse = await fetch(
            `https://api.getalby.com/invoices/incoming/${actualPaymentHash}`,
            {
              headers: {
                'Authorization': `Bearer ${albyToken}`,
                'Content-Type': 'application/json'
              }
            }
          )
          albyMethod = 'incoming'
        } catch (e) {
          console.log('[Payment Verify] ⚠️ Incoming endpoint failed, trying general invoices...')
          
          // Method 2: Try general invoices endpoint
          albyResponse = await fetch(
            `https://api.getalby.com/invoices/${actualPaymentHash}`,
            {
              headers: {
                'Authorization': `Bearer ${albyToken}`,
                'Content-Type': 'application/json'
              }
            }
          )
          albyMethod = 'general'
        }
        
        console.log('[Payment Verify] Alby API status:', albyResponse.status)
        console.log('[Payment Verify] Alby method used:', albyMethod)
        
        if (!albyResponse.ok) {
          const errorText = await albyResponse.text()
          console.error('[Payment Verify] Alby API error:', errorText)
          throw new Error(`Alby API returned ${albyResponse.status}: ${errorText}`)
        }
        
        invoiceStatus = await albyResponse.json()
        console.log('[Payment Verify] ✅ Alby API successful!')
        console.log('[Payment Verify] 📋 Alby response:', JSON.stringify(invoiceStatus, null, 2))
        
        // Check if paid using Alby response format
        const isPaid = invoiceStatus.settled === true || 
                       invoiceStatus.state === 'SETTLED' ||
                       invoiceStatus.status === 'SETTLED' ||
                       invoiceStatus.paid === true
        
        const amount = invoiceStatus.amount || 
                       invoiceStatus.value || 
                       invoiceStatus.amountSats ||
                       (invoiceStatus.amt_msat && invoiceStatus.amt_msat / 1000)
        
        console.log('[Payment Verify] 💰 Amount (Alby):', amount)
        console.log('[Payment Verify] ✅ Is Paid (Alby):', isPaid)
        console.log('[Payment Verify] 📅 Settled at (Alby):', invoiceStatus.settled_at || invoiceStatus.settledAt)
        
        if (isPaid) {
          console.log('[Payment Verify] 🎉 PAYMENT CONFIRMED via Alby API!')
        } else {
          console.log('[Payment Verify] ⏳ Payment still pending (Alby)')
        }
        
        return new Response(JSON.stringify({
          success: true,
          paid: isPaid,
          amount: amount,
          settledAt: invoiceStatus.settled_at || invoiceStatus.settledAt,
          state: invoiceStatus.state || invoiceStatus.status,
          verificationMethod: `Alby API (${albyMethod})`,
          fallbackUsed: true
        }), {
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
          }
        })
        
      } catch (albyError) {
        console.error('[Payment Verify] ❌ Alby API also failed:', albyError.message)
        
        // SECURITY FIX: Remove overly aggressive fallback methods that cause false positives
        // Only use legitimate verification methods that actually check payment status
        
        console.error('[Payment Verify] ❌ All legitimate verification methods failed')
        console.error('[Payment Verify] This means the payment has NOT been confirmed')
        console.error('[Payment Verify] Returning false to prevent false positive')
        
        return new Response(
          JSON.stringify({
            success: false,
            paid: false,
            paymentHash: paymentHash,
            error: 'Payment verification failed - payment not confirmed',
            details: {
              nwcError: lookupError.message,
              albyError: albyError.message,
              note: 'Payment must be confirmed through legitimate channels (NWC or Alby API)'
            }
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
