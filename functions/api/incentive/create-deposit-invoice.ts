// Static imports for Cloudflare Workers compatibility
import { webln } from '@getalby/sdk'
import { decode } from 'light-bolt11-decoder'

export async function onRequestPost(context: any) {
  console.log('[API] ========================================')
  console.log('[API] 🆕 NEW INVOICE REQUEST RECEIVED')
  console.log('[API] Timestamp:', new Date().toISOString())
  console.log('[API] Request ID:', Math.random())
  console.log('[API] ========================================')
  
  try {
    const body = await context.request.json()
    console.log('[API] Request body:', JSON.stringify(body, null, 2))
    
    const { userPubkey, amountSats, timestamp, requestId } = body
    
    console.log('[API] === NEW INVOICE CREATION REQUEST ===')
    console.log('[API] Creating invoice with amount:', amountSats)
    console.log('[API] User pubkey:', userPubkey)
    console.log('[API] Client timestamp:', timestamp)
    console.log('[API] Client request ID:', requestId)
    
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
    
    // ⚠️ CRITICAL: Use the single NWC connection (same as verification)
    const nwcUrl = context.env.NWC_CONNECTION_URL
    
    if (!nwcUrl) {
      console.error('[Invoice] Missing NWC_CONNECTION_URL environment variable')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Server configuration error: Missing NWC connection' 
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
    
    console.log('[Invoice] ========================================')
    console.log('[Invoice] 🔌 Using NWC connection (preview):', nwcUrl.substring(0, 40) + '...')
    console.log('[Invoice] 🔌 Connecting to YOUR wallet via NWC...')
    
    // Use webln.NostrWebLNProvider (simplified approach)
    const nwc = new webln.NostrWebLNProvider({
      nostrWalletConnectUrl: nwcUrl
    })
    
    console.log('[Invoice] 🔌 Enabling NWC connection...')
    await nwc.enable()
    console.log('[Invoice] ✅ NWC connection enabled successfully')
    
    // Get wallet info
    try {
      const info = await nwc.getInfo()
      console.log('[Invoice] 📱 Connected to wallet:', info.alias || 'Unknown')
      console.log('[Invoice] 📱 Lightning address:', info.lightning_address || 'Unknown')
      console.log('[Invoice] 📱 Available methods:', info.methods?.join(', ') || 'Unknown')
    } catch (e) {
      console.warn('[Invoice] ⚠️ Could not get wallet info:', e.message)
    }
    
    console.log('[Invoice] ========================================')
    console.log('[Invoice] 📝 Creating unique memo...')
    
    // Create unique memo to ensure unique invoices
    const uniqueMemo = `Journal stake - ${userPubkey.substring(0, 8)} - ${timestamp || Date.now()}`
    console.log('[Invoice] 📝 Unique memo:', uniqueMemo)
    
    console.log('[Invoice] 💰 Creating invoice for', amountSats, 'sats...')
    
    // Declare variables outside try block for proper scope
    let invoiceString = null
    let paymentHash = null
    
    try {
      // Create invoice using webln makeInvoice method
      const invoice = await nwc.makeInvoice({
        amount: amountSats,
        memo: uniqueMemo
      })
      
      console.log('[Invoice] ✅ Invoice created successfully!')
      console.log('[Invoice] 📋 Invoice response:', JSON.stringify(invoice, null, 2))
      
      // Extract invoice string from webln response
      invoiceString = invoice.paymentRequest
      console.log('[Invoice] 📄 Invoice string:', invoiceString?.substring(0, 80) + '...')
      
      if (!invoiceString) {
        throw new Error('No invoice string received from webln')
      }
      
      // Extract payment hash from BOLT11 invoice using light-bolt11-decoder
      console.log('[Invoice] 🔍 Extracting payment hash from BOLT11 invoice...')
      const decoded = decode(invoiceString)
      
      console.log('[Invoice] 🔍 Decoded invoice info:', {
        amount: decoded.sections?.find(s => s.name === 'amount')?.value,
        timestamp: decoded.sections?.find(s => s.name === 'timestamp')?.value,
        expiry: decoded.sections?.find(s => s.name === 'expiry')?.value,
        memo: decoded.sections?.find(s => s.name === 'description')?.value
      })
      
      // Extract the payment hash from sections
      const hashSection = decoded.sections?.find(s => s.name === 'payment_hash')
      paymentHash = hashSection?.value
      
      if (!paymentHash || paymentHash.length !== 64) {
        throw new Error(`Invalid payment hash extracted: ${paymentHash}`)
      }
      
      // Validate it's a proper hex string
      if (!/^[a-f0-9]{64}$/i.test(paymentHash)) {
        throw new Error(`Payment hash contains invalid characters: ${paymentHash}`)
      }
      
      console.log('[Invoice] ✅ Payment hash extracted:', paymentHash)
      console.log('[Invoice] ✅ Hash length:', paymentHash.length)
      console.log('[Invoice] ✅ Hash format valid:', /^[a-f0-9]{64}$/i.test(paymentHash))
      
    } catch (invoiceError) {
      console.error('[Invoice] ❌ Error creating invoice:', invoiceError)
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
    
    console.log('[Invoice] ========================================')
    console.log('[Invoice] ✅ INVOICE CREATION COMPLETE')
    console.log('[Invoice] 💰 Amount:', amountSats, 'sats')
    console.log('[Invoice] 🔑 Payment hash:', paymentHash)
    console.log('[Invoice] 📄 Invoice preview:', invoiceString.substring(0, 50) + '...')
    console.log('[Invoice] ========================================')
    
    const responseData = {
      success: true,
      invoice: invoiceString,
      paymentHash: paymentHash,
      invoiceString: invoiceString, // Include the actual invoice for verification
      amountSats: amountSats,
      timestamp: new Date().toISOString(),
      requestId: requestId,
      clientTimestamp: timestamp,
      source: 'NWC (Same as verification)'
    }
    
    console.log('[API] 🎯 FINAL RESPONSE:', JSON.stringify(responseData, null, 2))
    
    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
    
  } catch (error) {
    console.error('[Deposit] ❌ Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create invoice',
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
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
