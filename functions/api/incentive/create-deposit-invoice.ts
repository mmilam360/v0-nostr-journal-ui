import { NostrWebLNProvider } from '@getalby/sdk'

export async function onRequestPost(context: any) {
  console.log('[Deposit] Function called')
  
  try {
    const body = await context.request.json()
    const { userPubkey, amountSats } = body
    
    console.log('[Deposit] Request:', { userPubkey, amountSats })
    
    if (!userPubkey || !amountSats) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: userPubkey and amountSats' 
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
      console.error('[Deposit] Missing APP_LIGHTNING_NODE_URL environment variable')
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
    
    console.log('[Deposit] Connecting to Alby Hub...')
    
    // Connect to Alby Hub
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: albyUrl
    })
    
    await nwc.enable()
    
    console.log('[Deposit] Creating invoice with amount:', amountSats)
    
    let invoiceString = null
    let paymentHash = null
    
    try {
      // Create invoice
      const invoice = await nwc.makeInvoice({
        amount: amountSats,
        memo: `Journal incentive stake - ${userPubkey.substring(0, 8)}`
      })
      
      console.log('[Deposit] ✅ Invoice created successfully!')
      console.log('[Deposit] Full response type:', typeof invoice)
      console.log('[Deposit] Full response:', JSON.stringify(invoice, null, 2))
      console.log('[Deposit] Available fields:', Object.keys(invoice))
      
      // Log specific field attempts
      console.log('[Deposit] payment_hash:', invoice.payment_hash)
      console.log('[Deposit] paymentHash:', invoice.paymentHash)
      console.log('[Deposit] hash:', invoice.hash)
      console.log('[Deposit] invoice:', invoice.invoice)
      console.log('[Deposit] paymentRequest:', invoice.paymentRequest)
      console.log('[Deposit] payment_request:', invoice.payment_request)
      
      // Extract the invoice string - we know it's in paymentRequest field
      invoiceString = invoice.paymentRequest
      
      console.log('[Deposit] Extracted invoice string:', invoiceString)
      
      if (!invoiceString) {
        console.error('[Deposit] ❌ No invoice string found in response!')
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Invoice creation failed: No invoice string in response',
            debug: { availableFields: Object.keys(invoice) }
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
      
      // Try to extract payment hash from Lightning invoice
      try {
        console.log('[Deposit] Attempting to extract payment hash from Lightning invoice...')
        
        // Simple approach: Lightning invoices contain the payment hash in a specific format
        // The payment hash is typically 32 bytes (64 hex characters) in the invoice
        // We can try to extract it using a simple regex or string parsing
        
        // Method 1: Try to find a 64-character hex string in the invoice
        const hexPattern = /[a-fA-F0-9]{64}/g
        const hexMatches = invoiceString.match(hexPattern)
        
        if (hexMatches && hexMatches.length > 0) {
          // The payment hash is usually the longest hex string in the invoice
          const longestHex = hexMatches.reduce((a, b) => a.length > b.length ? a : b)
          if (longestHex.length === 64) {
            paymentHash = longestHex
            console.log('[Deposit] ✅ Extracted payment hash from invoice:', paymentHash)
          }
        }
        
        // Method 2: If no 64-char hex found, try to decode bech32 manually
        if (!paymentHash) {
          console.log('[Deposit] Trying manual bech32 decoding...')
          
          // Lightning invoices start with 'lnbc' and use bech32 encoding
          // The payment hash is in the data part after the amount and timestamp
          // This is a simplified approach - in production you'd want a full bech32 decoder
          
          // Try to find the payment hash by looking for patterns
          // This is a basic implementation
          const parts = invoiceString.split('1')
          if (parts.length > 2) {
            // Look for potential payment hash in the data parts
            for (let i = 2; i < parts.length; i++) {
              const part = parts[i]
              if (part && part.length >= 32) {
                // Try to extract a potential hash
                const potentialHash = part.substring(0, 64)
                if (/^[a-fA-F0-9]{64}$/.test(potentialHash)) {
                  paymentHash = potentialHash
                  console.log('[Deposit] ✅ Found potential payment hash:', paymentHash)
                  break
                }
              }
            }
          }
        }
        
        // Fallback: if we still can't extract the hash, use the invoice string
        if (!paymentHash) {
          console.log('[Deposit] Could not extract payment hash, using invoice string for verification')
          paymentHash = invoiceString
        }
        
      } catch (decodeError) {
        console.error('[Deposit] Error extracting payment hash:', decodeError)
        console.log('[Deposit] Using invoice string as fallback')
        paymentHash = invoiceString
      }
      
      console.log('[Deposit] FINAL - Invoice string:', invoiceString)
      console.log('[Deposit] FINAL - Payment hash:', paymentHash)
      
    } catch (invoiceError) {
      console.error('[Deposit] ❌ Error creating invoice:', invoiceError)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to create invoice: ' + (invoiceError.message || 'Unknown error'),
          details: invoiceError.stack
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
    
    return new Response(
      JSON.stringify({
        success: true,
        invoice: invoiceString,
        paymentHash: paymentHash,
        amountSats: amountSats
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
    
  } catch (error) {
    console.error('[Deposit] ❌ Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create invoice',
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
