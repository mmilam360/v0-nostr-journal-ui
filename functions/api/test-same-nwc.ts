import { onRequestGet } from 'wrangler'

export const onRequestGet: onRequestGet = async (context) => {
  const test = {
    nwc_configured: !!context.env.NWC_CONNECTION_URL,
    connection_preview: context.env.NWC_CONNECTION_URL?.substring(0, 60) + '...',
    tests: {
      create_invoice: { status: 'pending', error: null },
      lookup_invoice: { status: 'pending', error: null }
    }
  }
  
  if (!test.nwc_configured) {
    return new Response(JSON.stringify({
      ...test,
      error: 'NWC_CONNECTION_URL not configured'
    }, null, 2), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
  
  try {
    const sdk = await import('@getalby/sdk')
    const nwc = new sdk.NostrWebLNProvider({
      nostrWalletConnectUrl: context.env.NWC_CONNECTION_URL
    })
    
    await nwc.enable()
    console.log('[Test] ✅ NWC connection established')
    
    // Get wallet info
    const info = await nwc.getInfo()
    test.wallet_info = {
      alias: info.alias,
      lightning_address: info.lightning_address,
      methods: info.methods
    }
    
    // Test 1: Create invoice
    try {
      console.log('[Test] 🧪 Testing invoice creation...')
      const invoice = await nwc.makeInvoice({
        amount: 1,
        memo: 'Test invoice - same NWC connection'
      })
      
      test.tests.create_invoice.status = 'success'
      test.tests.create_invoice.invoice_preview = invoice.paymentRequest?.substring(0, 50) + '...'
      
      // Test 2: Try to lookup the invoice we just created
      const { decode } = await import('light-bolt11-decoder')
      const decoded = decode(invoice.paymentRequest)
      const hash = decoded.sections?.find(s => s.name === 'payment_hash')?.value
      
      console.log('[Test] 🧪 Testing invoice lookup...')
      console.log('[Test] 🔍 Looking up payment hash:', hash)
      
      try {
        const lookup = await nwc.lookupInvoice({
          payment_hash: hash
        })
        
        test.tests.lookup_invoice.status = 'success'
        test.tests.lookup_invoice.found = true
        test.tests.lookup_invoice.paid = lookup.settled || false
        test.tests.lookup_invoice.state = lookup.state || lookup.status
        test.tests.lookup_invoice.lookup_method = 'payment_hash'
        
        console.log('[Test] ✅ Invoice lookup successful:', lookup.settled ? 'PAID' : 'PENDING')
        
      } catch (lookupError) {
        console.log('[Test] ⚠️ Payment hash lookup failed, trying invoice string...')
        
        try {
          const lookup2 = await nwc.lookupInvoice({
            invoice: invoice.paymentRequest
          })
          
          test.tests.lookup_invoice.status = 'success'
          test.tests.lookup_invoice.found = true
          test.tests.lookup_invoice.paid = lookup2.settled || false
          test.tests.lookup_invoice.state = lookup2.state || lookup2.status
          test.tests.lookup_invoice.lookup_method = 'invoice_string'
          
          console.log('[Test] ✅ Invoice lookup via string successful:', lookup2.settled ? 'PAID' : 'PENDING')
          
        } catch (lookup2Error) {
          test.tests.lookup_invoice.status = 'failed'
          test.tests.lookup_invoice.error = `Both methods failed: payment_hash(${lookupError.message}), invoice_string(${lookup2Error.message})`
        }
      }
      
    } catch (invoiceError) {
      test.tests.create_invoice.status = 'failed'
      test.tests.create_invoice.error = invoiceError.message
    }
    
  } catch (error) {
    test.error = error.message
    console.error('[Test] ❌ NWC connection failed:', error)
  }
  
  return new Response(JSON.stringify(test, null, 2), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}
