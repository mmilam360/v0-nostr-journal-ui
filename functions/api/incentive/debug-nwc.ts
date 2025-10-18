import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[DebugNWC] ${msg}`, data || '')

export async function onRequestPost(context: any) {
  try {
    log('========================================')
    log('🔧 DEBUG NWC CONNECTION')
    log('========================================')
    
    const { invoiceString, paymentHash } = await context.request.json()
    
    log('🔍 Invoice string length:', invoiceString?.length || 0)
    log('🔍 Payment hash:', paymentHash)
    
    // ⚠️ CRITICAL: Use context.env for Cloudflare
    const NWC_CONNECTION_URL = context.env.NWC_CONNECTION_URL
    
    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      return new Response(JSON.stringify({
        success: false,
        error: 'Server not configured: NWC_CONNECTION_URL missing'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
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
    
    // Get wallet info
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
          return new Response(JSON.stringify({
            success: false,
            error: 'NWC connection does not have lookupInvoice permission. Please reconfigure in Alby Hub with lookupInvoice enabled.',
            availableMethods: walletInfo.methods
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        }
        log('✅ lookupInvoice method is available')
      }
    } catch (infoError) {
      log('⚠️ Could not get wallet info:', infoError.message)
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not get wallet info: ' + infoError.message
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Test invoice lookup
    if (invoiceString) {
      log('🔍 Testing invoice lookup...')
      log('📋 Invoice string length:', invoiceString.length)
      log('📋 Invoice preview:', invoiceString.substring(0, 50) + '...')
      
      try {
        log('🔍 Method 1: Looking up by invoice string...')
        const result1 = await nwc.lookupInvoice(invoiceString)
        log('✅ Method 1 result:', result1)
        
        return new Response(JSON.stringify({
          success: true,
          walletInfo: {
            alias: walletInfo.alias,
            pubkey: walletInfo.pubkey?.substring(0, 16),
            network: walletInfo.network,
            methods: walletInfo.methods
          },
          invoiceLookup: {
            method: 'invoice_string',
            result: result1
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
        
      } catch (error) {
        log('❌ Invoice lookup failed:', error.message)
        log('❌ Error type:', error.constructor.name)
        log('❌ Full error:', error)
        
        return new Response(JSON.stringify({
          success: false,
          error: 'Invoice lookup failed: ' + error.message,
          errorType: error.constructor.name,
          walletInfo: {
            alias: walletInfo.alias,
            pubkey: walletInfo.pubkey?.substring(0, 16),
            network: walletInfo.network,
            methods: walletInfo.methods
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    } else {
      return new Response(JSON.stringify({
        success: true,
        walletInfo: {
          alias: walletInfo.alias,
          pubkey: walletInfo.pubkey?.substring(0, 16),
          network: walletInfo.network,
          methods: walletInfo.methods
        },
        message: 'NWC connection successful, but no invoice provided for testing'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
  } catch (error) {
    log('❌ Debug NWC failed:', error.message)
    log('❌ Error type:', error.constructor.name)
    log('❌ Full error:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Debug NWC failed: ' + error.message,
      errorType: error.constructor.name
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
