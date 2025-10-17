import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[VerifyPayment] ${msg}`, data || '')

export async function onRequestPost(context: any) {
  try {
    log('========================================')
    log('📥 VERIFY PAYMENT REQUEST')
    log('========================================')
    
    const { paymentHash, invoiceString } = await context.request.json()
    
    log('🔍 Payment hash:', paymentHash)
    log('🔍 Has invoice string:', !!invoiceString)
    
    // Validate payment hash format
    if (!paymentHash || paymentHash.length !== 64 || !/^[a-f0-9]{64}$/i.test(paymentHash)) {
      throw new Error('Invalid payment hash format')
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
    
    // Look up invoice via NWC
    log('🔍 Looking up invoice via NWC...')
    
    let invoiceStatus
    let lookupMethod = ''
    
    // Since we're using a tracking ID instead of a real payment hash,
    // we need a different approach to verify payments
    
    log('🔍 Payment hash is tracking ID, using alternative verification...')
    
    // For now, let's use a simple approach:
    // 1. Check if enough time has passed (invoices usually settle quickly)
    // 2. Try to lookup by invoice string if available
    // 3. Return pending status to allow manual confirmation
    
    let invoiceStatus = null
    let lookupMethod = 'tracking_id_verification'
    
    if (invoiceString) {
      try {
        log('🔍 Trying lookup by invoice string...')
        
        invoiceStatus = await nwc.lookupInvoice({
          invoice: invoiceString
        })
        
        lookupMethod = 'invoice_string'
        log('✅ Found via invoice string')
        
      } catch (invoiceError) {
        log('⚠️ invoice string lookup failed:', invoiceError.message)
        
        // Fallback: return pending status
        invoiceStatus = {
          settled: false,
          paid: false,
          amount: 0,
          state: 'pending'
        }
        lookupMethod = 'invoice_lookup_failed'
      }
    } else {
      log('⚠️ No invoice string available for verification')
      invoiceStatus = {
        settled: false,
        paid: false,
        amount: 0,
        state: 'pending'
      }
      lookupMethod = 'no_invoice_string'
    }
    
    log('📋 Invoice status:', invoiceStatus)
    
    // Check if paid (multiple possible field names)
    const isPaid = invoiceStatus.settled === true || 
                   invoiceStatus.state === 'settled' ||
                   invoiceStatus.status === 'SETTLED' ||
                   invoiceStatus.paid === true
    
    const amount = invoiceStatus.amount || 
                   invoiceStatus.value ||
                   (invoiceStatus.amt_msat ? Math.floor(invoiceStatus.amt_msat / 1000) : null)
    
    log('========================================')
    log(isPaid ? '✅ PAID' : '⏳ PENDING')
    log('💰 Amount:', amount, 'sats')
    log('========================================')
    
    const response = {
      success: true,
      paid: isPaid,
      amount: amount,
      settledAt: invoiceStatus.settled_at || invoiceStatus.settledAt,
      state: invoiceStatus.state || invoiceStatus.status,
      lookupMethod: lookupMethod
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
    log('❌ ERROR VERIFYING PAYMENT')
    log('❌ Error:', error.message)
    log('❌ Stack:', error.stack)
    log('========================================')
    
    return new Response(JSON.stringify({
      success: false,
      paid: false,
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