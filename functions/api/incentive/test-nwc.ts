import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[TestNWC] ${msg}`, data || '')

export async function onRequestPost(context: any) {
  try {
    log('========================================')
    log('🧪 TESTING NWC CONNECTION')
    log('========================================')
    
    const body = await context.request.json()
    log('📝 Request body:', body)
    
    const { testInvoice } = body
    
    if (!testInvoice) {
      return new Response(JSON.stringify({
        success: false,
        error: 'testInvoice required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Check environment
    const NWC_CONNECTION_URL = context.env.NWC_CONNECTION_URL
    if (!NWC_CONNECTION_URL) {
      return new Response(JSON.stringify({
        success: false,
        error: 'NWC_CONNECTION_URL not configured'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    log('✅ Environment variables OK')
    log('🔌 NWC URL preview:', NWC_CONNECTION_URL.substring(0, 40) + '...')
    
    // Connect to NWC
    log('🔌 Connecting to NWC...')
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })
    
    await nwc.enable()
    log('✅ NWC enabled')
    
    // Get wallet info
    log('📱 Getting wallet info...')
    const walletInfo = await nwc.getInfo()
    log('📱 Wallet info:', {
      alias: walletInfo.alias,
      methods: walletInfo.methods,
      version: walletInfo.version
    })
    
    // Test invoice lookup
    log('🔍 Testing invoice lookup...')
    log('📋 Test invoice:', testInvoice.substring(0, 50) + '...')
    
    let lookupResult = null
    let lookupError = null
    
    try {
      lookupResult = await nwc.lookupInvoice({
        invoice: testInvoice
      })
      log('✅ Invoice lookup successful:', lookupResult)
    } catch (error) {
      lookupError = error
      log('❌ Invoice lookup failed:', error.message)
    }
    
    // Test balance
    log('💰 Testing balance retrieval...')
    let balanceResult = null
    let balanceError = null
    
    try {
      balanceResult = await nwc.getBalance()
      log('✅ Balance retrieval successful:', balanceResult)
    } catch (error) {
      balanceError = error
      log('❌ Balance retrieval failed:', error.message)
    }
    
    log('========================================')
    log('🧪 NWC TEST COMPLETE')
    log('========================================')
    
    return new Response(JSON.stringify({
      success: true,
      walletInfo: {
        alias: walletInfo.alias,
        methods: walletInfo.methods,
        version: walletInfo.version
      },
      invoiceLookup: {
        success: !lookupError,
        result: lookupResult,
        error: lookupError?.message
      },
      balanceCheck: {
        success: !balanceError,
        result: balanceResult,
        error: balanceError?.message
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    log('========================================')
    log('❌ NWC TEST ERROR')
    log('❌ Error:', error.message)
    log('❌ Stack:', error.stack)
    log('========================================')
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
