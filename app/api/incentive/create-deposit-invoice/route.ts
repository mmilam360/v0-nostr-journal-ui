import { NextRequest, NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'
import { decode } from 'light-bolt11-decoder'

const log = (msg: string, data?: any) => console.log(`[CreateInvoice] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 CREATE INVOICE REQUEST RECEIVED')
    log('========================================')
    
    const body = await request.json()
    log('📝 Request body:', body)
    
    const { userPubkey, amountSats, timestamp, requestId } = body
    
    log('📝 Amount:', amountSats, 'sats')
    log('📝 User:', userPubkey?.substring(0, 8))
    
    if (!userPubkey || !amountSats) {
      return NextResponse.json({ 
        success: false,
        error: 'Missing required fields: userPubkey and amountSats' 
      }, { status: 400 })
    }
    
    // AUDIT POINT 29: Connect to NWC
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL
    
    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      return NextResponse.json({ 
        success: false,
        error: 'Server configuration error: Missing NWC connection' 
      }, { status: 500 })
    }
    
    log('✅ NWC URL exists')
    log('🔌 NWC preview:', NWC_CONNECTION_URL.substring(0, 40) + '...')
    
    // Use NostrWebLNProvider
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })
    
    log('🔌 Enabling NWC...')
    await nwc.enable()
    log('✅ NWC connected')
    
    // Get wallet info for debugging
    try {
      const info = await nwc.getInfo()
      log('📱 Wallet info:', {
        alias: info.alias || 'Unknown',
        methods: info.methods || [],
        network: info.network || 'Unknown'
      })
    } catch (e) {
      log('⚠️ Could not get wallet info:', e.message)
    }
    
    // Create unique memo
    const uniqueMemo = `Journal stake - ${userPubkey.substring(0, 8)} - ${timestamp || Date.now()}`
    log('📝 Unique memo:', uniqueMemo)
    
    // AUDIT POINT 30: Create invoice via NWC
    log('📝 Creating invoice via NWC...')
    
    const invoice = await nwc.makeInvoice({
      amount: amountSats,
      memo: uniqueMemo
    })
    
    log('✅ Invoice created via NWC')
    log('📋 Invoice response:', invoice)
    
    const invoiceString = invoice.paymentRequest
    
    if (!invoiceString) {
      throw new Error('No invoice string received from webln')
    }
    
    log('📄 Invoice string:', invoiceString.substring(0, 80) + '...')
    
    // AUDIT POINT 31: Decode invoice to get payment hash
    log('🔍 Decoding BOLT11 invoice...')
    
    const decoded = decode(invoiceString)
    
    log('🔍 Decoded invoice info:', {
      amount: decoded.sections?.find(s => s.name === 'amount')?.value,
      timestamp: decoded.sections?.find(s => s.name === 'timestamp')?.value,
      expiry: decoded.sections?.find(s => s.name === 'expiry')?.value,
      memo: decoded.sections?.find(s => s.name === 'description')?.value
    })
    
    // Extract the payment hash from sections
    const hashSection = decoded.sections?.find(s => s.name === 'payment_hash')
    const paymentHash = hashSection?.value
    
    if (!paymentHash || paymentHash.length !== 64) {
      throw new Error(`Invalid payment hash extracted: ${paymentHash}`)
    }
    
    // Validate it's a proper hex string
    if (!/^[a-f0-9]{64}$/i.test(paymentHash)) {
      throw new Error(`Payment hash contains invalid characters: ${paymentHash}`)
    }
    
    log('✅ Payment hash extracted:', paymentHash)
    
    // AUDIT POINT 32: Return correct response
    const responseData = {
      success: true,
      invoice: invoiceString,
      paymentHash: paymentHash,
      invoiceString: invoiceString,
      amountSats: amountSats,
      timestamp: new Date().toISOString(),
      requestId: requestId,
      clientTimestamp: timestamp,
      source: 'NWC'
    }
    
    log('✅ INVOICE CREATION COMPLETE')
    log('💰 Amount:', amountSats, 'sats')
    log('🔑 Payment hash:', paymentHash)
    log('========================================')
    
    return NextResponse.json(responseData, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    log('❌ ERROR:', error.message)
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.stack
    }, { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
