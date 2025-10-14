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
      
      // Try to extract payment hash from Lightning invoice using bech32 decoding
      try {
        console.log('[Deposit] Attempting to extract payment hash from Lightning invoice...')
        
        // Lightning invoices are bech32 encoded, so we need to decode them
        // The payment hash is in the data part of the bech32 encoded string
        
        // Simple bech32 decoder for Lightning invoices
        function simpleBech32Decode(bech32String: string) {
          try {
            // Find the separator '1' which separates the human readable part from the data
            const separatorIndex = bech32String.lastIndexOf('1')
            if (separatorIndex === -1) return null
            
            const hrp = bech32String.substring(0, separatorIndex)
            const dataPart = bech32String.substring(separatorIndex + 1)
            
            console.log('[Deposit] Bech32 HRP:', hrp)
            console.log('[Deposit] Bech32 data part length:', dataPart.length)
            
            // Convert bech32 characters to 5-bit values
            const chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
            const data = []
            
            for (let i = 0; i < dataPart.length; i++) {
              const char = dataPart[i].toLowerCase()
              const index = chars.indexOf(char)
              if (index === -1) return null
              data.push(index)
            }
            
            console.log('[Deposit] Decoded data length:', data.length)
            
            // Convert 5-bit values to bytes
            const bytes = []
            let accumulator = 0
            let bits = 0
            
            for (const value of data) {
              accumulator = (accumulator << 5) | value
              bits += 5
              
              while (bits >= 8) {
                bytes.push((accumulator >> (bits - 8)) & 0xFF)
                bits -= 8
              }
            }
            
            console.log('[Deposit] Decoded bytes length:', bytes.length)
            
            // Look for the payment hash (32 bytes = 64 hex chars)
            // In Lightning invoices, the payment hash is typically near the end
            if (bytes.length >= 32) {
              // Try to find the payment hash by looking at different positions
              for (let i = bytes.length - 32; i >= 0; i -= 4) {
                const hashBytes = bytes.slice(i, i + 32)
                const hashHex = hashBytes.map(b => b.toString(16).padStart(2, '0')).join('')
                
                // Check if this looks like a valid payment hash
                if (/^[a-f0-9]{64}$/.test(hashHex)) {
                  console.log('[Deposit] ✅ Found potential payment hash at position', i, ':', hashHex)
                  return hashHex
                }
              }
            }
            
            return null
          } catch (error) {
            console.error('[Deposit] Bech32 decode error:', error)
            return null
          }
        }
        
        // Try to decode the invoice
        const decodedHash = simpleBech32Decode(invoiceString)
        if (decodedHash) {
          paymentHash = decodedHash
          console.log('[Deposit] ✅ Successfully extracted payment hash:', paymentHash)
        } else {
          console.log('[Deposit] Could not decode payment hash from bech32, using invoice string')
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
