import { onRequestPost } from 'wrangler'
import { NostrWebLNProvider } from '@getalby/sdk'
import { decode } from 'light-bolt11-decoder'

export const onRequestPost: onRequestPost = async (context) => {
  const startTime = Date.now()
  
  try {
    const { paymentHash, invoiceString } = await context.request.json()
    
    console.log('[Verify] ============================================')
    console.log('[Verify] 🔍 PAYMENT VERIFICATION REQUEST')
    console.log('[Verify] Timestamp:', new Date().toISOString())
    console.log('[Verify] Payment hash:', paymentHash)
    console.log('[Verify] Has invoice string:', !!invoiceString)
    console.log('[Verify] ============================================')
    
    // Validate inputs
    if (!paymentHash) {
      throw new Error('Payment hash is required')
    }
    
    if (paymentHash.length !== 64 || !/^[a-f0-9]{64}$/i.test(paymentHash)) {
      throw new Error(`Invalid payment hash format: ${paymentHash}`)
    }
    
    // Check environment variables
    const hasAlbyToken = !!context.env.ALBY_ACCESS_TOKEN
    const hasNWC = !!context.env.NWC_CONNECTION_URL
    
    console.log('[Verify] 🔑 Has Alby API token:', hasAlbyToken)
    console.log('[Verify] 🔌 Has NWC connection:', hasNWC)
    
    if (!hasAlbyToken && !hasNWC) {
      throw new Error('Neither ALBY_ACCESS_TOKEN nor NWC_CONNECTION_URL is configured')
    }
    
    let verificationResult = null
    let usedMethod = ''
    
    // =====================================================
    // METHOD 1: NWC lookupInvoice (RECOMMENDED BY ALBY)
    // =====================================================
    
    if (hasNWC) {
      try {
        console.log('[Verify] 🔌 Attempting Method 1: NWC lookupInvoice (Alby Recommended)...')
        
        // Use the imported NostrWebLNProvider for lookup operations
        const nwc = new NostrWebLNProvider({
          nostrWalletConnectUrl: context.env.NWC_CONNECTION_URL
        })
        
        await nwc.enable()
        console.log('[Verify] ✅ NWC connection established')
        
        // Try lookup by payment_hash first
        let invoiceStatus
        try {
          console.log('[Verify] Trying NWC lookup by payment_hash...')
          invoiceStatus = await nwc.lookupInvoice({
            payment_hash: paymentHash
          })
          console.log('[Verify] ✅ Found via payment_hash')
        } catch (hashError) {
          console.log('[Verify] ⚠️ payment_hash lookup failed:', hashError.message)
          
          // Try lookup by invoice string
          if (invoiceString) {
            console.log('[Verify] Trying NWC lookup by invoice string...')
            invoiceStatus = await nwc.lookupInvoice({
              invoice: invoiceString
            })
            console.log('[Verify] ✅ Found via invoice string')
          } else {
            throw hashError
          }
        }
        
        console.log('[Verify] NWC invoice status:', JSON.stringify(invoiceStatus, null, 2))
        
        verificationResult = {
          paid: invoiceStatus.settled === true || 
                invoiceStatus.state === 'settled' ||
                invoiceStatus.status === 'SETTLED' ||
                invoiceStatus.paid === true,
          amount: invoiceStatus.amount || invoiceStatus.value || (invoiceStatus.amt_msat ? invoiceStatus.amt_msat / 1000 : null),
          settledAt: invoiceStatus.settled_at || invoiceStatus.settledAt,
          state: invoiceStatus.state || invoiceStatus.status,
          paymentHash: paymentHash
        }
        
        usedMethod = 'NWC lookupInvoice (Alby Recommended)'
        
      } catch (nwcError) {
        console.log('[Verify] ⚠️ NWC method failed:', nwcError.message)
        console.log('[Verify] NWC error details:', nwcError)
        // Continue to next method
      }
    }
    
    // =====================================================
    // METHOD 2: Direct Alby API (FALLBACK)
    // =====================================================
    
    if (!verificationResult && hasAlbyToken) {
      try {
        console.log('[Verify] 📡 Attempting Method 2: Direct Alby API (Fallback)...')
        
        // Try the incoming invoices endpoint
        const albyResponse = await fetch(
          `https://api.getalby.com/invoices/incoming/${paymentHash}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${context.env.ALBY_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        )
        
        console.log('[Verify] Alby API response status:', albyResponse.status)
        
        if (albyResponse.ok) {
          const invoice = await albyResponse.json()
          console.log('[Verify] ✅ Found invoice via Alby API')
          console.log('[Verify] Invoice data:', JSON.stringify(invoice, null, 2))
          
          verificationResult = {
            paid: invoice.settled === true || invoice.state === 'SETTLED',
            amount: invoice.amount,
            settledAt: invoice.settled_at,
            state: invoice.state,
            paymentHash: invoice.payment_hash || paymentHash,
            expiresAt: invoice.expires_at,
            createdAt: invoice.created_at
          }
          
          usedMethod = 'Alby Direct API (Fallback)'
          
        } else if (albyResponse.status === 404) {
          console.log('[Verify] ⚠️ Invoice not found via Alby API (404)')
          // Continue to try other methods
        } else {
          const errorText = await albyResponse.text()
          console.log('[Verify] ⚠️ Alby API error:', albyResponse.status, errorText)
          // Continue to try other methods
        }
        
      } catch (apiError) {
        console.log('[Verify] ⚠️ Alby API method failed:', apiError.message)
        // Continue to try other methods
      }
    }
    
    // =====================================================
    // METHOD 3: Decode and Check Invoice String (LAST RESORT)
    // =====================================================
    
    if (!verificationResult && invoiceString) {
      try {
        console.log('[Verify] 📝 Attempting Method 3: Decode invoice string...')
        
        const decoded = decode(invoiceString)
        
        console.log('[Verify] ⚠️ Can only decode invoice, cannot verify payment status')
        console.log('[Verify] Invoice amount:', decoded.sections?.find(s => s.name === 'amount')?.value)
        console.log('[Verify] Invoice expiry:', decoded.sections?.find(s => s.name === 'expiry')?.value)
        
        // We can decode but can't verify payment status this way
        verificationResult = {
          paid: false, // Unknown - we can't verify without API/NWC
          amount: decoded.sections?.find(s => s.name === 'amount')?.value,
          state: 'unknown',
          paymentHash: decoded.sections?.find(s => s.name === 'payment_hash')?.value,
          warning: 'Payment status unknown - could not verify via API or NWC'
        }
        
        usedMethod = 'BOLT11 decode only (status unknown)'
        
      } catch (decodeError) {
        console.log('[Verify] ⚠️ Invoice decode failed:', decodeError.message)
      }
    }
    
    // =====================================================
    // RETURN RESULT OR ERROR
    // =====================================================
    
    const elapsedTime = Date.now() - startTime
    
    if (!verificationResult) {
      console.log('[Verify] ❌ ALL VERIFICATION METHODS FAILED')
      console.log('[Verify] Elapsed time:', elapsedTime, 'ms')
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not verify payment - all methods failed',
        details: {
          hasAlbyToken: hasAlbyToken,
          hasNWC: hasNWC,
          attemptedMethods: [
            hasNWC ? 'NWC (Alby Recommended)' : null,
            hasAlbyToken ? 'Alby API (Fallback)' : null,
            invoiceString ? 'BOLT11 decode (Last Resort)' : null
          ].filter(Boolean)
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    console.log('[Verify] ============================================')
    console.log('[Verify] ✅ VERIFICATION RESULT')
    console.log('[Verify] Method used:', usedMethod)
    console.log('[Verify] Payment status:', verificationResult.paid ? '💰 PAID' : '⏳ PENDING')
    console.log('[Verify] Amount:', verificationResult.amount, 'sats')
    console.log('[Verify] State:', verificationResult.state)
    console.log('[Verify] Elapsed time:', elapsedTime, 'ms')
    console.log('[Verify] ============================================')
    
    return new Response(JSON.stringify({
      success: true,
      paid: verificationResult.paid,
      amount: verificationResult.amount,
      settledAt: verificationResult.settledAt,
      state: verificationResult.state,
      paymentHash: verificationResult.paymentHash,
      verificationMethod: usedMethod,
      warning: verificationResult.warning
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    const elapsedTime = Date.now() - startTime
    
    console.error('[Verify] ============================================')
    console.error('[Verify] ❌ VERIFICATION ERROR')
    console.error('[Verify] Error type:', error.constructor.name)
    console.error('[Verify] Error message:', error.message)
    console.error('[Verify] Error stack:', error.stack)
    console.error('[Verify] Elapsed time:', elapsedTime, 'ms')
    console.error('[Verify] ============================================')
    
    return new Response(JSON.stringify({
      success: false,
      paid: false,
      error: error.message,
      errorType: error.constructor.name,
      errorStack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}