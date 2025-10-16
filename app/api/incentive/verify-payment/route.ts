import { NextRequest, NextResponse } from 'next/server'
import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[VerifyPayment] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 VERIFY PAYMENT REQUEST RECEIVED')
    log('========================================')
    
    const { paymentHash, invoiceString } = await request.json()
    
    log('🔍 Payment hash:', paymentHash)
    log('🔍 Has invoice string:', !!invoiceString)
    
    // Validate payment hash format
    if (!paymentHash || paymentHash.length !== 64 || !/^[a-f0-9]{64}$/i.test(paymentHash)) {
      throw new Error('Invalid payment hash format')
    }
    
    // AUDIT POINT 35: Connect to NWC
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL
    
    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      return NextResponse.json({ 
        success: false,
        error: 'NWC_CONNECTION_URL environment variable not set' 
      }, { status: 500 })
    }
    
    log('✅ NWC URL exists')
    log('🔌 NWC preview:', NWC_CONNECTION_URL.substring(0, 40) + '...')
    
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })
    
    log('🔌 Enabling NWC...')
    await nwc.enable()
    log('✅ NWC connected')
    
    // AUDIT POINT 36: Lookup invoice via NWC
    log('🔍 Looking up invoice via NWC...')
    
    let invoiceStatus
    let lookupMethod = ''
    
    // Method 1: Try by payment_hash
    try {
      log('🔍 Trying lookup by payment_hash...')
      
      invoiceStatus = await nwc.lookupInvoice({
        payment_hash: paymentHash
      })
      
      lookupMethod = 'payment_hash'
      log('✅ Found via payment_hash')
      
    } catch (hashError) {
      log('⚠️ payment_hash lookup failed:', hashError.message)
      
      // Method 2: Fallback to invoice string
      if (invoiceString) {
        log('🔍 Trying lookup by invoice string...')
        
        invoiceStatus = await nwc.lookupInvoice({
          invoice: invoiceString
        })
        
        lookupMethod = 'invoice_string'
        log('✅ Found via invoice string')
      } else {
        throw hashError
      }
    }
    
    log('📋 Invoice status:', invoiceStatus)
    
    // AUDIT POINT 37: Check if paid (multiple possible field names)
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
    
    // AUDIT POINT 38: Return correct response
    return NextResponse.json({
      success: true,
      paid: isPaid,
      amount: amount,
      settledAt: invoiceStatus.settled_at || invoiceStatus.settledAt,
      state: invoiceStatus.state || invoiceStatus.status,
      lookupMethod: lookupMethod
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    log('❌ ERROR:', error.message)
    return NextResponse.json({
      success: false,
      paid: false,
      error: error.message
    }, { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
