import { NostrWebLNProvider } from '@getalby/sdk'

// Logging helper
const log = (msg: string, data?: any) => {
  console.log(`[SendReward API] ${msg}`, data || '')
}

export async function onRequestPost({ request }: { request: Request }) {
  const requestStartTime = Date.now()
  
  try {
    log('========================================')
    log('📥 PAYMENT REQUEST RECEIVED (Cloudflare Functions)')
    log('⏰ Timestamp:', new Date().toISOString())
    log('========================================')
    
    // =============================================
    // STEP 1: PARSE REQUEST BODY
    // =============================================
    
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      log('❌ Failed to parse request body:', parseError.message)
      throw new Error('Invalid JSON in request body')
    }
    
    const { userPubkey, amount, lightningAddress, isRefund } = body
    
    log('📋 Request details:', {
      userPubkey: userPubkey?.substring(0, 8) || 'missing',
      amount: amount || 'missing',
      lightningAddress: lightningAddress || 'missing',
      isRefund: isRefund || false
    })
    
    // =============================================
    // STEP 2: VALIDATE INPUT FORMAT ONLY
    // DO NOT validate business logic here
    // The monitor already did that
    // =============================================
    
    log('🔍 Validating input format...')
    
    // Check userPubkey exists and is hex string
    if (!userPubkey) {
      throw new Error('Missing userPubkey in request')
    }
    
    if (typeof userPubkey !== 'string' || userPubkey.length !== 64) {
      throw new Error('Invalid userPubkey format (must be 64-char hex string)')
    }
    
    log('  ✅ userPubkey format valid')
    
    // Check amount is positive number
    if (!amount) {
      throw new Error('Missing amount in request')
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error(`Invalid amount: ${amount} (must be positive number)`)
    }
    
    if (amount < 1) {
      throw new Error(`Amount too small: ${amount} sats (minimum 1 sat)`)
    }
    
    log('  ✅ amount valid:', amount, 'sats')
    
    // Check Lightning address format
    if (!lightningAddress) {
      throw new Error('Missing lightningAddress in request')
    }
    
    if (typeof lightningAddress !== 'string' || !lightningAddress.includes('@')) {
      throw new Error(`Invalid Lightning address format: ${lightningAddress} (must be user@domain.com)`)
    }
    
    // Validate Lightning address structure more strictly
    const addressParts = lightningAddress.split('@')
    if (addressParts.length !== 2 || !addressParts[0] || !addressParts[1]) {
      throw new Error(`Malformed Lightning address: ${lightningAddress}`)
    }
    
    log('  ✅ lightningAddress format valid:', lightningAddress)
    
    log('✅ All input validation passed')
    
    // =============================================
    // STEP 3: CONNECT TO NWC (SERVER-SIDE ONLY)
    // =============================================
    
    log('========================================')
    log('🔌 CONNECTING TO NWC')
    log('========================================')
    
    // Get NWC connection URL from environment
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL
    
    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL environment variable not set!')
      log('❌ This must be configured in Cloudflare Pages settings')
      throw new Error('Server configuration error: NWC not configured. Please contact support.')
    }
    
    log('✅ NWC_CONNECTION_URL exists in environment')
    log('🔌 NWC URL preview:', NWC_CONNECTION_URL.substring(0, 50) + '...')
    
    // Validate NWC URL format
    if (!NWC_CONNECTION_URL.startsWith('nostr+walletconnect://')) {
      log('❌ NWC_CONNECTION_URL has invalid format!')
      log('❌ Should start with: nostr+walletconnect://')
      throw new Error('Server configuration error: Invalid NWC format')
    }
    
    log('✅ NWC URL format valid')
    
    // Create NWC provider
    log('🔌 Creating NostrWebLNProvider...')
    
    let nwc
    try {
      nwc = new NostrWebLNProvider({
        nostrWalletConnectUrl: NWC_CONNECTION_URL
      })
    } catch (providerError) {
      log('❌ Failed to create NWC provider:', providerError.message)
      throw new Error('Failed to initialize NWC connection')
    }
    
    log('✅ NostrWebLNProvider created')
    
    // Enable the NWC connection
    log('🔌 Enabling NWC connection...')
    
    try {
      await nwc.enable()
    } catch (enableError) {
      log('❌ Failed to enable NWC:', enableError.message)
      log('❌ Error type:', enableError.constructor.name)
      log('❌ This usually means:')
      log('   - NWC URL is invalid or expired')
      log('   - Relay is unreachable')
      log('   - Connection timed out')
      throw new Error('Failed to connect to wallet via NWC: ' + enableError.message)
    }
    
    log('✅ NWC connection enabled successfully')
    
    // Get wallet info (for debugging and permission check)
    log('📱 Getting wallet info...')
    
    try {
      const walletInfo = await nwc.getInfo()
      
      log('📱 Wallet info received:', {
        alias: walletInfo.alias || 'Unknown',
        pubkey: walletInfo.pubkey?.substring(0, 16) || 'Unknown',
        network: walletInfo.network || 'Unknown',
        methods: walletInfo.methods || []
      })
      
      // Check if sendPayment method is available
      if (walletInfo.methods && Array.isArray(walletInfo.methods)) {
        if (!walletInfo.methods.includes('sendPayment')) {
          log('❌ sendPayment method NOT available!')
          log('❌ Available methods:', walletInfo.methods)
          throw new Error('NWC connection does not have sendPayment permission. Please reconfigure in Alby Hub with sendPayment enabled.')
        }
        
        log('✅ sendPayment method is available')
      } else {
        log('⚠️ Could not verify available methods')
      }
      
    } catch (infoError) {
      log('⚠️ Could not get wallet info:', infoError.message)
      log('⚠️ Continuing anyway (some wallets don\'t support getInfo)')
    }
    
    log('========================================')
    log('💸 SENDING PAYMENT VIA NWC')
    log('========================================')
    
    // =============================================
    // STEP 4: SEND PAYMENT VIA NWC
    // =============================================
    
    log('💸 Payment details:')
    log('  📤 From: YOUR WALLET (via NWC)')
    log('  📥 To:', lightningAddress)
    log('  💰 Amount:', amount, 'sats')
    log('  📝 Type:', isRefund ? 'REFUND' : 'REWARD')
    
    const paymentComment = isRefund 
      ? 'Nostr Journal - Stake cancellation refund'
      : 'Nostr Journal - Daily writing goal reward'
    
    log('  💬 Comment:', paymentComment)
    
    log('🚀 Calling nwc.sendPayment()...')
    
    let paymentResult
    try {
      paymentResult = await nwc.sendPayment({
        destination: lightningAddress,  // Lightning address (user@domain.com)
        amount: amount,                 // Amount in satoshis
        comment: paymentComment         // Optional comment
      })
    } catch (paymentError) {
      log('❌ sendPayment() failed:', paymentError.message)
      log('❌ Error type:', paymentError.constructor.name)
      log('❌ Error details:', paymentError)
      
      // Provide helpful error messages based on common issues
      if (paymentError.message.includes('Insufficient') || paymentError.message.includes('balance')) {
        throw new Error('Insufficient balance in wallet to send payment')
      } else if (paymentError.message.includes('destination') || paymentError.message.includes('address')) {
        throw new Error('Invalid Lightning address or destination unreachable')
      } else if (paymentError.message.includes('timeout') || paymentError.message.includes('timed out')) {
        throw new Error('Payment timed out. Please try again')
      } else if (paymentError.message.includes('not found') || paymentError.message.includes('No route')) {
        throw new Error('Could not find route to destination. Lightning address may be invalid or offline')
      } else {
        throw new Error('Payment failed: ' + paymentError.message)
      }
    }
    
    log('✅ sendPayment() completed successfully!')
    log('💰 Payment result:', JSON.stringify(paymentResult, null, 2))
    
    // =============================================
    // STEP 5: EXTRACT PAYMENT PROOF
    // =============================================
    
    log('🔍 Extracting payment proof...')
    
    // NWC might return payment proof in different fields
    const paymentHash = paymentResult.preimage || 
                       paymentResult.payment_hash || 
                       paymentResult.paymentHash ||
                       paymentResult.hash ||
                       'unknown'
    
    log('🔑 Payment hash/preimage:', paymentHash)
    
    if (paymentHash === 'unknown') {
      log('⚠️ Could not extract payment hash from result')
      log('⚠️ This is okay - payment still succeeded')
    }
    
    // =============================================
    // STEP 6: RETURN SUCCESS RESPONSE
    // =============================================
    
    const elapsedTime = Date.now() - requestStartTime
    
    log('========================================')
    log('✅ PAYMENT SENT SUCCESSFULLY VIA NWC')
    log('⏱️ Total time:', elapsedTime, 'ms')
    log('========================================')
    
    const successResponse = {
      success: true,
      paymentHash: paymentHash,
      amountPaid: amount,
      destination: lightningAddress,
      method: 'NWC',
      timestamp: new Date().toISOString(),
      elapsedMs: elapsedTime
    }
    
    log('📤 Returning success response:', successResponse)
    
    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    })
    
  } catch (error) {
    // =============================================
    // ERROR HANDLING
    // =============================================
    
    const elapsedTime = Date.now() - requestStartTime
    
    log('========================================')
    log('❌ PAYMENT FAILED')
    log('⏱️ Failed after:', elapsedTime, 'ms')
    log('========================================')
    log('❌ Error type:', error.constructor.name)
    log('❌ Error message:', error.message)
    log('❌ Error stack:', error.stack)
    log('========================================')
    
    const errorResponse = {
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      timestamp: new Date().toISOString(),
      elapsedMs: elapsedTime
    }
    
    log('📤 Returning error response:', errorResponse)
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}