import { NostrWebLNProvider } from '@getalby/sdk'
import * as bolt11 from 'bolt11'

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
    
    // Extract the REAL payment hash from the BOLT11 invoice
    log('🔍 Extracting REAL payment hash from BOLT11 invoice...')
    
    let paymentHash = ''
    
    try {
      log('🔍 Decoding BOLT11 invoice...')
      log('📋 Invoice string length:', invoice.paymentRequest.length)
      log('📋 Invoice preview:', invoice.paymentRequest.substring(0, 50) + '...')
      
      const decoded = bolt11.decode(invoice.paymentRequest)
      paymentHash = decoded.tagsObject.payment_hash
      
      if (!paymentHash || !/^[a-f0-9]{64}$/i.test(paymentHash)) {
        throw new Error(`Invalid payment hash: ${paymentHash}`)
      }
      
      log('✅ REAL payment hash extracted:', paymentHash)
      log('✅ Hash length:', paymentHash.length)
      log('✅ Hash format valid:', /^[a-f0-9]{64}$/i.test(paymentHash))
      
    } catch (decodeError) {
      log('❌ Failed to decode BOLT11 invoice:', decodeError.message)
      log('❌ This is critical - payment verification will fail')
      throw new Error(`Failed to extract payment hash: ${decodeError.message}`)
    }
    
    log('📋 Final payment hash:', paymentHash)
    log('✅ Invoice created with REAL payment hash')
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