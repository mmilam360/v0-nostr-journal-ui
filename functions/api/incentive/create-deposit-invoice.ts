import { NostrWebLNProvider } from '@getalby/sdk'
import { decodeBolt11 } from './simple-bolt11-decoder'

const log = (msg: string, data?: any) => console.log(`[CreateInvoice] ${msg}`, data || '')

export async function onRequestPost(context: any) {
  try {
    log('========================================')
    log('📥 CREATE INVOICE REQUEST')
    log('========================================')
    
    const { userPubkey, amountSats, timestamp } = await context.request.json()
    
    log('📝 Amount:', amountSats, 'sats')
    log('📝 User:', userPubkey?.substring(0, 8))
    
    // Validate inputs
    if (!amountSats || amountSats <= 0) {
      throw new Error('Invalid amount: ' + amountSats)
    }
    
    if (!userPubkey || typeof userPubkey !== 'string') {
      throw new Error('Invalid userPubkey')
    }
    
    // ⚠️ CRITICAL: Use context.env for Cloudflare
    const NWC_CONNECTION_URL = context.env.NWC_CONNECTION_URL
    
    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      throw new Error('Server not configured: NWC_CONNECTION_URL missing')
    }
    
    log('✅ NWC_CONNECTION_URL found')
    log('🔌 NWC preview:', NWC_CONNECTION_URL.substring(0, 50) + '...')
    
    // Connect to NWC
    log('🔌 Creating NWC connection...')
    
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })
    
    log('🔌 Enabling NWC...')
    await nwc.enable()
    
    log('✅ NWC connected successfully')
    
    // Create invoice
    log('📝 Creating invoice via NWC...')
    
    const invoice = await nwc.makeInvoice({
      amount: amountSats,  // Amount in sats
      memo: `Nostr Journal stake - ${userPubkey.substring(0, 8)} - ${timestamp}`
    })
    
    log('✅ Invoice created via NWC')
    log('📋 Invoice string:', invoice.paymentRequest?.substring(0, 80) + '...')
    
    // Try to get the real payment hash from the NWC response
    log('🔍 Extracting payment hash from NWC response...')
    log('📋 NWC response keys:', Object.keys(invoice))
    
    let paymentHash = ''
    
    // Check if NWC response already includes payment hash
    if (invoice.paymentHash) {
      paymentHash = invoice.paymentHash
      log('✅ Payment hash from NWC response:', paymentHash)
    } else if (invoice.payment_hash) {
      paymentHash = invoice.payment_hash
      log('✅ Payment hash from NWC response (snake_case):', paymentHash)
    } else if (invoice.hash) {
      paymentHash = invoice.hash
      log('✅ Payment hash from NWC response (hash):', paymentHash)
    } else {
      log('⚠️ No payment hash in NWC response, trying BOLT11 decode...')
      
      try {
        // Try to decode the BOLT11 invoice to get the real payment hash
        const decodedInvoice = decodeBolt11(invoice.paymentRequest)
        
        if (decodedInvoice.valid && decodedInvoice.paymentHash) {
          paymentHash = decodedInvoice.paymentHash
          log('✅ Real payment hash extracted from BOLT11:', paymentHash)
          log('💰 Invoice amount:', decodedInvoice.amount, 'sats')
        } else {
          throw new Error('BOLT11 decode failed or no payment hash found')
        }
        
      } catch (decodeError) {
        log('⚠️ BOLT11 decode failed:', decodeError.message)
        log('🔍 Falling back to tracking ID...')
        
        // Fallback: generate a tracking ID
        const invoiceTimestamp = Date.now()
        paymentHash = `${userPubkey.substring(0, 8)}-${amountSats}-${invoiceTimestamp}`
        log('📋 Generated tracking ID (fallback):', paymentHash)
      }
    }
    
    log('📋 Final payment hash:', paymentHash)
    log('📋 Invoice string length:', invoice.paymentRequest.length)
    log('✅ Invoice created with payment hash')
    log('========================================')
    
    const response = {
      success: true,
      invoice: invoice.paymentRequest,      // BOLT11 invoice string
      paymentHash: paymentHash,             // Real payment hash or tracking ID
      amount: amountSats,
      timestamp: new Date().toISOString()
    }
    
    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }
    })
    
  } catch (error) {
    log('========================================')
    log('❌ ERROR CREATING INVOICE')
    log('❌ Error:', error.message)
    log('❌ Stack:', error.stack)
    log('========================================')
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}