import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateTopUpInvoice] ${msg}`, data || '')

export async function onRequestPost(context: any) {
  try {
    log('========================================')
    log('📥 CREATE TOP-UP INVOICE REQUEST')
    log('========================================')

    const { userPubkey, amountSats, timestamp } = await context.request.json()

    log('📝 Amount:', amountSats, 'sats')
    log('📝 User:', userPubkey?.substring(0, 8))

    // Validate inputs
    if (!amountSats || amountSats <= 0) {
      throw new Error('Invalid amount: ' + amountSats)
    }

    if (amountSats < 100) {
      throw new Error('Minimum top-up is 100 sats')
    }

    if (amountSats > 1000000) {
      throw new Error('Maximum top-up is 1,000,000 sats')
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
    log('📝 Creating top-up invoice via NWC...')

    const invoice = await nwc.makeInvoice({
      amount: amountSats,  // Amount in sats
      memo: `Nostr Journal top-up - ${userPubkey.substring(0, 8)} - ${timestamp}`
    })

    log('✅ Top-up invoice created via NWC')
    log('📋 Invoice string length:', invoice.paymentRequest?.length || 0)
    log('📋 Invoice string preview:', invoice.paymentRequest?.substring(0, 80) + '...')
    log('📋 Full invoice string:', invoice.paymentRequest)

    // Generate a tracking ID for this invoice
    const paymentHash = `${userPubkey.substring(0, 8)}-topup-${amountSats}-${timestamp}`

    log('✅ Generated tracking ID for invoice:', paymentHash)
    log('✅ Will use invoice string for verification')
    log('========================================')

    const response = {
      success: true,
      invoice: invoice.paymentRequest,      // BOLT11 invoice string
      paymentHash: paymentHash,             // Tracking ID
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
    log('❌ ERROR CREATING TOP-UP INVOICE')
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
