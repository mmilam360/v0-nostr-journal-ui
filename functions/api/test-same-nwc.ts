// Import at the top of the file (static import for Cloudflare Workers)
import { NostrWebLNProvider } from '@getalby/sdk'

export async function onRequestGet(context: any) {
  const test = {
    nwc_configured: !!context.env.NWC_CONNECTION_URL,
    connection_preview: context.env.NWC_CONNECTION_URL?.substring(0, 60) + '...',
    tests: {
      connection: { status: 'pending', error: null },
      wallet_info: { status: 'pending', error: null, methods: [] },
      create_invoice: { status: 'pending', error: null },
      lookup_invoice: { status: 'pending', error: null }
    }
  }
  
  if (!test.nwc_configured) {
    test.tests.connection.status = 'failed'
    test.tests.connection.error = 'NWC_CONNECTION_URL not set'
    return new Response(JSON.stringify(test, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  try {
    // Create NWC connection using static import
    console.log('[Test] Creating NWC connection...')
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: context.env.NWC_CONNECTION_URL
    })
    
    // Enable connection
    console.log('[Test] Enabling NWC...')
    await nwc.enable()
    console.log('[Test] ✅ NWC enabled')
    
    test.tests.connection.status = 'success'
    
    // Test: Get wallet info
    try {
      console.log('[Test] Getting wallet info...')
      const info = await nwc.getInfo()
      console.log('[Test] Wallet info:', info)
      
      test.tests.wallet_info.status = 'success'
      test.tests.wallet_info.methods = info.methods || []
      test.tests.wallet_info.alias = info.alias
      test.tests.wallet_info.pubkey = info.pubkey
      
    } catch (infoError) {
      console.log('[Test] ⚠️ Get info failed:', infoError.message)
      test.tests.wallet_info.status = 'failed'
      test.tests.wallet_info.error = infoError.message
    }
    
    // Test: Create invoice
    try {
      console.log('[Test] Creating test invoice...')
      
      // Try different amount formats to see what works
      const invoiceRequest = {
        amount: 10, // 10 sats as number
        memo: `NWC Test - ${Date.now()}`
      }
      
      console.log('[Test] Invoice request:', invoiceRequest)
      
      const invoice = await nwc.makeInvoice(invoiceRequest)
      
      console.log('[Test] ✅ Invoice created')
      console.log('[Test] Invoice keys:', Object.keys(invoice))
      console.log('[Test] Payment request length:', invoice.paymentRequest?.length)
      console.log('[Test] Payment request:', invoice.paymentRequest?.substring(0, 80) + '...')
      console.log('[Test] Full invoice string:', invoice.paymentRequest)
      
      test.tests.create_invoice.status = 'success'
      test.tests.create_invoice.invoice_preview = invoice.paymentRequest?.substring(0, 50) + '...'
      test.tests.create_invoice.full_length = invoice.paymentRequest?.length
      
      // Decode invoice to get payment hash
      try {
        // Use light-bolt11-decoder for Cloudflare compatibility
        const { decode } = await import('light-bolt11-decoder')
        const decoded = decode(invoice.paymentRequest)
        const paymentHash = decoded.sections?.find(s => s.name === 'payment_hash')?.value
        
        console.log('[Test] Decoded payment hash:', paymentHash)
        test.tests.create_invoice.payment_hash = paymentHash
        
        // Test: Lookup the invoice we just created
        console.log('[Test] ===========================================')
        console.log('[Test] 🧪 TESTING INVOICE LOOKUP')
        console.log('[Test] Payment hash to lookup:', paymentHash)
        console.log('[Test] Invoice string length:', invoice.paymentRequest?.length)
        console.log('[Test] ===========================================')
        
        let lookupSuccess = false
        
        // Try Method 1: Lookup by payment_hash
        try {
          console.log('[Test] Method 1: Looking up by payment_hash...')
          
          const lookupResult = await nwc.lookupInvoice({
            payment_hash: paymentHash
          })
          
          console.log('[Test] ✅ Method 1 successful!')
          console.log('[Test] Lookup result:', JSON.stringify(lookupResult, null, 2))
          
          test.tests.lookup_invoice.status = 'success (payment_hash)'
          test.tests.lookup_invoice.found = true
          test.tests.lookup_invoice.paid = lookupResult.settled || lookupResult.paid || false
          test.tests.lookup_invoice.amount = lookupResult.amount || lookupResult.value
          test.tests.lookup_invoice.state = lookupResult.state || lookupResult.status
          lookupSuccess = true
          
        } catch (hashError) {
          console.log('[Test] ❌ Method 1 failed:', hashError.message)
          console.log('[Test] Hash error type:', hashError.constructor.name)
          
          // Try Method 2: Lookup by invoice string
          try {
            console.log('[Test] Method 2: Trying lookup by invoice string...')
            console.log('[Test] Invoice string preview:', invoice.paymentRequest?.substring(0, 100))
            
            const lookupResult2 = await nwc.lookupInvoice({
              invoice: invoice.paymentRequest
            })
            
            console.log('[Test] ✅ Method 2 successful!')
            console.log('[Test] Lookup result 2:', JSON.stringify(lookupResult2, null, 2))
            
            test.tests.lookup_invoice.status = 'success (invoice string)'
            test.tests.lookup_invoice.found = true
            test.tests.lookup_invoice.paid = lookupResult2.settled || lookupResult2.paid || false
            test.tests.lookup_invoice.amount = lookupResult2.amount || lookupResult2.value
            test.tests.lookup_invoice.state = lookupResult2.state || lookupResult2.status
            lookupSuccess = true
            
          } catch (invoiceStringError) {
            console.log('[Test] ❌ Method 2 also failed:', invoiceStringError.message)
            console.log('[Test] Invoice string error type:', invoiceStringError.constructor.name)
            
            // Try Method 3: Different parameter names
            try {
              console.log('[Test] Method 3: Trying different parameter names...')
              
              const lookupResult3 = await nwc.lookupInvoice({
                paymentHash: paymentHash  // Try camelCase instead of snake_case
              })
              
              console.log('[Test] ✅ Method 3 successful!')
              test.tests.lookup_invoice.status = 'success (camelCase)'
              test.tests.lookup_invoice.found = true
              test.tests.lookup_invoice.paid = lookupResult3.settled || lookupResult3.paid || false
              lookupSuccess = true
              
            } catch (camelCaseError) {
              console.log('[Test] ❌ Method 3 also failed:', camelCaseError.message)
              
              // All methods failed
              test.tests.lookup_invoice.status = 'failed'
              test.tests.lookup_invoice.error = `All methods failed: payment_hash(${hashError.message}), invoice_string(${invoiceStringError.message}), camelCase(${camelCaseError.message})`
              test.tests.lookup_invoice.error_details = {
                payment_hash_error: hashError.message,
                invoice_string_error: invoiceStringError.message,
                camelCase_error: camelCaseError.message
              }
            }
          }
        }
        
        if (!lookupSuccess) {
          console.log('[Test] ❌ ALL LOOKUP METHODS FAILED')
          console.log('[Test] This suggests the invoice might not be immediately available for lookup')
          console.log('[Test] or there might be a timing issue with the wallet')
        }
        
      } catch (decodeError) {
        console.log('[Test] ⚠️ Could not decode invoice:', decodeError.message)
        test.tests.create_invoice.decode_error = decodeError.message
      }
      
    } catch (invoiceError) {
      console.log('[Test] ❌ Create invoice failed:', invoiceError.message)
      console.log('[Test] Error type:', invoiceError.constructor.name)
      console.log('[Test] Error details:', invoiceError)
      
      test.tests.create_invoice.status = 'failed'
      test.tests.create_invoice.error = invoiceError.message
      test.tests.create_invoice.error_type = invoiceError.constructor.name
      
      // Try with different amount format
      try {
        console.log('[Test] Retrying with string amount...')
        const retryInvoice = await nwc.makeInvoice({
          amount: "10",
          memo: `NWC Test Retry - ${Date.now()}`
        })
        
        console.log('[Test] ✅ Retry succeeded with string amount')
        test.tests.create_invoice.retry_success = true
        test.tests.create_invoice.status = 'success (string amount)'
        
      } catch (retryError) {
        console.log('[Test] ❌ Retry also failed:', retryError.message)
        test.tests.create_invoice.retry_error = retryError.message
      }
    }
    
  } catch (error) {
    console.error('[Test] ❌ Fatal error:', error)
    test.error = error.message
    test.error_type = error.constructor.name
    test.error_stack = error.stack
  }
  
  return new Response(JSON.stringify(test, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
}