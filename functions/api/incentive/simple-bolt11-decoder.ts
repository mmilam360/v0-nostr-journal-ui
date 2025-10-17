// Simple BOLT11 decoder for Cloudflare Workers
// This is a minimal implementation that extracts basic info without external dependencies

const log = (msg: string, data?: any) => console.log(`[Bolt11Decoder] ${msg}`, data || '')

export interface Bolt11Decoded {
  paymentHash: string
  amount: number
  timestamp: number
  description?: string
  valid: boolean
}

export function decodeBolt11(invoice: string): Bolt11Decoded {
  log('🔍 Decoding BOLT11 invoice...')
  log('📋 Invoice length:', invoice.length)
  log('📋 Invoice preview:', invoice.substring(0, 50) + '...')
  
  try {
    // Basic validation
    if (!invoice || invoice.length < 50) {
      throw new Error('Invoice too short')
    }
    
    if (!invoice.startsWith('lnbc')) {
      throw new Error('Invalid invoice prefix')
    }
    
    // Extract amount from the invoice
    // BOLT11 format: lnbc{amount}{multiplier}p{...}
    const amountMatch = invoice.match(/^lnbc(\d+)([munp])/)
    if (!amountMatch) {
      throw new Error('Could not extract amount from invoice')
    }
    
    const amountStr = amountMatch[1]
    const multiplier = amountMatch[2]
    
    // Convert multiplier to satoshi multiplier
    const multipliers: { [key: string]: number } = {
      'm': 0.001,  // millisatoshi
      'u': 0.000001,  // microsatoshi
      'n': 0.000000001,  // nanosatoshi
      'p': 0.000000000001  // picosatoshi
    }
    
    const multiplierValue = multipliers[multiplier] || 1
    const amount = Math.floor(parseInt(amountStr) * multiplierValue)
    
    log('💰 Extracted amount:', amount, 'sats (multiplier:', multiplier, ')')
    
    // For now, we'll generate a payment hash based on the invoice
    // In a real implementation, you'd decode the bech32 data
    const paymentHash = generatePaymentHashFromInvoice(invoice)
    
    log('🔑 Generated payment hash:', paymentHash)
    
    return {
      paymentHash,
      amount,
      timestamp: Math.floor(Date.now() / 1000),
      valid: true
    }
    
  } catch (error) {
    log('❌ BOLT11 decode error:', error.message)
    
    return {
      paymentHash: '',
      amount: 0,
      timestamp: 0,
      valid: false
    }
  }
}

function generatePaymentHashFromInvoice(invoice: string): string {
  // BOLT11 invoices are bech32-encoded, so we need to decode them properly
  // For now, let's use a different approach: ask the user to provide the real payment hash
  
  log('⚠️ BOLT11 decoding not fully implemented in Cloudflare Workers')
  log('⚠️ This is a complex operation that requires bech32 decoding')
  log('⚠️ For now, we need to get the payment hash from the Lightning node directly')
  
  // Return empty string to indicate we couldn't extract it
  // The system should fall back to using the invoice string for verification
  return ''
}

// Test function
export function testBolt11Decoder() {
  const testInvoice = 'lnbc200n1p50r022dqqnp4qgg6waddty7k3f3s9uqkh4eets5c5ezpj240k525d8vczf78acftkpp5krql2dfrxnu2k4zlqm9au2qdfhydr7n3djefw0gma4u5yfees6uqsp59h9x82p73qkd2n9emm26gl649u4k76287zygs89vq8k00vvjdj5s9qyysgqcqpcxqyz5vqrzjq26922n6s5n5undqrf78rjjhgpcczafws45tx8237y7pzx3fg8ww8apyqqqqqqqqcyqqqqlgqqqqr4gq2qrss7esv2r8lt3nc34qwc3stpuf8cnmdv4c83qvddyu6cl6jesmzh62ymd3q7ttp8qmm2z6msvncmpl6fjfghg54csys7th89sww2l0qqyne8r6'
  
  log('🧪 Testing BOLT11 decoder...')
  const result = decodeBolt11(testInvoice)
  log('📋 Test result:', result)
  
  return result
}
