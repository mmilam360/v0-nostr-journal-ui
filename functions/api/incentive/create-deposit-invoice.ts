import { NostrWebLNProvider } from '@getalby/sdk'

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
    log('📋 Invoice string length:', invoice.paymentRequest?.length || 0)
    log('📋 Invoice string preview:', invoice.paymentRequest?.substring(0, 80) + '...')
    log('📋 Full invoice string:', invoice.paymentRequest)
    
    // For Cloudflare Functions, we'll use the invoice string directly for verification
    // since BOLT11 decoding requires Node.js built-ins that aren't available
    log('🔍 Using invoice string for verification (Cloudflare Functions compatible)')
    
    let paymentHash = ''
    
    try {
      log('📋 Invoice string length:', invoice.paymentRequest.length)
      log('📋 Invoice preview:', invoice.paymentRequest.substring(0, 50) + '...')
      
      // Generate a tracking ID for this invoice
      // The verify-payment function will use the invoice string directly
      const timestamp = Date.now()
      paymentHash = `${userPubkey.substring(0, 8)}-${amountSats}-${timestamp}`
      
      log('✅ Generated tracking ID for invoice:', paymentHash)
      log('✅ Will use invoice string for verification')
      
    } catch (error) {
      log('❌ Error generating tracking ID:', error.message)
      throw new Error(`Failed to generate payment tracking: ${error.message}`)
    }
    
    log('📋 Final payment hash (tracking ID):', paymentHash)
    log('✅ Invoice created with tracking ID')
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