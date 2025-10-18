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
    log('🔍 Invoice string length:', invoiceString?.length || 0)
    log('🔍 Invoice string preview:', invoiceString?.substring(0, 50) + '...' || 'None')
    
    // Validate payment hash format - accept both real payment hashes and tracking IDs
    if (!paymentHash) {
      throw new Error('Missing payment hash')
    }
    
    // Check if it's a real payment hash (64 hex chars) or tracking ID (contains dashes)
    const isRealPaymentHash = paymentHash.length === 64 && /^[a-f0-9]{64}$/i.test(paymentHash)
    const isTrackingId = paymentHash.includes('-') && paymentHash.length > 10
    
    if (!isRealPaymentHash && !isTrackingId) {
      throw new Error(`Invalid payment hash format: ${paymentHash} (expected 64-char hex or tracking ID)`)
    }
    
    log('🔍 Payment hash type:', isRealPaymentHash ? 'real_payment_hash' : 'tracking_id')
    log('🔍 Payment hash value:', paymentHash)
    log('🔍 Payment hash length:', paymentHash.length)
    log('🔍 Is real payment hash?', isRealPaymentHash)
    log('🔍 Is tracking ID?', isTrackingId)
    
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
    
    // Get wallet info for debugging
    log('📱 Getting wallet info...')
    let walletInfo = null
    try {
      walletInfo = await nwc.getInfo()
      log('📱 Wallet info:', {
        alias: walletInfo.alias || 'Unknown',
        pubkey: walletInfo.pubkey?.substring(0, 16) || 'Unknown',
        network: walletInfo.network || 'Unknown',
        methods: walletInfo.methods || []
      })
      
      // Check if lookupInvoice method is available
      if (walletInfo.methods && Array.isArray(walletInfo.methods)) {
        if (!walletInfo.methods.includes('lookupInvoice')) {
          log('❌ lookupInvoice method NOT available!')
          log('❌ Available methods:', walletInfo.methods)
          throw new Error('NWC connection does not have lookupInvoice permission. Please reconfigure in Alby Hub with lookupInvoice enabled.')
        }
        log('✅ lookupInvoice method is available')
      }
    } catch (infoError) {
      log('⚠️ Could not get wallet info:', infoError.message)
    }
    
    // Look up invoice via NWC
    log('🔍 Looking up invoice via NWC...')
    log('📋 Payment hash:', paymentHash)
    log('📋 Invoice string length:', invoiceString?.length || 0)
    log('📋 Invoice string preview:', invoiceString?.substring(0, 50) + '...' || 'None')
    
    let invoiceStatus = null
    let lookupMethod = 'invoice_verification'
    
    if (invoiceString) {
      try {
        log('🔍 Attempting invoice lookup via NWC...')
        
        // For Cloudflare Functions, prioritize invoice string lookup
        // since we can't reliably extract payment hashes without Node.js built-ins
        try {
          log('🔍 Method 1: Looking up by invoice string (Cloudflare Functions)...')
          log('📋 Invoice string length:', invoiceString.length)
          log('📋 Invoice preview:', invoiceString.substring(0, 50) + '...')
          
          invoiceStatus = await nwc.lookupInvoice(invoiceString)
          lookupMethod = 'nwc_invoice_string'
          log('✅ Invoice lookup successful with invoice string')
          
        } catch (invoiceError) {
          log('⚠️ Invoice string lookup failed:', invoiceError.message)
          log('⚠️ Error type:', invoiceError.constructor.name)
          log('⚠️ Full error:', invoiceError)
          
          // Method 2: Try with invoice parameter
          try {
            log('🔍 Method 2: Looking up with invoice parameter...')
            invoiceStatus = await nwc.lookupInvoice({
              invoice: invoiceString
            })
            lookupMethod = 'nwc_invoice_param'
            log('✅ Invoice lookup successful with invoice parameter')
            
          } catch (paramError) {
            log('⚠️ Invoice parameter lookup failed:', paramError.message)
            log('⚠️ Error type:', paramError.constructor.name)
            log('⚠️ Full error:', paramError)
            
            // Method 3: Try with payment hash if it's a real one (fallback)
            if (isRealPaymentHash) {
              try {
                log('🔍 Method 3: Looking up by payment hash (fallback)...')
                log('📋 Payment hash:', paymentHash)
                
                invoiceStatus = await nwc.lookupInvoice({
                  payment_hash: paymentHash
                })
                lookupMethod = 'nwc_payment_hash'
                log('✅ Invoice lookup successful with payment hash')
                
              } catch (hashError) {
                log('⚠️ Payment hash lookup failed:', hashError.message)
                log('⚠️ Error type:', hashError.constructor.name)
                log('⚠️ Full error:', hashError)
                
                // All methods failed
                invoiceStatus = {
                  settled: false,
                  paid: false,
                  amount: 0,
                  state: 'pending'
                }
                lookupMethod = 'all_lookup_methods_failed'
                log('❌ All lookup methods failed')
              }
            } else {
              log('⚠️ Not a real payment hash, skipping payment hash lookup')
              
              // All methods failed
              invoiceStatus = {
                settled: false,
                paid: false,
                amount: 0,
                state: 'pending'
              }
              lookupMethod = 'all_lookup_methods_failed_tracking'
              log('❌ All lookup methods failed for tracking ID')
            }
          }
        }
        
      } catch (lookupError) {
        log('❌ Invoice lookup failed:', lookupError.message)
        log('❌ Error type:', lookupError.constructor.name)
        
        invoiceStatus = {
          settled: false,
          paid: false,
          amount: 0,
          state: 'pending'
        }
        lookupMethod = 'lookup_failed'
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
    
    log('📋 Invoice status received:', JSON.stringify(invoiceStatus, null, 2))
    
    // Check if paid (multiple possible field names)
    log('🔍 Checking payment status...')
    log('  settled:', invoiceStatus.settled)
    log('  state:', invoiceStatus.state)
    log('  status:', invoiceStatus.status)
    log('  paid:', invoiceStatus.paid)
    
    const isPaid = invoiceStatus.settled === true || 
                   invoiceStatus.state === 'settled' ||
                   invoiceStatus.status === 'SETTLED' ||
                   invoiceStatus.paid === true
    
    const amount = invoiceStatus.amount || 
                   invoiceStatus.value ||
                   (invoiceStatus.amt_msat ? Math.floor(invoiceStatus.amt_msat / 1000) : null)
    
    log('========================================')
    log('🔍 PAYMENT STATUS ANALYSIS')
    log('========================================')
    log('✅ Is paid:', isPaid)
    log('💰 Amount:', amount, 'sats')
    log('🔍 Lookup method:', lookupMethod)
    log('📋 Raw status fields:')
    log('  - settled:', invoiceStatus.settled)
    log('  - state:', invoiceStatus.state)
    log('  - status:', invoiceStatus.status)
    log('  - paid:', invoiceStatus.paid)
    log('  - amount:', invoiceStatus.amount)
    log('  - value:', invoiceStatus.value)
    log('  - amt_msat:', invoiceStatus.amt_msat)
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