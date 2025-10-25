import { NextRequest, NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateTopUpInvoice] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 CREATE TOP-UP INVOICE REQUEST')
    log('========================================')

    const { userPubkey, amountSats, timestamp } = await request.json()

    log('📝 Amount:', amountSats, 'sats')
    log('📝 User:', userPubkey?.substring(0, 8))

    // Validate inputs
    if (!amountSats || amountSats <= 0) {
      throw new Error('Invalid amount: ' + amountSats)
    }

    if (!userPubkey || typeof userPubkey !== 'string') {
      throw new Error('Invalid userPubkey')
    }

    // Get NWC connection URL from environment
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL

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

    // Extract payment hash from NWC response (if available)
    let paymentHash = invoice.paymentHash || invoice.payment_hash || invoice.rHash || invoice.r_hash

    // If not available, try to get it from the invoice object
    if (!paymentHash && invoice.invoice) {
      paymentHash = invoice.invoice.paymentHash || invoice.invoice.payment_hash
    }

    // Last resort: generate tracking ID (though this won't work for verification)
    if (!paymentHash) {
      log('⚠️ No payment hash found in NWC response, generating tracking ID')
      paymentHash = `${userPubkey.substring(0, 8)}-topup-${amountSats}-${timestamp}`
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

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })

  } catch (error: any) {
    log('========================================')
    log('❌ ERROR CREATING TOP-UP INVOICE')
    log('❌ Error:', error.message)
    log('❌ Stack:', error.stack)
    log('========================================')

    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.stack
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })
  }
}
