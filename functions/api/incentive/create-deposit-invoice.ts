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
      // Try direct Alby API first for complete invoice data
      let invoice = null
      
      try {
        console.log('[Deposit] Attempting direct Alby API call...')
        
        const albyResponse = await fetch('https://api.getalby.com/invoices', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ALBY_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amountSats,
            memo: `Journal incentive stake - ${userPubkey.substring(0, 8)}`,
            webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nostr-journal-incentive-demo.pages.dev'}/api/incentive/webhook`
          })
        })
        
        if (albyResponse.ok) {
          invoice = await albyResponse.json()
          console.log('[Deposit] ✅ Direct Alby API successful!')
          console.log('[Deposit] Direct Alby response:', JSON.stringify(invoice, null, 2))
        } else {
          console.log('[Deposit] Direct Alby API failed, falling back to NIP-47...')
          throw new Error('Direct Alby API failed')
        }
      } catch (albyError) {
        console.log('[Deposit] Direct Alby API error:', albyError.message)
        console.log('[Deposit] Falling back to NIP-47 makeInvoice...')
        
        // Fallback to NIP-47
        invoice = await nwc.makeInvoice({
          amount: amountSats,
          memo: `Journal incentive stake - ${userPubkey.substring(0, 8)}`
        })
        console.log('[Deposit] ✅ NIP-47 makeInvoice successful!')
      }
      
      console.log('[Deposit] ✅ Invoice created successfully!')
      console.log('[Deposit] Full response type:', typeof invoice)
      console.log('[Deposit] Full response:', JSON.stringify(invoice, null, 2))
      console.log('[Deposit] Available fields:', Object.keys(invoice))
      
      // Log ALL possible payment hash fields
      const possibleHashFields = [
        'payment_hash', 'paymentHash', 'hash', 'r_hash', 'rHash',
        'checking_id', 'checkingId', 'id', 'invoice_id', 'invoiceId'
      ]
      
      console.log('[Deposit] === PAYMENT HASH FIELD ANALYSIS ===')
      possibleHashFields.forEach(field => {
        const value = invoice[field]
        if (value !== undefined) {
          console.log(`[Deposit] invoice.${field}:`, value, `(type: ${typeof value}, length: ${value?.length || 'N/A'})`)
        }
      })
      
      // Log the invoice string fields
      const possibleInvoiceFields = ['invoice', 'paymentRequest', 'payment_request', 'bolt11', 'payment_request_string']
      console.log('[Deposit] === INVOICE STRING FIELD ANALYSIS ===')
      possibleInvoiceFields.forEach(field => {
        const value = invoice[field]
        if (value !== undefined) {
          console.log(`[Deposit] invoice.${field}:`, value?.substring(0, 100) + '...', `(type: ${typeof value}, length: ${value?.length || 'N/A'})`)
        }
      })
      
      // Extract the invoice string - handle both direct Alby API and NIP-47 responses
      invoiceString = invoice.payment_request || invoice.paymentRequest || invoice.invoice
      
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
      
      // First, try to get payment hash directly from Alby response
      let directPaymentHash = null
      const directHashFields = ['payment_hash', 'paymentHash', 'hash', 'r_hash', 'rHash', 'checking_id', 'checkingId']
      
      for (const field of directHashFields) {
        if (invoice[field]) {
          directPaymentHash = invoice[field]
          console.log(`[Deposit] ✅ Found direct payment hash in ${field}:`, directPaymentHash)
          break
        }
      }
      
      if (directPaymentHash) {
        paymentHash = directPaymentHash
        console.log('[Deposit] ✅ Using direct payment hash from Alby response:', paymentHash)
      } else {
        console.log('[Deposit] No direct payment hash found, attempting bech32 decoding...')
        
        // Fallback: Try to extract payment hash from Lightning invoice using bech32 decoding
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
            // In Lightning invoices, the payment hash has a specific structure
            // It's typically found in the routing information section
            
            if (bytes.length >= 32) {
              const potentialHashes = []
              
              // Search through the decoded bytes for potential payment hashes
              for (let i = 0; i <= bytes.length - 32; i++) {
                const hashBytes = bytes.slice(i, i + 32)
                const hashHex = hashBytes.map(b => b.toString(16).padStart(2, '0')).join('')
                
                // Check if this looks like a valid payment hash
                if (/^[a-f0-9]{64}$/.test(hashHex)) {
                  potentialHashes.push({
                    position: i,
                    hash: hashHex,
                    // Payment hash is usually not at the very beginning or very end
                    score: (i > 10 && i < bytes.length - 42) ? 1 : 0
                  })
                  console.log('[Deposit] Found potential payment hash at position', i, ':', hashHex)
                }
              }
              
              console.log('[Deposit] Total potential hashes found:', potentialHashes.length)
              
              if (potentialHashes.length > 0) {
                // Try to find the most likely payment hash
                // Payment hash is usually not the first or last hash in the invoice
                const sortedHashes = potentialHashes.sort((a, b) => {
                  // Prefer hashes that are not at the extremes
                  if (a.score !== b.score) return b.score - a.score
                  // Among equally scored hashes, prefer those in the middle range
                  const aMiddle = Math.abs(a.position - bytes.length / 2)
                  const bMiddle = Math.abs(b.position - bytes.length / 2)
                  return aMiddle - bMiddle
                })
                
                const selectedHash = sortedHashes[0]
                console.log('[Deposit] ✅ Selected payment hash at position', selectedHash.position, ':', selectedHash.hash)
                console.log('[Deposit] All potential hashes:', potentialHashes.map(h => `${h.hash} (pos: ${h.position})`))
                return selectedHash.hash
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
          console.log('[Deposit] Could not decode payment hash from bech32, trying Alby SDK...')
          
          // Fallback: try using the Alby SDK's decodeInvoice method if available
          try {
            if (typeof nwc.decodeInvoice === 'function') {
              console.log('[Deposit] Trying Alby SDK decodeInvoice method...')
              const decodedInvoice = await nwc.decodeInvoice(invoiceString)
              console.log('[Deposit] Alby SDK decoded invoice:', decodedInvoice)
              
              if (decodedInvoice && (decodedInvoice.payment_hash || decodedInvoice.paymentHash)) {
                paymentHash = decodedInvoice.payment_hash || decodedInvoice.paymentHash
                console.log('[Deposit] ✅ Alby SDK extracted payment hash:', paymentHash)
              } else {
                console.log('[Deposit] Alby SDK decodeInvoice did not return payment hash')
                paymentHash = invoiceString
              }
            } else {
              console.log('[Deposit] Alby SDK decodeInvoice method not available')
              paymentHash = invoiceString
            }
          } catch (albyError) {
            console.error('[Deposit] Alby SDK decodeInvoice error:', albyError)
            paymentHash = invoiceString
          }
        }
        
        } catch (decodeError) {
          console.error('[Deposit] Error extracting payment hash:', decodeError)
          console.log('[Deposit] Using invoice string as fallback')
          paymentHash = invoiceString
        }
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
