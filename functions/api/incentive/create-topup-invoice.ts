import { NostrWebLNProvider } from '@getalby/sdk'
import { decode } from 'light-bolt11-decoder'

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
    log('📋 Full invoice object:', JSON.stringify(invoice, null, 2))
    log('📋 Invoice object keys:', Object.keys(invoice))
    log('📋 Invoice top-level fields:', {
      paymentRequest: !!invoice.paymentRequest,
      paymentHash: !!invoice.paymentHash,
      payment_hash: !!invoice.payment_hash,
      rHash: !!invoice.rHash,
      r_hash: !!invoice.r_hash,
      hash: !!invoice.hash
    })

    // Extract payment hash from NWC response - check all possible locations
    let paymentHash = invoice.paymentHash ||
                      invoice.payment_hash ||
                      invoice.rHash ||
                      invoice.r_hash ||
                      invoice.hash

    // If not available, try to get it from nested invoice object
    if (!paymentHash && invoice.invoice) {
      log('🔍 Checking nested invoice object...')
      paymentHash = invoice.invoice.paymentHash ||
                    invoice.invoice.payment_hash ||
                    invoice.invoice.rHash ||
                    invoice.invoice.r_hash ||
                    invoice.invoice.hash
    }

    // Check for payment hash in any nested result/data objects
    if (!paymentHash && invoice.result) {
      log('🔍 Checking result object...')
      paymentHash = invoice.result.paymentHash ||
                    invoice.result.payment_hash ||
                    invoice.result.rHash ||
                    invoice.result.r_hash ||
                    invoice.result.hash
    }

    // CRITICAL: If NWC didn't provide payment hash, decode BOLT11 invoice to extract it
    if (!paymentHash) {
      log('⚠️ No payment hash found in NWC response')
      log('🔍 Decoding BOLT11 invoice to extract payment hash...')

      try {
        const decoded = decode(invoice.paymentRequest)
        log('📋 Decoded invoice:', JSON.stringify(decoded, null, 2))

        // Find payment hash in decoded sections
        const paymentHashSection = decoded.sections.find((section: any) =>
          section.name === 'payment_hash'
        )

        if (paymentHashSection && paymentHashSection.value) {
          paymentHash = paymentHashSection.value
          log('✅ Extracted payment hash from BOLT11:', paymentHash)
        } else {
          log('⚠️ No payment_hash section found in decoded invoice')
          log('⚠️ Available sections:', decoded.sections.map((s: any) => s.name))
          throw new Error('Could not extract payment hash from invoice')
        }
      } catch (decodeError) {
        log('❌ Error decoding BOLT11 invoice:', decodeError.message)
        log('❌ Falling back to tracking ID')
        paymentHash = `topup-${userPubkey.substring(0, 8)}-${amountSats}-${timestamp}`
      }
    }

    log('✅ Payment hash for verification:', paymentHash)
    log('✅ Payment hash is real (64 char hex):', /^[a-f0-9]{64}$/i.test(paymentHash))
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
