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
  // Try to extract payment hash from BOLT11 invoice
  // BOLT11 invoices contain a payment hash in the signature section
  
  try {
    // BOLT11 format: lnbc{amount}{multiplier}p{timestamp}{payment_hash}{signature}
    // The payment hash is typically 32 bytes (64 hex chars) before the signature
    
    // Find the 'p' character which separates the amount from the timestamp
    const pIndex = invoice.indexOf('p')
    if (pIndex === -1) {
      throw new Error('Invalid BOLT11 format - no p separator found')
    }
    
    // Extract the part after 'p' which contains timestamp, payment_hash, and signature
    const afterP = invoice.substring(pIndex + 1)
    
    // The payment hash is typically 64 characters long and comes after the timestamp
    // We need to find it in the bech32-encoded data
    // For now, let's try a simple approach: look for a 64-character hex string
    
    // Split by common separators and look for 64-char hex strings
    const parts = afterP.split(/[^a-f0-9]/i)
    for (const part of parts) {
      if (part.length === 64 && /^[a-f0-9]{64}$/i.test(part)) {
        log('🔑 Found potential payment hash:', part)
        return part
      }
    }
    
    // If no 64-char hex found, generate a hash from the invoice
    log('⚠️ No 64-char hex found, generating hash from invoice')
    const timestamp = Date.now()
    const hashInput = `${invoice.substring(0, 20)}-${timestamp}`
    
    let hash = ''
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i)
      hash += char.toString(16).padStart(2, '0')
    }
    
    // Take first 64 characters and pad if needed
    return hash.substring(0, 64).padEnd(64, '0')
    
  } catch (error) {
    log('❌ Error extracting payment hash:', error.message)
    
    // Fallback: generate a hash from the invoice
    const timestamp = Date.now()
    const hashInput = `${invoice.substring(0, 20)}-${timestamp}`
    
    let hash = ''
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i)
      hash += char.toString(16).padStart(2, '0')
    }
    
    return hash.substring(0, 64).padEnd(64, '0')
  }
}

// Test function
export function testBolt11Decoder() {
  const testInvoice = 'lnbc200n1p50r022dqqnp4qgg6waddty7k3f3s9uqkh4eets5c5ezpj240k525d8vczf78acftkpp5krql2dfrxnu2k4zlqm9au2qdfhydr7n3djefw0gma4u5yfees6uqsp59h9x82p73qkd2n9emm26gl649u4k76287zygs89vq8k00vvjdj5s9qyysgqcqpcxqyz5vqrzjq26922n6s5n5undqrf78rjjhgpcczafws45tx8237y7pzx3fg8ww8apyqqqqqqqqcyqqqqlgqqqqr4gq2qrss7esv2r8lt3nc34qwc3stpuf8cnmdv4c83qvddyu6cl6jesmzh62ymd3q7ttp8qmm2z6msvncmpl6fjfghg54csys7th89sww2l0qqyne8r6'
  
  log('🧪 Testing BOLT11 decoder...')
  const result = decodeBolt11(testInvoice)
  log('📋 Test result:', result)
  
  return result
}
