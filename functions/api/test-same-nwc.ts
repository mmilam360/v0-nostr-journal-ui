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
    // Use the new LN client from @getalby/sdk/lnclient as per official docs
    const { LN } = await import('@getalby/sdk/lnclient')
    
    console.log('[Test] 🔌 Creating LN client with NWC credentials...')
    const ln = new LN(context.env.NWC_CONNECTION_URL)
    
    console.log('[Test] ✅ LN client created successfully')
    
    // Get wallet info using the LN client
    const info = await ln.getInfo()
    test.wallet_info = {
      alias: info.alias,
      lightning_address: info.lightning_address,
      methods: info.methods
    }
    
    // Test 1: Create invoice using LN client
    try {
      console.log('[Test] 🧪 Testing invoice creation with LN client...')
      const invoice = await ln.requestPayment({
        amount: 10, // 10 sats
        description: 'Test invoice - same NWC connection'
      })
      
      test.tests.create_invoice.status = 'success'
      test.tests.create_invoice.invoice_preview = invoice.invoice?.substring(0, 50) + '...'
      test.tests.create_invoice.full_length = invoice.invoice?.length
      
      console.log('[Test] 📄 Full invoice length:', invoice.invoice?.length)
      console.log('[Test] 📄 Invoice starts with:', invoice.invoice?.substring(0, 20))
      
      // Test 2: Try to lookup the invoice we just created
      if (invoice.invoice && invoice.invoice.length > 50) {
        console.log('[Test] 🧪 Testing invoice lookup...')
        
        // Try payment hash method first
        try {
          const { decode } = await import('light-bolt11-decoder')
          const decoded = decode(invoice.invoice)
          const hash = decoded.sections?.find(s => s.name === 'payment_hash')?.value
          
          console.log('[Test] 🔍 Extracted payment hash:', hash)
          
          if (hash && hash.length === 64) {
            // Use the underlying NWC client for lookup
            const { NostrWebLNProvider } = await import('@getalby/sdk')
            const nwc = new NostrWebLNProvider({
              nostrWalletConnectUrl: context.env.NWC_CONNECTION_URL
            })
            await nwc.enable()
            
            const lookup = await nwc.lookupInvoice({
              payment_hash: hash
            })
            
            test.tests.lookup_invoice.status = 'success'
            test.tests.lookup_invoice.found = true
            test.tests.lookup_invoice.paid = lookup.settled || false
            test.tests.lookup_invoice.state = lookup.state || lookup.status
            test.tests.lookup_invoice.lookup_method = 'payment_hash'
            
            console.log('[Test] ✅ Invoice lookup successful:', lookup.settled ? 'PAID' : 'PENDING')
          } else {
            throw new Error('Invalid payment hash extracted')
          }
          
        } catch (hashError) {
          console.log('[Test] ⚠️ Payment hash lookup failed, trying invoice string...')
          console.log('[Test] Hash error:', hashError.message)
          
          try {
            // Use the underlying NWC client for lookup
            const { NostrWebLNProvider } = await import('@getalby/sdk')
            const nwc = new NostrWebLNProvider({
              nostrWalletConnectUrl: context.env.NWC_CONNECTION_URL
            })
            await nwc.enable()
            
            const lookup2 = await nwc.lookupInvoice({
              invoice: invoice.invoice
            })
            
            test.tests.lookup_invoice.status = 'success'
            test.tests.lookup_invoice.found = true
            test.tests.lookup_invoice.paid = lookup2.settled || false
            test.tests.lookup_invoice.state = lookup2.state || lookup2.status
            test.tests.lookup_invoice.lookup_method = 'invoice_string'
            
            console.log('[Test] ✅ Invoice lookup via string successful:', lookup2.settled ? 'PAID' : 'PENDING')
            
          } catch (lookup2Error) {
            console.log('[Test] Invoice string error:', lookup2Error.message)
            test.tests.lookup_invoice.status = 'failed'
            test.tests.lookup_invoice.error = `Both methods failed: payment_hash(${hashError.message}), invoice_string(${lookup2Error.message})`
          }
        }
      } else {
        test.tests.lookup_invoice.status = 'skipped'
        test.tests.lookup_invoice.error = 'Invoice too short for reliable lookup test'
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
