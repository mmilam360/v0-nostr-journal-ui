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
      
      // Extract the correct fields - try different possible field names
      invoiceString = invoice.invoice || invoice.paymentRequest || invoice.payment_request
      paymentHash = invoice.payment_hash || invoice.paymentHash || invoice.hash
      
      console.log('[Deposit] FINAL - Extracted invoice string:', invoiceString)
      console.log('[Deposit] FINAL - Extracted payment hash:', paymentHash)
      
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
      
      if (!paymentHash) {
        console.error('[Deposit] ❌ No payment hash found in response!')
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Invoice creation failed: No payment hash in response',
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
